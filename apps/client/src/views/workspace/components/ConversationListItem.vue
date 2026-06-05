<script setup lang="ts">
import { Bot, LoaderCircle } from 'lucide-vue-next'

import type { ConversationSummary } from '@/types'

defineProps<{
  session: ConversationSummary
  active?: boolean
  streaming?: boolean
  timeLabel: string
}>()

defineEmits<{
  select: [sessionId: string]
}>()
</script>

<template>
  <button
    type="button"
    :aria-label="session.title"
    :class="[
      'w-full rounded-[16px] border px-4 py-3 text-left transition-colors',
      active
        ? 'border-[#e5e7eb] bg-[#f9fafb]'
        : 'border-transparent bg-transparent hover:border-[#f3f4f6] hover:bg-[#fafafa]'
    ]"
    @click="$emit('select', session.id)"
  >
    <div class="flex items-center gap-3">
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280]"
      >
        <LoaderCircle v-if="streaming" class="size-4 animate-spin" />
        <Bot v-else class="size-4" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-3">
          <p class="truncate text-[14px] font-medium" :class="active ? 'text-[#111827]' : 'text-[#374151]'">
            {{ session.title }}
          </p>
          <span class="shrink-0 text-[11px] tracking-[0.08em] text-[#9ca3af]">
            {{ timeLabel }}
          </span>
        </div>
        <p class="mt-1 truncate text-[12px] text-[#9ca3af]">
          {{ session.model || '助手' }}
        </p>
      </div>
    </div>
  </button>
</template>
