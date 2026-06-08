<script setup lang="ts">
import { ChevronRight, LoaderCircle } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import ShiningText from '@/components/ui/ShiningText.vue'
import type { ChatMessage } from '@/types/chat/models'
import ChatMarkdownContent from './ChatMarkdownContent.vue'
import WorkspaceMark from './WorkspaceMark.vue'

// 组件 Props：消息对象、是否显示底部操作栏、是否正在重生成
const props = defineProps<{
  message: ChatMessage
  showMeta?: boolean
  regenerating?: boolean
}>()

// 事件：向父组件抛出重新生成请求
defineEmits<{
  regenerate: []
}>()

// 消息创建时间兜底值（防止时间解析失败）
const createdAtFallbackMs = Date.now()

// 响应式流式数据（思考 + 回答结构）
const responseFlow = computed(() => props.message.responseFlow)

// 思考面板是否手动展开（用户控制）
const processExpanded = ref(false)

// 实时时间戳：用于流式计时
const liveNowMs = ref(Date.now())

// 当前消息是否开启思考模式（默认关闭）
const promptCapabilities = computed(
  () => props.message.promptCapabilities ?? { think: false, search: false }
)

// 过滤后的思考步骤：只显示有效步骤（非空、非纯 pending）
const thinkingStages = computed(
  () =>
    responseFlow.value?.thinking.filter(
      (stage) => stage.status !== 'pending' || stage.visibleContent || stage.content
    ) ?? []
)

// 回答状态：pending / running / done
const answerStatus = computed(() => {
  if (!responseFlow.value) {
    // 无流式结构 → 根据消息状态判断
    return props.message.status === 'streaming' ? 'streaming' : 'done'
  }
  // 有流式结构 → 取 answer 自身状态
  return responseFlow.value.answer.status
})

// 最终要显示的回答内容（兼容所有场景）
const answerContent = computed(() => {
  // 无流式 → 直接用原始内容
  if (!responseFlow.value) {
    return props.message.content || ''
  }

  // 正在流式 → 显示可见内容（打字机）
  if (props.message.status === 'streaming') {
    return responseFlow.value.answer.visibleContent || ''
  }

  // 已完成 → 多层兜底保证不空白
  return (
    responseFlow.value.answer.visibleContent ||
    responseFlow.value.answer.content ||
    props.message.content ||
    ''
  )
})

// 回答是否有真实内容（非空）
const answerHasContent = computed(() => Boolean(answerContent.value.trim()))

// 是否有思考步骤正在运行
const isThinkingRunning = computed(() =>
  thinkingStages.value.some((stage) => stage.status === 'running')
)

// AI 是否正在工作（流式中 或 思考中）
const isAssistantWorking = computed(
  () => props.message.status === 'streaming' || isThinkingRunning.value
)

// 消息创建时间（解析失败则用兜底值）
const createdAtMs = computed(() => {
  const parsed = Date.parse(props.message.createdAt)
  return Number.isFinite(parsed) ? parsed : createdAtFallbackMs
})

// 实时已用时间（流式阶段）
const liveDurationMs = computed(() => Math.max(0, liveNowMs.value - createdAtMs.value))

// 最终显示的耗时（流式中=实时，已完成=固定值）
const resolvedDurationMs = computed(() => {
  if (props.message.status === 'streaming') {
    return liveDurationMs.value
  }
  return responseFlow.value?.totalDurationMs ?? props.message.latencyMs ?? 0
})

// 思考面板头部文字
const processHeaderLabel = computed(() =>
  isAssistantWorking.value ? 'KoreAi is Thinking...' : '已完成思考'
)

// 思考面板显示的耗时
const processDurationLabel = computed(() => {
  if (!resolvedDurationMs.value) {
    return ''
  }
  return `用时：${formatLatency(resolvedDurationMs.value)}`
})

// 是否允许手动展开/收起思考面板
const canToggleProcessDetails = computed(
  () => !isAssistantWorking.value && thinkingStages.value.length > 0
)

// 是否显示思考详情（自动控制）
const showProcessDetails = computed(() => {
  // 无步骤 → 不显示
  if (!thinkingStages.value.length) {
    return false
  }
  // AI 工作中 → 强制展开
  if (isAssistantWorking.value) {
    return true
  }
  // 已完成 → 由用户手动控制
  return processExpanded.value
})

// 是否显示【整个思考面板区域】
// 条件：开启思考 + 有步骤 或 正在流式
const showProcessSection = computed(
  () =>
    promptCapabilities.value.think &&
    (thinkingStages.value.length > 0 || props.message.status === 'streaming')
)

const finalTokenCount = computed(() => props.message.totalTokens)
const hasFinalTokenCount = computed(
  () => finalTokenCount.value !== null && finalTokenCount.value > 0
)

// 思考面板内是否显示 Token
const showProcessTokenCount = computed(
  () => showProcessSection.value && props.message.status !== 'streaming' && hasFinalTokenCount.value
)

// 是否显示底部简易状态栏（无思考面板时才显示）
const showReplySummary = computed(
  () =>
    !showProcessSection.value &&
    (props.message.status === 'streaming' || resolvedDurationMs.value > 0 || hasFinalTokenCount.value)
)

// 底部状态栏是否显示耗时
const showReplyDuration = computed(
  () => !showProcessSection.value && (props.message.status === 'streaming' || resolvedDurationMs.value > 0)
)

// 底部状态栏是否显示 Token
const showReplyTokenCount = computed(
  () => !showProcessSection.value && props.message.status !== 'streaming' && hasFinalTokenCount.value
)

// 是否显示回答区域
const showAnswerSection = computed(
  () =>
    answerStatus.value === 'running' ||     // 正在输出
    answerStatus.value === 'done' ||        // 已完成
    answerHasContent.value ||               // 已有内容
    (answerStatus.value === 'pending' && !thinkingStages.value.length) // 无思考，直接等待回答
)

// 实时计时器 ID
let liveTimer: number | null = null

// 停止计时器（防止内存泄漏）
const stopLiveTimer = () => {
  if (liveTimer) {
    window.clearInterval(liveTimer)
    liveTimer = null
  }
}

// 同步计时器：只有 AI 助手消息且正在流式时才计时
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

// 监听消息变化，重启计时器
watch(
  () => [props.message.role, props.message.status, props.message.createdAt] as const,
  () => {
    syncLiveTimer()
  },
  { immediate: true }
)

// 组件卸载时清理计时器
onBeforeUnmount(() => {
  stopLiveTimer()
})

// 切换思考面板展开/收起
const toggleProcessDetails = () => {
  if (!canToggleProcessDetails.value) {
    return
  }
  processExpanded.value = !processExpanded.value
}

// 格式化耗时：毫秒 → 秒（保留1位小数）
function formatLatency(latencyMs?: number | null) {
  return `${((latencyMs || 0) / 1000).toFixed(1)} 秒`
}
</script>

<template>
  <!-- ====================== 用户消息 ====================== -->
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

  <!-- ====================== AI 助手消息 ====================== -->
  <div v-else class="flex items-start gap-4">
    <!-- AI 头像 -->
    <div class="mt-0.5 flex size-11 shrink-0 items-center justify-center">
      <WorkspaceMark :size="50" :active="isAssistantWorking" />
    </div>

    <div class="min-w-0 flex-1 space-y-4">
      <!-- ====================== 思考面板区域 ====================== -->
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
              <ShiningText v-if="isAssistantWorking" :text="processHeaderLabel" />
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

        <!-- 展开的思考步骤 -->
        <transition name="process-collapse">
          <div v-if="showProcessDetails" class="space-y-4 pl-4">
            <div
              v-for="stage in thinkingStages"
              :key="stage.id"
              class="relative border-l border-[#eceff4] pl-5"
            >
              <!-- 步骤左侧圆点 -->
              <div
                class="absolute left-[-6px] top-1.5 flex size-3 items-center justify-center rounded-full bg-white"
              >
                <span class="size-2 rounded-full bg-[#111827]" />
              </div>

              <!-- 步骤标题 + 加载动画 -->
              <div class="flex items-center gap-2 text-[13px] text-[#667085]">
                <span class="font-medium text-[#4b5565]">{{ stage.title }}</span>
                <LoaderCircle
                  v-if="stage.status === 'running'"
                  class="size-3.5 animate-spin text-[#111827]"
                />
              </div>

              <!-- 步骤内容 + 闪烁光标 -->
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

      <!-- ====================== 底部简易状态栏（无思考时显示） ====================== -->
      <section v-if="showReplySummary" class="px-1">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-[#98a2b3]">
          <span v-if="showReplyDuration">用时：{{ formatLatency(resolvedDurationMs) }}</span>
          <span v-if="showReplyTokenCount">Token:{{ finalTokenCount }}</span>
        </div>
      </section>

      <!-- ====================== 回答内容区域 ====================== -->
      <section
        v-if="showAnswerSection"
        class="px-1 text-[15px] leading-8 text-slate-900"
        :class="showReplySummary ? 'pt-0' : 'pt-1'"
      >
        <template v-if="answerHasContent">
          <!-- Markdown 渲染 -->
          <ChatMarkdownContent
            :content="answerContent"
            :show-cursor="answerStatus === 'running'"
          />
        </template>

        <!-- 无内容时显示加载提示 -->
        <div v-else class="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle class="size-4 animate-spin" />
          {{ promptCapabilities.think ? '正在整理回答...' : '正在生成回答...' }}
        </div>
      </section>

      <!-- ====================== 重新生成按钮 ====================== -->
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
/* 思考面板展开/收起动画 */
.process-collapse-enter-active,
.process-collapse-leave-active {
  transition: all 0.22s ease;
}

.process-collapse-enter-from,
.process-collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 打字机闪烁光标 */
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
