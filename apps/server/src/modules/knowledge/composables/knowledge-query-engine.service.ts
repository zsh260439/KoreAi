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
    // 保留原始 query，后面调试面板会直接展示“用户到底输入了什么”
    const originalQuery = typeof query === 'string' ? query : ''
    // 归一化只做文本清洗，不做语义改写
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
      // 原始输入用于调试和对照 rewrite 前后变化
      originalQuery,
      // 清洗后的 query 作为所有后续处理的基线
      normalizedQuery,
      // BM25 仍然吃 rewrite 产出的关键词拼接结果，但不再让 LLM 改权重
      bm25Query: buildBm25Query(normalizedQuery, analysis),
      // 向量检索仍然可以吃 rewrite 的语义扩写文本
      vectorQuery: buildVectorQuery(normalizedQuery, analysis),
      // 这个标记让前端知道本次是否真的拿到了 analysis 结果，而不是单纯开关处于 ON
      rewriteApplied: analysis !== null,
      analysis,
      entities: analysis?.entities ?? [],
      constraints: analysis?.constraints ?? [],
      // 这里强制固定为 1:1，彻底切断 LLM 动态改融合权重的入口
      retrieval: DEFAULT_RETRIEVAL_HINTS
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
