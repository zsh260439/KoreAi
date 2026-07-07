import { ChatOpenAI } from '@langchain/openai'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { KnowledgeQaDeltaEvent, KnowledgeSearchHit } from 'share-type'
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

export type KnowledgeQaStreamEvent = KnowledgeQaDeltaEvent

type KnowledgeQaStreamResult = {
  stream: AsyncGenerator<KnowledgeQaStreamEvent>
  totalTokens: Promise<number | null>
}

type UsageMetadata = {
  total_tokens?: number
}

@Injectable()
export class KnowledgeQaService {
  private client: ChatOpenAI | null = null

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
      totalTokens
    }
  }

  getModelName(): string | null {
    return process.env.LLM_MODEL ?? null
  }

  private getClient(): ChatOpenAI {
    if (this.client) {
      return this.client
    }

    const apiKey = process.env.LLM_API_KEY
    const model = process.env.LLM_MODEL
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

function normalizeLlmBaseUrl(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  return value.replace(/\/chat\/completions\/?$/, '')
}

function normalizeTotalTokens(usage?: UsageMetadata): number | null {
  const value = usage?.total_tokens
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
