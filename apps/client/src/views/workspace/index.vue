<script setup lang="ts">
import { Menu, Plus, Settings2, UserRound } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAutoScroll } from '@/composables/useAutoScroll'
import { useAuthStore, useWorkspaceStore } from '@/stores'
import type { PromptCapabilities } from '@/types'
import ChatMessageBubble from './components/ChatMessageBubble.vue'
import ConversationList from './components/ConversationList.vue'
import WorkspacePromptBox from './components/WorkspacePromptBox.vue'
import WorkspaceSidebarBrand from './components/WorkspaceSidebarBrand.vue'

const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
const authStore = useAuthStore()

const composerValue = ref('')
const chatAutoScroll = useAutoScroll(32)

const activeSession = computed(() => workspaceStore.activeSession)
const activeMessages = computed(() => workspaceStore.activeMessages)
const sortedSessions = computed(() =>
  [...workspaceStore.sessions].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  )
)
const hasMessages = computed(() => activeMessages.value.length > 0)
const currentUser = computed(() => authStore.user ?? { name: '访客' })

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
          day: 'numeric'
        }
      : {
          year: 'numeric',
          month: '2-digit',
          day: 'numeric'
        }
  )
}

const isSessionStreaming = (sessionId: string) =>
  Boolean(workspaceStore.streamingStateBySession[sessionId]?.messageId)

watch(
  activeMessages,
  async () => {
    await chatAutoScroll.scrollToBottom()
  },
  { deep: true }
)

const handleSessionSelect = async (sessionId: string) => {
  await workspaceStore.selectSession(sessionId)
  composerValue.value = ''
  await router.push(`/workspace/${sessionId}`)
  await chatAutoScroll.scrollToBottom(true)
  if (workspaceStore.sidebarOpen) {
    workspaceStore.toggleSidebar()
  }
}

const handleCreateConversation = async () => {
  const session = await workspaceStore.createNewSession()
  composerValue.value = ''
  await router.push(`/workspace/${session.id}`)
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

  composerValue.value = ''
  void handleSend(nextMessage, payload.capabilities)
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
  <main class="h-screen bg-white text-[#111827]">
    <div class="grid h-screen grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside class="hidden h-screen w-full shrink-0 flex-col border-r border-r-[#f3f4f6] bg-white xl:flex">
        <div class="px-6 pt-8">
          <WorkspaceSidebarBrand />
        </div>

        <div class="px-6 pt-6">
          <button
            type="button"
            class="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#e5e7eb] bg-white text-[14px] font-medium text-[#111827] transition hover:border-[#d1d5db] hover:bg-[#fafafa]"
            @click="handleCreateConversation"
          >
            <Plus class="size-4" />
            <span>新建对话</span>
          </button>
        </div>

        <div class="mt-6 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <ConversationList
            :sessions="sortedSessions"
            :active-session-id="workspaceStore.activeSessionId"
            :loading="workspaceStore.loading"
            :get-session-time-label="formatSessionTime"
            :is-session-streaming="isSessionStreaming"
            @select="handleSessionSelect"
          />
        </div>

        <div class="border-t border-t-[#f3f4f6] px-4 py-4">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-[16px] border border-[#e5e7eb] bg-white px-3 py-3 text-left transition hover:border-[#d1d5db] hover:bg-[#fafafa]"
            @click="openAdmin"
          >
            <div class="flex size-9 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280]">
              <UserRound class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[14px] font-medium text-[#111827]">{{ currentUser.name }}</p>
              <p class="truncate text-[12px] text-[#9ca3af]">知识库管理</p>
            </div>
            <Settings2 class="size-4 shrink-0 text-[#9ca3af]" />
          </button>
        </div>
      </aside>

      <section class="flex min-w-0 flex-col overflow-hidden bg-white">
        <header class="border-b border-b-[#f3f4f6] bg-white px-4 py-4 xl:px-8">
          <div class="flex items-center gap-3">
            <button
              type="button"
              aria-label="打开会话列表"
              class="flex size-9 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:border-[#d1d5db] hover:bg-[#fafafa] xl:hidden"
              @click="workspaceStore.toggleSidebar"
            >
              <Menu class="size-4" />
            </button>

            <div class="min-w-0 flex-1">
              <p class="truncate text-[14px] font-medium text-[#111827]">
                {{ activeSession?.title || '新对话' }}
              </p>
              <p class="truncate text-[12px] text-[#9ca3af]">
                {{ hasMessages ? `共 ${activeMessages.length} 条消息` : '对话演示界面' }}
              </p>
            </div>
          </div>
        </header>

        <div
          :ref="chatAutoScroll.scrollRef"
          class="min-h-0 flex-1 overflow-y-auto bg-white"
          @scroll="chatAutoScroll.updateShouldStickToBottom"
        >
          <div class="mx-auto w-full max-w-[920px] px-6 py-8">
            <template v-if="workspaceStore.loading">
              <div class="space-y-8">
                <div v-for="item in 4" :key="item" class="space-y-3">
                  <div class="h-5 w-5 rounded-full bg-[#f3f4f6]" />
                  <div class="space-y-2">
                    <div class="h-4 w-full rounded bg-[#f3f4f6]" />
                    <div class="h-4 w-[88%] rounded bg-[#f3f4f6]" />
                    <div class="h-4 w-[62%] rounded bg-[#f3f4f6]" />
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="workspaceStore.error">
              <div class="rounded-xl border border-red-200 bg-red-50 p-5">
                <p class="text-sm font-medium text-red-700">工作台加载失败</p>
                <p class="mt-2 text-sm text-red-600">{{ workspaceStore.error }}</p>
                <button
                  type="button"
                  class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                  @click="workspaceStore.bootstrap()"
                >
                  重试
                </button>
              </div>
            </template>

            <template v-else-if="hasMessages">
              <div class="space-y-8">
                <ChatMessageBubble
                  v-for="message in activeMessages"
                  :key="message.id"
                  :message="message"
                  :show-meta="message.role === 'assistant'"
                  :regenerating="workspaceStore.regenerating"
                  @regenerate="workspaceStore.regenerateLastAnswer"
                />
              </div>
            </template>

            <template v-else>
              <div class="space-y-3 text-[14px] leading-[1.6] text-[#111827]">
                <p>你好，我是工作台助手。你可以直接输入问题开始演示。</p>
                <p>
                  这里保留两种主线：开启深度思考时先展示思考过程，再输出回答；关闭后直接返回结果。
                </p>
                <pre class="overflow-x-auto rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-[13px] leading-6 text-[#374151]"><code>// 示例
const greet = (name: string): string =&gt; `你好，${name}`
console.log(greet('世界'))</code></pre>
              </div>
            </template>
          </div>
        </div>

        <footer class="border-t border-t-[#f3f4f6] bg-white">
          <div class="mx-auto max-w-[920px] px-6 py-4">
            <WorkspacePromptBox
              v-model="composerValue"
              :disabled="workspaceStore.isStreaming"
              :streaming="workspaceStore.isStreaming"
              :show-hint="!hasMessages"
              @submit="handleComposerSubmit"
              @stop="workspaceStore.stopStreaming"
            />
          </div>
        </footer>
      </section>
    </div>

    <el-drawer
      :model-value="workspaceStore.sidebarOpen"
      :size="320"
      direction="ltr"
      :with-header="false"
      class="workspace-mobile-drawer xl:hidden"
      @update:model-value="workspaceStore.sidebarOpen = $event"
    >
      <aside class="flex h-full w-full shrink-0 flex-col bg-white">
        <div class="px-6 pt-8">
          <WorkspaceSidebarBrand />
        </div>

        <div class="px-6 pt-6">
          <button
            type="button"
            class="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#e5e7eb] bg-white text-[14px] font-medium text-[#111827] transition hover:border-[#d1d5db] hover:bg-[#fafafa]"
            @click="handleCreateConversation"
          >
            <Plus class="size-4" />
            <span>新建对话</span>
          </button>
        </div>

        <div class="mt-6 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
  </main>
</template>

<style scoped>
.workspace-mobile-drawer :deep(.el-drawer) {
  background: #ffffff;
}

.workspace-mobile-drawer :deep(.el-drawer__body) {
  padding: 0;
}
</style>
