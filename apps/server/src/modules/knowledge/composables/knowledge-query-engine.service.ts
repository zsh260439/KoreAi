import { BadRequestException, Injectable } from '@nestjs/common'
import type { KnowledgeBaseRuntimeConfig } from 'share-type'

import { KnowledgeQueryAnalysisService } from './knowledge-query-analysis.service'
import {
  createRouteDecision,
  detectKnowledgeQueryRuleSignal
} from './knowledge-query-rule-router'
import type {
  KnowledgeQueryAnalysis,
  KnowledgeQueryPlan,
  KnowledgeQueryRetrievalHints,
  KnowledgeQueryRouteDecision,
  KnowledgeRetrievalMode
} from './knowledge-query-plan.types'

@Injectable()
export class KnowledgeQueryEngineService {
  constructor(private readonly knowledgeQueryAnalysisService: KnowledgeQueryAnalysisService) {}

  async buildPlan(
    query: string,
    options: {
      enableAnalysis?: boolean
      runtimeConfig: KnowledgeBaseRuntimeConfig
    }
  ): Promise<KnowledgeQueryPlan> {
    // 保留原始 query，便于调试面板展示用户最初输入。
    const originalQuery = typeof query === 'string' ? query : ''
    // 归一化只做文本清洗，不做语义改写。
    const normalizedQuery = normalizeQuery(originalQuery)

    if (!normalizedQuery) {
      throw new BadRequestException('Query is empty')
    }

    const ruleSignal = detectKnowledgeQueryRuleSignal(normalizedQuery)
    const shouldRunAnalysis =
      options.enableAnalysis !== false && ruleSignal.confidence !== 'high'

    const analysis =
      !shouldRunAnalysis
        ? null
        : await this.knowledgeQueryAnalysisService.analyze(
            {
              originalQuery,
              normalizedQuery
            },
            {
              temperature: options.runtimeConfig.retrieval.queryAnalysisTemperature
            }
          )

    const routeDecision = resolveRouteDecision(ruleSignal, analysis)
    const protectedTerms = buildProtectedTerms(ruleSignal, analysis)
    const retrieval = buildRetrievalHints(
      routeDecision,
      options.runtimeConfig
    )
    const fallbackRetrieval = buildFallbackRetrievalHints(
      routeDecision.mode,
      options.runtimeConfig
    )

    return {
      originalQuery,
      normalizedQuery,
      bm25Query: buildBm25Query(normalizedQuery, analysis, routeDecision.mode, protectedTerms),
      vectorQuery: buildVectorQuery(normalizedQuery, analysis, routeDecision.mode),
      rewriteApplied: analysis !== null,
      analysis,
      ruleSignal,
      routeDecision,
      entities: analysis?.entities ?? [],
      constraints: analysis?.constraints ?? [],
      protectedTerms,
      retrieval,
      fallbackRetrieval
    }
  }
}

function resolveRouteDecision(
  ruleSignal: KnowledgeQueryPlan['ruleSignal'],
  analysis: KnowledgeQueryAnalysis | null
): KnowledgeQueryRouteDecision {
  // 高置信规则优先，避免 exact 类请求被 LLM 软判断带偏。
  if (ruleSignal.confidence === 'high') {
    return createRouteDecision(
      ruleSignal.route,
      ruleSignal.source,
      ruleSignal.confidence,
      `high_confidence_rule:${ruleSignal.reasons.join(',')}`
    )
  }

  if (ruleSignal.route === 'procedure_heavy' && ruleSignal.confidence === 'medium') {
    return createRouteDecision(
      'procedure_heavy',
      'rule',
      'medium',
      `procedure_rule:${ruleSignal.reasons.join(',')}`
    )
  }

  if (!analysis) {
    if (ruleSignal.confidence === 'medium') {
      return createRouteDecision(
        ruleSignal.route,
        'rule',
        'medium',
        `medium_confidence_rule:${ruleSignal.reasons.join(',')}`
      )
    }

    return createRouteDecision(
      'balanced',
      'policy',
      'low',
      'no_analysis_fallback_to_balanced'
    )
  }

  if (analysis.needsExactMatch) {
    return createRouteDecision(
      'exact_lookup',
      'llm',
      'medium',
      `llm_needs_exact_match:${analysis.intent}`
    )
  }

  if (analysis.needsProcedure) {
    return createRouteDecision(
      'procedure_heavy',
      'llm',
      'medium',
      `llm_needs_procedure:${analysis.intent}`
    )
  }

  switch (analysis.intent) {
    case 'precise':
    case 'constrained':
      return createRouteDecision(
        'keyword_heavy',
        'llm',
        'medium',
        `llm_intent:${analysis.intent}`
      )
    case 'exploratory':
      return createRouteDecision(
        'semantic_heavy',
        'llm',
        'medium',
        `llm_intent:${analysis.intent}`
      )
    case 'hybrid':
    default:
      if (ruleSignal.confidence === 'medium') {
        return createRouteDecision(
          ruleSignal.route,
          'rule',
          'medium',
          `rule_preferred_over_hybrid:${ruleSignal.reasons.join(',')}`
        )
      }

      return createRouteDecision(
        'balanced',
        'policy',
        'low',
        `llm_intent:${analysis.intent}`
      )
  }
}

function buildRetrievalHints(
  routeDecision: KnowledgeRouteDecisionInput,
  runtimeConfig: KnowledgeBaseRuntimeConfig
): KnowledgeQueryRetrievalHints {
  const baseBm25Weight = runtimeConfig.retrieval.bm25Weight
  const baseVectorWeight = runtimeConfig.retrieval.vectorWeight

  switch (routeDecision.mode) {
    case 'exact_lookup':
      return {
        mode: 'exact_lookup',
        source: routeDecision.source,
        confidence: routeDecision.confidence,
        bm25Weight: clampWeight(Math.max(baseBm25Weight, 1.6)),
        vectorWeight: clampWeight(Math.min(baseVectorWeight, 0.6)),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    case 'keyword_heavy':
      return {
        mode: 'keyword_heavy',
        source: routeDecision.source,
        confidence: routeDecision.confidence,
        bm25Weight: clampWeight(baseBm25Weight * 1.25),
        vectorWeight: clampWeight(baseVectorWeight * 0.85),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    case 'procedure_heavy':
      return {
        mode: 'procedure_heavy',
        source: routeDecision.source,
        confidence: routeDecision.confidence,
        bm25Weight: clampWeight(baseBm25Weight * 1.1),
        vectorWeight: clampWeight(baseVectorWeight),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    case 'semantic_heavy':
      return {
        mode: 'semantic_heavy',
        source: routeDecision.source,
        confidence: routeDecision.confidence,
        bm25Weight: clampWeight(baseBm25Weight * 0.85),
        vectorWeight: clampWeight(baseVectorWeight * 1.25),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    case 'balanced':
    default:
      return {
        mode: 'balanced',
        source: routeDecision.source,
        confidence: routeDecision.confidence,
        bm25Weight: clampWeight(baseBm25Weight),
        vectorWeight: clampWeight(baseVectorWeight),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
  }
}

function buildFallbackRetrievalHints(
  mode: KnowledgeRetrievalMode,
  runtimeConfig: KnowledgeBaseRuntimeConfig
): KnowledgeQueryRetrievalHints | null {
  if (mode === 'balanced') {
    return null
  }

  return {
    mode: 'balanced',
    source: 'fallback',
    confidence: 'low',
    bm25Weight: clampWeight(runtimeConfig.retrieval.bm25Weight),
    vectorWeight: clampWeight(runtimeConfig.retrieval.vectorWeight),
    candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier + 1, 1, 12),
    minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
    maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
  }
}

function buildProtectedTerms(
  ruleSignal: KnowledgeQueryPlan['ruleSignal'],
  analysis: KnowledgeQueryAnalysis | null
): string[] {
  const entityTerms =
    analysis?.entities
      .filter((item) => item.kind === 'identifier' || item.kind === 'term')
      .map((item) => item.canonicalForm) ?? []

  const requiredTerms = analysis?.requiredTerms ?? []

  return uniqueStrings([
    ...ruleSignal.exactTerms,
    ...entityTerms,
    ...requiredTerms
  ]).slice(0, 8)
}

function buildBm25Query(
  normalizedQuery: string,
  analysis: KnowledgeQueryAnalysis | null,
  mode: KnowledgeRetrievalMode,
  protectedTerms: string[]
): string {
  if (!analysis) {
    return uniqueStrings([normalizedQuery, ...protectedTerms]).join(' ')
  }

  switch (mode) {
    case 'exact_lookup':
      return uniqueStrings([
        normalizedQuery,
        ...protectedTerms,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases.slice(0, 2)
      ]).join(' ')
    case 'keyword_heavy':
    case 'procedure_heavy':
      return uniqueStrings([
        normalizedQuery,
        ...protectedTerms,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases,
        ...analysis.optionalTerms.slice(0, 3)
      ]).join(' ')
    case 'semantic_heavy':
    case 'balanced':
    default:
      return uniqueStrings([
        normalizedQuery,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases,
        ...analysis.optionalTerms.slice(0, 4)
      ]).join(' ')
  }
}

function buildVectorQuery(
  normalizedQuery: string,
  analysis: KnowledgeQueryAnalysis | null,
  mode: KnowledgeRetrievalMode
): string {
  if (!analysis) {
    return normalizedQuery
  }

  switch (mode) {
    case 'exact_lookup':
      return normalizedQuery
    case 'keyword_heavy':
      return uniqueStrings([normalizedQuery, ...analysis.semanticQueries.slice(0, 1)]).join('\n')
    case 'procedure_heavy':
      return uniqueStrings([normalizedQuery, ...analysis.semanticQueries.slice(0, 2)]).join('\n')
    case 'semantic_heavy':
    case 'balanced':
    default:
      return uniqueStrings([normalizedQuery, ...analysis.semanticQueries.slice(0, 4)]).join('\n')
  }
}

function normalizeQuery(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[，、；：]/g, ' ')
    .replace(/[。！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(normalized)
  }

  return result
}

function clampWeight(value: number): number {
  return Math.min(Math.max(value, 0.4), 3)
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}

type KnowledgeRouteDecisionInput = {
  mode: KnowledgeRetrievalMode
  source: 'rule' | 'llm' | 'policy' | 'fallback'
  confidence: 'high' | 'medium' | 'low'
}