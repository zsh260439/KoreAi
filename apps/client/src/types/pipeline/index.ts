import type { ExecutionStatus } from '../chat'

export interface PipelineTask {
  id: string
  name: string
  type: 'pipeline' | 'task'
  status: ExecutionStatus
  progress: number
  updatedAt: string
  owner: string
  detail: string
}

export type PipelineNodeType = 'fetcher' | 'parser' | 'enhancer' | 'chunker' | 'indexer'

export interface PipelineEnhancerTask {
  id: string
  taskType: string
  systemPrompt: string
  userPromptTemplate: string
}

export interface PipelineNode {
  id: string
  nodeId: string
  nodeType: PipelineNodeType
  nextNodeId: string
  condition: string
  parserRules: string
  modelId: string
  enhanceTasks: PipelineEnhancerTask[]
  chunkStrategy: string
  chunkSize: number | null
  overlapSize: number | null
  customSeparator: string
  embeddingModel: string
  metadataFields: string
}

export interface PipelineDefinition {
  id: string
  name: string
  detail: string
  owner: string
  updatedAt: string
  nodes: PipelineNode[]
}

export interface PipelineDefinitionPayload {
  name: string
  detail: string
  owner: string
  nodes: PipelineNode[]
}
