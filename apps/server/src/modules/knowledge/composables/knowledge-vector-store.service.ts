import { PGVectorStore } from '@langchain/pgvector'
import { Injectable,OnModuleDestroy } from '@nestjs/common'
import { Document } from '@langchain/core/documents'
import { EmbeddingService } from './embedding.service'

@Injectable()
export class KnowledgeVectorStoreService implements OnModuleDestroy {

   private storePromise: Promise<PGVectorStore> | null = null

   constructor(private readonly embeddingService: EmbeddingService) {}
   
   //带语义的检索
   async similaritySearchWithScore(
     query:string,
     limit:number,
     knowledgeBaseId:string
   ) :Promise<[Document,number][]>{
     const store = await this.getStore()
     return store.similaritySearchWithScore(query, limit, { knowledgeBaseId })
   }

    async onModuleDestroy():Promise<void>{
      if(!this.storePromise){
        return
      }
      const store = await this.storePromise
      await store.end()
   }

   private getStore():Promise<PGVectorStore>{
      if(!this.storePromise) {
         this.storePromise = PGVectorStore.initialize(
           //传入自己的客户端 保证向量规则一致
          this.embeddingService.getClient(),
          {
             //数据库的连接信息
             postgresConnectionOptions:{connectionString:process.env.DATABASE_URL},
             //chunk的表名
             tableName:'knowledge_chunks',
             columns:{
              //chunk的id列名
               idColumnName:'id',
               //chunk的向量列名
               vectorColumnName:'embedding',
               //文本内容字段
               contentColumnName:'content',
               //元数据字段
               metadataColumnName:'metadata'
             },
             //距离计算策略
             distanceStrategy:'cosine',
             //分数归一化
             scoreNormalization:'similarity'
          }
        )
      }
      return this.storePromise
   }
}