import { uiText } from '../../i18n/uiText'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { MenuIconPicker, MenuIconPreview } from '../../components'
import { SystemMenusService } from '../../services/generated'
import type { SystemMenuCreate, SystemMenuRead, SystemMenuUpdate } from '../../services/generated'
import { useAppStore } from '../../store/useAppStore'
import { getErrorMessage, normalizeNullableText } from './systemApiHelpers'
import { getSystemMenuDetail } from '../../services/systemMenuDetail'
import { getAuthToken } from '../../auth'
import { refreshAuthMenus } from '../../services/authMenus'
import { assertMenuSuccess, menuNameFields, menuNamePayload } from './menuLanguage'
import './MenuManagement.css'

type MenuFormValues = {
  parentId?: number | null
  code: string
  name: string
  nameEn?: string | null
  path?: string | null
  icon?: string | null
  menuType: string
  sortOrder: number
  active: boolean
}

type ParentOption = {
  label: string
  value: number
  disabled?: boolean
}

const MENU_TYPE_OPTIONS = [
  { get label() { return uiText("目录") }, value: 'directory' },
  { get label() { return uiText("菜单") }, value: 'menu' },
]

/** 菜单管理页：使用 Java 后端菜单树接口完成查询、新增、编辑和删除。 */
const MenuManagement: React.FC = () => {
  const english = useAppStore((state) => state.language) === 'en-US'
  const currentIsAdmin = useAppStore((state) => state.user.isAdmin)
  const text = (zh: string, en: string) => (english ? en : zh)
  const detailSequence = useRef(0)
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null)
  const loadSequence = useRef(0)
  const [menus, setMenus] = useState<SystemMenuRead[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SystemMenuRead | null>(null)
  const [formSeed, setFormSeed] = useState<MenuFormValues | null>(null)
  const [form] = Form.useForm<MenuFormValues>()
  const [modalApi, modalContextHolder] = Modal.useModal()
  const [messageApi, contextHolder] = message.useMessage()

  /** 从后端加载完整菜单树。 */
  const loadMenus = async () => {
    const sequence = ++loadSequence.current
    const requestedEnglish = english
    setLoading(true)
    try {
      const response = await SystemMenusService.findAllMenusApiV1SystemMenusFindAllGet()
      if (sequence !== loadSequence.current || requestedEnglish !== (useAppStore.getState().language === 'en-US')) return
      assertMenuSuccess(response, text('加载菜单失败', 'Failed to load menus'))
      setMenus(response.data ?? [])
    } catch (error) {
      if (sequence !== loadSequence.current || requestedEnglish !== (useAppStore.getState().language === 'en-US')) return
      void messageApi.error(getErrorMessage(error, text('加载菜单失败', 'Failed to load menus')))
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (currentIsAdmin) void loadMenus()
    return () => { loadSequence.current += 1 }
  }, [currentIsAdmin, english])

  useEffect(() => () => { detailSequence.current += 1 }, [])

  const parentOptions = useMemo(
    () => buildParentOptions(menus, editing?.id ?? null),
    [menus, editing],
  )

  /** 打开新增菜单弹窗，可传入父级菜单作为默认父节点。 */
  const openCreateModal = (parent?: SystemMenuRead) => {
    detailSequence.current += 1
    setDetailLoadingId(null)
    setEditing(null)
    setFormSeed({
      parentId: parent?.id ?? null,
      code: '',
      name: '',
      nameEn: '',
      path: null,
      icon: null,
      menuType: 'menu',
      sortOrder: 0,
      active: true,
    })
    setModalOpen(true)
  }

  /** 打开编辑菜单弹窗，并回填当前行数据。 */
  const openEditModal = async (row: SystemMenuRead) => {
    const sequence = ++detailSequence.current
    const token = getAuthToken()
    setDetailLoadingId(row.id)
    try {
      const menu = await getSystemMenuDetail(row.id, useAppStore.getState().language)
      if (sequence !== detailSequence.current || token !== getAuthToken()) return
      const names = menuNameFields(menu)
      setEditing(menu)
      setFormSeed({
        parentId: menu.parentId ?? null, code: menu.code, ...names,
        path: menu.path ?? null, icon: menu.icon ?? null, menuType: menu.menuType,
        sortOrder: menu.sortOrder, active: menu.active,
      })
      setModalOpen(true)
    } catch (error) {
      if (sequence === detailSequence.current && token === getAuthToken()) {
        void messageApi.error(getErrorMessage(error, text('读取菜单详情失败', 'Failed to load menu details')))
      }
    } finally {
      if (sequence === detailSequence.current) setDetailLoadingId(null)
    }
  }

  /** 关闭菜单编辑弹窗，清理动作放到 afterOpenChange 中等待表单完成挂载状态切换。 */
  const closeMenuModal = () => {
    detailSequence.current += 1
    setDetailLoadingId(null)
    setModalOpen(false)
  }

  /** 弹窗完成开关后再同步表单，避免 Form 尚未挂载时写入字段产生告警。 */
  const handleMenuModalOpenChange = (open: boolean) => {
    if (open) {
      form.resetFields()
      if (formSeed) form.setFieldsValue(formSeed)
      return
    }
    setEditing(null)
    setFormSeed(null)
  }

  /** 保存新增或编辑结果。 */
  const submitMenu = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const requestBody: SystemMenuUpdate = {
          id: editing.id,
          menuType: values.menuType,
          parentId: values.parentId ?? null,
          code: values.code.trim(),
          ...menuNamePayload(values),
          path: normalizeNullableText(values.path),
          icon: normalizeNullableText(values.icon),
          sortOrder: values.sortOrder ?? 0,
          active: values.active,
        }
        const response = await SystemMenusService.updateMenuApiV1SystemMenusUpdatePost({ requestBody })
        assertMenuSuccess(response, text('编辑菜单失败', 'Failed to update menu'))
        void messageApi.success(text('菜单已更新', 'Menu updated'))
      } else {
        const requestBody: SystemMenuCreate = {
          parentId: values.parentId ?? null,
          code: values.code.trim(),
          ...menuNamePayload(values),
          path: normalizeNullableText(values.path),
          icon: normalizeNullableText(values.icon),
          menuType: values.menuType,
          sortOrder: values.sortOrder ?? 0,
          active: values.active,
        }
        const response = await SystemMenusService.createMenuApiV1SystemMenusCreatePost({ requestBody })
        assertMenuSuccess(response, text('创建菜单失败', 'Failed to create menu'))
        void messageApi.success(text('菜单已创建', 'Menu created'))
      }
      closeMenuModal()
      await loadMenus()
      void refreshAuthMenus().catch(() => messageApi.warning(text('菜单已保存，但导航刷新失败；请切换语言或刷新页面重试', 'Menu saved, but navigation could not refresh. Switch language or reload to retry.')))
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      void messageApi.error(getErrorMessage(error, editing ? text('编辑菜单失败', 'Failed to update menu') : text('创建菜单失败', 'Failed to create menu')))
    } finally {
      setSaving(false)
    }
  }

  /** 删除菜单节点，后端负责校验是否允许删除含子节点的菜单。 */
  const confirmDeleteMenu = (menu: SystemMenuRead) => {
    modalApi.confirm({
      title: text('删除菜单', 'Delete menu'),
      content:
        menu.children?.length
          ? text(`「${menu.name}」包含子菜单，确定要删除？`, `“${menu.name}” has child menus. Delete it?`)
          : text(`确定删除「${menu.name}」？`, `Delete “${menu.name}”?`),
      okText: text('删除', 'Delete'),
      okType: 'danger',
      cancelText: text('取消', 'Cancel'),
      onOk: async () => {
        try {
          const response = await SystemMenusService.deleteMenuApiV1SystemMenusDeletePost({
            requestBody: { id: menu.id },
          })
          assertMenuSuccess(response, text('删除菜单失败', 'Failed to delete menu'))
          void messageApi.success(text('菜单已删除', 'Menu deleted'))
          await loadMenus()
          void refreshAuthMenus().catch(() => messageApi.warning(text('菜单已保存，但导航刷新失败；请切换语言或刷新页面重试', 'Menu saved, but navigation could not refresh. Switch language or reload to retry.')))
        } catch (error) {
          void messageApi.error(getErrorMessage(error, text('删除菜单失败', 'Failed to delete menu')))
        }
      },
    })
  }

  const columns: TableColumnsType<SystemMenuRead> = [
    {
      title: text('菜单名称', 'Menu name'),
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (name: string, record) => (
        <Space size={8}>
          <span className="font-medium">{name}</span>
          <Tag color="blue">{record.code}</Tag>
        </Space>
      ),
    },
    { title: text('路由路径', 'Route path'), dataIndex: 'path', key: 'path', width: 220, render: (value) => value || '—' },
    {
      title: text('图标', 'Icon'),
      dataIndex: 'icon',
      key: 'icon',
      width: 150,
      render: (value: string | null) => (
        value ? (
          <Space size={8}>
            <MenuIconPreview value={value} />
            <span>{value}</span>
          </Space>
        ) : '—'
      ),
    },
    {
      title: text('类型', 'Type'),
      dataIndex: 'menuType',
      key: 'menuType',
      width: 110,
      render: (value: string) => <Tag color={getMenuTypeColor(value)}>{getMenuTypeLabel(value, text)}</Tag>,
    },
    { title: text('排序', 'Sort'), dataIndex: 'sortOrder', key: 'sortOrder', width: 90 },
    {
      title: text('状态', 'Status'),
      dataIndex: 'active',
      key: 'active',
      width: 100,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? text('启用', 'Active') : text('停用', 'Disabled')}</Tag>
      ),
    },
    {
      title: text('操作', 'Actions'),
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size={12} className="menu-management__actions">
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            className="menu-management__action"
            onClick={() => openCreateModal(record)}
          >
            {text('新增子级', 'Add child')}
          </Button>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            className="menu-management__action"
            loading={detailLoadingId === record.id}
            onClick={() => void openEditModal(record)}
          >
            {text('编辑', 'Edit')}
          </Button>
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            className="menu-management__action menu-management__action--danger"
            onClick={() => confirmDeleteMenu(record)}
          >
            {text('删除', 'Delete')}
          </Button>
        </Space>
      ),
    },
  ]

  if (!currentIsAdmin) {
    return (
      <Card>
        <Typography.Title level={4}>{text('无管理员权限', 'Administrator access required')}</Typography.Title>
      </Card>
    )
  }

  return (
    <Card
      title={text('菜单管理', 'Menu Management')}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadMenus()}>
            {text('刷新', 'Refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateModal()}>
            {text('新增菜单', 'Add menu')}
          </Button>
        </Space>
      }
    >
      {contextHolder}
      {modalContextHolder}
      <Table<SystemMenuRead>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={menus}
        pagination={false}
        expandable={{ defaultExpandAllRows: true }}
        scroll={{ x: 1080 }}
      />

      <Modal
        title={null}
        open={modalOpen}
        onCancel={closeMenuModal}
        onOk={() => void submitMenu()}
        afterOpenChange={handleMenuModalOpenChange}
        confirmLoading={saving}
        width={720}
        className="menu-editor-modal"
        okText={text('保存', 'Save')}
        cancelText={text('取消', 'Cancel')}
        destroyOnHidden
      >
        <div className="menu-editor">
          <div className="menu-editor__header">
            <div>
              <div className="menu-editor__eyebrow">{text('系统管理', 'System Management')}</div>
              <div className="menu-editor__title-row">
                <Typography.Title level={4} className="menu-editor__title">
                  {editing ? text('编辑菜单', 'Edit menu') : text('新增菜单', 'Add menu')}
                </Typography.Title>
                <Tag color={editing ? 'blue' : 'green'} className="menu-editor__mode">
                  {editing ? text('编辑', 'Editing') : text('新增', 'Creating')}
                </Tag>
              </div>
            </div>
          </div>

          <Form form={form} layout="vertical" className="menu-editor__form">
            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{text('基础信息', 'Basic information')}</div>
              <div className="menu-editor__grid">
                <Form.Item name="parentId" label={text('上级菜单', 'Parent menu')} className="menu-editor__wide">
                  <Select
                    allowClear
                    placeholder={text('作为一级菜单', 'Root menu')}
                    options={parentOptions}
                  />
                </Form.Item>
                <Form.Item name="code" label={text('菜单编码', 'Menu code')} rules={[{ required: true, message: text('请输入菜单编码', 'Enter menu code') }, { type: 'string', max: 64, pattern: /^[a-z][a-z0-9_-]*$/, transform: value => value?.trim(), message: text('编码最多 64 位，以小写字母开头，仅允许小写字母、数字、下划线和连字符', 'Up to 64 characters. Start with a lowercase letter; use lowercase letters, digits, underscores, or hyphens.') }]}>
                  <Input placeholder="roles" maxLength={64} />
                </Form.Item>
                <Form.Item name="name" label={text('中文名称', 'Chinese name')} rules={[{ required: true, whitespace: true, message: text('请输入中文菜单名称', 'Enter the Chinese menu name') }, { max: 120, transform: value => value?.trim(), message: text('中文名称最多 120 个字符', 'Chinese name must be at most 120 characters') }]}>
                  <Input placeholder="角色管理" maxLength={120} />
                </Form.Item>
                <Form.Item name="nameEn" label={text('英文名称', 'English name')} rules={[{ max: 120, transform: value => value?.trim(), message: text('英文名称最多 120 个字符', 'English name must be at most 120 characters') }]} extra={text('留空时，英文界面使用中文名称', 'Leave empty to show the Chinese name in English mode')}>
                  <Input placeholder="Role Management" maxLength={120} allowClear />
                </Form.Item>
                <Form.Item name="menuType" label={text('菜单类型', 'Menu type')} rules={[{ required: true, type: 'enum', enum: ['directory', 'menu'], message: text('请选择目录或菜单', 'Select directory or menu') }]}>
                  <Select options={MENU_TYPE_OPTIONS} />
                </Form.Item>
                <Form.Item name="sortOrder" label={text('排序', 'Sort order')} rules={[{ required: true, message: text('请输入排序值', 'Enter sort order') }]}>
                  <InputNumber min={0} precision={0} className="w-full" />
                </Form.Item>
              </div>
            </div>

            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{text('路由与显示', 'Route and display')}</div>
              <div className="menu-editor__grid">
                <Form.Item name="path" label={text('路由路径', 'Route path')} dependencies={['menuType']} rules={[({ getFieldValue }) => ({
                  validator: (_, value) => getFieldValue('menuType') === 'menu' && !String(value ?? '').trim()
                    ? Promise.reject(new Error(text('菜单项必须填写路由路径', 'Menu items require a route path')))
                    : Promise.resolve(),
                })]}>
                  <Input placeholder="/system/roles" />
                </Form.Item>
                <Form.Item name="icon" label={text('图标标识', 'Icon key')}>
                  <MenuIconPicker placeholder={text('选择菜单图标', 'Select menu icon')} />
                </Form.Item>
                <Form.Item label={text('启用状态', 'Active state')} className="menu-editor__switch-item">
                  <div className="menu-editor__switch-row">
                    <Form.Item name="active" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                    <span>{text('启用后会在系统菜单中展示', 'Shown in system menus when active')}</span>
                  </div>
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>
    </Card>
  )
}

/** 构造父级菜单下拉选项，并禁用当前编辑节点及其子节点。 */
function buildParentOptions(menus: SystemMenuRead[], editingId: number | null): ParentOption[] {
  const disabledIds = editingId == null ? new Set<number>() : collectDescendantIds(menus, editingId)
  if (editingId != null) disabledIds.add(editingId)
  const options: ParentOption[] = []
  walkMenus(menus, 0, (menu, depth) => {
    options.push({
      label: `${'　'.repeat(depth)}${menu.name}（${menu.code}）`,
      value: menu.id,
      disabled: disabledIds.has(menu.id),
    })
  })
  return options
}

/** 遍历菜单树，向调用方提供节点和层级。 */
function walkMenus(menus: SystemMenuRead[], depth: number, visitor: (menu: SystemMenuRead, depth: number) => void): void {
  menus.forEach((menu) => {
    visitor(menu, depth)
    if (menu.children?.length) walkMenus(menu.children, depth + 1, visitor)
  })
}

/** 收集某个节点的所有子孙节点 ID，用于防止编辑时选择自身子节点作为父级。 */
function collectDescendantIds(menus: SystemMenuRead[], targetId: number): Set<number> {
  const result = new Set<number>()
  const findAndCollect = (items: SystemMenuRead[]): boolean => {
    for (const item of items) {
      if (item.id === targetId) {
        collectChildren(item, result)
        return true
      }
      if (item.children?.length && findAndCollect(item.children)) return true
    }
    return false
  }
  findAndCollect(menus)
  return result
}

/** 递归收集子节点 ID。 */
function collectChildren(menu: SystemMenuRead, result: Set<number>): void {
  menu.children?.forEach((child) => {
    result.add(child.id)
    collectChildren(child, result)
  })
}

/** 返回菜单类型展示文本。 */
function getMenuTypeLabel(value: string, text: (zh: string, en: string) => string): string {
  if (value === 'directory') return text('目录', 'Directory')
  if (value === 'menu') return text('菜单', 'Menu')
  if (value === 'button') return text('按钮', 'Button')
  return value
}

/** 返回菜单类型标签颜色。 */
function getMenuTypeColor(value: string): string {
  if (value === 'directory') return 'purple'
  if (value === 'menu') return 'blue'
  if (value === 'button') return 'orange'
  return 'default'
}

export default MenuManagement
