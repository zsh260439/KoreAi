import asyncio
import hashlib
import json
import math
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import dotenv_values
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas.dataset_schema import SingleTurnSample
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import (
  AnswerCorrectness,
  ContextPrecision,
  Faithfulness,
  LLMContextRecall,
)
from ragas.run_config import RunConfig


#声明项目根目录
ROOT_DIR = Path(__file__).resolve().parents[2]

#声明服务端目录
SERVER_DIR = ROOT_DIR / "apps" / "server"

#声明语料目录
CORPUS_DIR = Path(__file__).resolve().parent / "generated_corpus"

#声明数据集文件
DATASET_PATH = Path(os.getenv("RAGAS_DATASET_PATH", Path(__file__).resolve().parent / "eval_dataset.json"))

#声明清单文件
MANIFEST_PATH = Path(__file__).resolve().parent / "corpus_manifest.json"

#声明报告文件
REPORT_PATH = Path(os.getenv("RAGAS_REPORT_PATH", Path(__file__).resolve().parent / "ragas_report.json"))

#声明进度文件
PROGRESS_PATH = Path(os.getenv("RAGAS_PROGRESS_PATH", Path(__file__).resolve().parent / "ragas_progress.json"))

#声明问答缓存文件
QA_CACHE_PATH = Path(os.getenv("RAGAS_QA_CACHE_PATH", Path(__file__).resolve().parent / "ragas_qa_cache.json"))

#声明单指标硬超时秒数
METRIC_HARD_TIMEOUT_SECONDS = 480


#声明评分并发数，只用于 RAGAS 离线评测脚本
def get_score_concurrency() -> int:
  raw_value = os.getenv("RAGAS_SCORE_CONCURRENCY", "3")
  try:
    value = int(raw_value)
  except ValueError:
    return 3
  return max(1, min(value, 8))


#声明读取环境变量
def load_env() -> dict[str, str]:
  merged: dict[str, str] = {}
  for file_path in [SERVER_DIR / ".env.local", SERVER_DIR / ".env", ROOT_DIR / ".env.local", ROOT_DIR / ".env"]:
    if not file_path.exists():
      continue
    for key, value in dotenv_values(file_path).items():
      if key and value is not None:
        merged[key] = value
  return merged


#声明标准化地址
def normalize_base_url(value: str) -> str:
  return value[:-1] if value.endswith("/") else value


#声明获取数据集签名
def build_dataset_signature(dataset: dict[str, Any]) -> str:
  #声明使用完整评测数据构造稳定签名
  payload = json.dumps(dataset, ensure_ascii=False, sort_keys=True)
  digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
  return f"{dataset['knowledge_base_name']}::{digest}"


#声明等待服务启动
def wait_for_server(base_url: str, timeout_seconds: int = 120) -> None:
  deadline = time.time() + timeout_seconds
  while time.time() < deadline:
    try:
      response = requests.get(f"{base_url}/knowledge/bases", timeout=5)
      if response.ok:
        return
    except requests.RequestException:
      pass
    time.sleep(2)
  raise RuntimeError("服务端未在限定时间内启动完成")


#声明检查服务状态
def is_server_ready(base_url: str) -> bool:
  try:
    response = requests.get(f"{base_url}/knowledge/bases", timeout=5)
    return response.ok
  except requests.RequestException:
    return False


#声明启动服务端
def start_server() -> subprocess.Popen[str]:
  return subprocess.Popen(
    ["cmd", "/c", "pnpm --filter server start"],
    cwd=ROOT_DIR,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    text=True,
  )


#声明清空知识数据
def clear_knowledge_data() -> None:
  connection_string = load_env()["DATABASE_URL"]
  script = f"""
const {{ Client }} = require('pg')
const client = new Client({{ connectionString: {json.dumps(connection_string)} }})
async function main() {{
  await client.connect()
  await client.query('begin')
  try {{
    await client.query('delete from knowledge_bases')
    await client.query('commit')
  }} catch (error) {{
    await client.query('rollback')
    throw error
  }} finally {{
    await client.end()
  }}
}}
main().catch((error) => {{
  console.error(error)
  process.exit(1)
}})
"""
  subprocess.run(["node", "-e", script], cwd=SERVER_DIR, check=True)


#声明创建知识库
def create_knowledge_base(base_url: str, dataset: dict[str, Any]) -> dict[str, Any]:
  response = requests.post(
    f"{base_url}/knowledge/bases",
    json={
      "name": dataset["knowledge_base_name"],
      "description": dataset["knowledge_base_description"],
    },
    timeout=30,
  )
  response.raise_for_status()
  return response.json()["data"]


#声明查询知识库
def find_knowledge_base(base_url: str, name: str) -> dict[str, Any] | None:
  response = requests.get(f"{base_url}/knowledge/bases", timeout=30)
  response.raise_for_status()
  for item in response.json()["data"]:
    if item["name"] == name:
      return item
  return None


#声明创建文档
def create_document(base_url: str, kb_id: str, file_path: Path) -> dict[str, Any]:
  response = requests.post(
    f"{base_url}/knowledge/bases/{kb_id}/documents",
    json={
      "name": file_path.name,
      "storagePath": str(file_path),
      "chunkConfig": {
        "targetChars": 700,
        "maxChars": 900,
        "minChars": 300,
        "overlapChars": 80,
      },
    },
    timeout=120,
  )
  response.raise_for_status()
  return response.json()["data"]


#声明重建切片
def rebuild_document(base_url: str, document_id: str) -> list[dict[str, Any]]:
  response = requests.post(
    f"{base_url}/knowledge/documents/{document_id}/chunks/rebuild",
    timeout=600,
  )
  response.raise_for_status()
  return response.json()["data"]


#声明查询文档列表
def find_documents(base_url: str, kb_id: str) -> list[dict[str, Any]]:
  response = requests.get(
    f"{base_url}/knowledge/bases/{kb_id}/documents",
    timeout=120,
  )
  response.raise_for_status()
  return response.json()["data"]


#声明调用知识问答
def ask_knowledge(base_url: str, kb_id: str, question: str) -> dict[str, Any]:
  response = requests.post(
    f"{base_url}/workspace/chat/stream",
    json={
      "query": question,
      "knowledgeBaseId": kb_id,
      "think": True,
    },
    stream=True,
    timeout=300,
  )
  response.raise_for_status()

  for raw_line in response.iter_lines(decode_unicode=True):
    if not raw_line:
      continue

    event = json.loads(raw_line)
    if event.get("type") == "error":
      raise RuntimeError(event.get("message") or "流式问答失败")

    if event.get("type") == "completed":
      return event["data"]

  raise RuntimeError("流式问答未返回 completed 事件")


#声明构造样本
def ask_knowledge_with_retry(base_url: str, kb_id: str, question: str) -> dict[str, Any]:
  last_error: Exception | None = None

  for attempt in range(3):
    try:
      return ask_knowledge(base_url, kb_id, question)
    except Exception as error:
      last_error = error
      if attempt >= 2:
        break
      time.sleep(2)

  raise RuntimeError(f"Question failed after retries: {question}; reason: {last_error}")


#声明读取问答缓存
def load_qa_cache(signature: str) -> dict[str, dict[str, Any]]:
  if not QA_CACHE_PATH.exists():
    return {}
  payload = json.loads(QA_CACHE_PATH.read_text(encoding="utf-8"))
  if payload.get("dataset_signature") != signature:
    return {}
  return {row["question_id"]: row["result"] for row in payload.get("rows", [])}


#声明写入问答缓存
def write_qa_cache(signature: str, rows: list[dict[str, Any]]) -> None:
  payload = json.dumps(
    {
      "dataset_signature": signature,
      "completed_questions": len(rows),
      "rows": rows,
    },
    ensure_ascii=False,
    indent=2,
  )
  temp_path = QA_CACHE_PATH.with_suffix(f"{QA_CACHE_PATH.suffix}.tmp")
  temp_path.write_text(payload, encoding="utf-8")
  temp_path.replace(QA_CACHE_PATH)


#声明执行问答并保存断点，防止长评测重跑时重复调用 LLM
def collect_ask_results(
  base_url: str,
  kb_id: str,
  eval_questions: list[dict[str, Any]],
  signature: str,
) -> list[dict[str, Any]]:
  rows_by_id: dict[str, dict[str, Any]] = {
    question_id: {
      "question_id": question_id,
      "result": result,
    }
    for question_id, result in load_qa_cache(signature).items()
  }

  for question in eval_questions:
    question_id = question["question_id"]
    if question_id not in rows_by_id:
      rows_by_id[question_id] = {
        "question_id": question_id,
        "result": ask_knowledge_with_retry(base_url, kb_id, question["question"]),
      }
      ordered_rows = [rows_by_id[item["question_id"]] for item in eval_questions if item["question_id"] in rows_by_id]
      write_qa_cache(signature, ordered_rows)

  return [rows_by_id[item["question_id"]]["result"] for item in eval_questions]


def build_samples(eval_questions: list[dict[str, Any]], ask_results: list[dict[str, Any]]) -> list[SingleTurnSample]:
  return [
    SingleTurnSample(
      user_input=question["question"],
      retrieved_contexts=[item["content"] for item in ask_result["sources"]],
      response=ask_result["answer"],
      reference=question["reference_answer"],
    )
    for question, ask_result in zip(eval_questions, ask_results)
  ]


#声明读取进度
def load_progress(signature: str) -> dict[int, dict[str, Any]]:
  if not PROGRESS_PATH.exists():
    return {}
  payload = json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
  if payload.get("dataset_signature") != signature:
    return {}
  return {int(row["sample_index"]): row for row in payload.get("rows", [])}


#声明写入进度
def write_progress(signature: str, rows: list[dict[str, Any]]) -> None:
  PROGRESS_PATH.write_text(
    json.dumps(
      {
        "dataset_signature": signature,
        "completed_samples": len(rows),
        "rows": rows,
      },
      ensure_ascii=False,
      indent=2,
    ),
    encoding="utf-8",
  )


#声明构造召回差异
def build_recall_gap(eval_questions: list[dict[str, Any]], ask_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  for question, ask_result in zip(eval_questions, ask_results):
    gold_names = question["gold_document_names"]
    #声明同一文档可能命中多个 chunk，召回统计必须按文档去重
    retrieved_names = list(dict.fromkeys(item["documentName"] for item in ask_result["sources"]))
    retrieved_name_set = set(retrieved_names)
    hit_gold_names = [name for name in gold_names if name in retrieved_name_set]
    missed_gold_names = [name for name in gold_names if name not in retrieved_names]
    rows.append(
      {
        "question_id": question["question_id"],
        "question": question["question"],
        "difficulty": question["difficulty"],
        "gold_document_names": gold_names,
        "retrieved_document_names": retrieved_names,
        "hit_gold_document_names": hit_gold_names,
        "missed_gold_document_names": missed_gold_names,
        "gold_recall_rate": round(len(hit_gold_names) / max(1, len(gold_names)), 4),
      }
    )
  return rows


#声明汇总召回差异
def summarize_recall_gap(rows: list[dict[str, Any]]) -> dict[str, Any]:
  full_recall_count = sum(1 for row in rows if row["gold_recall_rate"] >= 1)
  average_recall = round(sum(row["gold_recall_rate"] for row in rows) / max(1, len(rows)), 4)
  worst_cases = sorted(rows, key=lambda item: item["gold_recall_rate"])[:8]
  return {
    "question_count": len(rows),
    "full_recall_question_count": full_recall_count,
    "full_recall_rate": round(full_recall_count / max(1, len(rows)), 4),
    "average_gold_recall_rate": average_recall,
    "worst_cases": worst_cases,
  }


#声明构造文档统计
def summarize_document_chunks(documents: list[dict[str, Any]]) -> dict[str, Any]:
  chunk_counts = [int(item["chunkCount"]) for item in documents]
  return {
    "document_count": len(documents),
    "total_chunks": sum(chunk_counts),
    "avg_chunks_per_document": round(sum(chunk_counts) / max(1, len(chunk_counts)), 2),
    "min_chunks_per_document": min(chunk_counts) if chunk_counts else 0,
    "max_chunks_per_document": max(chunk_counts) if chunk_counts else 0,
    "chunk_distribution": {
      str(count): sum(1 for value in chunk_counts if value == count)
      for count in sorted(set(chunk_counts))
    },
  }


#声明构造指标
def build_metrics(env: dict[str, str]) -> list[Any]:
  llm = LangchainLLMWrapper(
    ChatOpenAI(
      model=env.get("RAGAS_LLM_MODEL", env["LLM_MODEL"]),
      api_key=env["LLM_API_KEY"],
      base_url=normalize_base_url(env["LLM_BASE_URL"]),
      temperature=0,
    ),
  )
  embeddings = LangchainEmbeddingsWrapper(
    OpenAIEmbeddings(
      model=env["EMBEDDING_MODEL"],
      api_key=env["EMBEDDING_API_KEY"],
      base_url=normalize_base_url(env["EMBEDDING_BASE_URL"]),
      dimensions=1024,
      encoding_format="float",
    )
  )
  run_config = RunConfig(timeout=420, max_retries=3, max_workers=1)
  metrics = [
    Faithfulness(llm=llm),
    LLMContextRecall(llm=llm),
    ContextPrecision(llm=llm),
    AnswerCorrectness(llm=llm, embeddings=embeddings),
  ]
  for metric in metrics:
    metric.init(run_config)
  return metrics


#声明异步评分
async def score_samples_async(
  samples: list[SingleTurnSample],
  metrics: list[Any],
  signature: str,
  existing_rows: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
  #澹版槑杩斿洖鍗曟潯璇勫垎缁撴灉锛屽苟鍙戠敱涓婂眰缁熶竴鎺у埗
  async def score_one_sample(
    index: int,
    sample: SingleTurnSample,
    existing_row: dict[str, Any] | None,
  ) -> dict[str, Any]:
    row: dict[str, Any] = {
      **(existing_row or {}),
      "sample_index": index,
      "user_input": sample.user_input,
      "response": sample.response,
      "reference": sample.reference,
    }
    for metric in metrics:
      error_key = f"{metric.name}_error"
      if metric.name in row and not row.get(error_key):
        continue
      try:
        #声明为单指标增加协程级硬超时，避免单题永远卡住
        score = await asyncio.wait_for(
          metric.single_turn_ascore(sample, timeout=420),
          timeout=METRIC_HARD_TIMEOUT_SECONDS,
        )
        row[metric.name] = score
        row.pop(error_key, None)
      except Exception as error:
        row[metric.name] = None
        row[error_key] = str(error)
    return row

  rows_by_index: dict[int, dict[str, Any]] = dict(existing_rows)
  pending_samples = [
    (index, sample, rows_by_index.get(index))
    for index, sample in enumerate(samples)
    if index not in rows_by_index
    or any(
      metric.name not in rows_by_index[index]
      or rows_by_index[index].get(f"{metric.name}_error")
      for metric in metrics
    )
  ]
  semaphore = asyncio.Semaphore(get_score_concurrency())

  #澹版槑闄愬埗骞跺彂锛岄伩鍏嶈瘎娴婰LM/API 鎵撴弧
  async def run_with_limit(
    index: int,
    sample: SingleTurnSample,
    existing_row: dict[str, Any] | None,
  ) -> dict[str, Any]:
    async with semaphore:
      return await score_one_sample(index, sample, existing_row)

  tasks = [
    asyncio.create_task(run_with_limit(index, sample, existing_row))
    for index, sample, existing_row in pending_samples
  ]
  for task in asyncio.as_completed(tasks):
    row = await task
    rows_by_index[int(row["sample_index"])] = row
    rows = sorted(rows_by_index.values(), key=lambda item: int(item["sample_index"]))
    write_progress(signature, rows)

  rows = sorted(rows_by_index.values(), key=lambda item: int(item["sample_index"]))
  write_progress(signature, rows)
  return rows


#声明汇总平均分
def average_metric_rows(rows: list[dict[str, Any]], metrics: list[Any]) -> dict[str, float]:
  averages: dict[str, float] = {}
  for metric in metrics:
    values = [
      float(row[metric.name])
      for row in rows
      if row.get(metric.name) is not None and math.isfinite(float(row[metric.name]))
    ]
    averages[metric.name] = round(sum(values) / max(1, len(values)), 4) if values else 0.0
  return averages


#声明执行主流程
def main() -> None:
  env = load_env()
  dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
  manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
  signature = build_dataset_signature(dataset)
  api_base_url = normalize_base_url("http://localhost:3001/api")

  server_process: subprocess.Popen[str] | None = None
  try:
    if not is_server_ready(api_base_url):
      server_process = start_server()
      wait_for_server(api_base_url)

    skip_ingest = os.getenv("RAGAS_SKIP_INGEST") == "1"
    if skip_ingest:
      knowledge_base = find_knowledge_base(api_base_url, dataset["knowledge_base_name"])
      if not knowledge_base:
        raise RuntimeError("请求复用现有语料，但未找到对应知识库")
    else:
      clear_knowledge_data()
      knowledge_base = create_knowledge_base(api_base_url, dataset)
      for document in dataset["documents"]:
        file_path = CORPUS_DIR / document["relative_path"]
        created_document = create_document(api_base_url, knowledge_base["id"], file_path)
        rebuild_document(api_base_url, created_document["id"])

    documents = find_documents(api_base_url, knowledge_base["id"])
    ask_results = collect_ask_results(api_base_url, knowledge_base["id"], dataset["questions"], signature)
    samples = build_samples(dataset["questions"], ask_results)
    metrics = build_metrics(env)
    existing_rows = load_progress(signature)
    ragas_rows = asyncio.run(score_samples_async(samples, metrics, signature, existing_rows))
    recall_rows = build_recall_gap(dataset["questions"], ask_results)
    report = {
      "knowledge_base": {
        "id": knowledge_base["id"],
        "name": knowledge_base["name"],
      },
      "corpus_manifest": {
        "document_count": manifest["document_count"],
        "char_min": manifest["char_min"],
        "char_max": manifest["char_max"],
        "char_avg": manifest["char_avg"],
      },
      "ingested_document_stats": summarize_document_chunks(documents),
      "question_count": len(dataset["questions"]),
      "ragas_average_scores": average_metric_rows(ragas_rows, metrics),
      "ragas_rows": ragas_rows,
      "qa_results": [
        {
          "question_id": question["question_id"],
          "question": question["question"],
          "reference_answer": question["reference_answer"],
          "final_answer": ask_result["answer"],
          "sources": ask_result["sources"],
          "total_tokens": ask_result["totalTokens"],
        }
        for question, ask_result in zip(dataset["questions"], ask_results)
      ],
      "recall_gap_rows": recall_rows,
      "recall_gap_summary": summarize_recall_gap(recall_rows),
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
      json.dumps(
        {
          "report_path": str(REPORT_PATH),
          "document_count": manifest["document_count"],
          "question_count": len(dataset["questions"]),
          "total_chunks": report["ingested_document_stats"]["total_chunks"],
        },
        ensure_ascii=False,
      )
    )
  finally:
    if server_process is not None:
      server_process.terminate()
      try:
        server_process.wait(timeout=10)
      except subprocess.TimeoutExpired:
        server_process.kill()


if __name__ == "__main__":
  main()
