import { Injectable } from '@nestjs/common'
import type {
  KnowledgeBaseRuntimeConfig,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  KnowledgeSearchResponse
} from 'share-type'

import { KnowledgeBm25Service } from './knowledge-bm25.service'
import { mergeKnowledgeRetrievalCandidates } from './knowledge-hybrid-ranker'
import { KnowledgeQueryEngineService } from './knowledge-query-engine.service'
import type {
  KnowledgeQueryPlan,
  KnowledgeQueryRetrievalHints
} from './knowledge-query-plan.types'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'
import { KnowledgeVectorStoreService } from './knowledge-vector-store.service'

@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    private readonly knowledgeVectorStoreService: KnowledgeVectorStoreService,
    private readonly knowledgeBm25Service: KnowledgeBm25Service,
    private readonly knowledgeQueryEngineService: KnowledgeQueryEngineService
  ) {}

  async retrieveKnowledge(
    knowledgeBaseId: string | undefined,
    query: string,
    topK: number,
    options: {
      enableRewrite?: boolean
      runtimeConfig: KnowledgeBaseRuntimeConfig
    }
  ): Promise<KnowledgeSearchResponse> {
    const plan = await this.knowledgeQueryEngineService.buildPlan(query, {
      enableAnalysis:
        options.enableRewrite !== false && options.runtimeConfig.retrieval.queryAnalysisEnabled,
      runtimeConfig: options.runtimeConfig
    })

    const primaryResult = await this.retrieveWithHints(
      knowledgeBaseId,
      topK,
      plan,
      plan.retrieval
    )

    let finalResult = primaryResult
    let fallbackApplied = false
    let fallbackReason: string | null = null
    let exactEntityMiss = false

    const fallbackDecision = shouldFallback(plan, primaryResult.hits, topK)
    if (fallbackDecision.shouldFallback && plan.fallbackRetrieval) {
      fallbackApplied = true
      fallbackReason = fallbackDecision.reason
      exactEntityMiss = fallbackDecision.exactEntityMiss

      const fallbackResult = await this.retrieveWithHints(
        knowledgeBaseId,
        topK,
        plan,
        plan.fallbackRetrieval
      )

      finalResult = selectBetterResult(plan, primaryResult, fallbackResult)
    }

    const debug: KnowledgeSearchDebugInfo = {
      originalQuery: plan.originalQuery,
      normalizedQuery: plan.normalizedQuery,
      bm25Query: plan.bm25Query,
      vectorQuery: plan.vectorQuery,
      rewriteApplied: plan.rewriteApplied,
      retrievalMode: finalResult.hints.mode,
      bm25Weight: finalResult.hints.bm25Weight,
      vectorWeight: finalResult.hints.vectorWeight,
      bm25HitCount: finalResult.bm25Candidates.length,
      vectorHitCount: finalResult.vectorCandidates.length,
      routeType: finalResult.hints.mode,
      routeSource: finalResult.hints.source,
      routeConfidence: finalResult.hints.confidence,
      fallbackApplied,
      fallbackReason,
      exactEntityMiss,
      protectedTerms: plan.protectedTerms,
      excludedTerms: plan.excludedTerms,
      llmIntent: plan.analysis?.intent ?? null
    }

    return {
      hits: finalResult.hits,
      debug
    }
  }

  private async retrieveWithHints(
    knowledgeBaseId: string | undefined,
    topK: number,
    plan: KnowledgeQueryPlan,
    hints: KnowledgeQueryRetrievalHints
  ): Promise<RetrievalExecutionResult> {
    const candidateLimit = resolveCandidateLimit(topK, hints)

    // 两路召回并行执行，避免 query analysis 打开后额外串行放大耗时。
    const [bm25Candidates, vectorCandidates] = await Promise.all([
      this.knowledgeBm25Service.search(plan.bm25Query, knowledgeBaseId, candidateLimit),
      this.vectorRecall(plan.vectorQuery, knowledgeBaseId, candidateLimit)
    ])

    const mergedHits = mergeKnowledgeRetrievalCandidates(
      bm25Candidates,
      vectorCandidates,
      topK,
      {
        bm25Weight: hints.bm25Weight,
        vectorWeight: hints.vectorWeight
      }
    )

    return {
      hints,
      bm25Candidates,
      vectorCandidates,
      hits: applyDeterministicRerank(mergedHits, plan)
    }
  }

  private async vectorRecall(
    query: string,
    knowledgeBaseId: string | undefined,
    limit: number
  ): Promise<KnowledgeRetrievalCandidate[]> {
    const result = await this.knowledgeVectorStoreService.similaritySearchWithScore(
      query,
      limit,
      knowledgeBaseId
    )

    return result.map(([doc, score], index) => ({
      chunkId: doc.id ?? '',
      documentId: String(doc.metadata.documentId ?? ''),
      documentName: String(doc.metadata.documentName ?? ''),
      content: doc.pageContent,
      bm25Score: null,
      vectorScore: Number((score * 100).toFixed(4)),
      bm25Rank: null,
      vectorRank: index + 1,
      matchedBy: ['vector']
    }))
  }
}

function shouldFallback(
  plan: KnowledgeQueryPlan,
  hits: KnowledgeSearchHit[],
  topK: number
): {
  shouldFallback: boolean
  reason: string | null
  exactEntityMiss: boolean
} {
  if (!plan.fallbackRetrieval) {
    return {
      shouldFallback: false,
      reason: null,
      exactEntityMiss: false
    }
  }

  if (hits.length === 0) {
    return {
      shouldFallback: true,
      reason: 'no_hits',
      exactEntityMiss: false
    }
  }

  if (plan.protectedTerms.length > 0) {
    const topWindow = hits.slice(0, Math.min(3, hits.length))
    const hasExactEntityCoverage = topWindow.some((hit) =>
      isStrongProtectedTermMatch(hit, plan.protectedTerms)
    )

    if (!hasExactEntityCoverage) {
      return {
        shouldFallback: true,
        reason: 'protected_terms_not_covered',
        exactEntityMiss: true
      }
    }
  }

  if (hits.length < Math.min(2, topK) && plan.retrieval.mode !== 'balanced') {
    return {
      shouldFallback: true,
      reason: 'too_few_hits_for_non_balanced_route',
      exactEntityMiss: false
    }
  }

  return {
    shouldFallback: false,
    reason: null,
    exactEntityMiss: false
  }
}

function selectBetterResult(
  plan: KnowledgeQueryPlan,
  primary: RetrievalExecutionResult,
  fallback: RetrievalExecutionResult
): RetrievalExecutionResult {
  const primaryCoverage = computeTopCoverageScore(primary.hits, plan.protectedTerms)
  const fallbackCoverage = computeTopCoverageScore(fallback.hits, plan.protectedTerms)

  if (fallbackCoverage > primaryCoverage) {
    return fallback
  }

  if (fallbackCoverage === primaryCoverage) {
    const primaryTopScore = primary.hits[0]?.score ?? 0
    const fallbackTopScore = fallback.hits[0]?.score ?? 0

    if (fallback.hits.length > primary.hits.length && fallbackTopScore >= primaryTopScore * 0.7) {
      return fallback
    }
  }

  return primary
}

// 这层只做“确定性的精确匹配重排”，不改分数定义，只改顺序。
function applyDeterministicRerank(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan
): KnowledgeSearchHit[] {
  if (hits.length <= 1) {
    return hits
  }

  return [...hits].sort((left, right) => {
    const leftSignal = computeHitSignal(left, plan.protectedTerms, plan.excludedTerms)
    const rightSignal = computeHitSignal(right, plan.protectedTerms, plan.excludedTerms)

    // 对带结构化编号的 query，先按完整编号覆盖做硬排序，避免近邻文档靠语义分顶上来。
    if (rightSignal.structuredFullCoverage !== leftSignal.structuredFullCoverage) {
      return rightSignal.structuredFullCoverage - leftSignal.structuredFullCoverage
    }

    // 同族不同号属于典型误召回，要比普通 fused score 更早地下沉。
    if (leftSignal.siblingIdentifierConflicts !== rightSignal.siblingIdentifierConflicts) {
      return leftSignal.siblingIdentifierConflicts - rightSignal.siblingIdentifierConflicts
    }

    if (rightSignal.fullCoverage !== leftSignal.fullCoverage) {
      return rightSignal.fullCoverage - leftSignal.fullCoverage
    }

    if (leftSignal.excludedMatches !== rightSignal.excludedMatches) {
      return leftSignal.excludedMatches - rightSignal.excludedMatches
    }

    if (
      rightSignal.structuredDocumentNameMatches !== leftSignal.structuredDocumentNameMatches
    ) {
      return (
        rightSignal.structuredDocumentNameMatches -
        leftSignal.structuredDocumentNameMatches
      )
    }

    if (rightSignal.structuredTermMatches !== leftSignal.structuredTermMatches) {
      return rightSignal.structuredTermMatches - leftSignal.structuredTermMatches
    }

    if (rightSignal.documentNameMatches !== leftSignal.documentNameMatches) {
      return rightSignal.documentNameMatches - leftSignal.documentNameMatches
    }

    if (rightSignal.termMatches !== leftSignal.termMatches) {
      return rightSignal.termMatches - leftSignal.termMatches
    }

    const rightFusedScore = right.scoreDetail?.fusedScore ?? 0
    const leftFusedScore = left.scoreDetail?.fusedScore ?? 0
    if (rightFusedScore !== leftFusedScore) {
      return rightFusedScore - leftFusedScore
    }

    const rightBm25Score = right.scoreDetail?.bm25Score ?? -1
    const leftBm25Score = left.scoreDetail?.bm25Score ?? -1
    if (rightBm25Score !== leftBm25Score) {
      return rightBm25Score - leftBm25Score
    }

    return right.score - left.score
  })
}

function computeHitSignal(
  hit: KnowledgeSearchHit,
  protectedTerms: string[],
  excludedTerms: string[]
): {
  structuredFullCoverage: number
  structuredTermMatches: number
  structuredDocumentNameMatches: number
  siblingIdentifierConflicts: number
  fullCoverage: number
  termMatches: number
  documentNameMatches: number
  excludedMatches: number
} {
  const normalizedDocumentName = normalizeForExactMatch(hit.documentName)
  const normalizedContent = normalizeForExactMatch(hit.content)
  const normalizedText = `${normalizedDocumentName} ${normalizedContent}`
  const protectedTermGroups = splitProtectedTerms(protectedTerms)

  let excludedMatches = 0

  for (const term of excludedTerms) {
    const normalizedTerm = normalizeForExactMatch(term)
    if (!normalizedTerm) {
      continue
    }

    if (containsExactTerm(normalizedText, normalizedTerm)) {
      excludedMatches += 1
    }
  }

  if (protectedTerms.length === 0) {
    return {
      structuredFullCoverage: 0,
      structuredTermMatches: 0,
      structuredDocumentNameMatches: 0,
      siblingIdentifierConflicts: 0,
      fullCoverage: 0,
      termMatches: 0,
      documentNameMatches: 0,
      excludedMatches
    }
  }

  let termMatches = 0
  let documentNameMatches = 0
  let structuredTermMatches = 0
  let structuredDocumentNameMatches = 0

  for (const term of protectedTerms) {
    const normalizedTerm = normalizeForExactMatch(term)
    if (!normalizedTerm) {
      continue
    }

    const structuredTerm = protectedTermGroups.structuredSet.has(normalizedTerm)

    if (containsExactTerm(normalizedDocumentName, normalizedTerm)) {
      documentNameMatches += 1
      termMatches += 1
      if (structuredTerm) {
        structuredDocumentNameMatches += 1
        structuredTermMatches += 1
      }
      continue
    }

    if (containsExactTerm(normalizedContent, normalizedTerm)) {
      termMatches += 1
      if (structuredTerm) {
        structuredTermMatches += 1
      }
    }
  }

  const siblingIdentifierConflicts = countSiblingIdentifierConflicts(
    normalizedDocumentName,
    normalizedText,
    protectedTermGroups.structured
  )
  const structuredProtectedCount = protectedTermGroups.structured.length

  return {
    structuredFullCoverage:
      structuredProtectedCount > 0 && structuredTermMatches === structuredProtectedCount ? 1 : 0,
    structuredTermMatches,
    structuredDocumentNameMatches,
    siblingIdentifierConflicts,
    fullCoverage: termMatches === protectedTerms.length ? 1 : 0,
    termMatches,
    documentNameMatches,
    excludedMatches
  }
}

function isStrongProtectedTermMatch(
  hit: KnowledgeSearchHit,
  protectedTerms: string[]
): boolean {
  const signal = computeHitSignal(hit, protectedTerms, [])
  return signal.structuredTermMatches > 0
    ? signal.structuredFullCoverage === 1
    : signal.fullCoverage === 1
}

function computeTopCoverageScore(
  hits: KnowledgeSearchHit[],
  protectedTerms: string[]
): number {
  if (protectedTerms.length === 0 || hits.length === 0) {
    return 0
  }

  return hits
    .slice(0, Math.min(3, hits.length))
    .reduce((maxScore, hit) => {
      const signal = computeHitSignal(hit, protectedTerms, [])
      const coverageScore =
        signal.structuredFullCoverage * 1000 +
        signal.structuredDocumentNameMatches * 100 -
        signal.siblingIdentifierConflicts * 20 +
        signal.fullCoverage * 100 +
        signal.documentNameMatches * 10 +
        signal.termMatches

      return Math.max(maxScore, coverageScore)
    }, 0)
}

function resolveCandidateLimit(topK: number, hints: KnowledgeQueryRetrievalHints): number {
  const scaled = Math.max(1, Math.floor(topK)) * hints.candidateMultiplier

  return Math.min(
    Math.max(scaled, hints.minCandidateLimit),
    hints.maxCandidateLimit
  )
}

function normalizeForExactMatch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[，、；：]/g, ' ')
    .replace(/[。！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 这里既支持整词匹配，也兼容带连接符的结构化 token。
function containsExactTerm(haystack: string, needle: string): boolean {
  if (!haystack || !needle) {
    return false
  }

  if (haystack.includes(needle)) {
    return true
  }

  const escapedNeedle = escapeRegex(needle)
  const pattern = new RegExp(`(^|[^a-z0-9])${escapedNeedle}([^a-z0-9]|$)`, 'i')
  return pattern.test(haystack)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitProtectedTerms(protectedTerms: string[]): {
  structured: string[]
  structuredSet: Set<string>
} {
  const structured = protectedTerms
    .map((term) => normalizeForExactMatch(term))
    .filter((term) => term && isStructuredIdentifierTerm(term))

  return {
    structured,
    structuredSet: new Set(structured)
  }
}

function countSiblingIdentifierConflicts(
  normalizedDocumentName: string,
  normalizedText: string,
  structuredProtectedTerms: string[]
): number {
  if (structuredProtectedTerms.length === 0) {
    return 0
  }

  const documentIdentifiers = extractStructuredIdentifierTerms(normalizedDocumentName)
  const textIdentifiers = extractStructuredIdentifierTerms(normalizedText)
  let conflicts = 0

  for (const term of structuredProtectedTerms) {
    if (containsExactTerm(normalizedText, term)) {
      continue
    }

    const familyKey = buildIdentifierFamilyKey(term)
    if (!familyKey) {
      continue
    }

    const hasSiblingInDocumentName = documentIdentifiers.some(
      (candidate) => candidate !== term && buildIdentifierFamilyKey(candidate) === familyKey
    )
    if (hasSiblingInDocumentName) {
      conflicts += 1
      continue
    }

    const hasSiblingInContent = textIdentifiers.some(
      (candidate) => candidate !== term && buildIdentifierFamilyKey(candidate) === familyKey
    )
    if (hasSiblingInContent) {
      conflicts += 1
    }
  }

  return conflicts
}

function extractStructuredIdentifierTerms(value: string): string[] {
  const matches = value.match(STRUCTURED_IDENTIFIER_TERM_PATTERN) ?? []
  return [...new Set(matches.map((item) => item.trim()).filter(Boolean))]
}

function buildIdentifierFamilyKey(value: string): string {
  const lastSeparatorIndex = Math.max(
    value.lastIndexOf('-'),
    value.lastIndexOf('_'),
    value.lastIndexOf('.'),
    value.lastIndexOf('/'),
    value.lastIndexOf(':')
  )

  if (lastSeparatorIndex > 0) {
    return value.slice(0, lastSeparatorIndex)
  }

  const compactMatch = value.match(/^([a-z]+)(\d{2,})$/i)
  if (compactMatch) {
    return compactMatch[1].toLowerCase()
  }

  return ''
}

function isStructuredIdentifierTerm(value: string): boolean {
  return /[a-z]/i.test(value) && /\d/.test(value)
}

const STRUCTURED_IDENTIFIER_TERM_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,8}[-_]?\d{2,})\b/gi

type RetrievalExecutionResult = {
  hints: KnowledgeQueryRetrievalHints
  bm25Candidates: KnowledgeRetrievalCandidate[]
  vectorCandidates: KnowledgeRetrievalCandidate[]
  hits: KnowledgeSearchHit[]
}
