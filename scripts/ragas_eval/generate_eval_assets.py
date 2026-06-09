import json
import shutil
from pathlib import Path


#声明评测输出目录
OUTPUT_DIR = Path(__file__).resolve().parent / "generated_corpus"

#声明评测数据文件
DATASET_PATH = Path(__file__).resolve().parent / "eval_dataset.json"

#声明语料清单文件
MANIFEST_PATH = Path(__file__).resolve().parent / "corpus_manifest.json"


#声明格式化小数
def format_decimal(value: float) -> str:
  return f"{value:.2f}"


#声明写入文本文件
def write_text_file(path: Path, content: str) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(content, encoding="utf-8")


#声明拼接标题分节
def build_section(title: str, lines: list[str]) -> str:
  body = "\n".join(f"- {line}" for line in lines)
  return f"## {title}\n{body}\n"


#声明构造产品文档加长分节
def build_product_extended_sections(
  product_code: str,
  support_tier: str,
  finance_min_citations: int,
  finance_recall_threshold: float,
  quarterly_ticket_limit: int,
  visibility_retention_days: int,
  approval_role: str,
) -> list[str]:
  return [
    build_section(
      "检索歧义矩阵",
      [
        f"{product_code} 所在的 {support_tier} 档位与相邻产品共享 finance_strict_pack、normal_confidence 和 recall_gap 等高频术语，因此仅靠主题词很容易命中近邻文档。",
        f"如果排序阶段没有把 {product_code} 的 exact_code 作为强特征，模型可能会把引用下限错误继承为同系列别的版本，从而把 {finance_min_citations} 条写成其他值。",
        f"当 topK 只保留 4 条上下文时，关于季度工单阈值 {quarterly_ticket_limit} 和审批角色 {approval_role} 的组合信息更容易被拆散到不同 chunk。",
        f"如果 overlap 设置过低，关于召回覆盖率 {format_decimal(finance_recall_threshold)} 的监管阈值会和引用条数规则落在不同 chunk，导致回答只剩原则描述而缺少数字。",
        f"评测时应重点观察答案是否同时命中 exact_code、阈值数字、审批角色和置信度回退规则，不能只看回答方向看起来是否正确。",
      ],
    ),
    build_section(
      "审计补录清单",
      [
        f"{product_code} 的金融问答复盘必须同时记录 expectedRecallDocCount、actualHitDocCount、citation_bundle_id 和 confidence_label，避免只留下最终答案而丢失证据链。",
        f"如果最终答案引用不足 {finance_min_citations} 条，但界面仍展示 high_confidence，则应立即归类为高风险标注错误并进入专项复核。",
        "对于启用 think_mode 的场景，还必须核查 visibleContent 是否只承担实时展示职责，且最终 content 字段是否准确回写正式答复。",
        f"若连续两个工作日的召回覆盖率低于 {format_decimal(finance_recall_threshold)}，复盘记录中必须明确写出升级审批角色已经切换到 {approval_role}。",
        "所有补录字段都应保留到统一审计链路中，否则后续即使答案正确，也无法证明该答案真正来源于正确 gold_document。",
      ],
    ),
    build_section(
      "邻近版本对照",
      [
        f"{product_code} 与同系列相邻版本通常只在引用下限、工单阈值和日志保留天数上存在细微差异，因此非常适合验证最小 RAG 是否会发生近邻错召回。",
        f"高标准评测要求模型不仅答出规则，还要答对 {quarterly_ticket_limit}、{visibility_retention_days} 和 {finance_min_citations} 这类离散数字，避免把同族模板误当成正确依据。",
        f"如果回答里只说需要更多引用或需要升级审批，但没有明确写出 {approval_role} 或具体阈值，这类结果应判定为信息不完整而不是简单算对。",
        "相邻版本还会共享 demo_cleanup_checklist、second_layer_clause 和 regulated_workspace 等词汇，因此检索系统必须具备压制同族模板干扰的能力。",
        "升级版 RAG 如果加入 exact_code rerank 和结构化字段抽取，理论上应先改善这类产品文档上的 precision，再带动最终 correctness 上升。",
      ],
    ),
    build_section(
      "长尾问答提醒",
      [
        f"当问题同时询问最少引用数、召回覆盖率和审批升级条件时，{product_code} 的答案需要跨越多个 section 聚合信息，这正是多跳检索与长文聚合的重点压测场景。",
        "visibleContent 相关规则不能替代正式答复规则，任何把思考过程直接暴露给用户的实现都应与 content 字段的正式输出严格分离。",
        "对于金融行业演示环境，如果样本文档未经清理直接混入正式知识库，即使最终答案偶然正确，也会破坏后续评分对真实召回质量的判断。",
        "高标准语料保留了大量相似说法和相近数字，就是为了让评测能区分真正命中目标文档的系统与依赖大模型补全的系统。",
        f"因此 {product_code} 这类长文档不应再被压缩成单段说明，否则分块、重排和多跳召回之间的真实差异将被完全抹平。",
      ],
    ),
  ]


#声明构造运维文档加长分节
def build_ops_extended_sections(
  system_code: str,
  maintenance_window: str,
  night_p2_limit: int,
  notify_role: str,
  rollback_strategy: str,
) -> list[str]:
  return [
    build_section(
      "链路排查补录",
      [
        f"{system_code} 的夜间召回故障排查不能只看应用日志，还要同时检查向量库写入时间、倒排索引更新时间和切片重建是否落在 {maintenance_window} 维护窗口附近。",
        "如果仅关键词召回正常而向量召回异常，复盘中必须明确记录 embedding 变更批次与回滚前后的排序差异，不能只写一句向量异常。",
        f"针对连续 {night_p2_limit} 次 P2 缺失的场景，值班记录必须注明通知 {notify_role} 的具体时间点以及升级后采取的隔离动作。",
        f"若回滚策略采用 {rollback_strategy}，则验收时需要确认召回恢复的不只是命中数量，还包括 exact_code 是否重新排到高位。",
        "排查清单还应补记 missingGoldDocumentNames、expectedRecallDocCount 与 actualHitDocCount，避免只描述现象不描述证据缺口。",
      ],
    ),
    build_section(
      "夜间值班对照",
      [
        f"{system_code} 与同族 ORION 文档共用大量值班和告警术语，因此在夜间场景下特别容易把 P1、P2、P3 的处置要求和错误系统编号混在一起。",
        f"高标准评测要求系统不仅答出需要通知 {notify_role}，还要保留连续 {night_p2_limit} 次 P2 缺失这一触发条件，任何省略数字的回答都不算完整。",
        f"维护窗口 {maintenance_window} 只在当前系统编号下成立，相邻编号文档虽然主题接近，但窗口时间、通知角色和回滚策略可能完全不同。",
        f"如果模型只回答先排查检索配置再回滚，而没有明确点出 {rollback_strategy}，通常说明它命中了通用运维说明而没有命中目标 runbook。",
        "因此运维文档既测原则性回答，也测编号、时段、阈值和回滚策略是否能被同时稳定召回。",
      ],
    ),
    build_section(
      "回滚验收要求",
      [
        f"{system_code} 的回滚验收不能只看接口恢复 200 状态，还要确认 second_layer_clause、exact_code 和补充条款是否重新进入高位 chunk。",
        f"若采用 {rollback_strategy} 后答案方向恢复正确，但上下文中仍缺少 gold_document，则这类结果只能记为局部修复，不能算完成整改。",
        "验收记录必须保留回滚前后的 topK 命中文档列表，用来判断问题出在召回层、排序层还是答案整合层。",
        "对于 think_mode 场景，还应验证 visibleContent 与 content 是否按规范分层展示，避免排查过程中把调试信息当成正式答复输出。",
        f"只有当数字阈值、通知角色和回滚方式都与 {system_code} 完全一致时，运维问答样本才应被判定为真正通过。",
      ],
    ),
    build_section(
      "混淆样本说明",
      [
        f"{system_code} 的语料特意保留与采购、制度和事故复盘相近的术语，例如 recall_gap、cleanup_checklist 和 confidence_label，用于放大跨域误召回问题。",
        "最小 RAG 在这类场景中常见的问题不是完全答不出来，而是拿到相似文档后用大模型把答案补得看似通顺，却把关键数字和角色补错。",
        "升级版 RAG 如果增加 exact_code 约束、family hard negative 和结构化重排，应首先在这类多干扰运维文档上看到 context_precision 的提升。",
        f"因此 {system_code} 不是单纯的流程说明，它同时承担长文分块、近邻错召回和多字段聚合三种压力测试职责。",
        "若后续要扩展到更高标准评测，可以继续在该类文档中增加跨窗口时间比较、跨系统角色复用和更多 hard negative 样本。",
      ],
    ),
  ]


#声明构造采购文档加长分节
def build_procurement_extended_sections(
  vendor_code: str,
  coverage_threshold: float,
  approval_low: int,
  approval_high: int,
  penalty_days: int,
  monthly_report: str,
) -> list[str]:
  return [
    build_section(
      "供应商对照矩阵",
      [
        f"{vendor_code} 与相邻供应商文档共享大量采购模板字段，例如 coverage_threshold、整改观察期和 approval range，因此检索时极易出现同族近邻文档上浮。",
        f"如果检索链路只抓住 monthly_recall_coverage_report 这类通用词，而没有抓住 {vendor_code} 与 {monthly_report} 的绑定关系，就容易把阈值 {format_decimal(coverage_threshold)} 写成其他编号的数值。",
        f"合同金额区间 {approval_low} 到 {approval_high} 的审批规则必须与当前供应商文档一起命中，否则模型会倾向复述一段通用采购审批说明而不输出精确边界。",
        "高标准评测会故意追问供应商是否还能自动续约、观察期需要增加几天以及是否缺失 citation_trace_chain，从而同时检验阈值和例外条件。",
        "因此采购文档的价值不在于让模型背模板，而在于验证系统是否能稳定压制同类供应商条款带来的混淆。",
      ],
    ),
    build_section(
      "风控证据补录",
      [
        f"当召回覆盖率连续两个月低于 {format_decimal(coverage_threshold)} 时，复盘中不仅要标记禁止自动续约，还要补充导致失分的具体 gold_document 名称与证据缺口说明。",
        "如果供应商缺失 citation_trace_chain，却仍声称问题只是回答风格偏差，那么评审记录必须将该样本归类为 grounding 失败而不是文案瑕疵。",
        f"对于整改观察期 {penalty_days} 天的场景，需要记录整改起止时间、冻结的续约流程节点以及解除冻结所需的回归验证项。",
        "若供应商同时承担模型与检索职责，则 incident_taxonomy_sheet 也要纳入证据链，否则难以判断问题出在召回侧还是答案生成侧。",
        "这些补录字段用于区分真正的召回退化与表面正确答案，一旦缺失，就会让采购文档上的评分失去解释力。",
      ],
    ),
    build_section(
      "续约冻结样本",
      [
        f"{vendor_code} 的典型错召回场景是模型答出了连续两个月低于阈值会触发风险动作，但没有明确给出 {format_decimal(coverage_threshold)} 这一精确门槛。",
        f"另一类高频问题是把 {approval_low} 到 {approval_high} 的 regional_owner 审批区间错误继承为相邻供应商的配置，导致金额边界看似合理却并不属于目标文档。",
        f"如果整改期被错误回答成不是 {penalty_days} 天，而是其他同族供应商的天数，说明系统拿到的并不是目标供应商的核心 chunk。",
        "在高标准语料中，这类细粒度数字差异比原则性结论更重要，因为它们更能揭示 RAG 是否真正命中了正确来源。",
        "因此续约类问答一旦只给出泛化建议而不给出明确数字，应优先判定为召回或重排问题，而不是让大模型自由补完。",
      ],
    ),
    build_section(
      "高混淆字段提醒",
      [
        f"{vendor_code} 文档同时包含阈值、区间、观察期和报告名称四类容易串线的字段，单靠向量相似度很难保证四者在同一答案中全部正确。",
        "如果系统后续引入结构化事实抽取，应优先抽出 coverage_threshold、approval ranges、penalty_days 和 monthly_report 这几组字段。",
        "若上下文只命中相似采购文档而没有命中目标供应商，即使最终答案方向正确，也最多只能判定为 reviewed_but_not_grounded。",
        "采购类长文对升级版 RAG 的价值在于，它能直接反映 exact_code、hard negative 和 rerank 特征是否真正发挥作用。",
        "因此这类文档必须保留足够长度和足够多的相似字段，不能再退回短模板，否则评测会失去区分度。",
      ],
    ),
  ]


#声明构造制度文档加长分节
def build_policy_extended_sections(
  policy_code: str,
  audit_retention_days: int,
  second_violation_freeze_days: int,
  demo_cleanup_deadline_days: int,
  confidence_rule: str,
) -> list[str]:
  return [
    build_section(
      "制度执行细则",
      [
        f"{policy_code} 的执行重点不只是合规原则，还包括审计日志保留 {audit_retention_days} 天、第二次违规冻结 {second_violation_freeze_days} 天以及演示样本清理 {demo_cleanup_deadline_days} 天这三类离散约束。",
        "如果检索没有命中目标制度文档，模型往往会保留正确的原则结论，却把冻结天数或清理时限错误套用到同族制度上。",
        f"confidence_rule 字段 {confidence_rule} 只在当前制度编号下成立，相邻制度虽然也讨论 high_confidence 和 citation_trace_chain，但适用条件并不完全相同。",
        "高标准评测要求制度问答必须把展示规范、日志保留和处罚时限一起讲清楚，任何只答原则不答数字的结果都不算真正命中。",
        "因此制度文档非常适合检测最小 RAG 是否会在高相似文本中产生貌似正确、实则字段错位的回答。",
      ],
    ),
    build_section(
      "展示与归档补录",
      [
        f"{policy_code} 的复核记录必须明确区分 visibleContent 用于实时思考展示，content 用于正式答案落库，两者一旦混用就构成展示风险。",
        f"如果演示环境样本超过 {demo_cleanup_deadline_days} 天仍未清理，应在审计记录中标记数据污染风险，并暂停将该环境内容纳入正式知识库。",
        f"审计链路需要同时保存 citation_trace_chain、confidence_label 和违规处置节点，否则无法证明 high_confidence 是否符合 {confidence_rule} 这条制度要求。",
        "对于连续违规场景，还应补充冻结开始时间、恢复条件和复核责任人，避免制度条款只留下一个冻结天数字段而缺失执行上下文。",
        "只有当展示层、落库存储和审计归档同时满足制度要求时，合规问答样本才算真正通过。",
      ],
    ),
    build_section(
      "违规升级样本",
      [
        f"{policy_code} 的常见错答模式是正确说出不能随意标记 high_confidence，却漏掉需要遵循 {confidence_rule} 或者把冻结期写错成别的制度天数。",
        f"另一类问题是回答里说演示样本需要及时清理，但没有给出 {demo_cleanup_deadline_days} 天这个硬约束，导致答案看似合理但不可执行。",
        "如果系统只命中通用思考模式文档而没有命中当前制度编号，通常会正确提到 visibleContent 与 content 的分层，却答不对具体处罚周期。",
        "这正是制度文档存在的意义，即通过相近规则和相近术语去压测检索链路是否真正命中了目标制度。",
        "升级版 RAG 若在此类样本中显著提高 recall 与 correctness，才说明其对合规类长文确实有实质改善。",
      ],
    ),
    build_section(
      "术语冲突说明",
      [
        f"{policy_code} 刻意复用了 finance_strict_pack、final_answer_presentation_risk 和 demo_cleanup_checklist 等跨域术语，使制度、产品和运维文档在主题层面高度相似。",
        "如果系统只依赖语义相似度排序，很可能拿到正确主题但错误编号的制度条款，从而在审计天数和冻结周期上发生细微但关键的偏差。",
        "高标准评测不会因为回答提到了合规或审计就判定通过，而是要看这些术语是否和当前制度编号对应的数字与动作一起出现。",
        "因此制度文档必须保持足够篇幅和足够多的相似字段，才能真实放大最小 RAG 与升级版 RAG 的差距。",
        "后续如果继续扩容，可在本类文档中进一步增加跨制度引用链和更复杂的例外条款，以拉高多跳合规问答的难度。",
      ],
    ),
  ]


#声明构造复盘文档加长分节
def build_postmortem_extended_sections(
  incident_code: str,
  old_chunk_size: int,
  new_chunk_size: int,
  overlap_size: int,
  acceptance_recall_target: float,
  missed_clause_family: str,
) -> list[str]:
  return [
    build_section(
      "时间线补录",
      [
        f"{incident_code} 的事故时间线必须清楚记录旧切片配置 chunkSize={old_chunk_size}、overlap={overlap_size} 与新配置 chunkSize={new_chunk_size} 的切换时间点，避免后续评测无法映射到具体实验。",
        f"如果 {missed_clause_family} 的缺失发生在切片重建前后交界时刻，复盘中还要补记旧索引残留时间和新索引生效时间。",
        "高标准评测不是只看整改后答案变长，而是要确认在时间线上哪个步骤真正把 gold_document 拉回到了高位上下文中。",
        "因此时间线记录需要同时包含召回命中变化、排序变化和最终答案变化，不能只保留最终看起来正确的一次实验结果。",
        "只有这样，后续才能把评分下降精确归因到切片配置、重排缺失或答案整合不足中的某一层。",
      ],
    ),
    build_section(
      "实验对照记录",
      [
        f"{incident_code} 的实验对照至少要覆盖旧配置、只调大 chunkSize、同时调大 overlap，以及增加 exact_code rerank 这几组方案，不能只比较整改前后两个快照。",
        "如果答案在旧配置下已经方向正确，但 gold_document 仍未命中，则应判定为 grounding 不足，而不是简单视为模型已经具备稳定能力。",
        f"对照实验必须明确观察 {format_decimal(acceptance_recall_target)} 的验收目标是否达成，同时记录 context_precision 是否因为近邻文档下降而受损。",
        "若 second_layer_clause 一类条款在新配置中恢复命中，却又引入更多无关文档上浮，则说明切片扩大可能改善 recall 但还需要 rerank 去修正 precision。",
        "这类实验记录正是区分最小 RAG 和升级版 RAG 的关键，因为它能解释分数变化背后的检索结构原因。",
      ],
    ),
    build_section(
      "证据缺口校验",
      [
        f"{incident_code} 的复盘模板必须保留 missingGoldDocumentNames、expectedRecallDocCount、actualHitDocCount 和最终引用列表，否则无法量化 {missed_clause_family} 是否真正被修复。",
        "如果最终答案引用了相似文档但没有引用目标制度或目标产品文档，那么即使文本看起来流畅，也不应被计入 fully_grounded 样本。",
        "证据校验阶段还要比较整改前后的 gold_document 排名位置，避免只看有没有命中而忽略命中顺序是否稳定。",
        "对于多跳问题，还要检查 postmortem、policy 和 product 三类文档是否同时进入上下文，否则 answer_correctness 高也可能只是模型凭常识补完。",
        "高标准报告必须把证据缺口显式呈现出来，才能解释为什么有些样本最终答案接近标准答案却仍然被判定为不够可靠。",
      ],
    ),
    build_section(
      "整改后压测要求",
      [
        f"{incident_code} 整改完成后，不应只复测单一问题，而应在包含精确阈值、多跳问答、近邻干扰和思考模式展示规则的整套题集中重新评估。",
        f"如果整改只是把 chunkSize 从 {old_chunk_size} 调到 {new_chunk_size}，却没有同步压测近邻错召回，那么结果仍不足以证明系统已经达到长期可用标准。",
        "真正达标的标志应是 gold_recall_rate、context_precision 和 answer_correctness 一起改善，而不是只让某一个指标偶然上升。",
        "因此 postmortem 文档既是事故记录，也是后续高标准评测的设计依据，用来约束团队不要退回只看表面正确率的低标准测试。",
        "该类长文档必须被保留下来持续复测，因为它最能暴露检索系统在复杂、多来源、长上下文条件下的真实短板。",
      ],
    ),
  ]


#声明构造支撑文档附录
def build_support_appendix(doc_code: str, focus_one: str, focus_two: str, focus_three: str) -> str:
  return (
    build_section(
      "高标准附录",
      [
        f"{doc_code} 在基准集中不只是概念说明，还承担 {focus_one} 的精确检索锚点，因此即使属于支撑文档，也不能只保留一段极短摘要。",
        f"如果系统只命中主题相近的主文档而没有命中 {doc_code}，那么关于 {focus_two} 的规则很容易被错误继承或被大模型自行补完。",
        f"升级版 RAG 需要依靠 exact_code、结构化字段和重排特征，把 {doc_code} 与相似术语文档稳定区分开来。",
        f"评测时除了最终答案是否接近标准答案，还要检查上下文是否真实包含了 {focus_three} 相关证据，否则不能算真正 grounded。",
        "因此支撑文档虽然篇幅小于主文档，但依旧必须保留足够多的干扰术语和判定条件，才能在高标准评测中发挥作用。",
      ],
    )
    + build_section(
      "干扰样本",
      [
        f"{doc_code} 周边文档会共享 finance_strict_pack、second_layer_clause、visibleContent、recall_gap 等高频词，这会显著提升主题层面的相似度。",
        f"如果 topK 过小，系统可能只拿到概念定义，却拿不到 {focus_one} 对应的精确限制，从而让答案只剩泛化原则。",
        f"如果 overlap 过低，关于 {focus_two} 的补充条款可能被拆到相邻 chunk，导致回答遗漏例外条件或关键数字。",
        "高标准评测正是要用这种支撑文档去验证检索系统是否能命中真正需要的证据，而不是只靠生成模型做自然语言补全。",
        "所以这些文档即使不承担最终主规则，也必须和主文档一起被纳入长文、高混淆、多来源的整体语料设计中。",
      ],
    )
  )


#声明构造产品文档
def build_product_document(index: int, variant: int) -> tuple[str, str, dict]:
  product_code = f"NX-{index:03d}-{variant}"
  support_tier = ["standard", "advanced", "flagship"][variant]
  finance_min_citations = 2 + ((index + variant) % 3)
  finance_recall_threshold = 0.77 + index * 0.006 + variant * 0.01
  quarterly_ticket_limit = 4 + variant + (index % 4)
  visibility_retention_days = 30 + variant * 10 + (index % 6)
  approval_role = ["regional_manager", "delivery_director", "finance_reviewer"][(index + variant) % 3]
  doc_name = f"product_{product_code}.md"

  sections = [
    build_section(
      "基本信息",
      [
        f"产品代号为 {product_code}，产品线属于 enterprise_knowledge_assistant。",
        f"支持等级使用 {support_tier} 档位，部署区域默认为 region_{(index % 4) + 1}。",
        f"默认问答链路优先走 mixed_recall_profile_{variant}，再进入 answer_pipeline_{index % 5}。",
        f"当前产品要求 visibleContent 仅展示推理草稿，正式答复必须回写到 content 字段。",
      ],
    ),
    build_section(
      "金融增强约束",
      [
        f"若客户启用 finance_strict_pack，则最终答案至少展示 {finance_min_citations} 条引用。",
        f"若当次引用数量不足 {finance_min_citations} 条，则答案只能标记为 normal_confidence，禁止标记 high_confidence。",
        f"finance_strict_pack 还要求召回覆盖率不低于 {format_decimal(finance_recall_threshold)}，否则要触发专项复盘。",
        f"若监管问答连续两个工作日低于阈值，则审批角色升级为 {approval_role}。",
      ],
    ),
    build_section(
      "工单与升级规则",
      [
        f"若季度内提交工单超过 {quarterly_ticket_limit} 次，续费审批必须升级给 {approval_role}。",
        f"若单次问答命中引用少于金融最低要求，则不能以产品默认模板直接对外发送。",
        f"若当月复盘发现 second_layer_clause 丢失，则要同步检索优化责任人和客户成功负责人。",
        f"对于 regulated_workspace 场景，必须记录 expectedRecallDocCount 与 actualHitDocCount。",
      ],
    ),
    build_section(
      "思考模式与审计",
      [
        f"visibleContent 的实时展示日志保留 {visibility_retention_days} 天，超过后仅保留汇总审计记录。",
        f"content 字段中的正式答案需要关联 citation_bundle_id 和 confidence_label。",
        f"若前端混用 visibleContent 与 content，则会被认定为 final_answer_presentation_risk。",
        f"任何演示环境样本不得混入正式知识库，迁移前必须执行 demo_cleanup_checklist。",
      ],
    ),
    build_section(
      "演练案例",
      [
        f"案例一：在 product_{product_code}_scenario_a 中，因 topK 配置偏低导致监管条款缺失。",
        f"案例二：在 product_{product_code}_scenario_b 中，因 overlap 过小导致 second_layer_clause 被拆散。",
        f"案例三：在 product_{product_code}_scenario_c 中，虽然答案方向正确，但引用数不足仍被降为 normal_confidence。",
        f"案例四：在 product_{product_code}_scenario_d 中，复盘模板补录了 expectedRecallDocCount 与 actualHitDocCount。",
      ],
    ),
    build_section(
      "附录说明",
      [
        f"{product_code} 与同系列相邻版本共享大量通用术语，因此检索时必须优先利用精确代号与阈值字段。",
        f"该文档故意保留多组相似条款，用于区分最小 RAG 与升级版 RAG 在精确召回上的差异。",
        f"如果评测问题只问 general_rule，模型容易答对；如果问 exact_threshold，则非常依赖正确 chunk 命中。",
        f"该产品文档为高标准基准集的一部分，不得再被缩写为单段短说明。",
      ],
    ),
    *build_product_extended_sections(
      product_code,
      support_tier,
      finance_min_citations,
      finance_recall_threshold,
      quarterly_ticket_limit,
      visibility_retention_days,
      approval_role,
    ),
  ]

  content = f"# Product Spec {product_code}\n\n" + "\n".join(sections)
  facts = {
    "doc_type": "product",
    "code": product_code,
    "finance_min_citations": finance_min_citations,
    "finance_recall_threshold": format_decimal(finance_recall_threshold),
    "quarterly_ticket_limit": quarterly_ticket_limit,
    "visibility_retention_days": visibility_retention_days,
    "approval_role": approval_role,
  }
  return f"product_specs/{doc_name}", content, facts


#声明构造运维文档
def build_ops_document(index: int, variant: int) -> tuple[str, str, dict]:
  system_code = f"ORION-{index:03d}-{variant}"
  maintenance_window = f"0{variant + 1}:30-0{variant + 3}:00"
  night_p2_limit = 2 + variant + (index % 3)
  notify_role = ["search_owner", "platform_manager", "incident_commander"][(index + variant) % 3]
  rollback_strategy = ["blue_green", "shadow_restore", "snapshot_restore"][variant]
  doc_name = f"ops_{system_code}.md"

  sections = [
    build_section(
      "系统归属",
      [
        f"系统编号为 {system_code}，负责域为 knowledge_runtime_domain_{index % 5}。",
        f"值班时区统一为 Asia/Shanghai，夜间维护窗口为 {maintenance_window}。",
        f"默认混合召回策略为 hybrid_recall_profile_{variant}，回滚方式采用 {rollback_strategy}。",
        f"若命中 think_mode 场景，则最终对外答案仍以 content 字段为准。",
      ],
    ),
    build_section(
      "故障分级",
      [
        "P1 表示全量用户无法检索知识，必须在 10 分钟内升级。",
        "P2 表示部分租户召回异常，必须在 30 分钟内完成定位。",
        "P3 表示单租户展示异常，必须在 2 小时内恢复。",
        f"若夜间连续出现 {night_p2_limit} 次 P2 级召回缺失，则必须通知 {notify_role}。",
      ],
    ),
    build_section(
      "复盘模板字段",
      [
        "涉及召回不足的复盘模板必须记录 expectedRecallDocCount。",
        "涉及召回不足的复盘模板必须记录 actualHitDocCount。",
        "若发现答案方向正确但证据不足，还要补记 missingGoldDocumentNames。",
        "若发现 second_layer_clause 丢失，还要补记 lostClauseStage 与 rollbackStrategy。",
      ],
    ),
    build_section(
      "排查流程",
      [
        "第一步检查关键词召回与向量召回是否同时异常。",
        "第二步检查最近一次切片重建是否落在夜间批量窗口。",
        f"第三步若仅向量召回异常，则先回退 embedding 配置，再执行 {rollback_strategy}。",
        f"第四步若问题发生在 think_mode，则要确认 visibleContent 与 content 是否被前端混用。",
      ],
    ),
    build_section(
      "演练案例",
      [
        f"案例一：{system_code}_drill_a 因 overlap 过低导致条款被拆散。",
        f"案例二：{system_code}_drill_b 因 topK 过小导致补充条款未命中。",
        f"案例三：{system_code}_drill_c 虽然命中同类文档，但 exact_code 不匹配。",
        f"案例四：{system_code}_drill_d 通过补录 expectedRecallDocCount 与 actualHitDocCount 完成复盘。",
      ],
    ),
    build_section(
      "附录说明",
      [
        f"{system_code} 与同族 ORION 文档共享大量流程术语，评测时极易出现近邻错召回。",
        "该文档特意保留与采购、制度、事故复盘相似的词汇，以放大最小 RAG 的误召回问题。",
        "若升级版 RAG 增加 rerank 或 exact_code 约束，这类文档应显著改善。",
        "本手册用于长期高标准基准测试，不得再退回短文本实验版本。",
      ],
    ),
    *build_ops_extended_sections(
      system_code,
      maintenance_window,
      night_p2_limit,
      notify_role,
      rollback_strategy,
    ),
  ]

  content = f"# Ops Runbook {system_code}\n\n" + "\n".join(sections)
  facts = {
    "doc_type": "ops",
    "code": system_code,
    "maintenance_window": maintenance_window,
    "night_p2_limit": night_p2_limit,
    "notify_role": notify_role,
    "rollback_strategy": rollback_strategy,
  }
  return f"ops_manuals/{doc_name}", content, facts


#声明构造采购文档
def build_procurement_document(index: int, variant: int) -> tuple[str, str, dict]:
  vendor_code = f"SUP-{index:03d}-{variant}"
  coverage_threshold = 0.80 + index * 0.005 + variant * 0.01
  approval_low = 60 + index * 4
  approval_high = 130 + index * 5
  penalty_days = 5 + variant + (index % 4)
  monthly_report = f"monthly_recall_coverage_report_v{variant + 1}"
  doc_name = f"vendor_{vendor_code}.md"

  sections = [
    build_section(
      "供应商信息",
      [
        f"供应商编号为 {vendor_code}，服务范围覆盖 llm_service、embedding_service、retrieval_service。",
        f"双职责供应商必须按月提交 {monthly_report}。",
        f"若同时承担模型与检索职责，还要附带 incident_taxonomy_sheet_{index % 6}。",
        f"审计周期统一走 cycle_{variant + 1}，但处罚阈值以本文件为准。",
      ],
    ),
    build_section(
      "质量阈值",
      [
        f"月度召回覆盖率若连续两个月低于 {format_decimal(coverage_threshold)}，则禁止自动续约。",
        f"若事实性错误投诉连续三个工单周期上升，则要追加 {penalty_days} 天整改观察期。",
        "若问答结果高频出现幻觉，供应商必须提供完整 citation_trace_chain。",
        "若 rerank 服务缺失 exact_code 能力，则不得宣称达到 production_grade_recall。",
      ],
    ),
    build_section(
      "付款审批",
      [
        f"合同金额低于 {approval_low} 万，由 department_owner 审批。",
        f"合同金额位于 {approval_low} 万至 {approval_high} 万之间，由 regional_owner 审批。",
        f"合同金额高于 {approval_high} 万，则升级到 procurement_committee 审批。",
        "若供应商本月存在召回覆盖率红线，则即便金额未超阈值也要补充风险说明。",
      ],
    ),
    build_section(
      "异常处置",
      [
        "若供应商未按月提交召回覆盖率报告，则暂停新需求接入。",
        "若供应商提供的证据链无法映射到 gold_document，则视为高风险缺陷。",
        "若供应商只提供通用问答正确率而不提供精确召回指标，则评审直接降级。",
        f"若整改期内仍未恢复阈值，则继续延长 {penalty_days} 天并冻结续约流程。",
      ],
    ),
    build_section(
      "演练案例",
      [
        f"案例一：{vendor_code}_review_a 通过 monthly_recall_coverage_report 修正错召回问题。",
        f"案例二：{vendor_code}_review_b 因缺失 citation_trace_chain 被判为高风险。",
        f"案例三：{vendor_code}_review_c 在 exact_code 召回上弱于升级版 RAG。",
        f"案例四：{vendor_code}_review_d 因阈值低于 {format_decimal(coverage_threshold)} 被暂停续约。",
      ],
    ),
    build_section(
      "附录说明",
      [
        f"{vendor_code} 与相邻编号供应商共享大量相似条款，适合压测错召回与同类模板干扰。",
        "采购文档中的阈值、审批区间、整改天数都被设计成高混淆字段。",
        "如果最小 RAG 只依赖关键词和向量混合，通常会命中同族近邻而不是目标供应商。",
        "该文档为长期高标准评测集的一部分，必须保留精确数字差异。",
      ],
    ),
    *build_procurement_extended_sections(
      vendor_code,
      coverage_threshold,
      approval_low,
      approval_high,
      penalty_days,
      monthly_report,
    ),
  ]

  content = f"# Procurement Guide {vendor_code}\n\n" + "\n".join(sections)
  facts = {
    "doc_type": "procurement",
    "code": vendor_code,
    "coverage_threshold": format_decimal(coverage_threshold),
    "approval_low": approval_low,
    "approval_high": approval_high,
    "penalty_days": penalty_days,
    "monthly_report": monthly_report,
  }
  return f"procurement/{doc_name}", content, facts


#声明构造制度文档
def build_policy_document(index: int, variant: int) -> tuple[str, str, dict]:
  policy_code = f"POL-{index:03d}-{variant}"
  audit_retention_days = 180 + index + variant * 10
  second_violation_freeze_days = 7 + (index % 5) + variant
  demo_cleanup_deadline_days = 2 + variant + (index % 4)
  confidence_rule = ["no_high_confidence_without_enough_citations", "normal_confidence_only_under_finance_pack"][variant % 2]
  doc_name = f"policy_{policy_code}.md"

  sections = [
    build_section(
      "基础要求",
      [
        f"制度编号为 {policy_code}，审计访问日志至少保留 {audit_retention_days} 天。",
        f"演示环境样本文档迁移前必须在 {demo_cleanup_deadline_days} 天内完成 demo_cleanup_checklist。",
        "任何样本文档不得混入正式知识库，否则视为 production_knowledge_pollution。",
        "若启用思考模式，对外展示必须区分 visibleContent 与 content。",
      ],
    ),
    build_section(
      "置信度规则",
      [
        "若答案引用数不足最低要求，则不得标注 high_confidence。",
        f"本制度当前执行规则为 {confidence_rule}。",
        "若金融行业客户命中引用不足，则只能标记 normal_confidence。",
        "若引用正确但 gold_document 缺失，也不得向用户宣称 fully_grounded。",
      ],
    ),
    build_section(
      "处罚规则",
      [
        "首次违规采用书面提醒。",
        f"第二次违规冻结演示环境权限 {second_violation_freeze_days} 天。",
        "第三次违规上报 compliance_owner 并停止发布。",
        "若违规同时造成错误召回外发，则需补充一次专项复盘。",
      ],
    ),
    build_section(
      "补充说明",
      [
        "制度文档故意保留大量相似表达，以压测策略升级前后的 exact_code 命中能力。",
        "若模型只答出原则但没命中目标制度，answer_correctness 仍会显著下降。",
        "若召回命中了相邻制度但日期或天数错误，则属于高混淆错召回。",
        "该文件用于长期高标准评测，因此保留精确天数与清理时限字段。",
      ],
    ),
    build_section(
      "演练案例",
      [
        f"案例一：{policy_code}_case_a 因未区分 visibleContent 与 content 被判为展示违规。",
        f"案例二：{policy_code}_case_b 因 demo_cleanup_checklist 超期而冻结权限。",
        f"案例三：{policy_code}_case_c 因 high_confidence 标注错误被要求回滚发布。",
        f"案例四：{policy_code}_case_d 通过补充 citation_trace_chain 完成合规整改。",
      ],
    ),
    *build_policy_extended_sections(
      policy_code,
      audit_retention_days,
      second_violation_freeze_days,
      demo_cleanup_deadline_days,
      confidence_rule,
    ),
  ]

  content = f"# Policy Standard {policy_code}\n\n" + "\n".join(sections)
  facts = {
    "doc_type": "policy",
    "code": policy_code,
    "audit_retention_days": audit_retention_days,
    "second_violation_freeze_days": second_violation_freeze_days,
    "demo_cleanup_deadline_days": demo_cleanup_deadline_days,
    "confidence_rule": confidence_rule,
  }
  return f"policies/{doc_name}", content, facts


#声明构造复盘文档
def build_postmortem_document(index: int, variant: int) -> tuple[str, str, dict]:
  incident_code = f"INC-{index:03d}-{variant}"
  old_chunk_size = 260 + index * 10 + variant * 20
  new_chunk_size = old_chunk_size + 140
  overlap_size = 60 + variant * 20
  acceptance_recall_target = 0.84 + index * 0.004 + variant * 0.01
  missed_clause_family = ["second_layer_clause", "confidence_rule_clause", "cleanup_deadline_clause"][variant]
  doc_name = f"postmortem_{incident_code}.md"

  sections = [
    build_section(
      "事故摘要",
      [
        f"事故编号为 {incident_code}，核心问题是 {missed_clause_family} 在召回链路中被遗漏。",
        f"事故前切片配置使用 chunkSize={old_chunk_size} 与 overlap={overlap_size}。",
        f"事故后切片配置调整为 chunkSize={new_chunk_size} 与 overlap={overlap_size + 20}。",
        "根因不是答案模型完全不会答，而是命中了同类近邻文档却没命中 gold_document。",
      ],
    ),
    build_section(
      "证据链分析",
      [
        "复盘确认关键词召回与向量召回都拿到了相似文档，但 exact_code 排序不足。",
        "复盘确认 second_layer_clause 由于被拆散到相邻 chunk，导致最小 RAG 更容易漏掉。",
        "复盘确认高相似模板文档造成了数字阈值与制度天数混淆。",
        "复盘明确要求后续评测必须同时看 answer_correctness 与 gold_recall_rate。",
      ],
    ),
    build_section(
      "整改动作",
      [
        f"动作一：将 chunkSize 从 {old_chunk_size} 调整到 {new_chunk_size}。",
        f"动作二：将 overlap 提升到 {overlap_size + 20}，减少条款被拆散的概率。",
        "动作三：增加 exact_code rerank 特征，抑制同族近邻文档错误上浮。",
        "动作四：对高混淆阈值字段增加 structured_fact_extractor。",
      ],
    ),
    build_section(
      "验收标准",
      [
        f"验收目标一：gold_recall_rate 不低于 {format_decimal(acceptance_recall_target)}。",
        "验收目标二：answer_correctness 必须高于上一轮最小 RAG 基线。",
        "验收目标三：对于金融行业问答，引用数量与置信度标注必须一致。",
        "验收目标四：所有复盘场景都要明确记录 expectedRecallDocCount 与 actualHitDocCount。",
      ],
    ),
    build_section(
      "演练案例",
      [
        f"案例一：{incident_code}_trial_a 命中同类文档但未命中目标制度，导致 answer_correctness 降低。",
        f"案例二：{incident_code}_trial_b 调整 chunkSize 与 overlap 后恢复 second_layer_clause 命中。",
        f"案例三：{incident_code}_trial_c 加入 exact_code rerank 后压制了相邻编号错召回。",
        f"案例四：{incident_code}_trial_d 用高标准问答集验证整改是否真正生效。",
      ],
    ),
    *build_postmortem_extended_sections(
      incident_code,
      old_chunk_size,
      new_chunk_size,
      overlap_size,
      acceptance_recall_target,
      missed_clause_family,
    ),
  ]

  content = f"# Postmortem {incident_code}\n\n" + "\n".join(sections)
  facts = {
    "doc_type": "postmortem",
    "code": incident_code,
    "old_chunk_size": old_chunk_size,
    "new_chunk_size": new_chunk_size,
    "overlap_size": overlap_size,
    "acceptance_recall_target": format_decimal(acceptance_recall_target),
    "missed_clause_family": missed_clause_family,
  }
  return f"postmortems/{doc_name}", content, facts


#声明构造跨文档规则
def build_cross_reference_documents() -> list[tuple[str, str, dict]]:
  return [
    (
      "cross_refs/strategy_aurora.md",
      "# Retrieval Strategy Aurora\n\n"
      + build_section(
        "默认策略",
        [
          "Aurora 采用关键词召回与向量召回混合模式。",
          "Aurora 的默认知识问答 topK 是 5。",
          "工作台链路为了控制上下文长度，通常把 topK 降为 4。",
          "Aurora 在多文档聚合场景最容易丢失 second_layer_clause。",
        ],
      )
      + build_section(
        "评测说明",
        [
          "如果问题依赖精确编号、阈值或处罚天数，Aurora 更容易被同族近邻文档干扰。",
          "升级版 RAG 的核心目标不是回答更长，而是命中真正 gold_document。",
          "因此高标准评测必须同时观察 gold_recall_rate、context_precision 与 answer_correctness。",
          "Aurora 的表现通常足以回答原则问题，但精细阈值问题更容易失分。",
        ],
      )
      + build_support_appendix(
        "strategy_aurora",
        "topK 与 exact_code 召回",
        "second_layer_clause 的漏召回路径",
        "gold_recall_rate",
      ),
      {
        "doc_type": "cross_ref",
        "code": "strategy_aurora",
        "default_topk": 5,
        "workspace_topk": 4,
        "weakness": "second_layer_clause",
      },
    ),
    (
      "cross_refs/finance_strict_pack.md",
      "# Finance Strict Pack\n\n"
      + build_section(
        "行业附加约束",
        [
          "金融行业问答必须同时满足最低引用数、普通置信度回退和召回缺口记录三项要求。",
          "若引用数量不足产品文档规定的最低值，则只能标记 normal_confidence。",
          "若召回文档数少于应召回文档总数的一半，则必须记录 recall_gap。",
          "若 exact_code 未命中，即使答案方向正确也不能视为 fully_grounded。",
        ],
      )
      + build_support_appendix(
        "finance_strict_pack",
        "最低引用数与召回缺口判定",
        "置信度回退规则",
        "fully_grounded 的判定条件",
      ),
      {
        "doc_type": "cross_ref",
        "code": "finance_strict_pack",
      },
    ),
    (
      "cross_refs/thinking_mode_guideline.md",
      "# Thinking Mode Guideline\n\n"
      + build_section(
        "展示规范",
        [
          "visibleContent 只用于实时展示推理过程。",
          "content 只用于持久化最终正式答案。",
          "若前端把 visibleContent 当成 content 对外展示，则会造成 final_answer_presentation_risk。",
          "所有思考模式问答都需要补充审计日志关联字段。",
        ],
      )
      + build_support_appendix(
        "thinking_mode_guideline",
        "思考模式展示边界",
        "visibleContent 与 content 的职责切分",
        "展示违规的审计证据",
      ),
      {
        "doc_type": "cross_ref",
        "code": "thinking_mode_guideline",
      },
    ),
    (
      "cross_refs/retrieval_tuning_playbook.md",
      "# Retrieval Tuning Playbook\n\n"
      + build_section(
        "推荐动作",
        [
          "若 second_layer_clause 经常丢失，应优先增大 chunkSize 并提高 overlap。",
          "若 exact_code 召回经常错误，应增加编号特征 rerank。",
          "若制度天数与阈值频繁混淆，应提取 structured_fact_extractor。",
          "若同族近邻过强，应追加 family_level_hard_negative 训练样本。",
        ],
      )
      + build_support_appendix(
        "retrieval_tuning_playbook",
        "切片与重排调优动作",
        "高混淆字段的补救策略",
        "structured_fact_extractor 的触发场景",
      ),
      {
        "doc_type": "cross_ref",
        "code": "retrieval_tuning_playbook",
      },
    ),
    (
      "cross_refs/confidence_labelling_standard.md",
      "# Confidence Labelling Standard\n\n"
      + build_section(
        "标注规则",
        [
          "若引用数量不足最低要求，则不得使用 high_confidence。",
          "若仅命中相似文档但未命中 gold_document，则最高只能标记 reviewed_but_not_grounded。",
          "若引用与答案方向一致但证据不完整，则只能标记 normal_confidence。",
          "若金融行业场景缺少关键条款，则必须补记 recall_gap。",
        ],
      )
      + build_support_appendix(
        "confidence_labelling_standard",
        "置信度标注边界",
        "reviewed_but_not_grounded 的适用场景",
        "recall_gap 与 grounding 的对应关系",
      ),
      {
        "doc_type": "cross_ref",
        "code": "confidence_labelling_standard",
      },
    ),
    (
      "cross_refs/workspace_chain_overview.md",
      "# Workspace Chain Overview\n\n"
      + build_section(
        "链路摘要",
        [
          "handleSend 进入 sendMessage 后，会检查 activeConversation，不存在则创建会话。",
          "知识问答层默认走 workspace/chat/stream 完成事件，Aurora 默认 topK 为 5。",
          "工作台链路为了减少上下文长度，通常把知识检索 topK 固定为 4。",
          "流式阶段的 visibleContent 与最终 content 在展示层必须严格区分。",
        ],
      )
      + build_support_appendix(
        "workspace_chain_overview",
        "工作台问答链路锚点",
        "流式展示与正式落库的分层",
        "topK 缩减对上下文完整性的影响",
      ),
      {
        "doc_type": "cross_ref",
        "code": "workspace_chain_overview",
      },
    ),
  ]


#声明构造问答集
def build_eval_dataset(metadata_by_name: dict[str, dict]) -> list[dict]:
  questions: list[dict] = []

  product_a = metadata_by_name["product_NX-003-1.md"]
  product_b = metadata_by_name["product_NX-011-2.md"]
  ops_a = metadata_by_name["ops_ORION-006-1.md"]
  ops_b = metadata_by_name["ops_ORION-002-0.md"]
  procurement_a = metadata_by_name["vendor_SUP-008-2.md"]
  procurement_b = metadata_by_name["vendor_SUP-012-1.md"]
  policy_a = metadata_by_name["policy_POL-010-0.md"]
  policy_b = metadata_by_name["policy_POL-005-2.md"]
  postmortem_a = metadata_by_name["postmortem_INC-007-1.md"]
  postmortem_b = metadata_by_name["postmortem_INC-011-2.md"]
  product_c = metadata_by_name["product_NX-014-0.md"]
  procurement_c = metadata_by_name["vendor_SUP-014-0.md"]
  policy_c = metadata_by_name["policy_POL-014-1.md"]
  ops_c = metadata_by_name["ops_ORION-013-2.md"]
  postmortem_c = metadata_by_name["postmortem_INC-003-2.md"]
  product_d = metadata_by_name["product_NX-006-0.md"]
  procurement_d = metadata_by_name["vendor_SUP-004-1.md"]
  policy_d = metadata_by_name["policy_POL-002-1.md"]
  postmortem_d = metadata_by_name["postmortem_INC-014-0.md"]
  ops_d = metadata_by_name["ops_ORION-009-0.md"]
  product_e = metadata_by_name["product_NX-015-2.md"]
  procurement_e = metadata_by_name["vendor_SUP-015-2.md"]
  policy_e = metadata_by_name["policy_POL-015-0.md"]
  postmortem_e = metadata_by_name["postmortem_INC-015-1.md"]

  questions.append(
    {
      "question_id": "q01",
      "question": f"产品 {product_a['code']} 在 finance_strict_pack 下最少要展示几条引用，引用不足时应标成什么置信度？",
      "reference_answer": f"产品 {product_a['code']} 在 finance_strict_pack 下最少要展示 {product_a['finance_min_citations']} 条引用。若引用不足 {product_a['finance_min_citations']} 条，则只能标记为 normal_confidence。",
      "gold_document_names": ["product_NX-003-1.md", "finance_strict_pack.md", "confidence_labelling_standard.md"],
      "difficulty": "multi_hop_finance",
    }
  )
  questions.append(
    {
      "question_id": "q02",
      "question": f"产品 {product_b['code']} 如果季度工单超过多少次需要升级审批，升级给谁？",
      "reference_answer": f"产品 {product_b['code']} 若季度工单超过 {product_b['quarterly_ticket_limit']} 次，审批必须升级给 {product_b['approval_role']}。",
      "gold_document_names": ["product_NX-011-2.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q03",
      "question": f"运维手册 {ops_a['code']} 规定夜间连续出现多少次 P2 召回缺失要通知谁？",
      "reference_answer": f"运维手册 {ops_a['code']} 规定夜间连续出现 {ops_a['night_p2_limit']} 次 P2 召回缺失时，必须通知 {ops_a['notify_role']}。",
      "gold_document_names": ["ops_ORION-006-1.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q04",
      "question": f"运维手册 {ops_b['code']} 里，涉及召回不足的复盘模板至少要记录哪两个字段？",
      "reference_answer": f"运维手册 {ops_b['code']} 规定，涉及召回不足的复盘模板至少要记录 expectedRecallDocCount 和 actualHitDocCount。",
      "gold_document_names": ["ops_ORION-002-0.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q05",
      "question": f"供应商 {procurement_a['code']} 连续两个月低于什么召回覆盖率阈值会被禁止自动续约？",
      "reference_answer": f"供应商 {procurement_a['code']} 若连续两个月低于 {procurement_a['coverage_threshold']} 的召回覆盖率阈值，就会被禁止自动续约。",
      "gold_document_names": ["vendor_SUP-008-2.md"],
      "difficulty": "single_doc_threshold",
    }
  )
  questions.append(
    {
      "question_id": "q06",
      "question": f"供应商 {procurement_b['code']} 的合同金额在什么区间由 regional_owner 审批？",
      "reference_answer": f"供应商 {procurement_b['code']} 的合同金额位于 {procurement_b['approval_low']} 万至 {procurement_b['approval_high']} 万之间时，由 regional_owner 审批。",
      "gold_document_names": ["vendor_SUP-012-1.md"],
      "difficulty": "single_doc_range",
    }
  )
  questions.append(
    {
      "question_id": "q07",
      "question": f"制度 {policy_a['code']} 规定第二次违规冻结多少天，以及样本文档迁移前要在几天内完成清理？",
      "reference_answer": f"制度 {policy_a['code']} 规定第二次违规冻结 {policy_a['second_violation_freeze_days']} 天，样本文档迁移前要在 {policy_a['demo_cleanup_deadline_days']} 天内完成清理。",
      "gold_document_names": ["policy_POL-010-0.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q08",
      "question": f"制度 {policy_b['code']} 要求审计日志至少保留多少天，引用不足时又禁止什么置信度标注？",
      "reference_answer": f"制度 {policy_b['code']} 要求审计日志至少保留 {policy_b['audit_retention_days']} 天。若引用不足最低要求，则禁止标注 high_confidence。",
      "gold_document_names": ["policy_POL-005-2.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q09",
      "question": f"事故复盘 {postmortem_a['code']} 把 chunkSize 从多少调到多少，主要为了解决哪类条款丢失？",
      "reference_answer": f"事故复盘 {postmortem_a['code']} 把 chunkSize 从 {postmortem_a['old_chunk_size']} 调到 {postmortem_a['new_chunk_size']}，主要为了解决 {postmortem_a['missed_clause_family']} 的丢失问题。",
      "gold_document_names": ["postmortem_INC-007-1.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q10",
      "question": f"事故复盘 {postmortem_b['code']} 的验收 gold_recall_rate 目标是多少，它又要求记录哪两个召回计数字段？",
      "reference_answer": f"事故复盘 {postmortem_b['code']} 的验收 gold_recall_rate 目标是 {postmortem_b['acceptance_recall_target']}，同时要求记录 expectedRecallDocCount 和 actualHitDocCount。",
      "gold_document_names": ["postmortem_INC-011-2.md", "ops_ORION-002-0.md"],
      "difficulty": "multi_hop_postmortem",
    }
  )
  questions.append(
    {
      "question_id": "q11",
      "question": "Aurora 默认知识问答 topK 和工作台链路常用 topK 分别是多少？",
      "reference_answer": "Aurora 默认知识问答 topK 是 5，工作台链路常用 topK 是 4。",
      "gold_document_names": ["strategy_aurora.md", "workspace_chain_overview.md"],
      "difficulty": "implementation_gap",
    }
  )
  questions.append(
    {
      "question_id": "q12",
      "question": "thinking mode 下 visibleContent 和 content 各自负责什么，为什么不能混用？",
      "reference_answer": "visibleContent 负责实时展示推理过程，content 负责持久化最终正式答案。两者不能混用，否则会造成 final_answer_presentation_risk，让用户把推理草稿误当最终结论。",
      "gold_document_names": ["thinking_mode_guideline.md"],
      "difficulty": "core_concept",
    }
  )
  questions.append(
    {
      "question_id": "q13",
      "question": f"产品 {product_c['code']} 的金融召回覆盖率阈值是多少，这个阈值和供应商 {procurement_c['code']} 的续约阈值哪个更高？",
      "reference_answer": f"产品 {product_c['code']} 的金融召回覆盖率阈值是 {product_c['finance_recall_threshold']}，供应商 {procurement_c['code']} 的续约阈值是 {procurement_c['coverage_threshold']}。两者相比，更高的是产品 {product_c['code']} 的阈值。",
      "gold_document_names": ["product_NX-014-0.md", "vendor_SUP-014-0.md"],
      "difficulty": "compare_threshold",
    }
  )
  questions.append(
    {
      "question_id": "q14",
      "question": f"制度 {policy_c['code']} 的第二次违规冻结天数是多少，这个天数和产品 {product_c['code']} 的 visibleContent 保留天数相比哪个更长？",
      "reference_answer": f"制度 {policy_c['code']} 的第二次违规冻结天数是 {policy_c['second_violation_freeze_days']} 天。产品 {product_c['code']} 的 visibleContent 保留 {product_c['visibility_retention_days']} 天，后者更长。",
      "gold_document_names": ["policy_POL-014-1.md", "product_NX-014-0.md"],
      "difficulty": "compare_duration",
    }
  )
  questions.append(
    {
      "question_id": "q15",
      "question": f"运维手册 {ops_c['code']} 的维护窗口是什么，若只发生向量召回异常应执行哪种回滚方式？",
      "reference_answer": f"运维手册 {ops_c['code']} 的维护窗口是 {ops_c['maintenance_window']}。若只发生向量召回异常，应执行 {ops_c['rollback_strategy']}。",
      "gold_document_names": ["ops_ORION-013-2.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q16",
      "question": f"事故复盘 {postmortem_c['code']} 为抑制 exact_code 错召回采取了哪两项整改动作？",
      "reference_answer": f"事故复盘 {postmortem_c['code']} 采取了两项关键整改动作：一是把 chunkSize 从 {postmortem_c['old_chunk_size']} 调整到 {postmortem_c['new_chunk_size']} 并提高 overlap，二是增加 exact_code rerank 特征。",
      "gold_document_names": ["postmortem_INC-003-2.md", "retrieval_tuning_playbook.md"],
      "difficulty": "multi_hop_postmortem",
    }
  )
  questions.append(
    {
      "question_id": "q17",
      "question": f"产品 {product_d['code']} 在 regulated_workspace 场景下要求记录哪两个召回计数字段，这个要求和哪类运维文档规则一致？",
      "reference_answer": f"产品 {product_d['code']} 在 regulated_workspace 场景下要求记录 expectedRecallDocCount 和 actualHitDocCount，这与运维手册中的召回不足复盘模板规则一致。",
      "gold_document_names": ["product_NX-006-0.md", "ops_ORION-002-0.md"],
      "difficulty": "multi_hop_recall_gap",
    }
  )
  questions.append(
    {
      "question_id": "q18",
      "question": f"供应商 {procurement_d['code']} 的双职责月报名称是什么，如果证据链映射不到 gold_document 会被视为什么风险？",
      "reference_answer": f"供应商 {procurement_d['code']} 的双职责月报名称是 {procurement_d['monthly_report']}。如果证据链映射不到 gold_document，会被视为高风险缺陷。",
      "gold_document_names": ["vendor_SUP-004-1.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q19",
      "question": f"制度 {policy_d['code']} 要求样本文档迁移前几天内完成清理，这个要求是为了避免什么？",
      "reference_answer": f"制度 {policy_d['code']} 要求样本文档迁移前在 {policy_d['demo_cleanup_deadline_days']} 天内完成清理，这是为了避免 production_knowledge_pollution，也就是测试样本污染正式知识库。",
      "gold_document_names": ["policy_POL-002-1.md"],
      "difficulty": "single_doc_policy",
    }
  )
  questions.append(
    {
      "question_id": "q20",
      "question": f"事故复盘 {postmortem_d['code']} 说明最小 RAG 的根因不是模型完全不会答，而是什么？",
      "reference_answer": f"事故复盘 {postmortem_d['code']} 说明，最小 RAG 的根因不是模型完全不会答，而是命中了同类近邻文档却没有命中真正的 gold_document。",
      "gold_document_names": ["postmortem_INC-014-0.md"],
      "difficulty": "single_doc_postmortem",
    }
  )
  questions.append(
    {
      "question_id": "q21",
      "question": f"运维手册 {ops_d['code']} 说如果问题发生在 think_mode，需要额外确认什么前端风险？",
      "reference_answer": f"运维手册 {ops_d['code']} 要求在 think_mode 问题中额外确认 visibleContent 与 content 是否被前端混用，也就是 final_answer_presentation_risk。",
      "gold_document_names": ["ops_ORION-009-0.md", "thinking_mode_guideline.md"],
      "difficulty": "multi_hop_thinking_mode",
    }
  )
  questions.append(
    {
      "question_id": "q22",
      "question": f"产品 {product_e['code']} 的引用最低要求是多少，如果监管问答连续低于阈值要升级给谁？",
      "reference_answer": f"产品 {product_e['code']} 的引用最低要求是 {product_e['finance_min_citations']} 条。如果监管问答连续低于阈值，则审批角色升级给 {product_e['approval_role']}。",
      "gold_document_names": ["product_NX-015-2.md"],
      "difficulty": "single_doc_exact",
    }
  )
  questions.append(
    {
      "question_id": "q23",
      "question": f"供应商 {procurement_e['code']} 低于阈值后会先进入多少天整改观察期，这个阈值本身是多少？",
      "reference_answer": f"供应商 {procurement_e['code']} 若低于 {procurement_e['coverage_threshold']} 的阈值，会先进入 {procurement_e['penalty_days']} 天整改观察期。",
      "gold_document_names": ["vendor_SUP-015-2.md"],
      "difficulty": "single_doc_threshold",
    }
  )
  questions.append(
    {
      "question_id": "q24",
      "question": f"制度 {policy_e['code']} 的审计日志保留天数是多少，若答案引用不足最低要求又禁止哪种置信度？",
      "reference_answer": f"制度 {policy_e['code']} 的审计日志保留 {policy_e['audit_retention_days']} 天。若答案引用不足最低要求，则禁止标注 high_confidence。",
      "gold_document_names": ["policy_POL-015-0.md", "confidence_labelling_standard.md"],
      "difficulty": "multi_hop_policy_confidence",
    }
  )
  questions.append(
    {
      "question_id": "q25",
      "question": f"事故复盘 {postmortem_e['code']} 的验收目标 gold_recall_rate 是多少，同时它要解决哪类条款丢失？",
      "reference_answer": f"事故复盘 {postmortem_e['code']} 的验收目标 gold_recall_rate 是 {postmortem_e['acceptance_recall_target']}，同时它要解决 {postmortem_e['missed_clause_family']} 的丢失问题。",
      "gold_document_names": ["postmortem_INC-015-1.md"],
      "difficulty": "single_doc_postmortem",
    }
  )
  questions.append(
    {
      "question_id": "q26",
      "question": "当金融行业问答引用数不够且召回文档不到应召回一半时，需要同时做哪两类处理？",
      "reference_answer": "当金融行业问答引用数不够时，答案只能标记 normal_confidence；当召回文档不到应召回一半时，还必须记录 recall_gap。",
      "gold_document_names": ["finance_strict_pack.md", "confidence_labelling_standard.md"],
      "difficulty": "multi_hop_finance",
    }
  )
  questions.append(
    {
      "question_id": "q27",
      "question": "如果答案只命中相似文档而没有命中 gold_document，置信度标准允许标记为什么？",
      "reference_answer": "如果答案只命中相似文档而没有命中 gold_document，最高只能标记为 reviewed_but_not_grounded。",
      "gold_document_names": ["confidence_labelling_standard.md"],
      "difficulty": "single_doc_confidence",
    }
  )
  questions.append(
    {
      "question_id": "q28",
      "question": "高标准检索调优手册建议在 second_layer_clause 经常丢失时优先做哪两件事？",
      "reference_answer": "高标准检索调优手册建议在 second_layer_clause 经常丢失时优先增大 chunkSize，并提高 overlap。",
      "gold_document_names": ["retrieval_tuning_playbook.md"],
      "difficulty": "single_doc_tuning",
    }
  )
  questions.append(
    {
      "question_id": "q29",
      "question": "高标准检索调优手册建议在 exact_code 召回经常错误时加入什么特征，在制度天数混淆时又加入什么提取器？",
      "reference_answer": "在 exact_code 召回经常错误时，应加入编号特征 rerank；在制度天数混淆时，应加入 structured_fact_extractor。",
      "gold_document_names": ["retrieval_tuning_playbook.md"],
      "difficulty": "single_doc_tuning",
    }
  )
  questions.append(
    {
      "question_id": "q30",
      "question": "为什么高标准评测不能再退回短文本实验版本？",
      "reference_answer": "因为短文本实验版本的文档太短、chunk 太少，无法充分暴露 exact_code 错召回、同族近邻干扰、second_layer_clause 丢失和制度阈值混淆等问题，所以高标准评测必须保留长文档、大 chunk 量和高混淆字段。",
      "gold_document_names": ["product_NX-003-1.md", "ops_ORION-006-1.md", "vendor_SUP-008-2.md", "policy_POL-010-0.md", "postmortem_INC-007-1.md"],
      "difficulty": "benchmark_principle",
    }
  )

  return questions


#声明构造文档清单
def build_documents() -> tuple[list[dict], dict[str, dict]]:
  documents: list[dict] = []
  metadata_by_name: dict[str, dict] = {}

  for index in range(1, 16):
    for variant in range(3):
      for builder in [
        build_product_document,
        build_ops_document,
        build_procurement_document,
        build_policy_document,
        build_postmortem_document,
      ]:
        relative_path, content, facts = builder(index, variant)
        write_text_file(OUTPUT_DIR / relative_path, content)
        document = {
          "relative_path": relative_path,
          "name": Path(relative_path).name,
          "char_count": len(content),
          "facts": facts,
        }
        documents.append(document)
        metadata_by_name[document["name"]] = facts

  for relative_path, content, facts in build_cross_reference_documents():
    write_text_file(OUTPUT_DIR / relative_path, content)
    document = {
      "relative_path": relative_path,
      "name": Path(relative_path).name,
      "char_count": len(content),
      "facts": facts,
    }
    documents.append(document)
    metadata_by_name[document["name"]] = facts

  return documents, metadata_by_name


#声明执行主流程
def main() -> None:
  if OUTPUT_DIR.exists():
    shutil.rmtree(OUTPUT_DIR)
  OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

  documents, metadata_by_name = build_documents()
  questions = build_eval_dataset(metadata_by_name)
  char_counts = [item["char_count"] for item in documents]

  manifest = {
    "document_count": len(documents),
    "char_min": min(char_counts),
    "char_max": max(char_counts),
    "char_avg": round(sum(char_counts) / len(char_counts), 2),
    "documents": documents,
  }
  MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

  dataset = {
    "knowledge_base_name": "Ragas High Standard Corpus",
    "knowledge_base_description": "长期高标准 RAG 评测语料，用于区分最小 RAG 与升级版 RAG 的真实差距",
    "document_count": len(documents),
    "question_count": len(questions),
    "documents": [{"relative_path": item["relative_path"], "name": item["name"]} for item in documents],
    "questions": questions,
  }
  DATASET_PATH.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
  print(
    json.dumps(
      {
        "document_count": len(documents),
        "question_count": len(questions),
        "char_min": min(char_counts),
        "char_max": max(char_counts),
        "char_avg": round(sum(char_counts) / len(char_counts), 2),
      },
      ensure_ascii=False,
    )
  )


if __name__ == "__main__":
  main()
