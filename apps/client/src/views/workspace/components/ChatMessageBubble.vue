<script setup lang="ts">
import {
  Brain,
  Check,
  ChevronDown,
  Clock3,
  Cloud,
  Copy,
  Globe,
  LoaderCircle,
  Search,
  ThumbsDown,
  ThumbsUp,
  TimerReset,
  Volume2,
  Wrench
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import type { AssistantThinkingStage, AssistantToolStage, ChatMessage } from '@/types'

const props = defineProps<{
  message: ChatMessage
  showMeta?: boolean
  regenerating?: boolean
}>()

defineEmits<{
  detail: [traceId?: string]
  regenerate: [messageId: string]
}>()

const responseFlow = computed(() => props.message.responseFlow)
const processOpen = ref(props.message.status === 'streaming')

watch(
  () => props.message.status,
  (status, previousStatus) => {
    if (status === 'streaming') {
      processOpen.value = true
      return
    }

    if (previousStatus === 'streaming' && status === 'done') {
      processOpen.value = false
    }
  },
  { immediate: true }
)

const toolIconMap = {
  knowledge: Search,
  time: Clock3,
  weather: Cloud,
  search: Globe,
  thinking: Brain,
  generic: Wrench
} as const

const thinkingStages = computed(
  () =>
    responseFlow.value?.thinking.filter(
      (stage) => stage.status !== 'pending' || stage.visibleContent || stage.content
    ) ?? []
)

const toolStages = computed(
  () =>
    responseFlow.value?.tools.filter(
      (item) => item.status !== 'pending' || item.showInput || item.showSteps || item.showOutput
    ) ?? []
)

const isThinkingRunning = computed(() =>
  thinkingStages.value.some((stage) => stage.status === 'running')
)

const runningStageTitle = computed(
  () => thinkingStages.value.find((stage) => stage.status === 'running')?.title ?? ''
)

const processSummary = computed(() => {
  if (!responseFlow.value || props.message.status === 'streaming') {
    return runningStageTitle.value
  }

  const stageCount = thinkingStages.value.length
  const toolCount = responseFlow.value.tools.length
  const summary: string[] = []

  if (stageCount > 0) {
    summary.push(`${stageCount} 个思考阶段`)
  }

  if (toolCount > 0) {
    summary.push(`${toolCount} 个工具调用`)
  }

  if (summary.length === 0) {
    return '推理已完成，展开可查看详细过程。'
  }

  return `${summary.join('，')}已完成`
})

const formatLatency = (latencyMs?: number) => `${((latencyMs || 0) / 1000).toFixed(2)}s`

const getToolIcon = (tool: AssistantToolStage) => toolIconMap[tool.iconKey] ?? Wrench

const getThinkingIcon = (stage: AssistantThinkingStage) => {
  if (stage.stageKey === 'web_search') {
    return Globe
  }

  return Brain
}

const getStageStatusLabel = (status: string) => {
  if (status === 'running') {
    return '执行中'
  }

  if (status === 'error') {
    return '异常'
  }

  return '完成'
}

const toggleProcess = () => {
  if (responseFlow.value) {
    processOpen.value = !processOpen.value
  }
}
</script>

<template>
  <div :class="message.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
    <div
      :class="
        message.role === 'user'
          ? 'max-w-[360px] rounded-[14px] bg-[#f3f5f8] px-5 py-4 text-[16px] leading-8 text-slate-900'
          : 'max-w-[920px] text-sm leading-7 text-slate-900'
      "
    >
      <div v-if="message.role === 'assistant'" class="flex items-start gap-4">
        <div
          class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[#e5ebf5] bg-white text-[15px] font-semibold text-[#355fe9] shadow-[0_6px_18px_rgba(53,95,233,0.08)]"
        >
          C
        </div>

        <div class="min-w-0 flex-1">
          <div class="mb-3 flex items-center gap-2 text-slate-700">
            <button
              type="button"
              class="flex size-9 items-center justify-center rounded-[10px] border border-[#dbe3f1] bg-white transition hover:bg-slate-50"
            >
              <Copy class="size-4" />
            </button>
            <button
              type="button"
              class="flex size-9 items-center justify-center rounded-[10px] border border-[#dbe3f1] bg-white transition hover:bg-slate-50"
            >
              <Volume2 class="size-4" />
            </button>
            <button
              type="button"
              class="flex size-9 items-center justify-center rounded-[10px] border border-[#dbe3f1] bg-white transition hover:bg-slate-50"
            >
              <ThumbsUp class="size-4" />
            </button>
            <button
              type="button"
              class="flex size-9 items-center justify-center rounded-[10px] border border-[#dbe3f1] bg-white transition hover:bg-slate-50"
            >
              <ThumbsDown class="size-4" />
            </button>
            <span v-if="showMeta" class="ml-1 text-[13px] text-slate-500">
              {{ message.createdAt.slice(11, 16) }}
            </span>
          </div>

          <div class="max-w-[720px] rounded-[24px] bg-[#f7f9fc] px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div v-if="responseFlow" class="space-y-4">
              <section class="rounded-[18px] border border-[#e6edf7] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  @click="toggleProcess"
                >
                  <div class="flex min-w-0 items-center gap-3">
                    <div
                      class="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#dbe6ff] bg-[#f8fbff] px-4 text-[15px] font-semibold text-slate-900 shadow-sm"
                    >
                      <LoaderCircle
                        v-if="isThinkingRunning"
                        class="size-4 animate-spin text-[#3d6cff]"
                      />
                      <Check v-else class="size-4 text-[#3d6cff]" />
                      <span>思考过程</span>
                    </div>
                    <p v-if="processSummary && !processOpen" class="truncate text-[14px] text-[#6f7d92]">
                      {{ processSummary }}
                    </p>
                  </div>

                  <ChevronDown
                    class="size-4 shrink-0 text-[#7f8aa0] transition-transform duration-200"
                    :class="processOpen && 'rotate-180'"
                  />
                </button>

                <transition name="process-collapse">
                  <div v-if="processOpen" class="border-t border-t-[#eef2f7] px-5 pb-5 pt-4">
                    <transition-group name="stage-slide" tag="div" class="space-y-3">
                      <section
                        v-for="stage in thinkingStages"
                        :key="stage.id"
                        class="rounded-[18px] border border-[#d9e2ef] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                      >
                        <div class="flex items-center justify-between gap-4">
                          <div class="flex min-w-0 items-center gap-3">
                            <div
                              class="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[#e8edf6] bg-[#fbfcfe] text-[#55637d] shadow-sm"
                            >
                              <component :is="getThinkingIcon(stage)" class="size-5" />
                            </div>
                            <div class="min-w-0">
                              <div
                                class="inline-flex min-h-[34px] items-center rounded-[4px] bg-[#f4f7fb] px-4 text-[15px] font-semibold text-[#162033]"
                              >
                                {{ stage.title }}
                              </div>
                              <p v-if="stage.subtitle" class="mt-1 truncate text-[14px] text-[#6f7d92]">
                                {{ stage.subtitle }}
                              </p>
                            </div>
                          </div>

                          <div class="flex shrink-0 items-center gap-3 text-[13px] text-[#5d6b81]">
                            <div class="flex size-7 items-center justify-center rounded-full bg-[#f5f8fd]">
                              <LoaderCircle
                                v-if="stage.status === 'running'"
                                class="size-4 animate-spin text-[#3d6cff]"
                              />
                              <Check v-else class="size-4 text-[#3d6cff]" />
                            </div>
                            <span>{{ getStageStatusLabel(stage.status) }}</span>
                          </div>
                        </div>

                        <div class="mt-4 whitespace-pre-wrap text-[14px] leading-7 text-[#4a5568]">
                          {{
                            stage.visibleContent ||
                            (message.status === 'streaming' ? '正在梳理思考链路...' : stage.content)
                          }}
                        </div>
                      </section>
                    </transition-group>

                    <div v-if="toolStages.length" class="mt-4 space-y-3">
                      <p class="px-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8b97a9]">
                        工具执行
                      </p>

                      <transition-group name="stage-slide" tag="div" class="space-y-3">
                        <section
                          v-for="tool in toolStages"
                          :key="tool.id"
                          class="rounded-[18px] border border-[#d9e2ef] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                        >
                          <div class="flex items-center justify-between gap-4">
                            <div class="flex min-w-0 items-center gap-3">
                              <div
                                class="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[#e8edf6] bg-[#fbfcfe] text-[#55637d] shadow-sm"
                              >
                                <component :is="getToolIcon(tool)" class="size-5" />
                              </div>
                              <div class="min-w-0">
                                <div
                                  class="inline-flex min-h-[34px] items-center rounded-[4px] bg-[#f4f7fb] px-4 text-[15px] font-semibold text-[#162033]"
                                >
                                  {{ tool.title }}
                                </div>
                                <p class="mt-1 truncate text-[14px] text-[#6f7d92]">{{ tool.subtitle }}</p>
                              </div>
                            </div>

                            <div class="flex shrink-0 items-center gap-3 text-[13px] text-[#5d6b81]">
                              <div class="flex size-7 items-center justify-center rounded-full bg-[#f5f8fd]">
                                <LoaderCircle
                                  v-if="tool.status === 'running'"
                                  class="size-4 animate-spin text-[#3d6cff]"
                                />
                                <Check v-else class="size-4 text-[#3d6cff]" />
                              </div>
                              <span>{{ getStageStatusLabel(tool.status) }}</span>
                              <span>{{ tool.durationMs }}ms</span>
                            </div>
                          </div>

                          <div class="mt-4 space-y-3">
                            <div
                              v-if="tool.showInput"
                              class="rounded-[14px] border border-[#edf2f8] bg-[#fbfcfe] px-4 py-3"
                            >
                              <p class="text-[13px] font-medium text-[#7b8799]">{{ tool.inputLabel }}</p>
                              <p class="mt-1 whitespace-pre-wrap break-all text-[14px] text-[#25324a]">
                                {{ tool.visibleInput }}
                              </p>
                            </div>

                            <div v-if="tool.showSteps" class="space-y-2">
                              <div
                                v-for="step in tool.steps"
                                :key="step.id"
                                class="flex items-center gap-3 rounded-[14px] border border-[#edf2f8] bg-[#fbfcfe] px-4 py-3"
                              >
                                <div class="flex size-6 items-center justify-center">
                                  <LoaderCircle
                                    v-if="step.status === 'running'"
                                    class="size-4 animate-spin text-[#3d6cff]"
                                  />
                                  <Check
                                    v-else-if="step.status === 'success'"
                                    class="size-4 text-[#3d6cff]"
                                  />
                                  <TimerReset v-else class="size-4 text-[#b0bac9]" />
                                </div>
                                <div
                                  class="flex min-h-[34px] flex-1 items-center rounded-[4px] bg-white px-4 text-[14px] font-medium text-[#24324a] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                                >
                                  {{ step.label }}
                                </div>
                              </div>
                            </div>

                            <div
                              v-if="tool.showOutput"
                              class="rounded-[14px] border border-[#edf2f8] bg-[#fbfcfe] px-4 py-3"
                            >
                              <p class="text-[13px] font-medium text-[#7b8799]">{{ tool.outputLabel }}</p>
                              <p class="mt-1 whitespace-pre-wrap text-[14px] text-[#25324a]">
                                {{ tool.visibleOutput }}
                              </p>
                            </div>
                          </div>
                        </section>
                      </transition-group>
                    </div>
                  </div>
                </transition>
              </section>

              <section
                v-if="responseFlow.answer.status !== 'pending' || responseFlow.answer.visibleContent"
                class="rounded-[18px] border border-[#e6edf7] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
              >
                <div class="whitespace-pre-wrap text-[16px] leading-8 text-slate-900">
                  {{ responseFlow.answer.visibleContent }}
                </div>
              </section>
            </div>

            <template v-else>
              <div class="whitespace-pre-wrap text-[16px] leading-8 text-slate-900">
                {{ message.content || '正在生成...' }}
              </div>
            </template>

            <div
              v-if="showMeta && responseFlow?.showActions"
              class="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500"
            >
              <span class="rounded-full bg-[#f4e8ff] px-2.5 py-1 text-[11px] font-medium text-[#bf5af2]">
                {{ formatLatency(message.latencyMs) }}
              </span>
              <button
                v-if="message.traceId"
                type="button"
                class="inline-flex items-center rounded-[8px] px-1 py-0.5 text-[11px] font-medium text-[#8d97a8] transition-colors hover:text-[#4e79ff]"
                @click="$emit('detail', message.traceId)"
              >
                查看详情
              </button>
              <button
                type="button"
                :disabled="regenerating"
                class="text-[12px] font-medium text-[#7f8aa0] transition hover:text-[#4e79ff] disabled:cursor-not-allowed disabled:opacity-50"
                @click="$emit('regenerate', message.id)"
              >
                重新生成
              </button>
            </div>

            <div
              v-else-if="message.status === 'streaming' && !responseFlow?.showActions"
              class="mt-4 flex items-center gap-2 text-xs text-slate-500"
            >
              <LoaderCircle class="size-3 animate-spin" />
              正在生成
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

<style scoped>
.stage-slide-enter-active,
.stage-slide-leave-active {
  transition: all 0.28s ease;
}

.stage-slide-enter-from,
.stage-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.process-collapse-enter-active,
.process-collapse-leave-active {
  transition: all 0.22s ease;
}

.process-collapse-enter-from,
.process-collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
