import type React from 'react'
import { useEffect, useState } from 'react'
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { SystemRolesService, SystemUsersService } from '../services/generated'
import type { SystemRoleRead, SystemUserCreate, SystemUserRead, SystemUserUpdate } from '../services/generated'
import { useAppStore } from '../store/useAppStore'
import { assertApiSuccess, getErrorMessage, normalizeNullableText } from './system/systemApiHelpers'
import './system/MenuManagement.css'
import './AdminUsers.css'

type UserSearchValues = {
  id?: number
  name?: string
}

type UserPagination = {
  page: number
  pageSize: number
  total: number
}

type UserFormValues = {
  username: string
  displayName?: string
  password?: string
  roleIds: number[]
  apiQuota: number
  apiQuotaResetAt?: Dayjs | null
  active: boolean
}

const DEFAULT_PAGINATION: UserPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
}

/** 用户管理页：接入 Java 后端分页用户接口，维护用户账号、角色与 API 额度。 */
const AdminUsers: React.FC = () => {
  const english = useAppStore((state) => state.language) === 'en-US'
  const currentIsAdmin = useAppStore((state) => state.user.isAdmin)
  const text = (zh: string, en: string) => english ? en : zh
  const [users, setUsers] = useState<SystemUserRead[]>([])
  const [roles, setRoles] = useState<SystemRoleRead[]>([])
  const [query, setQuery] = useState<UserSearchValues>({})
  const [searchDraft, setSearchDraft] = useState<UserSearchValues>({})
  const [pagination, setPagination] = useState<UserPagination>(DEFAULT_PAGINATION)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SystemUserRead | null>(null)
  const [formSeed, setFormSeed] = useState<UserFormValues | null>(null)
  const [form] = Form.useForm<UserFormValues>()
  const [messageApi, contextHolder] = message.useMessage()

  /** 加载角色列表，供创建和编辑用户时分配角色。 */
  const loadRoles = async () => {
    const response = await SystemRolesService.findAllRolesApiV1SystemRolesFindAllGet()
    assertApiSuccess(response, text('加载角色失败', 'Failed to load roles'))
    setRoles(response.data ?? [])
  }

  /** 按当前筛选条件分页加载用户列表。 */
  const loadUsers = async (
    nextQuery: UserSearchValues = query,
    nextPage = pagination.page,
    nextPageSize = pagination.pageSize,
  ) => {
    setLoading(true)
    try {
      const name = normalizeNullableText(nextQuery.name) ?? undefined
      const response = await SystemUsersService.findPageUsersApiV1SystemUsersFindPageGet({
        id: nextQuery.id,
        name,
        page: nextPage,
        pageSize: nextPageSize,
      })
      assertApiSuccess(response, text('加载用户失败', 'Failed to load users'))
      const pageData = response.data
      setUsers(pageData?.items ?? [])
      setPagination({
        page: pageData?.page ?? nextPage,
        pageSize: pageData?.pageSize ?? nextPageSize,
        total: pageData?.total ?? 0,
      })
    } catch (error) {
      void messageApi.error(getErrorMessage(error, text('加载用户失败', 'Failed to load users')))
    } finally {
      setLoading(false)
    }
  }

  /** 刷新用户页所需的用户分页数据与角色下拉数据。 */
  const loadPageData = async (
    nextQuery: UserSearchValues = query,
    nextPage = pagination.page,
    nextPageSize = pagination.pageSize,
  ) => {
    setLoading(true)
    try {
      const name = normalizeNullableText(nextQuery.name) ?? undefined
      const [userResponse, roleResponse] = await Promise.all([
        SystemUsersService.findPageUsersApiV1SystemUsersFindPageGet({
          id: nextQuery.id,
          name,
          page: nextPage,
          pageSize: nextPageSize,
        }),
        SystemRolesService.findAllRolesApiV1SystemRolesFindAllGet(),
      ])
      assertApiSuccess(userResponse, text('加载用户失败', 'Failed to load users'))
      assertApiSuccess(roleResponse, text('加载角色失败', 'Failed to load roles'))
      const pageData = userResponse.data
      setUsers(pageData?.items ?? [])
      setRoles(roleResponse.data ?? [])
      setPagination({
        page: pageData?.page ?? nextPage,
        pageSize: pageData?.pageSize ?? nextPageSize,
        total: pageData?.total ?? 0,
      })
    } catch (error) {
      void messageApi.error(getErrorMessage(error, text('加载用户失败', 'Failed to load users')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentIsAdmin) void loadPageData({}, DEFAULT_PAGINATION.page, DEFAULT_PAGINATION.pageSize)
  }, [currentIsAdmin])

  /** 提交筛选条件并回到第一页。 */
  const applySearch = () => {
    const nextQuery = {
      id: searchDraft.id,
      name: normalizeNullableText(searchDraft.name) ?? undefined,
    }
    setQuery(nextQuery)
    void loadUsers(nextQuery, 1, pagination.pageSize)
  }

  /** 清空筛选条件并重新查询第一页。 */
  const resetSearch = () => {
    const nextQuery: UserSearchValues = {}
    setSearchDraft(nextQuery)
    setQuery(nextQuery)
    void loadUsers(nextQuery, 1, pagination.pageSize)
  }

  /** 打开创建用户弹窗。 */
  const openCreateModal = () => {
    if (roles.length === 0) void loadRoles().catch((error) => messageApi.error(getErrorMessage(error, text('加载角色失败', 'Failed to load roles'))))
    setEditing(null)
    setFormSeed({
      username: '',
      displayName: '',
      password: '',
      roleIds: [],
      apiQuota: 0,
      apiQuotaResetAt: null,
      active: true,
    })
    setModalOpen(true)
  }

  /** 打开编辑用户弹窗，并回填 Java 后端返回的用户字段。 */
  const openEditModal = (user: SystemUserRead) => {
    if (roles.length === 0) void loadRoles().catch((error) => messageApi.error(getErrorMessage(error, text('加载角色失败', 'Failed to load roles'))))
    setEditing(user)
    setFormSeed({
      username: user.username,
      password: '',
      roleIds: user.roleIds ?? user.roles.map((role) => role.id),
      apiQuota: user.apiQuota,
      apiQuotaResetAt: toDateTimePickerValue(user.apiQuotaResetAt),
      active: user.active,
    })
    setModalOpen(true)
  }

  /** 关闭用户编辑弹窗，等待弹窗隐藏后再清理状态。 */
  const closeUserModal = () => {
    setModalOpen(false)
  }

  /** 弹窗完成打开后写入表单值，避免 Form 未挂载时触发 AntD 告警。 */
  const handleUserModalOpenChange = (open: boolean) => {
    if (open) {
      form.resetFields()
      if (formSeed) form.setFieldsValue(formSeed)
      return
    }
    setEditing(null)
    setFormSeed(null)
  }

  /** 保存新增或编辑的用户数据。 */
  const submitUser = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        const requestBody: SystemUserUpdate = {
          id: editing.id,
          username: values.username.trim(),
          roleIds: values.roleIds ?? [],
          apiQuota: values.apiQuota ?? 0,
          apiQuotaResetAt: normalizeDateTimeForApi(values.apiQuotaResetAt),
          active: values.active,
        }
        const password = normalizeNullableText(values.password)
        if (password) requestBody.password = password
        const response = await SystemUsersService.updateUserApiV1SystemUsersUpdatePost({ requestBody })
        assertApiSuccess(response, text('编辑用户失败', 'Failed to update user'))
        void messageApi.success(text('用户已更新', 'User updated'))
      } else {
        const requestBody: SystemUserCreate = {
          username: values.username.trim(),
          displayName: values.displayName?.trim() ?? '',
          password: values.password?.trim() ?? '',
          roleIds: values.roleIds ?? [],
          apiQuota: values.apiQuota ?? 0,
          apiQuotaResetAt: normalizeDateTimeForApi(values.apiQuotaResetAt),
        }
        const response = await SystemUsersService.registerUserApiV1AuthRegisterPost({ requestBody })
        assertApiSuccess(response, text('创建用户失败', 'Failed to create user'))
        void messageApi.success(text('用户已创建', 'User created'))
      }
      closeUserModal()
      await loadUsers(query, pagination.page, pagination.pageSize)
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      void messageApi.error(getErrorMessage(error, editing ? text('编辑用户失败', 'Failed to update user') : text('创建用户失败', 'Failed to create user')))
    } finally {
      setSaving(false)
    }
  }

  const roleOptions = roles.map((role) => ({
    label: `${role.name}（${role.code}）`,
    value: role.id,
    disabled: !role.active,
  }))

  const columns: TableColumnsType<SystemUserRead> = [
    { title: text('用户 ID', 'User ID'), dataIndex: 'id', key: 'id', width: 90 },
    { title: text('用户名', 'Username'), dataIndex: 'username', key: 'username', width: 180 },
    { title: text('显示名称', 'Display name'), dataIndex: 'displayName', key: 'displayName', width: 180 },
    {
      title: text('角色', 'Roles'),
      dataIndex: 'roles',
      key: 'roles',
      width: 260,
      render: (userRoles: SystemRoleRead[], user) => renderUserRoles(userRoles, user.roleIds),
    },
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
      title: text('API 用量', 'API usage'),
      key: 'apiUsage',
      width: 170,
      render: (_, user) => formatApiUsage(user.apiUsed, user.apiQuota, text),
    },
    {
      title: text('额度重置时间', 'Quota reset at'),
      dataIndex: 'apiQuotaResetAt',
      key: 'apiQuotaResetAt',
      width: 180,
      render: (value?: string | null) => value || '—',
    },
    {
      title: text('操作', 'Actions'),
      key: 'actions',
      width: 110,
      render: (_, user) => (
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditModal(user)}>
          {text('编辑', 'Edit')}
        </Button>
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
      className="system-users"
      title={text('用户管理', 'User Management')}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadPageData(query, pagination.page, pagination.pageSize)}>
            {text('刷新', 'Refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {text('新增用户', 'Add user')}
          </Button>
        </Space>
      }
    >
      {contextHolder}
      <div className="system-users__toolbar">
        <Space wrap>
          <InputNumber
            min={1}
            precision={0}
            placeholder={text('用户 ID', 'User ID')}
            value={searchDraft.id}
            className="system-users__id-filter"
            onChange={(value) => setSearchDraft((current) => ({ ...current, id: typeof value === 'number' ? value : undefined }))}
          />
          <Input
            allowClear
            placeholder={text('用户名 / 显示名称', 'Username / display name')}
            value={searchDraft.name}
            className="system-users__name-filter"
            onChange={(event) => setSearchDraft((current) => ({ ...current, name: event.target.value }))}
            onPressEnter={applySearch}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={applySearch}>
            {text('查询', 'Search')}
          </Button>
          <Button onClick={resetSearch}>{text('重置', 'Reset')}</Button>
        </Space>
      </div>

      <Table<SystemUserRead>
        className="system-users__table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={users}
        tableLayout="fixed"
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => text(`共 ${total} 条`, `${total} total`),
          onChange: (page, pageSize) => void loadUsers(query, page, pageSize),
        }}
      />

      <Modal
        title={null}
        className="menu-editor-modal"
        open={modalOpen}
        onCancel={closeUserModal}
        onOk={() => void submitUser()}
        afterOpenChange={handleUserModalOpenChange}
        confirmLoading={saving}
        width={720}
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
                  {editing ? text('编辑用户', 'Edit user') : text('新增用户', 'Add user')}
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
                  name="username"
                  label={text('用户名', 'Username')}
                  rules={[
                    { required: true, message: text('请输入用户名', 'Enter username') },
                    { min: 3, message: text('用户名至少 3 个字符', 'Username must be at least 3 characters') },
                  ]}
                >
                  <Input placeholder="jellyfish_user" />
                </Form.Item>
                {!editing && (
                  <Form.Item
                    name="displayName"
                    label={text('显示名称', 'Display name')}
                    rules={[{ required: true, message: text('请输入显示名称', 'Enter display name') }]}
                  >
                    <Input placeholder={text('内容编辑', 'Content Editor')} />
                  </Form.Item>
                )}
                <Form.Item
                  name="password"
                  label={editing ? text('新密码（留空不修改）', 'New password (leave blank to keep)') : text('初始密码', 'Initial password')}
                  className="menu-editor__wide"
                  rules={[
                    { required: !editing, message: text('请输入初始密码', 'Enter initial password') },
                    { min: 8, message: text('密码至少 8 个字符', 'Password must be at least 8 characters') },
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
                <Form.Item
                  name="roleIds"
                  label={text('角色', 'Roles')}
                  className="menu-editor__wide"
                  rules={[{ required: true, type: 'array', min: 1, message: text('请至少选择一个角色', 'Select at least one role') }]}
                >
                  <Select
                    mode="multiple"
                    placeholder={text('选择角色', 'Select roles')}
                    options={roleOptions}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
              </div>
            </div>

            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{text('额度与状态', 'Quota and status')}</div>
              <div className="menu-editor__grid">
                <Form.Item name="apiQuota" label={text('API 总额度', 'Total API quota')}>
                  <InputNumber min={0} precision={0} className="w-full" />
                </Form.Item>
                <Form.Item
                  name="apiQuotaResetAt"
                  label={text('额度重置时间', 'Quota reset at')}
                >
                  <DatePicker
                    allowClear
                    showTime={{ format: 'HH:mm:ss' }}
                    format="YYYY-MM-DD HH:mm:ss"
                    placeholder={text('选择额度重置时间', 'Select reset time')}
                    className="system-users__date-picker"
                  />
                </Form.Item>
                {editing && (
                  <Form.Item label={text('启用状态', 'Active state')} className="menu-editor__wide system-users__switch-item">
                    <div className="system-users__switch-row">
                      <Form.Item name="active" valuePropName="checked" noStyle>
                        <Switch />
                      </Form.Item>
                      <span>{text('启用后该用户可以登录系统', 'The user can sign in when active')}</span>
                    </div>
                  </Form.Item>
                )}
              </div>
            </div>
          </Form>
        </div>
      </Modal>
    </Card>
  )
}

/** 渲染用户角色标签，优先使用后端返回的角色对象，缺失时回退展示角色 ID。 */
function renderUserRoles(roles: SystemRoleRead[] | undefined, roleIds: number[]): React.ReactNode {
  if (roles?.length) {
    const visibleRoles = roles.slice(0, 2)
    return (
      <Space size={[4, 4]} wrap>
        {visibleRoles.map((role) => (
          <Tag key={role.id} color={role.active ? 'blue' : 'default'}>
            {role.name}
          </Tag>
        ))}
        {roles.length > visibleRoles.length && <Tag>+{roles.length - visibleRoles.length}</Tag>}
      </Space>
    )
  }
  if (!roleIds.length) return '—'
  return (
    <Space size={[4, 4]} wrap>
      {roleIds.map((roleId) => <Tag key={roleId}>#{roleId}</Tag>)}
    </Space>
  )
}

/** 格式化 API 用量，额度为 0 时按不限展示。 */
function formatApiUsage(used: number, quota: number, text: (zh: string, en: string) => string): string {
  if (quota <= 0) return text('不限', 'Unlimited')
  return `${used.toLocaleString()} / ${quota.toLocaleString()}`
}

/** 将 Java 后端时间字符串转换为 AntD 时间选择器可识别的 Dayjs 值。 */
function toDateTimePickerValue(value?: string | null): Dayjs | null {
  const normalizedValue = normalizeNullableText(value)
  if (!normalizedValue) return null
  const parsedValue = dayjs(normalizedValue.replace(' ', 'T'))
  return parsedValue.isValid() ? parsedValue : null
}

/** 将时间选择器的值转换为 Java 后端要求的时间字符串。 */
function normalizeDateTimeForApi(value?: Dayjs | null): string | null {
  if (!value) return null
  return value.format('YYYY-MM-DD HH:mm:ss')
}

export default AdminUsers
