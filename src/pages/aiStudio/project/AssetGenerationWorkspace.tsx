import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Button, Input, message } from 'antd'
import {
  CloseOutlined,
  DeleteOutlined,
  FileSyncOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  PictureOutlined,
  PlusOutlined,
  ThunderboltFilled,
} from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import ImageViewer from './ImageViewer'
import StudioSelect from './StudioSelect'
import StudioRatioOption from './StudioRatioOption'
import './AssetGenerationWorkspace.css'

export type GenerationAssetKind = 'role' | 'scene' | 'prop'

type AssetGenerationWorkspaceProps = {
  kind: GenerationAssetKind
  ratio: string
  styleName: string
  model: string
  resolution: string
  initialAsset?: {
    name: string
    prompt?: string
    imageUrl?: string
    description?: string
  }
  onModelChange: (value: string) => void
  onResolutionChange: (value: string) => void
  onClose: () => void
  onGenerate: (name: string, prompt: string) => void
}

type ReferenceImage = {
  id: string
  name: string
  url: string
}

type LookDraft = {
  id: string
  name: string
  prompt: string
  imageUrl?: string
  references: ReferenceImage[]
}

const MAX_REFERENCE_IMAGES = 14
const MAX_PROMPT_LENGTH = 5000
const RATIO_OPTIONS = ['9:16', '4:3', '16:9', '3:4', '1:1', '21:9']

const COPY: Record<GenerationAssetKind, {
  titleZh: string
  titleEn: string
  nameZh: string
  nameEn: string
  promptZh: string
  promptEn: string
  lookZh: string
  lookEn: string
}> = {
  role: {
    titleZh: '新增角色',
    titleEn: 'New character',
    nameZh: '角色',
    nameEn: 'Character',
    promptZh: '请输入该角色的造型提示词，例如外貌、服饰、年龄、气质和姿态',
    promptEn: 'Describe the character appearance, clothing, age, mood, and pose',
    lookZh: '主角色图',
    lookEn: 'Main look',
  },
  scene: {
    titleZh: '新增场景',
    titleEn: 'New scene',
    nameZh: '场景',
    nameEn: 'Scene',
    promptZh: '请输入场景提示词，例如空间、时间、天气、光线和环境细节',
    promptEn: 'Describe the location, time, weather, lighting, and environment',
    lookZh: '场景主图',
    lookEn: 'Main view',
  },
  prop: {
    titleZh: '新增道具',
    titleEn: 'New prop',
    nameZh: '道具',
    nameEn: 'Prop',
    promptZh: '请输入道具提示词，例如材质、结构、年代、颜色和使用状态',
    promptEn: 'Describe the material, structure, period, color, and condition',
    lookZh: '道具主图',
    lookEn: 'Main view',
  },
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image'))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

export default function AssetGenerationWorkspace({
  kind,
  ratio,
  styleName,
  model,
  resolution,
  initialAsset,
  onModelChange,
  onResolutionChange,
  onClose,
  onGenerate,
}: AssetGenerationWorkspaceProps) {
  const l = useBilingualText()
  const copy = COPY[kind]
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const localLookInputRef = useRef<HTMLInputElement>(null)
  const lookAddRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(initialAsset?.name ?? '')
  const [prompt, setPrompt] = useState(initialAsset?.prompt ?? '')
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [previewImage, setPreviewImage] = useState<string | undefined>(initialAsset?.imageUrl)
  const [looks, setLooks] = useState<LookDraft[]>(() => [{
    id: 'main',
    name: initialAsset?.name || l(copy.lookZh, copy.lookEn),
    prompt: initialAsset?.prompt ?? '',
    imageUrl: initialAsset?.imageUrl,
    references: [],
  }])
  const [activeLookId, setActiveLookId] = useState('main')
  const [selectedRatio, setSelectedRatio] = useState(ratio || '9:16')
  const [selectedStyle, setSelectedStyle] = useState(styleName || l('无风格', 'No style'))
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [lookMenuOpen, setLookMenuOpen] = useState(false)
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [rewriteDraft, setRewriteDraft] = useState(initialAsset?.prompt ?? '')
  const [rewriteInstruction, setRewriteInstruction] = useState('')
  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const activeLook = looks.find((look) => look.id === activeLookId) ?? looks[0]
  const workspaceTitle = initialAsset?.name || l(copy.titleZh, copy.titleEn)
  const canGenerate = Boolean(name.trim() && prompt.trim())
  const hasEmptyLook = looks.some((look) => (
    look.id !== 'main' && !(look.id === activeLookId ? previewImage : look.imageUrl)
  ))

  const styleOptions = useMemo(() => {
    const values = [styleName, l('无风格', 'No style')].filter(Boolean)
    return Array.from(new Set(values)).map((value) => ({ value, label: value }))
  }, [l, styleName])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (imageViewerOpen) {
        setImageViewerOpen(false)
        return
      }
      if (rewriteOpen) {
        setRewriteOpen(false)
        return
      }
      if (lookMenuOpen) {
        setLookMenuOpen(false)
        return
      }
      if (promptExpanded) {
        setPromptExpanded(false)
        return
      }
      onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [imageViewerOpen, lookMenuOpen, onClose, promptExpanded, rewriteOpen])

  useEffect(() => {
    if (!lookMenuOpen) return
    const closeLookMenu = (event: PointerEvent) => {
      if (!lookAddRef.current?.contains(event.target as Node)) setLookMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeLookMenu)
    return () => document.removeEventListener('pointerdown', closeLookMenu)
  }, [lookMenuOpen])

  const openPromptRewrite = () => {
    setRewriteDraft(prompt)
    setRewriteInstruction('')
    setRewriteOpen(true)
  }

  const openImageViewer = () => {
    if (!previewImage) return
    setImageViewerOpen(true)
  }

  const handleReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length !== files.length) message.warning(l('仅支持上传图片文件', 'Only image files are supported'))
    const available = Math.max(0, MAX_REFERENCE_IMAGES - references.length)
    const selectedFiles = imageFiles.slice(0, available)
    if (imageFiles.length > available) message.warning(l('最多上传 14 张参考图', 'You can upload up to 14 reference images'))
    if (!selectedFiles.length) return

    try {
      const urls = await Promise.all(selectedFiles.map(fileToDataUrl))
      setReferences((current) => [
        ...current,
        ...selectedFiles.map((file, index) => ({
          id: `${file.name}-${file.lastModified}-${index}`,
          name: file.name,
          url: urls[index],
        })),
      ])
    } catch {
      message.error(l('参考图读取失败', 'Failed to read the reference image'))
    }
  }

  const selectLook = (lookId: string) => {
    if (lookId === activeLookId) return
    const nextLook = looks.find((look) => look.id === lookId)
    if (!nextLook) return

    setLooks((current) => current.map((look) => (
      look.id === activeLookId
        ? { ...look, prompt, imageUrl: previewImage, references }
        : look
    )))
    setActiveLookId(nextLook.id)
    setPrompt(nextLook.prompt)
    setRewriteDraft(nextLook.prompt)
    setReferences(nextLook.references)
    setPreviewImage(nextLook.imageUrl)
    setImageViewerOpen(false)
  }

  const addLook = (imageUrl?: string) => {
    if (hasEmptyLook) return
    const lookNumber = looks.filter((look) => look.id !== 'main').length + 1
    const mainLook = looks.find((look) => look.id === 'main')
    const mainImage = activeLookId === 'main' ? previewImage : mainLook?.imageUrl
    const newLook: LookDraft = {
      id: `look-${Date.now()}-${lookNumber}`,
      name: l(`造型${lookNumber}`, `Look ${lookNumber}`),
      prompt: '',
      imageUrl,
      references: mainImage ? [{
        id: `main-look-reference-${Date.now()}`,
        name: initialAsset?.name || l(copy.lookZh, copy.lookEn),
        url: mainImage,
      }] : [],
    }

    setLooks((current) => [
      ...current.map((look) => (
        look.id === activeLookId
          ? { ...look, prompt, imageUrl: previewImage, references }
          : look
      )),
      newLook,
    ])
    setActiveLookId(newLook.id)
    setPrompt('')
    setRewriteDraft('')
    setReferences(newLook.references)
    setPreviewImage(imageUrl)
    setImageViewerOpen(false)
  }

  const handleLocalLookImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error(l('请选择图片文件', 'Choose an image file'))
      return
    }
    try {
      addLook(await fileToDataUrl(file))
    } catch {
      message.error(l('造型图片读取失败', 'Failed to read the look image'))
    }
  }

  return (
    <section className="asset-generation-workspace" role="dialog" aria-modal="true" aria-label={workspaceTitle}>
      <header className="asset-generation-workspace__header">
        <Button type="text" icon={<CloseOutlined />} aria-label={l('关闭', 'Close')} onClick={onClose} />
        <strong>{workspaceTitle}</strong>
      </header>

      <div className="asset-generation-workspace__body">
        <main className="asset-generation-workspace__stage">
          {previewImage && (
            <p className="asset-generation-workspace__ai-notice">
              {l('内容由AI生成，仅供参考', 'AI-generated content for reference only')}
            </p>
          )}
          <div className={`asset-generation-workspace__preview${previewImage ? ' has-image' : ''}`}>
            {previewImage ? (
              <>
                <button
                  type="button"
                  className="asset-generation-workspace__viewer-trigger"
                  aria-label={l('查看人物大图', 'View full-size character image')}
                  onClick={openImageViewer}
                >
                  <img src={previewImage} alt={name || l(copy.nameZh, copy.nameEn)} />
                </button>
                <span className="asset-generation-workspace__main-badge">
                  {l('当前选中主图', 'Current main image')}
                </span>
              </>
            ) : (
              <>
                <PictureOutlined />
                <span>{l('待生成', 'Ready to generate')}</span>
              </>
            )}
          </div>
          <p className="asset-generation-workspace__description">
            {initialAsset?.description || l('暂无图像描述', 'No image description yet')}
          </p>
          <section className="asset-generation-workspace__history" aria-label={l('历史记录', 'History')}>
            <h2>{l('历史记录', 'History')} <small>History</small></h2>
            <button
              type="button"
              className={previewImage ? 'has-image is-selected' : ''}
              disabled={!previewImage}
              aria-label={previewImage ? l('当前历史图片', 'Current history image') : l('暂无历史图片', 'No history image')}
              onClick={openImageViewer}
            >
              {previewImage ? <img src={previewImage} alt="" /> : <PictureOutlined />}
            </button>
          </section>
        </main>

        <aside className="asset-generation-workspace__panel">
          <div className="asset-generation-workspace__form-scroll">
            <label className={`asset-generation-workspace__field${activeLookId !== 'main' ? ' has-look-name' : ''}`}>
              <span>{l(copy.nameZh, copy.nameEn)} <small>{copy.nameEn}</small></span>
              <div className="asset-generation-workspace__name-inputs">
                <Input
                  className={activeLookId !== 'main' ? 'asset-generation-workspace__character-name is-locked' : 'asset-generation-workspace__character-name'}
                  value={name}
                  maxLength={30}
                  disabled={activeLookId !== 'main'}
                  placeholder={l(`请输入${copy.nameZh}`, `Enter ${copy.nameEn.toLowerCase()} name`)}
                  onChange={(event) => setName(event.target.value)}
                />
                {activeLookId !== 'main' && (
                  <Input
                    value={activeLook?.name ?? ''}
                    maxLength={30}
                    aria-label={l('造型名称', 'Look name')}
                    placeholder={l('请输入造型名称', 'Enter look name')}
                    onChange={(event) => {
                      const value = event.target.value
                      setLooks((current) => current.map((look) => (
                        look.id === activeLookId ? { ...look, name: value } : look
                      )))
                    }}
                  />
                )}
              </div>
            </label>

            <div className="asset-generation-workspace__reference-heading">
              <strong>{l('参考图', 'Reference images')}</strong>
              <span>{references.length}/{MAX_REFERENCE_IMAGES}</span>
            </div>
            <div className="asset-generation-workspace__references">
              {references.map((reference) => (
                <div key={reference.id} className="asset-generation-workspace__reference">
                  <img src={reference.url} alt={reference.name} />
                  <button
                    type="button"
                    aria-label={l('删除参考图', 'Remove reference image')}
                    onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              ))}
              {references.length < MAX_REFERENCE_IMAGES && (
                <button
                  type="button"
                  className="asset-generation-workspace__reference-add"
                  aria-label={l('添加参考图', 'Add reference image')}
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <PlusOutlined />
                </button>
              )}
            </div>

            <div className="asset-generation-workspace__prompt-section">
              <div className="asset-generation-workspace__prompt-heading">
                <strong>{l('提示词', 'Prompt')}</strong>
                <div className="asset-generation-workspace__prompt-heading-actions">
                  <button
                    type="button"
                    className="asset-generation-workspace__rewrite-trigger"
                    aria-label={l('提示词智能改写', 'Smart prompt rewrite')}
                    onClick={openPromptRewrite}
                  >
                    <span className="asset-generation-workspace__rewrite-trigger-label">
                      {l('提示词智能改写', 'Smart rewrite')}
                    </span>
                    <FileSyncOutlined />
                  </button>
                  <button
                    type="button"
                    aria-label={promptExpanded ? l('收起提示词编辑器', 'Collapse prompt editor') : l('展开提示词编辑器', 'Expand prompt editor')}
                    onClick={() => setPromptExpanded((expanded) => !expanded)}
                  >
                    {promptExpanded ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  </button>
                </div>
              </div>
              <div className="asset-generation-workspace__prompt-editor">
                <Input.TextArea
                  value={prompt}
                  maxLength={MAX_PROMPT_LENGTH}
                  autoSize={false}
                  variant="borderless"
                  placeholder={l(copy.promptZh, copy.promptEn)}
                  onChange={(event) => setPrompt(event.target.value)}
                />
                <div className="asset-generation-workspace__prompt-options">
                  <StudioSelect
                    className="asset-generation-workspace__ratio-select"
                    value={selectedRatio}
                    aria-label={l('图片比例', 'Image ratio')}
                    options={RATIO_OPTIONS.map((value) => ({ value, label: <StudioRatioOption value={value} /> }))}
                    onChange={setSelectedRatio}
                    popupClassName="asset-generation-workspace__ratio-popup"
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <StudioSelect
                    value={selectedStyle}
                    aria-label={l('画面风格', 'Visual style')}
                    options={styleOptions}
                    onChange={setSelectedStyle}
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <small>{prompt.length}/{MAX_PROMPT_LENGTH}</small>
                </div>
              </div>
            </div>
          </div>

          <div className="asset-generation-workspace__look-rail">
            <strong>{l('全部造型', 'Looks')}</strong>
            <div ref={lookAddRef} className={`asset-generation-workspace__look-add-wrap${lookMenuOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="asset-generation-workspace__look-add"
                aria-label={hasEmptyLook
                  ? l('已有待生成造型', 'An empty look already exists')
                  : l('添加造型', 'Add look')}
                aria-haspopup="menu"
                aria-expanded={lookMenuOpen}
                disabled={hasEmptyLook}
                onClick={() => setLookMenuOpen((open) => !open)}
              >
                <PlusOutlined />
                <span>{l('添加造型', 'Add')}</span>
              </button>
              {lookMenuOpen && (
                <div className="asset-generation-workspace__look-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLookMenuOpen(false)
                      addLook()
                    }}
                  >
                    {l('模型生成', 'Generate')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLookMenuOpen(false)
                      localLookInputRef.current?.click()
                    }}
                  >
                    {l('本地导入', 'Import')}
                  </button>
                </div>
              )}
            </div>
            {looks.map((look) => {
              const imageUrl = look.id === activeLookId ? previewImage : look.imageUrl
              return (
                <button
                  key={look.id}
                  type="button"
                  className={`asset-generation-workspace__look-main${imageUrl ? ' has-image' : ''}${look.id === activeLookId ? ' is-selected' : ''}`}
                  aria-pressed={look.id === activeLookId}
                  onClick={() => selectLook(look.id)}
                >
                  <span className="asset-generation-workspace__look-preview">
                    {imageUrl ? <img src={imageUrl} alt="" /> : <PictureOutlined />}
                  </span>
                  <span
                    className="asset-generation-workspace__look-name"
                    title={look.id === 'main' ? (name || look.name) : look.name}
                  >
                    {look.id === 'main' ? (name || look.name) : look.name}
                  </span>
                </button>
              )
            })}
          </div>

          <footer className="asset-generation-workspace__footer">
            <StudioSelect
              value={model}
              aria-label={l('图片生成模型', 'Image generation model')}
              options={[{ value: 'gpt-image-2', label: 'GPT Image 2' }, { value: 'gpt-image-1', label: 'GPT Image 1' }]}
              onChange={onModelChange}
              getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
            />
            <StudioSelect
              value={resolution}
              aria-label={l('图片分辨率', 'Image resolution')}
              options={[{ value: '2k', label: '2K' }, { value: '4k', label: '4K' }]}
              onChange={onResolutionChange}
              getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
            />
            <Button type="primary" disabled={!canGenerate} onClick={() => onGenerate(name.trim(), prompt.trim())}>
              {l('生成', 'Generate')} <span><ThunderboltFilled /> 6</span>
            </Button>
          </footer>
          </aside>
      </div>

      {promptExpanded && (
        <div className="asset-generation-workspace__description-layer">
          <section
            className="asset-generation-workspace__description-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={l('描述', 'Description')}
          >
            <header className="asset-generation-workspace__description-header">
              <strong>{l('描述', 'Description')}</strong>
              <div>
                <button
                  type="button"
                  aria-label={l('退出全屏', 'Exit fullscreen')}
                  onClick={() => setPromptExpanded(false)}
                >
                  <FullscreenExitOutlined />
                </button>
                <button
                  type="button"
                  aria-label={l('关闭', 'Close')}
                  onClick={() => setPromptExpanded(false)}
                >
                  <CloseOutlined />
                </button>
              </div>
            </header>

            <div className="asset-generation-workspace__description-body">
              <div className="asset-generation-workspace__description-reference-heading">
                <strong>{l('参考图', 'Reference images')}</strong>
                <span>{references.length + (previewImage ? 1 : 0)}/{MAX_REFERENCE_IMAGES}</span>
              </div>
              <div className="asset-generation-workspace__description-references">
                {previewImage && (
                  <button type="button" className="is-selected" onClick={openImageViewer}>
                    <img src={previewImage} alt={name || l(copy.nameZh, copy.nameEn)} />
                    <span>{name || l(copy.lookZh, copy.lookEn)}</span>
                  </button>
                )}
                {references.map((reference) => (
                  <div key={reference.id}>
                    <img src={reference.url} alt={reference.name} />
                    <button
                      type="button"
                      aria-label={l('删除参考图', 'Remove reference image')}
                      onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                ))}
                {!previewImage && references.length === 0 && (
                  <button
                    type="button"
                    className="asset-generation-workspace__description-reference-add"
                    aria-label={l('添加参考图', 'Add reference image')}
                    onClick={() => referenceInputRef.current?.click()}
                  >
                    <PlusOutlined />
                  </button>
                )}
              </div>

              <div className="asset-generation-workspace__description-prompt-heading">
                <strong>{l('提示词', 'Prompt')}</strong>
              </div>
              <div className="asset-generation-workspace__description-editor">
                <Input.TextArea
                  value={prompt}
                  maxLength={MAX_PROMPT_LENGTH}
                  autoSize={false}
                  variant="borderless"
                  placeholder={l(copy.promptZh, copy.promptEn)}
                  onChange={(event) => setPrompt(event.target.value)}
                />
                <div className="asset-generation-workspace__description-options">
                  <StudioSelect
                    className="asset-generation-workspace__ratio-select"
                    value={selectedRatio}
                    aria-label={l('图片比例', 'Image ratio')}
                    options={RATIO_OPTIONS.map((value) => ({ value, label: <StudioRatioOption value={value} /> }))}
                    onChange={setSelectedRatio}
                    popupClassName="asset-generation-workspace__ratio-popup"
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <StudioSelect
                    className="asset-generation-workspace__description-style-select"
                    value={selectedStyle}
                    aria-label={l('画面风格', 'Visual style')}
                    options={styleOptions}
                    onChange={setSelectedStyle}
                    getPopupContainer={(trigger) => trigger.parentElement ?? trigger}
                  />
                  <small>{prompt.length}/{MAX_PROMPT_LENGTH}</small>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {rewriteOpen && (
        <div className="asset-generation-workspace__rewrite-layer">
          <button
            type="button"
            className="asset-generation-workspace__rewrite-backdrop"
            aria-label={l('关闭提示词智能改写', 'Close smart prompt rewrite')}
            onClick={() => setRewriteOpen(false)}
          />
          <aside className="asset-generation-workspace__rewrite-panel" role="dialog" aria-modal="true" aria-label={l('提示词智能改写', 'Smart prompt rewrite')}>
            <header>
              <strong>{l('提示词智能改写', 'Smart prompt rewrite')}</strong>
              <button type="button" aria-label={l('关闭', 'Close')} onClick={() => setRewriteOpen(false)}>
                <CloseOutlined />
              </button>
            </header>
            <div className="asset-generation-workspace__rewrite-content">
              <div className="asset-generation-workspace__rewrite-section-heading">
                <strong>{l('改写结果', 'Rewrite result')}</strong>
                <span>{rewriteDraft.length}/{MAX_PROMPT_LENGTH}</span>
              </div>
              <div className="asset-generation-workspace__rewrite-editor">
                <Input.TextArea
                  value={rewriteDraft}
                  maxLength={MAX_PROMPT_LENGTH}
                  autoSize={false}
                  variant="borderless"
                  aria-label={l('改写后的提示词', 'Rewritten prompt')}
                  onChange={(event) => setRewriteDraft(event.target.value)}
                />
              </div>
              <div className="asset-generation-workspace__rewrite-actions">
                <Button disabled>{l('当前使用中', 'In use')}</Button>
                <Button><FileSyncOutlined />{l('重新生成', 'Regenerate')}</Button>
              </div>
            </div>
            <div className="asset-generation-workspace__rewrite-composer">
              <div className="asset-generation-workspace__rewrite-section-heading">
                <strong>{l('修改要求', 'Revision request')}</strong>
                <span>{rewriteInstruction.length}/300</span>
              </div>
              <div className="asset-generation-workspace__rewrite-request-editor">
                <Input.TextArea
                  value={rewriteInstruction}
                  maxLength={300}
                  autoSize={false}
                  variant="borderless"
                  placeholder={l('输入本次改写要求', 'Enter revision instructions')}
                  onChange={(event) => setRewriteInstruction(event.target.value)}
                />
                <Button type="primary">
                  {rewriteInstruction.trim() ? l('按要求改写', 'Rewrite') : l('随机生成', 'Generate')}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <ImageViewer
        open={imageViewerOpen}
        imageUrl={previewImage}
        alt={name || l(copy.nameZh, copy.nameEn)}
        onClose={() => setImageViewerOpen(false)}
      />

      <input ref={referenceInputRef} type="file" accept="image/*" multiple hidden onChange={handleReferenceUpload} />
      <input ref={localLookInputRef} type="file" accept="image/*" hidden onChange={handleLocalLookImport} />
    </section>
  )
}
