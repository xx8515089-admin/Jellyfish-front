import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioStylesApi } from '../../../services/studioStyles'
import type { StudioStyleOption } from '../../../services/studioStyles'

export type StudioStyleOptionGroups = {
  visual: StudioStyleOption[]
  tone: StudioStyleOption[]
}

const EMPTY_OPTIONS: StudioStyleOptionGroups = {
  visual: [],
  tone: [],
}

let loadingOptionsPromise: Promise<StudioStyleOptionGroups> | null = null
let cachedOptions: StudioStyleOptionGroups | null = null

/** 加载两个类别，同时对并发请求去重。 */
async function loadStudioStyleOptions(force = false): Promise<StudioStyleOptionGroups> {
  if (!force && cachedOptions) return cachedOptions
  if (loadingOptionsPromise) return loadingOptionsPromise

  loadingOptionsPromise = Promise.all([
    StudioStylesApi.getOptions(1),
    StudioStylesApi.getOptions(2),
  ])
    .then(([visual, tone]) => {
      cachedOptions = { visual, tone }
      return cachedOptions
    })
    .finally(() => {
      loadingOptionsPromise = null
    })

  return loadingOptionsPromise
}

/** 暴露两类在线风格列表，以及创建自定义风格后使用的刷新方法。 */
export function useStudioStyleOptions(enabled = true) {
  const [options, setOptions] = useState<StudioStyleOptionGroups>(cachedOptions ?? EMPTY_OPTIONS)
  const [loading, setLoading] = useState(enabled && !cachedOptions)
  const [error, setError] = useState<unknown>()
  const mountedRef = useRef(true)

  const applyOptions = useCallback(async (force: boolean) => {
    setLoading(true)
    try {
      const nextOptions = await loadStudioStyleOptions(force)
      if (mountedRef.current) {
        setOptions(nextOptions)
        setError(undefined)
      }
      return nextOptions
    } catch (reason: unknown) {
      if (mountedRef.current) setError(reason)
      throw reason
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])
  const refresh = useCallback(() => applyOptions(true), [applyOptions])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) {
      setLoading(false)
      setError(undefined)
    } else if (cachedOptions) {
      setOptions(cachedOptions)
      setError(undefined)
      setLoading(false)
    } else {
      void applyOptions(false).catch(() => undefined)
    }
    return () => {
      mountedRef.current = false
    }
  }, [applyOptions, enabled])

  return { options, loading, error, refresh }
}
