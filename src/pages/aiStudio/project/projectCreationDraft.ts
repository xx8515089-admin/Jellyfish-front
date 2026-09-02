import { useCallback, useEffect, useRef } from 'react'

const DRAFT_VERSION = 2
const LARGE_DATA_URL_LENGTH = 350_000
const DRAFT_DATABASE_NAME = 'jellyfish-project-creation'
const DRAFT_DATABASE_VERSION = 1
const DRAFT_STORE_NAME = 'drafts'

type DraftEnvelope<T> = {
  version: number
  updatedAt: number
  data: T
}

let draftDatabasePromise: Promise<IDBDatabase> | undefined
const queuedFullDrafts = new Map<string, DraftEnvelope<unknown>>()
const activeFullDraftWrites = new Set<string>()

export const PROJECT_CREATION_DRAFT_KEYS = {
  project: 'jellyfish:project-creation:v2:project',
  assets: 'jellyfish:project-creation:v2:assets',
  clips: 'jellyfish:project-creation:v2:clips',
} as const
const DEFAULT_PROJECT_CREATION_DRAFT_KEYS = Object.values(PROJECT_CREATION_DRAFT_KEYS)

const LEGACY_PROJECT_CREATION_DRAFT_KEYS = [
  'jellyfish:project-creation:v1:project',
  'jellyfish:project-creation:v1:assets',
  'jellyfish:project-creation:v1:clips',
] as const

export const getProjectCreationDraftKey = (
  baseKey: string,
  scriptImportId?: string | number | null,
) => scriptImportId === null || scriptImportId === undefined
  ? baseKey
  : `${baseKey}:import:${encodeURIComponent(String(scriptImportId))}`

const readLocalDraftEnvelope = <T,>(key: string): DraftEnvelope<T> | undefined => {
  if (typeof window === 'undefined') return undefined

  try {
    const rawDraft = window.localStorage.getItem(key)
    if (!rawDraft) return undefined

    const draft = JSON.parse(rawDraft) as Partial<DraftEnvelope<T>>
    if (
      draft.version !== DRAFT_VERSION
      || typeof draft.updatedAt !== 'number'
      || draft.data === undefined
    ) {
      return undefined
    }
    return draft as DraftEnvelope<T>
  } catch {
    return undefined
  }
}

const getDraftDatabase = () => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable'))
  }
  if (draftDatabasePromise) return draftDatabasePromise

  draftDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DRAFT_DATABASE_NAME, DRAFT_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        database.createObjectStore(DRAFT_STORE_NAME)
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => {
      draftDatabasePromise = undefined
      reject(request.error ?? new Error('Unable to open project draft database'))
    }
  })

  return draftDatabasePromise
}

const writeFullDraft = async <T,>(key: string, draft: DraftEnvelope<T>) => {
  try {
    const database = await getDraftDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE_NAME, 'readwrite')
      transaction.objectStore(DRAFT_STORE_NAME).put(draft, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    // 精简的 localStorage 草稿仍可恢复所有非图片编辑数据。
  }
}

/** 同一草稿有在途写入时只保留最新快照，避免高频修改堆积 IndexedDB 事务。 */
const queueFullDraftWrite = <T,>(key: string, draft: DraftEnvelope<T>) => {
  queuedFullDrafts.set(key, draft as DraftEnvelope<unknown>)
  if (activeFullDraftWrites.has(key)) return

  activeFullDraftWrites.add(key)
  void (async () => {
    try {
      while (queuedFullDrafts.has(key)) {
        const latestDraft = queuedFullDrafts.get(key)
        queuedFullDrafts.delete(key)
        if (latestDraft) await writeFullDraft(key, latestDraft)
      }
    } finally {
      activeFullDraftWrites.delete(key)
    }
  })()
}

const deleteFullDrafts = async (keys: readonly string[]) => {
  try {
    const database = await getDraftDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(DRAFT_STORE_NAME)
      keys.forEach((key) => store.delete(key))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    // 对同步首屏恢复路径而言，清除 localStorage 已经足够。
  }
}

const persistDraft = <T,>(key: string, value: T) => {
  if (typeof window === 'undefined') return

  try {
    const updatedAt = Date.now()
    const compactDraft: DraftEnvelope<T> = {
      version: DRAFT_VERSION,
      updatedAt,
      data: value,
    }
    const fullDraft: DraftEnvelope<T> = {
      version: DRAFT_VERSION,
      updatedAt,
      data: value,
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(compactDraft, (_property, childValue) => {
        if (
          typeof childValue === 'string'
          && childValue.startsWith('data:')
          && childValue.length > LARGE_DATA_URL_LENGTH
        ) {
          return undefined
        }
        return childValue
      }))
    } catch {
      // localStorage 已满时，IndexedDB 仍可保留完整草稿。
    }
    queueFullDraftWrite(key, fullDraft)
  } catch {
    // 草稿持久化绝不能阻塞编辑操作。
  }
}

export const readProjectCreationDraft = <T,>(key: string): T | undefined => {
  return readLocalDraftEnvelope<T>(key)?.data
}

export const clearProjectCreationDrafts = (
  keys: readonly string[] = DEFAULT_PROJECT_CREATION_DRAFT_KEYS,
) => {
  if (typeof window === 'undefined') return

  const keysToClear = keys === DEFAULT_PROJECT_CREATION_DRAFT_KEYS
    ? [...keys, ...LEGACY_PROJECT_CREATION_DRAFT_KEYS]
    : [...keys]
  keysToClear.forEach((key) => {
    queuedFullDrafts.delete(key)
    window.localStorage.removeItem(key)
  })
  void deleteFullDrafts(keysToClear)
}

export const readFullProjectCreationDraft = async <T,>(key: string): Promise<T | undefined> => {
  try {
    const database = await getDraftDatabase()
    const draft = await new Promise<DraftEnvelope<T> | undefined>((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE_NAME, 'readonly')
      const request = transaction.objectStore(DRAFT_STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as DraftEnvelope<T> | undefined)
      request.onerror = () => reject(request.error)
    })
    if (draft?.version !== DRAFT_VERSION || draft.data === undefined) return undefined

    const localDraft = readLocalDraftEnvelope<T>(key)
    if (localDraft && draft.updatedAt < localDraft.updatedAt) return undefined
    return draft.data
  } catch {
    return undefined
  }
}

export const useProjectCreationDraft = <T,>(
  key: string,
  value: T,
  delay = 350,
  persistOnUnmountRef?: { current: boolean },
) => {
  const stableValueRef = useRef(value)
  const previousValue = stableValueRef.current
  const valuesAreShallowEqual = Object.is(previousValue, value) || (
    previousValue !== null
    && value !== null
    && typeof previousValue === 'object'
    && typeof value === 'object'
    && !Array.isArray(previousValue)
    && !Array.isArray(value)
    && (() => {
      const previousRecord = previousValue as Record<string, unknown>
      const nextRecord = value as Record<string, unknown>
      const previousKeys = Object.keys(previousRecord)
      const nextKeys = Object.keys(nextRecord)
      return previousKeys.length === nextKeys.length
        && previousKeys.every((property) => Object.is(previousRecord[property], nextRecord[property]))
    })()
  )
  if (!valuesAreShallowEqual) stableValueRef.current = value
  const stableValue = stableValueRef.current
  const latestValueRef = useRef(stableValue)
  latestValueRef.current = stableValue
  const lastPersistedRef = useRef<{ key: string; value: T } | undefined>(undefined)
  const flushLatestDraftRef = useRef<() => void>(() => undefined)
  flushLatestDraftRef.current = () => {
    if (persistOnUnmountRef?.current === false) return
    const latestValue = latestValueRef.current
    if (
      lastPersistedRef.current?.key === key
      && Object.is(lastPersistedRef.current.value, latestValue)
    ) return
    persistDraft<T>(key, latestValue)
    lastPersistedRef.current = { key, value: latestValue }
  }
  const flushLatestDraft = useCallback(() => {
    flushLatestDraftRef.current()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const timer = window.setTimeout(() => {
      flushLatestDraftRef.current()
    }, delay)

    return () => window.clearTimeout(timer)
  }, [delay, key, persistOnUnmountRef, stableValue])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const flushLatestDraft = () => {
      flushLatestDraftRef.current()
    }
    window.addEventListener('pagehide', flushLatestDraft)

    return () => {
      window.removeEventListener('pagehide', flushLatestDraft)
      flushLatestDraft()
    }
  }, [persistOnUnmountRef])

  return flushLatestDraft
}

/** 使用短摘要标识剧本内容，避免把整剧原文复制进每个步骤草稿。 */
export const buildEpisodeSourceSignature = (episodes: Array<{ id: string; rawText: string }>) => {
  let hash = 2166136261
  let characterCount = 0
  episodes.forEach(({ id, rawText }) => {
    const source = `${id}\u0000${rawText}\u241e`
    characterCount += source.length
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
  })
  return `${episodes.length}:${characterCount}:${(hash >>> 0).toString(36)}`
}
