import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Input, Modal, Space, Tag, message, Pagination } from 'antd'
import { EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { StudioShotLinksService } from '../../../../../services/generated'
import type { ProjectCostumeLinkRead, ProjectPropLinkRead } from '../../../../../services/generated'
import { resolveAssetUrl } from '../../../assets/utils'
import { DisplayImageCard } from '../../../assets/components/DisplayImageCard'
import { StudioEntitiesApi } from '../../../../../services/studioEntities'
import { StudioAssetTypeFormModal } from '../../../assets/components/StudioAssetTypeFormModal'
import { encodeWorkbenchAssetEditReturnTo, type WorkbenchAssetTabParam } from '../utils/workbenchAssetReturnTo'
import { useBilingualText } from '../../../../../i18n/useBilingualText'

type AssetKind = 'prop' | 'costume'

type AssetItemLike = {
  id: string
  name: string
  description?: string | null
  thumbnail?: string
}

type GroupedAssetLink = {
  assetId: string
  links: (ProjectPropLinkRead | ProjectCostumeLinkRead)[]
  sourceLabels: string[]
  thumbnail?: string
}

function groupAssetLinks(
  links: (ProjectPropLinkRead | ProjectCostumeLinkRead)[],
  kind: AssetKind,
): GroupedAssetLink[] {
  const byId = new Map<string, GroupedAssetLink>()
  links.forEach((link) => {
    const assetId = kind === 'prop' ? (link as ProjectPropLinkRead).prop_id : (link as ProjectCostumeLinkRead).costume_id
    if (!assetId) return
    const current = byId.get(assetId)
    const source = kind === 'prop' ? 'from project_prop_links' : 'from project_costume_links'
    if (current) {
      current.links.push(link)
      if (!current.sourceLabels.includes(source)) current.sourceLabels.push(source)
      if (!current.thumbnail && (link as any).thumbnail) current.thumbnail = (link as any).thumbnail
      return
    }
    byId.set(assetId, {
      assetId,
      links: [link],
      sourceLabels: [source],
      thumbnail: (link as any).thumbnail,
    })
  })
  return Array.from(byId.values())
}

function costumeDisplayName(name: string): { title: string; badges: string[] } {
  const clean = name.trim()
  const lower = clean.toLowerCase()
  if (!clean) return { title: 'needs wearer review', badges: ['needs wearer review'] }
  if (clean.includes('—') || clean.includes('-')) return { title: clean, badges: [] }
  if (lower.includes('funeral black suit')) return { title: 'Shared — De Luca funeral black suit', badges: ['shared wardrobe'] }
  if (lower.includes('server uniform')) return { title: 'Young Server — funeral hall server uniform', badges: [] }
  if (lower.includes('funeral') && lower.includes('mourning')) return { title: 'Funeral Mourners — black formal mourning wardrobe', badges: [] }
  return { title: clean, badges: ['needs wearer review'] }
}

function propDisplayName(name: string): { title: string; badges: string[] } {
  const clean = name.trim()
  const lower = clean.toLowerCase()
  if (!clean) return { title: 'needs context review', badges: ['needs context review'] }
  if (lower.includes("ava") && lower.includes("notebook")) return { title: 'Ava Cross — reporter notebook evidence', badges: ['evidence'] }
  if (lower.includes("mark") && lower.includes("ring")) return { title: "Mark's De Luca ring — death evidence", badges: ['evidence'] }
  if (lower.includes("luke") && lower.includes("port key")) return { title: "Luke Marino's port key — red wax smear evidence", badges: ['evidence'] }
  if (lower.includes('black funeral card')) return { title: 'Black funeral card — funeral evidence', badges: ['evidence'] }
  const vagueTokens = ['notebook', 'card', 'ring', 'envelope', 'key', 'note', 'letter', 'document', 'car']
  const hasContext = /ava|mark|luke|sean|dylan|carter|samuel|rane|room 214|harbor|funeral/i.test(clean)
  if (vagueTokens.some((token) => lower.includes(token)) && !hasContext) {
    return { title: clean, badges: ['needs context review'] }
  }
  return { title: clean, badges: [] }
}

function LinkedAssetTab({
  kind,
  projectId,
}: {
  kind: AssetKind
  projectId: string
}) {
  const navigate = useNavigate()
  const l = useBilingualText()
  const workbenchTab: WorkbenchAssetTabParam = kind === 'prop' ? 'props' : 'costumes'
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null)

  const [links, setLinks] = useState<(ProjectPropLinkRead | ProjectCostumeLinkRead)[]>([])
  const [assets, setAssets] = useState<AssetItemLike[]>([])
  const [assetsById, setAssetsById] = useState<Record<string, AssetItemLike>>({})

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const groupedLinks = useMemo(() => groupAssetLinks(links, kind), [kind, links])
  const pagedLinks = useMemo(() => {
    const start = (page - 1) * pageSize
    return groupedLinks.slice(start, start + pageSize)
  }, [groupedLinks, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [groupedLinks.length])

  const loadLinks = async () => {
    setLoading(true)
    try {
      const res = await StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: kind,
        projectId,
        chapterId: null,
        shotId: null,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      })

      const items = (res.data?.items ?? []) as any[]
      const typedItems = items as (ProjectPropLinkRead | ProjectCostumeLinkRead)[]
      setLinks(typedItems)

      const ids = Array.from(new Set(items.map((l) => (kind === 'prop' ? l.prop_id : l.costume_id)).filter(Boolean))) as string[]

      const entityIdKey = kind === 'prop' ? 'prop' : 'costume'
      const detailList = await Promise.all(
        ids.map((id) =>
          StudioEntitiesApi.get(entityIdKey, id)
            .then((r) => (r.data ?? null) as AssetItemLike | null)
            .catch(() => null),
        ),
      )

      const map: Record<string, AssetItemLike> = {}
      detailList.filter(Boolean).forEach((x) => {
        map[x!.id] = x!
      })
      setAssetsById(map)
    } catch {
      message.error(kind === 'prop' ? l('加载项目道具关联失败', 'Failed to load project prop links') : l('加载项目服装关联失败', 'Failed to load project costume links'))
      setLinks([])
      setAssetsById({})
    } finally {
      setLoading(false)
    }
  }

  const loadAssets = async (qOverride?: string) => {
    setListLoading(true)
    try {
      const q = (qOverride ?? search).trim()
      const res =
        kind === 'prop'
          ? await StudioEntitiesApi.list('prop', {
              q: q || null,
              order: 'updated_at',
              isDesc: true,
              page: 1,
              pageSize: 100,
            })
          : await StudioEntitiesApi.list('costume', {
              q: q || null,
              order: 'updated_at',
              isDesc: true,
              page: 1,
              pageSize: 100,
            })
      setAssets((res.data?.items ?? []) as AssetItemLike[])
    } catch {
      message.error(kind === 'prop' ? l('加载道具失败', 'Failed to load props') : l('加载服装失败', 'Failed to load costumes'))
      setAssets([])
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    void loadLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, kind])

  useEffect(() => {
    if (linkModalOpen) void loadAssets('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkModalOpen, kind])

  const linkedIdSet = useMemo(
    () => new Set(links.map((l) => ('prop_id' in l ? l.prop_id : l.costume_id))),
    [links],
  )
  const available = useMemo(() => assets.filter((a) => !linkedIdSet.has(a.id)), [assets, linkedIdSet])

  const handleLink = async (assetId: string, assetName: string) => {
    setLinkingId(assetId)
    try {
      if (kind === 'prop') {
        await StudioShotLinksService.createProjectPropLinkApiV1StudioShotLinksPropPost({
          requestBody: { project_id: projectId, chapter_id: null, shot_id: null, asset_id: assetId },
        })
      } else {
        await StudioShotLinksService.createProjectCostumeLinkApiV1StudioShotLinksCostumePost({
          requestBody: { project_id: projectId, chapter_id: null, shot_id: null, asset_id: assetId },
        })
      }
      message.success(kind === 'prop' ? l(`已关联道具「${assetName}」`, `Prop "${assetName}" linked`) : l(`已关联服装「${assetName}」`, `Costume "${assetName}" linked`))
      setLinkModalOpen(false)
      await loadLinks()
    } catch {
      message.error(l('关联失败', 'Failed to link asset'))
    } finally {
      setLinkingId(null)
    }
  }

  const handleUnlink = async (link: ProjectPropLinkRead | ProjectCostumeLinkRead) => {
    setUnlinkingId(link.id)
    try {
      if ('prop_id' in link) {
        await StudioShotLinksService.deleteProjectPropLinkApiV1StudioShotLinksPropLinkIdDelete({ linkId: link.id })
      } else {
        await StudioShotLinksService.deleteProjectCostumeLinkApiV1StudioShotLinksCostumeLinkIdDelete({ linkId: link.id })
      }
      message.success(l('已取消关联', 'Asset unlinked'))
      await loadLinks()
    } catch {
      message.error(l('取消关联失败', 'Failed to unlink asset'))
    } finally {
      setUnlinkingId(null)
    }
  }

  return (
    <div className="h-full overflow-auto">
      <Card
        title={kind === 'prop' ? l('项目道具', 'Project props') : l('项目服装', 'Project costumes')}
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
            <Button icon={<PlusOutlined />} onClick={() => navigate(`/assets?tab=${kind}`)}>
              {l('前往资产管理', 'Open asset manager')}
            </Button>
          </Space>
        }
      >
        {groupedLinks.length === 0 && !loading ? (
          <Empty description={kind === 'prop' ? l('暂无项目道具', 'No project props yet') : l('暂无项目服装', 'No project costumes yet')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pagedLinks.map((group) => {
              const assetId = group.assetId
              const primaryLink = group.links[0]
              const asset = assetsById[assetId]
              const linkThumb = group.thumbnail
              const display = kind === 'costume' ? costumeDisplayName(asset?.name ?? assetId) : propDisplayName(asset?.name ?? assetId)
              return (
                <DisplayImageCard
                  key={assetId}
                  title={<div className="truncate">{display.title}</div>}
                  imageUrl={resolveAssetUrl(linkThumb ?? asset?.thumbnail)}
                  imageAlt={display.title}
                  extra={
                    <Space size="small">
                      <Button
                        type="default"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                          const path =
                            kind === 'prop'
                              ? `/assets/props/${assetId}/edit`
                              : `/assets/costumes/${assetId}/edit`
                          navigate(`${path}?returnTo=${encodeWorkbenchAssetEditReturnTo(projectId, workbenchTab)}`)
                        }}
                      >
                        {l('编辑', 'Edit')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        loading={unlinkingId === primaryLink.id}
                        onClick={() => {
                          Modal.confirm({
                            title: l(`取消关联「${display.title}」？`, `Unlink "${display.title}"?`),
                            okText: l('取消关联', 'Unlink'),
                            cancelText: l('取消', 'Cancel'),
                            okButtonProps: { danger: true },
                            onOk: () => handleUnlink(primaryLink),
                          })
                        }}
                      >
                        {l('取消关联', 'Unlink')}
                      </Button>
                    </Space>
                  }
                  meta={
                    <div className="space-y-1">
                      <div className="text-xs text-gray-600 line-clamp-2">{asset?.description ?? '—'}</div>
                      <div className="flex flex-wrap gap-1">
                        {group.sourceLabels.map((source) => (
                          <Tag key={source}>{source}</Tag>
                        ))}
                        {group.links.length > 1 ? <Tag color="gold">links × {group.links.length}</Tag> : null}
                        {display.badges.map((badge) => (
                          <Tag key={badge} color={badge.includes('needs') ? 'warning' : 'blue'}>{badge}</Tag>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{`${kind}_id：${assetId}`}</div>
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
                total={groupedLinks.length}
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

      <StudioAssetTypeFormModal
        open={createModalOpen}
        label={kind === 'prop' ? l('道具', 'Prop') : l('服装', 'Costume')}
        entityType={kind}
        editing={null}
        linkProjectId={projectId}
        createAsset={async (payload) => {
          const entity = kind === 'prop' ? 'prop' : 'costume'
          const res = await StudioEntitiesApi.create(entity, payload as Record<string, unknown>)
          if (!res.data) throw new Error(`empty ${entity}`)
          return res.data as AssetItemLike
        }}
        updateAsset={async (id, payload) => {
          const entity = kind === 'prop' ? 'prop' : 'costume'
          const res = await StudioEntitiesApi.update(entity, id, payload as Record<string, unknown>)
          if (!res.data) throw new Error(`empty ${entity}`)
          return res.data as AssetItemLike
        }}
        onCancel={() => setCreateModalOpen(false)}
        onSaved={async () => {
          await loadLinks()
        }}
      />

      <Modal
        title={kind === 'prop' ? l('从资产库关联道具', 'Link props from asset library') : l('从资产库关联服装', 'Link costumes from asset library')}
        open={linkModalOpen}
        onCancel={() => setLinkModalOpen(false)}
        footer={null}
        width={560}
      >
        <div className="mb-3">
          <Input.Search
            placeholder={kind === 'prop' ? l('搜索道具名称', 'Search prop names') : l('搜索服装名称', 'Search costume names')}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(v) => loadAssets(v)}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {listLoading ? (
            <div className="py-8 text-center text-gray-500">{l('加载中...', 'Loading...')}</div>
          ) : available.length === 0 ? (
            <Empty description={l('暂无可关联资产', 'No assets available to link')} />
          ) : (
            <div className="space-y-2">
              {available.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded border border-gray-200 p-2 hover:bg-gray-50">
                  <div className="flex items-center gap-2 min-w-0">
                    {resolveAssetUrl(a.thumbnail) ? (
                      <img src={resolveAssetUrl(a.thumbnail)} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">—</div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      {a.description ? <div className="text-xs text-gray-500 truncate">{a.description}</div> : null}
                    </div>
                  </div>
                  <Button type="primary" size="small" loading={linkingId === a.id} onClick={() => handleLink(a.id, a.name)}>
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

export function PropsTab() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null
  return <LinkedAssetTab kind="prop" projectId={projectId} />
}

export function CostumesTab() {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null
  return <LinkedAssetTab kind="costume" projectId={projectId} />
}
