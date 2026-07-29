import type { KnowledgeDocumentEntity } from '../../entity/knowledge-document.entity'
import type { ParsedDocument, StructuredBlock } from './knowledge-document.parser'

export type KnowledgeChunkSearchableFields = {
  knowledgeBaseId: string
  documentName: string
  fileType: string | null
  sourceKind: string | null
  primaryTitle: string | null
  sectionPath: string | null
  blockTypes: string | null
}
// 构建知识块的搜索字段。
export function buildKnowledgeChunkSearchableFields(
  document: KnowledgeDocumentEntity,
  parsedDocument: Pick<ParsedDocument, 'fileType' | 'sourceKind'>,
  blocks: StructuredBlock[]
): KnowledgeChunkSearchableFields {
  return {
    knowledgeBaseId: document.knowledgeBaseId,
    documentName: document.name,
    fileType: parsedDocument.fileType || null,
    sourceKind: parsedDocument.sourceKind || null,
    primaryTitle: resolvePrimaryTitle(blocks),
    sectionPath: resolveSectionPath(blocks),
    blockTypes: resolveBlockTypes(blocks)
  }
}

function resolvePrimaryTitle(blocks:StructuredBlock[]): string | null {
  for(const block of blocks){
      if(block.title?.trim()){
        return block.title.trim()
      } 
      if(block.blockType === 'heading' && block.content.trim()){
          return block.content.trim()
      }
  }
  return null
}

function resolveSectionPath(blocks:StructuredBlock[]): string | null {
   const path = blocks.find((block)=>block.sectionPath.length >0)?.sectionPath ?? []
   if(!path.length){
    return null
   }
   return path.join('>')
}

function resolveBlockTypes(blocks:StructuredBlock[]): string | null {
    const values = Array.from(
        new Set(blocks.map((block)=>block.blockType.trim()).filter(Boolean))
    )
    return values.join(' ')
}



