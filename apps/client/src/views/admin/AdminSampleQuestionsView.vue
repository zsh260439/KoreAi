<script setup lang="ts">
import { onMounted } from 'vue'

import AdminPageHeader from '@/components/admin/AdminPageHeader.vue'
import { useAdminStore } from '@/stores/admin'

const adminStore = useAdminStore()

onMounted(async () => {
  if (!adminStore.sampleQuestions.length) {
    await adminStore.loadSampleQuestions()
  }
})
</script>

<template>
  <section>
    <AdminPageHeader
      title="示例问题"
      description="维护工作台的建议问题与常用问法。"
      :breadcrumbs="['首页', '示例问题']"
    />

    <div class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="question in adminStore.sampleQuestions"
        :key="question.id"
        class="admin-surface rounded-[14px] p-5"
      >
        <p class="text-sm font-medium text-[var(--text-primary)]">{{ question.question }}</p>
        <div class="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <span>{{ question.category }}</span>
          <span>{{ question.updatedAt }}</span>
        </div>
      </article>
    </div>
  </section>
</template>
