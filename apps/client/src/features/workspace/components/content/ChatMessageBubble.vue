<script setup lang="ts">
import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  X,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";

import ShiningText from "@/components/ui/ShiningText.vue";
import { useTypewriter } from "@/composables/useTypewriter";
import type { AssistantRenderStatus, AssistantThinkingStage } from "@/types/chat/flow";
import type { ChatMessage } from "@/types/chat/models";
import type { KnowledgeSearchDebugInfo, KnowledgeSearchHit } from "share-type";
import ChatMarkdownContent from "./ChatMarkdownContent.vue";
import WorkspaceMark from "./WorkspaceMark.vue";

type ThoughtEntryKind = "retrieval" | "reasoning" | "generic";
type DrawerTab = "evidence" | "query" | "run";

// 统一描述召回调试字段，避免模板里重复拼 label 和取值逻辑。
type RetrievalDebugField = {
  label: string;
  value: string;
  multiline?: boolean;
};

type ThoughtTimelineEntry = {
  id: string;
  title: string;
  body: string;
  note?: string;
  status: AssistantRenderStatus;
  kind: ThoughtEntryKind;
  sourceLink?: boolean;
};

type RunProcessItem = {
  id: string;
  title: string;
  summary: string;
  body?: string;
  status: AssistantRenderStatus;
};

const props = defineProps<{
  message: ChatMessage;
  showMeta?: boolean;
  regenerating?: boolean;
  retrievalQuery?: string;
}>();

const emit = defineEmits<{
  edit: [message: ChatMessage];
  regenerate: [];
  clarifyMemory: [payload: { query: string }];
}>();

const createdAtFallbackMs = Date.now();
const thinkingHeaderText = "KoreAI 正在思考";

const processExpanded = ref(false);
const evidenceDrawerOpen = ref(false);
const drawerTab = ref<DrawerTab>("evidence");
const selectedSourceIndex = ref(0);
const copied = ref(false);
const userCopied = ref(false);
const liveNowMs = ref(Date.now());

const responseFlow = computed(() => props.message.responseFlow);
const promptCapabilities = computed(
  () => props.message.promptCapabilities ?? { think: false },
);
const processStages = computed(() => responseFlow.value?.thinking ?? []);

const sources = computed<KnowledgeSearchHit[]>(() => {
  const flowSources = responseFlow.value?.sources ?? [];
  if (flowSources.length > 0) {
    return flowSources;
  }

  return props.message.citations ?? [];
});

const visibleSources = computed(() => sources.value);
const hasSources = computed(() => visibleSources.value.length > 0);
const isStreamingMessage = computed(
  () =>
    props.message.role === "assistant" && props.message.status === "streaming",
);
const answerTypewriterActivated = ref(isStreamingMessage.value);

watch(
  isStreamingMessage,
  (streaming) => {
    if (streaming) {
      answerTypewriterActivated.value = true;
    }
  },
  { immediate: true },
);

const visibleThinkingStages = computed(() =>
  processStages.value.filter((stage) => {
    if (
      stage.stageKey === "answer_synthesis" ||
      stage.id === "answer-synthesis"
    ) {
      return false;
    }

    if (isKnowledgeRecallStage(stage)) {
      return (
        stage.status !== "pending" ||
        hasSources.value ||
        Boolean(stage.subtitle)
      );
    }

    return (
      stage.status !== "pending" ||
      Boolean(stage.visibleContent || stage.content)
    );
  }),
);

const thinkingTimelineEntries = computed(() =>
  buildTimelineEntries(
    visibleThinkingStages.value,
    visibleSources.value.length,
  ),
);

const normalizeAnswerLeadingBlankLines = (content: string) =>
  content.replace(/^(?:[ \t\u3000]*\r?\n)+/, "");

const streamedAnswerContent = computed(() => {
  if (!responseFlow.value) {
    return normalizeAnswerLeadingBlankLines(props.message.content || "");
  }

  return normalizeAnswerLeadingBlankLines(
    responseFlow.value.answer.content || props.message.content || "",
  );
});

const displayedAnswerContent = useTypewriter(streamedAnswerContent, {
  enabled: answerTypewriterActivated,
  intervalMs: 24,
  step: 1,
});
const isTypingAnswer = computed(
  () =>
    answerTypewriterActivated.value &&
    displayedAnswerContent.value.length < streamedAnswerContent.value.length,
);

const showProcessSection = computed(
  () =>
    promptCapabilities.value.think &&
    (thinkingTimelineEntries.value.length > 0 ||
      hasSources.value ||
      isStreamingMessage.value),
);

const isThinkingActive = computed(() =>
  thinkingTimelineEntries.value.some((entry) => entry.status === "running"),
);

const showThinkingHeader = computed(
  () =>
    showProcessSection.value &&
    (isThinkingActive.value ||
      (isStreamingMessage.value && !streamedAnswerContent.value.trim())),
);

const answerHasContent = computed(() =>
  Boolean(displayedAnswerContent.value.trim()),
);

const isAssistantWorking = computed(
  () =>
    isStreamingMessage.value ||
    isThinkingActive.value ||
    isTypingAnswer.value,
);

const createdAtMs = computed(() => {
  const parsed = Date.parse(props.message.createdAt);
  return Number.isFinite(parsed) ? parsed : createdAtFallbackMs;
});

const liveDurationMs = computed(() =>
  Math.max(0, liveNowMs.value - createdAtMs.value),
);

const resolvedDurationMs = computed(() => {
  if (isStreamingMessage.value) {
    return liveDurationMs.value;
  }

  return responseFlow.value?.totalDurationMs ?? props.message.latencyMs ?? 0;
});

const processDurationLabel = computed(() => {
  if (!resolvedDurationMs.value) {
    return "";
  }

  return `用时：${formatLatency(resolvedDurationMs.value)}`;
});

const finalTokenCount = computed(() => props.message.totalTokens);
const hasFinalTokenCount = computed(
  () => finalTokenCount.value !== null && finalTokenCount.value > 0,
);

const canToggleProcessDetails = computed(
  () => !showThinkingHeader.value && thinkingTimelineEntries.value.length > 0,
);

const showProcessDetails = computed(
  () => showThinkingHeader.value || processExpanded.value,
);

const showAnswerSection = computed(() => {
  return (
    isStreamingMessage.value ||
    answerHasContent.value ||
    Boolean(streamedAnswerContent.value.trim())
  );
});

const showAnswerActions = computed(
  () =>
    props.showMeta &&
    Boolean(responseFlow.value?.showActions) &&
    !isStreamingMessage.value &&
    !isTypingAnswer.value &&
    answerHasContent.value,
);

const evidencePanelVisible = computed(
  () => evidenceDrawerOpen.value && (hasSources.value || Boolean(retrievalDebug.value)),
);
// 优先读取 responseFlow 里的流式态 debug，刷新历史消息时再退回持久化消息字段。
const retrievalDebug = computed<KnowledgeSearchDebugInfo | null>(
  () =>
    responseFlow.value?.retrievalDebug ?? props.message.retrievalDebug ?? null,
);

const memoryClarificationCandidates = computed(
  () => retrievalDebug.value?.memoryClarificationCandidates ?? [],
);

const showMemoryClarificationActions = computed(
  () =>
    !isStreamingMessage.value &&
    !isTypingAnswer.value &&
    answerHasContent.value &&
    memoryClarificationCandidates.value.length > 0,
);

const recallScore = computed(() => {
  if (!visibleSources.value.length) {
    return "-";
  }

  const bestScore = Math.max(
    ...visibleSources.value.map((source) => source.score),
  );
  return Number.isFinite(bestScore) ? bestScore.toFixed(1) : "-";
});

const retrievalQueryText = computed(() => {
  const query =
    retrievalDebug.value?.originalQuery?.trim() || props.retrievalQuery?.trim();
  return query || "正在根据当前用户问题生成检索式。";
});

// 摘要指标单独成组，方便聊天页和 admin preview 保持一致口径。
const retrievalMetricItems = computed<RetrievalDebugField[]>(() => {
  if (!retrievalDebug.value) {
    return [];
  }

  return [
    {
      label: "重写状态",
      value: retrievalDebug.value.rewriteApplied ? "已生效" : "未生效",
    },
    {
      label: "融合权重",
      value: [
        formatWeight(retrievalDebug.value.bm25Weight),
        formatWeight(retrievalDebug.value.vectorWeight),
      ].join(" : "),
    },
    {
      label: "BM25 命中数",
      value: String(retrievalDebug.value.bm25HitCount),
    },
    {
      label: "向量命中数",
      value: String(retrievalDebug.value.vectorHitCount),
    },
    {
      label: "检索模式",
      value: retrievalDebug.value.ragRetrievalMode || "-",
    },
    {
      label: "二层 RRF",
      value: retrievalDebug.value.secondLevelRrfApplied ? "已生效" : "未生效",
    },
  ];
});

// 长文本查询单独成组展示，避免把检索词塞进一行导致可读性下降。
const retrievalQueryItems = computed<RetrievalDebugField[]>(() => {
  if (!retrievalDebug.value) {
    return [];
  }

  return [
    {
      label: "原始问题",
      value: retrievalDebug.value.originalQuery,
    },
    {
      label: "归一化问题",
      value: retrievalDebug.value.normalizedQuery,
    },
    {
      label: "BM25 检索词",
      value: retrievalDebug.value.bm25Query,
      multiline: true,
    },
    {
      label: "向量检索词",
      value: retrievalDebug.value.vectorQuery,
      multiline: true,
    },
    {
      label: "二层 RRF 查询域",
      value: formatList(retrievalDebug.value.secondLevelRrfQueries),
      multiline: true,
    },
    {
      label: "Query Mapping 命中",
      value: formatList(retrievalDebug.value.appliedQueryMappings),
      multiline: true,
    },
    {
      label: "Query Mapping 扩展词",
      value: formatList(retrievalDebug.value.queryMappingTerms),
      multiline: true,
    },
  ];
});

const activeSource = computed(
  () => visibleSources.value[selectedSourceIndex.value] ?? null,
);

const sourceFeatureItems = computed<RetrievalDebugField[]>(() => {
  const source = activeSource.value;
  if (!source) {
    return [];
  }

  return [
    { label: "matchedBy", value: formatMatchedBy(source) },
    {
      label: "bm25Score",
      value: formatDebugScore(source.scoreDetail?.bm25Score),
    },
    {
      label: "vectorScore",
      value: formatDebugScore(source.scoreDetail?.vectorScore),
    },
    {
      label: "fusedScore",
      value: formatDebugScore(source.scoreDetail?.fusedScore),
    },
    {
      label: "ceScore",
      value: formatDebugScore(source.scoreDetail?.ceScore),
    },
    {
      label: "evidenceScore",
      value: formatDebugScore(source.scoreDetail?.evidenceScore),
    },
    { label: "chunkId", value: source.chunkId || "-" },
    { label: "documentId", value: source.documentId || "-" },
    { label: "sequence", value: formatOptionalValue(source.sequence) },
    { label: "primaryTitle", value: source.primaryTitle || "-" },
    { label: "sectionPath", value: source.sectionPath || "-" },
    {
      label: "matchedEvidenceTerms",
      value: formatList(source.scoreDetail?.matchedEvidenceTerms),
    },
    {
      label: "matchedNumericTerms",
      value: formatList(source.scoreDetail?.matchedNumericTerms),
    },
    {
      label: "documentRole",
      value: source.scoreDetail?.documentRole || "-",
    },
  ];
});

const retrievalDecisionItems = computed<RetrievalDebugField[]>(() => {
  const debug = retrievalDebug.value;
  if (!debug) {
    return [];
  }

  return [
    { label: "rewriteApplied", value: formatBoolean(debug.rewriteApplied) },
    { label: "ragUserIntent", value: debug.ragUserIntent || "-" },
    { label: "ragScopeMode", value: debug.ragScopeMode || "-" },
    { label: "ragRetrievalMode", value: debug.ragRetrievalMode || "-" },
    { label: "ragAnswerMode", value: debug.ragAnswerMode || "-" },
    {
      label: "retrievalScopeObjects",
      value: formatList(debug.retrievalScopeObjects?.map((item) => item.value)),
    },
    { label: "memoryIntent", value: debug.memoryIntent || "-" },
    { label: "memoryBoardSource", value: debug.memoryBoardSource || "-" },
    { label: "memoryBoard", value: debug.memoryBoardSummary || "-" },
    { label: "memoryRetrievalHints", value: formatList(debug.memoryRetrievalHints) },
    { label: "appliedMemoryRetrievalHints", value: formatList(debug.appliedMemoryRetrievalHints) },
    { label: "droppedMemoryRetrievalHints", value: formatList(debug.droppedMemoryRetrievalHints) },
    { label: "memoryHintConflict", value: formatBoolean(debug.memoryHintConflict) },
    { label: "memorySelectedEntries", value: formatMemorySelectedEntries(debug.memoryMatchDebug) },
    { label: "memoryDroppedEntries", value: formatMemoryDroppedEntries(debug.memoryMatchDebug) },
    { label: "memoryClarificationCandidates", value: formatMemoryClarificationCandidates(debug.memoryClarificationCandidates) },
    { label: "bm25Weight", value: formatWeight(debug.bm25Weight) },
    { label: "vectorWeight", value: formatWeight(debug.vectorWeight) },
    { label: "bm25HitCount", value: String(debug.bm25HitCount) },
    { label: "vectorHitCount", value: String(debug.vectorHitCount) },
    {
      label: "candidateLimit",
      value: formatOptionalValue(debug.candidateLimit),
    },
    {
      label: "ceCandidateCount",
      value: formatOptionalValue(debug.ceCandidateCount),
    },
    {
      label: "secondLevelRrfApplied",
      value: formatBoolean(debug.secondLevelRrfApplied),
    },
    {
      label: "secondLevelRrfQueries",
      value: formatList(debug.secondLevelRrfQueries),
    },
    { label: "effectiveTopK", value: formatOptionalValue(debug.effectiveTopK) },
    { label: "fallbackApplied", value: formatBoolean(debug.fallbackApplied) },
    { label: "excludedTerms", value: formatList(debug.excludedTerms) },
    { label: "evidenceTerms", value: formatList(debug.evidenceTerms) },
    {
      label: "evidenceNumericTerms",
      value: formatList(debug.evidenceNumericTerms),
    },
    {
      label: "evidenceExpansionApplied",
      value: formatBoolean(debug.evidenceExpansionApplied),
    },
    {
      label: "scopeCoverage",
      value: formatPercent(debug.scopeCoverage),
    },
    {
      label: "factCoverage",
      value: formatPercent(debug.factCoverage),
    },
    { label: "evidenceGateStatus", value: debug.evidenceGateStatus || "-" },
  ];
});

const runProcessItems = computed<RunProcessItem[]>(() => {
  const items: RunProcessItem[] = [
    {
      id: "request",
      title: "接收问题",
      summary: `${promptCapabilities.value.think ? "深度思考" : "普通回答"} · ${promptCapabilities.value.rewrite === false ? "不改写查询" : "允许查询改写"}`,
      body: retrievalQueryText.value,
      status: "done",
    },
  ];

  if (retrievalDebug.value) {
    items.push({
      id: "query",
      title: "确定检索方式",
      summary: `${retrievalDebug.value.ragUserIntent || "-"} / ${retrievalDebug.value.ragScopeMode || "-"} / ${retrievalDebug.value.ragRetrievalMode || "-"}`,
      body: retrievalDebug.value.normalizedQuery,
      status: "done",
    });
  }

  if (hasSources.value || isStreamingMessage.value) {
    items.push({
      id: "retrieval",
      title: "检索并筛选证据",
      summary: hasSources.value
        ? `${visibleSources.value.length} 个 chunk 进入回答依据`
        : "正在检索知识库",
      status: hasSources.value ? "done" : "running",
    });
  }

  if (promptCapabilities.value.think) {
    for (const stage of thinkingTimelineEntries.value) {
      if (stage.kind === "retrieval") {
        continue;
      }

      items.push({
        id: stage.id,
        title: stage.title,
        summary: stage.note || "整理与核对已找到的依据",
        body: stage.body || undefined,
        status: stage.status,
      });
    }
  }

  items.push({
    id: "answer",
    title: "生成回答",
    summary: isTypingAnswer.value
      ? "正在逐字输出最终回答"
      : answerHasContent.value
        ? "最终回答已完成"
        : "等待生成回答",
    status: isTypingAnswer.value
      ? "running"
      : answerHasContent.value
        ? "done"
        : "pending",
  });

  return items;
});

let liveTimer: number | null = null;
let copiedTimer: number | null = null;
let userCopiedTimer: number | null = null;

const stopLiveTimer = () => {
  if (liveTimer !== null) {
    window.clearInterval(liveTimer);
    liveTimer = null;
  }
};

const stopCopiedTimer = () => {
  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer);
    copiedTimer = null;
  }
};

const stopUserCopiedTimer = () => {
  if (userCopiedTimer !== null) {
    window.clearTimeout(userCopiedTimer);
    userCopiedTimer = null;
  }
};

const syncLiveTimer = () => {
  stopLiveTimer();

  if (!isStreamingMessage.value) {
    return;
  }

  liveNowMs.value = Date.now();
  liveTimer = window.setInterval(() => {
    liveNowMs.value = Date.now();
  }, 100);
};

const resetVisualSequence = () => {
  stopCopiedTimer();
  stopUserCopiedTimer();
  answerTypewriterActivated.value = isStreamingMessage.value;
  copied.value = false;
  userCopied.value = false;
  evidenceDrawerOpen.value = false;
  processExpanded.value = Boolean(
    showProcessSection.value && isStreamingMessage.value,
  );
};

watch(
  () => props.message.id,
  () => {
    resetVisualSequence();
  },
  { immediate: true },
);

watch(
  () => props.message.status,
  () => {
    syncLiveTimer();
  },
  { immediate: true },
);

watch(
  () => [showProcessSection.value, showThinkingHeader.value] as const,
  ([hasThoughtProcess, thinkingHeader]) => {
    if (!hasThoughtProcess || !thinkingHeader) {
      processExpanded.value = false;
      return;
    }

    processExpanded.value = true;
  },
);

watch(hasSources, (value) => {
  if (!value) {
    evidenceDrawerOpen.value = false;
    selectedSourceIndex.value = 0;
    return;
  }

  if (selectedSourceIndex.value >= visibleSources.value.length) {
    selectedSourceIndex.value = visibleSources.value.length - 1;
  }
});

onBeforeUnmount(() => {
  stopLiveTimer();
  stopCopiedTimer();
  stopUserCopiedTimer();
});

const toggleProcessDetails = () => {
  if (!canToggleProcessDetails.value) {
    return;
  }

  processExpanded.value = !processExpanded.value;
};

const openEvidenceDrawer = () => {
  if (!hasSources.value) {
    return;
  }

  drawerTab.value = "evidence";
  evidenceDrawerOpen.value = true;
};

const openSourceDrawer = (index: number) => {
  selectedSourceIndex.value = index;
  openEvidenceDrawer();
};

const openRunDrawer = () => {
  drawerTab.value = "run";
  evidenceDrawerOpen.value = true;
};

const closeEvidenceDrawer = () => {
  evidenceDrawerOpen.value = false;
};

const copyAnswer = async () => {
  if (!displayedAnswerContent.value.trim()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(displayedAnswerContent.value);
    copied.value = true;
    stopCopiedTimer();
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 1600);
  } catch (error) {
    console.error("Failed to copy answer.", error);
  }
};

const copyUserMessage = async () => {
  if (!props.message.content.trim()) {
    return;
  }

  try {
    await navigator.clipboard.writeText(props.message.content);
    userCopied.value = true;
    stopUserCopiedTimer();
    userCopiedTimer = window.setTimeout(() => {
      userCopied.value = false;
      userCopiedTimer = null;
    }, 1600);
  } catch (error) {
    console.error("Failed to copy user message.", error);
  }
};

const buildMemoryClarificationQuery = (
  candidates: NonNullable<KnowledgeSearchDebugInfo["memoryClarificationCandidates"]>,
) => {
  const scope = candidates
    .map((item) => item.identifiers[0] || item.documentName)
    .filter(Boolean)
    .join("、");
  const question =
    props.retrievalQuery?.trim() ||
    retrievalDebug.value?.originalQuery?.trim() ||
    props.message.content.trim();

  return `请基于 ${scope} 回答：${question}`;
};

const submitMemoryClarification = (
  candidates: NonNullable<KnowledgeSearchDebugInfo["memoryClarificationCandidates"]>,
) => {
  if (!candidates.length) {
    return;
  }

  emit("clarifyMemory", {
    query: buildMemoryClarificationQuery(candidates),
  });
};

function isKnowledgeRecallStage(stage: AssistantThinkingStage) {
  return (
    stage.stageKey === "knowledge_recall" || stage.id === "knowledge-recall"
  );
}

function isMemoryResolutionStage(stage: AssistantThinkingStage) {
  return (
    stage.stageKey === "memory_resolution" || stage.id === "memory-resolution"
  );
}

function formatLatency(latencyMs?: number | null) {
  return `${((latencyMs || 0) / 1000).toFixed(1)} 秒`;
}

function formatChunkRank(index: number) {
  return `#${String(index + 1).padStart(2, "0")}`;
}

function formatChunkScore(score: number) {
  return Number.isFinite(score) ? score.toFixed(1) : "-";
}

function formatDebugScore(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score)
    ? String(Number(score.toFixed(3)))
    : "-";
}

function formatWeight(weight: number | null | undefined) {
  return typeof weight === "number" && Number.isFinite(weight)
    ? weight.toFixed(1)
    : "-";
}

function formatOptionalValue(value: number | string | null | undefined) {
  return value === null || value === undefined || value === ""
    ? "-"
    : String(value);
}

function formatBoolean(value: boolean | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value ? "是" : "否";
}

function formatList(value: string[] | null | undefined) {
  return value?.length ? value.join(" · ") : "-";
}

function formatMemorySelectedEntries(
  value: KnowledgeSearchDebugInfo["memoryMatchDebug"] | null | undefined,
) {
  return value?.selected.length
    ? value.selected
        .map((item) =>
          `${item.documentName} [${item.reason}, score=${item.score}, firstSeen=${formatOptionalValue(item.firstSeen)}, lastSeen=${formatOptionalValue(item.lastSeen)}, mentionOrder=${formatOptionalValue(item.mentionOrder)}]`,
        )
        .join(" · ")
    : "-";
}

function formatMemoryDroppedEntries(
  value: KnowledgeSearchDebugInfo["memoryMatchDebug"] | null | undefined,
) {
  return value?.dropped.length
    ? value.dropped
        .map(
          (item) =>
            `${item.documentName} [${item.reason}, firstSeen=${formatOptionalValue(item.firstSeen)}, lastSeen=${formatOptionalValue(item.lastSeen)}, mentionOrder=${formatOptionalValue(item.mentionOrder)}]`,
        )
        .join(" · ")
    : "-";
}

function formatMemoryClarificationCandidates(
  value: KnowledgeSearchDebugInfo["memoryClarificationCandidates"] | null | undefined,
) {
  return value?.length
    ? value
        .map(
          (item) =>
            `${item.documentName} [firstSeen=${formatOptionalValue(item.firstSeen)}, lastSeen=${formatOptionalValue(item.lastSeen)}, mentionOrder=${formatOptionalValue(item.mentionOrder)}]`,
        )
        .join(" 路 ")
    : "-";
}

const formatPercent = (value?: number | null) =>
  typeof value === "number" ? `${Math.round(value * 100)}%` : "-";

function formatMatchedBy(source: KnowledgeSearchHit) {
  const matchedBy = source.scoreDetail?.matchedBy ?? [];
  if (!matchedBy.length) {
    return "未知";
  }

  return matchedBy
    .map((item) => {
      if (item === "bm25") {
        return "BM25";
      }

      if (item === "vector") {
        return "向量";
      }

      return item;
    })
    .join(" + ");
}

function getStageNote(stage: AssistantThinkingStage, sourceCount: number) {
  if (stage.subtitle) {
    return stage.subtitle;
  }

  if (isKnowledgeRecallStage(stage)) {
    return sourceCount
      ? `已命中 ${sourceCount} 个 chunk`
      : "正在检索相关 chunk";
  }

  if (isMemoryResolutionStage(stage)) {
    return stage.status === "running"
      ? "正在判断是否需要继承上一轮上下文"
      : "已完成本轮上下文消解";
  }

  return stage.status === "running" ? "正在整理当前思路" : "";
}

function buildTimelineEntries(
  stages: AssistantThinkingStage[],
  sourceCount: number,
): ThoughtTimelineEntry[] {
  return stages.reduce<ThoughtTimelineEntry[]>((entries, stage) => {
    if (
      stage.stageKey === "answer_synthesis" ||
      stage.id === "answer-synthesis"
    ) {
      return entries;
    }

    if (isKnowledgeRecallStage(stage)) {
      entries.push({
        id: stage.id,
        title: stage.title,
        body: "",
        note: getStageNote(stage, sourceCount),
        status: stage.status,
        kind: "retrieval",
        sourceLink: sourceCount > 0,
      });
      return entries;
    }

    if (isMemoryResolutionStage(stage)) {
      entries.push({
        id: stage.id,
        title: stage.title,
        body: stage.visibleContent || stage.content,
        note: getStageNote(stage, sourceCount),
        status: stage.status,
        kind: "generic",
      });
      return entries;
    }

    if (stage.stageKey === "llm_reasoning") {
      if (stage.status === "running") {
        entries.push({
          id: `${stage.id}-streaming`,
          title: stage.title,
          body: stage.visibleContent || stage.content,
          status: stage.status,
          kind: "reasoning",
        });
        return entries;
      }

      const parsedEntries = parseReasoningEntriesForTimeline(
        stage.visibleContent || stage.content,
      );
      if (parsedEntries.length > 0) {
        entries.push(
          ...parsedEntries.map((entry, index) => ({
            id: `${stage.id}-${index}`,
            title: entry.title,
            body: entry.body,
            note: undefined,
            status: index === parsedEntries.length - 1 ? stage.status : "done",
            kind: "reasoning" as const,
          })),
        );
        return entries;
      }
    }

    entries.push({
      id: stage.id,
      title: stage.title,
      body: stage.visibleContent || stage.content,
      note: !(stage.visibleContent || stage.content)
        ? getStageNote(stage, sourceCount)
        : undefined,
      status: stage.status,
      kind: "generic",
    });

    return entries;
  }, []);
}

function parseReasoningEntriesForTimeline(
  content: string,
): Array<{ title: string; body: string }> {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const normalizedWithInlineHeadings = normalized
    .replace(/([。！？；])\s*([^:\n：]{1,32}[:：])/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n");

  const lines = normalizedWithInlineHeadings.split("\n");
  const headingOnlyPattern = /^([^:\n：]{1,32})([:：])\s*$/;
  const headingWithBodyPattern = /^([^:\n：]{1,32})([:：])\s*(.+)$/;
  const entries: Array<{ title: string; body: string }> = [];

  let currentTitle = "";
  let currentBodyLines: string[] = [];
  const fallbackLines: string[] = [];

  const pushCurrent = () => {
    if (!currentTitle) {
      return;
    }

    entries.push({
      title: currentTitle,
      body: currentBodyLines.join("\n").trim(),
    });

    currentTitle = "";
    currentBodyLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const headingOnlyMatch = line.match(headingOnlyPattern);
    if (headingOnlyMatch) {
      pushCurrent();
      currentTitle = `${headingOnlyMatch[1]}${headingOnlyMatch[2]}`;
      currentBodyLines = [];
      continue;
    }

    const headingWithBodyMatch = line.match(headingWithBodyPattern);
    if (headingWithBodyMatch) {
      pushCurrent();
      currentTitle = `${headingWithBodyMatch[1]}${headingWithBodyMatch[2]}`;
      currentBodyLines = [headingWithBodyMatch[3]];
      continue;
    }

    if (currentTitle) {
      currentBodyLines.push(rawLine);
      continue;
    }

    fallbackLines.push(rawLine);
  }

  pushCurrent();

  if (entries.length > 0) {
    return entries;
  }

  const fallbackBody = fallbackLines.join("\n").trim();
  if (!fallbackBody) {
    return [];
  }

  return [
    {
      title: "分析结论：",
      body: fallbackBody,
    },
  ];
}

function renderThoughtBody(body: string) {
  const escaped = body.trimStart()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br />");
}

</script>

<template>
  <article v-if="message.role === 'user'" class="user-message">
    <div class="user-message-shell">
      <div class="user-message__body">
        <span>你</span>
        <p>{{ message.content || "..." }}</p>
      </div>

      <div class="user-actions">
        <button
          type="button"
          class="answer-action"
          :aria-label="userCopied ? '已复制' : '复制'"
          @click="copyUserMessage"
        >
          <Check v-if="userCopied" class="size-4" />
          <Copy v-else class="size-4" />
        </button>

        <button
          type="button"
          class="answer-action"
          aria-label="编辑"
          @click="emit('edit', message)"
        >
          <PencilLine class="size-4" />
        </button>
      </div>
    </div>
  </article>

  <article v-else class="assistant-message">
    <header class="assistant-message__header">
      <WorkspaceMark :size="38" :active="isAssistantWorking" />
      <strong>Kore</strong>
      <span>{{
        isAssistantWorking
          ? "正在回答"
          : `回答完成${resolvedDurationMs ? ` · ${formatLatency(resolvedDurationMs)}` : ""}`
      }}</span>
    </header>

    <div class="assistant-message__content">
      <section v-if="showProcessSection" class="thinking-shell">
        <button
          type="button"
          class="thinking-header"
          :aria-expanded="showProcessDetails"
          @click="toggleProcessDetails"
        >
          <div class="thinking-header__left">
            <ShiningText
              v-if="showThinkingHeader"
              :text="thinkingHeaderText"
              class="thinking-header__shine"
            />
            <span v-else class="thinking-header__title">已完成思考</span>
            <span v-if="processDurationLabel" class="thinking-header__meta">
              {{ processDurationLabel }}
            </span>
          </div>

          <div
            v-if="hasFinalTokenCount || canToggleProcessDetails"
            class="thinking-header__right"
          >
            <span v-if="hasFinalTokenCount" class="thinking-header__meta">
              Token:{{ finalTokenCount }}
            </span>
            <ChevronRight
              v-if="canToggleProcessDetails"
              class="size-4 transition-transform"
              :class="showProcessDetails ? 'rotate-90' : ''"
            />
          </div>
        </button>

        <transition name="process-collapse">
          <div v-if="showProcessDetails" class="thinking-panel">
            <div class="thinking-timeline">
              <article
                v-for="stage in thinkingTimelineEntries"
                :key="stage.id"
                class="thought-entry"
              >
                <div class="thought-entry__main">
                  <span class="thought-entry__dot-shell" aria-hidden="true">
                    <span class="thought-entry__dot-core" />
                  </span>

                  <div class="thought-entry__title-row">
                    <ShiningText
                      v-if="stage.status === 'running' && showThinkingHeader"
                      :text="stage.title"
                      class="thought-entry__title thought-entry__title--active"
                    />
                    <strong v-else class="thought-entry__title">{{
                      stage.title
                    }}</strong>
                  </div>

                  <button
                    v-if="stage.kind === 'retrieval' && hasSources"
                    type="button"
                    class="thought-entry__source"
                    @click="openEvidenceDrawer"
                  >
                    <span>{{ stage.note }}</span>
                    <span class="thought-entry__source-arrow">&gt;</span>
                  </button>

                  <div
                    v-else-if="stage.body"
                    class="thought-entry__body"
                    v-html="renderThoughtBody(stage.body)"
                  />

                  <p v-else-if="stage.note" class="thought-entry__note">
                    {{ stage.note }}
                  </p>
                </div>
              </article>
            </div>

          </div>
        </transition>
      </section>

      <section v-if="showAnswerSection" class="answer-shell">
        <template v-if="answerHasContent">
          <ChatMarkdownContent
            :content="displayedAnswerContent"
            :show-cursor="isStreamingMessage || isTypingAnswer"
          />
        </template>
        <div v-else class="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle class="size-4 animate-spin" />
          正在生成回答...
        </div>
      </section>

      <section
        v-if="showMemoryClarificationActions"
        class="memory-clarification-panel"
      >
        <button
          type="button"
          class="memory-clarification-chip memory-clarification-chip--primary"
          @click="submitMemoryClarification(memoryClarificationCandidates)"
        >
          以上全部
        </button>
        <button
          v-for="candidate in memoryClarificationCandidates"
          :key="`${candidate.documentName}-${candidate.mentionOrder ?? 0}`"
          type="button"
          class="memory-clarification-chip"
          @click="submitMemoryClarification([candidate])"
        >
          {{ candidate.mentionOrder ? `${candidate.mentionOrder}. ` : "" }}{{
            candidate.identifiers[0] || candidate.documentName
          }}
        </button>
      </section>

      <div
        v-if="
          !isStreamingMessage &&
          !isTypingAnswer &&
          answerHasContent &&
          hasSources
        "
        class="citations"
      >
        <span>参考来源 · {{ visibleSources.length }}</span>
        <button
          v-for="(_, index) in visibleSources"
          :key="index"
          type="button"
          @click="openSourceDrawer(index)"
        >
          {{ String(index + 1).padStart(2, "0") }}
        </button>
      </div>

      <section
        v-if="
          !isStreamingMessage &&
          !isTypingAnswer &&
          answerHasContent &&
          (hasSources || retrievalDebug)
        "
        class="run-summary-panel"
      >
        <header>
          <strong>本次运行</strong
          ><button type="button" @click="openRunDrawer">查看过程</button>
        </header>
        <dl>
          <div>
            <dt>
              {{
                retrievalDebug?.candidateLimit ??
                retrievalDebug?.vectorHitCount ??
                0
              }}
            </dt>
            <dd>候选片段</dd>
          </div>
          <div>
            <dt>{{ visibleSources.length }}</dt>
            <dd>召回证据</dd>
          </div>
          <div>
            <dt>{{ formatPercent(retrievalDebug?.scopeCoverage) }}</dt>
            <dd>scope 覆盖</dd>
          </div>
          <div>
            <dt>{{ formatPercent(retrievalDebug?.factCoverage) }}</dt>
            <dd>fact 覆盖</dd>
          </div>
          <div>
            <dt>{{ formatLatency(resolvedDurationMs) }}</dt>
            <dd>总耗时</dd>
          </div>
        </dl>
      </section>

      <div v-if="showAnswerActions" class="answer-actions">
        <button
          type="button"
          class="answer-action"
          :aria-label="copied ? '已复制' : '复制'"
          @click="copyAnswer"
        >
          <Check v-if="copied" class="size-4" />
          <Copy v-else class="size-4" />
        </button>

        <button
          type="button"
          class="answer-action"
          aria-label="重新生成"
          :disabled="regenerating"
          @click="emit('regenerate')"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': regenerating }" />
        </button>
      </div>
    </div>

    <Teleport to="body">
      <transition name="evidence-drawer">
        <div v-if="evidencePanelVisible" class="evidence-drawer-layer">
          <button
            type="button"
            class="evidence-drawer__mask"
            aria-label="关闭命中 chunk 抽屉"
            @click="closeEvidenceDrawer"
          />

          <aside class="evidence-drawer" @click.stop>
            <header class="evidence-drawer__header">
              <div>
                <span>回答依据</span>
                <strong>本次检索详情</strong>
              </div>
              <button
                type="button"
                class="evidence-drawer__close"
                aria-label="关闭命中 chunk 抽屉"
                @click="closeEvidenceDrawer"
              >
                <X class="size-5" />
              </button>
            </header>

            <nav class="evidence-drawer__tabs" aria-label="检索详情分类">
              <button
                v-for="tab in ['evidence', 'query', 'run'] as DrawerTab[]"
                :key="tab"
                type="button"
                :class="{ 'is-active': drawerTab === tab }"
                @click="drawerTab = tab"
              >
                {{ { evidence: "证据", query: "查询", run: "运行过程" }[tab] }}
              </button>
            </nav>

            <div v-if="drawerTab === 'query'" class="evidence-panel__top">
              <div class="evidence-summary evidence-summary--query">
                <span class="evidence-label">前检索问题</span>
                <p>{{ retrievalQueryText }}</p>
              </div>
              <div class="evidence-summary evidence-summary--score">
                <span class="evidence-label">最高展示分</span>
                <strong>{{ recallScore }}</strong>
                <p>当前命中结果中的最高融合展示分</p>
              </div>
            </div>

            <section
              v-if="drawerTab === 'query' && retrievalDebug"
              class="retrieval-debug-panel"
            >
              <header class="retrieval-debug-panel__header">
                <strong>召回调试信息</strong>
                <span>{{
                  retrievalDebug.rewriteApplied ? "已生效" : "未生效"
                }}</span>
              </header>

              <div class="retrieval-debug-metrics">
                <article
                  v-for="item in retrievalMetricItems"
                  :key="item.label"
                  class="retrieval-debug-card"
                >
                  <span class="evidence-label">{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </article>
              </div>

              <div class="retrieval-debug-queries">
                <article
                  v-for="item in retrievalQueryItems"
                  :key="item.label"
                  class="retrieval-query-card"
                >
                  <span class="evidence-label">{{ item.label }}</span>
                  <p
                    :class="{
                      'retrieval-query-card__content--multiline':
                        item.multiline,
                    }"
                  >
                    {{ item.value || "-" }}
                  </p>
                </article>
              </div>

              <section class="retrieval-decision">
                <h3>检索决策</h3>
                <dl class="detail-field-grid">
                  <div v-for="item in retrievalDecisionItems" :key="item.label">
                    <dt>{{ item.label }}</dt>
                    <dd
                      :class="{
                        'is-pass':
                          item.label === 'evidenceGateStatus' &&
                          item.value === 'pass',
                      }"
                    >
                      {{ item.value }}
                    </dd>
                  </div>
                </dl>
              </section>
            </section>

            <div v-if="drawerTab === 'evidence'" class="chunk-hit-list">
              <p class="drawer-result-count">
                完整召回 {{ visibleSources.length }} 个 chunk
              </p>
              <div class="source-index">
                <button
                  v-for="(_, index) in visibleSources"
                  :key="index"
                  type="button"
                  :class="{ 'is-active': selectedSourceIndex === index }"
                  @click="selectedSourceIndex = index"
                >
                  {{ String(index + 1).padStart(2, "0") }}
                </button>
              </div>
              <article
                v-for="(source, index) in visibleSources"
                :key="source.chunkId || `${source.documentId}-${index}`"
                v-show="selectedSourceIndex === index"
                class="chunk-hit-card"
                :style="{ '--chunk-index': index }"
              >
                <div class="chunk-hit-card__rank">
                  {{ formatChunkRank(index) }}
                </div>
                <div class="chunk-hit-card__main">
                  <div class="chunk-hit-card__head">
                    <FileText :size="19" />
                    <div>
                      <h4>{{ source.documentName || "未命名文档" }}</h4>
                      <span>{{
                        source.primaryTitle || source.sectionPath || "文档片段"
                      }}</span>
                    </div>
                    <strong>{{ formatChunkScore(source.score) }}</strong>
                  </div>
                  <blockquote>{{ source.content }}</blockquote>
                  <dl class="detail-field-grid source-feature-grid">
                    <div v-for="item in sourceFeatureItems" :key="item.label">
                      <dt>{{ item.label }}</dt>
                      <dd>{{ item.value }}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            </div>

            <ol v-else-if="drawerTab === 'run'" class="run-process-list">
              <li v-for="(stage, index) in runProcessItems" :key="stage.id">
                <span class="run-process-list__index">
                  {{ String(index + 1).padStart(2, "0") }}
                </span>
                <div>
                  <header>
                    <strong>{{ stage.title }}</strong>
                    <span :class="`is-${stage.status}`">{{
                      stage.status
                    }}</span>
                  </header>
                  <p>{{ stage.summary }}</p>
                  <div v-if="stage.body" class="run-process-list__body">
                    {{ stage.body }}
                  </div>
                </div>
              </li>
            </ol>
          </aside>
        </div>
      </transition>
    </Teleport>
  </article>
</template>

<style scoped>
.user-message {
  display: flex;
  justify-content: flex-end;
}
.user-message-shell {
  display: flex;
  width: min(550px, 82%);
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.user-message__body {
  width: 100%;
  padding: 16px 18px;
  border: 1px solid #e8e8e2;
  border-radius: 11px 11px 3px 11px;
  background: rgba(255, 255, 255, 0.76);
}
.user-message__body span {
  display: block;
  margin-bottom: 7px;
  color: #5b5bf7;
  font-size: 11px;
  font-weight: 700;
}
.user-message__body p {
  margin: 0;
  white-space: pre-wrap;
  font:
    15px/1.85 ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.assistant-message {
  margin-top: 42px;
}
.assistant-message__header {
  display: flex;
  align-items: center;
  gap: 9px;
}
.assistant-message__header strong {
  font:
    600 14px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.assistant-message__header > span {
  color: #777770;
  font-size: 11px;
}
.assistant-message__content {
  margin-left: 0;
}
.assistant-message .answer-shell {
  margin-top: 20px;
}
.assistant-message .answer-shell :deep(p) {
  font-family: ui-serif, Georgia, "Songti SC", serif;
  line-height: 1.85;
}
.memory-clarification-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e8e8e2;
}
.memory-clarification-chip {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid #d8d8d1;
  border-radius: 999px;
  background: #fff;
  color: #44443f;
  font-size: 12px;
  cursor: pointer;
}
.memory-clarification-chip:hover {
  border-color: #5b5bf7;
  color: #3434d6;
}
.memory-clarification-chip--primary {
  background: #191918;
  border-color: #191918;
  color: #fff;
}
.memory-clarification-chip--primary:hover {
  border-color: #191918;
  color: #fff;
}
.citations {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 20px;
}
.citations > span {
  margin-right: 3px;
  color: #777770;
  font-size: 11px;
}
.citations button {
  width: 29px;
  height: 27px;
  border: 1px solid #d8d8d1;
  border-radius: 6px;
  background: #fff;
  color: #5b5bf7;
  font-size: 11px;
  cursor: pointer;
}
.citations button:hover {
  border-color: #5b5bf7;
}
.run-summary-panel {
  margin-top: 34px;
  border-top: 1px solid #e8e8e2;
}
.run-summary-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 0;
}
.run-summary-panel header strong {
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 15px;
}
.run-summary-panel header button {
  border: 0;
  background: transparent;
  color: #777770;
  font-size: 12px;
}
.run-summary-panel dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0;
  border-top: 1px solid #e8e8e2;
  border-bottom: 1px solid #e8e8e2;
}
.run-summary-panel dl > div {
  display: grid;
  gap: 12px;
  padding: 20px 16px;
}
.run-summary-panel dl > div + div {
  border-left: 1px solid #e8e8e2;
}
.run-summary-panel dt {
  font:
    600 22px ui-serif,
    Georgia,
    serif;
}
.run-summary-panel dd {
  margin: 0;
  color: #777770;
  font-size: 11px;
}
@media (max-width: 700px) {
  .run-summary-panel dl {
    grid-template-columns: 1fr 1fr;
  }
  .run-summary-panel dl > div:nth-child(3) {
    border-left: 0;
    border-top: 1px solid #e8e8e2;
  }
  .run-summary-panel dl > div:nth-child(4) {
    border-top: 1px solid #e8e8e2;
  }
}

.user-actions {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding-right: 4px;
}

.thinking-shell {
  max-width: min(860px, 100%);
}

.thinking-header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.thinking-header__left,
.thinking-header__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.thinking-header__left {
  min-width: 0;
}

.thinking-header__title,
.thinking-header__shine {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
}

.thinking-header__title {
  color: #3c4350;
}

.thinking-header__meta {
  color: #8b94a4;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.thinking-panel {
  padding-top: 14px;
}

.thinking-timeline {
  position: relative;
  padding-left: 4px;
}

.thought-entry {
  position: relative;
  padding-left: 20px;
  border-left: 1px solid #141414;
}

.thought-entry:not(:last-child) {
  padding-bottom: 10px;
}

.thought-entry:last-child {
  padding-bottom: 0;
}

.thought-entry__main {
  position: relative;
  min-width: 0;
}

.thought-entry__dot-shell {
  position: absolute;
  left: -26px;
  top: 0;
  display: flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #fff;
}

.thought-entry__dot-core {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #111827;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.16),
    0 0 0 0.5px rgba(0, 0, 0, 0.18);
}

.thought-entry__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thought-entry__title,
.thought-entry__title--active {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}

.thought-entry__title {
  color: #2f3745;
}

.thought-entry__note,
.thought-entry__source {
  margin-top: 6px;
}

.thought-entry__body {
  margin-top: 10px;
  color: #475467;
  font-size: 15px;
  line-height: 1.72;
  white-space: normal;
}

.thought-entry__body :deep(strong),
.thought-entry__body strong {
  color: #243041;
  font-weight: 700;
}

.thought-entry__body :deep(code),
.thought-entry__body code {
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.06);
  padding: 2px 6px;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 0.92em;
  color: #1f2937;
}

.thought-entry__note {
  color: #5d6777;
  font-size: 15px;
  line-height: 1.72;
}

.thought-entry__source {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #344256;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.72;
  cursor: pointer;
}

.thought-entry__source:hover {
  color: #111827;
}

.thought-entry__source-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid #cfd6df;
  border-radius: 999px;
  color: #687385;
  font-size: 12px;
  line-height: 1;
  transition:
    transform 180ms ease,
    color 180ms ease,
    border-color 180ms ease;
}

.thought-entry__source:hover .thought-entry__source-arrow {
  transform: translateX(2px);
  color: #111827;
  border-color: #aab4c0;
}

.answer-shell {
  min-height: 32px;
  padding-top: 8px;
}

.recall-entry-shell {
  padding-top: 14px;
}

.recall-entry-button {
  display: grid;
  width: 100%;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px 12px;
  border: 1px solid #dbe8e4;
  border-radius: 18px;
  background: linear-gradient(
    180deg,
    rgba(246, 251, 251, 0.82) 0%,
    rgba(255, 255, 255, 0.9) 100%
  );
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease;
}

.recall-entry-button:hover {
  border-color: #bfd2cb;
  background: linear-gradient(
    180deg,
    rgba(243, 250, 249, 0.94) 0%,
    rgba(255, 255, 255, 0.98) 100%
  );
  box-shadow: 0 6px 18px rgba(108, 140, 132, 0.08);
}

.recall-entry-button__label {
  align-self: start;
  border-radius: 999px;
  background: #ebf8f5;
  padding: 5px 10px;
  color: #0f776f;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.recall-entry-button__count {
  display: block;
  color: #17324b;
  font-size: 14px;
  font-weight: 760;
  line-height: 1.45;
}

.recall-entry-button__meta {
  grid-column: 2 / 3;
  color: #6b7f92;
  font-size: 12px;
  line-height: 1.45;
}

.recall-entry-button__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid #d2ddd9;
  border-radius: 999px;
  color: #5f7790;
  font-size: 12px;
  line-height: 1;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.recall-entry-button:hover .recall-entry-button__arrow {
  transform: translateX(2px);
  border-color: #bfd2cb;
  color: #17324b;
}

.answer-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 18px;
}

.answer-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #687385;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: color 180ms ease;
}

.answer-action:hover:not(:disabled) {
  color: #111827;
}

.answer-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.evidence-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.evidence-drawer__mask {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(235, 243, 241, 0.14);
}

.evidence-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(740px, 92vw);
  overflow: auto;
  border-left: 1px solid #dbe8e4;
  background: linear-gradient(180deg, #f6fbfb 0%, #fbfdfd 38%, #feffff 100%);
  padding: 18px 20px 28px;
  box-shadow: -16px 0 44px rgba(108, 140, 132, 0.12);
}

.evidence-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: -18px -20px 18px;
  border-bottom: 1px solid #dbe8e4;
  background: transparent;
  padding: 24px 20px 18px;
}

.evidence-drawer__header strong {
  display: block;
  color: #0f172a;
  font-size: 16px;
  font-weight: 760;
  line-height: 1.35;
}

.evidence-drawer__header span {
  display: block;
  margin-top: 4px;
  color: #708292;
  font-size: 13px;
  font-weight: 560;
}

.evidence-drawer__close {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid #d6e3df;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: #3c556c;
  cursor: pointer;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.evidence-drawer__close:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: #bfd2cb;
  color: #18324b;
}

.evidence-panel__top {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(188px, 0.8fr);
  gap: 16px;
  margin-bottom: 16px;
}

.evidence-summary {
  min-height: 118px;
  border: 1px solid #dbe8e4;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  padding: 16px 18px;
  box-shadow: 0 1px 2px rgba(103, 128, 148, 0.03);
}

.evidence-summary--query p {
  margin: 12px 0 0;
  color: #17324b;
  font-size: 14px;
  line-height: 1.82;
}

.evidence-summary--score strong {
  display: block;
  margin-top: 10px;
  color: #0f776f;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 28px;
  font-weight: 760;
  line-height: 1.06;
}

.evidence-summary--score p {
  margin: 8px 0 0;
  color: #5f7790;
  font-size: 13px;
}

.evidence-label {
  color: #7f92a5;
  font-size: 13px;
  font-weight: 700;
}

.retrieval-debug-panel {
  margin-bottom: 16px;
}

.retrieval-debug-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.retrieval-debug-panel__header strong {
  color: #0f172a;
  font-size: 15px;
  font-weight: 760;
}

.retrieval-debug-panel__header span {
  color: #5f7790;
  font-size: 13px;
  font-weight: 600;
}

.retrieval-debug-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.retrieval-debug-card,
.retrieval-query-card {
  border: 1px solid #dbe8e4;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(103, 128, 148, 0.03);
}

.retrieval-debug-card strong {
  display: block;
  margin-top: 10px;
  color: #17324b;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 18px;
  font-weight: 760;
  line-height: 1.2;
}

.retrieval-debug-queries {
  display: grid;
  gap: 12px;
}

.retrieval-query-card p {
  margin: 10px 0 0;
  color: #17324b;
  font-size: 14px;
  line-height: 1.7;
}

.retrieval-query-card__content--multiline {
  white-space: pre-line;
}

.chunk-hit-list {
  display: grid;
  gap: 16px;
}

.chunk-hit-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 18px;
  border: 1px solid #dbe8e4;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  padding: 18px 18px 16px;
  box-shadow: 0 1px 2px rgba(104, 127, 149, 0.03);
  animation: chunk-hit-enter 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--chunk-index) * 90ms);
}

.chunk-hit-card__rank {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(180deg, #ecfbf7 0%, #f2fbfc 100%);
  color: #0b6d67;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 13px;
  font-weight: 760;
}

.chunk-hit-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chunk-hit-card__head h4 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  font-weight: 760;
  line-height: 1.42;
}

.chunk-hit-card__head strong {
  flex-shrink: 0;
  color: #0f776f;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 14px;
  font-weight: 760;
  line-height: 1.2;
}

.chunk-hit-card__main > p {
  margin: 10px 0 0;
  color: #17324b;
  font-size: 14px;
  line-height: 1.8;
}

.process-collapse-enter-active,
.process-collapse-leave-active {
  transition: all 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.process-collapse-enter-from,
.process-collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.evidence-drawer-enter-active .evidence-drawer,
.evidence-drawer-leave-active .evidence-drawer {
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.evidence-drawer-enter-active .evidence-drawer__mask,
.evidence-drawer-leave-active .evidence-drawer__mask {
  transition: opacity 200ms ease;
}

.evidence-drawer-enter-from .evidence-drawer,
.evidence-drawer-leave-to .evidence-drawer {
  transform: translateX(100%);
}

.evidence-drawer-enter-from .evidence-drawer__mask,
.evidence-drawer-leave-to .evidence-drawer__mask {
  opacity: 0;
}

@keyframes chunk-hit-enter {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1180px) {
  .evidence-drawer {
    width: min(640px, calc(100vw - 24px));
  }

  .evidence-panel__top {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .recall-entry-button {
    grid-template-columns: 1fr auto;
  }

  .recall-entry-button__label,
  .recall-entry-button__count,
  .recall-entry-button__meta {
    grid-column: 1 / 2;
  }

  .recall-entry-button__arrow {
    grid-column: 2 / 3;
    grid-row: 1 / span 3;
    align-self: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chunk-hit-card {
    animation: none !important;
  }

  .thought-entry__source-arrow,
  .recall-entry-button,
  .recall-entry-button__arrow,
  .answer-action,
  .evidence-drawer__close {
    transition-duration: 0.01ms !important;
  }

  .process-collapse-enter-active,
  .process-collapse-leave-active,
  .evidence-drawer-enter-active,
  .evidence-drawer-leave-active {
    transition-duration: 0.01ms !important;
  }
}

/* 思考过程使用阅读式步骤，不复用旧项目的节点连线样式。 */
.thinking-shell {
  width: min(860px, 100%);
  border-top: 1px solid #e8e8e2;
  border-bottom: 1px solid #e8e8e2;
}

.thinking-header {
  padding: 15px 0;
}

.thinking-header__title,
.thinking-header__shine {
  color: #252523;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 14px;
  font-weight: 600;
}

.thinking-header__meta {
  color: #8a8a83;
  font-size: 11px;
  font-weight: 500;
}

.thinking-panel {
  padding: 0;
}

.thinking-timeline {
  padding: 0;
  counter-reset: thought-step;
}

.thought-entry {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 14px;
  padding: 17px 0;
  border-top: 1px solid #e8e8e2;
  border-left: 0;
  counter-increment: thought-step;
}

.thought-entry::before {
  color: #5b5bf7;
  content: counter(thought-step, decimal-leading-zero);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
}

.thought-entry:not(:last-child),
.thought-entry:last-child {
  padding-bottom: 17px;
}

.thought-entry__dot-shell {
  display: none;
}

.thought-entry__title,
.thought-entry__title--active {
  color: #252523;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 13px;
  font-weight: 600;
}

.thought-entry__note,
.thought-entry__source,
.thought-entry__body {
  color: #5f5f59;
}

.thought-entry__body {
  margin-top: 8px;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 13px;
  line-height: 1.75;
}

/* 详情抽屉沿用 Demo 的纸面阅读结构，业务字段保持完整。 */
.evidence-drawer__mask {
  background: rgba(25, 25, 24, 0.14);
}

.evidence-drawer {
  width: min(500px, 100vw);
  padding: 0 24px 32px;
  border-left: 1px solid #e8e8e2;
  background: #fafaf7;
  box-shadow: -18px 0 48px rgba(30, 30, 25, 0.08);
}

.evidence-drawer__header {
  min-height: 80px;
  margin: 0 -24px;
  padding: 0 24px;
  border-bottom: 1px solid #e8e8e2;
  background: #fff;
}

.evidence-drawer__header strong {
  color: #191918;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 16px;
  font-weight: 600;
}

.evidence-drawer__header span {
  color: #777770;
  font-size: 11px;
}

.evidence-drawer__close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #777770;
}

.evidence-drawer__close:hover {
  border: 0;
  background: #efefea;
  color: #191918;
}

.evidence-drawer__tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 -24px 24px;
  border-bottom: 1px solid #e8e8e2;
  background: #fff;
}

.evidence-drawer__tabs button {
  position: relative;
  border: 0;
  background: transparent;
  padding: 15px 8px;
  color: #777770;
  font-size: 12px;
  cursor: pointer;
}

.evidence-drawer__tabs button::after {
  position: absolute;
  right: 22%;
  bottom: -1px;
  left: 22%;
  height: 2px;
  background: #5b5bf7;
  content: "";
  opacity: 0;
  transform: scaleX(0.6);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.evidence-drawer__tabs button:hover,
.evidence-drawer__tabs button.is-active {
  color: #191918;
}

.evidence-drawer__tabs button.is-active::after {
  opacity: 1;
  transform: scaleX(1);
}

.evidence-panel__top {
  grid-template-columns: 1fr;
  gap: 0;
  margin-bottom: 28px;
  border-top: 1px solid #e8e8e2;
}

.evidence-summary {
  min-height: 0;
  padding: 16px 0;
  border: 0;
  border-bottom: 1px solid #e8e8e2;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.evidence-summary--query p,
.retrieval-query-card p,
.chunk-hit-card blockquote {
  color: #44443f;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  line-height: 1.75;
}

.evidence-summary--score strong {
  color: #5b5bf7;
  font-family: ui-serif, Georgia, serif;
  font-size: 25px;
  font-weight: 600;
}

.evidence-summary--score p,
.retrieval-debug-panel__header span {
  color: #777770;
}

.evidence-label {
  color: #8a8a83;
  font-size: 11px;
  font-weight: 500;
}

.retrieval-debug-panel {
  margin-bottom: 30px;
}

.retrieval-debug-panel__header strong,
.retrieval-decision h3 {
  color: #191918;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 15px;
  font-weight: 600;
}

.retrieval-debug-metrics {
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  margin-bottom: 18px;
  border-top: 1px solid #e8e8e2;
  border-bottom: 1px solid #e8e8e2;
}

.retrieval-debug-card,
.retrieval-query-card {
  padding: 13px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.retrieval-debug-card:nth-child(even) {
  padding-left: 14px;
  border-left: 1px solid #e8e8e2;
}

.retrieval-debug-card strong {
  margin-top: 7px;
  color: #191918;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
}

.retrieval-debug-queries {
  gap: 0;
}

.retrieval-query-card + .retrieval-query-card {
  border-top: 1px solid #e8e8e2;
}

.retrieval-decision {
  margin-top: 28px;
}

.retrieval-decision h3 {
  margin: 0 0 12px;
}

.detail-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border-top: 1px solid #e8e8e2;
}

.detail-field-grid > div {
  min-width: 0;
  padding: 11px 8px 12px 0;
  border-bottom: 1px solid #e8e8e2;
}

.detail-field-grid > div:nth-child(even) {
  padding-left: 14px;
  border-left: 1px solid #e8e8e2;
}

.detail-field-grid dt {
  color: #96968e;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.detail-field-grid dd {
  margin: 6px 0 0;
  color: #343431;
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.detail-field-grid dd.is-pass {
  color: #33855a;
  font-weight: 600;
}

.drawer-result-count {
  margin: 0 0 10px;
  color: #777770;
  font-size: 11px;
}

.source-index {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding-bottom: 18px;
  border-bottom: 1px solid #e8e8e2;
}

.source-index button {
  min-width: 30px;
  height: 30px;
  border: 1px solid #deded7;
  border-radius: 6px;
  background: #fff;
  color: #777770;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 10px;
  cursor: pointer;
}

.source-index button:hover,
.source-index button.is-active {
  border-color: #7777ff;
  color: #5b5bf7;
}

.chunk-hit-list {
  gap: 0;
}

.chunk-hit-card {
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  padding: 20px 0;
  border: 0;
  border-bottom: 1px solid #e8e8e2;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.chunk-hit-card__rank {
  width: 34px;
  height: 34px;
  border: 1px solid #d8d8d1;
  border-radius: 6px;
  background: #fff;
  color: #5b5bf7;
  font-size: 11px;
}

.chunk-hit-card__head {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 9px;
}

.chunk-hit-card__head h4 {
  color: #191918;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 14px;
  font-weight: 600;
}

.chunk-hit-card__head span {
  display: block;
  margin-top: 3px;
  color: #8a8a83;
  font-size: 10px;
  line-height: 1.45;
}

.chunk-hit-card__head strong {
  color: #33855a;
  font-size: 12px;
}

.chunk-hit-card blockquote {
  margin: 18px 0;
  border-left: 2px solid #7777ff;
  padding: 2px 0 2px 14px;
  font-size: 13px;
  white-space: pre-wrap;
}

.source-feature-grid {
  margin-top: 4px;
}

.run-process-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.run-process-list li {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 13px;
  padding: 18px 0;
  border-bottom: 1px solid #e8e8e2;
}

.run-process-list__index {
  color: #5b5bf7;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
}

.run-process-list header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.run-process-list header strong {
  color: #191918;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 14px;
  font-weight: 600;
}

.run-process-list header span {
  color: #8a8a83;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 9px;
  text-transform: uppercase;
}

.run-process-list header span.is-done {
  color: #33855a;
}

.run-process-list p {
  margin: 7px 0 0;
  color: #5f5f59;
  font-size: 12px;
  line-height: 1.65;
}

.run-process-list__body {
  margin-top: 11px;
  border-left: 2px solid #deded7;
  padding-left: 12px;
  color: #44443f;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 12px;
  line-height: 1.72;
  white-space: pre-wrap;
}

@media (max-width: 640px) {
  .evidence-drawer {
    width: 100%;
    padding-inline: 16px;
  }

  .evidence-drawer__header,
  .evidence-drawer__tabs {
    margin-inline: -16px;
    padding-inline: 16px;
  }

  .retrieval-debug-metrics,
  .detail-field-grid {
    grid-template-columns: 1fr;
  }

  .retrieval-debug-card:nth-child(even),
  .detail-field-grid > div:nth-child(even) {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
