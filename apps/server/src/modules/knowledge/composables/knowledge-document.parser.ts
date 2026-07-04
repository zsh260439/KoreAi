import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { PDFParse } from 'pdf-parse'
import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'

//声明结构化块标准结构。
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

//声明文档解析统一结果结构。
export interface ParsedDocument {
  fileType: string
  sourceKind: 'text' | 'pdf-copyable' | 'pdf-complex' | 'pdf-visual'
  blocks: StructuredBlock[]
  rawContent: string
}

//声明 docx 样式定义结构。
type DocxStyleDefinition = {
  styleId: string
  name: string
  basedOnId?: string
  headingLevel?: number
}

//声明 docx 编号级别定义结构。
type DocxNumberLevelDefinition = {
  level: number
  format: string
  text: string
  start: number
}

//声明 docx 编号定义结构。
type DocxNumberingDefinition = {
  abstractLevels: Map<string, Map<number, DocxNumberLevelDefinition>>
  numToAbstract: Map<string, string>
}

//声明 docx 列表状态结构。
type DocxListState = Map<string, number[]>

//声明 docx 解析上下文结构。
type DocxParseContext = {
  blocks: StructuredBlock[]
  rawParts: string[]
  rawOffset: number
  headingStack: string[]
  styles: Map<string, DocxStyleDefinition>
  numbering: DocxNumberingDefinition
  numberingState: DocxListState
}

//声明 docx 列表项信息结构。
type DocxListInfo = {
  numId: string
  ilvl: number
  marker: string
  listType: 'ordered' | 'bullet'
}

//声明文档解析统一入口。
export async function parseKnowledgeDocument(storagePath: string): Promise<ParsedDocument> {
  const fileType = extname(storagePath).toLowerCase().slice(1) || 'txt'
  const buffer = await readFile(storagePath)

  if (fileType === 'md') {
    return parseMarkdownDocument(buffer.toString('utf-8'))
  }

  if (fileType === 'txt') {
    return parseTextDocument(buffer.toString('utf-8'))
  }

  if (fileType === 'docx') {
    return parseDocxDocument(buffer)
  }

  if (fileType === 'pdf') {
    return parsePdfDocument(buffer)
  }

  return parseTextDocument(buffer.toString('utf-8'))
}

//声明 Markdown 文档解析逻辑。
async function parseMarkdownDocument(content: string): Promise<ParsedDocument> {
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

//声明纯文本文档解析逻辑。
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

//声明 docx 文档解析逻辑。
async function parseDocxDocument(buffer: Buffer): Promise<ParsedDocument> {
  //声明 docx 按 OOXML 标准直接读取压缩包内部 XML。
  const zip = await JSZip.loadAsync(buffer)
  const documentXml = await loadDocxXml(zip, 'word/document.xml')

  if (!documentXml?.documentElement) {
    throw new Error('DOCX 缺少 word/document.xml')
  }

  const stylesXml = await loadDocxXml(zip, 'word/styles.xml')
  const numberingXml = await loadDocxXml(zip, 'word/numbering.xml')
  const context: DocxParseContext = {
    blocks: [],
    rawParts: [],
    rawOffset: 0,
    headingStack: [],
    styles: parseDocxStyles(stylesXml),
    numbering: parseDocxNumbering(numberingXml),
    numberingState: new Map()
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

  //声明 docx 主体按段落和表格逐块解析。
  for (const child of getChildElements(body)) {
    if (matchesElementName(child, 'p')) {
      parseDocxParagraph(child, context)
      continue
    }

    if (matchesElementName(child, 'tbl')) {
      parseDocxTable(child, context)
    }
  }

  return {
    fileType: 'docx',
    sourceKind: 'text',
    rawContent: context.rawParts.join('\n\n').trim(),
    blocks: context.blocks
  }
}

//声明 pdf 文档解析逻辑。
async function parsePdfDocument(buffer: Buffer): Promise<ParsedDocument> {
  const parser = new PDFParse({ data: buffer })
  const textResult = await parser.getText()
  await parser.destroy()

  const pages = textResult.pages
    .map((page) => ({
      pageNumber: page.num,
      content: String(page.text || '').trim()
    }))
    .filter((page) => page.content.length > 0)

  if (!textResult.text.trim() || pages.length === 0) {
    return {
      fileType: 'pdf',
      sourceKind: 'pdf-visual',
      rawContent: '',
      blocks: []
    }
  }

  const sourceKind = detectPdfSourceKind(pages.map((page) => page.content))
  const blocks: StructuredBlock[] = []
  const rawParts: string[] = []
  let rawOffset = 0

  for (const page of pages) {
    for (const block of splitPdfPageToBlocks(page.content, page.pageNumber)) {
      rawOffset = pushStructuredBlock(blocks, rawParts, rawOffset, block)
    }
  }

  return {
    fileType: 'pdf',
    sourceKind,
    rawContent: rawParts.join('\n\n').trim(),
    blocks
  }
}

//声明 Markdown 文本提取逻辑。
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

//声明纯文本标题识别逻辑。
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

  if (/^[一二三四五六七八九十\d]+[、.\-：:)]/.test(line) || /^第.{1,12}[章节部分]/.test(line)) {
    return line
  }

  if (!/[。！？?!]/.test(line) && /^[A-Z][A-Za-z0-9\s\-_:]+$/.test(line)) {
    return line
  }

  return null
}

//声明 pdf 来源类型判断逻辑。
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

//声明 pdf 页面转结构块逻辑。
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
        sectionPath: [`第${pageNumber}页`]
      }
    ]
  }

  return paragraphs.map((paragraph) => ({
    blockType: 'page_paragraph',
    content: paragraph,
    pageNumber,
    sectionPath: [`第${pageNumber}页`]
  }))
}

//声明 docx XML 文件读取逻辑。
async function loadDocxXml(zip: JSZip, entryPath: string): Promise<Document | null> {
  const entry = zip.file(entryPath)
  if (!entry) {
    return null
  }

  const xmlText = await entry.async('text')
  return new DOMParser().parseFromString(xmlText, 'text/xml')
}

//声明 docx 样式表解析逻辑。
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

//声明 docx 编号定义解析逻辑。
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

//声明 docx 段落解析逻辑。
function parseDocxParagraph(paragraphElement: Element, context: DocxParseContext): void {
  const text = extractDocxParagraphText(paragraphElement)
  if (!text) {
    return
  }

  const styleId = resolveDocxParagraphStyleId(paragraphElement)
  const headingLevel = resolveDocxParagraphHeadingLevel(paragraphElement, styleId, context.styles)
  const listInfo = resolveDocxParagraphListInfo(paragraphElement, context.numbering, context.numberingState)

  if (headingLevel) {
    //声明标题块直接维护章节路径栈。
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

//声明 docx 表格解析逻辑。
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

//声明结构化块入栈逻辑。
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

//声明 docx 标题级别推断逻辑。
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

//声明 docx 段落样式获取逻辑。
function resolveDocxParagraphStyleId(paragraphElement: Element): string | undefined {
  const paragraphProperties = findFirstChildElement(paragraphElement, 'pPr')
  const styleElement = findFirstChildElement(paragraphProperties, 'pStyle')
  return getAttributeValue(styleElement, 'val') || undefined
}

//声明 docx 段落标题级别解析逻辑。
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

//声明 docx 样式继承标题级别解析逻辑。
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

//声明 docx 段落列表信息解析逻辑。
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

//声明有序列表标记生成逻辑。
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

//声明列表序号格式化逻辑。
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

//声明字母序号格式化逻辑。
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

//声明罗马序号格式化逻辑。
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

//声明 docx 段落文本提取逻辑。
function extractDocxParagraphText(paragraphElement: Element): string {
  const parts: string[] = []
  collectDocxInlineText(paragraphElement, parts)
  return normalizeDocxText(parts.join(''))
}

//声明 docx 表格单元格文本提取逻辑。
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

//声明 docx 行内文本递归提取逻辑。
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

//声明 docx 文本清洗逻辑。
function normalizeDocxText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

//声明 XML 子元素提取逻辑。
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

//声明 XML 直接子元素查找逻辑。
function findFirstChildElement(node: Node | null, localName: string): Element | null {
  return getChildElements(node).find((child) => matchesElementName(child, localName)) || null
}

//声明 XML 深度元素查找逻辑。
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

//声明 XML 元素名匹配逻辑。
function matchesElementName(element: Element, localName: string): boolean {
  return (
    element.localName === localName ||
    element.nodeName === localName ||
    element.nodeName === `w:${localName}`
  )
}

//声明 XML 属性值提取逻辑。
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
