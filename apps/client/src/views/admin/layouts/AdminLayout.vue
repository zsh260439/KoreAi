<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

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
  'intent-tree': '意图树配置',
  'intent-list': '意图列表',
  ingestion: '数据通道',
  traces: '链路追踪',
  'sample-questions': '示例问题',
  mappings: '关键词映射',
  settings: '系统设置',
  users: '用户管理'
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
    if (section === 'intent-tree' || section === 'intent-list') {
      items.push({ label: '意图管理', to: '/admin/intent-tree' })
      items.push({
        label: breadcrumbMap[section] || section,
        to: section === 'intent-list' ? '/admin/intent-list' : undefined
      })
    } else {
      items.push({
        label: breadcrumbMap[section] || section,
        to: `/admin/${section}`
      })
    }
  }

  if (section === 'ingestion') {
    const tab = String(route.query.tab || '')
    if (tab === 'tasks') {
      items.push({ label: '流水线任务' })
    } else if (tab === 'pipelines') {
      items.push({ label: '流水线管理' })
    }
  }

  if (section === 'knowledge' && segments.length > 2) {
    items.push({ label: '文档管理' })
  }

  if (section === 'knowledge' && segments.includes('docs')) {
    items.push({ label: '切片管理' })
  }

  if (section === 'traces' && segments.length > 2) {
    items.push({ label: '链路详情' })
  }

  return items
})

function handleLogout() {
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

    <DialogRoot :open="adminStore.mobileSidebarOpen" @update:open="adminStore.mobileSidebarOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/45 lg:hidden" />
        <DialogContent
          class="fixed inset-y-0 left-0 z-50 w-[320px] max-w-[320px] border-r bg-white p-0 shadow-xl outline-none lg:hidden"
        >
          <div class="border-b px-4 py-4 text-left">
            <DialogTitle class="text-base font-semibold text-slate-900">后台导航</DialogTitle>
          </div>
          <div>
            <AdminSidebar
              :collapsed="false"
              :active-path="route.fullPath"
              :groups="adminNavGroups"
              :user="authStore.user"
              @toggle-collapse="adminStore.toggleCollapse"
              @navigate="adminStore.toggleMobileSidebar(false)"
            />
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
