import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import type { TableColumnsType } from 'antd'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import { AudioLines, LoaderCircle, Pause, Play, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBilingualText } from '../../../i18n/useBilingualText'
import {
  SystemVoicesApi,
  type SystemVoiceAgeGroup,
  type SystemVoiceGender,
  type SystemVoiceRead,
  type SystemVoiceSourceType,
} from '../../../services/systemVoices'
import {
  TABLE_ACTION_BTN_DELETE_CLASS,
  TABLE_ACTION_BTN_EDIT_CLASS,
} from '../models/constants'
import './VoiceManagement.css'

type OptionalFilter<T> = 'all' | T

type VoicePreviewPhase = 'idle' | 'loading' | 'playing' | 'paused'

type VoicePreviewState = {
  voiceId: number | null
  phase: VoicePreviewPhase
}

type CachedVoiceAudio = {
  url: string
  audio: HTMLAudioElement
}

const IDLE_PREVIEW_STATE: VoicePreviewState = { voiceId: null, phase: 'idle' }
const MAX_CACHED_PREVIEWS = 6

type VoiceFormValues = {
  name: string
  providerCode: string
  providerVoiceId: string
  gender: SystemVoiceGender
  ageGroup: SystemVoiceAgeGroup
  emotionAdjustable: boolean
  previewUrl: string
  previewText: string
  sortOrder: number
  languageCodes: string[]
  primaryLanguageCode: string
}

const DEFAULT_FORM_VALUES: VoiceFormValues = {
  name: '',
  providerCode: 'minimax',
  providerVoiceId: '',
  gender: 1,
  ageGroup: 3,
  emotionAdjustable: false,
  previewUrl: '',
  previewText: '',
  sortOrder: 0,
  languageCodes: ['cn'],
  primaryLanguageCode: 'cn',
}

const LANGUAGE_OPTIONS = [
  { value: 'cn', zh: '中文', en: 'Chinese' },
  { value: 'en', zh: '英文', en: 'English' },
]

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function VoiceManagement() {
  const l = useBilingualText()
  const [messageApi, messageContextHolder] = message.useMessage()
  const [modalApi, modalContextHolder] = Modal.useModal()
  const [form] = Form.useForm<VoiceFormValues>()

  const [items, setItems] = useState<SystemVoiceRead[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [refreshToken, setRefreshToken] = useState(0)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sourceType, setSourceType] = useState<OptionalFilter<SystemVoiceSourceType>>('all')
  const [gender, setGender] = useState<OptionalFilter<SystemVoiceGender>>('all')
  const [ageGroup, setAgeGroup] = useState<OptionalFilter<SystemVoiceAgeGroup>>('all')
  const [languageCode, setLanguageCode] = useState('all')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingVoice, setEditingVoice] = useState<SystemVoiceRead | null>(null)
  const [formSeed, setFormSeed] = useState<VoiceFormValues>(DEFAULT_FORM_VALUES)
  const [submitting, setSubmitting] = useState(false)

  const audioCacheRef = useRef<Map<number, CachedVoiceAudio>>(new Map())
  const activeVoiceIdRef = useRef<number | null>(null)
  const previewRunRef = useRef(0)
  const [previewState, setPreviewState] = useState<VoicePreviewState>(IDLE_PREVIEW_STATE)
  const selectedLanguageCodes = Form.useWatch('languageCodes', form) ?? []

  const clearAudioHandlers = (audio: HTMLAudioElement) => {
    audio.onplaying = null
    audio.onwaiting = null
    audio.onstalled = null
    audio.onended = null
    audio.onerror = null
  }

  const stopActiveAudio = (resetTime = true) => {
    const activeVoiceId = activeVoiceIdRef.current
    const audio = activeVoiceId === null ? null : audioCacheRef.current.get(activeVoiceId)?.audio
    if (audio) {
      clearAudioHandlers(audio)
      audio.pause()
      if (resetTime) {
        try {
          audio.currentTime = 0
        } catch {
          // 元数据可能尚未就绪，此时只需暂停播放。
        }
      }
    }
    activeVoiceIdRef.current = null
  }

  const stopPreview = () => {
    previewRunRef.current += 1
    stopActiveAudio()
    setPreviewState(IDLE_PREVIEW_STATE)
  }

  const releaseAudio = (audio: HTMLAudioElement) => {
    clearAudioHandlers(audio)
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }

  const getPreviewAudio = (record: SystemVoiceRead) => {
    const cached = audioCacheRef.current.get(record.id)
    if (cached?.url === record.previewUrl && !cached.audio.error) return cached.audio

    if (cached) {
      releaseAudio(cached.audio)
      audioCacheRef.current.delete(record.id)
    }

    if (audioCacheRef.current.size >= MAX_CACHED_PREVIEWS) {
      const disposable = [...audioCacheRef.current.entries()]
        .find(([voiceId]) => voiceId !== activeVoiceIdRef.current)
      if (disposable) {
        releaseAudio(disposable[1].audio)
        audioCacheRef.current.delete(disposable[0])
      }
    }

    const audio = new Audio(record.previewUrl)
    audio.preload = 'auto'
    audioCacheRef.current.set(record.id, { url: record.previewUrl, audio })
    audio.load()
    return audio
  }

  const warmPreview = (record: SystemVoiceRead) => {
    if (!record.previewUrl || audioCacheRef.current.has(record.id)) return
    getPreviewAudio(record)
  }

  useEffect(() => () => {
    previewRunRef.current += 1
    audioCacheRef.current.forEach(({ audio }) => releaseAudio(audio))
    audioCacheRef.current.clear()
    activeVoiceIdRef.current = null
  }, [])

  useEffect(() => {
    let ignored = false
    setLoading(true)

    SystemVoicesApi.getPage({
      sourceType: sourceType === 'all' ? undefined : sourceType,
      gender: gender === 'all' ? undefined : gender,
      ageGroup: ageGroup === 'all' ? undefined : ageGroup,
      languageCode: languageCode === 'all' ? undefined : languageCode,
      keyword: keyword || undefined,
      page,
      pageSize,
    })
      .then((result) => {
        if (ignored) return
        setItems(result.items)
        setTotal(result.total)
      })
      .catch((error: unknown) => {
        if (ignored) return
        setItems([])
        setTotal(0)
        messageApi.error(getErrorMessage(error, l('音色列表加载失败', 'Failed to load voices')))
      })
      .finally(() => {
        if (!ignored) setLoading(false)
      })

    return () => {
      ignored = true
    }
  }, [ageGroup, gender, keyword, l, languageCode, messageApi, page, pageSize, refreshToken, sourceType])

  const sourceOptions = [
    { value: 'all', label: l('全部来源', 'All sources') },
    { value: 1, label: l('系统音色', 'System') },
    { value: 2, label: l('克隆音色', 'Cloned') },
    { value: 3, label: l('自定义音色', 'Custom') },
  ]

  const genderOptions = [
    { value: 'all', label: l('全部性别', 'All genders') },
    { value: 1, label: l('男性', 'Male') },
    { value: 2, label: l('女性', 'Female') },
  ]

  const ageOptions = [
    { value: 'all', label: l('全部年龄', 'All ages') },
    { value: 1, label: l('儿童', 'Child') },
    { value: 2, label: l('少年', 'Teen') },
    { value: 3, label: l('青年', 'Young adult') },
    { value: 4, label: l('中年', 'Middle-aged') },
    { value: 5, label: l('老年', 'Elderly') },
  ]

  const languageOptions = [
    { value: 'all', label: l('全部语言', 'All languages') },
    ...LANGUAGE_OPTIONS.map((item) => ({ value: item.value, label: l(item.zh, item.en) })),
  ]

  const getSourceLabel = (record: SystemVoiceRead) => {
    if (record.sourceType === 1) return l(record.sourceTypeName || '系统音色', 'System')
    if (record.sourceType === 2) return l(record.sourceTypeName || '克隆音色', 'Cloned')
    if (record.sourceType === 3) return l(record.sourceTypeName || '自定义音色', 'Custom')
    return l(record.sourceTypeName || '未知来源', 'Unknown')
  }

  const getGenderLabel = (record: SystemVoiceRead) => {
    if (record.gender === 1) return l(record.genderName || '男性', 'Male')
    if (record.gender === 2) return l(record.genderName || '女性', 'Female')
    return record.genderName || '--'
  }

  const getAgeLabel = (record: SystemVoiceRead) => {
    const englishLabels: Record<SystemVoiceAgeGroup, string> = {
      1: 'Child',
      2: 'Teen',
      3: 'Young adult',
      4: 'Middle-aged',
      5: 'Elderly',
    }
    if (record.ageGroup) {
      const fallbackZh = ageOptions.find((item) => item.value === record.ageGroup)?.label ?? '--'
      return l(record.ageGroupName || fallbackZh, englishLabels[record.ageGroup])
    }
    return record.ageGroupName || '--'
  }

  const getLanguageLabel = (code: string, backendName: string) => {
    const option = LANGUAGE_OPTIONS.find((item) => item.value === code)
    return option ? l(backendName || option.zh, option.en) : backendName || code
  }

  const togglePreview = (record: SystemVoiceRead) => {
    if (!record.previewUrl) {
      messageApi.warning(l('该音色没有试听文件', 'This voice has no preview audio'))
      return
    }

    const isCurrentVoice = previewState.voiceId === record.id
    if (isCurrentVoice && (previewState.phase === 'playing' || previewState.phase === 'loading')) {
      previewRunRef.current += 1
      const audio = audioCacheRef.current.get(record.id)?.audio
      if (audio) {
        clearAudioHandlers(audio)
        audio.pause()
      }
      setPreviewState({ voiceId: record.id, phase: 'paused' })
      return
    }

    const shouldResume = isCurrentVoice && previewState.phase === 'paused'
    const runId = previewRunRef.current + 1
    previewRunRef.current = runId

    if (!shouldResume) stopActiveAudio()

    const audio = getPreviewAudio(record)
    activeVoiceIdRef.current = record.id
    clearAudioHandlers(audio)

    const isCurrentRun = () => previewRunRef.current === runId && activeVoiceIdRef.current === record.id
    const failPreview = (error?: unknown) => {
      if (!isCurrentRun()) return
      previewRunRef.current += 1
      stopActiveAudio()
      setPreviewState(IDLE_PREVIEW_STATE)
      messageApi.error(getErrorMessage(error, l('试听音频加载失败', 'Failed to load preview audio')))
    }

    audio.onplaying = () => {
      if (isCurrentRun()) setPreviewState({ voiceId: record.id, phase: 'playing' })
    }
    audio.onwaiting = () => {
      if (isCurrentRun()) setPreviewState({ voiceId: record.id, phase: 'loading' })
    }
    audio.onstalled = audio.onwaiting
    audio.onended = () => {
      if (!isCurrentRun()) return
      previewRunRef.current += 1
      stopActiveAudio()
      setPreviewState(IDLE_PREVIEW_STATE)
    }
    audio.onerror = () => failPreview()

    if (!shouldResume) {
      try {
        audio.currentTime = 0
      } catch {
        // 元数据就绪后，音频会从零开始播放。
      }
    }

    setPreviewState({ voiceId: record.id, phase: 'loading' })
    void audio.play().catch(failPreview)
  }

  const resetFilters = () => {
    setKeywordInput('')
    setKeyword('')
    setSourceType('all')
    setGender('all')
    setAgeGroup('all')
    setLanguageCode('all')
    setPage(1)
    setRefreshToken((value) => value + 1)
  }

  const openCreateEditor = () => {
    setEditingVoice(null)
    setFormSeed(DEFAULT_FORM_VALUES)
    setEditorOpen(true)
  }

  const openEditEditor = (record: SystemVoiceRead) => {
    const languageCodes = record.languages.map((item) => item.code).filter(Boolean)
    const primaryLanguageCode = record.languages.find((item) => item.primaryLanguage)?.code
      ?? languageCodes[0]
      ?? 'cn'
    setEditingVoice(record)
    setFormSeed({
      name: record.name,
      providerCode: record.providerCode,
      providerVoiceId: record.providerVoiceId,
      gender: record.gender ?? 1,
      ageGroup: record.ageGroup ?? 3,
      emotionAdjustable: record.emotionAdjustable,
      previewUrl: record.previewUrl,
      previewText: record.previewText,
      sortOrder: record.sortOrder,
      languageCodes: languageCodes.length ? languageCodes : ['cn'],
      primaryLanguageCode,
    })
    setEditorOpen(true)
  }

  const handleLanguageChange = (codes: string[]) => {
    const primaryCode = form.getFieldValue('primaryLanguageCode')
    if (!codes.includes(primaryCode)) {
      form.setFieldValue('primaryLanguageCode', codes[0])
    }
  }

  const submitEditor = async () => {
    try {
      const values = await form.validateFields()
      const languages = values.languageCodes.map((code) => {
        const option = LANGUAGE_OPTIONS.find((item) => item.value === code)
        return {
          code,
          name: option?.zh ?? code,
          primaryLanguage: code === values.primaryLanguageCode,
        }
      })
      const payload = {
        name: values.name.trim(),
        providerCode: values.providerCode.trim(),
        providerVoiceId: values.providerVoiceId.trim(),
        gender: values.gender,
        ageGroup: values.ageGroup,
        emotionAdjustable: values.emotionAdjustable,
        previewUrl: values.previewUrl.trim(),
        previewText: values.previewText.trim(),
        sortOrder: values.sortOrder ?? 0,
        languages,
      }

      setSubmitting(true)
      if (editingVoice) {
        await SystemVoicesApi.update({ id: editingVoice.id, ...payload })
        messageApi.success(l('音色修改成功', 'Voice updated'))
      } else {
        await SystemVoicesApi.create(payload)
        messageApi.success(l('系统音色新增成功', 'System voice created'))
        setPage(1)
      }
      setEditorOpen(false)
      setRefreshToken((value) => value + 1)
    } catch (error) {
      if (isFormValidationError(error)) return
      messageApi.error(getErrorMessage(error, l('保存音色失败', 'Failed to save voice')))
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = (record: SystemVoiceRead) => {
    modalApi.confirm({
      centered: true,
      icon: null,
      className: 'voice-delete-confirm',
      title: l('删除这个系统音色？', 'Delete this system voice?'),
      content: l(
        `“${record.name}”删除后无法恢复，请确认它未被现有任务引用。`,
        `“${record.name}” cannot be restored after deletion. Make sure it is not used by existing tasks.`,
      ),
      okText: l('删除', 'Delete'),
      cancelText: l('取消', 'Cancel'),
      okButtonProps: { danger: true },
      async onOk() {
        stopPreview()
        await SystemVoicesApi.delete({ id: record.id })
        messageApi.success(l('音色已删除', 'Voice deleted'))
        if (items.length === 1 && page > 1) setPage((value) => value - 1)
        else setRefreshToken((value) => value + 1)
      },
    })
  }

  const columns: TableColumnsType<SystemVoiceRead> = [
    {
      title: l('试听', 'Preview'),
      key: 'preview',
      width: 72,
      align: 'center',
      render: (_, record) => {
        const isCurrentVoice = previewState.voiceId === record.id
        const phase = isCurrentVoice ? previewState.phase : 'idle'
        const isLoading = phase === 'loading'
        const isPlaying = phase === 'playing'
        const title = !record.previewUrl
          ? l('暂无试听音频', 'No preview audio')
          : isLoading
            ? l('正在加载，点击暂停', 'Loading, click to pause')
            : isPlaying
              ? l('暂停试听', 'Pause preview')
              : phase === 'paused'
                ? l('继续试听', 'Resume preview')
                : l('播放试听', 'Play preview')

        return (
          <Tooltip title={title}>
            <Button
              type="text"
              aria-label={title}
              className={`voice-preview-button is-${phase}`}
              disabled={!record.previewUrl}
              icon={isLoading
                ? <LoaderCircle className="voice-preview-button__spinner" size={15} />
                : isPlaying
                  ? <Pause fill="currentColor" size={14} />
                  : <Play fill="currentColor" size={14} />}
              onPointerEnter={() => warmPreview(record)}
              onFocus={() => warmPreview(record)}
              onClick={() => togglePreview(record)}
            />
          </Tooltip>
        )
      },
    },
    {
      title: l('音色', 'Voice'),
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (_, record) => (
        <div className="voice-name-cell">
          <div className="voice-name-cell__title">{record.name}</div>
          <div className="voice-name-cell__preview" title={record.previewText || undefined}>
            {record.previewText || l('暂无试听文案', 'No preview text')}
          </div>
        </div>
      ),
    },
    {
      title: l('来源', 'Source'),
      key: 'sourceType',
      width: 120,
      render: (_, record) => (
        <Tag className={`voice-source-tag voice-source-tag--${record.sourceType ?? 'unknown'}`}>
          {getSourceLabel(record)}
        </Tag>
      ),
    },
    {
      title: l('声音特征', 'Profile'),
      key: 'profile',
      width: 160,
      render: (_, record) => (
        <div className="voice-profile-cell">
          <span>{getGenderLabel(record)}</span>
          <span className="voice-profile-cell__separator" />
          <span>{getAgeLabel(record)}</span>
        </div>
      ),
    },
    {
      title: l('语言', 'Languages'),
      key: 'languages',
      width: 220,
      render: (_, record) => (
        <div className="voice-language-list">
          {record.languages.length ? record.languages.map((language) => (
            <span className="voice-language" key={language.code}>
              {getLanguageLabel(language.code, language.name)}
              {language.primaryLanguage && <small>{l('主', 'Primary')}</small>}
            </span>
          )) : <span className="voice-cell-muted">--</span>}
        </div>
      ),
    },
    {
      title: l('能力/状态', 'Capability / Status'),
      key: 'status',
      width: 160,
      render: (_, record) => (
        <div className="voice-status-cell">
          <Tag className={record.status === 1 ? 'voice-status-tag is-enabled' : 'voice-status-tag'}>
            {record.status === 1 ? l('启用', 'Enabled') : record.status === 0 ? l('停用', 'Disabled') : l('未知', 'Unknown')}
          </Tag>
          <span>{record.emotionAdjustable ? l('情绪可调', 'Emotion adjustable') : l('固定情绪', 'Fixed emotion')}</span>
        </div>
      ),
    },
    {
      title: l('更新时间', 'Updated'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (value: string | null | undefined) => value ? value.replace('T', ' ') : '--',
    },
    {
      title: l('操作', 'Actions'),
      key: 'actions',
      fixed: 'right',
      width: 142,
      render: (_, record) => record.sourceType === 1 ? (
        <Space size={4}>
          <Button
            type="text"
            icon={<EditOutlined />}
            className={TABLE_ACTION_BTN_EDIT_CLASS}
            onClick={() => openEditEditor(record)}
          >
            {l('编辑', 'Edit')}
          </Button>
          <Button
            type="text"
            icon={<DeleteOutlined />}
            className={TABLE_ACTION_BTN_DELETE_CLASS}
            onClick={() => confirmDelete(record)}
          >
            {l('删除', 'Delete')}
          </Button>
        </Space>
      ) : <span className="voice-cell-muted">--</span>,
    },
  ]

  const editingMissingProvider = Boolean(
    editingVoice && (!editingVoice.providerCode || !editingVoice.providerVoiceId),
  )

  return (
    <Card
      className="voice-management"
      title={l('音色管理', 'Voice Management')}
      extra={(
        <Space>
          <Tooltip title={l('刷新列表', 'Refresh list')}>
            <Button
              icon={<RotateCcw size={15} />}
              loading={loading}
              onClick={() => setRefreshToken((value) => value + 1)}
            >
              {l('刷新', 'Refresh')}
            </Button>
          </Tooltip>
          <Button type="primary" icon={<Plus size={15} />} onClick={openCreateEditor}>
            {l('新增系统音色', 'Add system voice')}
          </Button>
        </Space>
      )}
    >
      {messageContextHolder}
      {modalContextHolder}

      <section className="voice-management__filters" aria-label={l('音色筛选', 'Voice filters')}>
        <Input.Search
          allowClear
          value={keywordInput}
          className="voice-management__search"
          placeholder={l('搜索音色名称或试听文案', 'Search name or preview text')}
          onChange={(event) => {
            const value = event.target.value
            setKeywordInput(value)
            if (!value) {
              setKeyword('')
              setPage(1)
            }
          }}
          onSearch={(value) => {
            setKeyword(value.trim())
            setPage(1)
          }}
        />
        <Select value={sourceType} options={sourceOptions} onChange={(value) => { setSourceType(value); setPage(1) }} />
        <Select value={gender} options={genderOptions} onChange={(value) => { setGender(value); setPage(1) }} />
        <Select value={ageGroup} options={ageOptions} onChange={(value) => { setAgeGroup(value); setPage(1) }} />
        <Select value={languageCode} options={languageOptions} onChange={(value) => { setLanguageCode(value); setPage(1) }} />
        <Button icon={<RotateCcw size={14} />} onClick={resetFilters}>{l('重置', 'Reset')}</Button>
      </section>

      <section className="voice-management__table-panel">
        <Table<SystemVoiceRead>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          scroll={{ x: 1450, y: 'max(260px, calc(100vh - 340px))' }}
          locale={{ emptyText: l('暂无符合条件的音色', 'No matching voices') }}
        />
        <footer className="voice-management__pagination">
          <span>{l(`共 ${total} 条`, `${total} total`)}</span>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50]}
            onChange={(nextPage, nextPageSize) => {
              stopPreview()
              if (nextPageSize !== pageSize) {
                setPageSize(nextPageSize)
                setPage(1)
              } else {
                setPage(nextPage)
              }
            }}
          />
        </footer>
      </section>

      <Modal
        open={editorOpen}
        width={780}
        centered
        forceRender
        maskClosable={false}
        rootClassName="voice-editor-modal"
        title={(
          <div className="voice-editor-modal__title">
            <span>{l('音色管理', 'Voice management')}</span>
            <strong>{editingVoice ? l('编辑系统音色', 'Edit system voice') : l('新增系统音色', 'Add system voice')}</strong>
          </div>
        )}
        okText={l('保存', 'Save')}
        cancelText={l('取消', 'Cancel')}
        confirmLoading={submitting}
        onOk={() => void submitEditor()}
        onCancel={() => setEditorOpen(false)}
        afterOpenChange={(open) => {
          if (open) {
            form.resetFields()
            form.setFieldsValue(formSeed)
          }
        }}
      >
        {editingMissingProvider && (
          <div className="voice-editor-modal__notice">
            <AudioLines size={17} />
            <span>{l(
              '分页接口未返回供应商编码和音色 ID，请补全这两项后再保存，避免覆盖为无效配置。',
              'The list API does not return provider code or voice ID. Complete both before saving.',
            )}</span>
          </div>
        )}
        <Form<VoiceFormValues> form={form} layout="vertical" requiredMark>
          <section className="voice-editor-section">
            <h3>{l('基础信息', 'Basic information')}</h3>
            <div className="voice-editor-grid">
              <Form.Item
                label={l('音色名称', 'Voice name')}
                name="name"
                rules={[{ required: true, whitespace: true, message: l('请输入音色名称', 'Enter a voice name') }]}
              >
                <Input maxLength={80} placeholder={l('例如：温润男声', 'For example: Warm male voice')} />
              </Form.Item>
              <Form.Item label={l('排序值', 'Sort order')} name="sortOrder" rules={[{ required: true }]}>
                <InputNumber min={0} precision={0} className="voice-editor-number" />
              </Form.Item>
              <Form.Item
                label={l('供应商编码', 'Provider code')}
                name="providerCode"
                rules={[{ required: true, whitespace: true, message: l('请输入供应商编码', 'Enter provider code') }]}
              >
                <Input placeholder="minimax" />
              </Form.Item>
              <Form.Item
                label={l('供应商音色 ID', 'Provider voice ID')}
                name="providerVoiceId"
                rules={[{ required: true, whitespace: true, message: l('请输入供应商音色 ID', 'Enter provider voice ID') }]}
              >
                <Input placeholder="Chinese (Mandarin)" />
              </Form.Item>
              <Form.Item label={l('性别', 'Gender')} name="gender" rules={[{ required: true }]}>
                <Select options={genderOptions.filter((item) => item.value !== 'all')} />
              </Form.Item>
              <Form.Item label={l('年龄段', 'Age group')} name="ageGroup" rules={[{ required: true }]}>
                <Select options={ageOptions.filter((item) => item.value !== 'all')} />
              </Form.Item>
            </div>
          </section>

          <section className="voice-editor-section">
            <h3>{l('试听与能力', 'Preview and capability')}</h3>
            <Form.Item
              label={l('试听地址', 'Preview URL')}
              name="previewUrl"
              rules={[
                { required: true, whitespace: true, message: l('请输入试听地址', 'Enter a preview URL') },
                { type: 'url', message: l('请输入有效的 URL', 'Enter a valid URL') },
              ]}
            >
              <Input placeholder="https://.../voice.mp3" />
            </Form.Item>
            <Form.Item
              label={l('试听文案', 'Preview text')}
              name="previewText"
              rules={[{ required: true, whitespace: true, message: l('请输入试听文案', 'Enter preview text') }]}
            >
              <Input.TextArea rows={3} maxLength={500} showCount />
            </Form.Item>
            <Form.Item label={l('情绪能力', 'Emotion control')} name="emotionAdjustable" valuePropName="checked">
              <Switch checkedChildren={l('可调', 'On')} unCheckedChildren={l('固定', 'Fixed')} />
            </Form.Item>
          </section>

          <section className="voice-editor-section">
            <h3>{l('语言配置', 'Language settings')}</h3>
            <div className="voice-editor-grid">
              <Form.Item
                label={l('支持语言', 'Supported languages')}
                name="languageCodes"
                rules={[{ required: true, type: 'array', min: 1, message: l('至少选择一种语言', 'Select at least one language') }]}
              >
                <Select
                  mode="multiple"
                  options={LANGUAGE_OPTIONS.map((item) => ({ value: item.value, label: l(item.zh, item.en) }))}
                  onChange={handleLanguageChange}
                />
              </Form.Item>
              <Form.Item
                label={l('主要语言', 'Primary language')}
                name="primaryLanguageCode"
                rules={[{ required: true, message: l('请选择主要语言', 'Select a primary language') }]}
              >
                <Select
                  options={LANGUAGE_OPTIONS
                    .filter((item) => selectedLanguageCodes.includes(item.value))
                    .map((item) => ({ value: item.value, label: l(item.zh, item.en) }))}
                />
              </Form.Item>
            </div>
          </section>
        </Form>
      </Modal>
    </Card>
  )
}

function isFormValidationError(error: unknown): error is { errorFields: unknown[] } {
  return error !== null && typeof error === 'object' && 'errorFields' in error
}

export default VoiceManagement
