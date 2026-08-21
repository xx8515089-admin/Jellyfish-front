import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Image, Select, Space, Tag, Typography, message } from 'antd'
import { CameraOutlined, DownloadOutlined, SendOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  StudioFilesService,
  StudioShotFrameImagesService,
  StudioShotsService,
} from '../../../services/generated'
import type { ShotFrameImageRead, ShotFrameType, ShotRead } from '../../../services/generated'
import { getApiErrorMessage } from '../../../services/apiErrors'
import { buildFileDownloadUrl } from '../assets/utils'
import { getChapterStudioPath } from '../project/ProjectWorkbench/routes'
import { useBilingualText } from '../../../i18n/useBilingualText'

const { Text } = Typography

type DirectorCaptureMessage = {
  type: 'director-stage:capture'
  dataURL: string
  meta?: {
    camera?: string
    ratio?: string
    width?: number
    height?: number
    timestamp?: number
    sceneJSON?: unknown
  }
}

type LastCapture = {
  dataURL: string
  meta: DirectorCaptureMessage['meta']
  fileId?: string
  uploadedAt?: number
}

const frameOptions: Array<{ value: ShotFrameType; label: string; labelEn: string }> = [
  { value: 'first', label: '首帧', labelEn: 'First frame' },
  { value: 'key', label: '关键帧', labelEn: 'Keyframe' },
  { value: 'last', label: '尾帧', labelEn: 'Last frame' },
]

function dataUrlToFile(dataURL: string, fileName: string): File {
  const [header, payload] = dataURL.split(',')
  const mime = /data:(.*?);base64/.exec(header)?.[1] || 'image/png'
  const binary = window.atob(payload || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mime })
}

function formatTimestamp(value?: number) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export default function DirectorStagePage() {
  const l = useBilingualText()
  const { projectId, chapterId } = useParams<{ projectId?: string; chapterId?: string }>()
  const [searchParams] = useSearchParams()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const initialShotId = searchParams.get('shotId') || ''
  const [shots, setShots] = useState<ShotRead[]>([])
  const [shotId, setShotId] = useState(initialShotId)
  const [frameType, setFrameType] = useState<ShotFrameType>('key')
  const [lastCapture, setLastCapture] = useState<LastCapture | null>(null)
  const [uploading, setUploading] = useState(false)
  const [writingFrame, setWritingFrame] = useState(false)

  const selectedShot = useMemo(() => shots.find((shot) => shot.id === shotId) ?? null, [shotId, shots])
  const currentStudioPath = projectId && chapterId ? getChapterStudioPath(projectId, chapterId) : '/projects'

  useEffect(() => {
    if (!chapterId) return
    let active = true
    void (async () => {
      try {
        const res = await StudioShotsService.listShotsApiV1StudioShotsGet({
          chapterId,
          page: 1,
          pageSize: 200,
          order: 'index',
          isDesc: false,
        })
        if (!active) return
        const items = (res.data?.items ?? []).slice().sort((a, b) => a.index - b.index)
        setShots(items)
        if (!shotId && items[0]) setShotId(items[0].id)
      } catch (err) {
        if (active) message.error(l(`加载分镜失败：${getApiErrorMessage(err)}`, `Failed to load shots: ${getApiErrorMessage(err)}`))
      }
    })()
    return () => {
      active = false
    }
  }, [chapterId, l, shotId])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as Partial<DirectorCaptureMessage> | null
      if (!data || data.type !== 'director-stage:capture' || typeof data.dataURL !== 'string') return
      setLastCapture({
        dataURL: data.dataURL,
        meta: data.meta ?? {},
      })
      message.success(l('已接收导演台截图', 'Director-stage capture received'))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [l])

  const requestCapture = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'director-stage:request-capture' }, window.location.origin)
  }, [])

  const uploadCapture = useCallback(async () => {
    if (!lastCapture) {
      message.warning(l('请先在导演台截图', 'Take a capture in the director stage first'))
      return null
    }
    setUploading(true)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const file = dataUrlToFile(lastCapture.dataURL, `director-stage-${frameType}-${stamp}.png`)
      const res = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
        formData: {
          file,
          project_id: projectId ?? null,
          chapter_id: chapterId ?? null,
          shot_id: shotId || null,
          usage_kind: shotId ? 'shot_frame' : 'upload',
          source_ref: shotId ? `shot:${shotId}:director_stage:${frameType}` : 'director_stage:capture',
        } as any,
        name: file.name,
      })
      const fileId = res.data?.id
      if (!fileId) throw new Error(l('上传成功但后端未返回 file_id', 'Upload succeeded but no file_id was returned'))
      setLastCapture((prev) => prev ? { ...prev, fileId, uploadedAt: Date.now() } : prev)
      message.success(l(`导演台截图已上传：${fileId}`, `Director-stage capture uploaded: ${fileId}`))
      return fileId
    } catch (err) {
      message.error(l(`上传截图失败：${getApiErrorMessage(err)}`, `Failed to upload capture: ${getApiErrorMessage(err)}`))
      return null
    } finally {
      setUploading(false)
    }
  }, [chapterId, frameType, l, lastCapture, projectId, shotId])

  const ensureFrameSlot = useCallback(async (targetShotId: string, targetFrameType: ShotFrameType) => {
    const list = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({
      shotDetailId: targetShotId,
      page: 1,
      pageSize: 20,
      order: 'id',
      isDesc: false,
    })
    const existing = (list.data?.items ?? []).find((item) => item.frame_type === targetFrameType)
    if (existing) return existing
    const created = await StudioShotFrameImagesService.createShotFrameImageApiV1StudioShotFrameImagesPost({
      requestBody: {
        shot_detail_id: targetShotId,
        frame_type: targetFrameType,
        file_id: null,
        format: 'png',
      },
    })
    if (!created.data) throw new Error(l('创建 frame slot 失败', 'Failed to create frame slot'))
    return created.data as ShotFrameImageRead
  }, [l])

  const writeCaptureToFrame = useCallback(async () => {
    if (!shotId) {
      message.warning(l('请选择要写入的分镜', 'Select a shot to update'))
      return
    }
    setWritingFrame(true)
    try {
      const fileId = lastCapture?.fileId || await uploadCapture()
      if (!fileId) return
      const slot = await ensureFrameSlot(shotId, frameType)
      await StudioShotFrameImagesService.updateShotFrameImageApiV1StudioShotFrameImagesImageIdPatch({
        imageId: slot.id,
        requestBody: {
          file_id: fileId,
          format: 'png',
        },
      })
      setLastCapture((prev) => prev ? { ...prev, fileId } : prev)
      const option = frameOptions.find((item) => item.value === frameType)
      message.success(l(`已写入${option?.label ?? frameType}`, `Written to ${option?.labelEn ?? frameType}`))
    } catch (err) {
      message.error(l(`写入分镜帧失败：${getApiErrorMessage(err)}`, `Failed to write shot frame: ${getApiErrorMessage(err)}`))
    } finally {
      setWritingFrame(false)
    }
  }, [ensureFrameSlot, frameType, l, lastCapture?.fileId, shotId, uploadCapture])

  return (
    <div className="h-full min-h-0 overflow-hidden bg-slate-100 flex flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900">{l('3D 导演台', '3D Director Stage')}</div>
          <div className="text-xs text-slate-500">{l('用于站位、机位、遮挡关系和画幅参考；截图可写入首帧、关键帧或尾帧。', 'Use it to plan blocking, camera placement, occlusion, and framing. Captures can be written to first, key, or last-frame slots.')}</div>
        </div>
        <div className="flex-1" />
        <Link to={currentStudioPath}>
          <Button size="small">{l('返回分镜生成面板', 'Back to shot generation')}</Button>
        </Link>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-0 bg-black">
          <iframe
            ref={iframeRef}
            title="3D Director Stage"
            src="/director-stage.html"
            className="block h-full w-full border-0"
            allow="fullscreen"
          />
        </div>

        <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
          <Space direction="vertical" size="middle" className="w-full">
            <Card size="small" title={l('写回目标', 'Write-back target')}>
              <Space direction="vertical" className="w-full">
                <div>
                  <div className="mb-1 text-xs text-slate-500">{l('分镜', 'Shot')}</div>
                  <Select
                    className="w-full"
                    value={shotId || undefined}
                    placeholder={l('选择分镜', 'Select a shot')}
                    showSearch
                    optionFilterProp="label"
                    onChange={(value) => setShotId(value)}
                    options={shots.map((shot) => ({
                      value: shot.id,
                      label: `${String(shot.index).padStart(2, '0')} · ${shot.title}`,
                    }))}
                  />
                </div>
                {selectedShot ? (
                  <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                    {selectedShot.script_excerpt || selectedShot.title}
                  </div>
                ) : null}
                <div>
                  <div className="mb-1 text-xs text-slate-500">{l('帧槽', 'Frame slot')}</div>
                  <Select
                    className="w-full"
                    value={frameType}
                    onChange={(value) => setFrameType(value)}
                    options={frameOptions.map((item) => ({ value: item.value, label: l(item.label, item.labelEn) }))}
                  />
                </div>
                <Button icon={<CameraOutlined />} onClick={requestCapture} block>
                  {l('从当前机位截图', 'Capture current camera')}
                </Button>
                <Button icon={<SendOutlined />} type="primary" loading={writingFrame || uploading} onClick={() => void writeCaptureToFrame()} block>
                  {l('上传并写入分镜帧', 'Upload and write to shot frame')}
                </Button>
              </Space>
            </Card>

            <Card size="small" title={l('最近截图', 'Latest capture')}>
              {lastCapture ? (
                <Space direction="vertical" className="w-full">
                  <Image src={lastCapture.dataURL} width="100%" />
                  <div className="space-y-1 text-xs text-slate-600">
                    <div>camera: {lastCapture.meta?.camera || '-'}</div>
                    <div>ratio: {lastCapture.meta?.ratio || '-'} · {lastCapture.meta?.width || '-'}x{lastCapture.meta?.height || '-'}</div>
                    <div>time: {formatTimestamp(lastCapture.meta?.timestamp) || '-'}</div>
                    {lastCapture.fileId ? (
                      <div className="break-all">
                        file_id: <Tag className="font-mono">{lastCapture.fileId}</Tag>
                      </div>
                    ) : null}
                  </div>
                  <Space wrap>
                    <Button size="small" loading={uploading} onClick={() => void uploadCapture()}>
                      {l('仅上传', 'Upload only')}
                    </Button>
                    {lastCapture.fileId ? (
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        href={buildFileDownloadUrl(lastCapture.fileId) ?? undefined}
                        target="_blank"
                      >
                        {l('打开文件', 'Open file')}
                      </Button>
                    ) : null}
                  </Space>
                </Space>
              ) : (
                <Text type="secondary">{l('还没有截图。点击“从当前机位截图”或导演台内的截图按钮。', 'No capture yet. Use the capture button here or inside the director stage.')}</Text>
              )}
            </Card>

            <Card size="small" title={l('接入说明', 'Integration notes')}>
              <Space direction="vertical" size={6} className="text-xs text-slate-600">
                <div><VideoCameraOutlined /> {l('导演台只生成站位/机位参考图，不直接调用任何外部 AI 供应商。', 'The director stage only creates blocking and camera references; it does not call any external AI provider directly.')}</div>
                <div>{l('截图会作为普通 Jellyfish File 上传，并可写入 shot_frame_images 的 first/key/last 槽。', 'Captures are uploaded as regular Jellyfish files and can be written to first, key, or last shot_frame_images slots.')}</div>
                <div>{l('后续生图时，把该帧作为参考图或首尾帧使用即可。', 'Use the frame later as a reference image or as the first or last frame for image generation.')}</div>
              </Space>
            </Card>
          </Space>
        </aside>
      </div>
    </div>
  )
}
