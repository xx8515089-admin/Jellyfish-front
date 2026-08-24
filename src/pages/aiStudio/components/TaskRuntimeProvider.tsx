import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { ApiError, FilmService } from '../../../services/generated'
import { hasAuthSession } from '../../../auth'
import { useTaskUiStore } from './taskUiStore'

const TASK_POLL_INTERVAL_MS = 4000
const TASK_RECENT_SECONDS = 86400
const TASK_PAGE_SIZE = 100

type TaskRuntimeProviderProps = {
  children: ReactNode
}

export function TaskRuntimeProvider({ children }: TaskRuntimeProviderProps) {
  const setServerTasks = useTaskUiStore((state) => state.setServerTasks)

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const load = async () => {
      if (!hasAuthSession()) {
        setServerTasks([])
        return
      }
      try {
        const res = await FilmService.listTasksApiV1FilmTasksGet({
          recentSeconds: TASK_RECENT_SECONDS,
          page: 1,
          pageSize: TASK_PAGE_SIZE,
        })
        if (cancelled) return
        setServerTasks(res.data?.items ?? [])
      } catch (error) {
        if (cancelled) return
        setServerTasks([])
        if (error instanceof ApiError && error.status === 401) {
          cancelled = true
          return
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => {
            void load()
          }, TASK_POLL_INTERVAL_MS)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [setServerTasks])

  return <>{children}</>
}
