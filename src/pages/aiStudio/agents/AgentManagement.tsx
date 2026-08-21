import React, { useEffect, useState, useMemo } from 'react'
import {
  Layout,
  Tabs,
  Input,
  Button,
  Table,
  Tag,
  Space,
  Tree,
  Drawer,
  Card,
  Dropdown,
  Modal,
  message,
  Tooltip,
  Empty,
  Grid,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  CopyOutlined,
  ExportOutlined,
  MenuOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  DownOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useBilingualText } from '../../../i18n/useBilingualText'

type AgentTypeKey = 'plot' | 'character' | 'scene' | 'prop' | 'other'

type Agent = {
  id: string
  name: string
  type: AgentTypeKey
  description: string
  isDefault: boolean
  version: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

const AGENT_TYPE_DEFS: { key: AgentTypeKey; color: string }[] = [
  { key: 'plot', color: 'blue' },
  { key: 'character', color: 'green' },
  { key: 'scene', color: 'orange' },
  { key: 'prop', color: 'purple' },
  { key: 'other', color: 'default' },
]

const typeColorMap = Object.fromEntries(AGENT_TYPE_DEFS.map((item) => [item.key, item.color]))

const AGENT_API_UNAVAILABLE = true

export default function AgentManagement() {
  const l = useBilingualText()
  const agentTypes = [
    { key: 'plot' as const, label: l('剧情提取', 'Plot extraction'), color: 'blue' },
    { key: 'character' as const, label: l('角色提取', 'Character extraction'), color: 'green' },
    { key: 'scene' as const, label: l('场景提取', 'Scene extraction'), color: 'orange' },
    { key: 'prop' as const, label: l('道具提取', 'Prop extraction'), color: 'purple' },
    { key: 'other' as const, label: l('其他类型', 'Other'), color: 'default' },
  ]
  const typeLabelMap = Object.fromEntries(agentTypes.map((item) => [item.key, item.label]))
  const sortOptions = [
    { value: 'updated', label: l('最近更新', 'Recently updated') },
    { value: 'name', label: l('名称', 'Name') },
  ]
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'name'>('updated')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState<AgentTypeKey>('plot')
  const [createDesc, setCreateDesc] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<AgentTypeKey | null>(null)
  const { lg } = Grid.useBreakpoint()
  const isLargeScreen = lg ?? false

  const load = async () => {
    setLoading(true)
    setAgents([])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredList = useMemo(() => {
    let list = agents
    // 左侧树选中时以树为准，否则用 Tab
    if (typeFilter) {
      list = list.filter((a) => a.type === typeFilter)
    } else if (activeTab !== 'all') {
      list = list.filter((a) => a.type === activeTab)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          typeLabelMap[a.type]?.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.createdBy.toLowerCase().includes(q)
      )
    }
    if (sortBy === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    } else {
      list = [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }
    return list
  }, [agents, activeTab, typeFilter, search, sortBy])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length }
    agentTypes.forEach((t) => {
      counts[t.key] = agents.filter((a) => a.type === t.key).length
    })
    return counts
  }, [agents])

  const treeData = useMemo(
    () =>
      agentTypes.map((t) => ({
        key: t.key,
        title: `${t.label} (${typeCounts[t.key] ?? 0})`,
        isLeaf: true,
      })),
    [typeCounts]
  )

  const handleRowClick = (record: Agent) => {
    setSelectedAgent(record)
    setDetailPanelOpen(true)
  }

  const handleSetDefault = async (agent: Agent) => {
    try {
      message.warning(l(`Agent 后端接口尚未接入，无法设置「${agent.name}」为默认 Agent`, `Agent backend API is not connected yet; ${agent.name} cannot be set as the default agent.`))
    } catch {
      message.error(l('设置失败', 'Failed to update'))
    }
  }

  const handleBatchDelete = () => {
    Modal.confirm({
      title: l('批量删除', 'Delete selected'),
      content: l(`确定删除选中的 ${selectedRowKeys.length} 个 Agent？`, `Delete ${selectedRowKeys.length} selected agents?`),
      okText: l('删除', 'Delete'),
      okType: 'danger',
      onOk: async () => {
        message.warning(l('Agent 后端接口尚未接入，无法删除 Agent', 'Agent backend API is not connected yet; agents cannot be deleted.'))
      },
    })
  }

  const handleCreate = async () => {
    if (!createName.trim()) {
      message.warning(l('请输入 Agent 名称', 'Enter an agent name'))
      return
    }
    setCreateLoading(true)
    try {
      message.warning(l('Agent 后端接口尚未接入，无法创建 Agent', 'Agent backend API is not connected yet; agents cannot be created.'))
    } catch {
      message.error(l('创建失败', 'Failed to create'))
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation()
    Modal.confirm({
      title: l('删除 Agent', 'Delete agent'),
      content: l(`确定删除「${agent.name}」？`, `Delete “${agent.name}”?`),
      okText: l('删除', 'Delete'),
      okType: 'danger',
      onOk: async () => {
        message.warning(l('Agent 后端接口尚未接入，无法删除 Agent', 'Agent backend API is not connected yet; agents cannot be deleted.'))
      },
    })
  }

  const tableColumns: TableColumnsType<Agent> = [
    {
      title: l('名称', 'Name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name, record) => (
        <Space>
          {record.isDefault && (
            <StarFilled style={{ color: '#faad14' }} title={l('默认', 'Default')} />
          )}
          <span>{name}</span>
        </Space>
      ),
    },
    {
      title: l('类型', 'Type'),
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (type: AgentTypeKey) => (
        <Tag color={typeColorMap[type] ?? 'default'}>{typeLabelMap[type] ?? type}</Tag>
      ),
    },
    {
      title: l('描述', 'Description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => (
        <Tooltip title={desc}>
          <span>{desc || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: l('默认', 'Default'),
      dataIndex: 'isDefault',
      key: 'isDefault',
      width: 70,
      render: (isDefault: boolean, record) =>
        isDefault ? (
          <StarFilled style={{ color: '#faad14' }} />
        ) : (
          <StarOutlined
            className="text-gray-400 hover:text-amber-500"
            onClick={(e) => {
              e.stopPropagation()
              Modal.confirm({
                title: l('设为默认', 'Set as default'),
                content: l('此操作将替换当前该类型的默认 Agent。', 'This will replace the current default agent for this type.'),
                onOk: () => handleSetDefault(record),
              })
            }}
          />
        ),
    },
    {
      title: l('版本', 'Version'),
      key: 'version',
      width: 140,
      render: (_, record) => l(`${record.version} (更新于 ${record.updatedAt})`, `${record.version} (updated ${record.updatedAt})`),
    },
    {
      title: l('创建者/更新', 'Creator / updated'),
      key: 'creator',
      width: 120,
      render: (_, record) => `${record.updatedBy} / ${record.updatedAt}`,
    },
    {
      title: l('操作', 'Actions'),
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => navigate(`/agents/${record.id}/edit`)}>
            {l('编辑', 'Edit')}
          </Button>
          <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={() => navigate(`/agents/${record.id}/edit?test=1`)}>
            {l('测试', 'Test')}
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'copy', label: l('复制', 'Copy'), icon: <CopyOutlined /> },
                { key: 'export', label: l('导出', 'Export'), icon: <ExportOutlined /> },
                { type: 'divider' },
                {
                  key: 'delete',
                  label: l('删除', 'Delete'),
                  danger: true,
                  icon: <DeleteOutlined />,
                  onClick: () => handleDelete(record, { stopPropagation: () => {} } as unknown as React.MouseEvent),
                },
              ],
            }}
            trigger={['click']}
          >
            <Button type="link" size="small" icon={<MenuOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ]

  return (
    <Layout className="h-full flex flex-col" style={{ minHeight: 0 }}>
      {/* 顶部区域 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800">{l('Agent 管理', 'Agent management')}</span>
            <span className="text-gray-500 text-sm">{l('总计 {{count}} 个 Agent', '{{count}} agents').replace('{{count}}', String(agents.length))}</span>
          </div>
          <Space wrap>
            <Tooltip title={AGENT_API_UNAVAILABLE ? l('需要先接入后端 Agent 接口并重新生成 OpenAPI client', 'Connect the backend Agent API and regenerate the OpenAPI client first.') : undefined}>
              <Button type="primary" icon={<PlusOutlined />} disabled={AGENT_API_UNAVAILABLE} onClick={() => setCreateModalOpen(true)}>
                {l('创建新 Agent', 'Create agent')}
              </Button>
            </Tooltip>
            <Input
              placeholder={l('按名称/类型/创建者搜索', 'Search by name, type, or creator')}
              prefix={<SearchOutlined className="text-gray-400" />}
              allowClear
              className="w-52"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Dropdown
              menu={{
                items: sortOptions.map((o) => ({
                  key: o.value,
                  label: o.label,
                  onClick: () => setSortBy(o.value as 'updated' | 'name'),
                })),
              }}
            >
              <Button icon={<DownOutlined />}>{l('排序：', 'Sort: ')}{sortOptions.find((s) => s.value === sortBy)?.label}</Button>
            </Dropdown>
          </Space>
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          items={[
            { key: 'all', label: `${l('全部', 'All')} (${typeCounts.all})` },
            ...agentTypes.map((t) => ({
              key: t.key,
              label: `${t.label} (${typeCounts[t.key]})`,
            })),
          ]}
        />
      </div>

      {/* 主体：左侧树 + 列表 + 右侧面板 */}
      <Layout className="flex-1 min-h-0 flex-row overflow-hidden">
        {/* 左侧类型树 */}
        <div
          className="flex-shrink-0 border-r border-gray-200 bg-white overflow-auto"
          style={{ width: treeCollapsed ? 48 : 200 }}
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
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-700">{l('类型筛选', 'Type filter')}</span>
                <Button type="text" size="small" icon={<RightOutlined rotate={180} />} onClick={() => setTreeCollapsed(true)} />
              </div>
              <Tree
                selectedKeys={typeFilter ? [typeFilter] : []}
                treeData={treeData}
                showLine
                blockNode
                expandAction="click"
                onSelect={([key]) => setTypeFilter(key ? (key as AgentTypeKey) : null)}
                className="py-2"
              />
            </>
          )}
        </div>

        {/* 列表区 */}
        <div className="flex-1 min-w-0 overflow-auto p-4 bg-gray-50">
          <div className="flex justify-end gap-1 mb-2">
            <Button
              type={viewMode === 'table' ? 'primary' : 'default'}
              size="small"
              icon={<UnorderedListOutlined />}
              onClick={() => setViewMode('table')}
            />
            <Button
              type={viewMode === 'card' ? 'primary' : 'default'}
              size="small"
              icon={<AppstoreOutlined />}
              onClick={() => setViewMode('card')}
            />
          </div>

          {filteredList.length === 0 ? (
            <Card>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={agents.length === 0 ? l('Agent 后端接口尚未接入，当前不展示 mock 数据', 'Agent backend API is not connected yet. Mock data is no longer shown.') : l('无匹配结果', 'No matching results')}
              >
                {agents.length === 0 && (
                  <Button type="primary" icon={<PlusOutlined />} disabled={AGENT_API_UNAVAILABLE} onClick={() => setCreateModalOpen(true)}>
                    {l('创建第一个 Agent', 'Create the first agent')}
                  </Button>
                )}
              </Empty>
            </Card>
          ) : viewMode === 'table' ? (
            <Card className="mb-4">
              {selectedRowKeys.length > 0 && (
                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  <span className="text-gray-500 text-sm">{l('已选 {{count}} 项', '{{count}} selected').replace('{{count}}', String(selectedRowKeys.length))}</span>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={handleBatchDelete}>
                    {l('批量删除', 'Delete selected')}
                  </Button>
                </div>
              )}
              <Table<Agent>
                rowKey="id"
                loading={loading}
                columns={tableColumns}
                dataSource={filteredList}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys as React.Key[]),
                }}
                onRow={(record) => ({
                  onClick: () => handleRowClick(record),
                  style: { cursor: 'pointer' },
                })}
                size="small"
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredList.map((agent) => (
                <Card
                  key={agent.id}
                  hoverable
                  className="cursor-pointer transition-shadow"
                  style={{ minHeight: 220 }}
                  onClick={() => handleRowClick(agent)}
                  actions={[
                    <Button key="edit" type="text" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}/edit`) }}>{l('编辑', 'Edit')}</Button>,
                    <Button key="test" type="text" size="small" icon={<ThunderboltOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}/edit?test=1`) }}>{l('测试', 'Test')}</Button>,
                    <Dropdown
                      key="more"
                      menu={{
                        items: [
                          { key: 'copy', label: l('复制', 'Copy'), icon: <CopyOutlined /> },
                          { key: 'export', label: l('导出', 'Export'), icon: <ExportOutlined /> },
                          {
                            key: 'delete',
                            label: l('删除', 'Delete'),
                            danger: true,
                            icon: <DeleteOutlined />,
                            onClick: () => handleDelete(agent, { stopPropagation: () => {} } as unknown as React.MouseEvent),
                          },
                        ],
                      }}
                      trigger={['click']}
                    >
                      <Button type="text" size="small" icon={<MenuOutlined />} onClick={(e) => e.stopPropagation()}>{l('更多', 'More')}</Button>
                    </Dropdown>,
                  ]}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Tag color={typeColorMap[agent.type]}>{typeLabelMap[agent.type]}</Tag>
                    {agent.isDefault && <StarFilled style={{ color: '#faad14' }} />}
                  </div>
                  <div className="font-medium text-gray-900 mb-1 truncate" title={agent.name}>
                    {agent.name}
                  </div>
                  <div className="text-gray-500 text-sm line-clamp-2 mb-2" title={agent.description}>
                    {agent.description || '—'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {agent.version} · {l('更新：', 'Updated: ')}{agent.updatedAt}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* 右侧详情：桌面为侧栏，移动端为 Drawer */}
        {selectedAgent && isLargeScreen && (
            <div className="flex-shrink-0 overflow-auto border-l border-gray-200 bg-white" style={{ width: '36%', minWidth: 320 }}>
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <span className="font-medium">{l('Agent 详情', 'Agent details')}</span>
                <Button type="link" size="small" onClick={() => { setSelectedAgent(null); setDetailPanelOpen(false) }}>{l('收起', 'Collapse')}</Button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">{l('名称', 'Name')}</div>
                  <div className="font-medium">{selectedAgent.name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">{l('类型', 'Type')}</div>
                  <Tag color={typeColorMap[selectedAgent.type]}>{typeLabelMap[selectedAgent.type]}</Tag>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">{l('描述', 'Description')}</div>
                  <div className="text-gray-700 text-sm">{selectedAgent.description || '—'}</div>
                </div>
                <div className="text-sm text-gray-500">
                  {l('版本', 'Version')} {selectedAgent.version} · {l('更新于', 'Updated')} {selectedAgent.updatedAt} · {selectedAgent.updatedBy}
                </div>
                <Space>
                  <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/agents/${selectedAgent.id}/edit`)}>
                    {l('编辑', 'Edit')}
                  </Button>
                  <Button icon={<ThunderboltOutlined />} onClick={() => navigate(`/agents/${selectedAgent.id}/edit?test=1`)}>
                    {l('快速测试', 'Quick test')}
                  </Button>
                </Space>
              </div>
            </div>
        )}
        {selectedAgent && !isLargeScreen && (
            <Drawer
              title={l('Agent 详情', 'Agent details')}
              placement="right"
              open={detailPanelOpen}
              onClose={() => setDetailPanelOpen(false)}
              width="min(100%, 400px)"
            >
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">{l('名称', 'Name')}</div>
                  <div className="font-medium">{selectedAgent.name}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">{l('类型', 'Type')}</div>
                  <Tag color={typeColorMap[selectedAgent.type]}>{typeLabelMap[selectedAgent.type]}</Tag>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">{l('描述', 'Description')}</div>
                  <div className="text-gray-700 text-sm">{selectedAgent.description || '—'}</div>
                </div>
                <Space>
                  <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/agents/${selectedAgent.id}/edit`)}>
                    {l('编辑', 'Edit')}
                  </Button>
                  <Button icon={<ThunderboltOutlined />} onClick={() => navigate(`/agents/${selectedAgent.id}/edit?test=1`)}>
                    {l('快速测试', 'Quick test')}
                  </Button>
                </Space>
              </div>
            </Drawer>
        )}
      </Layout>

      {/* 创建 Agent 弹窗 */}
      <Modal
        title={l('创建新 Agent', 'Create agent')}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => void handleCreate()}
        confirmLoading={createLoading}
        okText={l('创建', 'Create')}
        width={480}
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm text-gray-600 mb-1">{l('名称', 'Name')}</label>
            <Input
              placeholder={l('例如：剧情提取Agent v2.1', 'Example: Plot Extraction Agent v2.1')}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{l('类型', 'Type')}</label>
            <Space wrap>
              {agentTypes.map((t) => (
                <Tag
                  key={t.key}
                  color={createType === t.key ? t.color : 'default'}
                  className="cursor-pointer"
                  onClick={() => setCreateType(t.key)}
                >
                  {t.label}
                </Tag>
              ))}
            </Space>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{l('描述（选填）', 'Description (optional)')}</label>
            <Input.TextArea
              rows={3}
              placeholder={l('简要描述该 Agent 的用途', 'Briefly describe what this agent does')}
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </Layout>
  )
}
