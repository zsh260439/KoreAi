<script setup lang="ts">
import { MessageSquareText } from 'lucide-vue-next'

import { cn } from '@/utils/cn'
import type { ConversationSummary } from '@/types/models'

defineProps<{
  session: ConversationSummary
  active?: boolean
  collapsed?: boolean
}>()

defineEmits<{
  select: [sessionId: string]
}>()
</script>

<template>
  <button
    type="button"
    :aria-label="session.title"
    :class="
      cn(
        'flex h-[54px] w-full items-center gap-3 rounded-[12px] border border-transparent px-4 text-left transition-colors',
        active
          ? 'border-transparent bg-[#eef3ff] text-[#3366ff]'
          : 'text-slate-700 hover:bg-slate-50',
        collapsed && 'justify-center px-2'
      )
    "
    @click="$emit('select', session.id)"
  >
    <div
      :class="
        cn(
          'flex size-5 shrink-0 items-center justify-center text-[#64748b]',
          active && 'text-[#3366ff]'
        )
      "
    >
      <MessageSquareText class="size-[15px]" />
    </div>

    <div v-if="!collapsed" class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-3">
        <p class="truncate text-[15px] font-medium" :class="active ? 'text-[#3366ff]' : 'text-[#1f2937]'">
          {{ session.title }}
        </p>
        <span class="shrink-0 text-[13px] text-[#64748b]">
          {{ session.updatedAt.split(' ')[1] || session.updatedAt }}
        </span>
      </div>
    </div>
  </button>
</template>
