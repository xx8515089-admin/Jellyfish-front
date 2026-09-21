import { useEffect, useRef, useState } from 'react'
import type { CancelablePromise } from '../../../services/generated'
import { efficiencyError, unwrapEfficiency } from './efficiencyModel'

export type EfficiencyResource<T> = { loading: boolean; data?: T; error?: string; cause?: unknown }

/** Isolate each region's state and reject both stale responses and stale render frames. */
export function useEfficiencyResource<T>(key: string | null, load: () => CancelablePromise<{ code: number; message: string; data: T }>, snapshotId?: string): EfficiencyResource<T> {
  const loader = useRef(load)
  loader.current = load
  const [state, setState] = useState<EfficiencyResource<T> & { key: string | null }>({ key: null, loading: false })
  useEffect(() => {
    if (key === null) return
    let active = true
    setState({ key, loading: true })
    const pending = loader.current()
    pending.then((response) => {
      const data = unwrapEfficiency(response)
      const meta = (data as { meta?: { consistency?: { mode?: string; snapshotId?: string } } }).meta
      if (snapshotId && (meta?.consistency?.mode !== 'snapshot' || meta.consistency.snapshotId !== snapshotId)) throw { body: { data: { errorCode: 'SNAPSHOT_INVALID' } } }
      if (active) setState({ key, loading: false, data })
    }).catch((error: unknown) => {
      if (active) setState({ key, loading: false, error: efficiencyError(error), cause: error })
    })
    return () => { active = false; pending.cancel() }
  }, [key, snapshotId])
  if (key === null) return { loading: false }
  return state.key === key ? state : { loading: true }
}
