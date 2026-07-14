import asyncio
import json
import os
import re
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
from ragas.metrics import AnswerCorrectness, ContextPrecision, Faithfulness, LLMContextRecall
from ragas.run_config import RunConfig


ROOT_DIR = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT_DIR / "apps" / "server"
SCRIPT_DIR = Path(__file__).resolve().parent
CORPUS_DIR = SCRIPT_DIR / "generated_corpus_multidomain"
DATASET_PATH = Path(os.getenv("MULTIDOMAIN_DATASET_PATH", SCRIPT_DIR / "eval_dataset_multidomain_enterprise.json"))
REPORT_PATH = Path(os.getenv("MULTIDOMAIN_REPORT_PATH", SCRIPT_DIR / "multidomain_enterprise_eval_report.json"))


def normalize(value: Any) -> str:
  return re.sub(r"\s+", " ", str(value).casefold()).strip()


def unique(values: list[str]) -> list[str]:
  return list(dict.fromkeys(value for value in values if value))


def load_env() -> dict[str, str]:
  merged: dict[str, str] = {}
  for file_path in [SERVER_DIR / ".env.local", SERVER_DIR / ".env", ROOT_DIR / ".env.local", ROOT_DIR / ".env"]:
    if not file_path.exists():
      continue
    for key, value in dotenv_values(file_path).items():
      if key and value is not None:
        merged[key] = value
  merged.update({key: value for key, value in os.environ.items() if value})
  return merged


def normalize_base_url(value: str) -> str:
  return value[:-1] if value.endswith("/") else value


def dataset_spec() -> dict[str, Any]:
  def build_long_document(title: str, sections: list[tuple[str, str]]) -> str:
    return "\n\n".join(
      [f"# {title}"]
      + [
        f"## {section_title}\n\n{section_body.strip()}"
        for section_title, section_body in sections
      ]
    ) + "\n"

  documents = [
    {
      "name": "medical_anticoagulation_guideline.md",
      "domain": "medical",
      "content": build_long_document("Anticoagulation Guideline", [
        ("Scope", "This guideline applies to adult atrial fibrillation patients reviewed in outpatient and discharge workflows. It separates renal-risk handling, platelet-risk handling, and follow-up timing so that clinical staff do not merge unrelated exceptions into one generic anticoagulation rule."),
        ("Renal Exclusion", "If eGFR is below 30, do not start medixaban; escalate to renal_specialist. The renal exception must be treated as a hard start-blocking rule, not as a dose-adjustment suggestion. The patient note should preserve the eGFR value, medication name, and escalation owner together."),
        ("Platelet Exception", "If platelet count is below 50, pause anticoagulation and notify hematology_lead. This is independent of the renal rule and should not be used to infer that medixaban can be started when eGFR is below the renal threshold."),
        ("Discharge Follow-up", "Post-discharge INR follow-up must happen within 7 days. The follow-up timing is recorded as a discharge-safety requirement and should remain visible even when the main answer is about renal eligibility."),
        ("Contraindication Review", "The attending clinician must check active bleeding, planned procedures, and medication interactions before issuing anticoagulation instructions. These review items are contextual safeguards and do not replace the explicit eGFR and platelet thresholds."),
        ("Audit Trail", "Every anticoagulation decision should record the patient group, triggering threshold, medication decision, and escalation role. Missing any one of those fields makes the case unsuitable for automated discharge communication."),
        ("Near Miss Example", "A prior review confused renal_specialist with hematology_lead because both rules were stored in the same policy page. The remediation was to keep each threshold sentence intact during chunking and answer extraction."),
        ("Operational Notes", "Nursing staff may prepare education materials only after the clinician confirms the rule branch. The guideline intentionally repeats the names of the responsible roles to test whether retrieval keeps exact evidence rather than paraphrasing clinical ownership."),
      ]),
    },
    {
      "name": "medical_lab_report_case_017.md",
      "domain": "medical",
      "content": build_long_document("Lab Report Case 017", [
        ("Case Identity", "Patient code CASE-017 is used only for this lab-review scenario. Similar case IDs in the same clinic should not inherit this patient's laboratory values or follow-up owner."),
        ("Core Lab Values", "Patient code CASE-017 has HbA1c 8.4, LDL 142, and fasting glucose 156. These three numbers are the required hard facts for metabolic review and must be reported exactly when requested."),
        ("Lipid Risk Flag", "The abnormal lipid flag is lipid_high_risk. The flag is derived from the LDL value but should still be preserved as a named label because downstream reporting uses the label rather than the raw number."),
        ("Follow-up Owner", "The follow-up owner is endocrine_nurse. The owner is responsible for scheduling education and does not replace the physician responsible for medication adjustment."),
        ("Result Interpretation", "HbA1c, LDL, and fasting glucose are intentionally listed in one section to test multi-fact extraction. A system that retrieves only the first numeric value will produce an incomplete answer."),
        ("Communication Template", "Patient-facing communication should avoid unsupported treatment advice. It may summarize that the case requires endocrine follow-up, but only the documented owner and values should be treated as authoritative."),
        ("Quality Check", "If a generated answer says that lipid_high_risk belongs to another case, the result should be rejected as an identifier collision. The CASE-017 identifier must remain attached to the three lab values."),
        ("Review History", "The lab review was added to the benchmark because short numeric rows often look easy but still expose whether chunking and rerank keep all fields together under one patient code."),
      ]),
    },
    {
      "name": "hr_onboarding_access_policy.md",
      "domain": "enterprise_hr",
      "content": build_long_document("HR Onboarding Access Policy", [
        ("Policy Scope", "This policy covers employee onboarding, contractor workspace access, and background verification follow-up. It is not a general account-security policy and should not be mixed with incident response procedures."),
        ("Finance ERP Access", "New employees in the finance department receive ERP access after manager approval. This access requires department confirmation before provisioning and should not be granted based only on job title text."),
        ("Contractor Workspace Access", "Temporary contractors keep workspace access for 14 days. The 14-day retention window starts from the contractor onboarding date unless a separate extension is approved."),
        ("Verification Escalation", "If background verification is pending after 5 business days, notify people_ops_owner. The notification owner is tied to the background-check delay, not to normal workspace expiration."),
        ("Access Review", "Managers must review access scopes before the first payroll cycle. The review prevents contractors from inheriting employee-only ERP permissions."),
        ("Termination Handling", "When a contractor ends early, workspace access should be closed at the end of the approved engagement. This rule does not change the documented 14-day default window."),
        ("Audit Example", "A previous onboarding audit confused people_ops_owner with a local HR assistant. The benchmark keeps the exact role label to verify that answers preserve machine-readable owner names."),
        ("Record Keeping", "Provisioning records must include requester, approval source, access category, and expiration date. These fields help distinguish short-term workspace access from finance ERP access."),
      ]),
    },
    {
      "name": "hr_leave_policy_2026.md",
      "domain": "enterprise_hr",
      "content": build_long_document("Leave Policy 2026", [
        ("Policy Year", "Leave Policy 2026 applies to annual leave, sick leave, and parental leave approval in the current HR cycle. Older carryover rules should not be used for this policy year."),
        ("Annual Leave Carryover", "Annual leave carryover is capped at 8 days. The cap is a maximum retained balance and does not describe newly accrued leave for the next year."),
        ("Sick Leave Evidence", "Sick leave beyond 3 consecutive days requires a medical certificate. The certificate rule is based on consecutive days, not total sick days across the year."),
        ("Parental Leave Owner", "Parental leave approval is owned by hr_benefits_lead. The approval owner should be preserved exactly because HR automation routes requests by role label."),
        ("Manager Responsibilities", "Managers may approve scheduling changes but cannot override medical certificate requirements. This distinction prevents local scheduling approvals from being mistaken for policy exceptions."),
        ("Employee Communication", "Employee-facing summaries should state the cap and evidence threshold without adding benefits interpretations that are not in the policy."),
        ("Exception Handling", "Exceptional carryover above the cap requires a separate HR case review. This benchmark does not define the exception approver, so answers should not invent one."),
        ("Audit Note", "The policy is deliberately simple but long enough to test whether retrieval finds the exact leave field instead of relying on title-level similarity alone."),
      ]),
    },
    {
      "name": "finance_reimbursement_rules.md",
      "domain": "finance",
      "content": build_long_document("Reimbursement Rules", [
        ("Scope", "The reimbursement rules cover taxi claims, meal receipts, and international travel advances. They are written as operational approval thresholds rather than tax-accounting guidance."),
        ("Taxi Approval", "Taxi reimbursement above 300 requires cost_center_owner approval. The approval role applies only to taxi reimbursement and should not be copied to meal receipt rejection."),
        ("Meal Receipt Age", "Meal receipts older than 45 days are rejected automatically. The 45-day limit is based on receipt age at submission time, not the age of the reimbursement policy."),
        ("Travel Advance Review", "International travel advance above 12000 requires finance_controller review. This is a pre-travel advance review and not the same as post-trip reimbursement matching."),
        ("Submission Evidence", "Employees must attach original receipts and business purpose notes. Missing attachments can delay review but do not alter the numeric thresholds."),
        ("Audit Scenario", "A frequent failure is answering the taxi threshold while omitting the meal age limit. The two facts live in separate sentences to test multi-field retrieval."),
        ("Control Rationale", "Cost-center approval protects budget ownership, while automatic rejection protects stale receipt processing. These rationales are descriptive and should not replace hard values."),
        ("Reporting", "Finance operations reports should preserve exact approver labels such as cost_center_owner and finance_controller because downstream workflows use those strings."),
      ]),
    },
    {
      "name": "finance_card_statement_may.md",
      "domain": "finance",
      "content": build_long_document("Corporate Card Statement May", [
        ("Statement Identity", "This statement covers May corporate card activity for employee E-204. It should not be merged with reimbursement policy thresholds because it records actual spend."),
        ("Spend Breakdown", "Employee E-204 spent 860 on cloud training, 245 on taxi, and 1299 on hotel booking. These values are line-item amounts and must remain attached to the correct spending categories."),
        ("Hotel Vendor", "The hotel booking vendor is CityStay. Vendor identity is relevant for reconciliation but does not change the amount spent on hotel booking."),
        ("Reconciliation Owner", "The reconciliation owner is ap_specialist. This owner handles statement matching and should not be confused with cost_center_owner from reimbursement approval rules."),
        ("Card Review", "Reviewers should compare the statement to receipts and business approvals. The benchmark intentionally separates policy thresholds from card spend to test document-level grounding."),
        ("Exception Notes", "If a transaction lacks receipt evidence, AP may request clarification. The exception process should not invent new vendor names or substitute policy approvers."),
        ("Reporting Format", "Monthly reports should list employee code, category, amount, vendor, and reconciliation owner. Missing category-to-amount binding makes the result unreliable."),
        ("Quality Note", "This document includes several numbers in one compact section so the answer stage must keep all requested spending values rather than returning only the largest amount."),
      ]),
    },
    {
      "name": "devops_pipeline_alpha_202607.md",
      "domain": "devops",
      "content": build_long_document("Pipeline Alpha 202607", [
        ("Pipeline Identity", "Pipeline Alpha 202607 tracks release validation for the July deployment window. Build identifiers in this document should not be mixed with other pipeline families."),
        ("Build Failure", "Build 8842 failed at stage integration_test. The failed stage is the primary routing signal for CI triage and must be reported exactly."),
        ("Service Impact", "The failing service is payment-webhook. The service label is machine-readable and should not be paraphrased as a generic payment service."),
        ("Rollback Target", "Rollback target is release_2026_07_08. The target release should remain attached to Build 8842 because adjacent builds may have different rollback targets."),
        ("Incident Command", "The incident commander is sre_lead. This owner coordinates response but does not approve production freeze overrides."),
        ("Test Evidence", "Integration test logs showed repeated callback validation failures. The logs explain why the service was isolated but do not change the failed stage label."),
        ("Runbook Linkage", "If error-rate thresholds are breached after deployment, the deployment runbook controls rollback. This pipeline document only records the failed build state."),
        ("Postmortem Notes", "The benchmark uses this document to test whether RAG can combine build ID, stage, service, and rollback target without pulling values from a neighboring DevOps document."),
      ]),
    },
    {
      "name": "devops_deployment_runbook.md",
      "domain": "devops",
      "content": build_long_document("Deployment Runbook", [
        ("Runbook Scope", "This runbook defines deployment safety checks, rollback criteria, and freeze override approval. It is not a CI build failure record."),
        ("Canary Requirement", "Blue-green deployment requires 2 healthy canary checks before traffic shift. The canary count is a pre-shift gate and should not be confused with post-shift monitoring duration."),
        ("Rollback Threshold", "If error rate exceeds 1.5 percent for 10 minutes, rollback immediately. Both the percentage and duration are required to understand the rollback trigger."),
        ("Freeze Override", "Approval for production freeze override belongs to release_manager. This approval role should not be replaced by the incident commander from pipeline incidents."),
        ("Monitoring", "SRE dashboards must display error rate, latency, and saturation during traffic shift. Monitoring data supports the threshold but does not create a different rollback rule."),
        ("Communication", "Deployment communication should identify the service, window, canary status, and rollback owner. If evidence lacks those fields, the answer should avoid speculation."),
        ("Known Confusion", "Past incidents confused canary check count with rollback duration because both appear as small numbers. The document keeps them in separate sentences for evidence testing."),
        ("Operational Review", "After each deployment, the team reviews whether the traffic shift followed the documented canary requirement and whether any freeze override was properly approved."),
      ]),
    },
    {
      "name": "industrial_plc_fault_codes.md",
      "domain": "industrial",
      "content": build_long_document("PLC Fault Codes", [
        ("Catalog Scope", "This PLC catalog maps fault codes to equipment conditions and required operational actions. It should not be mixed with raw shift sensor logs unless the same line and fault code are requested."),
        ("Coolant Fault", "Fault F-203 means coolant pressure below 42 psi. The coolant-pressure rule is separate from vibration handling and should not trigger the F-417 response."),
        ("Vibration Fault", "Fault F-417 means motor vibration above 7.2 mm/s. The vibration threshold is measured in millimeters per second and must remain attached to F-417."),
        ("Required Action", "For F-417, stop line L3 and notify maintenance_supervisor. The line stop and notification owner are both required action fields."),
        ("Operator Guidance", "Operators should confirm the PLC alarm code before stopping production. A sensor reading alone may explain the alarm but does not replace the code catalog."),
        ("Maintenance Note", "Maintenance teams record fault code, observed metric, line, and supervisor notification status. Missing the line identifier can lead to a wrong shutdown action."),
        ("Near Neighbor Risk", "F-203 and F-417 are intentionally close in the catalog to test whether retrieval keeps pressure and vibration facts separate."),
        ("Safety Review", "All severe vibration faults require a post-stop inspection before restart. This review note does not alter the exact F-417 threshold or owner."),
      ]),
    },
    {
      "name": "industrial_sensor_shift_log.md",
      "domain": "industrial",
      "content": build_long_document("Sensor Shift Log", [
        ("Shift Identity", "This shift log records observed sensor readings for line L3. It is an observation document and should not be treated as the fault-code catalog itself."),
        ("L3 Measurements", "Line L3 recorded temperature 86.5 C, vibration 7.6 mm/s, and pressure 39 psi. These readings are measured values from the shift and must remain associated with L3."),
        ("Shift Owner", "The shift owner is operator_chen. The owner records the observations and is not necessarily the maintenance supervisor notified by a fault response."),
        ("Inspection Ticket", "The required inspection ticket is MX-7781. The ticket identifier should be preserved exactly for maintenance tracking."),
        ("Alarm Context", "The vibration reading may be compared with PLC fault thresholds, but the log itself only records observed data. Answers should not invent a fault code unless the question asks for code mapping."),
        ("Pressure Context", "Pressure 39 psi appears near a coolant threshold in the catalog. The benchmark keeps this value to test cross-document reasoning without forcing every answer to cite the catalog."),
        ("Data Quality", "Sensor readings were captured from calibrated equipment during the evening shift. Calibration notes are context only and do not replace the numeric readings."),
        ("Review Note", "The log is deliberately adjacent to the PLC fault catalog in domain vocabulary, creating a realistic industrial retrieval challenge between raw telemetry and rule documents."),
      ]),
    },
    {
      "name": "personal_company_schedule.md",
      "domain": "personal_info",
      "content": build_long_document("Personal Company Schedule", [
        ("Schedule Scope", "This schedule records Alex's company appointments and meeting logistics. It should not be used as a policy document or as evidence of customer commitments."),
        ("Daily Appointments", "On 2026-07-18, Alex has a vendor review at 10:30 and a security briefing at 15:00. Both time slots are required when the question asks for the two arrangements."),
        ("Vendor Review Owner", "The vendor review owner is procurement_pm. The owner coordinates vendor materials and does not manage the security briefing."),
        ("Briefing Room", "The briefing room is Room-C12. The room belongs to the security briefing and should not be attached to the vendor review."),
        ("Calendar Notes", "Calendar reminders may be sent 30 minutes before each event. Reminder timing is operational context and should not replace the actual meeting times."),
        ("Privacy Handling", "The schedule contains personal work information, so answers should only reveal requested fields and avoid adding unrelated personal details."),
        ("Conflict Review", "If meetings overlap, Alex's assistant must notify the relevant owner. In this specific schedule the 10:30 and 15:00 meetings do not overlap."),
        ("Benchmark Purpose", "The document tests whether RAG handles ordinary workplace facts, dates, times, rooms, and owner labels without relying on domain-specific policy wording."),
      ]),
    },
    {
      "name": "sales_customer_notes_q3.md",
      "domain": "sales_crm",
      "content": build_long_document("Sales Customer Notes Q3", [
        ("Account Scope", "These notes cover Q3 renewal coordination for customer ACME-North. They are customer-relationship notes and should not be merged with finance reimbursement documents."),
        ("Renewal Request", "Customer ACME-North requested renewal before 2026-08-05. The requested date is the key scheduling fact and must stay attached to ACME-North."),
        ("Discount Cap", "The promised discount cap is 12 percent. The discount cap is a commercial commitment and should not be confused with reimbursement percentages or deployment error rates."),
        ("Legal Review", "The legal reviewer is contract_counsel. The reviewer label is machine-readable and should be preserved exactly in generated answers."),
        ("Sales Follow-up", "The account manager should confirm procurement timing and contract redlines before sending the final renewal packet. These follow-up tasks are context, not replacement facts."),
        ("Risk Note", "If the discount cap is missing from the answer, the response should be considered incomplete because the commercial commitment is one of the requested fields."),
        ("Customer History", "Prior ACME-North renewals used different dates and reviewers. This Q3 note intentionally records the current cycle so retrieval must not reuse stale customer values."),
        ("Benchmark Purpose", "The sales document is short in business meaning but long in structure to verify that chunking still creates realistic retrieval units across common CRM notes."),
      ]),
    },
  ]
  questions = [
    ("medical", "medical_anticoagulation_guideline.md", "eGFR 低于多少不能启动 medixaban，需要升级给谁？", "eGFR 低于 30 时不能启动 medixaban，需要升级给 renal_specialist。", ["30", "medixaban", "renal_specialist"]),
    ("medical", "medical_lab_report_case_017.md", "CASE-017 的 HbA1c 和 LDL 分别是多少，随访负责人是谁？", "CASE-017 的 HbA1c 是 8.4，LDL 是 142，随访负责人是 endocrine_nurse。", ["8.4", "142", "endocrine_nurse"]),
    ("enterprise_hr", "hr_onboarding_access_policy.md", "临时承包商 workspace access 保留多少天，背景验证超过几天通知谁？", "临时承包商 workspace access 保留 14 天；背景验证超过 5 个工作日未完成时通知 people_ops_owner。", ["14", "5", "people_ops_owner"]),
    ("enterprise_hr", "hr_leave_policy_2026.md", "年假结转上限是多少天，连续病假超过几天需要医疗证明？", "年假结转上限是 8 天；连续病假超过 3 天需要医疗证明。", ["8", "3"]),
    ("finance", "finance_reimbursement_rules.md", "出租车报销超过多少需要谁审批，餐饮票据超过多少天会被拒绝？", "出租车报销超过 300 需要 cost_center_owner 审批；餐饮票据超过 45 天会被自动拒绝。", ["300", "cost_center_owner", "45"]),
    ("finance", "finance_card_statement_may.md", "E-204 在 cloud training、taxi、hotel booking 上分别花了多少？", "E-204 在 cloud training 花费 860，taxi 花费 245，hotel booking 花费 1299。", ["860", "245", "1299"]),
    ("devops", "devops_pipeline_alpha_202607.md", "Build 8842 失败在哪个 stage，失败服务和回滚目标是什么？", "Build 8842 失败在 integration_test，失败服务是 payment-webhook，回滚目标是 release_2026_07_08。", ["8842", "integration_test", "payment-webhook", "release_2026_07_08"]),
    ("devops", "devops_deployment_runbook.md", "蓝绿发布需要几次健康 canary 检查，错误率超过多少持续多久要回滚？", "蓝绿发布需要 2 次健康 canary 检查；错误率超过 1.5% 持续 10 分钟要立即回滚。", ["2", "1.5", "10"]),
    ("industrial", "industrial_plc_fault_codes.md", "F-417 表示什么阈值异常，需要停止哪条线并通知谁？", "F-417 表示电机振动超过 7.2 mm/s，需要停止 L3 并通知 maintenance_supervisor。", ["F-417", "7.2", "L3", "maintenance_supervisor"]),
    ("industrial", "industrial_sensor_shift_log.md", "L3 线的振动和压力是多少，需要哪个 inspection ticket？", "L3 线振动是 7.6 mm/s，压力是 39 psi，需要 inspection ticket MX-7781。", ["7.6", "39", "MX-7781"]),
    ("personal_info", "personal_company_schedule.md", "Alex 在 2026-07-18 有哪两个安排，security briefing 在哪个房间？", "Alex 在 2026-07-18 有 10:30 的 vendor review 和 15:00 的 security briefing，security briefing 在 Room-C12。", ["2026-07-18", "10:30", "15:00", "Room-C12"]),
    ("sales_crm", "sales_customer_notes_q3.md", "ACME-North 要求在哪天前续约，折扣上限是多少，谁做 legal review？", "ACME-North 要求在 2026-08-05 前续约，折扣上限是 12%，legal reviewer 是 contract_counsel。", ["2026-08-05", "12", "contract_counsel"]),
  ]
  return {
    "knowledge_base_name": "Multidomain Enterprise Smoke Corpus",
    "knowledge_base_description": "Mixed-domain enterprise RAG smoke benchmark.",
    "documents": documents,
    "questions": [
      {
        "question_id": f"multi_{index + 1:03d}",
        "domain": domain,
        "difficulty": "multi_domain_smoke",
        "question": question,
        "reference_answer": reference,
        "gold_document_names": [doc_name],
        "required_values": required,
      }
      for index, (domain, doc_name, question, reference, required) in enumerate(questions)
    ],
  }


def write_corpus(dataset: dict[str, Any]) -> None:
  CORPUS_DIR.mkdir(parents=True, exist_ok=True)
  for document in dataset["documents"]:
    (CORPUS_DIR / document["name"]).write_text(document["content"], encoding="utf-8")
  DATASET_PATH.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")


def is_server_ready(base_url: str) -> bool:
  try:
    return requests.get(f"{base_url}/knowledge/bases", timeout=5).ok
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


def post_json(url: str, payload: dict[str, Any], timeout: int = 60) -> dict[str, Any]:
  response = requests.post(url, json=payload, timeout=timeout)
  response.raise_for_status()
  return response.json()["data"]


def create_knowledge_base(base_url: str, dataset: dict[str, Any]) -> dict[str, Any]:
  name = f"{dataset['knowledge_base_name']} {int(time.time())}"
  return post_json(
    f"{base_url}/knowledge/bases",
    {"name": name, "description": dataset["knowledge_base_description"]},
  )


def ingest_documents(base_url: str, kb_id: str, dataset: dict[str, Any]) -> None:
  for document in dataset["documents"]:
    created = post_json(
      f"{base_url}/knowledge/bases/{kb_id}/documents",
      {
        "name": document["name"],
        "storagePath": str(CORPUS_DIR / document["name"]),
        "chunkConfig": {
          "targetChars": 700,
          "maxChars": 900,
          "minChars": 120,
          "overlapChars": 60,
        },
      },
      timeout=120,
    )
    requests.post(f"{base_url}/knowledge/documents/{created['id']}/chunks/rebuild", timeout=300).raise_for_status()


def ask_knowledge(base_url: str, kb_id: str, question: str) -> dict[str, Any]:
  response = requests.post(
    f"{base_url}/workspace/chat/stream",
    json={"query": question, "knowledgeBaseId": kb_id, "think": True},
    stream=True,
    timeout=240,
  )
  response.raise_for_status()
  for raw_line in response.iter_lines(decode_unicode=True):
    if not raw_line:
      continue
    event = json.loads(raw_line)
    if event.get("type") == "error":
      raise RuntimeError(event.get("message") or "Stream answer failed")
    if event.get("type") == "completed":
      return event["data"]
  raise RuntimeError("Stream answer did not complete")


def search_knowledge(base_url: str, kb_id: str, question: str) -> dict[str, Any]:
  return post_json(
    f"{base_url}/knowledge/search",
    {"query": question, "knowledgeBaseId": kb_id, "rewrite": False},
    timeout=120,
  )


def answer_gate(question: dict[str, Any], answer: str) -> dict[str, Any]:
  normalized_answer = normalize(answer)
  required = [normalize(value) for value in question["required_values"]]
  matched = [value for value in required if value in normalized_answer]
  missing = [value for value in required if value not in normalized_answer]
  return {
    "required_values": required,
    "matched_values": matched,
    "missing_values": missing,
    "coverage": round(len(matched) / max(1, len(required)), 4),
    "passed": len(missing) == 0,
  }


def retrieval_gate(question: dict[str, Any], search_result: dict[str, Any]) -> dict[str, Any]:
  hits = search_result["hits"]
  names = [item["documentName"] for item in hits]
  unique_names = list(dict.fromkeys(names))
  gold_names = question["gold_document_names"]
  gold_recall = sum(1 for name in gold_names if name in unique_names) / max(1, len(gold_names))
  context_text = normalize("\n".join(item.get("content", "") for item in hits))
  required = [normalize(value) for value in question["required_values"]]
  matched_terms = [value for value in required if value in context_text]
  return {
    "gold_document_recall": round(gold_recall, 4),
    "top1_gold": bool(hits and hits[0]["documentName"] in gold_names),
    "required_terms_coverage": round(len(matched_terms) / max(1, len(required)), 4),
    "retrieved_document_names": unique_names,
  }


def build_metrics(env: dict[str, str]) -> list[Any]:
  llm = LangchainLLMWrapper(
    ChatOpenAI(
      model=env["RAGAS_LLM_MODEL"],
      api_key=env["LLM_API_KEY"],
      base_url=normalize_base_url(env["LLM_BASE_URL"]),
      temperature=0,
    )
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
  run_config = RunConfig(timeout=240, max_retries=1, max_workers=1)
  metrics = [
    Faithfulness(llm=llm),
    LLMContextRecall(llm=llm),
    ContextPrecision(llm=llm),
    AnswerCorrectness(llm=llm, embeddings=embeddings),
  ]
  for metric in metrics:
    metric.init(run_config)
  return metrics


async def score_ragas(samples: list[SingleTurnSample], metrics: list[Any]) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  for index, sample in enumerate(samples):
    row: dict[str, Any] = {
      "sample_index": index,
      "user_input": sample.user_input,
      "response": sample.response,
      "reference": sample.reference,
    }
    for metric in metrics:
      try:
        row[metric.name] = await asyncio.wait_for(metric.single_turn_ascore(sample, timeout=240), timeout=300)
      except Exception as error:
        row[metric.name] = None
        row[f"{metric.name}_error"] = str(error)
    rows.append(row)
  return rows


def average_metric(rows: list[dict[str, Any]], metric: str) -> float:
  values = [float(row[metric]) for row in rows if isinstance(row.get(metric), (int, float))]
  return round(sum(values) / len(values), 4) if values else 0.0


def main() -> None:
  env = load_env()
  dataset = dataset_spec()
  write_corpus(dataset)
  mode = os.getenv("MULTIDOMAIN_EVAL_MODE", "full")
  api_base_url = "http://localhost:3001/api"
  server_process: subprocess.Popen[str] | None = None
  try:
    if not is_server_ready(api_base_url):
      server_process = start_server()
      wait_for_server(api_base_url)
    kb = create_knowledge_base(api_base_url, dataset)
    ingest_documents(api_base_url, kb["id"], dataset)
    if mode == "ingest_only":
      print(json.dumps({
        "mode": mode,
        "knowledge_base": kb,
        "dataset_path": str(DATASET_PATH),
        "corpus_dir": str(CORPUS_DIR),
        "document_count": len(dataset["documents"]),
      }, ensure_ascii=False))
      return

    rows: list[dict[str, Any]] = []
    samples: list[SingleTurnSample] = []
    for question in dataset["questions"]:
      search_result = search_knowledge(api_base_url, kb["id"], question["question"])
      qa_result = ask_knowledge(api_base_url, kb["id"], question["question"])
      retrieval = retrieval_gate(question, search_result)
      answer = answer_gate(question, qa_result["answer"])
      rows.append(
        {
          "question_id": question["question_id"],
          "domain": question["domain"],
          "question": question["question"],
          "reference_answer": question["reference_answer"],
          "final_answer": qa_result["answer"],
          "retrieval_gate": retrieval,
          "answer_gate": answer,
          "sources": qa_result.get("sources", []),
          "latency_ms": qa_result.get("latencyMs"),
        }
      )
      samples.append(
        SingleTurnSample(
          user_input=question["question"],
          retrieved_contexts=[item["content"] for item in qa_result.get("sources", [])],
          response=qa_result["answer"],
          reference=question["reference_answer"],
        )
      )

    ragas_rows = asyncio.run(score_ragas(samples, build_metrics(env)))
    summary = {
      "question_count": len(rows),
      "retrieval_gold_recall": round(sum(row["retrieval_gate"]["gold_document_recall"] for row in rows) / len(rows), 4),
      "retrieval_top1_gold_rate": round(sum(1 for row in rows if row["retrieval_gate"]["top1_gold"]) / len(rows), 4),
      "retrieval_required_terms_coverage": round(sum(row["retrieval_gate"]["required_terms_coverage"] for row in rows) / len(rows), 4),
      "answer_full_coverage_rate": round(sum(1 for row in rows if row["answer_gate"]["passed"]) / len(rows), 4),
      "answer_average_required_value_coverage": round(sum(row["answer_gate"]["coverage"] for row in rows) / len(rows), 4),
      "ragas": {
        "faithfulness": average_metric(ragas_rows, "faithfulness"),
        "context_recall": average_metric(ragas_rows, "context_recall"),
        "context_precision": average_metric(ragas_rows, "context_precision"),
        "answer_correctness": average_metric(ragas_rows, "answer_correctness"),
      },
      "failed_answer_gate_question_ids": [row["question_id"] for row in rows if not row["answer_gate"]["passed"]],
    }
    report = {
      "knowledge_base": kb,
      "dataset_path": str(DATASET_PATH),
      "corpus_dir": str(CORPUS_DIR),
      "summary": summary,
      "rows": rows,
      "ragas_rows": ragas_rows,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report_path": str(REPORT_PATH), "summary": summary}, ensure_ascii=False))
  finally:
    if server_process is not None:
      server_process.terminate()
      try:
        server_process.wait(timeout=10)
      except subprocess.TimeoutExpired:
        server_process.kill()


if __name__ == "__main__":
  main()
