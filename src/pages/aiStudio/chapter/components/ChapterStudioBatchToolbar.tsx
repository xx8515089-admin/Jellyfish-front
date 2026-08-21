import { Button, Dropdown } from 'antd'
import { useBilingualText } from '../../../../i18n/useBilingualText'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'

type ChapterStudioBatchToolbarProps = {
  selectedCount: number
  batchVideoReadinessLoading: boolean
  generating: boolean
  maintenanceMenuItems: MenuProps['items']
  onBatchInspectVideoReadiness: () => void
  onBatchGenerate: () => void
}

export function ChapterStudioBatchToolbar({
  selectedCount,
  batchVideoReadinessLoading,
  generating,
  maintenanceMenuItems,
  onBatchInspectVideoReadiness,
  onBatchGenerate,
}: ChapterStudioBatchToolbarProps) {
  const l = useBilingualText()
  return (
    <div className="cs-group m-3 mt-0 mb-2">
      <div className="cs-group-title mb-1 flex items-center gap-2">
        <AppstoreOutlined /> {l('批量操作', 'Batch actions')}
      </div>
      <div className="mb-2 text-xs text-gray-500">
        {l(`正在批量处理 ${selectedCount} 条分镜，可继续按`, `Processing ${selectedCount} storyboards. Hold`)}{' '}
        <span className="font-medium text-gray-700">{l('Command/Ctrl + 点击', 'Command/Ctrl + Click')}</span>{' '}
        {l('调整选择', 'to adjust the selection')}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-600">{l(`已选 ${selectedCount} 项`, `${selectedCount} selected`)}</span>
        <Button
          size="small"
          icon={<VideoCameraOutlined />}
          loading={batchVideoReadinessLoading}
          disabled={batchVideoReadinessLoading}
          onClick={onBatchInspectVideoReadiness}
        >
          {l('批量视频准备度', 'Batch video readiness')}
        </Button>
        <Button
          size="small"
          icon={<ThunderboltOutlined />}
          loading={generating}
          onClick={onBatchGenerate}
        >
          {l('批量生成', 'Batch generate')}
        </Button>
        <Dropdown menu={{ items: maintenanceMenuItems }} trigger={['click']}>
          <Button size="small" icon={<SettingOutlined />}>
            {l('更多维护', 'More maintenance')}
          </Button>
        </Dropdown>
      </div>
    </div>
  )
}
