import type { KnowledgeSearchHit } from 'share-type'

import type {
  KnowledgeQueryAnalysis,
  KnowledgeQueryEvidencePlan
} from '../query/knowledge-query-plan.types'

const STRUCTURED_IDENTIFIER_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,12}[-_]?\d{2,})\b/gi

const NUMBER_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:%|天|次|条|个|小时|分钟|days?|times?|items?)?\b/gi

const ASCII_TERM_PATTERN = /\b[a-z][a-z0-9_]{2,}\b/gi

const CJK_REFERENCE_PHRASE_PATTERN =
  /引用不足|召回文档|证据不完整|置信度|标注标准|黄金文档|相似文档|未命中|命中|证据|引用|规则|标准|规范|指南|手册|策略|参考|合规|审计/g

const CJK_FACT_PHRASE_PATTERN =
  /主控制阈值|核心阈值|阈值|责任角色|负责人|响应时限|响应时间|处理时限/g

const REFERENCE_TRIGGER_PATTERN =
  /引用不足|召回文档|证据不完整|置信度|标注标准|标准|规范|规则|制度|证据|合规|审计|策略|手册|指南|参考|gold_document|fully_grounded|normal_confidence|high_confidence|reviewed_but_not_grounded|recall_gap|exact_code|reference|standard|policy|rule|guideline|playbook|confidence|citation|grounded|recall/i

const DOCUMENT_ROLE_PATTERNS: Array<{
  role: string
  pattern: RegExp
}> = [
  {
    role: 'reference',
    pattern: /reference|standard|guideline|playbook|strategy|overview|pack|规范|标准|指南|手册|策略|总览|参考/i
  },
  {
    role: 'policy',
    pattern: /policy|制度|规则|合规|审计/i
  },
  {
    role: 'postmortem',
    pattern: /postmortem|incident|事故|复盘/i
  },
  {
    role: 'manual',
    pattern: /manual|ops|operation|运维|手册/i
  },
  {
    role: 'spec',
    pattern: /spec|product|产品|规格/i
  }
]

export type KnowledgeEvidenceScore = {
  score: number
  coverage: number
  matchedIdentifiers: string[]
  matchedNumericTerms: string[]
  matchedEvidenceTerms: string[]
  documentRole: string
}

export function buildKnowledgeQueryEvidencePlan(input: {
  normalizedQuery: string
  analysis: KnowledgeQueryAnalysis | null
  protectedTerms: string[]
  optionalTerms: string[]
  excludedTerms: string[]
  requestedTopK: number
}): KnowledgeQueryEvidencePlan {
  const identifiers = uniqueStrings([
    ...extractPatternTerms(input.normalizedQuery, STRUCTURED_IDENTIFIER_PATTERN),
    ...input.protectedTerms.filter((term) => isStructuredIdentifier(term))
  ]).slice(0, 8)
  const identifierFragments = extractIdentifierFragments(identifiers)
  const numericTerms = uniqueStrings(extractPatternTerms(input.normalizedQuery, NUMBER_PATTERN))
    .filter((term) => !identifierFragments.has(normalizeTerm(term)))
    .slice(0, 8)
  const llmTerms = uniqueStrings([
    ...(input.analysis?.requiredTerms ?? []),
    ...(input.analysis?.optionalTerms ?? []),
    ...(input.analysis?.searchPhrases ?? []),
    ...input.optionalTerms
  ])
  const evidenceTerms = uniqueStrings([
    ...input.protectedTerms,
    ...extractEvidenceTerms(input.normalizedQuery),
    ...llmTerms
  ])
    .filter((term) => !identifiers.some((identifier) => sameTerm(identifier, term)))
    .filter((term) => !identifierFragments.has(normalizeTerm(term)))
    .filter((term) => !numericTerms.some((numericTerm) => sameTerm(numericTerm, term)))
    .slice(0, 24)
  const referenceTerms = evidenceTerms
    .filter((term) => REFERENCE_TRIGGER_PATTERN.test(term))
    .slice(0, 8)
  const needsReference =
    referenceTerms.length > 0 ||
    REFERENCE_TRIGGER_PATTERN.test(input.normalizedQuery)
  const requiredSignalCount =
    identifiers.length + numericTerms.length + Math.min(evidenceTerms.length, 8)
  const complexity =
    needsReference
      ? 'reference_required'
      : requiredSignalCount >= 5
        ? 'high_constraint'
        : requiredSignalCount >= 3
          ? 'multi_fact'
          : 'single_fact'

  const targetTopK = resolveEvidenceTargetTopK(input.requestedTopK, complexity)
  const maxTopK = Math.min(Math.max(targetTopK + 2, targetTopK), 10)

  return {
    identifiers,
    numericTerms,
    evidenceTerms,
    referenceTerms,
    complexity,
    needsReference,
    targetTopK,
    maxTopK,
    requiredCoverage: complexity === 'single_fact' ? 0.9 : 0.94,
    hardGateCoverage: complexity === 'single_fact' ? 0.5 : 0.6
  }
}

export function computeKnowledgeEvidenceScore(
  hit: Pick<KnowledgeSearchHit, 'documentName' | 'content' | 'sectionPath' | 'primaryTitle'>,
  plan: KnowledgeQueryEvidencePlan
): KnowledgeEvidenceScore {
  const documentName = normalizeText(hit.documentName)
  const titleText = normalizeText(`${hit.primaryTitle ?? ''} ${hit.sectionPath ?? ''}`)
  const content = normalizeText(hit.content)
  const fullText = `${documentName} ${titleText} ${content}`
  const documentRole = inferDocumentRole(hit.documentName, hit.primaryTitle, hit.sectionPath, hit.content)
  const matchedIdentifiers = matchTerms(fullText, plan.identifiers)
  const matchedNumericTerms = matchTerms(fullText, plan.numericTerms)
  const matchedEvidenceTerms = matchTerms(fullText, plan.evidenceTerms)
  const identifierScore = ratio(matchedIdentifiers.length, plan.identifiers.length) * 35
  const numericScore = ratio(matchedNumericTerms.length, plan.numericTerms.length) * 25
  const evidenceScore = ratio(matchedEvidenceTerms.length, Math.min(plan.evidenceTerms.length, 8)) * 20
  const titleScore = computeTitleScore(titleText, plan) * 10
  const roleScore = computeRoleScore(documentRole, plan) * 10
  const coverage = computeCoverageFromMatches({
    plan,
    matchedIdentifiers,
    matchedNumericTerms,
    matchedEvidenceTerms
  })

  return {
    score: Number((identifierScore + numericScore + evidenceScore + titleScore + roleScore).toFixed(4)),
    coverage,
    matchedIdentifiers,
    matchedNumericTerms,
    matchedEvidenceTerms,
    documentRole
  }
}

export function computeKnowledgeEvidenceCoverage(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryEvidencePlan
): number {
  const matchedIdentifiers = new Set<string>()
  const matchedNumericTerms = new Set<string>()
  const matchedEvidenceTerms = new Set<string>()

  for (const hit of hits) {
    const score = computeKnowledgeEvidenceScore(hit, plan)
    for (const term of score.matchedIdentifiers) {
      matchedIdentifiers.add(term)
    }
    for (const term of score.matchedNumericTerms) {
      matchedNumericTerms.add(term)
    }
    for (const term of score.matchedEvidenceTerms) {
      matchedEvidenceTerms.add(term)
    }
  }

  return computeCoverageFromMatches({
    plan,
    matchedIdentifiers: Array.from(matchedIdentifiers),
    matchedNumericTerms: Array.from(matchedNumericTerms),
    matchedEvidenceTerms: Array.from(matchedEvidenceTerms)
  })
}

export function inferDocumentRole(
  documentName: string,
  primaryTitle?: string | null,
  sectionPath?: string | null,
  content?: string
): string {
  const text = `${documentName} ${primaryTitle ?? ''} ${sectionPath ?? ''} ${content ?? ''}`
  for (const item of DOCUMENT_ROLE_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.role
    }
  }

  return 'knowledge'
}

export function resolveEvidenceGateStatus(
  coverage: number,
  plan: KnowledgeQueryEvidencePlan
): 'pass' | 'degraded' | 'blocked' {
  if (coverage < plan.hardGateCoverage) {
    return 'blocked'
  }

  if (coverage < plan.requiredCoverage) {
    return 'degraded'
  }

  return 'pass'
}

function resolveEvidenceTargetTopK(
  requestedTopK: number,
  complexity: KnowledgeQueryEvidencePlan['complexity']
): number {
  const safeTopK = Math.min(Math.max(Math.floor(requestedTopK), 1), 10)

  switch (complexity) {
    case 'reference_required':
    case 'high_constraint':
      return Math.max(safeTopK, 8)
    case 'multi_fact':
      return Math.max(safeTopK, 6)
    case 'single_fact':
    default:
      return safeTopK
  }
}

function computeCoverageFromMatches(input: {
  plan: KnowledgeQueryEvidencePlan
  matchedIdentifiers: string[]
  matchedNumericTerms: string[]
  matchedEvidenceTerms: string[]
}): number {
  const requiredCount =
    input.plan.identifiers.length +
    input.plan.numericTerms.length +
    Math.min(input.plan.evidenceTerms.length, 8)

  if (requiredCount === 0) {
    return 1
  }

  const matchedCount =
    input.matchedIdentifiers.length +
    input.matchedNumericTerms.length +
    Math.min(input.matchedEvidenceTerms.length, 8)

  return Number(Math.min(matchedCount / requiredCount, 1).toFixed(4))
}

function computeTitleScore(titleText: string, plan: KnowledgeQueryEvidencePlan): number {
  const titleMatches = [
    ...matchTerms(titleText, plan.identifiers),
    ...matchTerms(titleText, plan.evidenceTerms)
  ]
  return titleMatches.length > 0 ? 1 : 0
}

function computeRoleScore(documentRole: string, plan: KnowledgeQueryEvidencePlan): number {
  if (!plan.needsReference) {
    return 0
  }

  return documentRole === 'reference' || documentRole === 'policy' ? 1 : 0
}

function extractEvidenceTerms(value: string): string[] {
  const asciiTerms = extractPatternTerms(value, ASCII_TERM_PATTERN)
  const referenceTerms = extractCjkReferenceTerms(value)
  const factTerms = value.match(CJK_FACT_PHRASE_PATTERN) ?? []
  return uniqueStrings([...asciiTerms, ...referenceTerms, ...factTerms])
}

function extractCjkReferenceTerms(value: string): string[] {
  return uniqueStrings(value.match(CJK_REFERENCE_PHRASE_PATTERN) ?? [])
}

function extractPatternTerms(value: string, pattern: RegExp): string[] {
  return uniqueStrings((value.match(pattern) ?? []).map((item) => normalizeTerm(item)))
}

function matchTerms(text: string, terms: string[]): string[] {
  const result: string[] = []

  for (const term of terms) {
    const normalizedTerm = normalizeTerm(term)
    if (!normalizedTerm) {
      continue
    }

    if (text.includes(normalizedTerm)) {
      result.push(term)
    }
  }

  return uniqueStrings(result)
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTerm(value: string): string {
  return normalizeText(value).replace(/\s+/g, ' ').trim()
}

function ratio(value: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return Math.min(value / total, 1)
}

function sameTerm(left: string, right: string): boolean {
  return normalizeTerm(left) === normalizeTerm(right)
}

function isStructuredIdentifier(value: string): boolean {
  return /[a-z]/i.test(value) && /\d/.test(value)
}

function extractIdentifierFragments(identifiers: string[]): Set<string> {
  return new Set(
    identifiers.flatMap((identifier) =>
      normalizeTerm(identifier)
        .split(/[-_./:]+/)
        .filter(Boolean)
    )
  )
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeTerm(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(value.trim())
  }

  return result
}
