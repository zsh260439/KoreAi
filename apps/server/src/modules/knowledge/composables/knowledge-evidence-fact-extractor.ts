import type { KnowledgeSearchDebugInfo, KnowledgeSearchHit } from 'share-type'

export type KnowledgeEvidenceFact = {
  sourceIndex: number
  documentName: string
  text: string
  matchedTerms: string[]
  exactValues: string[]
}

type EvidenceFactCandidate = KnowledgeEvidenceFact & {
  score: number
}

const STRUCTURED_IDENTIFIER_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,12}[-_]?\d{2,})\b/gi

const NUMBER_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:%|万|次|天|条|小时|分钟|days?|times?|items?)?\b/gi

const SENTENCE_SPLIT_PATTERN = /(?<=[。！？!?；;])\s*|\r?\n+/
const MAX_FACTS = 8
const MAX_SIGNAL_TERMS = 64
const MAX_FACT_TEXT_LENGTH = 220

export function extractKnowledgeEvidenceFacts(input: {
  query: string
  hits: KnowledgeSearchHit[]
  debug?: KnowledgeSearchDebugInfo | null
}): KnowledgeEvidenceFact[] {
  if (input.hits.length === 0) {
    return []
  }

  const queryTerms = extractQueryTerms(input.query)
  const debugTerms = [
    ...(input.debug?.protectedTerms ?? []),
    ...(input.debug?.evidenceTerms ?? []),
    ...(input.debug?.evidenceNumericTerms ?? [])
  ]
  const signalTerms = uniqueNormalizedTerms([...queryTerms, ...debugTerms])
    .filter((term) => !/^\d$/.test(normalizeTerm(term)))
    .slice(0, MAX_SIGNAL_TERMS)
  if (signalTerms.length === 0) {
    return []
  }

  const candidates = input.hits.flatMap((hit, hitIndex) =>
    extractHitFactCandidates(hit, hitIndex, signalTerms)
  )

  return dedupeFacts(candidates)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_FACTS)
    .map(({ score: _score, ...fact }) => fact)
}

function extractHitFactCandidates(
  hit: KnowledgeSearchHit,
  hitIndex: number,
  signalTerms: string[]
): EvidenceFactCandidate[] {
  const searchableTitle = compactText([hit.documentName, hit.primaryTitle, hit.sectionPath].join(' '))
  const titleMatchedTerms = matchTerms(searchableTitle, signalTerms)
  const sentences = splitFactSentences(hit.content)

  return sentences
    .map((sentence) => {
      const matchedTerms = uniqueNormalizedTerms([
        ...titleMatchedTerms,
        ...matchTerms(sentence, signalTerms)
      ])
      const exactValues = uniqueNormalizedTerms([
        ...extractMatches(sentence, STRUCTURED_IDENTIFIER_PATTERN),
        ...extractMatches(sentence, NUMBER_PATTERN)
      ])
      const score = scoreFactCandidate(sentence, matchedTerms, hit, titleMatchedTerms.length)

      return {
        sourceIndex: hitIndex + 1,
        documentName: hit.documentName,
        text: truncateFactText(sentence),
        matchedTerms,
        exactValues,
        score
      }
    })
    .filter((candidate) => candidate.score > 0)
}

function scoreFactCandidate(
  sentence: string,
  matchedTerms: string[],
  hit: KnowledgeSearchHit,
  titleMatchCount: number
): number {
  const factLength = compactText(sentence).length
  const identifierCount = extractMatches(sentence, STRUCTURED_IDENTIFIER_PATTERN).length
  const numberCount = extractMatches(sentence, NUMBER_PATTERN).length
  const hasStructuredValue = identifierCount + numberCount > 0
  if (matchedTerms.length === 0 || (matchedTerms.length < 2 && !hasStructuredValue)) {
    return 0
  }

  const evidenceScore = hit.scoreDetail?.evidenceScore ?? 0
  const matchedByCount = hit.scoreDetail?.matchedBy.length ?? 0

  const baseScore =
    matchedTerms.length * 12 +
    identifierCount * 30 +
    numberCount * 24 +
    titleMatchCount * 18 +
    matchedByCount * 8 +
    Math.min(evidenceScore, 100) / 10

  return baseScore - computeLengthPenalty(factLength)
}

function splitFactSentences(content: string): string[] {
  const directSentences = content
    .split(SENTENCE_SPLIT_PATTERN)
    .map((item) => compactText(item))
    .filter((item) => item.length >= 6)

  if (directSentences.length > 0) {
    return directSentences
  }

  return [compactText(content)].filter(Boolean)
}

function extractQueryTerms(query: string): string[] {
  const identifiers = extractMatches(query, STRUCTURED_IDENTIFIER_PATTERN)
  const numbers = extractMatches(query, NUMBER_PATTERN)
    .filter((numberTerm) => !identifiers.some((identifier) => identifier.includes(numberTerm)))
  const asciiTerms = extractAsciiTerms(query)
    .filter((term) => !identifiers.some((identifier) => identifier.includes(term)))

  return uniqueNormalizedTerms([
    ...identifiers,
    ...numbers,
    ...extractCjkTerms(query),
    ...asciiTerms
  ])
}

function extractCjkTerms(value: string): string[] {
  return value.match(/[\u4e00-\u9fff]{2,}/g) ?? []
}

function extractAsciiTerms(value: string): string[] {
  return value.match(/\b[a-z][a-z0-9_]{2,}\b/gi) ?? []
}

function matchTerms(text: string, terms: string[]): string[] {
  const normalizedText = normalizeTerm(text)
  const compactedText = compactForLooseMatch(normalizedText)

  return terms.filter((term) => {
    const normalizedTerm = normalizeTerm(term)
    if (!normalizedTerm) {
      return false
    }

    if (normalizedText.includes(normalizedTerm)) {
      return true
    }

    if (isLooseCompactMatch(compactedText, normalizedTerm)) {
      return true
    }

    return (
      isMultiTokenMatch(normalizedText, compactedText, normalizedTerm) ||
      isCjkEdgeMatch(normalizedText, normalizedTerm)
    )
  })
}

function dedupeFacts(candidates: EvidenceFactCandidate[]): EvidenceFactCandidate[] {
  const seen = new Set<string>()
  const result: EvidenceFactCandidate[] = []
  const sortedCandidates = [...candidates].sort((left, right) => right.score - left.score)

  for (const candidate of sortedCandidates) {
    const key = normalizeTerm(candidate.text)
    if (seen.has(key) || result.some((item) => isOverlappingFact(item, candidate))) {
      continue
    }

    seen.add(key)
    result.push(candidate)
  }

  return result
}

function computeLengthPenalty(length: number): number {
  if (length <= 120) {
    return 0
  }

  if (length <= 160) {
    return 10
  }

  if (length <= MAX_FACT_TEXT_LENGTH) {
    return 24
  }

  return 40 + Math.min(Math.floor((length - MAX_FACT_TEXT_LENGTH) / 80) * 8, 40)
}

function isOverlappingFact(
  left: EvidenceFactCandidate,
  right: EvidenceFactCandidate
): boolean {
  const leftTerms = uniqueNormalizedTerms(left.matchedTerms).map(normalizeTerm)
  const rightTerms = new Set(uniqueNormalizedTerms(right.matchedTerms).map(normalizeTerm))
  const overlapCount = leftTerms.filter((term) => rightTerms.has(term)).length
  const smallerTermCount = Math.min(leftTerms.length, rightTerms.size)
  if (smallerTermCount < 2) {
    return false
  }

  if (overlapCount / smallerTermCount < 0.8) {
    return false
  }

  const leftValues = uniqueNormalizedTerms(left.exactValues).map(normalizeTerm)
  const rightValues = new Set(uniqueNormalizedTerms(right.exactValues).map(normalizeTerm))
  const smallerValueCount = Math.min(leftValues.length, rightValues.size)
  if (smallerValueCount === 0) {
    return false
  }

  const valueOverlapCount = leftValues.filter((value) => rightValues.has(value)).length
  return valueOverlapCount / smallerValueCount >= 0.8
}

function extractMatches(value: string, pattern: RegExp): string[] {
  return value.match(pattern) ?? []
}

function uniqueNormalizedTerms(values: string[]): string[] {
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

function truncateFactText(value: string): string {
  const compacted = compactText(value)
  if (compacted.length <= MAX_FACT_TEXT_LENGTH) {
    return compacted
  }

  return `${compacted.slice(0, MAX_FACT_TEXT_LENGTH)}...`
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeTerm(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isLooseCompactMatch(compactedText: string, normalizedTerm: string): boolean {
  const compactedTerm = compactForLooseMatch(normalizedTerm)
  if (compactedTerm.length < 3) {
    return false
  }

  return compactedText.includes(compactedTerm)
}

function isMultiTokenMatch(
  normalizedText: string,
  compactedText: string,
  normalizedTerm: string
): boolean {
  const tokens = normalizedTerm
    .split(/[\s_\-./:]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)

  if (tokens.length < 2) {
    return false
  }

  return tokens.every((token) =>
    normalizedText.includes(token) || isLooseCompactMatch(compactedText, token)
  )
}

function compactForLooseMatch(value: string): string {
  return normalizeTerm(value).replace(/[^a-z0-9\u4e00-\u9fff]/gi, '')
}

function isCjkEdgeMatch(normalizedText: string, normalizedTerm: string): boolean {
  if (!/^[\u4e00-\u9fff]{4,}$/.test(normalizedTerm)) {
    return false
  }

  return (
    normalizedText.includes(normalizedTerm.slice(0, 2)) &&
    normalizedText.includes(normalizedTerm.slice(-2))
  )
}
