<script setup lang="ts">
import { AlertTriangle, ArrowLeft, Calendar, Copy, Hash, RefreshCw, User } from 'lucide-vue-next'
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { clamp, formatDateTime, formatDuration, normalizeTraceStatus, statusBadgeVariant, statusLabel, toTimestamp } from '@/components/trace/traceUtils'
import { useAdminStore } from '@/stores/admin'

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

  if (!nodes.length || !baseStart) {
    return {
      totalWindowMs: 0,
      rows: []
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

  return {
    totalWindowMs,
    rows: [...nodes]
      .sort((a, b) => (toTimestamp(a.startTime) ?? 0) - (toTimestamp(b.startTime) ?? 0))
      .map((node) => {
        const start = toTimestamp(node.startTime) ?? baseStart
        const durationMs = Math.max(Number(node.durationMs || 0), 1)
        const offsetMs = Math.max(0, start - baseStart)
        const leftPercent = clamp((offsetMs / totalWindowMs) * 100, 0, 99.2)
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

const getDotClass = (status?: string | null) => {
  const normalized = normalizeTraceStatus(status)
  if (normalized === 'success') return 'trace-node-dot is-success'
  if (normalized === 'running') return 'trace-node-dot is-running'
  if (normalized === 'failed' || normalized === 'timeout') return 'trace-node-dot is-failed'
  return 'trace-node-dot'
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
      加载链路详情中...
    </div>

    <template v-else-if="detail && summary">
      <section class="trace-detail-head-card">
        <div class="trace-detail-head-content">
          <div class="trace-detail-head-row">
            <div class="trace-detail-head-title">
              <h1 class="trace-detail-head-h1">{{ summary.traceName || '未命名链路' }}</h1>
              <p class="trace-detail-head-subtitle">
                {{ detail.routeReason || summary.question || '查看单次运行的链路与执行细节' }}
              </p>
            </div>

            <div class="trace-detail-head-actions">
              <span
                :class="[
                  'trace-list-status-badge',
                  statusBadgeVariant(summary.status) === 'destructive'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-slate-100 text-slate-700'
                ]"
              >
                {{ statusLabel(summary.status) }}
              </span>
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

          <div class="trace-detail-meta-bar">
            <div class="trace-detail-meta-field trace-detail-meta-field-runid">
              <span class="trace-detail-meta-key">Trace Id</span>
              <span class="trace-detail-meta-value trace-detail-meta-runid">{{ traceId }}</span>
              <button type="button" class="trace-detail-meta-copy-btn" @click="copyTraceId">
                <Copy class="h-3.5 w-3.5" />
              </button>
            </div>
            <div class="trace-detail-meta-field">
              <Hash class="h-3.5 w-3.5 text-slate-400" />
              <span class="trace-detail-meta-value">{{ summary.conversationId || summary.taskId || '-' }}</span>
            </div>
            <div class="trace-detail-meta-field">
              <Calendar class="h-3.5 w-3.5 text-slate-400" />
              <span class="trace-detail-meta-value">{{ formatDateTime(summary.startTime) }}</span>
            </div>
            <div class="trace-detail-meta-field">
              <User class="h-3.5 w-3.5 text-slate-400" />
              <span class="trace-detail-meta-value">{{ summary.userName || summary.username || summary.userId || '-' }}</span>
            </div>
          </div>

          <div v-if="summary.errorMessage" class="trace-error-box">
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div class="text-sm text-red-700">{{ summary.errorMessage }}</div>
          </div>
        </div>
      </section>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
        <section class="trace-detail-info-card">
          <div class="trace-detail-card-head">
            <div class="trace-detail-card-head-row">
              <h2 class="trace-detail-card-title">基础信息</h2>
              <div class="trace-node-summary">
                <span class="rounded-[8px] bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">{{ summary.model || '-' }}</span>
                <span class="rounded-[8px] bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">{{ detail.hitChunks }} 个命中 Chunk</span>
                <span class="rounded-[8px] bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">{{ summary.toolCount || 0 }} 次工具调用</span>
              </div>
            </div>
          </div>

          <div class="trace-detail-card-content trace-detail-info">
            <div class="trace-detail-kv-grid">
              <div class="trace-detail-kv-item">
                <span class="trace-meta-label">总耗时</span>
                <span class="trace-meta-value">{{ formatDuration(summary.durationMs) }}</span>
              </div>
              <div class="trace-detail-kv-item">
                <span class="trace-meta-label">节点数</span>
                <span class="trace-meta-value">{{ statSummary.total }}</span>
              </div>
              <div class="trace-detail-kv-item">
                <span class="trace-meta-label">平均耗时</span>
                <span class="trace-meta-value">{{ formatDuration(statSummary.avgDuration) }}</span>
              </div>
              <div class="trace-detail-kv-item">
                <span class="trace-meta-label">Input Tokens</span>
                <span class="trace-meta-value">{{ summary.inputTokens ?? 0 }}</span>
              </div>
              <div class="trace-detail-kv-item">
                <span class="trace-meta-label">Output Tokens</span>
                <span class="trace-meta-value">{{ summary.outputTokens ?? 0 }}</span>
              </div>
              <div class="trace-detail-kv-item">
                <span class="trace-meta-label">路由</span>
                <span class="trace-meta-value">{{ summary.route || '-' }}</span>
              </div>
            </div>

            <div class="trace-detail-info-divider" />

            <div class="trace-detail-method-block">
              <div class="trace-detail-method-head">
                <span class="trace-meta-label">检索 Query</span>
              </div>
              <code class="trace-detail-method-code">{{ detail.retrievalQuery || '-' }}</code>
            </div>

            <div class="trace-detail-method-block">
              <div class="trace-detail-method-head">
                <span class="trace-meta-label">最终回答</span>
              </div>
              <div class="trace-detail-method-code">{{ detail.finalAnswer }}</div>
            </div>
          </div>
        </section>

        <section class="trace-detail-timeline-card">
          <div class="trace-detail-card-head">
            <div class="trace-detail-card-head-row">
              <h2 class="trace-detail-card-title">执行时序</h2>
              <div class="trace-node-summary text-xs text-slate-500">
                <span>SUCCESS {{ statSummary.success }}</span>
                <span>FAILED {{ statSummary.failed }}</span>
                <span v-if="statSummary.running > 0">RUNNING {{ statSummary.running }}</span>
              </div>
            </div>
          </div>

          <div class="trace-detail-timeline-content">
            <div class="trace-waterfall-wrap">
              <div class="trace-waterfall-head">
                <span>执行窗口</span>
                <span>{{ formatDuration(waterfall.totalWindowMs) }}</span>
              </div>

              <div class="trace-waterfall-body">
                <div
                  v-for="node in waterfall.rows"
                  :key="node.nodeId"
                  class="trace-waterfall-row"
                >
                  <div class="trace-waterfall-node" :style="{ paddingLeft: `${Math.min(node.depth, 6) * 16}px` }">
                    <span :class="getDotClass(node.status)" />
                    <div class="min-w-0">
                      <span class="trace-waterfall-node-name">{{ node.nodeName || node.methodName || node.nodeId }}</span>
                      <span class="trace-waterfall-node-type">{{ node.nodeType || '-' }}</span>
                    </div>
                  </div>

                  <div class="trace-waterfall-type-col text-xs text-slate-500">
                    {{ statusLabel(node.status) }}
                  </div>

                  <div class="trace-waterfall-chart">
                    <div class="trace-waterfall-track" />
                    <div
                      :class="[
                        'trace-waterfall-bar',
                        normalizeTraceStatus(node.status) === 'success' && 'is-success',
                        normalizeTraceStatus(node.status) === 'running' && 'is-running',
                        (normalizeTraceStatus(node.status) === 'failed' || normalizeTraceStatus(node.status) === 'timeout') && 'is-failed'
                      ]"
                      :style="{ left: `${node.leftPercent}%`, width: `${node.widthPercent}%` }"
                    />
                  </div>

                  <div class="trace-waterfall-duration">
                    <p>{{ formatDuration(node.durationMs) }}</p>
                    <p>@{{ formatDuration(node.offsetMs) }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
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
.admin-layout .trace-detail-head-card,
.admin-layout .trace-detail-info-card,
.admin-layout .trace-detail-timeline-card {
  border: 1px solid var(--trace-border);
  border-radius: var(--trace-radius-8);
  background: var(--trace-bg-surface);
  box-shadow: none;
}

.admin-layout .trace-detail-shell {
  display: flex;
  flex-direction: column;
  gap: var(--trace-space-16);
}

.admin-layout .trace-detail-head-content {
  padding: var(--trace-space-16);
  display: flex;
  flex-direction: column;
  gap: var(--trace-space-12);
}

.admin-layout .trace-detail-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--trace-space-12);
}

.admin-layout .trace-detail-head-title {
  min-width: 0;
}

.admin-layout .trace-detail-head-h1 {
  font-size: var(--trace-font-22);
  line-height: var(--trace-lh-tight);
  font-weight: 600;
  color: var(--trace-text-primary);
}

.admin-layout .trace-detail-head-subtitle {
  margin-top: 4px;
  font-size: var(--trace-font-14);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-secondary);
  max-width: 720px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-layout .trace-detail-head-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--trace-space-8);
  flex-shrink: 0;
}

.admin-layout .trace-detail-action-btn {
  height: 36px;
  border-radius: var(--trace-radius-8);
  padding-inline: 12px;
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-secondary);
  border: 1px solid var(--trace-border);
  background: #fff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.admin-layout .trace-detail-meta-bar {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--trace-border);
  border-radius: var(--trace-radius-8);
  background: var(--trace-bg-subtle);
  scrollbar-width: none;
}

.admin-layout .trace-detail-meta-bar::-webkit-scrollbar {
  display: none;
}

.admin-layout .trace-detail-meta-field {
  height: 32px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}

.admin-layout .trace-detail-meta-field + .trace-detail-meta-field {
  border-left: 1px solid var(--trace-border);
}

.admin-layout .trace-detail-meta-field-runid {
  min-width: 0;
}

.admin-layout .trace-detail-meta-key {
  font-size: 11px;
  line-height: 1;
  color: var(--trace-text-weak);
}

.admin-layout .trace-detail-meta-value {
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-secondary);
  font-variant-numeric: tabular-nums;
}

.admin-layout .trace-detail-meta-runid {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-layout .trace-detail-meta-copy-btn {
  height: 22px;
  width: 22px;
  min-width: 22px;
  padding: 0;
  border-radius: 6px;
  color: var(--trace-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.admin-layout .trace-detail-card-head {
  padding: var(--trace-space-12) var(--trace-space-16);
  border-bottom: 1px solid var(--trace-border);
}

.admin-layout .trace-detail-card-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--trace-space-12);
}

.admin-layout .trace-detail-card-title {
  font-size: 15px;
  line-height: var(--trace-lh-tight);
  font-weight: 600;
  color: var(--trace-text-primary);
}

.admin-layout .trace-detail-card-content {
  padding: var(--trace-space-16);
  display: flex;
  flex-direction: column;
  gap: var(--trace-space-12);
}

.admin-layout .trace-detail-timeline-content {
  padding: 0 var(--trace-space-16) var(--trace-space-16);
}

.admin-layout .trace-detail-info {
  display: flex;
  flex-direction: column;
  gap: var(--trace-space-12);
}

.admin-layout .trace-detail-method-block {
  display: flex;
  flex-direction: column;
  gap: var(--trace-space-8);
}

.admin-layout .trace-detail-method-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--trace-space-8);
}

.admin-layout .trace-detail-method-code {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: #f8fafc;
  font-family: var(--font-mono-family);
  font-size: 12px;
  line-height: 1.5;
  color: var(--trace-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}

.admin-layout .trace-detail-info-divider {
  height: 1px;
  background: var(--trace-border);
}

.admin-layout .trace-detail-kv-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.admin-layout .trace-detail-kv-item {
  min-width: 0;
}

.admin-layout .trace-meta-label {
  font-size: 12px;
  color: #64748b;
}

.admin-layout .trace-meta-value {
  display: block;
  margin-top: 2px;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
}

.admin-layout .trace-error-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid #fecaca;
  background: rgba(254, 242, 242, 0.8);
  padding: 10px 12px;
}

.admin-layout .trace-node-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.admin-layout .trace-detail-card-head-row .trace-node-summary {
  justify-content: flex-end;
}

.admin-layout .trace-waterfall-wrap {
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 12px;
  background: #ffffff;
}

.admin-layout .trace-waterfall-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
}

.admin-layout .trace-waterfall-body {
  max-height: 460px;
  overflow-y: auto;
  padding: 8px;
}

.admin-layout .trace-waterfall-row {
  display: grid;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 8px 12px;
  grid-template-columns: minmax(200px, 260px) minmax(84px, 112px) minmax(0, 1fr) 72px;
}

.admin-layout .trace-waterfall-row:hover {
  background: #f8fafc;
}

.admin-layout .trace-waterfall-node {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 180px;
  flex: 0 0 auto;
  text-align: left;
}

.admin-layout .trace-waterfall-type-col {
  min-width: 0;
}

.admin-layout .trace-node-dot {
  display: inline-block;
  height: 8px;
  width: 8px;
  flex-shrink: 0;
  border-radius: 999px;
  background: #cbd5e1;
}

.admin-layout .trace-node-dot.is-success {
  background: #10b981;
}

.admin-layout .trace-node-dot.is-running {
  background: #f59e0b;
}

.admin-layout .trace-node-dot.is-failed,
.admin-layout .trace-node-dot.is-timeout {
  background: #ef4444;
}

.admin-layout .trace-waterfall-node-name {
  font-size: 12px;
  line-height: 1.333;
  font-weight: 500;
  color: #334155;
  white-space: normal;
  word-break: break-word;
}

.admin-layout .trace-waterfall-node-type {
  display: block;
  font-size: 9px;
  line-height: 1.333;
  color: #64748b;
  text-transform: uppercase;
  white-space: normal;
  word-break: break-word;
}

.admin-layout .trace-waterfall-chart {
  position: relative;
  height: 16px;
  border-radius: 999px;
}

.admin-layout .trace-waterfall-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #f1f5f9;
}

.admin-layout .trace-waterfall-bar {
  position: absolute;
  top: 0;
  height: 16px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: var(--shadow-xs);
}

.admin-layout .trace-waterfall-bar.is-success {
  background: linear-gradient(to right, #34d399, #10b981);
}

.admin-layout .trace-waterfall-bar.is-running {
  background: linear-gradient(to right, #fbbf24, #f59e0b);
}

.admin-layout .trace-waterfall-bar.is-failed,
.admin-layout .trace-waterfall-bar.is-timeout {
  background: linear-gradient(to right, #f87171, #ef4444);
}

.admin-layout .trace-waterfall-duration {
  text-align: right;
  font-size: 11px;
  font-weight: 500;
  color: #475569;
  font-variant-numeric: tabular-nums;
}

.admin-layout .trace-waterfall-duration p {
  line-height: 1.333;
}

@media (max-width: 768px) {
  .admin-layout .trace-detail-head-row,
  .admin-layout .trace-detail-card-head-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .admin-layout .trace-detail-head-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 880px) {
  .admin-layout .trace-waterfall-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .admin-layout .trace-waterfall-duration {
    text-align: left;
  }

  .admin-layout .trace-waterfall-node {
    min-width: 0;
    flex: 1 1 auto;
  }

  .admin-layout .trace-detail-kv-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .admin-layout .trace-detail-kv-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
