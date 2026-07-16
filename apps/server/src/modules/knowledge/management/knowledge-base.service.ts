import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  KnowledgeBase,
  KnowledgeBaseStatus,
  UpdateKnowledgeBaseInput
} from 'share-type'
import { DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG } from 'share-type'
import { CreateKnowledgeBaseDto } from '../dto/create-knowledge-base.dto'
import { KnowledgeBaseEntity } from '../entity/knowledge-base.entity'
import { KnowledgeDocumentEntity } from '../entity/knowledge-document.entity'
import {
  mergeKnowledgeBaseRuntimeConfig,
  normalizeKnowledgeBaseRuntimeConfig
} from '../config/knowledge-runtime-config'

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeDocumentEntity)
    private readonly documentRepo: Repository<KnowledgeDocumentEntity>
  ) {}

  async findKnowledgeBases(): Promise<KnowledgeBase[]> {
    const [items, counts] = await Promise.all([
      this.knowledgeBaseRepo.find({ order: { updatedAt: 'DESC' } }),
      this.documentRepo
        .createQueryBuilder('document')
        .select('document.knowledgeBaseId', 'knowledgeBaseId')
        .addSelect('COUNT(*)', 'count')
        .groupBy('document.knowledgeBaseId')
        .getRawMany<{ knowledgeBaseId: string; count: string }>()
    ])
    const countByKnowledgeBase = new Map(
      counts.map(({ knowledgeBaseId, count }) => [knowledgeBaseId, Number(count)])
    )

    return items.map((item) => toKnowledgeBase(item, countByKnowledgeBase.get(item.id) ?? 0))
  }

  async createKnowledgeBase(dto: CreateKnowledgeBaseDto): Promise<KnowledgeBase> {
    const name = requireName(dto.name, 'Knowledge base name cannot be empty')
    const created = await this.knowledgeBaseRepo.save(
      this.knowledgeBaseRepo.create({
        name,
        description: dto.description?.trim() || null,
        runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG
      })
    )

    return toKnowledgeBase(created, 0)
  }

  async updateKnowledgeBase(
    knowledgeBaseId: string,
    dto: UpdateKnowledgeBaseInput
  ): Promise<KnowledgeBase> {
    const knowledgeBase = await this.findEntity(knowledgeBaseId)

    if (dto.name !== undefined) {
      knowledgeBase.name = requireName(dto.name, 'Knowledge base name cannot be empty')
    }
    if (dto.description !== undefined) {
      knowledgeBase.description = dto.description.trim() || null
    }
    if (dto.runtimeConfig) {
      knowledgeBase.runtimeConfig = mergeKnowledgeBaseRuntimeConfig(
        knowledgeBase.runtimeConfig,
        dto.runtimeConfig
      )
    }

    return toKnowledgeBase(await this.knowledgeBaseRepo.save(knowledgeBase))
  }

  async deleteKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeBase> {
    const knowledgeBase = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId },
      relations: { documents: true }
    })
    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found')
    }

    await this.knowledgeBaseRepo.delete({ id: knowledgeBaseId })
    return toKnowledgeBase(knowledgeBase)
  }

  private async findEntity(knowledgeBaseId: string): Promise<KnowledgeBaseEntity> {
    const knowledgeBase = await this.knowledgeBaseRepo.findOne({ where: { id: knowledgeBaseId } })
    if (!knowledgeBase) {
      throw new NotFoundException('Knowledge base not found')
    }
    return knowledgeBase
  }
}

function requireName(value: string, message: string): string {
  const name = value.trim()
  if (!name) {
    throw new BadRequestException(message)
  }
  return name
}

export function toKnowledgeBase(
  entity: KnowledgeBaseEntity,
  documentCount = entity.documents?.length ?? 0
): KnowledgeBase {
  const status: KnowledgeBaseStatus = entity.status === 'active' ? 'active' : 'draft'
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description ?? '',
    status,
    documentCount,
    runtimeConfig: normalizeKnowledgeBaseRuntimeConfig(entity.runtimeConfig),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}
