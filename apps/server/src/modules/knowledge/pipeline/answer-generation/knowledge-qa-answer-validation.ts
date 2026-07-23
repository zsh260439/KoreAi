import type { KnowledgeEvidenceFact } from '../evidence-gating/knowledge-evidence-fact-extractor'

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

  for (const fact of facts.slice(0, 4)) {
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
    .slice(0, 4)
    .flatMap((fact) => fact.exactValues)
    .filter((value) => normalizedAnswer.includes(normalize(value))).length
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

function isMissingAnswer(answer: string): boolean {
  return /(?:鏈彁渚泑鏈壘鍒皘鎵句笉鍒皘鏃犳硶纭畾|鏃犳硶纭|璇佹嵁涓嶈冻|涓嶅寘鍚珅娌℃湁鎻愪緵|not found|not provided|cannot determine)/i
    .test(answer)
}


