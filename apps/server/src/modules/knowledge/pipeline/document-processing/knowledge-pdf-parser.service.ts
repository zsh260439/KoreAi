import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { PDFParse } from 'pdf-parse'

import {
  parseMarkdownDocument,
  parsePdfDocument,
  type ParsedDocument,
  type ParseKnowledgeDocumentOptions,
  type StructuredBlock
} from './knowledge-document.parser'
import {
  parseMineruContentList,
  parseMineruContentListV2
} from './mineru-content-list.parser'

type PdfParserMode = 'auto' | 'native' | 'mineru'

type PdfInspection = {
  pageCount: number
  blankPageCount: number
  invalidCharacterRatio: number
  imagePageRatio: number
  tableLineRatio: number
  shortLineRatio: number
  densePageRatio: number
}

type PdfRouteDecision = {
  useMineru: boolean
  reasons: string[]
}

type MineruApiResponse<T> = {
  code: number
  msg: string
  data?: T
}

type MineruBatchResult = {
  state: string
  full_zip_url?: string
  err_msg?: string
}

const DEFAULT_MINERU_TIMEOUT_MS = 180_000
const DEFAULT_MINERU_API_BASE_URL = 'https://mineru.net/api/v4'
const MINERU_POLL_INTERVAL_MS = 2_000
const VLM_ENHANCEMENT_WIDTH = 1600

@Injectable()
export class KnowledgePdfParserService {
  constructor(private readonly configService: ConfigService) {}

  async parse(buffer: Buffer, options: ParseKnowledgeDocumentOptions): Promise<ParsedDocument> {
    const mode = this.getMode()
    if (mode === 'native') {
      return withParser(await parsePdfDocument(buffer, options), 'native', ['forced_native'])
    }

    if (mode === 'mineru') {
      try {
        return withParser(await this.parseWithMineru(buffer, options), 'mineru', ['forced_mineru'])
      } catch (error) {
        throw new UnprocessableEntityException(getMineruErrorMessage(error))
      }
    }

    const inspection = await inspectPdf(buffer)
    const decision = decidePdfParser(inspection)
    if (!decision.useMineru || !this.hasMineruProvider()) {
      const reasons = decision.useMineru ? [...decision.reasons, 'mineru_unavailable'] : decision.reasons
      return withParser(await parsePdfDocument(buffer, options), 'native', reasons)
    }

    try {
      return withParser(await this.parseWithMineru(buffer, options), 'mineru', decision.reasons)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.warn(`[KnowledgePDF] MinerU failed, using native parser: ${message}`)
      return withParser(
        await parsePdfDocument(buffer, options),
        'native',
        [...decision.reasons, 'mineru_failed']
      )
    }
  }

  private async parseWithMineru(
    buffer: Buffer,
    options: ParseKnowledgeDocumentOptions
  ): Promise<ParsedDocument> {
    const archive = this.getMineruEndpoint()
      ? await this.requestLocalMineru(buffer)
      : await this.requestMineruCloud(buffer)
    const zip = await JSZip.loadAsync(archive)
    await this.saveMineruDebugFiles(zip, buffer)
    const parsed = await this.parseMineruArchive(zip)
    const enhanced = await enhanceRiskyMineruPagesWithVlm(buffer, parsed, options)
    const native = await parsePdfDocument(buffer, { ...options, ocrImage: undefined })
    return mergeMissingNativePages(enhanced, native)
  }

  private async requestLocalMineru(buffer: Buffer): Promise<Uint8Array> {
    const endpoint = this.getMineruEndpoint()
    if (!endpoint) {
      throw new Error('MINERU_BASE_URL is not configured')
    }
    const form = new FormData()
    form.append('files', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), 'document.pdf')
    form.append('return_md', 'true')
    form.append('return_content_list', 'true')
    form.append('return_middle_json', 'true')
    form.append('return_model_output', 'true')
    form.append('response_format_zip', 'true')

    const response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.getMineruTimeoutMs())
    })

    if (!response.ok) {
      throw new Error(`MinerU returned HTTP ${response.status}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  private async requestMineruCloud(buffer: Buffer): Promise<Uint8Array> {
    const apiKey = this.configService.get<string>('MINERU_API_KEY')?.trim()
    if (!apiKey) {
      throw new Error('MINERU_API_KEY is not configured')
    }

    const baseUrl = this.getMineruApiBaseUrl()
    const dataId = createHash('sha256').update(buffer).digest('hex').slice(0, 32)
    const submission = await this.requestMineruApi<{
      batch_id: string
      file_urls: string[]
    }>(`${baseUrl}/file-urls/batch`, apiKey, {
      method: 'POST',
      body: JSON.stringify({
        files: [{ name: 'document.pdf', data_id: dataId }],
        model_version: this.getMineruModelVersion(),
        enable_formula: true,
        enable_table: true,
        language: 'ch'
      })
    })
    const uploadUrl = submission.file_urls[0]
    if (!uploadUrl) {
      throw new Error('MinerU did not return a file upload URL')
    }

    const upload = await fetchMineruResource('file upload', uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(this.getMineruTimeoutMs())
    })
    if (!upload.ok) {
      throw new Error(`MinerU file upload returned HTTP ${upload.status}`)
    }

    const deadline = Date.now() + this.getMineruTimeoutMs()
    while (Date.now() < deadline) {
      const status = await this.requestMineruApi<{
        extract_result: MineruBatchResult[]
      }>(`${baseUrl}/extract-results/batch/${submission.batch_id}`, apiKey)
      const result = status.extract_result[0]
      if (result?.state === 'done' && result.full_zip_url) {
        return downloadMineruArchive(result.full_zip_url, this.getMineruTimeoutMs())
      }
      if (result?.state === 'failed') {
        throw new Error(result.err_msg || 'MinerU extraction failed')
      }
      await wait(MINERU_POLL_INTERVAL_MS)
    }

    throw new Error('MinerU extraction timed out')
  }

  private async requestMineruApi<T>(
    url: string,
    apiKey: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await fetchMineruResource('API request', url, {
      ...init,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...init.headers
      },
      signal: AbortSignal.timeout(this.getMineruTimeoutMs())
    })
    if (!response.ok) {
      throw new Error(`MinerU API returned HTTP ${response.status}`)
    }

    const payload = await response.json() as MineruApiResponse<T>
    if (payload.code !== 0 || !payload.data) {
      throw new Error(payload.msg || `MinerU API returned code ${payload.code}`)
    }
    return payload.data
  }

  private async parseMineruArchive(zip: JSZip): Promise<ParsedDocument> {
    const entries = Object.values(zip.files).filter((entry) => !entry.dir)
    const contentListV2 = entries.find((entry) => entry.name.toLowerCase().endsWith('content_list_v2.json'))
    if (contentListV2) {
      return parseMineruContentListV2(await contentListV2.async('string'))
    }

    const contentList = entries.find((entry) => entry.name.toLowerCase().endsWith('content_list.json'))
    if (contentList) {
      return parseMineruContentList(await contentList.async('string'))
    }

    const markdownEntry = entries.find(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.md')
    )
    if (!markdownEntry) {
      throw new Error('MinerU response does not contain Markdown')
    }

    const parsed = await parseMarkdownDocument(await markdownEntry.async('string'))
    return {
      ...parsed,
      fileType: 'pdf',
      sourceKind: 'pdf-mineru'
    }
  }

  private async saveMineruDebugFiles(zip: JSZip, buffer: Buffer): Promise<void> {
    const entries = Object.values(zip.files).filter((entry) =>
      !entry.dir && /_(?:middle|model|layout)\.json$/i.test(entry.name)
    )
    if (entries.length === 0) {
      return
    }

    const root = this.configService.get<string>('MINERU_DEBUG_DIR')?.trim()
      || resolve(process.cwd(), 'storage', 'mineru-debug')
    const documentDir = resolve(root, createHash('sha256').update(buffer).digest('hex').slice(0, 16))

    try {
      await mkdir(documentDir, { recursive: true })
      await Promise.all(entries.map(async (entry) => {
        const fileName = entry.name.replace(/\\/g, '/').split('/').at(-1) ?? 'mineru-debug.json'
        await writeFile(resolve(documentDir, fileName), await entry.async('nodebuffer'))
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.warn(`[KnowledgePDF] MinerU debug files were not saved: ${message}`)
    }
  }

  private getMode(): PdfParserMode {
    const mode = this.configService.get<string>('PDF_PARSER_MODE')?.trim().toLowerCase()
    return mode === 'native' || mode === 'mineru' ? mode : 'auto'
  }

  private getMineruEndpoint(): string | null {
    const baseUrl = this.configService.get<string>('MINERU_BASE_URL')?.trim().replace(/\/+$/, '')
    if (!baseUrl) {
      return null
    }

    return baseUrl.endsWith('/file_parse') ? baseUrl : `${baseUrl}/file_parse`
  }

  private hasMineruProvider(): boolean {
    return Boolean(this.getMineruEndpoint() || this.configService.get<string>('MINERU_API_KEY')?.trim())
  }

  private getMineruApiBaseUrl(): string {
    return this.configService.get<string>('MINERU_API_BASE_URL')?.trim().replace(/\/+$/, '')
      || DEFAULT_MINERU_API_BASE_URL
  }

  private getMineruModelVersion(): 'pipeline' | 'vlm' {
    return this.configService.get<string>('MINERU_MODEL_VERSION')?.trim().toLowerCase() === 'pipeline'
      ? 'pipeline'
      : 'vlm'
  }

  private getMineruTimeoutMs(): number {
    const timeout = Number(this.configService.get<string>('MINERU_TIMEOUT_MS'))
    return Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : DEFAULT_MINERU_TIMEOUT_MS
  }
}

export function mergeMissingNativePages(
  mineru: ParsedDocument,
  native: ParsedDocument
): ParsedDocument {
  const lastMineruPage = Math.max(0, ...mineru.blocks.map((block) => block.pageNumber ?? 0))
  const missingBlocks = native.blocks.filter((block) => (block.pageNumber ?? 0) > lastMineruPage)
  if (missingBlocks.length === 0) {
    return mineru
  }

  let offset = mineru.rawContent.length + 2
  const rebasedBlocks = missingBlocks.map((block) => {
    const startOffset = offset
    offset += block.content.length + 2
    return { ...block, startOffset, endOffset: startOffset + block.content.length }
  })

  return {
    ...mineru,
    blocks: [...mineru.blocks, ...rebasedBlocks],
    rawContent: [mineru.rawContent, ...rebasedBlocks.map((block) => block.content)].join('\n\n')
  }
}

async function enhanceRiskyMineruPagesWithVlm(
  buffer: Buffer,
  parsed: ParsedDocument,
  options: ParseKnowledgeDocumentOptions
): Promise<ParsedDocument> {
  if (!options.ocrImage) {
    return parsed
  }

  const riskyPages = resolveVlmEnhancementPages(parsed.blocks)
  if (riskyPages.length === 0) {
    return parsed
  }

  const parser = new PDFParse({ data: buffer })
  const vlmBlocks: StructuredBlock[] = []
  try {
    const screenshots = await parser.getScreenshot({
      partial: riskyPages,
      desiredWidth: VLM_ENHANCEMENT_WIDTH,
      imageBuffer: true,
      imageDataUrl: false
    })

    for (const page of screenshots.pages) {
      const result = await options.ocrImage({
        buffer: Buffer.from(page.data),
        mimeType: 'image/png',
        sourceName: `pdf page ${page.pageNumber} vlm enhancement`
      })
      if (result.status !== 'success' || !result.text?.trim()) {
        continue
      }

      vlmBlocks.push({
        blockType: 'vlm_page',
        content: result.text,
        pageNumber: page.pageNumber,
        sectionPath: [`第 ${page.pageNumber} 页`, 'VLM 结构增强'],
        metadata: {
          vlm: true,
          imageSource: 'pdf_page_screenshot',
          enhancementReason: 'layout_relation_risk',
          width: page.width,
          height: page.height,
          scale: page.scale
        }
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.warn(`[KnowledgePDF] VLM page enhancement skipped: ${message}`)
    return parsed
  } finally {
    await parser.destroy()
  }

  return appendStructuredBlocks(parsed, vlmBlocks)
}

function appendStructuredBlocks(parsed: ParsedDocument, blocks: StructuredBlock[]): ParsedDocument {
  if (blocks.length === 0) {
    return parsed
  }

  const rawParts = parsed.rawContent ? [parsed.rawContent] : []
  let offset = parsed.rawContent.length
  const rebasedBlocks = blocks.map((block) => {
    const content = block.content.trim()
    const startOffset = offset + (rawParts.length > 0 ? 2 : 0)
    offset = startOffset + content.length
    rawParts.push(content)
    return {
      ...block,
      content,
      startOffset,
      endOffset: startOffset + content.length
    }
  })

  return {
    ...parsed,
    blocks: [...parsed.blocks, ...rebasedBlocks],
    rawContent: rawParts.join('\n\n').trim()
  }
}

function resolveVlmEnhancementPages(blocks: StructuredBlock[]): number[] {
  const pages = new Map<number, StructuredBlock[]>()
  for (const block of blocks) {
    if (typeof block.pageNumber !== 'number') {
      continue
    }

    pages.set(block.pageNumber, [...(pages.get(block.pageNumber) ?? []), block])
  }

  return [...pages.entries()]
    .filter(([, pageBlocks]) => shouldEnhancePdfPageWithVlm(pageBlocks))
    .map(([pageNumber]) => pageNumber)
}

export function shouldEnhancePdfPageWithVlm(blocks: StructuredBlock[]): boolean {
  const lines = blocks
    .flatMap((block) => block.content.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
  const hasVisualBlock = blocks.some((block) =>
    /^(?:image|chart|figure|layout|table)$/i.test(block.blockType) ||
    /visual|dashboard|snapshot|附件|仪表盘|截图|图表/i.test(block.content)
  )
  const hasRelationRisk = hasSeparatedFieldValueRows(lines)

  return hasRelationRisk && (hasVisualBlock || hasCompactFieldValuePage(lines))
}

function hasSeparatedFieldValueRows(lines: string[]): boolean {
  if (lines.length < 4) {
    return false
  }

  for (let index = 0; index <= lines.length - 4; index += 1) {
    const window = lines.slice(index, index + 8)
    const firstValueIndex = window.findIndex(isValueLikeLine)
    if (firstValueIndex < 2) {
      continue
    }

    const labelCount = window.slice(0, firstValueIndex).filter(isLabelLikeLine).length
    const valueCount = window.slice(firstValueIndex).filter(isValueLikeLine).length
    if (labelCount >= 2 && valueCount >= 2) {
      return true
    }
  }

  return false
}

function hasCompactFieldValuePage(lines: string[]): boolean {
  const compactLines = lines.filter((line) => line.length <= 36)
  if (compactLines.length < 5) {
    return false
  }

  return compactLines.filter(isLabelLikeLine).length >= 2 &&
    compactLines.filter(isValueLikeLine).length >= 2
}

function isLabelLikeLine(line: string): boolean {
  const normalized = line.trim()
  if (!normalized || normalized.length > 32 || isValueLikeLine(normalized)) {
    return false
  }

  if (/[。！？??]/.test(normalized)) {
    return false
  }

  return /[\p{Script=Han}A-Za-z]/u.test(normalized)
}

function isValueLikeLine(line: string): boolean {
  const normalized = line.trim()
  if (!normalized || normalized.length > 40) {
    return false
  }

  return (
    /^\d+(?:\.\d+)?\s*%$/.test(normalized) ||
    /^\d+(?:\.\d+)?\s*(?:hours?|小时|分钟|天|days?)$/i.test(normalized) ||
    /^[A-Z]{2,}(?:-[A-Z0-9]+){1,}\d*$/i.test(normalized) ||
    /^[a-z]+(?:_[a-z0-9]+)+$/i.test(normalized) ||
    /^(?:[<>]=?|≥|≤)\s*\d/.test(normalized) ||
    /^\d+(?:\.\d+)?$/.test(normalized)
  )
}

async function inspectPdf(buffer: Buffer): Promise<PdfInspection> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText({ cellSeparator: '\t' })
    const pages = result.pages.map((page) => String(page.text || '').trim())
    const sampledPages = pickInspectionPages(pages.length)
    const images = sampledPages.length > 0
      ? await parser.getImage({
          partial: sampledPages,
          imageThreshold: 240,
          imageBuffer: false,
          imageDataUrl: false
        })
      : null
    const lines = pages.flatMap((page) => page.split('\n').map((line) => line.trim()).filter(Boolean))
    const characters = pages.join('').replace(/\s/g, '')
    const tableLines = lines.filter((line) => line.split('\t').filter(Boolean).length >= 3).length
    const shortLines = lines.filter((line) => line.replace(/\s/g, '').length <= 4).length
    const densePages = pages.filter((page) => page.split('\n').filter(Boolean).length >= 70).length
    const invalidCharacters = [...characters].filter(
      (character) => character === '\uFFFD' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(character)
    ).length

    return {
      pageCount: pages.length,
      blankPageCount: pages.filter((page) => page.replace(/\s/g, '').length === 0).length,
      invalidCharacterRatio: ratio(invalidCharacters, characters.length),
      imagePageRatio: ratio(
        images?.pages.filter((page) => page.images.length > 0).length ?? 0,
        sampledPages.length
      ),
      tableLineRatio: ratio(tableLines, lines.length),
      shortLineRatio: ratio(shortLines, lines.length),
      densePageRatio: ratio(densePages, pages.length)
    }
  } finally {
    await parser.destroy()
  }
}

export function decidePdfParser(inspection: PdfInspection): PdfRouteDecision {
  const reasons: string[] = []

  if (inspection.pageCount === 0 || inspection.blankPageCount > 0 || inspection.invalidCharacterRatio >= 0.005) {
    if (inspection.pageCount === 0) reasons.push('no_pages')
    if (inspection.blankPageCount > 0) reasons.push('blank_pages')
    if (inspection.invalidCharacterRatio >= 0.005) reasons.push('invalid_characters')
  }

  if (inspection.tableLineRatio >= 0.12) reasons.push('table_layout')
  if (inspection.imagePageRatio >= 0.25) reasons.push('embedded_images')
  if (inspection.shortLineRatio >= 0.35) reasons.push('fragmented_lines')
  if (inspection.densePageRatio >= 0.2) reasons.push('dense_layout')

  // 鍘熺敓鎻愬彇鍙湁鍦ㄦ病鏈夌増闈㈤闄╀俊鍙锋椂鎵嶅彲淇★紝鏃犳硶纭鐨勬枃妗ｄ氦缁欑増闈㈣В鏋愬櫒銆?
  return {
    useMineru: reasons.length > 0,
    reasons: reasons.length > 0 ? reasons : ['clean_selectable_text']
  }
}

function ratio(value: number, total: number): number {
  return total > 0 ? value / total : 0
}

function pickInspectionPages(pageCount: number): number[] {
  if (pageCount <= 8) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }

  return [...new Set([1, 2, 3, Math.ceil(pageCount / 2), pageCount - 2, pageCount - 1, pageCount])]
}

function withParser(
  document: ParsedDocument,
  engine: NonNullable<ParsedDocument['parser']>['engine'],
  reasons: string[]
): ParsedDocument {
  return { ...document, parser: { engine, reasons } }
}

function getMineruErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'unknown error'
  return `MinerU PDF 解析失败：${detail}`
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

async function downloadMineruArchive(url: string, timeoutMs: number): Promise<Uint8Array> {
  const response = await fetchMineruResource('archive download', url, {
    headers: { 'Accept': 'application/zip' },
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!response.ok) {
    throw new Error(`MinerU archive download returned HTTP ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

async function fetchMineruResource(
  stage: string,
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    const cause = error instanceof Error && error.cause && typeof error.cause === 'object'
      ? (error.cause as { code?: string }).code
      : undefined
    throw new Error(`MinerU ${stage} failed: ${detail}${cause ? ` (${cause})` : ''}`)
  }
}


