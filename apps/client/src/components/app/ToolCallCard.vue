<script setup lang="ts">
import { Check, ChevronDown, Cloud, Clock3, LoaderCircle, Search, Wrench } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { ToolCall } from '@/types/models'
import { cn } from '@/utils/cn'

const props = defineProps<{
  toolCall: ToolCall
}>()

const open = ref(false)

const meta = computed(() => {
  const labelMap: Record<
    string,
    { title: string; subtitle: string; icon: typeof Search }
  > = {
    knowledge_search: {
      title: '知识库检索',
      subtitle: props.toolCall.summary || '从知识库中检索相关依据',
      icon: Search
    },
    time_lookup: {
      title: '时间解析',
      subtitle: props.toolCall.summary || '解析相对时间并校准时区',
      icon: Clock3
    },
    weather_lookup: {
      title: '天气查询',
      subtitle: props.toolCall.summary || '获取天气结果并提炼结论',
      icon: Cloud
    }
  }

  return (
    labelMap[props.toolCall.name] || {
      title: props.toolCall.name,
      subtitle: props.toolCall.summary || '工具执行',
      icon: Wrench
    }
  )
})
</script>

<template>
  <div class="rounded-[18px] border border-[#d9e2ef] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
    <div class="flex items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[#e8edf6] bg-[#fbfcfe] text-[#55637d] shadow-sm"
        >
          <component :is="meta.icon" class="size-5" />
        </div>
        <div class="min-w-0">
          <div class="inline-flex min-h-[34px] items-center rounded-[4px] bg-[#f4f7fb] px-4 text-[15px] font-semibold text-[#162033]">
            {{ meta.title }}
          </div>
          <p class="mt-1 truncate text-[14px] text-[#6f7d92]">{{ meta.subtitle }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-[13px] text-[#5d6b81]">{{ toolCall.durationMs }}ms</span>
        <div
          class="flex size-7 items-center justify-center rounded-full bg-[#f5f8fd]"
        >
          <LoaderCircle v-if="toolCall.status === 'running'" class="size-4 animate-spin text-[#3d6cff]" />
          <Check v-else class="size-4 text-[#3d6cff]" />
        </div>
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-[10px] text-slate-500 transition hover:bg-slate-50"
          @click="open = !open"
        >
          <ChevronDown :class="cn('size-4 transition-transform', open && 'rotate-180')" />
        </button>
      </div>
    </div>

    <div v-if="open" class="mt-4 space-y-3">
      <div class="rounded-[14px] border border-[#edf2f8] bg-[#fbfcfe] px-4 py-3">
        <p class="text-[13px] font-medium text-[#7b8799]">工具输入</p>
        <p class="mt-1 whitespace-pre-wrap break-all text-[14px] text-[#25324a]">{{ toolCall.inputPreview }}</p>
      </div>

      <div v-if="toolCall.steps?.length" class="space-y-2">
        <div
          v-for="step in toolCall.steps"
          :key="step"
          class="flex items-center gap-3 rounded-[14px] border border-[#edf2f8] bg-[#fbfcfe] px-4 py-3"
        >
          <Check class="size-4 text-[#3d6cff]" />
          <div class="flex min-h-[34px] flex-1 items-center rounded-[4px] bg-white px-4 text-[14px] font-medium text-[#24324a] shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            {{ step }}
          </div>
        </div>
      </div>

      <div class="rounded-[14px] border border-[#edf2f8] bg-[#fbfcfe] px-4 py-3">
        <p class="text-[13px] font-medium text-[#7b8799]">工具输出</p>
        <p class="mt-1 whitespace-pre-wrap text-[14px] text-[#25324a]">{{ toolCall.outputPreview }}</p>
      </div>
    </div>
  </div>
</template>
