import type { ChatMessage, ConversationSummary, PromptCapabilities } from '@/types'
import {
  cloneMock,
  conversationMessages,
  conversationSummaries,
  traceDetails,
  wait
} from '@/utils'

const DEFAULT_PROMPT_CAPABILITIES: PromptCapabilities = {
  think: false,
  search: false
}

const normalizePromptCapabilities = (
  promptCapabilities?: PromptCapabilities
): PromptCapabilities => ({
  think: Boolean(promptCapabilities?.think),
  search: false
})

const buildAssistantReply = (input: string, promptCapabilities: PromptCapabilities) => {
  const lowerInput = input.toLowerCase()

  if (lowerInput.includes('天气') || lowerInput.includes('下雨') || lowerInput.includes('weather')) {
    return {
      content:
        '根据当前模拟天气链路，明天下午有中等概率降雨。建议保留线上会议链接，并在会前通知里说明遇雨时切换为线上方案。',
      traceId: 'trace-weather-002'
    }
  }

  if (lowerInput.includes('报销') || lowerInput.includes('制度') || lowerInput.includes('expense')) {
    return {
      content:
        '从当前制度问答链路看，住宿报销需要发票、入住清单和支付凭证；交通报销以高铁二等座和经济舱为标准，超标场景需要补充审批说明。',
      traceId: 'trace-finance-001'
    }
  }

  if (promptCapabilities.think) {
    return {
      content:
        '我已经按深度思考方式把问题拆成更细的子问题，再收敛成一版更完整的回答。这条回复主要用于演示前端里的思考过程展示。',
      traceId: undefined
    }
  }

  return {
    content:
      '我已经根据当前上下文整理出一版直接答复。如果你需要，我也可以切换到深度思考模式，先展示推理过程，再输出更完整的回答。',
    traceId: undefined
  }
}

export const fetchWorkspaceSessions = async () => {
  await wait()
  return cloneMock(conversationSummaries)
}

export const fetchWorkspaceMessages = async (sessionId: string) => {
  await wait()
  return cloneMock(conversationMessages[sessionId] ?? [])
}

export const generateAssistantReply = async (
  _sessionId: string,
  input: string,
  promptCapabilities: PromptCapabilities = DEFAULT_PROMPT_CAPABILITIES
) => {
  await wait(200)

  const normalizedCapabilities = normalizePromptCapabilities(promptCapabilities)
  const reply = buildAssistantReply(input, normalizedCapabilities)
  const detail = reply.traceId ? traceDetails[reply.traceId] : null
  const syntheticLatency = normalizedCapabilities.think ? 920 : 0
  const syntheticInputTokens = normalizedCapabilities.think ? 180 : 0
  const syntheticOutputTokens = normalizedCapabilities.think ? 72 : 0

  const template: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: reply.content,
    createdAt: new Date().toISOString(),
    status: 'done',
    traceId: reply.traceId,
    model: detail?.summary.model ?? 'AI',
    latencyMs: (detail?.summary.latencyMs ?? 1180) + syntheticLatency,
    inputTokens: (detail?.summary.inputTokens ?? 420) + syntheticInputTokens,
    outputTokens: (detail?.summary.outputTokens ?? 160) + syntheticOutputTokens,
    citations: detail?.citations,
    promptCapabilities: normalizedCapabilities
  }

  return cloneMock(template)
}

export const createConversation = async (title: string, model = 'AI') => {
  await wait(180)
  const session: ConversationSummary = {
    id: `session-${Date.now()}`,
    title,
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    model
  }

  return cloneMock(session)
}
