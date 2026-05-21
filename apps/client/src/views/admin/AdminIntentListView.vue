<script setup lang="ts">
import { onMounted } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

onMounted(async () => {
  if (!adminStore.intentList.length) {
    await adminStore.loadIntentData()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="意图列表"
      description="从平铺视角查看意图节点与样例数量。"
      :breadcrumbs="['首页', '意图管理', '意图列表']"
    />

    <div class="overflow-x-auto rounded-[14px] border border-[var(--border-default)] bg-white">
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-[var(--border-default)] bg-[var(--bg-surface-subtle)]">
          <tr>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">名称</th>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">描述</th>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">样例数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in adminStore.intentList" :key="item.id" class="border-b border-[var(--border-soft)] last:border-b-0">
            <td class="px-4 py-3 font-medium text-[var(--text-primary)]">{{ item.name }}</td>
            <td class="px-4 py-3 text-[var(--text-secondary)]">{{ item.description }}</td>
            <td class="px-4 py-3 text-[var(--text-secondary)]">{{ item.sampleCount }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
