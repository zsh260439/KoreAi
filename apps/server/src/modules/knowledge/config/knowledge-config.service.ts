import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  KnowledgeBaseRuntimeConfig,
  KnowledgeBaseRuntimeConfigPatch,
  KnowledgeGlobalRuntimeSettings
} from 'share-type'
import { KnowledgeBaseEntity } from '../entity/knowledge-base.entity'
import { KnowledgeRuntimeSettingsEntity } from '../entity/knowledge-runtime-settings.entity'
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
    private readonly settingsRepo: Repository<KnowledgeRuntimeSettingsEntity>
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

  private findGlobalSettings(): Promise<KnowledgeRuntimeSettingsEntity | null> {
    return this.settingsRepo.findOne({ where: { scope: GLOBAL_RUNTIME_SCOPE } })
  }
}
