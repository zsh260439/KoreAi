import type {
  AssistantSearchResultItem,
  ChatMessage,
  ConversationSummary,
  PromptCapabilities,
  ToolCall
} from '@/types'
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

const buildMockSearchResults = (input: string): AssistantSearchResultItem[] => {
  const normalized = input.replace(/\s+/g, ' ').trim() || '当前问题'
  const lowerInput = normalized.toLowerCase()

  if (lowerInput.includes('天气') || lowerInput.includes('下雨') || lowerInput.includes('weather')) {
    return [
      {
        id: 'search-weather-1',
        source: '中央气象台',
        publishedAt: '2026/06/06',
        title: '上海未来 24 小时降水趋势',
        snippet: '包含 14:00 到 17:00 的小时级降水概率、云量与风速变化。'
      },
      {
        id: 'search-weather-2',
        source: '上海天气网',
        publishedAt: '2026/06/06',
        title: '浦东与徐汇午后雷阵雨风险对比',
        snippet: '对比上海主要城区的午后阵雨强度与持续时间。'
      },
      {
        id: 'search-weather-3',
        source: '和讯网',
        publishedAt: '2026/06/05',
        title: '会务场景遇雨应急方案整理',
        snippet: '总结线下会议在降雨天气下切换线上方案的注意事项。'
      },
      {
        id: 'search-weather-4',
        source: '澎湃新闻',
        publishedAt: '2026/06/05',
        title: '上海周末对流天气提醒',
        snippet: '提示短时强降水时段，适合作为会前通知补充。'
      },
      {
        id: 'search-weather-5',
        source: '界面新闻',
        publishedAt: '2026/06/04',
        title: '大型活动天气预警与会务组织建议',
        snippet: '介绍活动组织方如何根据实时天气调整签到、入场和会议链接。'
      },
      {
        id: 'search-weather-6',
        source: '中国天气',
        publishedAt: '2026/06/06',
        title: '上海 15 时逐小时天气预报',
        snippet: '提供会议核心时段的天气图示与降雨概率。'
      },
      {
        id: 'search-weather-7',
        source: '人民网',
        publishedAt: '2026/06/03',
        title: '企业会议通知如何加入天气兜底说明',
        snippet: '总结会务通知中对天气、交通和线上切换方案的表达方式。'
      },
      {
        id: 'search-weather-8',
        source: '东方网',
        publishedAt: '2026/06/06',
        title: '上海主城区午后短时阵雨提醒',
        snippet: '说明午后时段局地阵雨和道路通行影响。'
      },
      {
        id: 'search-weather-9',
        source: '网易新闻',
        publishedAt: '2026/06/05',
        title: '会议现场遇雨切换线上需要准备什么',
        snippet: '整理线上会议链接、群通知和签到方式的切换动作。'
      },
      {
        id: 'search-weather-10',
        source: '腾讯新闻',
        publishedAt: '2026/06/05',
        title: '会务天气提醒模板示例',
        snippet: '可直接参考的天气提醒文案和会前通知结构。'
      }
    ]
  }

  if (
    lowerInput.includes('思考') ||
    lowerInput.includes('搜索') ||
    lowerInput.includes('联网') ||
    lowerInput.includes('deepseek')
  ) {
    return [
      {
        id: 'search-ai-1',
        source: '百度开发者中心',
        publishedAt: '2025/09/26',
        title: '深度思考与联网搜索的差异化价值',
        snippet: '解释深度推理与外部信息检索在复杂问答中的职责边界。'
      },
      {
        id: 'search-ai-2',
        source: '科普中国',
        publishedAt: '2025/10/17',
        title: 'AI 推理模式与直接回答模式对比',
        snippet: '从用户视角介绍推理型回答与普通回答的区别。'
      },
      {
        id: 'search-ai-3',
        source: '百度智能云',
        publishedAt: '2025/10/15',
        title: '深度思考与联网搜索功能适配指南',
        snippet: '概述两类模式在不同场景下的组合方式。'
      },
      {
        id: 'search-ai-4',
        source: '机器之心',
        publishedAt: '2025/09/18',
        title: '检索增强生成中的推理链位置',
        snippet: '说明检索、推理和回答生成之间的顺序关系。'
      },
      {
        id: 'search-ai-5',
        source: 'InfoQ',
        publishedAt: '2025/09/30',
        title: 'RAG 系统如何展示工具调用过程',
        snippet: '介绍前端如何表达工具执行、搜索结果和最终回答。'
      },
      {
        id: 'search-ai-6',
        source: '掘金',
        publishedAt: '2025/10/08',
        title: '多阶段问答界面的流式交互设计',
        snippet: '讨论思考、检索和答案输出的前端串联方式。'
      },
      {
        id: 'search-ai-7',
        source: '知乎专栏',
        publishedAt: '2025/09/21',
        title: '为什么搜索结果不一定需要单独气泡卡片',
        snippet: '分析紧凑型搜索状态条在问答产品中的优势。'
      },
      {
        id: 'search-ai-8',
        source: 'B 站技术',
        publishedAt: '2025/10/02',
        title: '大模型思考模式的可视化方案',
        snippet: '汇总常见的推理折叠面板和工具状态展示方式。'
      },
      {
        id: 'search-ai-9',
        source: '开源中国',
        publishedAt: '2025/10/11',
        title: '前端如何承接搜索面板与结果抽屉',
        snippet: '介绍消息区点击态与右侧抽屉联动。'
      },
      {
        id: 'search-ai-10',
        source: 'CSDN',
        publishedAt: '2025/10/09',
        title: '流式响应中的搜索结果预埋数据设计',
        snippet: '讨论如何在 mock 数据里为搜索行附带结构化结果列表。'
      }
    ]
  }

  return Array.from({ length: 10 }, (_, index) => ({
    id: `search-generic-${index + 1}`,
    source: ['百度开发者中心', 'InfoQ', '掘金', '机器之心', '知乎专栏'][index % 5],
    publishedAt: `2026/06/${String((index % 6) + 1).padStart(2, '0')}`,
    title: `${normalized} - 结果 ${index + 1}`,
    snippet: `围绕“${normalized}”整理出的第 ${index + 1} 条网页摘要，用于模拟外部搜索结果面板。`
  }))
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
    const searchResults = buildMockSearchResults(input)

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
      phase: 'mcp_web_search',
      presentation: 'compact-search',
      searchQuery: input.trim(),
      resultCount: searchResults.length,
      searchResults
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
