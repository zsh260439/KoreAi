import assert from 'node:assert/strict'
import test from 'node:test'

import type { StructuredBlock } from '../../../modules/knowledge/pipeline/document-processing/knowledge-document.parser'
import {
  createKnowledgeChunkHash,
  isKnowledgeSyncDue
} from '../../../modules/knowledge/pipeline/document-processing/knowledge-document.service'

const block = (title: string): StructuredBlock => ({
  blockType: 'paragraph',
  content: '使用互斥锁重建缓存',
  title,
  sectionPath: [title]
})

test('chunk hash changes with content or structural context', () => {
  const original = createKnowledgeChunkHash('使用互斥锁重建缓存', [block('缓存击穿')])

  assert.notEqual(original, createKnowledgeChunkHash('使用逻辑过期重建缓存', [block('缓存击穿')]))
  assert.notEqual(original, createKnowledgeChunkHash('使用互斥锁重建缓存', [block('并发控制')]))
})

test('chunk hash changes when embedding model changes', () => {
  const blocks = [block('cache')]
  assert.notEqual(
    createKnowledgeChunkHash('content', blocks, 'model-v1'),
    createKnowledgeChunkHash('content', blocks, 'model-v2')
  )
})

test('document sync is due only after the configured interval', () => {
  const hour = 60 * 60 * 1000
  assert.equal(isKnowledgeSyncDue(0, 1, hour), true)
  assert.equal(isKnowledgeSyncDue(hour, 1, hour * 1.5), false)
  assert.equal(isKnowledgeSyncDue(hour, 1, hour * 2), true)
})
