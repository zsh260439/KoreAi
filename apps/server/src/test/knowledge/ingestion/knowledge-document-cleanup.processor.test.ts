import assert from 'node:assert/strict'
import test from 'node:test'

import { canDeleteRevision } from '../../../modules/knowledge/pipeline/document-processing/knowledge-document-cleanup.processor'

test('revision cleanup never deletes the active revision', () => {
  assert.equal(canDeleteRevision('revision-1', 'revision-1'), false)
  assert.equal(canDeleteRevision('revision-2', 'revision-1'), true)
})

