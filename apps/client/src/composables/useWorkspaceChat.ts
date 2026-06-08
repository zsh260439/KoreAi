import { computed, ref } from 'vue'
import {
  findWorkspaceConversationMessagesAPI,
  requestWorkspaceChatStreamAPI
} from '@/servers/workspace'
import type { ChatMessage, PromptCapabilities } from '@/types/chat/models'
import type { WorkspaceChatResult, WorkspaceChatStreamEvent } from 'share-type'
import {
  appendStreamingAnswerDelta,
  appendStreamingThinkingStageDelta,
  buildCompletedResponseFlow,
  completeStreamingThinkingStage,
  createThinkingPlaceholderFlow,
  finalizeStreamingResponseFlow,
  startStreamingThinkingStage
} from '@/utils/chat-flow'
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
const loadedConversationMap = ref<Record<string, boolean>>({})
const activeRequest = ref<ActiveChatRequest | null>(null)
const loadingConversationId = ref('')
const error = ref<string | null>(null)
const regenerating = ref(false)

const normalizePromptCapabilities = (
  promptCapabilities?: PromptCapabilities | null
): PromptCapabilities => ({
  think: Boolean(promptCapabilities?.think),
  search: false
})

const findLastUserContentIndex = (contentList: ChatMessage[]) => {
  for (let index = contentList.length - 1; index >= 0; index -= 1) {
    if (contentList[index]?.role === 'user') {
      return index
    }
  }

  return -1
}

const toUserChatMessage = (
  conversationId: string,
  content: string,
  promptCapabilities: PromptCapabilities
): ChatMessage => ({
  id: `user-${Date.now()}`,
  conversationId,
  role: 'user',
  content,
  createdAt: new Date().toISOString(),
  citations: null,
  model: null,
  latencyMs: null,
  reasoningSteps: null,
  promptCapabilities,
  status: 'done'
})

const toAssistantPlaceholderMessage = (
  conversationId: string,
  model: string | null,
  promptCapabilities: PromptCapabilities
): ChatMessage => ({
  id: `assistant-${Date.now() + 1}`,
  conversationId,
  role: 'assistant',
  content: '',
  createdAt: new Date().toISOString(),
  citations: null,
  model,
  latencyMs: null,
  reasoningSteps: null,
  promptCapabilities,
  status: 'streaming',
  responseFlow: promptCapabilities.think ? createThinkingPlaceholderFlow() : undefined
})

const toChatMessage = (message: {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  citations: ChatMessage['citations']
  model: string | null
  latencyMs: number | null
  reasoningSteps: ChatMessage['reasoningSteps']
  promptCapabilities: PromptCapabilities | null
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

function createStreamingErrorMessage(assistantMessage: ChatMessage, stopped: boolean): ChatMessage {
  return {
    ...assistantMessage,
    status: 'error',
    responseFlow: undefined,
    content: stopped ? '\u5df2\u505c\u6b62\u751f\u6210\u3002' : '\u751f\u6210\u56de\u590d\u65f6\u51fa\u73b0\u95ee\u9898\uff0c\u8bf7\u91cd\u8bd5\u3002'
  }
}

function applyStreamEventToAssistantMessage(
  assistantMessage: ChatMessage,
  event: WorkspaceChatStreamEvent
): ChatMessage {
  if (event.type === 'completed' || event.type === 'error') {
    return assistantMessage
  }
  // 处理回答文字片段
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
  // 处理推理增量
  if (event.type === 'reasoning_step_started') {
    return {
      ...assistantMessage,
      responseFlow: startStreamingThinkingStage(
        responseFlow,
        assistantMessage.id,
        event.index,
        event.step
      )
    }
  }
  // 处理推理增量
  if (event.type === 'reasoning_step_delta') {
    return {
      ...assistantMessage,
      responseFlow: appendStreamingThinkingStageDelta(responseFlow, event.index, event.delta)
    }
  }

  return {
    ...assistantMessage,
    responseFlow: completeStreamingThinkingStage(responseFlow, event.index, event.content)
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
  const isStreaming = computed(() => activeRequest.value !== null)
  const isConversationStreaming = (conversationId: string) =>
    activeRequest.value?.conversationId === conversationId

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
        caughtError instanceof Error ? caughtError.message : '\u52a0\u8f7d\u6d88\u606f\u5931\u8d25'
      return []
    } finally {
      if (loadingConversationId.value === conversationId) {
        loadingConversationId.value = ''
      }
    }
  }
 // 流式传输助手响应
  const streamAssistantResponse = async (params: {
    conversationId: string
    query: string
    promptCapabilities: PromptCapabilities
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
            sessionContentList = updateAssistantMessage(
              params.conversationId,
              sessionContentList,
              (assistantMessage) => applyStreamEventToAssistantMessage(assistantMessage, event)
            )
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
          caughtError instanceof Error ? caughtError.message : '\u53d1\u9001\u6d88\u606f\u5931\u8d25'
      }

      return params.conversationId
    } finally {
      activeRequest.value = null
    }
  }

  const sendMessage = async (
    content: string,
    promptCapabilities?: PromptCapabilities,
    knowledgeBaseId?: string
  ) => {
    const normalizedContent = content.trim()
    if (!normalizedContent || activeRequest.value) {
      return ''
    }

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

    return streamAssistantResponse({
      conversationId: conversation.id,
      query: normalizedContent,
      promptCapabilities: normalizedCapabilities,
      knowledgeBaseId,
      sessionContentList
    })
  }

  const stopStreaming = () => {
    activeRequest.value?.controller.abort()
  }

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

function finalizeAssistantMessage(
  assistantMessage: ChatMessage,
  result: WorkspaceChatResult,
  promptCapabilities: PromptCapabilities
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
