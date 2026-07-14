import json
import os
import re
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DATASET_PATH = Path(os.getenv("RAGAS_DATASET_PATH", SCRIPT_DIR / "eval_dataset_full.json"))
QA_REPORT_PATH = Path(
  os.getenv("RAGAS_QA_REPORT_PATH", SCRIPT_DIR / "ragas_report_full_round4_qwen_embedding.json")
)
REPORT_PATH = Path(
  os.getenv("ANSWER_GATE_REPORT_PATH", SCRIPT_DIR / "answer_gate_report_test4_final.json")
)

REQUIRED_FACT_FIELDS = {
  "product": ["finance_min_citations", "quarterly_ticket_limit", "approval_role"],
  "ops": ["maintenance_window", "night_p2_limit", "notify_role"],
  "procurement": ["coverage_threshold", "approval_low", "approval_high"],
  "policy": [
    "audit_retention_days",
    "second_violation_freeze_days",
    "demo_cleanup_deadline_days",
  ],
  "postmortem": [
    "old_chunk_size",
    "overlap_size",
    "new_chunk_size",
    "acceptance_recall_target",
  ],
}

CROSS_REFERENCE_REQUIRED_VALUES = {
  "strategy_aurora": ["5", "4", "second_layer_clause"],
  "finance_strict_pack": ["normal_confidence", "recall_gap", "fully_grounded"],
  "thinking_mode_guideline": [
    "visibleContent",
    "content",
    "final_answer_presentation_risk",
  ],
  "retrieval_tuning_playbook": [
    "chunkSize",
    "overlap",
    "exact_code",
    "rerank",
    "structured_fact_extractor",
  ],
  "confidence_labelling_standard": [
    "high_confidence",
    "reviewed_but_not_grounded",
    "normal_confidence",
  ],
  "workspace_chain_overview": ["创建会话", "workspace/chat/stream", "4"],
}


def normalize(value: Any) -> str:
  return re.sub(r"\s+", " ", str(value).casefold()).strip()


def unique(values: list[str]) -> list[str]:
  return list(dict.fromkeys(value for value in values if value))


def extract_reference_signals(reference: str) -> list[str]:
  identifiers = re.findall(
    r"\b(?:[a-z][a-z0-9]*(?:[_/.-][a-z0-9]+)+|[a-z][a-z0-9]{2,})\b",
    reference,
    flags=re.I,
  )
  numbers = re.findall(r"\b\d+(?:\.\d+)?\b", reference)
  return unique([normalize(value) for value in [*identifiers, *numbers]])


def required_values(document: dict[str, Any], reference: str) -> list[str]:
  facts = document["facts"]
  fields = REQUIRED_FACT_FIELDS.get(facts["doc_type"])
  if fields:
    return unique([normalize(facts[field]) for field in fields])
  if facts["code"] in CROSS_REFERENCE_REQUIRED_VALUES:
    return unique([normalize(value) for value in CROSS_REFERENCE_REQUIRED_VALUES[facts["code"]]])
  return extract_reference_signals(reference)


def main() -> None:
  dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
  qa_report = json.loads(QA_REPORT_PATH.read_text(encoding="utf-8"))
  documents = {document["name"]: document for document in dataset["documents"]}

  if len(dataset["questions"]) != len(qa_report["qa_results"]):
    raise RuntimeError("Question and QA result counts do not match")

  rows = []
  for question, qa_result in zip(dataset["questions"], qa_report["qa_results"]):
    gold_document_names = question.get("gold_document_names") or []
    if len(gold_document_names) != 1 or gold_document_names[0] not in documents:
      raise RuntimeError(f"Invalid gold document for {question['question_id']}")

    document = documents[gold_document_names[0]]
    values = required_values(document, question["reference_answer"])
    answer = normalize(qa_result["final_answer"])
    matched_values = [value for value in values if value in answer]
    missing_values = [value for value in values if value not in answer]
    coverage = len(matched_values) / len(values) if values else 1.0
    rows.append(
      {
        "question_id": question["question_id"],
        "difficulty": question["difficulty"],
        "document_type": document["facts"]["doc_type"],
        "gold_document_name": gold_document_names[0],
        "required_values": values,
        "matched_values": matched_values,
        "missing_values": missing_values,
        "required_value_coverage": round(coverage, 4),
        "passed": coverage == 1,
      }
    )

  summary = {
    "question_count": len(rows),
    "full_coverage_count": sum(1 for row in rows if row["passed"]),
    "full_coverage_rate": round(sum(1 for row in rows if row["passed"]) / len(rows), 4),
    "average_required_value_coverage": round(
      sum(row["required_value_coverage"] for row in rows) / len(rows),
      4,
    ),
    "failed_question_ids": [row["question_id"] for row in rows if not row["passed"]],
  }
  report = {"summary": summary, "rows": rows}
  REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
  print(json.dumps({"report_path": str(REPORT_PATH), "summary": summary}, ensure_ascii=False))


if __name__ == "__main__":
  main()
