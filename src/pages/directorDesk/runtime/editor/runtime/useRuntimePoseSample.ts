import { useLayoutEffect, useRef } from 'react'

/** Camera redraws reuse the pose; timeline changes and model edits resample it. */
export function useRuntimePoseSample() {
  const lastProgress = useRef<number>()
  // A model commit can replace its rig, action, body type, clip, or rest pose.
  useLayoutEffect(() => { lastProgress.current = undefined })
  return (progress: number) => {
    if (lastProgress.current === progress) return false
    lastProgress.current = progress
    return true
  }
}
