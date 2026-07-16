import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import {
  createWorkspaceConversationAPI,
  deleteWorkspaceConversationAPI
} from '@/servers/workspace'
import type { WorkspaceConversationSummary } from 'share-type'
import { useWorkspaceCacheStore } from '@/stores/workspace-cache'

const activeConversationId = ref('')
const error = ref<string | null>(null)

export function useConversationList() {
  const cache = useWorkspaceCacheStore()
  const { conversations, conversationsLoading: isLoading } = storeToRefs(cache)
  const activeConversation = computed(
    () => conversations.value.find((item) => item.id === activeConversationId.value) ?? null
  )

  const loadConversationList = async () => {
    error.value = null

    try {
      await cache.loadConversations()

      if (
        activeConversationId.value &&
        !conversations.value.some((item) => item.id === activeConversationId.value)
      ) {
        activeConversationId.value = ''
      }

      return conversations.value
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载会话列表失败'
      return conversations.value
    }
  }

  const selectConversation = (conversationId: string) => {
    activeConversationId.value = conversationId
  }

  const createConversation = async (title = '新对话') => {
    const response = await createWorkspaceConversationAPI({ title })
    const conversation = response.data
    cache.upsertConversation(conversation)
    cache.setConversationMessages(conversation.id, [])
    activeConversationId.value = conversation.id
    return conversation
  }

  const upsertConversation = (conversation: WorkspaceConversationSummary) => {
    cache.upsertConversation(conversation)
  }

  const deleteConversation = async (conversationId: string) => {
    await deleteWorkspaceConversationAPI(conversationId)
    cache.removeConversation(conversationId)

    if (activeConversationId.value === conversationId) {
      activeConversationId.value = ''
    }
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
    deleteConversation,
    upsertConversation
  }
}
