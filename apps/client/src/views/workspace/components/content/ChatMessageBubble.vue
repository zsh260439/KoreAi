<script setup lang="ts">
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  X
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import ShiningText from '@/components/ui/ShiningText.vue'
import { useTypewriter } from '@/composables/useTypewriter'
import type {
  AssistantRenderStatus,
  AssistantThinkingStage
} from '@/types/chat/flow'
import type { ChatMessage } from '@/types/chat/models'
import type { KnowledgeSearchHit } from 'share-type'
import ChatMarkdownContent from './ChatMarkdownContent.vue'
import WorkspaceMark from './WorkspaceMark.vue'

type ThoughtEntryKind = 'retrieval' | 'reasoning' | 'generic'

type ThoughtTimelineEntry = {
  id: string
  title: string
  body: string
  note?: string
  status: AssistantRenderStatus
  kind: ThoughtEntryKind
  sourceLink?: boolean
}

const props = defineProps<{
  message: ChatMessage
  showMeta?: boolean
  regenerating?: boolean
  retrievalQuery?: string
}>()

const emit = defineEmits<{
  edit: [message: ChatMessage]
  regenerate: []
}>()

const createdAtFallbackMs = Date.now()
const thinkingHeaderText = 'KoreAi is Thinking'

const processExpanded = ref(false)
const evidenceDrawerOpen = ref(false)
const copied = ref(false)
const userCopied = ref(false)
const liveNowMs = ref(Date.now())

const responseFlow = computed(() => props.message.responseFlow)
const promptCapabilities = computed(
  () => props.message.promptCapabilities ?? { think: false, search: false }
)
const processStages = computed(() => responseFlow.value?.thinking ?? [])

const sources = computed<KnowledgeSearchHit[]>(() => {
  const flowSources = responseFlow.value?.sources ?? []
  if (flowSources.length > 0) {
    return flowSources
  }

  return props.message.citations ?? []
})

const visibleSources = computed(() => sources.value)
const hasSources = computed(() => visibleSources.value.length > 0)
const isStreamingMessage = computed(
  () => props.message.role === 'assistant' && props.message.status === 'streaming'
)

const visibleThinkingStages = computed(() =>
  processStages.value.filter((stage) => {
    if (stage.stageKey === 'answer_synthesis' || stage.id === 'answer-synthesis') {
      return false
    }

    if (isKnowledgeRecallStage(stage)) {
      return stage.status !== 'pending' || hasSources.value || Boolean(stage.subtitle)
    }

    return stage.status !== 'pending' || Boolean(stage.visibleContent || stage.content)
  })
)

const thinkingTimelineEntries = computed(() =>
  buildTimelineEntries(visibleThinkingStages.value, visibleSources.value.length)
)

const normalizeAnswerLeadingBlankLines = (content: string) =>
  content.replace(/^(?:[ \t\u3000]*\r?\n)+/, '')

const streamedAnswerContent = computed(() => {
  if (!responseFlow.value) {
    return normalizeAnswerLeadingBlankLines(props.message.content || '')
  }

  return normalizeAnswerLeadingBlankLines(
    responseFlow.value.answer.content || props.message.content || ''
  )
})

const displayedAnswerContent = useTypewriter(streamedAnswerContent, {
  enabled: isStreamingMessage,
  intervalMs: 16,
  step: 2
})

const showProcessSection = computed(
  () =>
    promptCapabilities.value.think &&
    (thinkingTimelineEntries.value.length > 0 || hasSources.value || isStreamingMessage.value)
)

const isThinkingActive = computed(() =>
  thinkingTimelineEntries.value.some((entry) => entry.status === 'running')
)

const showThinkingHeader = computed(
  () =>
    showProcessSection.value &&
    isStreamingMessage.value &&
    (isThinkingActive.value || !streamedAnswerContent.value.trim())
)

const answerHasContent = computed(() => Boolean(displayedAnswerContent.value.trim()))

const isAssistantWorking = computed(
  () => isStreamingMessage.value || isThinkingActive.value
)

const createdAtMs = computed(() => {
  const parsed = Date.parse(props.message.createdAt)
  return Number.isFinite(parsed) ? parsed : createdAtFallbackMs
})

const liveDurationMs = computed(() => Math.max(0, liveNowMs.value - createdAtMs.value))

const resolvedDurationMs = computed(() => {
  if (isStreamingMessage.value) {
    return liveDurationMs.value
  }

  return responseFlow.value?.totalDurationMs ?? props.message.latencyMs ?? 0
})

const processDurationLabel = computed(() => {
  if (!resolvedDurationMs.value) {
    return ''
  }

  return `用时：${formatLatency(resolvedDurationMs.value)}`
})

const finalTokenCount = computed(() => props.message.totalTokens)
const hasFinalTokenCount = computed(
  () => finalTokenCount.value !== null && finalTokenCount.value > 0
)

const canToggleProcessDetails = computed(
  () => !showThinkingHeader.value && thinkingTimelineEntries.value.length > 0
)

const showProcessDetails = computed(
  () => showThinkingHeader.value || processExpanded.value
)

const showThoughtCompletion = computed(
  () => showProcessSection.value && !showThinkingHeader.value
)

const showThoughtDivider = computed(
  () => showProcessSection.value && !showThinkingHeader.value
)

const showReplySummary = computed(
  () =>
    !showProcessSection.value &&
    (isStreamingMessage.value || resolvedDurationMs.value > 0 || hasFinalTokenCount.value)
)

const showReplyDuration = computed(
  () => !showProcessSection.value && (isStreamingMessage.value || resolvedDurationMs.value > 0)
)

const showReplyTokenCount = computed(
  () => !showProcessSection.value && !isStreamingMessage.value && hasFinalTokenCount.value
)

const showAnswerSection = computed(() => {
  if (showProcessSection.value) {
    return true
  }

  return isStreamingMessage.value || answerHasContent.value || Boolean(streamedAnswerContent.value.trim())
})

const canShowBufferedAnswer = computed(
  () =>
    !showProcessSection.value ||
    !showThinkingHeader.value ||
    Boolean(streamedAnswerContent.value.trim()) ||
    !isStreamingMessage.value
)

const showAnswerActions = computed(
  () =>
    props.showMeta &&
    Boolean(responseFlow.value?.showActions) &&
    !isStreamingMessage.value &&
    answerHasContent.value
)

const evidencePanelVisible = computed(() => evidenceDrawerOpen.value && hasSources.value)

const recallScore = computed(() => {
  if (!visibleSources.value.length) {
    return '-'
  }

  const bestScore = Math.max(...visibleSources.value.map((source) => source.score))
  return Number.isFinite(bestScore) ? bestScore.toFixed(1) : '-'
})

const retrievalQueryText = computed(() => {
  const query = props.retrievalQuery?.trim()
  return query || '正在根据当前用户问题生成检索式。'
})

let liveTimer: number | null = null
let copiedTimer: number | null = null
let userCopiedTimer: number | null = null
let autoCollapseTimer: number | null = null

const stopLiveTimer = () => {
  if (liveTimer !== null) {
    window.clearInterval(liveTimer)
    liveTimer = null
  }
}

const stopCopiedTimer = () => {
  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer)
    copiedTimer = null
  }
}

const stopUserCopiedTimer = () => {
  if (userCopiedTimer !== null) {
    window.clearTimeout(userCopiedTimer)
    userCopiedTimer = null
  }
}

const stopAutoCollapseTimer = () => {
  if (autoCollapseTimer !== null) {
    window.clearTimeout(autoCollapseTimer)
    autoCollapseTimer = null
  }
}

const syncLiveTimer = () => {
  stopLiveTimer()

  if (!isStreamingMessage.value) {
    return
  }

  liveNowMs.value = Date.now()
  liveTimer = window.setInterval(() => {
    liveNowMs.value = Date.now()
  }, 100)
}

const resetVisualSequence = () => {
  stopAutoCollapseTimer()
  stopCopiedTimer()
  stopUserCopiedTimer()
  copied.value = false
  userCopied.value = false
  evidenceDrawerOpen.value = false
  processExpanded.value = Boolean(showProcessSection.value && isStreamingMessage.value)
}

watch(
  () => [props.message.id, props.message.role] as const,
  () => {
    resetVisualSequence()
  },
  { immediate: true }
)

watch(
  () => props.message.status,
  () => {
    syncLiveTimer()
  },
  { immediate: true }
)

watch(
  () => [showProcessSection.value, showThinkingHeader.value] as const,
  ([hasThoughtProcess, thinkingHeader], previousValue) => {
    const previousThinkingHeader = previousValue?.[1]

    if (!hasThoughtProcess) {
      processExpanded.value = false
      stopAutoCollapseTimer()
      return
    }

    if (thinkingHeader) {
      stopAutoCollapseTimer()
      processExpanded.value = true
      return
    }

    if (!previousThinkingHeader) {
      return
    }

    stopAutoCollapseTimer()
    autoCollapseTimer = window.setTimeout(() => {
      processExpanded.value = false
      autoCollapseTimer = null
    }, 500)
  }
)

watch(hasSources, (value) => {
  if (!value) {
    evidenceDrawerOpen.value = false
  }
})

onBeforeUnmount(() => {
  stopLiveTimer()
  stopCopiedTimer()
  stopUserCopiedTimer()
  stopAutoCollapseTimer()
})

const toggleProcessDetails = () => {
  if (!canToggleProcessDetails.value) {
    return
  }

  processExpanded.value = !processExpanded.value
}

const openEvidenceDrawer = () => {
  if (!hasSources.value) {
    return
  }

  evidenceDrawerOpen.value = true
}

const closeEvidenceDrawer = () => {
  evidenceDrawerOpen.value = false
}

const copyAnswer = async () => {
  if (!displayedAnswerContent.value.trim()) {
    return
  }

  try {
    await navigator.clipboard.writeText(displayedAnswerContent.value)
    copied.value = true
    stopCopiedTimer()
    copiedTimer = window.setTimeout(() => {
      copied.value = false
      copiedTimer = null
    }, 1600)
  } catch (error) {
    console.error('Failed to copy answer.', error)
  }
}

const copyUserMessage = async () => {
  if (!props.message.content.trim()) {
    return
  }

  try {
    await navigator.clipboard.writeText(props.message.content)
    userCopied.value = true
    stopUserCopiedTimer()
    userCopiedTimer = window.setTimeout(() => {
      userCopied.value = false
      userCopiedTimer = null
    }, 1600)
  } catch (error) {
    console.error('Failed to copy user message.', error)
  }
}

function isKnowledgeRecallStage(stage: AssistantThinkingStage) {
  return stage.stageKey === 'knowledge_recall' || stage.id === 'knowledge-recall'
}

function formatLatency(latencyMs?: number | null) {
  return `${((latencyMs || 0) / 1000).toFixed(1)} 秒`
}

function formatChunkRank(index: number) {
  return `#${String(index + 1).padStart(2, '0')}`
}

function formatChunkScore(score: number) {
  return Number.isFinite(score) ? score.toFixed(1) : '-'
}

function formatChunkPreview(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  return normalized.length > 112 ? `${normalized.slice(0, 112)}...` : normalized
}

function formatChunkToken(source: KnowledgeSearchHit, index: number) {
  const compactId = source.chunkId ? source.chunkId.slice(0, 6) : String(index + 1)
  return `chunk ${compactId}`
}

function getStageNote(stage: AssistantThinkingStage, sourceCount: number) {
  if (stage.subtitle) {
    return stage.subtitle
  }

  if (isKnowledgeRecallStage(stage)) {
    return sourceCount ? `已命中 ${sourceCount} 个 chunk` : '正在检索相关 chunk'
  }

  return stage.status === 'running' ? '正在整理当前思路' : ''
}

function buildTimelineEntries(
  stages: AssistantThinkingStage[],
  sourceCount: number
): ThoughtTimelineEntry[] {
  return stages.reduce<ThoughtTimelineEntry[]>((entries, stage) => {
    if (stage.stageKey === 'answer_synthesis' || stage.id === 'answer-synthesis') {
      return entries
    }

    if (isKnowledgeRecallStage(stage)) {
      entries.push({
        id: stage.id,
        title: stage.title,
        body: '',
        note: getStageNote(stage, sourceCount),
        status: stage.status,
        kind: 'retrieval',
        sourceLink: sourceCount > 0
      })
      return entries
    }

    if (stage.stageKey === 'llm_reasoning') {
      const parsedEntries = parseReasoningEntriesForTimeline(
        stage.visibleContent || stage.content
      )
      if (parsedEntries.length > 0) {
        entries.push(
          ...parsedEntries.map((entry, index) => ({
            id: `${stage.id}-${index}`,
            title: entry.title,
            body: entry.body,
            note: undefined,
            status: index === parsedEntries.length - 1 ? stage.status : 'done',
            kind: 'reasoning' as const
          }))
        )
        return entries
      }
    }

    entries.push({
      id: stage.id,
      title: stage.title,
      body: stage.visibleContent || stage.content,
      note: !(stage.visibleContent || stage.content)
        ? getStageNote(stage, sourceCount)
        : undefined,
      status: stage.status,
      kind: 'generic'
    })

    return entries
  }, [])
}

function parseReasoningEntriesForTimeline(
  content: string
): Array<{ title: string; body: string }> {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return []
  }

  const normalizedWithInlineHeadings = normalized
    .replace(/([。！？；])\s*([^:\n：]{1,32}[:：])/g, '$1\n$2')
    .replace(/\n{3,}/g, '\n\n')

  const lines = normalizedWithInlineHeadings.split('\n')
  const headingOnlyPattern = /^([^:\n：]{1,32})([:：])\s*$/
  const headingWithBodyPattern = /^([^:\n：]{1,32})([:：])\s*(.+)$/
  const entries: Array<{ title: string; body: string }> = []

  let currentTitle = ''
  let currentBodyLines: string[] = []
  const fallbackLines: string[] = []

  const pushCurrent = () => {
    if (!currentTitle) {
      return
    }

    entries.push({
      title: currentTitle,
      body: currentBodyLines.join('\n').trim()
    })

    currentTitle = ''
    currentBodyLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    const headingOnlyMatch = line.match(headingOnlyPattern)
    if (headingOnlyMatch) {
      pushCurrent()
      currentTitle = `${headingOnlyMatch[1]}${headingOnlyMatch[2]}`
      currentBodyLines = []
      continue
    }

    const headingWithBodyMatch = line.match(headingWithBodyPattern)
    if (headingWithBodyMatch) {
      pushCurrent()
      currentTitle = `${headingWithBodyMatch[1]}${headingWithBodyMatch[2]}`
      currentBodyLines = [headingWithBodyMatch[3]]
      continue
    }

    if (currentTitle) {
      currentBodyLines.push(rawLine)
      continue
    }

    fallbackLines.push(rawLine)
  }

  pushCurrent()

  if (entries.length > 0) {
    return entries
  }

  const fallbackBody = fallbackLines.join('\n').trim()
  if (!fallbackBody) {
    return []
  }

  return [{
    title: '分析结论：',
    body: fallbackBody
  }]
}

function renderThoughtBody(body: string) {
  const escaped = body
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />')
}
</script>

<template>
  <div v-if="message.role === 'user'" class="flex items-start justify-end gap-3">
    <div class="user-message-shell">
      <div
        class="max-w-[360px] rounded-[18px] bg-[#f3f5f8] px-5 py-4 text-[15px] leading-8 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      >
        <div class="whitespace-pre-wrap">{{ message.content || '...' }}</div>
      </div>

      <div class="user-actions">
        <button
          type="button"
          class="answer-action"
          :aria-label="userCopied ? '已复制' : '复制'"
          @click="copyUserMessage"
        >
          <Check v-if="userCopied" class="size-4" />
          <Copy v-else class="size-4" />
        </button>

        <button
          type="button"
          class="answer-action"
          aria-label="编辑"
          @click="emit('edit', message)"
        >
          <PencilLine class="size-4" />
        </button>
      </div>
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
      <section v-if="showProcessSection" class="thinking-shell">
        <button
          type="button"
          class="thinking-header"
          :aria-expanded="showProcessDetails"
          @click="toggleProcessDetails"
        >
          <div class="thinking-header__left">
            <ShiningText
              v-if="showThinkingHeader"
              :text="thinkingHeaderText"
              class="thinking-header__shine"
            />
            <span v-else class="thinking-header__title">已完成思考</span>
            <span v-if="processDurationLabel" class="thinking-header__meta">
              {{ processDurationLabel }}
            </span>
          </div>

          <div v-if="hasFinalTokenCount || canToggleProcessDetails" class="thinking-header__right">
            <span v-if="hasFinalTokenCount" class="thinking-header__meta">
              Token:{{ finalTokenCount }}
            </span>
            <ChevronRight
              v-if="canToggleProcessDetails"
              class="size-4 transition-transform"
              :class="showProcessDetails ? 'rotate-90' : ''"
            />
          </div>
        </button>

        <transition name="process-collapse">
          <div v-if="showProcessDetails" class="thinking-panel">
            <div class="thinking-timeline">
              <article
                v-for="stage in thinkingTimelineEntries"
                :key="stage.id"
                class="thought-entry"
              >
                <div class="thought-entry__main">
                  <span class="thought-entry__dot-shell" aria-hidden="true">
                    <span class="thought-entry__dot-core" />
                  </span>

                  <div class="thought-entry__title-row">
                    <ShiningText
                      v-if="stage.status === 'running' && showThinkingHeader"
                      :text="stage.title"
                      class="thought-entry__title thought-entry__title--active"
                    />
                    <strong v-else class="thought-entry__title">{{ stage.title }}</strong>
                  </div>

                  <button
                    v-if="stage.kind === 'retrieval' && hasSources"
                    type="button"
                    class="thought-entry__source"
                    @click="openEvidenceDrawer"
                  >
                    <span>{{ stage.note }}</span>
                    <span class="thought-entry__source-arrow">&gt;</span>
                  </button>

                  <div
                    v-else-if="stage.body"
                    class="thought-entry__body"
                    v-html="renderThoughtBody(stage.body)"
                  />

                  <p v-else-if="stage.note" class="thought-entry__note">
                    {{ stage.note }}
                  </p>
                </div>
              </article>
            </div>

            <div class="thinking-footer">
              <div
                class="thinking-footer__completion"
                :class="{ 'thinking-footer__completion--visible': showThoughtCompletion }"
              >
                <span class="thinking-footer__badge">
                  <CheckCircle2 class="size-4" />
                </span>
                <span>已完成</span>
              </div>
              <div
                class="thinking-footer__divider"
                :class="{ 'thinking-footer__divider--visible': showThoughtDivider }"
              />
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
        class="answer-shell"
        :class="{
          'answer-shell--divided': showThoughtDivider && showProcessDetails,
          'answer-shell--blank': showProcessSection && !canShowBufferedAnswer
        }"
      >
        <template v-if="canShowBufferedAnswer && answerHasContent">
          <ChatMarkdownContent
            :content="displayedAnswerContent"
            :show-cursor="isStreamingMessage && canShowBufferedAnswer"
          />
        </template>

        <div
          v-else-if="showProcessSection"
          class="answer-shell__placeholder"
          aria-hidden="true"
        />

        <div v-else class="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle class="size-4 animate-spin" />
          正在生成回答...
        </div>
      </section>

      <div v-if="showAnswerActions" class="answer-actions">
        <button
          type="button"
          class="answer-action"
          :aria-label="copied ? '已复制' : '复制'"
          @click="copyAnswer"
        >
          <Check v-if="copied" class="size-4" />
          <Copy v-else class="size-4" />
        </button>

        <button
          type="button"
          class="answer-action"
          aria-label="重新生成"
          :disabled="regenerating"
          @click="emit('regenerate')"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': regenerating }" />
        </button>
      </div>
    </div>

    <Teleport to="body">
      <transition name="evidence-drawer">
        <div v-if="evidencePanelVisible" class="evidence-drawer-layer">
          <button
            type="button"
            class="evidence-drawer__mask"
            aria-label="关闭命中 chunk 抽屉"
            @click="closeEvidenceDrawer"
          />

          <aside class="evidence-drawer" @click.stop>
            <header class="evidence-drawer__header">
              <div>
                <strong>命中 chunk</strong>
                <span>已命中 {{ visibleSources.length }} 个 chunk</span>
              </div>
              <button
                type="button"
                class="evidence-drawer__close"
                aria-label="关闭命中 chunk 抽屉"
                @click="closeEvidenceDrawer"
              >
                <X class="size-5" />
              </button>
            </header>

            <div class="evidence-panel__top">
              <div class="evidence-summary evidence-summary--query">
                <span class="evidence-label">当前检索问题</span>
                <p>{{ retrievalQueryText }}</p>
              </div>
              <div class="evidence-summary evidence-summary--score">
                <span class="evidence-label">召回置信度</span>
                <strong>{{ recallScore }}</strong>
                <p>RRF 融合分</p>
              </div>
            </div>

            <div class="chunk-hit-list">
              <article
                v-for="(source, index) in visibleSources"
                :key="source.chunkId || `${source.documentId}-${index}`"
                class="chunk-hit-card"
                :style="{ '--chunk-index': index }"
              >
                <div class="chunk-hit-card__rank">{{ formatChunkRank(index) }}</div>
                <div class="chunk-hit-card__main">
                  <div class="chunk-hit-card__head">
                    <h4>{{ source.documentName || '未命名文档' }}</h4>
                    <strong>{{ formatChunkScore(source.score) }}</strong>
                  </div>
                  <p>{{ formatChunkPreview(source.content) }}</p>
                  <div class="chunk-hit-card__tags">
                    <span>文档：{{ source.documentName || source.documentId }}</span>
                    <span>{{ formatChunkToken(source, index) }}</span>
                    <span>命中片段</span>
                  </div>
                </div>
              </article>
            </div>
          </aside>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.user-message-shell {
  display: flex;
  max-width: 360px;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.user-actions {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding-right: 4px;
}

.thinking-shell {
  max-width: min(860px, 100%);
}

.thinking-header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.thinking-header__left,
.thinking-header__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.thinking-header__left {
  min-width: 0;
}

.thinking-header__title,
.thinking-header__shine {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
}

.thinking-header__title {
  color: #3c4350;
}

.thinking-header__meta {
  color: #8b94a4;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.thinking-panel {
  padding-top: 14px;
}

.thinking-timeline {
  position: relative;
  padding-left: 4px;
}

.thought-entry {
  position: relative;
  padding-left: 20px;
  border-left: 1px solid #141414;
}

.thought-entry:not(:last-child) {
  padding-bottom: 10px;
}

.thought-entry:last-child {
  padding-bottom: 0;
}

.thought-entry__main {
  position: relative;
  min-width: 0;
}

.thought-entry__dot-shell {
  position: absolute;
  left: -26px;
  top: 0;
  display: flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #fff;
}

.thought-entry__dot-core {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #111827;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.16),
    0 0 0 0.5px rgba(0, 0, 0, 0.18);
}

.thought-entry__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thought-entry__title,
.thought-entry__title--active {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}

.thought-entry__title {
  color: #2f3745;
}

.thought-entry__note,
.thought-entry__source {
  margin-top: 6px;
}

.thought-entry__body {
  margin-top: 10px;
  color: #475467;
  font-size: 15px;
  line-height: 1.72;
  white-space: normal;
}

.thought-entry__body :deep(strong),
.thought-entry__body strong {
  color: #243041;
  font-weight: 700;
}

.thought-entry__body :deep(code),
.thought-entry__body code {
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.06);
  padding: 2px 6px;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 0.92em;
  color: #1f2937;
}

.thought-entry__note {
  color: #5d6777;
  font-size: 15px;
  line-height: 1.72;
}

.thought-entry__source {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #344256;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.72;
  cursor: pointer;
}

.thought-entry__source:hover {
  color: #111827;
}

.thought-entry__source-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid #cfd6df;
  border-radius: 999px;
  color: #687385;
  font-size: 12px;
  line-height: 1;
  transition: transform 180ms ease, color 180ms ease, border-color 180ms ease;
}

.thought-entry__source:hover .thought-entry__source-arrow {
  transform: translateX(2px);
  color: #111827;
  border-color: #aab4c0;
}

.thinking-footer {
  min-height: 52px;
  padding-top: 12px;
}

.thinking-footer__completion {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  transform: translateY(6px);
  color: #4b5565;
  font-size: 14px;
  font-weight: 600;
  transition:
    opacity 240ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.thinking-footer__completion--visible {
  opacity: 1;
  transform: translateY(0);
}

.thinking-footer__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: #4b5565;
}

.thinking-footer__divider {
  height: 1px;
  margin-top: 16px;
  border-top: 1px dashed transparent;
  transition: border-color 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.thinking-footer__divider--visible {
  border-top-color: #d8dde5;
}

.answer-shell {
  min-height: 32px;
  padding-top: 8px;
}

.answer-shell--divided {
  padding-top: 20px;
}

.answer-shell--blank {
  min-height: 44px;
}

.answer-shell__placeholder {
  min-height: 40px;
}

.answer-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 18px;
}

.answer-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  color: #687385;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: color 180ms ease;
}

.answer-action:hover:not(:disabled) {
  color: #111827;
}

.answer-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.evidence-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.evidence-drawer__mask {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(235, 243, 241, 0.14);
}

.evidence-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(740px, 92vw);
  overflow: auto;
  border-left: 1px solid #dbe8e4;
  background:
    linear-gradient(180deg, #f6fbfb 0%, #fbfdfd 38%, #feffff 100%);
  padding: 18px 20px 28px;
  box-shadow: -16px 0 44px rgba(108, 140, 132, 0.12);
}

.evidence-drawer__header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: -18px -20px 18px;
  border-bottom: 1px solid #dbe8e4;
  background:
    linear-gradient(180deg, rgba(246, 251, 251, 0.96) 0%, rgba(252, 254, 254, 0.96) 100%);
  padding: 24px 20px 18px;
  backdrop-filter: blur(12px);
}

.evidence-drawer__header strong {
  display: block;
  color: #0f172a;
  font-size: 16px;
  font-weight: 760;
  line-height: 1.35;
}

.evidence-drawer__header span {
  display: block;
  margin-top: 4px;
  color: #708292;
  font-size: 13px;
  font-weight: 560;
}

.evidence-drawer__close {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid #d6e3df;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: #3c556c;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
}

.evidence-drawer__close:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: #bfd2cb;
  color: #18324b;
}

.evidence-panel__top {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(188px, 0.8fr);
  gap: 16px;
  margin-bottom: 16px;
}

.evidence-summary {
  min-height: 118px;
  border: 1px solid #dbe8e4;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  padding: 16px 18px;
  box-shadow: 0 1px 2px rgba(103, 128, 148, 0.03);
}

.evidence-summary--query p {
  margin: 12px 0 0;
  color: #17324b;
  font-size: 14px;
  line-height: 1.82;
}

.evidence-summary--score strong {
  display: block;
  margin-top: 10px;
  color: #0f776f;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 28px;
  font-weight: 760;
  line-height: 1.06;
}

.evidence-summary--score p {
  margin: 8px 0 0;
  color: #5f7790;
  font-size: 13px;
}

.evidence-label {
  color: #7f92a5;
  font-size: 13px;
  font-weight: 700;
}

.chunk-hit-list {
  display: grid;
  gap: 16px;
}

.chunk-hit-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 18px;
  border: 1px solid #dbe8e4;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  padding: 18px 18px 16px;
  box-shadow: 0 1px 2px rgba(104, 127, 149, 0.03);
  animation: chunk-hit-enter 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--chunk-index) * 90ms);
}

.chunk-hit-card__rank {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(180deg, #ecfbf7 0%, #f2fbfc 100%);
  color: #0b6d67;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 13px;
  font-weight: 760;
}

.chunk-hit-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.chunk-hit-card__head h4 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  font-weight: 760;
  line-height: 1.42;
}

.chunk-hit-card__head strong {
  flex-shrink: 0;
  color: #0f776f;
  font-family: "Geist Mono", "JetBrains Mono", Consolas, monospace;
  font-size: 14px;
  font-weight: 760;
  line-height: 1.2;
}

.chunk-hit-card__main > p {
  margin: 10px 0 0;
  color: #17324b;
  font-size: 14px;
  line-height: 1.8;
}

.chunk-hit-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.chunk-hit-card__tags span {
  border-radius: 999px;
  background: #f2f7fb;
  padding: 5px 11px;
  color: #67809b;
  font-size: 12px;
  line-height: 1.2;
}

.process-collapse-enter-active,
.process-collapse-leave-active {
  transition: all 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.process-collapse-enter-from,
.process-collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.evidence-drawer-enter-active .evidence-drawer,
.evidence-drawer-leave-active .evidence-drawer {
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.evidence-drawer-enter-active .evidence-drawer__mask,
.evidence-drawer-leave-active .evidence-drawer__mask {
  transition: opacity 200ms ease;
}

.evidence-drawer-enter-from .evidence-drawer,
.evidence-drawer-leave-to .evidence-drawer {
  transform: translateX(100%);
}

.evidence-drawer-enter-from .evidence-drawer__mask,
.evidence-drawer-leave-to .evidence-drawer__mask {
  opacity: 0;
}

@keyframes chunk-hit-enter {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1180px) {
  .evidence-drawer {
    width: min(640px, calc(100vw - 24px));
  }

  .evidence-panel__top {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chunk-hit-card {
    animation: none !important;
  }

  .thinking-footer__completion,
  .thinking-footer__divider,
  .thought-entry__source-arrow,
  .answer-action,
  .evidence-drawer__close {
    transition-duration: 0.01ms !important;
  }

  .process-collapse-enter-active,
  .process-collapse-leave-active,
  .evidence-drawer-enter-active,
  .evidence-drawer-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
