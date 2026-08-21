import React, { useEffect, useState } from 'react'
import {
  Layout,
  Button,
  Input,
  Select,
  Space,
  Tabs,
  InputNumber,
  Slider,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { useBilingualText } from '../../../i18n/useBilingualText'

type AgentTypeKey = 'plot' | 'character' | 'scene' | 'prop' | 'other'

type Agent = {
  id: string
  name: string
  type: AgentTypeKey
  description: string
}

export default function AgentEdit() {
  const l = useBilingualText()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [agent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<AgentTypeKey>('plot')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [testInput, setTestInput] = useState('')
  const [testOutput, setTestOutput] = useState('')
  const [testLogs, setTestLogs] = useState<string[]>([])
  const [testPanelCollapsed, setTestPanelCollapsed] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [topP, setTopP] = useState(0.9)
  const [testTab, setTestTab] = useState<'output' | 'history'>('output')

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      throw new Error('agent api unavailable')
    } catch {
      message.error(l('Agent 后端接口尚未接入，当前不读取 mock 数据', 'Agent backend API is not connected yet. Mock data is no longer read.'))
      navigate('/agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      message.warning(l('Agent 后端接口尚未接入，无法保存 Agent', 'Agent backend API is not connected yet; the agent cannot be saved.'))
    } catch {
      message.error(l('保存失败', 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  const handleRunTest = async () => {
    setTesting(true)
    setTestLogs([])
    setTestOutput('')
    try {
      setTestLogs((logs) => [...logs, l('[INFO] Agent 测试已收口到后端接口，前端不再模拟 LLM 调用。', '[INFO] Agent tests must run through backend APIs; the frontend no longer simulates LLM calls.')])
      setTestOutput(l('当前没有 generated 后端 Agent 执行接口可调用。请先补后端接口并重新生成 OpenAPI client。', 'No generated backend Agent execution API is available yet. Add the backend endpoint and regenerate the OpenAPI client first.'))
    } catch {
      setTestLogs((logs) => [...logs, l('[ERROR] 执行失败', '[ERROR] Execution failed')])
      message.error(l('测试执行失败', 'Test execution failed'))
    } finally {
      setTesting(false)
    }
  }

  // 简易工作流占位节点（后续可替换为 React Flow）
  const workflowNodes = [
    { id: 'start', label: l('开始', 'Start'), type: 'start' },
    { id: 'llm1', label: l('LLM 提取', 'LLM extraction'), type: 'llm' },
    { id: 'end', label: l('结束', 'End'), type: 'end' },
  ]

  if (loading || !agent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        {loading ? l('加载中...', 'Loading...') : null}
      </div>
    )
  }

  return (
    <Layout className="h-full flex flex-col" style={{ minHeight: 0 }}>
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/agents')}>
          {l('返回列表', 'Back to list')}
        </Button>
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="font-medium w-48"
          placeholder={l('Agent 名称', 'Agent name')}
        />
        <Select
          value={editType}
          onChange={setEditType}
          options={[
            { value: 'plot', label: l('剧情提取', 'Plot extraction') },
            { value: 'character', label: l('角色提取', 'Character extraction') },
            { value: 'scene', label: l('场景提取', 'Scene extraction') },
            { value: 'prop', label: l('道具提取', 'Prop extraction') },
            { value: 'other', label: l('其他类型', 'Other') },
          ]}
          style={{ width: 140 }}
        />
        <Space className="ml-auto">
          <Button icon={<HistoryOutlined />}>{l('版本管理', 'Version history')}</Button>
          <Button icon={<ThunderboltOutlined />} loading={testing} onClick={() => void handleRunTest()}>
            {l('测试', 'Test')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
            {l('保存', 'Save')}
          </Button>
        </Space>
      </div>

      {/* 双栏：工作流 + 属性 */}
      <Layout className="flex-1 min-h-0 flex-row overflow-hidden">
        {/* 左侧：工作流编辑器占位 */}
        <div className="flex-1 min-w-0 overflow-auto p-4 bg-gray-50 border-r border-gray-200">
          <div className="text-sm text-gray-500 mb-2">{l('工作流编排（可接入 React Flow）', 'Workflow editor (React Flow can be integrated)')}</div>
          <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 min-h-[320px]">
            <div className="flex flex-col items-center gap-4">
              {workflowNodes.map((node, i) => (
                <React.Fragment key={node.id}>
                  <div
                    className={`px-4 py-2 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedNodeId === node.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                    onClick={() => setSelectedNodeId(selectedNodeId === node.id ? null : node.id)}
                  >
                    <span className="font-medium">{node.label}</span>
                    <span className="ml-2 text-xs text-gray-400">({node.type})</span>
                  </div>
                  {i < workflowNodes.length - 1 && (
                    <div className="w-0.5 h-6 bg-gray-300" />
                  )}
                </React.Fragment>
              ))}
            </div>
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button size="small" icon={<PlusOutlined />}>
                {l('添加节点', 'Add node')}
              </Button>
            </div>
          </div>
        </div>

        {/* 右侧：节点属性配置 */}
        <div className="w-96 flex-shrink-0 overflow-auto border-l border-gray-200 bg-white">
          <div className="p-4 border-b border-gray-100 font-medium flex items-center gap-2">
            <SettingOutlined />
            {l('节点属性', 'Node properties')}
          </div>
          <div className="p-4 space-y-4">
            {selectedNodeId ? (
              <>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">{l('提示词', 'Prompt')}</label>
                  <Input.TextArea
                    rows={6}
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    placeholder={l('输入系统提示词...', 'Enter a system prompt...')}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">{l('温度', 'Temperature')}</label>
                  <Slider min={0} max={2} step={0.1} value={temperature} onChange={setTemperature} />
                  <span className="text-xs text-gray-400">{temperature}</span>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Top-P</label>
                  <Slider min={0} max={1} step={0.05} value={topP} onChange={setTopP} />
                  <span className="text-xs text-gray-400">{topP}</span>
                </div>
                {agent.type === 'plot' && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{l('主线保留阈值', 'Main-plot retention threshold')}</label>
                    <InputNumber min={0} max={1} step={0.1} defaultValue={0.5} className="w-full" />
                  </div>
                )}
                {agent.type === 'character' && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">{l('角色数量上限', 'Maximum characters')}</label>
                    <InputNumber min={1} max={100} defaultValue={20} className="w-full" />
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-500 text-sm">{l('在左侧点击节点以编辑属性', 'Select a node on the left to edit its properties')}</div>
            )}
          </div>
        </div>
      </Layout>

      {/* 底部测试区 */}
      <div
        className="flex-shrink-0 border-t border-gray-200 bg-white flex flex-col"
        style={{ height: testPanelCollapsed ? 48 : 280 }}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-gray-100 cursor-pointer"
          onClick={() => setTestPanelCollapsed(!testPanelCollapsed)}
        >
          <Space>
            <PlayCircleOutlined />
            <span className="font-medium">{l('测试区', 'Test panel')}</span>
          </Space>
          <Button type="text" size="small">
            {testPanelCollapsed ? l('展开', 'Expand') : l('收起', 'Collapse')}
          </Button>
        </div>
        {!testPanelCollapsed && (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div className="w-1/2 flex flex-col border-r border-gray-100 p-3">
              <div className="text-sm text-gray-500 mb-1">{l('输入（剧本片段 / JSON）', 'Input (script excerpt / JSON)')}</div>
              <Input.TextArea
                placeholder={l('粘贴剧本或测试数据...', 'Paste a script or test data...')}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                className="flex-1 font-mono text-sm resize-none"
                rows={6}
              />
              <Button type="primary" icon={<ThunderboltOutlined />} loading={testing} className="mt-2" onClick={() => void handleRunTest()}>
                {l('运行', 'Run')}
              </Button>
            </div>
            <div className="w-1/2 flex flex-col overflow-hidden p-3">
              <Tabs
                activeKey={testTab}
                onChange={(k) => setTestTab(k as 'output' | 'history')}
                size="small"
                items={[
                  { key: 'output', label: l('输出', 'Output') },
                  { key: 'history', label: l('历史记录', 'History') },
                ]}
              />
              {testTab === 'output' && (
                <>
                  <div className="text-xs text-gray-500 mb-1 overflow-auto flex-1 font-mono whitespace-pre-wrap bg-gray-50 p-2 rounded">
                    {testLogs.length > 0 && (
                      <div className="mb-2 text-gray-600">
                        {testLogs.map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    )}
                    {testOutput || l('运行后在此显示结果', 'Results will appear here after running')}
                  </div>
                </>
              )}
              {testTab === 'history' && (
                <div className="text-gray-500 text-sm flex-1 overflow-auto">{l('暂无历史测试记录', 'No test history')}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
