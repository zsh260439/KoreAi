import { BadRequestException, Injectable } from '@nestjs/common'
import type { KnowledgeBaseRuntimeConfig } from 'share-type'

import { KnowledgeQueryAnalysisService } from './knowledge-query-analysis.service'
import { buildKnowledgeQueryEvidencePlan } from '../evidence-gating/knowledge-evidence-planner'
import {
  createRouteDecision,
  detectKnowledgeQueryRuleSignal
} from './knowledge-query-rule-router'
import { expandStructuredIdentifierAliases } from './knowledge-identifier-aliases'
import type {
  KnowledgeQueryAnalysis,
  KnowledgeQueryPlan,
  KnowledgeQueryRetrievalHints,
  KnowledgeQueryRouteDecision,
  KnowledgeRetrievalMode
} from './knowledge-query-plan.types'

const FIELD_ALIAS_GROUPS: Array<{
  pattern: RegExp
  aliases: string[]
}> = [
  {
    pattern: /澶勭疆浠ｇ爜|鍔ㄤ綔浠ｇ爜|澶勭疆缂栧彿/i,
    aliases: ['ACTION CODE']
  },
  {
    pattern: /预警值|警戒值|告警阈值|报警阈值/i,
    aliases: ['ALERT THRESHOLD', 'visual alert']
  },
  {
    pattern: /鍝嶅簲鏃堕檺|鍝嶅簲鏃堕棿|澶勭悊鏃堕檺/i,
    aliases: ['ESCALATION WINDOW']
  },
  {
    pattern: /责任角色|负责人/i,
    aliases: ['owner', 'role']
  },
  {
    pattern: /主控制阈值|核心阈值/i,
    aliases: ['threshold']
  }
]

const STRUCTURED_HINT_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,12}[-_]?\d{2,})\b/gi

@Injectable()
export class KnowledgeQueryEngineService {
  constructor(private readonly knowledgeQueryAnalysisService: KnowledgeQueryAnalysisService) {}

  async buildPlan(
    query: string,
    options: {
      enableAnalysis?: boolean
      forceAnalysis?: boolean
      runtimeConfig: KnowledgeBaseRuntimeConfig
      requestedTopK?: number
      retrievalHints?: string[]
    }
  ): Promise<KnowledgeQueryPlan> {
    // 淇濈暀鍘熷 query锛屼究浜庤皟璇曢潰鏉垮睍绀虹敤鎴锋渶鍒濊緭鍏ャ€?
    const originalQuery = typeof query === 'string' ? query : ''
    // 褰掍竴鍖栧彧鍋氭枃鏈竻娲楋紝涓嶅仛璇箟鏀瑰啓銆?
    const normalizedQuery = normalizeQuery(originalQuery)

    if (!normalizedQuery) {
      throw new BadRequestException('Query is empty')
    }

    const ruleSignal = detectKnowledgeQueryRuleSignal(normalizedQuery)
    const shouldRunAnalysis =
      options.forceAnalysis === true ||
      (options.enableAnalysis !== false && ruleSignal.confidence !== 'high')

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
    const constraintTerms = buildConstraintTerms(analysis)
    const excludedTerms = buildExcludedTerms(analysis)
    const fieldAliasTerms = buildFieldAliasTerms(normalizedQuery)
    const retrievalHintFilter = filterRetrievalHints(
      normalizedQuery,
      options.retrievalHints
    )
    const queryMappingMatch = applyQueryMappings(
      normalizedQuery,
      options.runtimeConfig.retrieval.queryMappings
    )
    const retrievalExpansionTerms = uniqueStrings([
      ...fieldAliasTerms,
      ...queryMappingMatch.terms,
      ...retrievalHintFilter.applied
    ])
    const protectedTerms = buildProtectedTerms(ruleSignal, analysis, constraintTerms)
    const evidencePlan = buildKnowledgeQueryEvidencePlan({
      normalizedQuery,
      analysis,
      protectedTerms,
      optionalTerms: constraintTerms.optional,
      excludedTerms,
      requestedTopK: options.requestedTopK ?? options.runtimeConfig.retrieval.workspaceTopK
    })
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
      bm25Query: buildBm25Query(
        normalizedQuery,
        analysis,
        routeDecision.mode,
        protectedTerms,
        [...constraintTerms.optional, ...retrievalExpansionTerms]
      ),
      vectorQuery: buildVectorQuery(normalizedQuery, analysis, routeDecision.mode),
      rewriteApplied: analysis !== null,
      analysis,
      ruleSignal,
      routeDecision,
      entities: analysis?.entities ?? [],
      constraints: analysis?.constraints ?? [],
      protectedTerms,
      excludedTerms,
      appliedQueryMappings: queryMappingMatch.triggers,
      queryMappingTerms: queryMappingMatch.terms,
      retrievalHintTerms: retrievalHintFilter.applied,
      droppedRetrievalHintTerms: retrievalHintFilter.dropped,
      retrievalHintConflict: retrievalHintFilter.conflict,
      evidencePlan,
      retrieval,
      fallbackRetrieval
    }
  }
}

function resolveRouteDecision(
  ruleSignal: KnowledgeQueryPlan['ruleSignal'],
  analysis: KnowledgeQueryAnalysis | null
): KnowledgeQueryRouteDecision {
  // 楂樼疆淇¤鍒欎紭鍏堬紝閬垮厤 exact 绫昏姹傝 LLM 杞垽鏂甫鍋忋€?
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
  analysis: KnowledgeQueryAnalysis | null,
  constraintTerms: {
    required: string[]
    optional: string[]
  }
): string[] {
  const entityTerms =
    analysis?.entities
      .filter((item) => item.kind === 'identifier' || item.kind === 'term')
      .map((item) => item.canonicalForm) ?? []

  const requiredTerms = analysis?.requiredTerms ?? []

  return compactStructuredExactTerms(expandStructuredIdentifierAliases(uniqueStrings([
    ...ruleSignal.exactTerms,
    ...entityTerms,
    ...requiredTerms,
    ...constraintTerms.required
  ]))).slice(0, 8)
}

function buildConstraintTerms(
  analysis: KnowledgeQueryAnalysis | null
): {
  required: string[]
  optional: string[]
} {
  if (!analysis) {
    return {
      required: [],
      optional: []
    }
  }

  const required: string[] = []
  const optional: string[] = []

  for (const constraint of analysis.constraints) {
    switch (constraint.operator) {
      case 'must_equal':
      case 'must_contain':
        required.push(constraint.value)
        break
      case 'should_contain':
        optional.push(constraint.value)
        break
    }
  }

  return {
    required: uniqueStrings(required).slice(0, 8),
    optional: uniqueStrings(optional).slice(0, 8)
  }
}

function buildExcludedTerms(analysis: KnowledgeQueryAnalysis | null): string[] {
  if (!analysis) {
    return []
  }

  return uniqueStrings(analysis.excludedTerms).slice(0, 6)
}

function buildFieldAliasTerms(normalizedQuery: string): string[] {
  return uniqueStrings(FIELD_ALIAS_GROUPS.flatMap((group) =>
    group.pattern.test(normalizedQuery) ? group.aliases : []
  ))
}

function filterRetrievalHints(
  normalizedQuery: string,
  value: string[] | undefined
): {
  applied: string[]
  dropped: string[]
  conflict: boolean
} {
  const hints = uniqueStrings((value ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
  ).slice(0, 8)
  const explicitIdentifiers = extractStructuredHints(normalizedQuery)
  if (explicitIdentifiers.length === 0) {
    return { applied: hints, dropped: [], conflict: false }
  }

  const applied: string[] = []
  const dropped: string[] = []

  for (const hint of hints) {
    const hintIdentifiers = extractStructuredHints(hint)
    if (
      hintIdentifiers.length > 0 &&
      !hintIdentifiers.some((identifier) => hasCompatibleIdentifier(identifier, explicitIdentifiers))
    ) {
      dropped.push(hint)
      continue
    }

    if (hintIdentifiers.length === 0) {
      dropped.push(hint)
      continue
    }

    applied.push(hint)
  }

  return {
    applied,
    dropped,
    conflict: dropped.length > 0
  }
}

function extractStructuredHints(value: string): string[] {
  return uniqueStrings(value.match(STRUCTURED_HINT_PATTERN) ?? [])
    .filter((item) => /\d/.test(item))
}

function hasCompatibleIdentifier(identifier: string, explicitIdentifiers: string[]): boolean {
  const normalizedIdentifier = normalizeIdentifier(identifier)
  return explicitIdentifiers.some((explicitIdentifier) => {
    const normalizedExplicit = normalizeIdentifier(explicitIdentifier)
    return (
      normalizedIdentifier === normalizedExplicit ||
      normalizedIdentifier.includes(normalizedExplicit) ||
      normalizedExplicit.includes(normalizedIdentifier)
    )
  })
}

function normalizeIdentifier(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\.[a-z0-9]+$/i, '')
}

function applyQueryMappings(
  normalizedQuery: string,
  mappings: KnowledgeBaseRuntimeConfig['retrieval']['queryMappings']
): { triggers: string[]; terms: string[] } {
  const normalized = normalizedQuery.toLowerCase()
  const matched = mappings.filter((mapping) =>
    normalized.includes(mapping.trigger.toLowerCase())
  )

  return {
    triggers: uniqueStrings(matched.map((mapping) => mapping.trigger)),
    terms: uniqueStrings(matched.flatMap((mapping) => mapping.terms))
  }
}

function buildBm25Query(
  normalizedQuery: string,
  analysis: KnowledgeQueryAnalysis | null,
  mode: KnowledgeRetrievalMode,
  protectedTerms: string[],
  optionalConstraintTerms: string[]
): string {
  if (!analysis) {
    return uniqueStrings([
      normalizedQuery,
      ...protectedTerms,
      ...optionalConstraintTerms
    ]).join(' ')
  }

  switch (mode) {
    case 'exact_lookup':
      return uniqueStrings([
        normalizedQuery,
        ...protectedTerms,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases.slice(0, 2),
        ...optionalConstraintTerms.slice(0, 2)
      ]).join(' ')
    case 'keyword_heavy':
    case 'procedure_heavy':
      return uniqueStrings([
        normalizedQuery,
        ...protectedTerms,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases,
        ...analysis.optionalTerms.slice(0, 3),
        ...optionalConstraintTerms
      ]).join(' ')
    case 'semantic_heavy':
    case 'balanced':
    default:
      return uniqueStrings([
        normalizedQuery,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases,
        ...analysis.optionalTerms.slice(0, 4),
        ...optionalConstraintTerms
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


