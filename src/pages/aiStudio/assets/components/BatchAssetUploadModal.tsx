import { useMemo, useState } from 'react'
import { Button, Modal, Progress, Space, Table, Tag, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { StudioFilesService } from '../../../../services/generated'
import { StudioEntitiesApi } from '../../../../services/studioEntities'
import { useProjectStyleOptions } from '../../project/useProjectStyleOptions'
import { useBilingualText } from '../../../../i18n/useBilingualText'

type BatchAssetType = 'actor' | 'scene' | 'prop' | 'costume'
type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'skipped'

type BatchAssetItem = {
  key: string
  file: File
  type: BatchAssetType
  name: string
  status: UploadStatus
  progress: number
  message: string
}

const TYPE_LABEL: Record<BatchAssetType, string> = {
  actor: '演员',
  scene: '场景',
  prop: '道具',
  costume: '服装',
}

const TYPE_PREFIX_ALIASES: Record<string, BatchAssetType> = {
  actor: 'actor',
  actors: 'actor',
  cast: 'actor',
  performer: 'actor',
  演员: 'actor',
  定妆: 'actor',
  scene: 'scene',
  scenes: 'scene',
  location: 'scene',
  bg: 'scene',
  background: 'scene',
  场景: 'scene',
  场地: 'scene',
  prop: 'prop',
  props: 'prop',
  object: 'prop',
  item: 'prop',
  道具: 'prop',
  costume: 'costume',
  costumes: 'costume',
  clothing: 'costume',
  cloth: 'costume',
  outfit: 'costume',
  wardrobe: 'costume',
  服装: 'costume',
  服饰: 'costume',
}

function isImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith('image/')
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name)
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim()
}

function cleanAssetName(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAssetFile(file: File, fallbackType: BatchAssetType): { type: BatchAssetType; name: string } {
  const raw = baseName(file.name)
  const parts = raw.split(/[_\-\s]+/).filter(Boolean)
  const first = (parts[0] ?? '').trim().toLowerCase()
  const aliased = TYPE_PREFIX_ALIASES[first]
  if (aliased && parts.length > 1) {
    return {
      type: aliased,
      name: cleanAssetName(parts.slice(1).join(' ')) || raw,
    }
  }
  return {
    type: fallbackType,
    name: cleanAssetName(raw) || file.name,
  }
}

function inferFormat(file: File): string {
  const ext = file.name.split('.').pop()?.trim().toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (ext === 'webp') return 'webp'
  if (ext === 'gif') return 'gif'
  return 'png'
}

async function findExistingAssetId(type: BatchAssetType, name: string): Promise<string | null> {
  const res = await StudioEntitiesApi.list(type, {
    q: name,
    page: 1,
    pageSize: 20,
    order: null,
    isDesc: false,
  })
  const items = res.data?.items ?? []
  const exact = items.find((item: any) => String(item?.name ?? '').trim() === name)
  return exact?.id ? String(exact.id) : null
}

export function BatchAssetUploadModal({
  open,
  defaultType,
  onCancel,
  onImported,
}: {
  open: boolean
  defaultType: BatchAssetType
  onCancel: () => void
  onImported: () => void
}) {
  const l = useBilingualText()
  const { defaultVisualStyle, getDefaultStyle } = useProjectStyleOptions()
  const [items, setItems] = useState<BatchAssetItem[]>([])
  const [running, setRunning] = useState(false)

  const pendingCount = useMemo(() => items.filter((item) => item.status === 'pending').length, [items])

  const reset = () => {
    if (running) return
    setItems([])
    onCancel()
  }

  const updateItem = (key: string, patch: Partial<BatchAssetItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const addFiles = (files: File[]) => {
    const accepted = files.filter(isImageFile)
    if (accepted.length !== files.length) {
      message.warning(l('已忽略非图片文件', 'Non-image files were ignored'))
    }
    setItems((prev) => {
      const known = new Set(prev.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`))
      const next = [...prev]
      accepted.forEach((file) => {
        const dedupeKey = `${file.name}:${file.size}:${file.lastModified}`
        if (known.has(dedupeKey)) return
        const parsed = parseAssetFile(file, defaultType)
        next.push({
          key: `${dedupeKey}:${Math.random().toString(36).slice(2)}`,
          file,
          type: parsed.type,
          name: parsed.name,
          status: 'pending',
          progress: 0,
          message: '',
        })
      })
      return next
    })
  }

  const importOne = async (item: BatchAssetItem) => {
    updateItem(item.key, { status: 'uploading', progress: 10, message: l('准备资产', 'Preparing asset') })
    const existingId = await findExistingAssetId(item.type, item.name)
    let assetId = existingId
    if (!assetId) {
      const created = await StudioEntitiesApi.create(item.type, {
        id: crypto?.randomUUID?.() ?? `asset_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: item.name,
        description: '',
        tags: ['本地上传'],
        view_count: 1,
        thumbnail: '',
        visual_style: defaultVisualStyle,
        style: getDefaultStyle(defaultVisualStyle),
        prompt_template_id: null,
      })
      assetId = created.data?.id ? String(created.data.id) : null
    }
    if (!assetId) {
      throw new Error(l('资产创建失败：缺少资产 ID', 'Failed to create asset: missing asset ID'))
    }
    const resolvedAssetId = assetId

    updateItem(item.key, { progress: 35, message: existingId ? l('复用已有资产', 'Reusing existing asset') : l('已创建资产', 'Asset created') })
    const imageSlot = await StudioEntitiesApi.createImage(item.type, resolvedAssetId, {
      view_angle: 'FRONT',
      quality_level: 'LOW',
      format: inferFormat(item.file),
    }).catch(async () => {
      const images = await StudioEntitiesApi.listImages(item.type, resolvedAssetId, { page: 1, pageSize: 100 })
      const slot = (images.data?.items ?? []).find((row: any) => row?.view_angle === 'FRONT')
      if (!slot?.id) throw new Error(l('图片槽创建失败', 'Failed to create image slot'))
      return { data: slot } as any
    })
    const imageId = imageSlot.data?.id
    if (!imageId) {
      throw new Error(l('图片槽创建失败：缺少图片槽 ID', 'Failed to create image slot: missing image slot ID'))
    }

    updateItem(item.key, { progress: 55, message: l('上传图片', 'Uploading image') })
    const uploaded = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
      formData: {
        file: item.file,
        usage_kind: item.type === 'actor' ? 'asset_image' : 'asset_image',
        source_ref: `asset:${item.type}:${resolvedAssetId}:front`,
      } as any,
      name: item.file.name,
    })
    const fileId = uploaded.data?.id
    if (!fileId) {
      throw new Error(l('上传失败：缺少文件 ID', 'Upload failed: missing file ID'))
    }

    updateItem(item.key, { progress: 80, message: l('绑定图片', 'Linking image') })
    await StudioEntitiesApi.updateImage(item.type, resolvedAssetId, Number(imageId), {
      file_id: fileId,
      format: inferFormat(item.file),
    })
    updateItem(item.key, { status: 'done', progress: 100, message: existingId ? l('已绑定到已有资产', 'Linked to existing asset') : l('已创建并绑定', 'Created and linked') })
  }

  const runImport = async () => {
    setRunning(true)
    try {
      for (const item of items) {
        if (item.status !== 'pending') continue
        try {
          await importOne(item)
        } catch (err) {
          updateItem(item.key, {
            status: 'failed',
            progress: 100,
            message: err instanceof Error ? err.message : l('导入失败', 'Import failed'),
          })
        }
      }
      onImported()
      message.success(l('批量导入处理完成', 'Batch import complete'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal
      title={l('批量导入本地资产图片', 'Batch import local asset images')}
      open={open}
      onCancel={reset}
      width={980}
      footer={
        <Space>
          <Button onClick={reset} disabled={running}>
            {l('关闭', 'Close')}
          </Button>
          <Button type="primary" onClick={() => void runImport()} disabled={running || pendingCount === 0} loading={running}>
            {l('开始导入', 'Start import')}{pendingCount ? l(`（${pendingCount}）`, ` (${pendingCount})`) : ''}
          </Button>
        </Space>
      }
    >
      <div className="space-y-3">
        <Upload.Dragger
          multiple
          accept="image/*"
          showUploadList={false}
          beforeUpload={(_file, fileList) => {
            addFiles(fileList as File[])
            return Upload.LIST_IGNORE
          }}
          disabled={running}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{l('点击或拖拽多个本地图片到这里', 'Click or drag multiple local images here')}</p>
          <p className="ant-upload-hint">
            {l('文件名可用 actor_张三、scene_办公室、prop_钥匙、costume_黑西装；无前缀时按当前 tab 类型导入。', 'Use names such as actor_John, scene_Office, prop_Key, or costume_BlackSuit. Files without a prefix use the current tab type.')}
          </p>
        </Upload.Dragger>

        <Table
          size="small"
          rowKey="key"
          dataSource={items}
          pagination={false}
          columns={[
            { title: l('文件', 'File'), dataIndex: ['file', 'name'], ellipsis: true },
            {
              title: l('类型', 'Type'),
              dataIndex: 'type',
              width: 90,
              render: (type: BatchAssetType) => <Tag>{l(TYPE_LABEL[type], { actor: 'Actor', scene: 'Scene', prop: 'Prop', costume: 'Costume' }[type])}</Tag>,
            },
            { title: l('资产名称', 'Asset name'), dataIndex: 'name', ellipsis: true },
            {
              title: l('进度', 'Progress'),
              dataIndex: 'progress',
              width: 150,
              render: (progress: number) => <Progress percent={progress} size="small" />,
            },
            {
              title: l('状态', 'Status'),
              dataIndex: 'status',
              width: 100,
              render: (status: UploadStatus) => {
                if (status === 'done') return <Tag color="green">{l('完成', 'Complete')}</Tag>
                if (status === 'failed') return <Tag color="red">{l('失败', 'Failed')}</Tag>
                if (status === 'uploading') return <Tag color="blue">{l('处理中', 'Processing')}</Tag>
                if (status === 'skipped') return <Tag color="orange">{l('跳过', 'Skipped')}</Tag>
                return <Tag>{l('待导入', 'Pending import')}</Tag>
              },
            },
            { title: l('说明', 'Description'), dataIndex: 'message', ellipsis: true },
          ]}
        />
      </div>
    </Modal>
  )
}
