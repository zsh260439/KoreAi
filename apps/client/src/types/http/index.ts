import type { ApiResponse } from 'share-type'

export type ApiResult<T> = Promise<ApiResponse<T>>
