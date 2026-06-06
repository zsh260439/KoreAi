import { computed, ref } from 'vue'

import { requestWorkspaceChatAPI } from '@/servers/workspace'
import type {
  ChatMessage,
  ConversationSummary,
  PromptCapabilities
} from '@/types'
import { useConversationList } from './useConversationList'

const DEFAULT_PROMPT_CAPABILITIES: PromptCapabilities = {
  think: false,
  search: false
}

type ActiveChatRequest = {
  conversationId: string
  controller: AbortController
}

const contentListBySession = ref<Record<string, ChatMessage[]>>({})
const activeRequest = ref<ActiveChatRequest | null>(null)
const error = ref<string | null>(null)
const regenerating = ref(false)

const normalizePromptCapabilities = (
  promptCapabilities?: PromptCapabilities
): PromptCapabilities => ({
  think: Boolean(promptCapabilities?.think),
  search: false
})

const deriveSessionTitle = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '新对话'
  }

  return normalized.length > 12 ? `${normalized.slice(0, 12)}...` : normalized
}

const findLastUserContentIndex = (contentList: ChatMessage[]) => {
  for (let index = contentList.length - 1; index >= 0; index -= 1) {
    if (contentList[index]?.role === 'user') {
      return index
    }
  }

  return -1
}

export function useWorkspaceChat() {
  // 左侧对话摘要列表
  const conversationList = useConversationList()
  // 某一个会话内所有的消息
  const activeContentList = computed(
    () => contentListBySession.value[conversationList.activeConversationId.value] ?? []
  )
  // 是否正在请求助手回复
  const isStreaming = computed(() => activeRequest.value !== null)
  // 左侧对话列表用来标记哪个对话正在生成
  const isConversationStreaming = (conversationId: string) =>
    activeRequest.value?.conversationId === conversationId

  // 请求助手回复，并把结果回填到当前会话最后一条 assistant 占位消息
  const runAssistantRequest = async (
    conversation: ConversationSummary,
    content: string,
    sessionContentList: ChatMessage[],
    promptCapabilities?: PromptCapabilities,
    knowledgeBaseId?: string
  ) => {
    const normalizedContent = content.trim()
    const normalizedCapabilities = normalizePromptCapabilities(promptCapabilities)
    const assistantContentIndex = sessionContentList.length

    sessionContentList.push({
      id: `assistant-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
      model: conversation.model,
      promptCapabilities: normalizedCapabilities
    })

    contentListBySession.value = {
      ...contentListBySession.value,
      [conversation.id]: sessionContentList
    }
    conversationList.updateConversation(conversation.id, {
      title:
        conversation.messageCount === 0 ? deriveSessionTitle(normalizedContent) : conversation.title,
      messageCount: sessionContentList.length,
      updatedAt: new Date().toISOString()
    })

    error.value = null
    const controller = new AbortController()
    activeRequest.value = {
      conversationId: conversation.id,
      controller
    }

    try {
      const response = await requestWorkspaceChatAPI(
        {
          query: normalizedContent,
          knowledgeBaseId,
          think: normalizedCapabilities.think
        },
        controller.signal
      )
      const result = response.data

      sessionContentList[assistantContentIndex] = {
        ...sessionContentList[assistantContentIndex],
        content: result?.answer ?? '',
        status: 'done',
        model: result?.model ?? 'AI',
        citations: result?.sources ?? []
      }
    } catch (caughtError) {
      const stopped = controller.signal.aborted
      sessionContentList[assistantContentIndex] = {
        ...sessionContentList[assistantContentIndex],
        status: 'error',
        content: stopped ? '已停止生成。' : '生成回复时出现问题，请重试。'
      }

      if (!stopped) {
        error.value = caughtError instanceof Error ? caughtError.message : '发送消息失败'
      }
    } finally {
      contentListBySession.value = {
        ...contentListBySession.value,
        [conversation.id]: sessionContentList
      }
      conversationList.updateConversation(conversation.id, {
        messageCount: sessionContentList.length,
        updatedAt: new Date().toISOString()
      })
      activeRequest.value = null
    }
  }

  const sendMessage = async (
    content: string,
    promptCapabilities?: PromptCapabilities,
    knowledgeBaseId?: string
  ) => {
    const normalizedContent = content.trim()
    if (!normalizedContent || activeRequest.value) return

    const conversation =
      conversationList.activeConversation.value ?? conversationList.createConversation()
    const normalizedCapabilities = normalizePromptCapabilities(promptCapabilities)
    const sessionContentList = [...(contentListBySession.value[conversation.id] ?? [])]

    sessionContentList.push({
      id: `user-${Date.now()}`,
      role: 'user',
      content: normalizedContent,
      createdAt: new Date().toISOString(),
      status: 'done',
      promptCapabilities: normalizedCapabilities
    })

    await runAssistantRequest(
      conversation,
      normalizedContent,
      sessionContentList,
      normalizedCapabilities,
      knowledgeBaseId
    )
  }

  const stopStreaming = () => {
    activeRequest.value?.controller.abort()
  }

  const regenerateLastAnswer = async (knowledgeBaseId?: string) => {
    const conversation = conversationList.activeConversation.value
    if (!conversation || activeRequest.value || regenerating.value) return

    const sessionContentList = contentListBySession.value[conversation.id] ?? []
    const lastUserContentIndex = findLastUserContentIndex(sessionContentList)
    const lastUserContent =
      lastUserContentIndex >= 0 ? sessionContentList[lastUserContentIndex] : null
    if (!lastUserContent) return

    regenerating.value = true
    try {
      await runAssistantRequest(
        conversation,
        lastUserContent.content,
        sessionContentList.slice(0, lastUserContentIndex + 1),
        lastUserContent.promptCapabilities ?? DEFAULT_PROMPT_CAPABILITIES,
        knowledgeBaseId
      )
    } finally {
      regenerating.value = false
    }
  }

  return {
    activeContentList,
    isStreaming,
    error,
    regenerating,
    isConversationStreaming,
    sendMessage,
    stopStreaming,
    regenerateLastAnswer
  }
}
