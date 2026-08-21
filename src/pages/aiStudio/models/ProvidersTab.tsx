import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  Layout,
  Modal,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons'
import type { ProviderRead, ProviderStatus } from '../../../services/generated'
import { PROVIDER_STATUS_MAP } from './constants'
import { useBilingualText } from '../../../i18n/useBilingualText'
import {
  SystemSuppliersApi,
  type SystemSupplierCreateRequest,
  type SystemSupplierRead,
} from '../../../services/systemSuppliers'
import '../../system/MenuManagement.css'

type ProviderListItem = ProviderRead & {
  updatedAt?: string | null
}

function mapSystemSupplier(supplier: SystemSupplierRead): ProviderListItem {
  return {
    id: String(supplier.id),
    name: supplier.name,
    base_url: supplier.baseUrl,
    description: supplier.description ?? '',
    status: supplier.active ? 'active' : 'disabled',
    api_key_status: supplier.apiKeyConfigured ? 'present' : 'missing',
    updatedAt: supplier.updatedAt,
  }
}

/** 展示由后端托管的模型供应商，并提供安全的新增入口。 */
export default function ProvidersTab() {
  const l = useBilingualText()
  const { message } = App.useApp()
  const { lg } = Grid.useBreakpoint()
  const isLargeScreen = lg ?? false
  const [providers, setProviders] = useState<ProviderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState<ProviderRead | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm<SystemSupplierCreateRequest>()

  /** 将后端状态枚举转换为当前页面展示文案。 */
  const statusText = (status: ProviderStatus) =>
    status === 'active'
      ? l('活跃', 'Active')
      : status === 'testing'
        ? l('测试中', 'Testing')
        : l('禁用', 'Disabled')

  /** 从系统供应商接口加载完整供应商列表。 */
  const load = async () => {
    setLoading(true)
    try {
      const suppliers = await SystemSuppliersApi.getAll()
      setProviders(suppliers.map(mapSystemSupplier))
    } catch {
      message.error(l('加载供应商失败', 'Failed to load providers'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const providerList = useMemo(() => {
    return [...providers].sort((a, b) =>
      String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
    )
  }, [providers])

  const openCreateModal = () => {
    setCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    setCreateModalOpen(false)
  }

  const handleCreateModalOpenChange = (open: boolean) => {
    if (open) {
      createForm.resetFields()
      createForm.setFieldsValue({ active: true, apiSecret: '', description: '' })
      return
    }
    createForm.resetFields()
  }

  /** 创建成功后重新读取列表，确保页面展示后端的最终数据。 */
  const handleCreateProvider = async () => {
    let values: SystemSupplierCreateRequest
    try {
      values = await createForm.validateFields()
    } catch {
      return
    }

    setCreating(true)
    try {
      await SystemSuppliersApi.create({
        name: values.name.trim(),
        baseUrl: values.baseUrl.trim(),
        apiKey: values.apiKey.trim(),
        apiSecret: values.apiSecret?.trim() ?? '',
        description: values.description?.trim() ?? '',
        active: values.active,
      })
      message.success(l('供应商创建成功', 'Provider created successfully'))
      closeCreateModal()
      await load()
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : l('供应商创建失败', 'Failed to create provider'),
      )
    } finally {
      setCreating(false)
    }
  }

  const providerColumns: TableColumnsType<ProviderRead> = [
    {
      title: l('名称', 'Name'),
      dataIndex: 'name',
      key: 'name',
      width: '28%',
      ellipsis: true,
      render: (name: string) => <span className="font-medium">{name}</span>,
    },
    {
      title: l('描述', 'Description'),
      dataIndex: 'description',
      key: 'description',
      width: '40%',
      ellipsis: true,
      render: (description: string) => <Tooltip title={description}>{description || '—'}</Tooltip>,
    },
    {
      title: l('状态', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: '14%',
      align: 'center',
      render: (status: ProviderStatus) => (
        <Tag color={PROVIDER_STATUS_MAP[status ?? 'active']?.color}>{statusText(status ?? 'active')}</Tag>
      ),
    },
    {
      title: l('创建人', 'Creator'),
      dataIndex: 'created_by',
      key: 'created_by',
      width: '18%',
      align: 'center',
      render: (creator: string) => creator || '—',
    },
  ]

  return (
    <>
      <div className="flex-shrink-0 border-b border-gray-100 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-600">
            {l('共 {{count}} 个供应商', '{{count}} providers').replace('{{count}}', String(providers.length))}
          </span>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {l('添加供应商', 'Add provider')}
          </Button>
        </div>
      </div>

      <Layout className="min-h-0 flex-1 flex-row overflow-hidden">
        <div
          className="flex-shrink-0 overflow-auto border-r border-gray-200 bg-white"
          style={{ width: treeCollapsed ? 48 : 220 }}
        >
          {treeCollapsed ? (
            <Button
              type="text"
              icon={<RightOutlined />}
              onClick={() => setTreeCollapsed(false)}
              className="w-full rounded-none"
            />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-sm font-medium text-gray-700">{l('边界', 'Boundary')}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<RightOutlined rotate={180} />}
                  onClick={() => setTreeCollapsed(true)}
                />
              </div>
              <div className="space-y-2 p-3 text-sm text-gray-500">
                <div>{l('供应商连接信息由后端统一管理。', 'Provider connections are managed by the backend.')}</div>
                <div>{l('密钥提交后不会在前端回显。', 'Secrets are not displayed after submission.')}</div>
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-auto bg-gray-50 p-4">
          {providerList.length === 0 ? (
            <Card>
              <Empty
                description={
                  loading
                    ? l('正在加载供应商', 'Loading providers')
                    : l('暂无供应商配置', 'No provider configuration')
                }
              />
            </Card>
          ) : (
            <Card>
              <Table<ProviderRead>
                rowKey="id"
                loading={loading}
                columns={providerColumns}
                dataSource={providerList}
                scroll={{ x: 760 }}
                pagination={{ pageSize: 20 }}
                onRow={(record) => ({
                  onClick: () => {
                    setSelectedProvider(record)
                    setDetailPanelOpen(true)
                  },
                  style: { cursor: 'pointer' },
                })}
                size="small"
              />
            </Card>
          )}
        </div>

        {selectedProvider && isLargeScreen && (
          <div
            className="flex-shrink-0 overflow-auto border-l border-gray-200 bg-white"
            style={{ width: '36%', minWidth: 320 }}
          >
            <ProviderDetail
              provider={selectedProvider}
              onClose={() => {
                setDetailPanelOpen(false)
                setSelectedProvider(null)
              }}
            />
          </div>
        )}

        {selectedProvider && !isLargeScreen && (
          <Drawer
            title={l('详情', 'Details')}
            placement="right"
            open={detailPanelOpen}
            onClose={() => setDetailPanelOpen(false)}
            width="min(100%, 400px)"
          >
            <ProviderDetail
              provider={selectedProvider}
            />
          </Drawer>
        )}
      </Layout>

      <Modal
        title={null}
        open={createModalOpen}
        onCancel={closeCreateModal}
        onOk={() => void handleCreateProvider()}
        afterOpenChange={handleCreateModalOpenChange}
        confirmLoading={creating}
        width={720}
        className="menu-editor-modal"
        okText={l('保存', 'Save')}
        cancelText={l('取消', 'Cancel')}
        destroyOnHidden
      >
        <div className="menu-editor">
          <div className="menu-editor__header">
            <div>
              <div className="menu-editor__eyebrow">{l('模型管理', 'Model Management')}</div>
              <div className="menu-editor__title-row">
                <Typography.Title level={4} className="menu-editor__title">
                  {l('新增供应商', 'Add provider')}
                </Typography.Title>
                <Tag color="green" className="menu-editor__mode">
                  {l('新增', 'Creating')}
                </Tag>
              </div>
            </div>
          </div>

          <Form form={createForm} layout="vertical" className="menu-editor__form">
            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{l('基础信息', 'Basic information')}</div>
              <div className="menu-editor__grid">
                <Form.Item
                  name="name"
                  label={l('供应商名称', 'Provider name')}
                  rules={[{ required: true, whitespace: true, message: l('请输入供应商名称', 'Enter a provider name') }]}
                >
                  <Input placeholder={l('例如：KIE API', 'Example: KIE API')} maxLength={100} />
                </Form.Item>
                <Form.Item name="description" label={l('描述', 'Description')}>
                  <Input placeholder={l('例如：Kie 平台', 'Example: Kie platform')} maxLength={500} />
                </Form.Item>
                <Form.Item
                  name="baseUrl"
                  label="Base URL"
                  className="menu-editor__wide"
                  rules={[
                    { required: true, whitespace: true, message: l('请输入 Base URL', 'Enter a Base URL') },
                    { type: 'url', message: l('请输入正确的 URL', 'Enter a valid URL') },
                  ]}
                >
                  <Input placeholder="https://api.example.com/api/v1" />
                </Form.Item>
              </div>
            </div>

            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{l('接入凭证', 'Access credentials')}</div>
              <div className="menu-editor__grid">
                <Form.Item
                  name="apiKey"
                  label="API Key"
                  rules={[{ required: true, whitespace: true, message: l('请输入 API Key', 'Enter an API key') }]}
                >
                  <Input.Password placeholder={l('请输入 API Key', 'Enter an API key')} autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="apiSecret" label="API Secret">
                  <Input.Password placeholder={l('选填', 'Optional')} autoComplete="new-password" />
                </Form.Item>
                <Form.Item label={l('启用状态', 'Active status')} className="menu-editor__switch-item menu-editor__wide">
                  <div className="menu-editor__switch-row">
                    <Form.Item name="active" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                    <span>{l('启用后可用于模型配置与任务调度', 'Available for model configuration and dispatch when active')}</span>
                  </div>
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>
    </>
  )
}

type ProviderDetailProps = {
  provider: ProviderRead
  onClose?: () => void
}

/** 展示供应商详情，敏感连接信息不会从后端响应中回显。 */
function ProviderDetail({ provider, onClose }: ProviderDetailProps) {
  const l = useBilingualText()
  const status = provider.status ?? 'active'

  return (
    <div className="space-y-4 p-4">
      {onClose && (
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <span className="font-medium">{l('详情', 'Details')}</span>
          <Button type="link" size="small" onClick={onClose}>
            {l('收起', 'Collapse')}
          </Button>
        </div>
      )}
      <Alert
        type="info"
        showIcon
        message={l('模型供应商由后端统一管理', 'Model providers are managed by the backend')}
        description={l('API Key 和 API Secret 等敏感信息不会在详情中回显。', 'Sensitive values such as API keys and secrets are not displayed in details.')}
      />
      <div>
        <div className="mb-1 text-sm text-gray-500">{l('名称', 'Name')}</div>
        <div className="font-medium">{provider.name}</div>
      </div>
      <div>
        <div className="mb-1 text-sm text-gray-500">{l('状态', 'Status')}</div>
        <Tag color={PROVIDER_STATUS_MAP[status]?.color}>{PROVIDER_STATUS_MAP[status]?.text}</Tag>
      </div>
      <div>
        <div className="mb-1 text-sm text-gray-500">{l('描述', 'Description')}</div>
        <div className="text-sm text-gray-700">{provider.description || '—'}</div>
      </div>
      <div>
        <div className="mb-1 text-sm text-gray-500">{l('创建人', 'Creator')}</div>
        <div>{provider.created_by || '—'}</div>
      </div>
    </div>
  )
}
