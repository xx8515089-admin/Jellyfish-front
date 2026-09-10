import { getStoredAuthUser } from '../../../auth'
import { StudioScriptsApi } from '../../../services/studioScripts'
import type {
  StudioScriptImportId,
  StudioScriptParseChapter,
  StudioScriptParseResult,
} from '../../../services/studioScripts'

type ChapterCacheEntry = {
  chapters: StudioScriptParseChapter[]
  expiresAt: number
}

type DetailCacheEntry = {
  detail: StudioScriptParseResult
  expiresAt: number
}

const RESUME_CACHE_TTL = 30_000
const RESUME_CACHE_MAX_ENTRIES = 12
const chapterCache = new Map<string, ChapterCacheEntry>()
const chapterRequests = new Map<string, Promise<StudioScriptParseChapter[]>>()
const chapterRevisions = new Map<string, number>()
const detailCache = new Map<string, DetailCacheEntry>()
const detailRequests = new Map<string, Promise<StudioScriptParseResult>>()
const detailRevisions = new Map<string, number>()

const toCacheKey = (scriptImportId: StudioScriptImportId) => {
  const user = getStoredAuthUser()
  const userScope = user?.id ?? user?.username ?? 'anonymous'
  return `${String(userScope)}:${String(scriptImportId)}`
}
const getRevision = (revisions: Map<string, number>, cacheKey: string) => revisions.get(cacheKey) ?? 0
const bumpRevision = (revisions: Map<string, number>, cacheKey: string) => {
  const nextRevision = getRevision(revisions, cacheKey) + 1
  revisions.set(cacheKey, nextRevision)
  return nextRevision
}

const withDetailChapters = (
  detail: StudioScriptParseResult,
  chapters?: StudioScriptParseChapter[],
): StudioScriptParseResult => {
  const nextDetail = { ...detail }
  if (chapters === undefined) {
    delete nextDetail.chapters
  } else {
    nextDetail.chapters = chapters
  }
  return nextDetail
}

const syncCachedDetailChapters = (
  cacheKey: string,
  chapters?: StudioScriptParseChapter[],
) => {
  const detailEntry = detailCache.get(cacheKey)
  if (!detailEntry) return
  detailCache.set(cacheKey, {
    ...detailEntry,
    detail: withDetailChapters(detailEntry.detail, chapters),
  })
}

const writeDetailCache = (cacheKey: string, entry: DetailCacheEntry) => {
  detailCache.delete(cacheKey)
  detailCache.set(cacheKey, entry)
  while (detailCache.size > RESUME_CACHE_MAX_ENTRIES) {
    const oldestKey = detailCache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    bumpRevision(detailRevisions, oldestKey)
    detailCache.delete(oldestKey)
    detailRequests.delete(oldestKey)
  }
}

const writeChapterCache = (cacheKey: string, entry: ChapterCacheEntry) => {
  chapterCache.delete(cacheKey)
  chapterCache.set(cacheKey, entry)
  while (chapterCache.size > RESUME_CACHE_MAX_ENTRIES) {
    const oldestKey = chapterCache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    bumpRevision(chapterRevisions, oldestKey)
    chapterCache.delete(oldestKey)
    chapterRequests.delete(oldestKey)
    syncCachedDetailChapters(oldestKey)
  }
}

/** 用权威响应更新详情缓存，并使更早发出的详情请求失去回写资格。 */
export const primeScriptImportDetail = (
  scriptImportId: StudioScriptImportId,
  detail: StudioScriptParseResult,
) => {
  const cacheKey = toCacheKey(scriptImportId)
  bumpRevision(detailRevisions, cacheKey)
  detailRequests.delete(cacheKey)
  writeDetailCache(cacheKey, {
    detail,
    expiresAt: Date.now() + RESUME_CACHE_TTL,
  })
}

/** 用权威响应更新分集缓存，并使更早发出的分集请求失去回写资格。 */
export const primeScriptImportChapters = (
  scriptImportId: StudioScriptImportId,
  chapters: StudioScriptParseChapter[],
) => {
  const cacheKey = toCacheKey(scriptImportId)
  bumpRevision(chapterRevisions, cacheKey)
  chapterRequests.delete(cacheKey)
  if (chapters.length === 0) {
    chapterCache.delete(cacheKey)
    syncCachedDetailChapters(cacheKey)
    return
  }
  writeChapterCache(cacheKey, {
    chapters,
    expiresAt: Date.now() + RESUME_CACHE_TTL,
  })
  syncCachedDetailChapters(cacheKey, chapters)
}

/** 失效详情缓存；在途旧请求完成后也不会重新写回缓存。 */
export const invalidateScriptImportDetail = (scriptImportId: StudioScriptImportId) => {
  const cacheKey = toCacheKey(scriptImportId)
  bumpRevision(detailRevisions, cacheKey)
  detailCache.delete(cacheKey)
  detailRequests.delete(cacheKey)
}

/** 失效分集缓存；在途旧请求完成后也不会重新写回缓存。 */
export const invalidateScriptImportChapters = (scriptImportId: StudioScriptImportId) => {
  const cacheKey = toCacheKey(scriptImportId)
  bumpRevision(chapterRevisions, cacheKey)
  chapterCache.delete(cacheKey)
  chapterRequests.delete(cacheKey)
  syncCachedDetailChapters(cacheKey)
}

/** 同时失效同一剧本导入记录的详情与分集缓存。 */
export const invalidateScriptImportResumeCache = (scriptImportId: StudioScriptImportId) => {
  invalidateScriptImportDetail(scriptImportId)
  invalidateScriptImportChapters(scriptImportId)
}

/** 读取短时缓存，让项目回显能在首帧直接使用已预取的分集数据。 */
export const readCachedScriptImportChapters = (
  scriptImportId: StudioScriptImportId,
): StudioScriptParseChapter[] | undefined => {
  const cacheKey = toCacheKey(scriptImportId)
  const entry = chapterCache.get(cacheKey)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    bumpRevision(chapterRevisions, cacheKey)
    chapterCache.delete(cacheKey)
    chapterRequests.delete(cacheKey)
    syncCachedDetailChapters(cacheKey)
    return undefined
  }
  chapterCache.delete(cacheKey)
  chapterCache.set(cacheKey, entry)
  return entry.chapters
}

/** 读取第一步详情快照，用于进入创建页时立即回显剧本原文和基本信息。 */
export const readCachedScriptImportDetail = (
  scriptImportId: StudioScriptImportId,
): StudioScriptParseResult | undefined => {
  const cacheKey = toCacheKey(scriptImportId)
  const entry = detailCache.get(cacheKey)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    bumpRevision(detailRevisions, cacheKey)
    detailCache.delete(cacheKey)
    detailRequests.delete(cacheKey)
    return undefined
  }

  const cachedChapters = chapterCache.get(cacheKey)
  if (cachedChapters && cachedChapters.expiresAt <= Date.now()) {
    bumpRevision(chapterRevisions, cacheKey)
    chapterCache.delete(cacheKey)
    chapterRequests.delete(cacheKey)
    syncCachedDetailChapters(cacheKey)
  }
  const currentEntry = detailCache.get(cacheKey)
  if (!currentEntry) return undefined
  detailCache.delete(cacheKey)
  detailCache.set(cacheKey, currentEntry)
  return currentEntry.detail
}

/** 合并第一步详情的预取与页面请求，避免点击项目后重复等待同一个接口。 */
export const loadScriptImportDetail = (
  scriptImportId: StudioScriptImportId,
): Promise<StudioScriptParseResult> => {
  const cached = readCachedScriptImportDetail(scriptImportId)
  if (cached) return Promise.resolve(cached)

  const cacheKey = toCacheKey(scriptImportId)
  const pendingRequest = detailRequests.get(cacheKey)
  if (pendingRequest) return pendingRequest

  const requestRevision = getRevision(detailRevisions, cacheKey)
  const requestChapterRevision = getRevision(chapterRevisions, cacheKey)
  const request = StudioScriptsApi.getBasicInfoDetail(scriptImportId)
    .then((detail) => {
      if (getRevision(detailRevisions, cacheKey) !== requestRevision) {
        const currentDetail = readCachedScriptImportDetail(scriptImportId)
        if (currentDetail) return currentDetail
        throw new Error('Discarded a stale script detail response')
      }

      const currentChapterEntry = chapterCache.get(cacheKey)
      const cachedChapters = currentChapterEntry && currentChapterEntry.expiresAt > Date.now()
        ? currentChapterEntry.chapters
        : undefined
      const chaptersChanged = getRevision(chapterRevisions, cacheKey) !== requestChapterRevision
      const chaptersPending = chapterRequests.has(cacheKey)
      const nextDetail = cachedChapters
        ? withDetailChapters(detail, cachedChapters)
        : chaptersChanged || chaptersPending
          ? withDetailChapters(detail)
          : detail
      writeDetailCache(cacheKey, {
        detail: nextDetail,
        expiresAt: Date.now() + RESUME_CACHE_TTL,
      })
      return nextDetail
    })
    .finally(() => {
      if (detailRequests.get(cacheKey) === request) {
        detailRequests.delete(cacheKey)
      }
    })

  detailRequests.set(cacheKey, request)
  return request
}

/** 合并并发请求，避免卡片预取和页面回显重复查询同一份分集数据。 */
export const loadScriptImportChapters = (
  scriptImportId: StudioScriptImportId,
): Promise<StudioScriptParseChapter[]> => {
  const cached = readCachedScriptImportChapters(scriptImportId)
  if (cached) return Promise.resolve(cached)

  const cacheKey = toCacheKey(scriptImportId)
  const pendingRequest = chapterRequests.get(cacheKey)
  if (pendingRequest) return pendingRequest

  const requestRevision = getRevision(chapterRevisions, cacheKey)
  const request = StudioScriptsApi.getChapters(scriptImportId)
    .then((chapters) => {
      if (getRevision(chapterRevisions, cacheKey) !== requestRevision) {
        const currentChapters = readCachedScriptImportChapters(scriptImportId)
        if (currentChapters) return currentChapters
        throw new Error('Discarded a stale script chapters response')
      }

      bumpRevision(chapterRevisions, cacheKey)
      if (chapters.length > 0) {
        writeChapterCache(cacheKey, {
          chapters,
          expiresAt: Date.now() + RESUME_CACHE_TTL,
        })
        syncCachedDetailChapters(cacheKey, chapters)
      } else {
        chapterCache.delete(cacheKey)
        syncCachedDetailChapters(cacheKey)
      }
      return chapters
    })
    .finally(() => {
      if (chapterRequests.get(cacheKey) === request) {
        chapterRequests.delete(cacheKey)
      }
    })

  chapterRequests.set(cacheKey, request)
  return request
}
