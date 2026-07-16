<script setup lang="ts">
import { MoreHorizontal } from 'lucide-vue-next'
import type { WorkspaceConversationSummary } from 'share-type'
import WorkspaceSidebarMark from './WorkspaceSidebarMark.vue'

defineProps<{
  conversation: WorkspaceConversationSummary
  active?: boolean
  streaming?: boolean
  timeLabel: string
}>()

defineEmits<{
  select: [conversationId: string]
  delete: [conversationId: string]
}>()
</script>

<template>
  <div
    :class="[
      'conversation-list-item group flex w-full items-center gap-2 rounded-[12px] border py-3.5 pl-4 pr-3 transition-colors',
      active
        ? 'border-[#e5e7eb] bg-[#f8fafc]'
        : 'border-transparent bg-transparent hover:border-[#f3f4f6] hover:bg-[#fafafa]'
    ]"
  >
    <button
      type="button"
      :aria-label="conversation.title"
      class="min-w-0 flex flex-1 items-center gap-3 text-left"
      @click="$emit('select', conversation.id)"
    >
      <WorkspaceSidebarMark :size="28" :busy="streaming" />

      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-3">
          <p
            class="truncate text-[14px] font-medium"
            :class="active ? 'text-[#111827]' : 'text-[#374151]'"
          >
            {{ conversation.title }}
          </p>
          <span class="shrink-0 text-[11px] tracking-[0.08em] text-[#94a3b8]">
            {{ timeLabel }}
          </span>
        </div>
        <p class="mt-1 truncate text-[12px] text-[#94a3b8]">
          {{ conversation.model || '助手' }}
        </p>
      </div>
    </button>

    <button
      type="button"
      class="flex size-8 shrink-0 items-center justify-center rounded-full text-[#94a3b8] opacity-0 transition hover:bg-[#f1f5f9] hover:text-[#111827] group-hover:opacity-100"
      aria-label="删除会话"
      @click.stop="$emit('delete', conversation.id)"
    >
      <MoreHorizontal class="size-4" />
    </button>
  </div>
</template>

<style scoped>
.conversation-list-item {
  content-visibility: auto;
  contain-intrinsic-size: 72px;
}
</style>
