import {
  createConversation,
  fetchTraceDetail,
  fetchWorkspaceMessages,
  fetchWorkspaceSessions,
  generateAssistantReply
} from '@/servers'
import type { ChatMessage, ConversationSummary, PromptCapabilities, TraceDetail } from '@/types'
import {
  buildCompletedResponseFlow,
  buildStreamingResponseFlow,
  createThinkingPlaceholderFlow
} from '@/utils'

const DEFAULT_PROMPT_CAPABILITIES: PromptCapabilities = {
  think: false,
  search: false
}

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

const normalizePromptCapabilities = (
  promptCapabilities?: PromptCapabilities
): PromptCapabilities => ({
  think: Boolean(promptCapabilities?.think),
  search: Boolean(promptCapabilities?.search)
})

const deriveSessionTitle = (content: string) => {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '新对话'
  }

  return normalized.length > 12 ? `${normalized.slice(0, 12)}...` : normalized
}

const findLastUserMessageIndex = (messages: ChatMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index
    }
  }

  return -1
}

const findUserMessageIndexBeforeAssistant = (messages: ChatMessage[], assistantMessageId: string) => {
  const assistantIndex = messages.findIndex((message) => message.id === assistantMessageId)
  if (assistantIndex <= 0) {
    return -1
  }

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index
    }
  }

  return -1
}

const resolveThinkingStageTitle = (stageKey: string) => {
  switch (stageKey) {
    case 'llm_reasoning':
      return '模型推理'
    case 'deepsearch':
      return '深度思考'
    case 'web_search':
      return '网络搜索规划'
    default:
      return '思考过程'
  }
}

type WorkspaceChatContext = {
  sessions: ConversationSummary[]
  messagesBySession: Record<string, ChatMessage[]>
  activeSessionId: string
  selectedTrace: TraceDetail | null
  detailOpen: boolean
  loading: boolean
  error: string
  streamingStateBySession: Record<string, { messageId: string; runId: number }>
  streamingRunSeq: number
  regenerating: boolean
}

type WorkspaceChatMutations = {
  setSessions: (sessions: ConversationSummary[]) => void
  setMessagesBySession: (messagesBySession: Record<string, ChatMessage[]>) => void
  setActiveSessionId: (sessionId: string) => void
  setSelectedTrace: (trace: TraceDetail | null) => void
  setDetailOpen: (open: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
  setStreamingStateBySession: (
    state: Record<string, { messageId: string; runId: number }>
  ) => void
  setStreamingRunSeq: (seq: number) => void
  setRegenerating: (regenerating: boolean) => void
}

type WorkspaceChatComputed = {
  activeSession: ConversationSummary | null
  isStreaming: boolean
}

export const useWorkspaceChat = (
  context: WorkspaceChatContext,
  mutations: WorkspaceChatMutations,
  computedState: WorkspaceChatComputed
) => {
  const getMessageById = (sessionId: string, messageId: string) =>
    (context.messagesBySession[sessionId] ?? []).find((item) => item.id === messageId)

  const getStreamingState = (sessionId: string) => context.streamingStateBySession[sessionId] ?? null

  const setStreamingState = (sessionId: string, messageId: string, runId: number) => {
    mutations.setStreamingStateBySession({
      ...context.streamingStateBySession,
      [sessionId]: { messageId, runId }
    })
  }

  const clearStreamingState = (sessionId: string, messageId?: string) => {
    const current = context.streamingStateBySession[sessionId]
    if (!current || (messageId && current.messageId !== messageId)) {
      return
    }

    const nextState = { ...context.streamingStateBySession }
    delete nextState[sessionId]
    mutations.setStreamingStateBySession(nextState)
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
    mutations.setLoading(true)
    mutations.setError('')

    try {
      const nextSessions = await fetchWorkspaceSessions()
      mutations.setSessions(nextSessions)

      const defaultSessionId =
        nextSessions.find((item) => item.id === 'session-empty')?.id ?? nextSessions[0]?.id ?? ''

      mutations.setActiveSessionId(
        sessionId && nextSessions.some((item) => item.id === sessionId) ? sessionId : defaultSessionId
      )

      const nextMessagesBySession = { ...context.messagesBySession }

      await Promise.all(
        nextSessions.map(async (session) => {
          const messages = await fetchWorkspaceMessages(session.id)
          const hydratedMessages = hydrateCompletedMessages(messages)
          nextMessagesBySession[session.id] = hydratedMessages
          session.messageCount = hydratedMessages.length
        })
      )

      mutations.setMessagesBySession(nextMessagesBySession)
    } catch (caughtError) {
      mutations.setError(caughtError instanceof Error ? caughtError.message : '加载工作台失败')
    } finally {
      mutations.setLoading(false)
    }
  }

  const selectSession = async (sessionId: string) => {
    mutations.setActiveSessionId(sessionId)
    mutations.setSelectedTrace(null)
    mutations.setDetailOpen(false)

    if (!context.messagesBySession[sessionId]) {
      const messages = await fetchWorkspaceMessages(sessionId)
      const hydratedMessages = hydrateCompletedMessages(messages)
      const nextMessagesBySession = {
        ...context.messagesBySession,
        [sessionId]: hydratedMessages
      }

      mutations.setMessagesBySession(nextMessagesBySession)

      const session = context.sessions.find((item) => item.id === sessionId)
      if (session) {
        session.messageCount = hydratedMessages.length
      }
    }
  }

  const createNewSession = async () => {
    const session = await createConversation('新对话')
    mutations.setSessions([session, ...context.sessions])
    mutations.setMessagesBySession({
      ...context.messagesBySession,
      [session.id]: []
    })
    mutations.setActiveSessionId(session.id)
    return session
  }

  const openTrace = async (traceId?: string, openDrawer = true) => {
    if (!traceId) {
      mutations.setSelectedTrace(null)
      mutations.setDetailOpen(false)
      return
    }

    const trace = await fetchTraceDetail(traceId)
    mutations.setSelectedTrace(trace)
    mutations.setDetailOpen(openDrawer)
  }

  const finalizeStreamingMessage = (sessionId: string, messageId: string) => {
    const target = getMessageById(sessionId, messageId)
    if (!target) {
      return
    }

    if (target.responseFlow) {
      target.responseFlow.thinking = target.responseFlow.thinking.map((stage) => ({
        ...stage,
        title: resolveThinkingStageTitle(stage.stageKey),
        status: stage.status === 'error' ? 'error' : 'done',
        visibleContent: stage.visibleContent || stage.content
      }))

      target.responseFlow.tools = target.responseFlow.tools.map((tool) => ({
        ...tool,
        status: tool.status === 'error' ? 'error' : 'done',
        showInput: true,
        showSteps: true,
        showOutput: true,
        visibleInput: tool.visibleInput || tool.input,
        visibleOutput: tool.visibleOutput || tool.output,
        steps: tool.steps.map((step) => ({
          ...step,
          status:
            step.status === 'pending'
              ? 'success'
              : step.status === 'running'
                ? 'success'
                : step.status
        }))
      }))

      target.responseFlow.answer.status = 'done'
      target.responseFlow.answer.visibleContent =
        target.content || '回答已停止，最终内容未完全生成。'
      target.responseFlow.showActions = true
      target.content = target.responseFlow.answer.visibleContent
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

    for (let index = 0; index < flow.thinking.length; index += 1) {
      const stage = flow.thinking[index]
      stage.status = 'running'

      await sleep(index === 0 ? 360 : 140)

      if (!isRunActive(runId, sessionId, messageId)) {
        return
      }

      stage.title = resolveThinkingStageTitle(stage.stageKey)
      const completed = await typeText(
        stage.content,
        (value) => {
          stage.visibleContent = value
        },
        () => !isRunActive(runId, sessionId, messageId),
        1,
        stage.stageKey === 'deepsearch' ? 16 : 20
      )

      if (!completed || !isRunActive(runId, sessionId, messageId)) {
        return
      }

      stage.status = 'done'
    }

    for (const tool of flow.tools) {
      if (!isRunActive(runId, sessionId, messageId)) {
        return
      }

      tool.status = 'running'
      await sleep(160)

      tool.showInput = true
      const inputCompleted = await typeText(
        tool.input,
        (value) => {
          tool.visibleInput = value
        },
        () => !isRunActive(runId, sessionId, messageId),
        1,
        18
      )

      if (!inputCompleted || !isRunActive(runId, sessionId, messageId)) {
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
      const outputCompleted = await typeText(
        tool.output,
        (value) => {
          tool.visibleOutput = value
        },
        () => !isRunActive(runId, sessionId, messageId),
        1,
        18
      )

      if (!outputCompleted || !isRunActive(runId, sessionId, messageId)) {
        return
      }

      tool.status = 'done'
      await sleep(120)
    }

    if (!isRunActive(runId, sessionId, messageId)) {
      return
    }

    flow.answer.status = 'running'
    const answerCompleted = await typeText(
      flow.answer.content,
      (value) => {
        flow.answer.visibleContent = value
        target.content = value
      },
      () => !isRunActive(runId, sessionId, messageId),
      1,
      16
    )

    if (!answerCompleted || !isRunActive(runId, sessionId, messageId)) {
      return
    }

    flow.answer.status = 'done'
    flow.showActions = true
    target.status = 'done'
    clearStreamingState(sessionId, messageId)
  }

  const startAssistantReply = async (
    session: ConversationSummary,
    content: string,
    appendUserMessage: boolean,
    lastUserMessageIndex?: number,
    promptCapabilities?: PromptCapabilities
  ) => {
    const normalizedContent = content.trim()
    const normalizedCapabilities = normalizePromptCapabilities(promptCapabilities)

    if (!normalizedContent || getStreamingState(session.id)) {
      return
    }

    const sessionMessages = [...(context.messagesBySession[session.id] ?? [])]

    if (!appendUserMessage) {
      const targetUserIndex = lastUserMessageIndex ?? findLastUserMessageIndex(sessionMessages)
      if (targetUserIndex < 0) {
        return
      }
      sessionMessages.splice(targetUserIndex + 1)
    }

    if (appendUserMessage) {
      sessionMessages.push({
        id: `user-${Date.now()}`,
        role: 'user',
        content: normalizedContent,
        createdAt: new Date().toISOString(),
        status: 'done',
        promptCapabilities: normalizedCapabilities
      })
    }

    const placeholderId = `assistant-${Date.now() + 1}`
    sessionMessages.push({
      id: placeholderId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
      model: session.model,
      promptCapabilities: normalizedCapabilities,
      responseFlow: createThinkingPlaceholderFlow(normalizedCapabilities)
    })

    mutations.setMessagesBySession({
      ...context.messagesBySession,
      [session.id]: sessionMessages
    })

    if (appendUserMessage && session.messageCount === 0) {
      session.title = deriveSessionTitle(normalizedContent)
    }
    session.messageCount = sessionMessages.length
    session.updatedAt = new Date().toISOString()

    const runId = context.streamingRunSeq + 1
    mutations.setStreamingRunSeq(runId)
    setStreamingState(session.id, placeholderId, runId)

    try {
      const reply = await generateAssistantReply(session.id, normalizedContent, normalizedCapabilities)

      if (!isRunActive(runId, session.id, placeholderId)) {
        return
      }

      const target = getMessageById(session.id, placeholderId)
      if (!target) {
        return
      }

      const hydratedReply: ChatMessage = {
        ...reply,
        promptCapabilities: normalizePromptCapabilities(reply.promptCapabilities ?? normalizedCapabilities)
      }

      Object.assign(target, hydratedReply, {
        id: placeholderId,
        content: '',
        status: 'streaming',
        responseFlow: buildStreamingResponseFlow(hydratedReply)
      })

      await streamAssistantFlow(session.id, placeholderId, runId)
    } catch (caughtError) {
      const target = getMessageById(session.id, placeholderId)
      if (target) {
        const errorMessage = '生成回复时出现问题，请重试。'

        target.status = 'error'
        target.content = errorMessage
        target.responseFlow = {
          thinking: [
            {
              kind: 'thinking',
              id: `${placeholderId}-thinking-error`,
              stageKey: 'llm_reasoning',
              title: '思考过程',
              status: 'error',
              content: errorMessage,
              visibleContent: errorMessage
            }
          ],
          tools: [],
          answer: {
            kind: 'answer',
            title: '最终回答',
            status: 'error',
            content: errorMessage,
            visibleContent: errorMessage
          },
          showActions: true
        }
      }

      mutations.setError(caughtError instanceof Error ? caughtError.message : '发送消息失败')
      clearStreamingState(session.id, placeholderId)
    }
  }

  const sendMessage = async (content: string, promptCapabilities?: PromptCapabilities) => {
    const session = computedState.activeSession
    if (!session) {
      return
    }

    await startAssistantReply(session, content, true, undefined, promptCapabilities)
  }

  const stopStreaming = () => {
    const sessionId = context.activeSessionId
    const messageId = getStreamingState(sessionId)?.messageId

    if (!sessionId || !messageId) {
      return
    }

    finalizeStreamingMessage(sessionId, messageId)
  }

  const regenerateLastAnswer = async (assistantMessageId?: string) => {
    const session = computedState.activeSession
    if (!session || computedState.isStreaming || context.regenerating) {
      return
    }

    const sessionMessages = context.messagesBySession[session.id] ?? []
    const lastUserMessageIndex = assistantMessageId
      ? findUserMessageIndexBeforeAssistant(sessionMessages, assistantMessageId)
      : findLastUserMessageIndex(sessionMessages)
    const currentLastUserMessage =
      lastUserMessageIndex >= 0 ? sessionMessages[lastUserMessageIndex] : null
    if (!currentLastUserMessage) {
      return
    }

    mutations.setRegenerating(true)
    try {
      await startAssistantReply(
        session,
        currentLastUserMessage.content,
        false,
        lastUserMessageIndex,
        currentLastUserMessage.promptCapabilities ?? DEFAULT_PROMPT_CAPABILITIES
      )
    } finally {
      mutations.setRegenerating(false)
    }
  }

  return {
    bootstrap,
    selectSession,
    createNewSession,
    openTrace,
    sendMessage,
    stopStreaming,
    regenerateLastAnswer
  }
}
