import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, Method } from 'axios'
import type { ApiResponse } from 'share-type'

export type SubmitData = object | FormData

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

export function buildApiUrl(path: string): string {
  if (!API_BASE_URL) {
    return path
  }

  const normalizedBase = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`
  return new URL(path, normalizedBase).toString()
}

const httpInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
})

httpInstance.interceptors.response.use(
  (response) => response.data,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const responseMessage = error.response?.data?.message
      if (typeof responseMessage === 'string' && responseMessage.trim()) {
        return Promise.reject(new Error(responseMessage))
      }

      return Promise.reject(new Error(error.message || '请求失败'))
    }

    return Promise.reject(error instanceof Error ? error : new Error('请求失败'))
  }
)

const baseRequest = <T>(
  http: AxiosInstance,
  url: string,
  method: Method,
  submitData?: SubmitData,
  config?: AxiosRequestConfig
) => {
  return http.request<any, ApiResponse<T>>({
    ...config,
    url,
    method,
    [method.toUpperCase() === 'GET' ? 'params' : 'data']: submitData
  })
}

export const request = <T>(
  url: string,
  method: Method = 'GET',
  submitData?: SubmitData,
  config?: AxiosRequestConfig
) => {
  return baseRequest<T>(httpInstance, url, method, submitData, config)
}
