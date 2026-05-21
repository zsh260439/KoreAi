<script setup lang="ts">
import { TrendingDown, TrendingUp } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()
const trendColumns = computed(() => adminStore.dashboard?.trend ?? [])

onMounted(async () => {
  if (!adminStore.dashboard) {
    await adminStore.loadDashboard()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="Dashboard"
      description="统一查看会话规模、命中率、任务状态和链路表现。"
      :breadcrumbs="['首页', 'Dashboard']"
    />

    <div
      v-if="adminStore.loading && !adminStore.dashboard"
      class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4"
    >
      <div
        v-for="item in 4"
        :key="item"
        class="h-36 rounded-[16px] border border-[var(--border-soft)] bg-white"
      />
    </div>

    <div
      v-else-if="adminStore.error && !adminStore.dashboard"
      class="rounded-[16px] border border-red-200 bg-red-50 p-5"
    >
      <p class="text-sm font-medium text-red-700">加载 Dashboard 失败</p>
      <p class="mt-2 text-sm text-red-600">{{ adminStore.error }}</p>
    </div>

    <template v-else-if="adminStore.dashboard">
      <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="metric in adminStore.dashboard.metrics"
          :key="metric.label"
          class="rounded-[16px] p-5"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm text-[var(--text-muted)]">{{ metric.label }}</p>
              <p class="mt-3 text-[30px] font-semibold leading-none text-[var(--text-primary)]">
                {{ metric.value }}
              </p>
              <p class="mt-2 text-xs text-[var(--text-muted)]">{{ metric.delta }}</p>
            </div>
            <div
              class="flex size-11 items-center justify-center rounded-[12px]"
              :class="metric.trend === 'down' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'"
            >
              <TrendingDown v-if="metric.trend === 'down'" class="size-5" />
              <TrendingUp v-else class="size-5" />
            </div>
          </div>
        </article>
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section class="admin-surface rounded-[16px] p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-[var(--text-primary)]">近 7 日趋势</h2>
              <p class="mt-1 text-sm text-[var(--text-muted)]">会话活跃度与整体波动概览</p>
            </div>
          </div>
          <div class="mt-6 grid grid-cols-7 gap-3">
            <div v-for="point in trendColumns" :key="point.label" class="flex flex-col items-center gap-3">
              <div class="flex h-40 w-full items-end rounded-[14px] bg-[var(--bg-surface-subtle)] p-2">
                <div class="w-full rounded-[10px] bg-[var(--brand-primary)]" :style="{ height: `${point.value}%` }" />
              </div>
              <div class="text-center">
                <div class="text-xs text-[var(--text-muted)]">{{ point.label }}</div>
                <div class="mt-1 text-sm font-medium text-[var(--text-primary)]">{{ point.value }}</div>
              </div>
            </div>
          </div>
        </section>

        <section class="admin-surface rounded-[16px] p-6">
          <h2 class="text-lg font-semibold text-[var(--text-primary)]">近期任务</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="task in adminStore.dashboard.recentTasks"
              :key="task.id"
              class="rounded-[14px] border border-[var(--border-default)] p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-[var(--text-primary)]">{{ task.name }}</p>
                  <p class="mt-1 text-xs text-[var(--text-muted)]">{{ task.detail }}</p>
                </div>
                <StatusBadge :status="task.status" />
              </div>
              <div class="mt-4">
                <div class="h-2 rounded-full bg-[var(--bg-surface-subtle)]">
                  <div class="h-2 rounded-full bg-[var(--brand-primary)]" :style="{ width: `${task.progress}%` }" />
                </div>
                <div class="mt-2 text-xs text-[var(--text-muted)]">{{ task.progress }}% 路 {{ task.updatedAt }}</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="admin-surface mt-6 rounded-[16px] p-6">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-[var(--text-primary)]">近期 Trace</h2>
            <p class="mt-1 text-sm text-[var(--text-muted)]">重点查看最新链路的 route、模型和时延</p>
          </div>
        </div>
        <div class="mt-4 overflow-x-auto rounded-[14px] border border-[var(--border-default)] bg-white">
          <table class="min-w-full border-collapse text-sm text-slate-700">
            <thead class="border-b border-[var(--border-default)] bg-slate-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">问题</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">Route</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">模型</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">耗时</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="trace in adminStore.dashboard.recentTraces"
                :key="trace.id"
                class="border-b border-[var(--border-default)] last:border-b-0"
              >
                <td class="px-4 py-3 align-top">
                  <div class="min-w-[320px]">
                    <p class="font-medium text-[var(--text-primary)]">{{ trace.question }}</p>
                    <p class="mt-1 text-xs text-[var(--text-muted)]">{{ trace.createdAt }}</p>
                  </div>
                </td>
                <td class="px-4 py-3">{{ trace.route }}</td>
                <td class="px-4 py-3">{{ trace.model }}</td>
                <td class="px-4 py-3">{{ trace.latencyMs }}ms</td>
                <td class="px-4 py-3"><StatusBadge :status="trace.status" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>
