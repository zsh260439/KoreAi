import assert from 'node:assert/strict'
import test from 'node:test'

import type { KnowledgeSearchHit } from 'share-type'

import { filterCeRelevantHits } from '../../../modules/knowledge/pipeline/candidate-retrieval/knowledge-ce-ranker'

const hit = (chunkId: string) => ({ chunkId }) as KnowledgeSearchHit

test('removes candidates far below the best CE score', () => {
  const hits = ['core', 'step', 'noise'].map(hit)
  const scores = new Map([
    ['core', 0.98],
    ['step', 0.38],
    ['noise', 0.14]
  ])

  assert.deepEqual(
    filterCeRelevantHits(hits, scores).map((item) => item.chunkId),
    ['core', 'step']
  )
})

test('keeps the original candidates when CE rerank is unavailable', () => {
  const hits = ['first', 'second'].map(hit)

  assert.equal(filterCeRelevantHits(hits, null), hits)
})

