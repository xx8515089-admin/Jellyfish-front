type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

/** 从生成服务使用的后端 ApiResponse 包装结构中提取 data 数据。 */
export function unwrapApiData<T>(response: ApiEnvelope<unknown>, fallback: string): T {
  if ((response.code ?? 200) >= 400 || response.data == null) {
    throw new Error(response.message || fallback)
  }
  return response.data as T
}
