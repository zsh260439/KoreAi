import type {
  KnowledgeQueryRouteConfidence,
  KnowledgeQueryRouteDecision,
  KnowledgeQueryRouteSource,
  KnowledgeQueryRuleSignal,
  KnowledgeRetrievalMode
} from './knowledge-query-plan.types'

// 通用的“标识符形态”识别：包含字母数字，并带有连接符。
// 这里不针对任何具体前缀，只识别结构化 token 的形态。
const IDENTIFIER_LIKE_PATTERN =
  /\b[a-z0-9]+(?:[-_./:][a-z0-9]+)+\b/gi

// 通用错误码形态：字母 + 可选连接符 + 至少 3 位数字。
// 仍然不绑定具体业务前缀，只看“像错误码”的结构。
const ERROR_CODE_LIKE_PATTERN =
  /\b[a-z]{1,8}[-_]?\d{3,}\b/gi

// 通用流程/排障问法识别，不绑定领域词。
const PROCEDURE_PATTERN =
  /\b(how to|steps?|procedure|process|troubleshoot(?:ing)?|debug|fix|resolve|why)\b|如何|怎么|步骤|流程|排查|处理方法|修复|原因/iu

const QUOTED_TERM_PATTERN = /"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’/g

export function detectKnowledgeQueryRuleSignal(query: string): KnowledgeQueryRuleSignal {
  const normalizedQuery = query.trim()
  const quotedTerms = extractQuotedTerms(normalizedQuery)
  const identifierTerms = extractPatternTerms(normalizedQuery, IDENTIFIER_LIKE_PATTERN)
  const errorCodeTerms = extractPatternTerms(normalizedQuery, ERROR_CODE_LIKE_PATTERN)
  const exactTerms = uniqueStrings([
    ...quotedTerms,
    ...identifierTerms,
    ...errorCodeTerms
  ])

  const tokenCount = normalizedQuery.split(/\s+/).filter(Boolean).length
  const shortQuery = tokenCount > 0 && tokenCount <= 3 && normalizedQuery.length <= 48
  const procedureLike = PROCEDURE_PATTERN.test(normalizedQuery)

  const reasons: string[] = []

  if (quotedTerms.length > 0) {
    reasons.push('contains_quoted_terms')
  }

  if (identifierTerms.length > 0) {
    reasons.push('contains_identifier_like_terms')
  }

  if (errorCodeTerms.length > 0) {
    reasons.push('contains_error_code_like_terms')
  }

  if (shortQuery) {
    reasons.push('is_short_query')
  }

  if (procedureLike) {
    reasons.push('is_procedure_like_query')
  }

  if (exactTerms.length > 0) {
    return buildRuleSignal({
      route: 'exact_lookup',
      confidence: 'high',
      reasons,
      exactTerms,
      shortQuery,
      procedureLike
    })
  }

  if (procedureLike) {
    return buildRuleSignal({
      route: 'procedure_heavy',
      confidence: 'medium',
      reasons,
      exactTerms,
      shortQuery,
      procedureLike
    })
  }

  if (shortQuery) {
    return buildRuleSignal({
      route: 'keyword_heavy',
      confidence: 'medium',
      reasons,
      exactTerms,
      shortQuery,
      procedureLike
    })
  }

  return buildRuleSignal({
    route: 'balanced',
    confidence: 'low',
    reasons: reasons.length > 0 ? reasons : ['no_strong_rule_match'],
    exactTerms,
    shortQuery,
    procedureLike
  })
}

export function createRouteDecision(
  mode: KnowledgeRetrievalMode,
  source: KnowledgeQueryRouteSource,
  confidence: KnowledgeQueryRouteConfidence,
  reason: string
): KnowledgeQueryRouteDecision {
  return {
    mode,
    source,
    confidence,
    reason
  }
}

function buildRuleSignal(input: {
  route: KnowledgeRetrievalMode
  confidence: KnowledgeQueryRouteConfidence
  reasons: string[]
  exactTerms: string[]
  shortQuery: boolean
  procedureLike: boolean
}): KnowledgeQueryRuleSignal {
  return {
    route: input.route,
    confidence: input.confidence,
    source: 'rule',
    reasons: input.reasons,
    exactTerms: input.exactTerms,
    shortQuery: input.shortQuery,
    procedureLike: input.procedureLike
  }
}

function extractQuotedTerms(value: string): string[] {
  const result: string[] = []

  for (const match of value.matchAll(QUOTED_TERM_PATTERN)) {
    const term = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim()
    if (term) {
      result.push(term)
    }
  }

  return uniqueStrings(result)
}

function extractPatternTerms(value: string, pattern: RegExp): string[] {
  const result = value.match(pattern) ?? []
  return uniqueStrings(result.map((item) => item.trim()).filter(Boolean))
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