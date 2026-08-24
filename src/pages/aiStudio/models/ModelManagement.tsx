import { Layout } from 'antd'
import ProvidersTab from './ProvidersTab'
import { useBilingualText } from '../../../i18n/useBilingualText'
import './ModelsTab.css'

export default function ModelManagement() {
  const l = useBilingualText()

  return (
    <Layout className="model-management h-full flex flex-col" style={{ minHeight: 0 }}>
      <div className="model-management__header flex-shrink-0 px-4 py-2 border-b border-gray-200 bg-white space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-gray-800">{l('模型管理', 'Model management')}</span>
        </div>
      </div>

      <div className="model-management__body flex-1 flex flex-col min-h-0 overflow-hidden">
        <ProvidersTab />
      </div>
    </Layout>
  )
}
