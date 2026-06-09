import type {
  KnowledgeReasoningStepKey,
  ReasoningStepMeta
} from 'share-type'

//声明知识问答流式事件结构
export type KnowledgeQaStreamEvent =
  | {
      type: 'reasoning_step_started'
      index: number
      step: ReasoningStepMeta
    }
  | {
      type: 'reasoning_step_delta'
      index: number
      delta: string
    }
  | {
      type: 'reasoning_step_completed'
      index: number
      content: string
    }
  | {
      type: 'answer_delta'
      delta: string
    }

//声明推理步骤局部元信息结构
interface PartialReasoningStepMeta {
  stageKey?: KnowledgeReasoningStepKey
  title?: string
  subtitle?: string
}

const STEP_OPEN_TAG = '<koreai_reasoning_step>'
const STAGE_KEY_OPEN_TAG = '<koreai_stage_key>'
const STAGE_KEY_CLOSE_TAG = '</koreai_stage_key>'
const TITLE_OPEN_TAG = '<koreai_title>'
const TITLE_CLOSE_TAG = '</koreai_title>'
const SUBTITLE_OPEN_TAG = '<koreai_subtitle>'
const SUBTITLE_CLOSE_TAG = '</koreai_subtitle>'
const CONTENT_OPEN_TAG = '<koreai_content>'
const CONTENT_CLOSE_TAG = '</koreai_content>'
const FINAL_ANSWER_OPEN_TAG = '<koreai_final_answer>'
const FINAL_ANSWER_CLOSE_TAG = '</koreai_final_answer>'

//声明结构化思考流解析器
export class StructuredAnswerStreamParser {
  //声明流式解析缓冲区
  private buffer = ''

  //声明原始流式输出缓存
  private rawOutput = ''

  //声明当前解析状态机模式
  private mode: 'seeking' | 'step_meta' | 'step_content' | 'answer' = 'seeking'

  //声明是否已经检测到结构化协议内容
  private hasStructuredContent = false

  //声明当前推理步骤下标
  private currentStepIndex = -1

  //声明当前步骤元信息缓存
  private currentStepMeta: PartialReasoningStepMeta | null = null

  //声明当前步骤正文缓存
  private currentStepContent = ''

  //声明当前答案正文缓存
  private currentAnswer = ''

  //声明持续接收模型增量并拆解为事件
  push(chunk: string): KnowledgeQaStreamEvent[] {
    if (!chunk) {
      return []
    }

    this.buffer += chunk
    this.rawOutput += chunk
    const events: KnowledgeQaStreamEvent[] = []

    while (true) {
      //声明在 seeking 模式下持续寻找下一个结构化标签起点
      if (this.mode === 'seeking') {
        const nextStepIndex = this.buffer.indexOf(STEP_OPEN_TAG)
        const nextAnswerIndex = this.buffer.indexOf(FINAL_ANSWER_OPEN_TAG)
        const nextStructuredIndex = firstTagIndex(nextStepIndex, nextAnswerIndex)

        if (nextStructuredIndex < 0) {
          this.buffer = keepTrailingBuffer(this.buffer, 256)
          break
        }

        if (nextStructuredIndex > 0) {
          this.buffer = this.buffer.slice(nextStructuredIndex)
          continue
        }

        if (nextStepIndex === 0) {
          this.hasStructuredContent = true
          this.buffer = this.buffer.slice(STEP_OPEN_TAG.length)
          this.currentStepMeta = {}
          this.currentStepContent = ''
          this.mode = 'step_meta'
          continue
        }

        this.hasStructuredContent = true
        this.buffer = this.buffer.slice(FINAL_ANSWER_OPEN_TAG.length)
        this.currentAnswer = ''
        this.mode = 'answer'
        continue
      }

      //声明在 step_meta 模式下读取步骤元信息
      if (this.mode === 'step_meta') {
        const contentStartIndex = this.buffer.indexOf(CONTENT_OPEN_TAG)
        if (contentStartIndex < 0) {
          this.buffer = keepTrailingBuffer(this.buffer, 1024)
          break
        }

        const metaSource = this.buffer.slice(0, contentStartIndex)
        this.currentStepIndex += 1

        const stageKey = normalizeReasoningStageKey(
          extractTagValue(metaSource, STAGE_KEY_OPEN_TAG, STAGE_KEY_CLOSE_TAG),
          this.currentStepIndex
        )
        const title =
          toNonEmptyString(extractTagValue(metaSource, TITLE_OPEN_TAG, TITLE_CLOSE_TAG)) ??
          defaultReasoningTitle(stageKey, this.currentStepIndex)
        const subtitle = toNonEmptyString(
          extractTagValue(metaSource, SUBTITLE_OPEN_TAG, SUBTITLE_CLOSE_TAG)
        )

        this.currentStepMeta = {
          stageKey,
          title,
          subtitle: subtitle ?? undefined
        }
        this.currentStepContent = ''
        this.buffer = this.buffer.slice(contentStartIndex + CONTENT_OPEN_TAG.length)
        this.mode = 'step_content'

        events.push({
          type: 'reasoning_step_started',
          index: this.currentStepIndex,
          step: {
            stageKey,
            title,
            subtitle: subtitle ?? undefined
          }
        })

        continue
      }

      //声明在 step_content 模式下抽取推理正文增量
      if (this.mode === 'step_content') {
        const result = pullDelimitedText(this.buffer, CONTENT_CLOSE_TAG, this.currentStepContent)
        if (result.delta) {
          this.currentStepContent += result.delta
          events.push({
            type: 'reasoning_step_delta',
            index: this.currentStepIndex,
            delta: result.delta
          })
        }

        this.buffer = result.rest

        if (!result.completed) {
          break
        }

        events.push({
          type: 'reasoning_step_completed',
          index: this.currentStepIndex,
          content: this.currentStepContent.trim()
        })

        this.currentStepMeta = null
        this.currentStepContent = ''
        this.mode = 'seeking'
        continue
      }

      //声明在 answer 模式下抽取答案正文增量
      const result = pullDelimitedText(this.buffer, FINAL_ANSWER_CLOSE_TAG, this.currentAnswer)
      if (result.delta) {
        this.currentAnswer += result.delta
        events.push({
          type: 'answer_delta',
          delta: result.delta
        })
      }

      this.buffer = result.rest

      if (!result.completed) {
        break
      }

      this.mode = 'seeking'
    }

    return events
  }

  //声明在流结束时冲刷缓冲区尾部内容
  flush(): KnowledgeQaStreamEvent[] {
    const events: KnowledgeQaStreamEvent[] = []

    //声明如果模型未按结构化协议输出则退化为整段答案
    if (!this.hasStructuredContent) {
      const fallbackAnswer = this.rawOutput.trim()
      if (fallbackAnswer) {
        events.push({
          type: 'answer_delta',
          delta: fallbackAnswer
        })
      }

      return events
    }

    //声明如果停在推理正文阶段则补发最后的步骤增量和完成事件
    if (this.mode === 'step_content') {
      const trailing = normalizeLeadingStreamText(this.currentStepContent, this.buffer)
      if (trailing) {
        this.currentStepContent += trailing
        events.push({
          type: 'reasoning_step_delta',
          index: this.currentStepIndex,
          delta: trailing
        })
      }

      if (this.currentStepContent.trim()) {
        events.push({
          type: 'reasoning_step_completed',
          index: this.currentStepIndex,
          content: this.currentStepContent.trim()
        })
      }

      this.buffer = ''
      return events
    }

    //声明如果停在答案阶段则补发最后的答案增量
    if (this.mode === 'answer') {
      const trailing = normalizeLeadingStreamText(this.currentAnswer, this.buffer)
      if (trailing) {
        events.push({
          type: 'answer_delta',
          delta: trailing
        })
      }
    }

    this.buffer = ''
    return events
  }
}

//声明流式消息文本提取器
export function extractStreamingMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (!item || typeof item !== 'object') {
        return ''
      }

      const text = (item as { text?: unknown }).text
      if (typeof text === 'string') {
        return text
      }

      const reasoning = (item as { reasoning?: unknown }).reasoning
      return typeof reasoning === 'string' ? reasoning : ''
    })
    .join('')
}

//声明推理阶段键规范化逻辑
function normalizeReasoningStageKey(
  value: unknown,
  index: number
): KnowledgeReasoningStepKey {
  if (value === 'deepsearch' || value === 'llm_reasoning' || value === 'web_search') {
    return value
  }

  return index === 0 ? 'deepsearch' : 'llm_reasoning'
}

//声明默认推理标题生成逻辑
function defaultReasoningTitle(stageKey: KnowledgeReasoningStepKey, index: number): string {
  switch (stageKey) {
    case 'deepsearch':
      return index === 0 ? 'Break Down the Problem' : 'Narrow the Question'
    case 'web_search':
      return 'Review External Evidence'
    default:
      return index === 0 ? 'Analyze the Request' : 'Synthesize the Answer'
  }
}

//声明非空字符串提取逻辑
function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

//声明标签值提取逻辑
function extractTagValue(source: string, openTag: string, closeTag: string): string | null {
  const startIndex = source.indexOf(openTag)
  const endIndex = source.indexOf(closeTag)

  if (startIndex < 0 || endIndex <= startIndex) {
    return null
  }

  return source.slice(startIndex + openTag.length, endIndex).trim()
}

//声明最早有效标签位置查找逻辑
function firstTagIndex(...values: number[]): number {
  const candidates = values.filter((value) => value >= 0)
  return candidates.length ? Math.min(...candidates) : -1
}

//声明尾部缓冲保留逻辑
function keepTrailingBuffer(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return value.slice(-maxLength)
}

//声明按结束标签抽取流式文本逻辑
function pullDelimitedText(
  buffer: string,
  closingTag: string,
  existingText: string
): {
  delta: string
  rest: string
  completed: boolean
} {
  const closeIndex = buffer.indexOf(closingTag)

  if (closeIndex >= 0) {
    const rawDelta = buffer.slice(0, closeIndex)
    return {
      delta: normalizeLeadingStreamText(existingText, rawDelta),
      rest: buffer.slice(closeIndex + closingTag.length),
      completed: true
    }
  }

  const overlapLength = longestClosingTagPrefixSuffix(buffer, closingTag)
  const safeLength = Math.max(0, buffer.length - overlapLength)
  const rawDelta = buffer.slice(0, safeLength)

  return {
    delta: normalizeLeadingStreamText(existingText, rawDelta),
    rest: buffer.slice(safeLength),
    completed: false
  }
}

//声明结束标签前缀重叠长度计算逻辑
function longestClosingTagPrefixSuffix(value: string, closingTag: string): number {
  const maxLength = Math.min(value.length, closingTag.length - 1)

  for (let length = maxLength; length > 0; length -= 1) {
    if (value.endsWith(closingTag.slice(0, length))) {
      return length
    }
  }

  return 0
}

//声明首段流式文本规范化逻辑
function normalizeLeadingStreamText(existingText: string, rawDelta: string): string {
  if (!rawDelta) {
    return ''
  }

  if (existingText) {
    return rawDelta
  }

  return rawDelta.replace(/^\r?\n/, '')
}
