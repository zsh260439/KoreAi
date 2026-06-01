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
    subtitle: '解析相对时间和目标时区',
    iconKey: 'time'
  },
  weather_lookup: {
    title: '天气查询',
    subtitle: '获取目标时间范围内的天气信息',
    iconKey: 'weather'
  },
  web_search_mcp: {
    title: '网络搜索',
    subtitle: '通过 MCP 搜索获取当前网络结果',
    iconKey: 'search'
  },
  deepsearch_reasoner: {
    title: '深度思考',
    subtitle: '在生成答案前进行更深层推理',
    iconKey: 'thinking'
  }
}

const buildThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => {
  const stages: AssistantThinkingStage[] = []
  const capabilities = message.promptCapabilities ?? { think: false, search: false }

  stages.push({
    kind: 'thinking',
    id: `${message.id}-thinking-llm`,
    stageKey: 'llm_reasoning',
    title: '模型推理',
    subtitle: '拆解任务并规划回答路径',
    status: 'done',
    content: capabilities.think
      ? '系统会先拆解目标、约束和证据需求，再组织更长的推理链路来形成回答。'
      : '系统会先结合当前上下文理解问题，再组织直接回答。',
    visibleContent: capabilities.think
      ? '系统会先拆解目标、约束和证据需求，再组织更长的推理链路来形成回答。'
      : '系统会先结合当前上下文理解问题，再组织直接回答。'
  })

  if (capabilities.think) {
    stages.push({
      kind: 'thinking',
      id: `${message.id}-thinking-deepsearch`,
      stageKey: 'deepsearch',
      title: '深度思考',
      subtitle: '调用深度思考能力',
      status: 'done',
      content:
        '深度思考会把问题扩展成多个子问题，评估取舍，再收敛出更稳的结论后生成回复。',
      visibleContent:
        '深度思考会把问题扩展成多个子问题，评估取舍，再收敛出更稳的结论后生成回复。'
    })
  }

  if (capabilities.search) {
    stages.push({
      kind: 'thinking',
      id: `${message.id}-thinking-search`,
      stageKey: 'web_search',
      title: '网络搜索规划',
      subtitle: '准备 MCP 搜索请求并收集外部信息',
      status: 'done',
      content:
        '系统会先准备搜索查询，再收集外部结果，并依据返回证据来约束最终回答。',
      visibleContent:
        '系统会先准备搜索查询，再收集外部结果，并依据返回证据来约束最终回答。'
    })
  }

  return stages
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
    showOutput: true
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
    thinking: completed.thinking.map((stage, index) => ({
      ...stage,
      title: index === 0 ? '思考中...' : stage.title,
      status: index === 0 ? 'running' : 'pending',
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
      title: index === 0 ? '思考中...' : stage.title,
      status: index === 0 ? 'running' : 'pending',
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
