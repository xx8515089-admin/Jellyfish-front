import { useEffect, useState, useCallback } from 'react'
import { StudioChaptersService, StudioProjectsService } from '../../../../../services/generated'
import type { ChapterRead, ChapterStatus, ProjectRead, ProjectStyle } from '../../../../../services/generated'
import { StudioEntitiesApi } from '../../../../../services/studioEntities'

export type Project = {
  id: string
  name: string
  description: string
  style: ProjectStyle | string
  seed: number
  unifyStyle: boolean
  progress: number
  stats: {
    chapters: number
    roles: number
    scenes: number
    props: number
  }
  updatedAt: string
}

export type Chapter = {
  id: string
  projectId: string
  index: number
  title: string
  summary: string
  rawText?: string
  storyboardCount: number
  status: ChapterStatus
  updatedAt: string
}

/** Creates a client-side id only for request bodies that require a caller-provided id. */
function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

/** Maps the generated project DTO into the UI shape consumed by the workbench. */
function toUIProject(p: ProjectRead): Project {
  const stats = (p.stats ?? {}) as Record<string, unknown>
  const getNum = (key: string) => {
    const v = stats[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  const updatedAt =
    (typeof stats.updated_at === 'string' && stats.updated_at) ||
    (typeof stats.updatedAt === 'string' && stats.updatedAt) ||
    new Date().toISOString()
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    style: p.style,
    seed: p.seed ?? 0,
    unifyStyle: p.unify_style ?? true,
    progress: p.progress ?? 0,
    stats: {
      chapters: getNum('chapters'),
      roles: getNum('roles'),
      scenes: getNum('scenes'),
      props: getNum('props'),
    },
    updatedAt,
  }
}

export type ProjectCharacter = {
  id: string
  actor_id: string
  name?: string
  description?: string | null
  costume_id?: string | null
  actor_name?: string | null
  costume_name?: string | null
  wardrobe_text_override?: string | null
  thumbnail?: string | null
  actor_identity_thumbnail?: string | null
  actor_body_thumbnail?: string | null
  costume_thumbnail?: string | null
  actor_identity_file_id?: string | null
  actor_body_file_id?: string | null
  costume_file_id?: string | null
  linked_shot_count?: number | null
}

/** Maps the generated chapter DTO into the UI shape consumed by chapter tabs and summaries. */
function toUIChapter(c: ChapterRead): Chapter {
  return {
    id: c.id,
    projectId: c.project_id,
    index: c.index,
    title: c.title,
    summary: c.summary ?? '',
    rawText: c.raw_text ?? '',
    storyboardCount: c.shot_count ?? c.storyboard_count ?? 0,
    status: c.status ?? 'draft',
    updatedAt: new Date().toISOString(),
  }
}

function toProjectCharacter(value: Record<string, unknown>): ProjectCharacter | null {
  if (typeof value.id !== 'string' || typeof value.actor_id !== 'string') return null
  const nullableString = (key: string): string | null => {
    const field = value[key]
    return typeof field === 'string' || field === null ? field : null
  }
  const linkedShotCount = value.linked_shot_count
  const name = value.name

  return {
    id: value.id,
    actor_id: value.actor_id,
    ...(typeof name === 'string' ? { name } : {}),
    description: nullableString('description'),
    costume_id: nullableString('costume_id'),
    actor_name: nullableString('actor_name'),
    costume_name: nullableString('costume_name'),
    wardrobe_text_override: nullableString('wardrobe_text_override'),
    thumbnail: nullableString('thumbnail'),
    actor_identity_thumbnail: nullableString('actor_identity_thumbnail'),
    actor_body_thumbnail: nullableString('actor_body_thumbnail'),
    costume_thumbnail: nullableString('costume_thumbnail'),
    actor_identity_file_id: nullableString('actor_identity_file_id'),
    actor_body_file_id: nullableString('actor_body_file_id'),
    costume_file_id: nullableString('costume_file_id'),
    linked_shot_count: typeof linkedShotCount === 'number' ? linkedShotCount : null,
  }
}

export function useProject(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    if (!projectId) {
      setProject(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId })
      const p = res.data ?? null
      setProject(p ? toUIProject(p) : null)
    } catch {
      setProject(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  return { project, loading, refresh: load }
}

export function useChapters(projectId: string | undefined) {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)

  const patchChapterLocal = useCallback((chapterId: string, patch: Partial<Chapter>) => {
    setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, ...patch } : c)))
  }, [])

  const load = useCallback(async (): Promise<void> => {
    if (!projectId) {
      setChapters([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await StudioChaptersService.listChaptersApiV1StudioChaptersGet({
        projectId,
        page: 1,
        pageSize: 100,
      })
      const items = res.data?.items ?? []
      setChapters(items.map(toUIChapter))
    } catch {
      setChapters([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  return { chapters, loading, refresh: load, patchChapterLocal }
}

export function useProjectCharacters(projectId: string | undefined) {
  const [characters, setCharacters] = useState<ProjectCharacter[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    if (!projectId) {
      setCharacters([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await StudioEntitiesApi.list('character', {
        page: 1,
        pageSize: 100,
        projectId,
        q: null,
      })
      const items = res.data?.items ?? []
      setCharacters(items.map(toProjectCharacter).filter((item): item is ProjectCharacter => item !== null))
    } catch {
      setCharacters([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  return { characters, loading, refresh: load }
}

export { newId }
