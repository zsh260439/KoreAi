import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

const SUPPORTED_KNOWLEDGE_DOCUMENT_TYPES = new Set(['txt', 'md', 'docx', 'pdf'])
const DEFAULT_KNOWLEDGE_UPLOAD_DIR = resolve(process.cwd(), 'storage', 'knowledge-documents')

//声明上传文件结构
export type UploadedKnowledgeDocumentFile = {
  originalname: string
  buffer: Buffer
  size: number
}

@Injectable()
export class KnowledgeFileService {
  private readonly uploadRootDir: string

  constructor(private readonly configService: ConfigService) {
    const configuredUploadDir = this.configService.get<string>('KNOWLEDGE_UPLOAD_DIR')?.trim()
    this.uploadRootDir = configuredUploadDir
      ? resolve(configuredUploadDir)
      : DEFAULT_KNOWLEDGE_UPLOAD_DIR
  }

  //声明上传文件基础校验
  validateFile(file: UploadedKnowledgeDocumentFile) {
    if (!file.size || file.size <= 0) {
      throw new BadRequestException('Uploaded file cannot be empty')
    }

    const fileType = inferKnowledgeDocumentFileType(file.originalname)
    if (!SUPPORTED_KNOWLEDGE_DOCUMENT_TYPES.has(fileType)) {
      throw new BadRequestException('Only txt, md, docx and pdf files are supported')
    }
  }

  //声明上传文件落盘
  async saveFile(knowledgeBaseId: string, file: UploadedKnowledgeDocumentFile): Promise<string> {
    const targetDir = resolve(this.uploadRootDir, knowledgeBaseId)
    const storedFileName = buildStoredKnowledgeDocumentFileName(file.originalname)
    const targetPath = resolve(targetDir, storedFileName)

    await mkdir(targetDir, { recursive: true })
    await writeFile(targetPath, file.buffer)

    return targetPath
  }

  //声明上传文件安全删除
  async deleteFileSafely(storagePath: string): Promise<void> {
    await unlink(storagePath).catch(() => undefined)
  }
}

//声明知识文档文件类型推断
export function inferKnowledgeDocumentFileType(value: string): string {
  const extension = extname(value).toLowerCase()
  return extension ? extension.slice(1) : 'txt'
}

//声明知识文档文件名去扩展名
export function getKnowledgeDocumentBaseName(value: string): string {
  const extension = extname(value)
  return basename(value, extension)
}

//声明上传文件存储名生成
function buildStoredKnowledgeDocumentFileName(originalName: string): string {
  const extension = extname(originalName).toLowerCase()
  return `${Date.now()}-${randomUUID()}${extension}`
}
