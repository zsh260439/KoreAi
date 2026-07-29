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

const FIELD_NAME_ONLY_QUERY_PATTERN =
  /(?:字段名称|字段名|字段列表|有哪些字段|出现了.*字段|罗列.*字段|列出.*字段)/i

const FIELD_VALUE_QUERY_PATTERN =
  /(?:是多少|是什么|对应.*(?:数字|编号|代码|值)|取值|数值|参数|value|code|threshold)/i

const OPEN_ENDED_QUERY_PATTERN =
  /(?:描述|通用归档|归档模式|共性|共同点|差异|对比|比较|怎么办|如何|为什么|原因|方案|流程|步骤|策略|处理方式|方式|summary|summarize|compare|why|how|procedure|strategy|archive pattern)/i

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
  if (!isPureDeterministicFieldQuestion(query)) {
    return null
  }

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

export function __testResolveRequestedSlots(query: string): string[] {
  return resolveRequestedSlots(query)
}

export function isPureDeterministicFieldQuestion(query: string): boolean {
  const requestedSlots = resolveRequestedSlots(query)
  if (requestedSlots.length === 0) {
    return false
  }

  return !OPEN_ENDED_QUERY_PATTERN.test(query)
}

function scoreAnswer(answer: string, facts: KnowledgeEvidenceFact[]): number {
  const normalizedAnswer = normalize(answer)
  return facts
    .slice(0, FACT_CHECK_LIMIT)
    .flatMap((fact) => fact.exactValues)
    .filter((value) => normalizedAnswer.includes(normalize(value))).length
}

function resolveRequestedSlots(query: string): string[] {
  if (isFieldNameOnlyQuery(query)) {
    return []
  }

  const slots: string[] = []
  const normalizedQuery = normalize(query)
  const hasAttachmentContext = /(?:附件|仪表盘|看板|dashboard|visual|image)/i.test(query)
  const alertLevelSlots = extractAlertLevelSlots(query)
  const hasLevelAlertContext = alertLevelSlots.length > 0

  if (/(?:主控制阈值|主控阈值|主阈值|maincontrolthreshold|controlthreshold)/i.test(normalizedQuery)) {
    slots.push('main_control_threshold')
  }

  if (/(?:责任角色|负责人|责任人|归谁确认|responsiblerole|owner|role)/i.test(normalizedQuery)) {
    slots.push('responsible_role')
  }

  slots.push(...alertLevelSlots)

  if (!hasLevelAlertContext && (
    /(?:预警值|预警线|告警阈值|告警临界点|alertthreshold)/i.test(normalizedQuery) ||
    (hasAttachmentContext && /(?:阈值|threshold)/i.test(normalizedQuery))
  )) {
    slots.push('alert_threshold')
  }

  if (/(?:处置代码|处置编码|动作代码|行动代码|执行编号|actioncode|dispositioncode)/i.test(normalizedQuery)) {
    slots.push('action_code')
  }

  if (/(?:响应时限|升级窗口|多久内|多长时间|escalationwindow|responsewindow)/i.test(normalizedQuery)) {
    slots.push('response_time')
  }

  return [...new Set(slots)]
}

function isFieldNameOnlyQuery(query: string): boolean {
  return FIELD_NAME_ONLY_QUERY_PATTERN.test(query) && !FIELD_VALUE_QUERY_PATTERN.test(query)
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
  const alertLevel = resolveAlertLevelSlotNumber(slot)
  if (alertLevel !== null) {
    return extractNearValues(content, [buildAlertLevelValuePattern(alertLevel)])
  }

  switch (slot) {
    case 'main_control_threshold':
      return extractNearValues(content, [
        /(?:主控制阈值|主控阈值|主阈值|MAIN CONTROL THRESHOLD|CONTROL THRESHOLD)[\s\S]{0,120}?(\d+(?:\.\d+)?\s*%)/gi
      ])
    case 'responsible_role':
      return extractNearValues(content, [
        /(?:责任角色|负责人|责任人|RESPONSIBLE ROLE|OWNER|ROLE)[\s\S]{0,160}?\b([a-z]+(?:_[a-z0-9]+)+)\b/gi
      ])
    case 'alert_threshold':
      return extractNearValues(content, [
        /(?:预警值|预警线|告警阈值|告警临界点|ALERT THRESHOLD)[\s\S]{0,160}?(\d+(?:\.\d+)?\s*%)/gi
      ])
    case 'action_code':
      return extractNearValues(content, [
        /(?:处置代码|处置编码|动作代码|行动代码|执行编号|ACTION CODE|DISPOSITION CODE)[\s\S]{0,180}?\b(ACT-[A-Z0-9-]+)\b/gi
      ])
    case 'response_time':
      return extractNearValues(content, [
        /(?:响应时限|升级窗口|ESCALATION WINDOW|RESPONSE WINDOW)[\s\S]{0,180}?(\d+(?:\.\d+)?\s*(?:小时|分钟|hours?|minutes?))/gi
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
  const alertLevel = resolveAlertLevelSlotNumber(slot)
  if (alertLevel !== null) {
    return `${toChineseLevelNumber(alertLevel)}级预警值`
  }

  switch (slot) {
    case 'main_control_threshold':
      return '主控制阈值'
    case 'responsible_role':
      return '责任角色'
    case 'alert_threshold':
      return '预警值'
    case 'action_code':
      return '处置代码'
    case 'response_time':
      return '响应时限'
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
  const alertLevel = resolveAlertLevelSlotNumber(slot)
  if (alertLevel !== null) {
    return buildAlertLevelAliases(alertLevel)
  }

  switch (slot) {
    case 'main_control_threshold':
      return ['主控制阈值', '主控阈值', '主阈值', 'maincontrolthreshold', 'controlthreshold']
    case 'responsible_role':
      return ['责任角色', '负责人', '责任人', 'responsiblerole', 'owner', 'role']
    case 'alert_threshold':
      return ['预警值', '预警线', '告警阈值', '告警临界点', 'alertthreshold']
    case 'action_code':
      return ['处置代码', '处置编码', '动作代码', '行动代码', '执行编号', 'actioncode', 'dispositioncode']
    case 'response_time':
      return ['响应时限', '升级窗口', '多久内', 'escalationwindow', 'responsewindow']
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

function extractAlertLevelSlots(value: string): string[] {
  return extractAlertLevelNumbers(value).map((level) => `alert_threshold_level_${level}`)
}

function extractAlertLevelNumbers(value: string): number[] {
  const levels: number[] = []
  const patterns = [
    /([一二三四五六七八九十]+)级(?:预警|告警)(?:值|阈值)?/gi,
    /(?:^|[^a-z0-9])(\d+)级(?:预警|告警)(?:值|阈值)?/gi,
    /level\s*(\d+)\s*(?:alert|threshold)/gi
  ]

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const level = parseChineseOrArabicNumber(match[1] ?? '')
      if (level !== null) {
        levels.push(level)
      }
    }
  }

  return [...new Set(levels)]
}

function resolveAlertLevelSlotNumber(slot: string): number | null {
  const match = slot.match(/^alert_threshold_level_(\d+)$/)
  return match ? Number(match[1]) : null
}

function buildAlertLevelValuePattern(level: number): RegExp {
  const aliases = buildAlertLevelAliases(level)
    .map(escapeRegExp)
    .join('|')
  return new RegExp(`(?:${aliases})[\\s\\S]{0,160}?(\\d+(?:\\.\\d+)?\\s*%)`, 'gi')
}

function buildAlertLevelAliases(level: number): string[] {
  const chinese = toChineseLevelNumber(level)
  return [
    `${chinese}级预警值`,
    `${chinese}级预警阈值`,
    `${chinese}级告警值`,
    `${chinese}级告警阈值`,
    `${level}级预警值`,
    `${level}级预警阈值`,
    `${level}级告警值`,
    `${level}级告警阈值`,
    `level ${level} alert`,
    `level ${level} threshold`,
    `level${level}alert`,
    `level${level}threshold`
  ]
}

function parseChineseOrArabicNumber(value: string): number | null {
  if (/^\d+$/.test(value)) {
    return Number(value)
  }

  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  }
  if (value === '十') {
    return 10
  }
  if (value.startsWith('十')) {
    return 10 + (digits[value[1] ?? ''] ?? 0)
  }
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    return (digits[tens] ?? 0) * 10 + (digits[ones] ?? 0)
  }
  return digits[value] ?? null
}

function toChineseLevelNumber(level: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (level <= 10) {
    return level === 10 ? '十' : digits[level] ?? String(level)
  }
  if (level < 20) {
    return `十${digits[level - 10] ?? ''}`
  }
  if (level < 100) {
    const tens = Math.floor(level / 10)
    const ones = level % 10
    return `${digits[tens] ?? tens}十${digits[ones] ?? ''}`
  }
  return String(level)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isMissingAnswer(answer: string): boolean {
  return /(?:未在.*证据.*找到|未找到|找不到|没有找到|无法确定|无法确认|证据不足|不包含|没有提供|not found|not provided|cannot determine)/i
    .test(answer)
}
