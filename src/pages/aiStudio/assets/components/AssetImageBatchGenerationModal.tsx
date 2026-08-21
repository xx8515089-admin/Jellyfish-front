import { useEffect, useMemo, useState, type Key } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Input,
  Modal,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AssetGenerationBatchApi,
  type AssetGenerationBatchResponse,
  type AssetGenerationFilters,
  type AssetGenerationSpec,
  type AssetGenerationSpecKey,
} from '../../../../services/assetGenerationBatch'
import { bilingualText, useBilingualText } from '../../../../i18n/useBilingualText'

const ASSET_TYPE_OPTIONS = [
  { label: '全部', labelEn: 'All', value: '' },
  { label: '演员', labelEn: 'Actors', value: 'actor' },
  { label: '场景', labelEn: 'Scenes', value: 'scene' },
  { label: '道具', labelEn: 'Props', value: 'prop' },
  { label: '服装', labelEn: 'Costumes', value: 'costume' },
]

const PRIORITY_OPTIONS = [
  { label: '全部', labelEn: 'All', value: '' },
  { label: 'high', value: 'high' },
  { label: 'medium', value: 'medium' },
  { label: 'low', value: 'low' },
]

const SOURCE_SHEET_OPTIONS = [
  { label: '全部 sheet', labelEn: 'All sheets', value: '' },
  { label: 'Sheet1', value: 'Sheet1' },
  { label: 'Sheet2', value: 'Sheet2' },
]

function rowKey(row: AssetGenerationSpec): string {
  return `${row.asset_type}:${row.asset_id}:${row.asset_variant}`
}

function toSpecKey(row: AssetGenerationSpec): AssetGenerationSpecKey {
  return {
    asset_type: row.asset_type,
    asset_id: row.asset_id,
    asset_variant: row.asset_variant,
  }
}

function assetTypeLabel(value: string): string {
  const option = ASSET_TYPE_OPTIONS.find((item) => item.value === value)
  return option ? bilingualText(option.label, option.labelEn) : value
}

type Props = {
  open: boolean
  onCancel: () => void
  onCreated?: () => void
}

export function AssetImageBatchGenerationModal({ open, onCancel, onCreated }: Props) {
  const l = useBilingualText()
  const [assetType, setAssetType] = useState('scene')
  const [priority, setPriority] = useState('')
  const [variant, setVariant] = useState('')
  const [sourceSheet, setSourceSheet] = useState('Sheet2')
  const [keyword, setKeyword] = useState('')
  const [missingOnly, setMissingOnly] = useState(true)
  const [skipExisting, setSkipExisting] = useState(true)
  const [includeLegacy, setIncludeLegacy] = useState(false)
  const [rows, setRows] = useState<AssetGenerationSpec[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([])
  const [preview, setPreview] = useState<AssetGenerationBatchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)

  const selectedSpecs = useMemo(() => {
    const selected = new Set(selectedKeys.map(String))
    return rows.filter((row) => selected.has(rowKey(row))).map(toSpecKey)
  }, [rows, selectedKeys])

  const variantOptions = useMemo(() => {
    const variants = Array.from(new Set(rows.map((row) => row.asset_variant).filter(Boolean))).sort()
    return [{ label: '全部', labelEn: 'All', value: '' }, ...variants.map((item) => ({ label: item, value: item }))]
  }, [l, rows])

  const buildFilters = (withSelection: boolean): AssetGenerationFilters => ({
    asset_type: assetType || undefined,
    priority: priority || undefined,
    asset_variant: variant || undefined,
    missing_only: missingOnly,
    status: 'ready',
    keyword: keyword || undefined,
    runner_model: 'bytedance/seedance-2',
    runner_source_sheet: sourceSheet || undefined,
    skip_existing: skipExisting,
    include_legacy: includeLegacy,
    selected_specs: withSelection && selectedSpecs.length > 0 ? selectedSpecs : undefined,
  })

  const loadSpecs = async () => {
    setLoading(true)
    try {
      const data = await AssetGenerationBatchApi.specs(buildFilters(false))
      setRows(data.rows)
      setPreview(null)
      setSelectedKeys([])
    } catch (error) {
      message.error(error instanceof Error ? error.message : l('读取资产生成规格失败', 'Failed to load asset generation specifications'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      void loadSpecs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handlePreview = async () => {
    setLoading(true)
    try {
      const data = await AssetGenerationBatchApi.preview(buildFilters(true))
      setPreview(data)
      setRows(data.rows)
      message.success(l(`预计创建 ${data.estimated_task_count} 个图片生成任务`, `Estimated ${data.estimated_task_count} image generation tasks`))
    } catch (error) {
      message.error(error instanceof Error ? error.message : l('预览批量生成任务失败', 'Failed to preview batch generation tasks'))
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    const summary = preview ?? (await AssetGenerationBatchApi.preview(buildFilters(true)))
    if (summary.estimated_task_count <= 0) {
      message.warning(l('没有可创建的图片生成任务', 'There are no image generation tasks to create'))
      setPreview(summary)
      setRows(summary.rows)
      return
    }
    Modal.confirm({
      title: l('确认创建图片生成任务', 'Confirm image generation tasks'),
      content: l(`即将创建 ${summary.estimated_task_count} 个图片生成任务。该操作会交给后端 AI 调度并可能产生费用。是否确认？`, `${summary.estimated_task_count} image generation tasks will be created. Backend AI dispatch may incur charges. Continue?`),
      okText: l('确认创建任务', 'Create tasks'),
      cancelText: l('取消', 'Cancel'),
      onOk: async () => {
        setCommitting(true)
        try {
          const data = await AssetGenerationBatchApi.commit(buildFilters(true))
          setPreview(data)
          setRows(data.rows)
          message.success(l(`已创建 ${data.created_task_count ?? 0} 个图片生成任务`, `Created ${data.created_task_count ?? 0} image generation tasks`))
          onCreated?.()
        } catch (error) {
          message.error(error instanceof Error ? error.message : l('创建批量生成任务失败', 'Failed to create batch generation tasks'))
        } finally {
          setCommitting(false)
        }
      },
    })
  }

  const columns: ColumnsType<AssetGenerationSpec> = [
    {
      title: l('资产', 'Asset'),
      dataIndex: 'asset_name',
      width: 220,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.asset_name}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {assetTypeLabel(row.asset_type)} · {row.asset_id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'variant',
      dataIndex: 'asset_variant',
      width: 220,
      render: (value, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{value}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.output_spec}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: l('图片状态', 'Image status'),
      width: 120,
      render: (_, row) => (row.has_image ? <Tag color="green">{l('已有图片', 'Image available')}</Tag> : <Tag color="orange">{l('缺图', 'Missing image')}</Tag>),
    },
    {
      title: l('尺寸', 'Size'),
      width: 120,
      render: (_, row) => (
        <Typography.Text>
          {row.aspect_ratio}
          <br />
          {row.width || '-'}x{row.height || '-'}
        </Typography.Text>
      ),
    },
    {
      title: l('优先级', 'Priority'),
      dataIndex: 'priority',
      width: 90,
      render: (value) => <Tag color={value === 'high' ? 'red' : value === 'low' ? 'default' : 'blue'}>{value}</Tag>,
    },
    {
      title: 'reference',
      width: 150,
      render: (_, row) =>
        row.asset_type === 'actor' && row.image_slot_angle !== 'FRONT' ? (
          <Tag color="purple">{l('参考 Actor FRONT', 'Uses Actor FRONT reference')}</Tag>
        ) : row.asset_type === 'scene' && row.runner_source_sheet === 'Sheet2' && row.image_slot_angle !== 'FRONT' ? (
          <Tag color="purple">{l('参考 Scene FRONT', 'Uses Scene FRONT reference')}</Tag>
        ) : (
          <Tag>prompt-only</Tag>
        ),
    },
    {
      title: 'prompt',
      width: 120,
      render: (_, row) => (
        <Popover
          title="Prompt Preview"
          content={
            <div style={{ maxWidth: 520 }}>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{row.visual_prompt}</Typography.Paragraph>
              {row.negative_prompt ? (
                <Typography.Paragraph type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                  Negative: {row.negative_prompt}
                </Typography.Paragraph>
              ) : null}
            </div>
          }
        >
          <Button size="small">{l('预览', 'Preview')}</Button>
        </Popover>
      ),
    },
    {
      title: 'validation',
      width: 180,
      render: (_, row) =>
        row.validation_errors.length > 0 ? (
          <Typography.Text type="danger">{row.validation_errors.join('；')}</Typography.Text>
        ) : row.action === 'skip_existing' ? (
          <Tag>{l('跳过已有', 'Skip existing')}</Tag>
        ) : row.task_id ? (
          <Tag color="green">{l('已创建', 'Created')}</Tag>
        ) : (
          <Tag color="green">{l('可生成', 'Ready to generate')}</Tag>
        ),
    },
  ]

  return (
    <Drawer
      title={l('批量生成资产图', 'Batch generate asset images')}
      width="92vw"
      open={open}
      onClose={onCancel}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onCancel}>{l('取消', 'Cancel')}</Button>
          <Button onClick={handlePreview} loading={loading}>
            {l('预览任务', 'Preview tasks')}
          </Button>
          <Button type="primary" onClick={handleCommit} loading={committing}>
            {l('确认创建任务', 'Create tasks')}
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message={l('这里只读取 asset_factory_metadata 中已导入的 Seedance runner specs。Sheet2 场景多机位会使用同一 Scene 的 FRONT 图作为 reference。确认创建任务后，后续 worker 会交给后端 AI 调度并可能产生费用。', 'Only imported Seedance runner specs in asset_factory_metadata are read. Multi-angle Sheet2 scenes use the same Scene FRONT image as a reference. Backend AI dispatch may incur charges after task creation.')}
        />
        <Space wrap>
          <Select value={assetType} options={ASSET_TYPE_OPTIONS.map((item) => ({ ...item, label: l(item.label, item.labelEn) }))} style={{ width: 120 }} onChange={setAssetType} />
          <Select value={priority} options={PRIORITY_OPTIONS.map((item) => ({ ...item, label: item.value ? item.label : l(item.label, 'All') }))} style={{ width: 120 }} onChange={setPriority} />
          <Select value={sourceSheet} options={SOURCE_SHEET_OPTIONS.map((item) => ({ ...item, label: item.value ? item.label : l(item.label, item.labelEn ?? 'All sheets') }))} style={{ width: 140 }} onChange={setSourceSheet} />
          <Select value={variant} options={variantOptions} style={{ width: 280 }} onChange={setVariant} />
          <Input.Search
            value={keyword}
            placeholder={l('搜索 asset_name', 'Search asset_name')}
            style={{ width: 260 }}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={loadSpecs}
          />
          <Checkbox checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)}>
            {l('只生成缺图资产', 'Only assets missing images')}
          </Checkbox>
          <Checkbox checked={skipExisting} onChange={(event) => setSkipExisting(event.target.checked)}>
            {l('跳过已有图片', 'Skip existing images')}
          </Checkbox>
          <Checkbox checked={includeLegacy} onChange={(event) => setIncludeLegacy(event.target.checked)}>
            {l('包含 legacy/default', 'Include legacy/default')}
          </Checkbox>
          <Button onClick={loadSpecs} loading={loading}>
            {l('应用筛选', 'Apply filters')}
          </Button>
        </Space>
        {preview ? (
          <Alert
            type="info"
            showIcon
            message={l(`已选 ${selectedSpecs.length || preview.total_specs} 条；预计创建 ${preview.estimated_task_count} 个任务，创建槽位 ${preview.will_create_slots} 个，跳过已有 ${preview.will_skip_existing} 个。`, `${selectedSpecs.length || preview.total_specs} selected; ${preview.estimated_task_count} tasks estimated, ${preview.will_create_slots} slots to create, ${preview.will_skip_existing} existing images skipped.`)}
          />
        ) : null}
        <Table
          size="small"
          rowKey={rowKey}
          loading={loading}
          columns={columns}
          dataSource={rows}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
            getCheckboxProps: (row) => ({ disabled: !row.can_generate }),
          }}
          pagination={{ pageSize: 25, showSizeChanger: true }}
          scroll={{ x: 1350 }}
        />
      </Space>
    </Drawer>
  )
}
