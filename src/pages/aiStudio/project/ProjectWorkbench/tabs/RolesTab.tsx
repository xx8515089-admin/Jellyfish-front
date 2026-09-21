import { uiText, useUiLanguage } from '../../../../../i18n/uiText'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Button, Empty, Modal, Input, message, Space, Pagination, Tag } from 'antd'
import { EditOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  StudioProjectsService,
  StudioShotLinksService,
} from '../../../../../services/generated'
import type { ProjectActorLinkRead, ProjectCostumeLinkRead } from '../../../../../services/generated'
import { useProjectCharacters, newId } from '../hooks/useProjectData'
import { resolveAssetUrl } from '../../../assets/utils'
import { DisplayImageCard } from '../../../assets/components/DisplayImageCard'
import { StudioEntitiesApi } from '../../../../../services/studioEntities'
import {
  ProjectVisualStyleAndStyleFields,
  type ProjectVisualStyleChoice,
} from '../../../project/ProjectVisualStyleAndStyleFields'
import { useProjectStyleOptions } from '../../../project/useProjectStyleOptions'
import { useBilingualText } from '../../../../../i18n/useBilingualText'
import StudioSelect from '../../StudioSelect'

type ActorLike = {
  id: string
  name: string
  description?: string | null
  thumbnail?: string
}

type CostumeLike = {
  id: string
  name: string
  description?: string | null
  thumbnail?: string
}

function getWardrobeTextOverride(description?: string | null) {
  const marker = 'wardrobe_text_override:'
  return String(description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.includes(marker))
    ?.split(marker, 2)[1]
    ?.trim()
}

function cleanCostumeName(name?: string | null) {
  const text = String(name ?? '').trim()
  if (!text) return ''
  if (text.includes('—')) return text.split('—').slice(1).join('—').trim()
  if (text.includes(' - ')) return text.split(' - ').slice(1).join(' - ').trim()
  return text
}

function getCharacterDisplayName(c: any, actor?: ActorLike, costume?: CostumeLike) {
  const actorName = c.actor_name ?? actor?.name ?? c.name
  const wardrobe = c.wardrobe_text_override ?? getWardrobeTextOverride(c.description)
  const costumeName = c.costume_name ?? costume?.name
  const costumeLabel = cleanCostumeName(costumeName)
  if (costumeLabel) return `${actorName} — ${costumeLabel}`
  if (wardrobe) return `${actorName} — ${wardrobe}`
  return actorName
}

function notifyShotAssetCreatedAndLinked(payload: {
  projectId?: string
  chapterId?: string | null
  shotId?: string | null
  assetId?: string
  assetName: string
}) {
  if (!payload.projectId || !payload.chapterId || !payload.shotId) return
  try {
    window.opener?.postMessage(
      {
        type: 'studio-shot-asset-created-and-linked',
        projectId: payload.projectId,
        chapterId: payload.chapterId,
        shotId: payload.shotId,
        assetId: payload.assetId ?? null,
        assetName: payload.assetName,
      },
      window.location.origin,
    )
  } catch {
    // 跨窗口通知失败不阻塞角色创建成功。
  }
}

export function RolesTab() {
  useUiLanguage()

  const { options: projectStyleOptions, defaultVisualStyle, getDefaultStyle } = useProjectStyleOptions()
  const navigate = useNavigate()
  const l = useBilingualText()
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { characters, loading, refresh } = useProjectCharacters(projectId)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pendingShotLinkShotId, setPendingShotLinkShotId] = useState<string | null>(null)
  const [pendingShotLinkChapterId, setPendingShotLinkChapterId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formActorId, setFormActorId] = useState<string | undefined>(undefined)
  const [formCostumeId, setFormCostumeId] = useState<string | undefined>(undefined)

  const [projectActorLinks, setProjectActorLinks] = useState<ProjectActorLinkRead[]>([])
  const [projectCostumeLinks, setProjectCostumeLinks] = useState<ProjectCostumeLinkRead[]>([])
  const [actorsById, setActorsById] = useState<Record<string, ActorLike>>({})
  const [costumesById, setCostumesById] = useState<Record<string, CostumeLike>>({})
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [projectVisualStyle, setProjectVisualStyle] = useState<ProjectVisualStyleChoice>(defaultVisualStyle as ProjectVisualStyleChoice)
  const [projectStyle, setProjectStyle] = useState<string>(getDefaultStyle(defaultVisualStyle))
  const [formVisualStyle, setFormVisualStyle] = useState<ProjectVisualStyleChoice>(defaultVisualStyle as ProjectVisualStyleChoice)
  const [formStyle, setFormStyle] = useState<string>(getDefaultStyle(defaultVisualStyle))

  useEffect(() => {
    const create = searchParams.get('create')
    const name = searchParams.get('name') ?? ''
    const desc = searchParams.get('desc') ?? ''
    const tab = searchParams.get('tab')
    const visualStyle = (searchParams.get('visualStyle')?.trim() || '') as ProjectVisualStyleChoice | ''
    const style = searchParams.get('style')?.trim() ?? ''
    if (create === '1' && tab === 'roles') {
      setFormName(name)
      setFormDesc(desc)
      setFormActorId(undefined)
      setFormCostumeId(undefined)
      const nextVisual = visualStyle || projectVisualStyle
      setFormVisualStyle(nextVisual)
      setFormStyle(style || projectStyle || getDefaultStyle(nextVisual))
      const shotIdFromUrl = searchParams.get('shotId')?.trim() ?? ''
      const chapterIdFromUrl = searchParams.get('chapterId')?.trim() ?? ''
      setPendingShotLinkShotId(shotIdFromUrl || null)
      setPendingShotLinkChapterId(chapterIdFromUrl || null)
      setCreateOpen(true)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('create')
          next.delete('name')
          next.delete('desc')
          next.delete('chapterId')
          next.delete('shotId')
          next.delete('visualStyle')
          next.delete('style')
          return next
        },
        { replace: true },
      )
    }
  }, [getDefaultStyle, projectStyle, projectVisualStyle, searchParams, setSearchParams])

  const openNormalRoleCreate = useCallback(() => {
    setPendingShotLinkShotId(null)
    setPendingShotLinkChapterId(null)
    setFormName('')
    setFormDesc('')
    setFormActorId(undefined)
    setFormCostumeId(undefined)
    setFormVisualStyle(projectVisualStyle)
    setFormStyle(projectStyle)
    setCreateOpen(true)
  }, [projectStyle, projectVisualStyle])

  const loadProjectLinks = async () => {
    if (!projectId) return
    setLoadingLinks(true)
    try {
      const [actorRes, costumeRes] = await Promise.all([
        StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
          entityType: 'actor',
          projectId,
          chapterId: null,
          shotId: null,
          assetId: null,
          order: null,
          isDesc: false,
          page: 1,
          pageSize: 100,
        }),
        StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({
          entityType: 'costume',
          projectId,
          chapterId: null,
          shotId: null,
          assetId: null,
          order: null,
          isDesc: false,
          page: 1,
          pageSize: 100,
        }),
      ])
      const actorLinks = (actorRes.data?.items ?? []) as ProjectActorLinkRead[]
      const costumeLinks = (costumeRes.data?.items ?? []) as ProjectCostumeLinkRead[]
      setProjectActorLinks(actorLinks)
      setProjectCostumeLinks(costumeLinks)

      const actorIds = Array.from(new Set(actorLinks.map((l) => l.actor_id)))
      const costumeIds = Array.from(new Set(costumeLinks.map((l) => l.costume_id)))

      const [actors, costumes] = await Promise.all([
        Promise.all(
          actorIds.map((id) =>
            StudioEntitiesApi.get('actor', id)
              .then((r) => (r.data ?? null) as ActorLike | null)
              .catch(() => null),
          ),
        ),
        Promise.all(
          costumeIds.map((id) =>
            StudioEntitiesApi.get('costume', id)
              .then((r) => (r.data ?? null) as CostumeLike | null)
              .catch(() => null),
          ),
        ),
      ])

      const nextActors: Record<string, ActorLike> = {}
      actors.filter(Boolean).forEach((a) => {
        nextActors[(a as ActorLike).id] = a as ActorLike
      })
      const nextCostumes: Record<string, CostumeLike> = {}
      costumes.filter(Boolean).forEach((c) => {
        nextCostumes[(c as CostumeLike).id] = c as CostumeLike
      })
      setActorsById(nextActors)
      setCostumesById(nextCostumes)
    } catch {
      message.error(l('加载项目关联演员/服装失败', 'Failed to load linked actors and costumes'))
      setProjectActorLinks([])
      setProjectCostumeLinks([])
      setActorsById({})
      setCostumesById({})
    } finally {
      setLoadingLinks(false)
    }
  }

  useEffect(() => {
    void loadProjectLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    void (async () => {
      try {
        const res = await StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId })
        const nextVisual = (res.data?.visual_style as ProjectVisualStyleChoice | undefined) ?? (defaultVisualStyle as ProjectVisualStyleChoice)
        const nextStyle = (res.data?.style as string | undefined) ?? getDefaultStyle(nextVisual)
        setProjectVisualStyle(nextVisual)
        setProjectStyle(nextStyle)
      } catch {
        // 忽略该错误，并回退为默认值
      }
    })()
  }, [defaultVisualStyle, getDefaultStyle, projectId])

  const handleCreateRole = async () => {
    if (!projectId) return
    const name = formName.trim()
    if (!name) {
      message.warning(l('请输入角色名称', 'Enter a character name'))
      return
    }
    if (!formActorId) {
      message.warning(l('请选择关联演员', 'Select a linked actor'))
      return
    }
    setCreating(true)
    try {
      const createRes = await StudioEntitiesApi.create('character', {
        id: newId('char'),
        project_id: projectId,
        chapter_id: pendingShotLinkChapterId,
        shot_id: pendingShotLinkShotId,
        name,
        description: formDesc.trim() || undefined,
        visual_style: formVisualStyle || '现实',
        style: formStyle,
        actor_id: formActorId,
        costume_id: formCostumeId ?? null,
      })
      const charId = (createRes.data as { id?: string } | undefined)?.id
      if (charId && pendingShotLinkShotId) {
        notifyShotAssetCreatedAndLinked({
          projectId,
          chapterId: pendingShotLinkChapterId,
          shotId: pendingShotLinkShotId,
          assetId: charId,
          assetName: name,
        })
      }
      message.success(l('角色创建成功', 'Character created'))
      setCreateOpen(false)
      setFormName('')
      setFormDesc('')
      setFormActorId(undefined)
      setFormCostumeId(undefined)
      setFormVisualStyle(projectVisualStyle)
      setFormStyle(projectStyle)
      setPendingShotLinkShotId(null)
      setPendingShotLinkChapterId(null)
      await refresh()
    } catch {
      message.error(l('创建失败', 'Failed to create character'))
      setPendingShotLinkShotId(null)
      setPendingShotLinkChapterId(null)
    } finally {
      setCreating(false)
    }
  }

  const roleCards = useMemo(() => {
    return characters.map((c) => {
      const actor = actorsById[c.actor_id]
      const costume = c.costume_id ? costumesById[c.costume_id] : undefined
      return { c, actor, costume }
    })
  }, [actorsById, characters, costumesById])

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const pagedRoleCards = useMemo(() => {
    const start = (page - 1) * pageSize
    return roleCards.slice(start, start + pageSize)
  }, [page, pageSize, roleCards])

  useEffect(() => {
    setPage(1)
  }, [roleCards.length])

  const actorOptions = useMemo(() => {
    return projectActorLinks.map((l) => {
      const a = actorsById[l.actor_id]
      const url = resolveAssetUrl(a?.thumbnail)
      return {
        value: l.actor_id,
        searchLabel: a?.name ?? l.actor_id,
        label: (
          <div className="flex items-center gap-2 min-w-0">
            {url ? (
              <img src={url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                <UserOutlined />
              </div>
            )}
            <div className="min-w-0 truncate">{a?.name ?? l.actor_id}</div>
          </div>
        ),
      }
    })
  }, [actorsById, projectActorLinks])

  const costumeOptions = useMemo(() => {
    return projectCostumeLinks.map((l) => {
      const c = costumesById[l.costume_id]
      return { value: l.costume_id, label: c?.name ?? l.costume_id, searchLabel: c?.name ?? l.costume_id }
    })
  }, [costumesById, projectCostumeLinks])

  if (!projectId) {
    return null
  }

  return (
    <div className="h-full overflow-auto">
      <Card
        title={l('项目角色', 'Project characters')}
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openNormalRoleCreate}>
              {l('新建角色', 'New character')}
            </Button>
          </Space>
        }
      >
        {characters.length === 0 && !loading ? (
          <Empty
            description={l('暂无项目角色', 'No project characters yet')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={openNormalRoleCreate}>
                {l('新建角色', 'New character')}
              </Button>
            </Space>
          </Empty>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pagedRoleCards.map(({ c, actor, costume }) => {
              const wardrobe = c.wardrobe_text_override ?? getWardrobeTextOverride(c.description)
              const displayName = getCharacterDisplayName(c, actor, costume)
              const linkedShotCount = Number(c.linked_shot_count ?? 0)
              const imageUrl = resolveAssetUrl(
                c.actor_identity_thumbnail ||
                c.actor_body_thumbnail ||
                c.costume_thumbnail ||
                c.thumbnail,
              )
              return (
                <DisplayImageCard
                  key={c.id}
                  title={<div className="truncate">{displayName}</div>}
                  imageUrl={imageUrl}
                  imageAlt={displayName}
                  enablePreview
                  extra={
                    <Space size="small">
                      <Button
                        type="default"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                          if (!projectId) return
                          navigate(`/projects/${projectId}/roles/${c.id}/edit`)
                        }}
                      >
                        {l('编辑', 'Edit')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        onClick={() => {
                          Modal.confirm({
                            title: l(`删除角色「${displayName}」？`, `Delete character "${displayName}"?`),
                            okText: l('删除', 'Delete'),
                            cancelText: l('取消', 'Cancel'),
                            okButtonProps: { danger: true },
                            onOk: async () => {
                              try {
                                await StudioEntitiesApi.remove('character', c.id)
                                message.success(l('已删除', 'Character deleted'))
                                await refresh()
                              } catch {
                                message.error(l('删除失败', 'Failed to delete character'))
                              }
                            },
                          })
                        }}
                      >
                        {l('删除', 'Delete')}
                      </Button>
                    </Space>
                  }
                  meta={
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <Tag color={linkedShotCount > 0 ? 'blue' : 'default'} className="m-0">
                          {linkedShotCount > 0 ? uiText("{0} 个镜头", linkedShotCount) : uiText("未关联镜头")}
                        </Tag>
                        {wardrobe ? <Tag color="gold" className="m-0">text-only wardrobe</Tag> : null}
                        {!c.costume_id && !wardrobe ? <Tag color="warning" className="m-0">missing costume</Tag> : null}
                      </div>
                      <div className="text-xs text-gray-600 truncate">
                        Actor：{c.actor_name ?? actor?.name ?? c.actor_id ?? '—'}
                      </div>
                      <div className="text-xs text-gray-600 line-clamp-2">
                        Wardrobe：{c.costume_name ?? costume?.name ?? wardrobe ?? '—'}
                      </div>
                      <details className="text-[11px] text-gray-400">
                        <summary className="cursor-pointer select-none">{l('显示技术信息', 'Show technical details')}</summary>
                        <div className="mt-1 space-y-0.5 break-all">
                          <div>character_id: {c.id}</div>
                          <div>actor_id: {c.actor_id ?? '—'}</div>
                          <div>costume_id: {c.costume_id ?? '—'}</div>
                          <div>actor_identity_file_id: {c.actor_identity_file_id ?? '—'}</div>
                          <div>actor_body_file_id: {c.actor_body_file_id ?? '—'}</div>
                          <div>costume_file_id: {c.costume_file_id ?? '—'}</div>
                        </div>
                      </details>
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
                total={roleCards.length}
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

      <Modal
        title={l('新建角色', 'New character')}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          setPendingShotLinkShotId(null)
        }}
        onOk={handleCreateRole}
        okText={l('创建', 'Create')}
        cancelText={l('取消', 'Cancel')}
        confirmLoading={creating}
        width={560}
      >
        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-600 mb-1">{l('角色名称', 'Character name')}</div>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={l('例如：小雨', 'For example: Rain')} />
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">{l('描述（可选）', 'Description (optional)')}</div>
            <Input.TextArea rows={3} value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
          </div>
          <div>
            <ProjectVisualStyleAndStyleFields
              visual_style={formVisualStyle}
              style={formStyle}
              options={projectStyleOptions}
              onChange={(next) => {
                setFormVisualStyle(next.visual_style)
                setFormStyle(next.style)
              }}
            />
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">{l('关联演员（必填）', 'Linked actor (required)')}</div>
            <StudioSelect
              className="w-full"
              placeholder={l('选择当前项目已关联的演员', 'Select an actor linked to this project')}
              loading={loadingLinks}
              value={formActorId}
              onChange={(v) => setFormActorId(v)}
              options={actorOptions}
              showSearch
              optionFilterProp="searchLabel"
              filterOption={(input, option) => String(option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">{l('关联服装（可选）', 'Linked costume (optional)')}</div>
            <StudioSelect
              className="w-full"
              allowClear
              placeholder={l('选择当前项目已关联的服装', 'Select a costume linked to this project')}
              loading={loadingLinks}
              value={formCostumeId}
              onChange={(v) => setFormCostumeId(v)}
              options={costumeOptions}
              showSearch
              optionFilterProp="searchLabel"
              filterOption={(input, option) => String(option?.searchLabel ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
