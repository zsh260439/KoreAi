import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  KnowledgeBaseRuntimeConfig,
  KnowledgeBaseRuntimeConfigPatch,
  KnowledgeGlobalRuntimeSettings,
  KnowledgeProviderRuntimeConfig,
  KnowledgeProviderRuntimeConfigPatch,
  KnowledgeProviderSettings
} from 'share-type'
import { KnowledgeBaseEntity } from '../../entity/knowledge-base.entity'
import { KnowledgeRuntimeSettingsEntity } from '../../entity/knowledge-runtime-settings.entity'
import {
  mergeKnowledgeBaseRuntimeConfig,
  normalizeKnowledgeBaseRuntimeConfig
} from './knowledge-runtime-config'

const GLOBAL_RUNTIME_SCOPE = 'global'

@Injectable()
export class KnowledgeConfigService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeRuntimeSettingsEntity)
    private readonly settingsRepo: Repository<KnowledgeRuntimeSettingsEntity>,
    private readonly env: ConfigService
  ) {}

  async getRuntimeConfig(knowledgeBaseId?: string): Promise<KnowledgeBaseRuntimeConfig> {
    if (!knowledgeBaseId) {
      const settings = await this.findGlobalSettings()
      return normalizeKnowledgeBaseRuntimeConfig(settings?.runtimeConfig)
    }

    const knowledgeBase = await this.knowledgeBaseRepo.findOne({ where: { id: knowledgeBaseId } })
    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found')
    }

    return normalizeKnowledgeBaseRuntimeConfig(knowledgeBase.runtimeConfig)
  }

  async findGlobalRuntimeConfig(): Promise<KnowledgeGlobalRuntimeSettings> {
    const settings = await this.findGlobalSettings()
    return {
      runtimeConfig: normalizeKnowledgeBaseRuntimeConfig(settings?.runtimeConfig),
      createdAt: settings?.createdAt.toISOString() ?? null,
      updatedAt: settings?.updatedAt.toISOString() ?? null
    }
  }

  async updateGlobalRuntimeConfig(
    patch: KnowledgeBaseRuntimeConfigPatch
  ): Promise<KnowledgeGlobalRuntimeSettings> {
    const settings = await this.findGlobalSettings()
    const runtimeConfig = mergeKnowledgeBaseRuntimeConfig(settings?.runtimeConfig, patch)
    const entity = settings
      ? Object.assign(settings, { runtimeConfig })
      : this.settingsRepo.create({ scope: GLOBAL_RUNTIME_SCOPE, runtimeConfig })

    const saved = await this.settingsRepo.save(entity)
    return {
      runtimeConfig: normalizeKnowledgeBaseRuntimeConfig(saved.runtimeConfig),
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString()
    }
  }

  async findProviderSettings(): Promise<KnowledgeProviderSettings> {
    const settings = await this.findGlobalSettings()
    const saved = settings?.providerConfig
    const envLlmBaseUrl = normalizeProviderValue(this.env.get<string>('LLM_BASE_URL'))
    const envLlmModel = normalizeProviderValue(this.env.get<string>('LLM_MODEL'))
    const envOcrBaseUrl = normalizeProviderValue(this.env.get<string>('OCR_BASE_URL'))
    const envOcrModel = normalizeProviderValue(this.env.get<string>('OCR_MODEL'))
    const llmApiKeyConfigured = Boolean(this.env.get<string>('LLM_API_KEY'))
    const ocrApiKeyConfigured = Boolean(this.env.get<string>('OCR_API_KEY'))
    const llmUsesSaved = Boolean(saved?.llm.baseUrl || saved?.llm.model)
    const ocrUsesSaved = Boolean(saved?.ocr.baseUrl || saved?.ocr.model)

    return {
      runtimeConfig: {
        llm: {
          baseUrl: saved?.llm.baseUrl ?? envLlmBaseUrl,
          model: saved?.llm.model ?? envLlmModel
        },
        ocr: {
          enabled: saved?.ocr.enabled ?? ocrApiKeyConfigured,
          baseUrl: saved?.ocr.baseUrl ?? envOcrBaseUrl,
          model: saved?.ocr.model ?? envOcrModel
        },
        documents: {
          autoSync: saved?.documents?.autoSync ?? true,
          syncIntervalHours: saved?.documents?.syncIntervalHours ?? 1
        }
      },
      llmApiKeyConfigured,
      ocrApiKeyConfigured,
      llmSource: llmUsesSaved ? 'saved' : llmApiKeyConfigured ? 'env' : 'none',
      ocrSource: ocrUsesSaved ? 'saved' : ocrApiKeyConfigured ? 'env' : 'local'
    }
  }

  async updateProviderSettings(
    patch: KnowledgeProviderRuntimeConfigPatch
  ): Promise<KnowledgeProviderSettings> {
    const settings = await this.findGlobalSettings()
    const current = settings?.providerConfig ?? createEmptyProviderConfig()
    const providerConfig: KnowledgeProviderRuntimeConfig = {
      llm: {
        baseUrl: patch.llmBaseUrl === undefined ? current.llm.baseUrl : normalizeProviderValue(patch.llmBaseUrl),
        model: patch.llmModel === undefined ? current.llm.model : normalizeProviderValue(patch.llmModel)
      },
      ocr: {
        enabled: patch.ocrEnabled ?? current.ocr.enabled,
        baseUrl: patch.ocrBaseUrl === undefined ? current.ocr.baseUrl : normalizeProviderValue(patch.ocrBaseUrl),
        model: patch.ocrModel === undefined ? current.ocr.model : normalizeProviderValue(patch.ocrModel)
      },
      documents: {
        autoSync: patch.autoSyncDocuments ?? current.documents?.autoSync ?? true,
        syncIntervalHours: patch.documentSyncIntervalHours ?? current.documents?.syncIntervalHours ?? 1
      }
    }
    const entity = settings
      ? Object.assign(settings, { providerConfig })
      : this.settingsRepo.create({ scope: GLOBAL_RUNTIME_SCOPE, providerConfig })

    await this.settingsRepo.save(entity)
    return this.findProviderSettings()
  }

  private findGlobalSettings(): Promise<KnowledgeRuntimeSettingsEntity | null> {
    return this.settingsRepo.findOne({ where: { scope: GLOBAL_RUNTIME_SCOPE } })
  }
}

function createEmptyProviderConfig(): KnowledgeProviderRuntimeConfig {
  return {
    llm: { baseUrl: null, model: null },
    ocr: { enabled: false, baseUrl: null, model: null },
    documents: { autoSync: true, syncIntervalHours: 1 }
  }
}

function normalizeProviderValue(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized || null
}


