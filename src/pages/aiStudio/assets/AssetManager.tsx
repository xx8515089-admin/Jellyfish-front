import { useEffect, useState } from 'react'
import { Button, Card, Space, Tabs } from 'antd'
import { FileTextOutlined, LinkOutlined, ThunderboltOutlined, UploadOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { AssetLibraryTab } from './tabs/AssetLibraryTab'


import { CostumesTab } from './tabs/CostumesTab'
import { BatchAssetUploadModal } from './components/BatchAssetUploadModal'
import { AssetBibleImportModal } from './components/AssetBibleImportModal'
import { AssetImageBatchGenerationModal } from './components/AssetImageBatchGenerationModal'
import { AssetProjectLinkerModal } from './components/AssetProjectLinkerModal'
import { useBilingualText } from '../../../i18n/useBilingualText'

const TAB_PARAM = 'tab'
type AssetTabKey = 'actor' | 'scene' | 'prop' | 'costume'

function isValidTab(tab: string | null): tab is AssetTabKey {
  return tab === 'actor' || tab === 'scene' || tab === 'prop' || tab === 'costume'
}

const AssetManager = () => {
  const l = useBilingualText()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get(TAB_PARAM)

  const [activeTab, setActiveTab] = useState<AssetTabKey>(() => (isValidTab(tabFromUrl) ? tabFromUrl : 'actor'))
  const [bibleImportOpen, setBibleImportOpen] = useState(false)
  const [batchUploadOpen, setBatchUploadOpen] = useState(false)
  const [batchGenerationOpen, setBatchGenerationOpen] = useState(false)
  const [projectLinkerOpen, setProjectLinkerOpen] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (isValidTab(tabFromUrl)) {
      setActiveTab(tabFromUrl)
    } else if (tabFromUrl === null || tabFromUrl === '') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(TAB_PARAM, 'actor')
          return next
        },
        { replace: true },
      )
    }
  }, [tabFromUrl, setSearchParams])

  const setTabInUrl = (tab: AssetTabKey) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(TAB_PARAM, tab)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="space-y-4">
      <Card
        title={l('资产管理', 'Asset management')}
        extra={
          <Space>
            <Button type="primary" icon={<FileTextOutlined />} onClick={() => setBibleImportOpen(true)}>
              {l('批量导入资产清单', 'Import asset list')}
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => setBatchUploadOpen(true)}>
              {l('批量导入本地资产图片', 'Import local asset images')}
            </Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => setBatchGenerationOpen(true)}>
              {l('批量生成资产图', 'Generate asset images')}
            </Button>
            <Button icon={<LinkOutlined />} onClick={() => setProjectLinkerOpen(true)}>
              Link Assets to Project
            </Button>
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => {
            if (isValidTab(k)) setTabInUrl(k)
          }}
          items={[
            { key: 'actor', label: l('演员', 'Actors'), children: <AssetLibraryTab assetType={1} refreshToken={refreshTick} /> },
            { key: 'scene', label: l('场景', 'Scenes'), children: <AssetLibraryTab assetType={2} refreshToken={refreshTick} /> },
            { key: 'prop', label: l('道具', 'Props'), children: <AssetLibraryTab assetType={3} refreshToken={refreshTick} /> },
            { key: 'costume', label: l('服装', 'Costumes'), children: <CostumesTab refreshToken={refreshTick} /> },
          ]}
        />
      </Card>
      <AssetBibleImportModal
        open={bibleImportOpen}
        onCancel={() => setBibleImportOpen(false)}
        onImported={() => setRefreshTick((prev) => prev + 1)}
      />
      <BatchAssetUploadModal
        open={batchUploadOpen}
        defaultType={activeTab}
        onCancel={() => setBatchUploadOpen(false)}
        onImported={() => setRefreshTick((prev) => prev + 1)}
      />
      <AssetImageBatchGenerationModal
        open={batchGenerationOpen}
        onCancel={() => setBatchGenerationOpen(false)}
        onCreated={() => setRefreshTick((prev) => prev + 1)}
      />
      <AssetProjectLinkerModal open={projectLinkerOpen} onCancel={() => setProjectLinkerOpen(false)} />
    </div>
  )
}

export default AssetManager
