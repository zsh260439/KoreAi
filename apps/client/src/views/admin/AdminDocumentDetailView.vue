<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import { useAdminStore } from '@/stores/admin'

const route = useRoute()
const adminStore = useAdminStore()

const kbId = computed(() => String(route.params.kbId || ''))
const docId = computed(() => String(route.params.docId || ''))

onMounted(async () => {
  await adminStore.loadDocumentDetail(kbId.value, docId.value)
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="文档详情"
      description="查看单个文档的状态、来源与索引摘要。"
      :breadcrumbs="['首页', '知识库管理', '文档管理', '文档详情']"
    />

    <div v-if="adminStore.selectedDocument" class="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <div class="admin-surface rounded-[14px] p-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-[var(--text-muted)]">文档名称</p>
            <h2 class="mt-2 text-xl font-semibold text-[var(--text-primary)]">{{ adminStore.selectedDocument.name }}</h2>
          </div>
          <StatusBadge :status="adminStore.selectedDocument.status" />
        </div>

        <div class="mt-6 space-y-4 text-sm">
          <div>
            <p class="text-xs text-[var(--text-muted)]">来源</p>
            <p class="mt-1 text-[var(--text-primary)]">{{ adminStore.selectedDocument.source }}</p>
          </div>
          <div>
            <p class="text-xs text-[var(--text-muted)]">更新时间</p>
            <p class="mt-1 text-[var(--text-primary)]">{{ adminStore.selectedDocument.updatedAt }}</p>
          </div>
          <div>
            <p class="text-xs text-[var(--text-muted)]">分块数</p>
            <p class="mt-1 text-[var(--text-primary)]">{{ adminStore.selectedDocument.chunks }}</p>
          </div>
        </div>
      </div>

      <div class="admin-surface rounded-[14px] p-6">
        <p class="text-sm text-[var(--text-muted)]">摘要</p>
        <p class="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{{ adminStore.selectedDocument.summary }}</p>
        <div class="mt-6 rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-surface-subtle)] p-4">
          <p class="text-xs text-[var(--text-muted)]">Mock 内容预览</p>
          <p class="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
            此页面预留给文档详情、预处理日志和索引 chunk 预览。当前阶段保留结构和信息密度，不接真实文档渲染。
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
