import { computed, ref } from 'vue'
import type { ConversationSummary } from '@/types'

const conversations = ref<ConversationSummary[]>([])
const activeConversationId = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)

const createLocalConversation = (title: string, model = 'AI'): ConversationSummary => ({
  id: `conversation-${Date.now()}`,
  title,
  updatedAt: new Date().toISOString(),
  messageCount: 0,
  model
})

export function useConversationList() {
  const activeConversation = computed(
    () => conversations.value.find((item) => item.id === activeConversationId.value) ?? null
  )

  const loadConversationList = async () => {
    isLoading.value = true
    error.value = null

    try {
      // 后续接入真实会话列表接口时，只替换这里的请求来源。
      return conversations.value
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载会话列表失败'
      return []
    } finally {
      isLoading.value = false
    }
  }

  const selectConversation = async (conversationId: string) => {
    activeConversationId.value = conversationId
  }

  const createConversation = (title = '新对话') => {
    const conversation = createLocalConversation(title)
    conversations.value = [conversation, ...conversations.value]
    activeConversationId.value = conversation.id
    return conversation
  }
  //重新生成调用
  const updateConversation = (conversationId: string, patch: Partial<ConversationSummary>) => {
    conversations.value = conversations.value.map((item) =>
      item.id === conversationId
        ? {
            ...item,
            ...patch
          }
        : item
    )
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    isLoading,
    error,
    loadConversationList,
    selectConversation,
    createConversation,
    updateConversation
  }
}
