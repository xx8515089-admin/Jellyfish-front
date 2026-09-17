import { useId, useState, type CSSProperties } from 'react'
import { ConfigProvider, Select, theme as antdTheme } from 'antd'
import type { CanvasTextModel, CanvasTextOperation } from '../../../../services/studioCanvasV3Types'
import './CanvasTextModelSelect.css'

const palettes = {
  light: { input: '#f0f3f8', panel: '#ffffff', border: '#dce2ec', text: '#273248', muted: '#69788e', accent: '#375f9f', selected: '#e2ebfb' },
  dark: { input: '#262d38', panel: '#1e232c', border: '#384252', text: '#e0e6f0', muted: '#a0acc0', accent: '#b2ccfa', selected: '#2c4062' },
  solarized: { input: '#f5efdf', panel: '#fffaf0', border: '#ddd3b9', text: '#586e75', muted: '#7c898c', accent: '#397781', selected: '#e7eee7' },
}

type Props = {
  value?: number | string
  onChange: (modelId: number) => void
  models: CanvasTextModel[]
  ready?: boolean
  operation?: CanvasTextOperation
  onRefresh?: () => Promise<void>
  theme?: string
}

export default function CanvasTextModelSelect({ value, onChange, models, ready = true, operation, onRefresh, theme = 'light' }: Props) {
  const id = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const palette = theme === 'dark' ? palettes.dark : theme === 'solarized' ? palettes.solarized : palettes.light
  const available = models.filter(model => {
    const operations = model.supportedOperations || model.operations || (model.operation ? [model.operation] : null)
    return model.available !== false && (!operation || !operations || operations.includes(operation))
  })
  const selected = value == null ? '' : String(value).replace(/^studio-/, '')
  const options = available.map(model => ({
    value: String(model.modelId),
    label: `${model.supplierName ? model.supplierName + ' / ' : ''}${model.name}${model.defaultModel ? '（默认）' : ''}`,
    disabled: false,
  }))
  if (selected && !options.some(option => option.value === selected)) {
    options.unshift({ value: selected, label: '原模型不可用，请重新选择', disabled: true })
  }
  return <div className="description-node__field canvas-text-model-field"
    style={{ '--dn-field': palette.input, '--dn-border': palette.border, '--dn-text': palette.text, '--dn-muted': palette.muted, '--dn-accent': palette.accent } as CSSProperties}
    onMouseDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()}
    onWheel={event => event.stopPropagation()}>
    <label htmlFor={id}>云端文本模型</label>
    <ConfigProvider theme={{
      algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorBgContainer: palette.input, colorBgElevated: palette.panel, colorBorder: palette.border,
        colorText: palette.text, colorTextPlaceholder: palette.muted, colorTextDescription: palette.muted,
        colorPrimary: palette.accent, borderRadius: 7, fontSize: 11, controlHeight: 34,
      },
      components: { Select: {
        selectorBg: palette.input, optionSelectedBg: palette.selected, optionSelectedColor: palette.accent,
        optionActiveBg: palette.input, optionFontSize: 11, optionHeight: 32, optionPadding: '7px 10px',
        hoverBorderColor: '#7598d0', activeBorderColor: '#7598d0', activeOutlineColor: '#7598d022',
      } },
    }}>
      <Select<string>
        id={id}
        aria-label="文本模型"
        className="canvas-text-model-select"
        classNames={{ popup: { root: `canvas-text-model-popup canvas-text-model-popup--${theme}` } }}
        styles={{ popup: { root: { border: `1px solid ${palette.border}`, scrollbarColor: `${palette.border} transparent`, colorScheme: theme === 'dark' ? 'dark' : 'light' } } }}
        value={selected || undefined}
        options={options}
        placeholder={!ready ? '服务端未开放文本任务' : available.length ? '选择文本模型' : '暂无可用文本模型'}
        disabled={!ready || loading || !available.length}
        loading={loading}
        showSearch
        optionFilterProp="label"
        notFoundContent="没有匹配的模型"
        listHeight={256}
        getPopupContainer={() => document.body}
        onChange={modelId => onChange(Number(modelId))}
      />
    </ConfigProvider>
    {onRefresh && <button type="button" disabled={loading || !ready} onClick={async () => { setLoading(true); setError(''); try { await onRefresh() } catch (reason) { setError(reason instanceof Error ? reason.message : '模型加载失败') } finally { setLoading(false) } }}>刷新模型</button>}
    {error && <p role="alert">{error}</p>}
    <p className="description-node__model-note">仅处理文字。执行前显示预留积分，结果在文本任务历史中预览和应用。</p>
  </div>
}
