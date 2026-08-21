import { useEffect, useState, useMemo } from 'react'
import {
  Layout,
  Input,
  InputNumber,
  Button,
  Table,
  Tag,
  Space,
  Tree,
  Card,
  Drawer,
  Modal,
  Form,
  Segmented,
  Select,
  Switch,
  message,
  Tooltip,
  Empty,
  Grid,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { LlmService } from '../../../services/generated/services/LlmService'
import type {
  ModelRead,
  ModelCategoryKey,
  ProviderRead,
} from '../../../services/generated'
import {
  MODEL_CATEGORIES,
  TABLE_ACTION_BTN_EDIT_CLASS,
  TABLE_ACTION_BTN_DELETE_CLASS,

  categoryColorMap,
} from './constants'
import { useBilingualText } from '../../../i18n/useBilingualText'
import {
  SystemSuppliersApi,
  type SystemSupplierImageCapabilities,
  type SystemSupplierModelRead,
  type SystemSupplierModelType,
  type SystemSupplierRead,
  type SystemSupplierVideoCapabilities,
} from '../../../services/systemSuppliers'
import '../../system/MenuManagement.css'
import './ModelsTab.css'

type ModelFormValues = {
  name: string
  category: ModelCategoryKey
  provider_id: string | number
  model_code?: string
  request_url?: string
  description?: string
  active?: boolean
  image_aspect_ratios?: string[]
  image_qualities?: number[]
  image_resolutions?: number[]
  image_max_reference_images?: number
  image_max_prompt_characters?: number
  image_generation_path?: string
  image_edit_path?: string
  video_resolutions?: string[]
  video_min_duration_seconds?: number
  video_max_duration_seconds?: number
  video_max_reference_images?: number
  video_native_audio_supported?: boolean
  video_max_prompt_characters?: number
  video_prompt_template_category?: string
  video_reference_token_style?: string
  video_submit_path?: string
  video_query_path_template?: string
}

type ProviderListItem = ProviderRead & {
  updatedAt?: string | null
}

type ModelListItem = ModelRead & {
  modelCode?: string
  requestUrl?: string
  active?: boolean
  type?: number
  updatedAt?: string | null
  imageAspectRatios?: string[]
  imageQualities?: number[]
  imageResolutions?: number[]
  imageMaxReferenceImages?: number
  imageMaxPromptCharacters?: number
  imageGenerationPath?: string
  imageEditPath?: string
  videoResolutions?: string[]
  videoMinDurationSeconds?: number
  videoMaxDurationSeconds?: number
  videoMaxReferenceImages?: number
  videoNativeAudioSupported?: boolean
  videoMaxPromptCharacters?: number
  videoPromptTemplateCategory?: string
  videoReferenceTokenStyle?: string
  videoSubmitPath?: string
  videoQueryPathTemplate?: string
}

const MODEL_TYPE_BY_CATEGORY: Record<ModelCategoryKey, SystemSupplierModelType> = {
  text: 1,
  image: 2,
  video: 3,
}

const CATEGORY_BY_MODEL_TYPE: Partial<Record<number, ModelCategoryKey>> = {
  1: 'text',
  2: 'image',
  3: 'video',
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

function mapSystemModel(model: SystemSupplierModelRead): ModelListItem | null {
  const category = CATEGORY_BY_MODEL_TYPE[model.type]
  if (!category) return null
  return {
    id: String(model.id),
    name: model.name,
    category,
    provider_id: String(model.supplierId),
    description: model.description ?? '',
    modelCode: model.modelCode,
    requestUrl: model.requestUrl,
    active: model.active,
    type: model.type,
    updatedAt: model.updatedAt,
    imageAspectRatios: model.imageSupportedAspectRatios ?? [],
    imageQualities: model.imageSupportedQualities ?? [],
    imageResolutions: model.imageSupportedResolutions ?? [],
    imageMaxReferenceImages: model.imageMaxReferenceImages ?? undefined,
    imageMaxPromptCharacters: model.imageMaxPromptCharacters ?? undefined,
    imageGenerationPath: model.imageGenerationPath ?? '',
    imageEditPath: model.imageEditPath ?? '',
    videoResolutions: model.supportedResolutions ?? [],
    videoMinDurationSeconds: model.minDurationSeconds ?? undefined,
    videoMaxDurationSeconds: model.maxDurationSeconds ?? undefined,
    videoMaxReferenceImages: model.maxReferenceImages ?? undefined,
    videoNativeAudioSupported: model.nativeAudioSupported ?? false,
    videoMaxPromptCharacters: model.maxPromptCharacters ?? undefined,
    videoPromptTemplateCategory: model.videoPromptTemplateCategory ?? '',
    videoReferenceTokenStyle: model.videoReferenceTokenStyle ?? '',
    videoSubmitPath: model.videoSubmitPath ?? '',
    videoQueryPathTemplate: model.videoQueryPathTemplate ?? '',
  }
}

const IMAGE_ASPECT_RATIO_OPTIONS = ['9:16', '16:9', '4:3', '21:9', '3:4'].map((value) => ({
  label: value,
  value,
}))

const IMAGE_RESOLUTION_OPTIONS = [1, 2].map((value) => ({
  label: `${value}K`,
  value,
}))

const IMAGE_QUALITY_OPTIONS = [
  { label: '中', value: 1 },
  { label: '高', value: 2 },
]

const VIDEO_RESOLUTION_OPTIONS = ['480p', '720p'].map((value) => ({
  label: value,
  value,
}))

function buildImageCapabilities(values: ModelFormValues): SystemSupplierImageCapabilities {
  return {
    aspectRatios: values.image_aspect_ratios ?? [],
    qualities: values.image_qualities ?? [],
    resolutions: values.image_resolutions ?? [],
    maxReferenceImages: values.image_max_reference_images ?? 0,
    maxPromptCharacters: values.image_max_prompt_characters ?? 0,
    generationPath: (values.image_generation_path ?? '').trim(),
    editPath: (values.image_edit_path ?? '').trim(),
  }
}

function buildVideoCapabilities(values: ModelFormValues): SystemSupplierVideoCapabilities {
  return {
    resolutions: values.video_resolutions ?? [],
    minDurationSeconds: values.video_min_duration_seconds ?? 0,
    maxDurationSeconds: values.video_max_duration_seconds ?? 0,
    maxReferenceImages: values.video_max_reference_images ?? 0,
    nativeAudioSupported: values.video_native_audio_supported ?? false,
    maxPromptCharacters: values.video_max_prompt_characters ?? 0,
    promptTemplateCategory: (values.video_prompt_template_category ?? '').trim(),
    referenceTokenStyle: (values.video_reference_token_style ?? '').trim(),
    submitPath: (values.video_submit_path ?? '').trim(),
    queryPathTemplate: (values.video_query_path_template ?? '').trim(),
  }
}

export default function ModelsTab() {
  const l = useBilingualText()
  const getCategoryLabel = (category: ModelCategoryKey) =>
    category === 'text' ? l('文本生成', 'Text generation') : category === 'image' ? l('图片生成', 'Image generation') : l('视频生成', 'Video generation')
  const [providers, setProviders] = useState<ProviderListItem[]>([])
  const [models, setModels] = useState<ModelListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ModelListItem | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<ModelCategoryKey | null>(null)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [modelEditing, setModelEditing] = useState<ModelListItem | null>(null)
  const [modelFormSeed, setModelFormSeed] = useState<Partial<ModelFormValues> | null>(null)
  const [providerOptionsLoading, setProviderOptionsLoading] = useState(true)
  const [form] = Form.useForm<ModelFormValues>()
  const selectedFormCategory = Form.useWatch<ModelCategoryKey | undefined>('category', form)
  const { lg } = Grid.useBreakpoint()
  const isLargeScreen = lg ?? false

  const load = async () => {
    setLoading(true)
    setProviderOptionsLoading(true)
    try {
      const suppliers = await SystemSuppliersApi.getAll()
      setProviders(suppliers.map(mapSystemSupplier))
      setModels(
        suppliers.flatMap((supplier) =>
          supplier.models
            .map(mapSystemModel)
            .filter((model): model is ModelListItem => model !== null),
        ),
      )
    } catch {
      message.error(l('加载失败', 'Failed to load'))
    } finally {
      setLoading(false)
      setProviderOptionsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const modelList = useMemo(() => {
    const list = categoryFilter
      ? models.filter((model) => model.category === categoryFilter)
      : models
    return [...list].sort((a, b) =>
      String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
    )
  }, [models, categoryFilter])

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {}
    MODEL_CATEGORIES.forEach((cat) => {
      c[cat.key] = models.filter((m) => m.category === cat.key).length
    })
    return c
  }, [models])

  const treeData = useMemo(
    () =>
      MODEL_CATEGORIES.map((category) => ({
        key: category.key,
        title: `${getCategoryLabel(category.key)} (${categoryCounts[category.key] ?? 0})`,
        isLeaf: true,
      })),
    [categoryCounts],
  )

  const getProviderName = (id: string) => providers.find((p) => p.id === id)?.name ?? id

  const providerSelectOptions = useMemo(
    () => providers.map((provider) => ({ label: provider.name, value: provider.id })),
    [providers],
  )

  const handleSaveModel = async () => {
    try {
      const values = await form.validateFields()
      const modelFields = {
        name: values.name.trim(),
        modelCode: (values.model_code ?? '').trim(),
        requestUrl: (values.request_url ?? '').trim(),
        description: values.description?.trim() ?? '',
        active: values.active ?? true,
      }
      if (modelEditing) {
        const modelId = Number(modelEditing.id)
        if (!Number.isInteger(modelId) || modelId <= 0) {
          message.error(l('模型 ID 无效，无法保存', 'Invalid model ID. Unable to save.'))
          return
        }

        if (values.category === 'image') {
          await SystemSuppliersApi.updateModel({
            modelId,
            type: 2,
            ...modelFields,
            imageCapabilities: buildImageCapabilities(values),
          })
        } else if (values.category === 'video') {
          await SystemSuppliersApi.updateModel({
            modelId,
            type: 3,
            ...modelFields,
            videoCapabilities: buildVideoCapabilities(values),
          })
        } else {
          await SystemSuppliersApi.updateModel({ modelId, type: 1, ...modelFields })
        }
        message.success(l('模型已更新', 'Model updated'))
      } else {
        if (!values.provider_id) {
          message.warning(l('请先添加供应商后再添加模型', 'Add a provider before adding a model'))
          return
        }
        const supplierId = Number(values.provider_id)
        if (!Number.isInteger(supplierId) || supplierId <= 0) {
          message.error(l('供应商 ID 无效，请重新选择供应商', 'Invalid supplier ID. Select the provider again.'))
          return
        }

        await SystemSuppliersApi.createModel({
          supplierId,
          type: MODEL_TYPE_BY_CATEGORY[values.category],
          ...modelFields,
          ...(values.category === 'image'
            ? {
                imageCapabilities: buildImageCapabilities(values),
              }
            : {}),
          ...(values.category === 'video'
            ? {
                videoCapabilities: buildVideoCapabilities(values),
              }
            : {}),
        })
        message.success(l('模型已添加', 'Model added'))
      }
      setModelModalOpen(false)
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : l('保存失败', 'Failed to save'))
    }
  }

  const handleDeleteModel = (m: ModelRead) => {
    Modal.confirm({
      title: l('删除模型', 'Delete model'),
      content: l(`确定删除「${m.name}」？`, `Delete “${m.name}”?`),
      okText: l('删除', 'Delete'),
      okType: 'danger',
      onOk: async () => {
        await LlmService.deleteModelApiV1LlmModelsModelIdDelete({ modelId: m.id })
        message.success(l('已删除', 'Deleted'))
        if (selectedModel?.id === m.id) setSelectedModel(null)
        void load()
      },
    })
  }

  const openModelModal = (m?: ModelListItem) => {
    setModelEditing(m ?? null)
    if (m) {
      setModelFormSeed({
        name: m.name,
        category: m.category,
        provider_id: m.provider_id,
        model_code: m.modelCode ?? '',
        request_url: m.requestUrl ?? '',
        description: m.description ?? '',
        active: m.active ?? true,
        image_aspect_ratios: m.imageAspectRatios ?? [],
        image_qualities: m.imageQualities ?? [],
        image_resolutions: m.imageResolutions ?? [],
        image_max_reference_images: m.imageMaxReferenceImages ?? 14,
        image_max_prompt_characters: m.imageMaxPromptCharacters ?? 5000,
        image_generation_path: m.imageGenerationPath ?? '',
        image_edit_path: m.imageEditPath ?? '',
        video_resolutions: m.videoResolutions ?? [],
        video_min_duration_seconds: m.videoMinDurationSeconds ?? 4,
        video_max_duration_seconds: m.videoMaxDurationSeconds ?? 30,
        video_max_reference_images: m.videoMaxReferenceImages ?? 30,
        video_native_audio_supported: m.videoNativeAudioSupported ?? true,
        video_max_prompt_characters: m.videoMaxPromptCharacters ?? 10000,
        video_prompt_template_category: m.videoPromptTemplateCategory ?? '',
        video_reference_token_style: m.videoReferenceTokenStyle ?? '',
        video_submit_path: m.videoSubmitPath ?? '/videos/generations',
        video_query_path_template: m.videoQueryPathTemplate ?? '/videos/generations/{taskId}',
      })
    } else {
      setModelFormSeed({
        category: 'text',
        active: true,
        description: '',
        image_aspect_ratios: IMAGE_ASPECT_RATIO_OPTIONS.map((option) => option.value),
        image_qualities: [],
        image_resolutions: IMAGE_RESOLUTION_OPTIONS.map((option) => option.value),
        image_max_reference_images: 14,
        image_max_prompt_characters: 5000,
        image_generation_path: '',
        image_edit_path: '',
        video_resolutions: VIDEO_RESOLUTION_OPTIONS.map((option) => option.value),
        video_min_duration_seconds: 4,
        video_max_duration_seconds: 30,
        video_max_reference_images: 30,
        video_native_audio_supported: true,
        video_max_prompt_characters: 10000,
        video_prompt_template_category: '',
        video_reference_token_style: '',
        video_submit_path: '/videos/generations',
        video_query_path_template: '/videos/generations/{taskId}',
      })
    }
    setModelModalOpen(true)
  }

  const handleModelModalOpenChange = (open: boolean) => {
    if (open) {
      form.resetFields()
      if (modelFormSeed) form.setFieldsValue(modelFormSeed)
      return
    }
    setModelEditing(null)
    setModelFormSeed(null)
    form.resetFields()
  }

  const modelColumns: TableColumnsType<ModelListItem> = [
    {
      title: l('名称', 'Name'),
      dataIndex: 'name',
      key: 'name',
      width: '24%',
      ellipsis: true,
      render: (n) => <Space>{n}</Space>,
    },
    {
      title: l('类别', 'Category'),
      dataIndex: 'category',
      key: 'category',
      width: '12%',
      align: 'center',
      render: (c: ModelCategoryKey) => (
        <Tag color={categoryColorMap[c]}>{getCategoryLabel(c)}</Tag>
      ),
    },
    {
      title: l('关联供应商', 'Provider'),
      dataIndex: 'provider_id',
      key: 'provider_id',
      width: '16%',
      render: (id: string) => getProviderName(id),
    },
    {
      title: l('描述', 'Description'),
      dataIndex: 'description',
      key: 'description',
      width: '28%',
      ellipsis: true,
      render: (d: string) => <Tooltip title={d}>{d || '—'}</Tooltip>,
    },
    {
      title: l('创建人', 'Creator'),
      dataIndex: 'created_by',
      key: 'created_by',
      width: '10%',
      align: 'center',
      render: (creator: string) => creator || '—',
    },
    {
      title: l('操作', 'Actions'),
      key: 'action',
      width: '10%',
      align: 'center',
      render: (_, record) => (
        <Space size={4} className="flex-nowrap justify-center">
          <Tooltip title={l('编辑', 'Edit')}>
            <Button
              type="text"
              size="small"
              className={TABLE_ACTION_BTN_EDIT_CLASS}
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                openModelModal(record)
              }}
            />
          </Tooltip>
          <Tooltip title={l('删除', 'Delete')}>
            <Button
              type="text"
              size="small"
              danger
              className={TABLE_ACTION_BTN_DELETE_CLASS}
              icon={<DeleteOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                handleDeleteModel(record)
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-sm">{l('共 {{count}} 个模型', '{{count}} models').replace('{{count}}', String(models.length))}</span>
        </div>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModelModal()}>
            {l('添加模型', 'Add model')}
          </Button>
        </Space>
      </div>

      <Layout className="flex-1 min-h-0 flex-row overflow-hidden">
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
                <span className="text-sm font-medium text-gray-700">{l('筛选', 'Filter')}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<RightOutlined rotate={180} />}
                  onClick={() => setTreeCollapsed(true)}
                />
              </div>
              <Tree
                selectedKeys={categoryFilter ? [categoryFilter] : []}
                treeData={treeData}
                showLine
                blockNode
                onSelect={([key]) => setCategoryFilter(key ? (key as ModelCategoryKey) : null)}
                className="py-2"
              />
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-auto p-4 bg-gray-50">
          {modelList.length === 0 ? (
            <Card>
              <Empty description={models.length === 0 ? l('暂无模型', 'No models') : l('当前分类暂无模型', 'No models in this category')}>
                {providers.length > 0 && models.length === 0 && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => openModelModal()}>
                    {l('添加第一个模型', 'Add the first model')}
                  </Button>
                )}
              </Empty>
            </Card>
          ) : (
            <Card>
              <Table<ModelListItem>
                rowKey="id"
                loading={loading}
                columns={modelColumns}
                dataSource={modelList}
                scroll={{ x: 760 }}
                pagination={{ pageSize: 20 }}
                onRow={(record) => ({
                  onClick: () => {
                    setSelectedModel(record)
                    setDetailPanelOpen(true)
                  },
                  style: { cursor: 'pointer' },
                })}
                size="small"
              />
            </Card>
          )}
        </div>

        {selectedModel && isLargeScreen && (
          <div
            className="flex-shrink-0 overflow-auto border-l border-gray-200 bg-white"
            style={{ width: '36%', minWidth: 320 }}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium">{l('详情', 'Details')}</span>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setDetailPanelOpen(false)
                  setSelectedModel(null)
                }}
              >
                {l('收起', 'Collapse')}
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">{l('名称', 'Name')}</div>
                <div className="font-medium">{selectedModel.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">{l('类别', 'Category')}</div>
                <Tag color={categoryColorMap[selectedModel.category]}>
                  {getCategoryLabel(selectedModel.category)}
                </Tag>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">{l('关联供应商', 'Provider')}</div>
                <div>{getProviderName(selectedModel.provider_id)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">{l('描述', 'Description')}</div>
                <div className="text-gray-700 text-sm">{selectedModel.description || '—'}</div>
              </div>
              <Space>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => openModelModal(selectedModel)}
                >
                  {l('编辑', 'Edit')}
                </Button>
              </Space>
            </div>
          </div>
        )}

        {selectedModel && !isLargeScreen && (
          <Drawer
            title={l('详情', 'Details')}
            placement="right"
            open={detailPanelOpen}
            onClose={() => setDetailPanelOpen(false)}
            width="min(100%, 400px)"
          >
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">{l('名称', 'Name')}</div>
                <div className="font-medium">{selectedModel.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">{l('类别', 'Category')}</div>
                <Tag color={categoryColorMap[selectedModel.category]}>
                  {getCategoryLabel(selectedModel.category)}
                </Tag>
              </div>
              <Space>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => openModelModal(selectedModel)}
                >
                  {l('编辑', 'Edit')}
                </Button>
              </Space>
            </div>
          </Drawer>
        )}
      </Layout>

      <Modal
        title={null}
        open={modelModalOpen}
        onCancel={() => {
          setModelModalOpen(false)
        }}
        onOk={() => void handleSaveModel()}
        afterOpenChange={handleModelModalOpenChange}
        width={720}
        className="menu-editor-modal model-editor-modal"
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
                  {modelEditing ? l('编辑模型', 'Edit model') : l('新增模型', 'Add model')}
                </Typography.Title>
                <Tag color={modelEditing ? 'blue' : 'green'} className="menu-editor__mode">
                  {modelEditing ? l('编辑', 'Editing') : l('新增', 'Creating')}
                </Tag>
              </div>
            </div>
          </div>

          <Form form={form} layout="vertical" className="menu-editor__form">
            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{l('基础信息', 'Basic information')}</div>
              <div className="menu-editor__grid">
                <Form.Item
                  name="provider_id"
                  label={l('所属供应商', 'Supplier')}
                  className="menu-editor__wide"
                  rules={[{ required: true, message: l('请选择供应商', 'Select a supplier') }]}
                >
                  <Select
                    disabled={Boolean(modelEditing)}
                    loading={providerOptionsLoading}
                    placeholder={l('选择供应商（请先添加供应商）', 'Select a supplier (add one first)')}
                    options={providerSelectOptions}
                    notFoundContent={providerOptionsLoading ? l('加载中…', 'Loading…') : l('暂无供应商', 'No suppliers')}
                  />
                </Form.Item>
                <Form.Item
                  name="name"
                  label={l('模型名称', 'Model name')}
                  rules={[{ required: true, whitespace: true, message: l('请输入模型名称', 'Enter a model name') }]}
                >
                  <Input placeholder={l('例如：Nano Banana 2', 'Example: Nano Banana 2')} />
                </Form.Item>
                <Form.Item
                  name="model_code"
                  label={l('模型编码', 'Model code')}
                  rules={[{ required: true, whitespace: true, message: l('请输入模型编码', 'Enter a model code') }]}
                >
                  <Input placeholder="nano-banana-2" />
                </Form.Item>
                <Form.Item
                  name="category"
                  label={l('模型类型', 'Model type')}
                  className="menu-editor__wide"
                  rules={[{ required: true }]}
                >
                  <Segmented
                    block
                    disabled={Boolean(modelEditing)}
                    options={MODEL_CATEGORIES.map((category) => ({
                      label: getCategoryLabel(category.key),
                      value: category.key,
                    }))}
                  />
                </Form.Item>
                <Form.Item name="description" label={l('描述', 'Description')}>
                  <Input placeholder={l('请输入模型描述', 'Enter a model description')} maxLength={500} />
                </Form.Item>
              </div>
            </div>

            <div className="menu-editor__section">
              <div className="menu-editor__section-title">{l('请求配置', 'Request configuration')}</div>
              <div className="menu-editor__grid">
                <Form.Item
                  name="request_url"
                  label={l('请求地址', 'Request URL')}
                  className="menu-editor__wide"
                  rules={[
                    { required: true, whitespace: true, message: l('请输入请求地址', 'Enter a request URL') },
                    { type: 'url', message: l('请输入正确的 URL', 'Enter a valid URL') },
                  ]}
                >
                  <Input placeholder="https://api.example.com/api/v1/jobs/createTask" />
                </Form.Item>
                <Form.Item label={l('启用状态', 'Active status')} className="menu-editor__switch-item menu-editor__wide">
                  <div className="menu-editor__switch-row">
                    <Form.Item name="active" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                    <span>{l('启用后模型可参与任务调度', 'Available for task dispatch when active')}</span>
                  </div>
                </Form.Item>
              </div>
            </div>

            {selectedFormCategory === 'image' && (
              <div className="menu-editor__section">
                <div className="menu-editor__section-title">{l('图片能力', 'Image capabilities')}</div>
                <div className="menu-editor__grid">
                  <Form.Item
                    name="image_aspect_ratios"
                    label={l('支持画幅', 'Aspect ratios')}
                    className="menu-editor__wide"
                    rules={[{ required: true, message: l('请选择至少一个画幅', 'Select at least one aspect ratio') }]}
                  >
                    <Select mode="multiple" options={IMAGE_ASPECT_RATIO_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="image_qualities" label={l('质量选项', 'Quality options')}>
                    <Select
                      mode="multiple"
                      options={IMAGE_QUALITY_OPTIONS.map((option) => ({
                        ...option,
                        label: l(option.label, option.value === 1 ? 'Medium' : 'High'),
                      }))}
                      placeholder={l('可留空', 'Optional')}
                    />
                  </Form.Item>
                  <Form.Item
                    name="image_resolutions"
                    label={l('支持分辨率', 'Resolutions')}
                    rules={[{ required: true, message: l('请选择分辨率', 'Select a resolution') }]}
                  >
                    <Select mode="multiple" options={IMAGE_RESOLUTION_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="image_max_reference_images" label={l('最大参考图数量', 'Max reference images')} rules={[{ required: true }]}>
                    <InputNumber min={0} precision={0} />
                  </Form.Item>
                  <Form.Item name="image_max_prompt_characters" label={l('最大提示词字符数', 'Max prompt characters')} rules={[{ required: true }]}>
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                  <Form.Item
                    name="image_generation_path"
                    label={l('生成路径', 'Generation path')}
                    rules={[{ required: true, whitespace: true, message: l('请输入生成路径', 'Enter a generation path') }]}
                  >
                    <Input placeholder="/api/v1/jobs/createTask" />
                  </Form.Item>
                  <Form.Item
                    name="image_edit_path"
                    label={l('编辑路径', 'Edit path')}
                    rules={[{ required: true, whitespace: true, message: l('请输入编辑路径', 'Enter an edit path') }]}
                  >
                    <Input placeholder="/api/v1/jobs/createTask" />
                  </Form.Item>
                </div>
              </div>
            )}

            {selectedFormCategory === 'video' && (
              <div className="menu-editor__section">
                <div className="menu-editor__section-title">{l('视频能力', 'Video capabilities')}</div>
                <div className="menu-editor__grid">
                  <Form.Item
                    name="video_resolutions"
                    label={l('支持分辨率', 'Resolutions')}
                    className="menu-editor__wide"
                    rules={[{ required: true, message: l('请选择至少一个分辨率', 'Select at least one resolution') }]}
                  >
                    <Select mode="tags" options={VIDEO_RESOLUTION_OPTIONS} placeholder={l('选择或输入分辨率', 'Select or enter resolutions')} />
                  </Form.Item>
                  <Form.Item
                    name="video_min_duration_seconds"
                    label={l('最短时长（秒）', 'Minimum duration (seconds)')}
                    rules={[{ required: true, message: l('请输入最短时长', 'Enter the minimum duration') }]}
                  >
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                  <Form.Item
                    name="video_max_duration_seconds"
                    label={l('最长时长（秒）', 'Maximum duration (seconds)')}
                    dependencies={['video_min_duration_seconds']}
                    rules={[
                      { required: true, message: l('请输入最长时长', 'Enter the maximum duration') },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const minimum = getFieldValue('video_min_duration_seconds') as number | undefined
                          if (value == null || minimum == null || value >= minimum) return Promise.resolve()
                          return Promise.reject(new Error(l('最长时长不能小于最短时长', 'Maximum duration cannot be less than minimum duration')))
                        },
                      }),
                    ]}
                  >
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                  <Form.Item
                    name="video_max_reference_images"
                    label={l('最大参考图数量', 'Max reference images')}
                    rules={[{ required: true, message: l('请输入最大参考图数量', 'Enter the maximum reference images') }]}
                  >
                    <InputNumber min={0} precision={0} />
                  </Form.Item>
                  <Form.Item
                    name="video_max_prompt_characters"
                    label={l('最大提示词字符数', 'Max prompt characters')}
                    rules={[{ required: true, message: l('请输入最大提示词字符数', 'Enter the maximum prompt characters') }]}
                  >
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                  <Form.Item label={l('原生音频', 'Native audio')} className="menu-editor__switch-item menu-editor__wide">
                    <div className="menu-editor__switch-row">
                      <Form.Item name="video_native_audio_supported" valuePropName="checked" noStyle>
                        <Switch />
                      </Form.Item>
                      <span>{l('模型支持直接生成原生音频', 'The model can generate native audio')}</span>
                    </div>
                  </Form.Item>
                  <Form.Item name="video_prompt_template_category" label={l('提示词模板类别', 'Prompt template category')}>
                    <Input placeholder={l('可留空', 'Optional')} />
                  </Form.Item>
                  <Form.Item name="video_reference_token_style" label={l('参考令牌风格', 'Reference token style')}>
                    <Input placeholder={l('可留空', 'Optional')} />
                  </Form.Item>
                  <Form.Item
                    name="video_submit_path"
                    label={l('提交路径', 'Submit path')}
                    className="menu-editor__wide"
                  >
                    <Input placeholder="/videos/generations" />
                  </Form.Item>
                  <Form.Item
                    name="video_query_path_template"
                    label={l('查询路径模板', 'Query path template')}
                    className="menu-editor__wide"
                  >
                    <Input placeholder="/videos/generations/{taskId}" />
                  </Form.Item>
                </div>
              </div>
            )}
          </Form>
        </div>
      </Modal>
    </>
  )
}
