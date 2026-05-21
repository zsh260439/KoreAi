<script setup lang="ts">
import { ChevronDown, LoaderCircle, Wrench } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { ToolCall } from '@/types/models'
import { cn } from '@/utils/cn'

const props = defineProps<{
  toolCall: ToolCall
}>()

const open = ref(false)

const toolLabel = computed(() => {
  const labelMap: Record<string, string> = {
    knowledge_search: '知识库检索',
    time_lookup: '时间查询',
    weather_lookup: '天气查询',
    air_quality: '空气质量查询',
    sunrise_sunset: '日出日落查询'
  }

  return labelMap[props.toolCall.name] || props.toolCall.name
})

const statusLabel = computed(() => {
  switch (props.toolCall.status) {
    case 'running':
      return '执行中'
    case 'error':
      return '失败'
    case 'paused':
      return '暂停'
    default:
      return '完成'
  }
})

const statusClass = computed(() => {
  if (props.toolCall.status === 'error') {
    return 'bg-red-50 text-red-700'
  }
  return 'bg-slate-100 text-slate-700'
})
</script>

<template>
  <div class="rounded-[12px] border border-[#d9e1ee] bg-slate-50">
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <div class="flex size-8 items-center justify-center rounded-[10px] bg-white text-blue-600 shadow-sm">
            <Wrench class="size-4" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-900">{{ toolLabel }}</p>
            <p class="text-xs text-slate-500">{{ toolCall.summary || '工具调用' }}</p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span
          :class="cn('inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5 text-[10px] font-medium', statusClass)"
        >
          <LoaderCircle v-if="toolCall.status === 'running'" class="size-3 animate-spin" />
          {{ statusLabel }}
        </span>
        <span class="text-xs text-slate-500">{{ toolCall.durationMs }}ms</span>
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-white"
          @click="open = !open"
        >
          <ChevronDown :class="cn('size-4 transition-transform', open && 'rotate-180')" />
        </button>
      </div>
    </div>

    <div v-if="open" class="space-y-3 border-t border-t-[#d9e1ee] px-4 py-3">
      <div>
        <p class="mb-1 text-xs font-medium text-slate-700">工具输入</p>
        <pre class="overflow-x-auto rounded-[10px] bg-white p-3 text-xs text-slate-900">{{ toolCall.inputPreview }}</pre>
      </div>
      <div>
        <p class="mb-1 text-xs font-medium text-slate-700">工具输出</p>
        <pre class="overflow-x-auto rounded-[10px] bg-white p-3 text-xs text-slate-900">{{ toolCall.outputPreview }}</pre>
      </div>
      <div v-if="toolCall.steps?.length">
        <p class="mb-1 text-xs font-medium text-slate-700">执行步骤</p>
        <ul class="space-y-1 text-xs text-slate-500">
          <li v-for="step in toolCall.steps" :key="step">- {{ step }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
