<script setup lang="ts">
import { ArrowLeft, Calendar, Clock3, Copy, Hash, RefreshCw, User, Zap } from 'lucide-vue-next'
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { clamp, formatDateTime, formatDuration, normalizeTraceStatus, statusLabel, toTimestamp } from '@/views/admin/trace/traceUtils'
import { useAdminStore } from '@/stores'

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
    .sort((a, b) => a - b)
  const baseStart = startTimes[0]

  if (!nodes.length || baseStart === undefined) {
    return {
      totalWindowMs: 0,
      ticks: [] as Array<{ label: string; position: number }>,
      rows: [] as Array<Record<string, unknown>>
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
      .sort((a, b) => (toTimestamp(a.startTime) ?? 0) - (toTimestamp(b.startTime) ?? 0))
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
              <span class="trace-detail-list-label">RAG 链路列表</span>
              <span class="trace-detail-title-sep">/</span>
              <h1 class="trace-detail-head-h1">{{ summary.traceName || '-' }}</h1>
              <span class="trace-detail-status-badge">
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
          <div class="trace-summary-chip-label">节点</div>
        </article>

        <article class="trace-summary-chip is-success">
          <div class="trace-summary-chip-dot" />
          <div class="trace-summary-chip-value">{{ statSummary.success }}</div>
          <div class="trace-summary-chip-label">成功</div>
        </article>

        <article class="trace-summary-chip is-failed">
          <div class="trace-summary-chip-dot is-failed" />
          <div class="trace-summary-chip-value">{{ statSummary.failed }}</div>
          <div class="trace-summary-chip-label">失败</div>
        </article>

        <article class="trace-summary-chip">
          <Zap class="h-5 w-5 text-[#42526b]" />
          <div class="trace-summary-chip-value">{{ formatDuration(statSummary.avgDuration) }}</div>
          <div class="trace-summary-chip-label">平均耗时</div>
        </article>
      </section>

      <section class="trace-detail-timeline-card">
        <div class="trace-detail-card-head">
          <div class="trace-detail-card-head-row">
            <h2 class="trace-detail-card-title">执行时序</h2>
            <div class="trace-detail-window-label">窗口 {{ formatDuration(waterfall.totalWindowMs) }}</div>
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
                <div class="trace-waterfall-node" :style="{ paddingLeft: `${Math.min(Number(node.depth || 0), 6) * 18}px` }">
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
.admin-layout .trace-detail-timeline-card {
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

.admin-layout .trace-detail-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: var(--brand-primary);
  font-size: 13px;
  font-weight: 700;
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

.admin-layout .trace-summary-chip-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid #10b981;
  background: #ecfdf5;
  flex-shrink: 0;
}

.admin-layout .trace-summary-chip-dot.is-failed {
  border-color: #64748b;
  background: #f8fafc;
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
  grid-template-columns: 480px 152px minmax(0, 1fr) 110px;
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
  grid-template-columns: 480px 152px minmax(0, 1fr) 110px;
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

@media (max-width: 1200px) {
  .admin-layout .trace-detail-head-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .admin-layout .trace-detail-head-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .admin-layout .trace-detail-summary-strip {
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
  .admin-layout .trace-detail-summary-strip {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-layout .trace-summary-chip + .trace-summary-chip {
    border-left: 0;
    border-top: 1px solid #e7eef6;
  }
}
</style>
