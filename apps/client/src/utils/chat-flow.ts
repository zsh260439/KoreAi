import type {
  AssistantResponseFlow,
  AssistantThinkingStage,
  AssistantToolIconKey,
  AssistantToolStage,
  AssistantToolStep
} from '@/types/chat-flow'
import type { ChatMessage, ToolCall } from '@/types/models'

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
    subtitle: '从知识库中检索相关依据',
    iconKey: 'knowledge'
  },
  time_lookup: {
    title: '时间解析',
    subtitle: '解析相对时间并校准目标时区',
    iconKey: 'time'
  },
  weather_lookup: {
    title: '天气查询',
    subtitle: '获取实时天气并提取关键结论',
    iconKey: 'weather'
  }
}

const buildThinkingText = (message: ChatMessage) => {
  const toolNames = new Set((message.toolCalls ?? []).map((item) => item.name))

  if (toolNames.has('knowledge_search')) {
    return '我正在分析您的问题，判断需要调用知识库检索相关制度文档，并提炼住宿与交通等关键条款作为回答依据。'
  }

  if (toolNames.has('time_lookup') || toolNames.has('weather_lookup')) {
    return '我正在拆解您的问题，先确认时间范围，再调用实时工具补充关键信息，最后整理成可执行建议。'
  }

  if (toolNames.size > 0) {
    return '我正在分析您的问题，判断需要调用外部工具补充信息，并在结果返回后组织最终回复。'
  }

  return '我正在分析您的问题，结合当前上下文提炼关键信息，并准备直接给出清晰结论。'
}

const buildThinkingStage = (message: ChatMessage): AssistantThinkingStage => {
  const content = buildThinkingText(message)

  return {
    kind: 'thinking',
    title: '思考过程',
    status: 'done',
    content,
    visibleContent: content
  }
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
  thinking: buildThinkingStage(message),
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
    thinking: {
      ...completed.thinking,
      title: '正在思考...',
      status: 'running',
      visibleContent: ''
    },
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

export const createThinkingPlaceholderFlow = (): AssistantResponseFlow => ({
  thinking: {
    kind: 'thinking',
    title: '正在思考...',
    status: 'running',
    content: '',
    visibleContent: ''
  },
  tools: [],
  answer: {
    kind: 'answer',
    title: '最终回答',
    status: 'pending',
    content: '',
    visibleContent: ''
  },
  showActions: false
})
