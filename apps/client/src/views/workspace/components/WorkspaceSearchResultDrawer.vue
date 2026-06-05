<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'

import type { AssistantSearchResultItem } from '@/types'

const props = defineProps<{
  open: boolean
  results: AssistantSearchResultItem[]
}>()

defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <el-drawer
    :model-value="open"
    :size="420"
    direction="rtl"
    :with-header="false"
    class="workspace-search-result-drawer"
    @update:model-value="$emit('update:open', $event)"
  >
    <div class="flex h-full flex-col bg-white">
      <div class="flex items-center justify-between border-b border-[#eef2f7] px-6 py-5">
        <div class="flex items-center gap-2">
          <Search class="size-4 text-[#111827]" />
          <h3 class="text-[20px] font-medium text-[#111827]">搜索结果</h3>
        </div>

        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f5f7fa] hover:text-[#111827]"
          @click="$emit('update:open', false)"
        >
          <X class="size-4" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div class="space-y-5">
          <article
            v-for="(item, index) in results"
            :key="item.id"
            class="rounded-[18px] border border-[#eef2f7] bg-white p-4 transition hover:border-[#dbe6ff] hover:bg-[#fafcff]"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-[13px] text-[#667085]">
                  {{ item.source }}
                  <span v-if="item.publishedAt" class="ml-2 text-[#98a2b3]">{{ item.publishedAt }}</span>
                </p>
                <h4 class="mt-2 text-[16px] font-medium leading-7 text-[#111827]">
                  {{ item.title }}
                </h4>
              </div>

              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f3f5f8] text-[12px] font-medium text-[#667085]"
              >
                {{ index + 1 }}
              </span>
            </div>

            <p class="mt-3 text-[14px] leading-7 text-[#475467]">
              {{ item.snippet }}
            </p>
          </article>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.workspace-search-result-drawer :deep(.el-drawer) {
  background: #ffffff;
}

.workspace-search-result-drawer :deep(.el-drawer__body) {
  padding: 0;
}
</style>
