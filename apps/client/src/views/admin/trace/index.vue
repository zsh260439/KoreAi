<script setup lang="ts">
import { Activity, ChevronRight, Clock3, Eye, Layers, RefreshCw, Search, TrendingUp } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAdminStore } from '@/stores'
import {
  TRACE_PAGE_SIZE,
  formatDateTime,
  formatDuration,
  formatTraceDurationMetric,
  normalizeTraceStatus,
  percentile,
  statusLabel
} from '@/views/admin/trace/traceUtils'

const router = useRouter()
const adminStore = useAdminStore()

const traceIdFilter = ref('')
const queryTraceId = ref('')
const pageNo = ref(1)

const filteredTraceList = computed(() => {
  const keyword = queryTraceId.value.trim().toLowerCase()
  if (!keyword) {
    return adminStore.traces
  }

  return adminStore.traces.filter((item) => {
    const traceId = String(item.traceId || item.id || '').toLowerCase()
    const traceName = String(item.traceName || '').toLowerCase()
    return traceId.includes(keyword) || traceName.includes(keyword)
  })
})

const pagedRuns = computed(() => {
  const total = filteredTraceList.value.length
  const pages = Math.max(1, Math.ceil(total / TRACE_PAGE_SIZE))
  const current = Math.min(pageNo.value, pages)
  const start = (current - 1) * TRACE_PAGE_SIZE

  return {
    records: filteredTraceList.value.slice(start, start + TRACE_PAGE_SIZE),
    total,
    current,
    pages
  }
})

const traceStats = computed(() => {
  const runs = filteredTraceList.value
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
const showEmpty = computed(() => !adminStore.loading && pagedRuns.value.records.length === 0)

const getTraceStatToneClass = () => 'is-brand'

const getStatusClass = (status?: string | null) => {
  const normalized = normalizeTraceStatus(status)
  if (normalized === 'success') return 'is-success'
  if (normalized === 'failed' || normalized === 'timeout') return 'is-failed'
  if (normalized === 'running') return 'is-running'
  return 'is-default'
}

const handleSearch = () => {
  pageNo.value = 1
  queryTraceId.value = traceIdFilter.value.trim()
}

const handleRefresh = async () => {
  pageNo.value = 1
  await adminStore.loadTraces()
}

const handlePrevPage = () => {
  pageNo.value = Math.max(1, pageNo.value - 1)
}

const handleNextPage = () => {
  pageNo.value = Math.min(pagedRuns.value.pages, pageNo.value + 1)
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
      <section class="trace-list-hero">
        <div class="trace-list-hero-copy">
          <h1 class="trace-list-title">链路追踪</h1>
          <p class="trace-list-description">
            独立列表页聚焦运行检索，点击任意运行记录进入详情页分析节点与失败节点
          </p>
        </div>

        <div class="trace-list-toolbar">
          <el-input
            v-model="traceIdFilter"
            placeholder="搜索 Trace Id"
            clearable
            class="trace-list-search"
            @keyup.enter="handleSearch"
          />
          <el-button type="primary" class="trace-list-btn trace-list-btn-primary" @click="handleSearch">
            <Search class="h-4 w-4" />
            查询
          </el-button>
          <el-button class="trace-list-btn trace-list-btn-refresh" @click="handleRefresh">
            <RefreshCw class="h-4 w-4" />
            刷新
          </el-button>
        </div>
      </section>

      <section class="trace-list-guide">
        <article class="trace-list-guide-card">
          <p class="trace-list-guide-title">当前页看什么</p>
          <p class="trace-list-guide-text">
            一行代表一次完整链路运行，不是单个节点。这里先用于定位某次请求是否成功、耗时是否异常，再进入详情页看具体阶段。
          </p>
        </article>

        <article class="trace-list-guide-card">
          <p class="trace-list-guide-title">上方指标怎么来的</p>
          <p class="trace-list-guide-text">
            成功率、平均耗时、P95 耗时都会跟随当前筛选结果实时变化，所以先搜 Trace Id 再看指标，更接近你真正关心的那一批请求。
          </p>
        </article>

        <article class="trace-list-guide-card">
          <p class="trace-list-guide-title">什么时候点查看链路</p>
          <p class="trace-list-guide-text">
            当你想继续判断问题出在检索、重排、模型还是工具调用阶段时，直接进入详情页看节点时序和状态。
          </p>
        </article>
      </section>

      <section class="trace-list-stat-grid">
        <article class="trace-list-stat-card">
          <div :class="['trace-list-stat-icon', getTraceStatToneClass()]">
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
          <div :class="['trace-list-stat-icon', getTraceStatToneClass()]">
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
          <div :class="['trace-list-stat-icon', getTraceStatToneClass()]">
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
          <div :class="['trace-list-stat-icon', getTraceStatToneClass()]">
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

      <section class="trace-list-table-card">
        <div class="trace-list-table-header">
          <div>
            <h2 class="trace-list-table-title">运行列表</h2>
            <p class="trace-list-table-description">
              按时间倒序查看运行记录，通过操作按钮进入独立详情页
            </p>
          </div>
        </div>

        <div class="trace-list-table-content">
          <template v-if="adminStore.loading && !adminStore.traces.length">
            <div class="trace-list-table-empty">正在加载链路数据...</div>
          </template>

          <template v-else-if="showEmpty">
            <div class="trace-list-table-empty">暂无链路数据</div>
          </template>

          <div v-else class="trace-list-table-wrap">
            <table class="trace-list-table">
              <thead>
                <tr>
                  <th class="trace-col-trace">Trace Name</th>
                  <th class="trace-col-run-id">Trace Id</th>
                  <th class="trace-col-meta">会话ID / TaskID</th>
                  <th class="trace-col-user">用户名</th>
                  <th class="trace-col-duration">耗时</th>
                  <th class="trace-col-status">状态</th>
                  <th class="trace-col-time">执行时间</th>
                  <th class="trace-col-action">操作</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="run in pagedRuns.records" :key="run.traceId || run.id" class="trace-list-table-row">
                  <td class="trace-col-trace">
                    <p class="trace-list-run-name" :title="run.traceName || '-'">
                      {{ run.traceName || '-' }}
                    </p>
                  </td>

                  <td class="trace-col-run-id">
                    <span class="trace-list-run-id" :title="run.traceId || run.id">
                      {{ run.traceId || run.id }}
                    </span>
                  </td>

                  <td class="trace-col-meta">
                    <p class="trace-list-run-meta-line" :title="`会话ID: ${run.conversationId || '-'}`">
                      {{ run.conversationId || '-' }}
                    </p>
                    <p class="trace-list-run-meta-line is-secondary" :title="`TaskID: ${run.taskId || '-'}`">
                      {{ run.taskId || '-' }}
                    </p>
                  </td>

                  <td class="trace-col-user">
                    <span class="trace-list-user-name" :title="run.userName || run.username || run.userId || '-'">
                      {{ run.userName || run.username || run.userId || '-' }}
                    </span>
                  </td>

                  <td class="trace-col-duration trace-list-duration-cell">
                    {{ formatDuration(run.durationMs ?? run.latencyMs ?? undefined) }}
                  </td>

                  <td class="trace-col-status">
                    <span :class="['trace-list-status-badge', getStatusClass(run.status)]">
                      {{ statusLabel(run.status) }}
                    </span>
                  </td>

                  <td class="trace-col-time">
                    {{ formatDateTime(run.startTime ?? run.createdAt ?? undefined) }}
                  </td>

                  <td class="trace-col-action">
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
              第 {{ pagedRuns.current }} / {{ pagedRuns.pages }} 页，共 {{ pagedRuns.total.toLocaleString('zh-CN') }} 条
            </span>

            <div class="trace-list-pagination">
              <el-button
                class="trace-list-pagination-btn"
                size="small"
                :disabled="pagedRuns.current <= 1 || adminStore.loading"
                @click="handlePrevPage"
              >
                上一页
              </el-button>
              <el-button
                class="trace-list-pagination-btn"
                size="small"
                :disabled="pagedRuns.current >= pagedRuns.pages || adminStore.loading"
                @click="handleNextPage"
              >
                下一页
              </el-button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style>
.admin-layout .trace-list-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.admin-layout .trace-list-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.admin-layout .trace-list-hero-copy {
  min-width: 0;
  padding-top: 6px;
}

.admin-layout .trace-list-title {
  font-size: 30px;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.admin-layout .trace-list-description {
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.65;
  color: #5f7592;
}

.admin-layout .trace-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
  padding-top: 2px;
}

.admin-layout .trace-list-search {
  width: 340px;
}

.admin-layout .trace-list-search .el-input__wrapper {
  height: 48px;
  border-radius: 12px;
  border: 1px solid #d8e0ea;
  background: #ffffff;
  box-shadow: none;
  padding-inline: 16px;
}

.admin-layout .trace-list-search .el-input__inner {
  font-size: 15px;
  color: #1e293b;
}

.admin-layout .trace-list-search .el-input__inner::placeholder {
  color: #94a3b8;
}

.admin-layout .trace-list-btn {
  height: 46px;
  border-radius: 12px;
  padding-inline: 18px;
  font-size: 15px;
  font-weight: 600;
  gap: 8px;
}

.admin-layout .trace-list-btn-primary {
  border: 0;
  background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-hover) 100%);
  color: #ffffff;
}

.admin-layout .trace-list-btn-primary:hover {
  background: linear-gradient(135deg, var(--brand-primary-hover) 0%, #1d4ed8 100%);
}

.admin-layout .trace-list-btn-refresh {
  border: 1px solid #d8e0ea;
  background: #ffffff;
  color: #1e293b;
}

.admin-layout .trace-list-btn-refresh:hover {
  border-color: #cbd6e2;
  background: #f8fafc;
}

.admin-layout .trace-list-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.admin-layout .trace-list-guide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.admin-layout .trace-list-guide-card {
  min-height: 110px;
  padding: 18px;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.admin-layout .trace-list-guide-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.admin-layout .trace-list-guide-text {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: #5f7592;
}

.admin-layout .trace-list-stat-card {
  min-height: 92px;
  padding: 18px 18px 18px 18px;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: #ffffff;
  display: flex;
  align-items: center;
  gap: 14px;
}

.admin-layout .trace-list-stat-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.admin-layout .trace-list-stat-icon.is-brand {
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
}

.admin-layout .trace-list-stat-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.admin-layout .trace-list-stat-title {
  font-size: 14px;
  color: #60758e;
}

.admin-layout .trace-list-stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.admin-layout .trace-list-stat-value {
  font-size: 24px;
  line-height: 1.1;
  font-weight: 800;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.admin-layout .trace-list-stat-unit {
  font-size: 14px;
  color: #64748b;
}

.admin-layout .trace-list-table-card {
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: #ffffff;
  overflow: hidden;
}

.admin-layout .trace-list-table-header {
  padding: 14px 18px 16px;
  border-bottom: 1px solid #e8eef5;
}

.admin-layout .trace-list-table-title {
  font-size: 18px;
  line-height: 1.2;
  font-weight: 800;
  color: #0f172a;
}

.admin-layout .trace-list-table-description {
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.6;
  color: #5f7592;
}

.admin-layout .trace-list-table-wrap {
  overflow-x: auto;
}

.admin-layout .trace-list-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.admin-layout .trace-list-table th,
.admin-layout .trace-list-table td {
  padding: 15px 18px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid #edf2f7;
}

.admin-layout .trace-list-table th {
  background: #f8fafc;
  font-size: 14px;
  font-weight: 700;
  color: #60758e;
  white-space: nowrap;
}

.admin-layout .trace-list-table td {
  font-size: 15px;
  color: #0f172a;
}

.admin-layout .trace-col-trace {
  width: 220px;
}

.admin-layout .trace-col-run-id {
  width: 250px;
}

.admin-layout .trace-col-meta {
  width: 260px;
}

.admin-layout .trace-col-user {
  width: 110px;
}

.admin-layout .trace-col-duration {
  width: 90px;
}

.admin-layout .trace-col-status {
  width: 120px;
}

.admin-layout .trace-col-time {
  width: 180px;
}

.admin-layout .trace-col-action {
  width: 170px;
}

.admin-layout .trace-list-table-row:hover {
  background: #fbfdff;
}

.admin-layout .trace-list-run-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 500;
  color: #0f172a;
}

.admin-layout .trace-list-run-id,
.admin-layout .trace-list-user-name,
.admin-layout .trace-list-run-meta-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-layout .trace-list-run-id,
.admin-layout .trace-list-run-meta-line {
  font-family: var(--font-mono-family);
  font-size: 13px;
  color: #4d6a8d;
}

.admin-layout .trace-list-user-name {
  font-size: 14px;
  color: #334155;
}

.admin-layout .trace-list-run-meta-line.is-secondary {
  margin-top: 5px;
  color: #6882a0;
}

.admin-layout .trace-list-duration-cell {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.admin-layout .trace-list-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 700;
}

.admin-layout .trace-list-status-badge.is-success {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: var(--brand-primary);
}

.admin-layout .trace-list-status-badge.is-failed {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: var(--brand-primary);
}

.admin-layout .trace-list-status-badge.is-running {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: var(--brand-primary);
}

.admin-layout .trace-list-status-badge.is-default {
  border-color: #dbe2ea;
  background: #f8fafc;
  color: #64748b;
}

.admin-layout .trace-list-action-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid #d8e0ea;
  border-radius: 10px;
  background: #ffffff;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}

.admin-layout .trace-list-action-btn:hover {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: var(--brand-primary);
}

.admin-layout .trace-list-table-empty {
  padding: 48px 20px;
  text-align: center;
  font-size: 15px;
  color: #64748b;
}

.admin-layout .trace-list-table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
}

.admin-layout .trace-list-table-meta {
  font-size: 14px;
  color: #334155;
}

.admin-layout .trace-list-pagination {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-layout .trace-list-pagination-btn {
  min-width: 92px;
  height: 34px;
  border-radius: 10px;
}

@media (max-width: 1200px) {
  .admin-layout .trace-list-hero {
    flex-direction: column;
  }

  .admin-layout .trace-list-toolbar {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .admin-layout .trace-list-search {
    width: min(100%, 360px);
  }
}

@media (max-width: 1024px) {
  .admin-layout .trace-list-guide,
  .admin-layout .trace-list-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .admin-layout .trace-list-title {
    font-size: 28px;
  }

  .admin-layout .trace-list-guide,
  .admin-layout .trace-list-stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .admin-layout .trace-list-btn {
    width: 100%;
    justify-content: center;
  }

  .admin-layout .trace-list-search {
    width: 100%;
  }

  .admin-layout .trace-list-table-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
