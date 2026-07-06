import { ChatOpenAI } from '@langchain/openai'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { KnowledgeSearchHit } from 'share-type'
import {
  buildKnowledgeQaStreamingSystemPrompt,
  buildKnowledgeQaStreamingUserPrompt
} from './knowledge-qa.prompts'
import {
  createKnowledgeQaSectionStreamState,
  extractStreamingTextDelta,
  flushKnowledgeQaSectionedDelta,
  parseKnowledgeQaSectionedDelta
} from './knowledge-qa.parser'

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
    const stream = this.getClient().streamV2(
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

    const totalTokens = Promise.resolve(stream)
      .then((message) => normalizeTotalTokens(message.usage_metadata))
      .catch(() => null)

    //声明把底层模型流包装成上游可消费的标准事件流
    async function *run(): AsyncGenerator<KnowledgeQaStreamEvent> {
      const sectionStreamState = includeReasoning ? createKnowledgeQaSectionStreamState() : null

      for await (const event of stream) {
        const delta = extractStreamingTextDelta(event)
        if (!delta) {
          continue
        }

        if (!sectionStreamState) {
          yield {
            type: 'answer_delta',
            delta
          }
          continue
        }

        for (const sectionEvent of parseKnowledgeQaSectionedDelta(sectionStreamState, delta)) {
          yield sectionEvent
        }
      }

      if (sectionStreamState) {
        for (const sectionEvent of flushKnowledgeQaSectionedDelta(sectionStreamState)) {
          yield sectionEvent
        }
      }
    }

    return {
      stream: run(),
      totalTokens//此时还是pending状态的promise
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
