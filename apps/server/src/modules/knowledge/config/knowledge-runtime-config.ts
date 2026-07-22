import type {
  KnowledgeBaseAnswerRuntimeConfig,
  KnowledgeBaseRuntimeConfigPatch,
  KnowledgeBaseRetrievalRuntimeConfig,
  KnowledgeQueryMapping
} from 'share-type'
import {
  DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
  KNOWLEDGE_RUNTIME_CONFIG_LIMITS,
  type KnowledgeBaseRuntimeConfig
} from 'share-type'

export { DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG } from 'share-type'

// 统一把数据库里可能为空或不完整的 runtimeConfig 归一化成完整结构。
export function normalizeKnowledgeBaseRuntimeConfig(
  value?: Partial<KnowledgeBaseRuntimeConfig> | Record<string, unknown> | null
): KnowledgeBaseRuntimeConfig {
  const retrievalSource = isRecord(value?.retrieval) ? value.retrieval : {}
  const answerSource = isRecord(value?.answer) ? value.answer : {}

  const retrieval: KnowledgeBaseRetrievalRuntimeConfig = {
    previewTopK: normalizeInteger(
      retrievalSource.previewTopK,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.previewTopK,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.previewTopK.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.previewTopK.max
    ),
    workspaceTopK: normalizeInteger(
      retrievalSource.workspaceTopK,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.workspaceTopK,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.workspaceTopK.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.workspaceTopK.max
    ),
    candidateMultiplier: normalizeInteger(
      retrievalSource.candidateMultiplier,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.candidateMultiplier,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.candidateMultiplier.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.candidateMultiplier.max
    ),
    minCandidateLimit: normalizeInteger(
      retrievalSource.minCandidateLimit,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.minCandidateLimit,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.minCandidateLimit.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.minCandidateLimit.max
    ),
    maxCandidateLimit: normalizeInteger(
      retrievalSource.maxCandidateLimit,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.maxCandidateLimit,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.maxCandidateLimit.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.maxCandidateLimit.max
    ),
    bm25Weight: normalizeFloat(
      retrievalSource.bm25Weight,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.bm25Weight,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.bm25Weight.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.bm25Weight.max
    ),
    vectorWeight: normalizeFloat(
      retrievalSource.vectorWeight,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.vectorWeight,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.vectorWeight.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.vectorWeight.max
    ),
    queryAnalysisEnabled: normalizeBoolean(
      retrievalSource.queryAnalysisEnabled,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryAnalysisEnabled
    ),
    queryAnalysisTemperature: normalizeFloat(
      retrievalSource.queryAnalysisTemperature,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryAnalysisTemperature,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.queryAnalysisTemperature.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.queryAnalysisTemperature.max
    ),
    queryMappings: normalizeQueryMappings(retrievalSource.queryMappings)
  }

  // 保证候选集上下限关系稳定，避免保存出 min 比 max 还大的非法配置。
  retrieval.minCandidateLimit = Math.min(retrieval.minCandidateLimit, retrieval.maxCandidateLimit)

  const answer: KnowledgeBaseAnswerRuntimeConfig = {
    temperature: normalizeFloat(
      answerSource.temperature,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.answer.temperature,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.answerTemperature.min,
      KNOWLEDGE_RUNTIME_CONFIG_LIMITS.answerTemperature.max
    )
  }

  return {
    retrieval,
    answer
  }
}

// 统一合并“当前持久化配置 + 本次 patch”，避免服务层重复写深合并细节。
export function mergeKnowledgeBaseRuntimeConfig(
  currentValue: Partial<KnowledgeBaseRuntimeConfig> | Record<string, unknown> | null | undefined,
  patch: KnowledgeBaseRuntimeConfigPatch
): KnowledgeBaseRuntimeConfig {
  const currentConfig = normalizeKnowledgeBaseRuntimeConfig(currentValue)

  return normalizeKnowledgeBaseRuntimeConfig({
    ...currentConfig,
    ...patch,
    retrieval: {
      ...currentConfig.retrieval,
      ...patch.retrieval
    },
    answer: {
      ...currentConfig.answer,
      ...patch.answer
    }
  })
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(Math.max(Math.round(numeric), min), max)
}

function normalizeFloat(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(Math.max(numeric, min), max)
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeQueryMappings(value: unknown): KnowledgeQueryMapping[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!isRecord(item) || typeof item.trigger !== 'string' || !Array.isArray(item.terms)) {
        return null
      }

      const trigger = item.trigger.trim().slice(
        0,
        KNOWLEDGE_RUNTIME_CONFIG_LIMITS.queryMappings.maxTriggerLength
      )
      const terms = item.terms
        .filter((term): term is string => typeof term === 'string')
        .map((term) => term.trim().slice(
          0,
          KNOWLEDGE_RUNTIME_CONFIG_LIMITS.queryMappings.maxTermLength
        ))
        .filter(Boolean)
        .slice(0, KNOWLEDGE_RUNTIME_CONFIG_LIMITS.queryMappings.maxTermsPerMapping)

      return trigger && terms.length > 0 ? { trigger, terms } : null
    })
    .filter((item): item is KnowledgeQueryMapping => Boolean(item))
    .slice(0, KNOWLEDGE_RUNTIME_CONFIG_LIMITS.queryMappings.maxItems)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
