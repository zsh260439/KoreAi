import { ChatOpenAI } from "@langchain/openai";
import {Injectable,InternalServerErrorException} from '@nestjs/common'
import { KnowledgeSearchHit } from 'share-type'
@Injectable()
export class KnowledgeQaService {
    private client:ChatOpenAI | null = null

  async answerQuestion(query: string, hits: KnowledgeSearchHit[]): Promise<string> {
  const hasKnowledge = hits && hits.length > 0;
 const systemPrompt = hasKnowledge
  ? `你是专业问答助手。
请优先根据提供的知识库内容回答。
如果问题中的部分信息不在知识库中，可以基于通用知识补充回答，但必须明确说明哪些内容来自知识库，哪些内容来自通用知识，不要把通用知识伪装成知识库事实。`
  : `你是专业问答助手。
当前没有检索到相关知识库内容，请基于通用知识回答。
回答开头必须加上：
当前知识库不存在相关知识，以下内容基于通用知识，请注意甄别。`
  const response = await this.getClient().invoke([
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `用户问题：${query}\n\n知识库片段:\n${buildContext(hits)}`,
    },
  ]);

  // 4. 提取并返回答案
  return extractMessageText(response.content);
}

 getModelName():string | null {
     return process.env.LLM_MODEL??null
 }

      //获取client
    private getClient():ChatOpenAI{
       if(this.client){
        return this.client
       }
       //初始化新的client
       const apiKey = process.env.LLM_API_KEY
       const model = process.env.LLM_MODEL
       if(!apiKey || !model){
        throw new InternalServerErrorException('LLM API key or model not set')
       }
       this.client = new ChatOpenAI({
        apiKey,
        model,
        temperature: 0.2,
        configuration: {
           baseURL: normalizeLlmBaseUrl(process.env.LLM_BASE_URL),
        }
       })
       return this.client
    }
}
  // 构建上下文字符串
 function buildContext(hits:KnowledgeSearchHit[]):string {
     return hits.map((item,index)=>`
     [${index+1}]
     documentId:${item.documentId}
     documentName:${item.documentName}
     content:${item.content}
     `).join('\n\n')
 }

 // 从模型响应中提取消息文本
 function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (item && typeof item === 'object') {
        const text = (item as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      }

      return ''
    })
    .join('\n')
    .trim()
}

function normalizeLlmBaseUrl(value?: string): string | undefined {
  if (!value) return undefined
  return value.replace(/\/chat\/completions\/?$/, '')
}