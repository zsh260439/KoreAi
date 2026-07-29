import { readFile } from 'node:fs/promises'
import { extname, posix as pathPosix } from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { PDFParse } from 'pdf-parse'
import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'

export interface StructuredBlock {
  blockType: string
  content: string
  title?: string
  pageNumber?: number
  level?: number
  sectionPath: string[]
  startOffset?: number
  endOffset?: number
  metadata?: Record<string, unknown>
}

export interface ParsedDocument {
  fileType: string
  sourceKind: 'text' | 'pdf-copyable' | 'pdf-complex' | 'pdf-visual' | 'pdf-ocr' | 'pdf-mineru'
  blocks: StructuredBlock[]
  rawContent: string
  ocr?: DocumentOcrSummary
  parser?: {
    engine: 'native' | 'mineru'
    reasons: string[]
  }
}

export type DocumentOcrImageInput = {
  buffer: Buffer
  mimeType: string
  sourceName: string
}

export type DocumentOcrResult = {
  status: 'success' | 'not_configured' | 'failed' | 'empty' | 'limit_reached'
  text?: string
  message?: string
}

export type DocumentOcrSummary = {
  status: DocumentOcrResult['status']
  attemptedPages: number
  recognizedPages: number
  message?: string
}

export type ParseKnowledgeDocumentOptions = {
  ocrImage?: (image: DocumentOcrImageInput) => Promise<DocumentOcrResult>
  parsePdf?: (buffer: Buffer) => Promise<ParsedDocument>
}

type DocxStyleDefinition = {
  styleId: string
  name: string
  basedOnId?: string
  headingLevel?: number
}

type DocxNumberLevelDefinition = {
  level: number
  format: string
  text: string
  start: number
}

type DocxNumberingDefinition = {
  abstractLevels: Map<string, Map<number, DocxNumberLevelDefinition>>
  numToAbstract: Map<string, string>
}

type DocxListState = Map<string, number[]>

type DocxParseContext = {
  blocks: StructuredBlock[]
  rawParts: string[]
  rawOffset: number
  headingStack: string[]
  styles: Map<string, DocxStyleDefinition>
  numbering: DocxNumberingDefinition
  numberingState: DocxListState
  processedImagePaths: Set<string>
}

type DocxListInfo = {
  numId: string
  ilvl: number
  marker: string
  listType: 'ordered' | 'bullet'
}

export async function parseKnowledgeDocument(
  storagePath: string,
  options: ParseKnowledgeDocumentOptions = {}
): Promise<ParsedDocument> {
  const fileType = extname(storagePath).toLowerCase().slice(1) || 'txt'
  const buffer = await readFile(storagePath)

  if (fileType === 'md') {
    return parseMarkdownDocument(buffer.toString('utf-8'))
  }

  if (fileType === 'txt') {
    return parseTextDocument(buffer.toString('utf-8'))
  }

  if (fileType === 'docx') {
    return parseDocxDocument(buffer, options)
  }

  if (fileType === 'pdf') {
    return options.parsePdf?.(buffer) ?? parsePdfDocument(buffer, options)
  }

  return parseTextDocument(buffer.toString('utf-8'))
}

export async function parseMarkdownDocument(content: string): Promise<ParsedDocument> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content) as unknown as {
    children?: Array<Record<string, unknown>>
  }
  const blocks: StructuredBlock[] = []
  const headingStack: string[] = []
  const rawParts: string[] = []
  let rawOffset = 0

  for (const node of tree.children ?? []) {
    if (node.type === 'heading') {
      const text = collectMarkdownText(node).trim()
      if (!text) {
        continue
      }

      const depth = Number(node.depth || 1)
      headingStack.splice(Math.max(depth - 1, 0))
      headingStack[depth - 1] = text
      rawOffset = pushStructuredBlock(
        blocks,
        rawParts,
        rawOffset,
        {
          blockType: 'heading',
          content: text,
          title: text,
          level: depth,
          sectionPath: headingStack.filter(Boolean)
        }
      )
      continue
    }

    if (node.type === 'code') {
      const text = String(node.value || '').trim()
      if (!text) {
        continue
      }

      rawOffset = pushStructuredBlock(
        blocks,
        rawParts,
        rawOffset,
        {
          blockType: 'code',
          content: text,
          sectionPath: headingStack.filter(Boolean)
        }
      )
      continue
    }

    const text = collectMarkdownText(node).trim()
    if (!text) {
      continue
    }

    rawOffset = pushStructuredBlock(
      blocks,
      rawParts,
      rawOffset,
      {
        blockType: String(node.type || 'paragraph'),
        content: text,
        sectionPath: headingStack.filter(Boolean)
      }
    )
  }

  return {
    fileType: 'md',
    sourceKind: 'text',
    rawContent: rawParts.join('\n\n').trim(),
    blocks
  }
}

async function parseTextDocument(content: string): Promise<ParsedDocument> {
  const blocks: StructuredBlock[] = []
  const rawParts: string[] = []
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)

  let currentSectionPath: string[] = []
  let rawOffset = 0

  for (const paragraph of paragraphs) {
    const title = resolvePlainTextTitle(paragraph)

    if (title) {
      currentSectionPath = [title]
      rawOffset = pushStructuredBlock(
        blocks,
        rawParts,
        rawOffset,
        {
          blockType: 'heading',
          content: title,
          title,
          level: 1,
          sectionPath: currentSectionPath
        }
      )

      const body = paragraph.slice(title.length).replace(/^[:：\-\s]+/, '').trim()
      if (body) {
        rawOffset = pushStructuredBlock(
          blocks,
          rawParts,
          rawOffset,
          {
            blockType: 'paragraph',
            content: body,
            sectionPath: currentSectionPath
          }
        )
      }
      continue
    }

    rawOffset = pushStructuredBlock(
      blocks,
      rawParts,
      rawOffset,
      {
        blockType: 'paragraph',
        content: paragraph,
        sectionPath: currentSectionPath
      }
    )
  }

  return {
    fileType: 'txt',
    sourceKind: 'text',
    rawContent: rawParts.join('\n\n').trim(),
    blocks
  }
}

async function parseDocxDocument(buffer: Buffer, options: ParseKnowledgeDocumentOptions): Promise<ParsedDocument> {
  // 直接读取 OOXML，正文结构与嵌入图片才能进入同一条入库链路。
  const zip = await JSZip.loadAsync(buffer)
  const documentXml = await loadDocxXml(zip, 'word/document.xml')

  if (!documentXml?.documentElement) {
    throw new Error('DOCX 缂哄皯 word/document.xml')
  }

  const stylesXml = await loadDocxXml(zip, 'word/styles.xml')
  const numberingXml = await loadDocxXml(zip, 'word/numbering.xml')
  const relationshipsXml = await loadDocxXml(zip, 'word/_rels/document.xml.rels')
  const imageRelationships = parseDocxImageRelationships(relationshipsXml)
  const context: DocxParseContext = {
    blocks: [],
    rawParts: [],
    rawOffset: 0,
    headingStack: [],
    styles: parseDocxStyles(stylesXml),
    numbering: parseDocxNumbering(numberingXml),
    numberingState: new Map(),
    processedImagePaths: new Set()
  }

  const body = findFirstChildElement(documentXml.documentElement, 'body')
  if (!body) {
    return {
      fileType: 'docx',
      sourceKind: 'text',
      rawContent: '',
      blocks: []
    }
  }

  for (const child of getChildElements(body)) {
    if (matchesElementName(child, 'p')) {
      parseDocxParagraph(child, context)
      await appendDocxImageOcrBlocks(child, zip, imageRelationships, context, options)
      continue
    }

    if (matchesElementName(child, 'tbl')) {
      parseDocxTable(child, context)
      await appendDocxImageOcrBlocks(child, zip, imageRelationships, context, options)
    }
  }

  await appendUnreferencedDocxImageOcrBlocks(zip, context, options)

  return {
    fileType: 'docx',
    sourceKind: 'text',
    rawContent: context.rawParts.join('\n\n').trim(),
    blocks: context.blocks
  }
}

export async function parsePdfDocument(
  buffer: Buffer,
  options: ParseKnowledgeDocumentOptions
): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: buffer })
  try {
    const textResult = await parser.getText()
    const pages = textResult.pages.map((page) => ({
      pageNumber: page.num,
      content: String(page.text || '').trim()
    }))
    const textPages = pages.filter((page) => hasPdfPageText(page.content))
    const emptyPageNumbers = pages
      .filter((page) => !hasPdfPageText(page.content))
      .map((page) => page.pageNumber)
    // 只 OCR 没有可复制文本的页面，避免重复识别并保留原始页序。
    const ocrResult = await parsePdfPagesWithOcr(parser, options, emptyPageNumbers)
    const pageBlocks = new Map<number, StructuredBlock[]>()

    for (const page of textPages) {
      pageBlocks.set(page.pageNumber, splitPdfPageToBlocks(page.content, page.pageNumber))
    }

    for (const block of ocrResult.blocks) {
      if (typeof block.pageNumber === 'number') {
        pageBlocks.set(block.pageNumber, [...(pageBlocks.get(block.pageNumber) ?? []), block])
      }
    }

    const blocks: StructuredBlock[] = []
    const rawParts: string[] = []
    let rawOffset = 0

    for (const page of pages) {
      for (const block of pageBlocks.get(page.pageNumber) ?? []) {
        rawOffset = pushStructuredBlock(blocks, rawParts, rawOffset, block)
      }
    }

    return {
      fileType: 'pdf',
      sourceKind: ocrResult.summary.recognizedPages > 0
        ? 'pdf-ocr'
        : textPages.length > 0
          ? detectPdfSourceKind(textPages.map((page) => page.content))
          : 'pdf-visual',
      rawContent: rawParts.join('\n\n').trim(),
      blocks,
      ocr: emptyPageNumbers.length > 0 ? ocrResult.summary : undefined
    }
  } finally {
    await parser.destroy()
  }
}

function hasPdfPageText(content: string): boolean {
  return content.replace(/\s+/g, '').length > 0
}

function collectMarkdownText(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return ''
  }

  const value = node as { value?: string; children?: unknown[] }

  if (typeof value.value === 'string') {
    return value.value
  }

  if (!Array.isArray(value.children)) {
    return ''
  }

  return value.children
    .map((child) => collectMarkdownText(child))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolvePlainTextTitle(paragraph: string): string | null {
  const singleLine = paragraph
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

  if (singleLine.length !== 1) {
    return null
  }

  const line = singleLine[0]
  if (line.length > 40) {
    return null
  }

  if (/^[一二三四五六七八九十\d]+[、.\-:：)]/.test(line) || /^第.{1,12}[章节部分]/.test(line)) {
    return line
  }

  if (!/[。！？?!]/.test(line) && /^[A-Z][A-Za-z0-9\s\-_:]+$/.test(line)) {
    return line
  }

  return null
}

function detectPdfSourceKind(pageContents: string[]): ParsedDocument['sourceKind'] {
  const averageLineCount =
    pageContents.reduce((total, page) => total + page.split('\n').filter(Boolean).length, 0) /
    Math.max(pageContents.length, 1)
  const averageLength =
    pageContents.reduce((total, page) => total + page.length, 0) / Math.max(pageContents.length, 1)

  if (averageLength < 120 || averageLineCount > 40) {
    return 'pdf-complex'
  }

  return 'pdf-copyable'
}

function splitPdfPageToBlocks(pageContent: string, pageNumber: number): StructuredBlock[] {
  const paragraphs = pageContent
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return [
      {
        blockType: 'page',
        content: pageContent.trim(),
        pageNumber,
        sectionPath: [`第 ${pageNumber} 页`]
      }
    ]
  }

  return paragraphs.map((paragraph) => ({
    blockType: 'page_paragraph',
    content: paragraph,
    pageNumber,
    sectionPath: [`第 ${pageNumber} 页`]
  }))
}

async function loadDocxXml(zip: JSZip, entryPath: string): Promise<Document | null> {
  const entry = zip.file(entryPath)
  if (!entry) {
    return null
  }

  const xmlText = await entry.async('text')
  return new DOMParser().parseFromString(xmlText, 'text/xml')
}

function parseDocxStyles(stylesXml: Document | null): Map<string, DocxStyleDefinition> {
  const styles = new Map<string, DocxStyleDefinition>()

  if (!stylesXml?.documentElement) {
    return styles
  }

  for (const styleElement of findElementsByName(stylesXml.documentElement, 'style')) {
    const styleId = getAttributeValue(styleElement, 'styleId')
    if (!styleId) {
      continue
    }

    const styleType = getAttributeValue(styleElement, 'type')
    if (styleType && styleType !== 'paragraph') {
      continue
    }

    const nameElement = findFirstChildElement(styleElement, 'name')
    const basedOnElement = findFirstChildElement(styleElement, 'basedOn')
    const paragraphProperties = findFirstChildElement(styleElement, 'pPr')
    const outlineElement = findFirstChildElement(paragraphProperties, 'outlineLvl')
    styles.set(styleId, {
      styleId,
      name: getAttributeValue(nameElement, 'val') || styleId,
      basedOnId: getAttributeValue(basedOnElement, 'val') || undefined,
      headingLevel: resolveHeadingLevelFromStyle(styleId, getAttributeValue(nameElement, 'val') || styleId, outlineElement)
    })
  }

  return styles
}

function parseDocxNumbering(numberingXml: Document | null): DocxNumberingDefinition {
  const definition: DocxNumberingDefinition = {
    abstractLevels: new Map(),
    numToAbstract: new Map()
  }

  if (!numberingXml?.documentElement) {
    return definition
  }

  for (const abstractNumElement of findElementsByName(numberingXml.documentElement, 'abstractNum')) {
    const abstractNumId = getAttributeValue(abstractNumElement, 'abstractNumId')
    if (!abstractNumId) {
      continue
    }

    const levels = new Map<number, DocxNumberLevelDefinition>()
    for (const levelElement of getChildElements(abstractNumElement).filter((item) => matchesElementName(item, 'lvl'))) {
      const level = Number(getAttributeValue(levelElement, 'ilvl') || 0)
      const format = getAttributeValue(findFirstChildElement(levelElement, 'numFmt'), 'val') || 'bullet'
      const text = getAttributeValue(findFirstChildElement(levelElement, 'lvlText'), 'val') || '%1.'
      const start = Number(getAttributeValue(findFirstChildElement(levelElement, 'start'), 'val') || 1)
      levels.set(level, {
        level,
        format,
        text,
        start
      })
    }

    definition.abstractLevels.set(abstractNumId, levels)
  }

  for (const numElement of findElementsByName(numberingXml.documentElement, 'num')) {
    const numId = getAttributeValue(numElement, 'numId')
    const abstractNumId = getAttributeValue(findFirstChildElement(numElement, 'abstractNumId'), 'val')
    if (numId && abstractNumId) {
      definition.numToAbstract.set(numId, abstractNumId)
    }
  }

  return definition
}

function parseDocxParagraph(paragraphElement: Element, context: DocxParseContext): void {
  const text = extractDocxParagraphText(paragraphElement)
  if (!text) {
    return
  }

  const styleId = resolveDocxParagraphStyleId(paragraphElement)
  const headingLevel = resolveDocxParagraphHeadingLevel(paragraphElement, styleId, context.styles)
  const listInfo = resolveDocxParagraphListInfo(paragraphElement, context.numbering, context.numberingState)

  if (headingLevel) {
    context.headingStack.splice(Math.max(headingLevel - 1, 0))
    context.headingStack[headingLevel - 1] = text
    context.rawOffset = pushStructuredBlock(
      context.blocks,
      context.rawParts,
      context.rawOffset,
      {
        blockType: 'heading',
        content: text,
        title: text,
        level: headingLevel,
        sectionPath: context.headingStack.filter(Boolean),
        metadata: {
          styleId
        }
      }
    )
    return
  }

  const sectionPath = context.headingStack.filter(Boolean)

  if (listInfo) {
    const listContent = `${listInfo.marker} ${text}`.trim()
    context.rawOffset = pushStructuredBlock(
      context.blocks,
      context.rawParts,
      context.rawOffset,
      {
        blockType: 'list_item',
        content: listContent,
        sectionPath,
        metadata: {
          styleId,
          listType: listInfo.listType,
          numId: listInfo.numId,
          ilvl: listInfo.ilvl
        }
      }
    )
    return
  }

  context.rawOffset = pushStructuredBlock(
    context.blocks,
    context.rawParts,
    context.rawOffset,
    {
      blockType: 'paragraph',
      content: text,
      sectionPath,
      metadata: {
        styleId
      }
    }
  )
}

function parseDocxTable(tableElement: Element, context: DocxParseContext): void {
  const rows: Array<Array<{ text: string; colSpan: number; vMerge: string | null }>> = []
  let maxColumns = 0
  let mergedCellCount = 0

  for (const rowElement of getChildElements(tableElement).filter((item) => matchesElementName(item, 'tr'))) {
    const rowCells: Array<{ text: string; colSpan: number; vMerge: string | null }> = []

    for (const cellElement of getChildElements(rowElement).filter((item) => matchesElementName(item, 'tc'))) {
      const cellProperties = findFirstChildElement(cellElement, 'tcPr')
      const gridSpan = Number(getAttributeValue(findFirstChildElement(cellProperties, 'gridSpan'), 'val') || 1)
      const verticalMergeElement = findFirstChildElement(cellProperties, 'vMerge')
      const verticalMergeValue = verticalMergeElement ? getAttributeValue(verticalMergeElement, 'val') || 'continue' : null
      const cellText = extractDocxTableCellText(cellElement)

      if (gridSpan > 1 || verticalMergeValue) {
        mergedCellCount += 1
      }

      rowCells.push({
        text: cellText,
        colSpan: gridSpan,
        vMerge: verticalMergeValue
      })
    }

    const visualColumns = rowCells.reduce((total, cell) => total + Math.max(cell.colSpan, 1), 0)
    maxColumns = Math.max(maxColumns, visualColumns)
    rows.push(rowCells)
  }

  const tableContent = rows
    .map((row) =>
      row
        .map((cell) => cell.text || ' ')
        .join(' | ')
        .trim()
    )
    .filter(Boolean)
    .join('\n')
    .trim()

  if (!tableContent) {
    return
  }

  context.rawOffset = pushStructuredBlock(
    context.blocks,
    context.rawParts,
    context.rawOffset,
    {
      blockType: 'table',
      content: tableContent,
      sectionPath: context.headingStack.filter(Boolean),
      metadata: {
        rowCount: rows.length,
        columnCount: maxColumns,
        mergedCellCount,
        rows
      }
    }
  )
}

function pushStructuredBlock(
  blocks: StructuredBlock[],
  rawParts: string[],
  rawOffset: number,
  block: StructuredBlock
): number {
  const normalizedContent = block.content.trim()
  if (!normalizedContent) {
    return rawOffset
  }

  const separatorLength = rawParts.length > 0 ? 2 : 0
  const startOffset = rawOffset + separatorLength
  const endOffset = startOffset + normalizedContent.length
  rawParts.push(normalizedContent)
  blocks.push({
    ...block,
    content: normalizedContent,
    startOffset,
    endOffset
  })
  return endOffset
}

function resolveHeadingLevelFromStyle(styleId: string, styleName: string, outlineElement: Element | null): number | undefined {
  const outlineValue = getAttributeValue(outlineElement, 'val')
  if (outlineValue !== null) {
    return Number(outlineValue) + 1
  }

  const styleKey = `${styleId} ${styleName}`.toLowerCase()
  const headingMatch = styleKey.match(/heading\s*([1-6])/)
  if (headingMatch) {
    return Number(headingMatch[1])
  }

  if (styleKey.includes('title')) {
    return 1
  }

  return undefined
}

function resolveDocxParagraphStyleId(paragraphElement: Element): string | undefined {
  const paragraphProperties = findFirstChildElement(paragraphElement, 'pPr')
  const styleElement = findFirstChildElement(paragraphProperties, 'pStyle')
  return getAttributeValue(styleElement, 'val') || undefined
}

function resolveDocxParagraphHeadingLevel(
  paragraphElement: Element,
  styleId: string | undefined,
  styles: Map<string, DocxStyleDefinition>
): number | undefined {
  const paragraphProperties = findFirstChildElement(paragraphElement, 'pPr')
  const outlineElement = findFirstChildElement(paragraphProperties, 'outlineLvl')
  const outlineValue = getAttributeValue(outlineElement, 'val')
  if (outlineValue !== null) {
    return Number(outlineValue) + 1
  }

  return styleId ? resolveInheritedDocxHeadingLevel(styleId, styles, new Set()) : undefined
}

function resolveInheritedDocxHeadingLevel(
  styleId: string,
  styles: Map<string, DocxStyleDefinition>,
  visited: Set<string>
): number | undefined {
  if (visited.has(styleId)) {
    return undefined
  }

  visited.add(styleId)
  const style = styles.get(styleId)
  if (!style) {
    return undefined
  }

  if (style.headingLevel) {
    return style.headingLevel
  }

  return style.basedOnId ? resolveInheritedDocxHeadingLevel(style.basedOnId, styles, visited) : undefined
}

function resolveDocxParagraphListInfo(
  paragraphElement: Element,
  numbering: DocxNumberingDefinition,
  numberingState: DocxListState
): DocxListInfo | null {
  const paragraphProperties = findFirstChildElement(paragraphElement, 'pPr')
  const numProperties = findFirstChildElement(paragraphProperties, 'numPr')
  if (!numProperties) {
    return null
  }

  const numId = getAttributeValue(findFirstChildElement(numProperties, 'numId'), 'val')
  if (!numId) {
    return null
  }

  const ilvl = Number(getAttributeValue(findFirstChildElement(numProperties, 'ilvl'), 'val') || 0)
  const abstractNumId = numbering.numToAbstract.get(numId)
  const levelDefinitions = abstractNumId ? numbering.abstractLevels.get(abstractNumId) : undefined
  const levelDefinition = levelDefinitions?.get(ilvl) || {
    level: ilvl,
    format: 'bullet',
    text: '%1.',
    start: 1
  }

  if (levelDefinition.format === 'bullet') {
    return {
      numId,
      ilvl,
      marker: '-',
      listType: 'bullet'
    }
  }

  return {
    numId,
    ilvl,
    marker: buildOrderedListMarker(numId, ilvl, levelDefinitions, numberingState),
    listType: 'ordered'
  }
}

function buildOrderedListMarker(
  numId: string,
  ilvl: number,
  levelDefinitions: Map<number, DocxNumberLevelDefinition> | undefined,
  numberingState: DocxListState
): string {
  const counters = [...(numberingState.get(numId) ?? [])]
  const currentDefinition = levelDefinitions?.get(ilvl) || {
    level: ilvl,
    format: 'decimal',
    text: `%${ilvl + 1}.`,
    start: 1
  }

  for (let index = ilvl + 1; index < counters.length; index += 1) {
    counters[index] = 0
  }

  if (!counters[ilvl]) {
    counters[ilvl] = currentDefinition.start
  } else {
    counters[ilvl] += 1
  }

  numberingState.set(numId, counters)

  return (currentDefinition.text || `%${ilvl + 1}.`).replace(/%(\d+)/g, (_, token) => {
    const targetLevel = Number(token) - 1
    const targetDefinition = levelDefinitions?.get(targetLevel)
    const targetValue =
      counters[targetLevel] ||
      targetDefinition?.start ||
      1
    return formatListCounterValue(targetValue, targetDefinition?.format || 'decimal')
  })
}

function formatListCounterValue(value: number, format: string): string {
  if (format === 'lowerLetter') {
    return formatAlphabetCounter(value, false)
  }

  if (format === 'upperLetter') {
    return formatAlphabetCounter(value, true)
  }

  if (format === 'lowerRoman') {
    return formatRomanCounter(value).toLowerCase()
  }

  if (format === 'upperRoman') {
    return formatRomanCounter(value)
  }

  return String(value)
}

function formatAlphabetCounter(value: number, uppercase: boolean): string {
  let current = Math.max(value, 1)
  let result = ''

  while (current > 0) {
    current -= 1
    result = String.fromCharCode(65 + (current % 26)) + result
    current = Math.floor(current / 26)
  }

  return uppercase ? result : result.toLowerCase()
}

function formatRomanCounter(value: number): string {
  const symbols: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ]
  let current = Math.max(value, 1)
  let result = ''

  for (const [unit, symbol] of symbols) {
    while (current >= unit) {
      result += symbol
      current -= unit
    }
  }

  return result
}

function extractDocxParagraphText(paragraphElement: Element): string {
  const parts: string[] = []
  collectDocxInlineText(paragraphElement, parts)
  return normalizeDocxText(parts.join(''))
}

function extractDocxTableCellText(cellElement: Element): string {
  const parts: string[] = []

  for (const child of getChildElements(cellElement)) {
    if (matchesElementName(child, 'p')) {
      const paragraphText = extractDocxParagraphText(child)
      if (paragraphText) {
        parts.push(paragraphText)
      }
      continue
    }

    if (matchesElementName(child, 'tbl')) {
      const nestedRows = getChildElements(child)
        .filter((item) => matchesElementName(item, 'tr'))
        .map((row) =>
          getChildElements(row)
            .filter((item) => matchesElementName(item, 'tc'))
            .map((cell) => extractDocxTableCellText(cell))
            .join(' | ')
        )
        .filter(Boolean)
        .join('\n')

      if (nestedRows) {
        parts.push(nestedRows)
      }
    }
  }

  return normalizeDocxText(parts.join('\n'))
}

function collectDocxInlineText(node: Node, parts: string[]): void {
  if (node.nodeType === 3) {
    parts.push(node.nodeValue || '')
    return
  }

  if (node.nodeType !== 1) {
    return
  }

  const element = node as Element

  if (matchesElementName(element, 't')) {
    parts.push(element.textContent || '')
    return
  }

  if (matchesElementName(element, 'tab')) {
    parts.push('\t')
    return
  }

  if (matchesElementName(element, 'br') || matchesElementName(element, 'cr')) {
    parts.push('\n')
    return
  }

  if (matchesElementName(element, 'noBreakHyphen')) {
    parts.push('-')
    return
  }

  for (const child of Array.from({ length: node.childNodes.length }, (_, index) => node.childNodes[index])) {
    collectDocxInlineText(child, parts)
  }
}

function normalizeDocxText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getChildElements(node: Node | null): Element[] {
  if (!node) {
    return []
  }

  const elements: Element[] = []
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes[index]
    if (child.nodeType === 1) {
      elements.push(child as Element)
    }
  }

  return elements
}

function findFirstChildElement(node: Node | null, localName: string): Element | null {
  return getChildElements(node).find((child) => matchesElementName(child, localName)) || null
}

function findElementsByName(node: Node | null, localName: string): Element[] {
  if (!node) {
    return []
  }

  const matches: Element[] = []
  for (const child of getChildElements(node)) {
    if (matchesElementName(child, localName)) {
      matches.push(child)
    }
    matches.push(...findElementsByName(child, localName))
  }

  return matches
}

function matchesElementName(element: Element, localName: string): boolean {
  return (
    element.localName === localName ||
    element.nodeName === localName ||
    element.nodeName === `w:${localName}`
  )
}

function getAttributeValue(element: Element | null, attributeName: string): string | null {
  if (!element?.attributes) {
    return null
  }

  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index)
    if (!attribute) {
      continue
    }

    if (
      attribute.localName === attributeName ||
      attribute.nodeName === attributeName ||
      attribute.nodeName === `w:${attributeName}`
    ) {
      return attribute.value
    }
  }

  return null
}

async function parsePdfPagesWithOcr(
  parser: PDFParse,
  options: ParseKnowledgeDocumentOptions,
  pageNumbers: number[]
): Promise<{ blocks: StructuredBlock[]; summary: DocumentOcrSummary }> {
  if (pageNumbers.length === 0) {
    return {
      blocks: [],
      summary: { status: 'empty', attemptedPages: 0, recognizedPages: 0 }
    }
  }

  if (!options.ocrImage) {
    return {
      blocks: [],
      summary: { status: 'not_configured', attemptedPages: 0, recognizedPages: 0 }
    }
  }

  const screenshotResult = await parser.getScreenshot({
    partial: pageNumbers,
    desiredWidth: 1600,
    imageBuffer: true,
    imageDataUrl: false
  })
  const blocks: StructuredBlock[] = []
  const results: DocumentOcrResult[] = []

  for (const page of screenshotResult.pages) {
    const result = await options.ocrImage({
      buffer: Buffer.from(page.data),
      mimeType: 'image/png',
      sourceName: `pdf page ${page.pageNumber}`
    })
    results.push(result)

    if (result.status !== 'success' || !result.text) {
      if (result.status === 'not_configured' || result.status === 'limit_reached') {
        break
      }
      continue
    }

    blocks.push(...splitOcrPageToBlocks(result.text, page.pageNumber, {
      ocr: true,
      imageSource: 'pdf_page_screenshot',
      width: page.width,
      height: page.height,
      scale: page.scale
    }))
  }

  const failedResult = results.find((result) => result.status !== 'success')
  return {
    blocks,
    summary: {
      status: blocks.length > 0 ? 'success' : failedResult?.status ?? 'empty',
      attemptedPages: results.length,
      recognizedPages: blocks.length,
      message: failedResult?.message
    }
  }
}

function splitOcrPageToBlocks(
  content: string,
  pageNumber: number,
  metadata: Record<string, unknown>
): StructuredBlock[] {
  const pagePath = `第 ${pageNumber} 页`
  const paragraphs = content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean)
  if (paragraphs.length < 2) {
    return [{ blockType: 'ocr_page', content: content.trim(), pageNumber, sectionPath: [pagePath], metadata }]
  }

  let heading = ''
  return paragraphs.map((paragraph) => {
    const title = resolvePlainTextTitle(paragraph)
    if (title) {
      heading = title
    }

    return {
      blockType: title ? 'heading' : 'ocr_paragraph',
      content: paragraph,
      title: title ?? undefined,
      level: title ? 2 : undefined,
      pageNumber,
      sectionPath: heading ? [pagePath, heading] : [pagePath],
      metadata
    }
  })
}

async function appendDocxImageOcrBlocks(
  node: Node,
  zip: JSZip,
  imageRelationships: Map<string, string>,
  context: DocxParseContext,
  options: ParseKnowledgeDocumentOptions
): Promise<void> {
  if (!options.ocrImage) {
    return
  }

  const relationshipIds = extractDocxImageRelationshipIds(node)
  for (const relationshipId of relationshipIds) {
    const imagePath = imageRelationships.get(relationshipId)
    if (!imagePath || context.processedImagePaths.has(imagePath)) {
      continue
    }

    await appendDocxImageOcrBlock(imagePath, zip, context, options)
  }
}

async function appendUnreferencedDocxImageOcrBlocks(
  zip: JSZip,
  context: DocxParseContext,
  options: ParseKnowledgeDocumentOptions
): Promise<void> {
  if (!options.ocrImage) {
    return
  }

  for (const imagePath of Object.keys(zip.files).filter((item) => item.startsWith('word/media/'))) {
    if (!context.processedImagePaths.has(imagePath)) {
      await appendDocxImageOcrBlock(imagePath, zip, context, options)
    }
  }
}

async function appendDocxImageOcrBlock(
  imagePath: string,
  zip: JSZip,
  context: DocxParseContext,
  options: ParseKnowledgeDocumentOptions
): Promise<void> {
  const entry = zip.file(imagePath)
  if (!entry || !options.ocrImage) {
    return
  }

  context.processedImagePaths.add(imagePath)
  const imageBuffer = await entry.async('nodebuffer')
  const result = await options.ocrImage({
    buffer: imageBuffer,
    mimeType: resolveImageMimeType(imagePath),
    sourceName: imagePath
  })

  if (result.status !== 'success' || !result.text) {
    return
  }

  context.rawOffset = pushStructuredBlock(
    context.blocks,
    context.rawParts,
    context.rawOffset,
    {
      blockType: 'ocr_image',
      content: result.text,
      sectionPath: context.headingStack.filter(Boolean),
      metadata: {
        ocr: true,
        imageSource: 'docx_embedded_image',
        imagePath
      }
    }
  )
}

function parseDocxImageRelationships(relationshipsXml: Document | null): Map<string, string> {
  const relationships = new Map<string, string>()
  if (!relationshipsXml?.documentElement) {
    return relationships
  }

  for (const relationship of findElementsByName(relationshipsXml.documentElement, 'Relationship')) {
    const id = getAttributeValue(relationship, 'Id')
    const target = getAttributeValue(relationship, 'Target')
    const type = getAttributeValue(relationship, 'Type') || ''
    if (!id || !target || !type.toLowerCase().includes('/image')) {
      continue
    }

    relationships.set(id, normalizeDocxRelationshipTarget(target))
  }

  return relationships
}

function normalizeDocxRelationshipTarget(target: string): string {
  if (target.startsWith('/')) {
    return target.replace(/^\/+/, '')
  }

  return pathPosix.normalize(pathPosix.join('word', target))
}

function extractDocxImageRelationshipIds(node: Node): string[] {
  const ids = new Set<string>()

  for (const blip of findElementsByName(node, 'blip')) {
    const embedId = getAttributeValue(blip, 'embed')
    const linkId = getAttributeValue(blip, 'link')
    if (embedId) {
      ids.add(embedId)
    }
    if (linkId) {
      ids.add(linkId)
    }
  }

  for (const imageData of findElementsByName(node, 'imagedata')) {
    const id = getAttributeValue(imageData, 'id')
    if (id) {
      ids.add(id)
    }
  }

  return [...ids]
}

function resolveImageMimeType(imagePath: string): string {
  const extension = extname(imagePath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg'
  }

  if (extension === '.gif') {
    return 'image/gif'
  }

  if (extension === '.webp') {
    return 'image/webp'
  }

  return 'image/png'
}


