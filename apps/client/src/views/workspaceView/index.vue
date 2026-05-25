<script setup lang="ts">
import {
  Archive,
  Bot,
  Brain,
  Check,
  Lightbulb,
  LoaderCircle,
  Menu,
  PanelRightOpen,
  Paperclip,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Square,
  UserRound,
  Workflow
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ChatMessageBubble from '@/components/app/ChatMessageBubble.vue'
import TraceDetailDrawer from '@/components/app/TraceDetailDrawer.vue'
import { useAutoScroll } from '@/composables/useAutoScroll'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspace'
import { cn } from '@/utils/cn'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
const authStore = useAuthStore()

const draft = ref('')
const composerValue = ref('')
const deepThinking = ref(true)
const chatAutoScroll = useAutoScroll(32)

const sceneCards = [
  {
    key: 'system',
    title: '系统交互',
    subtitle: '关于助手',
    description: '适合查询制度说明、系统介绍和知识库使用方式。',
    icon: Workflow
  },
  {
    key: 'data',
    title: '实时数据',
    subtitle: '销售汇总数据统计',
    description: '适合聚合报表、业务指标和即时结果分析。',
    icon: Check
  },
  {
    key: 'business',
    title: '业务系统',
    subtitle: '数据安全',
    description: '适合权限说明、流程节点和后台配置指导。',
    icon: Lightbulb
  }
] as const

const activeSession = computed(() => workspaceStore.activeSession)
const activeMessages = computed(() => workspaceStore.activeMessages)
const sortedSessions = computed(() =>
  [...workspaceStore.sessions].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  )
)
const hasMessages = computed(() => activeMessages.value.length > 0)
const isDesktopDetail = computed(() => window.innerWidth >= 1280)
const currentUser = computed(() => authStore.user)
const currentModelLabel = computed(() => 'AI')
const lastAssistantTraceId = computed(
  () => [...activeMessages.value].reverse().find((item) => item.role === 'assistant')?.traceId
)

const formatSessionTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const sameMonth = date.getMonth() === now.getMonth()
  const sameDay = date.getDate() === now.getDate()

  if (sameYear && sameMonth && sameDay) {
    return '今天'
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) {
    return '昨天'
  }

  return date.toLocaleDateString('zh-CN', sameYear
    ? {
        month: '2-digit',
        day: '2-digit'
      }
    : {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
}

const isSessionStreaming = (sessionId: string) => Boolean(workspaceStore.streamingStateBySession[sessionId]?.messageId)

watch(
  draft,
  (nextValue) => {
    composerValue.value = nextValue
  },
  { immediate: true }
)

watch(
  activeMessages,
  async () => {
    await chatAutoScroll.scrollToBottom()
  },
  { deep: true }
)

const handleSessionSelect = async (sessionId: string) => {
  await workspaceStore.selectSession(sessionId)
  draft.value = ''
  composerValue.value = ''
  await router.push(`/workspace/${sessionId}`)
  await chatAutoScroll.scrollToBottom(true)
  if (workspaceStore.sidebarOpen) {
    workspaceStore.toggleSidebar()
  }
}

const handleCreateConversation = async () => {
  const session = await workspaceStore.createNewSession()
  draft.value = ''
  composerValue.value = ''
  await router.push(`/workspace/${session.id}`)
  workspaceStore.selectedTrace = null
  workspaceStore.detailOpen = false
  await chatAutoScroll.scrollToBottom(true)
  if (workspaceStore.sidebarOpen) {
    workspaceStore.toggleSidebar()
  }
}

const handleSend = async (message: string) => {
  await workspaceStore.sendMessage(message)
}

const handleComposerSubmit = () => {
  if (!composerValue.value.trim()) {
    return
  }
  const message = composerValue.value
  draft.value = ''
  composerValue.value = ''
  void handleSend(message)
}

const handleComposerKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleComposerSubmit()
  }
}

const openDetail = async (traceId?: string) => {
  await workspaceStore.openTrace(traceId, !isDesktopDetail.value)
}

const openAdmin = () => {
  void router.push('/admin/knowledge')
}

watch(
  () => route.params.sessionId,
  async (sessionId) => {
    if (typeof sessionId === 'string' && sessionId) {
      await workspaceStore.selectSession(sessionId)
      await chatAutoScroll.scrollToBottom(true)
    }
  }
)

onMounted(async () => {
  const sessionId = typeof route.params.sessionId === 'string' ? route.params.sessionId : undefined
  await workspaceStore.bootstrap(sessionId)
  await chatAutoScroll.scrollToBottom(true)
})
</script>

<template>
  <main class="h-screen bg-white">
    <div class="grid h-screen grid-cols-1 xl:grid-cols-[366px_minmax(0,1fr)]">
      <aside class="hidden h-screen w-full shrink-0 flex-col border-r border-r-[#e7ebf3] bg-white xl:flex">
        <div class="px-7 pt-12">
          <p class="truncate text-[21px] font-semibold text-[#111827]">聊天</p>
        </div>

        <div class="flex items-center gap-3 px-7 pt-8">
          <button
            type="button"
            class="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border bg-white text-[15px] font-medium text-[#3366ff] shadow-sm transition hover:bg-slate-50"
            @click="handleCreateConversation"
          >
            <Plus class="size-4" />
            <span>新对话</span>
          </button>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full border bg-white text-[#64748b] shadow-sm transition hover:bg-slate-50"
            aria-label="归档会话"
          >
            <Archive class="size-4" />
          </button>
        </div>

        <div class="mt-7 min-h-0 flex-1 overflow-y-auto px-6 pb-3">
          <div class="space-y-2.5 pr-2">
            <template v-if="workspaceStore.loading">
              <div
                v-for="item in 6"
                :key="item"
                class="h-[54px] rounded-[12px] bg-slate-100"
              />
            </template>
            <template v-else-if="sortedSessions.length">
              <button
                v-for="session in sortedSessions"
                :key="session.id"
                type="button"
                :aria-label="session.title"
                :class="
                  cn(
                    'flex h-[54px] w-full items-center gap-3 rounded-[12px] border border-transparent px-4 text-left transition-colors',
                    session.id === workspaceStore.activeSessionId
                      ? 'border-transparent bg-[#eef3ff] text-[#3366ff]'
                      : 'text-slate-700 hover:bg-[#f6f7fb]'
                  )
                "
                @click="handleSessionSelect(session.id)"
              >
                <div
                  :class="
                    cn(
                      'flex size-5 shrink-0 items-center justify-center text-[#64748b]',
                      session.id === workspaceStore.activeSessionId && 'text-[#3366ff]'
                    )
                  "
                >
                  <LoaderCircle
                    v-if="isSessionStreaming(session.id)"
                    class="size-[15px] animate-spin"
                  />
                  <Sparkles v-else class="size-[15px]" />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3">
                    <p
                      class="truncate text-[15px] font-medium"
                      :class="session.id === workspaceStore.activeSessionId ? 'text-[#3366ff]' : 'text-[#1f2937]'"
                    >
                      {{ session.title }}
                    </p>
                    <span class="shrink-0 text-[13px] text-[#64748b]">
                      {{ formatSessionTime(session.updatedAt) }}
                    </span>
                  </div>
                </div>
              </button>
            </template>
            <div
              v-else
              class="rounded-[12px] border border-dashed p-3 text-sm text-slate-500"
            >
              没有匹配的会话。
            </div>
          </div>
        </div>

        <div class="px-6 pb-8 pt-1">
          <button
            type="button"
            class="flex h-[52px] w-full items-center gap-3 rounded-[12px] border border-transparent px-3 text-left transition-colors hover:bg-[#f8fafc]"
            @click="openAdmin"
          >
            <div class="flex size-9 items-center justify-center rounded-[12px] bg-[#f8fafc] text-[#4e79ff] shadow-sm">
              <UserRound class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[14px] font-medium text-[#334155]">{{ currentUser.name }}</p>
            </div>
            <Settings2 class="size-4 shrink-0 text-[#94a3b8]" />
          </button>
        </div>
      </aside>

      <section class="flex min-w-0 flex-col overflow-hidden bg-white">
        <header
          class="grid min-h-[62px] grid-cols-[48px_minmax(0,1fr)_48px] items-center border-b border-b-[#e7ebf3] bg-white px-4 xl:px-8"
        >
          <div class="flex items-center">
            <button
              type="button"
              aria-label="打开会话列表"
              class="flex size-9 items-center justify-center rounded-[10px] transition hover:bg-slate-100 xl:hidden"
              @click="workspaceStore.toggleSidebar"
            >
              <Menu class="size-4" />
            </button>
          </div>

          <div class="min-w-0 text-center">
            <h1 class="truncate text-[16px] font-medium text-[#1f3b70]">{{ activeSession?.title || '新对话' }}</h1>
          </div>

          <div class="flex justify-end">
            <button
              v-if="lastAssistantTraceId"
              type="button"
              class="flex size-9 items-center justify-center rounded-[10px] text-[#64748b] transition hover:bg-slate-100 xl:hidden"
              @click="openDetail(lastAssistantTraceId || undefined)"
            >
              <PanelRightOpen class="size-4" />
            </button>
          </div>
        </header>

        <div
          :ref="chatAutoScroll.scrollRef"
          class="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-10"
          @scroll="chatAutoScroll.updateShouldStickToBottom"
        >
          <div class="mx-auto flex min-h-full max-w-[1120px] flex-col">
            <template v-if="workspaceStore.loading">
              <div class="space-y-6 pt-2">
                <div
                  v-for="item in 4"
                  :key="item"
                  class="flex items-start gap-4"
                >
                  <el-skeleton animated class="flex-1">
                    <template #template>
                      <div class="flex items-start gap-4">
                        <el-skeleton-item
                          variant="image"
                          class="mt-1 !h-10 !w-10 !shrink-0 overflow-hidden rounded-[12px]"
                        />
                        <div class="min-w-0 flex-1">
                          <el-skeleton-item variant="text" class="mb-3 !h-4 !w-24" />
                          <div class="rounded-[24px] bg-[#f7f9fc] px-6 py-5">
                            <div class="space-y-3">
                              <el-skeleton-item variant="text" class="!h-4 !w-full" />
                              <el-skeleton-item variant="text" class="!h-4 !w-[92%]" />
                              <el-skeleton-item variant="text" class="!h-4 !w-[68%]" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </el-skeleton>
                </div>
              </div>
            </template>

            <template v-else-if="workspaceStore.error">
              <div class="rounded-[12px] border border-red-200 bg-red-50 p-5">
                <p class="text-sm font-medium text-red-700">加载工作台失败</p>
                <p class="mt-2 text-sm text-red-600">{{ workspaceStore.error }}</p>
                <button
                  type="button"
                  class="mt-4 rounded-[10px] bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  @click="workspaceStore.bootstrap()"
                >
                  重试
                </button>
              </div>
            </template>

            <template v-else-if="hasMessages">
              <div class="space-y-10 pb-10 pt-2">
                <ChatMessageBubble
                  v-for="message in activeMessages"
                  :key="message.id"
                  :message="message"
                  :show-meta="message.role === 'assistant'"
                  @detail="openDetail"
                  @regenerate="workspaceStore.regenerateLastAnswer"
                />
              </div>
            </template>

            <template v-else>
              <div class="flex min-h-[calc(100vh-280px)] flex-col items-center justify-center py-10 text-center">
                <div
                  class="inline-flex items-center gap-2 rounded-full border border-[#dde8ff] bg-white px-4 py-2 text-[14px] font-medium text-[#3366ff] shadow-sm"
                >
                  <Bot class="size-4" />
                  <span>RAG 智能问答</span>
                </div>

                <h2 class="mt-8 text-[42px] font-semibold leading-[1.05] tracking-[-0.04em] text-[#182235] md:text-[64px]">
                  把问题变成<span class="text-[#3d6cff]">清晰答案</span>
                </h2>
                <p class="mt-5 max-w-[820px] text-[18px] leading-8 text-[#5f6e85]">
                  结构化提问、知识检索与深度思考，一次对话给出可执行方案
                </p>

                <div class="mt-12 w-full max-w-[980px]">
                  <div
                    class="rounded-[32px] border border-[#e6edf9] bg-white px-7 pb-6 pt-7 shadow-[0_28px_80px_rgba(109,145,201,0.18)]"
                  >
                    <textarea
                      v-model="composerValue"
                      :disabled="workspaceStore.isStreaming"
                      :placeholder="deepThinking ? '输入需要深度分析的问题...' : '输入你的问题...'"
                      class="min-h-[138px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[16px] leading-8 text-slate-900 outline-none placeholder:text-[#b0bacc]"
                      @keydown="handleComposerKeydown"
                    />

                    <div class="mt-5 flex items-center justify-between gap-4">
                      <button
                        type="button"
                        class="inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition"
                        :class="
                          deepThinking
                            ? 'border-[#bad0ff] bg-[#eaf2ff] text-[#2f63ff]'
                            : 'border-[#e2e8f3] bg-[#f7f9fc] text-[#6b7a90]'
                        "
                        @click="deepThinking = !deepThinking"
                      >
                        <Brain class="size-4" />
                        <span>深度思考</span>
                        <span
                          class="size-2 rounded-full"
                          :class="deepThinking ? 'bg-[#6b8fff]' : 'bg-[#c4ccda]'"
                        />
                      </button>

                      <button
                        v-if="workspaceStore.isStreaming"
                        type="button"
                        class="flex size-12 items-center justify-center rounded-full bg-slate-900 text-white"
                        @click="workspaceStore.stopStreaming"
                      >
                        <Square class="size-4" />
                      </button>
                      <button
                        v-else
                        type="button"
                        class="flex size-12 items-center justify-center rounded-full bg-[#edf1f7] text-[#9aa6ba] transition enabled:bg-[#4f7cff] enabled:text-white hover:enabled:bg-[#3f6ef0] disabled:cursor-not-allowed"
                        :disabled="!composerValue.trim()"
                        @click="handleComposerSubmit"
                      >
                        <Send class="size-4" />
                      </button>
                    </div>
                  </div>

                  <div class="mt-4 flex flex-col items-center gap-4">
                    <p class="w-full text-left text-[15px] text-[#3366ff]">
                      深度思考模式已开启，AI 将进行更深入的分析推理
                    </p>
                    <p class="text-[14px] text-[#7b8aa2]">
                      <span class="rounded bg-white px-2 py-1 text-[#6b7280]">Enter</span>
                      发送 ・
                      <span class="rounded bg-white px-2 py-1 text-[#6b7280]">Shift + Enter</span>
                      换行
                    </p>
                  </div>
                </div>

                <div class="mt-16 grid w-full max-w-[980px] gap-5 md:grid-cols-3">
                  <button
                    v-for="card in sceneCards"
                    :key="card.key"
                    type="button"
                    class="rounded-[26px] border border-[#e9eef6] bg-white p-6 text-left shadow-[0_16px_40px_rgba(148,163,184,0.12)] transition hover:-translate-y-0.5 hover:border-[#dbe6ff]"
                    @click="draft = `${card.title}：`"
                  >
                    <div class="flex items-start gap-4">
                      <div class="flex size-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#3d6cff]">
                        <component :is="card.icon" class="size-5" />
                      </div>
                      <div class="min-w-0">
                        <p class="text-[18px] font-semibold text-[#111827]">{{ card.title }}</p>
                        <p class="mt-1 text-[15px] text-[#5f6e85]">{{ card.subtitle }}</p>
                      </div>
                    </div>
                    <p class="mt-6 text-[14px] leading-7 text-[#8a96a8]">{{ card.description }}</p>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <footer
          v-if="hasMessages"
          class="border-t border-t-[#e7ebf3] bg-white px-6 pb-5 pt-4 xl:px-10"
        >
          <div class="bg-white">
            <div
              class="mx-auto max-w-[960px] rounded-[24px] border border-[#d9e1ee] bg-white px-7 pb-4 pt-5 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
            >
              <textarea
                v-model="composerValue"
                :disabled="workspaceStore.isStreaming"
                placeholder="输入你的问题..."
                class="min-h-[96px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-7 text-slate-900 outline-none placeholder:text-[#b0bacc]"
                @keydown="handleComposerKeydown"
              />
              <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="inline-flex h-10 items-center gap-2 rounded-full border border-[#e2e8f3] bg-[#f7f9fc] px-4 text-[15px] font-medium text-[#6b7a90] transition hover:bg-white"
                    :class="deepThinking && 'border-[#bad0ff] bg-[#eaf2ff] text-[#2f63ff]'"
                    @click="deepThinking = !deepThinking"
                  >
                    <Brain class="size-4" />
                    <span>深度思考</span>
                  </button>
                  <div
                    class="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9e1ee] bg-slate-50 px-4 text-[14px] text-slate-700"
                  >
                    <span class="size-2 rounded-full bg-gradient-to-r from-[#7c4dff] to-[#4dabff]" />
                    <span>{{ currentModelLabel }}</span>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="flex size-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
                    aria-label="附件"
                  >
                    <Paperclip class="size-4" />
                  </button>
                  <div class="h-5 w-px bg-[#e7ebf3]" />
                  <button
                    v-if="workspaceStore.isStreaming"
                    type="button"
                    class="flex size-11 items-center justify-center rounded-full bg-slate-900 text-white"
                    @click="workspaceStore.stopStreaming"
                  >
                    <Square class="size-4" />
                  </button>
                  <button
                    v-else
                    type="button"
                    class="flex size-11 items-center justify-center rounded-full bg-[#4f7cff] text-white transition hover:bg-[#3f6ef0] disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="!composerValue.trim()"
                    @click="handleComposerSubmit"
                  >
                    <Send class="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </section>
    </div>

    <el-drawer
      :model-value="workspaceStore.sidebarOpen"
      @update:model-value="workspaceStore.sidebarOpen = $event"
      :size="340"
      direction="ltr"
      :with-header="false"
      class="xl:hidden"
    >
      <aside class="flex h-full w-full shrink-0 flex-col border-r border-r-[#e7ebf3] bg-white">
        <div class="px-7 pt-8">
          <p class="truncate text-[21px] font-semibold text-[#111827]">聊天</p>
        </div>

        <div class="flex items-center gap-3 px-7 pt-8">
          <button
            type="button"
            class="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border bg-white text-[15px] font-medium text-[#3366ff] shadow-sm transition hover:bg-slate-50"
            @click="handleCreateConversation"
          >
            <Plus class="size-4" />
            <span>新对话</span>
          </button>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full border bg-white text-[#64748b] shadow-sm transition hover:bg-slate-50"
            aria-label="归档会话"
          >
            <Archive class="size-4" />
          </button>
        </div>

        <div class="mt-7 min-h-0 flex-1 overflow-y-auto px-6 pb-3">
          <div class="space-y-2.5 pr-2">
            <template v-if="workspaceStore.loading">
              <div
                v-for="item in 6"
                :key="item"
                class="h-[54px] rounded-[12px] bg-slate-100"
              />
            </template>
            <template v-else-if="sortedSessions.length">
              <button
                v-for="session in sortedSessions"
                :key="session.id"
                type="button"
                :aria-label="session.title"
                :class="
                  cn(
                    'flex h-[54px] w-full items-center gap-3 rounded-[12px] border border-transparent px-4 text-left transition-colors',
                    session.id === workspaceStore.activeSessionId
                      ? 'border-transparent bg-[#eef3ff] text-[#3366ff]'
                      : 'text-slate-700 hover:bg-[#f6f7fb]'
                  )
                "
                @click="handleSessionSelect(session.id)"
              >
                <div
                  :class="
                    cn(
                      'flex size-5 shrink-0 items-center justify-center text-[#64748b]',
                      session.id === workspaceStore.activeSessionId && 'text-[#3366ff]'
                    )
                  "
                >
                  <LoaderCircle
                    v-if="isSessionStreaming(session.id)"
                    class="size-[15px] animate-spin"
                  />
                  <Sparkles v-else class="size-[15px]" />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3">
                    <p
                      class="truncate text-[15px] font-medium"
                      :class="session.id === workspaceStore.activeSessionId ? 'text-[#3366ff]' : 'text-[#1f2937]'"
                    >
                      {{ session.title }}
                    </p>
                    <span class="shrink-0 text-[13px] text-[#64748b]">
                      {{ formatSessionTime(session.updatedAt) }}
                    </span>
                  </div>
                </div>
              </button>
            </template>
            <div
              v-else
              class="rounded-[12px] border border-dashed p-3 text-sm text-slate-500"
            >
              没有匹配的会话。
            </div>
          </div>
        </div>
      </aside>
    </el-drawer>

    <TraceDetailDrawer
      :open="workspaceStore.detailOpen"
      :trace="workspaceStore.selectedTrace"
      :desktop="isDesktopDetail"
      @update:open="workspaceStore.detailOpen = $event"
    />
  </main>
</template>
