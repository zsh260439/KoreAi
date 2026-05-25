import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  createConversation,
  fetchTraceDetail,
  fetchWorkspaceMessages,
  fetchWorkspaceSessions,
  generateAssistantReply
} from '@/servers/workspace'
import type { ChatMessage, ConversationSummary, TraceDetail } from '@/types/models'
import {
  buildCompletedResponseFlow,
  buildStreamingResponseFlow,
  createThinkingPlaceholderFlow
} from '@/utils/chat-flow'

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const typeText = async (
  text: string,
  apply: (partial: string) => void,
  shouldStop: () => boolean,
  chunkSize = 1,
  delayMs = 18
) => {
  let pointer = 0

  while (pointer < text.length) {
    if (shouldStop()) {
      return false
    }

    pointer += chunkSize
    apply(text.slice(0, pointer))
    await sleep(delayMs)
  }

  return true
}

const deriveSessionTitle = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '新对话'
  }

  return normalized.length > 12 ? `${normalized.slice(0, 12)}...` : normalized
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const sessions = ref<ConversationSummary[]>([])
  const messagesBySession = ref<Record<string, ChatMessage[]>>({})
  const activeSessionId = ref('')
  const selectedTrace = ref<TraceDetail | null>(null)
  const loading = ref(false)
  const error = ref('')
  const detailOpen = ref(false)
  const sidebarOpen = ref(false)
  const collapsed = ref(false)
  const streamingStateBySession = ref<Record<string, { messageId: string; runId: number }>>({})
  const streamingRunSeq = ref(0)

  const activeSession = computed(
    () => sessions.value.find((item) => item.id === activeSessionId.value) ?? null
  )
  const activeMessages = computed(() => messagesBySession.value[activeSessionId.value] ?? [])
  const activeStreamingState = computed(
    () => streamingStateBySession.value[activeSessionId.value] ?? null
  )
  const isStreaming = computed(() => Boolean(activeStreamingState.value?.messageId))

  const getMessageById = (sessionId: string, messageId: string) =>
    (messagesBySession.value[sessionId] ?? []).find((item) => item.id === messageId)

  const getStreamingState = (sessionId: string) => streamingStateBySession.value[sessionId] ?? null

  const setStreamingState = (sessionId: string, messageId: string, runId: number) => {
    streamingStateBySession.value = {
      ...streamingStateBySession.value,
      [sessionId]: { messageId, runId }
    }
  }

  const clearStreamingState = (sessionId: string, messageId?: string) => {
    const current = streamingStateBySession.value[sessionId]
    if (!current || (messageId && current.messageId !== messageId)) {
      return
    }

    const nextState = { ...streamingStateBySession.value }
    delete nextState[sessionId]
    streamingStateBySession.value = nextState
  }

  const isRunActive = (runId: number, sessionId: string, messageId: string) =>
    getStreamingState(sessionId)?.runId === runId &&
    getStreamingState(sessionId)?.messageId === messageId

  const hydrateCompletedMessages = (messages: ChatMessage[]) =>
    messages.map((message) =>
      message.role === 'assistant'
        ? {
            ...message,
            responseFlow: message.responseFlow ?? buildCompletedResponseFlow(message)
          }
        : message
    )

  const bootstrap = async (sessionId?: string) => {
    loading.value = true
    error.value = ''

    try {
      const nextSessions = await fetchWorkspaceSessions()
      sessions.value = nextSessions

      const defaultSessionId =
        nextSessions.find((item) => item.id === 'session-empty')?.id ?? nextSessions[0]?.id ?? ''

      activeSessionId.value =
        sessionId && nextSessions.some((item) => item.id === sessionId) ? sessionId : defaultSessionId

      await Promise.all(
        nextSessions.map(async (session) => {
          const messages = await fetchWorkspaceMessages(session.id)
          const hydratedMessages = hydrateCompletedMessages(messages)
          messagesBySession.value[session.id] = hydratedMessages
          session.messageCount = hydratedMessages.length
        })
      )
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : '加载工作台失败'
    } finally {
      loading.value = false
    }
  }

  const selectSession = async (sessionId: string) => {
    activeSessionId.value = sessionId
    selectedTrace.value = null
    detailOpen.value = false

    if (!messagesBySession.value[sessionId]) {
      const messages = await fetchWorkspaceMessages(sessionId)
      const hydratedMessages = hydrateCompletedMessages(messages)
      messagesBySession.value[sessionId] = hydratedMessages

      const session = sessions.value.find((item) => item.id === sessionId)
      if (session) {
        session.messageCount = hydratedMessages.length
      }
    }
  }

  const createNewSession = async () => {
    const session = await createConversation('新对话')
    sessions.value = [session, ...sessions.value]
    messagesBySession.value[session.id] = []
    activeSessionId.value = session.id
    return session
  }

  const openTrace = async (traceId?: string, openDrawer = true) => {
    if (!traceId) {
      selectedTrace.value = null
      detailOpen.value = false
      return
    }

    selectedTrace.value = await fetchTraceDetail(traceId)
    detailOpen.value = openDrawer
  }

  const closeTrace = () => {
    detailOpen.value = false
  }

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value
  }

  const toggleCollapse = () => {
    collapsed.value = !collapsed.value
  }

  const finalizeStreamingMessage = (sessionId: string, messageId: string) => {
    const target = getMessageById(sessionId, messageId)
    if (!target) {
      return
    }

    if (target.responseFlow) {
      target.responseFlow.thinking.title = '思考过程'
      if (target.responseFlow.thinking.status === 'running') {
        target.responseFlow.thinking.status = 'done'
      }

      target.responseFlow.tools = target.responseFlow.tools.map((tool) => ({
        ...tool,
        status: tool.status === 'pending' ? 'done' : tool.status,
        showInput: true,
        showSteps: true,
        showOutput: true,
        visibleInput: tool.visibleInput || tool.input,
        visibleOutput: tool.visibleOutput || tool.output,
        steps: tool.steps.map((step) => ({
          ...step,
          status: step.status === 'pending' ? 'success' : step.status === 'running' ? 'success' : step.status
        }))
      }))

      target.responseFlow.answer.status = 'done'
      target.responseFlow.answer.visibleContent = target.content
      target.responseFlow.showActions = true
    }

    target.status = 'done'
    clearStreamingState(sessionId, messageId)
  }

  const streamAssistantFlow = async (sessionId: string, messageId: string, runId: number) => {
    const target = getMessageById(sessionId, messageId)
    if (!target?.responseFlow) {
      return
    }

    const flow = target.responseFlow
    flow.thinking.title = '正在思考...'
    flow.thinking.status = 'running'
    await sleep(360)

    if (!isRunActive(runId, sessionId, messageId)) {
      return
    }

    flow.thinking.title = '思考过程'
    await typeText(
      flow.thinking.content,
      (value) => {
        const message = getMessageById(sessionId, messageId)
        if (message?.responseFlow) {
          message.responseFlow.thinking.visibleContent = value
        }
      },
      () => !isRunActive(runId, sessionId, messageId),
      1,
      22
    )

    if (!isRunActive(runId, sessionId, messageId)) {
      return
    }

    flow.thinking.status = 'done'

    for (const tool of flow.tools) {
      if (!isRunActive(runId, sessionId, messageId)) {
        return
      }

      tool.status = 'running'
      await sleep(160)

      tool.showInput = true
      await typeText(
        tool.input,
        (value) => {
          const message = getMessageById(sessionId, messageId)
          const targetTool = message?.responseFlow?.tools.find((item) => item.id === tool.id)
          if (targetTool) {
            targetTool.visibleInput = value
          }
        },
        () => !isRunActive(runId, sessionId, messageId),
        1,
        18
      )

      if (!isRunActive(runId, sessionId, messageId)) {
        return
      }

      tool.showSteps = true

      for (let index = 0; index < tool.steps.length; index += 1) {
        if (!isRunActive(runId, sessionId, messageId)) {
          return
        }

        const step = tool.steps[index]
        step.status = 'running'
        await sleep(index === tool.steps.length - 1 ? 520 : 240)
        step.status = 'success'
      }

      if (!isRunActive(runId, sessionId, messageId)) {
        return
      }

      tool.showOutput = true
      await typeText(
        tool.output,
        (value) => {
          const message = getMessageById(sessionId, messageId)
          const targetTool = message?.responseFlow?.tools.find((item) => item.id === tool.id)
          if (targetTool) {
            targetTool.visibleOutput = value
          }
        },
        () => !isRunActive(runId, sessionId, messageId),
        1,
        18
      )

      if (!isRunActive(runId, sessionId, messageId)) {
        return
      }

      tool.status = 'done'
      await sleep(120)
    }

    if (!isRunActive(runId, sessionId, messageId)) {
      return
    }

    flow.answer.status = 'running'
    await typeText(
      flow.answer.content,
      (value) => {
        const message = getMessageById(sessionId, messageId)
        if (message?.responseFlow) {
          message.responseFlow.answer.visibleContent = value
          message.content = value
        }
      },
      () => !isRunActive(runId, sessionId, messageId),
      1,
      16
    )

    if (!isRunActive(runId, sessionId, messageId)) {
      return
    }

    flow.answer.status = 'done'
    flow.showActions = true
    target.status = 'done'
    clearStreamingState(sessionId, messageId)
  }

  const sendMessage = async (content: string) => {
    const session = activeSession.value

    if (!session || !content.trim() || getStreamingState(session.id)) {
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      createdAt: new Date().toISOString(),
      status: 'done'
    }

    const placeholderId = `assistant-${Date.now() + 1}`
    const placeholder: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
      model: session.model,
      responseFlow: createThinkingPlaceholderFlow()
    }

    const sessionMessages = messagesBySession.value[session.id] ?? []
    sessionMessages.push(userMessage, placeholder)
    messagesBySession.value[session.id] = sessionMessages
    if (!session.messageCount && (session.title === '鏂板璇?' || session.title === '新对话')) {
      session.title = deriveSessionTitle(content)
    }
    session.messageCount = sessionMessages.length
    session.updatedAt = new Date().toISOString()
    const runId = streamingRunSeq.value + 1
    streamingRunSeq.value = runId
    setStreamingState(session.id, placeholderId, runId)

    try {
      const reply = await generateAssistantReply(session.id, content.trim())

      if (!isRunActive(runId, session.id, placeholderId)) {
        return
      }

      const target = getMessageById(session.id, placeholderId)
      if (!target) {
        return
      }

      Object.assign(target, reply, {
        id: placeholderId,
        content: '',
        status: 'streaming',
        responseFlow: buildStreamingResponseFlow(reply)
      })

      await streamAssistantFlow(session.id, placeholderId, runId)
    } catch (caughtError) {
      const target = getMessageById(session.id, placeholderId)
      if (target) {
        target.status = 'error'
        target.content = '生成回复时发生错误，请重试。'
        target.responseFlow = {
          thinking: {
            kind: 'thinking',
            title: '思考过程',
            status: 'error',
            content: target.content,
            visibleContent: target.content
          },
          tools: [],
          answer: {
            kind: 'answer',
            title: '最终回答',
            status: 'error',
            content: target.content,
            visibleContent: target.content
          },
          showActions: true
        }
      }

      error.value = caughtError instanceof Error ? caughtError.message : '发送消息失败'
      clearStreamingState(session.id, placeholderId)
    }
  }

  const stopStreaming = () => {
    const sessionId = activeSessionId.value
    const messageId = getStreamingState(sessionId)?.messageId

    if (!sessionId || !messageId) {
      return
    }

    finalizeStreamingMessage(sessionId, messageId)
  }

  const regenerateLastAnswer = async () => {
    const lastUserMessage = [...activeMessages.value].reverse().find((message) => message.role === 'user')
    if (lastUserMessage) {
      await sendMessage(lastUserMessage.content)
    }
  }

  return {
    sessions,
    messagesBySession,
    activeSessionId,
    selectedTrace,
    loading,
    error,
    detailOpen,
    sidebarOpen,
    collapsed,
    streamingStateBySession,
    streamingRunSeq,
    activeStreamingState,
    activeSession,
    activeMessages,
    isStreaming,
    bootstrap,
    selectSession,
    createNewSession,
    openTrace,
    closeTrace,
    toggleSidebar,
    toggleCollapse,
    sendMessage,
    stopStreaming,
    regenerateLastAnswer
  }
})
