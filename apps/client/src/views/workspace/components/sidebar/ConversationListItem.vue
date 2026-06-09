<script setup lang="ts">
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
}>()
</script>

<template>
  <button
    type="button"
    :aria-label="conversation.title"
    :class="[
      'w-full rounded-[16px] border px-4 py-3 text-left transition-colors',
      active
        ? 'border-[#e5e7eb] bg-[#f9fafb]'
        : 'border-transparent bg-transparent hover:border-[#f3f4f6] hover:bg-[#fafafa]'
    ]"
    @click="$emit('select', conversation.id)"
  >
    <div class="flex items-center gap-3">
      <WorkspaceSidebarMark :size="36" :busy="streaming" />

      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-3">
          <p
            class="truncate text-[14px] font-medium"
            :class="active ? 'text-[#111827]' : 'text-[#374151]'"
          >
            {{ conversation.title }}
          </p>
          <span class="shrink-0 text-[11px] tracking-[0.08em] text-[#9ca3af]">
            {{ timeLabel }}
          </span>
        </div>
        <p class="mt-1 truncate text-[12px] text-[#9ca3af]">
          {{ conversation.model || '助手' }}
        </p>
      </div>
    </div>
  </button>
</template>
