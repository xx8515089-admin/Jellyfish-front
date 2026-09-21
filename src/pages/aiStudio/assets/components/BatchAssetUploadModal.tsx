import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Progress, Table, Tag, Upload, message } from 'antd'
import { FileImageOutlined } from '@ant-design/icons'
import type { ImportItem } from '../../../../services/assetImportGenerated'
import { AssetImportSession, importError } from './assetImportSession'
import { useBilingualText } from '../../../../i18n/useBilingualText'

import './AssetImportModal.css'

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
  serverItemId?: string
  retryable?: boolean
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

/** 仅接受上传链路能正确标注格式的非空图片；不能把 SVG/AVIF 当作 PNG 提交。 */
function isImageFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext]
  return file.size > 0 && Boolean(mime) && (!file.type || file.type === mime)
}

/** 去掉扩展名，保留名称用于前缀解析。 */
function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim()
}

/** 统一文件名分隔符，生成可读的资产名。 */
function cleanAssetName(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 识别明确的资产前缀，无前缀使用当前分类。 */
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

/** 新批次协议上传与导入图片，由服务端原子入库并按条目返回重试资格。 */
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
  const [items, setItems] = useState<BatchAssetItem[]>([])
  const [running, setRunning] = useState(false)
  const requestLock = useRef(false)
  const session = useRef(new AssetImportSession())
  const [recovering, setRecovering] = useState(false)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    session.current.active = true
    return () => { session.current.active = false }
  }, [])

  const pendingCount = useMemo(() => items.filter((item) => item.status === 'pending').length, [items])

  const failedCount = items.filter((item) => item.status === 'failed').length
  const retryableCount = items.filter((item) => item.status === 'failed' && item.retryable).length
  const doneCount = items.filter((item) => item.status === 'done').length
  const skippedCount = items.filter((item) => item.status === 'skipped').length

  /** 请求执行期间保留队列及重试所需 ID。 */
  const reset = () => {
    if (requestLock.current) return
    if (recovering) { onCancel(); return }
    session.current.active = false
    session.current = new AssetImportSession()
    setItems([])
    setRecovering(false)
    setFinished(false)
    onCancel()
  }

  /** 更新本地上传阶段和服务端返回的条目结果。 */
  const updateItem = (key: string, patch: Partial<BatchAssetItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  /** 同一批次与多次选择均去重，支持 Upload 对每个文件重复调用回调。 */
  const addFiles = (files: File[]) => {
    if (requestLock.current || session.current.batch) return
    const accepted = files.filter(isImageFile)
    if (accepted.length !== files.length) {
      message.warning(l('已忽略空文件或不支持的图片；支持 JPG、PNG、WebP、GIF', 'Ignored empty or unsupported files; use JPG, PNG, WebP or GIF'))
    }
    setItems((prev) => {
      const known = new Set(prev.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`))
      const next = [...prev]
      accepted.forEach((file) => {
        const dedupeKey = `${file.name}:${file.size}:${file.lastModified}`
        if (known.has(dedupeKey)) return
        known.add(dedupeKey)
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

  /** Match authoritative server rows to local files without inferring IDs or completion. */
  const acceptRows = (rows: ImportItem[]) => {
    setItems(previous => previous.map(item => {
      const row = rows.find(result => result.clientItemId === item.key)
      if (!row) return item
      const status: UploadStatus = row.status === 'succeeded' ? 'done'
        : row.status === 'failed' || row.status === 'invalid' ? 'failed'
        : row.status === 'skipped' || row.action === 'skip' ? 'skipped'
        : row.status === 'running' ? 'uploading' : 'pending'
      return { ...item, name: row.name || item.name, type: row.assetType ? ({ 1: 'actor', 2: 'scene', 3: 'prop' } as const)[row.assetType] : item.type, serverItemId: row.itemId, retryable: row.retryable === true, status,
        progress: status === 'done' || status === 'skipped' ? 100 : status === 'uploading' ? 80 : item.progress,
        message: row.errors.map(error => error.message).join('；') || (status === 'done' ? l('已入库', 'Imported') : status === 'skipped' ? l('已有正面图片，已跳过', 'Existing front image skipped') : status === 'failed' ? l('请修正后重新添加', 'Correct and add again') : l('等待后端处理', 'Waiting for processing')) }
    }))
  }

  /** Upload into one draft, validate, then commit; uncertain commands retain their original keys. */
  const runImport = async (retryFailed = false) => {
    if (requestLock.current || !items.length) return
    requestLock.current = true
    setRunning(true)
    try {
      let rows: ImportItem[]
      if (recovering) {
        rows = await session.current.resume(acceptRows)
      } else if (retryFailed) {
        const ids = items.filter(item => item.status === 'failed' && item.retryable && item.serverItemId).map(item => item.serverItemId!)
        rows = await session.current.retry(ids, acceptRows)
      } else {
        if (defaultType === 'costume') throw new Error(l('新资产库暂不支持服装导入', 'Costume import is not supported'))
        await session.current.prepare({ source: 'images', defaultAssetType: ({ actor: 1, scene: 2, prop: 3 } as const)[defaultType], items: items.map(item => ({ clientItemId: item.key, fileName: item.file.name, size: item.file.size })) })
        for (const item of items) {
          updateItem(item.key, { status: 'uploading', progress: 20, message: l('上传图片', 'Uploading image') })
          await session.current.upload(item.key, item.file)
          updateItem(item.key, { status: 'pending', progress: 55, message: l('等待校验', 'Awaiting validation') })
        }
        const result = await session.current.validate()
        acceptRows(result.rows)
        rows = result.preview.createCount + result.preview.updateCount > 0
          ? await session.current.commit(acceptRows) : result.rows
      }
      acceptRows(rows)
      setRecovering(false)
      setFinished(true)
      onImported()
      const succeeded = rows.filter(row => row.status === 'succeeded').length
      const skipped = rows.filter(row => row.status === 'skipped' || row.action === 'skip').length
      const failed = rows.filter(row => row.status === 'failed' || row.status === 'invalid').length
      const text = l(`导入处理完成：成功 ${succeeded}，跳过 ${skipped}，失败 ${failed}`, `Import processed: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`)
      if (failed || !succeeded) message.warning(text)
      else message.success(text)
    } catch (error) {
      setRecovering(session.current.submitted)
      if (!session.current.submitted) setItems(previous => previous.map(item => item.status === 'uploading' ? { ...item, status: 'pending', message: importError(error) } : item))
      message.error(importError(error))
    } finally {
      requestLock.current = false
      setRunning(false)
    }
  }

  return (
    <Modal
      className="asset-import-modal"
      title={<div><div className="asset-import-modal__title">{l('批量导入本地资产图片', 'Batch import local asset images')}</div><p className="asset-import-modal__description">{l('一次添加多张图片，检查名称和分类后开始导入。', 'Add multiple images, then check their names and types before importing.')}</p></div>}
      open={open}
      onCancel={reset}
      width={1040}
      centered
      closable={!running}
      maskClosable={!running}
      keyboard={!running}
      footer={
        <div className="asset-import-modal__footer">
          <span className="asset-import-modal__footer-note" role="status">
            {recovering ? l('结果待确认，请查询原批次。', 'Check the existing batch to confirm its result.') : finished ? l('本批次已处理，可重试失败项或关闭后添加新批次。', 'Batch processed. Retry failed items or close to start a new batch.') : running ? l('正在导入，请稍候…', 'Importing images, please wait…') : items.length
              ? l(`共 ${items.length} 张图片 · ${pendingCount} 张待导入`, `${items.length} images · ${pendingCount} pending`)
              : l('添加图片后，可在队列中核对和移除。', 'Add images to review or remove them from the queue.')}
          </span>
          <div className="asset-import-modal__actions">
            <Button onClick={reset} disabled={running}>{l('关闭', 'Close')}</Button>
            {retryableCount > 0 && !recovering && <Button onClick={() => void runImport(true)} disabled={running}>{l('重试失败项', 'Retry failed items')}</Button>}
            <Button type="primary" onClick={() => void runImport()} disabled={running || (!recovering && (finished || pendingCount === 0))} loading={running}>
              {recovering ? l('查询结果', 'Check results') : l('开始导入', 'Start import')}{pendingCount && !recovering && !finished ? l(`（${pendingCount}）`, ` (${pendingCount})`) : ''}
            </Button>
          </div>
        </div>
      }
    >
      <div className="asset-import-modal__content">
        <section className="asset-import-modal__image-inputs">
          <Upload.Dragger
            className="asset-import-modal__dropzone asset-import-modal__image-dropzone"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            showUploadList={false}
            beforeUpload={(file, fileList) => {
              if (file === fileList[0]) addFiles(fileList as File[])
              return Upload.LIST_IGNORE
            }}
            disabled={running || Boolean(session.current.batch)}
          >
            <div className="asset-import-modal__image-drop">
              <span className="asset-import-modal__upload-icon"><FileImageOutlined /></span>
              <div>
                <span className="asset-import-modal__drop-title">{l('点击选择或拖入多张图片', 'Choose or drop multiple images')}</span>
                <span className="asset-import-modal__drop-hint">{l('JPG、PNG、WebP、GIF，开始前可多次添加', 'JPG, PNG, WebP and GIF · Add files before starting')}</span>
              </div>
              <span className="asset-import-modal__choose">{l('选择图片', 'Choose images')}</span>
            </div>
          </Upload.Dragger>
          <aside className="asset-import-modal__naming">
            <h3>{l('按文件名自动分类', 'Classify by filename')}</h3>
            <dl>
              <div><dt>{l('演员', 'Actor')}</dt><dd><code>{l('actor_张三.png', 'actor_John.png')}</code></dd></div>
              <div><dt>{l('场景', 'Scene')}</dt><dd><code>{l('scene_办公室.jpg', 'scene_Office.jpg')}</code></dd></div>
              <div><dt>{l('道具', 'Prop')}</dt><dd><code>{l('prop_钥匙.webp', 'prop_Key.webp')}</code></dd></div>
            </dl>
            <p className="asset-import-modal__caption">{l(`无前缀时归入“${TYPE_LABEL[defaultType]}”。已有正面图片会自动跳过。`, `Without a prefix, use ${defaultType}. Existing front images are skipped.`)}</p>
          </aside>
        </section>

        <section className="asset-import-modal__queue">
          <div className="asset-import-modal__section-heading">
            <h3>{l('导入队列', 'Import queue')}<span className="asset-import-modal__count">{items.length}</span></h3>
            {items.length > 0 && <div className="asset-import-modal__queue-summary" aria-live="polite">
              <span>{l(`完成 ${doneCount}`, `${doneCount} complete`)}</span>
              <span>{l(`跳过 ${skippedCount}`, `${skippedCount} skipped`)}</span>
              <span className={failedCount > 0 ? 'has-errors' : ''}>{l(`失败 ${failedCount}`, `${failedCount} failed`)}</span>
            </div>}
          </div>
          {items.length === 0 ? (
            <div className="asset-import-modal__empty">
              <FileImageOutlined />
              <strong>{l('还没有待导入的图片', 'No images added yet')}</strong>
              <span className="asset-import-modal__caption">{l('添加图片后，在这里检查名称、类型和导入进度。', 'Add images to review names, types and import progress here.')}</span>
            </div>
          ) : <Table
          size="small"
          rowKey="key"
          dataSource={items}
          pagination={false}
          scroll={{ x: 960, y: 280 }}
          columns={[
            { title: l('文件', 'File'), dataIndex: ['file', 'name'], width: 200, ellipsis: true, render: (name: string, row: BatchAssetItem) => <div><span className="asset-import-modal__filename" title={name}>{name}</span><span className="asset-import-modal__file-size">{row.file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(row.file.size / 1024))} KB` : `${(row.file.size / 1024 / 1024).toFixed(1)} MB`}</span></div> },
            {
              title: l('类型', 'Type'),
              dataIndex: 'type',
              width: 90,
              render: (type: BatchAssetType) => <Tag>{l(TYPE_LABEL[type], { actor: 'Actor', scene: 'Scene', prop: 'Prop', costume: 'Costume' }[type])}</Tag>,
            },
            { title: l('资产名称', 'Asset name'), dataIndex: 'name', width: 150, ellipsis: true },
            {
              title: l('进度', 'Progress'),
              dataIndex: 'progress',
              width: 150,
              render: (progress: number, row: BatchAssetItem) => <Progress percent={progress} size="small" status={row.status === 'failed' ? 'exception' : row.status === 'done' ? 'success' : 'normal'} />,
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
            { title: l('说明', 'Description'), dataIndex: 'message', width: 200, ellipsis: true },
            { title: l('操作', 'Actions'), width: 70, fixed: 'right', render: (_, row: BatchAssetItem) => <Button type="link" disabled={running || Boolean(session.current.batch)} onClick={() => setItems((prev) => prev.filter((item) => item.key !== row.key))}>{l('移除', 'Remove')}</Button> },
          ]}
        />}
        </section>
      </div>
    </Modal>
  )
}
