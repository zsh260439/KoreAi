import type {
  KnowledgeRuleSignalConfidence,
  KnowledgeQueryRuleSignal,
  RagRetrievalMode
} from './knowledge-query-plan.types'
import {
  expandStructuredIdentifierAliases,
  isCompactStructuredIdentifier
} from './knowledge-identifier-aliases'

// 规则只识别通用结构，不绑定业务前缀或评测集词汇。
const IDENTIFIER_LIKE_PATTERN =
  /\b[a-z0-9]+(?:[-_./:][a-z0-9]+)+\b/gi

const ERROR_CODE_LIKE_PATTERN =
  /\b[a-z]{1,8}[-_]?\d{3,}\b/gi

const COMPACT_IDENTIFIER_LIKE_PATTERN =
  /\b[a-z]{2,12}\d{2,4}\b/gi

const PROCEDURE_PATTERN =
  /\b(how to|steps?|procedure|process|troubleshoot(?:ing)?|debug|fix|resolve|why)\b|濡備綍|鎬庝箞|姝ラ|娴佺▼|鎺掓煡|澶勭悊鏂规硶|淇|鍘熷洜/iu

const QUOTED_TERM_PATTERN = /"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’/g

export function detectKnowledgeQueryRuleSignal(query: string): KnowledgeQueryRuleSignal {
  const normalizedQuery = query.trim()
  const quotedTerms = extractQuotedTerms(normalizedQuery)
  const identifierTerms = extractPatternTerms(normalizedQuery, IDENTIFIER_LIKE_PATTERN)
  const errorCodeTerms = extractPatternTerms(normalizedQuery, ERROR_CODE_LIKE_PATTERN)
  const compactIdentifierTerms = extractPatternTerms(normalizedQuery, COMPACT_IDENTIFIER_LIKE_PATTERN)
    .filter(isCompactStructuredIdentifier)
  const exactTerms = compactStructuredExactTerms(expandStructuredIdentifierAliases(uniqueStrings([
    ...quotedTerms,
    ...identifierTerms,
    ...errorCodeTerms,
    ...compactIdentifierTerms
  ])))

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

  if (compactIdentifierTerms.length > 0) {
    reasons.push('contains_compact_identifier_like_terms')
  }

  if (shortQuery) {
    reasons.push('is_short_query')
  }

  if (procedureLike) {
    reasons.push('is_procedure_like_query')
  }

  if (exactTerms.length > 0) {
    return buildRuleSignal({
      suggestedRetrievalMode: 'exact',
      confidence: 'high',
      reasons,
      exactTerms,
      shortQuery,
      procedureLike
    })
  }

  if (procedureLike) {
    return buildRuleSignal({
      suggestedRetrievalMode: 'hybrid',
      confidence: 'medium',
      reasons,
      exactTerms,
      shortQuery,
      procedureLike
    })
  }

  if (shortQuery) {
    return buildRuleSignal({
      suggestedRetrievalMode: 'keyword',
      confidence: 'medium',
      reasons,
      exactTerms,
      shortQuery,
      procedureLike
    })
  }

  return buildRuleSignal({
    suggestedRetrievalMode: 'hybrid',
    confidence: 'low',
    reasons: reasons.length > 0 ? reasons : ['no_strong_rule_match'],
    exactTerms,
    shortQuery,
    procedureLike
  })
}

function buildRuleSignal(input: {
  suggestedRetrievalMode: RagRetrievalMode
  confidence: KnowledgeRuleSignalConfidence
  reasons: string[]
  exactTerms: string[]
  shortQuery: boolean
  procedureLike: boolean
}): KnowledgeQueryRuleSignal {
  return {
    suggestedRetrievalMode: input.suggestedRetrievalMode,
    confidence: input.confidence,
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

function compactStructuredExactTerms(values: string[]): string[] {
  return values.filter((value, index) => {
    if (!isStructuredExactTerm(value)) {
      return true
    }

    const normalizedValue = value.toLowerCase()

    return !values.some((candidate, candidateIndex) => {
      if (candidateIndex === index) {
        return false
      }

      if (!isStructuredExactTerm(candidate)) {
        return false
      }

      const normalizedCandidate = candidate.toLowerCase()
      return (
        normalizedCandidate.length > normalizedValue.length &&
        normalizedCandidate.includes(normalizedValue)
      )
    })
  })
}

function isStructuredExactTerm(value: string): boolean {
  return /[a-z]/i.test(value) && /\d/.test(value)
}



