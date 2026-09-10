import { useCallback, useEffect, useRef, useState } from 'react'
import { getStoredAuthUser } from '../../../auth'
import { StudioStylesApi } from '../../../services/studioStyles'
import type { StudioStyleOption } from '../../../services/studioStyles'

export type StudioStyleOptionGroups = {
  visual: StudioStyleOption[]
  tone: StudioStyleOption[]
}

type StyleOptionsCacheEntry = {
  options: StudioStyleOptionGroups
  expiresAt: number
  staleUntil: number
}

const EMPTY_OPTIONS: StudioStyleOptionGroups = {
  visual: [],
  tone: [],
}
const STYLE_OPTIONS_CACHE_TTL_MS = 5 * 60 * 1000
const STYLE_OPTIONS_STALE_TTL_MS = 30 * 60 * 1000
const STYLE_OPTIONS_MAX_USER_SCOPES = 4
const loadingOptionsPromises = new Map<string, Promise<StudioStyleOptionGroups>>()
const cachedOptionsByUser = new Map<string, StyleOptionsCacheEntry>()

const getStyleOptionsUserScope = () => {
  const user = getStoredAuthUser()
  return String(user?.id ?? user?.username ?? 'anonymous')
}

const readCachedOptions = (userScope: string, allowStale = false) => {
  const entry = cachedOptionsByUser.get(userScope)
  if (!entry) return undefined
  const now = Date.now()
  if (entry.staleUntil <= now) {
    cachedOptionsByUser.delete(userScope)
    return undefined
  }
  if (!allowStale && entry.expiresAt <= now) return undefined

  // Map 的插入顺序同时作为轻量 LRU；活跃用户移动到末尾。
  cachedOptionsByUser.delete(userScope)
  cachedOptionsByUser.set(userScope, entry)
  return entry
}

const writeCachedOptions = (userScope: string, options: StudioStyleOptionGroups) => {
  const now = Date.now()
  cachedOptionsByUser.delete(userScope)
  cachedOptionsByUser.set(userScope, {
    options,
    expiresAt: now + STYLE_OPTIONS_CACHE_TTL_MS,
    staleUntil: now + STYLE_OPTIONS_STALE_TTL_MS,
  })
  while (cachedOptionsByUser.size > STYLE_OPTIONS_MAX_USER_SCOPES) {
    const oldestScope = cachedOptionsByUser.keys().next().value as string | undefined
    if (oldestScope === undefined) break
    cachedOptionsByUser.delete(oldestScope)
    loadingOptionsPromises.delete(oldestScope)
  }
}

/** 加载两个类别，按登录用户缓存，并对并发请求去重。 */
async function loadStudioStyleOptions(
  userScope: string,
  force = false,
): Promise<StudioStyleOptionGroups> {
  const cached = readCachedOptions(userScope)
  if (!force && cached) return cached.options
  const pending = loadingOptionsPromises.get(userScope)
  if (pending) return pending

  const request = Promise.all([
    StudioStylesApi.getOptions(1),
    StudioStylesApi.getOptions(2),
  ])
    .then(([visual, tone]) => {
      const options = { visual, tone }
      writeCachedOptions(userScope, options)
      return options
    })
    .finally(() => {
      if (loadingOptionsPromises.get(userScope) === request) {
        loadingOptionsPromises.delete(userScope)
      }
    })
  loadingOptionsPromises.set(userScope, request)
  return request
}

/** 暴露两类在线风格列表，以及创建自定义风格后使用的刷新方法。 */
export function useStudioStyleOptions(enabled = true) {
  const userScope = getStyleOptionsUserScope()
  const initialCache = readCachedOptions(userScope, true)
  const [options, setOptions] = useState<StudioStyleOptionGroups>(initialCache?.options ?? EMPTY_OPTIONS)
  const [loading, setLoading] = useState(enabled && !initialCache)
  const [error, setError] = useState<unknown>()
  const mountedRef = useRef(true)
  const activeUserScopeRef = useRef(userScope)
  activeUserScopeRef.current = userScope

  const applyOptions = useCallback(async (force: boolean) => {
    setLoading(true)
    try {
      const nextOptions = await loadStudioStyleOptions(userScope, force)
      if (mountedRef.current && activeUserScopeRef.current === userScope) {
        setOptions(nextOptions)
        setError(undefined)
      }
      return nextOptions
    } catch (reason: unknown) {
      if (mountedRef.current && activeUserScopeRef.current === userScope) setError(reason)
      throw reason
    } finally {
      if (mountedRef.current && activeUserScopeRef.current === userScope) setLoading(false)
    }
  }, [userScope])
  const refresh = useCallback(() => applyOptions(true), [applyOptions])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) {
      setLoading(false)
      setError(undefined)
    } else {
      const cached = readCachedOptions(userScope, true)
      if (!cached) {
        void applyOptions(false).catch(() => undefined)
      } else {
        setOptions(cached.options)
        setError(undefined)
        setLoading(false)
        if (cached.expiresAt <= Date.now()) {
          // 过期时先展示旧快照，再静默更新；刷新失败不阻塞工作流。
          void loadStudioStyleOptions(userScope, true)
            .then((nextOptions) => {
              if (mountedRef.current && activeUserScopeRef.current === userScope) {
                setOptions(nextOptions)
              }
            })
            .catch(() => undefined)
        }
      }
    }
    return () => {
      mountedRef.current = false
    }
  }, [applyOptions, enabled, userScope])

  return { options, loading, error, refresh }
}
