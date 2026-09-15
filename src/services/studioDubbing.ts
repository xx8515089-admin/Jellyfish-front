import { OpenAPI } from './generated'
import { request } from './generated/core/request'

export type DubbingId = string | number
export type DubbingGeneration = {
  id: DubbingId
  status: number
  outputUrl?: string | null
  errorMessage?: string | null
  createdAt?: string
  usage?: unknown
}
export type DubbingCharacter = {
  assetId: DubbingId
  characterName: string
  coverUrl?: string | null
  voiceConfigured: boolean
  voiceConfig: { voiceId?: number; voice: { id: number; name: string; previewUrl?: string; providerCode?: string; emotionAdjustable?: boolean; languages?: { code: string; primaryLanguage?: boolean }[] } } | null
}
export type DubbingLineFields = {
  characterAssetId: DubbingId | null
  dialogueText: string
  emotionPrompt: string | null
  volume: number | null
  speechRate: number | null
}
export type DubbingLine = DubbingLineFields & {
  id: DubbingId
  characterName?: string
  latestGeneration?: DubbingGeneration | null
}
export type DubbingSettings = { runId: DubbingId; volume: number; speechRate: number }
export type DubbingPanel = { settings: DubbingSettings; characters: DubbingCharacter[]; lines: DubbingLine[] }

async function call<T>(path: string, method: 'GET' | 'POST', values: Record<string, unknown>): Promise<T> {
  const response = await request<{ code?: number; message?: string; data: T }>(OpenAPI, {
    method, url: `/api/v1/studio/storyboards/dubbing/${path}`,
    ...(method === 'GET' ? { query: values } : { body: values, mediaType: 'application/json' }),
  })
  if ((response.code ?? 200) >= 400) throw new Error(response.message || '配音请求失败')
  return response.data
}

export const StudioDubbingApi = {
  panel: (segmentId: DubbingId) => call<DubbingPanel>('panel', 'GET', { segmentId }),
  updateVoice: (segmentId: DubbingId, assetId: DubbingId, voiceId: number | null) => call<DubbingCharacter>('characters/voice/update', 'POST', { segmentId, assetId, voiceId }),
  updateSettings: (settings: DubbingSettings) => call<DubbingSettings>('settings/update', 'POST', settings),
  addLine: (segmentId: DubbingId, fields: DubbingLineFields) => call<DubbingLine>('lines', 'POST', { segmentId, ...fields }),
  updateLine: (id: DubbingId, fields: DubbingLineFields) => call<DubbingLine>('lines/update', 'POST', { id, ...fields }),
  deleteLine: (id: DubbingId) => call<unknown>('lines/delete', 'POST', { id }),
  generate: (lineId: DubbingId, outputFormat = 'mp3', modelId?: number) => call<DubbingGeneration>('generate', 'POST', { lineId, outputFormat, ...(modelId === undefined ? {} : { modelId }) }),
  detail: (id: DubbingId) => call<DubbingGeneration>('detail', 'GET', { id }),
  history: (lineId: DubbingId) => call<DubbingGeneration[]>('history', 'GET', { lineId }),
}
