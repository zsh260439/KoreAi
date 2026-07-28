import type { KnowledgeSearchHit } from 'share-type'

import type {
  KnowledgeQueryAnalysis,
  KnowledgeQueryEvidencePlan
} from '../query-understanding/knowledge-query-plan.types'

const STRUCTURED_IDENTIFIER_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,12}[-_]?\d{2,})\b/gi

const NUMBER_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:%|天|次|条|个|小时|分钟|days?|times?|items?)?\b/gi

const ASCII_TERM_PATTERN = /\b[a-z][a-z0-9_]{2,}\b/gi

const CJK_REFERENCE_PHRASE_PATTERN =
  /引用不足|召回文档|证据不完整|置信度|标注标准|黄金文档|相似文档|未命中|命中|证据|引用|规则|标准|规范|指南|手册|策略|参考|合规|审计/g

const CJK_FACT_PHRASE_PATTERN =
  /主控制阈值|核心阈值|阈值|责任角色|负责人|响应时限|响应时间|处理时限|附件|视觉附件|仪表盘|预警值|处置代码/g

const VALUE_FIELD_DEFINITIONS: Array<{
  aliases: string[]
  valuePattern: RegExp
}> = [
  {
    aliases: ['\u5904\u7f6e\u4ee3\u7801', '\u52a8\u4f5c\u4ee3\u7801', '\u5904\u7f6e\u7f16\u53f7', '\u6267\u884c\u7f16\u53f7', 'action code'],
    valuePattern: /\bact[-_][a-z0-9]+[-_]\d{1,4}\b/i
  },
  {
    aliases: ['\u9884\u8b66\u503c', '\u8b66\u6212\u503c', '\u544a\u8b66\u9608\u503c', '\u62a5\u8b66\u9608\u503c', '\u544a\u8b66\u4e34\u754c\u70b9', 'alert threshold', 'visual alert'],
    valuePattern: /\b\d+(?:\.\d+)?\s*%/
  },
  {
    aliases: ['\u54cd\u5e94\u65f6\u9650', '\u54cd\u5e94\u65f6\u95f4', '\u5904\u7406\u65f6\u9650', 'escalation window'],
    valuePattern: /\b\d+(?:\.\d+)?\s*(?:\u5c0f\u65f6|\u5206\u949f|\u5929|hours?|minutes?|days?)\b/i
  },
  {
    aliases: ['\u8d23\u4efb\u89d2\u8272', '\u8d1f\u8d23\u4eba', 'owner', 'role'],
    valuePattern: /\b[a-z][a-z0-9_]{2,}\b/i
  },
  {
    aliases: ['\u4e3b\u63a7\u5236\u9608\u503c', '\u6838\u5fc3\u9608\u503c', 'threshold'],
    valuePattern: /\b\d+(?:\.\d+)?\s*%/
  }
]

const FIELD_SLOT_DEFINITIONS: Array<{
  slot: string
  aliases: string[]
  valuePattern: RegExp
}> = [
  {
    slot: 'main_control_threshold',
    aliases: ['\u4e3b\u63a7\u5236\u9608\u503c', '\u4e3b\u63a7\u9608\u503c', '\u6838\u5fc3\u9608\u503c'],
    valuePattern: /\b\d+(?:\.\d+)?\s*%/
  },
  {
    slot: 'alert_threshold',
    aliases: ['\u9884\u8b66\u503c', '\u9884\u8b66\u9608\u503c', '\u8b66\u6212\u503c', '\u62a5\u8b66\u9608\u503c', '\u544a\u8b66\u4e34\u754c\u70b9', 'alert threshold', 'visual alert'],
    valuePattern: /\b\d+(?:\.\d+)?\s*%/
  },
  {
    slot: 'alert_threshold_level_1',
    aliases: ['\u4e00\u7ea7\u9884\u8b66\u503c', '\u4e00\u7ea7\u9884\u8b66\u9608\u503c', '\u4e00\u7ea7\u544a\u8b66\u503c', '\u4e00\u7ea7\u544a\u8b66\u9608\u503c'],
    valuePattern: /\b\d+(?:\.\d+)?\s*%/
  },
  {
    slot: 'alert_threshold_level_2',
    aliases: ['\u4e8c\u7ea7\u9884\u8b66\u503c', '\u4e8c\u7ea7\u9884\u8b66\u9608\u503c', '\u4e8c\u7ea7\u544a\u8b66\u503c', '\u4e8c\u7ea7\u544a\u8b66\u9608\u503c'],
    valuePattern: /\b\d+(?:\.\d+)?\s*%/
  },
  {
    slot: 'action_code',
    aliases: ['\u5904\u7f6e\u4ee3\u7801', '\u5904\u7f6e\u7f16\u7801', '\u52a8\u4f5c\u4ee3\u7801', '\u5904\u7f6e\u7f16\u53f7', '\u6267\u884c\u7f16\u53f7', 'action code'],
    valuePattern: /\bact[-_][a-z0-9]+[-_]\d{1,4}\b/i
  },
  {
    slot: 'responsible_role',
    aliases: ['\u8d23\u4efb\u89d2\u8272', '\u8d23\u4efb\u4eba', '\u8d1f\u8d23\u4eba', 'owner', 'role'],
    valuePattern: /\b[a-z][a-z0-9_]{2,}\b/i
  },
  {
    slot: 'response_time',
    aliases: ['\u54cd\u5e94\u65f6\u9650', '\u54cd\u5e94\u65f6\u95f4', '\u5904\u7406\u65f6\u9650', 'escalation window'],
    valuePattern: /\b\d+(?:\.\d+)?\s*(?:\u5c0f\u65f6|\u5206\u949f|\u5929|hours?|minutes?|days?)\b/i
  }
]

const FIELD_CONTEXT_TERMS = ['\u9644\u4ef6', '\u89c6\u89c9\u9644\u4ef6', '\u4eea\u8868\u76d8', '\u9608\u503c']

const SUPPLEMENTAL_FIELD_SLOT_ALIASES: Record<string, string[]> = {
  main_control_threshold: ['\u4e3b\u63a7\u5236\u9608\u503c', '\u4e3b\u63a7\u5236\u9608\u503c\u56fa\u5b9a', '\u4e3b\u63a7\u9608\u503c', '\u4e3b\u9608\u503c', '\u7ba1\u63a7\u7ebf', '\u63a7\u5236\u9608\u503c', '\u6838\u5fc3\u9608\u503c'],
  alert_threshold: ['\u9884\u8b66\u503c', '\u9884\u8b66\u9608\u503c', '\u9884\u8b66\u7ebf', '\u544a\u8b66\u503c', '\u544a\u8b66\u9608\u503c', '\u544a\u8b66\u4e34\u754c\u70b9', '\u9644\u4ef6\u4eea\u8868\u76d8', '\u9644\u4ef6\u770b\u677f', '\u4eea\u8868\u76d8', '\u770b\u677f', 'alert threshold', 'visual alert'],
  alert_threshold_level_1: ['\u4e00\u7ea7\u9884\u8b66\u503c', '\u4e00\u7ea7\u9884\u8b66\u9608\u503c', '\u4e00\u7ea7\u544a\u8b66\u503c', '\u4e00\u7ea7\u544a\u8b66\u9608\u503c'],
  alert_threshold_level_2: ['\u4e8c\u7ea7\u9884\u8b66\u503c', '\u4e8c\u7ea7\u9884\u8b66\u9608\u503c', '\u4e8c\u7ea7\u544a\u8b66\u503c', '\u4e8c\u7ea7\u544a\u8b66\u9608\u503c'],
  action_code: ['\u5904\u7f6e\u4ee3\u7801', '\u5904\u7f6e\u7f16\u7801', '\u52a8\u4f5c\u7801', '\u52a8\u4f5c\u4ee3\u7801', '\u5904\u7f6e\u7f16\u53f7', '\u6267\u884c\u7f16\u53f7', 'action code'],
  responsible_role: ['\u8d23\u4efb\u89d2\u8272', '\u8d1f\u8d23\u4eba', '\u8d23\u4efb\u4eba', '\u5f52\u8c01\u786e\u8ba4', '\u8c01\u786e\u8ba4', 'owner', 'role'],
  response_time: ['\u54cd\u5e94\u65f6\u9650', '\u54cd\u5e94\u65f6\u95f4', '\u5904\u7406\u65f6\u9650', '\u590d\u6838\u65f6\u9650', '\u591a\u4e45\u5185\u5904\u7406', '\u591a\u4e45\u5185\u8981\u5904\u7406\u5b8c', '\u591a\u4e45\u5185\u5b8c\u6210', '\u591a\u4e45\u5904\u7406', 'escalation window']
}

const SUPPLEMENTAL_FIELD_CONTEXT_TERMS = ['\u9644\u4ef6', '\u89c6\u89c9\u9644\u4ef6', '\u4eea\u8868\u76d8', '\u9644\u4ef6\u4eea\u8868\u76d8', '\u9644\u4ef6\u770b\u677f', '\u770b\u677f', '\u9608\u503c']
const TASK_ONLY_EVIDENCE_TERM_PATTERN = /^(?:共性|共同点|相同点|差异|区别|对比|比较|综合分析|分析|回答)$/i
const FIELD_NAME_ONLY_QUERY_PATTERN = /(?:字段名称|字段名|字段列表|有哪些字段|出现了.*字段|罗列.*字段|列出.*字段)/i

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
  matchedFieldSlots: string[]
  matchedEvidenceTerms: string[]
  documentRole: string
}

export function buildKnowledgeQueryEvidencePlan(input: {
  normalizedQuery: string
  analysis: KnowledgeQueryAnalysis | null
  scopeTerms: string[]
  optionalTerms: string[]
  excludedTerms: string[]
  requestedTopK: number
}): KnowledgeQueryEvidencePlan {
  const identifiers = uniqueStrings([
    ...extractPatternTerms(input.normalizedQuery, STRUCTURED_IDENTIFIER_PATTERN),
    ...input.scopeTerms.filter((term) => isStructuredIdentifier(term))
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
  const fieldSlots = extractFieldSlots(input.normalizedQuery, llmTerms)
  const evidenceTerms = uniqueStrings([
    ...input.scopeTerms,
    ...extractEvidenceTerms(input.normalizedQuery),
    ...llmTerms
  ])
    .filter((term) => !identifiers.some((identifier) => sameTerm(identifier, term)))
    .filter((term) => !identifierFragments.has(normalizeTerm(term)))
    .filter((term) => !numericTerms.some((numericTerm) => sameTerm(numericTerm, term)))
    .filter((term) => !isValueBearingEvidenceTerm(term))
    .filter((term) => !isFieldSlotAlias(term))
    .filter((term) => !isFieldContextTerm(term))
    .filter((term) => !isTaskOnlyEvidenceTerm(term))
    .filter((term) => fieldSlots.length === 0 || REFERENCE_TRIGGER_PATTERN.test(term))
    .slice(0, 24)
  const referenceTerms = evidenceTerms
    .filter((term) => REFERENCE_TRIGGER_PATTERN.test(term))
    .slice(0, 8)
  const needsReference =
    referenceTerms.length > 0 ||
    REFERENCE_TRIGGER_PATTERN.test(input.normalizedQuery)
  const requiredSignalCount =
    identifiers.length + numericTerms.length + fieldSlots.length + Math.min(evidenceTerms.length, 8)
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
    fieldSlots,
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
  const matchedFieldSlots = matchFieldSlots(fullText, plan.fieldSlots)
  const matchedEvidenceTerms = matchTerms(fullText, plan.evidenceTerms)
  const identifierScore = ratio(matchedIdentifiers.length, plan.identifiers.length) * 35
  const numericScore = ratio(matchedNumericTerms.length, plan.numericTerms.length) * 25
  const fieldSlotScore = ratio(matchedFieldSlots.length, plan.fieldSlots.length) * 25
  const evidenceScore = ratio(matchedEvidenceTerms.length, Math.min(plan.evidenceTerms.length, 8)) * 15
  const titleScore = computeTitleScore(titleText, plan) * 10
  const roleScore = computeRoleScore(documentRole, plan) * 10
  const coverage = computeCoverageFromMatches({
    plan,
    matchedIdentifiers,
    matchedNumericTerms,
    matchedFieldSlots,
    matchedEvidenceTerms
  })

  return {
    score: Number((identifierScore + numericScore + fieldSlotScore + evidenceScore + titleScore + roleScore).toFixed(4)),
    coverage,
    matchedIdentifiers,
    matchedNumericTerms,
    matchedFieldSlots,
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
  const matchedFieldSlots = new Set<string>()

  for (const hit of hits) {
    const score = computeKnowledgeEvidenceScore(hit, plan)
    for (const term of score.matchedIdentifiers) {
      matchedIdentifiers.add(term)
    }
    for (const term of score.matchedNumericTerms) {
      matchedNumericTerms.add(term)
    }
    for (const slot of score.matchedFieldSlots) {
      matchedFieldSlots.add(slot)
    }
    for (const term of score.matchedEvidenceTerms) {
      matchedEvidenceTerms.add(term)
    }
  }

  return computeCoverageFromMatches({
    plan,
    matchedIdentifiers: Array.from(matchedIdentifiers),
    matchedNumericTerms: Array.from(matchedNumericTerms),
    matchedFieldSlots: Array.from(matchedFieldSlots),
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
  const hasHardRequirements =
    plan.identifiers.length + plan.numericTerms.length + plan.fieldSlots.length > 0
  if (!hasHardRequirements && plan.evidenceTerms.length > 0 && coverage > 0) {
    return coverage < plan.requiredCoverage ? 'degraded' : 'pass'
  }

  if (coverage < plan.hardGateCoverage) {
    return 'blocked'
  }

  if (coverage < plan.requiredCoverage) {
    return 'degraded'
  }

  return 'pass'
}

export function hasKnowledgeEvidenceRequirements(
  plan: KnowledgeQueryEvidencePlan
): boolean {
  return plan.identifiers.length + plan.numericTerms.length + plan.fieldSlots.length + plan.evidenceTerms.length > 0
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
  matchedFieldSlots: string[]
  matchedEvidenceTerms: string[]
}): number {
  const requiredCount =
    input.plan.identifiers.length +
    input.plan.numericTerms.length +
    input.plan.fieldSlots.length +
    Math.min(input.plan.evidenceTerms.length, 8)

  if (requiredCount === 0) {
    return 1
  }

  const matchedCount =
    input.matchedIdentifiers.length +
    input.matchedNumericTerms.length +
    input.matchedFieldSlots.length +
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
  const valueFieldTerms = extractValueFieldTerms(value)
  return uniqueStrings([...asciiTerms, ...referenceTerms, ...factTerms, ...valueFieldTerms])
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

    const valueBearingTerm = isValueBearingEvidenceTerm(term)
    const valueBearingSignal = valueBearingTerm && hasValueBearingFieldSignal(text, term)
    if (
      (text.includes(normalizedTerm) || valueBearingSignal) &&
      (!valueBearingTerm || valueBearingSignal)
    ) {
      result.push(term)
    }
  }

  return uniqueStrings(result)
}

export function isValueBearingEvidenceTerm(term: string): boolean {
  return resolveValueFieldDefinition(term) !== null
}

export function hasValueBearingEvidencePhrase(value: string): boolean {
  const normalizedValue = normalizeTerm(value)
  return VALUE_FIELD_DEFINITIONS.some((definition) =>
    definition.aliases.some((alias) => normalizedValue.includes(normalizeTerm(alias)))
  )
}

function hasValueBearingFieldSignal(text: string, term: string): boolean {
  const definition = resolveValueFieldDefinition(term)
  if (!definition) {
    return true
  }

  for (const alias of definition.aliases) {
    const normalizedAlias = normalizeTerm(alias)
    const index = text.indexOf(normalizedAlias)
    if (index < 0) {
      continue
    }

    const nearbyText = text.slice(index + normalizedAlias.length, index + 160)
    if (definition.valuePattern.test(nearbyText)) {
      return true
    }
  }

  return false
}

function matchFieldSlots(text: string, slots: string[]): string[] {
  const result: string[] = []

  for (const slot of slots) {
    const definition = FIELD_SLOT_DEFINITIONS.find((item) => item.slot === slot)
    if (!definition) {
      continue
    }

    if (hasFieldSlotValueSignal(text, definition)) {
      result.push(slot)
    }
  }

  return uniqueStrings(result)
}

function getFieldSlotAliases(definition: (typeof FIELD_SLOT_DEFINITIONS)[number]): string[] {
  return uniqueStrings([
    ...definition.aliases,
    ...(SUPPLEMENTAL_FIELD_SLOT_ALIASES[definition.slot] ?? [])
  ])
}

function hasFieldSlotValueSignal(
  text: string,
  definition: (typeof FIELD_SLOT_DEFINITIONS)[number]
): boolean {
  for (const alias of getFieldSlotAliases(definition)) {
    const normalizedAlias = normalizeTerm(alias)
    const index = text.indexOf(normalizedAlias)
    if (index < 0) {
      continue
    }

    const nearbyText = text.slice(index + normalizedAlias.length, index + 160)
    if (definition.valuePattern.test(nearbyText)) {
      return true
    }
  }

  return false
}

function resolveValueFieldDefinition(term: string): (typeof VALUE_FIELD_DEFINITIONS)[number] | null {
  const normalizedTerm = normalizeTerm(term)
  return VALUE_FIELD_DEFINITIONS.find((definition) =>
    definition.aliases.some((alias) => normalizeTerm(alias) === normalizedTerm)
  ) ?? null
}

function extractValueFieldTerms(value: string): string[] {
  const normalizedValue = normalizeTerm(value)
  return VALUE_FIELD_DEFINITIONS.flatMap((definition) =>
    definition.aliases.filter((alias) => normalizedValue.includes(normalizeTerm(alias)))
  )
}

function extractFieldSlots(query: string, terms: string[]): string[] {
  if (isFieldNameOnlyQuery(query)) {
    return []
  }

  const normalizedValues = [query, ...terms].map(normalizeTerm)
  const slots = FIELD_SLOT_DEFINITIONS
    .filter((definition) =>
      getFieldSlotAliases(definition).some((alias) => {
        const normalizedAlias = normalizeTerm(alias)
        return normalizedValues.some((value) => value.includes(normalizedAlias))
      })
    )
    .map((definition) => definition.slot)

  return removeCoarseAlertSlotWhenOnlyLevelAlertsAreRequested(slots, normalizedValues)
}

function removeCoarseAlertSlotWhenOnlyLevelAlertsAreRequested(
  slots: string[],
  normalizedValues: string[]
): string[] {
  if (
    !slots.includes('alert_threshold') ||
    !slots.some((slot) => slot === 'alert_threshold_level_1' || slot === 'alert_threshold_level_2')
  ) {
    return slots
  }

  const textWithoutLevelAlerts = normalizedValues
    .join(' ')
    .replace(/(?:\u4e00\u7ea7|\u4e8c\u7ea7)(?:\u9884\u8b66|\u544a\u8b66)(?:\u503c|\u9608\u503c)/g, '')

  const hasStandaloneGenericAlert = [
    '\u9884\u8b66\u503c',
    '\u9884\u8b66\u9608\u503c',
    '\u9884\u8b66\u7ebf',
    '\u544a\u8b66\u503c',
    '\u544a\u8b66\u9608\u503c',
    '\u544a\u8b66\u4e34\u754c\u70b9',
    'alertthreshold',
    'visualalert'
  ].some((alias) => textWithoutLevelAlerts.includes(normalizeTerm(alias)))

  return hasStandaloneGenericAlert
    ? slots
    : slots.filter((slot) => slot !== 'alert_threshold')
}

function isFieldNameOnlyQuery(query: string): boolean {
  if (!FIELD_NAME_ONLY_QUERY_PATTERN.test(query)) {
    return false
  }

  return !/(?:是多少|是什么|对应.*(?:数字|编号|代码|值)|取值|数值|参数|value|code|threshold)/i
    .test(query)
}

function isFieldSlotAlias(term: string): boolean {
  const normalizedTerm = normalizeTerm(term)
  return FIELD_SLOT_DEFINITIONS.some((definition) =>
    getFieldSlotAliases(definition).some((alias) => normalizeTerm(alias) === normalizedTerm)
  )
}

function isFieldContextTerm(term: string): boolean {
  const normalizedTerm = normalizeTerm(term)
  return [...FIELD_CONTEXT_TERMS, ...SUPPLEMENTAL_FIELD_CONTEXT_TERMS]
    .some((item) => normalizeTerm(item) === normalizedTerm)
}

function isTaskOnlyEvidenceTerm(term: string): boolean {
  return TASK_ONLY_EVIDENCE_TERM_PATTERN.test(term.trim())
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



