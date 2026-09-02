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

type FullDraftWriteSettled = (error?: unknown) => void
type QueuedFullDraftWrite = {
  draft: DraftEnvelope<unknown>
  onSettled?: FullDraftWriteSettled
}

let draftDatabasePromise: Promise<IDBDatabase> | undefined
const queuedFullDrafts = new Map<string, QueuedFullDraftWrite>()
const activeFullDraftWrites = new Set<string>()
const activeFullDraftWriteWorkers = new Map<string, Promise<void>>()
let lastDraftTimestamp = 0
let namespaceClearedAt = 0
const keyClearedAt = new Map<string, number>()
let namespaceWriteSuspensions = 0
const keyWriteSuspensions = new Map<string, number>()

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

const PROJECT_CREATION_DRAFT_PREFIXES = [
  'jellyfish:project-creation:v2:',
  'jellyfish:project-creation:v1:',
] as const

const createDraftTimestamp = () => {
  lastDraftTimestamp = Math.max(Date.now(), lastDraftTimestamp + 1)
  return lastDraftTimestamp
}

const draftWasCleared = (key: string, updatedAt: number) => updatedAt <= Math.max(
  namespaceClearedAt,
  keyClearedAt.get(key) ?? 0,
)

const draftWritesSuspended = (key: string) => namespaceWriteSuspensions > 0
  || (keyWriteSuspensions.get(key) ?? 0) > 0

const suspendDraftWrites = (keys: readonly string[], wholeNamespace: boolean) => {
  if (wholeNamespace) namespaceWriteSuspensions += 1
  keys.forEach((key) => {
    keyWriteSuspensions.set(key, (keyWriteSuspensions.get(key) ?? 0) + 1)
  })
}

const resumeDraftWrites = (keys: readonly string[], wholeNamespace: boolean) => {
  if (wholeNamespace) namespaceWriteSuspensions = Math.max(0, namespaceWriteSuspensions - 1)
  keys.forEach((key) => {
    const remaining = (keyWriteSuspensions.get(key) ?? 0) - 1
    if (remaining > 0) keyWriteSuspensions.set(key, remaining)
    else keyWriteSuspensions.delete(key)
  })
}

/** 跨页面卸载临时冻结整个创建草稿命名空间，避免子步骤 cleanup 把刚清除的草稿写回。 */
export const holdProjectCreationDraftWrites = () => {
  namespaceWriteSuspensions += 1
  let released = false
  return () => {
    if (released) return
    released = true
    namespaceWriteSuspensions = Math.max(0, namespaceWriteSuspensions - 1)
  }
}

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
  if (draftWritesSuspended(key) || draftWasCleared(key, draft.updatedAt)) return false
  const database = await getDraftDatabase()
  if (draftWritesSuspended(key) || draftWasCleared(key, draft.updatedAt)) return false
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE_NAME, 'readwrite')
    transaction.objectStore(DRAFT_STORE_NAME).put(draft, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  return true
}

const notifyFullDraftWriteSettled = (
  callback: FullDraftWriteSettled | undefined,
  error?: unknown,
) => {
  try {
    callback?.(error)
  } catch {
    // 草稿状态通知不能中断后续队列写入。
  }
}

/** 同一草稿有在途写入时只保留最新快照，避免高频修改堆积 IndexedDB 事务。 */
const queueFullDraftWrite = <T,>(
  key: string,
  draft: DraftEnvelope<T>,
  onSettled?: FullDraftWriteSettled,
) => {
  queuedFullDrafts.set(key, {
    draft: draft as DraftEnvelope<unknown>,
    onSettled,
  })
  if (activeFullDraftWrites.has(key)) return

  activeFullDraftWrites.add(key)
  const worker = (async () => {
    try {
      while (queuedFullDrafts.has(key)) {
        const latestWrite = queuedFullDrafts.get(key)
        queuedFullDrafts.delete(key)
        if (!latestWrite) continue
        try {
          const written = await writeFullDraft(key, latestWrite.draft)
          if (written) notifyFullDraftWriteSettled(latestWrite.onSettled)
        } catch (error) {
          notifyFullDraftWriteSettled(latestWrite.onSettled, error)
        }
      }
    } finally {
      activeFullDraftWrites.delete(key)
    }
  })()
  activeFullDraftWriteWorkers.set(key, worker)
  void worker.finally(() => {
    if (activeFullDraftWriteWorkers.get(key) === worker) {
      activeFullDraftWriteWorkers.delete(key)
    }
  })
}

const deleteFullDrafts = async (
  keys: readonly string[],
  prefixes: readonly string[] = [],
) => {
  try {
    const database = await getDraftDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DRAFT_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(DRAFT_STORE_NAME)
      keys.forEach((key) => store.delete(key))
      if (prefixes.length > 0) {
        const cursorRequest = store.openKeyCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return
          const storedKey = String(cursor.primaryKey)
          if (prefixes.some((prefix) => storedKey.startsWith(prefix))) {
            store.delete(cursor.primaryKey)
          }
          cursor.continue()
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    return true
  } catch {
    return false
  }
}

const persistDraft = <T,>(
  key: string,
  value: T,
  compactValue: unknown = value,
  onFullDraftWriteSettled?: FullDraftWriteSettled,
) => {
  if (typeof window === 'undefined' || draftWritesSuspended(key)) return false

  try {
    const updatedAt = createDraftTimestamp()
    const compactDraft: DraftEnvelope<unknown> = {
      version: DRAFT_VERSION,
      updatedAt,
      data: compactValue,
    }
    const fullDraft: DraftEnvelope<T> = {
      version: DRAFT_VERSION,
      updatedAt,
      data: value,
    }

    const serializedCompactDraft = JSON.stringify(compactDraft, (_property, childValue) => {
      if (
        typeof childValue === 'string'
        && childValue.startsWith('data:')
        && childValue.length > LARGE_DATA_URL_LENGTH
      ) {
        return undefined
      }
      return childValue
    })
    try {
      window.localStorage.setItem(key, serializedCompactDraft)
    } catch {
      // 先移除可能占空间的旧同步副本，再用精简草稿重试一次。
      try {
        window.localStorage.removeItem(key)
        window.localStorage.setItem(key, serializedCompactDraft)
      } catch {
        // localStorage 完全不可用或仍然已满时，完整草稿继续写入 IndexedDB。
      }
    }
    queueFullDraftWrite(key, fullDraft, onFullDraftWriteSettled)
    return true
  } catch (error) {
    notifyFullDraftWriteSettled(onFullDraftWriteSettled, error)
    // 草稿持久化绝不能阻塞编辑操作。
    return false
  }
}

export const readProjectCreationDraft = <T,>(key: string): T | undefined => {
  return readLocalDraftEnvelope<T>(key)?.data
}

export const clearProjectCreationDrafts = (
  keys: readonly string[] = DEFAULT_PROJECT_CREATION_DRAFT_KEYS,
) => {
  if (typeof window === 'undefined') return Promise.resolve(true)

  const clearingDefaultDrafts = keys === DEFAULT_PROJECT_CREATION_DRAFT_KEYS
  const clearTimestamp = createDraftTimestamp()
  const localNamespaceKeys: string[] = []
  let localDraftsCleared = true
  if (clearingDefaultDrafts) {
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const storedKey = window.localStorage.key(index)
        if (
          storedKey
          && PROJECT_CREATION_DRAFT_PREFIXES.some((prefix) => storedKey.startsWith(prefix))
        ) {
          localNamespaceKeys.push(storedKey)
        }
      }
    } catch {
      // localStorage 不可用时仍继续清理已知 key 和 IndexedDB 命名空间。
      localDraftsCleared = false
    }
    namespaceClearedAt = clearTimestamp
  }
  const keysToClear = clearingDefaultDrafts
    ? [...new Set([
      ...keys,
      ...LEGACY_PROJECT_CREATION_DRAFT_KEYS,
      ...localNamespaceKeys,
    ])]
    : [...keys]
  keysToClear.forEach((key) => {
    queuedFullDrafts.delete(key)
    keyClearedAt.set(key, clearTimestamp)
    try {
      window.localStorage.removeItem(key)
    } catch {
      // IndexedDB 清理仍会继续执行。
      localDraftsCleared = false
    }
  })
  suspendDraftWrites(keysToClear, clearingDefaultDrafts)
  const prefixesToClear = clearingDefaultDrafts ? PROJECT_CREATION_DRAFT_PREFIXES : []
  const activeWritesToWaitFor = [...activeFullDraftWriteWorkers.entries()]
    .filter(([key]) => keysToClear.includes(key)
      || prefixesToClear.some((prefix) => key.startsWith(prefix)))
    .map(([, worker]) => worker)
  return Promise.all(activeWritesToWaitFor)
    .then(() => deleteFullDrafts(keysToClear, prefixesToClear))
    .then((fullDraftsCleared) => localDraftsCleared && fullDraftsCleared)
    .finally(() => {
      resumeDraftWrites(keysToClear, clearingDefaultDrafts)
    })
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
    if (draftWasCleared(key, draft.updatedAt)) return undefined

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
  compactValue?: unknown,
  onFullDraftWriteSettled?: FullDraftWriteSettled,
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
  const latestCompactValueRef = useRef<unknown>(compactValue ?? stableValue)
  latestCompactValueRef.current = compactValue ?? stableValue
  const latestWriteSettledRef = useRef(onFullDraftWriteSettled)
  latestWriteSettledRef.current = onFullDraftWriteSettled
  const lastPersistedRef = useRef<{ key: string; value: T } | undefined>(undefined)
  const flushLatestDraftRef = useRef<() => void>(() => undefined)
  flushLatestDraftRef.current = () => {
    if (persistOnUnmountRef?.current === false) return
    const latestValue = latestValueRef.current
    if (
      lastPersistedRef.current?.key === key
      && Object.is(lastPersistedRef.current.value, latestValue)
    ) return
    const queued = persistDraft<T>(
      key,
      latestValue,
      latestCompactValueRef.current,
      (error) => {
        if (
          error
          && lastPersistedRef.current?.key === key
          && Object.is(lastPersistedRef.current.value, latestValue)
        ) {
          lastPersistedRef.current = undefined
        }
        latestWriteSettledRef.current?.(error)
      },
    )
    if (queued) lastPersistedRef.current = { key, value: latestValue }
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
