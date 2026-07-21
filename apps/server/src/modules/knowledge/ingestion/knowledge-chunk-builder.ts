import type { StructureAwareChunkConfig } from 'share-type'

import type { StructuredBlock } from './knowledge-document.parser'

export type ChunkDraft = {
  content: string
  blocks: StructuredBlock[]
  sectionPath: string[]
}

type ChunkSection = {
  blocks: StructuredBlock[]
}

// 按结构优先、长度兜底的规则生成 chunk 草稿。
export function buildChunksFromBlocks(
  blocks: StructuredBlock[],
  config: StructureAwareChunkConfig
): ChunkDraft[] {
  const drafts = mergeOrphanHeadingSections(splitBlocksBySection(blocks)).flatMap((section) =>
    buildChunksWithinSection(section.blocks, config)
  )
  return packAdjacentSmallChunks(drafts, config)
}

// 章节边界优先保留；同页小章节继续组合，避免标题和图表说明各自成为碎片。
function packAdjacentSmallChunks(
  drafts: ChunkDraft[],
  config: StructureAwareChunkConfig
): ChunkDraft[] {
  if (drafts.length < 2) {
    return drafts
  }

  const packed: ChunkDraft[] = []
  let current = drafts[0]

  for (const next of drafts.slice(1)) {
    const merged = createChunkDraft([...current.blocks, ...next.blocks])
    const currentPage = resolveSinglePage(current.blocks)
    if (
      current.content.length < config.targetChars &&
      merged.content.length <= config.maxChars &&
      currentPage !== undefined &&
      currentPage === resolveSinglePage(next.blocks)
    ) {
      current = merged
    } else {
      packed.push(current)
      current = next
    }
  }

  packed.push(current)
  return packed
}

function resolveSinglePage(blocks: StructuredBlock[]): number | undefined {
  const pages = new Set(blocks.map((block) => block.pageNumber).filter((page) => page !== undefined))
  return pages.size === 1 ? [...pages][0] : undefined
}

function mergeOrphanHeadingSections(sections: ChunkSection[]): ChunkSection[] {
  const merged: ChunkSection[] = []

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]
    if (!section.blocks.every(isHeadingBlock)) {
      merged.push(section)
      continue
    }

    const pageNumber = section.blocks[0]?.pageNumber
    const previous = merged[merged.length - 1]
    const next = sections[index + 1]
    if (previous?.blocks.at(-1)?.pageNumber === pageNumber) {
      previous.blocks.push(...section.blocks)
    } else if (next?.blocks[0]?.pageNumber === pageNumber) {
      next.blocks.unshift(...section.blocks)
    } else {
      merged.push(section)
    }
  }

  return merged
}

function buildChunksWithinSection(
  blocks: StructuredBlock[],
  config: StructureAwareChunkConfig
): ChunkDraft[] {
  const drafts: ChunkDraft[] = []
  let currentBlocks: StructuredBlock[] = []
  let currentLength = 0
  let pendingMetadataBlocks: StructuredBlock[] = []

  for (const block of splitOversizedBlocks(blocks, config.targetChars)) {
    if (!isIndexableBlock(block)) {
      pendingMetadataBlocks.push(block)
      continue
    }

    const blockText = buildBlockText(block)
    const blockLength = blockText.length
    if (!blockLength) {
      continue
    }

    if (currentBlocks.length > 0 && shouldFlushCurrentChunk(currentLength, blockLength, config)) {
      drafts.push(createChunkDraft(currentBlocks))
      const overlapChars = Math.min(config.overlapChars, config.maxChars - blockLength)
      currentBlocks = createOverlapSeed(currentBlocks, block, overlapChars)
      currentLength = calculateBlocksLength(currentBlocks)
    }

    currentBlocks.push(...pendingMetadataBlocks, block)
    pendingMetadataBlocks = []
    currentLength += blockLength
  }

  if (currentBlocks.length > 0) {
    currentBlocks.push(...pendingMetadataBlocks)
    drafts.push(createChunkDraft(currentBlocks))
  } else if (drafts.length > 0 && pendingMetadataBlocks.length > 0) {
    drafts[drafts.length - 1].blocks.push(...pendingMetadataBlocks)
  }

  return mergeSmallTrailingChunk(drafts, config)
}

// 解析器给出整页 OCR 或长段落时，长度配置仍应生效。
function splitOversizedBlocks(blocks: StructuredBlock[], targetChars: number): StructuredBlock[] {
  return blocks.flatMap((block) => {
    const content = block.content.trim()
    if (content.length <= targetChars || block.blockType === 'ocr_image') {
      return block
    }

    const parts: StructuredBlock[] = []
    const partCount = Math.ceil(content.length / targetChars)
    const partLength = Math.ceil(content.length / partCount)
    for (let start = 0; start < content.length; start += partLength) {
      const text = content.slice(start, start + partLength)
      parts.push({
        ...block,
        content: text,
        startOffset: block.startOffset === undefined ? undefined : block.startOffset + start,
        endOffset: block.startOffset === undefined ? undefined : block.startOffset + start + text.length
      })
    }
    return parts
  })
}

// 先按主 section 切开，避免同级章节被粗暴拼成一个召回单元。
function splitBlocksBySection(blocks: StructuredBlock[]): ChunkSection[] {
  if (blocks.length === 0) {
    return []
  }

  const sectionHeadingLevel = resolveSectionHeadingLevel(blocks)
  if (!sectionHeadingLevel) {
    return [{ blocks }]
  }

  const sections: ChunkSection[] = []
  let currentBlocks: StructuredBlock[] = []

  for (const block of blocks) {
    if (isSectionBoundaryHeading(block, sectionHeadingLevel) && shouldStartNewSection(currentBlocks, sectionHeadingLevel)) {
      sections.push({ blocks: currentBlocks })
      currentBlocks = []
    }

    currentBlocks.push(block)
  }

  if (currentBlocks.length > 0) {
    sections.push({ blocks: currentBlocks })
  }

  return sections
}

function resolveSectionHeadingLevel(blocks: StructuredBlock[]): number | null {
  const headingLevels = blocks
    .filter(isHeadingBlock)
    .map((block) => resolveHeadingLevel(block))
    .filter((level): level is number => level !== null)

  if (headingLevels.length === 0) {
    return null
  }

  const nonRootHeadingLevels = headingLevels.filter((level) => level > 1)
  if (nonRootHeadingLevels.length > 0) {
    return Math.min(...nonRootHeadingLevels)
  }

  return Math.min(...headingLevels)
}

function shouldStartNewSection(blocks: StructuredBlock[], sectionHeadingLevel: number): boolean {
  return blocks.some((block) => {
    if (!isHeadingBlock(block)) {
      return true
    }

    return resolveHeadingLevel(block) === sectionHeadingLevel
  })
}

function isSectionBoundaryHeading(block: StructuredBlock, sectionHeadingLevel: number): boolean {
  return isHeadingBlock(block) && resolveHeadingLevel(block) === sectionHeadingLevel
}

function isHeadingBlock(block: StructuredBlock): boolean {
  return block.blockType === 'heading'
}

function resolveHeadingLevel(block: StructuredBlock): number | null {
  if (!isHeadingBlock(block)) {
    return null
  }

  if (typeof block.level === 'number' && Number.isFinite(block.level)) {
    return block.level
  }

  return block.sectionPath.length > 0 ? block.sectionPath.length : 1
}

// 长度判断只负责同 section 内部的兜底拆分。
function shouldFlushCurrentChunk(
  currentLength: number,
  nextBlockLength: number,
  config: StructureAwareChunkConfig
): boolean {
  if (currentLength >= config.targetChars) {
    return true
  }

  return currentLength + nextBlockLength > config.maxChars
}

function createChunkDraft(blocks: StructuredBlock[]): ChunkDraft {
  const sectionPath = resolveSharedSectionPath(blocks)
  const header = buildChunkHeader(blocks, sectionPath)
  const body = blocks
    .map((block) => buildBlockBody(block, sectionPath, header))
    .filter(Boolean)
    .join('\n\n')
    .trim()

  return {
    content: [header, body].filter(Boolean).join('\n\n').trim(),
    blocks,
    sectionPath
  }
}

// 路径信息只在 chunk 头里保留一次，并优先选择当前 chunk 真正对应的 section 标题。
function buildChunkHeader(blocks: StructuredBlock[], sectionPath: string[]): string {
  const firstBlock = blocks[0]
  if (firstBlock && isHeadingBlock(firstBlock)) {
    return (firstBlock.title || firstBlock.content).trim()
  }

  if (blocks.some(isHeadingBlock)) {
    return ''
  }

  const normalizedPath = sectionPath.map((item) => item.trim()).filter(Boolean)
  if (normalizedPath.length === 0) {
    return ''
  }

  return normalizedPath[normalizedPath.length - 1]
}

function buildBlockBody(block: StructuredBlock, sharedSectionPath: string[], headerTitle: string): string {
  if (!isIndexableBlock(block)) {
    return ''
  }

  const text = block.content.trim()
  if (!text) {
    return ''
  }

  if (shouldOmitHeadingFromBody(block, sharedSectionPath, headerTitle)) {
    return ''
  }

  return text
}

function isIndexableBlock(block: StructuredBlock): boolean {
  return block.metadata?.indexable !== false
}

// 如果标题已经在 chunk 头里表达过，就不要再把同一标题正文重复写一遍。
function shouldOmitHeadingFromBody(
  block: StructuredBlock,
  sharedSectionPath: string[],
  headerTitle: string
): boolean {
  if (!isHeadingBlock(block) || sharedSectionPath.length === 0) {
    return false
  }

  const headingText = (block.title || block.content).trim()
  if (!headingText) {
    return false
  }

  if (headingText === headerTitle) {
    return true
  }

  if (block.sectionPath.length > sharedSectionPath.length) {
    return false
  }

  return (
    headingText === sharedSectionPath[block.sectionPath.length - 1] &&
    isPathPrefix(block.sectionPath, sharedSectionPath)
  )
}

function resolveSharedSectionPath(blocks: StructuredBlock[]): string[] {
  if (blocks.length === 0) {
    return []
  }

  const [firstBlock, ...restBlocks] = blocks
  const shared = [...firstBlock.sectionPath]

  for (const block of restBlocks) {
    while (shared.length > 0 && !isPathPrefix(shared, block.sectionPath)) {
      shared.pop()
    }
  }

  return shared
}

function isPathPrefix(prefix: string[], fullPath: string[]): boolean {
  if (prefix.length > fullPath.length) {
    return false
  }

  return prefix.every((item, index) => item === fullPath[index])
}

// overlap 只回带正文块，不把标题噪音再次塞进新 chunk 开头。
function createOverlapSeed(
  blocks: StructuredBlock[],
  nextBlock: StructuredBlock,
  overlapChars: number
): StructuredBlock[] {
  if (overlapChars <= 0 || blocks.length === 0) {
    return []
  }

  const previousPage = blocks[blocks.length - 1].pageNumber
  if (previousPage !== undefined && nextBlock.pageNumber !== previousPage) {
    return []
  }

  const seed: StructuredBlock[] = []
  let length = 0

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (isHeadingBlock(block) || !isIndexableBlock(block)) {
      continue
    }

    const blockText = buildBlockText(block)
    const remaining = overlapChars - length
    const start = Math.max(0, blockText.length - remaining)
    seed.unshift({
      ...block,
      content: blockText.slice(start),
      startOffset: block.startOffset === undefined ? undefined : block.startOffset + start
    })
    length += blockText.length - start
    if (length >= overlapChars) {
      break
    }
  }

  return seed
}

function buildBlockText(block: StructuredBlock): string {
  return isIndexableBlock(block) ? block.content.trim() : ''
}

function calculateBlocksLength(blocks: StructuredBlock[]): number {
  return blocks.reduce((total, block) => total + buildBlockText(block).length, 0)
}

// 小尾块只会在同一个 section 内合并，不再跨章节回并。
function mergeSmallTrailingChunk(
  drafts: ChunkDraft[],
  config: StructureAwareChunkConfig
): ChunkDraft[] {
  if (drafts.length < 2) {
    return drafts
  }

  const lastDraft = drafts[drafts.length - 1]
  if (lastDraft.content.length >= config.minChars) {
    return drafts
  }

  const previousDraft = drafts[drafts.length - 2]
  const mergedBlocks = [...previousDraft.blocks, ...lastDraft.blocks]
  const mergedDraft = createChunkDraft(mergedBlocks)
  return mergedDraft.content.length <= config.maxChars
    ? [...drafts.slice(0, -2), mergedDraft]
    : drafts
}
