import { StudioShotsService } from './generated'
import { unwrapApiData } from './generatedResponse'

export type ShotTableImportSummary = {
  total_rows: number
  will_create_shots: number
  created_shots: number
  linked_characters: number
  linked_scenes: number
  linked_costumes: number
  linked_props: number
  unresolved_count: number
  errors: Array<{ row_number: number; field: string; message: string }>
  rows: Array<{
    row_number: number
    shot_index?: number | null
    title: string
    action: string
    ok: boolean
    message: string
    matched_characters: string[]
    matched_scene?: string | null
    matched_costumes: string[]
    matched_props: string[]
    unresolved: string[]
  }>
  template_fields: string[]
}

async function postImport(path: string, chapterId: string, content: string): Promise<ShotTableImportSummary> {
  const requestBody = { content }
  if (path.endsWith('/preview')) {
    const response = await StudioShotsService.previewShotTableImportApiApiV1StudioShotsImportTablePreviewPost({
      chapterId,
      requestBody,
    })
    return unwrapApiData<ShotTableImportSummary>(response, '分镜表导入请求失败')
  }
  const response = await StudioShotsService.commitShotTableImportApiApiV1StudioShotsImportTableCommitPost({
    chapterId,
    requestBody,
  })
  return unwrapApiData<ShotTableImportSummary>(response, '分镜表导入请求失败')
}

export const ShotTableImportApi = {
  preview(chapterId: string, content: string) {
    return postImport('/api/v1/studio/shots/import-table/preview', chapterId, content)
  },
  commit(chapterId: string, content: string) {
    return postImport('/api/v1/studio/shots/import-table/commit', chapterId, content)
  },
}
