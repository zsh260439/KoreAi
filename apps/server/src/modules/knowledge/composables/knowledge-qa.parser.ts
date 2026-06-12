import { Parser } from 'htmlparser2'

//声明知识问答思考标签名
export const KNOWLEDGE_QA_THINK_TAG = 'koreai_think'

//声明知识问答答案标签名
export const KNOWLEDGE_QA_ANSWER_TAG = 'koreai_answer'

//声明知识问答流式标签事件结构
export type KnowledgeQaTaggedDeltaEvent =
  | {
      type: 'thinking_delta'
      delta: string
    }
  | {
      type: 'answer_delta'
      delta: string
    }

//声明知识问答流式标签解析状态
export type KnowledgeQaTagStreamState = {
  parser: Parser
  activeTag: typeof KNOWLEDGE_QA_THINK_TAG | typeof KNOWLEDGE_QA_ANSWER_TAG | null
  pendingEvents: KnowledgeQaTaggedDeltaEvent[]
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

//声明知识问答标签流解析状态构造器
export function createKnowledgeQaTagStreamState(): KnowledgeQaTagStreamState {
  const state: KnowledgeQaTagStreamState = {
    parser: null as unknown as Parser,
    activeTag: null,
    pendingEvents: []
  }

  state.parser = new Parser(
    {
      onopentag: (name) => {
        if (name === KNOWLEDGE_QA_THINK_TAG || name === KNOWLEDGE_QA_ANSWER_TAG) {
          state.activeTag = name
        }
      },
      ontext: (text) => {
        if (!text) {
          return
        }

        if (state.activeTag === KNOWLEDGE_QA_THINK_TAG) {
          pushKnowledgeQaTaggedDeltaEvent(state, 'thinking_delta', text)
          return
        }

        if (state.activeTag === KNOWLEDGE_QA_ANSWER_TAG) {
          pushKnowledgeQaTaggedDeltaEvent(state, 'answer_delta', text)
        }
      },
      onclosetag: (name) => {
        if (name === state.activeTag) {
          state.activeTag = null
        }
      }
    },
    {
      decodeEntities: true,//解析html实体
      lowerCaseTags: true,//将标签名转换为小写
    }
  )

  return state
}

//声明知识问答标签流增量解析器
export function parseKnowledgeQaTaggedDelta(
  state: KnowledgeQaTagStreamState,
  delta: string
): KnowledgeQaTaggedDeltaEvent[] {
  if (!delta) {
    return []
  }

  state.parser.write(delta)
  return takeKnowledgeQaTaggedDeltaEvents(state)
}

//声明知识问答标签流收尾解析器
export function flushKnowledgeQaTaggedDelta(
  state: KnowledgeQaTagStreamState
): KnowledgeQaTaggedDeltaEvent[] {
  state.parser.end()
  return takeKnowledgeQaTaggedDeltaEvents(state)
}

//声明知识问答标签事件入队逻辑
function pushKnowledgeQaTaggedDeltaEvent(
  state: KnowledgeQaTagStreamState,
  type: KnowledgeQaTaggedDeltaEvent['type'],
  delta: string
): void {
  if (!delta) {
    return
  }

  state.pendingEvents.push({
    type,
    delta
  })
}

//声明知识问答标签事件出队逻辑
function takeKnowledgeQaTaggedDeltaEvents(
  state: KnowledgeQaTagStreamState
): KnowledgeQaTaggedDeltaEvent[] {
  const events = state.pendingEvents.slice()
  state.pendingEvents.length = 0
  return events
}
