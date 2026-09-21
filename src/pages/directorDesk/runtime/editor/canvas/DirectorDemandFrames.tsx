import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useDirectorStore } from '../store/directorStore'
import { subscribeRuntimePlayback } from '../runtime/playbackRuntime'

/** Store/runtime mutations bypass R3F props, so explicitly wake an idle viewport. */
export default function DirectorDemandFrames() {
  const invalidate = useThree((state) => state.invalidate)
  const get = useThree((state) => state.get)
  useEffect(() => {
    const refresh = () => {
      // Two frames let body pose updates settle before camera body tracking samples them.
      // Coalesce bursts rather than adding two frames for every pointer event.
      const state = get()
      if (state.frameloop === 'demand' && state.internal.frames < 2) {
        invalidate(2 - state.internal.frames)
      }
    }
    refresh()
    const unsubscribeStore = useDirectorStore.subscribe(refresh)
    const unsubscribePlayback = subscribeRuntimePlayback(refresh)
    return () => { unsubscribeStore(); unsubscribePlayback() }
  }, [get, invalidate])
  return null
}
