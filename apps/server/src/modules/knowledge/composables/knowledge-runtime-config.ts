import type {
  KnowledgeBaseAnswerRuntimeConfig,
  KnowledgeBaseRuntimeConfigPatch,
  KnowledgeBaseRetrievalRuntimeConfig
} from 'share-type'
import {
  DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
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
      1,
      50
    ),
    workspaceTopK: normalizeInteger(
      retrievalSource.workspaceTopK,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.workspaceTopK,
      1,
      12
    ),
    candidateMultiplier: normalizeInteger(
      retrievalSource.candidateMultiplier,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.candidateMultiplier,
      1,
      12
    ),
    minCandidateLimit: normalizeInteger(
      retrievalSource.minCandidateLimit,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.minCandidateLimit,
      1,
      200
    ),
    maxCandidateLimit: normalizeInteger(
      retrievalSource.maxCandidateLimit,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.maxCandidateLimit,
      1,
      400
    ),
    bm25Weight: normalizeFloat(
      retrievalSource.bm25Weight,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.bm25Weight,
      0.2,
      3
    ),
    vectorWeight: normalizeFloat(
      retrievalSource.vectorWeight,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.vectorWeight,
      0.2,
      3
    ),
    queryAnalysisEnabled: normalizeBoolean(
      retrievalSource.queryAnalysisEnabled,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryAnalysisEnabled
    ),
    queryAnalysisTemperature: normalizeFloat(
      retrievalSource.queryAnalysisTemperature,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.retrieval.queryAnalysisTemperature,
      0,
      2
    )
  }

  // 保证候选集上下限关系稳定，避免保存出 min 比 max 还大的非法配置。
  retrieval.minCandidateLimit = Math.min(retrieval.minCandidateLimit, retrieval.maxCandidateLimit)
  retrieval.maxCandidateLimit = Math.max(retrieval.maxCandidateLimit, retrieval.minCandidateLimit)

  const answer: KnowledgeBaseAnswerRuntimeConfig = {
    temperature: normalizeFloat(
      answerSource.temperature,
      DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG.answer.temperature,
      0,
      2
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
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false
    }
  }

  return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
