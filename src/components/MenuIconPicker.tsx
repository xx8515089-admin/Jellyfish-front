import type React from 'react'
import { useMemo, useState } from 'react'
import { Button, Empty, Input, Popover, Tooltip } from 'antd'
import * as AntIcons from '@ant-design/icons'
import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  ChevronDown,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileCheck2,
  FileSearch,
  FileText,
  FlaskConical,
  Folder,
  FolderKanban,
  Home,
  Image,
  Images,
  KeyRound,
  LayoutGrid,
  ListChecks,
  LockKeyhole,
  Menu,
  PanelTop,
  PlayCircle,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Tags,
  UserRound,
  UsersRound,
  Video,
  WalletCards,
  Workflow,
  Wrench,
} from 'lucide-react'
import './MenuIconPicker.css'

type IconComponent = React.ElementType<{ className?: string }>

type MenuIconOption = {
  value: string
  label: string
  keywords: string
  Icon: IconComponent
  exportName: string
  common?: boolean
}

type MenuIconPickerProps = {
  value?: string | null
  onChange?: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

type MenuIconPreviewProps = {
  value?: string | null
  className?: string
}

type CommonMenuIconDefinition = {
  value: string
  label: string
  keywords: string
  Icon: IconComponent
  legacyExportName: string
}

const ANT_ICON_EXPORTS = AntIcons as unknown as Record<string, unknown>

const COMMON_MENU_ICON_DEFINITIONS: CommonMenuIconDefinition[] = [
  { value: 'system', label: 'System', keywords: 'system admin permission safety 系统 管理', Icon: ShieldCheck, legacyExportName: 'SafetyCertificateOutlined' },
  { value: 'settings', label: 'Settings', keywords: 'setting settings config 系统 设置', Icon: Settings, legacyExportName: 'SettingOutlined' },
  { value: 'menu', label: 'Menu', keywords: 'menu navigation 菜单 导航', Icon: Menu, legacyExportName: 'MenuOutlined' },
  { value: 'appstore', label: 'App Store', keywords: 'app application grid 应用', Icon: LayoutGrid, legacyExportName: 'AppstoreOutlined' },
  { value: 'user', label: 'User', keywords: 'user account member 用户', Icon: UserRound, legacyExportName: 'UserOutlined' },
  { value: 'users', label: 'Users', keywords: 'users team group 用户组', Icon: UsersRound, legacyExportName: 'TeamOutlined' },
  { value: 'role', label: 'Role', keywords: 'role permission safety 角色 权限', Icon: ShieldCheck, legacyExportName: 'SafetyCertificateOutlined' },
  { value: 'permission', label: 'Permission', keywords: 'permission key access 权限', Icon: KeyRound, legacyExportName: 'KeyOutlined' },
  { value: 'lock', label: 'Security', keywords: 'lock secure auth 安全', Icon: LockKeyhole, legacyExportName: 'LockOutlined' },
  { value: 'project', label: 'Project', keywords: 'project workspace 项目', Icon: FolderKanban, legacyExportName: 'ProjectOutlined' },
  { value: 'folder', label: 'Folder', keywords: 'folder directory 文件夹', Icon: Folder, legacyExportName: 'FolderOutlined' },
  { value: 'asset', label: 'Asset', keywords: 'asset media image 资产', Icon: Images, legacyExportName: 'FileImageOutlined' },
  { value: 'image', label: 'Image', keywords: 'image picture photo 图片', Icon: Image, legacyExportName: 'PictureOutlined' },
  { value: 'prompt', label: 'Prompt', keywords: 'prompt text file 提示词', Icon: FileText, legacyExportName: 'FileTextOutlined' },
  { value: 'model', label: 'Model', keywords: 'model api llm 模型', Icon: Cpu, legacyExportName: 'ApiOutlined' },
  { value: 'api', label: 'API', keywords: 'api service 接口', Icon: Plug, legacyExportName: 'ApiOutlined' },
  { value: 'workflow', label: 'Workflow', keywords: 'workflow flow deploy 流程', Icon: Workflow, legacyExportName: 'DeploymentUnitOutlined' },
  { value: 'task', label: 'Task', keywords: 'task branch job 任务', Icon: ListChecks, legacyExportName: 'BranchesOutlined' },
  { value: 'dashboard', label: 'Dashboard', keywords: 'dashboard chart stats 看板', Icon: BarChart3, legacyExportName: 'BarChartOutlined' },
  { value: 'canvas', label: 'Canvas', keywords: 'canvas board 画布', Icon: PanelTop, legacyExportName: 'BorderOutlined' },
  { value: 'home', label: 'Home', keywords: 'home index 首页', Icon: Home, legacyExportName: 'HomeOutlined' },
  { value: 'database', label: 'Database', keywords: 'database storage data 数据', Icon: Database, legacyExportName: 'DatabaseOutlined' },
  { value: 'cloud', label: 'Cloud', keywords: 'cloud service 云服务', Icon: Cloud, legacyExportName: 'CloudOutlined' },
  { value: 'experiment', label: 'Experiment', keywords: 'experiment test lab 实验', Icon: FlaskConical, legacyExportName: 'ExperimentOutlined' },
  { value: 'video', label: 'Video', keywords: 'video camera film 视频', Icon: Video, legacyExportName: 'VideoCameraOutlined' },
  { value: 'play', label: 'Play', keywords: 'play preview player 播放', Icon: PlayCircle, legacyExportName: 'PlayCircleOutlined' },
  { value: 'notice', label: 'Notice', keywords: 'notice notification message 通知', Icon: Bell, legacyExportName: 'NotificationOutlined' },
  { value: 'tool', label: 'Tool', keywords: 'tool maintenance 工具', Icon: Wrench, legacyExportName: 'ToolOutlined' },
  { value: 'tag', label: 'Tag', keywords: 'tag label category 标签', Icon: Tags, legacyExportName: 'TagsOutlined' },
  { value: 'code', label: 'Code', keywords: 'code develop 代码', Icon: Code2, legacyExportName: 'CodeOutlined' },
  { value: 'audit', label: 'Audit', keywords: 'audit search inspect 审计', Icon: FileSearch, legacyExportName: 'FileSearchOutlined' },
  { value: 'document', label: 'Document', keywords: 'document file protect 文档', Icon: FileCheck2, legacyExportName: 'FileProtectOutlined' },
  { value: 'config', label: 'Config', keywords: 'config control slider 配置', Icon: SlidersHorizontal, legacyExportName: 'ControlOutlined' },
  { value: 'finance', label: 'Quota', keywords: 'quota wallet finance 额度', Icon: WalletCards, legacyExportName: 'WalletOutlined' },
  { value: 'tenant', label: 'Tenant', keywords: 'tenant company bank 组织', Icon: Building2, legacyExportName: 'BankOutlined' },
  { value: 'store', label: 'Store', keywords: 'store shop market 商店', Icon: Store, legacyExportName: 'ShopOutlined' },
  { value: 'agent', label: 'Agent', keywords: 'agent robot bot 智能体', Icon: Bot, legacyExportName: 'RobotOutlined' },
]

const COMMON_MENU_ICON_OPTIONS = COMMON_MENU_ICON_DEFINITIONS.map((item) => ({
  value: item.value,
  label: item.label,
  keywords: item.keywords,
  Icon: item.Icon,
  exportName: item.legacyExportName,
  common: true,
}))

export const MENU_ICON_OPTIONS: MenuIconOption[] = [
  ...COMMON_MENU_ICON_OPTIONS,
  ...getAntOutlinedIconOptions(COMMON_MENU_ICON_OPTIONS),
]

const ICON_OPTION_MAP = createIconOptionMap(MENU_ICON_OPTIONS)

/** 菜单图标选择器：提供统一图标库、搜索、预览与自定义编码写入能力。 */
export const MenuIconPicker: React.FC<MenuIconPickerProps> = ({ value, onChange, placeholder = 'Select icon', disabled }) => {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')

  const normalizedKeyword = keyword.trim().toLowerCase()
  const selected = getMenuIconOption(value)
  const customIconCode = keyword.trim()
  const canUseCustomCode = customIconCode.length > 0 && isLikelyIconCode(customIconCode) && !getMenuIconOption(customIconCode)

  const filteredOptions = useMemo(() => {
    if (!normalizedKeyword) return MENU_ICON_OPTIONS
    return MENU_ICON_OPTIONS.filter((option) => {
      const searchText = `${option.value} ${option.label} ${option.keywords}`.toLowerCase()
      return searchText.includes(normalizedKeyword)
    })
  }, [normalizedKeyword])

  /** 选择图标后同步给表单，并关闭浮层减少重复点击。 */
  const handleSelect = (nextValue: string | null) => {
    onChange?.(nextValue)
    setOpen(false)
    setKeyword('')
  }

  /** 控制浮层展开状态，禁用态下禁止打开图标库。 */
  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return
    setOpen(nextOpen)
  }

  const displayText = getIconDisplayText(value, selected?.label, placeholder)

  const content = (
    <div className="menu-icon-picker__panel">
      <Input
        allowClear
        prefix={<Search size={16} strokeWidth={1.75} />}
        placeholder="Search icon name or code"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <div className="menu-icon-picker__summary">
        {normalizedKeyword
          ? `${filteredOptions.length} icons matched`
          : `Common ${COMMON_MENU_ICON_OPTIONS.length} · All ${MENU_ICON_OPTIONS.length}`}
      </div>

      {filteredOptions.length > 0 ? (
        <div className="menu-icon-picker__grid" role="listbox">
          {filteredOptions.map((option) => {
            const Icon = option.Icon
            const active = option.value === value
            return (
              <Tooltip key={option.value} title={`${option.label} / ${option.value}`} mouseEnterDelay={0.35}>
                <button
                  type="button"
                  className={buildClassName('menu-icon-picker__tile', active ? 'is-active' : undefined)}
                  aria-pressed={active}
                  onClick={() => handleSelect(option.value)}
                >
                  <Icon className="menu-icon-picker__tile-icon" />
                  <span className="menu-icon-picker__tile-label">{option.label}</span>
                </button>
              </Tooltip>
            )
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matching icons" />
      )}

      <div className="menu-icon-picker__footer">
        <span className="menu-icon-picker__current">Current: {value || 'None'}</span>
        <div className="menu-icon-picker__actions">
          {canUseCustomCode && (
            <Button size="small" type="link" onClick={() => handleSelect(customIconCode)}>
              Use {customIconCode}
            </Button>
          )}
          <Button size="small" type="text" disabled={!value} onClick={() => handleSelect(null)}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      trigger="click"
      placement="bottomLeft"
      content={content}
      onOpenChange={handleOpenChange}
      overlayClassName="menu-icon-picker__popover"
    >
      <Button disabled={disabled} className="menu-icon-picker__trigger">
        <span className="menu-icon-picker__trigger-main">
          <MenuIconPreview value={value || 'appstore'} className={!value ? 'is-placeholder' : undefined} />
          <span className={buildClassName('menu-icon-picker__trigger-label', !value ? 'is-placeholder' : undefined)}>
            {displayText}
          </span>
        </span>
        <ChevronDown className="menu-icon-picker__trigger-arrow" size={15} strokeWidth={1.75} />
      </Button>
    </Popover>
  )
}

/** 渲染菜单图标预览，未知编码用首字母占位，避免表格和表单出现空白。 */
export function MenuIconPreview({ value, className }: MenuIconPreviewProps): React.ReactElement | null {
  if (!value) return null
  const option = getMenuIconOption(value)
  const Icon = option?.Icon
  return (
    <span className={buildClassName('menu-icon-preview', className)}>
      {Icon ? <Icon /> : <span className="menu-icon-preview__fallback">{value.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

/** 根据后端保存的图标编码找到对应的图标配置。 */
export function getMenuIconOption(value?: string | null): MenuIconOption | undefined {
  if (!value) return undefined
  return ICON_OPTION_MAP.get(value)
}

/** 批量读取 Ant Design Icons 的 Outlined 图标，避免选择器只能使用少量手工枚举项。 */
function getAntOutlinedIconOptions(commonOptions: MenuIconOption[]): MenuIconOption[] {
  const commonValues = new Set(commonOptions.map((option) => option.value))
  return Object.entries(ANT_ICON_EXPORTS)
    .filter(([name, icon]) => name.endsWith('Outlined') && isIconComponent(icon))
    .map(([name, icon]) => {
      const baseName = name.replace(/Outlined$/, '')
      const value = toIconCode(baseName)
      return {
        value,
        label: toIconLabel(baseName),
        keywords: `${value} ${baseName} ${name}`,
        Icon: icon as IconComponent,
        exportName: name,
      }
    })
    .filter((option) => !commonValues.has(option.value))
    .sort((first, second) => first.label.localeCompare(second.label))
}

/** 判断导出对象是否可作为 React 图标组件渲染。 */
function isIconComponent(icon: unknown): icon is IconComponent {
  return typeof icon === 'function' || (typeof icon === 'object' && icon !== null && '$$typeof' in icon)
}

/** 将 AntD 图标名转换成后端保存的短编码。 */
function toIconCode(baseName: string): string {
  return baseName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/** 将 AntD 图标名转换成更容易扫读的英文名称。 */
function toIconLabel(baseName: string): string {
  return baseName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

/** 为不同保存习惯建立索引：短编码、AntD 导出名和去掉 Outlined 的组件名都能识别。 */
function createIconOptionMap(options: MenuIconOption[]): Map<string, MenuIconOption> {
  const optionMap = new Map<string, MenuIconOption>()
  options.forEach((option) => {
    const baseName = option.exportName.replace(/Outlined$/, '')
    const keys = [option.value, option.exportName, baseName, baseName.toLowerCase()]
    keys.forEach((key) => {
      if (!optionMap.has(key)) optionMap.set(key, option)
    })
  })
  return optionMap
}

/** 判断输入是否像一个可保存的图标编码，避免把中文搜索词误存到后端。 */
function isLikelyIconCode(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/i.test(value) || /^[A-Z][A-Za-z0-9]*Outlined$/.test(value)
}

/** 生成触发按钮上的展示文本。 */
function getIconDisplayText(value: string | null | undefined, selectedLabel: string | undefined, placeholder: string): string {
  if (selectedLabel) return selectedLabel
  if (value) return value
  return placeholder
}

/** 拼接 CSS 类名，保持 JSX 中的状态类清晰可读。 */
function buildClassName(...names: Array<string | undefined>): string {
  return names.filter(Boolean).join(' ')
}

export default MenuIconPicker
