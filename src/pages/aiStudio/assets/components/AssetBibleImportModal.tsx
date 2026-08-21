import { useMemo, useState } from 'react'
import { Alert, Button, Input, Modal, Space, Statistic, Table, Tag, Upload, message } from 'antd'
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { AssetBibleImportApi, type AssetBibleImportSummary } from '../../../../services/assetBibleImport'
import { useBilingualText } from '../../../../i18n/useBilingualText'

type ImportStep = 'edit' | 'preview' | 'done'

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

const EXAMPLE_CSV = `asset_type,asset_name,visual_prompt,description,negative_prompt,style_notes,reference_notes,tags,status,priority,episode_scope,scene_scope,costume_state,primary_image_path
actor,Calor Reeves,"portrait of Calor Reeves in a quiet law office","Lead lawyer","no blur","noir lighting","law office reference","lawyer|night",draft,1,,,,
scene,Quiet Law Office,"wide law office at night with rain on window","Night office","no daylight","rainy noir","glass door","office|rain",draft,2,,,,
prop,Sealed File,"close-up of sealed legal file marked Sarah","Important file","no hands","desk object","Sarah label","file",draft,3,,,,
costume,Black Suit,"tailored black lawyer suit","Formal suit","no casual","clean tailoring","night office","suit",draft,4,,,,
`

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

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
  const [summary, setSummary] = useState<AssetBibleImportSummary | null>(null)
  const [step, setStep] = useState<ImportStep>('edit')
  const [running, setRunning] = useState(false)

  const hasWritableRows = useMemo(() => Boolean(summary?.rows?.length), [summary])

  const reset = () => {
    if (running) return
    setStep('edit')
    setSummary(null)
    onCancel()
  }

  const readCsvFile = async (file: File) => {
    if (!/\.csv$/i.test(file.name) && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
      message.warning(l('请上传 CSV 或文本表格文件', 'Upload a CSV or text table file'))
      return
    }
    setContent(await file.text())
    setSummary(null)
    setStep('edit')
  }

  const downloadTemplate = async () => {
    try {
      const tpl = await AssetBibleImportApi.template()
      downloadText(tpl.filename, tpl.content)
    } catch (err) {
      message.error(err instanceof Error ? err.message : l('模板下载失败', 'Failed to download template'))
    }
  }

  const preview = async () => {
    setRunning(true)
    try {
      const data = await AssetBibleImportApi.preview(content)
      setSummary(data)
      setStep('preview')
    } catch (err) {
      message.error(err instanceof Error ? err.message : l('预览失败', 'Preview failed'))
    } finally {
      setRunning(false)
    }
  }

  const commit = async () => {
    setRunning(true)
    try {
      const data = await AssetBibleImportApi.commit(content)
      setSummary(data)
      setStep('done')
      onImported()
      message.success(l('资产清单导入完成', 'Asset list import complete'))
    } catch (err) {
      message.error(err instanceof Error ? err.message : l('导入失败', 'Import failed'))
    } finally {
      setRunning(false)
    }
  }

  const footer =
    step === 'done' ? (
      <Space>
        <Button onClick={reset}>{l('稍后再说', 'Later')}</Button>
        <Button onClick={reset}>{l('去资产列表查看', 'View asset list')}</Button>
        <Button disabled>{l('批量生成资产图（Phase 2）', 'Batch generate asset images (Phase 2)')}</Button>
      </Space>
    ) : (
      <Space>
        <Button onClick={reset} disabled={running}>
          {l('取消', 'Cancel')}
        </Button>
        <Button onClick={() => void preview()} disabled={running || !content.trim()} loading={running && step === 'edit'}>
          {l('预览导入', 'Preview import')}
        </Button>
        <Button type="primary" onClick={() => void commit()} disabled={running || step !== 'preview' || !hasWritableRows} loading={running && step === 'preview'}>
          {l('确认导入', 'Confirm import')}
        </Button>
      </Space>
    )

  return (
    <Modal title={l('批量导入资产清单', 'Batch import asset list')} open={open} onCancel={reset} width={1080} footer={footer}>
      <div className="space-y-4">
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => void downloadTemplate()}>
            {l('下载 CSV 模板', 'Download CSV template')}
          </Button>
        </Space>

        <Upload.Dragger
          accept=".csv,text/csv,text/plain"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => {
            void readCsvFile(file as File)
            return Upload.LIST_IGNORE
          }}
          disabled={running}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{l('上传 CSV，或直接在下方粘贴表格文本', 'Upload a CSV or paste table text below')}</p>
          <p className="ant-upload-hint">{l('必填列：asset_type、asset_name、visual_prompt；Seedance runner 可用 prompt 代替 visual_prompt。不会调用任何生成模型。', 'Required columns: asset_type, asset_name, and visual_prompt. Seedance runners may use prompt instead of visual_prompt. No generation model is invoked.')}</p>
        </Upload.Dragger>

        <Input.TextArea
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            setStep('edit')
            setSummary(null)
          }}
          rows={9}
          disabled={running}
          placeholder={l('粘贴 CSV 或制表符分隔表格', 'Paste CSV or tab-separated table data')}
        />

        {summary ? (
          <div className="space-y-3">
            <Space size="large">
              <Statistic title={l('将创建', 'To create')} value={summary.created_count} />
              <Statistic title={l('将更新', 'To update')} value={summary.updated_count} />
              <Statistic title={l('跳过/错误', 'Skipped/errors')} value={summary.skipped_count} />
            </Space>

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
              pagination={{ pageSize: 8 }}
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
                  render: (value: string) => <Tag color={value.includes('update') ? 'blue' : 'green'}>{ACTION_LABEL[value] ? l(ACTION_LABEL[value], { create: 'Create', update: 'Update', created: 'Created', updated: 'Updated', skipped: 'Skipped' }[value] ?? value) : value}</Tag>,
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
