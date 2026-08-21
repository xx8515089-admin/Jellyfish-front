type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

/** Extracts the data payload from the backend ApiResponse envelope used by generated services. */
export function unwrapApiData<T>(response: ApiEnvelope<unknown>, fallback: string): T {
  if ((response.code ?? 200) >= 400 || response.data == null) {
    throw new Error(response.message || fallback)
  }
  return response.data as T
}
