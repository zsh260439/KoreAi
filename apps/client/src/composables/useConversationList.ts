import { computed, ref } from 'vue'
import { createWorkspaceConversationAPI, findWorkspaceConversationsAPI } from '@/servers/workspace'
import type { ConversationSummary } from '@/types/chat/models'

const conversations = ref<ConversationSummary[]>([])
const activeConversationId = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)

export function useConversationList() {
  const activeConversation = computed(
    () => conversations.value.find((item) => item.id === activeConversationId.value) ?? null
  )

  const loadConversationList = async () => {
    isLoading.value = true
    error.value = null

    try {
      const response = await findWorkspaceConversationsAPI()
      conversations.value = response.data ?? []

      if (
        activeConversationId.value &&
        !conversations.value.some((item) => item.id === activeConversationId.value)
      ) {
        activeConversationId.value = ''
      }

      return conversations.value
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载会话列表失败'
      conversations.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  const selectConversation = (conversationId: string) => {
    activeConversationId.value = conversationId
  }

  const createConversation = async (title = '新对话') => {
    const response = await createWorkspaceConversationAPI({ title })

    if (!response.data) {
      throw new Error('创建会话失败')
    }

    upsertConversation(response.data)
    activeConversationId.value = response.data.id
    return response.data
  }

  const upsertConversation = (conversation: ConversationSummary) => {
    conversations.value = [
      conversation,
      ...conversations.value.filter((item) => item.id !== conversation.id)
    ]
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
    upsertConversation
  }
}
