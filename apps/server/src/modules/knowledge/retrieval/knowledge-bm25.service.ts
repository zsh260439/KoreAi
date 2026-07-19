import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'
const BM25_INDEX_NAME = 'knowledge_chunks_bm25_idx'

const BM25_SEARCH_SQL = `
  SELECT
    chunk.id AS "chunkId",
    chunk."documentId" AS "documentId",
    chunk."documentName" AS "documentName",
    chunk.sequence AS "sequence",
    chunk."sectionPath" AS "sectionPath",
    chunk."primaryTitle" AS "primaryTitle",
    chunk.content AS "content",
    COALESCE(pdb.score(chunk.id), 0)::float8 AS "bm25Score"
  FROM "knowledge_chunks" AS chunk
  INNER JOIN "knowledge_document" AS document ON document.id = chunk."documentId"
  WHERE chunk.id @@@ pdb.parse($1, lenient => true)
    AND document.status = 'indexed'
    AND ($2::uuid IS NULL OR chunk."knowledgeBaseId" = $2::uuid)
  ORDER BY "bm25Score" DESC, chunk."updatedAt" DESC, chunk.id
  LIMIT $3
`
type KnowledgeBm25Row = {
  chunkId: string
  documentId: string
  documentName: string
  sequence: number | string | null
  sectionPath: string | null
  primaryTitle: string | null
  content: string
  bm25Score: number | string
}
@Injectable()
export class KnowledgeBm25Service implements OnModuleInit {

 private readonly logger = new Logger(KnowledgeBm25Service.name)
  constructor(private readonly dataSource: DataSource) {}

   async onModuleInit(): Promise<void> {
       await this.assertInfrastructureReady()
  }

   async search(query:string,knowledgeaBaseId:string|undefined,limit:number):Promise<KnowledgeRetrievalCandidate[]>{
       const normalizedQuery = normalizeBm25Query(query)
       if(!normalizedQuery){
        return []
       }
       try {
         const rows = (await this.dataSource.query(BM25_SEARCH_SQL,[
             normalizedQuery,
             knowledgeaBaseId??null,
             limit
         ])) as KnowledgeBm25Row[]
         
         return rows.map((row,index)=>({
            chunkId:row.chunkId,
            documentId:row.documentId,
            documentName:row.documentName,
            sequence: row.sequence === null ? null : Number(row.sequence),
            sectionPath: row.sectionPath,
            primaryTitle: row.primaryTitle,
            content:row.content,
            bm25Score: Number(row.bm25Score),
            vectorScore: null,
            bm25Rank: index + 1,
            vectorRank: null,
            matchedBy: ['bm25'],
         }))
       } catch (error) {
        this.logger.error('Error searching with BM25', error)
        throw new InternalServerErrorException('Error searching with BM25')
       }
   }

  private async assertInfrastructureReady():Promise<void> {
     const extensions = (await this.dataSource.query(`
        SELECT extname
        FROM pg_extension
        WHERE extname = 'pg_search'
        LIMIT 1
        `)) as Array<{extname: string}>
     if(!extensions.length){
      throw new InternalServerErrorException('pg_search extension is not installed')
     }

     const indexes = (await this.dataSource.query(
         `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'knowledge_chunks'
        AND indexname = $1
      LIMIT 1
      `,
      [BM25_INDEX_NAME]
     )) as Array<{indexname: string}>

     if(!indexes.length){
         throw new InternalServerErrorException(`${BM25_INDEX_NAME} is not installed`)
     }
      this.logger.log('BM25 search infrastructure is ready')
  }
}

function normalizeBm25Query(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
