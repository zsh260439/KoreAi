<script setup lang="ts">
import { Copy, LoaderCircle, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-vue-next'

import type { ChatMessage } from '@/types/models'
import ToolCallCard from './ToolCallCard.vue'

defineProps<{
  message: ChatMessage
  showMeta?: boolean
}>()

defineEmits<{
  detail: [traceId?: string]
  regenerate: []
}>()
</script>

<template>
  <div :class="message.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
    <div
      :class="
        message.role === 'user'
          ? 'max-w-[360px] rounded-[12px] bg-blue-100 px-5 py-4 text-[16px] leading-7 text-slate-900'
          : 'max-w-[920px] text-sm leading-7 text-slate-900'
      "
    >
      <div v-if="message.role === 'assistant'" class="flex items-start gap-3">
        <div
          class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-[12px] font-semibold text-blue-600 shadow-sm"
        >
          F
        </div>
        <div class="min-w-0 flex-1">
          <div class="mb-3 flex items-center gap-1.5">
            <button
              type="button"
              class="flex size-8 items-center justify-center rounded-[8px] border border-[#d9e1ee] bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <Copy class="size-3.5" />
            </button>
            <button
              type="button"
              class="flex size-8 items-center justify-center rounded-[8px] border border-[#d9e1ee] bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <Volume2 class="size-3.5" />
            </button>
            <button
              type="button"
              class="flex size-8 items-center justify-center rounded-[8px] border border-[#d9e1ee] bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <ThumbsUp class="size-3.5" />
            </button>
            <button
              type="button"
              class="flex size-8 items-center justify-center rounded-[8px] border border-[#d9e1ee] bg-white text-slate-700 transition hover:bg-slate-50"
            >
              <ThumbsDown class="size-3.5" />
            </button>
            <span v-if="showMeta" class="ml-1 text-[13px] text-slate-500">
              {{ message.createdAt.slice(11, 16) }}
            </span>
          </div>

          <div class="max-w-[640px] rounded-[16px] bg-slate-50 px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            <div
              class="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#d9e1ee] bg-white px-4 text-[15px] font-medium text-slate-900"
            >
              <span class="text-[14px]">思</span>
              <span>思考过程</span>
            </div>

            <div class="mt-4 whitespace-pre-wrap text-[16px] leading-8 text-slate-900">
              {{ message.content || '正在生成...' }}
            </div>

            <div v-if="message.status === 'streaming'" class="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <LoaderCircle class="size-3 animate-spin" />
              正在生成
            </div>

            <div v-if="message.toolCalls?.length" class="mt-4 space-y-3">
              <ToolCallCard v-for="toolCall in message.toolCalls" :key="toolCall.id" :tool-call="toolCall" />
            </div>

            <div v-if="showMeta" class="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span class="rounded-[10px] bg-[#f2e8ff] px-2 py-0.5 text-[11px] font-medium text-[#bf5af2]">
                {{ ((message.latencyMs || 0) / 1000).toFixed(2) }}s
              </span>
              <button
                type="button"
                class="h-7 rounded-[8px] px-2 text-[13px] text-slate-700 transition hover:bg-slate-100"
                @click="$emit('detail', message.traceId)"
              >
                查看详情
              </button>
              <button
                type="button"
                class="h-7 rounded-[8px] px-2 text-[13px] text-slate-700 transition hover:bg-slate-100"
                @click="$emit('regenerate')"
              >
                重新生成
              </button>
            </div>
          </div>
        </div>
      </div>

      <template v-else>
        <div class="whitespace-pre-wrap">{{ message.content || '正在生成...' }}</div>
        <div v-if="message.status === 'streaming'" class="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <LoaderCircle class="size-3 animate-spin" />
          正在生成
        </div>
      </template>
    </div>
  </div>
</template>
