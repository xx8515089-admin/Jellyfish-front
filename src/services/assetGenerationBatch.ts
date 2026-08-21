import { StudioAssetsService } from './generated'
import { unwrapApiData } from './generatedResponse'

export type AssetGenerationSpecKey = {
  asset_type: string
  asset_id: string
  asset_variant: string
}

export type AssetGenerationSpec = AssetGenerationSpecKey & {
  asset_name: string
  display_name: string
  visual_prompt: string
  negative_prompt: string
  style_notes: string
  reference_notes: string
  output_spec: string
  aspect_ratio: string
  width: number | null
  height: number | null
  priority: string
  status: string
  current_image_file_id: string | null
  image_slot_id: string | null
  image_slot_angle: string
  has_image: boolean
  can_generate: boolean
  validation_errors: string[]
  source: string
  is_legacy: boolean
  runner_model?: string
  runner_source_sheet?: string
  runner_output_filename?: string
  action?: string
  will_create_slot?: boolean
  task_id?: string | null
  message?: string
  reference_file_ids?: string[]
}

export type AssetGenerationFilters = {
  asset_type?: string
  priority?: string
  asset_variant?: string
  missing_only?: boolean
  status?: string
  keyword?: string
  runner_model?: string
  runner_source_sheet?: string
  skip_existing?: boolean
  include_legacy?: boolean
  selected_specs?: AssetGenerationSpecKey[]
}

export type AssetGenerationSpecsResponse = {
  rows: AssetGenerationSpec[]
  total: number
}

export type AssetGenerationBatchResponse = {
  total_specs: number
  will_create_slots: number
  will_generate_tasks: number
  will_skip_existing: number
  validation_errors: Array<{ asset_type: string; asset_id: string; asset_variant: string; message: string }>
  estimated_task_count: number
  created_task_count?: number
  skipped_count?: number
  error_count?: number
  rows: AssetGenerationSpec[]
}

export const AssetGenerationBatchApi = {
  async specs(filters: AssetGenerationFilters = {}): Promise<AssetGenerationSpecsResponse> {
    const response = await StudioAssetsService.listAssetGenerationSpecsApiApiV1StudioAssetsGenerationSpecsGet({
      assetType: filters.asset_type ?? null,
      priority: filters.priority ?? null,
      assetVariant: filters.asset_variant ?? null,
      missingOnly: filters.missing_only ?? false,
      status: filters.status ?? null,
      keyword: filters.keyword ?? null,
      runnerModel: filters.runner_model ?? null,
      runnerSourceSheet: filters.runner_source_sheet ?? null,
      includeLegacy: filters.include_legacy ?? false,
    })
    return unwrapApiData<AssetGenerationSpecsResponse>(response, '读取资产生成规格失败')
  },

  async preview(filters: AssetGenerationFilters): Promise<AssetGenerationBatchResponse> {
    const response = await StudioAssetsService.previewAssetImageGenerationBatchApiApiV1StudioAssetsImageGenerationBatchPreviewPost({
      requestBody: filters,
    })
    return unwrapApiData<AssetGenerationBatchResponse>(response, '预览批量生成任务失败')
  },

  async commit(filters: AssetGenerationFilters): Promise<AssetGenerationBatchResponse> {
    const response = await StudioAssetsService.commitAssetImageGenerationBatchApiApiV1StudioAssetsImageGenerationBatchCommitPost({
      requestBody: filters,
    })
    return unwrapApiData<AssetGenerationBatchResponse>(response, '创建批量生成任务失败')
  },
}
