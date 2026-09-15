import { OpenAPI } from './generated'
import { request, getHeaders } from './generated/core/request'
import type { ApiRequestOptions } from './generated/core/ApiRequestOptions'
import type { DirectorProject } from '../pages/directorDesk/runtime/editor/schema/directorProject'
import type { ViewportAspectRatio } from '../pages/directorDesk/runtime/editor/schema/viewportAspectRatio'

export type DirectorId = string | number
export interface DirectorBinding {
  objectId: string
  assetId: DirectorId
  characterLookId?: DirectorId | null
  referenceFileId?: DirectorId | null
}
export interface DirectorSnapshot {
  projectSchemaVersion: number
  project: DirectorProject
  viewSettings: { viewportAspectRatio: ViewportAspectRatio; finishedShotFov: number | null; cameraMotionProgress: number }
}
export interface DirectorDeskSummary {
  id: DirectorId
  instanceId: string
  name: string
  segmentId?: DirectorId | null
  coverUrl?: string | null
  revisionNo: number
  createdAt: string
  updatedAt: string
}
export interface DirectorDesk extends DirectorDeskSummary, DirectorSnapshot {
  latestRevisionNo: number
  characterBindings: DirectorBinding[]
  portability: { portable: boolean; browserLocalAssetIds: string[]; note: string | null }
  deleted: boolean
}
export interface DirectorCapture {
  id: DirectorId
  directorDeskId: DirectorId
  directorRevisionNo: number
  segmentId: DirectorId
  fileId: DirectorId
  fileUrl: string
  fileName: string
  fileType: 'image' | 'video'
  cameraId?: string | null
  captureProgress?: number | null
  width?: number | null
  height?: number | null
}
export interface DirectorReference {
  referenceType: number
  fileId: DirectorId
  fileUrl?: string | null
  displayName: string
  referenceIndex?: number
  referenceToken?: string
}
export interface DirectorReferenceSelection { revisionNo: number; references: DirectorReference[] }
export interface DirectorImageReference extends DirectorReference {
  assetId?: DirectorId | null
  characterLookId?: DirectorId | null
  useOnly: string
  doNotUse: string
}
export interface DirectorDraft {
  directorDeskId: DirectorId
  draftRevisionNo: number
  baseRevisionNo: number
  latestRevisionNo: number
  hasDraft: boolean
  conflict: boolean
  projectSchemaVersion: number | null
  project: DirectorProject | null
  viewSettings: DirectorSnapshot['viewSettings'] | null
  characterBindings: DirectorBinding[] | null
}
export interface DirectorApplication {
  applicationRevisionNo: number
  fileId: DirectorId | null
  directorDeskId: DirectorId | null
  directorRevisionNo: number | null
  imageReferences: DirectorImageReference[]
  videoReferenceSelection: DirectorReferenceSelection | null
  alreadyApplied: boolean
}
export interface DirectorOrigin {
  fileId: DirectorId
  directorDeskId: DirectorId
  directorRevisionNo: number
  name: string
  deleted: boolean
}
export interface DirectorAssetFile {
  id: number; relativePath: string; sha256: string; byteSize: number; contentType: string; dependencies: string[]
}

export interface DirectorCharacterReferenceOption {
  fileUrl?: string | null
  assetId?: DirectorId | null
  characterLookId?: DirectorId | null
  fileId?: DirectorId | null
  assetName?: string | null
  characterName?: string | null
  lookName?: string | null
  characterLookName?: string | null
  defaultLook?: boolean
}

/** Only builds the preview before application. Server-returned references must remain unchanged. */
export function buildDirectorImageReferences(reference: DirectorReference, bindings: DirectorBinding[], options: DirectorCharacterReferenceOption[] = []): DirectorImageReference[] {
  if (reference.referenceType !== 5) throw new Error('生图垫图必须是图片，不能使用视频参考类型')
  const clean = (value?: string | null) => (value ?? '').replace(/[\r\n@{}]/g, ' ').replace(/\s+/g, ' ').trim()
  const identity = (binding: DirectorBinding) => JSON.stringify([String(binding.assetId), String(binding.characterLookId ?? ''), String(binding.referenceFileId)])
  const unique = bindings.filter((binding, index) => binding.referenceFileId != null && bindings.findIndex((other) => identity(other) === identity(binding)) === index)
  const characters = unique.map((binding, index) => {
    const option = options.find((item) => String(item.assetId) === String(binding.assetId) && String(item.fileId) === String(binding.referenceFileId) && (binding.characterLookId == null || String(item.characterLookId) === String(binding.characterLookId)))
    const characterName = clean(option?.assetName) || clean(option?.characterName) || `角色参考图 ${index + 1}`
    const lookName = clean(option?.lookName) || clean(option?.characterLookName) || (option?.defaultLook ? '主图' : '')
    const suffix = ' · 外观参考'
    const title = [characterName, lookName].filter(Boolean).join(' · ')
    return {
      referenceType: 1, fileId: binding.referenceFileId!, fileUrl: option?.fileUrl ?? null, assetId: binding.assetId, characterLookId: binding.characterLookId ?? null,
      displayName: title.slice(0, 128 - suffix.length).trimEnd() + suffix,
      useOnly: '人物长相、发型、服装和配饰', doNotUse: '原图站位、原图姿态和原图背景',
    }
  })
  return [...characters, {
    referenceType: 5, fileId: reference.fileId, fileUrl: reference.fileUrl ?? null, displayName: '导演台 · 构图参考',
    useOnly: '人物站位、朝向、姿势、位置关系和镜头构图', doNotUse: '人偶外观、材质和辅助标记',
  }]
}

async function call<T>(options: ApiRequestOptions): Promise<T> {
  const response = await request<{ code: number; message?: string; data: T }>(OpenAPI, options)
  if (response.code !== 200) throw new Error(response.message || '导演台请求失败')
  return response.data
}
const get = <T>(path: string, query: Record<string, unknown>) => call<T>({ method: 'GET', url: `/api/v1/studio/${path}`, query })
const post = <T>(path: string, body: unknown) => call<T>({ method: 'POST', url: `/api/v1/studio/${path}`, body, mediaType: 'application/json' })

export const StudioDirectorDesks = {
  downloadAsset: async (id: number) => {
    const url = `/api/v1/studio/directorDesks/assets/download?id=${id}`
    const headers = await getHeaders(OpenAPI, { method: 'GET', url })
    const response = await fetch(`${OpenAPI.BASE}${url}`, { headers, credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : 'same-origin' })
    if (!response.ok) {
      const result = await response.json().catch(() => null)
      throw new Error(result?.message || `素材下载失败（${response.status}）`)
    }
    return response.blob()
  },
  openForSegment: (segmentId: DirectorId, id?: DirectorId) => post<{ outcome: 'created' | 'restored' | 'choose'; desk: DirectorDesk | null; candidates: DirectorDeskSummary[]; total: number }>('directorDesks/openForSegment', { segmentId, id }),
  draft: (id: DirectorId) => get<DirectorDraft>('directorDesks/draft', { id }),
  saveDraft: (body: DirectorSnapshot & { id: DirectorId; baseRevisionNo: number; expectedDraftRevisionNo: number; characterBindings: DirectorBinding[] }) => post<DirectorDraft>('directorDesks/saveDraft', body),
  discardDraft: (id: DirectorId, expectedDraftRevisionNo: number) => post<DirectorDraft>('directorDesks/discardDraft', { id, expectedDraftRevisionNo }),
  publishDraft: (id: DirectorId, expectedDraftRevisionNo: number, expectedRevisionNo: number) => post<{ desk: DirectorDesk; draft: DirectorDraft }>('directorDesks/publishDraft', { id, expectedDraftRevisionNo, expectedRevisionNo }),
  revisions: (id: DirectorId, page = 1) => get<{ items: { revisionNo: number; createdAt: string }[]; total: number }>('directorDesks/revisions', { id, page, pageSize: 20 }),
  bindingStatus: (id: DirectorId, revisionNo?: number) => get<{ items: { objectId: string; status: string; message: string }[] }>('directorDesks/bindingStatus', { id, revisionNo }),
  segmentApplications: (segmentId: DirectorId) => get<{ image: DirectorApplication; video: DirectorApplication }>('directorDesks/segmentApplications', { segmentId }),
  applyCapture: (body: { fileId: DirectorId; segmentId: DirectorId; target: 'image' | 'video'; expectedApplicationRevisionNo: number; expectedReferenceRevisionNo?: number; modelId?: DirectorId; includeCharacters: boolean }) => post<DirectorApplication>('directorDesks/applyCapture', body),
  generationOrigins: (generationType: 'image' | 'video', generationId: DirectorId) => get<{ origins: DirectorOrigin[] }>('directorDesks/generationOrigins', { generationType, generationId }),
  forkRevision: (directorDeskId: DirectorId, revisionNo: number, segmentId?: DirectorId) => post<DirectorDesk>('directorDesks/forkRevision', { directorDeskId, revisionNo, segmentId }),
  uploadAsset: (directorDeskId: DirectorId, file: File, relativePath: string) => call<DirectorAssetFile>({ method: 'POST', url: '/api/v1/studio/directorDesks/assets/upload', formData: { directorDeskId, file, relativePath } }),
  assets: (directorDeskId: DirectorId) => get<DirectorAssetFile[]>('directorDesks/assets/list', { directorDeskId }),
  validateAssets: (directorDeskId: DirectorId, files: { assetFileId: number; sha256: string }[]) => post<{ valid: boolean; files: { assetFileId: number; status: string; message: string }[] }>('directorDesks/assets/validate', { directorDeskId, files }),
  list: (query: { page: number; pageSize: number; keyword?: string; segmentId?: DirectorId }) =>
    get<{ items: DirectorDeskSummary[]; page: number; pageSize: number; total: number }>('directorDesks/list', query),
  create: (name: string, segmentId?: DirectorId) => post<DirectorDesk>('directorDesks/create', { name, segmentId }),
  detail: (id: DirectorId, revisionNo?: number) => get<DirectorDesk>('directorDesks/detail', { id, revisionNo }),
  save: (body: DirectorSnapshot & { id: DirectorId; expectedRevisionNo: number; characterBindings: DirectorBinding[]; name?: string; coverFileId?: DirectorId }) => {
    if (new Blob([JSON.stringify({ project: body.project, viewSettings: body.viewSettings, characterBindings: body.characterBindings })]).size > 5 * 1024 * 1024) {
      throw new Error('工程快照超过 5 MiB，请先导出并清理不需要的历史截图或素材')
    }
    return post<DirectorDesk>('directorDesks/save', body)
  },
  delete: (id: DirectorId) => post<unknown>('directorDesks/delete', { id }),
  captures: (id: DirectorId) => get<DirectorCapture[]>('directorDesks/captures', { id }),
  upload: (formData: { segmentId: DirectorId; file: File; directorDeskId: DirectorId; directorRevisionNo: number; cameraId?: string; captureProgress: number }) =>
    call<DirectorReference>({ method: 'POST', url: '/api/v1/studio/storyboards/videos/references/upload', formData }),
  references: (segmentId: DirectorId, modelId: DirectorId) => get<DirectorReferenceSelection>('storyboards/videos/references', { segmentId, modelId }),
  addReferences: (segmentId: DirectorId, expectedRevisionNo: number, references: DirectorReference[]) =>
    post<DirectorReferenceSelection>('storyboards/videos/references/add', { segmentId, expectedRevisionNo, references }),
  generateImage: (body: { segmentId: DirectorId; modelId: number; prompt: string; aspectRatio: string; resolution: number; quality?: number; visualStyleId: number | null; references: DirectorImageReference[] }) =>
    post<unknown>('storyboards/images/generate', { ...body, references: body.references.map(({ referenceType, fileId, assetId, characterLookId, displayName, useOnly, doNotUse }) => ({ referenceType, fileId, assetId, characterLookId, displayName, useOnly, doNotUse })) }),
}
