import type { KnowledgeSearchHit } from 'share-type'

import type {
  KnowledgeQueryComplexity,
  KnowledgeQueryPlan
} from '../query/knowledge-query-plan.types'

type CeRerankResponse = {
  results?: Array<{
    index?: number
    relevance_score?: number
  }>
}

const CE_RERANK_COMPLEXITIES = new Set<KnowledgeQueryComplexity>([
  'multi_fact',
  'reference_required',
  'high_constraint'
])

const CE_MAX_DOCUMENTS_PER_REQUEST = 80
const CE_REQUEST_TIMEOUT_MS = 15_000
const CE_RELATIVE_RELEVANCE_FLOOR = 0.15

export function shouldApplyCeRerank(plan: KnowledgeQueryPlan): boolean {
  return CE_RERANK_COMPLEXITIES.has(plan.evidencePlan.complexity)
}

// topK 是上限，不应使用明显不相关的片段补足数量。
export function filterCeRelevantHits(
  hits: KnowledgeSearchHit[],
  scoreMap: Map<string, number> | null
): KnowledgeSearchHit[] {
  if (!scoreMap || hits.length === 0) {
    return hits
  }

  const topScore = Math.max(...scoreMap.values())
  if (topScore <= 0) {
    return hits
  }

  const minimumScore = topScore * CE_RELATIVE_RELEVANCE_FLOOR
  return hits.filter((hit) => (scoreMap.get(hit.chunkId) ?? 0) >= minimumScore)
}

export async function fetchCeRerankScores(
  hits: KnowledgeSearchHit[],
  query: string
): Promise<Map<string, number> | null> {
  if (hits.length === 0) {
    return new Map()
  }

  const baseUrl = process.env.RERANK_BASE_URL
  const apiKey = process.env.RERANK_API_KEY
  const model = process.env.RERANK_MODEL
  if (!baseUrl || !apiKey || !model) {
    return null
  }

  const batches: KnowledgeSearchHit[][] = []
  for (let index = 0; index < hits.length; index += CE_MAX_DOCUMENTS_PER_REQUEST) {
    batches.push(hits.slice(index, index + CE_MAX_DOCUMENTS_PER_REQUEST))
  }

  try {
    const batchResults = await Promise.all(
      batches.map((batch) => requestCeBatch(baseUrl, apiKey, model, query, batch))
    )
    const scoreMap = new Map<string, number>()

    for (const batchResult of batchResults) {
      if (!batchResult) {
        return null
      }

      for (const result of batchResult.results) {
        const hit = batchResult.batch[result.index]
        if (hit) {
          scoreMap.set(hit.chunkId, result.score)
        }
      }
    }

    return scoreMap.size === hits.length ? scoreMap : null
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.warn(`[CeRerank] request failed: ${message}`)
    return null
  }
}

async function requestCeBatch(
  baseUrl: string,
  apiKey: string,
  model: string,
  query: string,
  batch: KnowledgeSearchHit[]
): Promise<{
  batch: KnowledgeSearchHit[]
  results: Array<{ index: number; score: number }>
} | null> {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      query,
      documents: batch.map(buildCeDocument)
    }),
    signal: AbortSignal.timeout(CE_REQUEST_TIMEOUT_MS)
  })

  if (!response.ok) {
    console.warn(`[CeRerank] HTTP ${response.status}`)
    return null
  }

  const payload = await response.json() as CeRerankResponse
  if (!Array.isArray(payload.results) || payload.results.length !== batch.length) {
    return null
  }

  const seenIndexes = new Set<number>()
  const results: Array<{ index: number; score: number }> = []
  for (const item of payload.results) {
    if (
      !Number.isInteger(item.index) ||
      item.index === undefined ||
      item.index < 0 ||
      item.index >= batch.length ||
      typeof item.relevance_score !== 'number' ||
      !Number.isFinite(item.relevance_score) ||
      seenIndexes.has(item.index)
    ) {
      return null
    }

    seenIndexes.add(item.index)
    results.push({ index: item.index, score: item.relevance_score })
  }

  return { batch, results }
}

function buildCeDocument(hit: KnowledgeSearchHit): string {
  return [
    `documentName: ${hit.documentName}`,
    hit.primaryTitle ? `primaryTitle: ${hit.primaryTitle}` : '',
    hit.sectionPath ? `sectionPath: ${hit.sectionPath}` : '',
    `content: ${hit.content}`
  ].filter(Boolean).join('\n')
}
