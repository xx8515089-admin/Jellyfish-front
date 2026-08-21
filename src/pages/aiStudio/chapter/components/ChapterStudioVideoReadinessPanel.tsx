import { Spin, Tag, Tooltip } from 'antd'
import { useBilingualText } from '../../../../i18n/useBilingualText'
import { VideoCameraAddOutlined } from '@ant-design/icons'
import type { ShotRead, ShotVideoReadinessRead } from '../../../../services/generated'

type ChapterStudioVideoReadinessPanelProps = {
  selectedShot: ShotRead | null
  videoReadinessLoading: boolean
  videoReadiness: ShotVideoReadinessRead | null
  videoReferenceMode: string
}

export function ChapterStudioVideoReadinessPanel({
  selectedShot,
  videoReadinessLoading,
  videoReadiness,
  videoReferenceMode,
}: ChapterStudioVideoReadinessPanelProps) {
  const l = useBilingualText()
  return (
    <div className="cs-group">
      <div className="cs-group-title">
        <VideoCameraAddOutlined /> {l('视频准备度', 'Video readiness')}
      </div>
      <div className="cs-hint">{l('这里优先回答当前镜头能不能生成视频，以及还差哪些前置条件。', 'This panel shows whether the current shot can generate video and which prerequisites are missing.')}</div>
      {videoReadinessLoading ? (
        <div className="py-6 text-center">
          <Spin />
        </div>
      ) : !selectedShot ? (
        <div className="text-xs text-gray-400">{l('请先选择一个分镜。', 'Select a storyboard first.')}</div>
      ) : !videoReadiness ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          {l('暂时无法获取当前镜头的视频准备度，请稍后重试。', 'Video readiness is temporarily unavailable. Try again later.')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">
                {videoReadiness.ready ? l('当前镜头已满足视频生成条件', 'This shot is ready for video generation') : l('当前镜头还不能直接生成视频', 'This shot is not ready for video generation')}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {l('当前按 ', 'Readiness is checked using ')}<Tag className="!mx-1">{videoReferenceMode}</Tag>{l(' 参考模式检查视频生成条件。', ' reference mode.')}
              </div>
            </div>
            <Tag color={videoReadiness.ready ? 'green' : 'gold'}>
              {videoReadiness.ready ? l('可生成', 'Ready') : l('待补齐', 'Incomplete')}
            </Tag>
          </div>

          <div className="flex flex-wrap gap-2">
            {(videoReadiness.checks ?? []).map((check) => (
              <Tooltip key={check.key} title={check.message}>
                <Tag color={check.ok ? 'green' : 'default'}>
                  {check.ok ? l('通过', 'Passed') : l('未通过', 'Failed')} · {check.key}
                </Tag>
              </Tooltip>
            ))}
          </div>

          {(videoReadiness.checks ?? []).some((check) => !check.ok) ? (
            <div className="space-y-1">
              {(videoReadiness.checks ?? []).filter((check) => !check.ok).map((check) => (
                <div key={check.key} className="text-xs text-gray-600">
                  • {check.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
