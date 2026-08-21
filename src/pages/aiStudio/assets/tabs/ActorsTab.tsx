import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Checkbox, Collapse, Empty, Input, Modal, Pagination, Space, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { StudioEntitiesApi } from '../../../../services/studioEntities'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resolveAssetUrl } from '../utils'
import { DisplayImageCard } from '../components/DisplayImageCard'
import { ActorEntityFormModal, type ActorEntityLike } from '../components/ActorEntityFormModal'
import { useBilingualText } from '../../../../i18n/useBilingualText'

function ActorSlotSummary({ actor }: { actor: any }) {
  const l = useBilingualText()
  const identityFileId = actor.actor_identity_file_id || ''
  const bodyFileId = actor.actor_body_file_id || ''
  return (
    <div className="mt-2 space-y-2 text-xs text-gray-600">
      <div className="grid grid-cols-1 gap-1">
        <div className="flex items-center justify-between gap-2">
          <span>Identity Reference</span>
          <Tag color={identityFileId ? 'success' : 'warning'} className="m-0">
            {identityFileId ? 'OK' : 'Missing'}
          </Tag>
        </div>
        <div className="truncate text-[11px] text-gray-400">{actor.actor_identity_usage_role || 'actor_identity'}</div>
        <div className="flex items-center justify-between gap-2">
          <span>Fullbody Reference</span>
          <Tag color={bodyFileId ? 'success' : 'warning'} className="m-0">
            {bodyFileId ? 'OK' : 'Missing'}
          </Tag>
        </div>
        <div className="truncate text-[11px] text-gray-400">{actor.actor_body_usage_role || 'actor_body_reference'}</div>
      </div>

      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'technical',
            label: <span className="text-[11px] text-gray-500">{l('显示技术信息', 'Show technical details')}</span>,
            children: (
              <div className="space-y-1 rounded border border-gray-100 bg-gray-50 p-2 text-[11px] leading-5 text-gray-600">
                <div className="truncate">
                  <span className="text-gray-400">Canonical：</span>
                  <span className="font-mono">{actor.canonical_actor_key || `ACTOR__${actor.name || actor.id}`}</span>
                </div>
                <div className="truncate">
                  <span className="text-gray-400">{l('内部ID：', 'Internal ID: ')}</span>
                  <span className="font-mono">{actor.id}</span>
                </div>
                <div className="truncate">
                  <span className="text-gray-400">Identity：</span>
                  {actor.actor_identity_canonical_asset_name || `${actor.name}__actor_identity`}
                </div>
                <div className="truncate">
                  <span className="text-gray-400">file_id：</span>
                  <span className="font-mono">{identityFileId || l('未绑定', 'Not linked')}</span>
                </div>
                <div className="truncate">
                  <span className="text-gray-400">role：</span>
                  {actor.actor_identity_usage_role || 'actor_identity'}
                </div>
                <div className="truncate">
                  <span className="text-gray-400">Fullbody：</span>
                  {actor.actor_body_canonical_asset_name || `${actor.name}__actor_body_reference`}
                </div>
                <div className="truncate">
                  <span className="text-gray-400">file_id：</span>
                  <span className="font-mono">{bodyFileId || l('未绑定', 'Not linked')}</span>
                </div>
                <div className="truncate">
                  <span className="text-gray-400">role：</span>
                  {actor.actor_body_usage_role || 'actor_body_reference'}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

export function ActorsTab({ refreshToken = 0 }: { refreshToken?: number }) {
  const l = useBilingualText()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [actors, setActors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(48)
  const [total, setTotal] = useState(0)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<ActorEntityLike | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [fromShotCreateContext, setFromShotCreateContext] = useState<{
    projectId: string
    chapterId: string
    shotId: string
  } | null>(null)

  const load = async (opts?: { page?: number; pageSize?: number; q?: string }) => {
    setLoading(true)
    try {
      const nextPage = opts?.page ?? page
      const nextPageSize = opts?.pageSize ?? pageSize
      const q = typeof opts?.q === 'string' ? opts.q : search.trim() || undefined
      const res = await StudioEntitiesApi.list('actor', {
        page: nextPage,
        pageSize: nextPageSize,
        q: q ?? null,
        order: 'updated_at',
        isDesc: true,
      })
      const items = res.data?.items ?? []
      setActors(items)
      setTotal(res.data?.pagination.total ?? 0)
      setSelectedIds((prev) => prev.filter((id) => items.some((item: any) => item.id === id)))
    } catch {
      message.error(l('加载演员失败', 'Failed to load actors'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, refreshToken])

  useEffect(() => {
    const create = searchParams.get('create')
    const tab = searchParams.get('tab')
    const projectId = searchParams.get('projectId')?.trim() ?? ''
    const chapterId = searchParams.get('chapterId')?.trim() ?? ''
    const shotId = searchParams.get('shotId')?.trim() ?? ''
    if (create === '1' && tab === 'actor') {
      setEditing(null)
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
          return next
        },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => actors, [actors])
  const allFilteredSelected = filtered.length > 0 && filtered.every((actor) => selectedIds.includes(actor.id))

  const openCreate = () => {
    setEditing(null)
    setFromShotCreateContext(null)
    setEditOpen(true)
  }

  const openEdit = (a: ActorEntityLike) => {
    setEditing(a)
    setFromShotCreateContext(null)
    setEditOpen(true)
  }

  const handleModalCancel = () => {
    setEditOpen(false)
    setEditing(null)
    setFromShotCreateContext(null)
  }

  const handleBatchDelete = () => {
    const selectedActors = filtered.filter((actor) => selectedIds.includes(actor.id))
    if (selectedActors.length === 0) {
      message.info(l('请先选择要删除的演员', 'Select actors to delete'))
      return
    }
    Modal.confirm({
      title: l(`批量删除 ${selectedActors.length} 个演员资产？`, `Delete ${selectedActors.length} actor asset(s)?`),
      content: (
        <div className="space-y-2">
          <div>{l('将删除当前选中的演员及其关联图片槽。此操作不可撤销。', 'The selected actors and linked image slots will be deleted. This cannot be undone.')}</div>
          <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs">
            {selectedActors.map((actor) => (
              <div key={actor.id}>{actor.name}</div>
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
          for (const actor of selectedActors) {
            try {
              await StudioEntitiesApi.remove('actor', actor.id)
            } catch {
              failed += 1
            }
          }
          setSelectedIds([])
          await load()
          if (failed > 0) message.warning(l(`已删除 ${selectedActors.length - failed} 个，失败 ${failed} 个`, `Deleted ${selectedActors.length - failed}; ${failed} failed`))
          else message.success(l(`已删除 ${selectedActors.length} 个演员资产`, `Deleted ${selectedActors.length} actor asset(s)`))
        } finally {
          setBatchDeleting(false)
        }
      },
    })
  }

  return (
    <Card
      title={l('演员', 'Actors')}
      extra={
        <Space>
          <Input.Search
            placeholder={l('搜索演员', 'Search actors')}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(v) => {
              setPage(1)
              void load({ q: v, page: 1 })
            }}
            style={{ width: 240 }}
          />
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={selectedIds.length === 0}
            loading={batchDeleting}
            onClick={handleBatchDelete}
          >
            {l('批量删除', 'Delete selected')}{selectedIds.length ? ` (${selectedIds.length})` : ''}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            {l('刷新', 'Refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {l('新建', 'New')}
          </Button>
        </Space>
      }
    >
      {filtered.length === 0 && !loading ? (
        <Empty description={l('暂无演员', 'No actors')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <div className="mb-3 text-sm text-gray-500">
            {l(`本页 ${filtered.length} 条 / 共 ${total} 条`, `${filtered.length} on this page / ${total} total`)}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Checkbox
              checked={allFilteredSelected}
              indeterminate={selectedIds.length > 0 && !allFilteredSelected}
              disabled={filtered.length === 0}
              onChange={(e) => {
                setSelectedIds(e.target.checked ? filtered.map((actor) => actor.id) : [])
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
              {filtered.map((a) => (
                <DisplayImageCard
                  key={a.id}
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
                      <div className="truncate">{a.name}</div>
                    </div>
                  }
                  imageUrl={resolveAssetUrl(a.thumbnail)}
                  imageAlt={a.name}
                  extra={
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(a)}>
                        {l('编辑', 'Edit')}
                      </Button>
                      <Button size="small" onClick={() => navigate(`/assets/actors/${a.id}/edit`)}>
                        {l('详情', 'Details')}
                      </Button>
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          Modal.confirm({
                            title: l(`删除演员「${a.name}」？`, `Delete actor “${a.name}”?`),
                            okText: l('删除', 'Delete'),
                            cancelText: l('取消', 'Cancel'),
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await StudioEntitiesApi.remove('actor', a.id)
                                message.success(l('已删除', 'Deleted'))
                                void load()
                              } catch {
                                message.error(l('删除失败', 'Failed to delete'))
                              }
                            },
                          })
                        }}
                      />
                    </Space>
                  }
                  meta={
                    <div>
                      {a.description && <div className="text-xs text-gray-600 line-clamp-2">{a.description}</div>}
                      <ActorSlotSummary actor={a} />
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(a.tags ?? []).slice(0, 6).map((t: string) => (
                          <Tag key={t} className="m-0">
                            {t}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={[12, 24, 48, 96]}
          onChange={(p, ps) => {
            setPage(p)
            setPageSize(ps)
          }}
        />
      </div>

      <ActorEntityFormModal
        open={editOpen}
        editing={editing}
        linkProjectId={fromShotCreateContext?.projectId}
        linkChapterId={fromShotCreateContext?.chapterId}
        linkShotId={fromShotCreateContext?.shotId}
        onCancel={handleModalCancel}
        onSuccess={async (detail) => {
          const createdItem = detail?.created as { id?: string } | undefined
          if (createdItem && page === 1 && !search.trim()) {
            setActors((prev) => [createdItem, ...prev.filter((it) => it.id !== createdItem.id)])
            setTotal((prev) => prev + 1)
          }
          await load({ page: 1 })
          setPage(1)
        }}
      />
    </Card>
  )
}
