<script setup lang="ts">
import {
  Activity,
  ArrowLeft,
  Calendar,
  Clock3,
  Copy,
  FileSearch,
  Hash,
  RefreshCw,
  Route,
  Settings2,
  User,
  Wrench,
  Zap
} from 'lucide-vue-next'
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAdminStore } from '@/stores'
import type { TraceNode } from '@/types'
import {
  clamp,
  formatDateTime,
  formatDuration,
  normalizeTraceStatus,
  statusLabel,
  toTimestamp
} from '@/views/admin/trace/traceUtils'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const traceId = computed(() => decodeURIComponent(String(route.params.traceId || '')))
const detail = computed(() => adminStore.traceDetail)
const summary = computed(() => detail.value?.summary ?? null)

const statSummary = computed(() => {
  const nodes = detail.value?.nodes ?? []
  const total = nodes.length
  const success = nodes.filter((node) => normalizeTraceStatus(node.status) === 'success').length
  const failed = nodes.filter((node) => normalizeTraceStatus(node.status) === 'failed').length
  const running = nodes.filter((node) => normalizeTraceStatus(node.status) === 'running').length
  const durations = nodes.map((node) => Number(node.durationMs || 0)).filter((value) => value > 0)
  const avgDuration = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0

  return { total, success, failed, running, avgDuration }
})

const waterfall = computed(() => {
  const nodes = detail.value?.nodes ?? []
  const startTimes = nodes
    .map((node) => toTimestamp(node.startTime))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)
  const baseStart = startTimes[0]

  if (!nodes.length || baseStart === undefined) {
    return {
      totalWindowMs: 0,
      ticks: [] as Array<{ label: string; position: number }>,
      rows: [] as Array<
        TraceNode & {
          depth: number
          durationMs: number
          offsetMs: number
          leftPercent: number
          widthPercent: number
        }
      >
    }
  }

  const totalWindowMs = Math.max(
    Number(summary.value?.durationMs || 0),
    ...nodes.map((node) => {
      const start = toTimestamp(node.startTime) ?? baseStart
      const end = toTimestamp(node.endTime) ?? (start + Number(node.durationMs || 0))
      return end - baseStart
    }),
    1
  )

  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const position = (index / tickCount) * 100
    const value = Math.round((totalWindowMs / tickCount) * index)
    return {
      position,
      label: index === 0 ? '0ms' : formatDuration(value)
    }
  })

  return {
    totalWindowMs,
    ticks,
    rows: [...nodes]
      .sort((left, right) => (toTimestamp(left.startTime) ?? 0) - (toTimestamp(right.startTime) ?? 0))
      .map((node) => {
        const start = toTimestamp(node.startTime) ?? baseStart
        const durationMs = Math.max(Number(node.durationMs || 0), 1)
        const offsetMs = Math.max(0, start - baseStart)
        const leftPercent = clamp((offsetMs / totalWindowMs) * 100, 0, 99.5)
        const widthPercent = clamp((durationMs / totalWindowMs) * 100, 0.8, 100 - leftPercent)

        return {
          ...node,
          depth: Number(node.depth || 0),
          durationMs,
          offsetMs,
          leftPercent,
          widthPercent
        }
      })
  }
})

const routeInfo = computed(() => {
  if (!summary.value) return []

  return [
    {
      label: '用户问题',
      value: summary.value.question || '-'
    },
    {
      label: '路由类型',
      value: summary.value.route || '-'
    },
    {
      label: '路由判定',
      value: detail.value?.routeReason || '-'
    },
    {
      label: '模型',
      value: summary.value.model || '-'
    }
  ]
})

const retrievalInfo = computed(() => {
  if (!detail.value || !summary.value) return []

  return [
    {
      label: '检索查询',
      value: detail.value.retrievalQuery || '-'
    },
    {
      label: '命中 Chunk',
      value: String(detail.value.hitChunks ?? 0)
    },
    {
      label: '输入 Tokens',
      value: summary.value.inputTokens ? String(summary.value.inputTokens) : '-'
    },
    {
      label: '输出 Tokens',
      value: summary.value.outputTokens ? String(summary.value.outputTokens) : '-'
    }
  ]
})

const rawMetaEntries = computed(() =>
  Object.entries(detail.value?.rawMeta ?? {}).map(([key, value]) => ({
    key,
    value:
      typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value, null, 2)
  }))
)

const getNodeTypeLabel = (nodeType?: string | null) => {
  const normalized = String(nodeType || '').trim().toLowerCase()
  if (normalized === 'router') return 'LLM_ROUTING'
  if (normalized === 'retrieval') return 'RETRIEVE'
  if (normalized === 'rerank') return 'RERANK'
  if (normalized === 'llm') return 'LLM_PROVIDER'
  if (normalized === 'tool') return 'TOOL'
  return (nodeType || '-').toUpperCase()
}

const getDotClass = (status?: string | null) => {
  const normalized = normalizeTraceStatus(status)
  if (normalized === 'success') return 'trace-node-dot is-success'
  if (normalized === 'running') return 'trace-node-dot is-running'
  if (normalized === 'failed' || normalized === 'timeout') return 'trace-node-dot is-failed'
  return 'trace-node-dot'
}

const getBarClass = (status?: string | null) => {
  const normalized = normalizeTraceStatus(status)
  if (normalized === 'success') return 'trace-waterfall-bar is-success'
  if (normalized === 'running') return 'trace-waterfall-bar is-running'
  if (normalized === 'failed' || normalized === 'timeout') return 'trace-waterfall-bar is-failed'
  return 'trace-waterfall-bar'
}

const getStatusBadgeClass = (status?: string | null) => {
  const normalized = normalizeTraceStatus(status)
  if (normalized === 'success') return 'trace-pill is-success'
  if (normalized === 'running') return 'trace-pill is-running'
  if (normalized === 'failed' || normalized === 'timeout') return 'trace-pill is-failed'
  return 'trace-pill'
}

const loadDetail = async () => {
  if (!traceId.value) return
  await adminStore.loadTraceDetail(traceId.value)
}

const copyTraceId = async () => {
  if (!traceId.value || !navigator.clipboard) return
  await navigator.clipboard.writeText(traceId.value)
}

watch(
  traceId,
  async () => {
    await loadDetail()
  }
)

onMounted(async () => {
  await loadDetail()
})
</script>

<template>
  <section class="admin-page trace-detail-shell">
    <div
      v-if="adminStore.loading && !detail"
      class="flex min-h-[320px] items-center justify-center text-sm text-slate-500"
    >
      正在加载链路详情...
    </div>

    <template v-else-if="detail && summary">
      <section class="trace-detail-head-card">
        <div class="trace-detail-head-row">
          <div class="trace-detail-head-main">
            <div class="trace-detail-title-line">
              <span class="trace-detail-list-label">Trace Detail</span>
              <span class="trace-detail-title-sep">/</span>
              <h1 class="trace-detail-head-h1">{{ summary.traceName || '-' }}</h1>
              <span :class="getStatusBadgeClass(summary.status)">
                {{ statusLabel(summary.status) }}
              </span>
            </div>

            <div class="trace-detail-meta-line">
              <button type="button" class="trace-detail-meta-copy" @click="copyTraceId">
                <Hash class="h-3.5 w-3.5" />
                {{ traceId }}
                <Copy class="h-3.5 w-3.5" />
              </button>
              <span class="trace-detail-meta-item">
                <Calendar class="h-3.5 w-3.5" />
                {{ formatDateTime(summary.startTime) }}
              </span>
              <span class="trace-detail-meta-item">
                <User class="h-3.5 w-3.5" />
                {{ summary.userName || summary.username || summary.userId || '-' }}
              </span>
            </div>
          </div>

          <div class="trace-detail-head-actions">
            <button type="button" class="trace-detail-action-btn" @click="router.push('/admin/traces')">
              <ArrowLeft class="h-4 w-4" />
              返回列表
            </button>
            <button type="button" class="trace-detail-action-btn" @click="loadDetail">
              <RefreshCw class="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>
      </section>

      <section class="trace-detail-summary-strip">
        <article class="trace-summary-chip">
          <Clock3 class="h-5 w-5 text-[#3562ff]" />
          <div class="trace-summary-chip-value">{{ formatDuration(summary.durationMs) }}</div>
          <div class="trace-summary-chip-label">总耗时</div>
        </article>

        <article class="trace-summary-chip">
          <Activity class="trace-summary-icon-stroke" />
          <div class="trace-summary-chip-value">{{ statSummary.total }}</div>
          <div class="trace-summary-chip-label">节点数</div>
        </article>

        <article class="trace-summary-chip">
          <Wrench class="trace-summary-icon-stroke" />
          <div class="trace-summary-chip-value">{{ detail.toolExecutions.length }}</div>
          <div class="trace-summary-chip-label">工具调用</div>
        </article>

        <article class="trace-summary-chip">
          <FileSearch class="trace-summary-icon-stroke" />
          <div class="trace-summary-chip-value">{{ detail.hitChunks }}</div>
          <div class="trace-summary-chip-label">命中 Chunk</div>
        </article>

        <article class="trace-summary-chip">
          <Zap class="h-5 w-5 text-[#42526b]" />
          <div class="trace-summary-chip-value">{{ formatDuration(statSummary.avgDuration) }}</div>
          <div class="trace-summary-chip-label">平均节点耗时</div>
        </article>
      </section>

      <section class="trace-detail-grid trace-detail-grid-two">
        <article class="trace-card">
          <div class="trace-card-head">
            <Route class="h-4 w-4" />
            <h2 class="trace-card-title">路由与请求上下文</h2>
          </div>
          <div class="trace-kv-list">
            <div v-for="item in routeInfo" :key="item.label" class="trace-kv-row">
              <p class="trace-kv-label">{{ item.label }}</p>
              <p class="trace-kv-value">{{ item.value }}</p>
            </div>
          </div>
        </article>

        <article class="trace-card">
          <div class="trace-card-head">
            <FileSearch class="h-4 w-4" />
            <h2 class="trace-card-title">检索与 Token 指标</h2>
          </div>
          <div class="trace-kv-list">
            <div v-for="item in retrievalInfo" :key="item.label" class="trace-kv-row">
              <p class="trace-kv-label">{{ item.label }}</p>
              <p class="trace-kv-value">{{ item.value }}</p>
            </div>
          </div>
        </article>
      </section>

      <section class="trace-detail-timeline-card">
        <div class="trace-detail-card-head">
          <div class="trace-detail-card-head-row">
            <h2 class="trace-detail-card-title">执行时序</h2>
            <div class="trace-detail-window-label">
              窗口 {{ formatDuration(waterfall.totalWindowMs) }}，左侧是节点，中间是执行区间，右侧是耗时和偏移
            </div>
          </div>
        </div>

        <div class="trace-detail-timeline-content">
          <div class="trace-waterfall-wrap">
            <div class="trace-waterfall-table-head">
              <div>节点</div>
              <div>类型</div>
              <div class="trace-waterfall-axis-head">
                <span>时间线</span>
                <div class="trace-waterfall-ticks">
                  <span
                    v-for="tick in waterfall.ticks"
                    :key="`${tick.position}-${tick.label}`"
                    :style="{ left: `${tick.position}%` }"
                    class="trace-waterfall-tick-label"
                  >
                    {{ tick.label }}
                  </span>
                </div>
              </div>
              <div class="text-right">耗时</div>
            </div>

            <div class="trace-waterfall-body">
              <div
                v-for="node in waterfall.rows"
                :key="String(node.nodeId)"
                class="trace-waterfall-row"
              >
                <div
                  class="trace-waterfall-node"
                  :style="{ paddingLeft: `${Math.min(Number(node.depth || 0), 6) * 18}px` }"
                >
                  <span :class="getDotClass(String(node.status || ''))" />
                  <span class="trace-waterfall-node-name">
                    {{ String(node.nodeName || node.methodName || node.nodeId || '-') }}
                  </span>
                </div>

                <div class="trace-waterfall-type-cell">
                  <span class="trace-waterfall-type-tag">
                    {{ getNodeTypeLabel(String(node.nodeType || '')) }}
                  </span>
                </div>

                <div class="trace-waterfall-chart">
                  <div class="trace-waterfall-grid">
                    <span
                      v-for="tick in waterfall.ticks"
                      :key="`grid-${tick.position}`"
                      class="trace-waterfall-grid-line"
                      :style="{ left: `${tick.position}%` }"
                    />
                  </div>
                  <div class="trace-waterfall-track" />
                  <div
                    :class="getBarClass(String(node.status || ''))"
                    :style="{ left: `${Number(node.leftPercent || 0)}%`, width: `${Number(node.widthPercent || 0)}%` }"
                  />
                </div>

                <div class="trace-waterfall-duration">
                  <p>{{ formatDuration(Number(node.durationMs || 0)) }}</p>
                  <p>@{{ formatDuration(Number(node.offsetMs || 0)) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="trace-detail-grid trace-detail-grid-two">
        <article class="trace-card">
          <div class="trace-card-head">
            <Wrench class="h-4 w-4" />
            <h2 class="trace-card-title">工具调用详情</h2>
          </div>

          <div v-if="detail.toolExecutions.length" class="trace-tool-list">
            <article
              v-for="tool in detail.toolExecutions"
              :key="tool.id"
              class="trace-tool-card"
            >
              <div class="trace-tool-head">
                <div>
                  <p class="trace-tool-name">{{ tool.name }}</p>
                  <p class="trace-tool-summary">{{ tool.summary || '无摘要' }}</p>
                </div>
                <div class="trace-tool-head-meta">
                  <span :class="getStatusBadgeClass(tool.status)">{{ statusLabel(tool.status) }}</span>
                  <span class="trace-tool-duration">{{ formatDuration(tool.durationMs) }}</span>
                </div>
              </div>

              <div class="trace-tool-meta-row">
                <span>开始：{{ tool.startedAt || '-' }}</span>
                <span>结束：{{ tool.endedAt || '-' }}</span>
                <span>模型：{{ tool.model || '-' }}</span>
                <span>Tokens：{{ tool.tokens ?? '-' }}</span>
              </div>

              <div class="trace-tool-section">
                <p class="trace-tool-section-title">输入参数</p>
                <pre class="trace-code-block"><code>{{ tool.inputPreview || '-' }}</code></pre>
              </div>

              <div class="trace-tool-section">
                <p class="trace-tool-section-title">输出结果</p>
                <pre class="trace-code-block"><code>{{ tool.outputPreview || '-' }}</code></pre>
              </div>

              <div v-if="tool.steps?.length" class="trace-tool-section">
                <p class="trace-tool-section-title">内部步骤</p>
                <ol class="trace-step-list">
                  <li v-for="step in tool.steps" :key="step">{{ step }}</li>
                </ol>
              </div>
            </article>
          </div>

          <div v-else class="trace-empty-card">当前链路没有工具调用。</div>
        </article>

        <article class="trace-card">
          <div class="trace-card-head">
            <FileSearch class="h-4 w-4" />
            <h2 class="trace-card-title">命中文档与引用</h2>
          </div>

          <div v-if="detail.citations.length" class="trace-citation-list">
            <article
              v-for="citation in detail.citations"
              :key="citation.id"
              class="trace-citation-card"
            >
              <div class="trace-citation-head">
                <div>
                  <p class="trace-citation-title">{{ citation.title }}</p>
                  <p class="trace-citation-meta">
                    {{ citation.documentName }} · Chunk #{{ citation.chunkIndex }}
                  </p>
                </div>
                <span class="trace-citation-score">{{ (citation.score * 100).toFixed(2) }}%</span>
              </div>

              <p class="trace-citation-content">{{ citation.content }}</p>
            </article>
          </div>

          <div v-else class="trace-empty-card">当前链路没有知识库引用，通常说明这次请求不是 RAG 检索链路。</div>
        </article>
      </section>

      <section class="trace-detail-grid trace-detail-grid-two">
        <article class="trace-card">
          <div class="trace-card-head">
            <Activity class="h-4 w-4" />
            <h2 class="trace-card-title">阶段摘要</h2>
          </div>

          <div v-if="detail.steps.length" class="trace-phase-list">
            <article
              v-for="step in detail.steps"
              :key="step.id"
              class="trace-phase-card"
            >
              <div class="trace-phase-top">
                <div>
                  <p class="trace-phase-title">{{ step.title }}</p>
                  <p class="trace-phase-kind">{{ step.kind }}</p>
                </div>
                <span :class="getStatusBadgeClass(step.status)">{{ statusLabel(step.status) }}</span>
              </div>

              <p class="trace-phase-detail">{{ step.detail }}</p>
              <div class="trace-phase-meta">
                <span>{{ step.startAt }} - {{ step.endAt }}</span>
                <span>{{ formatDuration(step.durationMs) }}</span>
              </div>
            </article>
          </div>

          <div v-else class="trace-empty-card">当前没有阶段摘要数据。</div>
        </article>

        <article class="trace-card">
          <div class="trace-card-head">
            <Zap class="h-4 w-4" />
            <h2 class="trace-card-title">最终答案 / LLM 输出</h2>
          </div>

          <pre class="trace-answer-block"><code>{{ detail.finalAnswer || '-' }}</code></pre>
        </article>
      </section>

      <section class="trace-card">
        <div class="trace-card-head">
          <Settings2 class="h-4 w-4" />
          <h2 class="trace-card-title">原始元数据</h2>
        </div>

        <div v-if="rawMetaEntries.length" class="trace-meta-grid">
          <div v-for="entry in rawMetaEntries" :key="entry.key" class="trace-meta-card">
            <p class="trace-meta-key">{{ entry.key }}</p>
            <pre class="trace-meta-value"><code>{{ entry.value }}</code></pre>
          </div>
        </div>

        <div v-else class="trace-empty-card">当前没有原始元数据。</div>
      </section>
    </template>

    <div
      v-else
      class="flex min-h-[320px] items-center justify-center text-sm text-slate-500"
    >
      暂无数据
    </div>
  </section>
</template>

<style>
.admin-layout .trace-detail-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.admin-layout .trace-detail-head-card,
.admin-layout .trace-detail-summary-strip,
.admin-layout .trace-detail-timeline-card,
.admin-layout .trace-card {
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: #ffffff;
}

.admin-layout .trace-detail-head-card {
  padding: 18px 20px;
}

.admin-layout .trace-detail-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.admin-layout .trace-detail-head-main {
  min-width: 0;
}

.admin-layout .trace-detail-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.admin-layout .trace-detail-list-label,
.admin-layout .trace-detail-title-sep {
  font-size: 15px;
  color: #5f7592;
}

.admin-layout .trace-detail-head-h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 800;
  color: #0f172a;
}

.admin-layout .trace-detail-meta-line {
  margin-top: 18px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}

.admin-layout .trace-detail-meta-copy,
.admin-layout .trace-detail-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 14px;
  color: #5f7592;
  font-variant-numeric: tabular-nums;
}

.admin-layout .trace-detail-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.admin-layout .trace-detail-action-btn {
  height: 38px;
  padding: 0 16px;
  border: 1px solid #d8e0ea;
  border-radius: 12px;
  background: #ffffff;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.admin-layout .trace-detail-action-btn:hover {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: var(--brand-primary);
}

.admin-layout .trace-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #dbe2ea;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.admin-layout .trace-pill.is-success {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: var(--brand-primary);
}

.admin-layout .trace-pill.is-running {
  border-color: #fde68a;
  background: #fffbeb;
  color: #b45309;
}

.admin-layout .trace-pill.is-failed {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.admin-layout .trace-detail-summary-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  overflow: hidden;
}

.admin-layout .trace-summary-chip {
  min-height: 64px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-layout .trace-summary-chip + .trace-summary-chip {
  border-left: 1px solid #e7eef6;
}

.admin-layout .trace-summary-chip-value {
  font-size: 18px;
  line-height: 1;
  font-weight: 800;
  color: #1e3a5f;
  font-variant-numeric: tabular-nums;
}

.admin-layout .trace-summary-chip-label {
  font-size: 14px;
  color: #60758e;
}

.admin-layout .trace-summary-icon-stroke {
  width: 20px;
  height: 20px;
  color: #475569;
}

.admin-layout .trace-detail-grid {
  display: grid;
  gap: 18px;
}

.admin-layout .trace-detail-grid-two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.admin-layout .trace-card {
  padding: 18px;
}

.admin-layout .trace-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: #1e293b;
}

.admin-layout .trace-card-title {
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
}

.admin-layout .trace-kv-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-layout .trace-kv-row {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fbff;
  border: 1px solid #edf2f7;
}

.admin-layout .trace-kv-label {
  font-size: 13px;
  color: #64748b;
}

.admin-layout .trace-kv-value {
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.7;
  color: #0f172a;
  word-break: break-word;
}

.admin-layout .trace-detail-timeline-card {
  overflow: hidden;
}

.admin-layout .trace-detail-card-head {
  padding: 18px 28px;
  border-bottom: 1px solid #e7eef6;
}

.admin-layout .trace-detail-card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.admin-layout .trace-detail-card-title {
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
}

.admin-layout .trace-detail-window-label {
  font-size: 14px;
  color: #60758e;
}

.admin-layout .trace-detail-timeline-content {
  padding: 0;
}

.admin-layout .trace-waterfall-wrap {
  background: #ffffff;
}

.admin-layout .trace-waterfall-table-head {
  display: grid;
  grid-template-columns: 420px 152px minmax(0, 1fr) 110px;
  align-items: end;
  gap: 0;
  padding: 10px 18px 6px;
  border-bottom: 1px solid #edf2f7;
  background: #f8fafc;
  font-size: 14px;
  color: #60758e;
}

.admin-layout .trace-waterfall-axis-head {
  position: relative;
  min-height: 52px;
}

.admin-layout .trace-waterfall-axis-head > span {
  display: inline-block;
  margin-bottom: 20px;
}

.admin-layout .trace-waterfall-ticks {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 20px;
}

.admin-layout .trace-waterfall-tick-label {
  position: absolute;
  transform: translateX(-50%);
  font-size: 12px;
  color: #94a3b8;
}

.admin-layout .trace-waterfall-tick-label:first-child {
  transform: translateX(0);
}

.admin-layout .trace-waterfall-tick-label:last-child {
  transform: translateX(-100%);
}

.admin-layout .trace-waterfall-body {
  max-height: 720px;
  overflow-y: auto;
}

.admin-layout .trace-waterfall-row {
  display: grid;
  grid-template-columns: 420px 152px minmax(0, 1fr) 110px;
  align-items: center;
  gap: 0;
  padding: 0 18px;
  min-height: 62px;
  border-bottom: 1px solid #f3f6fa;
}

.admin-layout .trace-waterfall-node {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.admin-layout .trace-node-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #cbd5e1;
  flex-shrink: 0;
}

.admin-layout .trace-node-dot.is-success {
  background: #10b981;
}

.admin-layout .trace-node-dot.is-running {
  background: #f59e0b;
}

.admin-layout .trace-node-dot.is-failed {
  background: #ef4444;
}

.admin-layout .trace-waterfall-node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  color: #243b5a;
}

.admin-layout .trace-waterfall-type-cell {
  padding-right: 16px;
}

.admin-layout .trace-waterfall-type-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 128px;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #6b85a4;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-layout .trace-waterfall-chart {
  position: relative;
  height: 26px;
}

.admin-layout .trace-waterfall-grid {
  position: absolute;
  inset: 0;
}

.admin-layout .trace-waterfall-grid-line {
  position: absolute;
  top: -14px;
  bottom: -14px;
  width: 1px;
  background: #e6edf5;
}

.admin-layout .trace-waterfall-grid-line:first-child,
.admin-layout .trace-waterfall-grid-line:last-child {
  display: none;
}

.admin-layout .trace-waterfall-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 3px;
  height: 20px;
  border-radius: 6px;
  background: #f8fbff;
}

.admin-layout .trace-waterfall-bar {
  position: absolute;
  top: 3px;
  height: 20px;
  border-radius: 6px;
  background: #cbd5e1;
}

.admin-layout .trace-waterfall-bar.is-success {
  background: linear-gradient(90deg, #34d399 0%, #34d399 100%);
}

.admin-layout .trace-waterfall-bar.is-running {
  background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
}

.admin-layout .trace-waterfall-bar.is-failed {
  background: linear-gradient(90deg, #f87171 0%, #ef4444 100%);
}

.admin-layout .trace-waterfall-duration {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.admin-layout .trace-waterfall-duration p:first-child {
  font-size: 14px;
  font-weight: 700;
  color: #1e3a5f;
}

.admin-layout .trace-waterfall-duration p:last-child {
  margin-top: 2px;
  font-size: 12px;
  color: #7a8faa;
}

.admin-layout .trace-tool-list,
.admin-layout .trace-citation-list,
.admin-layout .trace-phase-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-layout .trace-tool-card,
.admin-layout .trace-citation-card,
.admin-layout .trace-phase-card,
.admin-layout .trace-meta-card {
  border: 1px solid #e6edf5;
  border-radius: 12px;
  background: #f8fbff;
  padding: 14px;
}

.admin-layout .trace-tool-head,
.admin-layout .trace-citation-head,
.admin-layout .trace-phase-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.admin-layout .trace-tool-name,
.admin-layout .trace-citation-title,
.admin-layout .trace-phase-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.admin-layout .trace-tool-summary,
.admin-layout .trace-citation-meta,
.admin-layout .trace-phase-kind {
  margin-top: 4px;
  font-size: 13px;
  color: #64748b;
}

.admin-layout .trace-tool-head-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.admin-layout .trace-tool-duration,
.admin-layout .trace-citation-score {
  font-size: 13px;
  font-weight: 700;
  color: #1d4ed8;
}

.admin-layout .trace-tool-meta-row,
.admin-layout .trace-phase-meta {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 12px;
  color: #64748b;
}

.admin-layout .trace-tool-section {
  margin-top: 12px;
}

.admin-layout .trace-tool-section-title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.admin-layout .trace-code-block,
.admin-layout .trace-answer-block,
.admin-layout .trace-meta-value {
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 10px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.7;
  font-family: var(--font-mono-family);
}

.admin-layout .trace-step-list {
  margin: 0;
  padding-left: 18px;
  color: #334155;
  font-size: 13px;
  line-height: 1.8;
}

.admin-layout .trace-citation-content,
.admin-layout .trace-phase-detail {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: #0f172a;
}

.admin-layout .trace-empty-card {
  padding: 18px;
  border-radius: 12px;
  background: #f8fafc;
  font-size: 14px;
  color: #64748b;
}

.admin-layout .trace-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.admin-layout .trace-meta-key {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

@media (max-width: 1200px) {
  .admin-layout .trace-detail-head-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .admin-layout .trace-detail-head-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .admin-layout .trace-detail-summary-strip,
  .admin-layout .trace-detail-grid-two,
  .admin-layout .trace-meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-layout .trace-summary-chip:nth-child(3),
  .admin-layout .trace-summary-chip:nth-child(5) {
    border-left: 0;
  }
}

@media (max-width: 960px) {
  .admin-layout .trace-waterfall-table-head,
  .admin-layout .trace-waterfall-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .admin-layout .trace-waterfall-axis-head {
    min-height: 40px;
  }

  .admin-layout .trace-waterfall-duration {
    text-align: left;
    padding-bottom: 12px;
  }
}

@media (max-width: 640px) {
  .admin-layout .trace-detail-summary-strip,
  .admin-layout .trace-detail-grid-two,
  .admin-layout .trace-meta-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-layout .trace-summary-chip + .trace-summary-chip {
    border-left: 0;
    border-top: 1px solid #e7eef6;
  }
}
</style>
