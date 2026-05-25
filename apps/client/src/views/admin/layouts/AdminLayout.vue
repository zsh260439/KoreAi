<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminSidebar from '@/components/admin/AdminSidebar.vue'
import AdminTopbar from '@/components/admin/AdminTopbar.vue'
import { adminNavGroups } from '@/config/navigation'
import { useAdminStore } from '@/stores/admin'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()
const authStore = useAuthStore()

const breadcrumbMap: Record<string, string> = {
  dashboard: 'Dashboard',
  knowledge: '知识库管理',
  ingestion: '流水线任务',
  traces: '链路追踪',
  settings: 'Settings'
}

watch(
  () => adminStore.searchValue,
  async (query) => {
    await adminStore.updateSearch(query)
  }
)

onMounted(async () => {
  await adminStore.updateSearch('')
})

const breadcrumbs = computed(() => {
  const segments = route.path.split('/').filter(Boolean)
  const items: { label: string; to?: string }[] = [{ label: '首页', to: '/admin/dashboard' }]

  if (segments[0] !== 'admin') {
    return items
  }

  const section = segments[1]
  if (section) {
    items.push({
      label: breadcrumbMap[section] || section,
      to: `/admin/${section}`
    })
  }

  if (section === 'knowledge' && segments.length > 2) {
    items.push({ label: '文档管理' })
  }

  if (section === 'knowledge' && segments.includes('docs')) {
    items.push({ label: '文档详情' })
  }

  if (section === 'traces' && segments.length > 2) {
    items.push({ label: '链路详情' })
  }

  return items
})

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="admin-layout min-h-screen bg-slate-100 text-slate-900">
    <div class="flex h-screen">
      <AdminSidebar
        class="hidden lg:flex"
        :collapsed="adminStore.collapsed"
        :active-path="route.fullPath"
        :groups="adminNavGroups"
        :user="authStore.user"
        @toggle-collapse="adminStore.toggleCollapse"
      />

      <div class="flex min-h-screen flex-1 flex-col overflow-auto bg-slate-100">
        <AdminTopbar
          :search-value="adminStore.searchValue"
          :search-loading="adminStore.searchLoading"
          :suggestions="adminStore.searchSuggestions"
          :user="authStore.user"
          @search-change="adminStore.searchValue = $event"
          @search-select="router.push($event)"
          @open-chat="router.push('/workspace')"
          @logout="handleLogout"
          @open-sidebar="adminStore.toggleMobileSidebar(true)"
        />

        <div class="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 lg:px-8">
          <nav class="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500" aria-label="面包屑">
            <span
              v-for="(item, index) in breadcrumbs"
              :key="`${item.label}-${index}`"
              class="flex items-center gap-2"
            >
              <router-link
                v-if="item.to && index < breadcrumbs.length - 1"
                :to="item.to"
                class="transition-colors hover:text-slate-900"
              >
                {{ item.label }}
              </router-link>
              <span v-else :class="index === breadcrumbs.length - 1 ? 'text-slate-900' : ''">
                {{ item.label }}
              </span>
              <span v-if="index < breadcrumbs.length - 1">/</span>
            </span>
          </nav>
          <router-view />
        </div>
      </div>
    </div>

    <el-drawer
      :model-value="adminStore.mobileSidebarOpen"
      @update:model-value="adminStore.mobileSidebarOpen = $event"
      :size="320"
      direction="ltr"
      :with-header="false"
    >
      <AdminSidebar
        :collapsed="false"
        :active-path="route.fullPath"
        :groups="adminNavGroups"
        :user="authStore.user"
        @toggle-collapse="adminStore.toggleCollapse"
        @navigate="adminStore.toggleMobileSidebar(false)"
      />
    </el-drawer>
  </div>
</template>
