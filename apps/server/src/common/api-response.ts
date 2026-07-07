import type { ApiResponse as ApiResponseShape } from 'share-type'

export class ApiResponse<T> implements ApiResponseShape<T> {
  code: number
  message: string
  data: T

  constructor(code: number, message: string, data: T) {
    this.code = code
    this.message = message
    this.data = data
  }

  static success<T>(code = 0, message = '操作成功', data: T): ApiResponse<T> {
    return new ApiResponse(code, message, data)
  }
}
