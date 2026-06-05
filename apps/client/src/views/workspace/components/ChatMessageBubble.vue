<script setup lang="ts">
import {
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Cloud,
  LoaderCircle,
  Search,
  Sparkles,
  Wrench
} from 'lucide-vue-next'
import { computed, ref } from 'vue'

import ShiningText from '@/components/ui/ShiningText.vue'
import type { AssistantToolStage, ChatMessage } from '@/types'
import WorkspaceMark from './WorkspaceMark.vue'
import WorkspaceSearchCompactRow from './WorkspaceSearchCompactRow.vue'

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

const emit = defineEmits<{
  regenerate: [messageId: string]
  openSearchResults: [tool: AssistantToolStage]
}>()

const responseFlow = computed(() => props.message.responseFlow)
const processExpanded = ref(false)

const toolIconMap = {
  knowledge: Search,
  time: Clock3,
  weather: Cloud,
  search: Search,
  thinking: Brain,
  generic: Wrench
} as const

const promptCapabilities = computed(() => props.message.promptCapabilities ?? { think: false, search: false })

const thinkingStages = computed(
  () =>
    responseFlow.value?.thinking.filter(
      (stage) => stage.status !== 'pending' || stage.visibleContent || stage.content
    ) ?? []
)

const compactSearchStages = computed(
  () =>
    responseFlow.value?.tools.filter(
      (tool) =>
        tool.presentation === 'compact-search' &&
        (tool.status !== 'pending' ||
          tool.showInput ||
          tool.showOutput ||
          tool.visibleInput ||
          tool.visibleOutput)
    ) ?? []
)

const toolStages = computed(
  () =>
    responseFlow.value?.tools.filter(
      (tool) =>
        tool.presentation !== 'compact-search' &&
        (tool.status !== 'pending' ||
          tool.showInput ||
          tool.showSteps ||
          tool.showOutput ||
          tool.visibleInput ||
          tool.visibleOutput)
    ) ?? []
)

const answerStatus = computed(() => {
  if (!responseFlow.value) {
    return props.message.status === 'streaming' ? 'pending' : 'done'
  }

  return responseFlow.value.answer.status
})

const answerContent = computed(() => {
  if (!responseFlow.value) {
    return props.message.content || ''
  }

  if (props.message.status === 'streaming') {
    return responseFlow.value.answer.visibleContent || ''
  }

  return (
    responseFlow.value.answer.visibleContent ||
    responseFlow.value.answer.content ||
    props.message.content ||
    ''
  )
})

const answerParts = computed(() => parseContent(answerContent.value))

const isThinkingRunning = computed(() =>
  thinkingStages.value.some((stage) => stage.status === 'running')
)

const isToolRunning = computed(() =>
  [...toolStages.value, ...compactSearchStages.value].some((tool) => tool.status === 'running')
)

const isAssistantWorking = computed(
  () => props.message.status === 'streaming' || isThinkingRunning.value || isToolRunning.value
)

const totalToolCount = computed(() => toolStages.value.length + compactSearchStages.value.length)

const processHeaderLabel = computed(() => {
  if (isAssistantWorking.value) {
    if (promptCapabilities.value.think) {
      return 'KoreAI is thinking...'
    }

    if (promptCapabilities.value.search) {
      return 'KoreAI is extracting...'
    }

    if (totalToolCount.value > 0) {
      return 'KoreAI is using tools...'
    }

    return 'KoreAI is responding...'
  }

  if (promptCapabilities.value.think) {
    return '已完成思考'
  }

  if (promptCapabilities.value.search) {
    return '已完成搜索提取'
  }

  if (totalToolCount.value > 0) {
    return '已完成工具调用'
  }

  return '已完成响应'
})

const processSubLabel = computed(() => {
  const parts: string[] = []

  if (props.message.latencyMs) {
    parts.push(`用时 ${formatLatency(props.message.latencyMs)}`)
  }

  if (totalToolCount.value > 0) {
    parts.push(`${totalToolCount.value} 个工具`)
  }

  return parts.join(' · ')
})

const canToggleProcessDetails = computed(
  () => !isAssistantWorking.value && (thinkingStages.value.length > 0 || toolStages.value.length > 0)
)

const showProcessDetails = computed(() => {
  if (!thinkingStages.value.length && !toolStages.value.length) {
    return false
  }

  if (isAssistantWorking.value) {
    return true
  }

  return processExpanded.value
})

const showProcessSection = computed(
  () =>
    thinkingStages.value.length > 0 ||
    toolStages.value.length > 0 ||
    compactSearchStages.value.length > 0
)

const showAnswerSection = computed(
  () => answerStatus.value === 'running' || answerStatus.value === 'done' || answerParts.value.length > 0
)

const getToolIcon = (tool: AssistantToolStage) => toolIconMap[tool.iconKey] ?? Wrench

const getStatusText = (status: string) => {
  if (status === 'running') return '执行中'
  if (status === 'error') return '异常'
  return '完成'
}

const getCompactSearchCount = (tool: AssistantToolStage) =>
  tool.resultCount ?? tool.searchResults?.length ?? 0

const formatLatency = (latencyMs?: number) => `${((latencyMs || 0) / 1000).toFixed(1)} 秒`

const toggleProcessDetails = () => {
  if (!canToggleProcessDetails.value) {
    return
  }

  processExpanded.value = !processExpanded.value
}

const openSearchResults = (tool: AssistantToolStage) => {
  if (!tool.searchResults?.length) {
    return
  }

  emit('openSearchResults', tool)
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
      <WorkspaceMark :size="50" :active="isAssistantWorking" />
    </div>

    <div class="min-w-0 flex-1">
      <div v-if="responseFlow" class="space-y-4">
        <section v-if="showProcessSection" class="space-y-3">
          <button
            type="button"
            class="inline-flex max-w-full items-center gap-2 rounded-xl bg-transparent px-0 py-1 text-left transition"
            :class="canToggleProcessDetails ? 'cursor-pointer hover:bg-[#f8fafc]' : 'cursor-default'"
            :aria-expanded="showProcessDetails"
            @click="toggleProcessDetails"
          >
            <div class="min-w-0">
              <ShiningText v-if="isAssistantWorking" :text="processHeaderLabel" />
              <div v-else class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                <span class="font-medium text-[#4b5565]">{{ processHeaderLabel }}</span>
                <span v-if="processSubLabel" class="text-[#98a2b3]">{{ processSubLabel }}</span>
              </div>
            </div>

            <ChevronRight
              v-if="canToggleProcessDetails"
              class="size-4 shrink-0 text-[#98a2b3] transition-transform"
              :class="showProcessDetails ? 'rotate-90' : ''"
            />
          </button>

          <transition name="process-collapse">
            <div v-if="showProcessDetails" class="space-y-4 pl-4">
              <div
                v-for="stage in thinkingStages"
                :key="stage.id"
                class="relative border-l border-[#eceff4] pl-5"
              >
                <div
                  class="absolute left-[-6px] top-1.5 flex size-3 items-center justify-center rounded-full bg-white"
                >
                  <span class="size-2 rounded-full bg-[#111827]" />
                </div>

                <div class="flex items-center gap-2 text-[13px] text-[#667085]">
                  <span class="font-medium text-[#4b5565]">{{ stage.title }}</span>
                  <LoaderCircle
                    v-if="stage.status === 'running'"
                    class="size-3.5 animate-spin text-[#111827]"
                  />
                </div>

                <div class="mt-2 whitespace-pre-wrap text-[15px] leading-8 text-[#475467]">
                  {{ stage.visibleContent || stage.content }}
                  <span
                    v-if="stage.status === 'running' && stage.visibleContent"
                    class="workspace-cursor"
                  />
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

          <div v-if="compactSearchStages.length" class="space-y-2">
            <WorkspaceSearchCompactRow
              v-for="tool in compactSearchStages"
              :key="tool.id"
              :count="getCompactSearchCount(tool)"
              :active="tool.status === 'running'"
              @click="openSearchResults(tool)"
            />
          </div>
        </section>

        <section v-if="showAnswerSection" class="px-1 pt-1 text-[15px] leading-8 text-slate-900">
          <template v-if="answerParts.length">
            <div class="space-y-3">
              <template v-for="(part, index) in answerParts" :key="`${message.id}-${index}`">
                <div v-if="part.type === 'text'" class="whitespace-pre-wrap">
                  {{ part.content }}
                  <span
                    v-if="answerStatus === 'running' && index === answerParts.length - 1"
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
