<script setup lang="ts">
import {
  Activity,
  ArrowRight,
  Clock3,
  Database,
  Gauge,
  Sparkles,
  TrendingDown,
  TrendingUp
} from 'lucide-vue-next'
import { computed, onMounted } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores'

const adminStore = useAdminStore()

const trendColumns = computed(() => adminStore.dashboard?.trend ?? [])

const trendMax = computed(() => {
  const values = trendColumns.value.map((point) => point.value)
  return Math.max(...values, 1)
})

const trendAverage = computed(() => {
  if (!trendColumns.value.length) return 0
  const total = trendColumns.value.reduce((sum, point) => sum + point.value, 0)
  return Math.round(total / trendColumns.value.length)
})

const summaryStats = computed(() => {
  const traces = adminStore.dashboard?.recentTraces ?? []
  const tasks = adminStore.dashboard?.recentTasks ?? []
  const successCount = traces.filter((item) => item.status === 'success').length
  const runningCount = tasks.filter((item) => item.status === 'running').length
  const successRate = traces.length ? Math.round((successCount / traces.length) * 100) : 0
  const averageLatency = traces.length
    ? Math.round(
        traces.reduce((sum, trace) => sum + (trace.latencyMs ?? trace.durationMs), 0) / traces.length
      )
    : 0

  return [
    {
      label: '近期开链成功率',
      value: `${successRate}%`,
      hint: `${successCount}/${traces.length || 0} 条链路成功`,
      icon: Gauge
    },
    {
      label: '近 7 日均值',
      value: `${trendAverage.value}`,
      hint: '按会话活跃度计算',
      icon: Activity
    },
    {
      label: '运行中任务',
      value: `${runningCount}`,
      hint: `${tasks.length} 个任务中仍在执行`,
      icon: Sparkles
    },
    {
      label: '平均链路耗时',
      value: `${averageLatency}ms`,
      hint: '按近期 Trace 统计',
      icon: Clock3
    }
  ]
})

const routeInsights = computed(() => {
  const traces = adminStore.dashboard?.recentTraces ?? []
  const ragCount = traces.filter((trace) => trace.route === 'knowledge-base-rag').length
  const toolCount = traces.filter((trace) => trace.route === 'tool-call').length
  const directCount = traces.filter((trace) => trace.route === 'direct-answer').length

  return [
    {
      label: '知识库回答',
      value: `${ragCount}`,
      tone: 'bg-blue-50 text-blue-700'
    },
    {
      label: '工具调用',
      value: `${toolCount}`,
      tone: 'bg-emerald-50 text-emerald-700'
    },
    {
      label: '直接回答',
      value: `${directCount}`,
      tone: 'bg-amber-50 text-amber-700'
    }
  ]
})

const dashboardTimeline = computed(() => {
  const traces = adminStore.dashboard?.recentTraces ?? []
  const tasks = adminStore.dashboard?.recentTasks ?? []

  return [
    ...tasks.slice(0, 2).map((task) => ({
      id: `task-${task.id}`,
      title: task.name,
      detail: task.detail,
      time: task.updatedAt,
      tag: '任务',
      status: task.status
    })),
    ...traces.slice(0, 2).map((trace) => ({
      id: `trace-${trace.id}`,
      title: trace.question || trace.traceName,
      detail: `${trace.route || '未分类'} · ${trace.model || 'AI'}`,
      time: trace.createdAt || trace.startTime,
      tag: '链路',
      status: trace.status
    }))
  ]
})

const metricToneMap: Record<string, string> = {
  '本日会话': 'bg-blue-50 text-blue-600',
  '知识命中率': 'bg-emerald-50 text-emerald-600',
  '平均响应时延': 'bg-amber-50 text-amber-600',
  '失败任务': 'bg-rose-50 text-rose-600'
}

const metricDescriptions: Record<string, string> = {
  '本日会话': '今日累计进入平台并完成交互的会话量',
  '知识命中率': '需要知识库参与时命中有效内容的比例',
  '平均响应时延': '用户发起请求到首个有效结果返回的均值',
  '失败任务': '需要人工关注或重试的后台处理任务'
}

const formatRouteLabel = (route?: string) => {
  if (route === 'knowledge-base-rag') return '知识库回答'
  if (route === 'tool-call') return '工具调用'
  if (route === 'direct-answer') return '直接回答'
  return route || '未分类'
}

const getTaskProgressTone = (status: string) => {
  if (status === 'success') return 'bg-emerald-500'
  if (status === 'error' || status === 'failed') return 'bg-rose-500'
  return 'bg-[var(--brand-primary)]'
}

onMounted(async () => {
  if (!adminStore.dashboard) {
    await adminStore.loadDashboard()
  }
})
</script>

<template>
  <section class="space-y-6">
    <AdminPageHeader
      title="Dashboard"
      description="集中查看会话活跃、知识命中、任务处理和近期链路表现。"
      :breadcrumbs="['首页', 'Dashboard']"
    />

    <div
      v-if="adminStore.loading && !adminStore.dashboard"
      class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_320px]"
    >
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <div
            v-for="item in 4"
            :key="item"
            class="h-40 rounded-[24px] border border-[var(--border-soft)] bg-white"
          />
        </div>
        <div class="h-[360px] rounded-[28px] border border-[var(--border-soft)] bg-white" />
        <div class="h-[320px] rounded-[28px] border border-[var(--border-soft)] bg-white" />
      </div>
      <div class="space-y-4">
        <div class="h-[220px] rounded-[28px] border border-[var(--border-soft)] bg-white" />
        <div class="h-[260px] rounded-[28px] border border-[var(--border-soft)] bg-white" />
      </div>
    </div>

    <div
      v-else-if="adminStore.error && !adminStore.dashboard"
      class="rounded-[24px] border border-red-200 bg-red-50 p-6"
    >
      <p class="text-sm font-medium text-red-700">加载 Dashboard 失败</p>
      <p class="mt-2 text-sm text-red-600">{{ adminStore.error }}</p>
    </div>

    <template v-else-if="adminStore.dashboard">
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_320px]">
        <div class="space-y-6">
          <section class="admin-surface rounded-[28px] border border-[var(--border-soft)] p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-soft)]">
                  总览
                </p>
                <h2 class="mt-3 text-2xl font-semibold text-[var(--text-primary)]">核心指标</h2>
                <p class="mt-2 text-sm text-[var(--text-muted)]">
                  保留首页最关键的数据概览，不堆叠过多运营化模块。
                </p>
              </div>
              <div
                class="hidden rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-subtle)] px-3 py-1 text-xs text-[var(--text-muted)] md:inline-flex"
              >
                今日更新
              </div>
            </div>

            <div class="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
              <article
                v-for="metric in adminStore.dashboard.metrics"
                :key="metric.label"
                class="rounded-[22px] border border-[var(--border-default)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 transition-all duration-300 ease-[var(--ease-standard)] hover:-translate-y-1 hover:border-[#cfe0ff] hover:shadow-[0_18px_40px_rgba(59,130,246,0.14)]"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="text-sm font-medium text-[var(--text-secondary)]">{{ metric.label }}</p>
                    <p class="mt-4 text-[34px] font-semibold leading-none text-[var(--text-primary)]">
                      {{ metric.value }}
                    </p>
                  </div>
                  <div
                    class="flex size-12 items-center justify-center rounded-[16px]"
                    :class="metricToneMap[metric.label] || 'bg-slate-50 text-slate-600'"
                  >
                    <TrendingDown v-if="metric.trend === 'down'" class="size-5" />
                    <TrendingUp v-else class="size-5" />
                  </div>
                </div>
                <p class="mt-5 text-xs leading-5 text-[var(--text-muted)]">
                  {{ metricDescriptions[metric.label] || '关键指标概览' }}
                </p>
                <div class="mt-4 flex items-center justify-between">
                  <span
                    class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                    :class="
                      metric.trend === 'down'
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-emerald-50 text-emerald-600'
                    "
                  >
                    {{ metric.delta }}
                  </span>
                  <span class="text-xs text-[var(--text-soft)]">较昨日</span>
                </div>
              </article>
            </div>
          </section>

          <div class="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <section class="admin-surface rounded-[28px] border border-[var(--border-soft)] p-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-soft)]">
                    趋势
                  </p>
                  <h2 class="mt-3 text-2xl font-semibold text-[var(--text-primary)]">近 7 日趋势</h2>
                  <p class="mt-2 text-sm text-[var(--text-muted)]">
                    聚焦会话活跃度，保留最直观的一组变化。
                  </p>
                </div>
                <div class="rounded-[18px] bg-[var(--bg-surface-subtle)] px-4 py-3 text-right">
                  <p class="text-xs text-[var(--text-muted)]">7 日平均</p>
                  <p class="mt-1 text-lg font-semibold text-[var(--text-primary)]">{{ trendAverage }}</p>
                </div>
              </div>

              <div
                class="mt-8 grid min-h-[280px] grid-cols-7 items-end gap-3 rounded-[24px] bg-[linear-gradient(180deg,#f9fbff_0%,#ffffff_100%)] px-4 pb-5 pt-8"
              >
                <div
                  v-for="point in trendColumns"
                  :key="point.label"
                  class="flex h-full flex-col items-center justify-end gap-3"
                >
                  <div class="flex h-full w-full items-end justify-center rounded-[18px] bg-white/75 px-2 py-3">
                    <div
                      class="w-full rounded-[14px] bg-[linear-gradient(180deg,#5b95ff_0%,#3b82f6_100%)] shadow-[0_10px_24px_rgba(59,130,246,0.24)] transition-all duration-300"
                      :style="{ height: `${Math.max((point.value / trendMax) * 100, 18)}%` }"
                    />
                  </div>
                  <div class="text-center">
                    <div class="text-xs text-[var(--text-muted)]">{{ point.label }}</div>
                    <div class="mt-1 text-base font-semibold text-[var(--text-primary)]">{{ point.value }}</div>
                  </div>
                </div>
              </div>
            </section>

            <section class="admin-surface rounded-[28px] border border-[var(--border-soft)] p-6">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-soft)]">
                    执行
                  </p>
                  <h2 class="mt-3 text-2xl font-semibold text-[var(--text-primary)]">近期任务</h2>
                  <p class="mt-2 text-sm text-[var(--text-muted)]">查看当前需要关注的处理进度。</p>
                </div>
              </div>

              <div class="mt-6 space-y-4">
                <article
                  v-for="task in adminStore.dashboard.recentTasks"
                  :key="task.id"
                  class="rounded-[22px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 transition-all duration-300 ease-[var(--ease-standard)] hover:-translate-y-1 hover:border-[#d7e3ff] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-base font-semibold text-[var(--text-primary)]">{{ task.name }}</p>
                      <p class="mt-1 text-sm text-[var(--text-muted)]">{{ task.detail }}</p>
                    </div>
                    <StatusBadge :status="task.status" />
                  </div>

                  <div class="mt-5">
                    <div class="h-2 rounded-full bg-[var(--bg-surface-subtle)]">
                      <div
                        class="h-2 rounded-full transition-all"
                        :class="getTaskProgressTone(task.status)"
                        :style="{ width: `${task.progress}%` }"
                      />
                    </div>
                    <div class="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>进度 {{ task.progress }}%</span>
                      <span>{{ task.updatedAt }}</span>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>

          <section class="admin-surface rounded-[28px] border border-[var(--border-soft)] p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-soft)]">
                  链路
                </p>
                <h2 class="mt-3 text-2xl font-semibold text-[var(--text-primary)]">近期 Trace</h2>
                <p class="mt-2 text-sm text-[var(--text-muted)]">
                  重点查看最新链路的问题、路由方式、模型和耗时。
                </p>
              </div>
            </div>

            <div class="mt-6 overflow-x-auto rounded-[22px] border border-[var(--border-default)] bg-white">
              <table class="min-w-full border-collapse text-sm text-slate-700">
                <thead class="border-b border-[var(--border-default)] bg-slate-50/80">
                  <tr>
                    <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">问题</th>
                    <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">路由方式</th>
                    <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">模型</th>
                    <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">耗时</th>
                    <th class="px-5 py-4 text-left text-xs font-semibold text-slate-500">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="trace in adminStore.dashboard.recentTraces"
                    :key="trace.id"
                    class="border-b border-[var(--border-default)] last:border-b-0"
                  >
                    <td class="px-5 py-4 align-top">
                      <div class="min-w-[320px]">
                        <p class="font-medium text-[var(--text-primary)]">
                          {{ trace.question || trace.traceName }}
                        </p>
                        <p class="mt-1 text-xs text-[var(--text-muted)]">
                          {{ trace.createdAt || trace.startTime }}
                        </p>
                      </div>
                    </td>
                    <td class="px-5 py-4">
                      <span
                        class="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                      >
                        {{ formatRouteLabel(trace.route) }}
                      </span>
                    </td>
                    <td class="px-5 py-4">{{ trace.model || 'AI' }}</td>
                    <td class="px-5 py-4">{{ trace.latencyMs ?? trace.durationMs }}ms</td>
                    <td class="px-5 py-4"><StatusBadge :status="trace.status" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="space-y-6">
          <section
            class="admin-surface rounded-[28px] border border-[var(--border-soft)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-soft)]">
                  侧栏概览
                </p>
                <h2 class="mt-3 text-xl font-semibold text-[var(--text-primary)]">运行摘要</h2>
              </div>
              <div
                class="flex size-11 items-center justify-center rounded-[16px] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"
              >
                <Database class="size-5" />
              </div>
            </div>

            <div class="mt-6 space-y-3">
              <div
                v-for="item in summaryStats"
                :key="item.label"
                class="flex items-start gap-3 rounded-[20px] border border-[var(--border-default)] bg-white px-4 py-4 transition-all duration-300 ease-[var(--ease-standard)] hover:-translate-y-1 hover:border-[#d7e3ff] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
              >
                <div
                  class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]"
                >
                  <component :is="item.icon" class="size-4.5" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm text-[var(--text-muted)]">{{ item.label }}</p>
                  <p class="mt-1 text-lg font-semibold text-[var(--text-primary)]">{{ item.value }}</p>
                  <p class="mt-1 text-xs leading-5 text-[var(--text-soft)]">{{ item.hint }}</p>
                </div>
              </div>
            </div>
          </section>

          <section class="admin-surface rounded-[28px] border border-[var(--border-soft)] p-6">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-soft)]">
                  路由分布
                </p>
                <h2 class="mt-3 text-xl font-semibold text-[var(--text-primary)]">回答方式</h2>
              </div>
            </div>

            <div class="mt-6 space-y-3">
              <div
                v-for="item in routeInsights"
                :key="item.label"
                class="flex items-center justify-between rounded-[20px] bg-[var(--bg-surface-subtle)] px-4 py-4 transition-all duration-300 ease-[var(--ease-standard)] hover:-translate-y-1 hover:bg-white hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
              >
                <span class="text-sm font-medium text-[var(--text-secondary)]">{{ item.label }}</span>
                <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="item.tone">
                  {{ item.value }}
                </span>
              </div>
            </div>
          </section>

          <section class="admin-surface rounded-[28px] border border-[var(--border-soft)] p-6">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-soft)]">
                  动态
                </p>
                <h2 class="mt-3 text-xl font-semibold text-[var(--text-primary)]">最新流转</h2>
              </div>
            </div>

            <div class="mt-6 space-y-4">
              <article
                v-for="item in dashboardTimeline"
                :key="item.id"
                class="rounded-[20px] border border-[var(--border-default)] p-4 transition-all duration-300 ease-[var(--ease-standard)] hover:-translate-y-1 hover:border-[#d7e3ff] hover:shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-flex rounded-full bg-[var(--bg-surface-subtle)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]"
                      >
                        {{ item.tag }}
                      </span>
                      <StatusBadge :status="item.status" />
                    </div>
                    <p class="mt-3 text-sm font-medium leading-6 text-[var(--text-primary)]">
                      {{ item.title }}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-[var(--text-muted)]">{{ item.detail }}</p>
                  </div>
                  <ArrowRight class="mt-1 size-4 shrink-0 text-[var(--text-soft)]" />
                </div>
                <p class="mt-3 text-xs text-[var(--text-soft)]">{{ item.time }}</p>
              </article>
            </div>
          </section>
        </aside>
      </div>
    </template>
  </section>
</template>
