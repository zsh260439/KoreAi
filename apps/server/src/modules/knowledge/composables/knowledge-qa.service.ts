import { AIMessageChunk } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { KnowledgeSearchHit } from 'share-type'
import {
  buildKnowledgeQaStreamingSystemPrompt,
  buildKnowledgeQaStreamingUserPrompt
} from './knowledge-qa.prompts'
import {
  extractStreamingMessageText,
  StructuredAnswerStreamParser,
  type KnowledgeQaStreamEvent
} from './knowledge-qa.parser'

export type { KnowledgeQaStreamEvent } from './knowledge-qa.parser'

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

    //声明流结束后再统一回填总 token 数
    let resolveTotalTokens!: (totalTokens: number | null) => void
    const totalTokens = new Promise<number | null>((resolve) => {
      resolveTotalTokens = resolve
    })
    const self = this

    //声明把底层模型流包装成上游可消费的标准事件流
    async function *run(): AsyncGenerator<KnowledgeQaStreamEvent> {
      let combinedChunk: AIMessageChunk | null = null

      try {
        //声明普通模式只持续输出答案增量事件
        if (!includeReasoning) {
          for await (const chunk of stream) {
            combinedChunk = combinedChunk ? combinedChunk.concat(chunk) : chunk
            const delta = extractStreamingMessageText(chunk.content)
            if (delta) {
              yield {
                type: 'answer_delta',
                delta
              }
            }
          }

          return
        }

        //声明思考模式通过结构化解析器拆分推理事件和答案事件
        const parser = new StructuredAnswerStreamParser()

        for await (const chunk of stream) {
          combinedChunk = combinedChunk ? combinedChunk.concat(chunk) : chunk
          const delta = extractStreamingMessageText(chunk.content)
          if (!delta) {
            continue
          }

          for (const event of parser.push(delta)) {
            yield event
          }
        }

        //声明流结束后继续冲刷解析器缓冲区里的尾部事件
        for (const event of parser.flush()) {
          yield event
        }
      } finally {
        //声明无论正常结束还是中断都回填最终 token 数
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
