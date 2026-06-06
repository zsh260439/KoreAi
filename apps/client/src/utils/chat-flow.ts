import type { AssistantResponseFlow, AssistantThinkingStage, ChatMessage } from '@/types'

const isWeatherMeetingFlow = (message: ChatMessage) => message.traceId === 'trace-weather-002'

const shouldRenderThinking = (message: ChatMessage) => Boolean(message.promptCapabilities?.think)

const buildWeatherThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => [
  {
    kind: 'thinking',
    id: `${message.id}-thinking-1`,
    stageKey: 'llm_reasoning',
    title: '理解问题',
    subtitle: '先锁定时间窗口和目标场景',
    status: 'done',
    content:
      '先把“明天下午”映射成明确的会务时间范围，并确认这个问题的目标不是泛泛查天气，而是要给会务安排提供可执行建议。',
    visibleContent:
      '先把“明天下午”映射成明确的会务时间范围，并确认这个问题的目标不是泛泛查天气，而是要给会务安排提供可执行建议。'
  },
  {
    kind: 'thinking',
    id: `${message.id}-thinking-2`,
    stageKey: 'deepsearch',
    title: '收敛判断',
    subtitle: '围绕降雨风险提炼关键决策点',
    status: 'done',
    content:
      '继续把注意力收敛到会务真正关心的风险点上：是否下雨、影响是否集中在会议时段、是否需要提前准备线上兜底方案。',
    visibleContent:
      '继续把注意力收敛到会务真正关心的风险点上：是否下雨、影响是否集中在会议时段、是否需要提前准备线上兜底方案。'
  },
  {
    kind: 'thinking',
    id: `${message.id}-thinking-3`,
    stageKey: 'llm_reasoning',
    title: '组织回答',
    subtitle: '把判断转成可执行建议',
    status: 'done',
    content:
      '最后不直接堆天气结论，而是转成会前通知、线上链接保留和遇雨切换说明这类更适合业务执行的表达。',
    visibleContent:
      '最后不直接堆天气结论，而是转成会前通知、线上链接保留和遇雨切换说明这类更适合业务执行的表达。'
  }
]

const buildDefaultThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => [
  {
    kind: 'thinking',
    id: `${message.id}-thinking-1`,
    stageKey: 'deepsearch',
    title: '拆解问题',
    subtitle: '先把问题拆成更小的子目标',
    status: 'done',
    content:
      '先判断用户到底要结果、解释还是方案，再把原问题拆成几个更容易处理的小问题，避免一开始就直接拼答案。',
    visibleContent:
      '先判断用户到底要结果、解释还是方案，再把原问题拆成几个更容易处理的小问题，避免一开始就直接拼答案。'
  },
  {
    kind: 'thinking',
    id: `${message.id}-thinking-2`,
    stageKey: 'llm_reasoning',
    title: '收敛重点',
    subtitle: '筛掉噪音，只保留关键判断',
    status: 'done',
    content:
      '把拆出来的信息重新归并，筛掉对回答帮助不大的分支，只保留真正影响结论的关键点和约束。',
    visibleContent:
      '把拆出来的信息重新归并，筛掉对回答帮助不大的分支，只保留真正影响结论的关键点和约束。'
  },
  {
    kind: 'thinking',
    id: `${message.id}-thinking-3`,
    stageKey: 'llm_reasoning',
    title: '组织表达',
    subtitle: '把结论整理成易读输出',
    status: 'done',
    content:
      '最后再把关键判断整理成更完整的回答，保证结果是连贯的，而不是只把中间推理碎片直接抛给用户。',
    visibleContent:
      '最后再把关键判断整理成更完整的回答，保证结果是连贯的，而不是只把中间推理碎片直接抛给用户。'
  }
]

const buildThinkingStages = (message: ChatMessage): AssistantThinkingStage[] => {
  if (isWeatherMeetingFlow(message)) {
    return buildWeatherThinkingStages(message)
  }

  if (!shouldRenderThinking(message)) {
    return []
  }

  return buildDefaultThinkingStages(message)
}

export const buildCompletedResponseFlow = (message: ChatMessage): AssistantResponseFlow => ({
  thinking: buildThinkingStages(message),
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
