import type { KnowledgeSearchHit } from 'share-type'
import type { KnowledgeEvidenceFact } from '../evidence-gating/knowledge-evidence-fact-extractor'

type RequestedEvidenceValue = {
  slot: string
  value: string
}

export type DeterministicFieldAnswer = {
  answer: string
  values: RequestedEvidenceValue[]
}

const FACT_CHECK_LIMIT = 12

export function hasPotentialKnowledgeAnswerGap(
  query: string,
  answer: string,
  facts: KnowledgeEvidenceFact[]
): boolean {
  return getPotentialMissingEvidenceValues(query, answer, facts).length > 0
}

export function getPotentialMissingEvidenceValues(
  query: string,
  answer: string,
  facts: KnowledgeEvidenceFact[]
): string[] {
  const normalizedQuery = normalize(query)
  const normalizedAnswer = normalize(answer)
  const values = new Set<string>()

  for (const fact of facts.slice(0, FACT_CHECK_LIMIT)) {
    const queryOverlap = fact.matchedTerms.filter((term) => {
      const normalizedTerm = normalize(term)
      return normalizedTerm.length >= 2 && normalizedQuery.includes(normalizedTerm)
    }).length

    if (queryOverlap < 2) {
      continue
    }

    for (const value of fact.exactValues) {
      const normalizedValue = normalize(value)
      if (
        normalizedValue.length >= 2 &&
        !normalizedQuery.includes(normalizedValue) &&
        !normalizedAnswer.includes(normalizedValue)
      ) {
        values.add(value)
      }
    }
  }

  return [...values]
}

export function getMissingRequestedEvidenceValues(
  query: string,
  answer: string,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = []
): RequestedEvidenceValue[] {
  const normalizedAnswer = normalize(answer)
  return getRequestedEvidenceValues(query, hits, fieldSlots)
    .filter((item) => !normalizedAnswer.includes(normalize(item.value)))
}

export function getRequestedEvidenceValues(
  query: string,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = []
): RequestedEvidenceValue[] {
  const requestedSlots = fieldSlots.length > 0 ? fieldSlots : resolveRequestedSlots(query)
  if (requestedSlots.length === 0) {
    return []
  }

  return extractRequestedEvidenceValues(hits, requestedSlots)
}

export function scoreRequestedEvidenceCoverage(
  answer: string,
  query: string,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = []
): number {
  const requestedSlots = fieldSlots.length > 0 ? fieldSlots : resolveRequestedSlots(query)
  if (requestedSlots.length === 0) {
    return 0
  }

  const normalizedAnswer = normalize(answer)
  return extractRequestedEvidenceValues(hits, requestedSlots)
    .filter((item) => normalizedAnswer.includes(normalize(item.value)))
    .length
}

export function buildCompleteDeterministicFieldAnswer(
  query: string,
  hits: KnowledgeSearchHit[],
  fieldSlots: string[] = []
): DeterministicFieldAnswer | null {
  const requestedSlots = orderSlotsByQuery(
    fieldSlots.length > 0 ? fieldSlots : resolveRequestedSlots(query),
    query
  )
  if (requestedSlots.length === 0) {
    return null
  }

  const values = extractRequestedEvidenceValues(hits, requestedSlots)
  const valueBySlot = new Map(values.map((item) => [item.slot, item.value]))
  const missingSlot = requestedSlots.some((slot) => !valueBySlot.has(slot))
  if (missingSlot) {
    return null
  }

  const lines = requestedSlots
    .map((slot) => {
      const label = getRequestedSlotLabel(slot)
      const value = valueBySlot.get(slot)
      return label && value ? `${label}：${value}` : ''
    })
    .filter(Boolean)

  return lines.length === requestedSlots.length
    ? {
        answer: lines.join('\n'),
        values
      }
    : null
}

export function selectMoreCompleteKnowledgeAnswer(
  original: string,
  edited: string,
  facts: KnowledgeEvidenceFact[]
): string {
  const originalScore = scoreAnswer(original, facts)
  const editedScore = scoreAnswer(edited, facts)
  if (originalScore > 0 && isMissingAnswer(edited)) {
    return original
  }

  return editedScore > originalScore ? edited : original
}

function scoreAnswer(answer: string, facts: KnowledgeEvidenceFact[]): number {
  const normalizedAnswer = normalize(answer)
  return facts
    .slice(0, FACT_CHECK_LIMIT)
    .flatMap((fact) => fact.exactValues)
    .filter((value) => normalizedAnswer.includes(normalize(value))).length
}

function resolveRequestedSlots(query: string): string[] {
  const slots: string[] = []
  const normalizedQuery = normalize(query)
  if (isFieldNameOnlyQuery(query)) {
    return []
  }

  const hasAttachmentContext = /(?:\u9644\u4ef6|\u4eea\u8868\u76d8|\u770b\u677f|dashboard|visual|image)/i.test(query)
  const hasLevelAlertContext = /(?:\u4e00\u7ea7|\u4e8c\u7ea7|level\s*[12])/i.test(normalizedQuery)

  if (/(?:\u4e3b\u63a7\u5236\u9608\u503c|\u4e3b\u63a7\u9608\u503c|\u4e3b\u9608\u503c|maincontrolthreshold|controlthreshold)/i.test(normalizedQuery)) {
    slots.push('main_control_threshold')
  }

  if (/(?:\u8d23\u4efb\u89d2\u8272|\u8d1f\u8d23\u4eba|\u8d23\u4efb\u4eba|\u5f52\u8c01\u786e\u8ba4|responsiblerole|owner|role)/i.test(normalizedQuery)) {
    slots.push('responsible_role')
  }

  if (/(?:\u4e00\u7ea7(?:\u9884\u8b66|\u544a\u8b66)(?:\u503c|\u9608\u503c)|level\s*1(?:alert|threshold))/i.test(normalizedQuery)) {
    slots.push('alert_threshold_level_1')
  }

  if (/(?:\u4e8c\u7ea7(?:\u9884\u8b66|\u544a\u8b66)(?:\u503c|\u9608\u503c)|level\s*2(?:alert|threshold))/i.test(normalizedQuery)) {
    slots.push('alert_threshold_level_2')
  }

  if (!hasLevelAlertContext && (
    /(?:\u9884\u8b66\u503c|\u9884\u8b66\u7ebf|\u544a\u8b66\u9608\u503c|\u544a\u8b66\u4e34\u754c\u70b9|alertthreshold)/i.test(normalizedQuery) ||
    (hasAttachmentContext && /(?:\u9608\u503c|threshold)/i.test(normalizedQuery))
  )) {
    slots.push('alert_threshold')
  }

  if (/(?:\u5904\u7f6e\u4ee3\u7801|\u5904\u7f6e\u7f16\u7801|\u52a8\u4f5c\u4ee3\u7801|\u884c\u52a8\u4ee3\u7801|\u6267\u884c\u7f16\u53f7|actioncode|dispositioncode)/i.test(normalizedQuery)) {
    slots.push('action_code')
  }

  if (/(?:\u54cd\u5e94\u65f6\u9650|\u5347\u7ea7\u7a97\u53e3|\u591a\u4e45\u5185|\u591a\u957f\u65f6\u95f4|escalationwindow|responsewindow)/i.test(normalizedQuery)) {
    slots.push('response_time')
  }

  return [...new Set(slots)]
}

function isFieldNameOnlyQuery(query: string): boolean {
  if (!/(?:字段名称|字段名|字段列表|有哪些字段|出现了.*字段|罗列.*字段|列出.*字段)/i.test(query)) {
    return false
  }

  return !/(?:是多少|是什么|对应.*(?:数字|编号|代码|值)|取值|数值|参数|value|code|threshold)/i
    .test(query)
}

function extractRequestedEvidenceValues(
  hits: KnowledgeSearchHit[],
  slots: string[]
): RequestedEvidenceValue[] {
  const values = new Map<string, RequestedEvidenceValue>()

  for (const hit of hits.slice(0, 8)) {
    const content = compact(hit.content)
    for (const slot of slots) {
      for (const value of extractSlotValues(content, slot)) {
        const key = `${slot}:${normalize(value)}`
        if (!values.has(key)) {
          values.set(key, { slot, value })
        }
      }
    }
  }

  return [...values.values()]
}

function extractSlotValues(content: string, slot: string): string[] {
  switch (slot) {
    case 'main_control_threshold':
      return extractNearValues(content, [
        /(?:\u4e3b\u63a7\u5236\u9608\u503c|\u4e3b\u63a7\u9608\u503c|\u4e3b\u9608\u503c|MAIN CONTROL THRESHOLD|CONTROL THRESHOLD)[\s\S]{0,120}?(\d+(?:\.\d+)?\s*%)/gi
      ])
    case 'responsible_role':
      return extractNearValues(content, [
        /(?:\u8d23\u4efb\u89d2\u8272|\u8d1f\u8d23\u4eba|\u8d23\u4efb\u4eba|RESPONSIBLE ROLE|OWNER|ROLE)[\s\S]{0,160}?\b([a-z]+(?:_[a-z0-9]+)+)\b/gi
      ])
    case 'alert_threshold':
      return extractNearValues(content, [
        /(?:\u9884\u8b66\u503c|\u9884\u8b66\u7ebf|\u544a\u8b66\u9608\u503c|\u544a\u8b66\u4e34\u754c\u70b9|ALERT THRESHOLD)[\s\S]{0,160}?(\d+(?:\.\d+)?\s*%)/gi
      ])
    case 'alert_threshold_level_1':
      return extractNearValues(content, [
        /(?:\u4e00\u7ea7(?:\u9884\u8b66|\u544a\u8b66)(?:\u503c|\u9608\u503c)|LEVEL\s*1\s*(?:ALERT|THRESHOLD))[\s\S]{0,160}?(\d+(?:\.\d+)?\s*%)/gi
      ])
    case 'alert_threshold_level_2':
      return extractNearValues(content, [
        /(?:\u4e8c\u7ea7(?:\u9884\u8b66|\u544a\u8b66)(?:\u503c|\u9608\u503c)|LEVEL\s*2\s*(?:ALERT|THRESHOLD))[\s\S]{0,160}?(\d+(?:\.\d+)?\s*%)/gi
      ])
    case 'action_code':
      return extractNearValues(content, [
        /(?:\u5904\u7f6e\u4ee3\u7801|\u5904\u7f6e\u7f16\u7801|\u52a8\u4f5c\u4ee3\u7801|\u884c\u52a8\u4ee3\u7801|\u6267\u884c\u7f16\u53f7|ACTION CODE|DISPOSITION CODE)[\s\S]{0,180}?\b(ACT-[A-Z0-9-]+)\b/gi
      ])
    case 'response_time':
      return extractNearValues(content, [
        /(?:\u54cd\u5e94\u65f6\u9650|\u5347\u7ea7\u7a97\u53e3|ESCALATION WINDOW|RESPONSE WINDOW)[\s\S]{0,180}?(\d+(?:\.\d+)?\s*(?:\u5c0f\u65f6|\u5206\u949f|hours?|minutes?))/gi
      ])
    default:
      return []
  }
}

function extractNearValues(content: string, patterns: RegExp[]): string[] {
  const values: string[] = []
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const value = match[1]?.trim()
      if (value) {
        values.push(value)
      }
    }
  }

  return [...new Set(values)]
}

function getRequestedSlotLabel(slot: string): string {
  switch (slot) {
    case 'main_control_threshold':
      return '\u4e3b\u63a7\u5236\u9608\u503c'
    case 'responsible_role':
      return '\u8d23\u4efb\u89d2\u8272'
    case 'alert_threshold':
      return '\u9884\u8b66\u503c'
    case 'alert_threshold_level_1':
      return '\u4e00\u7ea7\u9884\u8b66\u503c'
    case 'alert_threshold_level_2':
      return '\u4e8c\u7ea7\u9884\u8b66\u503c'
    case 'action_code':
      return '\u5904\u7f6e\u4ee3\u7801'
    case 'response_time':
      return '\u54cd\u5e94\u65f6\u9650'
    default:
      return ''
  }
}

function orderSlotsByQuery(slots: string[], query: string): string[] {
  const normalizedQuery = normalize(query)
  return [...new Set(slots)].sort((left, right) =>
    getSlotFirstIndex(left, normalizedQuery) - getSlotFirstIndex(right, normalizedQuery)
  )
}

function getSlotFirstIndex(slot: string, normalizedQuery: string): number {
  const aliases = getSlotOrderAliases(slot)
  const indexes = aliases
    .map((alias) => normalizedQuery.indexOf(normalize(alias)))
    .filter((index) => index >= 0)

  return indexes.length > 0 ? Math.min(...indexes) : Number.MAX_SAFE_INTEGER
}

function getSlotOrderAliases(slot: string): string[] {
  switch (slot) {
    case 'main_control_threshold':
      return ['\u4e3b\u63a7\u5236\u9608\u503c', '\u4e3b\u63a7\u9608\u503c', '\u4e3b\u9608\u503c', 'maincontrolthreshold', 'controlthreshold']
    case 'responsible_role':
      return ['\u8d23\u4efb\u89d2\u8272', '\u8d1f\u8d23\u4eba', '\u8d23\u4efb\u4eba', 'responsiblerole', 'owner', 'role']
    case 'alert_threshold':
      return ['\u9884\u8b66\u503c', '\u9884\u8b66\u7ebf', '\u544a\u8b66\u9608\u503c', '\u544a\u8b66\u4e34\u754c\u70b9', 'alertthreshold']
    case 'alert_threshold_level_1':
      return ['\u4e00\u7ea7\u9884\u8b66\u503c', '\u4e00\u7ea7\u9884\u8b66\u9608\u503c', '\u4e00\u7ea7\u544a\u8b66\u503c', '\u4e00\u7ea7\u544a\u8b66\u9608\u503c', 'level1alert', 'level1threshold']
    case 'alert_threshold_level_2':
      return ['\u4e8c\u7ea7\u9884\u8b66\u503c', '\u4e8c\u7ea7\u9884\u8b66\u9608\u503c', '\u4e8c\u7ea7\u544a\u8b66\u503c', '\u4e8c\u7ea7\u544a\u8b66\u9608\u503c', 'level2alert', 'level2threshold']
    case 'action_code':
      return ['\u5904\u7f6e\u4ee3\u7801', '\u5904\u7f6e\u7f16\u7801', '\u52a8\u4f5c\u4ee3\u7801', '\u884c\u52a8\u4ee3\u7801', '\u6267\u884c\u7f16\u53f7', 'actioncode', 'dispositioncode']
    case 'response_time':
      return ['\u54cd\u5e94\u65f6\u9650', '\u5347\u7ea7\u7a97\u53e3', '\u591a\u4e45\u5185', 'escalationwindow', 'responsewindow']
    default:
      return []
  }
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

function isMissingAnswer(answer: string): boolean {
  return /(?:\u672a\u5728.*\u8bc1\u636e.*\u627e\u5230|\u672a\u627e\u5230|\u627e\u4e0d\u5230|\u6ca1\u6709\u627e\u5230|\u65e0\u6cd5\u786e\u5b9a|\u65e0\u6cd5\u786e\u8ba4|\u8bc1\u636e\u4e0d\u8db3|\u4e0d\u5305\u542b|\u6ca1\u6709\u63d0\u4f9b|not found|not provided|cannot determine)/i
    .test(answer)
}
