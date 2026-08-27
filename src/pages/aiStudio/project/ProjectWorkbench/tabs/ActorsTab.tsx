import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Collapse, Empty, Image, Input, Modal, Space, Tag, message, Pagination } from 'antd'
import { EditOutlined, LinkOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { StudioShotLinksService } from '../../../../../services/generated'
import type { ProjectActorLinkRead } from '../../../../../services/generated'
import { StudioEntitiesApi } from '../../../../../services/studioEntities'
import { useProjectCharacters } from '../hooks/useProjectData'
import { resolveAssetUrl } from '../../../assets/utils'
import { DisplayImageCard } from '../../../assets/components/DisplayImageCard'
import { ActorEntityFormModal } from '../../../assets/components/ActorEntityFormModal'
import { encodeWorkbenchAssetEditReturnTo } from '../utils/workbenchAssetReturnTo'
import { useBilingualText } from '../../../../../i18n/useBilingualText'

type ActorLike = {
  id: string
  name: string
  description?: string | null
  thumbnail?: string
  canonical_actor_key?: string
  actor_identity_canonical_asset_name?: string
  actor_identity_file_id?: string | null
  actor_identity_usage_role?: string
  actor_body_canonical_asset_name?: string
  actor_body_file_id?: string | null
  actor_body_usage_role?: string
}

function ActorSlotSummary({ actor, fallbackActorId }: { actor?: ActorLike; fallbackActorId: string }) {
  const l = useBilingualText()
  const displayName = actor?.name || fallbackActorId
  const identityFileId = actor?.actor_identity_file_id || ''
  const bodyFileId = actor?.actor_body_file_id || ''
  return (
    <div className="space-y-2 text-xs text-gray-600">
      <div className="grid grid-cols-1 gap-1">
        <div className="flex items-center justify-between gap-2">
          <span>Identity Reference</span>
          <Tag color={identityFileId ? 'success' : 'warning'} className="m-0">
            {identityFileId ? 'OK' : 'Missing'}
          </Tag>
        </div>
        <div className="truncate text-[11px] text-gray-400">{actor?.actor_identity_usage_role || 'actor_identity'}</div>
        <div className="flex items-center justify-between gap-2">
          <span>Fullbody Reference</span>
          <Tag color={bodyFileId ? 'success' : 'warning'} className="m-0">
            {bodyFileId ? 'OK' : 'Missing'}
          </Tag>
        </div>
        <div className="truncate text-[11px] text-gray-400">{actor?.actor_body_usage_role || 'actor_body_reference'}</div>
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
                <div className="truncate">{l('内部 ID', 'Internal ID')}：{fallbackActorId}</div>
                <div className="truncate">
                  Canonical：<span className="font-mono">{actor?.canonical_actor_key || `ACTOR__${displayName}`}</span>
                </div>
                <div className="truncate">Identity：{actor?.actor_identity_canonical_asset_name || `${displayName}__actor_identity`}</div>
                <div className="truncate">
                  file_id：<span className="font-mono">{identityFileId || l('未绑定', 'Not linked')}</span>
                </div>
                <div className="truncate">role：{actor?.actor_identity_usage_role || 'actor_identity'}</div>
                <div className="truncate">Fullbody：{actor?.actor_body_canonical_asset_name || `${displayName}__actor_body_reference`}</div>
                <div className="truncate">
                  file_id：<span className="font-mono">{bodyFileId || l('未绑定', 'Not linked')}</span>
                </div>
                <div className="truncate">role：{actor?.actor_body_usage_role || 'actor_body_reference'}</div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

export function ActorsTab() {
  const navigate = useNavigate()
  const l = useBilingualText()
  const { projectId } = useParams<{ projectId: string }>()
  useProjectCharacters(projectId)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [actors, setActors] = useState<ActorLike[]>([])
  const [actorsLoading, setActorsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null)
  const [links, setLinks] = useState<ProjectActorLinkRead[]>([])
  const [linksLoading, setLinksLoading] = useState(false)

  const linkedActorIdSet = useMemo(
    () => new Set(links.map((l) => l.actor_id).filter(Boolean) as string[]),
    [links],
  )

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const pagedLinks = useMemo(() => {
    const start = (page - 1) * pageSize
    return links.slice(start, start + pageSize)
  }, [links, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [links.length])

  const loadLinks = async () => {
    if (!projectId) return
    setLinksLoading(true)
    try {
      const res = await StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'actor',
        projectId,
        chapterId: null,
        shotId: null,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      })
      setLinks((res.data?.items ?? []) as ProjectActorLinkRead[])
    } catch {
      message.error(l('加载项目演员关联失败', 'Failed to load project actor links'))
      setLinks([])
    } finally {
      setLinksLoading(false)
    }
  }

  const loadActors = async (searchQuery?: string) => {
    setActorsLoading(true)
    try {
      const q = searchQuery !== undefined ? searchQuery : search
      const res = await StudioEntitiesApi.list('actor', {
        page: 1,
        pageSize: 100,
        q: q?.trim() || undefined,
        order: 'updated_at',
        isDesc: true,
      })
      setActors((res.data?.items ?? []) as ActorLike[])
    } catch {
      message.error(l('加载演员失败', 'Failed to load actors'))
      setActors([])
    } finally {
      setActorsLoading(false)
    }
  }

  useEffect(() => {
    if (linkModalOpen) void loadActors('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkModalOpen])

  useEffect(() => {
    void loadLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleLinkActor = async (actor: ActorLike) => {
    if (!projectId) return
    setLinkingId(actor.id)
    try {
      await StudioShotLinksService.createProjectActorLinkApiV1StudioShotLinksActorPost({
        requestBody: {
          project_id: projectId,
          chapter_id: null,
          shot_id: null,
          asset_id: actor.id,
        },
      })
      message.success(l(`已关联演员「${actor.name}」到项目`, `Actor "${actor.name}" linked to the project`))
      setLinkModalOpen(false)
      await loadLinks()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'body' in e && typeof (e as { body?: { detail?: string } }).body?.detail === 'string'
          ? (e as { body: { detail: string } }).body.detail
          : l('关联失败', 'Failed to link actor')
      message.error(msg)
    } finally {
      setLinkingId(null)
    }
  }

  const handleUnlinkActor = async (link: ProjectActorLinkRead) => {
    setUnlinkingId(link.id)
    try {
      await StudioShotLinksService.deleteProjectActorLinkApiV1StudioShotLinksActorLinkIdDelete({ linkId: link.id })
      message.success(l('已取消关联', 'Actor unlinked'))
      await loadLinks()
    } catch {
      message.error(l('取消关联失败', 'Failed to unlink actor'))
    } finally {
      setUnlinkingId(null)
    }
  }

  const linkedByActorId = useMemo(() => {
    const map = new Map<string, ActorLike>()
    actors.forEach((a) => map.set(a.id, a))
    return map
  }, [actors])

  useEffect(() => {
    // 为表格展示补齐 actor 详情（name/thumbnail/description）
    const missing = Array.from(new Set(links.map((l) => l.actor_id))).filter((id) => !linkedByActorId.has(id))
    if (missing.length === 0) return
    void (async () => {
      try {
        const res = await StudioEntitiesApi.list('actor', {
          page: 1,
          pageSize: 100,
          q: null,
          order: null,
          isDesc: false,
        })
        const items = (res.data?.items ?? []) as ActorLike[]
        setActors((prev) => {
          const map = new Map(prev.map((a) => [a.id, a]))
          items.forEach((a) => map.set(a.id, a))
          return Array.from(map.values())
        })
      } catch {
        // 忽略该错误
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links])

  const availableActors = useMemo(
    () => actors.filter((a) => !linkedActorIdSet.has(a.id)),
    [actors, linkedActorIdSet],
  )

  if (!projectId) return null

  return (
    <div className="h-full overflow-auto">
      <Card
        title={l('项目演员', 'Project actors')}
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              {l('新建', 'New')}
            </Button>
            <Button
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => {
                setSearch('')
                setLinkModalOpen(true)
              }}
            >
              {l('从资产库关联', 'Link from asset library')}
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/assets')}>
              {l('前往资产管理', 'Open asset manager')}
            </Button>
          </Space>
        }
      >
        {links.length === 0 && !linksLoading ? (
          <Empty description={l('暂无项目演员，可从资产库关联演员到本项目', 'No project actors yet. Link actors from the asset library.')} image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                {l('新建', 'New')}
              </Button>
              <Button
                type="primary"
                icon={<LinkOutlined />}
                onClick={() => {
                  setSearch('')
                  setLinkModalOpen(true)
                }}
              >
                {l('从资产库关联', 'Link from asset library')}
              </Button>
              <Button onClick={() => navigate('/assets')}>{l('前往资产管理', 'Open asset manager')}</Button>
            </Space>
          </Empty>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pagedLinks.map((link) => {
              const a = linkedByActorId.get(link.actor_id)
              return (
                <DisplayImageCard
                  key={link.id}
                  title={<div className="truncate">{a?.name ?? link.actor_id}</div>}
                  imageUrl={resolveAssetUrl(a?.thumbnail)}
                  imageAlt={a?.name ?? link.actor_id}
                  extra={
                    <Space size="small">
                      <Button
                        type="default"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() =>
                          navigate(
                            `/assets/actors/${link.actor_id}/edit?returnTo=${encodeWorkbenchAssetEditReturnTo(projectId, 'actors')}`,
                          )
                        }
                      >
                        {l('编辑', 'Edit')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        loading={unlinkingId === link.id}
                        onClick={() => {
                          Modal.confirm({
                            title: l(`取消关联「${a?.name ?? link.actor_id}」？`, `Unlink "${a?.name ?? link.actor_id}"?`),
                            okText: l('取消关联', 'Unlink'),
                            cancelText: l('取消', 'Cancel'),
                            okButtonProps: { danger: true },
                            onOk: () => handleUnlinkActor(link),
                          })
                        }}
                      >
                        {l('取消关联', 'Unlink')}
                      </Button>
                    </Space>
                  }
                  meta={
                    <div className="space-y-1">
                      <div className="text-xs text-gray-600 line-clamp-2">{a?.description ?? '—'}</div>
                      <ActorSlotSummary actor={a} fallbackActorId={link.actor_id} />
                    </div>
                  }
                />
              )
            })}
            </div>
            <div className="flex justify-end">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={links.length}
                showSizeChanger={false}
                showTotal={(t) => l(`共 ${t} 条`, `${t} items`)}
                onChange={(p, ps) => {
                  setPage(p)
                  setPageSize(ps)
                }}
              />
            </div>
          </div>
        )}
      </Card>

      <ActorEntityFormModal
        open={createModalOpen}
        editing={null}
        linkProjectId={projectId}
        onCancel={() => setCreateModalOpen(false)}
        onSuccess={async () => {
          await loadLinks()
        }}
      />

      <Modal
        title={l('从资产库关联演员', 'Link actors from asset library')}
        open={linkModalOpen}
        onCancel={() => setLinkModalOpen(false)}
        footer={null}
        width={560}
      >
        <div className="mb-3">
          <Input.Search
            placeholder={l('搜索演员名称', 'Search actor names')}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(value) => loadActors(value)}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {actorsLoading ? (
            <div className="py-8 text-center text-gray-500">{l('加载中...', 'Loading...')}</div>
          ) : availableActors.length === 0 ? (
            <Empty description={actors.length === 0 ? l('暂无演员，请先在资产管理中创建演员', 'No actors yet. Create one in the asset manager first.') : l('当前项目已关联全部搜索结果', 'All search results are already linked to this project.')} />
          ) : (
            <div className="space-y-2">
              {availableActors.map((actor) => (
                <div
                  key={actor.id}
                  className="flex items-center justify-between gap-3 rounded border border-gray-200 p-2 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {resolveAssetUrl(actor.thumbnail) ? (
                      <Image
                        src={resolveAssetUrl(actor.thumbnail)}
                        alt=""
                        width={40}
                        height={40}
                        style={{ objectFit: 'cover', borderRadius: 4 }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                        <UserOutlined />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{actor.name}</div>
                      {actor.description && <div className="text-xs text-gray-500 truncate">{actor.description}</div>}
                    </div>
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    loading={linkingId === actor.id}
                    onClick={() => handleLinkActor(actor)}
                  >
                    {l('关联到项目', 'Link to project')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
