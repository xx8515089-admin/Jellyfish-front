import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Input, Modal, Statistic, Table, Tag, Upload, message } from 'antd'
import { CheckOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons'
import { AssetImportsService, type ImportItem } from '../../../../services/assetImportGenerated'
import { AssetImportSession, importData, importError } from './assetImportSession'
import { useBilingualText } from '../../../../i18n/useBilingualText'

import './AssetImportModal.css'

type ImportStep = 'edit' | 'preview' | 'done'
type ImportSummary = {
  created_count: number; updated_count: number; skipped_count: number
  rows: Array<{ row_number: number; asset_type: string; asset_name: string; action: string; ok: boolean; message: string }>
  errors: Array<{ row_number: number; field: string; message: string }>
}

/** Adapt generated batch rows to the existing presentation, without legacy requests or identifiers. */
function displaySummary(rows: ImportItem[]): ImportSummary {
  return {
    created_count: rows.filter(row => ['create', 'created'].includes(row.action) && !['failed', 'invalid'].includes(row.status)).length,
    updated_count: rows.filter(row => ['update', 'updated'].includes(row.action) && !['failed', 'invalid'].includes(row.status)).length,
    skipped_count: rows.filter(row => ['failed', 'invalid', 'skipped'].includes(row.status) || row.action === 'skip').length,
    rows: rows.map((row, index) => ({ row_number: row.rowNumber ?? index + 1, asset_type: ({ 1: 'actor', 2: 'scene', 3: 'prop' } as Record<number, string>)[row.assetType ?? 0] ?? '', asset_name: row.name, action: row.action === 'skip' ? 'skipped' : row.action, ok: !['failed', 'invalid'].includes(row.status), message: row.errors.map(error => error.message).join('；') })),
    errors: rows.flatMap((row, index) => row.errors.map(error => ({ row_number: row.rowNumber ?? index + 1, field: error.field, message: error.message }))),
  }
}

const TYPE_LABEL: Record<string, string> = {
  actor: '演员',
  scene: '场景',
  prop: '道具',
  costume: '服装',
}

const ACTION_LABEL: Record<string, string> = {
  create: '创建',
  update: '更新',
  created: '已创建',
  updated: '已更新',
  skipped: '跳过',
}

// 编辑器展示最小可用清单；完整可选字段仍通过后端模板下载。
const EXAMPLE_CSV = `asset_type,asset_name,visual_prompt
actor,Calor Reeves,"Lawyer in a black suit"
scene,Quiet Law Office,"Law office on a rainy night"
prop,Sealed File,"Sealed file on a wooden desk"
`

/** 下载 UTF-8 CSV 模板，添加 BOM 以便表格软件识别中文。 */
function downloadText(filename: string, content: string) {
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** 先校验清单再提交，逐行呈现成功与失败，避免把部分失败显示为全部成功。 */
export function AssetBibleImportModal({
  open,
  onCancel,
  onImported,
}: {
  open: boolean
  onCancel: () => void
  onImported: () => void
}) {
  const l = useBilingualText()
  const [content, setContent] = useState(EXAMPLE_CSV)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [step, setStep] = useState<ImportStep>('edit')
  const [running, setRunning] = useState(false)
  const requestLock = useRef(false)
  const session = useRef(new AssetImportSession())
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    session.current.active = true
    return () => { session.current.active = false }
  }, [])
  const resultRef = useRef<HTMLDivElement>(null)

  // 预览和结果出现后滚动到反馈区域，底部确认按钮保持可见。
  useEffect(() => {
    if (summary) resultRef.current?.scrollIntoView({ block: 'nearest' })
  }, [summary])

  const hasWritableRows = useMemo(() => Boolean(summary?.rows?.some((row) => row.ok !== false && ['create', 'update'].includes(row.action))), [summary])

  /** 运行中禁止关闭，防止丢失当前提交结果。 */
  const reset = () => {
    if (requestLock.current) return
    if (recovering) { onCancel(); return }
    session.current.active = false
    session.current = new AssetImportSession()
    setRecovering(false)
    setStep('edit')
    setSummary(null)
    onCancel()
  }

  /** 文件读取也参与忙状态；失败不覆盖已粘贴内容，空文件不给出可提交预览。 */
  const readCsvFile = async (file: File) => {
    if (requestLock.current) return
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      message.warning(l('请上传 CSV、TSV 或 TXT 表格文件', 'Upload a CSV, TSV or TXT table file'))
      return
    }
    requestLock.current = true
    setRunning(true)
    try {
      const text = await file.text()
      if (!text.trim()) throw new Error(l('文件内容为空', 'The file is empty'))
      setContent(text.replace(/^\uFEFF/, ''))
      setSummary(null)
      setStep('edit')
    } catch (error) {
      message.error(error instanceof Error ? error.message : l('文件读取失败', 'Failed to read file'))
    } finally {
      requestLock.current = false
      setRunning(false)
    }
  }

  /** 模板仅调用既有 generated client，不发起生成任务。 */
  const downloadTemplate = async () => {
    try {
      const tpl = importData(await AssetImportsService.getImportTemplate({}))
      downloadText(tpl.filename, tpl.content)
    } catch (err) {
      message.error(importError(err))
    }
  }

  /** 预览期间锁定输入，确保确认导入对应刚刚校验的清单。 */
  const preview = async () => {
    if (requestLock.current || !content.trim()) return
    requestLock.current = true
    setRunning(true)
    try {
      setSummary(null)
      setStep('edit')
      await session.current.prepare({ source: 'manifest', content, format: 'auto' })
      const { rows } = await session.current.validate()
      const data = displaySummary(rows)
      setSummary(data)
      setStep('preview')
    } catch (err) {
      message.error(importError(err))
    } finally {
      requestLock.current = false
      setRunning(false)
    }
  }

  /** 提交有效行并按行结果统计，后端汇总数不能掩盖逐行失败。 */
  const commit = async () => {
    if (requestLock.current || (!recovering && (step !== 'preview' || !hasWritableRows))) return
    requestLock.current = true
    setRunning(true)
    try {
      const rows = recovering ? await session.current.resume() : await session.current.commit()
      const data = displaySummary(rows)
      setRecovering(false)
      setSummary(data)
      setStep('done')
      const succeeded = data.rows.filter((row) => row.ok !== false && ['created', 'updated'].includes(row.action)).length
      const failed = Math.max(data.skipped_count, data.rows.filter((row) => row.ok === false || row.action === 'skipped').length, new Set(data.errors.map((row) => row.row_number)).size)
      if (succeeded > 0) onImported()
      if (failed > 0 || succeeded === 0) {
        message.warning(l(`导入处理完成：成功 ${succeeded} 行，跳过/失败 ${failed} 行`, `Import processed: ${succeeded} succeeded, ${failed} skipped/failed`))
      } else {
        message.success(l(`已导入 ${succeeded} 行资产`, `Imported ${succeeded} asset rows`))
      }
    } catch (err) {
      setRecovering(session.current.submitted)
      if (!session.current.submitted) { setStep('edit'); setSummary(null) }
      message.error(importError(err))
    } finally {
      requestLock.current = false
      setRunning(false)
    }
  }

  const stepIndex = step === 'done' ? 2 : step === 'preview' ? 1 : 0
  const footer = (
    <div className="asset-import-modal__footer">
      <span className="asset-import-modal__footer-note" role="status">
        {recovering ? l('请求结果待确认，请查询原批次，避免重复导入。', 'Check the existing batch before starting another import.') : running ? l('正在处理，请稍候…', 'Processing, please wait…') : step === 'done'
          ? l('导入结果已更新，可返回资产列表查看。', 'Import results are ready. Return to the asset list to view them.')
          : step === 'preview'
            ? l('核对预览结果后，确认导入有效资产。', 'Review the preview before importing valid assets.')
            : l('先预览校验，确认后才会写入资产。', 'Preview and validate before confirming the import.')}
      </span>
      <div className="asset-import-modal__actions">
        {recovering ? (
          <Button type="primary" onClick={() => void commit()} loading={running}>{l('查询结果', 'Check results')}</Button>
        ) : step === 'done' ? (
          <Button type="primary" onClick={reset}>{l('去资产列表查看', 'View asset list')}</Button>
        ) : (
          <>
            <Button onClick={reset} disabled={running}>{l('取消', 'Cancel')}</Button>
            <Button type={step === 'edit' ? 'primary' : 'default'} onClick={() => void preview()} disabled={running || !content.trim()} loading={running && step === 'edit'}>
              {l('预览导入', 'Preview import')}
            </Button>
            <Button type={step === 'preview' ? 'primary' : 'default'} onClick={() => void commit()} disabled={running || step !== 'preview' || !hasWritableRows} loading={running && step === 'preview'}>
              {l('确认导入', 'Confirm import')}
            </Button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <Modal
      className="asset-import-modal"
      title={<div><div className="asset-import-modal__title">{l('批量导入资产清单', 'Batch import asset list')}</div><p className="asset-import-modal__description">{l('上传表格或粘贴文本，预览检查后批量创建资产。', 'Upload a table or paste text, then review it before importing.')}</p></div>}
      open={open}
      onCancel={reset}
      width={1040}
      centered
      closable={!running}
      maskClosable={!running}
      keyboard={!running}
      footer={footer}
    >
      <div className="asset-import-modal__content">
        <ol className="asset-import-modal__steps" aria-label={l('导入步骤', 'Import steps')}>
          {[l('准备清单', 'Prepare'), l('预览校验', 'Review'), l('导入完成', 'Complete')].map((label, index) => (
            <li key={index} className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-complete' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
              <span className="asset-import-modal__step-number">{index < stepIndex ? <CheckOutlined /> : index + 1}</span>{label}
            </li>
          ))}
        </ol>

        <div className="asset-import-modal__input-grid">
          <section className="asset-import-modal__section asset-import-modal__source-card">
            <div className="asset-import-modal__section-heading">
              <h3>{l('从文件导入', 'Import a file')}</h3>
              <span className="asset-import-modal__caption">CSV / TSV / TXT</span>
            </div>
            <Upload.Dragger
              className="asset-import-modal__dropzone"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => { void readCsvFile(file as File); return Upload.LIST_IGNORE }}
              disabled={running || recovering}
            >
              <div className="asset-import-modal__drop-content">
                <span className="asset-import-modal__upload-icon"><FileTextOutlined /></span>
                <span className="asset-import-modal__drop-title">{l('点击选择或拖入清单文件', 'Choose or drop a table file')}</span>
                <span className="asset-import-modal__drop-hint">{l('文件内容将填入编辑区', 'Load file content into the editor')}</span>
              </div>
            </Upload.Dragger>
            <Button className="asset-import-modal__template" block icon={<DownloadOutlined />} onClick={() => void downloadTemplate()}>{l('下载完整 CSV 模板', 'Download full CSV template')}</Button>
            <p className="asset-import-modal__field-heading">{l('三项必填字段', 'Three required columns')}</p>
            <dl className="asset-import-modal__fields" aria-label={l('必填字段', 'Required columns')}>
              <div><dt><code>asset_type</code></dt><dd>{l('资产类型', 'Asset type')}</dd></div>
              <div><dt><code>asset_name</code></dt><dd>{l('资产名称', 'Asset name')}</dd></div>
              <div><dt><code>visual_prompt</code></dt><dd>{l('画面描述', 'Visual description')}</dd></div>
            </dl>
          </section>

          <section className="asset-import-modal__section">
            <div className="asset-import-modal__section-heading">
              <label className="asset-import-modal__editor-label" htmlFor="asset-bible-import-content">{l('或粘贴表格文本', 'Or paste table text')}</label>
              <span className="asset-import-modal__caption">{l('每行一项资产', 'One asset per row')}</span>
            </div>
            <Input.TextArea
              id="asset-bible-import-content"
              className="asset-import-modal__editor"
              value={content}
              onChange={(event) => { setContent(event.target.value); setStep('edit'); setSummary(null) }}
              rows={10}
              wrap="soft"
              spellCheck={false}
              disabled={running || recovering}
              placeholder={l('粘贴 CSV 或制表符分隔表格', 'Paste CSV or tab-separated table data')}
            />
            <div className="asset-import-modal__editor-note">
              <span className="asset-import-modal__caption">{l('当前为示例清单，请替换内容并保留首行字段名。', 'Replace the sample rows and keep the header.')}</span>
              <span className="asset-import-modal__caption">{l('支持从表格软件直接复制', 'Paste directly from a spreadsheet')}</span>
            </div>
          </section>
        </div>

        {summary ? (
          <div className="asset-import-modal__results" ref={resultRef}>
            <div className="asset-import-modal__section-heading"><h3>{step === 'done' ? l('导入结果', 'Import results') : l('预览结果', 'Preview results')}</h3></div>
            <div className="asset-import-modal__statistics">
              <Statistic title={step === 'done' ? l('已创建', 'Created') : l('将创建', 'To create')} value={step === 'done' ? summary.rows.filter((row) => row.ok !== false && row.action === 'created').length : summary.created_count} />
              <Statistic title={step === 'done' ? l('已更新', 'Updated') : l('将更新', 'To update')} value={step === 'done' ? summary.rows.filter((row) => row.ok !== false && row.action === 'updated').length : summary.updated_count} />
              <Statistic title={l('跳过/错误', 'Skipped/errors')} value={summary.skipped_count} />
            </div>

            {summary.errors.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                message={l('存在行级错误', 'Row-level errors exist')}
                description={l('错误行不会阻塞其他有效资产导入。', 'Invalid rows do not block other valid assets from importing.')}
              />
            ) : null}

            <Table
              size="small"
              rowKey={(row) => `row-${row.row_number}-${row.asset_type}-${row.asset_name}`}
              dataSource={summary.rows}
              pagination={{ pageSize: 8, size: 'small' }}
              scroll={{ x: 700 }}
              columns={[
                { title: l('行号', 'Row'), dataIndex: 'row_number', width: 80 },
                {
                  title: l('类型', 'Type'),
                  dataIndex: 'asset_type',
                  width: 90,
                  render: (value: string) => <Tag>{TYPE_LABEL[value] ? l(TYPE_LABEL[value], { actor: 'Actor', scene: 'Scene', prop: 'Prop', costume: 'Costume' }[value] ?? value) : value}</Tag>,
                },
                { title: l('资产名称', 'Asset name'), dataIndex: 'asset_name', ellipsis: true },
                {
                  title: l('动作', 'Action'),
                  dataIndex: 'action',
                  width: 100,
                  render: (value: string) => <Tag color={value === 'skipped' ? 'orange' : value.includes('update') ? 'blue' : 'green'}>{ACTION_LABEL[value] ? l(ACTION_LABEL[value], { create: 'Create', update: 'Update', created: 'Created', updated: 'Updated', skipped: 'Skipped' }[value] ?? value) : value}</Tag>,
                },
                { title: l('说明', 'Description'), dataIndex: 'message', ellipsis: true },
              ]}
            />

            {summary.errors.length > 0 ? (
              <Table
                size="small"
                rowKey={(row, index) => `error-${row.row_number}-${row.field}-${index}`}
                dataSource={summary.errors}
                pagination={false}
                scroll={{ x: 640, y: 240 }}
                columns={[
                  { title: l('行号', 'Row'), dataIndex: 'row_number', width: 80 },
                  { title: l('字段', 'Field'), dataIndex: 'field', width: 140 },
                  { title: l('错误', 'Error'), dataIndex: 'message' },
                ]}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
