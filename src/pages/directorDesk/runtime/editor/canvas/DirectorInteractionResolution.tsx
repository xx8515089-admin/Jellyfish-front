import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/** R3F restores current=1 after controls stop changing; explicit quality bypasses regression. */
export function DirectorInteractionResolution({ baseDpr, enabled }: { baseDpr: number | [number, number]; enabled: boolean }) {
  const current = useThree((state) => state.performance.current)
  const setDpr = useThree((state) => state.setDpr)
  useEffect(() => {
    const resolvedDpr = typeof baseDpr === 'number'
      ? baseDpr
      : Math.min(baseDpr[1], Math.max(baseDpr[0], window.devicePixelRatio || 1))
    setDpr(resolvedDpr * (enabled ? current : 1))
  }, [baseDpr, current, enabled, setDpr])
  return null
}
