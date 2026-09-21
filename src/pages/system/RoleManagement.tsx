import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, TreeSelect, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { SystemMenusService, SystemRolesService } from '../../services/generated'
import type { SystemMenuRead, SystemRoleCreate, SystemRoleRead, SystemRoleUpdate } from '../../services/generated'
import { useAppStore } from '../../store/useAppStore'
import { assertApiSuccess, getErrorMessage, normalizeNullableText } from './systemApiHelpers'
import './MenuManagement.css'
import './RoleManagement.css'

type RoleFormValues = {
  code: string
  name: string
  description?: string | null
  permissions: string[]
  menuIds?: number[]
  active: boolean
}

type MenuTreeOption = {
  title: string
  value: number
  key: number
  children?: MenuTreeOption[]
}

type PermissionTagRenderProps = {
  label: React.ReactNode
  value: string | number
  closable: boolean
  onClose: () => void
}

const PERMISSION_OPTIONS = [
  { label: '*', value: '*' },
  { label: 'system:roles:read', value: 'system:roles:read' },
  { label: 'system:roles:write', value: 'system:roles:write' },
  { label: 'system:menus:read', value: 'system:menus:read' },
  { label: 'system:menus:write', value: 'system:menus:write' },
  { label: 'studio:projects:read', value: 'studio:projects:read' },
  { label: 'studio:projects:write', value: 'studio:projects:write' },
  { label: 'studio:tasks:read', value: 'studio:tasks:read' },
  { label: 'studio:tasks:write', value: 'studio:tasks:write' },
]

const { TextArea } = Input

/** 角色管理页：接入 Java 后端角色接口，提供角色查询、新增、编辑和删除。 */
const RoleManagement: React.FC = () => {
  const english = useAppStore((state) => state.language) === 'en-US'
  const currentIsAdmin = useAppStore((state) => state.user.isAdmin)
  const text = (zh: string, en: string) => (english ? en : zh)
  const loadSequence = useRef(0)
  const [roles, setRoles] = useState<SystemRoleRead[]>([])
  const [menus, setMenus] = useState<SystemMenuRead[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SystemRoleRead | null>(null)
  const [formSeed, setFormSeed] = useState<RoleFormValues | null>(null)
  const [form] = Form.useForm<RoleFormValues>()
  const [modalApi, modalContextHolder] = Modal.useModal()
  const [messageApi, contextHolder] = message.useMessage()

  const menuTreeData = useMemo(() => buildMenuTreeOptions(menus), [menus])

  /** 同步加载角色列表和菜单树，菜单树用于角色编辑时绑定菜单权限。 */
  const loadRolePageData = async () => {
    const sequence = ++loadSequence.current
    const requestedEnglish = english
    setLoading(true)
    try {
      const [roleResponse, menuResponse] = await Promise.all([
        SystemRolesService.findAllRolesApiV1SystemRolesFindAllGet(),
        SystemMenusService.findAllMenusApiV1SystemMenusFindAllGet(),
      ])
      if (sequence !== loadSequence.current || requestedEnglish !== (useAppStore.getState().language === 'en-US')) return
      assertApiSuccess(roleResponse, text('加载角色失败', 'Failed to load roles'))
      assertApiSuccess(menuResponse, text('加载菜单失败', 'Failed to load menus'))
      setRoles(roleResponse.data ?? [])
      setMenus(menuResponse.data ?? [])
    } catch (error) {
      if (sequence !== loadSequence.current || requestedEnglish !== (useAppStore.getState().language === 'en-US')) return
      void messageApi.error(getErrorMessage(error, text('加载角色失败', 'Failed to load roles')))
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (currentIsAdmin) void loadRolePageData()
    return () => { loadSequence.current += 1 }
  }, [currentIsAdmin, english])

  /** 打开新增角色弹窗，创建接口只提交角色基础信息和权限编码。 */
  const openCreateModal = () => {
    setEditing(null)
    setFormSeed({
      code: '',
      name: '',
      description: '',
      permissions: [],
      active: true,
    })
    setModalOpen(true)
  }

  /** 打开编辑角色弹窗，并回填当前角色信息。 */
  const openEditModal = (role: SystemRoleRead) => {
    setEditing(role)
    setFormSeed({
      code: role.code,
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions ?? [],
      menuIds: role.menuIds ?? [],
      active: role.active,
    })
    setModalOpen(true)
  }

  /** 关闭角色编辑弹窗，表单清理放在弹窗关闭完成后执行。 */
  const closeRoleModal = () => {
    setModalOpen(false)
  }

  /** 弹窗完成打开后再写入表单值，避免 Form 尚未挂载时触发 AntD 告警。 */
  const handleRoleModalOpenChange = (open: boolean) => {
    if (open) {
      form.resetFields()
      if (formSeed) form.setFieldsValue(formSeed)
      return
    }
    setEditing(null)
    setFormSeed(null)
  }

  /** 保存新增或编辑后的角色数据。 */
  const submitRole = async () => {
    try {
      const values = await form.validateFields()
      const permissions = normalizePermissionList(values.permissions)
      setSaving(true)
      if (editing) {
        const requestBody: SystemRoleUpdate = {
          id: editing.id,
          code: values.code.trim(),
          name: values.name.trim(),
          description: normalizeNullableText(values.description),
          permissions,
          menuIds: values.menuIds ?? [],
          active: values.active,
        }
        const response = await SystemRolesService.updateRoleApiV1SystemRolesUpdatePost({ requestBody })
        assertApiSuccess(response, text('编辑角色失败', 'Failed to update role'))
        void messageApi.success(text('角色已更新', 'Role updated'))
      } else {
        const requestBody: SystemRoleCreate = {
          code: values.code.trim(),
          name: values.name.trim(),
          description: normalizeNullableText(values.description),
          permissions,
          active: values.active,
        }
        const response = await SystemRolesService.createRoleApiV1SystemRolesCreatePost({ requestBody })
        assertApiSuccess(response, text('创建角色失败', 'Failed to create role'))
        void messageApi.success(text('角色已创建', 'Role created'))
      }
      closeRoleModal()
      await loadRolePageData()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      void messageApi.error(getErrorMessage(error, editing ? text('编辑角色失败', 'Failed to update role') : text('创建角色失败', 'Failed to create role')))
    } finally {
      setSaving(false)
    }
  }

  /** 删除角色，具体业务约束交给后端判断。 */
  const confirmDeleteRole = (role: SystemRoleRead) => {
    modalApi.confirm({
      title: text('删除角色', 'Delete role'),
      content: text(`确定删除「${role.name}」？`, `Delete “${role.name}”?`),
      okText: text('删除', 'Delete'),
      okType: 'danger',
      cancelText: text('取消', 'Cancel'),
      onOk: async () => {
        try {
          const response = await SystemRolesService.deleteRoleApiV1SystemRolesDeletePost({
            requestBody: { id: role.id },
          })
          assertApiSuccess(response, text('删除角色失败', 'Failed to delete role'))
          void messageApi.success(text('角色已删除', 'Role deleted'))
          await loadRolePageData()
        } catch (error) {
          void messageApi.error(getErrorMessage(error, text('删除角色失败', 'Failed to delete role')))
        }
      },
    })
  }

  const columns: TableColumnsType<SystemRoleRead> = [
    { title: text('角色编码', 'Role code'), dataIndex: 'code', key: 'code', width: 180 },
    { title: text('角色名称', 'Role name'), dataIndex: 'name', key: 'name', width: 180 },
    {
      title: text('权限', 'Permissions'),
      dataIndex: 'permissions',
      key: 'permissions',
      width: 240,
      render: (permissions: string[]) => renderPermissionTags(permissions),
    },
    {
      title: text('菜单', 'Menus'),
      dataIndex: 'menuIds',
      key: 'menuIds',
      width: 90,
      render: (menuIds?: number[]) => Array.isArray(menuIds) ? menuIds.length : '—',
    },
    {
      title: text('类型', 'Type'),
      dataIndex: 'system',
      key: 'system',
      width: 100,
      render: (system: boolean) => (
        <Tag color={system ? 'purple' : 'default'}>{system ? text('系统', 'System') : text('自定义', 'Custom')}</Tag>
      ),
    },
    {
      title: text('状态', 'Status'),
      dataIndex: 'active',
      key: 'active',
      width: 90,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? text('启用', 'Active') : text('停用', 'Disabled')}</Tag>
      ),
    },
    {
      title: text('说明', 'Description'),
      dataIndex: 'description',
      key: 'description',
      width: 260,
      ellipsis: true,
      render: (description?: string | null) => <span className="role-management__description">{description || '—'}</span>,
    },
    {
      title: text('操作', 'Actions'),
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space size={4} className="role-management__actions">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            {text('编辑', 'Edit')}
          </Button>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteRole(record)}>
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
      className="role-management"
      title={text('角色管理', 'Role Management')}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadRolePageData()}>
            {text('刷新', 'Refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {text('新增角色', 'Add role')}
          </Button>
        </Space>
      }
    >
      {contextHolder}
      {modalContextHolder}
      <Table<SystemRoleRead>
        className="role-management__table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={roles}
        pagination={false}
        tableLayout="fixed"
      />

      <Modal
        title={null}
        open={modalOpen}
        onCancel={closeRoleModal}
        onOk={() => void submitRole()}
        afterOpenChange={handleRoleModalOpenChange}
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
                  {editing ? text('编辑角色', 'Edit role') : text('新增角色', 'Add role')}
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
                <Form.Item
                  name="code"
                  label={text('角色编码', 'Role code')}
                  rules={[
                    { required: true, message: text('请输入角色编码', 'Enter role code') },
                    { pattern: /^[a-z][a-z0-9_:-]*$/i, message: text('仅支持字母、数字、下划线、冒号和短横线', 'Only letters, numbers, underscores, colons and hyphens are supported') },
                  ]}
                >
                  <Input placeholder="content_editor" />
                </Form.Item>
                <Form.Item name="name" label={text('角色名称', 'Role name')} rules={[{ required: true, message: text('请输入角色名称', 'Enter role name') }]}>
                  <Input placeholder={text('内容编辑', 'Content Editor')} />
                </Form.Item>
                <Form.Item name="description" label={text('角色说明', 'Description')} className="menu-editor__wide">
                  <TextArea rows={3} placeholder={text('负责项目、镜头和任务管理', 'Responsible for projects, shots and tasks')} />
                </Form.Item>
              </div>
            </div>

            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{text('权限配置', 'Permission settings')}</div>
              <div className="menu-editor__grid">
                <Form.Item
                  name="permissions"
                  label={text('权限编码', 'Permission codes')}
                  className="menu-editor__wide"
                  rules={[{ required: true, type: 'array', min: 1, message: text('请至少填写一个权限编码', 'Enter at least one permission code') }]}
                >
                  <Select
                    mode="tags"
                    tokenSeparators={[',']}
                    className="role-management__permission-select"
                    placeholder={text('输入权限编码，或选择 * 表示全部权限', 'Enter permission codes, or choose * for all permissions')}
                    options={PERMISSION_OPTIONS}
                    tagRender={renderPermissionSelectTag}
                  />
                </Form.Item>
                {editing && (
                  <Form.Item name="menuIds" label={text('关联菜单', 'Linked menus')} className="menu-editor__wide">
                    <TreeSelect
                      treeData={menuTreeData}
                      treeCheckable
                      allowClear
                      showCheckedStrategy={TreeSelect.SHOW_PARENT}
                      placeholder={text('选择角色可访问的菜单', 'Select menus available to this role')}
                      maxTagCount="responsive"
                    />
                  </Form.Item>
                )}
                <Form.Item label={text('启用状态', 'Active state')} className="menu-editor__switch-item">
                  <div className="menu-editor__switch-row">
                    <Form.Item name="active" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                    <span>{text('启用后该角色可分配给用户', 'This role can be assigned to users when active')}</span>
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

/** 构造菜单树选择数据，保留后端菜单层级用于角色绑定。 */
function buildMenuTreeOptions(menus: SystemMenuRead[]): MenuTreeOption[] {
  return menus.map((menu) => ({
    title: `${menu.name}（${menu.code}）`,
    value: menu.id,
    key: menu.id,
    children: menu.children?.length ? buildMenuTreeOptions(menu.children) : undefined,
  }))
}

/** 清理权限编码数组，去掉空白项并保持提交顺序稳定。 */
function normalizePermissionList(permissions: string[]): string[] {
  return permissions.map((permission) => permission.trim()).filter(Boolean)
}

/** 渲染权限标签，避免权限过多时撑开表格。 */
function renderPermissionTags(permissions?: string[]): React.ReactNode {
  if (!permissions?.length) return '—'
  const visiblePermissions = permissions.slice(0, 3)
  return (
    <div className="role-management__permission-list">
      {visiblePermissions.map((permission) => (
        <span
          key={permission}
          className="role-management__permission-pill"
          title={permission}
        >
          {permission}
        </span>
      ))}
      {permissions.length > visiblePermissions.length && (
        <span className="role-management__permission-more">+{permissions.length - visiblePermissions.length}</span>
      )}
    </div>
  )
}

/** 渲染权限编辑框中的选中标签，让通配权限和普通权限更容易区分。 */
function renderPermissionSelectTag({ label, value, closable, onClose }: PermissionTagRenderProps): React.ReactElement {
  const permission = String(value)
  const handleMouseDown = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  return (
    <span
      className="role-management__permission-tag"
      title={permission}
      onMouseDown={handleMouseDown}
    >
      <span className="role-management__permission-tag-text">
        {label}
      </span>
      {closable && (
        <button
          type="button"
          className="role-management__permission-tag-close"
          aria-label={`Remove ${permission}`}
          onClick={handleClose}
        >
          <CloseOutlined />
        </button>
      )}
    </span>
  )
}

export default RoleManagement
