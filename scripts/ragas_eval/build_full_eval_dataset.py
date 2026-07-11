import json
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = SCRIPT_DIR / "corpus_manifest.json"
OUTPUT_PATH = SCRIPT_DIR / "eval_dataset_full.json"


def build_question(document: dict[str, Any], index: int) -> dict[str, Any]:
  facts = document["facts"]
  doc_type = facts["doc_type"]
  code = facts["code"]
  question_id = f"full_{index:03d}"

  if doc_type == "product":
    return {
      "question_id": question_id,
      "question": f"产品 {code} 的金融最少引用数是多少，季度工单超过多少次需要升级审批，升级给谁？",
      "reference_answer": (
        f"产品 {code} 的金融最少引用数是 {facts['finance_min_citations']} 条；"
        f"若季度工单超过 {facts['quarterly_ticket_limit']} 次，审批必须升级给 {facts['approval_role']}。"
      ),
      "gold_document_names": [document["name"]],
      "difficulty": "full_doc_product_exact",
    }

  if doc_type == "ops":
    return {
      "question_id": question_id,
      "question": f"运维手册 {code} 的维护窗口是什么，夜间连续多少次 P2 召回缺失要通知谁？",
      "reference_answer": (
        f"运维手册 {code} 的维护窗口是 {facts['maintenance_window']}；"
        f"夜间连续出现 {facts['night_p2_limit']} 次 P2 召回缺失时，必须通知 {facts['notify_role']}。"
      ),
      "gold_document_names": [document["name"]],
      "difficulty": "full_doc_ops_exact",
    }

  if doc_type == "procurement":
    return {
      "question_id": question_id,
      "question": f"供应商 {code} 的召回覆盖率阈值是多少，合同金额在哪个区间由 regional_owner 审批？",
      "reference_answer": (
        f"供应商 {code} 的召回覆盖率阈值是 {facts['coverage_threshold']}；"
        f"合同金额位于 {facts['approval_low']} 万至 {facts['approval_high']} 万之间时，由 regional_owner 审批。"
      ),
      "gold_document_names": [document["name"]],
      "difficulty": "full_doc_procurement_exact",
    }

  if doc_type == "policy":
    return {
      "question_id": question_id,
      "question": f"制度 {code} 的审计日志保留多少天，第二次违规冻结多少天，演示样本清理期限是多少天？",
      "reference_answer": (
        f"制度 {code} 的审计日志保留 {facts['audit_retention_days']} 天；"
        f"第二次违规冻结 {facts['second_violation_freeze_days']} 天；"
        f"演示样本清理期限是 {facts['demo_cleanup_deadline_days']} 天。"
      ),
      "gold_document_names": [document["name"]],
      "difficulty": "full_doc_policy_exact",
    }

  if doc_type == "postmortem":
    return {
      "question_id": question_id,
      "question": f"事故复盘 {code} 将 chunkSize 从多少调到多少，overlap 是多少，验收 gold_recall_rate 目标是多少？",
      "reference_answer": (
        f"事故复盘 {code} 将 chunkSize 从 {facts['old_chunk_size']} 调整到 {facts['new_chunk_size']}；"
        f"overlap 是 {facts['overlap_size']}；"
        f"验收 gold_recall_rate 目标是 {facts['acceptance_recall_target']}。"
      ),
      "gold_document_names": [document["name"]],
      "difficulty": "full_doc_postmortem_exact",
    }

  if code == "strategy_aurora":
    return {
      "question_id": question_id,
      "question": "Aurora 默认知识问答 topK 是多少，工作台链路常用 topK 是多少，最容易丢失哪类条款？",
      "reference_answer": (
        f"Aurora 默认知识问答 topK 是 {facts['default_topk']}；"
        f"工作台链路常用 topK 是 {facts['workspace_topk']}；"
        f"最容易丢失的是 {facts['weakness']}。"
      ),
      "gold_document_names": [document["name"]],
      "difficulty": "full_doc_cross_ref_strategy",
    }

  cross_ref_questions = {
    "finance_strict_pack": {
      "question": "金融行业问答在引用数不足、召回文档数不足一半、exact_code 未命中时分别应该如何处理？",
      "reference_answer": (
        "金融行业问答引用数量不足产品文档规定的最低值时，只能标记 normal_confidence；"
        "召回文档数少于应召回文档总数一半时，必须记录 recall_gap；"
        "exact_code 未命中时，即使答案方向正确也不能视为 fully_grounded。"
      ),
      "difficulty": "full_doc_cross_ref_finance",
    },
    "thinking_mode_guideline": {
      "question": "thinking mode 中 visibleContent 和 content 分别用于什么，混用会造成什么风险？",
      "reference_answer": (
        "visibleContent 只用于实时展示推理过程，content 只用于持久化最终正式答案；"
        "如果前端把 visibleContent 当成 content 对外展示，会造成 final_answer_presentation_risk。"
      ),
      "difficulty": "full_doc_cross_ref_thinking",
    },
    "retrieval_tuning_playbook": {
      "question": "检索调优手册建议 second_layer_clause 丢失、exact_code 错召回、制度天数混淆时分别怎么处理？",
      "reference_answer": (
        "second_layer_clause 经常丢失时，应优先增大 chunkSize 并提高 overlap；"
        "exact_code 召回经常错误时，应增加编号特征 rerank；"
        "制度天数与阈值频繁混淆时，应加入 structured_fact_extractor。"
      ),
      "difficulty": "full_doc_cross_ref_tuning",
    },
    "confidence_labelling_standard": {
      "question": "置信度标注标准中，引用不足、只命中相似文档未命中 gold_document、证据不完整时分别如何标注？",
      "reference_answer": (
        "引用数量不足最低要求时不得使用 high_confidence；"
        "只命中相似文档但未命中 gold_document 时，最高只能标记 reviewed_but_not_grounded；"
        "引用与答案方向一致但证据不完整时，只能标记 normal_confidence。"
      ),
      "difficulty": "full_doc_cross_ref_confidence",
    },
    "workspace_chain_overview": {
      "question": "工作台问答链路中没有 activeConversation 时会怎么处理，默认通过哪个接口完成知识问答，工作台 topK 通常是多少？",
      "reference_answer": (
        "handleSend 进入 sendMessage 后会检查 activeConversation，不存在则创建会话；"
        "知识问答层默认走 workspace/chat/stream 完成事件；"
        "工作台链路通常把知识检索 topK 固定为 4。"
      ),
      "difficulty": "full_doc_cross_ref_workspace",
    },
  }

  if code in cross_ref_questions:
    row = cross_ref_questions[code]
    return {
      "question_id": question_id,
      "question": row["question"],
      "reference_answer": row["reference_answer"],
      "gold_document_names": [document["name"]],
      "difficulty": row["difficulty"],
    }

  raise ValueError(f"Unsupported document type or code: {doc_type}/{code}")


def main() -> None:
  manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
  questions = [build_question(document, index + 1) for index, document in enumerate(manifest["documents"])]
  dataset = {
    "knowledge_base_name": "Ragas High Standard Corpus",
    "knowledge_base_description": "Full-document deterministic RAGAS dataset generated from corpus_manifest facts.",
    "document_count": manifest["document_count"],
    "question_count": len(questions),
    "documents": manifest["documents"],
    "questions": questions,
  }
  OUTPUT_PATH.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
  print(
    json.dumps(
      {
        "dataset_path": str(OUTPUT_PATH),
        "document_count": dataset["document_count"],
        "question_count": dataset["question_count"],
      },
      ensure_ascii=False,
    )
  )


if __name__ == "__main__":
  main()
