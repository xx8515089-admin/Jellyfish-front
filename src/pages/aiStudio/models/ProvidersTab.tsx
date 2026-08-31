import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Pagination,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ChevronRight, Plus } from 'lucide-react'
import { LlmService } from '../../../services/generated/services/LlmService'
import type { ModelCategoryKey, ProviderRead, ProviderStatus } from '../../../services/generated'
import {
  MODEL_CATEGORIES,
  PROVIDER_STATUS_MAP,
  TABLE_ACTION_BTN_DELETE_CLASS,
  TABLE_ACTION_BTN_EDIT_CLASS,
  categoryColorMap,
} from './constants'
import { useBilingualText } from '../../../i18n/useBilingualText'
import {
  SystemSuppliersApi,
  type SystemSupplierBalanceRead,
  type SystemSupplierCreateRequest,
  type SystemSupplierImageCapabilities,
  type SystemSupplierModelRead,
  type SystemSupplierModelType,
  type SystemSupplierRead,
  type SystemSupplierTextCapabilities,
  type SystemSupplierUpdateRequest,
  type SystemSupplierVideoCapabilities,
} from '../../../services/systemSuppliers'
import '../../system/MenuManagement.css'

type ProviderListItem = ProviderRead & {
  updatedAt?: string | null
}

type SupplierFormValues = {
  name?: string
  baseUrl?: string
  apiKey?: string
  apiSecret?: string
  description?: string
  active?: boolean
}

type ModelFormValues = {
  name: string
  category: ModelCategoryKey
  provider_id: string | number
  model_code?: string
  request_url?: string
  description?: string
  active?: boolean
  default_model?: boolean
  text_api_protocol?: string
  text_memory_supported?: boolean
  text_default_memory_enabled?: boolean
  text_reasoning_efforts?: string[]
  text_default_reasoning_effort?: string
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

type ModelTypeFilter = 'all' | '1' | '2' | '3'

type ModelPagination = {
  page: number
  pageSize: number
  total: number
}

type ProviderBalanceState = {
  supplierId: number | null
  data: SystemSupplierBalanceRead | null
  loading: boolean
  error: boolean
}

const DEFAULT_MODEL_PAGINATION: ModelPagination = {
  page: 1,
  pageSize: 20,
  total: 0,
}

const DEFAULT_PROVIDER_BALANCE_STATE: ProviderBalanceState = {
  supplierId: null,
  data: null,
  loading: false,
  error: false,
}

const CATEGORY_BY_MODEL_TYPE: Partial<Record<number, ModelCategoryKey>> = {
  1: 'text',
  2: 'image',
  3: 'video',
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

const TEXT_API_PROTOCOL_OPTIONS = [{ label: 'Responses API', value: 'responses' }]

const TEXT_REASONING_EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({
  label: value,
  value,
}))

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

function getModelCategory(model: SystemSupplierModelRead): ModelCategoryKey {
  return CATEGORY_BY_MODEL_TYPE[model.type] ?? 'text'
}

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

function buildTextCapabilities(values: ModelFormValues): SystemSupplierTextCapabilities {
  const memorySupported = values.text_memory_supported ?? true
  return {
    apiProtocol: values.text_api_protocol ?? 'responses',
    memorySupported,
    defaultMemoryEnabled: memorySupported && (values.text_default_memory_enabled ?? true),
    reasoningEfforts: values.text_reasoning_efforts ?? [],
    defaultReasoningEffort: values.text_default_reasoning_effort ?? '',
  }
}

/** 展示由后端托管的模型供应商，并提供安全的新增入口。 */
export default function ProvidersTab() {
  const l = useBilingualText()
  const { message } = App.useApp()
  const [showInlineDetail, setShowInlineDetail] = useState(false)
  const [providers, setProviders] = useState<ProviderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState<ProviderListItem | null>(null)
  const [providerModels, setProviderModels] = useState<SystemSupplierModelRead[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [providerBalance, setProviderBalance] = useState<ProviderBalanceState>(DEFAULT_PROVIDER_BALANCE_STATE)
  const [modelTypeFilter, setModelTypeFilter] = useState<ModelTypeFilter>('all')
  const [modelPagination, setModelPagination] = useState<ModelPagination>(DEFAULT_MODEL_PAGINATION)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [providerEditing, setProviderEditing] = useState<ProviderListItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [createForm] = Form.useForm<SupplierFormValues>()
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [modelEditing, setModelEditing] = useState<SystemSupplierModelRead | null>(null)
  const [modelFormSeed, setModelFormSeed] = useState<Partial<ModelFormValues> | null>(null)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1840px)')
    const syncDetailLayout = () => setShowInlineDetail(mediaQuery.matches)

    syncDetailLayout()
    mediaQuery.addEventListener('change', syncDetailLayout)
    return () => mediaQuery.removeEventListener('change', syncDetailLayout)
  }, [])
  const [modelSaving, setModelSaving] = useState(false)
  const [modelForm] = Form.useForm<ModelFormValues>()
  const selectedFormCategory = Form.useWatch<ModelCategoryKey | undefined>('category', modelForm)
  const textMemorySupported = Form.useWatch<boolean | undefined>('text_memory_supported', modelForm)
  const balanceRequestId = useRef(0)

  /** 将后端状态枚举转换为当前页面展示文案。 */
  const statusText = (status: ProviderStatus) =>
    status === 'active'
      ? l('活跃', 'Active')
      : status === 'testing'
        ? l('测试中', 'Testing')
        : l('禁用', 'Disabled')

  const getCategoryLabel = (category: ModelCategoryKey) =>
    category === 'text'
      ? l('文本生成', 'Text generation')
      : category === 'image'
        ? l('图片生成', 'Image generation')
        : l('视频生成', 'Video generation')

  /** 从系统供应商接口加载完整供应商列表。 */
  const load = async (): Promise<ProviderListItem[]> => {
    setLoading(true)
    try {
      const suppliers = await SystemSuppliersApi.getAll()
      const nextProviders = suppliers.map(mapSystemSupplier)
      setProviders(nextProviders)
      setSelectedProvider((current) =>
        current ? nextProviders.find((provider) => provider.id === current.id) ?? current : current,
      )
      return nextProviders
    } catch {
      message.error(l('加载供应商失败', 'Failed to load providers'))
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const toModelType = (filter: ModelTypeFilter): SystemSupplierModelType | undefined =>
    filter === 'all' ? undefined : (Number(filter) as SystemSupplierModelType)

  const loadProviderModels = async (
    provider: ProviderListItem,
    page = DEFAULT_MODEL_PAGINATION.page,
    pageSize = DEFAULT_MODEL_PAGINATION.pageSize,
    filter: ModelTypeFilter = modelTypeFilter,
  ) => {
    const supplierId = Number(provider.id)
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      message.error(l('供应商 ID 无效，无法查询模型', 'Invalid provider ID. Unable to load models.'))
      return
    }

    setModelsLoading(true)
    try {
      const modelType = toModelType(filter)
      const result = await SystemSuppliersApi.getModels({
        supplierId,
        page,
        pageSize,
        ...(modelType ? { type: modelType } : {}),
      })
      setProviderModels(result.items)
      setModelPagination({
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      })
    } catch {
      setProviderModels([])
      setModelPagination({ page, pageSize, total: 0 })
      message.error(l('加载供应商模型失败', 'Failed to load provider models'))
    } finally {
      setModelsLoading(false)
    }
  }

  const resetProviderBalance = () => {
    balanceRequestId.current += 1
    setProviderBalance(DEFAULT_PROVIDER_BALANCE_STATE)
  }

  const loadProviderBalance = async (provider: ProviderListItem) => {
    const supplierId = Number(provider.id)
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      setProviderBalance({
        supplierId: null,
        data: null,
        loading: false,
        error: true,
      })
      return
    }

    const requestId = balanceRequestId.current + 1
    balanceRequestId.current = requestId
    setProviderBalance({
      supplierId,
      data: null,
      loading: true,
      error: false,
    })

    try {
      const result = await SystemSuppliersApi.getBalance({ supplierId })
      if (balanceRequestId.current !== requestId) return
      setProviderBalance({
        supplierId,
        data: result,
        loading: false,
        error: false,
      })
    } catch {
      if (balanceRequestId.current !== requestId) return
      setProviderBalance({
        supplierId,
        data: null,
        loading: false,
        error: true,
      })
    }
  }

  const openProviderDetail = (provider: ProviderListItem) => {
    setSelectedProvider(provider)
    setDetailPanelOpen(true)
    setModelTypeFilter('all')
    setProviderModels([])
    setModelPagination(DEFAULT_MODEL_PAGINATION)
    void loadProviderBalance(provider)
    void loadProviderModels(provider, DEFAULT_MODEL_PAGINATION.page, DEFAULT_MODEL_PAGINATION.pageSize, 'all')
  }

  const handleModelTypeChange = (nextType: ModelTypeFilter) => {
    setModelTypeFilter(nextType)
    if (selectedProvider) {
      void loadProviderModels(selectedProvider, 1, modelPagination.pageSize, nextType)
    }
  }

  const handleModelPageChange = (page: number, pageSize: number) => {
    if (selectedProvider) {
      void loadProviderModels(selectedProvider, page, pageSize, modelTypeFilter)
    }
  }

  const providerList = useMemo(() => {
    return [...providers].sort((a, b) =>
      String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')),
    )
  }, [providers])

  const providerSelectOptions = useMemo(
    () => providers.map((provider) => ({ label: provider.name, value: provider.id })),
    [providers],
  )

  const openCreateModal = () => {
    setProviderEditing(null)
    createForm.resetFields()
    createForm.setFieldsValue({ active: true, apiSecret: '', description: '' })
    setCreateModalOpen(true)
  }

  const openEditModal = (provider: ProviderListItem) => {
    setProviderEditing(provider)
    createForm.resetFields()
    createForm.setFieldsValue({
      name: provider.name,
      baseUrl: provider.base_url,
      apiKey: '',
      apiSecret: '',
      description: provider.description ?? '',
      active: (provider.status ?? 'active') === 'active',
    })
    setCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    setCreateModalOpen(false)
  }

  const handleCreateModalOpenChange = (open: boolean) => {
    if (!open) {
      setProviderEditing(null)
      createForm.resetFields()
    }
  }

  /** 保存成功后重新读取列表，确保页面展示后端的最终数据。 */
  const handleSaveProvider = async () => {
    let values: SupplierFormValues
    try {
      values = await createForm.validateFields()
    } catch {
      return
    }

    setCreating(true)
    try {
      const baseFields = {
        name: values.name?.trim() ?? '',
        baseUrl: values.baseUrl?.trim() ?? '',
        description: values.description?.trim() ?? '',
        active: values.active ?? true,
      }

      if (providerEditing) {
        const providerId = Number(providerEditing.id)
        if (!Number.isInteger(providerId) || providerId <= 0) {
          message.error(l('供应商 ID 无效，无法保存', 'Invalid provider ID. Unable to save.'))
          return
        }

        const updatePayload: SystemSupplierUpdateRequest = {
          id: providerId,
          ...baseFields,
          apiKey: values.apiKey?.trim() ?? '',
          apiSecret: values.apiSecret?.trim() ?? '',
        }

        await SystemSuppliersApi.update(updatePayload)
        message.success(l('供应商已更新', 'Provider updated'))
      } else {
        await SystemSuppliersApi.create({
          ...baseFields,
          apiKey: values.apiKey?.trim() ?? '',
          apiSecret: values.apiSecret?.trim() ?? '',
        } satisfies SystemSupplierCreateRequest)
        message.success(l('供应商创建成功', 'Provider created successfully'))
      }

      closeCreateModal()
      await load()
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : l('供应商保存失败', 'Failed to save provider'),
      )
    } finally {
      setCreating(false)
    }
  }

  const openModelModal = (model?: SystemSupplierModelRead) => {
    if (!selectedProvider) {
      message.warning(l('请先选择供应商', 'Select a provider first'))
      return
    }

    setModelEditing(model ?? null)
    if (model) {
      setModelFormSeed({
        name: model.name,
        category: getModelCategory(model),
        provider_id: String(model.supplierId),
        model_code: model.modelCode ?? '',
        request_url: model.requestUrl ?? '',
        description: model.description ?? '',
        active: model.active ?? true,
        image_aspect_ratios: model.imageSupportedAspectRatios ?? [],
        image_qualities: model.imageSupportedQualities ?? [],
        image_resolutions: model.imageSupportedResolutions ?? [],
        image_max_reference_images: model.imageMaxReferenceImages ?? 14,
        image_max_prompt_characters: model.imageMaxPromptCharacters ?? 5000,
        image_generation_path: model.imageGenerationPath ?? '',
        image_edit_path: model.imageEditPath ?? '',
        video_resolutions: model.supportedResolutions ?? [],
        video_min_duration_seconds: model.minDurationSeconds ?? 4,
        video_max_duration_seconds: model.maxDurationSeconds ?? 30,
        video_max_reference_images: model.maxReferenceImages ?? 30,
        video_native_audio_supported: model.nativeAudioSupported ?? true,
        video_max_prompt_characters: model.maxPromptCharacters ?? 10000,
        video_prompt_template_category: model.videoPromptTemplateCategory ?? '',
        video_reference_token_style: model.videoReferenceTokenStyle ?? '',
        video_submit_path: model.videoSubmitPath ?? '/videos/generations',
        video_query_path_template: model.videoQueryPathTemplate ?? '/videos/generations/{taskId}',
      })
    } else {
      const currentCategory =
        modelTypeFilter === '2' ? 'image' : modelTypeFilter === '3' ? 'video' : 'text'

      setModelFormSeed({
        category: currentCategory,
        provider_id: selectedProvider.id,
        active: true,
        default_model: true,
        description: '',
        text_api_protocol: 'responses',
        text_memory_supported: true,
        text_default_memory_enabled: true,
        text_reasoning_efforts: TEXT_REASONING_EFFORT_OPTIONS.map((option) => option.value),
        text_default_reasoning_effort: 'high',
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
      modelForm.resetFields()
      if (modelFormSeed) modelForm.setFieldsValue(modelFormSeed)
      return
    }
    setModelEditing(null)
    setModelFormSeed(null)
    modelForm.resetFields()
  }

  const handleSaveModel = async () => {
    if (!selectedProvider) {
      message.warning(l('请先选择供应商', 'Select a provider first'))
      return
    }

    let values: ModelFormValues
    try {
      values = await modelForm.validateFields()
    } catch {
      return
    }

    const supplierId = Number(values.provider_id || selectedProvider.id)
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      message.error(l('供应商 ID 无效，请重新选择供应商', 'Invalid supplier ID. Select the provider again.'))
      return
    }

    const modelFields = {
      name: values.name.trim(),
      modelCode: (values.model_code ?? '').trim(),
      requestUrl: (values.request_url ?? '').trim(),
      description: values.description?.trim() ?? '',
      active: values.active ?? true,
    }

    setModelSaving(true)
    try {
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
        if (values.category === 'text') {
          await SystemSuppliersApi.createModel({
            supplierId,
            type: 1,
            ...modelFields,
            defaultModel: values.default_model ?? true,
            textCapabilities: buildTextCapabilities(values),
          })
        } else if (values.category === 'image') {
          await SystemSuppliersApi.createModel({
            supplierId,
            type: 2,
            ...modelFields,
            defaultModel: values.default_model ?? true,
            imageCapabilities: buildImageCapabilities(values),
          })
        } else {
          await SystemSuppliersApi.createModel({
            supplierId,
            type: 3,
            ...modelFields,
            defaultModel: values.default_model ?? true,
            videoCapabilities: buildVideoCapabilities(values),
          })
        }
        message.success(l('模型已添加', 'Model added'))
      }

      setModelModalOpen(false)
      await loadProviderModels(
        selectedProvider,
        modelEditing ? modelPagination.page : 1,
        modelPagination.pageSize,
        modelTypeFilter,
      )
    } catch (error) {
      message.error(error instanceof Error ? error.message : l('模型保存失败', 'Failed to save model'))
    } finally {
      setModelSaving(false)
    }
  }

  const handleDeleteModel = (model: SystemSupplierModelRead) => {
    Modal.confirm({
      title: l('删除模型', 'Delete model'),
      content: l(`确定删除「${model.name}」？`, `Delete “${model.name}”?`),
      okText: l('删除', 'Delete'),
      okType: 'danger',
      cancelText: l('取消', 'Cancel'),
      onOk: async () => {
        if (!selectedProvider) return
        await LlmService.deleteModelApiV1LlmModelsModelIdDelete({ modelId: String(model.id) })
        message.success(l('已删除', 'Deleted'))
        void loadProviderModels(
          selectedProvider,
          modelPagination.page,
          modelPagination.pageSize,
          modelTypeFilter,
        )
      },
    })
  }

  const providerColumns: TableColumnsType<ProviderListItem> = [
    {
      title: l('名称', 'Name'),
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
      render: (name: string) => <span className="font-medium">{name}</span>,
    },
    {
      title: l('描述', 'Description'),
      dataIndex: 'description',
      key: 'description',
      width: 220,
      ellipsis: true,
      render: (description: string) => <Tooltip title={description}>{description || '—'}</Tooltip>,
    },
    {
      title: l('状态', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 92,
      align: 'center',
      render: (status: ProviderStatus) => (
        <Tag color={PROVIDER_STATUS_MAP[status ?? 'active']?.color}>{statusText(status ?? 'active')}</Tag>
      ),
    },
    {
      title: l('创建人', 'Creator'),
      dataIndex: 'created_by',
      key: 'created_by',
      width: 104,
      align: 'center',
      render: (creator: string) => creator || '—',
    },
    {
      title: l('操作', 'Actions'),
      key: 'action',
      width: 90,
      align: 'left',
      render: (_, record) => (
        <Space size={10} className="flex-nowrap justify-start">
          <Button
            type="text"
            size="small"
            className={TABLE_ACTION_BTN_EDIT_CLASS}
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              openEditModal(record)
            }}
          >
            {l('编辑', 'Edit')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div className="model-management__toolbar flex-shrink-0 border-b border-gray-100 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-gray-600">
            {l('共 {{count}} 个供应商', '{{count}} providers').replace('{{count}}', String(providers.length))}
          </span>
          <Button type="primary" icon={<Plus size={17} strokeWidth={1.75} />} onClick={openCreateModal}>
            {l('添加供应商', 'Add provider')}
          </Button>
        </div>
      </div>

      <Layout
        className={[
          'model-management__workspace min-h-0 flex-1 overflow-hidden',
          selectedProvider && showInlineDetail ? 'model-management__workspace--with-detail' : '',
        ].filter(Boolean).join(' ')}
      >
        <div
          className="model-management__rail flex-shrink-0 overflow-auto border-r border-gray-200 bg-white"
          style={{ width: treeCollapsed ? 42 : 188 }}
        >
          {treeCollapsed ? (
            <Button
              type="text"
              icon={<ChevronRight size={17} strokeWidth={1.75} />}
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
                  icon={<ChevronRight size={17} strokeWidth={1.75} style={{ transform: 'rotate(180deg)' }} />}
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

        <div className="model-management__content min-w-0 flex-1 overflow-auto bg-gray-50 p-4">
          {providerList.length === 0 ? (
            <Card className="model-management__table-card">
              <Empty
                description={
                  loading
                    ? l('正在加载供应商', 'Loading providers')
                    : l('暂无供应商配置', 'No provider configuration')
                }
              />
            </Card>
          ) : (
            <Card className="model-management__table-card">
              <Table<ProviderListItem>
                rowKey="id"
                loading={loading}
                columns={providerColumns}
                dataSource={providerList}
                tableLayout="fixed"
                scroll={{ x: 656 }}
                pagination={{ pageSize: 20 }}
                onRow={(record) => ({
                  onClick: () => openProviderDetail(record),
                  style: { cursor: 'pointer' },
                })}
                rowClassName={(record) =>
                  record.id === selectedProvider?.id ? 'model-management__selected-row' : ''
                }
                size="small"
              />
            </Card>
          )}
        </div>

        {selectedProvider && showInlineDetail && (
          <div className="model-management__detail overflow-auto border-l border-gray-200 bg-white">
            <ProviderDetail
              provider={selectedProvider}
              balance={providerBalance.data}
              balanceLoading={providerBalance.loading && providerBalance.supplierId === Number(selectedProvider.id)}
              balanceError={providerBalance.error && providerBalance.supplierId === Number(selectedProvider.id)}
              models={providerModels}
              modelsLoading={modelsLoading}
              modelTypeFilter={modelTypeFilter}
              modelPagination={modelPagination}
              onModelTypeChange={handleModelTypeChange}
              onModelPageChange={handleModelPageChange}
              onAddModel={() => openModelModal()}
              onEditModel={openModelModal}
              onDeleteModel={handleDeleteModel}
              onEdit={() => openEditModal(selectedProvider)}
              onClose={() => {
                setDetailPanelOpen(false)
                setSelectedProvider(null)
                setProviderModels([])
                setModelPagination(DEFAULT_MODEL_PAGINATION)
                resetProviderBalance()
              }}
            />
          </div>
        )}

        {selectedProvider && !showInlineDetail && (
          <Drawer
            title={l('详情', 'Details')}
            placement="right"
            open={detailPanelOpen}
            onClose={() => setDetailPanelOpen(false)}
            width="min(82vw, 1040px)"
            rootClassName="provider-detail-drawer"
          >
            <ProviderDetail
              provider={selectedProvider}
              balance={providerBalance.data}
              balanceLoading={providerBalance.loading && providerBalance.supplierId === Number(selectedProvider.id)}
              balanceError={providerBalance.error && providerBalance.supplierId === Number(selectedProvider.id)}
              models={providerModels}
              modelsLoading={modelsLoading}
              modelTypeFilter={modelTypeFilter}
              modelPagination={modelPagination}
              onModelTypeChange={handleModelTypeChange}
              onModelPageChange={handleModelPageChange}
              onAddModel={() => openModelModal()}
              onEditModel={openModelModal}
              onDeleteModel={handleDeleteModel}
              onEdit={() => openEditModal(selectedProvider)}
            />
          </Drawer>
        )}
      </Layout>

      <Modal
        title={null}
        open={createModalOpen}
        onCancel={closeCreateModal}
        onOk={() => void handleSaveProvider()}
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
                  {providerEditing ? l('编辑供应商', 'Edit provider') : l('新增供应商', 'Add provider')}
                </Typography.Title>
                <Tag color={providerEditing ? 'blue' : 'green'} className="menu-editor__mode">
                  {providerEditing ? l('编辑', 'Editing') : l('新增', 'Creating')}
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
                  rules={
                    [{ required: true, whitespace: true, message: l('请输入 API Key', 'Enter an API key') }]
                  }
                >
                  <Input.Password
                    placeholder={l('请输入 API Key', 'Enter an API key')}
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Form.Item name="apiSecret" label="API Secret">
                  <Input.Password
                    placeholder={l('选填', 'Optional')}
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Form.Item label={l('启用状态', 'Active status')} className="menu-editor__switch-item">
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

      <Modal
        title={null}
        open={modelModalOpen}
        onCancel={() => setModelModalOpen(false)}
        onOk={() => void handleSaveModel()}
        afterOpenChange={handleModelModalOpenChange}
        confirmLoading={modelSaving}
        width="min(960px, calc(100vw - 48px))"
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

          <Form form={modelForm} layout="vertical" className="menu-editor__form">
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
                    disabled
                    loading={loading}
                    placeholder={l('选择供应商', 'Select a supplier')}
                    options={providerSelectOptions}
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
                <Form.Item label={l('启用状态', 'Active status')} className="menu-editor__switch-item">
                  <div className="menu-editor__switch-row">
                    <Form.Item name="active" valuePropName="checked" noStyle>
                      <Switch />
                    </Form.Item>
                    <span>{l('启用后模型可参与任务调度', 'Available for task dispatch when active')}</span>
                  </div>
                </Form.Item>
                {!modelEditing && (
                  <Form.Item label={l('默认模型', 'Default model')} className="menu-editor__switch-item">
                    <div className="menu-editor__switch-row">
                      <Form.Item name="default_model" valuePropName="checked" noStyle>
                        <Switch />
                      </Form.Item>
                      <span>{l('新增后作为该类型的默认调用模型', 'Use as the default model for this type')}</span>
                    </div>
                  </Form.Item>
                )}
              </div>
            </div>

            {selectedFormCategory === 'text' && !modelEditing && (
              <div className="menu-editor__section">
                <div className="menu-editor__section-title">{l('文本能力', 'Text capabilities')}</div>
                <div className="menu-editor__grid">
                  <Form.Item
                    name="text_api_protocol"
                    label={l('接口协议', 'API protocol')}
                    rules={[{ required: true, message: l('请选择接口协议', 'Select an API protocol') }]}
                  >
                    <Select options={TEXT_API_PROTOCOL_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    name="text_default_reasoning_effort"
                    label={l('默认推理强度', 'Default reasoning effort')}
                    dependencies={['text_reasoning_efforts']}
                    rules={[
                      { required: true, message: l('请选择默认推理强度', 'Select a default reasoning effort') },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const efforts = getFieldValue('text_reasoning_efforts') as string[] | undefined
                          if (!value || efforts?.includes(value)) return Promise.resolve()
                          return Promise.reject(
                            new Error(l('默认推理强度必须包含在支持列表中', 'The default effort must be in the supported list')),
                          )
                        },
                      }),
                    ]}
                  >
                    <Select options={TEXT_REASONING_EFFORT_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    name="text_reasoning_efforts"
                    label={l('支持的推理强度', 'Supported reasoning efforts')}
                    className="menu-editor__wide"
                    rules={[{ required: true, message: l('请选择至少一个推理强度', 'Select at least one reasoning effort') }]}
                  >
                    <Select mode="multiple" options={TEXT_REASONING_EFFORT_OPTIONS} />
                  </Form.Item>
                  <Form.Item label={l('记忆能力', 'Memory capability')} className="menu-editor__switch-item">
                    <div className="menu-editor__switch-row">
                      <Form.Item name="text_memory_supported" valuePropName="checked" noStyle>
                        <Switch
                          onChange={(checked) => {
                            if (!checked) modelForm.setFieldValue('text_default_memory_enabled', false)
                          }}
                        />
                      </Form.Item>
                      <span>{l('模型支持跨请求记忆', 'The model supports memory across requests')}</span>
                    </div>
                  </Form.Item>
                  <Form.Item label={l('默认启用记忆', 'Memory enabled by default')} className="menu-editor__switch-item">
                    <div className="menu-editor__switch-row">
                      <Form.Item name="text_default_memory_enabled" valuePropName="checked" noStyle>
                        <Switch disabled={!textMemorySupported} />
                      </Form.Item>
                      <span>{l('新任务默认启用记忆', 'Enable memory for new tasks by default')}</span>
                    </div>
                  </Form.Item>
                </div>
              </div>
            )}

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

type ProviderDetailProps = {
  provider: ProviderListItem
  balance: SystemSupplierBalanceRead | null
  balanceLoading: boolean
  balanceError: boolean
  models: SystemSupplierModelRead[]
  modelsLoading: boolean
  modelTypeFilter: ModelTypeFilter
  modelPagination: ModelPagination
  onModelTypeChange: (type: ModelTypeFilter) => void
  onModelPageChange: (page: number, pageSize: number) => void
  onAddModel: () => void
  onEditModel: (model: SystemSupplierModelRead) => void
  onDeleteModel: (model: SystemSupplierModelRead) => void
  onEdit?: () => void
  onClose?: () => void
}

function formatSupplierBalance(balance: SystemSupplierBalanceRead | null): string {
  if (!balance || balance.balance === null || balance.balance === undefined || balance.balance === '') return '—'

  const amount = typeof balance.balance === 'number' ? balance.balance : Number(balance.balance)
  const amountText = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : String(balance.balance)
  const currency = balance.currency?.trim()

  return currency ? `${amountText} ${currency}` : amountText
}

/** 展示供应商详情，敏感连接信息不会从后端响应中回显。 */
function ProviderDetail({
  provider,
  balance,
  balanceLoading,
  balanceError,
  models,
  modelsLoading,
  modelTypeFilter,
  modelPagination,
  onModelTypeChange,
  onModelPageChange,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onEdit,
  onClose,
}: ProviderDetailProps) {
  const l = useBilingualText()
  const status = provider.status ?? 'active'
  const balanceText = balanceLoading
    ? l('查询中…', 'Loading...')
    : balanceError
      ? l('查询失败', 'Failed to load')
      : formatSupplierBalance(balance)
  const modelColumns: TableColumnsType<SystemSupplierModelRead> = [
    {
      title: l('名称', 'Name'),
      dataIndex: 'name',
      key: 'name',
      width: 190,
      ellipsis: true,
      render: (name: string, record) => (
        <div className="provider-detail__table-name">
          <span>{name}</span>
          <small>{record.modelCode || '—'}</small>
        </div>
      ),
    },
    {
      title: l('类别', 'Type'),
      dataIndex: 'type',
      key: 'type',
      width: 104,
      align: 'center',
      render: (_type: number, record) => {
        const category = getModelCategory(record)
        return <Tag color={categoryColorMap[category]}>{modelTypeText(record.type, l)}</Tag>
      },
    },
    {
      title: l('描述', 'Description'),
      dataIndex: 'description',
      key: 'description',
      width: 190,
      ellipsis: true,
      render: (description: string) => <Tooltip title={description}>{description || '—'}</Tooltip>,
    },
    {
      title: l('请求地址', 'Request URL'),
      dataIndex: 'requestUrl',
      key: 'requestUrl',
      width: 240,
      ellipsis: true,
      render: (requestUrl: string) => <Tooltip title={requestUrl}>{requestUrl || '—'}</Tooltip>,
    },
    {
      title: l('状态', 'Status'),
      dataIndex: 'active',
      key: 'active',
      width: 82,
      align: 'center',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? l('启用', 'Active') : l('停用', 'Disabled')}</Tag>
      ),
    },
    {
      title: l('操作', 'Actions'),
      key: 'action',
      width: 164,
      align: 'left',
      render: (_, record) => (
        <Space size={8} className="provider-detail__table-actions flex-nowrap justify-start">
          <Button
            type="text"
            size="small"
            className={TABLE_ACTION_BTN_EDIT_CLASS}
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              onEditModel(record)
            }}
          >
            {l('编辑', 'Edit')}
          </Button>
          <Button
            type="text"
            size="small"
            danger
            className={TABLE_ACTION_BTN_DELETE_CLASS}
            icon={<DeleteOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              onDeleteModel(record)
            }}
          >
            {l('删除', 'Delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="provider-detail">
      <div className="provider-detail__topbar">
        <div>
          <div className="provider-detail__label">{l('详情', 'Details')}</div>
          <div className="provider-detail__heading">{provider.name}</div>
        </div>
        {onClose && (
          <Button type="text" size="small" onClick={onClose}>
            {l('收起', 'Collapse')}
          </Button>
        )}
      </div>

      <section className="provider-detail__summary">
        <Alert
          type="info"
          showIcon
          className="provider-detail__notice"
          message={l('模型由当前供应商接口分页查询', 'Models are loaded from the selected provider')}
          description={l('API Key 和 API Secret 等敏感信息不会在详情中回显。', 'Sensitive values such as API keys and secrets are not displayed in details.')}
        />
        <div className="provider-detail__meta-grid">
          <div>
            <span className="provider-detail__meta-label">{l('状态', 'Status')}</span>
            <Tag color={PROVIDER_STATUS_MAP[status]?.color}>{providerStatusText(status, l)}</Tag>
          </div>
          <div>
            <span className="provider-detail__meta-label">{l('账户余额', 'Account balance')}</span>
            <strong
              className={[
                'provider-detail__balance-value',
                balanceError ? 'provider-detail__balance-value--error' : '',
              ].filter(Boolean).join(' ')}
            >
              {balanceText}
            </strong>
          </div>
          <div>
            <span className="provider-detail__meta-label">Base URL</span>
            <Tooltip title={provider.base_url}>
              <strong>{provider.base_url || '—'}</strong>
            </Tooltip>
          </div>
          <div>
            <span className="provider-detail__meta-label">{l('描述', 'Description')}</span>
            <strong>{provider.description || '—'}</strong>
          </div>
          <div>
            <span className="provider-detail__meta-label">{l('创建人', 'Creator')}</span>
            <strong>{provider.created_by || '—'}</strong>
          </div>
        </div>
        {onEdit && (
          <Button type="text" icon={<EditOutlined />} className={TABLE_ACTION_BTN_EDIT_CLASS} onClick={onEdit}>
            {l('编辑', 'Edit')}
          </Button>
        )}
      </section>

      <section className="provider-detail__models">
        <div className="provider-detail__models-header">
          <div>
            <div className="provider-detail__section-title">{l('供应商模型', 'Provider models')}</div>
            <div className="provider-detail__section-subtitle">
              {l('共 {{count}} 个模型', '{{count}} models').replace('{{count}}', String(modelPagination.total))}
            </div>
          </div>
          <div className="provider-detail__models-actions">
            <Segmented
              size="small"
              value={modelTypeFilter}
              onChange={(value) => onModelTypeChange(value as ModelTypeFilter)}
              options={[
                { label: l('全部', 'All'), value: 'all' },
                { label: l('文本', 'Text'), value: '1' },
                { label: l('图片', 'Image'), value: '2' },
                { label: l('视频', 'Video'), value: '3' },
              ]}
            />
            <Button
              type="primary"
              size="small"
              icon={<Plus size={15} strokeWidth={1.75} />}
              onClick={onAddModel}
            >
              {l('添加模型', 'Add model')}
            </Button>
          </div>
        </div>

        <Table<SystemSupplierModelRead>
          rowKey="id"
          className="provider-detail__model-table"
          tableLayout="fixed"
          loading={modelsLoading}
          columns={modelColumns}
          dataSource={models}
          pagination={false}
          scroll={{ x: 970 }}
          size="small"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={modelsLoading ? l('正在加载模型', 'Loading models') : l('暂无模型', 'No models')}
              />
            ),
          }}
        />

        {modelPagination.total > 0 && (
          <div className="provider-detail__pagination">
            <Pagination
              size="small"
              current={modelPagination.page}
              pageSize={modelPagination.pageSize}
              total={modelPagination.total}
              showSizeChanger
              pageSizeOptions={[10, 20, 50]}
              onChange={onModelPageChange}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function providerStatusText(status: ProviderStatus, l: (zh: string, en: string) => string) {
  return status === 'active'
    ? l('活跃', 'Active')
    : status === 'testing'
      ? l('测试中', 'Testing')
      : l('禁用', 'Disabled')
}

function modelTypeText(type: number, l: (zh: string, en: string) => string) {
  if (type === 1) return l('文本生成', 'Text')
  if (type === 2) return l('图片生成', 'Image')
  if (type === 3) return l('视频生成', 'Video')
  return l('未知类型', 'Unknown')
}
