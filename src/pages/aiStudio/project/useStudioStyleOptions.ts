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

/** 加载两个类别，同时对并发请求去重。 */
async function loadStudioStyleOptions(): Promise<StudioStyleOptionGroups> {
  if (loadingOptionsPromise) return loadingOptionsPromise

  loadingOptionsPromise = Promise.all([
    StudioStylesApi.getOptions(1),
    StudioStylesApi.getOptions(2),
  ]).then(([visual, tone]) => ({ visual, tone })).finally(() => {
    loadingOptionsPromise = null
  })

  return loadingOptionsPromise
}

/** 暴露两类在线风格列表，以及创建自定义风格后使用的刷新方法。 */
export function useStudioStyleOptions() {
  const [options, setOptions] = useState<StudioStyleOptionGroups>(EMPTY_OPTIONS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const nextOptions = await loadStudioStyleOptions()
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

  useEffect(() => {
    mountedRef.current = true
    void refresh().catch(() => undefined)
    return () => {
      mountedRef.current = false
    }
  }, [refresh])

  return { options, loading, error, refresh }
}
