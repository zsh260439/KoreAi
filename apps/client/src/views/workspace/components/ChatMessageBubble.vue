<script setup lang="ts">
import {
  Brain,
  Check,
  ChevronDown,
  Clock3,
  Cloud,
  LoaderCircle,
  Search,
  Sparkles,
  Wrench
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import type { AssistantThinkingStage, AssistantToolStage, ChatMessage } from '@/types'
import WorkspaceMark from './WorkspaceMark.vue'

type RenderPart =
  | {
      type: 'text'
      content: string
    }
  | {
      type: 'code'
      language: string
      code: string
    }

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
  search: Search,
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
      (tool) =>
        tool.status !== 'pending' ||
        tool.showInput ||
        tool.showSteps ||
        tool.showOutput ||
        tool.visibleInput ||
        tool.visibleOutput
    ) ?? []
)

const answerContent = computed(
  () =>
    responseFlow.value?.answer.visibleContent ||
    responseFlow.value?.answer.content ||
    props.message.content ||
    ''
)

const answerParts = computed(() => parseContent(answerContent.value))

const isThinkingRunning = computed(() =>
  thinkingStages.value.some((stage) => stage.status === 'running')
)

const isToolRunning = computed(() => toolStages.value.some((tool) => tool.status === 'running'))

const isAssistantWorking = computed(
  () => props.message.status === 'streaming' || isThinkingRunning.value || isToolRunning.value
)

const primaryThinkingStage = computed(() => thinkingStages.value[0] ?? null)

const processHeaderLabel = computed(() => {
  const stage = primaryThinkingStage.value

  if (!stage) {
    return isAssistantWorking.value ? '正在生成回答' : '回答已完成'
  }

  if (stage.stageKey === 'deepsearch') {
    return isThinkingRunning.value ? '正在深度思考' : '已完成深度思考'
  }

  if (stage.stageKey === 'web_search') {
    return isThinkingRunning.value ? '正在规划搜索' : '已完成搜索前分析'
  }

  return isThinkingRunning.value ? '正在思考' : '已完成思考'
})

const processSubLabel = computed(() => {
  const parts: string[] = []

  if (props.message.latencyMs) {
    parts.push(`用时 ${formatLatency(props.message.latencyMs)}`)
  }

  if (toolStages.value.length > 0) {
    parts.push(`${toolStages.value.length} 个工具`)
  }

  return parts.join(' · ')
})

const getThinkingIcon = (stage?: AssistantThinkingStage | null) =>
  stage?.stageKey === 'web_search' ? Search : Brain

const getToolIcon = (tool: AssistantToolStage) => toolIconMap[tool.iconKey] ?? Wrench

const getStatusText = (status: string) => {
  if (status === 'running') return '执行中'
  if (status === 'error') return '异常'
  return '完成'
}

const formatLatency = (latencyMs?: number) => `${((latencyMs || 0) / 1000).toFixed(1)} 秒`

const toggleProcess = () => {
  if (responseFlow.value) {
    processOpen.value = !processOpen.value
  }
}

function parseContent(content: string): RenderPart[] {
  if (!content.trim()) {
    return []
  }

  const parts: RenderPart[] = []
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      })
    }

    parts.push({
      type: 'code',
      language: match[1] || 'text',
      code: match[2].trim()
    })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex)
    })
  }

  return parts
}
</script>

<template>
  <div v-if="message.role === 'user'" class="flex items-start justify-end gap-3">
    <div
      class="max-w-[360px] rounded-[18px] bg-[#f3f5f8] px-5 py-4 text-[15px] leading-8 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
    >
      <div class="whitespace-pre-wrap">{{ message.content || '...' }}</div>
    </div>

    <div
      class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-[12px] font-semibold tracking-[0.02em] text-white shadow-[0_10px_18px_rgba(249,115,22,0.28)]"
    >
      你
    </div>
  </div>

  <div v-else class="flex items-start gap-4">
    <div class="mt-0.5 flex size-11 shrink-0 items-center justify-center">
      <WorkspaceMark :size="45" :active="isAssistantWorking" />
    </div>

    <div class="min-w-0 flex-1">
      <div v-if="responseFlow" class="space-y-4">
        <section v-if="thinkingStages.length || toolStages.length" class="space-y-3">
          <button
            type="button"
            class="group inline-flex max-w-full items-center gap-2 rounded-full border border-[#eceff4] bg-[#fafbfc] px-3 py-2 text-left transition hover:border-[#dfe5ef] hover:bg-white"
            @click="toggleProcess"
          >
            <component
              :is="getThinkingIcon(primaryThinkingStage)"
              class="size-4 shrink-0 text-[#7c4dff]"
            />
            <span class="truncate text-[14px] font-medium text-[#4b5565]">
              {{ processHeaderLabel }}
              <span v-if="processSubLabel" class="text-[#98a2b3]">（{{ processSubLabel }}）</span>
            </span>
            <ChevronDown
              class="size-4 shrink-0 text-[#98a2b3] transition-transform duration-200"
              :class="processOpen && 'rotate-180'"
            />
          </button>

          <transition name="process-collapse">
            <div v-if="processOpen" class="space-y-4 pl-4">
              <div
                v-for="stage in thinkingStages"
                :key="stage.id"
                class="relative border-l border-[#eceff4] pl-5"
              >
                <div
                  class="absolute left-[-6px] top-1.5 flex size-3 items-center justify-center rounded-full bg-white"
                >
                  <span class="size-2 rounded-full bg-[#7c4dff]" />
                </div>

                <div class="flex items-center gap-2 text-[13px] text-[#667085]">
                  <component :is="getThinkingIcon(stage)" class="size-4 text-[#7c4dff]" />
                  <span class="font-medium text-[#4b5565]">{{ stage.title }}</span>
                  <LoaderCircle
                    v-if="stage.status === 'running'"
                    class="size-3.5 animate-spin text-[#7c4dff]"
                  />
                </div>

                <div class="mt-2 whitespace-pre-wrap text-[15px] leading-8 text-[#475467]">
                  {{ stage.visibleContent || stage.content }}
                  <span v-if="stage.status === 'running'" class="workspace-cursor" />
                </div>
              </div>

              <div
                v-for="tool in toolStages"
                :key="tool.id"
                class="relative border-l border-[#eceff4] pl-5"
              >
                <div
                  class="absolute left-[-6px] top-1.5 flex size-3 items-center justify-center rounded-full bg-white"
                >
                  <span class="size-2 rounded-full bg-[#111827]" />
                </div>

                <div class="rounded-[18px] bg-[#f7f8fa] px-4 py-3">
                  <div class="flex items-center gap-2 text-[13px] text-[#667085]">
                    <component :is="getToolIcon(tool)" class="size-4 text-[#111827]" />
                    <span class="font-medium text-[#4b5565]">{{ tool.title }}</span>
                    <span class="text-[#98a2b3]">{{ getStatusText(tool.status) }}</span>
                    <LoaderCircle
                      v-if="tool.status === 'running'"
                      class="size-3.5 animate-spin text-[#111827]"
                    />
                  </div>

                  <div v-if="tool.visibleInput" class="mt-2 text-[14px] leading-7 text-[#475467]">
                    <span class="text-[#98a2b3]">输入：</span>{{ tool.visibleInput }}
                  </div>

                  <div v-if="tool.showSteps && tool.steps.length" class="mt-3 space-y-2">
                    <div
                      v-for="step in tool.steps"
                      :key="step.id"
                      class="flex items-start gap-2 text-[14px] leading-7 text-[#475467]"
                    >
                      <div class="mt-[7px] flex size-4 shrink-0 items-center justify-center">
                        <LoaderCircle
                          v-if="step.status === 'running'"
                          class="size-3.5 animate-spin text-[#111827]"
                        />
                        <Check
                          v-else-if="step.status === 'success'"
                          class="size-3.5 text-[#111827]"
                        />
                        <Sparkles v-else class="size-3 text-[#98a2b3]" />
                      </div>
                      <span>{{ step.label }}</span>
                    </div>
                  </div>

                  <div v-if="tool.visibleOutput" class="mt-3 text-[14px] leading-7 text-[#475467]">
                    <span class="text-[#98a2b3]">结果：</span>{{ tool.visibleOutput }}
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </section>

        <section
          v-if="answerParts.length || message.status === 'streaming'"
          class="px-1 pt-1 text-[15px] leading-8 text-slate-900"
        >
          <template v-if="answerParts.length">
            <div class="space-y-3">
              <template v-for="(part, index) in answerParts" :key="`${message.id}-${index}`">
                <div v-if="part.type === 'text'" class="whitespace-pre-wrap">
                  {{ part.content }}
                  <span
                    v-if="message.status === 'streaming' && index === answerParts.length - 1"
                    class="workspace-cursor"
                  />
                </div>

                <pre
                  v-else
                  class="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-[13px] leading-6 text-[#374151]"
                ><code>{{ part.code }}</code></pre>
              </template>
            </div>
          </template>

          <div v-else class="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle class="size-4 animate-spin" />
            正在生成回答...
          </div>
        </section>

        <div
          v-if="showMeta && responseFlow?.showActions"
          class="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-slate-500"
        >
          <span class="rounded-full bg-[#f4e8ff] px-2.5 py-1 font-medium text-[#bf5af2]">
            {{ formatLatency(message.latencyMs) }}
          </span>

          <button
            v-if="message.traceId"
            type="button"
            class="text-[#8d97a8] transition-colors hover:text-[#4e79ff]"
            @click="$emit('detail', message.traceId)"
          >
            查看详情
          </button>

          <button
            type="button"
            :disabled="regenerating"
            class="text-[#7f8aa0] transition hover:text-[#4e79ff] disabled:cursor-not-allowed disabled:opacity-50"
            @click="$emit('regenerate', message.id)"
          >
            重新生成
          </button>
        </div>
      </div>

      <template v-else>
        <div class="whitespace-pre-wrap text-[15px] leading-8 text-slate-900">
          {{ message.content || '正在生成回答...' }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.process-collapse-enter-active,
.process-collapse-leave-active {
  transition: all 0.22s ease;
}

.process-collapse-enter-from,
.process-collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.workspace-cursor {
  display: inline-block;
  width: 1px;
  height: 0.95rem;
  margin-left: 2px;
  vertical-align: middle;
  background: #374151;
  animation: workspace-cursor-blink 0.8s infinite;
}

@keyframes workspace-cursor-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
