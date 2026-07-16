<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminSidebar from '@/components/admin/AdminSidebar.vue'
import AdminTopbar from '@/components/admin/AdminTopbar.vue'
import { adminNavItems } from '@/config/navigation'

const route = useRoute()
const router = useRouter()
const isTraceRoute = computed(() => route.path === '/admin/traces')

type BreadcrumbItem = {
  label: string
  to?: string
}

//声明面包屑固定跳转映射
const breadcrumbPathMap: Record<string, string> = {
  首页: '/admin/knowledge',
  知识库管理: '/admin/knowledge',
  检索参数: '/admin/knowledge-settings',
  'Trace 链路': '/admin/traces'
}

//声明文档管理页路径生成
const getKnowledgeDocumentsPath = () => {
  const kbId = typeof route.params.kbId === 'string' ? route.params.kbId : ''
  return kbId ? `/admin/knowledge/${kbId}` : '/admin/knowledge'
}

//声明面包屑跳转路径解析
const resolveBreadcrumbPath = (label: string, isLast: boolean) => {
  if (isLast) {
    return undefined
  }

  if (label === '文档管理') {
    return getKnowledgeDocumentsPath()
  }

  return breadcrumbPathMap[label]
}

//声明面包屑列表生成
const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const labels =
    Array.isArray(route.meta.breadcrumb) && route.meta.breadcrumb.length
      ? route.meta.breadcrumb
      : ['首页']

  return labels.map((label, index) => ({
    label,
    to: resolveBreadcrumbPath(label, index === labels.length - 1)
  }))
})
</script>

<template>
  <div class="admin-layout min-h-screen bg-[#edf3f7] text-slate-900">
    <div class="flex h-screen">
      <AdminSidebar
        class="hidden lg:flex"
        :active-path="route.fullPath"
        :items="adminNavItems"
      />

      <div
        class="admin-layout__content flex min-h-screen flex-1 flex-col"
        :class="{ 'admin-layout__content--trace': isTraceRoute }"
      >
        <AdminTopbar @open-chat="router.push('/workspace')" />

        <div
          class="admin-layout__body mx-auto w-full max-w-[1600px] px-4 py-6 md:px-6 lg:px-8"
          :class="{ 'admin-layout__body--trace': isTraceRoute }"
        >
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

<style scoped>
.admin-layout__content {
  overflow-x: hidden;
  overflow-y: scroll;
  scrollbar-gutter: stable;
  background: linear-gradient(180deg, #eef4f7 0%, #edf3f7 100%);
}

.admin-layout__body {
  min-height: 100%;
  background:
    radial-gradient(circle at 10% 4%, rgba(15, 118, 110, 0.05), transparent 24%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0));
}

@media (min-width: 761px) {
  .admin-layout__content--trace {
    height: 100dvh;
    min-height: 0;
    overflow-y: hidden;
  }

  .admin-layout__body--trace {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  }

  .admin-layout__body--trace :deep(.trace-page) {
    min-height: 0;
    flex: 1;
  }
}
</style>
