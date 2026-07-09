import { BadRequestException, Injectable } from '@nestjs/common'
import { KnowledgeQueryAnalysisService } from './knowledge-query-analysis.service'
import type {
  KnowledgeQueryAnalysis,
  KnowledgeQueryPlan,
  KnowledgeQueryRetrievalHints
} from './knowledge-query-plan.types'

const DEFAULT_RETRIEVAL_HINTS: KnowledgeQueryRetrievalHints = {
  mode: 'balanced',
  bm25Weight: 1,
  vectorWeight: 1
}

@Injectable()
export class KnowledgeQueryEngineService {
  constructor(
    private readonly knowledgeQueryAnalysisService: KnowledgeQueryAnalysisService
  ) {}

  async buildPlan(
    query: string,
    options: { enableAnalysis?: boolean } = {}
  ): Promise<KnowledgeQueryPlan> {
    const originalQuery = typeof query === 'string' ? query : ''
    const normalizedQuery = normalizeQuery(originalQuery)

    if (!normalizedQuery) {
      throw new BadRequestException('Query is empty')
    }

    const analysis =
      options.enableAnalysis === false
        ? null
        : await this.knowledgeQueryAnalysisService.analyze({
            originalQuery,
            normalizedQuery
          })

    return {
      originalQuery,
      normalizedQuery,
      bm25Query: buildBm25Query(normalizedQuery, analysis),
      vectorQuery: buildVectorQuery(normalizedQuery, analysis),
      analysis,
      entities: analysis?.entities ?? [],
      constraints: analysis?.constraints ?? [],
      retrieval: analysis?.retrieval ?? DEFAULT_RETRIEVAL_HINTS
    }
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

function buildBm25Query(
  normalizedQuery: string,
  analysis: KnowledgeQueryAnalysis | null
): string {
  if (!analysis) {
    return normalizedQuery
  }

  return uniqueStrings([
    normalizedQuery,
    ...analysis.requiredTerms,
    ...analysis.searchPhrases,
    ...analysis.optionalTerms.slice(0, 4)
  ]).join(' ')
}

function buildVectorQuery(
  normalizedQuery: string,
  analysis: KnowledgeQueryAnalysis | null
): string {
  if (!analysis) {
    return normalizedQuery
  }

  return uniqueStrings([
    normalizedQuery,
    ...analysis.semanticQueries.slice(0, 4)
  ]).join('\n')
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
