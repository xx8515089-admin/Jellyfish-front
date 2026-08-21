import { StudioAssetsService } from './generated'
import { unwrapApiData } from './generatedResponse'

export type AssetBibleImportSummary = {
  created_count: number
  updated_count: number
  skipped_count: number
  errors: Array<{ row_number: number; field: string; message: string }>
  rows: Array<{
    row_number: number
    asset_type: string
    asset_name: string
    entity_id: string
    action: string
    ok?: boolean
    message: string
  }>
  template_fields: string[]
}

async function postImport(path: string, content: string): Promise<AssetBibleImportSummary> {
  const requestBody = { content }
  if (path.endsWith('/preview')) {
    const response = await StudioAssetsService.previewAssetBibleImportApiApiV1StudioAssetsImportBiblePreviewPost({
      requestBody,
    })
    return unwrapApiData<AssetBibleImportSummary>(response, '资产清单导入请求失败')
  }
  const response = await StudioAssetsService.commitAssetBibleImportApiApiV1StudioAssetsImportBibleCommitPost({
    requestBody,
  })
  return unwrapApiData<AssetBibleImportSummary>(response, '资产清单导入请求失败')
}

export const AssetBibleImportApi = {
  preview(content: string) {
    return postImport('/api/v1/studio/assets/import-bible/preview', content)
  },
  commit(content: string) {
    return postImport('/api/v1/studio/assets/import-bible/commit', content)
  },
  async template(): Promise<{ filename: string; content: string }> {
    const response = await StudioAssetsService.getAssetBibleTemplateApiApiV1StudioAssetsImportBibleTemplateGet()
    return unwrapApiData<{ filename: string; content: string }>(response, '模板下载失败')
  },
}
