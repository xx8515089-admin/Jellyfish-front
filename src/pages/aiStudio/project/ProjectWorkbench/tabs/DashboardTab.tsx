import { Card, Button, Statistic, Row, Col, Progress, Space, Spin } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { TabKey } from '../constants'
import { getChapterShotsPath, getChapterStudioPath, getProjectChaptersPath, getProjectEditorPath } from '../routes'
import { useProject, useChapters } from '../hooks/useProjectData'
import { ensureHasShotsBeforeShooting } from '../ensureHasShotsBeforeShooting'
import { getChapterPreparationState } from '../chapterPreparation'
import {
  loadChapterFlowStats,
  loadProjectFlowStatsForChapters,
  type ChapterFlowStats,
  type ProjectFlowStats,
} from '../projectFlowStats'
import { useBilingualText } from '../../../../../i18n/useBilingualText'

export function DashboardTab({ onSelectTab }: { onSelectTab: (tab: TabKey) => void }) {
  const navigate = useNavigate()
  const l = useBilingualText()
  const { projectId } = useParams<{ projectId: string }>()
  const { project, loading: projectLoading } = useProject(projectId)
  const { chapters, loading: chaptersLoading } = useChapters(projectId)
  const [flowStats, setFlowStats] = useState<ProjectFlowStats>({
    totalShots: 0,
    pendingConfirmShots: 0,
    readyShots: 0,
    generatingShots: 0,
  })
  const [chapterFlowStats, setChapterFlowStats] = useState<ChapterFlowStats[]>([])
  const [flowStatsLoading, setFlowStatsLoading] = useState(false)

  const loading = projectLoading || chaptersLoading
  const chaptersByIndex = [...chapters].sort((a, b) => a.index - b.index)
  const incompleteChapters = chaptersByIndex.filter((c) => c.status !== 'done')
  const recommendedChapter =
    chaptersByIndex.find((chapter) => getChapterPreparationState(chapter).key === 'edit_raw') ??
    chaptersByIndex.find((chapter) => getChapterPreparationState(chapter).key === 'extract_shots') ??
    chaptersByIndex.find((chapter) => getChapterPreparationState(chapter).key === 'prepare_shots') ??
    chaptersByIndex.find((chapter) => getChapterPreparationState(chapter).key === 'shoot') ??
    chaptersByIndex[0] ??
    null

  useEffect(() => {
    let cancelled = false
    if (!projectId || !chapters.length) {
      setFlowStats({
        totalShots: 0,
        pendingConfirmShots: 0,
        readyShots: 0,
        generatingShots: 0,
      })
      setChapterFlowStats([])
      return () => {
        cancelled = true
      }
    }

    const run = async () => {
      setFlowStatsLoading(true)
      try {
        const [stats, chapterStats] = await Promise.all([
          loadProjectFlowStatsForChapters(chapters),
          loadChapterFlowStats(chapters),
        ])
        if (!cancelled) setFlowStats(stats)
        if (!cancelled) setChapterFlowStats(chapterStats)
      } catch {
        if (!cancelled) {
          setFlowStats({
            totalShots: 0,
            pendingConfirmShots: 0,
            readyShots: 0,
            generatingShots: 0,
          })
          setChapterFlowStats([])
        }
      } finally {
        if (!cancelled) setFlowStatsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [chapters, projectId])

  if (loading && !project) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spin size="large" tip={l('加载中…', 'Loading…')} />
      </div>
    )
  }
  if (!project) {
    return null
  }

  const incompleteCount = incompleteChapters.length
  const recommendedState = recommendedChapter ? getChapterPreparationState(recommendedChapter) : null
  const chaptersNeedingRawText = chaptersByIndex.filter((chapter) => getChapterPreparationState(chapter).key === 'edit_raw').length
  const chaptersNeedingShotExtract = chaptersByIndex.filter((chapter) => getChapterPreparationState(chapter).key === 'extract_shots').length
  const chaptersNeedingShotPrep = chaptersByIndex.filter((chapter) => getChapterPreparationState(chapter).key === 'prepare_shots').length
  const chaptersReadyForShoot = chaptersByIndex.filter((chapter) => getChapterPreparationState(chapter).key === 'shoot').length
  const topPendingChapter = [...chapterFlowStats].sort((a, b) => b.pendingConfirmShots - a.pendingConfirmShots)[0]
  const topGeneratingChapter = [...chapterFlowStats].sort((a, b) => b.generatingShots - a.generatingShots)[0]
  const topReadyChapter = [...chapterFlowStats].sort((a, b) => b.readyShots - a.readyShots)[0]

  const handleRecommendedAction = () => {
    if (!projectId) return
    if (!recommendedChapter || !recommendedState) {
      onSelectTab('chapters')
      return
    }
    if (recommendedState.key === 'edit_raw') {
      onSelectTab('chapters')
      navigate(`/projects/${projectId}?tab=chapters&edit=${recommendedChapter.id}`, { replace: false })
      return
    }
    if (recommendedState.key === 'extract_shots') {
      navigate(getChapterShotsPath(projectId, recommendedChapter.id))
      return
    }
    if (recommendedState.key === 'prepare_shots') {
      navigate(getChapterStudioPath(projectId, recommendedChapter.id))
      return
    }
    void ensureHasShotsBeforeShooting({
      projectId,
      chapterId: recommendedChapter.id,
      storyboardCount: recommendedChapter.storyboardCount,
      navigate,
    })
  }

  const chapterTodoCards = [
    {
      key: 'edit_raw',
      title: l('待补原文', 'Source text needed'),
      count: chaptersNeedingRawText,
      hint: l('这些章节还没进入分镜流程', 'These chapters have not entered the storyboard workflow yet'),
      icon: <ClockCircleOutlined />,
    },
    {
      key: 'extract_shots',
      title: l('待提取分镜', 'Storyboard extraction needed'),
      count: chaptersNeedingShotExtract,
      hint: l('已有原文，可直接进入分镜提取', 'Source text is ready for storyboard extraction'),
      icon: <ClockCircleOutlined />,
    },
    {
      key: 'prepare_shots',
      title: l('待准备镜头', 'Shot preparation needed'),
      count: chaptersNeedingShotPrep,
      hint: l('已有分镜，建议进入工作室继续处理', 'Storyboards are ready; continue in the studio'),
      icon: <ClockCircleOutlined />,
    },
    {
      key: 'shoot',
      title: l('可继续拍摄', 'Ready to shoot'),
      count: chaptersReadyForShoot,
      hint: l('这部分章节已具备继续拍摄条件', 'These chapters are ready to continue shooting'),
      icon: <CheckCircleOutlined />,
    },
  ] as const

  return (
    <div className="space-y-6">
      <Card size="small">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-medium">{l('当前推荐动作', 'Recommended action')}</div>
            <div className="text-xs text-gray-500">
              {recommendedChapter && recommendedState
                ? l(`第${recommendedChapter.index}章 · ${recommendedState.hint}`, `Chapter ${recommendedChapter.index} · ${recommendedState.hint}`)
                : l('暂无章节，可先创建第一章', 'No chapters yet. Create the first chapter to begin.')}
            </div>
          </div>
          <Space wrap>
            <Button onClick={() => onSelectTab('chapters')}>{l('进入章节管理', 'Manage chapters')}</Button>
            <Button onClick={() => projectId && navigate(getProjectEditorPath(projectId))}>{l('进入后期剪辑', 'Open post-production')}</Button>
            <Button
              type="primary"
              icon={recommendedState?.primaryIcon ?? <VideoCameraOutlined />}
              onClick={handleRecommendedAction}
            >
              {recommendedChapter && recommendedState ? recommendedState.primaryAction : l('创建第一章', 'Create first chapter')}
            </Button>
          </Space>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" className="h-full">
            <Statistic title={l('未完成章节', 'Incomplete chapters')} value={incompleteCount} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" className="h-full">
            <Statistic
              title={l('待确认分镜', 'Storyboards awaiting confirmation')}
              value={flowStats.pendingConfirmShots}
              suffix={flowStats.totalShots ? `/ ${flowStats.totalShots}` : undefined}
              loading={flowStatsLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" className="h-full">
            <Statistic
              title={l('已就绪分镜', 'Ready storyboards')}
              value={flowStats.readyShots}
              loading={flowStatsLoading}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" className="h-full">
            <Statistic
              title={l('生成中分镜', 'Generating storyboards')}
              value={flowStats.generatingShots}
              loading={flowStatsLoading}
              prefix={<ClockCircleOutlined />}
            />
            <Progress
              percent={flowStats.totalShots ? Math.round((flowStats.readyShots / flowStats.totalShots) * 100) : project.progress}
              showInfo={false}
              size="small"
              strokeColor={{ from: '#6366f1', to: '#a855f7' }}
              className="mt-1"
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={l('当前待办', 'Current tasks')}
        size="small"
        extra={
          <Button type="link" onClick={() => projectId && navigate(getProjectChaptersPath(projectId))}>
            {l('查看全部', 'View all')}
          </Button>
        }
      >
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 140 }}>
          {chapters.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 py-8">
              {l('还没有任何章节，', 'No chapters yet. ')}
              <Button type="link" className="p-0" onClick={() => onSelectTab('chapters')}>
                {l('立即创建第一章', 'Create the first chapter')}
              </Button>
            </div>
          ) : (
            chapterTodoCards.map((item) => (
              <Card
                key={item.key}
                size="small"
                hoverable
                className="shrink-0 cursor-pointer"
                style={{ width: 280 }}
                onClick={() => onSelectTab('chapters')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium truncate">{item.title}</div>
                  <span className="text-gray-400">{item.icon}</span>
                </div>
                <div className="mt-1 text-2xl font-semibold">{item.count}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {item.hint}
                </div>
              </Card>
            ))
          )}
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={14}>
          <Card title={l('动态摘要', 'Activity summary')} size="small">
            <div className="space-y-3 text-sm">
              <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="flex items-center gap-2 font-medium text-amber-800">
                  <ClockCircleOutlined />
                  {l('待确认压力最大', 'Largest confirmation backlog')}
                </div>
                <div className="mt-1 text-gray-700">
                  {topPendingChapter && topPendingChapter.pendingConfirmShots > 0
                    ? l(`第${topPendingChapter.chapterIndex ?? '-'}章还有 ${topPendingChapter.pendingConfirmShots} 条分镜待确认，建议优先处理。`, `Chapter ${topPendingChapter.chapterIndex ?? '-'} has ${topPendingChapter.pendingConfirmShots} storyboards awaiting confirmation. Prioritize this chapter.`)
                    : l('当前没有待确认分镜积压。', 'There is no confirmation backlog.')}
                </div>
              </div>

              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                <div className="flex items-center gap-2 font-medium text-blue-800">
                  <VideoCameraOutlined />
                  {l('当前生成最活跃', 'Most active generation')}
                </div>
                <div className="mt-1 text-gray-700">
                  {topGeneratingChapter && topGeneratingChapter.generatingShots > 0
                    ? l(`第${topGeneratingChapter.chapterIndex ?? '-'}章有 ${topGeneratingChapter.generatingShots} 条分镜正在生成，可以继续关注结果。`, `Chapter ${topGeneratingChapter.chapterIndex ?? '-'} has ${topGeneratingChapter.generatingShots} storyboards generating. Keep an eye on the results.`)
                    : l('当前没有分镜处于生成中。', 'No storyboards are currently generating.')}
                </div>
              </div>

              <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="flex items-center gap-2 font-medium text-emerald-800">
                  <CheckCircleOutlined />
                  {l('最适合继续推进', 'Best chapter to advance')}
                </div>
                <div className="mt-1 text-gray-700">
                  {topReadyChapter && topReadyChapter.readyShots > 0
                    ? l(`第${topReadyChapter.chapterIndex ?? '-'}章已有 ${topReadyChapter.readyShots} 条已就绪分镜，适合继续推进视频生成。`, `Chapter ${topReadyChapter.chapterIndex ?? '-'} has ${topReadyChapter.readyShots} ready storyboards and is a good candidate for video generation.`)
                    : l('当前还没有明显可继续推进的视频生成批次。', 'No video generation batch is clearly ready to advance yet.')}
                </div>
              </div>
            </div>
            <Button
              type="link"
              className="p-0 mt-3"
              icon={<FileSearchOutlined />}
              onClick={() => onSelectTab('chapters')}
            >
              {l('去章节里继续推进', 'Continue in chapters')}
            </Button>
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title={l('资产健康快照', 'Asset health snapshot')} size="small">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{l('角色', 'Characters')}</span>
                <span className="text-gray-500">{l(`${project.stats.roles} 项`, `${project.stats.roles} items`)}</span>
              </div>
              <Progress percent={80} size="small" showInfo={false} />
              <div className="flex justify-between text-sm">
                <span>{l('场景', 'Scenes')}</span>
                <span className="text-gray-500">{l(`${project.stats.scenes} 项`, `${project.stats.scenes} items`)}</span>
              </div>
              <Progress percent={60} size="small" showInfo={false} />
              <div className="flex justify-between text-sm">
                <span>{l('道具', 'Props')}</span>
                <span className="text-gray-500">{l(`${project.stats.props} 项`, `${project.stats.props} items`)}</span>
              </div>
              <Progress percent={75} size="small" showInfo={false} />
            </div>
            <Button type="link" className="p-0 mt-2" onClick={() => navigate('/assets')}>
              {l('管理资产', 'Manage assets')}
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
