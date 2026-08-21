export function getProjectChaptersPath(projectId: string) {
  return `/projects/${projectId}/chapters`
}

export function getChapterStudioPath(projectId: string, chapterId: string) {
  return `/projects/${projectId}/chapters/${chapterId}/studio`
}

export function getDirectorStagePath(projectId: string, chapterId: string, shotId?: string | null) {
  const base = `/projects/${projectId}/chapters/${chapterId}/director-stage`
  return shotId ? `${base}?shotId=${encodeURIComponent(shotId)}` : base
}

export function getChapterShotsPath(projectId: string, chapterId: string) {
  return `/projects/${projectId}/chapters/${chapterId}/shots`
}

export function getChapterShotEditPath(projectId: string, chapterId: string, shotId: string) {
  return `/projects/${projectId}/chapters/${chapterId}/shots/${shotId}/edit`
}

export function getProjectEditorPath(projectId: string) {
  return `/projects/${projectId}/editor`
}
