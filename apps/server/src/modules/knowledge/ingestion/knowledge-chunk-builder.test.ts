import assert from 'node:assert/strict'
import test from 'node:test'

import { buildChunksFromBlocks } from './knowledge-chunk-builder'

const config = { targetChars: 600, maxChars: 800, minChars: 300, overlapChars: 50 }

test('single OCR block respects chunk limits and overlap', () => {
  const chunks = buildChunksFromBlocks(
    [{ blockType: 'ocr_page', content: '字'.repeat(838), sectionPath: ['第 1 页'], startOffset: 0 }],
    config
  )

  assert.equal(chunks.length, 2)
  assert.ok(chunks.every((chunk) => chunk.content.length <= config.maxChars))
  assert.equal(chunks[1].blocks[0].content.length, config.overlapChars)
})

test('overlap does not mix PDF pages', () => {
  const chunks = buildChunksFromBlocks(
    [1, 2, 3].map((pageNumber) => ({
      blockType: 'ocr_page',
      content: String(pageNumber).repeat(600),
      pageNumber,
      sectionPath: [`第 ${pageNumber} 页`]
    })),
    config
  )

  assert.deepEqual(chunks.map((chunk) => chunk.blocks.map((block) => block.pageNumber)), [[1], [2], [3]])
})

test('orphan heading does not become a standalone chunk', () => {
  const chunks = buildChunksFromBlocks(
    [
      { blockType: 'heading', content: '执行摘要', title: '执行摘要', level: 2, pageNumber: 1, sectionPath: ['执行摘要'] },
      { blockType: 'paragraph', content: '正文'.repeat(80), pageNumber: 1, sectionPath: ['执行摘要'] },
      { blockType: 'heading', content: '控制指标明细', title: '控制指标明细', level: 2, pageNumber: 1, sectionPath: ['控制指标明细'] },
      { blockType: 'heading', content: '下一页', title: '下一页', level: 2, pageNumber: 2, sectionPath: ['下一页'] },
      { blockType: 'paragraph', content: '内容'.repeat(80), pageNumber: 2, sectionPath: ['下一页'] }
    ],
    config
  )

  assert.equal(chunks.some((chunk) => chunk.content === '控制指标明细'), false)
  assert.equal(chunks[0].blocks.at(-1)?.content, '控制指标明细')
})

test('orphan heading is preserved when no same-page content exists', () => {
  const chunks = buildChunksFromBlocks(
    [{ blockType: 'heading', content: '独立标题', title: '独立标题', level: 2, pageNumber: 1, sectionPath: ['独立标题'] }],
    config
  )

  assert.equal(chunks[0].content, '独立标题')
})

test('small same-page sections are packed near target size', () => {
  const smallConfig = { targetChars: 353, maxChars: 400, minChars: 300, overlapChars: 0 }
  const blocks = [147, 221, 210, 88, 33, 46].flatMap((length, index) => [
    {
      blockType: 'heading',
      content: `章节${index}`,
      title: `章节${index}`,
      level: 2,
      pageNumber: 1,
      sectionPath: [`章节${index}`]
    },
    {
      blockType: 'paragraph',
      content: '文'.repeat(length - 3),
      pageNumber: 1,
      sectionPath: [`章节${index}`]
    }
  ])
  const chunks = buildChunksFromBlocks(blocks, smallConfig)

  assert.equal(chunks.length, 2)
  assert.ok(chunks.every((chunk) => chunk.content.length <= smallConfig.maxChars))
})

test('a later heading keeps its original position', () => {
  const chunks = buildChunksFromBlocks(
    [
      { blockType: 'table', content: '实验报告', pageNumber: 1, sectionPath: [] },
      { blockType: 'heading', content: '实验目的', title: '实验目的', level: 2, pageNumber: 1, sectionPath: ['实验目的'] },
      { blockType: 'paragraph', content: '正文', pageNumber: 1, sectionPath: ['实验目的'] }
    ],
    config
  )

  assert.equal(chunks[0].content, '实验报告\n\n实验目的\n\n正文')
})

test('non-indexable image placeholders stay only in chunk metadata', () => {
  const chunks = buildChunksFromBlocks(
    [
      {
        blockType: 'image',
        content: '图 12 QQ_1782493338801',
        pageNumber: 12,
        sectionPath: ['实验截图'],
        metadata: { indexable: false }
      },
      {
        blockType: 'paragraph',
        content: '路由器根据目的网络选择下一跳。',
        pageNumber: 13,
        sectionPath: ['实验截图']
      }
    ],
    config
  )

  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].content, '实验截图\n\n路由器根据目的网络选择下一跳。')
  assert.equal(chunks[0].blocks.length, 2)
})
