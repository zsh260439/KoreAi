<script setup lang="ts">
import {
  Braces,
  ChevronDown,
  Check,
  Copy,
  FileText,
  PanelRight,
  RefreshCw,
  Search,
  X,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";

import { useWorkspaceCacheStore } from "@/stores/workspace-cache";
import type {
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  WorkspaceMessage,
} from "share-type";

type DrawerTab = "evidence" | "query" | "json";

type TraceField = {
  key: string;
  value: string | number;
};

type TraceStatus = "pass" | "warn" | "blocked" | "neutral";

type TraceStep = {
  key: string;
  title: string;
  summary: string;
  status: TraceStatus;
  fields: TraceField[];
};

type DiagnosticCard = {
  label: string;
  value: string;
  hint: string;
  status: TraceStatus;
};

type SourceSummary = {
  chunkId: string;
  index: number;
  documentName: string;
  title: string;
  score: string;
  matchedBy: string;
  evidenceTerms: number;
  numericTerms: number;
};

const cache = useWorkspaceCacheStore();
const { conversations, messagesByConversation } = storeToRefs(cache);
const selectedConversationId = ref("");
const selectedMessageId = ref("");
const searchValue = ref("");
const isLoading = ref(false);
const loadingConversationId = ref("");
const errorMessage = ref("");
const visibleConversationCount = ref(80);
const drawerOpen = ref(false);
const drawerTab = ref<DrawerTab>("evidence");
const selectedSourceIndex = ref(0);
const jsonCopied = ref(false);

const filteredConversations = computed(() => {
  const keyword = searchValue.value.trim().toLowerCase();
  if (!keyword) return conversations.value;

  return conversations.value.filter((conversation) =>
    `${conversation.title} ${conversation.model ?? ""}`
      .toLowerCase()
      .includes(keyword),
  );
});

const visibleConversations = computed(() =>
  filteredConversations.value.slice(0, visibleConversationCount.value),
);

const messages = computed<WorkspaceMessage[]>(
  () => messagesByConversation.value[selectedConversationId.value] ?? [],
);

const activeConversation = computed(
  () =>
    conversations.value.find(
      (conversation) => conversation.id === selectedConversationId.value,
    ) ?? null,
);

const assistantMessages = computed(() =>
  messages.value.filter((message) => message.role === "assistant"),
);

const activeMessage = computed(
  () =>
    assistantMessages.value.find(
      (message) => message.id === selectedMessageId.value,
    ) ?? null,
);

const activeDebug = computed<KnowledgeSearchDebugInfo | null>(
  () => activeMessage.value?.retrievalDebug ?? null,
);

const activeSources = computed<KnowledgeSearchHit[]>(
  () => activeMessage.value?.citations ?? [],
);

const activeSource = computed(
  () => activeSources.value[selectedSourceIndex.value] ?? null,
);

const diagnosticCards = computed<DiagnosticCard[]>(() => {
  const debug = activeDebug.value;
  const message = activeMessage.value;
  if (!message) return [];

  return [
    {
      label: "证据门禁",
      value: debug?.evidenceGateStatus ?? "未记录",
      hint: `覆盖率 ${formatPercent(debug?.evidenceCoverage)}`,
      status: statusFromGate(debug?.evidenceGateStatus),
    },
    {
      label: "LLM 意图",
      value: debug?.llmIntent ?? "未触发",
      hint: debug?.memoryIntent ? `记忆 ${debug.memoryIntent}` : "展示已持久化意图",
      status: debug?.llmIntent || debug?.memoryIntent ? "pass" : "neutral",
    },
    {
      label: "路由来源",
      value: debug?.routeSource ?? "未记录",
      hint: debug?.fallbackApplied
        ? `fallback: ${debug.fallbackReason ?? "已触发"}`
        : `mode: ${debug?.retrievalMode ?? "未记录"}`,
      status: debug?.fallbackApplied ? "warn" : "pass",
    },
    {
      label: "回答出口",
      value: resolveAnswerOutlet(debug, activeSources.value),
      hint: `${activeSources.value.length} 个引用 chunk`,
      status: debug?.evidenceGateStatus === "blocked" ? "warn" : "pass",
    },
    {
      label: "总耗时",
      value: formatDuration(message.latencyMs),
      hint: formatStageTimings(debug),
      status: "neutral",
    },
  ];
});

const sourceSummaries = computed<SourceSummary[]>(() =>
  activeSources.value.map((source, index) => ({
    chunkId: source.chunkId,
    index,
    documentName: source.documentName,
    title: source.primaryTitle || source.sectionPath || "未标记章节",
    score: formatScore(source.score),
    matchedBy: source.scoreDetail?.matchedBy.join(" + ") || "unknown",
    evidenceTerms: source.scoreDetail?.matchedEvidenceTerms?.length ?? 0,
    numericTerms: source.scoreDetail?.matchedNumericTerms?.length ?? 0,
  })),
);

const traceSteps = computed<TraceStep[]>(() => {
  const message = activeMessage.value;
  const debug = activeDebug.value;
  if (!message) return [];

  return [
    {
      key: "request",
      title: "请求",
      summary: "保留用户问题和本次问答开关。",
      status: "neutral",
      fields: compactFields([
        field("originalQuery", debug?.originalQuery),
        field("think", yesNo(message.promptCapabilities?.think)),
        field("rewrite", yesNo(message.promptCapabilities?.rewrite)),
      ]),
    },
    {
      key: "query",
      title: "查询理解",
      summary: debug?.rewriteApplied
        ? "查询经过分析后进入检索。"
        : "查询未改写，直接进入检索。",
      status: debug?.rewriteApplied || debug?.memoryApplied ? "pass" : "neutral",
      fields: compactFields([
        field("normalizedQuery", debug?.normalizedQuery),
        field("retrievalMode", debug?.retrievalMode),
        field("routeType", debug?.routeType),
        field("routeSource", debug?.routeSource),
        field("routeConfidence", debug?.routeConfidence),
        field("memoryIntent", debug?.memoryIntent),
        field("memoryApplied", yesNo(debug?.memoryApplied)),
        field("memoryGroundedQuery", debug?.memoryGroundedQuery),
        field("memoryBoard", debug?.memoryBoardSummary),
        field("memoryBoardSource", debug?.memoryBoardSource),
        field("memoryRetrievalHints", debug?.memoryRetrievalHints?.join(" · ")),
        field("appliedMemoryRetrievalHints", debug?.appliedMemoryRetrievalHints?.join(" · ")),
        field("droppedMemoryRetrievalHints", debug?.droppedMemoryRetrievalHints?.join(" · ")),
        field("memoryHintConflict", yesNo(debug?.memoryHintConflict)),
        field("memorySelectedEntries", formatMemorySelectedEntries(debug?.memoryMatchDebug)),
        field("memoryDroppedEntries", formatMemoryDroppedEntries(debug?.memoryMatchDebug)),
        field("memoryClarificationCandidates", formatMemoryClarificationCandidates(debug?.memoryClarificationCandidates)),
        field("memoryLatency", formatDurationMs(debug?.stageTimingsMs?.memory)),
        field("protectedTerms", debug?.protectedTerms?.join(" · ")),
        field("llmIntent", debug?.llmIntent),
      ]),
    },
    {
      key: "retrieval",
      title: "候选召回",
      summary: `BM25 与向量召回形成候选，最终保留 ${activeSources.value.length} 个片段。`,
      status: debug?.fallbackApplied || debug?.secondLevelRrfApplied ? "warn" : "pass",
      fields: compactFields([
        field("bm25HitCount", debug?.bm25HitCount),
        field("vectorHitCount", debug?.vectorHitCount),
        field("candidateLimit", debug?.candidateLimit),
        field("ceCandidateCount", debug?.ceCandidateCount),
        field("secondLevelRrfApplied", yesNo(debug?.secondLevelRrfApplied)),
        field("secondLevelRrfQueries", debug?.secondLevelRrfQueries?.join(" · ")),
        field("appliedQueryMappings", debug?.appliedQueryMappings?.join(" · ")),
        field("queryMappingTerms", debug?.queryMappingTerms?.join(" · ")),
        field("retrievalLatency", formatDurationMs(debug?.stageTimingsMs?.retrieval)),
        field("ceLatency", formatDurationMs(debug?.stageTimingsMs?.ce)),
        field("bm25Weight", formatScore(debug?.bm25Weight)),
        field("vectorWeight", formatScore(debug?.vectorWeight)),
        field("fallbackApplied", yesNo(debug?.fallbackApplied)),
        field("fallbackReason", debug?.fallbackReason),
        field("exactEntityMiss", yesNo(debug?.exactEntityMiss)),
      ]),
    },
    {
      key: "evidence",
      title: "证据筛选",
      summary: `${activeSources.value.length} 个片段进入最终证据集；覆盖率表示检索信号覆盖，不等同于每个问题字段都有答案。`,
      status: statusFromGate(debug?.evidenceGateStatus),
      fields: compactFields([
        field("effectiveTopK", debug?.effectiveTopK),
        field("evidenceComplexity", debug?.evidenceComplexity),
        field("evidenceCoverage", formatPercent(debug?.evidenceCoverage)),
        field(
          "evidenceExpansionApplied",
          yesNo(debug?.evidenceExpansionApplied),
        ),
        field("evidenceGateStatus", debug?.evidenceGateStatus),
      ]),
    },
    {
      key: "answer",
      title: "回答生成",
      summary: `最终回答记录 ${activeSources.value.length} 个来源。`,
      status: debug?.evidenceGateStatus === "blocked" ? "warn" : "pass",
      fields: compactFields([
        field("model", message.model),
        field("latencyMs", message.latencyMs),
        field("qaLatency", formatDurationMs(debug?.stageTimingsMs?.qa)),
        field("repairLatency", formatDurationMs(debug?.stageTimingsMs?.repair)),
        field("totalTokens", message.totalTokens),
        field("reasoningSteps", message.reasoningSteps?.length),
      ]),
    },
  ];
});

const queryFields = computed(() => {
  const debug = activeDebug.value;
  if (!debug) return [];

  return compactFields([
    field("originalQuery", debug.originalQuery),
    field("normalizedQuery", debug.normalizedQuery),
    field("bm25Query", debug.bm25Query),
    field("vectorQuery", debug.vectorQuery),
    field("memoryIntent", debug.memoryIntent),
    field("memoryApplied", yesNo(debug.memoryApplied)),
    field("memoryGroundedQuery", debug.memoryGroundedQuery),
    field("memoryBoard", debug.memoryBoardSummary),
    field("memoryBoardSource", debug.memoryBoardSource),
    field("memoryRetrievalHints", debug.memoryRetrievalHints?.join(" · ")),
    field("appliedMemoryRetrievalHints", debug.appliedMemoryRetrievalHints?.join(" · ")),
    field("droppedMemoryRetrievalHints", debug.droppedMemoryRetrievalHints?.join(" · ")),
    field("memoryHintConflict", yesNo(debug.memoryHintConflict)),
    field("memorySelectedEntries", formatMemorySelectedEntries(debug.memoryMatchDebug)),
    field("memoryDroppedEntries", formatMemoryDroppedEntries(debug.memoryMatchDebug)),
    field("memoryClarificationCandidates", formatMemoryClarificationCandidates(debug.memoryClarificationCandidates)),
    field("memoryLatencyMs", debug.memoryLatencyMs),
    field("rewriteApplied", yesNo(debug.rewriteApplied)),
    field("retrievalMode", debug.retrievalMode),
    field("routeType", debug.routeType),
    field("routeSource", debug.routeSource),
    field("routeConfidence", debug.routeConfidence),
    field("llmIntent", debug.llmIntent),
    field("protectedTerms", debug.protectedTerms?.join(" · ")),
    field("excludedTerms", debug.excludedTerms?.join(" · ")),
    field("bm25Weight", formatScore(debug.bm25Weight)),
    field("vectorWeight", formatScore(debug.vectorWeight)),
    field("bm25HitCount", debug.bm25HitCount),
    field("vectorHitCount", debug.vectorHitCount),
    field("candidateLimit", debug.candidateLimit),
    field("ceCandidateCount", debug.ceCandidateCount),
    field("secondLevelRrfApplied", yesNo(debug.secondLevelRrfApplied)),
    field("secondLevelRrfQueries", debug.secondLevelRrfQueries?.join(" · ")),
    field("appliedQueryMappings", debug.appliedQueryMappings?.join(" · ")),
    field("queryMappingTerms", debug.queryMappingTerms?.join(" · ")),
    field("stage.memory", formatDurationMs(debug.stageTimingsMs?.memory)),
    field("stage.queryAnalysis", formatDurationMs(debug.stageTimingsMs?.queryAnalysis)),
    field("stage.retrieval", formatDurationMs(debug.stageTimingsMs?.retrieval)),
    field("stage.ce", formatDurationMs(debug.stageTimingsMs?.ce)),
    field("stage.qa", formatDurationMs(debug.stageTimingsMs?.qa)),
    field("stage.repair", formatDurationMs(debug.stageTimingsMs?.repair)),
    field("effectiveTopK", debug.effectiveTopK),
    field("evidenceComplexity", debug.evidenceComplexity),
    field("evidenceCoverage", formatPercent(debug.evidenceCoverage)),
    field("evidenceGateStatus", debug.evidenceGateStatus),
    field("fallbackApplied", yesNo(debug.fallbackApplied)),
    field("fallbackReason", debug.fallbackReason),
    field("exactEntityMiss", yesNo(debug.exactEntityMiss)),
  ]);
});

const sourceFields = computed(() => {
  const source = activeSource.value;
  if (!source) return [];

  const detail = source.scoreDetail;
  return compactFields([
    field("matchedBy", detail?.matchedBy.join(" + ")),
    field("score", formatScore(source.score)),
    field("bm25Score", formatScore(detail?.bm25Score)),
    field("vectorScore", formatScore(detail?.vectorScore)),
    field("fusedScore", formatScore(detail?.fusedScore)),
    field("ceScore", formatScore(detail?.ceScore)),
    field("evidenceScore", formatScore(detail?.evidenceScore)),
    field("chunkId", source.chunkId),
    field("documentId", source.documentId),
    field("sequence", source.sequence),
    field("sectionPath", source.sectionPath),
    field("primaryTitle", source.primaryTitle),
    field("matchedEvidenceTerms", detail?.matchedEvidenceTerms?.join(" · ")),
    field("matchedNumericTerms", detail?.matchedNumericTerms?.join(" · ")),
    field("documentRole", detail?.documentRole),
  ]);
});

const persistedTraceJson = computed(() => {
  const message = activeMessage.value;
  if (!message) return "";

  return JSON.stringify(
    {
      message: {
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        model: message.model,
        latencyMs: message.latencyMs,
        totalTokens: message.totalTokens,
        promptCapabilities: message.promptCapabilities,
        reasoningSteps: message.reasoningSteps,
      },
      retrievalDebug: message.retrievalDebug,
      citations: message.citations,
    },
    null,
    2,
  );
});

const isLoadingMessages = computed(
  () => loadingConversationId.value === selectedConversationId.value,
);

const loadConversations = async (force = false) => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await cache.loadConversations(1, 20, force);
    if (!selectedConversationId.value && conversations.value[0]) {
      await selectConversation(conversations.value[0].id);
    }
  } catch {
    errorMessage.value = "无法加载会话记录";
  } finally {
    isLoading.value = false;
  }
};

const selectConversation = async (conversationId: string) => {
  if (
    conversationId === selectedConversationId.value &&
    cache.hasConversationMessages(conversationId)
  )
    return;

  selectedConversationId.value = conversationId;
  selectedMessageId.value = "";
  drawerOpen.value = false;

  if (cache.hasConversationMessages(conversationId)) {
    selectedMessageId.value =
      (messagesByConversation.value[conversationId] ?? [])
        .filter((message) => message.role === "assistant")
        .at(-1)?.id ?? "";
    return;
  }

  loadingConversationId.value = conversationId;
  try {
    const loadedMessages = await cache.loadConversationMessages(conversationId);
    if (selectedConversationId.value === conversationId) {
      selectedMessageId.value =
        loadedMessages.filter((message) => message.role === "assistant").at(-1)
          ?.id ?? "";
    }
  } catch {
    errorMessage.value = "无法加载会话消息";
  } finally {
    if (loadingConversationId.value === conversationId)
      loadingConversationId.value = "";
  }
};

const selectMessage = (messageId: string) => {
  selectedMessageId.value = messageId;
  drawerOpen.value = false;
};

const showDrawer = (tab: DrawerTab, sourceIndex = 0) => {
  drawerTab.value = tab;
  selectedSourceIndex.value = Math.min(
    sourceIndex,
    Math.max(0, activeSources.value.length - 1),
  );
  drawerOpen.value = true;
};

const copyPersistedTraceJson = async () => {
  if (!persistedTraceJson.value) {
    return;
  }

  await navigator.clipboard.writeText(persistedTraceJson.value);
  jsonCopied.value = true;
  window.setTimeout(() => {
    jsonCopied.value = false;
  }, 1400);
};

const handleConversationScroll = (event: Event) => {
  const container = event.currentTarget as HTMLElement;
  if (
    container.scrollHeight - container.scrollTop - container.clientHeight <
    120
  ) {
    visibleConversationCount.value = Math.min(
      visibleConversationCount.value + 80,
      filteredConversations.value.length,
    );
  }
};

function field(key: string, value?: string | number | null): TraceField | null {
  return value === undefined || value === null || value === "" || value === "-"
    ? null
    : { key, value };
}

function formatMemorySelectedEntries(
  value: KnowledgeSearchDebugInfo["memoryMatchDebug"] | null | undefined,
): string {
  return value?.selected.length
    ? value.selected
        .map((item) =>
          `${item.documentName} [${item.reason}, score=${item.score}, firstSeen=${formatTraceOptionalValue(item.firstSeen)}, lastSeen=${formatTraceOptionalValue(item.lastSeen)}, mentionOrder=${formatTraceOptionalValue(item.mentionOrder)}]`,
        )
        .join(" · ")
    : "-";
}

function formatMemoryDroppedEntries(
  value: KnowledgeSearchDebugInfo["memoryMatchDebug"] | null | undefined,
): string {
  return value?.dropped.length
    ? value.dropped
        .map(
          (item) =>
            `${item.documentName} [${item.reason}, firstSeen=${formatTraceOptionalValue(item.firstSeen)}, lastSeen=${formatTraceOptionalValue(item.lastSeen)}, mentionOrder=${formatTraceOptionalValue(item.mentionOrder)}]`,
        )
        .join(" · ")
    : "-";
}

function formatMemoryClarificationCandidates(
  value: KnowledgeSearchDebugInfo["memoryClarificationCandidates"] | null | undefined,
): string {
  return value?.length
    ? value
        .map(
          (item) =>
            `${item.documentName} [firstSeen=${formatTraceOptionalValue(item.firstSeen)}, lastSeen=${formatTraceOptionalValue(item.lastSeen)}, mentionOrder=${formatTraceOptionalValue(item.mentionOrder)}]`,
        )
        .join(" 路 ")
    : "-";
}

function formatTraceOptionalValue(value?: number | string | null): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function compactFields(fields: Array<TraceField | null>): TraceField[] {
  return fields.filter((item): item is TraceField => Boolean(item));
}

function yesNo(value?: boolean): string | null {
  return typeof value === "boolean" ? (value ? "是" : "否") : null;
}

function formatScore(value?: number | null): string {
  return typeof value === "number" ? value.toFixed(3) : "-";
}

function formatPercent(value?: number | null): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "-";
}

function formatDuration(milliseconds: number | null): string {
  if (!milliseconds) return "未记录";
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} 秒`;
}

function formatDurationMs(milliseconds?: number | null): string {
  if (typeof milliseconds !== "number") return "-";
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} 秒`;
}

function statusFromGate(
  gate?: KnowledgeSearchDebugInfo["evidenceGateStatus"] | null,
): TraceStatus {
  if (gate === "pass") return "pass";
  if (gate === "blocked") return "blocked";
  if (gate === "degraded") return "warn";
  return "neutral";
}

function resolveAnswerOutlet(
  debug: KnowledgeSearchDebugInfo | null,
  sources: KnowledgeSearchHit[],
): string {
  if (!debug) return "未记录";
  if (debug.evidenceGateStatus === "blocked" && sources.length === 0) {
    return "通用回答 / 无引用";
  }
  if (debug.evidenceGateStatus === "blocked") {
    return "证据拒答";
  }
  return "知识库问答";
}

function formatStageTimings(debug: KnowledgeSearchDebugInfo | null): string {
  if (!debug?.stageTimingsMs) return "阶段耗时未记录";

  return [
    ["memory", debug.stageTimingsMs.memory],
    ["query", debug.stageTimingsMs.queryAnalysis],
    ["retrieval", debug.stageTimingsMs.retrieval],
    ["ce", debug.stageTimingsMs.ce],
    ["qa", debug.stageTimingsMs.qa],
    ["repair", debug.stageTimingsMs.repair],
  ]
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => `${key} ${formatDurationMs(value as number)}`)
    .join(" · ") || "阶段耗时未记录";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

watch(searchValue, () => {
  visibleConversationCount.value = 80;
});

onMounted(() => loadConversations());
</script>

<template>
  <section class="trace-page">
    <header class="page-header">
      <div>
        <h1>链路追踪</h1>
        <span>从问题到回答，查看一次真实运行</span>
      </div>
      <div class="header-actions">
        <button
          type="button"
          :disabled="isLoading"
          @click="loadConversations(true)"
        >
          <RefreshCw :class="['h-4 w-4', { 'animate-spin': isLoading }]" />刷新
        </button>
        <button
          type="button"
          aria-label="查看详情"
          :disabled="!activeMessage"
          @click="showDrawer('evidence')"
        >
          <PanelRight class="h-4 w-4" />
        </button>
      </div>
    </header>

    <div class="page-scroll">
      <div class="trace-content">
        <p v-if="errorMessage" class="trace-error">{{ errorMessage }}</p>

        <section class="trace-picker">
          <header>
            <div>
              <h2>选择运行记录</h2>
              <span>{{ filteredConversations.length }} 个会话</span>
            </div>
            <label
              ><Search class="h-4 w-4" /><input
                v-model="searchValue"
                type="search"
                placeholder="筛选会话"
            /></label>
          </header>
          <div class="trace-picker__columns">
            <div
              class="trace-picker__list"
              @scroll.passive="handleConversationScroll"
            >
              <button
                v-for="conversation in visibleConversations"
                :key="conversation.id"
                type="button"
                :class="{
                  'is-active': conversation.id === selectedConversationId,
                }"
                @click="selectConversation(conversation.id)"
              >
                <strong>{{ conversation.title }}</strong>
                <span
                  >{{ conversation.messageCount }} 条 ·
                  {{ formatDateTime(conversation.updatedAt) }}</span
                >
              </button>
              <p v-if="!visibleConversations.length">没有匹配的会话</p>
            </div>
            <div class="trace-picker__list">
              <button
                v-for="message in assistantMessages"
                :key="message.id"
                type="button"
                :class="{ 'is-active': message.id === selectedMessageId }"
                @click="selectMessage(message.id)"
              >
                <strong>{{ message.content }}</strong>
                <span
                  >{{ formatDuration(message.latencyMs) }} ·
                  {{ message.totalTokens ?? "-" }} tokens</span
                >
              </button>
              <p v-if="isLoadingMessages">正在加载回答</p>
              <p v-else-if="!assistantMessages.length">该会话还没有 AI 回复</p>
            </div>
          </div>
        </section>

        <template v-if="activeMessage">
          <header class="trace-title">
            <span>{{ activeConversation?.title }}</span>
            <h2>{{ activeDebug?.originalQuery || "未记录原始问题" }}</h2>
            <div>
              <span>{{ activeMessage.model ?? "未记录模型" }}</span>
              <span>{{ formatDuration(activeMessage.latencyMs) }}</span>
              <span>{{ activeMessage.totalTokens ?? "-" }} tokens</span>
              <span
                :class="{ pass: activeDebug?.evidenceGateStatus === 'pass' }"
                >证据 {{ activeDebug?.evidenceGateStatus ?? "未记录" }}</span
              >
            </div>
          </header>

          <section class="diagnostic-strip" aria-label="诊断摘要">
            <article
              v-for="card in diagnosticCards"
              :key="card.label"
              :class="['diagnostic-card', `is-${card.status}`]"
            >
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
              <small>{{ card.hint }}</small>
            </article>
          </section>

          <ol class="trace-flow">
            <li v-for="(step, index) in traceSteps" :key="step.key">
              <span :class="['step-dot', `is-${step.status}`]">{{ index + 1 }}</span>
              <div>
                <header>
                  <h3>{{ step.title }}</h3>
                  <span :class="['step-status', `is-${step.status}`]">
                    {{ step.status }}
                  </span>
                </header>
                <p>{{ step.summary }}</p>
                <dl>
                  <div v-for="item in step.fields" :key="item.key">
                    <dt>{{ item.key }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                </dl>
                <button
                  v-if="step.key === 'evidence'"
                  class="text-button"
                  type="button"
                  @click="showDrawer('evidence')"
                >
                  查看全部 {{ activeSources.length }} 个 chunk 分数与原文
                </button>
                <blockquote v-if="step.key === 'answer'">
                  {{ activeMessage.content }}
                </blockquote>
              </div>
            </li>
          </ol>

          <button class="json-record" type="button" @click="showDrawer('json')">
            <span><Braces class="h-4 w-4" /><strong>持久化 JSON</strong></span>
            <span>查看消息、召回与证据的落库原值</span>
            <ChevronDown class="h-4 w-4 -rotate-90" />
          </button>
        </template>

        <div v-else class="trace-empty">选择一次 AI 回复查看完整链路</div>
      </div>
    </div>

    <Transition name="drawer">
      <div
        v-if="drawerOpen"
        class="drawer-layer"
        @click.self="drawerOpen = false"
      >
        <aside class="drawer" aria-label="运行详情">
          <header class="drawer-header">
            <div><span>回答依据</span><strong>本次检索详情</strong></div>
            <button type="button" aria-label="关闭" @click="drawerOpen = false">
              <X class="h-4 w-4" />
            </button>
          </header>
          <div class="drawer-tabs" role="tablist">
            <button
              type="button"
              :class="{ 'is-active': drawerTab === 'evidence' }"
              @click="drawerTab = 'evidence'"
            >
              证据
            </button>
            <button
              type="button"
              :class="{ 'is-active': drawerTab === 'query' }"
              @click="drawerTab = 'query'"
            >
              查询
            </button>
            <button
              type="button"
              :class="{ 'is-active': drawerTab === 'json' }"
              @click="drawerTab = 'json'"
            >
              JSON
            </button>
          </div>
          <div class="drawer-scroll">
            <template v-if="drawerTab === 'evidence'">
              <div class="drawer-result-count">
                完整召回 {{ activeSources.length }} 个 chunk
              </div>
              <div v-if="sourceSummaries.length" class="chunk-overview">
                <button
                  v-for="source in sourceSummaries"
                  :key="source.chunkId"
                  type="button"
                  :class="{ 'is-active': selectedSourceIndex === source.index }"
                  @click="selectedSourceIndex = source.index"
                >
                  <span>{{ String(source.index + 1).padStart(2, "0") }}</span>
                  <strong>{{ source.documentName }}</strong>
                  <small>{{ source.title }}</small>
                  <em>{{ source.score }}</em>
                  <i>{{ source.matchedBy }}</i>
                  <b>词 {{ source.evidenceTerms }} · 数 {{ source.numericTerms }}</b>
                </button>
              </div>
              <div class="source-index">
                <button
                  v-for="(source, index) in activeSources"
                  :key="source.chunkId"
                  type="button"
                  :class="{ 'is-active': selectedSourceIndex === index }"
                  @click="selectedSourceIndex = index"
                >
                  {{ String(index + 1).padStart(2, "0") }}
                </button>
              </div>
              <article v-if="activeSource" class="source-detail">
                <header>
                  <FileText class="h-5 w-5" />
                  <div>
                    <strong>{{ activeSource.documentName }}</strong
                    ><span>{{
                      activeSource.primaryTitle ||
                      activeSource.sectionPath ||
                      "未标记章节"
                    }}</span>
                  </div>
                  <em>{{ formatScore(activeSource.score) }}</em>
                </header>
                <blockquote>{{ activeSource.content }}</blockquote>
                <dl class="score-grid">
                  <div v-for="item in sourceFields" :key="item.key">
                    <dt>{{ item.key }}</dt>
                    <dd>{{ item.value }}</dd>
                  </div>
                </dl>
              </article>
              <p v-else class="drawer-empty">本次回答没有保存证据片段</p>
            </template>

            <section v-else-if="drawerTab === 'query'" class="query-detail">
              <header class="query-detail__header">
                <h3>查询与检索决策</h3>
                <div v-if="activeDebug">
                  <span :class="['status-chip', `is-${statusFromGate(activeDebug.evidenceGateStatus)}`]">
                    gate {{ activeDebug.evidenceGateStatus ?? "unknown" }}
                  </span>
                  <span class="status-chip is-neutral">
                    intent {{ activeDebug.llmIntent ?? activeDebug.memoryIntent ?? "none" }}
                  </span>
                  <span class="status-chip is-neutral">
                    route {{ activeDebug.routeSource ?? "unknown" }}
                  </span>
                </div>
              </header>
              <dl class="score-grid">
                <div v-for="item in queryFields" :key="item.key">
                  <dt>{{ item.key }}</dt>
                  <dd>{{ item.value }}</dd>
                </div>
              </dl>
            </section>

            <section v-else class="json-detail">
              <header class="json-detail__header">
                <h3>持久化 JSON</h3>
                <button
                  type="button"
                  class="json-copy-button"
                  :aria-label="jsonCopied ? '已复制' : '复制 JSON'"
                  @click="copyPersistedTraceJson"
                >
                  <Check v-if="jsonCopied" class="h-4 w-4" />
                  <Copy v-else class="h-4 w-4" />
                  {{ jsonCopied ? "已复制" : "复制" }}
                </button>
              </header>
              <p>
                这里展示系统实际保存的链路字段，可直接复制到调试记录中。
              </p>
              <pre><code>{{ persistedTraceJson }}</code></pre>
            </section>
          </div>
        </aside>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.trace-page {
  position: relative;
  display: grid;
  height: 100%;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  background: #fafaf7;
  color: #191918;
}
.page-header {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  padding: 0 25px;
  border-bottom: 1px solid #e8e8e2;
  background: rgb(250 250 247 / 94%);
}
.page-header > div:first-child {
  display: grid;
  gap: 3px;
}
.page-header h1 {
  margin: 0;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.page-header span {
  color: #777770;
  font-size: 12px;
}
.header-actions {
  display: flex;
  gap: 7px;
}
.header-actions button,
.drawer-header button {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 7px;
  border: 1px solid #d8d8d1;
  border-radius: 7px;
  background: #fff;
  padding: 0 10px;
  color: #55554f;
  font-size: 12px;
}
.header-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.page-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.trace-content {
  width: min(920px, calc(100% - 64px));
  margin: auto;
  padding: 48px 0 90px;
}
.trace-error {
  margin: 0 0 18px;
  color: #b42318;
  font-size: 12px;
}
.trace-picker {
  margin-bottom: 42px;
  border-top: 1px solid #d8d8d1;
  border-bottom: 1px solid #d8d8d1;
}
.trace-picker > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 4px;
}
.trace-picker > header > div {
  display: flex;
  align-items: baseline;
  gap: 9px;
}
.trace-picker h2 {
  margin: 0;
  font:
    600 15px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.trace-picker header span {
  color: #777770;
  font-size: 11px;
}
.trace-picker label {
  display: flex;
  height: 33px;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid #d8d8d1;
  color: #777770;
}
.trace-picker input {
  width: 150px;
  border: 0;
  outline: 0;
  background: transparent;
}
.trace-picker__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid #e8e8e2;
}
.trace-picker__list {
  max-height: 176px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 5px;
}
.trace-picker__list + .trace-picker__list {
  border-left: 1px solid #e8e8e2;
}
.trace-picker__list button {
  display: grid;
  width: 100%;
  gap: 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  padding: 9px 10px;
  text-align: left;
}
.trace-picker__list button:hover,
.trace-picker__list button.is-active {
  background: #efefea;
}
.trace-picker__list button.is-active {
  color: #4d4dd1;
}
.trace-picker__list strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trace-picker__list span,
.trace-picker__list p {
  margin: 0;
  color: #777770;
  font-size: 10px;
}
.trace-picker__list p {
  padding: 24px;
  text-align: center;
}
.trace-title {
  padding-bottom: 34px;
  border-bottom: 1px solid #d8d8d1;
}
.trace-title > span {
  color: #5b5bf7;
  font-size: 12px;
}
.trace-title h2 {
  max-width: 760px;
  margin: 13px 0 18px;
  font:
    500 28px/1.4 ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.trace-title > div {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  color: #777770;
  font-size: 12px;
}
.pass {
  color: #33855a !important;
}
.diagnostic-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  margin: 18px 0 8px;
  border: 1px solid #e0e0da;
  background: #e0e0da;
}
.diagnostic-card {
  display: grid;
  min-width: 0;
  gap: 5px;
  background: #fff;
  padding: 13px 14px;
}
.diagnostic-card span,
.diagnostic-card small {
  overflow: hidden;
  color: #777770;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diagnostic-card strong {
  overflow: hidden;
  color: #191918;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diagnostic-card.is-pass strong {
  color: #23734b;
}
.diagnostic-card.is-warn strong {
  color: #9a5b12;
}
.diagnostic-card.is-blocked strong {
  color: #b42318;
}
.trace-flow {
  margin: 0;
  padding: 18px 0 34px;
  list-style: none;
}
.trace-flow li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 15px;
}
.step-dot {
  position: relative;
  z-index: 1;
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  margin-top: 22px;
  border: 1px solid #d8d8d1;
  border-radius: 50%;
  background: #fafaf7;
  font-size: 11px;
}
.step-dot.is-pass {
  border-color: #87b99d;
  color: #23734b;
}
.step-dot.is-warn {
  border-color: #d6aa62;
  color: #9a5b12;
}
.step-dot.is-blocked {
  border-color: #dc8a82;
  color: #b42318;
}
.trace-flow li:not(:last-child) > .step-dot:after {
  position: absolute;
  top: 27px;
  bottom: -190px;
  left: 12px;
  width: 1px;
  background: #e8e8e2;
  content: "";
}
.trace-flow li > div {
  padding: 21px 0 28px;
  border-bottom: 1px solid #e8e8e2;
}
.trace-flow header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.trace-flow h3 {
  margin: 0;
  font:
    600 17px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.trace-flow header span {
  color: #777770;
  font-size: 11px;
}
.step-status {
  border: 1px solid #deded8;
  border-radius: 999px;
  padding: 3px 8px;
  background: #fff;
  font:
    10px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.step-status.is-pass {
  border-color: #b9d7c5;
  background: #f2faf5;
  color: #23734b;
}
.step-status.is-warn {
  border-color: #ead0a2;
  background: #fff8ec;
  color: #9a5b12;
}
.step-status.is-blocked {
  border-color: #e8b1aa;
  background: #fff4f2;
  color: #b42318;
}
.trace-flow p {
  margin: 9px 0;
  color: #44443f;
  line-height: 1.6;
}
.trace-flow dl {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 22px;
  margin: 14px 0 0;
}
.trace-flow dl > div {
  display: flex;
  min-width: 0;
  gap: 7px;
}
.trace-flow dt {
  color: #777770;
  font:
    11px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.trace-flow dd {
  overflow: hidden;
  max-width: 420px;
  margin: 0;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-button {
  margin-top: 16px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #5b5bf7;
  font-size: 12px;
}
.trace-flow blockquote {
  margin: 15px 0 0;
  padding: 16px 0;
  border-top: 1px solid #e8e8e2;
  font:
    500 16px/1.7 ui-serif,
    Georgia,
    "Songti SC",
    serif;
  white-space: pre-wrap;
}
.json-record {
  display: grid;
  width: calc(100% - 55px);
  grid-template-columns: minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 12px;
  margin-left: 55px;
  border: 0;
  border-top: 1px solid #d8d8d1;
  border-bottom: 1px solid #d8d8d1;
  background: transparent;
  padding: 17px 4px;
  text-align: left;
}
.json-record > span:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}
.json-record > span:nth-child(2) {
  color: #777770;
  font-size: 11px;
}
.trace-empty {
  padding: 90px 0;
  color: #777770;
  text-align: center;
}
.drawer-layer {
  position: absolute;
  z-index: 20;
  inset: 0;
  background: rgb(25 25 22 / 14%);
}
.drawer {
  display: grid;
  width: min(500px, 92vw);
  height: 100%;
  grid-template-rows: auto auto 1fr;
  margin-left: auto;
  border-left: 1px solid #e8e8e2;
  background: #fff;
}
.drawer-header {
  display: flex;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid #e8e8e2;
}
.drawer-header > div {
  display: grid;
  gap: 5px;
}
.drawer-header span {
  color: #777770;
  font-size: 11px;
}
.drawer-header strong {
  font:
    600 17px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.drawer-header button {
  width: 34px;
  justify-content: center;
  padding: 0;
}
.drawer-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid #e8e8e2;
}
.drawer-tabs button {
  position: relative;
  height: 47px;
  border: 0;
  background: transparent;
  color: #777770;
  font-size: 12px;
}
.drawer-tabs button.is-active {
  color: #191918;
}
.drawer-tabs button.is-active:after {
  position: absolute;
  right: 22%;
  bottom: 0;
  left: 22%;
  height: 2px;
  background: #5b5bf7;
  content: "";
}
.drawer-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 24px;
}
.drawer-result-count {
  margin-bottom: 10px;
  color: #777770;
  font-size: 11px;
}
.chunk-overview {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}
.chunk-overview button {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 4px 10px;
  border: 1px solid #e8e8e2;
  border-radius: 9px;
  background: #fff;
  padding: 10px;
  text-align: left;
}
.chunk-overview button.is-active {
  border-color: #a8a7f5;
  background: #f7f6ff;
}
.chunk-overview span {
  grid-row: span 3;
  color: #5b5bf7;
  font:
    11px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.chunk-overview strong,
.chunk-overview small,
.chunk-overview i,
.chunk-overview b {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chunk-overview strong {
  font-size: 12px;
}
.chunk-overview small,
.chunk-overview i,
.chunk-overview b {
  color: #777770;
  font-size: 10px;
  font-style: normal;
  font-weight: 400;
}
.chunk-overview em {
  grid-column: 3;
  grid-row: 1;
  color: #23734b;
  font-size: 11px;
  font-style: normal;
}
.chunk-overview i {
  grid-column: 2;
}
.chunk-overview b {
  grid-column: 3;
  color: #55554f;
}
.source-index {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 24px;
}
.source-index button {
  width: 29px;
  height: 27px;
  border: 1px solid #d8d8d1;
  border-radius: 6px;
  background: #fff;
  color: #5b5bf7;
  font-size: 11px;
}
.source-index button.is-active {
  border-color: #5b5bf7;
  background: #f4f3ff;
}
.source-detail > header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}
.source-detail > header div {
  display: grid;
  gap: 4px;
}
.source-detail > header span {
  color: #777770;
  font-size: 11px;
}
.source-detail > header em {
  color: #33855a;
  font-size: 12px;
  font-style: normal;
}
.source-detail blockquote {
  margin: 22px 0;
  padding: 18px 0;
  border-top: 1px solid #e8e8e2;
  border-bottom: 1px solid #e8e8e2;
  font:
    15px/1.8 ui-serif,
    Georgia,
    "Songti SC",
    serif;
  white-space: pre-wrap;
}
.score-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0;
}
.score-grid > div {
  min-width: 0;
  padding: 13px 0;
  border-bottom: 1px solid #e8e8e2;
}
.score-grid > div:nth-child(even) {
  padding-left: 18px;
  border-left: 1px solid #e8e8e2;
}
.score-grid dt {
  color: #777770;
  font:
    10px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.score-grid dd {
  overflow-wrap: anywhere;
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
}
.query-detail h3,
.json-detail h3 {
  margin: 0 0 14px;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.query-detail__header {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}
.query-detail__header h3 {
  margin-bottom: 0;
}
.query-detail__header > div {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.status-chip {
  border: 1px solid #deded8;
  border-radius: 999px;
  background: #fafaf7;
  padding: 4px 8px;
  color: #55554f;
  font:
    10px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.status-chip.is-pass {
  border-color: #b9d7c5;
  background: #f2faf5;
  color: #23734b;
}
.status-chip.is-warn {
  border-color: #ead0a2;
  background: #fff8ec;
  color: #9a5b12;
}
.status-chip.is-blocked {
  border-color: #e8b1aa;
  background: #fff4f2;
  color: #b42318;
}
.json-detail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.json-detail__header h3 {
  margin-bottom: 0;
}
.json-copy-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #d8d8d1;
  border-radius: 7px;
  background: #fff;
  padding: 6px 8px;
  color: #55554f;
  font-size: 11px;
  cursor: pointer;
}
.json-copy-button:hover {
  border-color: #a8a7f5;
  color: #4d4dd1;
}
.json-copy-button:focus-visible {
  outline: 2px solid #7777e8;
  outline-offset: 2px;
}
.json-detail > p {
  margin: 0 0 14px;
  color: #777770;
  font-size: 11px;
  line-height: 1.6;
}
.json-detail pre {
  max-height: calc(100dvh - 210px);
  overflow: auto;
  margin: 0;
  border: 1px solid #e8e8e2;
  border-radius: 7px;
  background: #fafaf7;
  padding: 14px;
  overscroll-behavior: contain;
}
.json-detail code {
  font:
    11px/1.65 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  white-space: pre;
}
.drawer-empty {
  padding: 50px 0;
  color: #777770;
  text-align: center;
}
.drawer-enter-active,
.drawer-leave-active {
  transition: background 220ms ease;
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  background: transparent;
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}
@media (max-width: 760px) {
  .page-header {
    padding-inline: 15px;
  }
  .trace-content {
    width: calc(100% - 28px);
  }
  .trace-picker__columns {
    grid-template-columns: 1fr;
  }
  .trace-picker__list + .trace-picker__list {
    border-top: 1px solid #e8e8e2;
    border-left: 0;
  }
  .trace-title h2 {
    font-size: 23px;
  }
  .diagnostic-strip {
    grid-template-columns: 1fr;
  }
  .trace-flow li {
    grid-template-columns: 31px 1fr;
    gap: 8px;
  }
  .trace-flow dd {
    max-width: 220px;
  }
  .json-record {
    width: calc(100% - 39px);
    margin-left: 39px;
  }
  .json-record > span:nth-child(2) {
    display: none;
  }
  .drawer {
    width: 100%;
  }
  .chunk-overview button {
    grid-template-columns: 28px minmax(0, 1fr);
  }
  .chunk-overview em,
  .chunk-overview b {
    grid-column: 2;
  }
  .score-grid {
    grid-template-columns: 1fr;
  }
  .score-grid > div:nth-child(even) {
    padding-left: 0;
    border-left: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .drawer-layer,
  .drawer {
    transition: none !important;
  }
}
</style>
