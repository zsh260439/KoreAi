import 'reflect-metadata'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { DataSource } from 'typeorm'
import { KnowledgeBaseEntity } from '../modules/knowledge/entity/knowledge-base.entity'
import { KnowledgeDocumentEntity } from '../modules/knowledge/entity/knowledge-document.entity'
import { KnowledgeChunkEntity } from '../modules/knowledge/entity/knowledge-chunk.entity'
import { KnowledgeRuntimeSettingsEntity } from '../modules/knowledge/entity/knowledge-runtime-settings.entity'
import { KnowledgeDocumentRevisionEntity } from '../modules/knowledge/entity/knowledge-document-revision.entity'
import { WorkspaceConversationEntity } from '../modules/workspace/entity/workspace-conversation.entity'
import { WorkspaceMessageEntity } from '../modules/workspace/entity/workspace-message.entity'

for (const envFileName of ['.env.local', '.env']) {
  const envFilePath = resolve(process.cwd(), envFileName)
  if (existsSync(envFilePath)) {
    loadEnv({ path: envFilePath, override: false, quiet: true })
  }
}

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for TypeORM migrations')
}

const appDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  uuidExtension: 'pgcrypto',
  synchronize: false,
  entities: [
    KnowledgeBaseEntity,
    KnowledgeDocumentEntity,
    KnowledgeChunkEntity,
    KnowledgeDocumentRevisionEntity,
    KnowledgeRuntimeSettingsEntity,
    WorkspaceConversationEntity,
    WorkspaceMessageEntity
  ],
  migrations: ['dist/database/migrations/*.js']
})

export default appDataSource
