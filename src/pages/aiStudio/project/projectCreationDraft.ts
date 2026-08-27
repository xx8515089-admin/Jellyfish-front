import { useEffect, useMemo, useRef } from 'react'

const DRAFT_VERSION = 1
const LARGE_DATA_URL_LENGTH = 350_000
const DRAFT_DATABASE_NAME = 'jellyfish-project-creation'
const DRAFT_DATABASE_VERSION = 1
const DRAFT_STORE_NAME = 'drafts'

type DraftEnvelope<T> = {
  version: number
  updatedAt: number
  data: T
}

type SerializedDraft = {
  compact: string
  full: string
}

let draftDatabasePromise: Promise<IDBDatabase> | undefined

export const PROJECT_CREATION_DRAFT_KEYS = {
  project: 'jellyfish:project-creation:v1:project',
  assets: 'jellyfish:project-creation:v1:assets',
  clips: 'jellyfish:project-creation:v1:clips',
} as const

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

const persistDraft = <T,>(key: string, serializedDraft: SerializedDraft) => {
  if (!serializedDraft.compact || !serializedDraft.full || typeof window === 'undefined') return

  try {
    const updatedAt = Date.now()
    const compactDraft: DraftEnvelope<T> = {
      version: DRAFT_VERSION,
      updatedAt,
      data: JSON.parse(serializedDraft.compact) as T,
    }
    const fullDraft: DraftEnvelope<T> = {
      version: DRAFT_VERSION,
      updatedAt,
      data: JSON.parse(serializedDraft.full) as T,
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(compactDraft))
    } catch {
      // localStorage 已满时，IndexedDB 仍可保留完整草稿。
    }
    void writeFullDraft(key, fullDraft)
  } catch {
    // 草稿持久化绝不能阻塞编辑操作。
  }
}

export const readProjectCreationDraft = <T,>(key: string): T | undefined => {
  return readLocalDraftEnvelope<T>(key)?.data
}

export const clearProjectCreationDrafts = (
  keys: readonly string[] = Object.values(PROJECT_CREATION_DRAFT_KEYS),
) => {
  if (typeof window === 'undefined') return

  keys.forEach((key) => window.localStorage.removeItem(key))
  void deleteFullDrafts(keys)
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
  const serializedData = useMemo(() => {
    try {
      return {
        compact: JSON.stringify(value, (_property, childValue) => {
          if (
            typeof childValue === 'string'
            && childValue.startsWith('data:')
            && childValue.length > LARGE_DATA_URL_LENGTH
          ) {
            return undefined
          }
          return childValue
        }),
        full: JSON.stringify(value),
      }
    } catch {
      return { compact: '', full: '' }
    }
  }, [value])
  const latestSerializedData = useRef(serializedData)
  latestSerializedData.current = serializedData

  useEffect(() => {
    if (!serializedData.compact || !serializedData.full || typeof window === 'undefined') {
      return undefined
    }

    const timer = window.setTimeout(() => {
      if (persistOnUnmountRef?.current === false) return
      persistDraft<T>(key, serializedData)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [delay, key, persistOnUnmountRef, serializedData])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const flushLatestDraft = () => {
      if (persistOnUnmountRef?.current === false) return
      persistDraft<T>(key, latestSerializedData.current)
    }
    window.addEventListener('pagehide', flushLatestDraft)

    return () => {
      window.removeEventListener('pagehide', flushLatestDraft)
      flushLatestDraft()
    }
  }, [key, persistOnUnmountRef])
}

export const buildEpisodeSourceSignature = (episodes: Array<{ id: string; rawText: string }>) =>
  episodes.map(({ id, rawText }) => `${id}:${rawText}`).join('\u241e')
