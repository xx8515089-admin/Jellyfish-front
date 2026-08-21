import React, { useEffect, useState } from 'react'
import { Card, Button, Tabs, Space, Dropdown, Empty } from 'antd'
import type { MenuProps } from 'antd'
import {
  PlusOutlined,
  EllipsisOutlined,
  ArrowLeftOutlined,
  VideoCameraFilled,
} from '@ant-design/icons'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { TAB_CONFIG, type TabKey, isTabKey, DEFAULT_TAB } from './constants'
import { DashboardTab } from './tabs/DashboardTab'
import { ChaptersTab } from './tabs/ChaptersTab'
import { ActorsTab } from './tabs/ActorsTab'
import { RolesTab } from './tabs/RolesTab'
import { ScenesTab } from './tabs/ScenesTab'
import { CostumesTab, PropsTab } from './tabs/PropsTab'
import { FilesTab } from './tabs/FilesTab'
import { EditTab } from './tabs/EditTab'
import { SettingsTab } from './tabs/SettingsTab'
import { getChapterShotsPath, getChapterStudioPath, getProjectEditorPath } from './routes'
import { useProject, useChapters } from './hooks/useProjectData'
import { ensureHasShotsBeforeShooting } from './ensureHasShotsBeforeShooting'
import { getChapterPreparationState } from './chapterPreparation'
import { useBilingualText } from '../../../../i18n/useBilingualText'

const TAB_PARAM = 'tab'
const CREATE_PARAM = 'create'
const EDIT_PARAM = 'edit'

const ProjectWorkbench: React.FC = () => {
  const l = useBilingualText()
  const tabLabel = (key: TabKey) => ({ dashboard: l('仪表盘', 'Dashboard'), chapters: l('章节', 'Chapters'), actors: l('演员', 'Actors'), roles: l('角色', 'Characters'), scenes: l('场景', 'Scenes'), props: l('道具', 'Props'), costumes: l('服装', 'Costumes'), files: l('文件', 'Files'), edit: l('剪辑', 'Editing'), settings: l('设置', 'Settings') })[key]
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get(TAB_PARAM)
  const resolvedTab: TabKey =
    tabFromUrl !== null && isTabKey(tabFromUrl) ? tabFromUrl : DEFAULT_TAB

  const { project, loading: projectLoading } = useProject(projectId)
  const { chapters } = useChapters(projectId)
  const [activeTab, setActiveTab] = useState<TabKey>(() => resolvedTab)

  const chaptersByIndex = [...chapters].sort((a, b) => a.index - b.index)

  const recommendedChapter = (() => {
    const findByState = (key: ReturnType<typeof getChapterPreparationState>['key']) =>
      chaptersByIndex.find((chapter) => getChapterPreparationState(chapter).key === key)
    return (
      findByState('edit_raw') ??
      findByState('extract_shots') ??
      findByState('prepare_shots') ??
      findByState('shoot') ??
      chaptersByIndex[0] ??
      null
    )
  })()

  const primaryCta = (() => {
    if (!projectId) {
      return {
        label: l('创建第一章', 'Create the first chapter'),
        hint: l('先创建章节，再进入分镜准备流程', 'Create a chapter before starting shot preparation'),
        icon: <PlusOutlined />,
        onClick: () => {},
      }
    }
    if (!recommendedChapter) {
      return {
        label: l('创建第一章', 'Create the first chapter'),
        hint: l('先创建章节，再进入分镜准备流程', 'Create a chapter before starting shot preparation'),
        icon: <PlusOutlined />,
        onClick: () => {
          setTabInUrl('chapters')
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set(CREATE_PARAM, '1')
              return next
            },
            { replace: true }
          )
        },
      }
    }
    const state = getChapterPreparationState(recommendedChapter)
    const chapterLabel = l(`第${recommendedChapter.index}章`, `Chapter ${recommendedChapter.index}`)
    if (state.key === 'edit_raw') {
      return {
        label: l(`编辑${chapterLabel}原文`, `Edit source text for ${chapterLabel}`),
        hint: l(`${chapterLabel}还没有原文内容，建议先补章节原文`, `${chapterLabel} has no source text. Add it first.`),
        icon: state.primaryIcon,
        onClick: () => {
          setTabInUrl('chapters')
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set(TAB_PARAM, 'chapters')
              next.set(EDIT_PARAM, recommendedChapter.id)
              return next
            },
            { replace: true }
          )
        },
      }
    }
    if (state.key === 'extract_shots') {
      return {
        label: l(`提取${chapterLabel}分镜`, `Extract shots for ${chapterLabel}`),
        hint: l(`${chapterLabel}已有原文，下一步更适合先提取分镜`, `${chapterLabel} has source text. Extract shots next.`),
        icon: state.primaryIcon,
        onClick: () => navigate(getChapterShotsPath(projectId, recommendedChapter.id)),
      }
    }
    if (state.key === 'prepare_shots') {
      return {
        label: l(`进入${chapterLabel}分镜工作室`, `Open shot studio for ${chapterLabel}`),
        hint: l(`${chapterLabel}已有分镜，建议继续补齐镜头准备`, `${chapterLabel} has shots. Continue shot preparation.`),
        icon: state.primaryIcon,
        onClick: () => navigate(getChapterStudioPath(projectId, recommendedChapter.id)),
      }
    }
    return {
      label: l(`进入${chapterLabel}拍摄`, `Start production for ${chapterLabel}`),
      hint: l(`${chapterLabel}已具备分镜，可继续进入拍摄流程`, `${chapterLabel} has shots and can proceed to production.`),
      icon: state.primaryIcon,
      onClick: () =>
        ensureHasShotsBeforeShooting({
          projectId,
          chapterId: recommendedChapter.id,
          storyboardCount: recommendedChapter.storyboardCount,
          navigate,
        }),
    }
  })()

  // 与 URL 中的 tab 同步：URL 变化时更新 activeTab；初次或无效 tab 时写回 URL
  useEffect(() => {
    if (tabFromUrl !== null && isTabKey(tabFromUrl)) {
      setActiveTab(tabFromUrl)
    } else if (tabFromUrl === null || tabFromUrl === '') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(TAB_PARAM, DEFAULT_TAB)
          return next
        },
        { replace: true }
      )
    }
  }, [tabFromUrl, setSearchParams])

  const setTabInUrl = (tab: TabKey) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(TAB_PARAM, tab)
        return next
      },
      { replace: true }
    )
  }

  const moreMenuItems: MenuProps['items'] = [
    { key: 'newActor', label: l('关联演员', 'Link actor'), onClick: () => setTabInUrl('actors') },
    { key: 'newRole', label: l('新建角色', 'New character'), onClick: () => setTabInUrl('roles') },
    { key: 'upload', label: l('上传素材', 'Upload assets'), onClick: () => navigate('/assets') },
    { key: 'newScene', label: l('新建场景', 'New scene'), onClick: () => setTabInUrl('scenes') },
    { key: 'newProp', label: l('新建道具', 'New prop'), onClick: () => setTabInUrl('props') },
    { key: 'newCostume', label: l('新建服装', 'New costume'), onClick: () => setTabInUrl('costumes') },
  ]

  if (!project && !projectLoading) {
    return (
      <Card>
        <Empty description={l('项目不存在', 'Project not found')} />
        <Link to="/projects">
          <Button type="link" icon={<ArrowLeftOutlined />}>
            {l('返回项目列表', 'Back to projects')}
          </Button>
        </Link>
      </Card>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div
        className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm"
        style={{ margin: -5, marginBottom: 0, padding: '16px 24px' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setTabInUrl(k as TabKey)}
            size="middle"
            className="project-workbench-tabs flex-1 min-w-0"
            items={TAB_CONFIG.map(({ key, icon }) => ({
              key,
              label: (
                <span className="flex items-center gap-1.5">
                  {icon}
                  {tabLabel(key)}
                </span>
              ),
            }))}
          />
          <Space size="small" wrap className="shrink-0">
            <Button
              type="primary"
              icon={primaryCta.icon}
              onClick={primaryCta.onClick}
            >
              {primaryCta.label}
            </Button>
            <Button icon={<VideoCameraFilled />} onClick={() => projectId && navigate(getProjectEditorPath(projectId))}>
              {l('进入后期剪辑', 'Open post-production')}
            </Button>
            <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight">
              <Button icon={<EllipsisOutlined />}>{l('更多', 'More')}</Button>
            </Dropdown>
          </Space>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {primaryCta.hint}
        </div>
      </div>

      <div
        className="pt-4 animate-fadeIn flex-1 min-h-0 overflow-hidden"
        style={{ animation: 'fadeIn 0.25s ease-out' }}
      >
        {activeTab === 'dashboard' && <DashboardTab onSelectTab={setTabInUrl} />}

        {activeTab === 'chapters' && <ChaptersTab />}

        {activeTab === 'actors' && <ActorsTab />}
        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'scenes' && <ScenesTab />}
        {activeTab === 'props' && <PropsTab />}
        {activeTab === 'costumes' && <CostumesTab />}
        {activeTab === 'files' && <FilesTab />}
        {activeTab === 'edit' && <EditTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}

export default ProjectWorkbench
