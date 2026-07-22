import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMineruContentListV2 } from './mineru-content-list.parser'
import {
  mergeMissingNativePages,
  shouldEnhancePdfPageWithVlm
} from './knowledge-pdf-parser.service'

test('pure image labels are metadata-only while factual captions stay indexable', () => {
  const parsed = parseMineruContentListV2(JSON.stringify([[
    { type: 'image', content: { image_caption: '图 12 QQ_1782493338801' } },
    { type: 'image', content: { image_caption: '当预警值达到 93% 时执行 ACT-PQLT-23' } }
  ]]))

  assert.equal(parsed.blocks[0].metadata?.indexable, false)
  assert.equal(parsed.blocks[1].metadata?.indexable, true)
})

test('native text restores trailing pages omitted by MinerU', () => {
  const mineru = parseMineruContentListV2(JSON.stringify([[
    { type: 'paragraph', content: { paragraph_content: '第 56 页内容' } }
  ]]))
  mineru.blocks[0].pageNumber = 56

  const merged = mergeMissingNativePages(mineru, {
    fileType: 'pdf',
    sourceKind: 'pdf-copyable',
    rawContent: '第 57 页实验总结',
    blocks: [{
      blockType: 'paragraph',
      content: '第 57 页实验总结',
      pageNumber: 57,
      sectionPath: []
    }]
  })

  assert.equal(merged.blocks.at(-1)?.pageNumber, 57)
  assert.match(merged.rawContent, /第 57 页实验总结/)
})

test('separated label and value rows trigger VLM page enhancement', () => {
  assert.equal(shouldEnhancePdfPageWithVlm([
    {
      blockType: 'paragraph',
      content: [
        '主控制阈值',
        '责任角色',
        '响应时限',
        '50%',
        'operations_director',
        '5 小时'
      ].join('\n'),
      pageNumber: 1,
      sectionPath: ['第 1 页']
    }
  ]), true)
})
