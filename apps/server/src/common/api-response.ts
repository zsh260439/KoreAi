import type { ApiResponse } from 'share-type'

export function successResponse<T>(data: T, message = '操作成功'): ApiResponse<T> {
  return { code: 0, message, data }
}
