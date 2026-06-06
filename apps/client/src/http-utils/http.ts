import type { ApiResult } from '@/types'
import type { AxiosInstance } from 'axios'
import type { AxiosRequestConfig } from 'axios'
import type { Method } from 'axios'
import axios from 'axios'
export type SubmitData = object | FormData

const httpInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 10000,
})

httpInstance.interceptors.request.use(
    (config) => {
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

httpInstance.interceptors.response.use(
    (response) => {
        return response.data
    },
    (error) => {
        return Promise.reject(error)
    }
)

//统一request封装
const baseRequest = <T>(
    http:AxiosInstance,
    url:string,
    method:Method,
    submitData?:SubmitData,
    config?: AxiosRequestConfig,
) =>{
    return http.request<any,ApiResult<T>>({
      ...config,
      url,
      method,
      [method.toUpperCase() === 'GET'? 'params':'data']:submitData,
    })
}

export const request = <T>(
    url:string,
    method:Method = 'GET',
    submitData?:SubmitData,
    config?: AxiosRequestConfig,
) =>{
    return baseRequest<T>(httpInstance,url,method,submitData,config)
}
