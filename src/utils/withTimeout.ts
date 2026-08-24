type CancelableLike<T> = Promise<T> & {
  cancel?: () => void
}

export function withTimeout<T>(
  promise: CancelableLike<T>,
  timeoutMs: number,
  message = 'Request timed out',
): Promise<T> {
  let timeoutId: number | undefined

  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message))
      promise.cancel?.()
    }, timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  })
}
