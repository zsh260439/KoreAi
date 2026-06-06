import { Body, Controller, Post } from '@nestjs/common'
import { ApiResponse } from '../../common/api-response'
import type { KnowledgeAskResult } from 'share-type'
import { WorkspaceChatDto } from './dto/workspace.dto'
import { WorkspaceService } from './workspace.service'

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post('chat')
  async chat(
    @Body() dto: WorkspaceChatDto
  ): Promise<ApiResponse<KnowledgeAskResult>> {
    const data = await this.workspaceService.chat(dto)
    return ApiResponse.success(0, '问答成功', data)
  }
}