import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioAssetGenerationApi, type StudioStoryboardVideoReferenceOption } from '../../services/studioAssetGeneration'
import { getApiErrorMessage } from '../../services/apiErrors'

export function useDirectorCharacterOptions(segmentId: string) {
  const target = segmentId.trim()
  const validTarget = /^[1-9]\d*$/.test(target)
  const [state, setState] = useState<{
    target: string
    options: StudioStoryboardVideoReferenceOption[]
    loading: boolean
    error: string
  }>({ target: '', options: [], loading: false, error: '' })
  const requestRef = useRef<{ cancel: () => void } | null>(null)
  const sequence = useRef(0)

  const refresh = useCallback(() => {
    const current = ++sequence.current
    requestRef.current?.cancel()
    requestRef.current = null
    if (!validTarget) return
    setState((previous) => ({ target, options: previous.target === target ? previous.options : [], loading: true, error: '' }))
    const request = StudioAssetGenerationApi.requestStoryboardVideoReferenceOptions({ segmentId: target, source: 'character' })
    requestRef.current = request
    void request.promise.then((options) => {
      if (sequence.current === current) setState({ target, options, loading: false, error: '' })
    }).catch((error) => {
      if (sequence.current === current) setState((previous) => ({ ...previous, loading: false, error: getApiErrorMessage(error) }))
    }).finally(() => {
      if (sequence.current === current) requestRef.current = null
    })
  }, [target, validTarget])

  useEffect(() => {
    refresh()
    return () => {
      sequence.current++
      requestRef.current?.cancel()
      requestRef.current = null
    }
  }, [refresh])

  const matches = validTarget && state.target === target
  return {
    options: matches ? state.options : [],
    loading: validTarget && (!matches || state.loading),
    error: matches ? state.error : '',
    validTarget,
    refresh,
  }
}
