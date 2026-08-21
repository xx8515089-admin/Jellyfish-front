import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Image, Input, Modal, Space, Tag, message, Pagination } from 'antd'
import { EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { StudioShotLinksService } from '../../../../../services/generated'
import type { ProjectSceneLinkRead } from '../../../../../services/generated'
import { buildFileDownloadUrl, resolveAssetUrl } from '../../../assets/utils'
import { DisplayImageCard } from '../../../assets/components/DisplayImageCard'
import { StudioEntitiesApi } from '../../../../../services/studioEntities'
import { StudioAssetTypeFormModal } from '../../../assets/components/StudioAssetTypeFormModal'
import { encodeWorkbenchAssetEditReturnTo } from '../utils/workbenchAssetReturnTo'
import { useBilingualText } from '../../../../../i18n/useBilingualText'

type SceneLike = {
  id: string
  name: string
  description?: string | null
  thumbnail?: string
}

type ProjectSceneLinkWithVariants = ProjectSceneLinkRead & {
  panorama_thumbnail?: string
  camera_board_thumbnail?: string
  panorama_file_id?: string
  camera_board_file_id?: string
}

type GroupedSceneLink = {
  sceneId: string
  links: ProjectSceneLinkWithVariants[]
  sourceLabels: string[]
  thumbnail?: string
  panorama_thumbnail?: string
  camera_board_thumbnail?: string
  panorama_file_id?: string
  camera_board_file_id?: string
}

function groupSceneLinks(links: ProjectSceneLinkWithVariants[]): GroupedSceneLink[] {
  const byScene = new Map<string, GroupedSceneLink>()
  links.forEach((link) => {
    if (!link.scene_id) return
    const current = byScene.get(link.scene_id)
    if (current) {
      current.links.push(link)
      if (!current.sourceLabels.includes('from project_scene_links')) current.sourceLabels.push('from project_scene_links')
      current.thumbnail ||= link.thumbnail
      current.panorama_thumbnail ||= link.panorama_thumbnail
      current.camera_board_thumbnail ||= link.camera_board_thumbnail
      current.panorama_file_id ||= link.panorama_file_id
      current.camera_board_file_id ||= link.camera_board_file_id
      return
    }
    byScene.set(link.scene_id, {
      sceneId: link.scene_id,
      links: [link],
      sourceLabels: ['from project_scene_links'],
      thumbnail: link.thumbnail,
      panorama_thumbnail: link.panorama_thumbnail,
      camera_board_thumbnail: link.camera_board_thumbnail,
      panorama_file_id: link.panorama_file_id,
      camera_board_file_id: link.camera_board_file_id,
    })
  })
  return Array.from(byScene.values())
}

export function ScenesTab() {
  const navigate = useNavigate()
  const l = useBilingualText()
  const { projectId } = useParams<{ projectId: string }>()

  const [links, setLinks] = useState<ProjectSceneLinkWithVariants[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [scenesById, setScenesById] = useState<Record<string, SceneLike>>({})

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [scenes, setScenes] = useState<SceneLike[]>([])
  const [scenesLoading, setScenesLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const groupedLinks = useMemo(() => groupSceneLinks(links), [links])
  const pagedLinks = useMemo(() => {
    const start = (page - 1) * pageSize
    return groupedLinks.slice(start, start + pageSize)
  }, [groupedLinks, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [groupedLinks.length])

  const loadLinks = async () => {
    if (!projectId) return
    setLinksLoading(true)
    try {
      const res = await StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
        entityType: 'scene',
        projectId,
        chapterId: null,
        shotId: null,
        assetId: null,
        order: null,
        isDesc: false,
        page: 1,
        pageSize: 100,
      })
      const items = (res.data?.items ?? []) as ProjectSceneLinkWithVariants[]
      setLinks(items)

      const ids = Array.from(new Set(items.map((l) => l.scene_id)))
      const fetched = await Promise.all(
        ids.map((id) =>
          StudioEntitiesApi.get('scene', id)
            .then((r) => (r.data ?? null) as SceneLike | null)
            .catch(() => null),
        ),
      )
      const next: Record<string, SceneLike> = {}
      fetched.filter(Boolean).forEach((s) => {
        next[(s as SceneLike).id] = s as SceneLike
      })
      setScenesById(next)
    } catch {
      message.error(l('加载项目场景关联失败', 'Failed to load project scene links'))
      setLinks([])
      setScenesById({})
    } finally {
      setLinksLoading(false)
    }
  }

  const loadScenes = async (searchQuery?: string) => {
    setScenesLoading(true)
    try {
      const q = (searchQuery !== undefined ? searchQuery : search).trim()
      const res = await StudioEntitiesApi.list('scene', {
        q: q ? q : null,
        order: 'updated_at',
        isDesc: true,
        page: 1,
        pageSize: 100,
      })
      setScenes((res.data?.items ?? []) as SceneLike[])
    } catch {
      message.error(l('加载场景失败', 'Failed to load scenes'))
      setScenes([])
    } finally {
      setScenesLoading(false)
    }
  }

  useEffect(() => {
    void loadLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (linkModalOpen) void loadScenes('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkModalOpen])

  const linkedSceneIdSet = useMemo(() => new Set(links.map((l) => l.scene_id)), [links])
  const availableScenes = useMemo(() => scenes.filter((s) => !linkedSceneIdSet.has(s.id)), [scenes, linkedSceneIdSet])

  const toThumbUrl = (thumbnail?: string) => {
    const url = resolveAssetUrl(thumbnail)
    if (url) return url
    // 兼容后端返回 file_id 的情况
    if (thumbnail && !thumbnail.includes('/') && !thumbnail.includes(':')) return buildFileDownloadUrl(thumbnail)
    return undefined
  }

  const handleLinkScene = async (scene: SceneLike) => {
    if (!projectId) return
    setLinkingId(scene.id)
    try {
      await StudioShotLinksService.createProjectSceneLinkApiV1StudioShotLinksScenePost({
        requestBody: { project_id: projectId, chapter_id: null, shot_id: null, asset_id: scene.id },
      })
      message.success(l(`已关联场景「${scene.name}」到项目`, `Scene "${scene.name}" linked to the project`))
      setLinkModalOpen(false)
      await loadLinks()
    } catch {
      message.error(l('关联失败', 'Failed to link scene'))
    } finally {
      setLinkingId(null)
    }
  }

  const handleUnlinkScene = async (link: ProjectSceneLinkRead) => {
    setUnlinkingId(link.id)
    try {
      await StudioShotLinksService.deleteProjectSceneLinkApiV1StudioShotLinksSceneLinkIdDelete({ linkId: link.id })
      message.success(l('已取消关联', 'Scene unlinked'))
      await loadLinks()
    } catch {
      message.error(l('取消关联失败', 'Failed to unlink scene'))
    } finally {
      setUnlinkingId(null)
    }
  }

  if (!projectId) return null

  return (
    <div className="h-full overflow-auto">
      <Card
        title={l('项目场景', 'Project scenes')}
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
            <Button icon={<PlusOutlined />} onClick={() => navigate('/assets?tab=scene')}>
              {l('前往资产管理', 'Open asset manager')}
            </Button>
          </Space>
        }
      >
        {groupedLinks.length === 0 && !linksLoading ? (
          <Empty description={l('暂无项目场景，可从资产库关联场景到本项目', 'No project scenes yet. Link scenes from the asset library.')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pagedLinks.map((group) => {
              const sceneId = group.sceneId
              const primaryLink = group.links[0]
              const s = scenesById[sceneId]
              const panoramaUrl = toThumbUrl(group.panorama_thumbnail || group.thumbnail || s?.thumbnail)
              const cameraBoardUrl = toThumbUrl(group.camera_board_thumbnail)
              return (
                <DisplayImageCard
                  key={sceneId}
                  title={<div className="truncate">{s?.name ?? sceneId}</div>}
                  imageUrl={panoramaUrl}
                  imageAlt={s?.name ?? sceneId}
                  extra={
                    <Space size="small">
                      <Button
                        type="default"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() =>
                          navigate(
                            `/assets/scenes/${sceneId}/edit?returnTo=${encodeWorkbenchAssetEditReturnTo(projectId, 'scenes')}`,
                          )
                        }
                      >
                        {l('编辑', 'Edit')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        loading={unlinkingId === primaryLink.id}
                        onClick={() => {
                          Modal.confirm({
                            title: l(`取消关联「${s?.name ?? sceneId}」？`, `Unlink "${s?.name ?? sceneId}"?`),
                            okText: l('取消关联', 'Unlink'),
                            cancelText: l('取消', 'Cancel'),
                            okButtonProps: { danger: true },
                            onOk: () => handleUnlinkScene(primaryLink),
                          })
                        }}
                      >
                        {l('取消关联', 'Unlink')}
                      </Button>
                    </Space>
                  }
                  meta={
                    <div className="space-y-1">
                      <div className="text-xs text-gray-600 line-clamp-2">{s?.description ?? '—'}</div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <Tag color="blue" className="m-0">panorama / FRONT</Tag>
                          </div>
                          {panoramaUrl ? (
                            <Image
                              src={panoramaUrl}
                              alt={`${s?.name ?? sceneId} panorama`}
                              className="h-20 w-full rounded border border-gray-100 object-cover"
                              preview={{ src: panoramaUrl }}
                            />
                          ) : (
                            <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-200 text-xs text-gray-400">
                              {l('未链接', 'Not linked')}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <Tag color="purple" className="m-0">camera board / LEFT</Tag>
                          </div>
                          {cameraBoardUrl ? (
                            <Image
                              src={cameraBoardUrl}
                              alt={`${s?.name ?? sceneId} camera board`}
                              className="h-20 w-full rounded border border-gray-100 object-cover"
                              preview={{ src: cameraBoardUrl }}
                            />
                          ) : (
                            <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-200 text-xs text-gray-400">
                              {l('缺少机位板', 'Camera board missing')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {group.sourceLabels.map((source) => (
                          <Tag key={source}>{source}</Tag>
                        ))}
                        {group.links.length > 1 ? <Tag color="gold">links × {group.links.length}</Tag> : null}
                      </div>
                      <div className="text-xs text-gray-500 truncate">scene_id：{sceneId}</div>
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
        label={l('场景', 'Scene')}
        entityType="scene"
        editing={null}
        linkProjectId={projectId}
        createAsset={async (payload) => {
          const res = await StudioEntitiesApi.create('scene', payload as Record<string, unknown>)
          if (!res.data) throw new Error('empty scene')
          return res.data as SceneLike
        }}
        updateAsset={async (id, payload) => {
          const res = await StudioEntitiesApi.update('scene', id, payload as Record<string, unknown>)
          if (!res.data) throw new Error('empty scene')
          return res.data as SceneLike
        }}
        onCancel={() => setCreateModalOpen(false)}
        onSaved={async () => {
          await loadLinks()
        }}
      />

      <Modal
        title={l('从资产库关联场景', 'Link scenes from asset library')}
        open={linkModalOpen}
        onCancel={() => setLinkModalOpen(false)}
        footer={null}
        width={560}
      >
        <div className="mb-3">
          <Input.Search
            placeholder={l('搜索场景名称', 'Search scene names')}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(value) => loadScenes(value)}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {scenesLoading ? (
            <div className="py-8 text-center text-gray-500">{l('加载中...', 'Loading...')}</div>
          ) : availableScenes.length === 0 ? (
            <Empty description={scenes.length === 0 ? l('暂无场景，请先在资产管理中创建场景', 'No scenes yet. Create one in the asset manager first.') : l('当前项目已关联全部搜索结果', 'All search results are already linked to this project.')} />
          ) : (
            <div className="space-y-2">
              {availableScenes.map((scene) => (
                <div
                  key={scene.id}
                  className="flex items-center justify-between gap-3 rounded border border-gray-200 p-2 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {toThumbUrl(scene.thumbnail) ? (
                      <img
                        src={toThumbUrl(scene.thumbnail)}
                        alt=""
                        className="w-10 h-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                        —
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{scene.name}</div>
                      {scene.description && <div className="text-xs text-gray-500 truncate">{scene.description}</div>}
                    </div>
                  </div>
                  <Button type="primary" size="small" loading={linkingId === scene.id} onClick={() => handleLinkScene(scene)}>
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
