import type { KnowledgeEvidenceFact } from '../evidence/knowledge-evidence-fact-extractor'

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
  return scoreAnswer(edited, facts) >= scoreAnswer(original, facts) ? edited : original
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
