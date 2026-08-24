import type { ModelCategoryKey } from '../../../services/generated/models/ModelCategoryKey'
import type { ProviderStatus } from '../../../services/generated/models/ProviderStatus'

export const MODEL_CATEGORIES: { key: ModelCategoryKey; label: string; color: string }[] = [
  { key: 'text', label: '文本生成', color: 'blue' },
  { key: 'image', label: '图片生成', color: 'orange' },
  { key: 'video', label: '视频生成', color: 'cyan' },
]

export const categoryLabelMap = Object.fromEntries(MODEL_CATEGORIES.map((c) => [c.key, c.label]))
export const categoryColorMap = Object.fromEntries(MODEL_CATEGORIES.map((c) => [c.key, c.color]))

export const PROVIDER_STATUS_MAP: Record<ProviderStatus, { text: string; color: string }> = {
  active: { text: '活跃', color: 'green' },
  testing: { text: '测试中', color: 'orange' },
  disabled: { text: '禁用', color: 'default' },
}

export function maskUrl(url: string): string {
  if (!url) return '—'
  try {
    const u = new URL(url)
    return `${u.protocol}//***${u.host.slice(-6)}${u.pathname}`
  } catch {
    return url.slice(0, 20) + '***'
  }
}

/** 表格操作列使用轻量的图标 + 文字样式，避免暗色表格里出现突兀色块。 */
const TABLE_ACTION_BTN_BASE =
  '!inline-flex !h-7 !min-w-0 !cursor-pointer !items-center !gap-1 !border-none !bg-transparent !px-1.5 !py-0 !shadow-none transition-colors'

/** 编辑：跟随暗色主题的中性文字，不做按钮盒子。 */
export const TABLE_ACTION_BTN_EDIT_CLASS = `${TABLE_ACTION_BTN_BASE} !text-[#c9c9c9] hover:!bg-transparent hover:!text-[#f2f2f2] active:!text-white`

/** 删除：保持轻量，但用柔和红色区分危险操作。 */
export const TABLE_ACTION_BTN_DELETE_CLASS = `${TABLE_ACTION_BTN_BASE} !text-[#d68a8a] hover:!bg-transparent hover:!text-[#ffb0b0] active:!text-[#ffd0d0]`
