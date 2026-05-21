<script setup lang="ts">
import { Archive, ChevronLeft, Grid2x2, Home, Menu, PanelRightOpen, Paperclip, Plus, Send, Settings2, Sparkles, Square } from 'lucide-vue-next'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ChatMessageBubble from '@/components/app/ChatMessageBubble.vue'
import TraceDetailDrawer from '@/components/app/TraceDetailDrawer.vue'
import { cn } from '@/utils/cn'
import { useWorkspaceStore } from '@/stores/workspace'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()

const draft = ref('')
const composerValue = ref('')
const suggestedQuestions = [
  '现在时间',
  '帮我总结这个知识库里的差旅报销制度',
  '根据文档回答住宿和交通报销规则',
  '列出本周常见用户问题'
]

const activeSession = computed(() => workspaceStore.activeSession)
const activeMessages = computed(() => workspaceStore.activeMessages)
const isDesktopDetail = computed(() => window.innerWidth >= 1280)
const lastAssistantTraceId = computed(
  () => [...activeMessages.value].reverse().find((item) => item.role === 'assistant')?.traceId
)
const workspaceNavItems = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'apps', label: '精选应用', icon: Sparkles },
  { key: 'team', label: '团队应用', icon: Grid2x2 }
] as const

watch(
  draft,
  (nextValue) => {
    composerValue.value = nextValue
  },
  { immediate: true }
)

async function handleSessionSelect(sessionId: string) {
  await workspaceStore.selectSession(sessionId)
  await router.push(`/workspace/${sessionId}`)
  if (workspaceStore.sidebarOpen) {
    workspaceStore.toggleSidebar()
  }
}

async function handleCreateConversation() {
  const session = await workspaceStore.createNewSession()
  await router.push(`/workspace/${session.id}`)
  workspaceStore.selectedTrace = null
  workspaceStore.detailOpen = false
  if (workspaceStore.sidebarOpen) {
    workspaceStore.toggleSidebar()
  }
}

async function handleSend(message: string) {
  await workspaceStore.sendMessage(message)
}

function handleComposerSubmit() {
  if (!composerValue.value.trim()) {
    return
  }
  const message = composerValue.value
  draft.value = ''
  composerValue.value = ''
  void handleSend(message)
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleComposerSubmit()
  }
}

async function openDetail(traceId?: string) {
  await workspaceStore.openTrace(traceId, !isDesktopDetail.value)
}

watch(
  () => route.params.sessionId,
  async (sessionId) => {
    if (typeof sessionId === 'string' && sessionId) {
      await workspaceStore.selectSession(sessionId)
    }
  }
)

onMounted(async () => {
  const sessionId = typeof route.params.sessionId === 'string' ? route.params.sessionId : undefined
  await workspaceStore.bootstrap(sessionId)
})
</script>

<template>
  <main class="h-screen bg-white">
    <div class="grid h-screen grid-cols-1 xl:grid-cols-[272px_366px_minmax(0,1fr)]">
      <aside
        class="hidden h-screen w-[272px] shrink-0 flex-col border-r border-r-[#e7ebf3] bg-[#f7f7f9] px-5 pb-4 pt-6 xl:flex"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-[12px] bg-white text-[#4e79ff] shadow-sm">
              <span class="text-base font-semibold">F</span>
            </div>
            <p class="text-[17px] font-semibold text-[#111827]">FastGPT</p>
          </div>
          <button
            type="button"
            class="flex size-9 items-center justify-center rounded-[10px] text-[#64748b] transition hover:bg-white"
            aria-label="收起导航"
          >
            <ChevronLeft class="size-5" />
          </button>
        </div>

        <nav class="mt-8 flex flex-col gap-2">
          <button
            v-for="item in workspaceNavItems"
            :key="item.key"
            type="button"
            :class="
              cn(
                'flex h-12 items-center gap-3 rounded-[10px] px-4 text-left text-[15px] font-medium transition-colors',
                item.key === 'home'
                  ? 'bg-[#dfe8ff] text-[#3366ff]'
                  : 'text-[#64748b] hover:bg-white hover:text-[#334155]'
              )
            "
          >
            <component :is="item.icon" class="size-5 shrink-0" />
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="mt-6 border-t border-[#e7ebf3] pt-5">
          <p class="text-[13px] font-medium text-[#334155]">最近使用</p>
        </div>

        <div class="flex-1" />

        <button
          type="button"
          class="flex h-[52px] w-full items-center gap-3 rounded-[12px] border border-transparent px-3 text-left transition-colors hover:bg-white"
        >
          <div class="flex size-9 items-center justify-center rounded-[12px] bg-white text-[#4e79ff] shadow-sm">
            <span class="text-sm font-semibold">F</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[14px] font-medium text-[#334155]">wechat-o5Ljw...</p>
          </div>
          <Settings2 class="size-4 shrink-0 text-[#94a3b8]" />
        </button>
      </aside>

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
            <template v-else-if="workspaceStore.sessions.length">
              <button
                v-for="session in workspaceStore.sessions"
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
                  <Sparkles class="size-[15px]" />
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
                      {{ session.updatedAt.split(' ')[1] || session.updatedAt }}
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
          <p class="text-center text-[13px] text-[#94a3b8]">已加载全部</p>
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
            <h1 class="truncate text-[16px] font-medium text-[#1f3b70]">{{ activeSession?.title || '新会话' }}</h1>
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

        <div class="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-6 xl:px-10">
          <div class="mx-auto flex min-h-full max-w-[1120px] flex-col">
            <template v-if="workspaceStore.loading">
              <div class="space-y-4 pt-2">
                <div
                  v-for="item in 4"
                  :key="item"
                  class="h-24 rounded-[16px] border bg-white"
                />
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

            <template v-else-if="activeMessages.length">
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

            <div v-else class="flex min-h-[calc(100vh-280px)] flex-col justify-center py-10">
              <p class="text-lg font-semibold text-slate-900">欢迎进入工作台</p>
              <p class="mt-2 max-w-xl text-sm leading-7 text-slate-500">
                当前会话为空。你可以直接提问，也可以用下面的建议问题快速开始。
              </p>
              <div class="mt-6 flex flex-wrap gap-2">
                <button
                  v-for="question in suggestedQuestions"
                  :key="question"
                  type="button"
                  class="rounded-full border border-[#d9e1ee] bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  @click="draft = question"
                >
                  {{ question }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-t-[#e7ebf3] bg-white px-6 pb-5 pt-4 xl:px-10">
          <div v-if="activeMessages.length" class="mx-auto mb-3 flex max-w-[1120px] flex-wrap gap-2">
            <button
              v-for="question in suggestedQuestions"
              :key="question"
              type="button"
              class="rounded-full border border-[#d9e1ee] bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              @click="draft = question"
            >
              {{ question }}
            </button>
          </div>
          <div class="bg-white">
            <div
              class="mx-auto max-w-[960px] rounded-[24px] border border-[#d9e1ee] bg-white px-7 pb-4 pt-5 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
            >
              <textarea
                v-model="composerValue"
                :disabled="workspaceStore.isStreaming"
                placeholder="输入问题，支持知识库问答、时间与天气工具调用"
                class="min-h-[72px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-7 text-slate-900 outline-none"
                @keydown="handleComposerKeydown"
              />
              <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div
                  class="inline-flex h-11 items-center gap-2 rounded-full border border-[#d9e1ee] bg-slate-50 px-4 text-[15px] text-slate-700"
                >
                  <span class="size-2 rounded-full bg-gradient-to-r from-[#7c4dff] to-[#4dabff]" />
                  <span>{{ activeSession?.model || 'doubao-seed-2-0-lite-260215' }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="flex size-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
                    aria-label="附件"
                    @click="draft = ''; composerValue = ''"
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
        </div>
      </section>
    </div>

    <DialogRoot :open="workspaceStore.sidebarOpen" @update:open="workspaceStore.sidebarOpen = $event">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/28 xl:hidden" />
        <DialogContent
          class="fixed inset-y-0 left-0 z-50 w-[340px] max-w-[340px] border-r border-r-[#e7ebf3] bg-white p-0 shadow-xl outline-none xl:hidden"
        >
          <div class="border-b border-b-[#e7ebf3] px-4 py-4 text-left">
            <DialogTitle class="text-base font-semibold text-slate-900">会话列表</DialogTitle>
          </div>
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
                <template v-else-if="workspaceStore.sessions.length">
                  <button
                    v-for="session in workspaceStore.sessions"
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
                      <Sparkles class="size-[15px]" />
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
                          {{ session.updatedAt.split(' ')[1] || session.updatedAt }}
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
              <p class="text-center text-[13px] text-[#94a3b8]">已加载全部</p>
            </div>
          </aside>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <TraceDetailDrawer
      :open="workspaceStore.detailOpen"
      :trace="workspaceStore.selectedTrace"
      :desktop="isDesktopDetail"
      @update:open="workspaceStore.detailOpen = $event"
    />
  </main>
</template>
