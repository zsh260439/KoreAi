import type { ChatMessage, ConversationSummary, PromptCapabilities, ToolCall } from '@/types'
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
  search: Boolean(promptCapabilities?.search)
})

const trimPreview = (input: string, max = 72) => {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) {
    return normalized
  }

  return `${normalized.slice(0, max)}...`
}

const buildSyntheticToolCalls = (
  input: string,
  promptCapabilities: PromptCapabilities
): ToolCall[] => {
  const preview = trimPreview(input)
  const toolCalls: ToolCall[] = []
  const stamp = Date.now()

  if (promptCapabilities.think) {
    toolCalls.push({
      id: `tool-deepsearch-${stamp}`,
      name: 'deepsearch_reasoner',
      status: 'success',
      durationMs: 920,
      inputPreview: `prompt=${preview}`,
      outputPreview: '已完成问题拆解、关键取舍判断和回答方案收敛。',
      summary: '在生成回答前执行更长链路的推理。',
      steps: ['拆解问题目标', '评估关键取舍', '形成回答方案'],
      model: 'deepsearch',
      tokens: 268,
      phase: 'deepsearch'
    })
  }

  if (promptCapabilities.search) {
    toolCalls.push({
      id: `tool-search-${stamp + 1}`,
      name: 'web_search_mcp',
      status: 'success',
      durationMs: 640,
      inputPreview: `query=${preview}`,
      outputPreview: '已整理外部搜索结果，并提取出可用于回答的关键信息。',
      summary: '通过网络搜索补充外部上下文。',
      steps: ['改写搜索词', '拉取搜索结果', '筛选高价值信息'],
      tokens: 124,
      phase: 'mcp_web_search'
    })
  }

  return toolCalls
}

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

  if (promptCapabilities.think && promptCapabilities.search) {
    return {
      content:
        '我会先进行较长链路的推理，再结合网络搜索补充外部信息，最后整理成一版便于阅读的答案。这条回复主要用于演示前端里的思考过程、工具执行和正文输出顺序。',
      traceId: undefined
    }
  }

  if (promptCapabilities.think) {
    return {
      content:
        '我已经按深度思考方式把问题拆成更细的子问题，再收敛成一版更完整的回答。这条回复主要用于演示前端里的思考过程展示。',
      traceId: undefined
    }
  }

  if (promptCapabilities.search) {
    return {
      content:
        '我已经按网络搜索方式补充了外部上下文，再整理成简洁答案。这条回复主要用于演示前端里的搜索过程展示。',
      traceId: undefined
    }
  }

  return {
    content:
      '我已经根据当前上下文整理出一版直接答复。如果你需要，也可以切换到深度思考或网络搜索模式，看更完整的过程展示。',
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
  const syntheticToolCalls = buildSyntheticToolCalls(input, normalizedCapabilities)
  const detailToolCalls = detail?.toolExecutions ?? []
  const toolCalls = [...syntheticToolCalls, ...detailToolCalls]
  const syntheticLatency = syntheticToolCalls.reduce((total, tool) => total + tool.durationMs, 0)
  const syntheticInputTokens =
    (normalizedCapabilities.think ? 180 : 0) + (normalizedCapabilities.search ? 80 : 0)
  const syntheticOutputTokens =
    (normalizedCapabilities.think ? 72 : 0) + (normalizedCapabilities.search ? 48 : 0)

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
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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
