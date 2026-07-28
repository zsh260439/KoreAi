import { ChatOpenAI } from '@langchain/openai'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import type { KnowledgeQaDeltaEvent, KnowledgeSearchDebugInfo, KnowledgeSearchHit } from 'share-type'
import { KnowledgeConfigService } from '../../runtime/config/knowledge-config.service'
import { extractKnowledgeEvidenceFacts } from '../evidence-gating/knowledge-evidence-fact-extractor'
import {
  getMissingRequestedEvidenceValues,
  getRequestedEvidenceValues,
  hasPotentialKnowledgeAnswerGap,
  scoreRequestedEvidenceCoverage,
  selectMoreCompleteKnowledgeAnswer
} from './knowledge-qa-answer-validation'
import {
  buildKnowledgeQaStreamingSystemPrompt,
  buildKnowledgeQaStreamingUserPrompt
} from './knowledge-qa.prompts'
import {
  createKnowledgeQaSectionStreamState,
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
  constructor(private readonly configService: KnowledgeConfigService) {}

  async streamAnswerQuestion(
    query: string,
    hits: KnowledgeSearchHit[],
    options: {
      includeReasoning?: boolean
      signal?: AbortSignal
      temperature?: number
      evidenceGateStatus?: 'pass' | 'degraded' | 'blocked'
      scopeCoverage?: number
      factCoverage?: number
      retrievalDebug?: KnowledgeSearchDebugInfo | null
      allowGeneralKnowledge?: boolean
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
        content: buildKnowledgeQaStreamingSystemPrompt(
          hits.length > 0,
          options.evidenceGateStatus,
          options.allowGeneralKnowledge === true
        )
      },
      {
        role: 'user',
        content: buildKnowledgeQaStreamingUserPrompt(
          query,
          hits,
          includeReasoning,
          {
            evidenceGateStatus: options.evidenceGateStatus,
            scopeCoverage: options.scopeCoverage,
            factCoverage: options.factCoverage,
            evidenceFacts,
            retrievalScopeObjects: options.retrievalDebug?.retrievalScopeObjects,
            allowGeneralKnowledge: options.allowGeneralKnowledge === true
          }
        )
      }
    ]

    const provider = await this.configService.findProviderSettings()
    let resolveTotalTokens: (value: number | null) => void = () => {}
    let totalTokensResolved = false
    const totalTokens = new Promise<number | null>((resolve) => {
      resolveTotalTokens = resolve
    })
    const createQaStream = () =>
      this.createClient(provider.runtimeConfig.llm, options.temperature).streamV2(
        messages,
        { signal: options.signal } as never
      )
    const repairAnswerWithLlm = async (draft: string): Promise<string> => {
      const fieldSlots = options.retrievalDebug?.evidenceFieldSlots ?? []
      const scopeValues = options.retrievalDebug?.retrievalScopeObjects?.map((item) => item.value) ?? []
      const deterministicAnswer = selectDeterministicFieldAnswer(query, draft, evidenceFacts, hits, fieldSlots, scopeValues)
      if (deterministicAnswer !== draft) {
        return deterministicAnswer
      }

      if (!shouldRepairAnswer(query, draft, evidenceFacts, hits, fieldSlots)) {
        return draft
      }

      const repairStartedAt = Date.now()
      try {
        const message = await this.createClient(provider.runtimeConfig.llm, options.temperature).invoke([
          {
            role: 'system',
            content: [
              'You are a factual answer editor for a retrieval-augmented question answering system.',
              'Rewrite the draft using only the user question, verified evidence facts, and retrieved excerpts.',
              'Include every fact explicitly requested by the user when it is supported by the evidence.',
              'Remove unsupported or unrequested facts.',
              'Evaluate each fact independently and never transfer an exact value to another fact or subject.',
              'Do not declare a requested item missing when a verified fact or retrieved excerpt directly contains its value.',
              'Text extracted from OCR, VLM, images, attachments, dashboards, or tables is valid evidence once it is present in retrieved excerpts.',
              'Treat "stored in an image" or "stored in an attachment" as source-carrier wording, not as proof that the extracted value is missing.',
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
              `Draft answer:\n${draft}`,
              `Verified evidence facts:\n${formatEvidenceFactsForRepair(evidenceFacts)}`,
              `Retrieved excerpts:\n${formatHitsForRepair(hits)}`
            ].join('\n\n')
          }
        ])
        const content = normalizeMessageContent(message.content).trim() || draft
        return selectRepairedAnswer(query, draft, content, evidenceFacts, hits, fieldSlots, scopeValues)
      } catch {
        return draft
      } finally {
        if (options.retrievalDebug) {
          options.retrievalDebug.stageTimingsMs = {
            ...options.retrievalDebug.stageTimingsMs,
            repair: Date.now() - repairStartedAt
          }
        }
      }
    }

    async function *run(): AsyncGenerator<KnowledgeQaStreamEvent> {
      let latestTotalTokens: number | null = null

      try {
        for (let attempt = 1; attempt <= QA_STREAM_MAX_ATTEMPTS; attempt += 1) {
          const stream = createQaStream()
          const sectionStreamState = includeReasoning ? createKnowledgeQaSectionStreamState() : null
          const answerEvents: KnowledgeQaStreamEvent[] = []
          let hasAnswerDelta = false

          // text 瀛愭祦鐩存帴瀵瑰簲妯″瀷鐨勬枃鏈閲忥紝閬垮厤浠庨€氱敤浜嬩欢娴佸啀娆¤仛鍚堝悗鎵嶄笅鍙戙€?
          for await (const delta of stream.text) {
            if (!delta) {
              continue
            }

            if (!sectionStreamState) {
              hasAnswerDelta = true
              answerEvents.push({
                type: 'answer_delta',
                delta
              })
              continue
            }

            for (const sectionEvent of parseKnowledgeQaSectionedDelta(sectionStreamState, delta)) {
              if (sectionEvent.type === 'answer_delta') {
                hasAnswerDelta = true
                answerEvents.push(sectionEvent)
              } else {
                // 鎬濊€冩憳瑕佸彧鍋氬睍绀猴紝涓嶅弬涓庣瓟妗堜慨琛ワ紱瑙ｆ瀽鍒板悗绔嬪嵆涓嬪彂锛岄伩鍏嶆绱㈢粨鏉熷悗鐨勭┖妗ｃ€?
                yield sectionEvent
              }
            }
          }

          if (sectionStreamState) {
            for (const sectionEvent of flushKnowledgeQaSectionedDelta(sectionStreamState)) {
              if (sectionEvent.type === 'answer_delta') {
                hasAnswerDelta = true
                answerEvents.push(sectionEvent)
              } else {
                yield sectionEvent
              }
            }
          }

          latestTotalTokens = await Promise.resolve(stream)
            .then((message) => normalizeTotalTokens(message.usage_metadata))
            .catch(() => latestTotalTokens)

          if (hasAnswerDelta || options.signal?.aborted || attempt >= QA_STREAM_MAX_ATTEMPTS) {
            const answerText = answerEvents
              .filter((event): event is Extract<KnowledgeQaStreamEvent, { type: 'answer_delta' }> => event.type === 'answer_delta')
              .map((event) => event.delta)
              .join('')
            const repairedAnswer = await repairAnswerWithLlm(answerText)

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

  async getModelName(): Promise<string | null> {
    const provider = await this.configService.findProviderSettings()
    return provider.runtimeConfig.llm.model
  }

  // QA temperature 鍏佽鎸夌煡璇嗗簱鏄惧紡瑕嗙洊锛屽洜姝よ繖閲屾寜璇锋眰鍒涘缓 client锛岄伩鍏嶇紦瀛樿剰鍙傛暟銆?
  private createClient(
    provider: { baseUrl: string | null; model: string | null },
    temperature?: number
  ): ChatOpenAI {
    const apiKey = process.env.LLM_API_KEY
    const model = provider.model
    if (!apiKey || !model) {
      throw new InternalServerErrorException('LLM API key or model not set')
    }

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: resolveQaTemperature(temperature),
      configuration: {
        baseURL: normalizeLlmBaseUrl(provider.baseUrl ?? undefined)
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

function shouldRepairAnswer(
  query: string,
  draft: string,
  facts: ReturnType<typeof extractKnowledgeEvidenceFacts>,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = []
): boolean {
  return hasPotentialKnowledgeAnswerGap(query, draft, facts) ||
    getMissingRequestedEvidenceValues(query, draft, hits, fieldSlots).length > 0 ||
    hasMissingAnswerWithConcreteEvidence(query, draft, hits)
}

function selectDeterministicFieldAnswer(
  query: string,
  draft: string,
  facts: ReturnType<typeof extractKnowledgeEvidenceFacts>,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = [],
  scopeValues: string[] = []
): string {
  const scopedHits = filterHitsByScope(hits, scopeValues)
  const deterministicAnswer = buildDeterministicFieldAnswer(query, scopedHits, fieldSlots)
  if (!deterministicAnswer) {
    return draft
  }

  const deterministicScore = scoreRequestedEvidenceCoverage(deterministicAnswer, query, scopedHits, fieldSlots)
  const draftScore = scoreRequestedEvidenceCoverage(draft, query, scopedHits, fieldSlots)
  if (deterministicScore > draftScore) {
    return deterministicAnswer
  }

  const factSelected = selectMoreCompleteKnowledgeAnswer(draft, deterministicAnswer, facts)
  return factSelected !== draft ? factSelected : draft
}

function hasMissingAnswerWithConcreteEvidence(
  query: string,
  draft: string,
  hits: KnowledgeSearchHit[]
): boolean {
  if (!isMissingKnowledgeAnswer(draft)) {
    return false
  }

  const normalizedQuery = normalizeForValueMatch(query)
  const queryAsksValue = /(?:\u503c|\u4ee3\u7801|\u7f16\u53f7|\u89d2\u8272|\u9608\u503c|\u65f6\u9650|\u7a97\u53e3|window|code|threshold|role|owner|value)/i.test(query)
  if (!queryAsksValue) {
    return false
  }

  return extractConcreteEvidenceValues(hits)
    .some((value) => !normalizedQuery.includes(normalizeForValueMatch(value)))
}

function selectRepairedAnswer(
  query: string,
  draft: string,
  edited: string,
  facts: ReturnType<typeof extractKnowledgeEvidenceFacts>,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = [],
  scopeValues: string[] = []
): string {
  const deterministicAnswer = selectDeterministicFieldAnswer(query, draft, facts, hits, fieldSlots, scopeValues)
  const scopedHits = filterHitsByScope(hits, scopeValues)
  if (deterministicAnswer !== draft) {
    const editedRequestedScore = scoreRequestedEvidenceCoverage(edited, query, scopedHits, fieldSlots)
    const deterministicRequestedScore = scoreRequestedEvidenceCoverage(deterministicAnswer, query, scopedHits, fieldSlots)
    return editedRequestedScore > deterministicRequestedScore ? edited : deterministicAnswer
  }

  const originalRequestedScore = scoreRequestedEvidenceCoverage(draft, query, scopedHits, fieldSlots)
  const editedRequestedScore = scoreRequestedEvidenceCoverage(edited, query, scopedHits, fieldSlots)
  if (editedRequestedScore > originalRequestedScore) {
    return edited
  }

  const factSelected = selectMoreCompleteKnowledgeAnswer(draft, edited, facts)
  if (factSelected !== draft) {
    return factSelected
  }

  if (!isMissingKnowledgeAnswer(draft) || isMissingKnowledgeAnswer(edited)) {
    return draft
  }

  const editedValueCount = extractConcreteEvidenceValues(hits)
    .filter((value) => normalizeForValueMatch(edited).includes(normalizeForValueMatch(value)))
    .length
  return editedValueCount > 0 ? edited : draft
}

function buildDeterministicFieldAnswer(
  query: string,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = []
): string {
  const values = getRequestedEvidenceValues(query, hits, fieldSlots)
  if (values.length < 2) {
    return ''
  }

  const lines = values
    .map((item) => {
      const label = getRequestedSlotLabel(item.slot)
      return label ? `${label}：${item.value}` : ''
    })
    .filter(Boolean)

  return lines.length >= 2 ? lines.join('\n') : ''
}

function filterHitsByScope(
  hits: KnowledgeSearchHit[],
  scopeValues: string[]
): KnowledgeSearchHit[] {
  const normalizedScopes = scopeValues
    .map(normalizeForValueMatch)
    .filter((value) => value.length >= 3)
  if (normalizedScopes.length === 0) {
    return hits
  }

  const scopedHits = hits.filter((hit) => {
    const searchable = normalizeForValueMatch([
      hit.documentName,
      hit.primaryTitle,
      hit.sectionPath,
      hit.content
    ].filter(Boolean).join(' '))
    return normalizedScopes.some((scope) => searchable.includes(scope))
  })

  return scopedHits.length > 0 ? scopedHits : hits
}

function getRequestedSlotLabel(slot: string): string {
  switch (slot) {
    case 'main_control_threshold':
      return '\u4e3b\u63a7\u5236\u9608\u503c'
    case 'responsible_role':
      return '\u8d23\u4efb\u89d2\u8272'
    case 'alert_threshold':
      return '\u9884\u8b66\u503c'
    case 'action_code':
      return '\u5904\u7f6e\u4ee3\u7801'
    case 'response_time':
      return '\u54cd\u5e94\u65f6\u9650'
    default:
      return ''
  }
}

function formatHitsForRepair(hits: KnowledgeSearchHit[]): string {
  if (hits.length === 0) {
    return '(no retrieved excerpts)'
  }

  return hits.slice(0, 8)
    .map((hit, index) => [
      `Excerpt ${index + 1}:`,
      `documentName: ${hit.documentName}`,
      hit.primaryTitle ? `primaryTitle: ${hit.primaryTitle}` : '',
      hit.sectionPath ? `sectionPath: ${hit.sectionPath}` : '',
      `content: ${hit.content}`
    ].filter(Boolean).join('\n'))
    .join('\n\n')
}

function extractConcreteEvidenceValues(hits: KnowledgeSearchHit[]): string[] {
  const values = new Set<string>()
  const pattern =
    /\b[A-Z]{2,}(?:-[A-Z0-9]+){1,}\d*\b|\b[a-z]+(?:_[a-z0-9]+)+\b|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:hours?|\u5c0f\u65f6|\u5206\u949f|days?)\b/gi

  for (const hit of hits.slice(0, 8)) {
    for (const match of hit.content.match(pattern) ?? []) {
      const value = match.trim()
      if (value.length >= 2 && value.length <= 60) {
        values.add(value)
      }
    }
  }

  return [...values]
}

function isMissingKnowledgeAnswer(answer: string): boolean {
  return /(?:\u672a\u5728.*\u8bc1\u636e.*\u627e\u5230|\u672a\u627e\u5230|\u627e\u4e0d\u5230|\u6ca1\u6709\u627e\u5230|\u65e0\u6cd5\u786e\u5b9a|\u65e0\u6cd5\u786e\u8ba4|\u8bc1\u636e\u4e0d\u8db3|\u4e0d\u5305\u542b|\u6ca1\u6709\u63d0\u4f9b|not found|not provided|cannot determine)/i
    .test(answer)
}

function normalizeForValueMatch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}


