import { OpenAIEmbeddings } from '@langchain/openai'
import { Injectable } from '@nestjs/common'

@Injectable()
export class EmbeddingService {
  private readonly client: OpenAIEmbeddings

  constructor() {
    this.client = new OpenAIEmbeddings({
      apiKey: process.env.EMBEDDING_API_KEY,
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      configuration: {
        baseURL: normalizeEmbeddingBaseUrl(process.env.EMBEDDING_BASE_URL)
      }
    })
  }

  getClient(): OpenAIEmbeddings {
    return this.client
  }

  async embedQuery(text: string): Promise<number[]> {
    const value = text.trim()
    if (!value) return []

    return this.client.embedQuery(value)
  }

  async embedChunks(texts: string[]): Promise<number[][]> {
    const values = texts.map((item) => item.trim()).filter(Boolean)
    if (!values.length) return []

    return this.client.embedDocuments(values)
  }
}

function normalizeEmbeddingBaseUrl(value?: string): string | undefined {
  if (!value) return undefined

  return value.replace(/\/embeddings\/?$/, '')
}
