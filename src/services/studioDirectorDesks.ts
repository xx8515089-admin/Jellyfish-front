import { OpenAPI } from './generated'
import { request } from './generated/core/request'
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
  fileUrl?: string
  displayName: string
  referenceIndex?: number
  referenceToken?: string
}
export interface DirectorReferenceSelection { revisionNo: number; references: DirectorReference[] }
export interface DirectorImageReference extends DirectorReference {
  useOnly: string
  doNotUse: string
}

export function buildDirectorImageReferences(reference: DirectorReference, bindings: DirectorBinding[]): DirectorImageReference[] {
  if (reference.referenceType !== 5) throw new Error('生图垫图必须是图片，不能使用视频参考类型')
  const characters = bindings.filter((binding) => binding.referenceFileId != null).map((binding) => ({
    referenceType: 1, fileId: binding.referenceFileId!, displayName: `角色 ${binding.assetId}`,
    useOnly: '角色身份、面部、发型和服装', doNotUse: '背景、姿势、构图和机位',
  }))
  return [...characters.filter((item, index) => characters.findIndex((other) => String(other.fileId) === String(item.fileId)) === index), {
    referenceType: 5, fileId: reference.fileId, displayName: reference.displayName,
    useOnly: '人物站位、姿势、镜头构图和空间关系', doNotUse: '占位模型的面部、材质和角色身份',
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
  generateImage: (body: { segmentId: DirectorId; modelId: number; prompt: string; aspectRatio: string; resolution: number; quality?: number; visualStyleId: number; references: DirectorImageReference[] }) =>
    post<unknown>('storyboards/images/generate', body),
}
