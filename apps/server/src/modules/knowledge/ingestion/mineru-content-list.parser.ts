import type { ParsedDocument, StructuredBlock } from './knowledge-document.parser'

type MineruItem = {
  type?: unknown
  sub_type?: unknown
  content?: unknown
  bbox?: unknown
  anchor?: unknown
  page_idx?: unknown
  text?: unknown
  text_level?: unknown
  [key: string]: unknown
}

type MineruBlockSource = 'content_list_v2' | 'content_list'

const AUXILIARY_TYPES = new Set([
  'header',
  'footer',
  'page_header',
  'page_footer',
  'page_number',
  'aside_text',
  'page_aside_text',
  'page_footnote'
])

export function parseMineruContentListV2(content: string): ParsedDocument {
  const pages = parseJson(content)
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
    throw new Error('MinerU content_list_v2.json has an invalid structure')
  }

  const items = pages.flatMap((page, pageIndex) =>
    page.map((item) => ({ item: asItem(item), pageNumber: pageIndex + 1 }))
  )
  return buildDocument(items, 'content_list_v2')
}

export function parseMineruContentList(content: string): ParsedDocument {
  const list = parseJson(content)
  if (!Array.isArray(list)) {
    throw new Error('MinerU content_list.json has an invalid structure')
  }

  const items = list.map((item) => {
    const value = asItem(item)
    const pageIndex = typeof value.page_idx === 'number' ? value.page_idx : 0
    return { item: value, pageNumber: pageIndex + 1 }
  })
  return buildDocument(items, 'content_list')
}

function buildDocument(
  items: Array<{ item: MineruItem; pageNumber: number }>,
  source: MineruBlockSource
): ParsedDocument {
  const blocks: StructuredBlock[] = []
  const rawParts: string[] = []
  const headingStack: string[] = []
  let rawOffset = 0

  for (const { item, pageNumber } of items) {
    const type = typeof item.type === 'string' ? item.type : ''
    if (!type || AUXILIARY_TYPES.has(type)) {
      continue
    }

    const content = source === 'content_list_v2'
      ? getV2Content(type, item.content)
      : getLegacyContent(type, item)
    if (!content) {
      continue
    }

    const level = getHeadingLevel(type, source === 'content_list_v2' ? item.content : item)
    if (level) {
      headingStack.splice(level - 1)
      headingStack[level - 1] = content
    }

    const startOffset = rawOffset + (rawParts.length > 0 ? 2 : 0)
    const endOffset = startOffset + content.length
    blocks.push({
      blockType: level ? 'heading' : mapBlockType(type),
      content,
      title: level ? content : undefined,
      pageNumber,
      level,
      sectionPath: headingStack.filter(Boolean),
      startOffset,
      endOffset,
      metadata: {
        mineruType: type,
        source,
        indexable: !isImagePlaceholder(type, content),
        bbox: getBbox(item.bbox),
        coordinateSpace: '0-1000',
        subType: typeof item.sub_type === 'string' ? item.sub_type : undefined,
        anchor: typeof item.anchor === 'string' ? item.anchor : undefined
      }
    })
    rawParts.push(content)
    rawOffset = endOffset
  }

  if (blocks.length === 0) {
    throw new Error(`MinerU ${source}.json does not contain indexable blocks`)
  }

  return {
    fileType: 'pdf',
    sourceKind: 'pdf-mineru',
    blocks,
    rawContent: rawParts.join('\n\n')
  }
}

function isImagePlaceholder(type: string, content: string): boolean {
  if (type !== 'image') {
    return false
  }

  const remainder = content
    .replace(/(?:图|figure)\s*\d+/gi, ' ')
    .replace(/(?:QQ_)?\d{10,}/gi, ' ')
    .replace(/\b[\w-]+\.(?:png|jpe?g|webp|gif|bmp)\b/gi, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, '')

  return remainder.length === 0
}

function getV2Content(type: string, content: unknown): string {
  const payload = asRecord(content)
  const fields: Record<string, string[]> = {
    title: ['title_content'],
    paragraph: ['paragraph_content'],
    equation_interline: ['math_content'],
    table: ['table_caption', 'table_body', 'table_footnote', 'table_content'],
    image: ['image_caption', 'image_content', 'image_footnote'],
    chart: ['chart_caption', 'chart_content', 'chart_footnote', 'content'],
    code: ['code_caption', 'code_content', 'code_footnote'],
    algorithm: ['algorithm_caption', 'algorithm_content', 'algorithm_footnote'],
    list: ['list_items'],
    index: ['list_items']
  }

  return joinText(fields[type]?.map((field) => payload[field]) ?? [content])
}

function getLegacyContent(type: string, item: MineruItem): string {
  const fields: Record<string, string[]> = {
    text: ['text'],
    equation: ['text'],
    table: ['table_caption', 'table_body', 'table_footnote'],
    image: ['image_caption', 'image_footnote'],
    chart: ['chart_caption', 'content', 'chart_footnote'],
    code: ['code_caption', 'code_body', 'code_footnote'],
    list: ['list_items']
  }

  return joinText(fields[type]?.map((field) => item[field]) ?? [item.text, item.content])
}

function getHeadingLevel(type: string, value: unknown): number | undefined {
  const payload = asRecord(value)
  const level = type === 'title' ? payload.level : type === 'text' ? payload.text_level : undefined
  return typeof level === 'number' && level > 0 ? Math.floor(level) : undefined
}

function mapBlockType(type: string): string {
  const aliases: Record<string, string> = {
    text: 'paragraph',
    equation_interline: 'equation'
  }
  return aliases[type] ?? type
}

function joinText(values: unknown[]): string {
  return values
    .map(extractText)
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join('\n')
  }

  const record = asRecord(value)
  if (Object.keys(record).length === 0) {
    return ''
  }
  if ('content' in record) {
    return extractText(record.content)
  }
  if ('children' in record) {
    return extractText(record.children)
  }
  return Object.entries(record)
    .filter(([key]) => /(?:content|caption|footnote|items|body|text|math)$/i.test(key))
    .map(([, item]) => extractText(item))
    .filter(Boolean)
    .join('\n')
}

function getBbox(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number')
    ? value
    : undefined
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    throw new Error('MinerU returned invalid JSON')
  }
}

function asItem(value: unknown): MineruItem {
  return asRecord(value) as MineruItem
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
