import type { StructuredBlock } from './knowledge-document.parser'

//声明 chunk 构建配置
export type ChunkBuilderConfig = {
  targetChars: number
  maxChars: number
  minChars: number
  overlapChars: number
}

//声明 chunk 构建结果
export type ChunkDraft = {
  content: string
  blocks: StructuredBlock[]
  sectionPath: string[]
}

//声明结构化 chunk 构建入口
export function buildChunksFromBlocks(blocks: StructuredBlock[], config: ChunkBuilderConfig): ChunkDraft[] {
  const drafts: ChunkDraft[] = []
  let currentBlocks: StructuredBlock[] = []
  let currentLength = 0

  for (const block of blocks) {
    const blockText = buildBlockText(block)
    const blockLength = blockText.length
    if (!blockLength) {
      continue
    }

    if (currentBlocks.length > 0 && shouldFlushCurrentChunk(currentLength, blockLength, config)) {
      drafts.push(createChunkDraft(currentBlocks))
      currentBlocks = createOverlapSeed(currentBlocks, config.overlapChars)
      currentLength = calculateBlocksLength(currentBlocks)
    }

    currentBlocks.push(block)
    currentLength += blockLength
  }

  if (currentBlocks.length > 0) {
    drafts.push(createChunkDraft(currentBlocks))
  }

  return mergeSmallTrailingChunk(drafts, config.minChars)
}

//声明单块文本构建
function buildBlockText(block: StructuredBlock): string {
  const sectionPrefix = block.sectionPath.length > 0 ? `${block.sectionPath.join(' > ')}\n` : ''
  return `${sectionPrefix}${block.content}`.trim()
}

//声明 chunk 刷新判断
function shouldFlushCurrentChunk(
  currentLength: number,
  nextBlockLength: number,
  config: ChunkBuilderConfig
): boolean {
  if (currentLength >= config.targetChars) {
    return true
  }

  return currentLength + nextBlockLength > config.maxChars
}

//声明 chunk 草稿创建
function createChunkDraft(blocks: StructuredBlock[]): ChunkDraft {
  const sectionPath = resolveSharedSectionPath(blocks)
  const prefix = sectionPath.length > 0 ? `${sectionPath.join(' > ')}\n\n` : ''
  const body = blocks.map((block) => buildBlockBody(block, sectionPath)).join('\n\n').trim()

  return {
    content: `${prefix}${body}`.trim(),
    blocks,
    sectionPath
  }
}

//声明 chunk 正文构建
function buildBlockBody(block: StructuredBlock, sharedSectionPath: string[]): string {
  const ownPath = block.sectionPath.join(' > ')
  const sharedPath = sharedSectionPath.join(' > ')
  const needsOwnPath = ownPath && ownPath !== sharedPath
  const ownPrefix = needsOwnPath ? `${ownPath}\n` : ''
  return `${ownPrefix}${block.content}`.trim()
}

//声明共享路径提取
function resolveSharedSectionPath(blocks: StructuredBlock[]): string[] {
  if (blocks.length === 0) {
    return []
  }

  const [firstBlock, ...restBlocks] = blocks
  const shared = [...firstBlock.sectionPath]

  for (const block of restBlocks) {
    while (shared.length > 0) {
      const current = shared.join('\u0000')
      const candidate = block.sectionPath.slice(0, shared.length).join('\u0000')
      if (current === candidate) {
        break
      }
      shared.pop()
    }
  }

  return shared
}

//声明重叠种子生成
function createOverlapSeed(blocks: StructuredBlock[], overlapChars: number): StructuredBlock[] {
  if (overlapChars <= 0 || blocks.length === 0) {
    return []
  }

  const seed: StructuredBlock[] = []
  let length = 0

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    const blockLength = buildBlockText(block).length
    seed.unshift(block)
    length += blockLength
    if (length >= overlapChars) {
      break
    }
  }

  return seed
}

//声明块长度统计
function calculateBlocksLength(blocks: StructuredBlock[]): number {
  return blocks.reduce((total, block) => total + buildBlockText(block).length, 0)
}

//声明小尾块合并
function mergeSmallTrailingChunk(drafts: ChunkDraft[], minChars: number): ChunkDraft[] {
  if (drafts.length < 2) {
    return drafts
  }

  const lastDraft = drafts[drafts.length - 1]
  if (lastDraft.content.length >= minChars) {
    return drafts
  }

  const previousDraft = drafts[drafts.length - 2]
  const mergedBlocks = [...previousDraft.blocks, ...lastDraft.blocks]
  return [...drafts.slice(0, -2), createChunkDraft(mergedBlocks)]
}
