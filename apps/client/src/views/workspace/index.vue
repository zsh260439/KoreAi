<script setup lang="ts">
import { Plus, Settings2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAutoScroll } from '@/composables/useAutoScroll'
import { useConversationList } from '@/composables/useConversationList'
import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
import { useWorkspaceChat } from '@/composables/useWorkspaceChat'
import type { PromptCapabilities } from '@/types/chat/models'
import ContentList from './components/content/ContentList.vue'
import WorkspacePromptBox from './components/input/WorkspacePromptBox.vue'
import MessageList from './components/sidebar/MessageList.vue'
import WorkspaceSidebarBrand from './components/sidebar/WorkspaceSidebarBrand.vue'

const route = useRoute()
const router = useRouter()
const conversationList = useConversationList()
const workspaceChat = useWorkspaceChat()
const { knowledgeBases, loadKnowledgeBases } = useKnowledgeBases()

const composerValue = ref('')
const selectedKnowledgeBaseId = ref('')
const chatAutoScroll = useAutoScroll(32)

const activeConversation = conversationList.activeConversation
const activeContentList = workspaceChat.activeContentList
const hasContent = computed(() => activeContentList.value.length > 0)
const activeConversationId = conversationList.activeConversationId
const conversationListLoading = conversationList.isLoading
const conversationListError = conversationList.error
const messagesLoading = workspaceChat.isLoadingMessages
const isStreaming = workspaceChat.isStreaming
const regenerating = workspaceChat.regenerating
// 格式化对话时间
const formatConversationTime = (value: string) => {
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
// 检查对话是否正在流式传输
const isConversationStreaming = (conversationId: string) =>
  workspaceChat.isConversationStreaming(conversationId)
//监听对话内容变化，滚动到最底部，选中activeConversation自动滚动到最底部
watch(
  activeContentList,
  async () => {
    await chatAutoScroll.scrollToBottom()
  },
  { deep: true }
)
// 选择对话
const handleConversationSelect = async (conversationId: string) => {
  conversationList.selectConversation(conversationId)
  await workspaceChat.loadConversationMessages(conversationId)
  composerValue.value = ''
  await router.push(`/workspace/${conversationId}`)
  await chatAutoScroll.scrollToBottom(true)
}
// 创建新对话
const handleCreateConversation = async () => {
  const conversation = await conversationList.createConversation()
  composerValue.value = ''
  await router.push(`/workspace/${conversation.id}`)
  await chatAutoScroll.scrollToBottom(true)
}
//发送消息
const handleSend = async (
  message: string,
  capabilities: PromptCapabilities,
  knowledgeBaseId?: string
) => {
  const conversationId = await workspaceChat.sendMessage(message, capabilities, knowledgeBaseId)

  if (
    conversationId &&
    conversationId !==
      (typeof route.params.conversationId === 'string' ? route.params.conversationId : '')
  ) {
    await router.push(`/workspace/${conversationId}`)
  }
}

const handleComposerSubmit = (payload: {
  message: string
  capabilities: PromptCapabilities
  knowledgeBaseId?: string
}) => {
  if (!payload.message.trim()) {
    return
  }

  composerValue.value = ''
  void handleSend(payload.message, payload.capabilities, payload.knowledgeBaseId)
}

const openAdmin = () => {
  void router.push('/admin/knowledge')
}

watch(
  () => route.params.conversationId,
  async (conversationId) => {
    if (typeof conversationId === 'string' && conversationId) {
      conversationList.selectConversation(conversationId)
      await workspaceChat.loadConversationMessages(conversationId)
      await chatAutoScroll.scrollToBottom(true)
    }
  }
)

const handleRegenerate = () => {
  void workspaceChat.regenerateLastAnswer(selectedKnowledgeBaseId.value || undefined)
}

onMounted(async () => {
  const conversationId =
    typeof route.params.conversationId === 'string' ? route.params.conversationId : undefined

  await Promise.all([conversationList.loadConversationList(), loadKnowledgeBases()])

  if (conversationId) {
    conversationList.selectConversation(conversationId)
    await workspaceChat.loadConversationMessages(conversationId)
  }

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
          <MessageList
            :conversations="conversationList.conversations.value"
            :active-conversation-id="activeConversationId"
            :loading="conversationListLoading"
            :get-conversation-time-label="formatConversationTime"
            :is-conversation-streaming="isConversationStreaming"
            @select="handleConversationSelect"
          />
        </div>

        <div class="border-t border-t-[#f3f4f6] px-4 py-4">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-[16px] border border-[#e5e7eb] bg-white px-4 py-3 text-left transition hover:border-[#d1d5db] hover:bg-[#fafafa]"
            @click="openAdmin"
          >
            <div>
              <p class="text-[14px] font-medium text-[#111827]">进入后台</p>
              <p class="mt-1 text-[12px] text-[#9ca3af]">知识库管理</p>
            </div>
            <Settings2 class="size-4 shrink-0 text-[#9ca3af]" />
          </button>
        </div>
      </aside>

      <section class="flex min-w-0 flex-col overflow-hidden bg-white">
        <header class="border-b border-b-[#f3f4f6] bg-white px-4 py-4 xl:px-8">
          <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-[14px] font-medium text-[#111827]">
                {{ activeConversation?.title || '新对话' }}
              </p>
              <p class="truncate text-[12px] text-[#9ca3af]">
                {{ hasContent ? `共 ${activeContentList.length} 条消息` : '对话界面' }}
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
            <template v-if="conversationListLoading || messagesLoading">
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

            <template v-else-if="conversationListError">
              <div class="rounded-xl border border-red-200 bg-red-50 p-5">
                <p class="text-sm font-medium text-red-700">工作台加载失败</p>
                <p class="mt-2 text-sm text-red-600">{{ conversationListError }}</p>
                <button
                  type="button"
                  class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                  @click="conversationList.loadConversationList()"
                >
                  重试
                </button>
              </div>
            </template>

            <template v-else-if="hasContent">
              <ContentList
                :content-list="activeContentList"
                :regenerating="regenerating"
                @regenerate="handleRegenerate"
              />
            </template>

            <template v-else>
              <div class="space-y-3 text-[14px] leading-[1.6] text-[#111827]">
                <p>你好，我是工作台助手。你可以直接输入问题开始对话。</p>
                <p>开启深度思考后，会先展示思考过程，再逐步生成最终回答。</p>
              </div>
            </template>
          </div>
        </div>

        <footer class="border-t border-t-[#f3f4f6] bg-white">
          <div class="mx-auto max-w-[920px] px-6 py-4">
            <WorkspacePromptBox
              v-model="composerValue"
              v-model:selected-knowledge-base-id="selectedKnowledgeBaseId"
              :disabled="isStreaming"
              :knowledge-bases="knowledgeBases"
              :streaming="isStreaming"
              @submit="handleComposerSubmit"
              @stop="workspaceChat.stopStreaming"
            />
          </div>
        </footer>
      </section>
    </div>
  </main>
</template>
