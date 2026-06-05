import type {
  AssistantResponseFlow,
  AssistantThinkingStage,
  AssistantToolIconKey,
  AssistantToolStage,
  AssistantToolStep,
  ChatMessage,
  ToolCall
} from '@/types'

const toolMetaMap: Record<
  string,
  {
    title: string
    subtitle: string
    iconKey: AssistantToolIconKey
  }
> = {
  knowledge_search: {
    title: '知识库检索',
    subtitle: '从知识库中检索相关片段',
    iconKey: 'knowledge'
  },
  time_lookup: {
    title: '时间解析',
    subtitle: '解析相对时间并确认目标时段',
    iconKey: 'time'
  },
  weather_lookup: {
    title: '天气查询',
    subtitle: '获取目标时段的天气信息',
    iconKey: 'weather'
  },
  web_search_mcp: {
    title: '联网搜索',
    subtitle: '通过搜索补充外部信息',
    iconKey: 'search'
  },
  deepsearch_reasoner: {
    title: '深度思考',
    subtitle: '在回答前延长推理链路',
    iconKey: 'thinking'
  }
}

const isWeatherMeetingFlow = (message: ChatMessage) =>
  message.traceId === 'trace-weather-002' ||
  Boolean(message.toolCalls?.some((tool) => tool.name === 'weather_lookup'))

const shouldRenderThinking = (message: ChatMessage) => Boolean(message.promptCapabilities?.think)

const buildThinkingContent = (message: ChatMessage) => {
  const capabilities = message.promptCapabilities ?? { think: false, search: false }

  if (isWeatherMeetingFlow(message)) {
    return {
      stageKey: 'llm_reasoning' as const,
      title: '思考过程',
      subtitle: '先确认时间窗口，再评估降雨风险并转成会务建议',
      content:
        '系统会先解析“明天下午”对应的具体时间窗口，并确认使用 Asia/Shanghai 时区；再查询上海未来 24 小时的小时级天气，重点关注 14:00 到 17:00 的降水概率、降雨类型和变化趋势；最后把天气风险转成会务建议，判断是否需要提前保留线上会议链接，并在通知中说明遇雨时切换为线上方案。'
    }
  }

  if (capabilities.think && capabilities.search) {
    return {
      stageKey: 'deepsearch' as const,
      title: '深度思考',
      subtitle: '先拆解问题，再决定后续工具调用',
      content:
        '系统会先拆解问题目标与约束，延长推理链路，再结合联网搜索补充外部信息，最后整理成一版更完整的回答。'
    }
  }

  if (capabilities.think) {
    return {
      stageKey: 'deepsearch' as const,
      title: '深度思考',
      subtitle: '先拆解问题，再组织回答',
      content: '系统会先把问题拆成更小的子问题，收敛出关键判断，再组织成更完整的回答。'
    }
  }

  return {
    stageKey: 'llm_reasoning' as const,
    title: '思考过程',
    subtitle: '结合上下文整理回答',
    content: '系统会先理解当前上下文，再直接组织回答内容。'
  }
}

const buildThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => {
  if (!shouldRenderThinking(message)) {
    return []
  }

  const thinking = buildThinkingContent(message)

  return [
    {
      kind: 'thinking',
      id: `${message.id}-thinking`,
      stageKey: thinking.stageKey,
      title: thinking.title,
      subtitle: thinking.subtitle,
      status: 'done',
      content: thinking.content,
      visibleContent: thinking.content
    }
  ]
}

const buildToolSteps = (toolCall: ToolCall): AssistantToolStep[] =>
  (toolCall.steps ?? []).map((label, index) => ({
    id: `${toolCall.id}-step-${index + 1}`,
    label,
    status: 'success'
  }))

const buildToolStage = (toolCall: ToolCall): AssistantToolStage => {
  const meta = toolMetaMap[toolCall.name] ?? {
    title: toolCall.name,
    subtitle: toolCall.summary || '工具执行',
    iconKey: 'generic' as const
  }

  return {
    kind: 'tool',
    id: toolCall.id,
    toolName: toolCall.name,
    title: meta.title,
    subtitle: toolCall.summary || meta.subtitle,
    iconKey: meta.iconKey,
    status: 'done',
    inputLabel: '工具输入',
    input: toolCall.inputPreview,
    visibleInput: toolCall.inputPreview,
    outputLabel: '工具输出',
    output: toolCall.outputPreview,
    visibleOutput: toolCall.outputPreview,
    durationMs: toolCall.durationMs,
    steps: buildToolSteps(toolCall),
    showInput: true,
    showSteps: true,
    showOutput: true,
    presentation:
      toolCall.presentation === 'compact-search' || toolCall.name === 'web_search_mcp'
        ? 'compact-search'
        : 'default',
    searchQuery: toolCall.searchQuery,
    resultCount: toolCall.resultCount ?? toolCall.searchResults?.length ?? 0,
    searchResults: toolCall.searchResults ?? []
  }
}

export const buildCompletedResponseFlow = (message: ChatMessage): AssistantResponseFlow => ({
  thinking: buildThinkingStages(message),
  tools: (message.toolCalls ?? []).map(buildToolStage),
  answer: {
    kind: 'answer',
    title: '最终回答',
    status: 'done',
    content: message.content,
    visibleContent: message.content
  },
  totalDurationMs: message.latencyMs,
  showActions: true
})

export const buildStreamingResponseFlow = (message: ChatMessage): AssistantResponseFlow => {
  const completed = buildCompletedResponseFlow(message)

  return {
    thinking: completed.thinking.map((stage) => ({
      ...stage,
      status: 'running',
      visibleContent: ''
    })),
    tools: completed.tools.map((tool) => ({
      ...tool,
      status: 'pending',
      visibleInput: '',
      visibleOutput: '',
      showInput: false,
      showSteps: false,
      showOutput: false,
      steps: tool.steps.map((step) => ({
        ...step,
        status: 'pending'
      }))
    })),
    answer: {
      ...completed.answer,
      status: 'pending',
      visibleContent: ''
    },
    totalDurationMs: completed.totalDurationMs,
    showActions: false
  }
}

export const createThinkingPlaceholderFlow = (
  promptCapabilities: { think: boolean; search: boolean } = { think: false, search: false }
): AssistantResponseFlow => {
  const stages = buildThinkingStages({
    id: 'thinking-placeholder',
    role: 'assistant',
    content: '',
    createdAt: '',
    status: 'streaming',
    promptCapabilities
  } as ChatMessage)

  return {
    thinking: stages.map((stage, index) => ({
      ...stage,
      id: `thinking-placeholder-${index + 1}`,
      status: 'running',
      visibleContent: ''
    })),
    tools: [],
    answer: {
      kind: 'answer',
      title: '最终回答',
      status: 'pending',
      content: '',
      visibleContent: ''
    },
    showActions: false
  }
}
