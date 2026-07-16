import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type {
  DocumentOcrImageInput,
  DocumentOcrResult,
  ParseKnowledgeDocumentOptions
} from './knowledge-document.parser'

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
}

const DEFAULT_OCR_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OCR_IMAGES_PER_DOCUMENT = 20

@Injectable()
export class KnowledgeOcrService {
  constructor(private readonly configService: ConfigService) {}

  createParserOptions(): ParseKnowledgeDocumentOptions {
    let remainingImages = this.getMaxImagesPerDocument()

    return {
      ocrImage: async (image) => {
        if (remainingImages <= 0) {
          return { status: 'limit_reached' }
        }

        remainingImages -= 1
        return this.recognizeImage(image)
      }
    }
  }

  private async recognizeImage(image: DocumentOcrImageInput): Promise<DocumentOcrResult> {
    const baseUrl = this.configService.get<string>('OCR_BASE_URL')
    const apiKey = this.configService.get<string>('OCR_API_KEY')
    const model = this.configService.get<string>('OCR_MODEL')
    const endpoint = normalizeChatCompletionEndpoint(baseUrl)

    if (!endpoint || !apiKey || !model) {
      const missingKeys = [
        !endpoint && 'OCR_BASE_URL',
        !apiKey && 'OCR_API_KEY',
        !model && 'OCR_MODEL'
      ].filter(Boolean).join('、')

      return {
        status: 'not_configured',
        message: `OCR 配置未生效：${missingKeys}`
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: [
                '你是知识库入库阶段的 OCR 引擎。',
                '只输出图片中真实可见的文字。',
                '保持原有换行、编号、表格字段和值。',
                '不要解释、不要总结、不要补全不可见内容。'
              ].join('\n')
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `识别这张图片中的文字，来源：${image.sourceName}`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`
                  }
                }
              ]
            }
          ]
        }),
        signal: AbortSignal.timeout(this.getTimeoutMs())
      })

      if (!response.ok) {
        console.warn(`[KnowledgeOCR] HTTP ${response.status}`)
        return {
          status: 'failed',
          message: `OCR 服务返回 HTTP ${response.status}`
        }
      }

      const payload = await response.json() as ChatCompletionResponse
      const text = normalizeOcrText(payload.choices?.[0]?.message?.content)
      return text
        ? { status: 'success', text }
        : { status: 'empty', message: 'OCR 未识别到文字' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.warn(`[KnowledgeOCR] request failed: ${message}`)
      return {
        status: 'failed',
        message: 'OCR 服务调用失败或超时'
      }
    }
  }

  private getMaxImagesPerDocument(): number {
    const value = Number(this.configService.get<string>('OCR_MAX_IMAGES_PER_DOCUMENT'))
    if (!Number.isFinite(value) || value <= 0) {
      return DEFAULT_MAX_OCR_IMAGES_PER_DOCUMENT
    }

    return Math.floor(value)
  }

  private getTimeoutMs(): number {
    const value = Number(this.configService.get<string>('OCR_TIMEOUT_MS'))
    if (!Number.isFinite(value) || value <= 0) {
      return DEFAULT_OCR_TIMEOUT_MS
    }

    return Math.floor(value)
  }
}

function normalizeChatCompletionEndpoint(value?: string): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return null
  }

  if (trimmed.endsWith('/chat/completions')) {
    return trimmed
  }

  return `${trimmed}/chat/completions`
}

function normalizeOcrText(content: unknown): string | null {
  if (typeof content !== 'string') {
    return null
  }

  const text = content
    .replace(/^```(?:text|txt|markdown)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  if (!text || /^(无|没有|无法|未识别)/.test(text)) {
    return null
  }

  return text
}
