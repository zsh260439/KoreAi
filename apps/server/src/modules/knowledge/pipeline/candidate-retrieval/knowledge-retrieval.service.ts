import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type {
  KnowledgeRetrievalSource,
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
} from '../evidence-gating/knowledge-evidence-planner'
import { mergeKnowledgeRetrievalCandidates } from './knowledge-hybrid-ranker'
import { KnowledgeQueryEngineService } from '../query-understanding/knowledge-query-engine.service'
import type {
  KnowledgeQueryPlan,
  KnowledgeQueryRetrievalHints
} from '../query-understanding/knowledge-query-plan.types'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'
import { KnowledgeVectorStoreService } from './knowledge-vector-store.service'
import {
  filterCeRelevantHits,
  fetchCeRerankScores,
  isExactFieldValueLookup,
  shouldApplyCeRerank
} from './knowledge-ce-ranker'

const QUERY_LEVEL_RRF_K = 60
const MAX_SECOND_LEVEL_QUERY_DOMAINS = 6
const WEAK_EVIDENCE_MAX_MULTIPLIER_STEP = 2
const EXACT_FIELD_VALUE_CANDIDATE_FACTOR = 6
const EXACT_FIELD_VALUE_MIN_CANDIDATES = 40
const COMPLEX_QUERY_CANDIDATE_FACTOR = 6
const COMPLEX_QUERY_MIN_CANDIDATES = 40

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
      retrievalHints?: string[]
    }
  ): Promise<KnowledgeSearchResponse> {
    const retrievalStartedAt = Date.now()
    const analysisEnabled = options.runtimeConfig.retrieval.queryAnalysisEnabled
    let queryAnalysisMs = 0
    let ceMs = 0
    const firstPlanStartedAt = Date.now()
    let plan = await this.knowledgeQueryEngineService.buildPlan(query, {
      enableAnalysis: analysisEnabled,
      forceAnalysis: analysisEnabled && options.forceRewrite === true,
      runtimeConfig: options.runtimeConfig,
      requestedTopK: topK,
      retrievalHints: options.retrievalHints
    })
    queryAnalysisMs += Date.now() - firstPlanStartedAt

    let finalResult = await this.retrieveWithHints(
      knowledgeBaseId,
      plan,
      plan.retrieval
    )
    ceMs += finalResult.ceRerankMs
    let fallbackApplied = false

    if (
      analysisEnabled &&
      options.forceRewrite !== true &&
      isWeakEvidence(plan, finalResult)
    ) {
      const rewriteStartedAt = Date.now()
      const rewrittenPlan = await this.knowledgeQueryEngineService.buildPlan(query, {
        enableAnalysis: true,
        forceAnalysis: true,
        runtimeConfig: options.runtimeConfig,
        requestedTopK: topK,
        retrievalHints: options.retrievalHints
      })
      queryAnalysisMs += Date.now() - rewriteStartedAt

      if (rewrittenPlan.rewriteApplied) {
        plan = rewrittenPlan
        finalResult = await this.retrieveWithSecondLevelRrf(
          knowledgeBaseId,
          plan,
          plan.retrieval
        )
        ceMs += finalResult.ceRerankMs
        fallbackApplied = true
      }
    }

    if (isWeakEvidence(plan, finalResult)) {
      const expanded = expandWeakEvidenceRetrieval(plan, topK)
      if (
        expanded.plan.evidencePlan.targetTopK > plan.evidencePlan.targetTopK ||
        expanded.hints.candidateMultiplier > plan.retrieval.candidateMultiplier
      ) {
        plan = expanded.plan
        finalResult = await this.retrieveWithSecondLevelRrf(
          knowledgeBaseId,
          plan,
          expanded.hints
        )
        ceMs += finalResult.ceRerankMs
        fallbackApplied = true
      }
    }

    const fallbackDecision = shouldFallback(plan, finalResult.hits, topK)
    if (fallbackDecision.shouldFallback && plan.fallbackRetrieval) {
      fallbackApplied = true
      const fallbackResult = await this.retrieveWithSecondLevelRrf(
        knowledgeBaseId,
        plan,
        plan.fallbackRetrieval
      )
      ceMs += fallbackResult.ceRerankMs

      finalResult = selectBetterResult(plan, finalResult, fallbackResult)
    }

    const debug: KnowledgeSearchDebugInfo = {
      originalQuery: plan.originalQuery,
      normalizedQuery: plan.normalizedQuery,
      bm25Query: plan.bm25Query,
      vectorQuery: plan.vectorQuery,
      rewriteApplied: plan.rewriteApplied,
      bm25Weight: finalResult.hints.bm25Weight,
      vectorWeight: finalResult.hints.vectorWeight,
      bm25HitCount: finalResult.bm25Candidates.length,
      vectorHitCount: finalResult.vectorCandidates.length,
      candidateLimit: finalResult.candidateLimit,
      ceCandidateCount: finalResult.ceCandidateCount,
      candidateDocumentNames: finalResult.candidateDocumentNames,
      fallbackApplied,
      ragUserIntent: plan.executionProfile.userIntent,
      ragScopeMode: plan.executionProfile.scopeMode,
      ragRetrievalMode: plan.executionProfile.retrievalMode,
      ragAnswerMode: plan.executionProfile.answerMode,
      scopeCoverage: finalResult.scopeCoverage,
      factCoverage: finalResult.factCoverage,
      retrievalScopeObjects: plan.scope.objects,
      excludedTerms: plan.excludedTerms,
      evidenceTerms: plan.evidencePlan.evidenceTerms,
      evidenceFieldSlots: plan.evidencePlan.fieldSlots,
      evidenceNumericTerms: plan.evidencePlan.numericTerms,
      effectiveTopK: finalResult.effectiveTopK,
      evidenceExpansionApplied: finalResult.evidenceExpansionApplied,
      evidenceGateStatus: finalResult.evidenceGateStatus,
      secondLevelRrfApplied: finalResult.secondLevelRrfApplied,
      secondLevelRrfQueries: finalResult.secondLevelRrfQueries,
      appliedQueryMappings: plan.appliedQueryMappings,
      queryMappingTerms: plan.queryMappingTerms,
      appliedMemoryRetrievalHints: plan.retrievalHintTerms,
      droppedMemoryRetrievalHints: plan.droppedRetrievalHintTerms,
      memoryHintConflict: plan.retrievalHintConflict,
      stageTimingsMs: {
        queryAnalysis: queryAnalysisMs,
        retrieval: Date.now() - retrievalStartedAt,
        ce: ceMs
      }
    }

    return {
      hits: finalResult.hits,
      debug
    }
  }

  private async retrieveWithSecondLevelRrf(
    knowledgeBaseId: string | undefined,
    plan: KnowledgeQueryPlan,
    hints: KnowledgeQueryRetrievalHints
  ): Promise<RetrievalExecutionResult> {
    const domains = buildSecondLevelQueryDomains(plan)
    if (!shouldUseSecondLevelRrf(plan, domains)) {
      return this.retrieveWithHints(knowledgeBaseId, plan, hints)
    }

    const effectiveTopK = plan.evidencePlan.targetTopK
    const baseCandidateLimit = resolveCandidateLimit(effectiveTopK, hints)
    const candidateLimit = resolveCeCandidateLimit(baseCandidateLimit, effectiveTopK, hints, plan)
    const mergedCandidateLimit = resolveMergedCandidateLimit(candidateLimit, plan)
    const domainLimit = Math.max(mergedCandidateLimit, Math.ceil(candidateLimit / Math.max(domains.length, 1)))

    const [domainResults, referenceCandidates] = await Promise.all([
      Promise.all(domains.map((domain) =>
        this.retrieveQueryDomain(knowledgeBaseId, domain, hints, domainLimit)
      )),
      this.referenceRecall(knowledgeBaseId, plan, candidateLimit)
    ])
    const referenceHits = referenceCandidates
      .slice(0, Math.min(candidateLimit, 40))
      .map(candidateToSearchHit)
    const mergedHits = mergeQueryLevelRrf(
      [
        ...domainResults.map((result) => ({
          label: result.domain.label,
          hits: result.hits
        })),
        ...(referenceHits.length > 0 ? [{ label: 'reference', hits: referenceHits }] : [])
      ],
      mergedCandidateLimit
    )

    let ceRerankMs = 0
    let ceScoreMap: Map<string, number> | null = null
    if (shouldApplyCeRerank(plan)) {
      const ceStartedAt = Date.now()
      ceScoreMap = await fetchCeRerankScores(mergedHits, plan.originalQuery)
      ceRerankMs = Date.now() - ceStartedAt
    }
    const rerankedHits = applyDeterministicRerank(mergedHits, plan, ceScoreMap)
    const relevantHits = filterCeRelevantHits(rerankedHits, ceScoreMap)
    const finalHits = await this.assembleEvidenceContext(relevantHits, plan)
    const objectCoveredHits = ensureScopeObjectCoverage(finalHits, relevantHits, plan)
    const fieldCoveredHits = await this.ensureFieldSlotCoverage(objectCoveredHits, relevantHits, plan)
    const completedHits = constrainFinalEvidenceToExplicitScope(
      includeReferenceEvidence(fieldCoveredHits, referenceCandidates, plan),
      plan
    )
    const hasEvidenceRequirements = hasKnowledgeEvidenceRequirements(plan.evidencePlan)
    const factCoverage = hasEvidenceRequirements
      ? computeScopedEvidenceCoverage(completedHits, plan)
      : 0
    const scopeCoverage = computeScopeCoverage(completedHits, plan)
    const gateStatus = resolveRagGateStatus({
      plan,
      hits: completedHits,
      scopeCoverage,
      factCoverage,
      hasEvidenceRequirements
    })

    return {
      hints,
      bm25Candidates: dedupeCandidates(domainResults.flatMap((result) => result.bm25Candidates)),
      vectorCandidates: dedupeCandidates(domainResults.flatMap((result) => result.vectorCandidates)),
      hits: completedHits,
      effectiveTopK,
      candidateLimit,
      ceCandidateCount: ceScoreMap?.size ?? 0,
      candidateDocumentNames: rerankedHits.map((hit) => hit.documentName),
      ceRerankMs,
      secondLevelRrfApplied: true,
      secondLevelRrfQueries: domains.map((domain) => domain.label),
      scopeCoverage,
      factCoverage,
      evidenceExpansionApplied:
        completedHits.some((hit) => hit.scoreDetail?.matchedBy.length === 0),
      evidenceGateStatus: gateStatus
    }
  }

  private async retrieveQueryDomain(
    knowledgeBaseId: string | undefined,
    domain: QueryRecallDomain,
    hints: KnowledgeQueryRetrievalHints,
    limit: number
  ): Promise<QueryRecallResult> {
    const [bm25Candidates, vectorCandidates] = await Promise.all([
      this.knowledgeBm25Service.search(domain.bm25Query, knowledgeBaseId, limit),
      this.vectorRecall(domain.vectorQuery, knowledgeBaseId, limit)
    ])

    return {
      domain,
      bm25Candidates,
      vectorCandidates,
      hits: mergeKnowledgeRetrievalCandidates(
        bm25Candidates,
        vectorCandidates,
        limit,
        {
          bm25Weight: hints.bm25Weight,
          vectorWeight: hints.vectorWeight
        }
      )
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

    // 鍩虹鍙洖鍜?reference 杞婚噺閫氶亾骞惰鎵ц锛岄伩鍏嶈鍒?鏍囧噯绫绘枃妗ｈ杩戦偦涓氬姟鏂囨。鐩栨帀銆?
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

    let ceRerankMs = 0
    let ceScoreMap: Map<string, number> | null = null
    if (shouldApplyCeRerank(plan)) {
      const ceStartedAt = Date.now()
      ceScoreMap = await fetchCeRerankScores(mergedHits, plan.originalQuery)
      ceRerankMs = Date.now() - ceStartedAt
    }
    const rerankedHits = applyDeterministicRerank(mergedHits, plan, ceScoreMap)
    const relevantHits = filterCeRelevantHits(rerankedHits, ceScoreMap)
    const finalHits = await this.assembleEvidenceContext(relevantHits, plan)
    const objectCoveredHits = ensureScopeObjectCoverage(finalHits, relevantHits, plan)
    const fieldCoveredHits = await this.ensureFieldSlotCoverage(objectCoveredHits, relevantHits, plan)
    const completedHits = constrainFinalEvidenceToExplicitScope(
      includeReferenceEvidence(fieldCoveredHits, referenceCandidates, plan),
      plan
    )
    const hasEvidenceRequirements = hasKnowledgeEvidenceRequirements(plan.evidencePlan)
    const factCoverage = hasEvidenceRequirements
      ? computeScopedEvidenceCoverage(completedHits, plan)
      : 0
    const scopeCoverage = computeScopeCoverage(completedHits, plan)
    const gateStatus = resolveRagGateStatus({
      plan,
      hits: completedHits,
      scopeCoverage,
      factCoverage,
      hasEvidenceRequirements
    })

    return {
      hints,
      bm25Candidates,
      vectorCandidates,
      hits: completedHits,
      effectiveTopK,
      candidateLimit,
      ceCandidateCount: ceScoreMap?.size ?? 0,
      candidateDocumentNames: rerankedHits.map((hit) => hit.documentName),
      ceRerankMs,
      secondLevelRrfApplied: false,
      secondLevelRrfQueries: [],
      scopeCoverage,
      factCoverage,
      evidenceExpansionApplied:
        completedHits.some((hit) => hit.scoreDetail?.matchedBy.length === 0),
      evidenceGateStatus: gateStatus
    }
  }

  private async assembleEvidenceContext(
    hits: KnowledgeSearchHit[],
    plan: KnowledgeQueryPlan
  ): Promise<KnowledgeSearchHit[]> {
    const selected = hits.slice(0, plan.evidencePlan.targetTopK)
    const selectedCoverage = computeScopedEvidenceCoverage(selected, plan)

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

        const coverage = computeScopedEvidenceCoverage(expanded, plan)
        if (coverage >= plan.evidencePlan.requiredCoverage) {
          return expanded
        }
      }
    }

    return expanded
  }

  private async ensureFieldSlotCoverage(
    selectedHits: KnowledgeSearchHit[],
    rankedCandidates: KnowledgeSearchHit[],
    plan: KnowledgeQueryPlan
  ): Promise<KnowledgeSearchHit[]> {
    const requiredSlots = plan.evidencePlan.fieldSlots
    if (requiredSlots.length === 0 || selectedHits.length === 0) {
      return selectedHits
    }

    const selected = [...selectedHits]
    const selectedChunkIds = new Set(selected.map((hit) => hit.chunkId))
    const scopeObjects = plan.scope.objects.map((object) => object.value)
    const coveredSlots = collectCoveredFieldSlots(filterHitsForScope(selected, scopeObjects), plan)

    for (const slot of requiredSlots) {
      if (coveredSlots.has(slot)) {
        continue
      }

      const candidate = await this.findBestFieldSlotCandidate({
        slot,
        selected,
        selectedChunkIds,
        rankedCandidates,
        coveredSlots,
        scopeObjects,
        plan
      })
      if (!candidate) {
        continue
      }

      if (selected.length < plan.evidencePlan.maxTopK) {
        selected.push(candidate.hit)
        selectedChunkIds.add(candidate.hit.chunkId)
        for (const matchedSlot of candidate.slots) {
          coveredSlots.add(matchedSlot)
        }
        continue
      }

      const replaceIndex = findFieldSlotReplaceIndex(selected, coveredSlots, plan)
      if (replaceIndex < 0) {
        continue
      }

      selectedChunkIds.delete(selected[replaceIndex].chunkId)
      selected[replaceIndex] = candidate.hit
      selectedChunkIds.add(candidate.hit.chunkId)
      for (const matchedSlot of candidate.slots) {
        coveredSlots.add(matchedSlot)
      }
    }

    return selected
  }

  private async findBestFieldSlotCandidate(input: {
    slot: string
    selected: KnowledgeSearchHit[]
    selectedChunkIds: Set<string>
    rankedCandidates: KnowledgeSearchHit[]
    coveredSlots: Set<string>
    scopeObjects: string[]
    plan: KnowledgeQueryPlan
  }): Promise<{ hit: KnowledgeSearchHit; slots: string[] } | null> {
    const rankedPool = input.rankedCandidates
      .filter((hit) => !input.selectedChunkIds.has(hit.chunkId))
      .filter((hit) => input.scopeObjects.length === 0 || input.scopeObjects.some((object) => hitMatchesScopeObject(hit, object)))

    const siblingPool = (
      await this.loadFieldSlotSiblingCandidates(input.selected, input.selectedChunkIds, input.scopeObjects)
    )

    return selectBestFieldSlotCandidate(
      [...rankedPool, ...siblingPool],
      input.slot,
      input.coveredSlots,
      input.plan
    )
  }

  private async loadFieldSlotSiblingCandidates(
    selectedHits: KnowledgeSearchHit[],
    selectedChunkIds: Set<string>,
    scopeObjects: string[]
  ): Promise<KnowledgeSearchHit[]> {
    if (scopeObjects.length === 0) {
      return []
    }

    const documentIds = uniqueStrings(
      selectedHits
        .filter((hit) => scopeObjects.some((object) => hitMatchesScopeObject(hit, object)))
        .map((hit) => hit.documentId)
    )
    const siblings: KnowledgeSearchHit[] = []
    for (const documentId of documentIds) {
      siblings.push(...await this.loadSiblingEvidenceChunks(documentId, selectedChunkIds))
    }

    return siblings
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
      ...getScopeObjectValues(plan),
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
} {
  if (!plan.fallbackRetrieval) {
    return {
      shouldFallback: false
    }
  }

  if (hits.length === 0) {
    return {
      shouldFallback: true
    }
  }

  if (plan.scope.objects.length > 0) {
    const topWindow = hits.slice(0, Math.min(resolveScopeFallbackWindow(plan), hits.length))
    const scopeCoverage = computeScopeCoverage(topWindow, plan)
    const requiredScopeCoverage = resolveRequiredScopeCoverage(plan)

    if (scopeCoverage < requiredScopeCoverage) {
      return {
        shouldFallback: true
      }
    }
  }

  if (hits.length < Math.min(2, topK) && plan.retrieval.mode !== 'hybrid') {
    return {
      shouldFallback: true
    }
  }

  return {
    shouldFallback: false
  }
}

function isWeakEvidence(
  plan: KnowledgeQueryPlan,
  result: RetrievalExecutionResult
): boolean {
  if (
    (plan.executionProfile.userIntent === 'comparison' || plan.executionProfile.userIntent === 'summary') &&
    plan.scope.objects.length > 0 &&
    result.scopeCoverage >= resolveRequiredScopeCoverage(plan) &&
    result.hits.length > 0
  ) {
    return false
  }

  return (
    result.evidenceGateStatus !== 'pass' ||
    !hasKnowledgeEvidenceRequirements(plan.evidencePlan)
  )
}

function getScopeObjectValues(plan: KnowledgeQueryPlan): string[] {
  return plan.scope.objects.map((object) => object.value)
}

function resolveRagGateStatus(input: {
  plan: KnowledgeQueryPlan
  hits: KnowledgeSearchHit[]
  scopeCoverage: number
  factCoverage: number
  hasEvidenceRequirements: boolean
}): 'pass' | 'degraded' | 'blocked' {
  if (input.hits.length === 0) {
    return 'blocked'
  }

  const hasScope = input.plan.scope.objects.length > 0
  if (hasScope && input.scopeCoverage === 0) {
    return 'blocked'
  }

  const isScopeDrivenQuestion =
    input.plan.executionProfile.userIntent === 'comparison' ||
    input.plan.executionProfile.userIntent === 'summary'
  if (isScopeDrivenQuestion && hasScope) {
    if (input.scopeCoverage < resolveRequiredScopeCoverage(input.plan)) {
      return 'blocked'
    }

    return input.scopeCoverage >= 1 ? 'pass' : 'degraded'
  }

  if (!input.hasEvidenceRequirements) {
    return hasScope ? 'degraded' : 'degraded'
  }

  return resolveEvidenceGateStatus(input.factCoverage, input.plan.evidencePlan)
}

function computeScopeCoverage(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan
): number {
  if (plan.scope.objects.length === 0) {
    return 1
  }

  const covered = new Set<string>()
  for (const object of plan.scope.objects) {
    if (hits.some((hit) => hitMatchesScopeObject(hit, object.value))) {
      covered.add(normalizeForExactMatch(object.value))
    }
  }

  return Number((covered.size / plan.scope.objects.length).toFixed(4))
}

function resolveScopeFallbackWindow(plan: KnowledgeQueryPlan): number {
  if (plan.scope.objects.length <= 1) {
    return 3
  }

  return Math.min(Math.max(plan.scope.objects.length + 2, 6), 10)
}

function resolveRequiredScopeCoverage(plan: KnowledgeQueryPlan): number {
  if (plan.scope.objects.length <= 1) {
    return 1
  }

  if (plan.executionProfile.scopeMode === 'explicit_multi') {
    return 1
  }

  return 0.66
}

function shouldUseSecondLevelRrf(
  plan: KnowledgeQueryPlan,
  domains: QueryRecallDomain[]
): boolean {
  return (
    domains.length > 1 &&
    plan.scope.objects.length === 0
  )
}

function buildSecondLevelQueryDomains(plan: KnowledgeQueryPlan): QueryRecallDomain[] {
  const analysis = plan.analysis
  const domains: QueryRecallDomain[] = []
  addQueryDomain(domains, {
    label: analysis ? 'rewritten' : 'original',
    bm25Query: plan.bm25Query,
    vectorQuery: plan.vectorQuery
  })
  addQueryDomain(domains, {
    label: analysis ? 'original' : 'raw_query',
    bm25Query: uniqueStrings([plan.normalizedQuery, ...getScopeObjectValues(plan)]).join(' '),
    vectorQuery: plan.normalizedQuery
  })

  if (analysis) {
    for (const phrase of analysis.searchPhrases.slice(0, 2)) {
      addQueryDomain(domains, {
        label: `bm25:${phrase}`,
        bm25Query: uniqueStrings([
          phrase,
          ...getScopeObjectValues(plan),
          ...analysis.requiredTerms
        ]).join(' '),
        vectorQuery: phrase
      })
    }

    for (const semanticQuery of analysis.semanticQueries.slice(0, 2)) {
      addQueryDomain(domains, {
        label: `vector:${semanticQuery}`,
        bm25Query: uniqueStrings([
          semanticQuery,
          ...getScopeObjectValues(plan),
          ...analysis.requiredTerms
        ]).join(' '),
        vectorQuery: semanticQuery
      })
    }
  }

  const evidenceQuery = uniqueStrings([
    ...getScopeObjectValues(plan),
    ...plan.evidencePlan.evidenceTerms,
    ...plan.evidencePlan.numericTerms
  ]).join(' ')
  if (evidenceQuery) {
    addQueryDomain(domains, {
      label: 'evidence_terms',
      bm25Query: evidenceQuery,
      vectorQuery: evidenceQuery
    })
  }

  return domains.slice(0, MAX_SECOND_LEVEL_QUERY_DOMAINS)
}

function addQueryDomain(domains: QueryRecallDomain[], domain: QueryRecallDomain): void {
  const bm25Query = domain.bm25Query.trim()
  const vectorQuery = domain.vectorQuery.trim()
  if (!bm25Query || !vectorQuery) {
    return
  }

  const key = `${normalizeQueryDomainKey(bm25Query)}\n${normalizeQueryDomainKey(vectorQuery)}`
  if (domains.some((item) =>
    `${normalizeQueryDomainKey(item.bm25Query)}\n${normalizeQueryDomainKey(item.vectorQuery)}` === key
  )) {
    return
  }

  domains.push({
    label: domain.label,
    bm25Query,
    vectorQuery
  })
}

function mergeQueryLevelRrf(
  groups: QueryLevelRrfGroup[],
  limit: number
): KnowledgeSearchHit[] {
  const merged = new Map<string, QueryLevelMergedHit>()

  for (const group of groups.filter((item) => item.hits.length > 0)) {
    group.hits.forEach((hit, index) => {
      const rrfScore = 1 / (QUERY_LEVEL_RRF_K + index + 1)
      const current = merged.get(hit.chunkId)
      if (!current) {
        merged.set(hit.chunkId, {
          ...hit,
          queryLevelScore: rrfScore,
          queryLevelMatches: [group.label],
          scoreDetail: {
            matchedBy: [...(hit.scoreDetail?.matchedBy ?? [])],
            bm25Score: hit.scoreDetail?.bm25Score ?? null,
            vectorScore: hit.scoreDetail?.vectorScore ?? null,
            fusedScore: hit.scoreDetail?.fusedScore ?? 0,
            ceScore: hit.scoreDetail?.ceScore,
            evidenceScore: hit.scoreDetail?.evidenceScore,
            matchedEvidenceTerms: hit.scoreDetail?.matchedEvidenceTerms,
            matchedNumericTerms: hit.scoreDetail?.matchedNumericTerms,
            documentRole: hit.scoreDetail?.documentRole
          }
        })
        return
      }

      current.queryLevelScore += rrfScore
      current.queryLevelMatches.push(group.label)
      current.score = Math.max(current.score, hit.score)
      current.scoreDetail = mergeScoreDetail(current.scoreDetail, hit.scoreDetail)
    })
  }

  const maxScore = Math.max(...[...merged.values()].map((hit) => hit.queryLevelScore), 0)
  return [...merged.values()]
    .sort((left, right) =>
      right.queryLevelScore - left.queryLevelScore ||
      right.queryLevelMatches.length - left.queryLevelMatches.length ||
      right.score - left.score
    )
    .slice(0, limit)
    .map((hit) => {
      const { queryLevelScore, queryLevelMatches, ...rest } = hit
      const scoreDetail = rest.scoreDetail ?? {
        matchedBy: [],
        bm25Score: null,
        vectorScore: null,
        fusedScore: 0
      }
      return {
        ...rest,
        score: maxScore > 0 ? Number(((queryLevelScore / maxScore) * 100).toFixed(2)) : rest.score,
        scoreDetail: {
          ...scoreDetail,
          fusedScore: Number(queryLevelScore.toFixed(8))
        }
      }
    })
}

function mergeScoreDetail(
  current: KnowledgeSearchHit['scoreDetail'],
  next: KnowledgeSearchHit['scoreDetail']
): NonNullable<KnowledgeSearchHit['scoreDetail']> {
  const matchedBy = mergeMatchedBy(current?.matchedBy ?? [], next?.matchedBy ?? [])
  return {
    matchedBy,
    bm25Score: maxNullableNumber(current?.bm25Score, next?.bm25Score),
    vectorScore: maxNullableNumber(current?.vectorScore, next?.vectorScore),
    fusedScore: Math.max(current?.fusedScore ?? 0, next?.fusedScore ?? 0),
    ceScore: maxOptionalNumber(current?.ceScore, next?.ceScore),
    evidenceScore: maxOptionalNumber(current?.evidenceScore, next?.evidenceScore),
    matchedEvidenceTerms: uniqueStrings([
      ...(current?.matchedEvidenceTerms ?? []),
      ...(next?.matchedEvidenceTerms ?? [])
    ]),
    matchedNumericTerms: uniqueStrings([
      ...(current?.matchedNumericTerms ?? []),
      ...(next?.matchedNumericTerms ?? [])
    ]),
    documentRole: current?.documentRole ?? next?.documentRole
  }
}

function mergeMatchedBy(
  current: KnowledgeRetrievalSource[],
  next: KnowledgeRetrievalSource[]
): KnowledgeRetrievalSource[] {
  return [...new Set([...current, ...next])]
}

function maxNullableNumber(
  left: number | null | undefined,
  right: number | null | undefined
): number | null {
  if (left === null || left === undefined) {
    return right ?? null
  }

  if (right === null || right === undefined) {
    return left
  }

  return Math.max(left, right)
}

function maxOptionalNumber(
  left: number | undefined,
  right: number | undefined
): number | undefined {
  if (left === undefined) {
    return right
  }

  if (right === undefined) {
    return left
  }

  return Math.max(left, right)
}

function dedupeCandidates(candidates: KnowledgeRetrievalCandidate[]): KnowledgeRetrievalCandidate[] {
  const merged = new Map<string, KnowledgeRetrievalCandidate>()
  for (const candidate of candidates) {
    const current = merged.get(candidate.chunkId)
    if (!current) {
      merged.set(candidate.chunkId, {
        ...candidate,
        matchedBy: [...candidate.matchedBy]
      })
      continue
    }

    merged.set(candidate.chunkId, {
      ...current,
      bm25Score: maxNullableNumber(current.bm25Score, candidate.bm25Score),
      vectorScore: maxNullableNumber(current.vectorScore, candidate.vectorScore),
      bm25Rank: minNullableNumber(current.bm25Rank, candidate.bm25Rank),
      vectorRank: minNullableNumber(current.vectorRank, candidate.vectorRank),
      matchedBy: mergeMatchedBy(current.matchedBy, candidate.matchedBy)
    })
  }

  return [...merged.values()]
}

function minNullableNumber(
  left: number | null,
  right: number | null
): number | null {
  if (left === null) {
    return right
  }

  if (right === null) {
    return left
  }

  return Math.min(left, right)
}

function normalizeQueryDomainKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
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
    Math.min(
      plan.retrieval.candidateMultiplier + WEAK_EVIDENCE_MAX_MULTIPLIER_STEP,
      Math.ceil(plan.retrieval.maxCandidateLimit / targetTopK)
    )
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
      candidateMultiplier
    }
  }
}

function selectBetterResult(
  plan: KnowledgeQueryPlan,
  primary: RetrievalExecutionResult,
  fallback: RetrievalExecutionResult
): RetrievalExecutionResult {
  if (fallback.scopeCoverage > primary.scopeCoverage) {
    return fallback
  }

  if (fallback.scopeCoverage < primary.scopeCoverage) {
    return primary
  }

  if (fallback.factCoverage > primary.factCoverage) {
    return fallback
  }

  if (fallback.factCoverage < primary.factCoverage) {
    return primary
  }

  const primaryCoverage = computeTopCoverageScore(primary.hits, getScopeObjectValues(plan))
  const fallbackCoverage = computeTopCoverageScore(fallback.hits, getScopeObjectValues(plan))

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

// 杩欏眰鍙仛鈥滅‘瀹氭€х殑绮剧‘鍖归厤閲嶆帓鈥濓紝涓嶆敼鍒嗘暟瀹氫箟锛屽彧鏀归『搴忋€?
function applyDeterministicRerank(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan,
  ceScoreMap: Map<string, number> | null = null
): KnowledgeSearchHit[] {
  if (hits.length <= 1) {
    return hits
  }

  return hits.map((hit) => attachRerankScores(hit, plan, ceScoreMap)).sort((left, right) => {
    const leftSignal = computeHitSignal(left, getScopeObjectValues(plan), plan.excludedTerms)
    const rightSignal = computeHitSignal(right, getScopeObjectValues(plan), plan.excludedTerms)
    const leftEvidenceScore = left.scoreDetail?.evidenceScore ?? 0
    const rightEvidenceScore = right.scoreDetail?.evidenceScore ?? 0

    // 瀵瑰甫缁撴瀯鍖栫紪鍙风殑 query锛屽厛鎸夊畬鏁寸紪鍙疯鐩栧仛纭帓搴忥紝閬垮厤杩戦偦鏂囨。闈犺涔夊垎椤朵笂鏉ャ€?
    if (rightSignal.structuredFullCoverage !== leftSignal.structuredFullCoverage) {
      return rightSignal.structuredFullCoverage - leftSignal.structuredFullCoverage
    }

    // 鍚屾棌涓嶅悓鍙峰睘浜庡吀鍨嬭鍙洖锛岃姣旀櫘閫?fused score 鏇存棭鍦颁笅娌夈€?
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
  scopeTerms: string[],
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
  const scopeTermGroups = splitScopeTerms(scopeTerms)

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

  if (scopeTerms.length === 0) {
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

  for (const term of scopeTerms) {
    const normalizedTerm = normalizeForExactMatch(term)
    if (!normalizedTerm) {
      continue
    }

    const structuredTerm = scopeTermGroups.structuredSet.has(normalizedTerm)

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
    scopeTermGroups.structured
  )
  const structuredScopeCount = scopeTermGroups.structured.length

  return {
    structuredFullCoverage:
      structuredScopeCount > 0 && structuredTermMatches === structuredScopeCount ? 1 : 0,
    structuredTermMatches,
    structuredDocumentNameMatches,
    siblingIdentifierConflicts,
    fullCoverage: termMatches === scopeTerms.length ? 1 : 0,
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
    fieldSlots: new Set<string>(),
    evidenceTerms: new Set<string>()
  }

  for (const hit of hits) {
    const evidence = computeKnowledgeEvidenceScore(hit, plan)
    addCoveredTerms(coveredTerms.identifiers, evidence.matchedIdentifiers)
    addCoveredTerms(coveredTerms.numericTerms, evidence.matchedNumericTerms)
    addCoveredTerms(coveredTerms.fieldSlots, evidence.matchedFieldSlots)
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
  const fieldSlotGain = countUncoveredTerms(evidence.matchedFieldSlots, coveredTerms.fieldSlots) * 80
  const evidenceTermGain = Math.min(
    countUncoveredTerms(evidence.matchedEvidenceTerms, coveredTerms.evidenceTerms) * 10,
    40
  )

  return identifierGain + numericGain + fieldSlotGain + evidenceTermGain
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

function ensureScopeObjectCoverage(
  selectedHits: KnowledgeSearchHit[],
  rankedCandidates: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan
): KnowledgeSearchHit[] {
  const scopeObjects = plan.scope.objects.map((object) => object.value)
  if (scopeObjects.length <= 1 || selectedHits.length === 0) {
    return selectedHits
  }

  const selected = [...selectedHits]
  const selectedChunkIds = new Set(selected.map((hit) => hit.chunkId))
  const coveredObjects = collectCoveredScopeObjects(selected, scopeObjects)
  const missingObjects = scopeObjects.filter((term) => !coveredObjects.has(normalizeForExactMatch(term)))
  if (missingObjects.length === 0) {
    return selected
  }

  for (const missingObject of missingObjects) {
    const candidate = rankedCandidates
      .filter((hit) => !selectedChunkIds.has(hit.chunkId))
      .find((hit) => hitMatchesScopeObject(hit, missingObject))
    if (!candidate) {
      continue
    }

    const scoredCandidate = attachEvidenceScore(candidate, plan)
    if (selected.length < plan.evidencePlan.maxTopK) {
      selected.push(scoredCandidate)
      selectedChunkIds.add(scoredCandidate.chunkId)
      coveredObjects.add(normalizeForExactMatch(missingObject))
      continue
    }

    const replaceIndex = findReplaceableDuplicateHitIndex(selected, scopeObjects, coveredObjects)
    if (replaceIndex < 0) {
      continue
    }

    selectedChunkIds.delete(selected[replaceIndex].chunkId)
    selected[replaceIndex] = scoredCandidate
    selectedChunkIds.add(scoredCandidate.chunkId)
    coveredObjects.add(normalizeForExactMatch(missingObject))
  }

  return selected
}

function computeScopedEvidenceCoverage(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan
): number {
  const scopeObjects = plan.scope.objects.map((object) => object.value)
  if (scopeObjects.length === 0 || plan.evidencePlan.fieldSlots.length === 0) {
    return computeKnowledgeEvidenceCoverage(hits, plan.evidencePlan)
  }

  const scopedHits = hits.filter((hit) =>
    scopeObjects.some((object) => hitMatchesScopeObject(hit, object))
  )
  return computeKnowledgeEvidenceCoverage(scopedHits, plan.evidencePlan)
}

function collectCoveredFieldSlots(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan
): Set<string> {
  const covered = new Set<string>()
  for (const hit of hits) {
    for (const slot of computeKnowledgeEvidenceScore(hit, plan.evidencePlan).matchedFieldSlots) {
      covered.add(slot)
    }
  }
  return covered
}

function countMissingSlotCoverage(slots: string[], coveredSlots: Set<string>): number {
  return slots.filter((slot) => !coveredSlots.has(slot)).length
}

function selectBestFieldSlotCandidate(
  candidates: KnowledgeSearchHit[],
  slot: string,
  coveredSlots: Set<string>,
  plan: KnowledgeQueryPlan
): { hit: KnowledgeSearchHit; slots: string[] } | null {
  return candidates
    .map((hit) => ({
      hit: attachEvidenceScore(hit, plan),
      slots: computeKnowledgeEvidenceScore(hit, plan.evidencePlan).matchedFieldSlots
    }))
    .filter((item) => item.slots.includes(slot))
    .sort((left, right) =>
      countMissingSlotCoverage(right.slots, coveredSlots) - countMissingSlotCoverage(left.slots, coveredSlots) ||
      (right.hit.scoreDetail?.evidenceScore ?? 0) - (left.hit.scoreDetail?.evidenceScore ?? 0) ||
      right.hit.score - left.hit.score
    )[0] ?? null
}

function filterHitsForScope(
  hits: KnowledgeSearchHit[],
  scopeObjects: string[]
): KnowledgeSearchHit[] {
  if (scopeObjects.length === 0) {
    return hits
  }

  return hits.filter((hit) =>
    scopeObjects.some((object) => hitMatchesScopeObject(hit, object))
  )
}

function constrainFinalEvidenceToExplicitScope(
  hits: KnowledgeSearchHit[],
  plan: KnowledgeQueryPlan
): KnowledgeSearchHit[] {
  if (
    plan.executionProfile.scopeMode !== 'explicit_single' ||
    plan.evidencePlan.needsReference ||
    hits.length === 0
  ) {
    return hits
  }

  const scopeObjects = plan.scope.objects.map((object) => object.value)
  const scopedHits = filterHitsForScope(hits, scopeObjects)
  if (scopedHits.length === 0) {
    return hits
  }

  const scopedCoverage = computeScopedEvidenceCoverage(scopedHits, plan)
  const scopedScopeCoverage = computeScopeCoverage(scopedHits, plan)
  const scopedGateStatus = resolveRagGateStatus({
    plan,
    hits: scopedHits,
    scopeCoverage: scopedScopeCoverage,
    factCoverage: scopedCoverage,
    hasEvidenceRequirements: hasKnowledgeEvidenceRequirements(plan.evidencePlan)
  })

  return scopedGateStatus === 'pass' ? scopedHits : hits
}

function findFieldSlotReplaceIndex(
  hits: KnowledgeSearchHit[],
  coveredSlots: Set<string>,
  plan: KnowledgeQueryPlan
): number {
  let replaceIndex = -1
  let replaceScore = Number.POSITIVE_INFINITY

  for (let index = 0; index < hits.length; index += 1) {
    const matchedSlots = computeKnowledgeEvidenceScore(hits[index], plan.evidencePlan).matchedFieldSlots
    if (matchedSlots.some((slot) => coveredSlots.has(slot))) {
      continue
    }

    const score = hits[index].scoreDetail?.evidenceScore ?? hits[index].score
    if (score < replaceScore) {
      replaceScore = score
      replaceIndex = index
    }
  }

  return replaceIndex
}

function collectCoveredScopeObjects(
  hits: KnowledgeSearchHit[],
  scopeObjects: string[]
): Set<string> {
  const covered = new Set<string>()
  for (const hit of hits) {
    for (const object of scopeObjects) {
      if (hitMatchesScopeObject(hit, object)) {
        covered.add(normalizeForExactMatch(object))
      }
    }
  }
  return covered
}

function hitMatchesScopeObject(hit: KnowledgeSearchHit, scopeObject: string): boolean {
  const normalizedObject = normalizeForExactMatch(scopeObject)
  if (!normalizedObject) {
    return false
  }

  const normalizedText = normalizeForExactMatch([
    hit.documentName,
    hit.primaryTitle ?? '',
    hit.sectionPath ?? '',
    hit.content
  ].join(' '))
  return containsExactTerm(normalizedText, normalizedObject)
}

function findReplaceableDuplicateHitIndex(
  hits: KnowledgeSearchHit[],
  scopeObjects: string[],
  coveredObjects: Set<string>
): number {
  const documentCounts = new Map<string, number>()
  for (const hit of hits) {
    documentCounts.set(hit.documentId, (documentCounts.get(hit.documentId) ?? 0) + 1)
  }

  let replaceIndex = -1
  let replaceScore = Number.POSITIVE_INFINITY
  hits.forEach((hit, index) => {
    if ((documentCounts.get(hit.documentId) ?? 0) <= 1) {
      return
    }

    const hitObjects = scopeObjects.filter((object) => hitMatchesScopeObject(hit, object))
    const hasOnlyCoveredObjects = hitObjects.every((object) =>
      coveredObjects.has(normalizeForExactMatch(object))
    )
    if (!hasOnlyCoveredObjects) {
      return
    }

    const score = hit.scoreDetail?.evidenceScore ?? hit.score ?? 0
    if (score < replaceScore) {
      replaceScore = score
      replaceIndex = index
    }
  })

  return replaceIndex
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

    // 鍙傝€冩枃妗ｅ彧琛ュ熬閮ㄨ瘉鎹紝涓嶆姠鍗犱富妫€绱㈢殑棣栦綅缁撴灉銆?
function computeTopCoverageScore(
  hits: KnowledgeSearchHit[],
  scopeTerms: string[]
): number {
  if (scopeTerms.length === 0 || hits.length === 0) {
    return 0
  }

  return hits
    .slice(0, Math.min(3, hits.length))
    .reduce((maxScore, hit) => {
      const signal = computeHitSignal(hit, scopeTerms, [])
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

  const expandedLimit = isExactFieldValueLookup(plan)
    ? Math.max(baseCandidateLimit, topK * EXACT_FIELD_VALUE_CANDIDATE_FACTOR, EXACT_FIELD_VALUE_MIN_CANDIDATES)
    : Math.max(baseCandidateLimit, topK * COMPLEX_QUERY_CANDIDATE_FACTOR, COMPLEX_QUERY_MIN_CANDIDATES)
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

// 杩欓噷鏃㈡敮鎸佹暣璇嶅尮閰嶏紝涔熷吋瀹瑰甫杩炴帴绗︾殑缁撴瀯鍖?token銆?
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
  // 杩欓噷鍙〃杈锯€滄敮鎾?鏍囧噯绫绘枃妗ｂ€濈殑鏂囦欢鍚嶆垨鏍囬瑙掕壊锛屼笉缁戝畾浠讳綍璇勬祴闆嗘枃浠跺悕銆?
  return [
    '%reference%',
    '%standard%',
    '%guideline%',
    '%specification%',
    '%spec%',
    '%pack%',
    '%瑙勮寖%',
    '%鏍囧噯%',
    '%鎸囧崡%',
    '%鍙傝€?',
    '%鏀拺%'
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

function splitScopeTerms(scopeTerms: string[]): {
  structured: string[]
  structuredSet: Set<string>
} {
  const structured = scopeTerms
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
  structuredScopeTerms: string[]
): number {
  if (structuredScopeTerms.length === 0) {
    return 0
  }

  const documentIdentifiers = extractStructuredIdentifierTerms(normalizedDocumentName)
  const textIdentifiers = extractStructuredIdentifierTerms(normalizedText)
  let conflicts = 0

  for (const term of structuredScopeTerms) {
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
  ceRerankMs: number
  secondLevelRrfApplied: boolean
  secondLevelRrfQueries: string[]
  scopeCoverage: number
  factCoverage: number
  evidenceExpansionApplied: boolean
  evidenceGateStatus: 'pass' | 'degraded' | 'blocked'
}

type QueryRecallDomain = {
  label: string
  bm25Query: string
  vectorQuery: string
}

type QueryRecallResult = {
  domain: QueryRecallDomain
  bm25Candidates: KnowledgeRetrievalCandidate[]
  vectorCandidates: KnowledgeRetrievalCandidate[]
  hits: KnowledgeSearchHit[]
}

type QueryLevelRrfGroup = {
  label: string
  hits: KnowledgeSearchHit[]
}

type QueryLevelMergedHit = KnowledgeSearchHit & {
  queryLevelScore: number
  queryLevelMatches: string[]
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
  fieldSlots: Set<string>
  evidenceTerms: Set<string>
}



