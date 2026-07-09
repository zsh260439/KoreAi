import { ChatOpenAI } from '@langchain/openai'
import { Injectable, Logger } from '@nestjs/common'
import {
  buildKnowledgeQueryAnalysisSystemPrompt,
  buildKnowledgeQueryAnalysisUserPrompt
} from './knowledge-query-analysis.prompts'
import type {
  KnowledgeQueryAnalysis,
  KnowledgeQueryAnalysisInput,
  KnowledgeQueryConstraint,
  KnowledgeQueryConstraintOperator,
  KnowledgeQueryEntity,
  KnowledgeQueryEntityKind,
  KnowledgeQueryIntent,
  KnowledgeQueryRetrievalHints,
  KnowledgeRetrievalMode
} from './knowledge-query-plan.types'

type JsonRecord = Record<string, unknown>

const DEFAULT_RETRIEVAL_HINTS: KnowledgeQueryRetrievalHints = {
  mode: 'balanced',
  bm25Weight: 1,
  vectorWeight: 1
}

@Injectable()
export class KnowledgeQueryAnalysisService {
  private readonly logger = new Logger(KnowledgeQueryAnalysisService.name)
  private warnedMissingConfig = false

  async analyze(
    input: KnowledgeQueryAnalysisInput,
    options: { temperature?: number } = {}
  ): Promise<KnowledgeQueryAnalysis | null> {
    if (!isQueryAnalysisEnabled()) {
      return null
    }

    const client = this.createClient(options.temperature)
    if (!client) {
      return null
    }

    try {
      const response = await client.invoke([
        {
          role: 'system',
          content: buildKnowledgeQueryAnalysisSystemPrompt()
        },
        {
          role: 'user',
          content: buildKnowledgeQueryAnalysisUserPrompt(input)
        }
      ])

      const content = normalizeChatContent(response.content)
      if (!content) {
        return null
      }

      return parseAnalysisResult(content)
    } catch (error) {
      this.logger.warn(`Query analysis skipped: ${formatErrorMessage(error)}`)
      return null
    }
  }

  // query analysis temperature 现在允许按知识库覆盖，因此这里不再缓存单一 client。
  private createClient(temperature?: number): ChatOpenAI | null {
    const apiKey = process.env.LLM_API_KEY
    const model =
      process.env.RETRIEVAL_QUERY_ANALYSIS_MODEL ??
      process.env.LLM_MODEL

    if (!apiKey || !model) {
      if (!this.warnedMissingConfig) {
        this.logger.warn(
          'Query analysis is enabled but LLM_API_KEY / RETRIEVAL_QUERY_ANALYSIS_MODEL is missing'
        )
        this.warnedMissingConfig = true
      }

      return null
    }

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: resolveTemperature(temperature),
      configuration: {
        baseURL: normalizeLlmBaseUrl(process.env.LLM_BASE_URL)
      }
    })
  }
}

function isQueryAnalysisEnabled(): boolean {
  const value = process.env.RETRIEVAL_QUERY_ANALYSIS_ENABLED
  if (!value) {
    return true
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function resolveTemperature(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override)) {
    return override
  }

  const raw = process.env.RETRIEVAL_QUERY_ANALYSIS_TEMPERATURE
  if (!raw) {
    return 0.1
  }

  const value = Number(raw)
  return Number.isFinite(value) ? value : 0.1
}

function normalizeLlmBaseUrl(value?: string): string | undefined {
  if (!value) {
    return undefined
  }

  return value.replace(/\/chat\/completions\/?$/, '')
}

function normalizeChatContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (!Array.isArray(value)) {
    return ''
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (isJsonRecord(item) && typeof item.text === 'string') {
        return item.text
      }

      return ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function parseAnalysisResult(content: string): KnowledgeQueryAnalysis | null {
  const jsonText = extractJsonText(content)
  if (!jsonText) {
    return null
  }

  const parsed = safeJsonParse(jsonText)
  if (!isJsonRecord(parsed)) {
    return null
  }

  const analysis: KnowledgeQueryAnalysis = {
    intent: normalizeIntent(parsed.intent),
    intentReason: normalizeSingleLine(parsed.intentReason),
    searchPhrases: normalizeStringArray(parsed.searchPhrases, 6),
    semanticQueries: normalizeStringArray(parsed.semanticQueries, 4),
    requiredTerms: normalizeStringArray(parsed.requiredTerms, 8),
    optionalTerms: normalizeStringArray(parsed.optionalTerms, 8),
    excludedTerms: normalizeStringArray(parsed.excludedTerms, 6),
    entities: normalizeEntities(parsed.entities),
    constraints: normalizeConstraints(parsed.constraints),
    retrieval: normalizeRetrievalHints(parsed.retrieval)
  }

  if (
    !analysis.intentReason &&
    analysis.searchPhrases.length === 0 &&
    analysis.semanticQueries.length === 0 &&
    analysis.requiredTerms.length === 0 &&
    analysis.optionalTerms.length === 0 &&
    analysis.excludedTerms.length === 0 &&
    analysis.entities.length === 0 &&
    analysis.constraints.length === 0
  ) {
    return null
  }

  return analysis
}

function normalizeIntent(value: unknown): KnowledgeQueryIntent {
  switch (value) {
    case 'precise':
    case 'constrained':
    case 'exploratory':
    case 'hybrid':
      return value
    default:
      return 'hybrid'
  }
}

function normalizeRetrievalHints(value: unknown): KnowledgeQueryRetrievalHints {
  if (!isJsonRecord(value)) {
    return DEFAULT_RETRIEVAL_HINTS
  }

  const mode = normalizeRetrievalMode(value.mode)
  const bm25Weight = normalizeWeight(value.bm25Weight, DEFAULT_RETRIEVAL_HINTS.bm25Weight)
  const vectorWeight = normalizeWeight(value.vectorWeight, DEFAULT_RETRIEVAL_HINTS.vectorWeight)

  return {
    mode,
    bm25Weight,
    vectorWeight
  }
}

function normalizeRetrievalMode(value: unknown): KnowledgeRetrievalMode {
  switch (value) {
    case 'keyword_first':
    case 'semantic_first':
    case 'balanced':
      return value
    default:
      return 'balanced'
  }
}

function normalizeEntities(value: unknown): KnowledgeQueryEntity[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: KnowledgeQueryEntity[] = []

  for (const item of value) {
    if (!isJsonRecord(item)) {
      continue
    }

    const surface = normalizeSingleLine(item.surface)
    const canonicalForm = normalizeSingleLine(item.canonicalForm)
    if (!surface && !canonicalForm) {
      continue
    }

    result.push({
      kind: normalizeEntityKind(item.kind),
      surface,
      canonicalForm: canonicalForm || surface
    })
  }

  return dedupeEntities(result).slice(0, 8)
}

function normalizeEntityKind(value: unknown): KnowledgeQueryEntityKind {
  switch (value) {
    case 'identifier':
    case 'number':
    case 'date':
    case 'term':
    case 'unknown':
      return value
    default:
      return 'unknown'
  }
}

function normalizeConstraints(value: unknown): KnowledgeQueryConstraint[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: KnowledgeQueryConstraint[] = []

  for (const item of value) {
    if (!isJsonRecord(item)) {
      continue
    }

    const constraintValue = normalizeSingleLine(item.value)
    if (!constraintValue) {
      continue
    }

    result.push({
      operator: normalizeConstraintOperator(item.operator),
      value: constraintValue
    })
  }

  return dedupeConstraints(result).slice(0, 8)
}

function normalizeConstraintOperator(value: unknown): KnowledgeQueryConstraintOperator {
  switch (value) {
    case 'must_equal':
    case 'must_contain':
    case 'should_contain':
    case 'must_exclude':
      return value
    default:
      return 'should_contain'
  }
}

function normalizeWeight(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(Math.max(numeric, 0.2), 3)
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return uniqueStrings(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeSingleLine(item))
      .filter(Boolean)
  ).slice(0, limit)
}

function normalizeSingleLine(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim()
}

function dedupeEntities(values: KnowledgeQueryEntity[]): KnowledgeQueryEntity[] {
  const seen = new Set<string>()
  const result: KnowledgeQueryEntity[] = []

  for (const item of values) {
    const key = `${item.kind}:${item.canonicalForm.toLowerCase()}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(item)
  }

  return result
}

function dedupeConstraints(values: KnowledgeQueryConstraint[]): KnowledgeQueryConstraint[] {
  const seen = new Set<string>()
  const result: KnowledgeQueryConstraint[] = []

  for (const item of values) {
    const key = `${item.operator}:${item.value.toLowerCase()}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(item)
  }

  return result
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(value)
  }

  return result
}

function extractJsonText(value: string): string | null {
  const trimmed = value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  return trimmed.slice(start, end + 1)
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}
