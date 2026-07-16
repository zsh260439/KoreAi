<script setup lang="ts">
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Layers3,
  ListFilter,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'

import { useWorkspaceCacheStore } from '@/stores/workspace-cache'
import type {
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  WorkspaceMessage
} from 'share-type'

type TraceStage = {
  key: string
  label: string
  value: string
  icon: Component
  tone: 'neutral' | 'info' | 'success' | 'warning'
}

const cache = useWorkspaceCacheStore()
const { conversations, messagesByConversation } = storeToRefs(cache)
const selectedConversationId = ref('')
const selectedMessageId = ref('')
const searchValue = ref('')
const isLoading = ref(false)
const loadingConversationId = ref('')
const isLoadingMessages = computed(
  () => loadingConversationId.value === selectedConversationId.value
)
const errorMessage = ref('')
const expandedHitId = ref('')
const termsExpanded = ref(false)
const visibleConversationCount = ref(80)

const filteredConversations = computed(() => {
  const keyword = searchValue.value.trim().toLowerCase()
  if (!keyword) return conversations.value

  return conversations.value.filter((conversation) =>
    `${conversation.title} ${conversation.model ?? ''}`.toLowerCase().includes(keyword)
  )
})

const visibleConversations = computed(() =>
  filteredConversations.value.slice(0, visibleConversationCount.value)
)

const messages = computed<WorkspaceMessage[]>(
  () => messagesByConversation.value[selectedConversationId.value] ?? []
)

const activeConversation = computed(
  () => conversations.value.find((conversation) => conversation.id === selectedConversationId.value) ?? null
)

const assistantMessages = computed(() => messages.value.filter((message) => message.role === 'assistant'))

const activeMessage = computed(
  () => assistantMessages.value.find((message) => message.id === selectedMessageId.value) ?? null
)

const activeDebug = computed<KnowledgeSearchDebugInfo | null>(
  () => activeMessage.value?.retrievalDebug ?? null
)

const activeSources = computed<KnowledgeSearchHit[]>(() => activeMessage.value?.citations ?? [])

const evidenceTerms = computed(() => {
  const debug = activeDebug.value
  const identifiers = debug?.originalQuery.match(/[a-z][a-z0-9_]*-\d+/gi) ?? []
  const identifierParts = new Set(identifiers.flatMap((value) => value.toLowerCase().split('-')))

  return [
    ...identifiers.map((value) => ({ value: value.toUpperCase(), numeric: false })),
    ...(debug?.evidenceTerms ?? [])
      .filter((value) => !identifierParts.has(value.toLowerCase()))
      .map((value) => ({ value, numeric: false })),
    ...(debug?.evidenceNumericTerms ?? [])
      .filter((value) => !identifierParts.has(value.toLowerCase()))
      .map((value) => ({ value, numeric: true }))
  ]
})

const visibleEvidenceTerms = computed(() =>
  termsExpanded.value ? evidenceTerms.value : evidenceTerms.value.slice(0, 8)
)

const hiddenEvidenceTermCount = computed(() =>
  Math.max(0, evidenceTerms.value.length - visibleEvidenceTerms.value.length)
)

const stageItems = computed<TraceStage[]>(() => {
  const debug = activeDebug.value
  const message = activeMessage.value
  if (!message) return []

  const gate = debug?.evidenceGateStatus ?? 'unknown'
  const gateTone = gate === 'pass' ? 'success' : gate === 'blocked' ? 'warning' : 'info'

  return [
    {
      key: 'request',
      label: '请求',
      value: message.promptCapabilities?.rewrite === false ? '直接检索' : '允许改写',
      icon: MessageSquareText,
      tone: 'neutral'
    },
    {
      key: 'query',
      label: '查询',
      value: debug?.retrievalMode ?? '未记录',
      icon: Search,
      tone: 'info'
    },
    {
      key: 'retrieval',
      label: '召回',
      value: `${activeSources.value.length} 个片段`,
      icon: Layers3,
      tone: 'info'
    },
    {
      key: 'evidence',
      label: '证据',
      value: gate === 'pass' ? '通过' : gate === 'blocked' ? '不足' : '待确认',
      icon: ShieldCheck,
      tone: gateTone
    },
    {
      key: 'answer',
      label: '回答',
      value: formatDuration(message.latencyMs),
      icon: Sparkles,
      tone: 'success'
    }
  ]
})

const loadConversations = async (force = false) => {
  isLoading.value = true
  errorMessage.value = ''

  try {
    await cache.loadConversations(force)

    if (!selectedConversationId.value && conversations.value[0]) {
      await selectConversation(conversations.value[0].id)
    }
  } catch {
    errorMessage.value = '无法加载会话记录'
  } finally {
    isLoading.value = false
  }
}

const selectConversation = async (conversationId: string) => {
  if (conversationId === selectedConversationId.value && cache.hasConversationMessages(conversationId)) return

  selectedConversationId.value = conversationId
  expandedHitId.value = ''
  termsExpanded.value = false

  if (cache.hasConversationMessages(conversationId)) {
    selectedMessageId.value = (messagesByConversation.value[conversationId] ?? [])
      .filter((message) => message.role === 'assistant')
      .at(-1)?.id ?? ''
    return
  }

  selectedMessageId.value = ''
  loadingConversationId.value = conversationId

  try {
    const loadedMessages = await cache.loadConversationMessages(conversationId)
    if (selectedConversationId.value === conversationId) {
      selectedMessageId.value = loadedMessages.filter((message) => message.role === 'assistant').at(-1)?.id ?? ''
    }
  } catch {
    errorMessage.value = '无法加载会话消息'
  } finally {
    if (loadingConversationId.value === conversationId) {
      loadingConversationId.value = ''
    }
  }
}

const selectMessage = (messageId: string) => {
  selectedMessageId.value = messageId
  expandedHitId.value = ''
  termsExpanded.value = false
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const formatDuration = (milliseconds: number | null) => {
  if (!milliseconds) return '未记录'
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} 秒`
}

const formatScore = (value?: number | null) => (typeof value === 'number' ? value.toFixed(3) : '-')

const formatPercent = (value?: number | null) =>
  typeof value === 'number' ? `${Math.round(value * 100)}%` : '-'

const toggleHit = (hitId: string) => {
  expandedHitId.value = expandedHitId.value === hitId ? '' : hitId
}

const handleConversationScroll = (event: Event) => {
  const container = event.currentTarget as HTMLElement
  if (container.scrollHeight - container.scrollTop - container.clientHeight < 120) {
    visibleConversationCount.value = Math.min(
      visibleConversationCount.value + 80,
      filteredConversations.value.length
    )
  }
}

watch(searchValue, () => {
  visibleConversationCount.value = 80
})

onMounted(() => loadConversations())
</script>

<template>
  <section class="trace-page">
    <header class="trace-page__header">
      <div>
        <p class="trace-page__eyebrow">RAG 运行记录</p>
        <h2>Trace 链路</h2>
        <p>从会话中选择一次回答，查看它经过的检索与证据。</p>
      </div>
      <button class="trace-button" type="button" :disabled="isLoading" @click="loadConversations(true)">
        <RefreshCw :class="['size-4', { 'animate-spin': isLoading }]" />
        刷新
      </button>
    </header>

    <p v-if="errorMessage" class="trace-error">{{ errorMessage }}</p>

    <div class="trace-workbench">
      <aside class="trace-conversations" aria-label="会话列表">
        <div class="trace-panel__heading">
          <div>
            <span>会话</span>
            <strong>{{ filteredConversations.length }}</strong>
          </div>
          <label class="trace-search">
            <Search class="size-4" />
            <input v-model="searchValue" placeholder="筛选会话" />
          </label>
        </div>

        <div v-if="isLoading" class="trace-list-skeleton" aria-label="加载中">
          <span v-for="item in 7" :key="item" />
        </div>
        <div v-else class="trace-conversation-list" @scroll.passive="handleConversationScroll">
          <button
            v-for="conversation in visibleConversations"
            :key="conversation.id"
            type="button"
            :class="['trace-conversation', { 'is-active': conversation.id === selectedConversationId }]"
            @click="selectConversation(conversation.id)"
          >
            <span class="trace-conversation__title">{{ conversation.title }}</span>
            <span>{{ conversation.messageCount }} 条 · {{ formatDateTime(conversation.updatedAt) }}</span>
            <span>{{ conversation.model ?? '未记录模型' }}</span>
          </button>
          <p v-if="!filteredConversations.length" class="trace-empty">没有匹配的会话</p>
        </div>
      </aside>

      <aside class="trace-responses" aria-label="AI 回复列表">
        <div class="trace-panel__heading">
          <div>
            <span>AI 回复</span>
            <strong>{{ assistantMessages.length }}</strong>
          </div>
          <MessageSquareText class="size-4 text-slate-400" />
        </div>

        <div v-if="isLoadingMessages" class="trace-list-skeleton" aria-label="加载消息">
          <span v-for="item in 5" :key="item" />
        </div>
        <div v-else class="trace-response-list">
          <button
            v-for="message in assistantMessages"
            :key="message.id"
            type="button"
            :class="['trace-response', { 'is-active': message.id === selectedMessageId }]"
            @click="selectMessage(message.id)"
          >
            <span class="trace-response__preview">{{ message.content }}</span>
            <span>{{ formatDuration(message.latencyMs) }} · {{ message.totalTokens ?? '-' }} tokens</span>
          </button>
          <p v-if="!assistantMessages.length" class="trace-empty">该会话还没有 AI 回复</p>
        </div>
      </aside>

      <main class="trace-detail">
        <template v-if="activeMessage">
          <section class="trace-summary">
            <div>
              <span class="trace-summary__label">当前会话</span>
              <h3>{{ activeConversation?.title }}</h3>
            </div>
            <div class="trace-summary__meta">
              <span>{{ activeMessage.model ?? '未记录模型' }}</span>
              <span><Clock3 class="size-3.5" /> {{ formatDateTime(activeMessage.createdAt) }}</span>
            </div>
          </section>

          <ol class="trace-flow" aria-label="回答链路">
            <li v-for="(stage, index) in stageItems" :key="stage.key">
              <div :class="['trace-flow__icon', `is-${stage.tone}`]"><component :is="stage.icon" /></div>
              <div>
                <span>{{ stage.label }}</span>
                <strong>{{ stage.value }}</strong>
              </div>
              <ArrowRight v-if="index < stageItems.length - 1" class="trace-flow__arrow" />
            </li>
          </ol>

          <div class="trace-detail__grid">
            <section class="trace-section trace-section--query">
              <div class="trace-section__heading">
                <div>
                  <h4>查询</h4>
                </div>
                <ListFilter class="size-4 text-slate-400" />
              </div>
              <dl class="trace-kv-list">
                <div><dt>原始问题</dt><dd>{{ activeDebug?.originalQuery || '-' }}</dd></div>
                <div><dt>BM25 查询</dt><dd>{{ activeDebug?.bm25Query || '-' }}</dd></div>
                <div><dt>向量查询</dt><dd>{{ activeDebug?.vectorQuery || '-' }}</dd></div>
              </dl>
            </section>

            <section class="trace-section trace-section--evidence">
              <div class="trace-section__heading">
                <div>
                  <h4>证据判断</h4>
                </div>
                <span :class="['trace-gate', `is-${activeDebug?.evidenceGateStatus ?? 'unknown'}`]">
                  <Check v-if="activeDebug?.evidenceGateStatus === 'pass'" class="size-3.5" />
                  {{ activeDebug?.evidenceGateStatus ?? 'unknown' }}
                </span>
              </div>
              <div class="trace-coverage">
                <div><span>证据覆盖</span><strong>{{ formatPercent(activeDebug?.evidenceCoverage) }}</strong></div>
                <div class="trace-coverage__bar"><span :style="{ width: formatPercent(activeDebug?.evidenceCoverage) }" /></div>
              </div>
              <div class="trace-tags">
                <span
                  v-for="term in visibleEvidenceTerms"
                  :key="`${term.numeric ? 'number' : 'term'}-${term.value}`"
                  :class="{ 'is-numeric': term.numeric }"
                >{{ term.value }}</span>
                <span v-if="!evidenceTerms.length" class="is-empty">未记录证据词</span>
                <button
                  v-if="hiddenEvidenceTermCount || termsExpanded"
                  class="trace-tags__toggle"
                  type="button"
                  @click="termsExpanded = !termsExpanded"
                >{{ termsExpanded ? '收起' : `展开其余 ${hiddenEvidenceTermCount} 项` }}</button>
              </div>
            </section>
          </div>

          <section class="trace-section trace-section--sources">
            <div class="trace-section__heading">
              <div>
                <span>命中证据</span>
                <h4>{{ activeSources.length }} 个片段参与回答</h4>
              </div>
              <span class="trace-section__hint">点击查看片段</span>
            </div>
            <div class="trace-source-list">
              <article v-for="(source, index) in activeSources" :key="source.chunkId" class="trace-source">
                <button type="button" class="trace-source__main" @click="toggleHit(source.chunkId)">
                  <span class="trace-source__rank">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span class="trace-source__name">
                    <strong>{{ source.documentName }}</strong>
                    <small>{{ source.primaryTitle || source.sectionPath || '未标记章节' }}</small>
                  </span>
                  <span class="trace-source__scores">
                    <span>总分 {{ source.score.toFixed(2) }}</span>
                    <span>BM25 {{ formatScore(source.scoreDetail?.bm25Score) }}</span>
                    <span>向量 {{ formatScore(source.scoreDetail?.vectorScore) }}</span>
                  </span>
                  <ChevronDown :class="['size-4', { 'rotate-180': expandedHitId === source.chunkId }]" />
                </button>
                <Transition name="trace-expand">
                  <div v-if="expandedHitId === source.chunkId" class="trace-source__content">
                    <p>{{ source.content }}</p>
                    <div class="trace-tags trace-tags--subtle">
                      <span v-for="term in source.scoreDetail?.matchedEvidenceTerms ?? []" :key="term">{{ term }}</span>
                      <span v-for="term in source.scoreDetail?.matchedNumericTerms ?? []" :key="term" class="is-numeric">{{ term }}</span>
                    </div>
                  </div>
                </Transition>
              </article>
            </div>
          </section>

          <section class="trace-answer">
            <div class="trace-answer__heading"><FileText class="size-4" /><span>最终回答</span></div>
            <p>{{ activeMessage.content }}</p>
          </section>
        </template>

        <div v-else class="trace-detail__empty">
          <LoaderCircle v-if="isLoadingMessages" class="size-5 animate-spin" />
          <Sparkles v-else class="size-5" />
          <p>选择一次 AI 回复查看链路</p>
        </div>
      </main>
    </div>
  </section>
</template>

<style scoped>
.trace-page { display: flex; min-height: 0; flex-direction: column; color: #172033; }
.trace-page__header { display: flex; flex: none; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.trace-page__eyebrow, .trace-section__heading > div > span, .trace-summary__label { margin: 0 0 5px; color: #64748b; font-size: 12px; font-weight: 600; }
.trace-page h2, .trace-page h3, .trace-page h4, .trace-page p { margin: 0; }
.trace-page h2 { font-size: 24px; letter-spacing: -0.02em; }
.trace-page__header p:last-child { margin-top: 7px; color: #64748b; font-size: 14px; }
.trace-button { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #d8e1ec; border-radius: 8px; background: #fff; color: #334155; padding: 9px 12px; font-size: 13px; font-weight: 600; transition: border-color .18s ease, background .18s ease; }
.trace-button:hover:not(:disabled) { border-color: #94a3b8; background: #f8fafc; }
.trace-button:disabled { cursor: wait; opacity: .65; }
.trace-error { margin: -8px 0 16px; color: #b91c1c; font-size: 13px; }
.trace-workbench { display: grid; min-height: 0; flex: 1; grid-template-columns: 240px 270px minmax(0, 1fr); overflow: hidden; border: 1px solid #d7e0ea; border-radius: 16px; background: #fff; box-shadow: 0 18px 45px rgb(30 58 95 / 7%); }
.trace-conversations, .trace-responses { display: flex; min-width: 0; min-height: 0; flex-direction: column; border-right: 1px solid #e8edf3; background: #fcfdff; }
.trace-responses { background: #fff; }
.trace-panel__heading { display: flex; min-height: 74px; flex: none; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e8edf3; padding: 14px; }
.trace-panel__heading > div { display: grid; gap: 3px; }
.trace-panel__heading span { color: #64748b; font-size: 12px; }
.trace-panel__heading strong { color: #172033; font-size: 14px; }
.trace-search { display: flex; width: 108px; align-items: center; gap: 6px; border-bottom: 1px solid #d8e1ec; color: #94a3b8; padding: 4px 0; }
.trace-search input { width: 100%; border: 0; outline: 0; background: transparent; color: #334155; font-size: 12px; }
.trace-conversation-list, .trace-response-list { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 7px; }
.trace-conversation, .trace-response { display: grid; width: 100%; gap: 5px; border: 0; border-radius: 8px; background: transparent; padding: 11px 10px; text-align: left; color: #64748b; transition: background .16s ease, color .16s ease; }
.trace-conversation { content-visibility: auto; contain-intrinsic-size: 70px; }
.trace-conversation:hover, .trace-response:hover { background: #f1f5f9; }
.trace-conversation.is-active, .trace-response.is-active { background: #eaf1ff; color: #334155; }
.trace-conversation__title, .trace-response__preview { overflow: hidden; color: #25324a; font-size: 13px; font-weight: 650; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.trace-conversation > span:not(.trace-conversation__title), .trace-response > span:not(.trace-response__preview) { color: #94a3b8; font-size: 11px; }
.trace-empty { padding: 24px 12px; color: #94a3b8; font-size: 13px; text-align: center; }
.trace-list-skeleton { display: grid; gap: 13px; padding: 18px; }
.trace-list-skeleton span { height: 48px; border-radius: 8px; background: linear-gradient(90deg, #f1f5f9, #f8fafc, #f1f5f9); background-size: 200% 100%; animation: trace-shimmer 1.4s ease infinite; }
.trace-detail { min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 28px 30px 36px; background: linear-gradient(180deg, #ffffff 0, #fbfcfe 100%); }
.trace-summary { display: flex; align-items: start; justify-content: space-between; gap: 20px; border-bottom: 1px solid #e8edf3; padding-bottom: 18px; }
.trace-summary h3 { max-width: 36ch; font-size: 17px; letter-spacing: -0.01em; }
.trace-summary__meta { display: flex; align-items: end; flex-direction: column; gap: 6px; color: #64748b; font-size: 12px; white-space: nowrap; }
.trace-summary__meta span:last-child { display: inline-flex; align-items: center; gap: 5px; }
.trace-flow { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 22px 0 28px; border-bottom: 1px solid #e8edf3; padding: 0 0 20px; list-style: none; }
.trace-flow li { position: relative; display: flex; min-width: 0; align-items: center; gap: 9px; }
.trace-flow__icon { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 8px; }
.trace-flow__icon :deep(svg) { width: 15px; height: 15px; }
.trace-flow__icon.is-neutral { background: #eef2f7; color: #475569; }.trace-flow__icon.is-info { background: #eaf1ff; color: #2563eb; }.trace-flow__icon.is-success { background: #eaf7ef; color: #15803d; }.trace-flow__icon.is-warning { background: #fff6df; color: #b45309; }
.trace-flow span { display: block; overflow: hidden; color: #7b8798; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.trace-flow strong { display: block; overflow: hidden; margin-top: 2px; color: #25324a; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.trace-flow__arrow { position: absolute; top: 8px; right: -5px; width: 13px; color: #cbd5e1; }
.trace-detail__grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(220px, .85fr); gap: 20px; }
.trace-section { min-width: 0; border-top: 1px solid #dfe7ef; padding-top: 14px; }.trace-section__heading { display: flex; align-items: start; justify-content: space-between; gap: 16px; }.trace-section__heading h4 { font-size: 14px; }.trace-section__hint { color: #94a3b8; font-size: 11px; }
.trace-kv-list { margin: 14px 0 0; }.trace-kv-list div { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 12px; padding: 7px 0; }.trace-kv-list dt { color: #94a3b8; font-size: 12px; }.trace-kv-list dd { overflow: hidden; margin: 0; color: #475569; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.trace-gate { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; background: #f1f5f9; padding: 4px 8px; color: #64748b; font-size: 11px; font-weight: 700; }.trace-gate.is-pass { background: #eaf7ef; color: #15803d; }.trace-gate.is-blocked { background: #fff1f2; color: #be123c; }.trace-gate.is-degraded { background: #fff6df; color: #b45309; }
.trace-coverage { margin: 16px 0 12px; }.trace-coverage > div:first-child { display: flex; justify-content: space-between; color: #64748b; font-size: 12px; }.trace-coverage strong { color: #25324a; }.trace-coverage__bar { height: 5px; margin-top: 7px; overflow: hidden; border-radius: 999px; background: #e8edf3; }.trace-coverage__bar span { display: block; height: 100%; border-radius: inherit; background: #3b82f6; }
.trace-tags { display: flex; flex-wrap: wrap; gap: 6px; }.trace-tags span { border-radius: 5px; background: #f1f5f9; padding: 3px 6px; color: #475569; font-size: 11px; }.trace-tags .is-numeric { background: #eaf1ff; color: #1d4ed8; }.trace-tags .is-empty { color: #94a3b8; }
.trace-tags__toggle { border: 0; border-radius: 5px; background: transparent; padding: 3px 4px; color: #2563eb; font-size: 11px; font-weight: 600; }
.trace-tags__toggle:hover { background: #eaf1ff; }
.trace-section--sources { margin-top: 24px; }.trace-source-list { margin-top: 12px; }.trace-source { border-top: 1px solid #e8edf3; }.trace-source__main { display: grid; width: 100%; grid-template-columns: 28px minmax(0, 1fr) auto 18px; align-items: center; gap: 10px; border: 0; background: transparent; padding: 12px 0; text-align: left; }.trace-source__main:hover .trace-source__name strong { color: #2563eb; }.trace-source__rank { color: #94a3b8; font-size: 11px; font-variant-numeric: tabular-nums; }.trace-source__name { display: grid; min-width: 0; gap: 3px; }.trace-source__name strong, .trace-source__name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.trace-source__name strong { color: #334155; font-size: 12px; }.trace-source__name small { color: #94a3b8; font-size: 11px; }.trace-source__scores { display: flex; gap: 9px; color: #64748b; font-size: 11px; white-space: nowrap; }.trace-source__content { margin: -2px 0 14px 38px; border-radius: 8px; background: #f8fafc; padding: 12px; }.trace-source__content p { color: #475569; font-size: 12px; line-height: 1.7; white-space: pre-wrap; }.trace-tags--subtle { margin-top: 10px; }
.trace-answer { margin-top: 24px; border-top: 1px solid #dfe7ef; padding-top: 14px; }.trace-answer__heading { display: flex; align-items: center; gap: 7px; color: #334155; font-size: 13px; font-weight: 700; }.trace-answer > p { margin-top: 10px; color: #334155; font-size: 13px; line-height: 1.8; white-space: pre-wrap; }.trace-detail__empty { display: grid; min-height: 450px; place-content: center; gap: 9px; color: #94a3b8; text-align: center; font-size: 13px; }
.trace-source, .trace-answer { contain: layout paint style; }
.trace-expand-enter-active, .trace-expand-leave-active { transition: opacity .16s ease, transform .16s ease; }
.trace-expand-enter-from, .trace-expand-leave-to { opacity: 0; transform: translateY(-4px); }
@keyframes trace-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .trace-list-skeleton span { animation: none; }.trace-expand-enter-active, .trace-expand-leave-active { transition: none; } }
@media (max-width: 1400px) { .trace-flow { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 14px; }.trace-flow__arrow { display: none; }.trace-detail__grid { grid-template-columns: 1fr; } }
@media (max-width: 1080px) { .trace-workbench { grid-template-columns: minmax(200px, .8fr) minmax(240px, 1fr); overflow-y: auto; overscroll-behavior: contain; }.trace-conversations, .trace-responses { min-height: 360px; }.trace-detail { min-height: 520px; grid-column: 1 / -1; overflow: visible; border-top: 1px solid #e8edf3; }.trace-conversations { border-bottom: 0; } }
@media (max-width: 760px) { .trace-page__header, .trace-summary { align-items: start; flex-direction: column; }.trace-workbench { display: block; overflow-y: auto; overscroll-behavior: contain; }.trace-conversations, .trace-responses { min-height: auto; border-right: 0; border-bottom: 1px solid #e8edf3; }.trace-conversation-list, .trace-response-list { max-height: 240px; flex: none; }.trace-detail { min-height: auto; overflow: visible; padding: 18px; }.trace-flow { grid-template-columns: 1fr; gap: 12px; }.trace-flow__arrow { display: none; }.trace-detail__grid { grid-template-columns: 1fr; }.trace-source__main { grid-template-columns: 24px minmax(0, 1fr) 16px; }.trace-source__scores { display: none; }.trace-source__content { margin-left: 0; }.trace-summary__meta { align-items: start; }.trace-search { width: 130px; } }
</style>
