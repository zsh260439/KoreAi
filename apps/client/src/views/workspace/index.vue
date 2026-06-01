<script setup lang="ts">
import {
  Archive,
  Bot,
  Check,
  Lightbulb,
  Menu,
  PanelRightOpen,
  Plus,
  Settings2,
  UserRound,
  Workflow
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAutoScroll } from '@/composables/useAutoScroll'
import { useAuthStore, useWorkspaceStore } from '@/stores'
import type { PromptCapabilities } from '@/types'
import ChatMessageBubble from './components/ChatMessageBubble.vue'
import ConversationList from './components/ConversationList.vue'
import TraceDetailDrawer from './components/TraceDetailDrawer.vue'
import WorkspacePromptBox from './components/WorkspacePromptBox.vue'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
const authStore = useAuthStore()

const draft = ref('')
const composerValue = ref('')
const chatAutoScroll = useAutoScroll(32)

const sceneCards = [
  {
    key: 'system',
    title: '系统指引',
    subtitle: '规则说明与助手使用',
    description: '适合查看系统提示词、策略规则说明，以及新用户上手指引。',
    icon: Workflow
  },
  {
    key: 'data',
    title: '实时数据',
    subtitle: '指标与运营数据',
    description: '适合做报表解读、KPI 分析，以及业务动态的快速总结。',
    icon: Check
  },
  {
    key: 'business',
    title: '业务支持',
    subtitle: '权限与流程帮助',
    description: '适合查询角色权限、流程步骤，以及控制台操作支持。',
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
const currentUser = computed(() => authStore.user ?? { name: '访客' })
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

  return date.toLocaleDateString(
    'zh-CN',
    sameYear
      ? {
          month: '2-digit',
          day: '2-digit'
        }
      : {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }
  )
}

const isSessionStreaming = (sessionId: string) =>
  Boolean(workspaceStore.streamingStateBySession[sessionId]?.messageId)

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

const handleSend = async (message: string, capabilities: PromptCapabilities) => {
  await workspaceStore.sendMessage(message, capabilities)
}

const buildPromptMessage = (message: string, files: File[]) => {
  const normalized = message.trim()
  const fileLines = files.map((file) => `[附件: ${file.name}]`)
  return [normalized, ...fileLines].filter(Boolean).join('\n')
}

const handleComposerSubmit = (payload: {
  files: File[]
  message: string
  capabilities: PromptCapabilities
}) => {
  const nextMessage = buildPromptMessage(payload.message, payload.files)

  if (!nextMessage.trim()) {
    return
  }

  draft.value = ''
  composerValue.value = ''
  void handleSend(nextMessage, payload.capabilities)
}

const openDetail = async (traceId?: string) => {
  await workspaceStore.openTrace(traceId, true)
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
          <p class="truncate text-[21px] font-semibold text-[#111827]">会话</p>
        </div>

        <div class="flex items-center gap-3 px-7 pt-8">
          <button
            type="button"
            class="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border bg-white text-[15px] font-medium text-[#3366ff] shadow-sm transition hover:bg-slate-50"
            @click="handleCreateConversation"
          >
            <Plus class="size-4" />
            <span>新建对话</span>
          </button>
        </div>

        <div class="mt-7 min-h-0 flex-1 overflow-y-auto px-6 pb-3">
          <ConversationList
            :sessions="sortedSessions"
            :active-session-id="workspaceStore.activeSessionId"
            :loading="workspaceStore.loading"
            :get-session-time-label="formatSessionTime"
            :is-session-streaming="isSessionStreaming"
            @select="handleSessionSelect"
          />
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
            <h1 class="truncate text-[16px] font-medium text-[#1f3b70]">
              {{ activeSession?.title || '新对话' }}
            </h1>
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
                <div v-for="item in 4" :key="item" class="flex items-start gap-4">
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
                <p class="text-sm font-medium text-red-700">工作台加载失败</p>
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
                  :regenerating="workspaceStore.regenerating"
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
                  <span>RAG 工作台</span>
                </div>

                <h2 class="mt-8 text-[42px] font-semibold leading-[1.05] tracking-[-0.04em] text-[#182235] md:text-[64px]">
                  把复杂问题整理成 <span class="text-[#3d6cff]">清晰答案</span>
                </h2>
                <p class="mt-5 max-w-[820px] text-[18px] leading-8 text-[#5f6e85]">
                  在同一个会话里使用聚焦提问、快速搜索和更深层推理。
                </p>

                <div class="mt-12 w-full max-w-[760px]">
                  <WorkspacePromptBox
                    v-model="composerValue"
                    :disabled="workspaceStore.isStreaming"
                    :streaming="workspaceStore.isStreaming"
                    :show-hint="true"
                    @submit="handleComposerSubmit"
                    @stop="workspaceStore.stopStreaming"
                  />
                </div>

                <div class="mt-16 grid w-full max-w-[980px] gap-5 md:grid-cols-3">
                  <button
                    v-for="card in sceneCards"
                    :key="card.key"
                    type="button"
                    class="rounded-[26px] border border-[#e9eef6] bg-white p-6 text-left shadow-[0_16px_40px_rgba(148,163,184,0.12)] transition hover:-translate-y-0.5 hover:border-[#dbe6ff]"
                    @click="draft = `${card.title}: `"
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

        <footer v-if="hasMessages" class="border-t border-t-[#e7ebf3] bg-white px-6 pb-5 pt-4 xl:px-10">
          <div class="bg-white">
            <div class="mx-auto max-w-[760px]">
              <WorkspacePromptBox
                v-model="composerValue"
                :disabled="workspaceStore.isStreaming"
                :streaming="workspaceStore.isStreaming"
                @submit="handleComposerSubmit"
                @stop="workspaceStore.stopStreaming"
              />
            </div>
          </div>
        </footer>
      </section>
    </div>

    <el-drawer
      :model-value="workspaceStore.sidebarOpen"
      :size="340"
      direction="ltr"
      :with-header="false"
      class="xl:hidden"
      @update:model-value="workspaceStore.sidebarOpen = $event"
    >
      <aside class="flex h-full w-full shrink-0 flex-col border-r border-r-[#e7ebf3] bg-white">
        <div class="px-7 pt-8">
          <p class="truncate text-[21px] font-semibold text-[#111827]">会话</p>
        </div>

        <div class="flex items-center gap-3 px-7 pt-8">
          <button
            type="button"
            class="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border bg-white text-[15px] font-medium text-[#3366ff] shadow-sm transition hover:bg-slate-50"
            @click="handleCreateConversation"
          >
            <Plus class="size-4" />
            <span>新建对话</span>
          </button>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full border bg-white text-[#64748b] shadow-sm transition hover:bg-slate-50"
            aria-label="历史会话"
          >
            <Archive class="size-4" />
          </button>
        </div>

        <div class="mt-7 min-h-0 flex-1 overflow-y-auto px-6 pb-3">
          <ConversationList
            :sessions="sortedSessions"
            :active-session-id="workspaceStore.activeSessionId"
            :loading="workspaceStore.loading"
            :get-session-time-label="formatSessionTime"
            :is-session-streaming="isSessionStreaming"
            @select="handleSessionSelect"
          />
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
