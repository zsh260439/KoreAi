<script setup lang="ts">
import { onMounted } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

onMounted(async () => {
  if (!adminStore.users.length) {
    await adminStore.loadUsers()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="用户管理"
      description="查看用户角色、激活状态与最近活跃时间。"
      :breadcrumbs="['首页', '用户管理']"
    />

    <div class="overflow-x-auto rounded-[14px] border border-[var(--border-default)] bg-white">
      <table class="min-w-full text-left text-sm">
        <thead class="border-b border-[var(--border-default)] bg-[var(--bg-surface-subtle)]">
          <tr>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">姓名</th>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">邮箱</th>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">角色</th>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">状态</th>
            <th class="px-4 py-3 font-medium text-[var(--text-secondary)]">最近活跃</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in adminStore.users" :key="user.id" class="border-b border-[var(--border-soft)] last:border-b-0">
            <td class="px-4 py-3 font-medium text-[var(--text-primary)]">{{ user.name }}</td>
            <td class="px-4 py-3 text-[var(--text-secondary)]">{{ user.email }}</td>
            <td class="px-4 py-3 text-[var(--text-secondary)]">{{ user.role }}</td>
            <td class="px-4 py-3"><StatusBadge :status="user.status" /></td>
            <td class="px-4 py-3 text-[var(--text-secondary)]">{{ user.lastActive }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
