<script setup lang="ts">
import { ChevronRight, LoaderCircle } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import ShiningText from '@/components/ui/ShiningText.vue'
import type { ChatMessage } from '@/types/chat/models'
import ChatMarkdownContent from './ChatMarkdownContent.vue'
import WorkspaceMark from './WorkspaceMark.vue'

//声明聊天气泡组件入参
const props = defineProps<{
  message: ChatMessage
  showMeta?: boolean
  regenerating?: boolean
}>()

//声明聊天气泡组件事件
defineEmits<{
  regenerate: []
}>()

//声明消息时间解析兜底值
const createdAtFallbackMs = Date.now()

//声明响应流数据引用
const responseFlow = computed(() => props.message.responseFlow)

//声明思考面板展开状态
const processExpanded = ref(false)

//声明流式实时计时基准
const liveNowMs = ref(Date.now())

//声明提示词能力兜底值
const promptCapabilities = computed(
  () => props.message.promptCapabilities ?? { think: false, search: false }
)

//声明单块思考消息
const thinkingMessage = computed(() => {
  const stage = responseFlow.value?.thinking[0]
  if (!stage) {
    return null
  }

  if (stage.status === 'pending' && !stage.visibleContent && !stage.content) {
    return null
  }

  return stage
})

//声明答案状态
const answerStatus = computed(() => {
  if (!responseFlow.value) {
    return props.message.status === 'streaming' ? 'streaming' : 'done'
  }

  return responseFlow.value.answer.status
})

//声明当前答案文本
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

//声明答案是否已有内容
const answerHasContent = computed(() => Boolean(answerContent.value.trim()))

//声明思考区是否仍在流式中
const isThinkingRunning = computed(() => thinkingMessage.value?.status === 'running')

//声明助手是否仍在工作
const isAssistantWorking = computed(
  () => props.message.status === 'streaming' || isThinkingRunning.value
)

//声明消息创建时间戳
const createdAtMs = computed(() => {
  const parsed = Date.parse(props.message.createdAt)
  return Number.isFinite(parsed) ? parsed : createdAtFallbackMs
})

//声明流式实时耗时
const liveDurationMs = computed(() => Math.max(0, liveNowMs.value - createdAtMs.value))

//声明展示耗时
const resolvedDurationMs = computed(() => {
  if (props.message.status === 'streaming') {
    return liveDurationMs.value
  }

  return responseFlow.value?.totalDurationMs ?? props.message.latencyMs ?? 0
})

//声明思考头部文案
const processHeaderLabel = computed(() =>
  isThinkingRunning.value ? 'KoreAi is Thinking...' : '已完成思考'
)

//声明思考头部耗时文案
const processDurationLabel = computed(() => {
  if (!resolvedDurationMs.value) {
    return ''
  }

  return `用时：${formatLatency(resolvedDurationMs.value)}`
})

//声明是否允许展开收起思考详情
const canToggleProcessDetails = computed(
  () => !isThinkingRunning.value && Boolean(thinkingMessage.value)
)

//声明是否显示思考详情
const showProcessDetails = computed(() => {
  if (!thinkingMessage.value) {
    return false
  }

  if (isThinkingRunning.value) {
    return true
  }

  return processExpanded.value
})

//声明是否显示思考区
const showProcessSection = computed(
  () => promptCapabilities.value.think && (Boolean(thinkingMessage.value) || props.message.status === 'streaming')
)

//声明最终 token 数
const finalTokenCount = computed(() => props.message.totalTokens)

//声明是否有最终 token 数
const hasFinalTokenCount = computed(
  () => finalTokenCount.value !== null && finalTokenCount.value > 0
)

//声明思考区是否显示 token
const showProcessTokenCount = computed(
  () => showProcessSection.value && props.message.status !== 'streaming' && hasFinalTokenCount.value
)

//声明是否显示简版状态栏
const showReplySummary = computed(
  () =>
    !showProcessSection.value &&
    (props.message.status === 'streaming' || resolvedDurationMs.value > 0 || hasFinalTokenCount.value)
)

//声明简版状态栏是否显示耗时
const showReplyDuration = computed(
  () => !showProcessSection.value && (props.message.status === 'streaming' || resolvedDurationMs.value > 0)
)

//声明简版状态栏是否显示 token
const showReplyTokenCount = computed(
  () => !showProcessSection.value && props.message.status !== 'streaming' && hasFinalTokenCount.value
)

//声明是否显示答案区
const showAnswerSection = computed(
  () =>
    answerStatus.value === 'running' ||
    answerStatus.value === 'done' ||
    answerHasContent.value ||
    (answerStatus.value === 'pending' && !thinkingMessage.value)
)

//声明实时计时器
let liveTimer: number | null = null

//声明停止实时计时器
const stopLiveTimer = () => {
  if (liveTimer) {
    window.clearInterval(liveTimer)
    liveTimer = null
  }
}

//声明同步实时计时器
const syncLiveTimer = () => {
  stopLiveTimer()

  if (props.message.role !== 'assistant' || props.message.status !== 'streaming') {
    return
  }

  liveNowMs.value = Date.now()
  liveTimer = window.setInterval(() => {
    liveNowMs.value = Date.now()
  }, 100)
}

//声明监听消息状态变化
watch(
  () => [props.message.role, props.message.status, props.message.createdAt] as const,
  () => {
    syncLiveTimer()
  },
  { immediate: true }
)

//声明思考结束后自动折叠思考详情
watch(isThinkingRunning, (running, previousRunning) => {
  if (previousRunning && !running) {
    processExpanded.value = false
  }
})

//声明组件卸载清理逻辑
onBeforeUnmount(() => {
  stopLiveTimer()
})

//声明切换思考详情显示状态
const toggleProcessDetails = () => {
  if (!canToggleProcessDetails.value) {
    return
  }

  processExpanded.value = !processExpanded.value
}

//声明耗时格式化逻辑
function formatLatency(latencyMs?: number | null) {
  return `${((latencyMs || 0) / 1000).toFixed(1)} 秒`
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

    <div class="min-w-0 flex-1 space-y-4">
      <section v-if="showProcessSection" class="space-y-3">
        <button
          type="button"
          class="flex w-full max-w-full items-center justify-between gap-3 rounded-xl bg-transparent px-0 py-1 text-left transition"
          :class="canToggleProcessDetails ? 'cursor-pointer hover:bg-[#f8fafc]' : 'cursor-default'"
          :aria-expanded="showProcessDetails"
          @click="toggleProcessDetails"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
              <ShiningText v-if="isThinkingRunning" :text="processHeaderLabel" />
              <span v-else class="font-medium text-[#4b5565]">{{ processHeaderLabel }}</span>
              <span v-if="processDurationLabel" class="text-[#98a2b3]">
                {{ processDurationLabel }}
              </span>
            </div>
          </div>

          <div
            v-if="showProcessTokenCount || canToggleProcessDetails"
            class="flex shrink-0 items-center gap-3 pl-3"
          >
            <span v-if="showProcessTokenCount" class="text-[13px] font-medium text-[#98a2b3]">
              Token:{{ finalTokenCount }}
            </span>

            <ChevronRight
              v-if="canToggleProcessDetails"
              class="size-4 shrink-0 text-[#98a2b3] transition-transform"
              :class="showProcessDetails ? 'rotate-90' : ''"
            />
          </div>
        </button>

        <transition name="process-collapse">
          <div v-if="showProcessDetails && thinkingMessage" class="space-y-4 pl-4">
            <div class="relative border-l border-[#eceff4] pl-5">
              <div
                class="absolute left-[-6px] top-1.5 flex size-3 items-center justify-center rounded-full bg-white"
              >
                <span class="size-2 rounded-full bg-[#111827]" />
              </div>

              <div class="flex items-center gap-2 text-[13px] text-[#667085]">
                <span class="font-medium text-[#4b5565]">思考过程</span>
                <LoaderCircle
                  v-if="thinkingMessage.status === 'running'"
                  class="size-3.5 animate-spin text-[#111827]"
                />
              </div>

              <div class="mt-2 whitespace-pre-wrap text-[15px] leading-8 text-[#475467]">
                {{ thinkingMessage.visibleContent || thinkingMessage.content }}
                <span
                  v-if="thinkingMessage.status === 'running' && thinkingMessage.visibleContent"
                  class="workspace-cursor"
                />
              </div>
            </div>
          </div>
        </transition>
      </section>

      <section v-if="showReplySummary" class="px-1">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-[#98a2b3]">
          <span v-if="showReplyDuration">用时：{{ formatLatency(resolvedDurationMs) }}</span>
          <span v-if="showReplyTokenCount">Token:{{ finalTokenCount }}</span>
        </div>
      </section>

      <section
        v-if="showAnswerSection"
        class="px-1 text-[15px] leading-8 text-slate-900"
        :class="showReplySummary ? 'pt-0' : 'pt-1'"
      >
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
