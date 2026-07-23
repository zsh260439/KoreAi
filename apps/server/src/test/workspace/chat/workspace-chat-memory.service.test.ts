import assert from 'node:assert/strict'
import test from 'node:test'

import type { WorkspaceMessage } from 'share-type'

import type { KnowledgeConfigService } from '../../../modules/knowledge/runtime/config/knowledge-config.service'
import { WorkspaceChatMemoryService } from '../../../modules/workspace/chat/workspace-chat-memory.service'

const configService = {
  findProviderSettings: async () => ({
    runtimeConfig: {
      llm: {
        baseUrl: null,
        model: null
      }
    }
  })
} as unknown as KnowledgeConfigService

test('explicit document query recalls only matching scoped memory facts', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'DOCX-ENE-02 的处置代码是什么?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.equal(resolution.intent, 'new_question')
  assert.equal(resolution.retrievalHints.includes('DOCX-ENE-02'), true)
  assert.equal(resolution.retrievalHints.includes('energy_02_complex.docx'), true)
  assert.equal(resolution.retrievalHints.includes('VISUAL CONTROL DASHBOARD'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('DOCX-ENE-02'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('PDF-ENE-03'), false)
})

test('explicit new document query does not attach unrelated memory facts', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'PDF-ENE-04 的主控制阈值和责任角色是什么?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.deepEqual(resolution.retrievalHints, [])
  assert.equal(resolution.memoryBoardSummary?.includes('DOCX-ENE-02'), false)
  assert.equal(resolution.memoryBoardSummary?.includes('PDF-ENE-03'), false)
})

test('ambiguous follow-up inherits the latest cited document scope', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'that action code?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.equal(resolution.retrievalHints.includes('PDF-ENE-03'), true)
  assert.equal(resolution.retrievalHints.includes('energy_03_complex.pdf'), true)
  assert.equal(resolution.retrievalHints.includes('VISUAL CONTROL DASHBOARD'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('PDF-ENE-03'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('DOCX-ENE-02'), false)
})

test('technical topic follow-up recalls local memory facts before LLM resolution', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: '有没有一个方法，只让一个请求去查数据库，其他请求先等着?',
    messages: [
      userMessage('能不能只让一个请求去查数据库，其他请求先等着?'),
      assistantMessage(
        '互斥锁重建方案：只允许获得锁的请求查询数据库并回填缓存，其他请求等待后重试。',
        'cache_breakdown.md',
        'Redis 缓存击穿处理规范。首选方案是互斥锁重建：只允许获得锁的请求查询数据库并回填缓存，其他请求等待后重试。'
      )
    ],
    conversationTitle: 'redis cache breakdown'
  })

  assert.equal(resolution.intent, 'new_question')
  assert.equal(resolution.memoryBoardSource, 'local')
  assert.equal(resolution.applied, true)
  assert.equal(resolution.retrievalHints.includes('cache_breakdown.md'), true)
  assert.equal(resolution.groundedQuery.includes('cache_breakdown.md'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('互斥锁重建方案'), true)
})

function buildHistory(): WorkspaceMessage[] {
  return [
    userMessage('DOCX-ENE-02 的主控制阈值和责任角色是什么?'),
    assistantMessage(
      '主控制阈值：48%\n责任角色：risk_lead\n预警值：75%\n处置代码：ACT-DENE-22',
      'energy_02_complex.docx',
      'DOCX-ENE-02 VISUAL CONTROL DASHBOARD ALERT THRESHOLD 75% ACTION CODE ACT-DENE-22'
    ),
    userMessage('PDF-ENE-03 的主控制阈值和责任角色是什么?'),
    assistantMessage(
      '主控制阈值：50%\n责任角色：operations_director\n预警值：75%\n处置代码：ACT-PENE-23',
      'energy_03_complex.pdf',
      'PDF-ENE-03 VISUAL CONTROL DASHBOARD ALERT THRESHOLD 75% ACTION CODE ACT-PENE-23'
    )
  ]
}

function userMessage(content: string): WorkspaceMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: 'conversation-id',
    role: 'user',
    content,
    citations: null,
    retrievalDebug: null,
    model: null,
    latencyMs: null,
    totalTokens: null,
    reasoningSteps: null,
    promptCapabilities: null,
    createdAt: new Date().toISOString()
  }
}

function assistantMessage(
  content: string,
  documentName: string,
  citationContent: string
): WorkspaceMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: 'conversation-id',
    role: 'assistant',
    content,
    citations: [
      {
        chunkId: crypto.randomUUID(),
        documentId: crypto.randomUUID(),
        documentName,
        content: citationContent,
        score: 100,
        sequence: 1,
        sectionPath: 'VISUAL CONTROL DASHBOARD',
        primaryTitle: 'VISUAL CONTROL DASHBOARD',
        scoreDetail: {
          matchedBy: ['bm25'],
          bm25Score: 100,
          vectorScore: null,
          fusedScore: 100
        }
      }
    ],
    retrievalDebug: null,
    model: 'test-model',
    latencyMs: 100,
    totalTokens: 100,
    reasoningSteps: null,
    promptCapabilities: null,
    createdAt: new Date().toISOString()
  }
}
