<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminSidebar from '@/components/admin/AdminSidebar.vue'
import AdminTopbar from '@/components/admin/AdminTopbar.vue'
import { adminNavItems } from '@/config/navigation'

const route = useRoute()
const router = useRouter()

const breadcrumbMap: Record<string, string> = {
  knowledge: '知识库管理',
  architecture: '代码地图'
}

const breadcrumbs = computed(() => {
  const segments = route.path.split('/').filter(Boolean)
  const items: { label: string; to?: string }[] = [{ label: '首页', to: '/admin/knowledge' }]

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
    items.push({ label: '切片管理' })
  }

  return items
})

</script>

<template>
  <div class="admin-layout min-h-screen bg-slate-100 text-slate-900">
    <div class="flex h-screen">
      <AdminSidebar
        class="hidden lg:flex"
        :active-path="route.fullPath"
        :items="adminNavItems"
      />

      <div class="flex min-h-screen flex-1 flex-col overflow-auto bg-slate-100">
        <AdminTopbar @open-chat="router.push('/workspace')" />

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

  </div>
</template>
