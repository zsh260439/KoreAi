<script setup lang="ts">
import { ArrowDown, Plus, Settings2 } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAutoScroll } from '@/composables/useAutoScroll'
import { useConversationList } from '@/composables/useConversationList'
import { useKnowledgeBases } from '@/composables/useKnowledgeBases'
import { useRetrievalRewritePreference } from '@/composables/useRetrievalRewritePreference'
import { useWorkspaceChat } from '@/composables/useWorkspaceChat'
import type { ChatMessage } from '@/types/chat/models'
import type { WorkspacePromptCapabilities } from 'share-type'
import ContentList from './components/content/ContentList.vue'
import WorkspacePromptBox from './components/input/WorkspacePromptBox.vue'
import MessageList from './components/sidebar/MessageList.vue'
import WorkspaceSidebarBrand from './components/sidebar/WorkspaceSidebarBrand.vue'

type EditableUserMessage = {
  message: ChatMessage
  promptCapabilities: WorkspacePromptCapabilities
}

const route = useRoute()
const router = useRouter()
const conversationList = useConversationList()
const workspaceChat = useWorkspaceChat()
const { knowledgeBases, loadKnowledgeBases } = useKnowledgeBases()
const { rewriteEnabled, setRewriteEnabled } = useRetrievalRewritePreference()

const composerValue = ref('')
const selectedKnowledgeBaseId = ref('')
const currentPromptCapabilities = ref<WorkspacePromptCapabilities>({
  think: false,
  rewrite: rewriteEnabled.value
})
const promptBoxRef = ref<InstanceType<typeof WorkspacePromptBox> | null>(null)
const autoScroll = useAutoScroll()
const {
  stickToBottom,
  forceStickToBottom,
  startForceStickToBottom,
  stopForceStickToBottom,
  updateStickToBottom,
  scrollMessagesToBottom
} = autoScroll

const activeConversation = conversationList.activeConversation
const activeContentList = workspaceChat.activeContentList
const hasContent = computed(() => activeContentList.value.length > 0)
const showConversationHydrating = computed(
  () => hasContent.value && forceStickToBottom.value && !messagesLoading.value
)
const activeConversationId = conversationList.activeConversationId
const conversationListLoading = conversationList.isLoading
const conversationListError = conversationList.error
const messagesLoading = workspaceChat.isLoadingMessages
const isStreaming = workspaceChat.isStreaming
const regenerating = workspaceChat.regenerating
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

const isConversationStreaming = (conversationId: string) =>
  workspaceChat.isConversationStreaming(conversationId)

watch(
  activeContentList,
  async () => {
    await scrollMessagesToBottom()
  },
  { deep: true }
)

watch(
  rewriteEnabled,
  (value) => {
    if (currentPromptCapabilities.value.rewrite === value) {
      return
    }

    currentPromptCapabilities.value = {
      ...currentPromptCapabilities.value,
      rewrite: value
    }
  },
  { immediate: true }
)

watch(
  () => currentPromptCapabilities.value.rewrite,
  (value) => {
    const normalizedValue = value !== false
    if (rewriteEnabled.value === normalizedValue) {
      return
    }

    setRewriteEnabled(normalizedValue)
  }
)

const handleConversationSelect = async (conversationId: string) => {
  conversationList.selectConversation(conversationId)
  startForceStickToBottom()
  await workspaceChat.loadConversationMessages(conversationId)
  composerValue.value = ''
  await router.push(`/workspace/${conversationId}`)
  await scrollMessagesToBottom(true)
}

const handleConversationDelete = async (conversationId: string) => {
  if (!window.confirm('确认删除这个会话吗？')) {
    return
  }

  const deletingActiveConversation = conversationId === activeConversationId.value
  await conversationList.deleteConversation(conversationId)

  if (deletingActiveConversation) {
    composerValue.value = ''
    await router.push('/workspace')
  }
}

const handleCreateConversation = async () => {
  stopForceStickToBottom()
  const conversation = await conversationList.createConversation()
  composerValue.value = ''
  await router.push(`/workspace/${conversation.id}`)
  await scrollMessagesToBottom(true)
}

const handleSend = async (payload: {
  message: string
  capabilities: WorkspacePromptCapabilities
  knowledgeBaseId?: string
}) => {
  composerValue.value = ''
  const conversationId = await workspaceChat.sendMessage(
    payload.message,
    payload.capabilities,
    payload.knowledgeBaseId
  )

  if (
    conversationId &&
    conversationId !==
      (typeof route.params.conversationId === 'string' ? route.params.conversationId : '')
  ) {
    await router.push(`/workspace/${conversationId}`)
  }
}

const openAdmin = () => {
  void router.push('/admin/knowledge')
}

const handleScrollToBottom = () => {
  void scrollMessagesToBottom(true)
}

watch(
  () => route.params.conversationId,
  async (conversationId) => {
    if (typeof conversationId === 'string' && conversationId) {
      conversationList.selectConversation(conversationId)
      startForceStickToBottom()
      await workspaceChat.loadConversationMessages(conversationId)
      await scrollMessagesToBottom(true)
    }
  }
)

const handleRegenerate = () => {
  void workspaceChat.regenerateLastAnswer(
    selectedKnowledgeBaseId.value || undefined,
    currentPromptCapabilities.value
  )
}

const handleEditMessage = async (payload: EditableUserMessage) => {
  composerValue.value = payload.message.content
  currentPromptCapabilities.value = payload.promptCapabilities

  await nextTick()
  promptBoxRef.value?.focusComposer()
}

onMounted(async () => {
  const conversationId =
    typeof route.params.conversationId === 'string' ? route.params.conversationId : undefined

  await Promise.all([conversationList.loadConversationList(), loadKnowledgeBases()])

  if (conversationId) {
    conversationList.selectConversation(conversationId)
    startForceStickToBottom()
    await workspaceChat.loadConversationMessages(conversationId)
  }

  await scrollMessagesToBottom(true)
})
</script>

<template>
  <main class="h-screen bg-white text-[#111827]">
    <div class="grid h-screen grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside class="hidden h-screen w-full shrink-0 flex-col border-r border-r-[#f3f4f6] bg-white xl:flex">
        <div class="px-7 pt-10">
          <WorkspaceSidebarBrand />
        </div>

        <div class="px-7 pt-8">
          <button
            type="button"
            class="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#e5e7eb] bg-white text-[14px] font-semibold text-[#111827] transition hover:border-[#d1d5db] hover:bg-[#fafafa]"
            @click="handleCreateConversation"
          >
            <Plus class="size-4" />
            <span>新建对话</span>
          </button>
        </div>

        <div class="mt-6 min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <MessageList
            :conversations="conversationList.conversations.value"
            :active-conversation-id="activeConversationId"
            :loading="conversationListLoading"
            :get-conversation-time-label="formatConversationTime"
            :is-conversation-streaming="isConversationStreaming"
            @delete="handleConversationDelete"
            @select="handleConversationSelect"
          />
        </div>

        <div class="border-t border-t-[#f3f4f6] px-5 py-4">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-3 text-left transition hover:border-[#d1d5db] hover:bg-[#fafafa]"
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

        <div class="relative min-h-0 flex-1 bg-white">
          <div
            :ref="autoScroll.messagesRef"
            class="h-full overflow-y-auto bg-white"
            @scroll="updateStickToBottom"
          >
            <div class="mx-auto w-full max-w-[920px] px-6 py-8">
              <template v-if="conversationListLoading || messagesLoading">
                <div class="space-y-8">
                  <div v-for="item in 6" :key="item" class="space-y-4">
                    <div class="h-5 w-5 rounded-full bg-[#f3f4f6]" />
                    <div class="space-y-2">
                      <div class="h-4 w-full rounded bg-[#f3f4f6]" />
                      <div class="h-4 w-[92%] rounded bg-[#f3f4f6]" />
                      <div class="h-4 w-[74%] rounded bg-[#f3f4f6]" />
                      <div class="h-4 w-[58%] rounded bg-[#f8fafc]" />
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
                <div class="relative">
                  <div :class="showConversationHydrating ? 'invisible' : ''">
                    <ContentList
                      :content-list="activeContentList"
                      :regenerating="regenerating"
                      @edit="handleEditMessage"
                      @regenerate="handleRegenerate"
                    />
                  </div>

                  <div
                    class="absolute inset-0 bg-white transition-opacity duration-200"
                    :class="showConversationHydrating ? 'opacity-100' : 'pointer-events-none opacity-0'"
                  >
                    <div class="space-y-8">
                      <div v-for="item in 6" :key="item" class="space-y-4">
                        <div class="h-5 w-5 rounded-full bg-[#f3f4f6]" />
                        <div class="space-y-2">
                          <div class="h-4 w-full rounded bg-[#f3f4f6]" />
                          <div class="h-4 w-[92%] rounded bg-[#f3f4f6]" />
                          <div class="h-4 w-[74%] rounded bg-[#f3f4f6]" />
                          <div class="h-4 w-[58%] rounded bg-[#f8fafc]" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <template v-else>
                这里以后会引入新的样式，目前占位
              </template>
            </div>
          </div>

        </div>

        <footer class="relative border-t border-t-[#f3f4f6] bg-white">
          <Transition
            enter-active-class="transition duration-180 ease-out"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="-translate-y-1/2 opacity-100"
            leave-to-class="translate-y-2 opacity-0"
          >
            <div
              v-if="hasContent && !stickToBottom"
              class="pointer-events-none absolute left-1/2 top-[-2rem] z-30 flex -translate-x-1/2 -translate-y-1/2 justify-center"
            >
              <button
                type="button"
                aria-label="跳转到底部"
                class="pointer-events-auto flex size-12 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#111827] shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition hover:bg-[#fafafa]"
                @click="handleScrollToBottom"
              >
                <ArrowDown class="size-5" />
              </button>
            </div>
          </Transition>

          <div class="mx-auto max-w-[920px] px-6 py-4">
            <WorkspacePromptBox
              ref="promptBoxRef"
              v-model="composerValue"
              :capabilities="currentPromptCapabilities"
              v-model:selected-knowledge-base-id="selectedKnowledgeBaseId"
              :disabled="isStreaming"
              :knowledge-bases="knowledgeBases"
              :streaming="isStreaming"
              @update:capabilities="currentPromptCapabilities = $event"
              @submit="handleSend"
              @stop="workspaceChat.stopStreaming"
            />
          </div>
        </footer>
      </section>
    </div>
  </main>
</template>
