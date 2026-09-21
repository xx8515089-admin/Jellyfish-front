import { uiText } from '../../../i18n/uiText'
import { Form } from 'antd'
import { useBilingualText } from '../../../i18n/useBilingualText'
import StudioSelect from './StudioSelect'

export type ProjectVisualStyleChoice = '现实' | '动漫'

export type OptionItem = { value: string; label: string }
export type ProjectStyleOptionsByVisual = Record<string, OptionItem[]>
export type ProjectStyleFieldOptions = {
  visualStyles: OptionItem[]
  stylesByVisual: ProjectStyleOptionsByVisual
  defaultStyleByVisual?: Record<string, string>
}

export const PROJECT_STYLE_OPTIONS_BY_VISUAL: ProjectStyleOptionsByVisual = {
  现实: [
    { value: '真人都市', get label() { return uiText("真人都市") } },
    { value: '真人科幻', get label() { return uiText("真人科幻") } },
    { value: '真人古装', get label() { return uiText("真人古装") } },
  ],
  动漫: [
    { value: '动漫科幻', get label() { return uiText("动漫科幻") } },
    { value: '动漫3D', get label() { return uiText("动漫3D") } },
    { value: '国漫', get label() { return uiText("国漫") } },
    { value: '水墨画', get label() { return uiText("水墨画") } },
  ],
}
const DEFAULT_VISUAL_STYLE_OPTIONS: OptionItem[] = [
  { value: '现实', get label() { return uiText("现实") } },
  { value: '动漫', get label() { return uiText("动漫") } },
]
const DEFAULT_STYLE_BY_VISUAL: Record<string, string> = {
  现实: PROJECT_STYLE_OPTIONS_BY_VISUAL['现实']?.[0]?.value ?? '',
  动漫: PROJECT_STYLE_OPTIONS_BY_VISUAL['动漫']?.[0]?.value ?? '',
}

type FormModeProps = {
  form: any
  disabled?: boolean
  options?: ProjectStyleFieldOptions
}

type ControlledModeProps = {
  visual_style: ProjectVisualStyleChoice
  style: string
  onChange: (next: { visual_style: ProjectVisualStyleChoice; style: string }) => void
  disabled?: boolean
  visualStyleLabel?: string
  styleLabel?: string
  options?: ProjectStyleFieldOptions
}

function resolveOptions(options?: ProjectStyleFieldOptions): ProjectStyleFieldOptions {
  return {
    visualStyles: options?.visualStyles?.length ? options.visualStyles : DEFAULT_VISUAL_STYLE_OPTIONS,
    stylesByVisual:
      options?.stylesByVisual && Object.keys(options.stylesByVisual).length
        ? options.stylesByVisual
        : PROJECT_STYLE_OPTIONS_BY_VISUAL,
    defaultStyleByVisual:
      options?.defaultStyleByVisual && Object.keys(options.defaultStyleByVisual).length
        ? options.defaultStyleByVisual
        : DEFAULT_STYLE_BY_VISUAL,
  }
}

function getDefaultStyle(visual: string, options: ProjectStyleFieldOptions): string {
  return (
    options.defaultStyleByVisual?.[visual] ??
    options.stylesByVisual[visual]?.[0]?.value ??
    ''
  )
}

export function ProjectVisualStyleAndStyleFields(props: FormModeProps | ControlledModeProps) {
  const l = useBilingualText()
  const englishStyleLabels: Record<string, string> = { '现实': 'Live action', '动漫': 'Animation', '真人都市': 'Live-action urban', '真人科幻': 'Live-action sci-fi', '真人古装': 'Live-action historical', '动漫科幻': 'Animated sci-fi', '动漫3D': '3D animation', '国漫': 'Chinese animation', '水墨画': 'Ink wash' }
  const localizeOptions = (items: OptionItem[]) => items.map((item) => ({ ...item, label: l(item.label, englishStyleLabels[item.value] ?? item.label) }))
  const disabled = props.disabled
  const resolvedOptions = resolveOptions(props.options)

  if ('form' in props) {
    const { form } = props

    return (
      <>
        <Form.Item name="visual_style" label={l('视觉风格', 'Visual style')} rules={[{ required: true }]}>
          <StudioSelect
            disabled={disabled}
            onChange={(v: string) => {
              const nextStyle = getDefaultStyle(v, resolvedOptions)
              form.setFieldValue('style', nextStyle)
            }}
            options={localizeOptions(resolvedOptions.visualStyles)}
          />
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prev, next) => prev.visual_style !== next.visual_style}>
          {({ getFieldValue }) => {
            const visual = (getFieldValue('visual_style') as string | undefined) ?? resolvedOptions.visualStyles[0]?.value ?? '现实'
            return (
              <Form.Item name="style" label={l('视频风格', 'Video style')} rules={[{ required: true }]}>
                <StudioSelect disabled={disabled} options={localizeOptions(resolvedOptions.stylesByVisual[visual] ?? [])} />
              </Form.Item>
            )
          }}
        </Form.Item>
      </>
    )
  }

  const { visual_style, style, onChange, visualStyleLabel, styleLabel } = props

  return (
    <div className="space-y-3">
      <div>
        <span className="text-gray-600 text-sm">{visualStyleLabel ?? l('视觉风格', 'Visual style')}</span>
        <StudioSelect
          className="mt-1 w-full"
          disabled={disabled}
          value={visual_style}
          onChange={(v) => {
            const nextVisual = v as ProjectVisualStyleChoice
            onChange({ visual_style: nextVisual, style: getDefaultStyle(nextVisual, resolvedOptions) })
          }}
          options={localizeOptions(resolvedOptions.visualStyles)}
        />
      </div>
      <div>
        <span className="text-gray-600 text-sm">{styleLabel ?? l('视频风格', 'Video style')}</span>
        <StudioSelect
          className="mt-1 w-full"
          disabled={disabled}
          value={style}
          onChange={(v) => onChange({ visual_style, style: String(v) })}
          options={localizeOptions(resolvedOptions.stylesByVisual[visual_style] ?? [])}
        />
      </div>
    </div>
  )
}
