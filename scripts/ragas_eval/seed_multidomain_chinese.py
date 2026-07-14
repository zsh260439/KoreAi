import argparse
import json
from pathlib import Path
from typing import Any

import requests


ROOT_DIR = Path(__file__).resolve().parents[2]
CORPUS_DIR = Path(__file__).resolve().parent / "generated_corpus_multidomain_chinese"
BASE_URL = "http://localhost:3001/api"

DOMAINS = [
    ("medical", "医疗", "医疗记录", ["检验报告", "用药规范", "门诊流程", "护理交接", "康复计划", "影像复核"]),
    ("enterprise", "企业内部", "企业管理", ["入职流程", "权限申请", "会议管理", "采购流程", "资产管理", "离职交接"]),
    ("pipeline", "流水线", "流水线运营", ["生产日报", "发布流程", "质量巡检", "物料补给", "设备换线", "异常复盘"]),
    ("industrial", "工业现场", "工业设备", ["传感器巡检", "电机维护", "压力监测", "安全联锁", "仓储设备", "停机检修"]),
    ("personal", "日常个人", "个人信息", ["日程安排", "家庭账单", "证件管理", "健康记录", "出行计划", "提醒设置"]),
    ("company_flow", "公司流水", "公司运营", ["合同审批", "费用报销", "客户续约", "供应商付款", "发票管理", "预算复盘"]),
    ("education", "教育培训", "教育业务", ["课程安排", "考试管理", "学员档案", "实验室预约", "证书发放", "培训复盘"]),
    ("logistics", "物流运输", "物流业务", ["仓库收货", "干线运输", "配送签收", "冷链监控", "车辆维护", "异常理赔"]),
    ("energy", "能源管理", "能源业务", ["用电日报", "巡检计划", "负荷控制", "计量复核", "故障响应", "节能复盘"]),
    ("retail", "零售运营", "零售业务", ["门店开业", "库存盘点", "促销审批", "退货处理", "会员服务", "销售复盘"]),
]

ROLES = ["业务负责人", "值班主管", "区域经理", "质量专员", "财务审核员", "运营协调员"]


def build_documents() -> list[dict[str, str]]:
    documents: list[dict[str, str]] = []
    for domain_index, (slug, domain_name, subject, topics) in enumerate(DOMAINS):
        for variant in range(1, 7):
            record_id = f"{slug.upper()}-{variant:02d}"
            role = ROLES[(domain_index + variant) % len(ROLES)]
            threshold = 20 + domain_index * 7 + variant
            deadline = 2 + (domain_index + variant) % 6
            title = f"{domain_name}{topics[variant - 1]}记录 {variant:02d}"
            sections = [
                ("基本信息", f"记录编号为 {record_id}，所属方向是{domain_name}，本文件用于描述{subject}中的第 {variant} 组业务事实。"),
                ("适用范围", f"本记录适用于{topics[variant - 1]}相关工作，涉及{domain_name}的日常执行、复核和结果留痕。"),
                ("核心阈值", f"当处理数量达到 {threshold} 次或指标超过 {threshold} 个单位时，执行升级检查，不得只根据口头通知放行。"),
                ("责任角色", f"本记录的首要责任角色是{role}，该角色负责确认事实、分派任务并在系统中保留处理结果。"),
                ("执行流程", f"执行顺序为登记 {record_id}、核对原始数据、完成{topics[variant - 1]}操作、由{role}进行复核，最后提交归档。"),
                ("时间要求", f"收到请求后应在 {deadline} 个工作日内完成初步处理；超过时限必须说明原因并通知{role}。"),
                ("异常处理", f"如果发现数据缺失、数值冲突或现场条件不满足，应暂停当前步骤，创建异常记录并交给{role}确认。"),
                ("记录字段", f"结果至少记录编号 {record_id}、处理时间、实际数值、责任角色{role}和最终状态，字段不得用模糊描述替代。"),
                ("审核要求", f"审核时应同时检查{domain_name}的适用范围、核心阈值和时间要求；仅有一项通过时，结果不能标记为完成。"),
                ("版本说明", f"当前记录为第 {variant} 版，适用于本轮{subject}测试；后续调整必须保留旧值、新值和调整原因。"),
            ]
            content = f"# {title}\n\n" + "\n\n".join(
                f"## {section}\n\n{body}" for section, body in sections
            ) + "\n"
            documents.append({"name": f"{slug}_{variant:02d}.md", "content": content})
    return documents


def request_json(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
    response = requests.request(method, url, timeout=300, **kwargs)
    response.raise_for_status()
    payload = response.json()
    return payload.get("data", payload)


def clear_documents(kb_id: str) -> None:
    documents = request_json("GET", f"{BASE_URL}/knowledge/bases/{kb_id}/documents")
    for document in documents:
        request_json("DELETE", f"{BASE_URL}/knowledge/documents/{document['id']}")


def seed(kb_id: str) -> None:
    documents = build_documents()
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    for document in documents:
        (CORPUS_DIR / document["name"]).write_text(document["content"], encoding="utf-8")

    clear_documents(kb_id)
    chunk_counts: list[int] = []
    for index, document in enumerate(documents, start=1):
        created = request_json(
            "POST",
            f"{BASE_URL}/knowledge/bases/{kb_id}/documents",
            json={
                "name": document["name"],
                "storagePath": str(CORPUS_DIR / document["name"]),
                "chunkConfig": {
                    "targetChars": 220,
                    "maxChars": 320,
                    "minChars": 80,
                    "overlapChars": 30,
                },
            },
        )
        chunks = request_json(
            "POST",
            f"{BASE_URL}/knowledge/documents/{created['id']}/chunks/rebuild",
        )
        chunk_counts.append(len(chunks))
        print(json.dumps({"document": index, "name": document["name"], "chunks": len(chunks)}, ensure_ascii=False))

    print(json.dumps({
        "knowledge_base_id": kb_id,
        "documents": len(documents),
        "chunks": sum(chunk_counts),
        "min_chunks_per_document": min(chunk_counts),
        "max_chunks_per_document": max(chunk_counts),
    }, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--knowledge-base-id", required=True)
    args = parser.parse_args()
    seed(args.knowledge_base_id)
