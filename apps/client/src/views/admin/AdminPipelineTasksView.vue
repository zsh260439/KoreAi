<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores/admin'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const activeTab = computed({
  get: () => String(route.query.tab || 'pipelines'),
  set: (value: string) => {
    router.replace({
      query: {
        ...route.query,
        tab: value
      }
    })
  }
})

onMounted(async () => {
  if (!adminStore.pipelines.length && !adminStore.tasks.length) {
    await adminStore.loadPipelines()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="数据通道"
      description="查看流水线执行进度、失败任务与同步状态。"
      :breadcrumbs="['首页', '数据通道']"
    />

    <TabsRoot v-model="activeTab" class="w-full">
      <TabsList class="grid w-full max-w-md grid-cols-2 rounded-[12px] bg-slate-100 p-1">
        <TabsTrigger
          value="pipelines"
          class="inline-flex items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium text-slate-500 transition data-[state=active]:bg-white data-[state=active]:text-slate-900"
        >
          pipelines
        </TabsTrigger>
        <TabsTrigger
          value="tasks"
          class="inline-flex items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium text-slate-500 transition data-[state=active]:bg-white data-[state=active]:text-slate-900"
        >
          tasks
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pipelines" class="mt-6 space-y-4">
        <article
          v-for="pipeline in adminStore.pipelines"
          :key="pipeline.id"
          class="admin-surface rounded-[14px] p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-[var(--text-primary)]">{{ pipeline.name }}</p>
              <p class="mt-1 text-xs text-[var(--text-muted)]">{{ pipeline.detail }}</p>
            </div>
            <StatusBadge :status="pipeline.status" />
          </div>
          <div class="mt-4 h-2 rounded-full bg-[var(--bg-surface-subtle)]">
            <div class="h-2 rounded-full bg-[var(--brand-primary)]" :style="{ width: `${pipeline.progress}%` }" />
          </div>
          <p class="mt-2 text-xs text-[var(--text-muted)]">{{ pipeline.progress }}% 路 {{ pipeline.updatedAt }}</p>
        </article>
      </TabsContent>

      <TabsContent value="tasks" class="mt-6 space-y-4">
        <article
          v-for="task in adminStore.tasks"
          :key="task.id"
          class="admin-surface rounded-[14px] p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-[var(--text-primary)]">{{ task.name }}</p>
              <p class="mt-1 text-xs text-[var(--text-muted)]">{{ task.detail }}</p>
            </div>
            <StatusBadge :status="task.status" />
          </div>
          <div class="mt-4 h-2 rounded-full bg-[var(--bg-surface-subtle)]">
            <div class="h-2 rounded-full bg-[var(--brand-primary)]" :style="{ width: `${task.progress}%` }" />
          </div>
          <p class="mt-2 text-xs text-[var(--text-muted)]">{{ task.progress }}% 路 {{ task.updatedAt }}</p>
        </article>
      </TabsContent>
    </TabsRoot>
  </section>
</template>
