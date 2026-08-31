import { useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { Button, Form, Input, Modal, Pagination, Switch, Table, Tag, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { Plus } from 'lucide-react'
import { useBilingualText } from '../../../i18n/useBilingualText'
import {
  SystemPromptTemplatesApi,
  type SystemPromptTemplatePayload,
  type SystemPromptTemplateRead,
} from '../../../services/systemPromptTemplates'
import './PromptTemplateManager.css'

const PAGE_SIZE = 10

type CreatePromptForm = {
  category: string
  name: string
  content: string
  preview?: string
  system?: boolean
  defaultTemplate?: boolean
}

type PromptModalMode = 'create' | 'edit'

function getTemplateVariables(template: SystemPromptTemplateRead): string[] {
  return Array.isArray(template.variables) ? template.variables.filter(Boolean) : []
}

function compareTemplateId(template: SystemPromptTemplateRead, id: number | string | null): boolean {
  return id !== null && String(template.id) === String(id)
}

function formatDateTime(value?: string | null): string {
  return value?.trim() || '--'
}

function formatCategory(value?: string | null): string {
  return value?.trim() || '--'
}

const PromptTemplateManager: FC = () => {
  const l = useBilingualText()
  const [messageApi, contextHolder] = message.useMessage()
  const [templates, setTemplates] = useState<SystemPromptTemplateRead[]>([])
  const [selected, setSelected] = useState<SystemPromptTemplateRead | null>(null)
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [modalMode, setModalMode] = useState<PromptModalMode>('create')
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null)
  const [deletingTemplateId, setDeletingTemplateId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createForm] = Form.useForm<CreatePromptForm>()

  const filteredTemplates = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return templates
    return templates.filter((template) => {
      const haystack = [
        template.name,
        template.preview,
        template.category,
        template.content,
        ...getTemplateVariables(template),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [query, templates])

  const pagedTemplates = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredTemplates.slice(start, start + PAGE_SIZE)
  }, [filteredTemplates, page])

  const selectedId = selected?.id ?? null

  const loadTemplates = async (): Promise<SystemPromptTemplateRead[]> => {
    setLoading(true)
    try {
      const nextTemplates = await SystemPromptTemplatesApi.findAll()
      setTemplates(nextTemplates)
      setSelected((current) => {
        if (!current) return nextTemplates[0] ?? null
        return nextTemplates.find((template) => compareTemplateId(template, current.id)) ?? nextTemplates[0] ?? null
      })
      return nextTemplates
    } catch (error) {
      void messageApi.error(error instanceof Error ? error.message : l('加载模板失败', 'Failed to load templates'))
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTemplates()
  }, [])

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE))
    if (page > maxPage) {
      setPage(maxPage)
    }
  }, [filteredTemplates.length, page])

  useEffect(() => {
    if (pagedTemplates.length === 0) {
      if (selectedId !== null) setSelected(null)
      return
    }

    if (selectedId === null || !pagedTemplates.some((template) => compareTemplateId(template, selectedId))) {
      setSelected(pagedTemplates[0])
    }
  }, [pagedTemplates, selectedId])

  const handleSearch = (value: string) => {
    setSelected(null)
    setPage(1)
    setQuery(value.trim())
  }

  const handlePageChange = (nextPage: number) => {
    setSelected(null)
    setPage(nextPage)
  }

  const openCreateModal = () => {
    createForm.resetFields()
    setModalMode('create')
    setEditingTemplateId(null)
    createForm.setFieldsValue({
      category: '',
      system: false,
      defaultTemplate: false,
    })
    setFormOpen(true)
  }

  const openEditModal = (template: SystemPromptTemplateRead) => {
    setModalMode('edit')
    setEditingTemplateId(template.id)
    createForm.resetFields()
    createForm.setFieldsValue({
      category: template.category,
      name: template.name,
      preview: template.preview ?? '',
      content: template.content,
      system: Boolean(template.system),
      defaultTemplate: Boolean(template.defaultTemplate),
    })
    setFormOpen(true)
  }

  const buildPayload = (values: CreatePromptForm): SystemPromptTemplatePayload => ({
    category: values.category.trim(),
    name: values.name.trim(),
    preview: values.preview?.trim() ?? '',
    content: values.content.trim(),
    variableDefinitions: [],
    system: Boolean(values.system),
    defaultTemplate: Boolean(values.defaultTemplate),
  })

  const handleFormSubmit = async () => {
    try {
      const values = await createForm.validateFields()
      setSubmitting(true)
      const payload = buildPayload(values)

      if (modalMode === 'create') {
        await SystemPromptTemplatesApi.create(payload)
        messageApi.success(l('提示词已添加', 'Prompt added'))
        setFormOpen(false)
        createForm.resetFields()
        setSelected(null)
        setSearchText('')
        setQuery('')
        setPage(1)
        await loadTemplates()
        return
      }

      if (editingTemplateId === null) {
        messageApi.error(l('编辑目标不存在', 'The prompt to edit does not exist'))
        return
      }

      await SystemPromptTemplatesApi.update({
        id: editingTemplateId,
        ...payload,
      })
      messageApi.success(l('提示词已更新', 'Prompt updated'))
      setFormOpen(false)
      createForm.resetFields()
      const refreshedTemplates = await loadTemplates()
      setSelected(refreshedTemplates.find((template) => compareTemplateId(template, editingTemplateId)) ?? null)
      setEditingTemplateId(null)
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      void messageApi.error(
        error instanceof Error
          ? error.message
          : modalMode === 'create'
            ? l('添加提示词失败', 'Failed to add prompt')
            : l('更新提示词失败', 'Failed to update prompt'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTemplate = (template: SystemPromptTemplateRead) => {
    Modal.confirm({
      title: l('删除这个提示词？', 'Delete this prompt?'),
      content: l('删除后无法恢复，使用该模板的流程可能无法继续引用它。', 'This cannot be undone. Flows using this template may no longer be able to reference it.'),
      okText: l('删除', 'Delete'),
      cancelText: l('取消', 'Cancel'),
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        setDeletingTemplateId(template.id)
        try {
          await SystemPromptTemplatesApi.delete({ id: template.id })
          messageApi.success(l('提示词已删除', 'Prompt deleted'))
          if (compareTemplateId(template, selectedId)) {
            setSelected(null)
          }
          await loadTemplates()
        } catch (error) {
          void messageApi.error(error instanceof Error ? error.message : l('删除提示词失败', 'Failed to delete prompt'))
          throw error
        } finally {
          setDeletingTemplateId(null)
        }
      },
    })
  }

  const renderFlags = (template: SystemPromptTemplateRead) => (
    <div className="prompt-template-management__flags">
      {template.system ? (
        <Tag className="prompt-template-management__tag prompt-template-management__tag--system">
          {l('系统', 'System')}
        </Tag>
      ) : (
        <Tag className="prompt-template-management__tag">
          {l('自定义', 'Custom')}
        </Tag>
      )}
      {template.defaultTemplate && (
        <Tag className="prompt-template-management__tag prompt-template-management__tag--default">
          {l('默认', 'Default')}
        </Tag>
      )}
    </div>
  )

  const columns: ColumnsType<SystemPromptTemplateRead> = [
    {
      title: l('名称', 'Name'),
      dataIndex: 'name',
      width: 230,
      render: (_, record) => (
        <div className="prompt-template-management__table-name">
          <strong>{record.name}</strong>
          <small>{record.category}</small>
        </div>
      ),
    },
    {
      title: l('编码', 'Category'),
      dataIndex: 'category',
      width: 165,
      render: (category: string) => (
        <span className="prompt-template-management__category">{formatCategory(category)}</span>
      ),
    },
    {
      title: l('预览', 'Preview'),
      dataIndex: 'preview',
      width: 200,
      ellipsis: true,
      render: (preview: string | null | undefined) => preview || '--',
    },
    {
      title: l('属性', 'Flags'),
      width: 128,
      render: (_, record) => renderFlags(record),
    },
    {
      title: l('操作', 'Actions'),
      width: 156,
      render: (_, record) => (
        <div className="prompt-template-management__actions">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            className="prompt-template-management__action"
            onClick={(event) => {
              event.stopPropagation()
              openEditModal(record)
            }}
          >
            {l('编辑', 'Edit')}
          </Button>
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={deletingTemplateId === record.id}
            className="prompt-template-management__action prompt-template-management__action--danger"
            onClick={(event) => {
              event.stopPropagation()
              handleDeleteTemplate(record)
            }}
          >
            {l('删除', 'Delete')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="prompt-template-management">
      {contextHolder}
      <div className="prompt-template-management__surface">
        <header className="prompt-template-management__header">
          <div>
            <h2>{l('提示词模板管理', 'Prompt template management')}</h2>
            <span>
              {l(`共 ${filteredTemplates.length} 个模板`, `${filteredTemplates.length} templates`)}
            </span>
          </div>
          <Button
            type="primary"
            icon={<Plus size={15} strokeWidth={1.8} />}
            onClick={openCreateModal}
          >
            {l('添加提示词', 'Add prompt')}
          </Button>
        </header>

        <div className="prompt-template-management__toolbar">
          <Input.Search
            placeholder={l('搜索模板名称、类别、预览或内容', 'Search template name, category, preview, or content')}
            allowClear
            value={searchText}
            onSearch={handleSearch}
            onChange={(event) => {
              const value = event.target.value
              setSearchText(value)
              if (!value) {
                handleSearch('')
              }
            }}
          />
        </div>

        <div className="prompt-template-management__workspace">
          <section className="prompt-template-management__list-panel">
            <Table<SystemPromptTemplateRead>
              rowKey="id"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={pagedTemplates}
              tableLayout="fixed"
              scroll={{ x: 880 }}
              pagination={false}
              className="prompt-template-management__table"
              rowClassName={(record) =>
                compareTemplateId(record, selectedId) ? 'prompt-template-management__row--selected' : ''
              }
              onRow={(record) => ({
                onClick: () => setSelected(record),
              })}
            />
            <div className="prompt-template-management__pagination">
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={filteredTemplates.length}
                showSizeChanger={false}
                onChange={handlePageChange}
              />
            </div>
          </section>

          <aside className="prompt-template-management__detail-panel">
            {selected ? (
              <>
                <div className="prompt-template-management__detail-topbar">
                  <div>
                    <span>{l('详情', 'Details')}</span>
                    <h3>{selected.name}</h3>
                  </div>
                  <div className="prompt-template-management__actions">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      className="prompt-template-management__action"
                      onClick={() => openEditModal(selected)}
                    >
                      {l('编辑', 'Edit')}
                    </Button>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deletingTemplateId === selected.id}
                      className="prompt-template-management__action prompt-template-management__action--danger"
                      onClick={() => handleDeleteTemplate(selected)}
                    >
                      {l('删除', 'Delete')}
                    </Button>
                  </div>
                </div>

                <div className="prompt-template-management__meta-grid">
                  <div>
                    <span>{l('类别', 'Category')}</span>
                    <strong>{formatCategory(selected.category)}</strong>
                  </div>
                  <div>
                    <span>{l('更新时间', 'Updated at')}</span>
                    <strong>{formatDateTime(selected.updatedAt)}</strong>
                  </div>
                  <div>
                    <span>{l('变量数量', 'Variables')}</span>
                    <strong>{getTemplateVariables(selected).length}</strong>
                  </div>
                  <div>
                    <span>{l('属性', 'Flags')}</span>
                    {renderFlags(selected)}
                  </div>
                </div>

                <div className="prompt-template-management__preview">
                  <span>{l('预览', 'Preview')}</span>
                  <p>{selected.preview || l('暂无预览', 'No preview')}</p>
                </div>

                <div className="prompt-template-management__content-block">
                  <div className="prompt-template-management__section-title">
                    {l('模板内容', 'Template content')}
                  </div>
                  <pre>{selected.content}</pre>
                </div>

                {getTemplateVariables(selected).length > 0 && (
                  <div className="prompt-template-management__variables">
                    <div className="prompt-template-management__section-title">
                      {l('变量', 'Variables')}
                    </div>
                    <div>
                      {getTemplateVariables(selected).map((variable) => (
                        <span key={variable}>{variable}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="prompt-template-management__empty">
                {loading ? l('加载中...', 'Loading...') : l('暂无提示词模板', 'No prompt templates')}
              </div>
            )}
          </aside>
        </div>
      </div>

      <Modal
        title={null}
        open={formOpen}
        onCancel={() => {
          setFormOpen(false)
          setEditingTemplateId(null)
        }}
        onOk={handleFormSubmit}
        okText={l('保存', 'Save')}
        cancelText={l('取消', 'Cancel')}
        confirmLoading={submitting}
        destroyOnHidden
        width="min(860px, calc(100vw - 48px))"
        className="menu-editor-modal prompt-template-editor-modal"
      >
        <div className="menu-editor">
          <div className="menu-editor__header">
            <div>
              <div className="menu-editor__eyebrow">{l('提示词模板管理', 'Prompt Template Management')}</div>
              <div className="menu-editor__title-row">
                <Typography.Title level={4} className="menu-editor__title">
                  {modalMode === 'create' ? l('添加提示词', 'Add prompt') : l('编辑提示词', 'Edit prompt')}
                </Typography.Title>
                <Tag className="menu-editor__mode">
                  {modalMode === 'create' ? l('新增', 'Creating') : l('编辑', 'Editing')}
                </Tag>
              </div>
            </div>
          </div>

          <Form layout="vertical" form={createForm} className="menu-editor__form">
            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{l('基础信息', 'Basic information')}</div>
              <div className="menu-editor__grid">
                <Form.Item
                  label={l('模板类别', 'Template category')}
                  name="category"
                  rules={[{ required: true, whitespace: true, message: l('请输入模板类别', 'Enter a template category') }]}
                >
                  <Input maxLength={100} placeholder="character_sheet_zh" />
                </Form.Item>
                <Form.Item
                  label={l('模板名称', 'Template name')}
                  name="name"
                  rules={[{ required: true, whitespace: true, message: l('请输入模板名称', 'Enter a template name') }]}
                >
                  <Input maxLength={255} placeholder={l('例如：角色设定图中文模板', 'Example: Character sheet template')} />
                </Form.Item>
                <Form.Item label={l('预览文案', 'Preview text')} name="preview" className="menu-editor__wide">
                  <Input.TextArea
                    rows={3}
                    maxLength={500}
                    placeholder={l('用于列表预览的简短说明', 'A short description for list previews')}
                  />
                </Form.Item>
              </div>
            </div>

            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{l('模板配置', 'Template configuration')}</div>
              <Form.Item
                label={l('模板内容', 'Template content')}
                name="content"
                className="menu-editor__wide"
                rules={[{ required: true, whitespace: true, message: l('请输入模板内容', 'Enter template content') }]}
              >
                <Input.TextArea
                  rows={12}
                  className="prompt-template-editor-modal__content-input"
                  placeholder={l('请输入提示词模板内容', 'Enter prompt template content')}
                />
              </Form.Item>
              <div className="prompt-template-editor-modal__switch-grid">
                <Form.Item label={l('系统模板', 'System template')} className="menu-editor__switch-item">
                  <div className="menu-editor__switch-row">
                    <Form.Item name="system" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                    <span>{l('系统内置模板标记', 'Mark as a system template')}</span>
                  </div>
                </Form.Item>
                <Form.Item label={l('默认提示词', 'Default prompt')} className="menu-editor__switch-item">
                  <div className="menu-editor__switch-row">
                    <Form.Item name="defaultTemplate" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                    <span>{l('作为该类别默认提示词', 'Use as the default prompt for this category')}</span>
                  </div>
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      </Modal>
    </div>
  )
}

export default PromptTemplateManager
