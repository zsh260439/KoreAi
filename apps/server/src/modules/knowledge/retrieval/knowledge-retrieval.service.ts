import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type {
  KnowledgeBaseRuntimeConfig,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  KnowledgeSearchResponse
} from 'share-type'

import { KnowledgeBm25Service } from './knowledge-bm25.service'
import {
  computeKnowledgeEvidenceCoverage,
  computeKnowledgeEvidenceScore,
  hasKnowledgeEvidenceRequirements,
  resolveEvidenceGateStatus
} from '../evidence/knowledge-evidence-planner'
import { mergeKnowledgeRetrievalCandidates } from './knowledge-hybrid-ranker'
import { KnowledgeQueryEngineService } from '../query/knowledge-query-engine.service'
import type {
  KnowledgeQueryPlan,
  KnowledgeQueryRetrievalHints
} from '../query/knowledge-query-plan.types'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'
import { KnowledgeVectorStoreService } from './knowledge-vector-store.service'
import {
  filterCeRelevantHits,
  fetchCeRerankScores,
  shouldApplyCeRerank
} from './knowledge-ce-ranker'

@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    private readonly knowledgeVectorStoreService: KnowledgeVectorStoreService,
    private readonly knowledgeBm25Service: KnowledgeBm25Service,
    private readonly knowledgeQueryEngineService: KnowledgeQueryEngineService,
    private readonly dataSource: DataSource
  ) {}

  async retrieveKnowledge(
    knowledgeBaseId: string | undefined,
    query: string,
    topK: number,
    options: {
      forceRewrite?: boolean
      runtimeConfig: KnowledgeBaseRuntimeConfig
    }
  ): Promise<KnowledgeSearchResponse> {
    const analysisEnabled = options.runtimeConfig.retrieval.queryAnalysisEnabled
    let plan = await this.knowledgeQueryEngineService.buildPlan(query, {
      enableAnalysis: analysisEnabled,
      forceAnalysis: analysisEnabled && options.forceRewrite === true,
      runtimeConfig: options.runtimeConfig,
      requestedTopK: topK
    })

    let finalResult = await this.retrieveWithHints(
      knowledgeBaseId,
      plan,
      plan.retrieval
    )
    let fallbackApplied = false
    const fallbackReasons: string[] = []
    let exactEntityMiss = false

    if (
      analysisEnabled &&
      options.forceRewrite !== true &&
      isWeakEvidence(plan, finalResult)
    ) {
      const rewrittenPlan = await this.knowledgeQueryEngineService.buildPlan(query, {
        enableAnalysis: true,
        forceAnalysis: true,
        runtimeConfig: options.runtimeConfig,
        requestedTopK: topK
      })

      if (rewrittenPlan.rewriteApplied) {
        plan = rewrittenPlan
        finalResult = await this.retrieveWithHints(
          knowledgeBaseId,
          plan,
          plan.retrieval
        )
        fallbackApplied = true
        fallbackReasons.push('weak_evidence_query_rewrite')
      }
    }

    if (isWeakEvidence(plan, finalResult)) {
      const expanded = expandWeakEvidenceRetrieval(plan, topK)
      if (
        expanded.plan.evidencePlan.targetTopK > plan.evidencePlan.targetTopK ||
        expanded.hints.candidateMultiplier > plan.retrieval.candidateMultiplier
      ) {
        plan = expanded.plan
        finalResult = await this.retrieveWithHints(
          knowledgeBaseId,
          plan,
          expanded.hints
        )
        fallbackApplied = true
        fallbackReasons.push('weak_evidence_candidate_expansion')
      }
    }

    const fallbackDecision = shouldFallback(plan, finalResult.hits, topK)
    if (fallbackDecision.shouldFallback && plan.fallbackRetrieval) {
      fallbackApplied = true
      if (fallbackDecision.reason) {
        fallbackReasons.push(fallbackDecision.reason)
      }
      exactEntityMiss = fallbackDecision.exactEntityMiss

      const fallbackResult = await this.retrieveWithHints(
        knowledgeBaseId,
        plan,
        plan.fallbackRetrieval
      )

      finalResult = selectBetterResult(plan, finalResult, fallbackResult)
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
      candidateLimit: finalResult.candidateLimit,
      ceCandidateCount: finalResult.ceCandidateCount,
      candidateDocumentNames: finalResult.candidateDocumentNames,
      routeType: finalResult.hints.mode,
      routeSource: finalResult.hints.source,
      routeConfidence: finalResult.hints.confidence,
      fallbackApplied,
      fallbackReason: fallbackReasons.join(',') || null,
      exactEntityMiss,
      protectedTerms: plan.protectedTerms,
      excludedTerms: plan.excludedTerms,
      llmIntent: plan.analysis?.intent ?? null,
      evidenceComplexity: plan.evidencePlan.complexity,
      evidenceTerms: plan.evidencePlan.evidenceTerms,
      evidenceNumericTerms: plan.evidencePlan.numericTerms,
      effectiveTopK: finalResult.effectiveTopK,
      evidenceCoverage: finalResult.evidenceCoverage,
      evidenceExpansionApplied: finalResult.evidenceExpansionApplied,
      evidenceGateStatus: finalResult.evidenceGateStatus
    }

    return {
      hits: finalResult.hits,
      debug
    }
  }

  private async retrieveWithHints(
    knowledgeBaseId: string | undefined,
    plan: KnowledgeQueryPlan,
    hints: KnowledgeQueryRetrievalHints
  ): Promise<RetrievalExecutionResult> {
    const effectiveTopK = plan.evidencePlan.targetTopK
    const baseCandidateLimit = resolveCandidateLimit(effectiveTopK, hints)
    const candidateLimit = resolveCeCandidateLimit(baseCandidateLimit, effectiveTopK, hints, plan)

    // 基础召回和 reference 轻量通道并行执行，避免规则/标准类文档被近邻业务文档盖掉。
    const [bm25Candidates, vectorCandidates, referenceCandidates] = await Promise.all([
      this.knowledgeBm25Service.search(plan.bm25Query, knowledgeBaseId, candidateLimit),
      this.vectorRecall(plan.vectorQuery, knowledgeBaseId, candidateLimit),
      this.referenceRecall(knowledgeBaseId, plan, candidateLimit)
    ])

    const mergedHits = mergeKnowledgeRetrievalCandidates(
      [...bm25Candidates, ...referenceCandidates],
      vectorCandidates,
      resolveMergedCandidateLimit(candidateLimit, plan),
      {
        bm25Weight: hints.bm25Weight,
        vectorWeight: hints.vectorWeight
      }
    )

    const ceScoreMap = shouldApplyCeRerank(plan)
      ? await fetchCeRerankScores(mergedHits, plan.originalQuery)
      : null
    const rerankedHits = applyDeterministicRerank(mergedHits, plan, ceScoreMap)
    const relevantHits = filterCeRelevantHits(rerankedHits, ceScoreMap)
    const finalHits = await this.assembleEvidenceContext(relevantHits, plan)
    const completedHits = includeReferenceEvidence(finalHits, referenceCandidates, plan)
    const hasEvidenceRequirements = hasKnowledgeEvidenceRequirements(plan.evidencePlan)
    const evidenceCoverage = hasEvidenceRequirements
      ? computeKnowledgeEvidenceCoverage(completedHits, plan.evidencePlan)
      : 0

    return {
      hints,
      bm25Candidates,
      vectorCandidates,
      hits: completedHits,
      effectiveTopK,
      candidateLimit,
      ceCandidateCount: ceScoreMap?.size ?? 0,
      candidateDocumentNames: rerankedHits.map((hit) => hit.documentName),
      evidenceCoverage,
      evidenceExpansionApplied:
        completedHits.some((hit) => hit.scoreDetail?.matchedBy.length === 0),
      evidenceGateStatus:
        completedHits.length === 0
          ? 'blocked'
          : hasEvidenceRequirements
            ? resolveEvidenceGateStatus(evidenceCoverage, plan.evidencePlan)
            : 'degraded'
    }
  }

  private async assembleEvidenceContext(
    hits: KnowledgeSearchHit[],
    plan: KnowledgeQueryPlan
  ): Promise<KnowledgeSearchHit[]> {
    const selected = hits.slice(0, plan.evidencePlan.targetTopK)
    const selectedCoverage = computeKnowledgeEvidenceCoverage(selected, plan.evidencePlan)

    if (
      selectedCoverage >= plan.evidencePlan.requiredCoverage ||
      selected.length === 0 ||
      selected.length >= plan.evidencePlan.maxTopK
    ) {
      return selected
    }

    const expanded = [...selected]
    const seenChunkIds = new Set(expanded.map((hit) => hit.chunkId))
    const documentIds = uniqueStrings(selected.slice(0, 3).map((hit) => hit.documentId))

    for (const documentId of documentIds) {
      if (expanded.length >= plan.evidencePlan.maxTopK) {
        break
      }

      const siblingPool = (await this.loadSiblingEvidenceChunks(documentId, seenChunkIds))
        .map((hit) => attachEvidenceScore(hit, plan))

      for (let pickedCount = 0; pickedCount < 3; pickedCount += 1) {
        if (expanded.length >= plan.evidencePlan.maxTopK) {
          break
        }

        const nextSibling = pickBestUncoveredEvidenceSibling(siblingPool, expanded, plan)
        if (!nextSibling) {
          break
        }

        expanded.push(markEvidenceExpansionHit(nextSibling))
        seenChunkIds.add(nextSibling.chunkId)

        const coverage = computeKnowledgeEvidenceCoverage(expanded, plan.evidencePlan)
        if (coverage >= plan.evidencePlan.requiredCoverage) {
          return expanded
        }
      }
    }

    return expanded
  }

  private async loadSiblingEvidenceChunks(
    documentId: string,
    excludedChunkIds: Set<string>
  ): Promise<KnowledgeSearchHit[]> {
    const rows = (await this.dataSource.query(
      `
        SELECT
          chunk.id AS "chunkId",
          chunk."documentId" AS "documentId",
          chunk."documentName" AS "documentName",
          chunk.sequence AS "sequence",
          chunk."sectionPath" AS "sectionPath",
          chunk."primaryTitle" AS "primaryTitle",
          chunk.content AS "content"
        FROM "knowledge_chunks" AS chunk
        INNER JOIN "knowledge_document" AS document ON document.id = chunk."documentId"
        WHERE chunk."documentId" = $1::uuid
          AND document.status = 'indexed'
          AND chunk."revisionId" = document."activeRevisionId"
        ORDER BY chunk.sequence ASC
      `,
      [documentId]
    )) as Array<{
      chunkId: string
      documentId: string
      documentName: string
      sequence: number | null
      sectionPath: string | null
      primaryTitle: string | null
      content: string
    }>

    return rows
      .filter((row) => !excludedChunkIds.has(row.chunkId))
      .map((row) => ({
        chunkId: row.chunkId,
        documentId: row.documentId,
        documentName: row.documentName,
        sequence: row.sequence,
        sectionPath: row.sectionPath,
        primaryTitle: row.primaryTitle,
        content: row.content,
        score: 0,
        scoreDetail: {
          matchedBy: [],
          bm25Score: null,
          vectorScore: null,
          fusedScore: 0
        }
      }))
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
      sequence: normalizeMetadataNumber(doc.metadata.sequence),
      sectionPath: normalizeMetadataString(doc.metadata.sectionPath ?? doc.metadata.sectionPaths),
      primaryTitle: normalizeMetadataString(doc.metadata.primaryTitle ?? doc.metadata.titles),
      content: doc.pageContent,
      bm25Score: null,
      vectorScore: Number((score * 100).toFixed(4)),
      bm25Rank: null,
      vectorRank: index + 1,
      matchedBy: ['vector']
    }))
  }

  private async referenceRecall(
    knowledgeBaseId: string | undefined,
    plan: KnowledgeQueryPlan,
    limit: number
  ): Promise<KnowledgeRetrievalCandidate[]> {
    if (!plan.evidencePlan.needsReference) {
      return []
    }

    const terms = uniqueStrings([
      ...plan.protectedTerms,
      ...plan.evidencePlan.referenceTerms,
      ...plan.evidencePlan.evidenceTerms
    ]).slice(0, 24)

    if (terms.length === 0) {
      return []
    }

    const likePatterns = terms.map((term) => `%${escapeLikePattern(term.toLowerCase())}%`)
    const strictRoleLikePatterns = buildStrictReferenceRoleLikePatterns()
    const evidenceRows = (await this.dataSource.query(
      `
        SELECT
          chunk.id AS "chunkId",
          chunk."documentId" AS "documentId",
          chunk."documentName" AS "documentName",
          chunk.sequence AS "sequence",
          chunk."sectionPath" AS "sectionPath",
          chunk."primaryTitle" AS "primaryTitle",
          chunk.content AS "content",
          0 AS "roleNameScore",
          (
            SELECT COUNT(*)
            FROM UNNEST($2::text[]) AS evidence_pattern
            WHERE
              LOWER(COALESCE(chunk."documentName", '')) LIKE evidence_pattern
              OR LOWER(COALESCE(chunk."primaryTitle", '')) LIKE evidence_pattern
              OR LOWER(COALESCE(chunk."sectionPath", '')) LIKE evidence_pattern
              OR LOWER(chunk.content) LIKE evidence_pattern
          ) AS "evidenceMatchCount"
        FROM "knowledge_chunks" AS chunk
        INNER JOIN "knowledge_document" AS document ON document.id = chunk."documentId"
        WHERE document.status = 'indexed'
          AND chunk."revisionId" = document."activeRevisionId"
          AND ($1::uuid IS NULL OR chunk."knowledgeBaseId" = $1::uuid)
          AND (
            LOWER(COALESCE(chunk."documentName", '')) LIKE ANY($2::text[])
            OR LOWER(COALESCE(chunk."primaryTitle", '')) LIKE ANY($2::text[])
            OR LOWER(COALESCE(chunk."sectionPath", '')) LIKE ANY($2::text[])
            OR LOWER(chunk.content) LIKE ANY($2::text[])
          )
        ORDER BY chunk."updatedAt" DESC, chunk.sequence ASC
        LIMIT $3
      `,
      [knowledgeBaseId ?? null, likePatterns, Math.min(limit, 80)]
    )) as ReferenceRecallRow[]
    const roleRows = (await this.dataSource.query(
      `
        SELECT
          chunk.id AS "chunkId",
          chunk."documentId" AS "documentId",
          chunk."documentName" AS "documentName",
          chunk.sequence AS "sequence",
          chunk."sectionPath" AS "sectionPath",
          chunk."primaryTitle" AS "primaryTitle",
          chunk.content AS "content",
          (
            CASE WHEN LOWER(COALESCE(chunk."documentName", '')) LIKE ANY($2::text[]) THEN 4 ELSE 0 END +
            CASE WHEN LOWER(COALESCE(chunk."primaryTitle", '')) LIKE ANY($2::text[]) THEN 3 ELSE 0 END +
            CASE WHEN LOWER(COALESCE(chunk."sectionPath", '')) LIKE ANY($2::text[]) THEN 2 ELSE 0 END
          ) AS "roleNameScore",
          (
            SELECT COUNT(*)
            FROM UNNEST($3::text[]) AS evidence_pattern
            WHERE
              LOWER(COALESCE(chunk."documentName", '')) LIKE evidence_pattern
              OR LOWER(COALESCE(chunk."primaryTitle", '')) LIKE evidence_pattern
              OR LOWER(COALESCE(chunk."sectionPath", '')) LIKE evidence_pattern
              OR LOWER(chunk.content) LIKE evidence_pattern
          ) AS "evidenceMatchCount"
        FROM "knowledge_chunks" AS chunk
        INNER JOIN "knowledge_document" AS document ON document.id = chunk."documentId"
        WHERE document.status = 'indexed'
          AND chunk."revisionId" = document."activeRevisionId"
          AND ($1::uuid IS NULL OR chunk."knowledgeBaseId" = $1::uuid)
          AND (
            LOWER(COALESCE(chunk."documentName", '')) LIKE ANY($2::text[])
            OR LOWER(COALESCE(chunk."primaryTitle", '')) LIKE ANY($2::text[])
            OR LOWER(COALESCE(chunk."sectionPath", '')) LIKE ANY($2::text[])
          )
          AND (
            LOWER(COALESCE(chunk."documentName", '')) LIKE ANY($3::text[])
            OR LOWER(COALESCE(chunk."primaryTitle", '')) LIKE ANY($3::text[])
            OR LOWER(COALESCE(chunk."sectionPath", '')) LIKE ANY($3::text[])
            OR LOWER(chunk.content) LIKE ANY($3::text[])
          )
        ORDER BY "roleNameScore" DESC, "evidenceMatchCount" DESC, chunk.sequence ASC, chunk."updatedAt" DESC
        LIMIT $4
      `,
      [knowledgeBaseId ?? null, strictRoleLikePatterns, likePatterns, Math.min(limit, 80)]
    )) as ReferenceRecallRow[]

    const scoredItems = mergeReferenceRecallRows(evidenceRows, roleRows)
      .map((row) => {
        const documentName = row.documentName ?? ''
        const evidenceScore = computeKnowledgeEvidenceScore(
          {
            documentName,
            primaryTitle: row.primaryTitle,
            sectionPath: row.sectionPath,
            content: row.content
          },
          plan.evidencePlan
        ).score
        const sqlEvidenceMatchCount = normalizeMetadataNumber(row.evidenceMatchCount) ?? 0
        const sqlRoleNameScore = normalizeMetadataNumber(row.roleNameScore) ?? 0
        const sequenceBoost = row.sequence === 0 ? 45 : row.sequence === 1 ? 10 : 0

        return {
          row,
          evidenceScore,
          sqlEvidenceMatchCount,
          sqlRoleNameScore,
          recallScore:
            evidenceScore +
            sqlEvidenceMatchCount * 5 +
            sqlRoleNameScore * 12 +
            sequenceBoost
        }
      })
      .filter((item) => item.sqlRoleNameScore > 0 && item.recallScore > 0)
      .sort((left, right) => right.recallScore - left.recallScore)

    return dedupeReferenceRecallItems(scoredItems)
      .slice(0, Math.min(limit, 40))
      .map((item, index) => ({
        chunkId: item.row.chunkId,
        documentId: item.row.documentId,
        documentName: item.row.documentName ?? '',
        sequence: item.row.sequence,
        sectionPath: item.row.sectionPath,
        primaryTitle: item.row.primaryTitle,
        content: item.row.content,
        bm25Score: item.recallScore,
        vectorScore: null,
        bm25Rank: index + 1,
        vectorRank: null,
        matchedBy: ['bm25']
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

  if (hasStructuredProtectedTerms(plan.protectedTerms)) {
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

function isWeakEvidence(
  plan: KnowledgeQueryPlan,
  result: RetrievalExecutionResult
): boolean {
  return (
    result.evidenceGateStatus !== 'pass' ||
    !hasKnowledgeEvidenceRequirements(plan.evidencePlan)
  )
}

function expandWeakEvidenceRetrieval(
  plan: KnowledgeQueryPlan,
  requestedTopK: number
): {
  plan: KnowledgeQueryPlan
  hints: KnowledgeQueryRetrievalHints
} {
  const targetTopK = Math.min(
    Math.max(plan.evidencePlan.targetTopK, requestedTopK, 8),
    10
  )
  const candidateMultiplier = Math.max(
    plan.retrieval.candidateMultiplier,
    Math.ceil(plan.retrieval.maxCandidateLimit / targetTopK)
  )

  return {
    plan: {
      ...plan,
      evidencePlan: {
        ...plan.evidencePlan,
        targetTopK,
        maxTopK: Math.min(Math.max(plan.evidencePlan.maxTopK, targetTopK + 2), 10)
      }
    },
    hints: {
      ...plan.retrieval,
      source: 'fallback',
      candidateMultiplier
    }
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
  plan: KnowledgeQueryPlan,
  ceScoreMap: Map<string, number> | null = null
): KnowledgeSearchHit[] {
  if (hits.length <= 1) {
    return hits
  }

  return hits.map((hit) => attachRerankScores(hit, plan, ceScoreMap)).sort((left, right) => {
    const leftSignal = computeHitSignal(left, plan.protectedTerms, plan.excludedTerms)
    const rightSignal = computeHitSignal(right, plan.protectedTerms, plan.excludedTerms)
    const leftEvidenceScore = left.scoreDetail?.evidenceScore ?? 0
    const rightEvidenceScore = right.scoreDetail?.evidenceScore ?? 0

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

    if (rightEvidenceScore !== leftEvidenceScore) {
      return rightEvidenceScore - leftEvidenceScore
    }

    const rightCeScore = right.scoreDetail?.ceScore
    const leftCeScore = left.scoreDetail?.ceScore
    if (rightCeScore !== undefined && leftCeScore !== undefined && rightCeScore !== leftCeScore) {
      return rightCeScore - leftCeScore
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

function attachRerankScores(
  hit: KnowledgeSearchHit,
  plan: KnowledgeQueryPlan,
  ceScoreMap: Map<string, number> | null
): KnowledgeSearchHit {
  const scoredHit = attachEvidenceScore(hit, plan)
  const ceScore = ceScoreMap?.get(hit.chunkId)
  if (ceScore === undefined || !scoredHit.scoreDetail) {
    return scoredHit
  }

  return {
    ...scoredHit,
    scoreDetail: {
      ...scoredHit.scoreDetail,
      ceScore
    }
  }
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

function attachEvidenceScore(
  hit: KnowledgeSearchHit,
  plan: KnowledgeQueryPlan
): KnowledgeSearchHit {
  const evidence = computeKnowledgeEvidenceScore(hit, plan.evidencePlan)

  return {
    ...hit,
    scoreDetail: {
      matchedBy: hit.scoreDetail?.matchedBy ?? [],
      bm25Score: hit.scoreDetail?.bm25Score ?? null,
      vectorScore: hit.scoreDetail?.vectorScore ?? null,
      fusedScore: hit.scoreDetail?.fusedScore ?? 0,
      evidenceScore: evidence.score,
      matchedEvidenceTerms: evidence.matchedEvidenceTerms,
      matchedNumericTerms: evidence.matchedNumericTerms,
      documentRole: evidence.documentRole
    }
  }
}

function markEvidenceExpansionHit(hit: KnowledgeSearchHit): KnowledgeSearchHit {
  return {
    ...hit,
    score: hit.score > 0 ? hit.score : 1,
    scoreDetail: {
      matchedBy: [],
      bm25Score: hit.scoreDetail?.bm25Score ?? null,
      vectorScore: hit.scoreDetail?.vectorScore ?? null,
      fusedScore: hit.scoreDetail?.fusedScore ?? 0,
      evidenceScore: hit.scoreDetail?.evidenceScore ?? 0,
      matchedEvidenceTerms: hit.scoreDetail?.matchedEvidenceTerms ?? [],
      matchedNumericTerms: hit.scoreDetail?.matchedNumericTerms ?? [],
      documentRole: hit.scoreDetail?.documentRole
    }
  }
}

function pickBestUncoveredEvidenceSibling(
  candidates: KnowledgeSearchHit[],
  selectedHits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan
): KnowledgeSearchHit | null {
  const coveredTerms = collectCoveredEvidenceTerms(selectedHits, plan.evidencePlan)
  let bestIndex = -1
  let bestScore = 0

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const evidence = computeKnowledgeEvidenceScore(candidate, plan.evidencePlan)
    const uncoveredGain = computeUncoveredEvidenceGain(evidence, coveredTerms)
    const totalScore = uncoveredGain > 0 ? uncoveredGain * 100 + evidence.score : 0

    if (totalScore > bestScore) {
      bestIndex = index
      bestScore = totalScore
    }
  }

  if (bestIndex < 0 || bestScore <= 0) {
    return null
  }

  const [bestCandidate] = candidates.splice(bestIndex, 1)
  return bestCandidate
}

function collectCoveredEvidenceTerms(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan['evidencePlan']
): CoveredEvidenceTerms {
  const coveredTerms: CoveredEvidenceTerms = {
    identifiers: new Set<string>(),
    numericTerms: new Set<string>(),
    evidenceTerms: new Set<string>()
  }

  for (const hit of hits) {
    const evidence = computeKnowledgeEvidenceScore(hit, plan)
    addCoveredTerms(coveredTerms.identifiers, evidence.matchedIdentifiers)
    addCoveredTerms(coveredTerms.numericTerms, evidence.matchedNumericTerms)
    addCoveredTerms(coveredTerms.evidenceTerms, evidence.matchedEvidenceTerms)
  }

  return coveredTerms
}

function computeUncoveredEvidenceGain(
  evidence: ReturnType<typeof computeKnowledgeEvidenceScore>,
  coveredTerms: CoveredEvidenceTerms
): number {
  const identifierGain = countUncoveredTerms(evidence.matchedIdentifiers, coveredTerms.identifiers) * 50
  const numericGain = countUncoveredTerms(evidence.matchedNumericTerms, coveredTerms.numericTerms) * 35
  const evidenceTermGain = Math.min(
    countUncoveredTerms(evidence.matchedEvidenceTerms, coveredTerms.evidenceTerms) * 10,
    40
  )

  return identifierGain + numericGain + evidenceTermGain
}

function countUncoveredTerms(terms: string[], coveredTerms: Set<string>): number {
  return uniqueStrings(terms).filter((term) => !coveredTerms.has(normalizeEvidenceTerm(term))).length
}

function addCoveredTerms(target: Set<string>, terms: string[]): void {
  for (const term of terms) {
    const normalizedTerm = normalizeEvidenceTerm(term)
    if (normalizedTerm) {
      target.add(normalizedTerm)
    }
  }
}

function normalizeEvidenceTerm(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function includeReferenceEvidence(
  hits: KnowledgeSearchHit[],
  referenceCandidates: KnowledgeRetrievalCandidate[],
  plan: KnowledgeQueryPlan
): KnowledgeSearchHit[] {
  if (!plan.evidencePlan.needsReference || referenceCandidates.length === 0) {
    return hits
  }

  const selected = hits.slice(0, plan.evidencePlan.maxTopK)
  const coverage = computeKnowledgeEvidenceCoverage(selected, plan.evidencePlan)
  const seenChunkIds = new Set(selected.map((hit) => hit.chunkId))
  const seenDocumentNames = new Set(selected.map((hit) => hit.documentName))
  const candidates = referenceCandidates
    .filter((candidate) => !seenChunkIds.has(candidate.chunkId))
    .filter((candidate) => !seenDocumentNames.has(candidate.documentName))
    .map((candidate) => attachEvidenceScore(candidateToSearchHit(candidate), plan))
    .sort((left, right) => {
      const rightRecallScore = right.scoreDetail?.bm25Score ?? 0
      const leftRecallScore = left.scoreDetail?.bm25Score ?? 0
      if (rightRecallScore !== leftRecallScore) {
        return rightRecallScore - leftRecallScore
      }

      return (right.scoreDetail?.evidenceScore ?? 0) - (left.scoreDetail?.evidenceScore ?? 0)
    })

  const bestCandidate = candidates[0]
  const bestRecallScore = bestCandidate?.scoreDetail?.bm25Score ?? 0
  if (!bestCandidate || (coverage >= plan.evidencePlan.requiredCoverage && bestRecallScore < 120)) {
    return selected
  }

  if (selected.length < plan.evidencePlan.maxTopK) {
    return [...selected, bestCandidate]
  }

  return selected.map((hit, index) =>
    index === selected.length - 1 ? bestCandidate : hit
  )
}

function candidateToSearchHit(candidate: KnowledgeRetrievalCandidate): KnowledgeSearchHit {
  return {
    chunkId: candidate.chunkId,
    documentId: candidate.documentId,
    documentName: candidate.documentName,
    sequence: candidate.sequence,
    sectionPath: candidate.sectionPath,
    primaryTitle: candidate.primaryTitle,
    content: candidate.content,
    score: 1,
    scoreDetail: {
      matchedBy: candidate.matchedBy,
      bm25Score: candidate.bm25Score,
      vectorScore: candidate.vectorScore,
      fusedScore: 0
    }
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

    // 参考文档只补尾部证据，不抢占主检索的首位结果。
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

function resolveCeCandidateLimit(
  baseCandidateLimit: number,
  topK: number,
  hints: KnowledgeQueryRetrievalHints,
  plan: KnowledgeQueryPlan
): number {
  if (!shouldApplyCeRerank(plan)) {
    return baseCandidateLimit
  }

  const expandedLimit = Math.max(baseCandidateLimit, topK * 10, 40)
  return Math.min(expandedLimit, hints.maxCandidateLimit, 80)
}

function resolveMergedCandidateLimit(candidateLimit: number, plan: KnowledgeQueryPlan): number {
  if (shouldApplyCeRerank(plan)) {
    return Math.min(candidateLimit, 80)
  }

  return Math.min(candidateLimit, plan.evidencePlan.maxTopK * 6)
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

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function buildStrictReferenceRoleLikePatterns(): string[] {
  // 这里只表达“支撑/标准类文档”的文件名或标题角色，不绑定任何评测集文件名。
  return [
    '%reference%',
    '%standard%',
    '%guideline%',
    '%specification%',
    '%spec%',
    '%pack%',
    '%规范%',
    '%标准%',
    '%指南%',
    '%参考%',
    '%支撑%'
  ]
}

function mergeReferenceRecallRows(
  evidenceRows: ReferenceRecallRow[],
  roleRows: ReferenceRecallRow[]
): ReferenceRecallRow[] {
  const merged = new Map<string, ReferenceRecallRow>()

  for (const row of [...evidenceRows, ...roleRows]) {
    const current = merged.get(row.chunkId)
    if (!current) {
      merged.set(row.chunkId, row)
      continue
    }

    merged.set(row.chunkId, {
      ...current,
      roleNameScore: Math.max(
        normalizeMetadataNumber(current.roleNameScore) ?? 0,
        normalizeMetadataNumber(row.roleNameScore) ?? 0
      ),
      evidenceMatchCount: Math.max(
        normalizeMetadataNumber(current.evidenceMatchCount) ?? 0,
        normalizeMetadataNumber(row.evidenceMatchCount) ?? 0
      )
    })
  }

  return Array.from(merged.values())
}

function dedupeReferenceRecallItems<
  T extends { row: ReferenceRecallRow; recallScore: number }
>(items: T[]): T[] {
  const seenDocumentNames = new Set<string>()
  const result: T[] = []

  for (const item of items) {
    const documentName = item.row.documentName ?? ''
    const documentKey = documentName.trim().toLowerCase()
    if (documentKey && seenDocumentNames.has(documentKey)) {
      continue
    }

    if (documentKey) {
      seenDocumentNames.add(documentKey)
    }
    result.push(item)
  }

  return result
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

function hasStructuredProtectedTerms(protectedTerms: string[]): boolean {
  return splitProtectedTerms(protectedTerms).structured.length > 0
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

function normalizeMetadataNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeMetadataString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const flattened = value.flat(Infinity).filter((item) => typeof item === 'string')
    return flattened.length > 0 ? flattened.join(' / ') : null
  }

  return null
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

const STRUCTURED_IDENTIFIER_TERM_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,8}[-_]?\d{2,})\b/gi

type RetrievalExecutionResult = {
  hints: KnowledgeQueryRetrievalHints
  bm25Candidates: KnowledgeRetrievalCandidate[]
  vectorCandidates: KnowledgeRetrievalCandidate[]
  hits: KnowledgeSearchHit[]
  effectiveTopK: number
  candidateLimit: number
  ceCandidateCount: number
  candidateDocumentNames: string[]
  evidenceCoverage: number
  evidenceExpansionApplied: boolean
  evidenceGateStatus: 'pass' | 'degraded' | 'blocked'
}

type ReferenceRecallRow = {
  chunkId: string
  documentId: string
  documentName: string | null
  sequence: number | null
  sectionPath: string | null
  primaryTitle: string | null
  content: string
  roleNameScore: string | number
  evidenceMatchCount: string | number
}

type CoveredEvidenceTerms = {
  identifiers: Set<string>
  numericTerms: Set<string>
  evidenceTerms: Set<string>
}
