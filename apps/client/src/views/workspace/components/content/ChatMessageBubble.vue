<script setup lang="ts">
import { ChevronRight, LoaderCircle } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import ShiningText from '@/components/ui/ShiningText.vue'
import type { ChatMessage } from '@/types/chat/models'
import ChatMarkdownContent from './ChatMarkdownContent.vue'
import WorkspaceMark from './WorkspaceMark.vue'

const props = defineProps<{
  message: ChatMessage
  showMeta?: boolean
  regenerating?: boolean
}>()

defineEmits<{
  regenerate: []
}>()

const responseFlow = computed(() => props.message.responseFlow)
const processExpanded = ref(false)
const promptCapabilities = computed(
  () => props.message.promptCapabilities ?? { think: false, search: false }
)

const thinkingStages = computed(
  () =>
    responseFlow.value?.thinking.filter(
      (stage) => stage.status !== 'pending' || stage.visibleContent || stage.content
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

const answerHasContent = computed(() => Boolean(answerContent.value.trim()))

const isThinkingRunning = computed(() =>
  thinkingStages.value.some((stage) => stage.status === 'running')
)

const isAssistantWorking = computed(
  () => props.message.status === 'streaming' || isThinkingRunning.value
)

const processHeaderLabel = computed(() => {
  if (isAssistantWorking.value) {
    return 'KoreAI is thinking...'
  }

  return '已完成思考'
})

const processSubLabel = computed(() => {
  if (!props.message.latencyMs) {
    return ''
  }

  return `用时 ${formatLatency(props.message.latencyMs)}`
})

const canToggleProcessDetails = computed(
  () => !isAssistantWorking.value && thinkingStages.value.length > 0
)

const showProcessDetails = computed(() => {
  if (!thinkingStages.value.length) {
    return false
  }

  if (isAssistantWorking.value) {
    return true
  }

  return processExpanded.value
})

const showProcessSection = computed(
  () =>
    promptCapabilities.value.think &&
    (thinkingStages.value.length > 0 || props.message.status === 'streaming')
)

const tokenCount = computed(() => estimateTokenCount(buildVisibleTokenSource()))

const showTokenCount = computed(
  () => showProcessSection.value && (props.message.status === 'streaming' || tokenCount.value > 0)
)

const showAnswerSection = computed(
  () =>
    answerStatus.value === 'running' ||
    answerStatus.value === 'done' ||
    answerHasContent.value ||
    (answerStatus.value === 'pending' && !thinkingStages.value.length)
)

const formatLatency = (latencyMs?: number | null) => `${((latencyMs || 0) / 1000).toFixed(1)} 秒`

const toggleProcessDetails = () => {
  if (!canToggleProcessDetails.value) {
    return
  }

  processExpanded.value = !processExpanded.value
}

function buildVisibleTokenSource(): string {
  if (!responseFlow.value) {
    return props.message.content || ''
  }

  const thinkingContent = responseFlow.value.thinking
    .map((stage) => stage.visibleContent || stage.content || '')
    .join('')
  const answerVisibleContent =
    responseFlow.value.answer.visibleContent ||
    responseFlow.value.answer.content ||
    props.message.content ||
    ''

  return `${thinkingContent}${answerVisibleContent}`
}

function estimateTokenCount(content: string): number {
  const normalized = content.trim()
  if (!normalized) {
    return 0
  }

  return Math.max(1, Math.ceil(normalized.length / 4))
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
            class="flex w-full max-w-full items-center justify-between gap-3 rounded-xl bg-transparent px-0 py-1 text-left transition"
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

            <div
              v-if="showTokenCount || canToggleProcessDetails"
              class="flex shrink-0 items-center gap-3 pl-3"
            >
              <span v-if="showTokenCount" class="text-[13px] font-medium text-[#98a2b3]">
                Token:{{ tokenCount }}
              </span>

              <ChevronRight
                v-if="canToggleProcessDetails"
                class="size-4 shrink-0 text-[#98a2b3] transition-transform"
                :class="showProcessDetails ? 'rotate-90' : ''"
              />
            </div>
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
            </div>
          </transition>
        </section>

        <section v-if="showAnswerSection" class="px-1 pt-1 text-[15px] leading-8 text-slate-900">
          <template v-if="answerHasContent">
            <ChatMarkdownContent
              :content="answerContent"
              :show-cursor="answerStatus === 'running'"
            />
          </template>

          <div v-else class="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle class="size-4 animate-spin" />
            {{ promptCapabilities.think ? '正在整理回答...' : '正在生成回答...' }}
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
            @click="$emit('regenerate')"
          >
            重新生成
          </button>
        </div>
      </div>

      <template v-else>
        <ChatMarkdownContent v-if="message.content" :content="message.content" />
        <div v-else class="whitespace-pre-wrap text-[15px] leading-8 text-slate-900">
          正在生成回答...
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
