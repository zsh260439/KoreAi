import { AIMessageChunk } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { KnowledgeSearchHit } from 'share-type'
import {
  buildKnowledgeQaStreamingSystemPrompt,
  buildKnowledgeQaStreamingUserPrompt,
  FINAL_ANSWER_MARKER
} from './knowledge-qa.prompts'
import { extractStreamingMessageText } from './knowledge-qa.parser'

//声明知识问答流式事件结构
export type KnowledgeQaStreamEvent =
  | {
      type: 'thinking_delta'
      delta: string
    }
  | {
      type: 'answer_delta'
      delta: string
    }

//声明知识问答流式返回结构
type KnowledgeQaStreamResult = {
  stream: AsyncGenerator<KnowledgeQaStreamEvent>
  totalTokens: Promise<number | null>
}

//声明模型 usage 元数据结构
type UsageMetadata = {
  total_tokens?: number
}

//声明思考答案分流状态结构
type StreamSplitState = {
  mode: 'thinking' | 'answer'
  buffer: string
  thinkingContent: string
}

//声明协议残片列表
const PROTOCOL_ARTIFACTS = [
  FINAL_ANSWER_MARKER,
  '</koreai_final_answer>',
  '<koreai_finish>',
  '</koreai_finish>'
]

@Injectable()
export class KnowledgeQaService {
  //声明延迟复用的大模型客户端实例
  private client: ChatOpenAI | null = null

  //声明执行流式知识问答
  async streamAnswerQuestion(
    query: string,
    hits: KnowledgeSearchHit[],
    options: { includeReasoning?: boolean; signal?: AbortSignal } = {}
  ): Promise<KnowledgeQaStreamResult> {
    const includeReasoning = Boolean(options.includeReasoning)
    const stream = await this.getClient().stream(
      [
        {
          role: 'system',
          content: buildKnowledgeQaStreamingSystemPrompt(hits.length > 0)
        },
        {
          role: 'user',
          content: buildKnowledgeQaStreamingUserPrompt(query, hits, includeReasoning)
        }
      ],
      { signal: options.signal } as never
    )

    //声明流结束后统一回填总 token 数
    let resolveTotalTokens!: (totalTokens: number | null) => void
    const totalTokens = new Promise<number | null>((resolve) => {
      resolveTotalTokens = resolve
    })

    const self = this

    //声明把底层模型流包装成上游可消费的标准事件流
    async function *run(): AsyncGenerator<KnowledgeQaStreamEvent> {
      let combinedChunk: AIMessageChunk | null = null
      const splitState: StreamSplitState = {
        mode: includeReasoning ? 'thinking' : 'answer',
        buffer: '',
        thinkingContent: ''
      }

      try {
        for await (const chunk of stream) {
          combinedChunk = combinedChunk ? combinedChunk.concat(chunk) : chunk
          const delta = extractStreamingMessageText(chunk.content)
          if (!delta) {
            continue
          }

          if (!includeReasoning) {
            //声明普通模式也统一清理协议残片，避免尾标混入最终答案
            const cleanedAnswerDelta = stripProtocolArtifacts(delta)
            if (!cleanedAnswerDelta) {
              continue
            }

            yield {
              type: 'answer_delta',
              delta: cleanedAnswerDelta
            }
            continue
          }

          for (const event of splitThinkingAndAnswerDelta(splitState, delta)) {
            if (event.type === 'thinking_delta') {
              splitState.thinkingContent += event.delta
            }

            yield event
          }
        }

        for (const event of flushSplitThinkingAndAnswerDelta(splitState)) {
          if (event.type === 'thinking_delta') {
            splitState.thinkingContent += event.delta
          }

          yield event
        }
      } finally {
        resolveTotalTokens(self.extractTotalTokensFromChunk(combinedChunk))
      }
    }

    return {
      stream: run(),
      totalTokens
    }
  }

  //声明返回当前配置中的模型名
  getModelName(): string | null {
    return process.env.LLM_MODEL ?? null
  }

  //声明按需初始化并复用大模型客户端
  private getClient(): ChatOpenAI {
    if (this.client) {
      return this.client
    }

    const apiKey = process.env.LLM_API_KEY
    const model = process.env.LLM_MODEL

    //声明关键环境变量缺失时直接阻止链路继续执行
    if (!apiKey || !model) {
      throw new InternalServerErrorException('LLM API key or model not set')
    }

    this.client = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0.2,
      configuration: {
        baseURL: normalizeLlmBaseUrl(process.env.LLM_BASE_URL)
      }
    })

    return this.client
  }

  //声明从累计后的模型 chunk 中提取总 token
  private extractTotalTokensFromChunk(chunk: AIMessageChunk | null): number | null {
    return normalizeTotalTokens(chunk?.usage_metadata)
  }
}

//声明流式思考和答案分流逻辑
function splitThinkingAndAnswerDelta(
  state: StreamSplitState,
  delta: string
): KnowledgeQaStreamEvent[] {
  state.buffer += delta
  const events: KnowledgeQaStreamEvent[] = []

  while (state.buffer) {
    if (state.mode === 'answer') {
      //声明答案模式下保留协议残片前缀重叠，避免把结束标记透传到前端
      const overlapLength = longestArtifactPrefixSuffix(state.buffer, PROTOCOL_ARTIFACTS)
      const safeLength = Math.max(0, state.buffer.length - overlapLength)
      if (safeLength <= 0) {
        break
      }

      const answerDelta = stripProtocolArtifacts(state.buffer.slice(0, safeLength))
      state.buffer = state.buffer.slice(safeLength)
      if (answerDelta) {
        events.push({
          type: 'answer_delta',
          delta: answerDelta
        })
      }
      continue
    }

    const markerIndex = state.buffer.indexOf(FINAL_ANSWER_MARKER)
    if (markerIndex >= 0) {
      const thinkingDelta = state.buffer.slice(0, markerIndex)
      if (thinkingDelta) {
        events.push({
          type: 'thinking_delta',
          delta: trimLeadingThinkingNewline(state.thinkingContent, thinkingDelta)
        })
      }

      state.buffer = state.buffer.slice(markerIndex + FINAL_ANSWER_MARKER.length)
      state.buffer = state.buffer.replace(/^\r?\n+/, '')
      state.mode = 'answer'
      continue
    }

    const overlapLength = longestMarkerPrefixSuffix(state.buffer, FINAL_ANSWER_MARKER)
    const safeLength = Math.max(0, state.buffer.length - overlapLength)
    if (safeLength <= 0) {
      break
    }

    const thinkingDelta = trimLeadingThinkingNewline(
      state.thinkingContent,
      state.buffer.slice(0, safeLength)
    )
    state.buffer = state.buffer.slice(safeLength)
    if (thinkingDelta) {
      events.push({
        type: 'thinking_delta',
        delta: thinkingDelta
      })
    }
  }

  return events
}

//声明流结束后的思考和答案补发逻辑
function flushSplitThinkingAndAnswerDelta(state: StreamSplitState): KnowledgeQaStreamEvent[] {
  if (!state.buffer) {
    return []
  }

  const delta = state.mode === 'thinking'
    ? trimLeadingThinkingNewline(state.thinkingContent, state.buffer)
    : stripProtocolArtifacts(state.buffer)

  state.buffer = ''

  if (!delta) {
    return []
  }

  return [
    {
      type: state.mode === 'thinking' ? 'thinking_delta' : 'answer_delta',
      delta
    }
  ]
}

//声明思考首段换行规范化逻辑
function trimLeadingThinkingNewline(existingText: string, rawDelta: string): string {
  if (!rawDelta) {
    return ''
  }

  if (existingText) {
    return rawDelta
  }

  return rawDelta.replace(/^\r?\n+/, '')
}

//声明最终答案标记前缀重叠长度计算逻辑
function longestMarkerPrefixSuffix(value: string, marker: string): number {
  const maxLength = Math.min(value.length, marker.length - 1)

  for (let length = maxLength; length > 0; length -= 1) {
    if (value.endsWith(marker.slice(0, length))) {
      return length
    }
  }

  return 0
}

//声明协议残片前缀重叠长度计算逻辑
function longestArtifactPrefixSuffix(value: string, artifacts: string[]): number {
  return artifacts.reduce((maxLength, artifact) => {
    return Math.max(maxLength, longestMarkerPrefixSuffix(value, artifact))
  }, 0)
}

//声明协议残片清理逻辑
function stripProtocolArtifacts(value: string): string {
  let normalizedValue = value

  for (const artifact of PROTOCOL_ARTIFACTS) {
    normalizedValue = normalizedValue.split(artifact).join('')
  }

  return normalizedValue
}

//声明大模型基础地址规范化逻辑
function normalizeLlmBaseUrl(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  return value.replace(/\/chat\/completions\/?$/, '')
}

//声明 usage 总 token 规范化逻辑
function normalizeTotalTokens(usage?: UsageMetadata): number | null {
  const value = usage?.total_tokens
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
