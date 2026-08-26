import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Image, Modal, Select, Typography, message } from 'antd'
import type {
  Body_upload_file_api_api_v1_studio_files_upload_post,
  ShotFrameImageRead,
  ShotFrameType,
  ShotRead,
} from '../../services/generated'
import {
  StudioFilesService,
  StudioShotFrameImagesService,
  StudioShotsService,
} from '../../services/generated'
import { getApiErrorMessage } from '../../services/apiErrors'
import {
  DIRECTOR_DESK_CAPTURES_SENT_EVENT,
  type DirectorDeskCaptureItem,
  type DirectorDeskCapturesSentEventDetail,
} from './runtime/editor/io/hostBridge'

const { Text } = Typography

const frameOptions: Array<{ value: ShotFrameType; label: string }> = [
  { value: 'first', label: '首帧' },
  { value: 'key', label: '关键帧' },
  { value: 'last', label: '尾帧' },
]

async function captureToFile(capture: DirectorDeskCaptureItem) {
  if (capture.dataUrl.startsWith('data:')) {
    const [header, payload = ''] = capture.dataUrl.split(',')
    const mime = /data:(.*?);base64/.exec(header)?.[1] || 'image/png'
    const binary = window.atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new File([bytes], capture.fileName, { type: mime })
  }

  const response = await fetch(capture.dataUrl)
  if (!response.ok) {
    throw new Error(`读取截图失败（${response.status}）`)
  }
  const blob = await response.blob()
  return new File([blob], capture.fileName, { type: blob.type || 'image/png' })
}

function downloadCapture(capture: DirectorDeskCaptureItem) {
  const anchor = document.createElement('a')
  anchor.href = capture.dataUrl
  anchor.download = capture.fileName
  anchor.rel = 'noopener'
  anchor.click()
}

export interface DirectorDeskCaptureBridgeProps {
  projectId?: string
  chapterId?: string
  initialShotId?: string
}

export default function DirectorDeskCaptureBridge({
  projectId,
  chapterId,
  initialShotId,
}: DirectorDeskCaptureBridgeProps) {
  const [open, setOpen] = useState(false)
  const [captures, setCaptures] = useState<DirectorDeskCaptureItem[]>([])
  const [activeCaptureIndex, setActiveCaptureIndex] = useState(0)
  const [shots, setShots] = useState<ShotRead[]>([])
  const [shotId, setShotId] = useState(initialShotId || '')
  const [frameType, setFrameType] = useState<ShotFrameType>('key')
  const [shotsLoading, setShotsLoading] = useState(false)
  const [writing, setWriting] = useState(false)

  const activeCapture = captures[activeCaptureIndex] ?? null
  const selectedShot = useMemo(
    () => shots.find((shot) => shot.id === shotId) ?? null,
    [shotId, shots],
  )

  useEffect(() => {
    function handleCapturesSent(event: Event) {
      const detail = (event as CustomEvent<DirectorDeskCapturesSentEventDetail>).detail
      if (!detail?.captures?.length) return
      setCaptures(detail.captures)
      setActiveCaptureIndex(0)
      setOpen(true)
    }

    window.addEventListener(DIRECTOR_DESK_CAPTURES_SENT_EVENT, handleCapturesSent)
    return () => window.removeEventListener(DIRECTOR_DESK_CAPTURES_SENT_EVENT, handleCapturesSent)
  }, [])

  useEffect(() => {
    if (!chapterId) return
    let active = true
    setShotsLoading(true)

    void StudioShotsService.listShotsApiV1StudioShotsGet({
      chapterId,
      page: 1,
      pageSize: 200,
      order: 'index',
      isDesc: false,
    }).then((response) => {
      if (!active) return
      const items = (response.data?.items ?? []).slice().sort((left, right) => left.index - right.index)
      setShots(items)
      setShotId((current) => {
        if (current && items.some((shot) => shot.id === current)) return current
        return items[0]?.id ?? ''
      })
    }).catch((error) => {
      if (active) message.error(`加载分镜失败：${getApiErrorMessage(error)}`)
    }).finally(() => {
      if (active) setShotsLoading(false)
    })

    return () => {
      active = false
    }
  }, [chapterId])

  const ensureFrameSlot = useCallback(async (targetShotId: string, targetFrameType: ShotFrameType) => {
    const response = await StudioShotFrameImagesService.listShotFrameImagesApiV1StudioShotFrameImagesGet({
      shotDetailId: targetShotId,
      page: 1,
      pageSize: 20,
      order: 'id',
      isDesc: false,
    })
    const existing = (response.data?.items ?? []).find((item) => item.frame_type === targetFrameType)
    if (existing) return existing

    const created = await StudioShotFrameImagesService.createShotFrameImageApiV1StudioShotFrameImagesPost({
      requestBody: {
        shot_detail_id: targetShotId,
        frame_type: targetFrameType,
        file_id: null,
        format: 'png',
      },
    })
    if (!created.data) throw new Error('创建分镜帧槽失败')
    return created.data as ShotFrameImageRead
  }, [])

  const writeCaptureToFrame = useCallback(async () => {
    if (!activeCapture || !projectId || !chapterId || !shotId) {
      message.warning('请选择要写入的分镜')
      return
    }

    setWriting(true)
    try {
      const file = await captureToFile(activeCapture)
      const uploadResponse = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
        formData: {
          file,
          project_id: projectId,
          chapter_id: chapterId,
          shot_id: shotId,
          usage_kind: 'shot_frame',
          source_ref: `shot:${shotId}:director_desk:${frameType}`,
        } as unknown as Body_upload_file_api_api_v1_studio_files_upload_post,
        name: file.name,
      })
      const fileId = uploadResponse.data?.id
      if (!fileId) throw new Error('上传成功但未返回文件 ID')

      const slot = await ensureFrameSlot(shotId, frameType)
      await StudioShotFrameImagesService.updateShotFrameImageApiV1StudioShotFrameImagesImageIdPatch({
        imageId: slot.id,
        requestBody: { file_id: fileId, format: 'png' },
      })
      message.success(`已写入${frameOptions.find((item) => item.value === frameType)?.label ?? '分镜帧'}`)
      setOpen(false)
    } catch (error) {
      message.error(`写入分镜帧失败：${getApiErrorMessage(error)}`)
    } finally {
      setWriting(false)
    }
  }, [activeCapture, chapterId, ensureFrameSlot, frameType, projectId, shotId])

  return (
    <Modal
      centered
      destroyOnClose={false}
      footer={null}
      open={open}
      title="导演台截图"
      width={760}
      onCancel={() => setOpen(false)}
    >
      <div className="grid min-h-[320px] grid-cols-[minmax(0,1fr)_260px] gap-4 max-md:grid-cols-1">
        <div className="min-w-0 rounded border border-white/10 bg-black/40 p-3">
          {activeCapture ? (
            <Image className="max-h-[440px] object-contain" preview src={activeCapture.dataUrl} width="100%" />
          ) : null}
          {captures.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {captures.map((capture, index) => (
                <button
                  key={`${capture.fileName}-${index}`}
                  className={`h-14 w-20 shrink-0 overflow-hidden rounded border bg-black/30 ${
                    activeCaptureIndex === index ? 'border-indigo-400' : 'border-white/10'
                  }`}
                  type="button"
                  onClick={() => setActiveCaptureIndex(index)}
                >
                  <img alt={capture.fileName} className="h-full w-full object-cover" src={capture.dataUrl} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {chapterId ? (
            <>
              <div>
                <div className="mb-1 text-xs text-white/60">写入分镜</div>
                <Select
                  className="w-full"
                  loading={shotsLoading}
                  optionFilterProp="label"
                  options={shots.map((shot) => ({
                    value: shot.id,
                    label: `${String(shot.index).padStart(2, '0')} · ${shot.title}`,
                  }))}
                  placeholder="选择分镜"
                  showSearch
                  value={shotId || undefined}
                  onChange={setShotId}
                />
              </div>
              {selectedShot ? (
                <Text className="line-clamp-3 text-xs" type="secondary">
                  {selectedShot.script_excerpt || selectedShot.title}
                </Text>
              ) : null}
              <div>
                <div className="mb-1 text-xs text-white/60">帧类型</div>
                <Select className="w-full" options={frameOptions} value={frameType} onChange={setFrameType} />
              </div>
            </>
          ) : (
            <Text type="secondary">当前是独立导演台，截图可直接下载；从项目章节进入后还可写入分镜帧。</Text>
          )}

          <div className="mt-auto flex justify-end gap-2">
            <Button disabled={!activeCapture} onClick={() => activeCapture && downloadCapture(activeCapture)}>
              下载截图
            </Button>
            {chapterId ? (
              <Button
                disabled={!activeCapture || !shotId}
                loading={writing}
                type="primary"
                onClick={() => void writeCaptureToFrame()}
              >
                写入分镜帧
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  )
}
