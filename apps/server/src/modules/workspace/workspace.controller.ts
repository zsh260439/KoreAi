import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  ApiResponse,
  WorkspaceChatStreamEvent,
  WorkspaceConversationSummary,
  WorkspaceMessage
} from 'share-type'
import { successResponse } from '../../common/api-response'
import { WorkspaceChatService } from './chat/workspace-chat.service'
import { WorkspaceConversationService } from './conversation/workspace-conversation.service'
import { CreateWorkspaceConversationDto, WorkspaceChatDto } from './dto/workspace.dto'

@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly conversationService: WorkspaceConversationService,
    private readonly chatService: WorkspaceChatService
  ) {}

  @Get('conversations')
  async findConversations(): Promise<ApiResponse<WorkspaceConversationSummary[]>> {
    const data = await this.conversationService.findConversations()
    return successResponse(data, '查询成功')
  }

  @Post('conversations')
  async createConversation(
    @Body() dto: CreateWorkspaceConversationDto
  ): Promise<ApiResponse<WorkspaceConversationSummary>> {
    const data = await this.conversationService.createConversation(dto)
    return successResponse(data, '创建成功')
  }

  @Get('conversations/:conversationId/messages')
  async findConversationMessages(
    @Param('conversationId') conversationId: string
  ): Promise<ApiResponse<WorkspaceMessage[]>> {
    const data = await this.conversationService.findConversationMessages(conversationId)
    return successResponse(data, '查询成功')
  }

  @Delete('conversations/:conversationId')
  async deleteConversation(
    @Param('conversationId') conversationId: string
  ): Promise<ApiResponse<WorkspaceConversationSummary>> {
    const data = await this.conversationService.deleteConversation(conversationId)
    return successResponse(data, '删除成功')
  }

  @Post('chat/stream')
  async chatStream(
    @Body() dto: WorkspaceChatDto,
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse
  ): Promise<void> {
    const abortController = new AbortController()
    request.on('close', () => {
      if (!response.writableEnded) {
        abortController.abort()
      }
    })

    response.statusCode = 200
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-transform')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders()

    try {
      for await (const event of this.chatService.chatStream(dto, {
        signal: abortController.signal
      })) {
        if (abortController.signal.aborted) {
          break
        }

        response.write(`${JSON.stringify(event)}\n`)
      }
    } catch (error) {
      if (!abortController.signal.aborted && !response.writableEnded) {
        const event: WorkspaceChatStreamEvent = {
          type: 'error',
          message: error instanceof Error ? error.message : '\u6d41\u5f0f\u95ee\u7b54\u5931\u8d25'
        }

        response.write(`${JSON.stringify(event)}\n`)
      }
    } finally {
      response.end()
    }
  }
}
