import { useLayoutEffect, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three-stdlib'
import type { CameraShotSnapshot } from '../store/directorStore'

/** Apply explicit view commands, never the throttled UI echo of OrbitControls. */
export function DirectorViewCameraSync({
  controlsRef, disabled, snapshotRef, revision, viewMode,
}: {
  controlsRef: MutableRefObject<OrbitControls | null>
  disabled?: boolean
  snapshotRef: MutableRefObject<CameraShotSnapshot>
  revision: number
  viewMode: 'director' | 'camera'
}) {
  const { camera, invalidate } = useThree()
  useLayoutEffect(() => {
    if (viewMode !== 'director' || disabled) return
    const snapshot = snapshotRef.current
    const perspectiveCamera = camera as PerspectiveCamera
    perspectiveCamera.fov = snapshot.fov
    perspectiveCamera.position.set(...snapshot.position)
    perspectiveCamera.lookAt(...snapshot.target)
    perspectiveCamera.updateProjectionMatrix()
    perspectiveCamera.updateMatrixWorld()
    if (controlsRef.current) {
      controlsRef.current.target.set(...snapshot.target)
      controlsRef.current.update()
    }
    invalidate()
  }, [camera, controlsRef, disabled, invalidate, revision, snapshotRef, viewMode])
  return null
}
