import { BadRequestException, Injectable } from '@nestjs/common'
import type { KnowledgeBaseRuntimeConfig } from 'share-type'

import { KnowledgeQueryAnalysisService } from './knowledge-query-analysis.service'
import { buildKnowledgeQueryEvidencePlan } from '../evidence-gating/knowledge-evidence-planner'
import {
  detectKnowledgeQueryRuleSignal
} from './knowledge-query-rule-router'
import { expandStructuredIdentifierAliases } from './knowledge-identifier-aliases'
import type {
  KnowledgeQueryAnalysis,
  KnowledgeQueryPlan,
  KnowledgeQueryRetrievalHints,
  RagExecutionProfile,
  RagRetrievalMode,
  RagScopeMode,
  RagUserIntent,
  ResolvedRetrievalScope,
  ResolvedRetrievalScopeObject
} from './knowledge-query-plan.types'

const FIELD_ALIAS_GROUPS: Array<{
  pattern: RegExp
  aliases: string[]
}> = [
  {
    pattern: /处置代码|处置编码|动作代码|处置编号|执行编号/i,
    aliases: ['ACTION CODE']
  },
  {
    pattern: /预警值|一级预警值|二级预警值|警戒值|告警阈值|报警阈值|告警临界点/i,
    aliases: ['ALERT THRESHOLD', 'visual alert']
  },
  {
    pattern: /响应时限|响应时间|处理时限/i,
    aliases: ['ESCALATION WINDOW']
  },
  {
    pattern: /责任角色|责任人|负责人/i,
    aliases: ['owner', 'role']
  },
  {
    pattern: /主控制阈值|主控阈值|核心阈值/i,
    aliases: ['threshold']
  }
]

const STRUCTURED_HINT_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,12}[-_]?\d{2,})\b/gi
const TASK_ONLY_TERM_PATTERN = /^(?:共性|共同点|相同点|差异|区别|对比|比较|综合分析|分析)$/i

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
    // 保留原始 query，便于调试面板展示用户最初输入。
    const originalQuery = typeof query === 'string' ? query : ''
    // 归一化只做文本清洗，不做语义改写。
    const normalizedQuery = normalizeQuery(originalQuery)

    if (!normalizedQuery) {
      throw new BadRequestException('Query is empty')
    }

    const ruleSignal = detectKnowledgeQueryRuleSignal(normalizedQuery)
    const shouldBypassAnalysis = shouldBypassAnalysisForStructuredFieldLookup(
      normalizedQuery,
      ruleSignal
    )
    const shouldRunAnalysis =
      !shouldBypassAnalysis &&
      (
        options.forceAnalysis === true ||
        (options.enableAnalysis !== false && ruleSignal.confidence !== 'high')
      )

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
    const scopeTerms = buildScopeTerms(ruleSignal, analysis, constraintTerms)
    const scope = resolveRetrievalScope(normalizedQuery, scopeTerms, retrievalHintFilter.applied)
    const evidencePlan = buildKnowledgeQueryEvidencePlan({
      normalizedQuery,
      analysis,
      scopeTerms,
      optionalTerms: constraintTerms.optional,
      excludedTerms,
      requestedTopK: options.requestedTopK ?? options.runtimeConfig.retrieval.workspaceTopK
    })
    const executionProfile = resolveExecutionProfile({
      normalizedQuery,
      analysis,
      ruleSignal,
      scope,
      fieldSlots: evidencePlan.fieldSlots
    })
    const retrieval = buildRetrievalHints(
      executionProfile,
      options.runtimeConfig
    )
    const fallbackRetrieval = buildFallbackRetrievalHints(
      retrieval.mode,
      options.runtimeConfig
    )

    return {
      originalQuery,
      normalizedQuery,
      bm25Query: buildBm25Query(
        normalizedQuery,
        analysis,
        retrieval.mode,
        scopeTerms,
        [...constraintTerms.optional, ...retrievalExpansionTerms]
      ),
      vectorQuery: buildVectorQuery(normalizedQuery, analysis, retrieval.mode),
      rewriteApplied: analysis !== null,
      analysis,
      ruleSignal,
      entities: analysis?.entities ?? [],
      constraints: analysis?.constraints ?? [],
      scopeTerms,
      excludedTerms,
      appliedQueryMappings: queryMappingMatch.triggers,
      queryMappingTerms: queryMappingMatch.terms,
      retrievalHintTerms: retrievalHintFilter.applied,
      droppedRetrievalHintTerms: retrievalHintFilter.dropped,
      retrievalHintConflict: retrievalHintFilter.conflict,
      scope,
      executionProfile,
      evidencePlan,
      retrieval,
      fallbackRetrieval
    }
  }
}

function buildRetrievalHints(
  profile: RagExecutionProfile,
  runtimeConfig: KnowledgeBaseRuntimeConfig
): KnowledgeQueryRetrievalHints {
  const baseBm25Weight = runtimeConfig.retrieval.bm25Weight
  const baseVectorWeight = runtimeConfig.retrieval.vectorWeight

  switch (profile.retrievalMode) {
    case 'exact':
      return {
        mode: 'exact',
        bm25Weight: clampWeight(Math.max(baseBm25Weight, 1.6)),
        vectorWeight: clampWeight(Math.min(baseVectorWeight, 0.6)),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    case 'keyword':
      return {
        mode: 'keyword',
        bm25Weight: clampWeight(baseBm25Weight * 1.25),
        vectorWeight: clampWeight(baseVectorWeight * 0.85),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    case 'hybrid':
      return {
        mode: 'hybrid',
        bm25Weight: clampWeight(baseBm25Weight * 1.1),
        vectorWeight: clampWeight(baseVectorWeight),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    case 'semantic':
      return {
        mode: 'semantic',
        bm25Weight: clampWeight(baseBm25Weight * 0.85),
        vectorWeight: clampWeight(baseVectorWeight * 1.25),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
    default:
      return {
        mode: 'hybrid',
        bm25Weight: clampWeight(baseBm25Weight),
        vectorWeight: clampWeight(baseVectorWeight),
        candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier, 1, 12),
        minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
        maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
      }
  }
}

function buildFallbackRetrievalHints(
  mode: RagRetrievalMode,
  runtimeConfig: KnowledgeBaseRuntimeConfig
): KnowledgeQueryRetrievalHints | null {
  if (mode === 'hybrid') {
    return null
  }

  return {
    mode: 'hybrid',
    bm25Weight: clampWeight(runtimeConfig.retrieval.bm25Weight),
    vectorWeight: clampWeight(runtimeConfig.retrieval.vectorWeight),
    candidateMultiplier: clampInteger(runtimeConfig.retrieval.candidateMultiplier + 1, 1, 12),
    minCandidateLimit: clampInteger(runtimeConfig.retrieval.minCandidateLimit, 1, 200),
    maxCandidateLimit: clampInteger(runtimeConfig.retrieval.maxCandidateLimit, 1, 400)
  }
}

function buildScopeTerms(
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
  ]).filter((term) => !isTaskOnlyTerm(term)))).slice(0, 8)
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

function resolveExecutionProfile(input: {
  normalizedQuery: string
  analysis: KnowledgeQueryAnalysis | null
  ruleSignal: KnowledgeQueryPlan['ruleSignal']
  scope: ResolvedRetrievalScope
  fieldSlots: string[]
}): RagExecutionProfile {
  const userIntent = resolveUserIntent(input)
  const retrievalMode = resolveProfileRetrievalMode({
    userIntent,
    scopeMode: input.scope.mode,
    ruleSignal: input.ruleSignal,
    analysis: input.analysis,
    fieldSlots: input.fieldSlots
  })
  const answerMode = resolveAnswerMode(userIntent, input.scope.mode)

  return {
    userIntent,
    scopeMode: input.scope.mode,
    retrievalMode,
    answerMode
  }
}

function resolveUserIntent(input: {
  normalizedQuery: string
  analysis: KnowledgeQueryAnalysis | null
  ruleSignal: KnowledgeQueryPlan['ruleSignal']
  fieldSlots: string[]
}): RagUserIntent {
  const query = input.normalizedQuery
  if (input.fieldSlots.length > 0) {
    return 'fact_lookup'
  }

  if (/共性|共同点|相同点|差异|区别|对比|比较|分别|各自|综合分析/i.test(query)) {
    return 'comparison'
  }

  if (/讲的是什么|说的是什么|总结|概括|overview|summary/i.test(query)) {
    return 'summary'
  }

  if (input.ruleSignal.procedureLike || input.analysis?.needsProcedure === true) {
    return 'procedure'
  }

  if (input.ruleSignal.exactTerms.length > 0 || input.analysis?.needsExactMatch) {
    return 'fact_lookup'
  }

  if (input.analysis?.intent === 'exploratory') {
    return 'open_exploration'
  }

  return 'general'
}

function resolveProfileRetrievalMode(input: {
  userIntent: RagUserIntent
  scopeMode: RagScopeMode
  ruleSignal: KnowledgeQueryPlan['ruleSignal']
  analysis: KnowledgeQueryAnalysis | null
  fieldSlots: string[]
}): RagRetrievalMode {
  if (input.userIntent === 'comparison' || input.userIntent === 'summary') {
    return input.scopeMode === 'unscoped' ? 'semantic' : 'hybrid'
  }

  if (input.userIntent === 'procedure') {
    return 'hybrid'
  }

  if (input.userIntent === 'fact_lookup') {
    return input.scopeMode === 'unscoped' ? 'keyword' : 'exact'
  }

  if (input.userIntent === 'open_exploration') {
    return 'semantic'
  }

  return input.analysis ? 'hybrid' : input.ruleSignal.suggestedRetrievalMode
}

function resolveAnswerMode(userIntent: RagUserIntent, scopeMode: RagScopeMode): RagExecutionProfile['answerMode'] {
  if (scopeMode === 'needs_clarification') {
    return 'clarify'
  }

  if (userIntent === 'general' && scopeMode === 'unscoped') {
    return 'general'
  }

  if (userIntent === 'open_exploration' && scopeMode === 'unscoped') {
    return 'mixed'
  }

  return 'rag'
}

function resolveRetrievalScope(
  normalizedQuery: string,
  scopeTerms: string[],
  retrievalHints: string[]
): ResolvedRetrievalScope {
  const explicitObjects = extractScopeObjects([
    normalizedQuery,
    ...scopeTerms
  ], 'explicit')
  const memoryObjects = explicitObjects.length > 0
    ? []
    : extractScopeObjects(retrievalHints, 'memory')
  const objects = explicitObjects.length > 0 ? explicitObjects : memoryObjects
  const mode = resolveScopeMode(objects)

  return { mode, objects }
}

function resolveScopeMode(objects: ResolvedRetrievalScopeObject[]): RagScopeMode {
  if (objects.length === 0) {
    return 'unscoped'
  }

  const source = objects[0]?.source ?? 'explicit'
  if (source === 'memory') {
    return objects.length === 1 ? 'memory_single' : 'memory_multi'
  }

  return objects.length === 1 ? 'explicit_single' : 'explicit_multi'
}

function extractScopeObjects(
  values: string[],
  source: ResolvedRetrievalScopeObject['source']
): ResolvedRetrievalScopeObject[] {
  const objects: ResolvedRetrievalScopeObject[] = []
  const seen = new Set<string>()

  for (const value of values) {
    for (const match of extractStructuredHints(value)) {
      const kind: ResolvedRetrievalScopeObject['kind'] = /\.[a-z0-9]{1,8}$/i.test(match)
        ? 'filename'
        : 'identifier'
      const key = normalizeScopeObjectKey(match)
      if (!key || seen.has(key)) {
        continue
      }

      seen.add(key)
      objects.push({ value: match, kind, source })
    }
  }

  return objects.slice(0, 8)
}

function buildFieldAliasTerms(normalizedQuery: string): string[] {
  return uniqueStrings(FIELD_ALIAS_GROUPS.flatMap((group) =>
    group.pattern.test(normalizedQuery) ? group.aliases : []
  ))
}

function shouldBypassAnalysisForStructuredFieldLookup(
  normalizedQuery: string,
  ruleSignal: KnowledgeQueryPlan['ruleSignal']
): boolean {
  const hasStructuredObject =
    ruleSignal.exactTerms.length > 0 ||
    extractStructuredHints(normalizedQuery).length > 0
  if (!hasStructuredObject || buildFieldAliasTerms(normalizedQuery).length === 0) {
    return false
  }

  return !/共性|共同点|相同点|差异|区别|对比|比较|总结|概括|综合分析|为什么|原因|原理|趋势|建议/i
    .test(normalizedQuery)
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

function normalizeScopeObjectKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim()
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
  mode: RagRetrievalMode,
  scopeTerms: string[],
  optionalConstraintTerms: string[]
): string {
  if (!analysis) {
    return uniqueQueryTerms([
      normalizedQuery,
      ...scopeTerms,
      ...optionalConstraintTerms
    ]).join(' ')
  }

  switch (mode) {
    case 'exact':
      return uniqueQueryTerms([
        normalizedQuery,
        ...scopeTerms,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases.slice(0, 2),
        ...optionalConstraintTerms.slice(0, 2)
      ]).join(' ')
    case 'keyword':
    case 'hybrid':
      return uniqueQueryTerms([
        normalizedQuery,
        ...scopeTerms,
        ...analysis.requiredTerms,
        ...analysis.searchPhrases,
        ...analysis.optionalTerms.slice(0, 3),
        ...optionalConstraintTerms
      ]).join(' ')
    case 'semantic':
    default:
      return uniqueQueryTerms([
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
  mode: RagRetrievalMode
): string {
  if (!analysis) {
    return normalizedQuery
  }

  switch (mode) {
    case 'exact':
      return normalizedQuery
    case 'keyword':
      return uniqueStrings([normalizedQuery, ...analysis.semanticQueries.slice(0, 1)]).join('\n')
    case 'hybrid':
      return uniqueStrings([normalizedQuery, ...analysis.semanticQueries.slice(0, 2)]).join('\n')
    case 'semantic':
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

function uniqueQueryTerms(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) {
      continue
    }

    const key = normalizeQueryTermKey(normalized)
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(normalized)
  }

  return result
}

function normalizeQueryTermKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[，、；：。！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function isTaskOnlyTerm(value: string): boolean {
  return TASK_ONLY_TERM_PATTERN.test(value.trim())
}

function clampWeight(value: number): number {
  return Math.min(Math.max(value, 0.4), 3)
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}



