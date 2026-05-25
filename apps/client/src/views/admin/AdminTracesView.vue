<script setup lang="ts">
import { Activity, ChevronRight, Clock3, Eye, Layers, RefreshCw, Search, TrendingUp } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { TRACE_PAGE_SIZE, formatDateTime, formatDuration, formatTraceDurationMetric, normalizeTraceStatus, percentile, statusBadgeVariant, statusLabel } from '@/components/trace/traceUtils'
import { useAdminStore } from '@/stores/admin'

const router = useRouter()
const adminStore = useAdminStore()

const traceIdFilter = ref('')
const queryTraceId = ref('')
const pageNo = ref(1)

const filteredRuns = computed(() => {
  const keyword = queryTraceId.value.trim().toLowerCase()
  const list = adminStore.traces.filter((item) => {
    if (!keyword) return true
    return item.id.toLowerCase().includes(keyword)
  })
  const total = list.length
  const pages = Math.max(1, Math.ceil(total / TRACE_PAGE_SIZE))
  const current = Math.min(pageNo.value, pages)
  const start = (current - 1) * TRACE_PAGE_SIZE
  return {
    records: list.slice(start, start + TRACE_PAGE_SIZE),
    total,
    current,
    pages
  }
})

const traceStats = computed(() => {
  const runs = filteredRuns.value.records
  const durations = runs
    .map((item) => Number(item.durationMs ?? item.latencyMs ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  const successCount = runs.filter((item) => normalizeTraceStatus(item.status) === 'success').length
  const failedCount = runs.filter((item) => normalizeTraceStatus(item.status) === 'failed').length
  const runningCount = runs.filter((item) => normalizeTraceStatus(item.status) === 'running').length
  const avgDuration = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0
  const p95Duration = Math.round(percentile(durations, 0.95))
  const successRate = runs.length ? Math.round((successCount / runs.length) * 1000) / 10 : 0
  return {
    successCount,
    failedCount,
    runningCount,
    successRate,
    avgDuration,
    p95Duration
  }
})

const avgDurationMetric = computed(() => formatTraceDurationMetric(traceStats.value.avgDuration))
const p95DurationMetric = computed(() => formatTraceDurationMetric(traceStats.value.p95Duration))
const showEmpty = computed(() => !adminStore.loading && filteredRuns.value.records.length === 0)

const getTraceStatToneClass = (tone: 'emerald' | 'cyan' | 'indigo' | 'amber') => {
  switch (tone) {
    case 'emerald':
      return 'is-emerald'
    case 'cyan':
      return 'is-cyan'
    case 'indigo':
      return 'is-indigo'
    case 'amber':
      return 'is-amber'
    default:
      return 'is-indigo'
  }
}

const handleSearch = () => {
  pageNo.value = 1
  queryTraceId.value = traceIdFilter.value.trim()
}

const handleRefresh = () => {
  pageNo.value = 1
}

const handlePrevPage = () => {
  pageNo.value = Math.max(1, pageNo.value - 1)
}

const handleNextPage = () => {
  pageNo.value = Math.min(filteredRuns.value.pages, pageNo.value + 1)
}

const openRun = (traceId: string) => {
  router.push(`/admin/traces/${encodeURIComponent(traceId)}`)
}

onMounted(async () => {
  if (!adminStore.traces.length) {
    await adminStore.loadTraces()
  }
})
</script>

<template>
  <section class="admin-page trace-page trace-list-page">
    <div class="trace-list-shell">
      <AdminPageHeader
        title="链路追踪"
        description="独立列表页聚焦运行检索，点击任意运行记录进入详情页分析慢节点与失败节点。"
      >
        <template #actions>
          <el-input
            v-model="traceIdFilter"
            placeholder="搜索 Trace Id"
            clearable
            class="w-[300px]"
          />
          <el-button type="primary" class="trace-list-btn trace-list-btn-primary" @click="handleSearch">
            <Search class="mr-2 h-4 w-4" />
            查询
          </el-button>
          <el-button class="trace-list-btn trace-list-btn-refresh" @click="handleRefresh">
            <RefreshCw class="mr-2 h-4 w-4" />
            刷新
          </el-button>
        </template>
      </AdminPageHeader>

      <section class="trace-list-stat-grid">
        <article class="trace-list-stat-card">
          <div :class="['trace-list-stat-icon', getTraceStatToneClass('emerald')]">
            <Activity class="h-4 w-4" />
          </div>
          <div class="trace-list-stat-content">
            <p class="trace-list-stat-title">成功 / 失败 / 运行中</p>
            <div class="trace-list-stat-value-row">
              <p class="trace-list-stat-value">{{ `${traceStats.successCount} / ${traceStats.failedCount} / ${traceStats.runningCount}` }}</p>
            </div>
          </div>
        </article>
        <article class="trace-list-stat-card">
          <div :class="['trace-list-stat-icon', getTraceStatToneClass('cyan')]">
            <TrendingUp class="h-4 w-4" />
          </div>
          <div class="trace-list-stat-content">
            <p class="trace-list-stat-title">成功率</p>
            <div class="trace-list-stat-value-row">
              <p class="trace-list-stat-value">{{ `${traceStats.successRate}%` }}</p>
            </div>
          </div>
        </article>
        <article class="trace-list-stat-card">
          <div :class="['trace-list-stat-icon', getTraceStatToneClass('indigo')]">
            <Clock3 class="h-4 w-4" />
          </div>
          <div class="trace-list-stat-content">
            <p class="trace-list-stat-title">平均耗时</p>
            <div class="trace-list-stat-value-row">
              <p class="trace-list-stat-value">{{ avgDurationMetric.value }}</p>
              <span v-if="avgDurationMetric.unit" class="trace-list-stat-unit">{{ avgDurationMetric.unit }}</span>
            </div>
          </div>
        </article>
        <article class="trace-list-stat-card">
          <div :class="['trace-list-stat-icon', getTraceStatToneClass('amber')]">
            <Layers class="h-4 w-4" />
          </div>
          <div class="trace-list-stat-content">
            <p class="trace-list-stat-title">P95 耗时</p>
            <div class="trace-list-stat-value-row">
              <p class="trace-list-stat-value">{{ p95DurationMetric.value }}</p>
              <span v-if="p95DurationMetric.unit" class="trace-list-stat-unit">{{ p95DurationMetric.unit }}</span>
            </div>
          </div>
        </article>
      </section>

      <div class="trace-list-table-card">
        <div class="trace-list-table-header">
          <div>
            <h2 class="trace-list-table-title">运行列表</h2>
            <p class="trace-list-table-description">按时间倒序查看运行记录，通过操作按钮进入独立详情页。</p>
          </div>
        </div>

        <div class="trace-list-table-content">
          <template v-if="adminStore.loading && !adminStore.traces.length">
            <div class="trace-list-table-empty">加载中...</div>
          </template>
          <template v-else-if="showEmpty">
            <div class="trace-list-table-empty">暂无链路数据</div>
          </template>
          <div v-else class="trace-list-table-wrap">
            <table class="trace-list-table ui-table">
              <thead class="ui-table-header">
                <tr>
                  <th class="ui-table-head trace-col-trace">Trace Name</th>
                  <th class="ui-table-head trace-col-run-id">Trace Id</th>
                  <th class="ui-table-head trace-col-meta">会话ID / TaskID</th>
                  <th class="ui-table-head trace-col-user">用户名</th>
                  <th class="ui-table-head trace-col-duration">耗时</th>
                  <th class="ui-table-head trace-col-status">状态</th>
                  <th class="ui-table-head">执行时间</th>
                  <th class="ui-table-head trace-col-action">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="run in filteredRuns.records" :key="run.traceId || run.id" class="trace-list-table-row">
                  <td class="ui-table-cell trace-col-trace">
                    <div class="trace-list-run-trace">
                      <p class="trace-list-run-name line-clamp-1" :title="run.traceName || '-'">
                        {{ run.traceName || '-' }}
                      </p>
                    </div>
                  </td>
                  <td class="ui-table-cell trace-col-run-id">
                    <span class="trace-list-run-id" :title="run.traceId || run.id">
                      {{ run.traceId || run.id }}
                    </span>
                  </td>
                  <td class="ui-table-cell trace-col-meta">
                    <p class="trace-list-run-meta-line" :title="`会话ID: ${run.conversationId || '-'}`">
                      {{ run.conversationId || '-' }}
                    </p>
                    <p class="trace-list-run-meta-line is-secondary" :title="`TaskID: ${run.taskId || '-'}`">
                      {{ run.taskId || '-' }}
                    </p>
                  </td>
                  <td class="ui-table-cell trace-col-user">
                    <span class="trace-list-user-name" :title="run.userName || run.username || run.userId || '-'">
                      {{ run.userName || run.username || run.userId || '-' }}
                    </span>
                  </td>
                  <td class="ui-table-cell trace-col-duration trace-list-duration-cell">
                    {{ formatDuration(run.durationMs ?? undefined) }}
                  </td>
                  <td class="ui-table-cell trace-col-status trace-list-status-cell">
                    <span
                      :class="[
                        'trace-list-status-badge',
                        statusBadgeVariant(run.status) === 'destructive'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-slate-100 text-slate-700'
                      ]"
                    >
                      {{ statusLabel(run.status) }}
                    </span>
                  </td>
                  <td class="ui-table-cell">
                    {{ formatDateTime(run.startTime ?? run.createdAt ?? undefined) }}
                  </td>
                  <td class="ui-table-cell trace-col-action trace-list-action-cell">
                    <button
                      type="button"
                      class="trace-list-action-btn"
                      @click="openRun(run.traceId || run.id)"
                    >
                      <Eye class="h-3.5 w-3.5" />
                      查看链路
                      <ChevronRight class="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="trace-list-table-footer">
            <span class="trace-list-table-meta">
              第 {{ filteredRuns.current }} / {{ filteredRuns.pages }} 页，共 {{ filteredRuns.total.toLocaleString('zh-CN') }} 条
            </span>
            <div class="trace-list-pagination">
              <el-button
                class="trace-list-pagination-btn"
                :disabled="filteredRuns.current <= 1 || adminStore.loading"
                @click="handlePrevPage"
                size="small"
              >
                上一页
              </el-button>
              <el-button
                class="trace-list-pagination-btn"
                :disabled="filteredRuns.current >= filteredRuns.pages || adminStore.loading"
                @click="handleNextPage"
                size="small"
              >
                下一页
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style>
.admin-layout .trace-list-shell {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.admin-layout .trace-list-control {
  height: var(--trace-control-height);
  border: 1px solid var(--trace-border);
  border-radius: var(--trace-radius-8);
  background: var(--trace-bg-surface);
  font-size: var(--trace-font-14);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-primary);
  box-shadow: none;
  padding-left: var(--trace-space-12);
  padding-right: var(--trace-space-12);
  outline: none;
}

.admin-layout .trace-list-control::placeholder {
  color: var(--trace-text-weak);
}

.admin-layout .trace-list-btn {
  height: var(--trace-control-height);
  border-radius: var(--trace-radius-8);
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  padding-inline: var(--trace-space-12);
  min-width: 64px;
  gap: var(--trace-space-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.admin-layout .trace-list-btn-refresh {
  border: 1px solid var(--trace-border-strong);
  background: var(--trace-bg-subtle);
  color: var(--trace-text-secondary);
}

.admin-layout .trace-list-btn-refresh:hover {
  border-color: var(--trace-border-strong);
  background: #e2e8f0;
}

.admin-layout .trace-list-btn-primary {
  border: 1px solid #1d4ed8;
  background: #2563eb;
  color: #ffffff;
}

.admin-layout .trace-list-btn-primary:hover {
  border-color: #1e40af;
  background: #1d4ed8;
}

.admin-layout .trace-list-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--trace-space-12);
}

.admin-layout .trace-list-stat-card {
  min-height: var(--trace-stat-card-min-height);
  padding: var(--trace-space-16);
  border-radius: var(--trace-radius-8);
  border: 1px solid var(--trace-border);
  background: var(--trace-bg-surface);
  box-shadow: none;
  display: flex;
  align-items: center;
  gap: var(--trace-space-12);
}

.admin-layout .trace-list-stat-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--trace-radius-8);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.admin-layout .trace-list-stat-icon.is-cyan {
  background: #ecfeff;
  color: #0e7490;
}

.admin-layout .trace-list-stat-icon.is-emerald {
  background: #ecfdf5;
  color: #059669;
}

.admin-layout .trace-list-stat-icon.is-indigo {
  background: #eef2ff;
  color: #4f46e5;
}

.admin-layout .trace-list-stat-icon.is-amber {
  background: #fffbeb;
  color: #d97706;
}

.admin-layout .trace-list-stat-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-layout .trace-list-stat-title {
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-weak);
}

.admin-layout .trace-list-stat-value-row {
  display: flex;
  align-items: baseline;
  gap: var(--trace-space-4);
}

.admin-layout .trace-list-stat-value {
  font-size: var(--trace-font-22);
  line-height: var(--trace-lh-tight);
  font-weight: 700;
  color: var(--trace-text-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-layout .trace-list-stat-unit {
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-weak);
  text-transform: uppercase;
}

.admin-layout .trace-list-table-card {
  border: 1px solid var(--trace-border);
  border-radius: var(--trace-radius-8);
  background: var(--trace-bg-surface);
  box-shadow: none;
  overflow: hidden;
}

.admin-layout .trace-list-table-header {
  padding: var(--trace-space-12) var(--trace-space-16);
  border-bottom: 1px solid var(--trace-border);
}

.admin-layout .trace-list-table-title {
  font-size: 15px;
  line-height: var(--trace-lh-tight);
  font-weight: 600;
  color: var(--trace-text-primary);
}

.admin-layout .trace-list-table-description {
  margin-top: var(--trace-space-4);
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-weak);
}

.admin-layout .trace-list-table-content {
  padding: 0;
}

.admin-layout .trace-list-table-wrap {
  overflow-x: hidden;
}

.admin-layout .trace-list-table {
  width: 100%;
  table-layout: auto;
  border-collapse: collapse;
}

.admin-layout .trace-list-table .ui-table-head,
.admin-layout .trace-list-table .ui-table-cell {
  padding-left: var(--trace-space-16);
  padding-right: var(--trace-space-16);
  padding-top: var(--trace-space-12);
  padding-bottom: var(--trace-space-12);
  vertical-align: middle;
  min-width: 0;
  box-sizing: border-box;
}

.admin-layout .trace-list-table .ui-table-head {
  height: var(--trace-table-head-height);
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-weak);
  font-weight: 600;
  white-space: nowrap;
  text-align: left;
}

.admin-layout .trace-list-table .ui-table-cell {
  height: var(--trace-table-row-height);
  border-bottom: 1px solid var(--trace-border);
  color: var(--trace-text-primary);
  font-size: var(--trace-font-14);
  line-height: var(--trace-lh-base);
  overflow: hidden;
}

.admin-layout .trace-list-table .trace-col-status {
  min-width: 110px;
  max-width: 110px;
}

.admin-layout .trace-list-table .trace-col-run-id,
.admin-layout .trace-list-table .trace-col-user,
.admin-layout .trace-list-table .trace-col-trace,
.admin-layout .trace-list-table .trace-col-meta {
  width: auto;
  min-width: 0;
}

.admin-layout .trace-list-table .trace-col-duration {
  width: 90px;
  min-width: 90px;
  max-width: 90px;
}

.admin-layout .trace-list-table .trace-col-action {
  width: 188px;
  min-width: 188px;
  max-width: 188px;
}

.admin-layout .trace-list-table-row {
  transition: background-color 150ms ease;
}

.admin-layout .trace-list-table-row:hover {
  background: #f8fafc;
}

.admin-layout .trace-list-status-cell {
  vertical-align: middle;
  white-space: nowrap;
}

.admin-layout .trace-list-status-badge {
  min-height: 24px;
  padding-inline: var(--trace-space-8);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--trace-font-12);
  line-height: 1;
  border-radius: 999px;
}

.admin-layout .trace-list-run-id {
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono-family);
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-secondary);
}

.admin-layout .trace-list-user-name {
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-secondary);
}

.admin-layout .trace-list-run-trace {
  display: flex;
  flex-direction: column;
  gap: var(--trace-space-4);
  min-width: 0;
  overflow: hidden;
}

.admin-layout .trace-list-run-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--trace-font-14);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-primary);
}

.admin-layout .trace-list-run-meta-line {
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-secondary);
}

.admin-layout .trace-list-run-meta-line.is-secondary {
  color: var(--trace-text-weak);
}

.admin-layout .trace-list-duration-cell {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.admin-layout .trace-list-action-cell {
  white-space: nowrap;
}

.admin-layout .trace-list-action-btn {
  height: 30px;
  padding-inline: 10px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1;
  gap: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.admin-layout .trace-list-action-btn:hover {
  border-color: #93c5fd;
  background: #dbeafe;
  color: #1e40af;
}

.admin-layout .trace-list-table-empty {
  padding: var(--trace-space-24) var(--trace-space-16);
  text-align: center;
  font-size: var(--trace-font-14);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-weak);
}

.admin-layout .trace-list-table-footer {
  border-top: 1px solid var(--trace-border);
  padding: var(--trace-space-12) var(--trace-space-16);
  background: var(--trace-bg-surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--trace-space-12);
}

.admin-layout .trace-list-table-meta {
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
  color: var(--trace-text-secondary);
}

.admin-layout .trace-list-pagination {
  display: flex;
  align-items: center;
  gap: var(--trace-space-8);
}

.admin-layout .trace-list-pagination-btn {
  height: 32px;
  min-width: var(--trace-pagination-btn-min-width);
  border-radius: var(--trace-radius-8);
  border: 1px solid var(--trace-border);
  background: #fff;
  font-size: var(--trace-font-12);
  line-height: var(--trace-lh-base);
}

@media (max-width: 1024px) {
  .admin-layout .trace-list-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .admin-layout .trace-list-stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
