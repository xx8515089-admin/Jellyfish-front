import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Drawer, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AssetProjectLinkerApi,
  type AssetLinkerBatch,
  type ProjectAssetLinkerResponse,
  type ProjectAssetLinkerRow,
  type ProjectOption,
} from '../../../../services/assetProjectLinker'
import { bilingualText, useBilingualText } from '../../../../i18n/useBilingualText'

const ASSET_TYPE_OPTIONS = [
  { label: '全部资产', labelEn: 'All assets', value: '' },
  { label: '演员', labelEn: 'Actors', value: 'actor' },
  { label: '场景', labelEn: 'Scenes', value: 'scene' },
  { label: '道具', labelEn: 'Props', value: 'prop' },
  { label: '服装', labelEn: 'Costumes', value: 'costume' },
]

const STATUS_COLOR: Record<string, string> = {
  will_link: 'blue',
  linked: 'green',
  already_linked: 'green',
  missing: 'red',
  duplicate: 'orange',
  conflict: 'red',
}

function statusLabel(value: string): string {
  return (
    {
      will_link: bilingualText('将链接', 'Will link'),
      linked: bilingualText('已链接', 'Linked'),
      already_linked: bilingualText('已存在', 'Already linked'),
      missing: bilingualText('缺失', 'Missing'),
      duplicate: bilingualText('重复', 'Duplicate'),
      conflict: bilingualText('冲突', 'Conflict'),
    }[value] || value
  )
}

function batchLabel(batch: AssetLinkerBatch): string {
  const counts = Object.entries(batch.asset_type_counts || {})
    .map(([key, value]) => `${key}:${value}`)
    .join(' / ')
  return `${batch.runner_source_sheet} - ${batch.runner_model} (${batch.total_specs}${counts ? `, ${counts}` : ''})`
}

type Props = {
  open: boolean
  onCancel: () => void
}

export function AssetProjectLinkerModal({ open, onCancel }: Props) {
  const l = useBilingualText()
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [batches, setBatches] = useState<AssetLinkerBatch[]>([])
  const [projectId, setProjectId] = useState('')
  const [batchKey, setBatchKey] = useState('')
  const [assetType, setAssetType] = useState('')
  const [preview, setPreview] = useState<ProjectAssetLinkerResponse | null>(null)
  const [lastCreatedLinks, setLastCreatedLinks] = useState<Array<{ asset_type: string; link_id: number; asset_id: string }>>([])
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)

  const selectedBatch = useMemo(() => {
    return batches.find((item) => `${item.runner_model}||${item.runner_source_sheet}` === batchKey) || null
  }, [batches, batchKey])

  const canPreview = Boolean(projectId && selectedBatch)

  const loadInitial = async () => {
    setLoading(true)
    try {
      const [projectRows, batchRows] = await Promise.all([AssetProjectLinkerApi.projects(), AssetProjectLinkerApi.batches()])
      setProjects(projectRows)
      setBatches(batchRows)
      setProjectId((prev) => prev || projectRows[0]?.id || '')
      const seedance = batchRows.find((item) => item.runner_model === 'bytedance/seedance-2') || batchRows[0]
      setBatchKey((prev) => prev || (seedance ? `${seedance.runner_model}||${seedance.runner_source_sheet}` : ''))
    } catch (error) {
      message.error(error instanceof Error ? error.message : l('读取项目资产链接数据失败', 'Failed to load project asset link data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void loadInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const buildInput = () => ({
    project_id: projectId,
    runner_model: selectedBatch?.runner_model,
    runner_source_sheet: selectedBatch?.runner_source_sheet,
    asset_type: assetType || undefined,
    include_existing: false,
  })

  const handlePreview = async () => {
    if (!canPreview) {
      message.warning(l('请选择目标项目和资产批次', 'Select a target project and asset batch'))
      return
    }
    setLoading(true)
    try {
      const data = await AssetProjectLinkerApi.preview(buildInput())
      setPreview(data)
      setLastCreatedLinks([])
      message.success(l(`预览完成：${data.counts?.will_link ?? 0} 个可链接`, `Preview complete: ${data.counts?.will_link ?? 0} assets can be linked`))
    } catch (error) {
      message.error(error instanceof Error ? error.message : l('预览项目资产链接失败', 'Failed to preview project asset links'))
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    if (!canPreview) {
      message.warning(l('请选择目标项目和资产批次', 'Select a target project and asset batch'))
      return
    }
    const expected = preview?.counts?.will_link ?? 0
    Modal.confirm({
      title: 'Link All',
      content: l(`即将把 ${expected} 个匹配资产链接到目标项目。该操作只写项目资产关联，不复制文件，也不会覆盖 FRONT reference 或场景 panorama。是否继续？`, `${expected} matching assets will be linked to the target project. This creates links only; it does not copy files or overwrite FRONT references or scene panoramas. Continue?`),
      okText: 'Link All',
      cancelText: l('取消', 'Cancel'),
      onOk: async () => {
        setCommitting(true)
        try {
          const data = await AssetProjectLinkerApi.commit(buildInput())
          setPreview(data)
          setLastCreatedLinks(data.created_links || [])
          message.success(l(`已链接 ${data.created_count ?? 0} 个资产`, `Linked ${data.created_count ?? 0} assets`))
        } catch (error) {
          message.error(error instanceof Error ? error.message : l('链接项目资产失败', 'Failed to link project assets'))
        } finally {
          setCommitting(false)
        }
      },
    })
  }

  const handleRollback = async () => {
    if (!projectId || lastCreatedLinks.length === 0) {
      message.warning(l('没有可回滚的本次链接', 'There are no links from this operation to roll back'))
      return
    }
    Modal.confirm({
      title: 'Rollback',
      content: l(`将删除本次创建的 ${lastCreatedLinks.length} 条项目资产链接，不删除资产和文件。是否回滚？`, `Delete ${lastCreatedLinks.length} project asset links created in this operation without deleting assets or files?`),
      okText: 'Rollback',
      cancelText: l('取消', 'Cancel'),
      onOk: async () => {
        setCommitting(true)
        try {
          const data = await AssetProjectLinkerApi.rollback({ project_id: projectId, links: lastCreatedLinks })
          setLastCreatedLinks([])
          await handlePreview()
          message.success(l(`已回滚 ${data.removed_count} 条链接`, `Rolled back ${data.removed_count} links`))
        } catch (error) {
          message.error(error instanceof Error ? error.message : l('回滚失败', 'Rollback failed'))
        } finally {
          setCommitting(false)
        }
      },
    })
  }

  const columns: ColumnsType<ProjectAssetLinkerRow> = [
    {
      title: l('资产', 'Asset'),
      width: 220,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{row.matched_asset_name || row.asset_name}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.asset_type} · {row.matched_asset_id || row.asset_id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'variant / spec',
      width: 240,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.asset_variant || '-'}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.output_spec || row.runner_output_filename || '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'usage slot',
      dataIndex: 'usage_slot',
      width: 210,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: 'identity rule',
      dataIndex: 'identity_policy',
      width: 220,
      render: (value: string) => <Typography.Text type="secondary">{value}</Typography.Text>,
    },
    {
      title: 'match',
      dataIndex: 'match_strategy',
      width: 120,
      render: (value: string) => <Tag>{value || '-'}</Tag>,
    },
    {
      title: 'status',
      width: 130,
      render: (_, row) => <Tag color={STATUS_COLOR[row.status] || 'default'}>{statusLabel(row.status)}</Tag>,
    },
    {
      title: l('说明', 'Description'),
      dataIndex: 'message',
      ellipsis: true,
    },
  ]

  return (
    <Drawer
      title="Link Assets to Project"
      width="92vw"
      open={open}
      onClose={onCancel}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onCancel}>{l('取消', 'Cancel')}</Button>
          <Button onClick={handlePreview} loading={loading} disabled={!canPreview}>
            {l('预览链接', 'Preview links')}
          </Button>
          <Button type="primary" onClick={handleCommit} loading={committing} disabled={!canPreview}>
            Link All
          </Button>
          <Button danger onClick={handleRollback} loading={committing} disabled={lastCreatedLinks.length === 0}>
            Rollback
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message={l('只创建项目到全局资产的链接，不复制文件，不改原始 URL/thumbnail，不覆盖 Actor FRONT reference 或 Scene FRONT panorama。', 'Creates links from the project to global assets only. Files and original URLs/thumbnails are unchanged, and Actor FRONT references or Scene FRONT panoramas are not overwritten.')}
        />
        <Space wrap>
          <Select
            value={projectId}
            style={{ width: 280 }}
            placeholder={l('选择项目', 'Select project')}
            options={projects.map((item) => ({ label: item.name, value: item.id }))}
            onChange={setProjectId}
            loading={loading}
          />
          <Select
            value={batchKey}
            style={{ width: 420 }}
            placeholder={l('选择资产批次', 'Select asset batch')}
            options={batches.map((item) => ({
              label: batchLabel(item),
              value: `${item.runner_model}||${item.runner_source_sheet}`,
            }))}
            onChange={setBatchKey}
            loading={loading}
          />
          <Select value={assetType} style={{ width: 140 }} options={ASSET_TYPE_OPTIONS.map((item) => ({ ...item, label: l(item.label, item.labelEn) }))} onChange={setAssetType} />
        </Space>
        {preview ? (
          <Alert
            type="success"
            showIcon
            message={l(`预览：${preview.total_specs} 条 specs；将链接 ${preview.counts?.will_link ?? 0}，已存在 ${preview.counts?.already_linked ?? 0}，缺失 ${preview.counts?.missing ?? 0}，重复 ${preview.counts?.duplicate ?? 0}，冲突 ${preview.counts?.conflict ?? 0}。`, `Preview: ${preview.total_specs} specs; ${preview.counts?.will_link ?? 0} to link, ${preview.counts?.already_linked ?? 0} existing, ${preview.counts?.missing ?? 0} missing, ${preview.counts?.duplicate ?? 0} duplicate, ${preview.counts?.conflict ?? 0} conflicts.`)}
          />
        ) : null}
        <Table
          size="small"
          rowKey={(row) => `${row.asset_type}:${row.asset_id}:${row.asset_variant}:${row.runner_job_id}`}
          loading={loading}
          columns={columns}
          dataSource={preview?.rows ?? []}
          pagination={{ pageSize: 25, showSizeChanger: true }}
          scroll={{ x: 1450 }}
        />
      </Space>
    </Drawer>
  )
}

