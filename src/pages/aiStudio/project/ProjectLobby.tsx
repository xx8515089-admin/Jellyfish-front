import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Input,
  Button,
  Modal,
  Form,
  message,
  Dropdown,
  Spin,
  Pagination,
  theme,
} from 'antd'
import { EditOutlined } from '@ant-design/icons'
import type { InputRef } from 'antd'
import {
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Info,
  MoreHorizontal,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { StudioScriptsApi } from '../../../services/studioScripts'
import type { StudioScriptImportId, StudioScriptImportListItem } from '../../../services/studioScripts'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { clearProjectCreationDrafts } from './projectCreationDraft'
import {
  createCanvasWorkspace,
  deleteCanvasWorkspace,
  listCanvasWorkspaces,
  renameCanvasWorkspace,
  type CanvasWorkspace,
} from '../../canvas/canvasWorkspaces'
import './ProjectLobby.css'

type WorkspaceView = 'workflow' | 'canvas'
type ProjectLobbyProps = {
  workspaceView?: WorkspaceView
}
type ProjectView = {
  id: string
  name: string
  description: string
  style: string
  seed: number
  unifyStyle: boolean
  progress: number
  stats: {
    chapters: number
    roles: number
    scenes: number
    props: number
  }
  updatedAt: string
  defaultVideoRatio?: string | null
  coverUrl?: string
  wordCount?: number
  episodeCount?: number
  segmentCount?: number
  creditsSpent?: number
  viewCount?: number
  creatorName?: string
  createdAt?: string
  sourceFileName?: string
  targetMarket?: string
  parseStatus?: number
  parseStatusName?: string
  scriptImportId?: StudioScriptImportId
  scriptImport?: StudioScriptImportListItem
}

const WORKFLOW_PAGE_SIZE = 10
const CANVAS_PAGE_SIZE = 10

const toUIImportProject = (item: StudioScriptImportListItem): ProjectView => ({
  id: String(item.id),
  scriptImportId: item.id,
  name: item.title,
  description: item.sourceFileName ?? '',
  style: '',
  seed: 0,
  unifyStyle: true,
  progress: (item.parseStatus ?? 0) >= 3 ? 100 : (item.parseStatus ?? 0) > 0 ? 50 : 0,
  stats: {
    chapters: item.chapterCount ?? 0,
    roles: 0,
    scenes: 0,
    props: 0,
  },
  updatedAt: item.updatedAt ?? item.createdAt ?? '',
  defaultVideoRatio: item.videoRatio ?? null,
  wordCount: item.characterCount ?? 0,
  episodeCount: item.chapterCount ?? 0,
  creatorName: item.ownerName?.trim() || undefined,
  createdAt: item.createdAt ?? undefined,
  sourceFileName: item.sourceFileName ?? undefined,
  targetMarket: item.targetMarket ?? undefined,
  parseStatus: item.parseStatus ?? undefined,
  parseStatusName: item.parseStatusName ?? undefined,
  scriptImport: item,
})

const formatChineseCount = (count: number) => {
  if (count < 10_000) return String(count)
  const value = count / 10_000
  return `${Number.isInteger(value) ? value : value.toFixed(1)}万`
}

const formatProjectDate = (value?: string) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const ProjectLobby: React.FC<ProjectLobbyProps> = ({ workspaceView = 'workflow' }) => {
  const l = useBilingualText()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const [projects, setProjects] = useState<ProjectView[]>([])
  const [canvasWorkspaces, setCanvasWorkspaces] = useState<CanvasWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<InputRef>(null)
  const [page, setPage] = useState(1)
  const [totalProjects, setTotalProjects] = useState(0)
  const [workflowListRefreshToken] = useState(0)
  const [visibleInfoProjectId, setVisibleInfoProjectId] = useState<string | null>(null)
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null)
  const suppressProjectMenuOpenRef = useRef(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renamingProject, setRenamingProject] = useState<ProjectView | null>(null)
  const [renameForm] = Form.useForm()

  useEffect(() => {
    if (workspaceView === 'canvas') {
      setLoading(false)
      return
    }

    let active = true

    const loadProjects = async () => {
      setLoading(true)
      try {
        const response = await StudioScriptsApi.getImports({
          page,
          pageSize: WORKFLOW_PAGE_SIZE,
          keyword: search.trim() || undefined,
        })
        if (active) {
          setProjects((response.items ?? []).map(toUIImportProject))
          setTotalProjects(response.total ?? 0)
        }
      } catch {
        if (active) {
          setProjects([])
          setTotalProjects(0)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadProjects()
    return () => { active = false }
  }, [page, search, workflowListRefreshToken, workspaceView])

  useEffect(() => {
    if (workspaceView !== 'canvas') return

    const reloadCanvasWorkspaces = () => {
      setCanvasWorkspaces(listCanvasWorkspaces())
    }

    reloadCanvasWorkspaces()
    window.addEventListener('focus', reloadCanvasWorkspaces)
    return () => window.removeEventListener('focus', reloadCanvasWorkspaces)
  }, [workspaceView])

  const getProjectStatus = (p: ProjectView): 'draft' | 'inProgress' | 'completed' => {
    if (p.progress >= 90) return 'completed'
    if (p.progress <= 5) return 'draft'
    return 'inProgress'
  }

  const canvasProjects = useMemo<ProjectView[]>(() => (
    canvasWorkspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      description: '',
      style: '现实主义',
      seed: 0,
      unifyStyle: true,
      progress: 0,
      stats: { chapters: 0, roles: 0, scenes: 0, props: 0 },
      updatedAt: workspace.updatedAt,
      createdAt: workspace.createdAt,
      creatorName: l('本地工作区', 'Local workspace'),
    }))
  ), [canvasWorkspaces, l])

  const filteredCanvasProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return canvasProjects
    return canvasProjects.filter((workspace) => workspace.name.toLowerCase().includes(keyword))
  }, [canvasProjects, search])

  const filteredSorted = useMemo(() => {
    if (workspaceView === 'canvas') {
      const pageStart = (page - 1) * CANVAS_PAGE_SIZE
      return [...filteredCanvasProjects]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(pageStart, pageStart + CANVAS_PAGE_SIZE)
    }
    return Array.isArray(projects) ? projects : []
  }, [filteredCanvasProjects, page, projects, workspaceView])

  const visibleTotalProjects = workspaceView === 'canvas'
    ? filteredCanvasProjects.length
    : totalProjects
  const activePageSize = workspaceView === 'canvas' ? CANVAS_PAGE_SIZE : WORKFLOW_PAGE_SIZE

  const handleOpenCreate = () => {
    if (workspaceView === 'canvas') {
      const workspace = createCanvasWorkspace(l('未命名画布', 'Untitled canvas'))
      setCanvasWorkspaces(listCanvasWorkspaces())
      navigate(`/canvas/${workspace.id}`)
      return
    }
    clearProjectCreationDrafts()
    navigate('/projects/create')
  }

  const handleOpenWorkspace = (project: ProjectView) => {
    if (workspaceView === 'canvas') {
      navigate(`/canvas/${project.id}`)
      return
    }

    const scriptImport = project.scriptImport
    if (!scriptImport) return
    navigate(`/projects/create?scriptImportId=${encodeURIComponent(String(scriptImport.id))}`, {
      state: {
        scriptImport,
      },
    })
  }

  const handleOpenRename = (p: ProjectView) => {
    setRenamingProject(p)
    renameForm.setFieldsValue({ name: p.name })
    setRenameModalOpen(true)
  }

  const handleRenameSubmit = async (values: { name: string }) => {
    if (!renamingProject) return
    try {
      if (workspaceView === 'canvas') {
        const updated = renameCanvasWorkspace(renamingProject.id, values.name.trim())
        if (!updated) throw new Error('empty canvas')
        setCanvasWorkspaces(listCanvasWorkspaces())
        message.success(l('画布已重命名', 'Canvas renamed'))
        setRenameModalOpen(false)
        setRenamingProject(null)
        return
      }
      message.warning(l('剧本项目重命名接口未接入，暂不能修改名称', 'Script project rename API is not connected yet'))
    } catch {
      message.error(l('重命名失败', 'Failed to rename project'))
    }
  }

  const handleDelete = async (projectId: string) => {
    try {
      if (workspaceView === 'canvas') {
        await deleteCanvasWorkspace(projectId)
        const nextWorkspaces = listCanvasWorkspaces()
        setCanvasWorkspaces(nextWorkspaces)
        message.success(l('画布已删除', 'Canvas deleted'))
        if ((page - 1) * CANVAS_PAGE_SIZE >= nextWorkspaces.length && page > 1) {
          setPage((currentPage) => currentPage - 1)
        }
        return
      }
      message.warning(l(
        '剧本项目删除接口未接入，暂不能删除',
        'Script project deletion is not connected yet.',
      ))
    } catch {
      message.error(l('删除失败', 'Failed to delete'))
    }
  }

  const renderCard = (p: ProjectView) => {
    const isCanvasView = workspaceView === 'canvas'
    const status = getProjectStatus(p)
    const statusText = status === 'completed' ? l('已完成', 'Completed') : status === 'draft' ? l('草稿', 'Draft') : l('进行中', 'In progress')
    const projectTitle = p.name
    const wordCount = p.wordCount ?? 0
    const episodeCount = p.episodeCount ?? p.stats.chapters

    return (
      <article
        key={p.id}
        className={`project-lobby-card${isCanvasView ? ' project-lobby-card--canvas' : ''}${visibleInfoProjectId === p.id ? ' is-info-visible' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenWorkspace(p)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          handleOpenWorkspace(p)
        }}
      >
        <div className="project-lobby-card__cover">
          {!isCanvasView && (
            <span className={`project-lobby-card__status project-lobby-card__status--${status}`}>
              {p.parseStatusName ?? statusText}
            </span>
          )}
          {p.coverUrl ? (
            <img className="project-lobby-card__image" src={p.coverUrl} alt="" />
          ) : (
            <div className="project-lobby-card__placeholder" aria-hidden="true">
              <ImageIcon size={28} strokeWidth={1.6} />
              <span>{l('暂无图片', 'No image')}</span>
            </div>
          )}
          <div
            className="project-lobby-card__info-panel"
            role="tooltip"
            aria-hidden={visibleInfoProjectId !== p.id}
          >
            <div>{l('创建人：', 'Created by: ')}{p.creatorName ?? '--'}</div>
            <div>{l('创建时间：', 'Created at: ')}{formatProjectDate(p.createdAt)}</div>
          </div>
        </div>

        <div className="project-lobby-card__body">
          <div className="project-lobby-card__title-row">
            <div className="project-lobby-card__title" title={projectTitle}>{projectTitle}</div>
          </div>
          <div className="project-lobby-card__quick-actions" onClick={(event) => event.stopPropagation()}>
            <Button
              type="text"
              size="small"
              className="project-lobby-card__info-button"
              icon={<Info size={16} strokeWidth={1.75} />}
              aria-label={isCanvasView ? l('画布详情', 'Canvas details') : l('项目详情', 'Project details')}
              aria-expanded={visibleInfoProjectId === p.id}
              onMouseEnter={() => setVisibleInfoProjectId(p.id)}
              onMouseLeave={() => setVisibleInfoProjectId(null)}
              onFocus={() => setVisibleInfoProjectId(p.id)}
              onBlur={() => setVisibleInfoProjectId(null)}
            />
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              overlayClassName="project-lobby-card-menu"
              open={openProjectMenuId === p.id}
              onOpenChange={(open) => {
                if (suppressProjectMenuOpenRef.current) {
                  if (open) setOpenProjectMenuId(null)
                  return
                }
                setOpenProjectMenuId(open ? p.id : null)
              }}
              menu={{
                items: [
                  { key: 'rename', icon: <EditOutlined />, label: l('重命名', 'Rename') },
                  {
                    key: 'delete',
                    icon: <Trash2 size={15} strokeWidth={1.75} />,
                    label: isCanvasView ? l('删除画布', 'Delete canvas') : l('删除项目', 'Delete project'),
                    danger: true,
                  },
                ],
                onClick: ({ key }) => {
                  suppressProjectMenuOpenRef.current = true
                  setOpenProjectMenuId(null)
                  window.setTimeout(() => { suppressProjectMenuOpenRef.current = false }, 200)
                  if (key === 'rename') {
                    window.setTimeout(() => {
                      setOpenProjectMenuId(null)
                      handleOpenRename(p)
                    }, 0)
                    return
                  }
                  window.setTimeout(() => {
                    setOpenProjectMenuId(null)
                    Modal.confirm({
                      rootClassName: 'project-lobby-delete-confirm-root',
                      className: 'project-lobby-delete-confirm',
                      centered: true,
                      icon: null,
                      title: isCanvasView
                        ? l('删除这个画布？', 'Delete this canvas?')
                        : l('确定删除该项目？', 'Delete this project?'),
                      content: isCanvasView
                        ? l('画布及其本地保存的数据将被永久删除，此操作无法撤销。', 'The canvas and its locally saved data will be permanently deleted. This cannot be undone.')
                        : l('删除后无法恢复，相关章节与素材将不再关联。', 'This cannot be undone. Related chapters and assets will no longer be linked.'),
                      okText: l('删除', 'Delete'),
                      cancelText: l('取消', 'Cancel'),
                      okButtonProps: {
                        danger: true,
                        className: 'project-lobby-delete-confirm__delete-button',
                      },
                      cancelButtonProps: { className: 'project-lobby-delete-confirm__cancel-button' },
                      onOk: () => handleDelete(p.id),
                    })
                  }, 0)
                },
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<MoreHorizontal size={17} strokeWidth={1.75} />}
                aria-label={l('更多操作', 'More actions')}
                onClick={(event) => event.stopPropagation()}
              />
            </Dropdown>
          </div>
          {isCanvasView ? (
            <div className="project-lobby-card__meta project-lobby-card__meta--canvas">
              <span>{l('更新于', 'Updated')} {formatProjectDate(p.updatedAt)}</span>
            </div>
          ) : (
            <div className="project-lobby-card__meta">
              <span>{l(`${formatChineseCount(wordCount)}字`, `${wordCount.toLocaleString()} words`)}</span>
              <span>{l(`${episodeCount}集`, `${episodeCount} episodes`)}</span>
              {p.defaultVideoRatio && <span>{p.defaultVideoRatio}</span>}
            </div>
          )}
        </div>
      </article>
    )
  }

  return (
    <div
      className="project-lobby"
      style={{
        '--project-primary': token.colorPrimary,
        '--project-primary-hover': token.colorPrimaryHover,
        '--project-primary-bg': token.colorPrimaryBg,
      } as React.CSSProperties}
    >
      <header className="project-lobby__topbar">
        <div className="project-lobby__content-header">
          <h1>{workspaceView === 'canvas' ? l('我的画布', 'My canvases') : l('我的项目', 'My projects')}</h1>
          <span>{l(`共 ${visibleTotalProjects} 个`, `${visibleTotalProjects} total`)}</span>
        </div>
        <div className="project-lobby__top-actions">
          <div className={`project-lobby__search-control${searchOpen ? ' is-expanded' : ''}`}>
            <Input
              ref={searchInputRef}
              allowClear={searchOpen}
              value={search}
              placeholder={searchOpen
                ? workspaceView === 'canvas'
                  ? l('搜索画布名称', 'Search canvas name')
                  : l('搜索作品名称', 'Search project name')
                : undefined}
              className="project-lobby__search"
              tabIndex={searchOpen ? 0 : -1}
              suffix={(
                <button
                  type="button"
                  className="project-lobby__search-suffix"
                  aria-label={searchOpen ? l('收起搜索', 'Collapse search') : l('搜索项目', 'Search projects')}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!searchOpen) {
                      setSearchOpen(true)
                      window.requestAnimationFrame(() => searchInputRef.current?.focus({ cursor: 'end' }))
                      return
                    }
                    if (!search) {
                      searchInputRef.current?.blur()
                      setSearchOpen(false)
                    }
                  }}
                >
                  <Search size={17} strokeWidth={1.75} />
                </button>
              )}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              onBlur={() => {
                if (!search) setSearchOpen(false)
              }}
            />
          </div>
          <Button icon={<FileText size={16} strokeWidth={1.75} />} onClick={() => navigate('/prompts')}>{l('Prompt 定制', 'Prompt templates')}</Button>
          <Button icon={<FolderOpen size={16} strokeWidth={1.75} />} onClick={() => navigate('/assets')}>{l('资产中心', 'Asset center')}</Button>
          {/* <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            {l('新建项目', 'New project')}
          </Button> */}
        </div>
      </header>

      <main className="project-lobby__canvas">
        {loading ? (
          <div className="project-lobby__loading"><Spin /></div>
        ) : (
          <>
            <div className="project-lobby__content">
              <div className="project-lobby__grid">
                <button type="button" className="project-lobby-create" onClick={handleOpenCreate}>
                  <span className="project-lobby-create__icon" aria-hidden="true">
                    <Sparkles size={24} strokeWidth={1.6} />
                  </span>
                  <span>{workspaceView === 'canvas' ? l('新建画布', 'Create canvas') : l('点击创作', 'Create project')}</span>
                </button>
                {filteredSorted.map(renderCard)}
              </div>
            </div>
             {visibleTotalProjects > 0 && (
               <div className={`project-lobby__pagination${visibleTotalProjects <= activePageSize ? ' is-single-page' : ''}`}>
                <Pagination
                  current={page}
                  pageSize={activePageSize}
                   total={visibleTotalProjects}
                  showSizeChanger={false}
                  size="small"
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </main>

      <Modal
         title={workspaceView === 'canvas' ? l('重命名画布', 'Rename canvas') : l('重命名', 'Rename')}
        open={renameModalOpen}
        onCancel={() => { setRenameModalOpen(false); setRenamingProject(null) }}
        footer={null}
        width={560}
        className="project-rename-modal"
      >
        <Form
          form={renameForm}
          layout="vertical"
          requiredMark={false}
          onFinish={handleRenameSubmit}
        >
          <Form.Item label={l('创建人', 'Created by')}>
            <Input value={renamingProject?.creatorName ?? '--'} disabled />
          </Form.Item>
          <Form.Item
            name="name"
             label={workspaceView === 'canvas' ? l('画布名称', 'Canvas name') : l('作品名称', 'Project name')}
             rules={[
               {
                 required: true,
                 whitespace: true,
                 message: workspaceView === 'canvas' ? l('请输入画布名称', 'Enter a canvas name') : l('请输入作品名称', 'Enter a project name'),
               },
               {
                 max: 100,
                 message: workspaceView === 'canvas'
                   ? l('画布名称不能超过 100 个字符', 'Canvas name cannot exceed 100 characters')
                   : l('作品名称不能超过 100 个字符', 'Project name cannot exceed 100 characters'),
               },
             ]}
           >
             <Input
               maxLength={100}
               showCount
               placeholder={workspaceView === 'canvas' ? l('请输入画布名称', 'Enter a canvas name') : l('请输入作品名称', 'Enter a project name')}
             />
          </Form.Item>
          <div className="project-rename-modal__actions">
            <Button onClick={() => { setRenameModalOpen(false); setRenamingProject(null) }}>{l('取消', 'Cancel')}</Button>
            <Button type="primary" htmlType="submit">{l('确定', 'Confirm')}</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default ProjectLobby
