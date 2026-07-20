import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  findWorkspaceConversationMessagesAPI,
  findWorkspaceConversationsAPI
} from '@/servers/workspace'
import type {
  WorkspaceConversationPage,
  WorkspaceConversationSummary,
  WorkspaceMessage
} from 'share-type'

const conversationRequests = new Map<string, Promise<WorkspaceMessage[]>>()
let conversationListRequest: Promise<WorkspaceConversationPage> | null = null
const messageCacheOrder: string[] = []
const MAX_CACHED_CONVERSATIONS = 40

export const useWorkspaceCacheStore = defineStore('workspace-cache', () => {
  const conversations = shallowRef<WorkspaceConversationSummary[]>([])
  const messagesByConversation = shallowRef<Record<string, WorkspaceMessage[]>>({})
  const loadedConversationIds = new Set<string>()
  const conversationsLoading = ref(false)
  const hasMore = ref(false)

  const loadConversations = async (page: number, limit: number, force = false) => {
    if (page === 1 && !force && conversations.value.length) {
      return conversations.value
    }

    if (conversationListRequest) {
      return conversationListRequest
    }

    conversationsLoading.value = true
    conversationListRequest = findWorkspaceConversationsAPI(page, limit)
      .then((response) => {
        conversations.value = page === 1 ? response.data.items ?? [] : [...conversations.value, ...(response.data.items ?? [])]
        hasMore.value = response.data.hasMore
        return response.data
      })
      .finally(() => {
        conversationsLoading.value = false
        conversationListRequest = null
      })

    return conversationListRequest
  }

  const loadConversationMessages = async (conversationId: string, force = false) => {
    if (!force && loadedConversationIds.has(conversationId)) {
      return messagesByConversation.value[conversationId] ?? []
    }

    const pendingRequest = conversationRequests.get(conversationId)
    if (pendingRequest) {
      return pendingRequest
    }

    const request = findWorkspaceConversationMessagesAPI(conversationId)
      .then((response) => {
        setConversationMessages(conversationId, response.data ?? [])
        return response.data ?? []
      })
      .finally(() => {
        if (conversationRequests.get(conversationId) === request) {
          conversationRequests.delete(conversationId)
        }
      })

    conversationRequests.set(conversationId, request)
    return request
  }

  const setConversationMessages = (conversationId: string, messages: WorkspaceMessage[]) => {
    const nextMessages = { ...messagesByConversation.value, [conversationId]: messages }
    const previousIndex = messageCacheOrder.indexOf(conversationId)
    if (previousIndex >= 0) {
      messageCacheOrder.splice(previousIndex, 1)
    }
    messageCacheOrder.push(conversationId)

    const expiredConversationId =
      messageCacheOrder.length > MAX_CACHED_CONVERSATIONS ? messageCacheOrder.shift() : undefined
    if (expiredConversationId) {
      delete nextMessages[expiredConversationId]
      loadedConversationIds.delete(expiredConversationId)
    }

    messagesByConversation.value = nextMessages
    loadedConversationIds.add(conversationId)
  }

  const upsertConversation = (conversation: WorkspaceConversationSummary) => {
    conversations.value = [
      conversation,
      ...conversations.value.filter((item) => item.id !== conversation.id)
    ]
  }

  const removeConversation = (conversationId: string) => {
    conversations.value = conversations.value.filter((item) => item.id !== conversationId)
    const nextMessages = { ...messagesByConversation.value }
    delete nextMessages[conversationId]
    messagesByConversation.value = nextMessages
    loadedConversationIds.delete(conversationId)
    const cacheIndex = messageCacheOrder.indexOf(conversationId)
    if (cacheIndex >= 0) {
      messageCacheOrder.splice(cacheIndex, 1)
    }
    conversationRequests.delete(conversationId)
  }

  const hasConversationMessages = (conversationId: string) =>
    loadedConversationIds.has(conversationId)

  return {
    conversations,
    messagesByConversation,
    conversationsLoading,
    hasMore,
    loadConversations,
    loadConversationMessages,
    setConversationMessages,
    upsertConversation,
    removeConversation,
    hasConversationMessages
  }
})
