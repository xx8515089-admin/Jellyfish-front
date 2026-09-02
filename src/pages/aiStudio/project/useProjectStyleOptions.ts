import type { ProjectStyleFieldOptions } from './ProjectVisualStyleAndStyleFields'

const FALLBACK_OPTIONS: ProjectStyleFieldOptions = {
  visualStyles: [
    { value: '现实', label: '现实' },
    { value: '动漫', label: '动漫' },
  ],
  stylesByVisual: {
    现实: [
      { value: '真人都市', label: '真人都市' },
      { value: '真人科幻', label: '真人科幻' },
      { value: '真人古装', label: '真人古装' },
    ],
    动漫: [
      { value: '动漫科幻', label: '动漫科幻' },
      { value: '动漫3D', label: '动漫3D' },
      { value: '国漫', label: '国漫' },
      { value: '水墨画', label: '水墨画' },
    ],
  },
  defaultStyleByVisual: {
    现实: '真人都市',
    动漫: '动漫3D',
  },
}

type OptionItem = { value: string; label: string }
const FALLBACK_DEFAULT_VIDEO_RATIO = '16:9'
const FALLBACK_VIDEO_RATIO_OPTIONS: OptionItem[] = [
  '9:16',
  '4:3',
  '16:9',
  '3:4',
  '1:1',
  '21:9',
].map((value) => ({ value, label: value }))
const FALLBACK_DEFAULT_VISUAL_STYLE = FALLBACK_OPTIONS.visualStyles[0]?.value ?? '现实'

function resolveDefaultStyle(options: ProjectStyleFieldOptions, visual: string): string {
  return (
    options.defaultStyleByVisual?.[visual] ??
    options.stylesByVisual?.[visual]?.[0]?.value ??
    ''
  )
}

const getFallbackDefaultStyle = (visual: string) => resolveDefaultStyle(FALLBACK_OPTIONS, visual)

/** 旧项目能力接口已下线，统一使用前端稳定配置，不再发起网络请求。 */
export function useProjectStyleOptions() {
  return {
    options: FALLBACK_OPTIONS,
    videoRatioOptions: FALLBACK_VIDEO_RATIO_OPTIONS,
    defaultVideoRatio: FALLBACK_DEFAULT_VIDEO_RATIO,
    defaultVisualStyle: FALLBACK_DEFAULT_VISUAL_STYLE,
    getDefaultStyle: getFallbackDefaultStyle,
  }
}
