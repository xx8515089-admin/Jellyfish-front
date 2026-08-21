import { StudioAssetsService, StudioProjectsService } from './generated'
import { unwrapApiData } from './generatedResponse'

export type AssetLinkerBatch = {
  runner_model: string
  runner_source_sheet: string
  total_specs: number
  asset_type_counts: Record<string, number>
}

export type ProjectOption = {
  id: string
  name: string
}

export type ProjectAssetLinkerRow = {
  asset_type: string
  source_asset_id: string
  asset_id: string
  asset_name: string
  asset_variant: string
  output_spec: string
  runner_job_id: string
  runner_output_filename: string
  usage_slot: string
  identity_policy: string
  match_strategy: string
  matched_asset_id: string
  matched_asset_name: string
  thumbnail: string
  file_id: string
  image_id: string
  status: 'will_link' | 'linked' | 'missing' | 'duplicate' | 'conflict' | 'already_linked'
  message: string
  existing_link_id?: number | null
  can_link: boolean
  action?: string
  link_id?: number
}

export type ProjectAssetLinkerResponse = {
  project_id: string
  total_specs: number
  counts: Record<string, number>
  rows: ProjectAssetLinkerRow[]
  created_count?: number
  created_links?: Array<{ asset_type: string; link_id: number; asset_id: string }>
}

export const AssetProjectLinkerApi = {
  async projects(): Promise<ProjectOption[]> {
    const response = await StudioProjectsService.listProjectsApiV1StudioProjectsGet({
      page: 1,
      pageSize: 100,
      order: 'updated_at',
      isDesc: true,
    })
    const data = unwrapApiData<{ items?: ProjectOption[] }>(response, '读取项目列表失败')
    return data.items ?? []
  },

  async batches(): Promise<AssetLinkerBatch[]> {
    const response = await StudioAssetsService.listProjectAssetLinkerBatchesApiApiV1StudioAssetsProjectLinkerBatchesGet()
    const data = unwrapApiData<{ batches?: AssetLinkerBatch[] }>(response, '读取资产批次失败')
    return data.batches ?? []
  },

  async preview(input: {
    project_id: string
    runner_model?: string
    runner_source_sheet?: string
    asset_type?: string
    include_existing?: boolean
  }): Promise<ProjectAssetLinkerResponse> {
    const response = await StudioAssetsService.previewProjectAssetLinksApiApiV1StudioAssetsProjectLinkerPreviewPost({
      requestBody: input,
    })
    return unwrapApiData<ProjectAssetLinkerResponse>(response, '预览项目资产链接失败')
  },

  async commit(input: {
    project_id: string
    runner_model?: string
    runner_source_sheet?: string
    asset_type?: string
  }): Promise<ProjectAssetLinkerResponse> {
    const response = await StudioAssetsService.commitProjectAssetLinksApiApiV1StudioAssetsProjectLinkerCommitPost({
      requestBody: input,
    })
    return unwrapApiData<ProjectAssetLinkerResponse>(response, '链接项目资产失败')
  },

  async rollback(input: {
    project_id: string
    links: Array<{ asset_type: string; link_id: number; asset_id?: string }>
  }): Promise<{ removed_count: number; skipped_count: number }> {
    const response = await StudioAssetsService.rollbackProjectAssetLinksApiApiV1StudioAssetsProjectLinkerRollbackPost({
      requestBody: input,
    })
    return unwrapApiData<{ removed_count: number; skipped_count: number }>(response, '回滚项目资产链接失败')
  },
}
