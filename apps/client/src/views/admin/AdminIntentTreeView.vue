<script setup lang="ts">
import { onMounted } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

onMounted(async () => {
  if (!adminStore.intentTree.length) {
    await adminStore.loadIntentData()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="意图树配置"
      description="按层级组织制度问答、实时查询等意图节点。"
      :breadcrumbs="['首页', '意图管理', '意图树配置']"
    />

    <div class="space-y-4">
      <article
        v-for="node in adminStore.intentTree"
        :key="node.id"
        class="admin-surface rounded-[14px] p-5"
      >
        <p class="text-sm font-medium text-[var(--text-primary)]">{{ node.name }}</p>
        <p class="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{{ node.description }}</p>
        <div v-if="node.children?.length" class="mt-4 space-y-3 border-l border-[var(--border-default)] pl-4">
          <div
            v-for="child in node.children"
            :key="child.id"
            class="rounded-[12px] border border-[var(--border-default)] bg-white p-4"
          >
            <p class="text-sm font-medium text-[var(--text-primary)]">{{ child.name }}</p>
            <p class="mt-1 text-xs text-[var(--text-muted)]">{{ child.description }}</p>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
