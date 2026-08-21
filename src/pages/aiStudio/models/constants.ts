import type { ModelCategoryKey } from '../../../services/generated/models/ModelCategoryKey'
import type { ProviderStatus } from '../../../services/generated/models/ProviderStatus'

export const MODEL_CATEGORIES: { key: ModelCategoryKey; label: string; color: string }[] = [
  { key: 'text', label: '文本生成', color: 'blue' },
  { key: 'image', label: '图片生成', color: 'orange' },
  { key: 'video', label: '视频生成', color: 'purple' },
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

/** 表格操作列图标按钮公共骨架（覆盖 Ant Design 默认尺寸） */
const TABLE_ACTION_BTN_BASE =
  '!inline-flex !h-7 !w-7 !min-w-7 !cursor-pointer !items-center !justify-center !rounded-md !border !border-solid !p-0 shadow-sm transition-colors'

/** 编辑：主色蓝，默认可辨认为可操作 */
export const TABLE_ACTION_BTN_EDIT_CLASS = `${TABLE_ACTION_BTN_BASE} !border-blue-200 !bg-blue-50 !text-blue-600 hover:!border-blue-400 hover:!bg-blue-100 hover:!text-blue-700 active:!bg-blue-200/60`

/** 删除：危险操作使用红色警示 */
export const TABLE_ACTION_BTN_DELETE_CLASS = `${TABLE_ACTION_BTN_BASE} !border-red-200 !bg-red-50 !text-red-600 hover:!border-red-400 hover:!bg-red-100 hover:!text-red-700 active:!bg-red-200/60`
