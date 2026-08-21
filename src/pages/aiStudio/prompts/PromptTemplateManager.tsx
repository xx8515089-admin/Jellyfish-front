import { useEffect, useMemo, useRef, useState } from 'react'
import type { FC, Key } from 'react'
import { Card, Tree, Input, Row, Col, Tag, Pagination, Button, Modal, Form, Select, Switch, message } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { StudioPromptsService } from '../../../services/generated'
import type { PromptCategory, PromptTemplateRead } from '../../../services/generated'
import { useBilingualText } from '../../../i18n/useBilingualText'

const fallbackCategoryLabels: Record<string, string> = {
  frame_head_image: '首帧图片',
  frame_tail_image: '尾帧图片',
  frame_key_image: '关键帧图片',
  frame_head_prompt: '首帧提示词',
  frame_tail_prompt: '尾帧提示词',
  frame_key_prompt: '关键帧提示词',
  video_prompt: '视频提示词',
  storyboard_prompt: '分镜',
  bgm: '配乐',
  sfx: '音效',
  character_image_front: '角色正面',
  character_image_other: '角色其他',
  actor_image_front: '角色形象正面',
  actor_image_other: '角色形象其他',
  prop_image_front: '道具正面',
  prop_image_other: '道具其他',
  scene_image_front: '场景正面',
  scene_image_other: '场景其他',
  costume_image_front: '服装正面',
  costume_image_other: '服装其他',
  combined: '综合提示词',
}

const PAGE_SIZE = 10

const defaultPromptCategories: PromptCategory[] = [
  'frame_head_image',
  'frame_tail_image',
  'frame_key_image',
  'frame_head_prompt',
  'frame_tail_prompt',
  'frame_key_prompt',
  'video_prompt',
  'storyboard_prompt',
  'bgm',
  'sfx',
  'character_image_front',
  'character_image_other',
  'actor_image_front',
  'actor_image_other',
  'prop_image_front',
  'prop_image_other',
  'scene_image_front',
  'scene_image_other',
  'costume_image_front',
  'costume_image_other',
  'combined',
]

type CreatePromptForm = {
  category: PromptCategory
  name: string
  content: string
  preview?: string
  variables?: string[]
  is_default?: boolean
}

type PromptModalMode = 'create' | 'edit'

const groupOrder = [
  'frame',
  'video',
  'audio',
  'chapter',
  'actor',
  'scene',
  'prop',
  'costume',
  'combined',
  'other',
] as const

const groupTitles: Record<(typeof groupOrder)[number], string> = {
  frame: '首/尾/关键帧',
  video: '视频生成 / 分镜',
  audio: '配乐 / 音效 / 角色',
  chapter: '角色',
  actor: '角色形象',
  scene: '场景',
  prop: '道具',
  costume: '服装',
  combined: '综合提示词',
  other: '其他',
}

function getGroupKey(category: string): (typeof groupOrder)[number] {
  if (category.startsWith('frame_')) return 'frame'
  if (category === 'video_prompt' || category === 'storyboard_prompt') return 'video'
  if (['bgm', 'sfx'].includes(category)) return 'audio'
  if (category.startsWith('character_image_')) return 'chapter'
  if (category.startsWith('actor_image')) return 'actor'
  if (category.startsWith('scene_image_')) return 'scene'
  if (category.startsWith('prop_image_')) return 'prop'
  if (category.startsWith('costume_image_')) return 'costume'
  if (category === 'combined') return 'combined'
  return 'other'
}

const PromptTemplateManager: FC = () => {
  const l = useBilingualText()
  const englishCategoryLabels: Record<string, string> = {
    frame_head_image: 'First-frame image', frame_tail_image: 'Last-frame image', frame_key_image: 'Key-frame image',
    frame_head_prompt: 'First-frame prompt', frame_tail_prompt: 'Last-frame prompt', frame_key_prompt: 'Key-frame prompt',
    video_prompt: 'Video prompt', storyboard_prompt: 'Storyboard', bgm: 'Music', sfx: 'Sound effects',
    character_image_front: 'Character front', character_image_other: 'Character other', actor_image_front: 'Actor front', actor_image_other: 'Actor other',
    prop_image_front: 'Prop front', prop_image_other: 'Prop other', scene_image_front: 'Scene front', scene_image_other: 'Scene other',
    costume_image_front: 'Costume front', costume_image_other: 'Costume other', combined: 'Combined prompt',
  }
  const englishGroupTitles: Record<string, string> = { frame: 'First / last / key frame', video: 'Video / storyboard', audio: 'Music / SFX / character', chapter: 'Character', actor: 'Actor', scene: 'Scene', prop: 'Prop', costume: 'Costume', combined: 'Combined prompt', other: 'Other' }
  const getCategoryLabel = (category: string) => l(categoryLabels[category] || category, englishCategoryLabels[category] || category)
  const [templates, setTemplates] = useState<PromptTemplateRead[]>([])
  const [selected, setSelected] = useState<PromptTemplateRead | null>(null)
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>(fallbackCategoryLabels)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [modalMode, setModalMode] = useState<PromptModalMode>('create')
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: PromptCategory; label: string }>>(
    defaultPromptCategories.map((value) => ({
      value,
      label: fallbackCategoryLabels[value] || value,
    })),
  )
  const [createForm] = Form.useForm<CreatePromptForm>()
  const requestIdRef = useRef(0)

  const loadTemplates = async (nextPage: number, nextQuery: string) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const res = await StudioPromptsService.listPromptTemplatesApiV1StudioPromptsGet({
        q: nextQuery.trim() || null,
        page: nextPage,
        pageSize: PAGE_SIZE,
      })
      if (requestId !== requestIdRef.current) return

      const items = res.data?.items ?? []
      const totalCount = res.data?.pagination?.total ?? 0

      // 空页时自动回退上一页，避免用户停留在无数据页。
      if (nextPage > 1 && items.length === 0 && totalCount > 0) {
        setPage(nextPage - 1)
        return
      }

      setTemplates(items)
      setTotal(totalCount)
    } catch {
      message.error(l('加载模板失败', 'Failed to load templates'))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  const loadCategories = async () => {
    try {
      const res = await StudioPromptsService.listPromptCategoriesApiV1StudioPromptsCategoriesGet()
      const options = res.data ?? []
      if (!options.length) return

      const nextLabels = { ...fallbackCategoryLabels }
      options.forEach((option) => {
        nextLabels[option.value] = option.label
      })
      setCategoryLabels(nextLabels)
      setCategoryOptions(
        options.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      )
    } catch {
      // 类别接口失败时保留本地兜底映射。
    }
  }

  useEffect(() => {
    void loadCategories()
  }, [])

  useEffect(() => {
    void loadTemplates(page, query)
  }, [page, query])

  const treeData: DataNode[] = useMemo(() => {
    const grouped = new Map<(typeof groupOrder)[number], PromptTemplateRead[]>()
    groupOrder.forEach((key) => grouped.set(key, []))

    templates.forEach((template) => {
      const key = getGroupKey(template.category)
      grouped.get(key)?.push(template)
    })

    return groupOrder.map((groupKey) => ({
      title: l(groupTitles[groupKey], englishGroupTitles[groupKey]),
      key: groupKey,
      children: (grouped.get(groupKey) ?? []).map((t) => ({
        title: t.name,
        key: t.id,
        isLeaf: true,
      })),
    }))
  }, [l, templates])

  const handleSearch = (value: string) => {
    setSelected(null)
    setPage(1)
    setQuery(value.trim())
  }

  const handlePageChange = (nextPage: number) => {
    setSelected(null)
    setPage(nextPage)
  }

  const onSelect = (_: Key[], info: { node: { key: Key } }) => {
    const id = String(info.node.key)
    const t = templates.find((x) => x.id === id)
    setSelected(t || null)
  }

  const openCreateModal = () => {
    createForm.resetFields()
    setModalMode('create')
    setEditingTemplateId(null)
    createForm.setFieldsValue({
      category: categoryOptions[0]?.value,
      is_default: false,
      variables: [],
    })
    setFormOpen(true)
  }

  const openEditModal = (template: PromptTemplateRead) => {
    setModalMode('edit')
    setEditingTemplateId(template.id)
    createForm.resetFields()
    createForm.setFieldsValue({
      category: template.category,
      name: template.name,
      preview: template.preview,
      content: template.content,
      variables: template.variables,
      is_default: template.is_default,
    })
    setFormOpen(true)
  }

  const buildPayload = (values: CreatePromptForm) => ({
    category: values.category,
    name: values.name.trim(),
    content: values.content.trim(),
    preview: values.preview?.trim() || undefined,
    variables: (values.variables ?? []).map((v) => v.trim()).filter(Boolean),
    is_default: values.is_default ?? false,
  })

  const handleFormSubmit = async () => {
    try {
      const values = await createForm.validateFields()
      setSubmitting(true)
      const payload = buildPayload(values)

      if (modalMode === 'create') {
        const res = await StudioPromptsService.createPromptTemplateApiV1StudioPromptsPost({
          requestBody: payload,
        })
        if (!res.data) {
          message.error(l('添加提示词失败', 'Failed to add prompt'))
          return
        }

        message.success(l('提示词已添加', 'Prompt added'))
        setFormOpen(false)
        createForm.resetFields()
        setSelected(null)
        setSearchText('')
        setQuery('')
        setPage(1)
        void loadTemplates(1, '')
        return
      }

      if (!editingTemplateId) {
        message.error(l('编辑目标不存在', 'The prompt to edit does not exist'))
        return
      }

      const res = await StudioPromptsService.updatePromptTemplateApiV1StudioPromptsTemplateIdPatch({
        templateId: editingTemplateId,
        requestBody: payload,
      })
      if (!res.data) {
        message.error(l('更新提示词失败', 'Failed to update prompt'))
        return
      }
      const updatedTemplate = res.data

      message.success(l('提示词已更新', 'Prompt updated'))
      setFormOpen(false)
      setEditingTemplateId(null)
      createForm.resetFields()
      setSelected((prev) => (prev?.id === updatedTemplate.id ? updatedTemplate : prev))
      setTemplates((prev) => prev.map((item) => (item.id === updatedTemplate.id ? updatedTemplate : item)))
      void loadTemplates(page, query)
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      message.error(modalMode === 'create' ? l('添加提示词失败', 'Failed to add prompt') : l('更新提示词失败', 'Failed to update prompt'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTemplate = (template: PromptTemplateRead) => {
    Modal.confirm({
      title: l('删除提示词', 'Delete prompt'),
      content: l(`确定删除「${template.name}」吗？`, `Delete “${template.name}”?`),
      okText: l('删除', 'Delete'),
      okType: 'danger',
      cancelText: l('取消', 'Cancel'),
      onOk: async () => {
        try {
          await StudioPromptsService.deletePromptTemplateApiV1StudioPromptsTemplateIdDelete({
            templateId: template.id,
          })
          message.success(l('提示词已删除', 'Prompt deleted'))
          if (selected?.id === template.id) {
            setSelected(null)
          }

          if (templates.length === 1 && page > 1) {
            setPage(page - 1)
          } else {
            void loadTemplates(page, query)
          }
        } catch {
          message.error(l('删除提示词失败', 'Failed to delete prompt'))
        }
      },
    })
  }

  return (
    <div className="space-y-4">
      <Card
        title={l('提示词模板管理', 'Prompt template management')}
        loading={loading && templates.length === 0}
        extra={<Button type="primary" onClick={openCreateModal}>{l('添加提示词', 'Add prompt')}</Button>}
      >
        <Input.Search
          placeholder={l('搜索模板名称或预览', 'Search template name or preview')}
          allowClear
          className="mb-4 max-w-md"
          value={searchText}
          onSearch={handleSearch}
          onChange={(e) => {
            const value = e.target.value
            setSearchText(value)
            if (!value) {
              handleSearch('')
            }
          }}
        />
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <Tree
              showLine
              defaultExpandAll
              blockNode
              treeData={treeData}
              onSelect={onSelect}
              fieldNames={{ title: 'title', key: 'key', children: 'children' }}
            />
            <div className="mt-4 flex justify-end">
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={handlePageChange}
              />
            </div>
          </Col>
          <Col xs={24} md={14}>
            {selected ? (
              <Card
                title={selected.name}
                size="small"
                extra={(
                  <div className="flex gap-2">
                    <Button size="small" onClick={() => openEditModal(selected)}>{l('编辑', 'Edit')}</Button>
                    <Button size="small" danger onClick={() => handleDeleteTemplate(selected)}>
                      {l('删除', 'Delete')}
                    </Button>
                  </div>
                )}
              >
                <Tag>{getCategoryLabel(selected.category)}</Tag>
                <p className="text-gray-600 text-sm mt-2">{selected.preview}</p>
                <pre className="mt-3 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-48">
                  {selected.content}
                </pre>
                {selected.variables.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    变量：{selected.variables.join(', ')}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {selected.is_system && <Tag color="gold">{l('系统预置', 'System preset')}</Tag>}
                  {selected.is_default && <Tag color="blue">{l('默认提示词', 'Default prompt')}</Tag>}
                </div>
              </Card>
            ) : (
              <Card>
                <div className="text-gray-500 text-center py-8">
                  {l('左侧选择模板查看详情', 'Select a template on the left to view details')}
                </div>
              </Card>
            )}
          </Col>
        </Row>
      </Card>

      <Modal
        title={modalMode === 'create' ? l('添加提示词', 'Add prompt') : l('编辑提示词', 'Edit prompt')}
        open={formOpen}
        onCancel={() => {
          setFormOpen(false)
          setEditingTemplateId(null)
        }}
        onOk={handleFormSubmit}
        okText={l('保存', 'Save')}
        cancelText={l('取消', 'Cancel')}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form layout="vertical" form={createForm}>
          <Form.Item
            label={l('模板类别', 'Template category')}
            name="category"
            rules={[{ required: true, message: l('请选择模板类别', 'Select a template category') }]}
          >
            <Select options={categoryOptions.map((option) => ({ ...option, label: getCategoryLabel(option.value) }))} placeholder={l('请选择类别', 'Select a category')} />
          </Form.Item>
          <Form.Item
            label={l('模板名称', 'Template name')}
            name="name"
            rules={[{ required: true, message: l('请输入模板名称', 'Enter a template name') }]}
          >
            <Input maxLength={255} placeholder={l('例如：分镜基础提示词', 'Example: Basic storyboard prompt')} />
          </Form.Item>
          <Form.Item label={l('预览文案', 'Preview text')} name="preview">
            <Input.TextArea rows={2} maxLength={500} placeholder={l('用于列表预览的简短说明', 'A short description for list previews')} />
          </Form.Item>
          <Form.Item
            label={l('模板内容', 'Template content')}
            name="content"
            rules={[{ required: true, message: l('请输入模板内容', 'Enter template content') }]}
          >
            <Input.TextArea rows={6} placeholder={l('请输入提示词模板内容', 'Enter prompt template content')} />
          </Form.Item>
          <Form.Item label={l('变量（回车添加）', 'Variables (press Enter to add)')} name="variables">
            <Select
              mode="tags"
              tokenSeparators={[',', '，']}
              open={false}
              placeholder={l('例如：subject, style, lighting', 'For example: subject, style, lighting')}
            />
          </Form.Item>
          <Form.Item label={l('设为默认提示词', 'Set as default prompt')} name="is_default" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PromptTemplateManager
