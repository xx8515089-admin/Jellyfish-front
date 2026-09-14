import type { DirectorDesk, DirectorSnapshot } from '../../services/studioDirectorDesks'
import { useDirectorStore } from './runtime/editor/store/directorStore'
import { getRuntimePlaybackProgress } from './runtime/editor/runtime/playbackRuntime'
import { parseDirectorProjectDocument } from './runtime/editor/io/projectDocument'
import { requestCleanFrameExport } from './runtime/editor/io/cleanFrameExport'

export function readDirectorSnapshot(): DirectorSnapshot {
  const state = useDirectorStore.getState()
  return structuredClone({
    projectSchemaVersion: 1,
    project: state.project,
    viewSettings: {
      viewportAspectRatio: state.viewportAspectRatio,
      finishedShotFov: state.finishedShotFov,
      cameraMotionProgress: getRuntimePlaybackProgress(),
    },
  })
}

export function restoreDirectorSnapshot(desk: DirectorDesk) {
  const project = parseDirectorProjectDocument({ format: '3d-director-desk-project', schemaVersion: desk.projectSchemaVersion, project: desk.project })
  const state = useDirectorStore.getState()
  state.setCameraMotionPlaying(false)
  state.openScopedScene(desk.instanceId)
  state.replaceProject(project)
  state.setViewportAspectRatio(desk.viewSettings.viewportAspectRatio)
  state.setFinishedShotFov(desk.viewSettings.finishedShotFov)
  state.setCameraMotionProgress(desk.viewSettings.cameraMotionProgress)
}

/** A single export owns both the immutable snapshot and the rendered pixels. */
export async function captureDirectorSnapshot(root: HTMLElement) {
  const state = useDirectorStore.getState()
  if (state.viewportAspectRatio === 'auto') throw new Error('请先选择固定画幅，再导出垫图')
  const playing = state.cameraMotionPlaying
  const wasInert = root.inert
  root.inert = true
  state.setCameraMotionPlaying(false)
  state.setCameraMotionProgress(getRuntimePlaybackProgress())
  const snapshot = readDirectorSnapshot()
  let changed = false
  const unsubscribe = useDirectorStore.subscribe((next, previous) => {
    if (next.project !== previous.project || next.viewportAspectRatio !== previous.viewportAspectRatio ||
      next.finishedShotFov !== previous.finishedShotFov || next.cameraMotionProgress !== previous.cameraMotionProgress) changed = true
  })
  try {
    const frame = await requestCleanFrameExport({ fileName: `director-${Date.now()}.png`, position: 'current', quality: '1080p' })
    if (changed || JSON.stringify(snapshot) !== JSON.stringify(readDirectorSnapshot())) throw new Error('导出期间场景发生变化，请重新导出；本次结果未上传')
    const blob = await (await fetch(frame.dataUrl)).blob()
    return { snapshot, file: new File([blob], frame.fileName, { type: 'image/png' }) }
  } finally {
    unsubscribe()
    root.inert = wasInert
    state.setCameraMotionPlaying(playing)
  }
}
