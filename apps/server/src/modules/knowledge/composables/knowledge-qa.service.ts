import { ChatOpenAI } from '@langchain/openai'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { KnowledgeQaDeltaEvent, KnowledgeSearchDebugInfo, KnowledgeSearchHit } from 'share-type'
import { extractKnowledgeEvidenceFacts } from './knowledge-evidence-fact-extractor'
import {
  hasPotentialKnowledgeAnswerGap,
  selectMoreCompleteKnowledgeAnswer
} from './knowledge-qa-answer-validation'
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

const FACTUAL_QA_TEMPERATURE = 0
const QA_STREAM_MAX_ATTEMPTS = 2

@Injectable()
export class KnowledgeQaService {
  async streamAnswerQuestion(
    query: string,
    hits: KnowledgeSearchHit[],
    options: {
      includeReasoning?: boolean
      signal?: AbortSignal
      temperature?: number
      evidenceGateStatus?: 'pass' | 'degraded' | 'blocked'
      evidenceCoverage?: number
      retrievalDebug?: KnowledgeSearchDebugInfo | null
    } = {}
  ): Promise<KnowledgeQaStreamResult> {
    const includeReasoning = Boolean(options.includeReasoning)
    const evidenceFacts = extractKnowledgeEvidenceFacts({
      query,
      hits,
      debug: options.retrievalDebug
    })
    const messages = [
      {
        role: 'system',
        content: buildKnowledgeQaStreamingSystemPrompt(hits.length > 0, options.evidenceGateStatus)
      },
      {
        role: 'user',
        content: buildKnowledgeQaStreamingUserPrompt(
          query,
          hits,
          includeReasoning,
          {
            evidenceGateStatus: options.evidenceGateStatus,
            evidenceCoverage: options.evidenceCoverage,
            evidenceFacts
          }
        )
      }
    ]

    let resolveTotalTokens: (value: number | null) => void = () => {}
    let totalTokensResolved = false
    const totalTokens = new Promise<number | null>((resolve) => {
      resolveTotalTokens = resolve
    })
    const createQaStream = () =>
      this.createClient(options.temperature).streamV2(
        messages,
        { signal: options.signal } as never
      )
    const repairAnswerWithLlm = async (draft: string): Promise<string> => {
      if (!hasPotentialKnowledgeAnswerGap(query, draft, evidenceFacts)) {
        return draft
      }

      try {
        const message = await this.createClient(options.temperature).invoke([
          {
            role: 'system',
            content: [
              'You are a factual answer editor for a retrieval-augmented question answering system.',
              'Rewrite the draft using only the user question and verified evidence facts.',
              'Include every fact explicitly requested by the user when it is supported by the evidence.',
              'Remove unsupported or unrequested facts.',
              'Evaluate each fact independently and never transfer an exact value to another fact or subject.',
              'Do not declare a requested item missing when a verified fact directly contains its value.',
              'Preserve exact identifiers, labels, roles, numbers, conditions, and time scopes from the evidence.',
              'A descriptive paraphrase is incomplete when the evidence provides a machine-readable identifier for the requested item.',
              'Do not use general knowledge or infer missing values.',
              'Return only the corrected final answer without analysis or wrapper headings.'
            ].join('\n')
          },
          {
            role: 'user',
            content: [
              `User question:\n${query}`,
              `Verified evidence facts:\n${formatEvidenceFactsForRepair(evidenceFacts)}`
            ].join('\n\n')
          }
        ])
        const content = normalizeMessageContent(message.content).trim() || draft
        return selectMoreCompleteKnowledgeAnswer(draft, content, evidenceFacts)
      } catch {
        return draft
      }
    }

    async function *run(): AsyncGenerator<KnowledgeQaStreamEvent> {
      let latestTotalTokens: number | null = null

      try {
        for (let attempt = 1; attempt <= QA_STREAM_MAX_ATTEMPTS; attempt += 1) {
          const stream = createQaStream()
          const sectionStreamState = includeReasoning ? createKnowledgeQaSectionStreamState() : null
          const bufferedEvents: KnowledgeQaStreamEvent[] = []
          let hasAnswerDelta = false

          for await (const event of stream) {
            const delta = extractStreamingTextDelta(event)
            if (!delta) {
              continue
            }

            if (!sectionStreamState) {
              hasAnswerDelta = true
              bufferedEvents.push({
                type: 'answer_delta',
                delta
              })
              continue
            }

            for (const sectionEvent of parseKnowledgeQaSectionedDelta(sectionStreamState, delta)) {
              if (sectionEvent.type === 'answer_delta') {
                hasAnswerDelta = true
              }
              bufferedEvents.push(sectionEvent)
            }
          }

          if (sectionStreamState) {
            for (const sectionEvent of flushKnowledgeQaSectionedDelta(sectionStreamState)) {
              if (sectionEvent.type === 'answer_delta') {
                hasAnswerDelta = true
              }
              bufferedEvents.push(sectionEvent)
            }
          }

          latestTotalTokens = await Promise.resolve(stream)
            .then((message) => normalizeTotalTokens(message.usage_metadata))
            .catch(() => latestTotalTokens)

          if (hasAnswerDelta || options.signal?.aborted || attempt >= QA_STREAM_MAX_ATTEMPTS) {
            const answerText = bufferedEvents
              .filter((event): event is Extract<KnowledgeQaStreamEvent, { type: 'answer_delta' }> => event.type === 'answer_delta')
              .map((event) => event.delta)
              .join('')
            const repairedAnswer = await repairAnswerWithLlm(answerText)

            for (const event of bufferedEvents) {
              if (event.type !== 'answer_delta') {
                yield event
              }
            }
            if (repairedAnswer) {
              yield {
                type: 'answer_delta',
                delta: repairedAnswer
              }
            }
            return
          }
        }
      } finally {
        if (!totalTokensResolved) {
          totalTokensResolved = true
          resolveTotalTokens(latestTotalTokens)
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

  // QA temperature 允许按知识库显式覆盖，因此这里按请求创建 client，避免缓存脏参数。
  private createClient(temperature?: number): ChatOpenAI {
    const apiKey = process.env.LLM_API_KEY
    const model = process.env.LLM_MODEL
    if (!apiKey || !model) {
      throw new InternalServerErrorException('LLM API key or model not set')
    }

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: resolveQaTemperature(temperature),
      configuration: {
        baseURL: normalizeLlmBaseUrl(process.env.LLM_BASE_URL)
      }
    })
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

function resolveQaTemperature(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override)) {
    return Math.min(Math.max(override, 0), FACTUAL_QA_TEMPERATURE)
  }

  return FACTUAL_QA_TEMPERATURE
}

function normalizeMessageContent(content: unknown): string {
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

      if (typeof item === 'object' && item !== null && 'text' in item) {
        const text = item.text
        return typeof text === 'string' ? text : ''
      }

      return ''
    })
    .join('')
}

function formatEvidenceFactsForRepair(
  facts: ReturnType<typeof extractKnowledgeEvidenceFacts>
): string {
  return facts
    .map(
      (fact, index) => [
        `Fact ${index + 1}:`,
        `querySignals: ${fact.matchedTerms.join(', ') || '(none)'}`,
        `exactValues: ${fact.exactValues.join(', ') || '(none)'}`,
        `evidenceText: ${fact.text}`
      ].join('\n')
    )
    .join('\n\n')
}
