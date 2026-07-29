import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { KnowledgeConfigService } from '../../runtime/config/knowledge-config.service'

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

type KnowledgeProviderSettings = Awaited<ReturnType<KnowledgeConfigService['findProviderSettings']>>

const DEFAULT_OCR_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OCR_IMAGES_PER_DOCUMENT = 20

@Injectable()
export class KnowledgeOcrService {
  constructor(
    private readonly configService: ConfigService,
    private readonly knowledgeConfigService: KnowledgeConfigService
  ) {}

  createParserOptions(): ParseKnowledgeDocumentOptions {
    let remainingImages = this.getMaxImagesPerDocument()
    const providerSettings = this.knowledgeConfigService.findProviderSettings()

    return {
      ocrImage: async (image) => {
        if (remainingImages <= 0) {
          return { status: 'limit_reached' }
        }

        remainingImages -= 1
        return this.recognizeImage(image, await providerSettings)
      }
    }
  }

  private async recognizeImage(
    image: DocumentOcrImageInput,
    providerSettings: KnowledgeProviderSettings
  ): Promise<DocumentOcrResult> {
    const { enabled, baseUrl, model } = providerSettings.runtimeConfig.ocr
    const apiKey = this.configService.get<string>('OCR_API_KEY')
    const endpoint = normalizeChatCompletionEndpoint(baseUrl)

    if (!enabled || !endpoint || !apiKey || !model) {
      const missingKeys = [
        !enabled && 'OCR_ENABLED',
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
      const primaryText = await this.requestOcrText(endpoint, apiKey, model, image)
      const secondaryText = shouldRetryStructuredOcr(primaryText)
        ? await this.requestOcrText(
            endpoint,
            apiKey,
            model,
            image,
            [
              '请从上到下、从左到右逐字抄录整张图片，包括卡片、图表标题、流程框和底部说明框。',
              '如果图片中有 ACTION CODE、处置代码、code、编号等字段，必须把字段名和旁边或下方的大写连字符值单独输出。',
              '不要把百分比或 hours/minutes 这类时间窗口误当成代码。'
            ].join('\n')
          )
        : null

      const text = mergeOcrText(primaryText, secondaryText)
      return text
        ? { status: 'success', text }
        : { status: 'empty', message: 'OCR 鏈瘑鍒埌鏂囧瓧' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.warn(`[KnowledgeOCR] request failed: ${message}`)
      return {
        status: 'failed',
        message: 'OCR 服务调用失败或超时'
      }
    }
  }

  private async requestOcrText(
    endpoint: string,
    apiKey: string,
    model: string,
    image: DocumentOcrImageInput,
    extraInstruction?: string
  ): Promise<string | null> {
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
              '保持原有换行、编号、表格字段和值；图片中有表格、卡片或多列布局时，按 Markdown 表格输出字段和值。',
              '英文大写编号、连字符代码、百分比、日期、金额、时间窗口是高优先级机器值，必须逐字保留，不要把相邻列的值串列。',
              '不要解释、不要总结、不要补全不可见内容。',
              extraInstruction
            ].filter(Boolean).join('\n')
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
                  url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
                  detail: 'high'
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
      throw new Error(`OCR service returned HTTP ${response.status}`)
    }

    const payload = (await response.json()) as ChatCompletionResponse
    return normalizeOcrText(payload.choices?.[0]?.message?.content)
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

function normalizeChatCompletionEndpoint(value?: string | null): string | null {
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

  if (!text || /^(没有|无法|未识别|no text|unable)/i.test(text)) {
    return null
  }

  return text
}

function mergeOcrText(primary: string | null, secondary: string | null): string | null {
  if (!primary) {
    return secondary
  }

  if (!secondary || primary.includes(secondary)) {
    return primary
  }

  if (secondary.includes(primary)) {
    return secondary
  }

  return `${primary}\n\n${secondary}`
}

function shouldRetryStructuredOcr(text: string | null): boolean {
  if (!text) {
    return false
  }

  const normalized = text.toLowerCase()
  const mentionsStructuredCode = normalized.includes('action code') || text.includes('处置代码')
  const hasMachineCode = /\b[A-Z]{2,}(?:-[A-Z0-9]{2,})+\b/.test(text)

  return mentionsStructuredCode && !hasMachineCode
}


