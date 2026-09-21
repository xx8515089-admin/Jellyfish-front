import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import { useEffect, useState } from 'react'
import { Alert, Button, Empty, Input, Modal, Pagination, Segmented, Spin, Tag } from 'antd'
import { StudioCanvases, type CanvasModel } from '../../../../services/studioCanvases'
import './CanvasModelSettings.css'

export default function CanvasModelSettings({ onClose, onRefresh, theme }: {
  onClose: () => void; onRefresh: () => Promise<void>; theme: string
}) {
  useUiLanguage()

  const [catalog, setCatalog] = useState<CanvasModel[]>([])
  const [supplierId, setSupplierId] = useState<number>()
  const [type, setType] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setRefreshing(true); setError('')
    Promise.all([StudioCanvases.models({ includeUnavailable: true }), onRefresh()]).then(([items]) => {
      if (active) { setCatalog(items); setSupplierId(previous => items.some(item => item.supplierId === previous) ? previous : items[0]?.supplierId); setPage(1) }
    }).catch(reason => { if (active) setError(reason.message || '模型加载失败') })
      .finally(() => { if (active) setRefreshing(false) })
    return () => { active = false }
  }, [revision, onRefresh])
  const suppliers = Array.from(new Map(catalog.map(model => [model.supplierId, { id: model.supplierId, name: model.supplierName, active: true }])).values())
  const supplier = suppliers.find(item => item.id === supplierId)
  const matches = catalog.filter(model => model.supplierId === supplierId && (!type || model.operation === (type === 2 ? 'imageGenerate' : 'videoGenerate')))
  const total = matches.length
  const models = matches.slice((page - 1) * 12, page * 12)
  const loading = refreshing
  const listError = ''
  return <Modal open onCancel={onClose} title={uiText("接口与模型")} footer={null} width={980} centered className={`canvas-model-settings ${theme === 'dark' ? 'is-dark' : ''}`}>
    <div className="canvas-model-toolbar"><span>{uiText("画布模型目录 · 仅展示当前账号可查询的能力")}</span><div><Button loading={refreshing} onClick={() => setRevision(value => value + 1)}>{uiText("刷新配置")}</Button></div></div>
    {error && <Alert type="error" showIcon message={error} />}
    <div className="canvas-model-layout">
      <nav aria-label={uiText("供应商")}><Input placeholder={uiText("搜索供应商")} aria-label={uiText("搜索供应商")} allowClear value={keyword} onChange={event => setKeyword(event.target.value)} />
        <div className="canvas-model-suppliers">{suppliers.filter(item => item.name.toLowerCase().includes(keyword.toLowerCase())).map(item => <button key={item.id} aria-pressed={supplierId === item.id} className={supplierId === item.id ? 'selected' : ''} onClick={() => { setSupplierId(item.id); setPage(1) }}><strong>{item.name}</strong><small>{item.active ? uiText("已启用") : uiText("已停用")}</small></button>)}{!refreshing && !suppliers.length && !error && <Empty description={uiText("暂无供应商")} image={Empty.PRESENTED_IMAGE_SIMPLE} />}</div>
      </nav>
      <section className="canvas-model-main"><div className="canvas-model-heading"><div><h3>{supplier?.name || uiText("请选择供应商")}</h3><p>{uiText("不可用模型会展示原因，实际参数与费用在生成前校验。")}</p></div>{supplier && <Tag color={supplier.active ? 'green' : 'default'}>{supplier.active ? uiText("已启用") : uiText("已停用")}</Tag>}</div>
        <Segmented className="canvas-model-filter" value={type || 0} options={[{label:uiText("全部"),value:0},{label:uiText("图片"),value:2},{label:uiText("视频"),value:3}]} onChange={value => { setType(value ? Number(value) : 0); setPage(1) }} />
        {listError && <Alert type="error" showIcon message={listError} />}
        <div className="canvas-model-list">{loading ? <Spin /> : models.length ? models.map(model => <article key={`${model.modelId}:${model.operation}`}><div className="canvas-model-card-title"><strong>{model.name}</strong><Tag>{model.operation === 'imageGenerate' ? uiText("图片") : uiText("视频")}</Tag><Tag color={model.available ? 'green' : 'orange'}>{model.available ? uiText("可用") : uiText("暂不可用")}</Tag></div><code className="canvas-model-code">{model.modelCode}</code>{!model.available && <p>{model.unavailableReason || uiText("画布暂不支持此模型")}</p>}<div className="canvas-model-capabilities"><span>{uiText("比例：")}{model.parameters.ratios?.join(' / ') || uiText("默认")}</span><span>{uiText("分辨率：")}{model.parameters.resolutions?.join(' / ') || uiText("默认")}</span><span>{uiText("参考图：")}{model.parameters.minReferenceImages ?? 0}–{model.parameters.maxReferenceImages ?? 0} {uiText("张")}</span>{model.operation === 'videoGenerate' && <span>{uiText("时长：")}{model.parameters.minDurationSeconds ?? '—'}–{model.parameters.maxDurationSeconds ?? '—'} {uiText("秒")}</span>}<span>{model.supportsResultRecovery ? uiText("支持结果补拉") : uiText("不支持结果补拉")}</span></div></article>) : !listError && <Empty description={uiText("暂无模型")} image={Empty.PRESENTED_IMAGE_SIMPLE} />}</div>
        <Pagination size="small" current={page} pageSize={12} total={total} showSizeChanger={false} onChange={setPage} />
        <p className="canvas-model-note">{uiText("画布图片与视频节点使用已启用的对应模型。供应商密钥由服务端管理。")}</p>
      </section>
    </div>
  </Modal>
}
