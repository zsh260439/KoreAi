import { computed, ref } from 'vue'
import {
  findWorkspaceConversationMessagesAPI,
  requestWorkspaceChatStreamAPI
} from '@/servers/workspace'
import type { ChatMessage } from '@/types/chat/models'
import {
  appendStreamingAnswerDelta,
  appendStreamingThinkingStageDelta,
  buildCompletedResponseFlow,
  createThinkingPlaceholderFlow,
  finalizeStreamingResponseFlow
} from '@/utils/chat-flow'
import type {
  WorkspaceChatResult,
  WorkspaceChatStreamEvent,
  WorkspacePromptCapabilities
} from 'share-type'
import { useConversationList } from './useConversationList'

//声明默认输入能力
const DEFAULT_PROMPT_CAPABILITIES: WorkspacePromptCapabilities = {
  think: false,
  search: false
}

//声明激活中的聊天请求结构
type ActiveChatRequest = {
  conversationId: string
  controller: AbortController
}

//声明消息列表缓存
const contentListBySession = ref<Record<string, ChatMessage[]>>({})

//声明会话加载状态缓存
const loadedConversationMap = ref<Record<string, boolean>>({})

//声明当前激活请求
const activeRequest = ref<ActiveChatRequest | null>(null)

//声明发送中的同步提交锁
const sending = ref(false)

//声明当前加载中的会话标识
const loadingConversationId = ref('')

//声明错误消息
const error = ref<string | null>(null)

//声明重新生成状态
const regenerating = ref(false)

//声明输入能力标准化逻辑
const normalizePromptCapabilities = (
  promptCapabilities?: WorkspacePromptCapabilities | null
): WorkspacePromptCapabilities => ({
  think: Boolean(promptCapabilities?.think),
  search: false
})

//声明查找最后一条用户消息下标
const findLastUserContentIndex = (contentList: ChatMessage[]) => {
  for (let index = contentList.length - 1; index >= 0; index -= 1) {
    if (contentList[index]?.role === 'user') {
      return index
    }
  }

  return -1
}

//声明用户消息构造逻辑
const toUserChatMessage = (
  conversationId: string,
  content: string,
  promptCapabilities: WorkspacePromptCapabilities
): ChatMessage => ({
  id: `user-${Date.now()}`,
  conversationId,
  role: 'user',
  content,
  createdAt: new Date().toISOString(),
  citations: null,
  model: null,
  latencyMs: null,
  totalTokens: null,
  reasoningSteps: null,
  promptCapabilities,
  status: 'done'
})

//声明助手占位消息构造逻辑
const toAssistantPlaceholderMessage = (
  conversationId: string,
  model: string | null,
  promptCapabilities: WorkspacePromptCapabilities
): ChatMessage => ({
  id: `assistant-${Date.now() + 1}`,
  conversationId,
  role: 'assistant',
  content: '',
  createdAt: new Date().toISOString(),
  citations: null,
  model,
  latencyMs: null,
  totalTokens: null,
  reasoningSteps: null,
  promptCapabilities,
  status: 'streaming',
  responseFlow: promptCapabilities.think ? createThinkingPlaceholderFlow() : undefined
})

//声明历史消息转聊天消息逻辑
const toChatMessage = (message: {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  citations: ChatMessage['citations']
  model: string | null
  latencyMs: number | null
  totalTokens: number | null
  reasoningSteps: ChatMessage['reasoningSteps']
  promptCapabilities: WorkspacePromptCapabilities | null
}): ChatMessage => {
  const chatMessage: ChatMessage = {
    ...message,
    promptCapabilities: message.promptCapabilities,
    status: 'done'
  }

  if (chatMessage.role === 'assistant') {
    chatMessage.responseFlow = buildCompletedResponseFlow(chatMessage)
  }

  return chatMessage
}

//声明流式错误消息构造逻辑
function createStreamingErrorMessage(assistantMessage: ChatMessage, stopped: boolean): ChatMessage {
  return {
    ...assistantMessage,
    status: 'error',
    responseFlow: undefined,
    content: stopped ? '已停止生成。' : '生成回复时出现问题，请重试。'
  }
}

//声明流式事件应用逻辑
function applyStreamEventToAssistantMessage(
  assistantMessage: ChatMessage,
  event: WorkspaceChatStreamEvent
): ChatMessage {
  if (event.type === 'completed' || event.type === 'error') {
    return assistantMessage
  }

  if (event.type === 'answer_delta') {
    if (!assistantMessage.responseFlow) {
      return {
        ...assistantMessage,
        content: assistantMessage.content + event.delta
      }
    }

    const responseFlow = appendStreamingAnswerDelta(assistantMessage.responseFlow, event.delta)
    return {
      ...assistantMessage,
      content: responseFlow.answer.content,
      responseFlow
    }
  }

  const responseFlow = assistantMessage.responseFlow ?? createThinkingPlaceholderFlow()
  return {
    ...assistantMessage,
    responseFlow: appendStreamingThinkingStageDelta(responseFlow, event.delta)
  }
}

export function useWorkspaceChat() {
  const conversationList = useConversationList()

  const activeContentList = computed(
    () => contentListBySession.value[conversationList.activeConversationId.value] ?? []
  )

  const isLoadingMessages = computed(
    () =>
      Boolean(loadingConversationId.value) &&
      loadingConversationId.value === conversationList.activeConversationId.value
  )

  //声明界面流式状态包含预提交阶段
  const isStreaming = computed(() => activeRequest.value !== null || sending.value)

  const isConversationStreaming = (conversationId: string) =>
    activeRequest.value?.conversationId === conversationId

  //声明设置会话消息逻辑
  const setConversationMessages = (conversationId: string, messages: ChatMessage[]) => {
    contentListBySession.value = {
      ...contentListBySession.value,
      [conversationId]: messages
    }

    loadedConversationMap.value = {
      ...loadedConversationMap.value,
      [conversationId]: true
    }
  }

  //声明更新最后一条助手消息逻辑
  const updateAssistantMessage = (
    conversationId: string,
    messages: ChatMessage[],
    updater: (message: ChatMessage) => ChatMessage
  ) => {
    const assistantIndex = messages.length - 1
    const assistantMessage = messages[assistantIndex]

    if (!assistantMessage || assistantMessage.role !== 'assistant') {
      return messages
    }

    const nextMessages = messages.slice()
    nextMessages[assistantIndex] = updater(assistantMessage)
    setConversationMessages(conversationId, nextMessages)
    return nextMessages
  }

  //声明加载会话消息逻辑
  const loadConversationMessages = async (conversationId: string, force = false) => {
    if (!conversationId) {
      return []
    }

    if (!force && loadedConversationMap.value[conversationId]) {
      return contentListBySession.value[conversationId] ?? []
    }

    try {
      loadingConversationId.value = conversationId
      const response = await findWorkspaceConversationMessagesAPI(conversationId)
      const messages = (response.data ?? []).map(toChatMessage)
      setConversationMessages(conversationId, messages)
      return messages
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : '加载消息失败'
      return []
    } finally {
      if (loadingConversationId.value === conversationId) {
        loadingConversationId.value = ''
      }
    }
  }

  //声明流式传输助手响应
  const streamAssistantResponse = async (params: {
    conversationId: string
    query: string
    promptCapabilities: WorkspacePromptCapabilities
    knowledgeBaseId?: string
    regenerate?: boolean
    sessionContentList: ChatMessage[]
  }) => {
    const controller = new AbortController()
    activeRequest.value = {
      conversationId: params.conversationId,
      controller
    }

    let sessionContentList = params.sessionContentList

    try {
      const result = await requestWorkspaceChatStreamAPI(
        {
          conversationId: params.conversationId,
          query: params.query,
          knowledgeBaseId: params.knowledgeBaseId,
          think: params.promptCapabilities.think,
          regenerate: params.regenerate
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'thinking_delta' || event.type === 'answer_delta') {
              sessionContentList = updateAssistantMessage(
                params.conversationId,
                sessionContentList,
                (assistantMessage) => applyStreamEventToAssistantMessage(assistantMessage, event)
              )
            }
          }
        }
      )

      sessionContentList = updateAssistantMessage(
        params.conversationId,
        sessionContentList,
        (assistantMessage) =>
          finalizeAssistantMessage(assistantMessage, result, params.promptCapabilities)
      )

      conversationList.upsertConversation(result.conversation)
      conversationList.selectConversation(result.conversationId)

      return result.conversationId
    } catch (caughtError) {
      const stopped = controller.signal.aborted
      sessionContentList = updateAssistantMessage(
        params.conversationId,
        sessionContentList,
        (assistantMessage) => createStreamingErrorMessage(assistantMessage, stopped)
      )

      if (!stopped) {
        error.value =
          caughtError instanceof Error ? caughtError.message : '发送消息失败'
      }

      return params.conversationId
    } finally {
      activeRequest.value = null
    }
  }

  //声明发送消息逻辑
  const sendMessage = async (
    content: string,
    promptCapabilities?: WorkspacePromptCapabilities,
    knowledgeBaseId?: string
  ) => {
    const normalizedContent = content.trim()
    if (!normalizedContent || activeRequest.value || sending.value) {
      return ''
    }

    sending.value = true

    try {
      const normalizedCapabilities = normalizePromptCapabilities(promptCapabilities)
      const conversation =
        conversationList.activeConversation.value ?? (await conversationList.createConversation())
      const sessionContentList = [...(contentListBySession.value[conversation.id] ?? [])]
      const userMessage = toUserChatMessage(conversation.id, normalizedContent, normalizedCapabilities)
      const assistantMessage = toAssistantPlaceholderMessage(
        conversation.id,
        conversation.model,
        normalizedCapabilities
      )

      sessionContentList.push(userMessage, assistantMessage)
      setConversationMessages(conversation.id, sessionContentList)
      error.value = null

      return await streamAssistantResponse({
        conversationId: conversation.id,
        query: normalizedContent,
        promptCapabilities: normalizedCapabilities,
        knowledgeBaseId,
        sessionContentList
      })
    } finally {
      sending.value = false
    }
  }

  //声明停止流式输出逻辑
  const stopStreaming = () => {
    activeRequest.value?.controller.abort()
  }

  //声明重新生成上一条回答逻辑
  const regenerateLastAnswer = async (knowledgeBaseId?: string) => {
    const conversation = conversationList.activeConversation.value
    if (!conversation || activeRequest.value || regenerating.value) {
      return
    }

    const sessionContentList = contentListBySession.value[conversation.id] ?? []
    const lastUserContentIndex = findLastUserContentIndex(sessionContentList)
    const lastUserContent =
      lastUserContentIndex >= 0 ? sessionContentList[lastUserContentIndex] : null

    if (!lastUserContent) {
      return
    }

    const promptCapabilities = normalizePromptCapabilities(
      lastUserContent.promptCapabilities ?? DEFAULT_PROMPT_CAPABILITIES
    )

    const nextSessionContentList = sessionContentList.slice(0, lastUserContentIndex + 1)
    const assistantMessage = toAssistantPlaceholderMessage(
      conversation.id,
      conversation.model,
      promptCapabilities
    )

    nextSessionContentList.push(assistantMessage)
    setConversationMessages(conversation.id, nextSessionContentList)

    regenerating.value = true
    error.value = null

    try {
      await streamAssistantResponse({
        conversationId: conversation.id,
        query: lastUserContent.content,
        promptCapabilities,
        knowledgeBaseId,
        regenerate: true,
        sessionContentList: nextSessionContentList
      })
    } finally {
      regenerating.value = false
    }
  }

  return {
    activeContentList,
    isLoadingMessages,
    isStreaming,
    error,
    regenerating,
    isConversationStreaming,
    loadConversationMessages,
    sendMessage,
    stopStreaming,
    regenerateLastAnswer
  }
}

//声明最终助手消息收口逻辑
function finalizeAssistantMessage(
  assistantMessage: ChatMessage,
  result: WorkspaceChatResult,
  promptCapabilities: WorkspacePromptCapabilities
): ChatMessage {
  const completedMessage = toChatMessage({
    id: assistantMessage.id,
    conversationId: assistantMessage.conversationId,
    role: 'assistant',
    content: result.answer,
    createdAt: assistantMessage.createdAt,
    citations: result.sources,
    model: result.model,
    latencyMs: result.latencyMs,
    totalTokens: result.totalTokens,
    reasoningSteps: result.reasoningSteps,
    promptCapabilities
  })

  if (completedMessage.responseFlow && assistantMessage.responseFlow) {
    completedMessage.responseFlow = finalizeStreamingResponseFlow(
      {
        ...assistantMessage.responseFlow,
        answer: {
          ...assistantMessage.responseFlow.answer,
          content: result.answer,
          visibleContent: result.answer
        }
      },
      result.latencyMs
    )
  }

  return completedMessage
}
