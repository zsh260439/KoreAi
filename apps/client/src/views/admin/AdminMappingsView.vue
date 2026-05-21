<script setup lang="ts">
import { onMounted } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

onMounted(async () => {
  if (!adminStore.mappings.length) {
    await adminStore.loadMappings()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="关键词映射"
      description="将关键词、意图和目标知识库或工具进行映射。"
      :breadcrumbs="['首页', '关键词映射']"
    />

    <div class="grid gap-4">
      <article
        v-for="mapping in adminStore.mappings"
        :key="mapping.id"
        class="admin-surface rounded-[14px] p-5"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-[var(--text-primary)]">{{ mapping.keyword }}</p>
            <p class="mt-2 text-sm text-[var(--text-secondary)]">
              意图：{{ mapping.intent }} · 目标：{{ mapping.target }}
            </p>
          </div>
          <StatusBadge :status="mapping.status" />
        </div>
        <p class="mt-3 text-xs text-[var(--text-muted)]">更新于 {{ mapping.updatedAt }}</p>
      </article>
    </div>
  </section>
</template>
