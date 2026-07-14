import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import dotenv_values


ROOT_DIR = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT_DIR / "apps" / "server"
DATASET_PATH = Path(os.getenv("RAGAS_DATASET_PATH", Path(__file__).resolve().parent / "eval_dataset_full.json"))
REPORT_PATH = Path(os.getenv("RETRIEVAL_GATE_REPORT_PATH", Path(__file__).resolve().parent / "retrieval_gate_report.json"))
PROGRESS_PATH = Path(
  os.getenv("RETRIEVAL_GATE_PROGRESS_PATH", Path(__file__).resolve().parent / "retrieval_gate_progress.json")
)


def load_env() -> dict[str, str]:
  merged: dict[str, str] = {}
  for file_path in [SERVER_DIR / ".env.local", SERVER_DIR / ".env", ROOT_DIR / ".env.local", ROOT_DIR / ".env"]:
    if not file_path.exists():
      continue
    for key, value in dotenv_values(file_path).items():
      if key and value is not None:
        merged[key] = value
  return merged


def normalize_base_url(value: str) -> str:
  return value[:-1] if value.endswith("/") else value


def is_server_ready(base_url: str) -> bool:
  try:
    response = requests.get(f"{base_url}/knowledge/bases", timeout=5)
    return response.ok
  except requests.RequestException:
    return False


def wait_for_server(base_url: str, timeout_seconds: int = 120) -> None:
  deadline = time.time() + timeout_seconds
  while time.time() < deadline:
    if is_server_ready(base_url):
      return
    time.sleep(2)
  raise RuntimeError("Server did not become ready in time")


def start_server() -> subprocess.Popen[str]:
  return subprocess.Popen(
    ["cmd", "/c", "pnpm --filter server start"],
    cwd=ROOT_DIR,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    text=True,
  )


def find_knowledge_base(base_url: str, name: str) -> dict[str, Any]:
  response = requests.get(f"{base_url}/knowledge/bases", timeout=30)
  response.raise_for_status()
  for item in response.json()["data"]:
    if item["name"] == name:
      return item
  raise RuntimeError(f"Knowledge base not found: {name}")


def search_knowledge(base_url: str, knowledge_base_id: str, question: str) -> dict[str, Any]:
  response = requests.post(
    f"{base_url}/knowledge/search",
    json={
      "query": question,
      "knowledgeBaseId": knowledge_base_id,
      "rewrite": False,
    },
    timeout=120,
  )
  response.raise_for_status()
  return response.json()["data"]


def extract_required_terms(reference_answer: str) -> list[str]:
  terms: list[str] = []
  terms.extend(re.findall(r"\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,12}[-_]?\d{2,})\b", reference_answer, flags=re.I))
  terms.extend(re.findall(r"\b\d+(?:\.\d+)?\s*(?:%|天|次|条|万|小时|分钟|days?|times?|items?)?\b", reference_answer, flags=re.I))
  terms.extend(re.findall(r"\b[a-z][a-z0-9_]{2,}\b", reference_answer, flags=re.I))
  return unique_terms(terms)[:16]


def compute_required_terms_coverage(terms: list[str], hits: list[dict[str, Any]]) -> float:
  if not terms:
    return 1.0
  text = normalize_text("\n".join(item.get("content", "") for item in hits))
  matched = sum(1 for term in terms if normalize_text(term) in text)
  return round(matched / len(terms), 4)


def compute_candidate_gold_recall(
  candidate_names: list[str],
  gold_names: list[str],
  cutoff: int,
) -> float:
  selected_names = set(candidate_names[:cutoff])
  return round(sum(1 for name in gold_names if name in selected_names) / max(1, len(gold_names)), 4)


def normalize_text(value: str) -> str:
  return re.sub(r"\s+", " ", value.casefold()).strip()


def unique_terms(values: list[str]) -> list[str]:
  seen: set[str] = set()
  result: list[str] = []
  for value in values:
    normalized = normalize_text(value)
    if not normalized or normalized in seen:
      continue
    seen.add(normalized)
    result.append(value.strip())
  return result


def write_progress(rows: list[dict[str, Any]]) -> None:
  PROGRESS_PATH.write_text(
    json.dumps(
      {
        "dataset_path": str(DATASET_PATH),
        "completed_count": len(rows),
        "rows": rows,
      },
      ensure_ascii=False,
      indent=2,
    ),
    encoding="utf-8",
  )


def main() -> None:
  load_env()
  dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
  api_base_url = normalize_base_url("http://localhost:3001/api")
  server_process: subprocess.Popen[str] | None = None

  try:
    if not is_server_ready(api_base_url):
      server_process = start_server()
      wait_for_server(api_base_url)

    knowledge_base = find_knowledge_base(api_base_url, dataset["knowledge_base_name"])
    rows: list[dict[str, Any]] = []

    for question in dataset["questions"]:
      result = search_knowledge(api_base_url, knowledge_base["id"], question["question"])
      hits = result["hits"]
      retrieved_names = list(dict.fromkeys(item["documentName"] for item in hits))
      gold_names = question["gold_document_names"]
      hit_gold_names = [name for name in gold_names if name in retrieved_names]
      required_terms = extract_required_terms(question["reference_answer"])
      required_terms_coverage = compute_required_terms_coverage(required_terms, hits)
      top1_name = hits[0]["documentName"] if hits else None
      irrelevant_chunk_count = sum(1 for item in hits if item["documentName"] not in gold_names)
      debug = result.get("debug") or {}
      candidate_names = debug.get("candidateDocumentNames") or []
      rows.append(
        {
          "question_id": question["question_id"],
          "difficulty": question["difficulty"],
          "question": question["question"],
          "gold_document_names": gold_names,
          "retrieved_document_names": retrieved_names,
          "top1_document_name": top1_name,
          "gold_document_recall": round(len(hit_gold_names) / max(1, len(gold_names)), 4),
          "top1_gold": top1_name in gold_names,
          "required_terms": required_terms,
          "required_terms_coverage": required_terms_coverage,
          "irrelevant_chunk_rate": round(irrelevant_chunk_count / max(1, len(hits)), 4),
          "candidate_gold_recall_at_20": compute_candidate_gold_recall(candidate_names, gold_names, 20),
          "candidate_gold_recall_at_40": compute_candidate_gold_recall(candidate_names, gold_names, 40),
          "candidate_gold_recall_at_80": compute_candidate_gold_recall(candidate_names, gold_names, 80),
          "debug": debug,
        }
      )
      write_progress(rows)

    question_count = len(rows)
    cross_rows = [row for row in rows if "cross_ref" in row["difficulty"] or "reference" in row["difficulty"]]
    multi_fact_rows = [row for row in rows if len(row["required_terms"]) >= 3]
    report = {
      "knowledge_base": {
        "id": knowledge_base["id"],
        "name": knowledge_base["name"],
      },
      "dataset_path": str(DATASET_PATH),
      "question_count": question_count,
      "summary": {
        "gold_document_recall": round(sum(row["gold_document_recall"] for row in rows) / max(1, question_count), 4),
        "top1_gold_rate": round(sum(1 for row in rows if row["top1_gold"]) / max(1, question_count), 4),
        "required_terms_coverage": round(sum(row["required_terms_coverage"] for row in rows) / max(1, question_count), 4),
        "cross_reference_recall": round(sum(row["gold_document_recall"] for row in cross_rows) / max(1, len(cross_rows)), 4),
        "multi_fact_full_coverage": round(sum(1 for row in multi_fact_rows if row["required_terms_coverage"] >= 0.94) / max(1, len(multi_fact_rows)), 4),
        "avg_irrelevant_chunk_rate": round(sum(row["irrelevant_chunk_rate"] for row in rows) / max(1, question_count), 4),
        "candidate_gold_recall_at_20": round(sum(row["candidate_gold_recall_at_20"] for row in rows) / max(1, question_count), 4),
        "candidate_gold_recall_at_40": round(sum(row["candidate_gold_recall_at_40"] for row in rows) / max(1, question_count), 4),
        "candidate_gold_recall_at_80": round(sum(row["candidate_gold_recall_at_80"] for row in rows) / max(1, question_count), 4),
      },
      "thresholds": {
        "gold_document_recall": 0.99,
        "top1_gold_rate": 0.99,
        "required_terms_coverage": 0.94,
        "cross_reference_recall": 0.99,
        "multi_fact_full_coverage": 0.90,
        "avg_irrelevant_chunk_rate": 0.25,
      },
      "rows": rows,
      "worst_required_terms_cases": sorted(rows, key=lambda item: item["required_terms_coverage"])[:12],
      "missed_gold_cases": [row for row in rows if row["gold_document_recall"] < 1],
    }
    summary = report["summary"]
    thresholds = report["thresholds"]
    report["passed"] = all(summary[key] >= value for key, value in thresholds.items() if key != "avg_irrelevant_chunk_rate") and summary["avg_irrelevant_chunk_rate"] <= thresholds["avg_irrelevant_chunk_rate"]
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report_path": str(REPORT_PATH), "summary": report["summary"], "passed": report["passed"]}, ensure_ascii=False))
  finally:
    if server_process is not None:
      server_process.terminate()
      try:
        server_process.wait(timeout=10)
      except subprocess.TimeoutExpired:
        server_process.kill()


if __name__ == "__main__":
  main()
