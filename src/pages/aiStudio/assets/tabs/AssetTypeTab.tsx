import { useEffect, useMemo, useState } from 'react'
import { Card, Image, Input, Row, Col, Tag, Button, message, Modal, Space, Pagination, Checkbox } from 'antd'
import { EditOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { resolveAssetUrl } from '../utils'
import { DisplayImageCard } from '../components/DisplayImageCard'
import {
  StudioAssetTypeFormModal,
  normalizeStudioAsset,
  type StudioAssetLike,
} from '../components/StudioAssetTypeFormModal'
import { useBilingualText } from '../../../../i18n/useBilingualText'

export type { StudioAssetLike }

function normalizeAsset(asset: StudioAssetLike): StudioAssetLike {
  return normalizeStudioAsset(asset)
}

function dedupeAssetsByEntityId(items: StudioAssetLike[]): StudioAssetLike[] {
  const seen = new Set<string>()
  const deduped: StudioAssetLike[] = []
  for (const item of items) {
    const entityId = String(item.id || '').trim()
    if (!entityId) {
      deduped.push(item)
      continue
    }
    if (seen.has(entityId)) continue
    seen.add(entityId)
    deduped.push(item)
  }
  return deduped
}

type AssetMutationPayload = Record<string, unknown> & {
  name: string
  description?: string
  tags?: string[]
  view_count?: number | null
  thumbnail?: string
}

type AssetCreatePayload = Record<string, unknown> & {
  name: string
  thumbnail?: string
}

type AssetWithSceneSlots = StudioAssetLike & {
  panorama_thumbnail?: string
  camera_board_thumbnail?: string
  panorama_file_id?: string
  camera_board_file_id?: string
}

export function AssetTypeTab({
  label,
  labelEn,
  tabKey,
  listAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  onEditAsset,
  refreshToken = 0,
}: {
  label: string
  labelEn: string
  tabKey: 'scene' | 'prop' | 'costume'
  listAssets: (params: { q?: string; page: number; pageSize: number }) => Promise<{ items: StudioAssetLike[]; total: number }>
  createAsset: (payload: AssetCreatePayload) => Promise<StudioAssetLike>
  updateAsset: (id: string, payload: AssetMutationPayload) => Promise<StudioAssetLike>
  deleteAsset: (id: string) => Promise<void>
  onEditAsset?: (asset: StudioAssetLike) => void
  refreshToken?: number
}) {
  const l = useBilingualText()
  const displayLabel = l(label, labelEn)
  const [searchParams, setSearchParams] = useSearchParams()
  const [assets, setAssets] = useState<StudioAssetLike[]>([])
  const [loading, setLoading] = useState(true)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(48)
  const [total, setTotal] = useState(0)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<StudioAssetLike | null>(null)
  const [createSeed, setCreateSeed] = useState<{
    name: string
    desc: string
    visualStyle?: '现实' | '动漫'
    style?: string
  } | null>(null)
  const [fromShotCreateContext, setFromShotCreateContext] = useState<{
    projectId: string
    chapterId: string
    shotId: string
  } | null>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const load = async (opts?: { page?: number; pageSize?: number; q?: string }) => {
    setLoading(true)
    try {
      const nextPage = opts?.page ?? page
      const nextPageSize = opts?.pageSize ?? pageSize
      const nextQ = typeof opts?.q === 'string' ? opts.q : search.trim() || undefined
      const res = await listAssets({ q: nextQ, page: nextPage, pageSize: nextPageSize })
      const items = Array.isArray(res.items) ? res.items.map((item) => ({ ...item, ...normalizeAsset(item) })) : []
      const visibleItems = dedupeAssetsByEntityId(items)
      setAssets(visibleItems)
      setTotal(res.total)
      setSelectedIds((prev) => prev.filter((id) => visibleItems.some((item) => item.id === id)))
    } catch {
      message.error(l('加载资产失败', 'Failed to load assets'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, refreshToken])

  const filtered = useMemo(() => {
    return Array.isArray(assets) ? assets : []
  }, [assets])

  const allFilteredSelected = filtered.length > 0 && filtered.every((asset) => selectedIds.includes(asset.id))

  const openCreate = () => {
    setEditing(null)
    setCreateSeed(null)
    setFromShotCreateContext(null)
    setEditOpen(true)
  }

  useEffect(() => {
    const create = searchParams.get('create')
    const name = searchParams.get('name') ?? ''
    const desc = searchParams.get('desc') ?? ''
    const tab = searchParams.get('tab')
    const projectId = searchParams.get('projectId')?.trim() ?? ''
    const chapterId = searchParams.get('chapterId')?.trim() ?? ''
    const shotId = searchParams.get('shotId')?.trim() ?? ''
    const visualStyle = (searchParams.get('visualStyle')?.trim() || '') as '现实' | '动漫' | ''
    const style = searchParams.get('style')?.trim() ?? ''
    if (create === '1' && tab === tabKey) {
      setEditing(null)
      setCreateSeed({
        name,
        desc,
        visualStyle: visualStyle || undefined,
        style: style || undefined,
      })
      if (projectId && chapterId && shotId) {
        setFromShotCreateContext({ projectId, chapterId, shotId })
      } else {
        setFromShotCreateContext(null)
      }
      setEditOpen(true)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('create')
          next.delete('name')
          next.delete('desc')
          next.delete('projectId')
          next.delete('chapterId')
          next.delete('shotId')
          next.delete('visualStyle')
          next.delete('style')
          return next
        },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams, tabKey])

  const openEdit = (asset: StudioAssetLike) => {
    setEditing(asset)
    setCreateSeed(null)
    setFromShotCreateContext(null)
    setEditOpen(true)
  }

  const handleEdit = (asset: StudioAssetLike) => {
    if (onEditAsset) {
      onEditAsset(asset)
      return
    }
    openEdit(asset)
  }

  const handleModalCancel = () => {
    setEditOpen(false)
    setEditing(null)
    setCreateSeed(null)
    setFromShotCreateContext(null)
  }

  const handleDelete = (asset: StudioAssetLike) => {
    Modal.confirm({
      title: l(`删除${label}资产？`, `Delete ${labelEn} asset?`),
      content: l(`将删除「${asset.name}」。`, `“${asset.name}” will be deleted.`),
      okText: l('删除', 'Delete'),
      cancelText: l('取消', 'Cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteAsset(asset.id)
          message.success(l('已删除', 'Deleted'))
          await load()
        } catch {
          message.error(l('删除失败', 'Failed to delete'))
        }
      },
    })
  }

  const handleBatchDelete = () => {
    const selectedAssets = filtered.filter((asset) => selectedIds.includes(asset.id))
    if (selectedAssets.length === 0) {
      message.info(l('请先选择要删除的资产', 'Select assets to delete'))
      return
    }
    Modal.confirm({
      title: l(`批量删除 ${selectedAssets.length} 个${label}资产？`, `Delete ${selectedAssets.length} ${labelEn.toLowerCase()} asset(s)?`),
      content: (
        <div className="space-y-2">
          <div>{l('将删除当前选中的资产及其关联图片槽。此操作不可撤销。', 'The selected assets and linked image slots will be deleted. This cannot be undone.')}</div>
          <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs">
            {selectedAssets.map((asset) => (
              <div key={asset.id}>{asset.name}</div>
            ))}
          </div>
        </div>
      ),
      okText: l('确认删除', 'Delete'),
      cancelText: l('取消', 'Cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setBatchDeleting(true)
        try {
          let failed = 0
          for (const asset of selectedAssets) {
            try {
              await deleteAsset(asset.id)
            } catch {
              failed += 1
            }
          }
          setSelectedIds([])
          await load()
          if (failed > 0) message.warning(l(`已删除 ${selectedAssets.length - failed} 个，失败 ${failed} 个`, `Deleted ${selectedAssets.length - failed}; ${failed} failed`))
          else message.success(l(`已删除 ${selectedAssets.length} 个${label}资产`, `Deleted ${selectedAssets.length} ${labelEn.toLowerCase()} asset(s)`))
        } finally {
          setBatchDeleting(false)
        }
      },
    })
  }

  const openPreview = (asset: StudioAssetLike) => {
    const thumbnailUrl = resolveAssetUrl(asset.thumbnail)
    if (!thumbnailUrl) {
      message.info(l('未生成图片', 'No image generated'))
      return
    }
    setPreviewTitle(asset.name)
    setPreviewUrl(thumbnailUrl)
    setPreviewOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input.Search
          placeholder={l(`搜索${label}名称、描述或标签`, `Search ${labelEn.toLowerCase()} names, descriptions, or tags`)}
          allowClear
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={() => {
            setPage(1)
            void load()
          }}
        />
        <Space>
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={selectedIds.length === 0}
            loading={batchDeleting}
            onClick={handleBatchDelete}
          >
            {l('批量删除', 'Delete selected')}{selectedIds.length ? ` (${selectedIds.length})` : ''}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            {l('刷新', 'Refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {l('新建', 'New')}{displayLabel}
          </Button>
        </Space>
      </div>

      <Card loading={loading}>
        <div className="mb-3 text-sm text-gray-500">
          {l(`本页 ${filtered.length} 条 / 共 ${total} 条`, `${filtered.length} on this page / ${total} total`)}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Checkbox
            checked={allFilteredSelected}
            indeterminate={selectedIds.length > 0 && !allFilteredSelected}
            disabled={filtered.length === 0}
            onChange={(e) => {
              setSelectedIds(e.target.checked ? filtered.map((asset) => asset.id) : [])
            }}
          >
            {l('选择当前页', 'Select current page')}
          </Checkbox>
          {selectedIds.length > 0 ? (
            <Button size="small" onClick={() => setSelectedIds([])}>
              {l('清空选择', 'Clear selection')}
            </Button>
          ) : null}
        </div>
        <div className="max-h-[calc(100vh-360px)] min-h-[360px] overflow-y-auto overflow-x-hidden pr-2">
          <Row gutter={[16, 16]}>
            {filtered.length === 0 ? (
              <Col span={24}>
                <div className="text-center text-gray-500 py-8">{search ? l('无匹配资产', 'No matching assets') : l('暂无该类资产', 'No assets of this type')}</div>
              </Col>
            ) : (
              filtered.map((a) => {
                const sceneAsset = a as AssetWithSceneSlots
                const panoramaUrl = resolveAssetUrl(sceneAsset.panorama_thumbnail || a.thumbnail)
                const cameraBoardUrl = resolveAssetUrl(sceneAsset.camera_board_thumbnail)
                const thumbnailUrl = resolveAssetUrl(a.thumbnail)
                return (
                  <Col xs={24} sm={12} md={8} lg={6} xl={4} xxl={3} key={a.id}>
                    <DisplayImageCard
                      title={
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedIds.includes(a.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              setSelectedIds((prev) =>
                                e.target.checked ? Array.from(new Set([...prev, a.id])) : prev.filter((id) => id !== a.id),
                              )
                            }}
                          />
                          <span className="truncate">{a.name}</span>
                        </div>
                      }
                      imageUrl={thumbnailUrl}
                      imageAlt={a.name}
                      placeholder={l('未生成', 'Not generated')}
                      onImageClick={() => openPreview(a)}
                      extra={
                        <Space size="small">
                          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(a)}>
                            {l('编辑', 'Edit')}
                          </Button>
                        </Space>
                      }
                      actions={[
                        <Button
                          type="text"
                          key="del"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                          onClick={() => handleDelete(a)}
                        />,
                      ]}
                      meta={
                        <>
                          <div className="text-xs text-gray-500 mb-2 line-clamp-2">{a.description || l('暂无描述', 'No description')}</div>
                          {tabKey === 'scene' ? (
                            <div className="mb-2 grid grid-cols-2 gap-2">
                              <div>
                                <Tag color="blue" className="mb-1">panorama</Tag>
                                {panoramaUrl ? (
                                  <Image
                                    src={panoramaUrl}
                                    alt={`${a.name} panorama`}
                                    className="h-20 w-full rounded border border-gray-100 object-cover"
                                    preview={{ src: panoramaUrl }}
                                  />
                                ) : (
                                  <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-200 text-xs text-gray-400">
                                    {l('未生成', 'Not generated')}
                                  </div>
                                )}
                              </div>
                              <div>
                                <Tag color="purple" className="mb-1">{l('3x3 机位', '3x3 camera board')}</Tag>
                                {cameraBoardUrl ? (
                                  <Image
                                    src={cameraBoardUrl}
                                    alt={`${a.name} 3x3 camera board`}
                                    className="h-20 w-full rounded border border-gray-100 object-cover"
                                    preview={{ src: cameraBoardUrl }}
                                  />
                                ) : (
                                  <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-200 text-xs text-gray-400">
                                    {l('未生成', 'Not generated')}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-1">
                            {typeof a.view_count === 'number' && <Tag color="blue">{l('镜头', 'Views')} {a.view_count}</Tag>}
                            {(a.tags ?? []).slice(0, 3).map((t) => (
                              <Tag key={t}>{t}</Tag>
                            ))}
                          </div>
                        </>
                      }
                    />
                  </Col>
                )
              })
            )}
          </Row>
        </div>

        <div className="flex justify-end pt-4">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[12, 24, 48, 96]}
            showTotal={(t) => l(`共 ${t} 条`, `${t} total`)}
            onChange={(p, ps) => {
              setPage(p)
              setPageSize(ps)
            }}
          />
        </div>
      </Card>

      <StudioAssetTypeFormModal
        open={editOpen}
        label={displayLabel}
        entityType={tabKey}
        editing={editing}
        linkProjectId={fromShotCreateContext?.projectId}
        linkChapterId={fromShotCreateContext?.chapterId}
        linkShotId={fromShotCreateContext?.shotId}
        createAsset={createAsset}
        updateAsset={updateAsset}
        onCancel={handleModalCancel}
        seedCreateForm={
          createSeed
            ? {
                name: createSeed.name,
                description: createSeed.desc,
                visual_style: createSeed.visualStyle,
                style: createSeed.style,
              }
            : null
        }
        onSeedConsumed={() => setCreateSeed(null)}
        onSaved={async (ctx) => {
          if (ctx.type === 'update') {
            setAssets((prev) => prev.map((a) => (a.id === ctx.id ? ctx.asset : a)))
            await load()
          } else {
            setPage(1)
            await load({ page: 1 })
          }
        }}
      />

      <Modal
        title={previewTitle}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={880}
      >
        <div className="w-full flex justify-center bg-gray-50 rounded-md overflow-hidden">
          <img src={previewUrl} alt={previewTitle} className="max-h-[70vh] object-contain" />
        </div>
      </Modal>
    </div>
  )
}
