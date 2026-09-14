import { StudioDirectorDesks, type DirectorDesk, type DirectorSnapshot } from '../../services/studioDirectorDesks'

export async function saveAndUploadDirectorFrame(
  capture: { snapshot: DirectorSnapshot; file: File },
  segmentId: string,
  save: (snapshot: DirectorSnapshot) => Promise<DirectorDesk>,
) {
  const saved = await save(capture.snapshot)
  const reference = await StudioDirectorDesks.upload({
    segmentId,
    file: capture.file,
    directorDeskId: saved.id,
    directorRevisionNo: saved.revisionNo,
    cameraId: capture.snapshot.project.activeCameraId || undefined,
    captureProgress: capture.snapshot.viewSettings.cameraMotionProgress,
  })
  return { saved, reference }
}
