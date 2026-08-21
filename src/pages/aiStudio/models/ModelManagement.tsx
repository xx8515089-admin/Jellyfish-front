import { useState } from 'react'
import { Layout, Tabs } from 'antd'
import ProvidersTab from './ProvidersTab'
import ModelsTab from './ModelsTab'
import { useBilingualText } from '../../../i18n/useBilingualText'

export default function ModelManagement() {
  const l = useBilingualText()
  const [activeTab, setActiveTab] = useState<string>('providers')

  return (
    <Layout className="h-full flex flex-col" style={{ minHeight: 0 }}>
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-gray-800">{l('模型管理', 'Model management')}</span>
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          items={[
            { key: 'providers', label: l('供应商', 'Providers') },
            { key: 'models', label: l('模型', 'Models') },
          ]}
        />
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'models' && <ModelsTab />}
      </div>
    </Layout>
  )
}
