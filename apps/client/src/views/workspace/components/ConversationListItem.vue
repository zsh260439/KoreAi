<script setup lang="ts">
import { LoaderCircle, Sparkles } from 'lucide-vue-next'

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
    :class="
      [
        'flex h-[54px] w-full items-center gap-3 rounded-[12px] border border-transparent px-4 text-left transition-colors',
        active ? 'border-transparent bg-[#eef3ff] text-[#3366ff]' : 'text-slate-700 hover:bg-[#f6f7fb]'
      ]
    "
    @click="$emit('select', session.id)"
  >
    <div
      :class="
        ['flex size-5 shrink-0 items-center justify-center text-[#64748b]', active && 'text-[#3366ff]']
      "
    >
      <LoaderCircle v-if="streaming" class="size-[15px] animate-spin" />
      <Sparkles v-else class="size-[15px]" />
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-3">
        <p class="truncate text-[15px] font-medium" :class="active ? 'text-[#3366ff]' : 'text-[#1f2937]'">
          {{ session.title }}
        </p>
        <span class="shrink-0 text-[13px] text-[#64748b]">
          {{ timeLabel }}
        </span>
      </div>
    </div>
  </button>
</template>
