import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  WorkspaceChatStreamEvent,
  WorkspaceConversationSummary,
  WorkspaceMessage
} from 'share-type'
import { ApiResponse } from '../../common/api-response'
import { CreateWorkspaceConversationDto, WorkspaceChatDto } from './dto/workspace.dto'
import { WorkspaceService } from './workspace.service'

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('conversations')
  async findConversations(): Promise<ApiResponse<WorkspaceConversationSummary[]>> {
    const data = await this.workspaceService.findConversations()
    return ApiResponse.success(0, '\u67e5\u8be2\u6210\u529f', data)
  }

  @Post('conversations')
  async createConversation(
    @Body() dto: CreateWorkspaceConversationDto
  ): Promise<ApiResponse<WorkspaceConversationSummary>> {
    const data = await this.workspaceService.createConversation(dto)
    return ApiResponse.success(0, '\u521b\u5efa\u6210\u529f', data)
  }

  @Get('conversations/:conversationId/messages')
  async findConversationMessages(
    @Param('conversationId') conversationId: string
  ): Promise<ApiResponse<WorkspaceMessage[]>> {
    const data = await this.workspaceService.findConversationMessages(conversationId)
    return ApiResponse.success(0, '\u67e5\u8be2\u6210\u529f', data)
  }

  @Delete('conversations/:conversationId')
  async deleteConversation(
    @Param('conversationId') conversationId: string
  ): Promise<ApiResponse<WorkspaceConversationSummary>> {
    const data = await this.workspaceService.deleteConversation(conversationId)
    return ApiResponse.success(0, '\u5220\u9664\u6210\u529f', data)
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

    //声明原生响应状态码设置
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-transform')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders()

    try {
      for await (const event of this.workspaceService.chatStream(dto, {
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
