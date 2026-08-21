import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Button, Dropdown, Empty, Input, Modal, Spin, message } from 'antd'
import {
  AudioOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EyeOutlined,
  MoreOutlined,
  PictureOutlined,
  PlusOutlined,
  SwapOutlined,
  ThunderboltFilled,
  UploadOutlined,
} from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import { StudioEntitiesApi } from '../../../services/studioEntities'
import AssetGenerationWorkspace from './AssetGenerationWorkspace'
import ImageViewer from './ImageViewer'
import VoiceLibraryModal from './VoiceLibraryModal'
import StudioSelect from './StudioSelect'
import {
  PROJECT_CREATION_DRAFT_KEYS,
  buildEpisodeSourceSignature,
  readProjectCreationDraft,
  useProjectCreationDraft,
} from './projectCreationDraft'
import './ProjectAssetsStep.css'

export type AssetEpisodeSource = {
  id: string
  title: string
  rawText: string
}

type AssetKind = 'role' | 'scene' | 'prop'
type AssetScope = 'overview' | string

type AssetDraft = {
  id: string
  kind: AssetKind
  name: string
  episodeIds: string[]
  imageUrl?: string
  prompt?: string
}

type AssetsStepDraft = {
  sourceSignature: string
  scope: AssetScope
  kind: AssetKind
  assets: AssetDraft[]
  model: string
  resolution: string
  completedEpisodeIds: string[]
}

type ProjectAssetsStepProps = {
  episodes: AssetEpisodeSource[]
  ratio?: string
  styleName?: string
}

type PersonalAsset = {
  id: string
  name: string
  imageUrl?: string
  style?: string
  gender?: string
  age?: string
  region?: string
}

type PersonalAssetFilter = 'gender' | 'style' | 'age' | 'region'

const EMPTY_PERSONAL_FILTERS: Record<PersonalAssetFilter, string> = {
  gender: 'all',
  style: 'all',
  age: 'all',
  region: 'all',
}

const KIND_LABELS: Record<AssetKind, { zh: string; en: string }> = {
  role: { zh: '角色', en: 'Characters' },
  scene: { zh: '场景', en: 'Scenes' },
  prop: { zh: '道具', en: 'Props' },
}

const GENERATION_UNIT_COST = 6
const isAssetKind = (value: unknown): value is AssetKind => (
  value === 'role' || value === 'scene' || value === 'prop'
)

const ROLE_NAME_PATTERN = /^\s*([\u3400-\u9fffA-Za-z][\u3400-\u9fffA-Za-z0-9·]{0,11})(?:\s*[（(][^）)]*[）)])?\s*[：:]/gm
const SCENE_LABEL_PATTERN = /(?:场景|地点)\s*[：:]\s*([^\n，。；;]{2,30})/g
const SCENE_HEADING_PATTERN = /^\s*(?:\d+\s*[-.]\s*\d+\s*)?(?:日|夜|晨|暮)?\s*(?:内|外|内外)\s+([^\n]{2,30})$/gm
const PROP_LABEL_PATTERN = /(?:道具|物品)\s*[：:]\s*([^\n。；;]{1,80})/g
const NON_ROLE_NAMES = new Set(['人物', '角色', '场景', '地点', '道具', '时间', '画面', '镜头', '旁白', '字幕', '音效'])

function splitNames(value: string) {
  return value
    .split(/[、,，/|]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 20)
}

function collectMatches(text: string, pattern: RegExp) {
  pattern.lastIndex = 0
  return [...text.matchAll(pattern)].flatMap((match) => splitNames(match[1] ?? ''))
}

function extractAssets(episodes: AssetEpisodeSource[]): AssetDraft[] {
  const assets = new Map<string, AssetDraft>()
  const add = (kind: AssetKind, rawName: string, episodeId: string) => {
    const name = rawName.replace(/[（(].*$/, '').trim()
    if (!name || (kind === 'role' && NON_ROLE_NAMES.has(name))) return
    const key = `${kind}:${name}`
    const existing = assets.get(key)
    if (existing) {
      if (!existing.episodeIds.includes(episodeId)) existing.episodeIds.push(episodeId)
      return
    }
    assets.set(key, {
      id: `${kind}-${assets.size + 1}`,
      kind,
      name,
      episodeIds: [episodeId],
    })
  }

  episodes.forEach((episode) => {
    collectMatches(episode.rawText, ROLE_NAME_PATTERN).forEach((name) => add('role', name, episode.id))
    collectMatches(episode.rawText, SCENE_LABEL_PATTERN).forEach((name) => add('scene', name, episode.id))
    collectMatches(episode.rawText, SCENE_HEADING_PATTERN).forEach((name) => add('scene', name, episode.id))
    collectMatches(episode.rawText, PROP_LABEL_PATTERN).forEach((name) => add('prop', name, episode.id))
  })

  return [...assets.values()]
}

function buildAssetPrompt(asset: AssetDraft, episodes: AssetEpisodeSource[]) {
  if (asset.prompt) return asset.prompt
  const relatedLines = episodes
    .filter((episode) => asset.episodeIds.length === 0 || asset.episodeIds.includes(episode.id))
    .flatMap((episode) => episode.rawText.split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => line.includes(asset.name))
    .slice(0, 12)

  const subjectPrompt = asset.kind === 'role'
    ? `${asset.name}的角色设定，多视角造型，正面、侧面与背面视图，人物比例准确，服装和外貌细节统一，纯色背景。`
    : asset.kind === 'scene'
      ? `${asset.name}的场景设定，完整空间构图，清晰展示环境、光线、材质与关键陈设。`
      : `${asset.name}的道具设定，展示完整外形、材质、结构和细节，纯色背景。`

  return relatedLines.length > 0
    ? `${subjectPrompt}\n\n剧本相关信息：\n${relatedLines.join('\n')}`
    : subjectPrompt
}

export default function ProjectAssetsStep({ episodes, ratio = '9:16', styleName = '' }: ProjectAssetsStepProps) {
  const l = useBilingualText()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const localAssetInputRef = useRef<HTMLInputElement>(null)
  const sourceSignature = useMemo(() => buildEpisodeSourceSignature(episodes), [episodes])
  const [restoredDraft] = useState(() =>
    readProjectCreationDraft<AssetsStepDraft>(PROJECT_CREATION_DRAFT_KEYS.assets))
  const canRestoreDraft = restoredDraft?.sourceSignature === sourceSignature
  const restoredScope = canRestoreDraft
    && (restoredDraft.scope === 'overview' || episodes.some((episode) => episode.id === restoredDraft.scope))
    ? restoredDraft.scope
    : episodes[0]?.id ?? 'overview'
  const [scope, setScope] = useState<AssetScope>(restoredScope)
  const [kind, setKind] = useState<AssetKind>(
    canRestoreDraft && isAssetKind(restoredDraft.kind) ? restoredDraft.kind : 'role',
  )
  const [assets, setAssets] = useState<AssetDraft[]>(() => (
    canRestoreDraft && Array.isArray(restoredDraft.assets)
      ? restoredDraft.assets
      : extractAssets(episodes)
  ))
  const [imageTargetId, setImageTargetId] = useState<string>()
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [localImportWorkspaceOpen, setLocalImportWorkspaceOpen] = useState(false)
  const [localImportName, setLocalImportName] = useState('')
  const [localImportImage, setLocalImportImage] = useState<string>()
  const [localImportFileName, setLocalImportFileName] = useState('')
  const [localImportDragging, setLocalImportDragging] = useState(false)
  const [localImportPreviewOpen, setLocalImportPreviewOpen] = useState(false)
  const [generationWorkspaceOpen, setGenerationWorkspaceOpen] = useState(false)
  const [generationAssetId, setGenerationAssetId] = useState<string>()
  const [personalImportOpen, setPersonalImportOpen] = useState(false)
  const [personalImportTargetId, setPersonalImportTargetId] = useState<string>()
  const [personalAssets, setPersonalAssets] = useState<PersonalAsset[]>([])
  const [personalAssetId, setPersonalAssetId] = useState('')
  const [personalAssetsLoading, setPersonalAssetsLoading] = useState(false)
  const [personalAssetFilters, setPersonalAssetFilters] = useState(EMPTY_PERSONAL_FILTERS)
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false)
  const [model, setModel] = useState(canRestoreDraft ? restoredDraft.model : 'gpt-image-2')
  const [resolution, setResolution] = useState(canRestoreDraft ? restoredDraft.resolution : '4k')
  const [completedEpisodeIds, setCompletedEpisodeIds] = useState<Set<string>>(() => new Set(
    canRestoreDraft && Array.isArray(restoredDraft.completedEpisodeIds)
      ? restoredDraft.completedEpisodeIds
      : [],
  ))
  const sourceSignatureRef = useRef(sourceSignature)

  useProjectCreationDraft(PROJECT_CREATION_DRAFT_KEYS.assets, {
    sourceSignature,
    scope,
    kind,
    assets,
    model,
    resolution,
    completedEpisodeIds: [...completedEpisodeIds],
  })

  useEffect(() => {
    if (sourceSignatureRef.current === sourceSignature) return
    sourceSignatureRef.current = sourceSignature
    setScope(episodes[0]?.id ?? 'overview')
    setKind('role')
    setAssets(extractAssets(episodes))
    setCompletedEpisodeIds(new Set())
  }, [episodes, sourceSignature])

  useEffect(() => {
    if (!localImportWorkspaceOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (localImportPreviewOpen) {
        setLocalImportPreviewOpen(false)
        return
      }
      setLocalImportWorkspaceOpen(false)
      setLocalImportName('')
      setLocalImportImage(undefined)
      setLocalImportFileName('')
      setLocalImportDragging(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [localImportPreviewOpen, localImportWorkspaceOpen])

  const scopedAssets = useMemo(() => assets.filter((item) => (
    scope === 'overview' || item.episodeIds.length === 0 || item.episodeIds.includes(scope)
  )), [assets, scope])
  const counts = useMemo(() => ({
    role: scopedAssets.filter((item) => item.kind === 'role').length,
    scene: scopedAssets.filter((item) => item.kind === 'scene').length,
    prop: scopedAssets.filter((item) => item.kind === 'prop').length,
  }), [scopedAssets])
  const visibleAssets = useMemo(
    () => scopedAssets.filter((item) => item.kind === kind),
    [kind, scopedAssets],
  )
  const visiblePersonalAssets = useMemo(() => personalAssets.filter((item) => (
    (personalAssetFilters.gender === 'all' || item.gender === personalAssetFilters.gender)
    && (personalAssetFilters.style === 'all' || item.style === personalAssetFilters.style)
    && (personalAssetFilters.age === 'all' || item.age === personalAssetFilters.age)
    && (personalAssetFilters.region === 'all' || item.region === personalAssetFilters.region)
  )), [personalAssetFilters, personalAssets])

  const currentEpisode = episodes.find((episode) => episode.id === scope)
  const generationAsset = assets.find((asset) => asset.id === generationAssetId)
  const totalAssets = assets.length
  const generationCost = scopedAssets.length * GENERATION_UNIT_COST

  const handleImageImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !imageTargetId) return
    if (!file.type.startsWith('image/')) {
      message.error(l('请选择图片文件', 'Choose an image file'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setAssets((current) => current.map((item) => (
        item.id === imageTargetId ? { ...item, imageUrl: reader.result as string } : item
      )))
      setImageTargetId(undefined)
    }
    reader.readAsDataURL(file)
  }

  const openImageImport = (assetId: string) => {
    setImageTargetId(assetId)
    imageInputRef.current?.click()
  }

  const appendAsset = (asset: Pick<AssetDraft, 'name' | 'imageUrl'>) => {
    setAssets((current) => [
      ...current,
      {
        id: `${kind}-${Date.now()}`,
        kind,
        name: asset.name,
        episodeIds: scope === 'overview' ? [] : [scope],
        imageUrl: asset.imageUrl,
      },
    ])
  }

  const prepareLocalAssetImport = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error(l('请选择图片文件', 'Choose an image file'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setLocalImportImage(reader.result)
      setLocalImportFileName(file.name)
      setLocalImportName(file.name.replace(/\.[^.]+$/, ''))
    }
    reader.onerror = () => message.error(l('本地图片读取失败', 'Failed to read the local image'))
    reader.readAsDataURL(file)
  }

  const handleLocalAssetImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    prepareLocalAssetImport(file)
  }

  const openLocalAssetImport = () => {
    setAddMenuOpen(false)
    setLocalImportName('')
    setLocalImportImage(undefined)
    setLocalImportFileName('')
    setLocalImportDragging(false)
    setLocalImportPreviewOpen(false)
    setLocalImportWorkspaceOpen(true)
  }

  const closeLocalAssetImport = () => {
    setLocalImportWorkspaceOpen(false)
    setLocalImportName('')
    setLocalImportImage(undefined)
    setLocalImportFileName('')
    setLocalImportDragging(false)
    setLocalImportPreviewOpen(false)
  }

  const clearLocalAssetImage = () => {
    setLocalImportName('')
    setLocalImportImage(undefined)
    setLocalImportFileName('')
    setLocalImportDragging(false)
    setLocalImportPreviewOpen(false)
  }

  const confirmLocalAssetImport = () => {
    const assetName = localImportName.trim()
    if (!assetName || !localImportImage) return
    appendAsset({ name: assetName, imageUrl: localImportImage })
    closeLocalAssetImport()
    message.success(l(`本地${KIND_LABELS[kind].zh}已导入`, `Local ${KIND_LABELS[kind].en.toLowerCase()} imported`))
  }

  const openPersonalImport = async (targetAssetId?: string) => {
    setPersonalImportTargetId(targetAssetId)
    setPersonalImportOpen(true)
    setPersonalAssetId('')
    setPersonalAssetFilters(EMPTY_PERSONAL_FILTERS)
    setPersonalAssets([])
    setPersonalAssetsLoading(true)
    try {
      const entityType = kind === 'role' ? 'character' : kind
      const response = await StudioEntitiesApi.list(entityType, { page: 1, pageSize: 100 })
      const nextAssets = (response.data?.items ?? []).map((item) => {
        const rawThumbnail = item.thumbnail ?? item.image_url ?? item.preview_url
        return {
          id: String(item.id ?? ''),
          name: String(item.name ?? ''),
          imageUrl: typeof rawThumbnail === 'string' ? rawThumbnail : undefined,
          style: typeof item.visual_style === 'string'
            ? item.visual_style
            : typeof item.style === 'string' ? item.style : undefined,
          gender: typeof item.gender === 'string' ? item.gender : undefined,
          age: typeof item.age === 'string'
            ? item.age
            : typeof item.age_group === 'string' ? item.age_group : undefined,
          region: typeof item.region === 'string'
            ? item.region
            : typeof item.country === 'string' ? item.country : undefined,
        }
      }).filter((item) => item.id && item.name)
      setPersonalAssets(nextAssets)
    } catch {
      message.error(l('个人空间资产加载失败', 'Failed to load personal assets'))
    } finally {
      setPersonalAssetsLoading(false)
    }
  }

  const confirmPersonalImport = () => {
    const selected = personalAssets.find((item) => item.id === personalAssetId)
    if (!selected) {
      message.warning(l('请选择要导入的资产', 'Choose an asset to import'))
      return
    }
    if (personalImportTargetId) {
      setAssets((current) => current.map((asset) => (
        asset.id === personalImportTargetId
          ? { ...asset, imageUrl: selected.imageUrl }
          : asset
      )))
    } else {
      appendAsset({ name: selected.name, imageUrl: selected.imageUrl })
    }
    setPersonalImportOpen(false)
    setPersonalImportTargetId(undefined)
    setPersonalAssetId('')
    message.success(l('个人空间资产已导入', 'Personal asset imported'))
  }

  const handleAddMenuClick = (key: 'generate' | 'personal' | 'local') => {
    setAddMenuOpen(false)
    if (key === 'generate') {
      setGenerationAssetId(undefined)
      setGenerationWorkspaceOpen(true)
      return
    }
    if (key === 'personal') {
      void openPersonalImport()
      return
    }
    openLocalAssetImport()
  }

  const openAssetWorkspace = (asset: AssetDraft) => {
    setGenerationAssetId(asset.id)
    setGenerationWorkspaceOpen(true)
  }

  const storeAssetInPersonalSpace = async (asset: AssetDraft) => {
    try {
      const entityType = asset.kind === 'role' ? 'character' : asset.kind
      await StudioEntitiesApi.create(entityType, {
        name: asset.name,
        image_url: asset.imageUrl,
        thumbnail: asset.imageUrl,
      })
      message.success(l('已存入个人空间', 'Saved to personal space'))
    } catch {
      message.error(l('存入个人空间失败', 'Failed to save to personal space'))
    }
  }

  const downloadAssetImage = (asset: AssetDraft) => {
    if (!asset.imageUrl) {
      message.warning(l('当前资产还没有可下载的图片', 'This asset has no image to download'))
      return
    }
    const link = document.createElement('a')
    link.href = asset.imageUrl
    link.download = `${asset.name || KIND_LABELS[asset.kind].en}.png`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const deleteAsset = (asset: AssetDraft) => {
    Modal.confirm({
      centered: true,
      title: l(`删除${KIND_LABELS[asset.kind].zh}`, `Delete ${KIND_LABELS[asset.kind].en.toLowerCase()}`),
      content: l(`确定删除“${asset.name}”吗？删除后无法恢复。`, `Delete "${asset.name}"? This action cannot be undone.`),
      okText: l('删除', 'Delete'),
      cancelText: l('取消', 'Cancel'),
      okButtonProps: { danger: true },
      onOk: () => setAssets((current) => current.filter((item) => item.id !== asset.id)),
    })
  }

  const handleAssetMenuClick = (asset: AssetDraft, key: string) => {
    if (key === 'store') {
      void storeAssetInPersonalSpace(asset)
      return
    }
    if (key === 'space-import') {
      void openPersonalImport(asset.id)
      return
    }
    if (key === 'local-import') {
      openImageImport(asset.id)
      return
    }
    if (key === 'download') {
      downloadAssetImage(asset)
      return
    }
    if (key === 'delete') deleteAsset(asset)
  }

  const requestGeneration = (count: number, completedScope?: AssetScope) => {
    if (count === 0) {
      message.info(l('当前没有可生成的资产', 'There are no assets to generate'))
      return
    }
    if (completedScope === 'overview') {
      setCompletedEpisodeIds(new Set(episodes.map((episode) => episode.id)))
    } else if (completedScope) {
      setCompletedEpisodeIds((current) => {
        const next = new Set(current)
        next.add(completedScope)
        return next
      })
    }
    message.info(l('资产已确认，图片生成任务将在下一阶段统一提交', 'Assets confirmed. Image tasks will be submitted in the next stage.'))
  }

  const scopeTitle = scope === 'overview'
    ? l(`全剧总览：已智能提取出全剧资产共${totalAssets}个`, `Overview: ${totalAssets} assets extracted`)
    : l(`${currentEpisode?.title ?? '当前剧集'}已智能提取资产共${scopedAssets.length}个`, `${currentEpisode?.title ?? 'Current episode'}: ${scopedAssets.length} assets extracted`)

  return (
    <main className="project-assets-step">
      <aside className="project-assets-step__scope-nav" aria-label={l('资产范围', 'Asset scope')}>
        <span>{l('总览', 'All')}</span>
        <button
          type="button"
          className={scope === 'overview' ? 'is-selected' : ''}
          onClick={() => setScope('overview')}
        >
          {l('总', 'All')}
        </button>
        <span>{l('选集', 'Episodes')}</span>
        <div>
          {episodes.map((episode, index) => {
            const completed = completedEpisodeIds.has(episode.id)
            return (
              <button
                key={episode.id}
                type="button"
                className={`${scope === episode.id ? 'is-selected' : ''}${completed ? ' is-completed' : ''}`}
                aria-label={completed ? l(`${episode.title}，资产已生成`, `${episode.title}, assets generated`) : episode.title}
                onClick={() => setScope(episode.id)}
              >
                <span>{index + 1}</span>
                {completed && <CheckOutlined className="project-assets-step__episode-check" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </aside>

      <section className="project-assets-step__workspace">
        <header className="project-assets-step__summary">
          <div className="project-assets-step__summary-copy">
            <strong>{scopeTitle}</strong>
            <span>{l('可通过修改提示词重绘不满意的图片，确保角色场景符合剧本设定。', 'Adjust prompts and regenerate images to match the script settings.')}</span>
          </div>
          <div className="project-assets-step__generation-settings">
            <StudioSelect
              className="project-assets-step__model-select"
              value={model}
              aria-label={l('图片生成模型', 'Image generation model')}
              options={[{ value: 'gpt-image-2', label: 'GPT Image 2' }, { value: 'gpt-image-1', label: 'GPT Image 1' }]}
              onChange={setModel}
            />
            <StudioSelect
              className="project-assets-step__resolution-select"
              value={resolution}
              aria-label={l('图片分辨率', 'Image resolution')}
              options={[{ value: '2k', label: '2K' }, { value: '4k', label: '4K' }]}
              onChange={setResolution}
            />
            <Button
              type="primary"
              disabled={scopedAssets.length === 0}
              onClick={() => requestGeneration(scopedAssets.length, scope)}
            >
              <span>{scope === 'overview' ? l('一键生成全剧资产', 'Generate all assets') : l('一键生成本集资产', 'Generate episode assets')}</span>
              <span className="project-assets-step__generation-cost"><ThunderboltFilled />{generationCost}</span>
            </Button>
          </div>
        </header>

        <div className="project-assets-step__content">
          <nav className="project-assets-step__tabs" aria-label={l('资产类型', 'Asset type')}>
            {(Object.keys(KIND_LABELS) as AssetKind[]).map((item) => (
              <button
                key={item}
                type="button"
                className={kind === item ? 'is-selected' : ''}
                onClick={() => setKind(item)}
              >
                <span>{l(KIND_LABELS[item].zh, KIND_LABELS[item].en)}</span>
                <small>{counts[item]}</small>
              </button>
            ))}
          </nav>

          <div className="project-assets-step__grid">
            {visibleAssets.map((asset) => (
              <article
                key={asset.id}
                className={`project-assets-step__card${asset.imageUrl ? ' has-image' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={l(`打开${asset.name}资产详情`, `Open ${asset.name} asset details`)}
                onClick={(event) => {
                  if (!event.currentTarget.contains(event.target as Node)) return
                  if ((event.target as HTMLElement).closest('button')) return
                  openAssetWorkspace(asset)
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openAssetWorkspace(asset)
                  }
                }}
              >
                <div
                  className="project-assets-step__card-preview"
                  style={asset.imageUrl ? { backgroundImage: `url(${asset.imageUrl})` } : undefined}
                >
                  {!asset.imageUrl && (
                    <span className="project-assets-step__empty-mark" aria-hidden="true">✦</span>
                  )}
                  {asset.imageUrl && (
                    <span className="project-assets-step__looks-badge">{l('1个造型', '1 look')}</span>
                  )}
                  {!asset.imageUrl && (
                    <div className="project-assets-step__card-actions">
                      <Button icon={<UploadOutlined />} onClick={() => openImageImport(asset.id)}>
                        {l(`导入${KIND_LABELS[kind].zh}`, `Import ${KIND_LABELS[kind].en.toLowerCase()}`)}
                      </Button>
                      <Button type="primary" onClick={() => requestGeneration(1)}>
                        {l('生成', 'Generate')} <ThunderboltFilled /> {GENERATION_UNIT_COST}
                      </Button>
                    </div>
                  )}
                </div>
                <footer>
                  <strong title={asset.name}>{asset.name}</strong>
                  {kind === 'role' && (
                    <Button
                      type="text"
                      className="project-assets-step__voice-button"
                      icon={<AudioOutlined />}
                      onClick={() => setVoiceLibraryOpen(true)}
                    >
                      {l('配置音色', 'Voice')}
                    </Button>
                  )}
                  <Dropdown
                    trigger={['click']}
                    placement="topRight"
                    overlayClassName="project-assets-step__asset-menu"
                    menu={{
                      items: [
                        { key: 'store', label: l('存入空间', 'Save to space') },
                        { key: 'space-import', label: l('空间导入', 'Import from space') },
                        { key: 'local-import', label: l('本地导入', 'Import from device') },
                        { key: 'download', label: l('下载', 'Download'), disabled: !asset.imageUrl },
                        { type: 'divider' },
                        { key: 'delete', label: l('删除', 'Delete'), danger: true },
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation()
                        handleAssetMenuClick(asset, key)
                      },
                    }}
                  >
                    <Button
                      type="text"
                      className="project-assets-step__more-button"
                      aria-label={l('更多操作', 'More actions')}
                      icon={<MoreOutlined />}
                    />
                  </Dropdown>
                </footer>
              </article>
            ))}

            <Dropdown
              open={addMenuOpen}
              trigger={['click']}
              placement="bottomLeft"
              overlayClassName="project-assets-step__add-dropdown"
              onOpenChange={setAddMenuOpen}
              menu={{
                items: [
                  { key: 'generate', label: l('模型生成', 'Generate with model') },
                  { key: 'local', label: l('本地导入', 'Import from device') },
                  { key: 'personal', label: l('空间导入', 'Import from personal space') },
                ],
                onClick: ({ key }) => handleAddMenuClick(key as 'generate' | 'personal' | 'local'),
              }}
            >
              <div className={`project-assets-step__add-card${addMenuOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="project-assets-step__add-trigger"
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                >
                  <span className="project-assets-step__add-trigger-mark" aria-hidden="true">✦</span>
                  <span>{l(`新增${KIND_LABELS[kind].zh}`, `Add ${KIND_LABELS[kind].en.toLowerCase()}`)}</span>
                </button>
              </div>
            </Dropdown>
          </div>
        </div>
      </section>

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageImport} />
      <input ref={localAssetInputRef} type="file" accept="image/*" hidden onChange={handleLocalAssetImport} />

      {localImportWorkspaceOpen && (
        <section
          className="project-assets-local-import"
          role="dialog"
          aria-modal="true"
          aria-label={l(`本地导入${KIND_LABELS[kind].zh}`, `Import ${KIND_LABELS[kind].en.toLowerCase()} from device`)}
        >
          <header className="project-assets-local-import__header">
            <Button type="text" icon={<CloseOutlined />} aria-label={l('关闭', 'Close')} onClick={closeLocalAssetImport} />
            <strong>{l(`新增${KIND_LABELS[kind].zh}`, `New ${KIND_LABELS[kind].en.toLowerCase()}`)}</strong>
          </header>

          <div className="project-assets-local-import__body">
            <main className="project-assets-local-import__stage">
              <div
                className={`project-assets-local-import__dropzone${localImportImage ? ' has-image' : ''}${localImportDragging ? ' is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={l('点击或拖拽上传图片', 'Click or drag to upload an image')}
                onClick={() => {
                  if (!localImportImage) localAssetInputRef.current?.click()
                }}
                onKeyDown={(event) => {
                  if (localImportImage || (event.key !== 'Enter' && event.key !== ' ')) return
                  event.preventDefault()
                  localAssetInputRef.current?.click()
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setLocalImportDragging(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setLocalImportDragging(true)
                }}
                onDragLeave={() => setLocalImportDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setLocalImportDragging(false)
                  prepareLocalAssetImport(event.dataTransfer.files?.[0])
                }}
              >
                {localImportImage ? (
                  <>
                    <img src={localImportImage} alt={localImportFileName} />
                    <div
                      className="project-assets-local-import__media-actions"
                      role="toolbar"
                      aria-label={l('图片操作', 'Image actions')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        title={l('替换图片', 'Replace image')}
                        aria-label={l('替换图片', 'Replace image')}
                        onClick={() => localAssetInputRef.current?.click()}
                      >
                        <SwapOutlined />
                      </button>
                      <button
                        type="button"
                        title={l('预览图片', 'Preview image')}
                        aria-label={l('预览图片', 'Preview image')}
                        onClick={() => setLocalImportPreviewOpen(true)}
                      >
                        <EyeOutlined />
                      </button>
                      <button
                        type="button"
                        title={l('删除图片', 'Delete image')}
                        aria-label={l('删除图片', 'Delete image')}
                        onClick={clearLocalAssetImage}
                      >
                        <DeleteOutlined />
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="project-assets-local-import__placeholder">
                    <PlusOutlined />
                    <strong>{l('点击或拖拽上传', 'Click or drag to upload')}</strong>
                  </span>
                )}
              </div>

              <section className="project-assets-local-import__history" aria-label={l('历史记录', 'History')}>
                <h2>{l('历史记录', 'History')} <small>History</small></h2>
                <button
                  type="button"
                  className={localImportImage ? 'has-image is-selected' : ''}
                  disabled={!localImportImage}
                  aria-label={localImportImage ? l('更换上传图片', 'Replace uploaded image') : l('暂无历史图片', 'No history image')}
                  onClick={() => localAssetInputRef.current?.click()}
                >
                  {localImportImage ? <img src={localImportImage} alt="" /> : <PictureOutlined />}
                </button>
              </section>
            </main>

            <aside className="project-assets-local-import__panel">
              <div className="project-assets-local-import__form">
                <label>
                  <span>{l(KIND_LABELS[kind].zh, KIND_LABELS[kind].en)} <small>{KIND_LABELS[kind].en}</small></span>
                  <Input
                    value={localImportName}
                    maxLength={30}
                    placeholder={l(`请输入${KIND_LABELS[kind].zh}`, `Enter ${KIND_LABELS[kind].en.toLowerCase()} name`)}
                    onChange={(event) => setLocalImportName(event.target.value)}
                  />
                </label>
              </div>

              <div className="project-assets-local-import__looks">
                <strong>{l('全部造型', 'Looks')}</strong>
                <button type="button" className="is-add" disabled>
                  <PlusOutlined />
                  <span>{l('添加造型', 'Add')}</span>
                </button>
                <button type="button" className={`is-main${localImportImage ? ' has-image' : ''}`} disabled>
                  <span className="project-assets-local-import__look-preview">
                    {localImportImage ? <img src={localImportImage} alt="" /> : <PictureOutlined />}
                  </span>
                  <span>{l(kind === 'role' ? '主角色图' : kind === 'scene' ? '场景主图' : '道具主图', 'Main image')}</span>
                </button>
              </div>

              <footer>
                <Button
                  type="primary"
                  disabled={!localImportName.trim() || !localImportImage}
                  onClick={confirmLocalAssetImport}
                >
                  {l('确认', 'Confirm')}
                </Button>
              </footer>
            </aside>
          </div>

          <ImageViewer
            open={localImportPreviewOpen}
            imageUrl={localImportImage}
            alt={localImportFileName}
            onClose={() => setLocalImportPreviewOpen(false)}
          />
        </section>
      )}

      {generationWorkspaceOpen && (
        <AssetGenerationWorkspace
          key={generationAssetId ?? `new-${kind}`}
          kind={kind}
          ratio={ratio}
          styleName={styleName}
          model={model}
          resolution={resolution}
          initialAsset={generationAsset ? {
            name: generationAsset.name,
            prompt: buildAssetPrompt(generationAsset, episodes),
            imageUrl: generationAsset.imageUrl,
            description: l(
              `${generationAsset.name}的${KIND_LABELS[generationAsset.kind].zh}设定，可结合右侧提示词继续调整并重新生成。`,
              `${generationAsset.name} ${KIND_LABELS[generationAsset.kind].en.toLowerCase()} design. Refine the prompt and regenerate as needed.`,
            ),
          } : undefined}
          onModelChange={setModel}
          onResolutionChange={setResolution}
          onClose={() => {
            setGenerationWorkspaceOpen(false)
            setGenerationAssetId(undefined)
          }}
          onGenerate={(assetName, assetPrompt) => {
            if (generationAssetId) {
              setAssets((current) => current.map((asset) => (
                asset.id === generationAssetId
                  ? { ...asset, name: assetName, prompt: assetPrompt }
                  : asset
              )))
            } else {
              appendAsset({ name: assetName })
            }
            requestGeneration(1)
            setGenerationWorkspaceOpen(false)
            setGenerationAssetId(undefined)
          }}
        />
      )}

      <Modal
        open={personalImportOpen}
        centered
        width={1080}
        title={l(`导入${KIND_LABELS[kind].zh}`, `Import ${KIND_LABELS[kind].en.toLowerCase()}`)}
        footer={null}
        rootClassName="project-assets-space-import"
        onCancel={() => {
          setPersonalImportOpen(false)
          setPersonalImportTargetId(undefined)
        }}
      >
        <div className="project-assets-space-import__filters">
          <div className="project-assets-space-import__toolbar-title">
            <strong>{l('空间资产', 'Space assets')}</strong>
            <span>{l(`共 ${personalAssets.length} 项`, `${personalAssets.length} items`)}</span>
          </div>
          <div className="project-assets-space-import__filter-controls">
            <StudioSelect
              value={personalAssetFilters.gender}
              disabled={personalAssetsLoading}
              aria-label={l(kind === 'role' ? '性别' : '类型', kind === 'role' ? 'Gender' : 'Type')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={kind === 'role' ? [
                { value: 'gender-heading', label: l('性别', 'Gender'), trigger: l('性别', 'Gender'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('性别', 'Gender') },
                { value: 'female', label: l('女性', 'Female'), trigger: l('女性', 'Female') },
                { value: 'male', label: l('男性', 'Male'), trigger: l('男性', 'Male') },
              ] : [
                { value: 'type-heading', label: l('类型', 'Type'), trigger: l('类型', 'Type'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('类型', 'Type') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, gender: value }))}
            />
            <StudioSelect
              value={personalAssetFilters.style}
              disabled={personalAssetsLoading}
              aria-label={l('风格', 'Style')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={[
                { value: 'style-heading', label: l('风格', 'Style'), trigger: l('风格', 'Style'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('风格', 'Style') },
                { value: 'realistic', label: l('真人', 'Realistic'), trigger: l('真人', 'Realistic') },
                { value: 'anime', label: l('动漫', 'Anime'), trigger: l('动漫', 'Anime') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, style: value }))}
            />
            <StudioSelect
              value={personalAssetFilters.age}
              disabled={personalAssetsLoading}
              aria-label={l(kind === 'role' ? '年龄' : '年代', kind === 'role' ? 'Age' : 'Era')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={kind === 'role' ? [
                { value: 'age-heading', label: l('年龄', 'Age'), trigger: l('年龄', 'Age'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('年龄', 'Age') },
                { value: 'young', label: l('青年', 'Young'), trigger: l('青年', 'Young') },
                { value: 'middle', label: l('中年', 'Middle-aged'), trigger: l('中年', 'Middle-aged') },
                { value: 'senior', label: l('老年', 'Senior'), trigger: l('老年', 'Senior') },
              ] : [
                { value: 'era-heading', label: l('年代', 'Era'), trigger: l('年代', 'Era'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('年代', 'Era') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, age: value }))}
            />
            <StudioSelect
              value={personalAssetFilters.region}
              disabled={personalAssetsLoading}
              aria-label={l('国别', 'Region')}
              optionLabelProp="trigger"
              popupMatchSelectWidth={152}
              popupClassName="project-assets-space-import__filter-popup"
              options={[
                { value: 'region-heading', label: l('国别', 'Region'), trigger: l('国别', 'Region'), disabled: true, className: 'is-heading' },
                { value: 'all', label: l('全部', 'All'), trigger: l('国别', 'Region') },
                { value: 'china', label: l('中国', 'China'), trigger: l('中国', 'China') },
                { value: 'overseas', label: l('海外', 'Overseas'), trigger: l('海外', 'Overseas') },
              ]}
              onChange={(value) => setPersonalAssetFilters((current) => ({ ...current, region: value }))}
            />
          </div>
        </div>

        <Spin
          spinning={personalAssetsLoading}
          wrapperClassName={`project-assets-space-import__spin${visiblePersonalAssets.length === 0 ? ' is-empty' : ''}`}
        >
          <div className={`project-assets-space-import__library${visiblePersonalAssets.length === 0 ? ' is-empty' : ''}`}>
            {visiblePersonalAssets.length > 0 ? visiblePersonalAssets.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`project-assets-space-import__card${personalAssetId === item.id ? ' is-selected' : ''}`}
                aria-pressed={personalAssetId === item.id}
                onClick={() => setPersonalAssetId((current) => current === item.id ? '' : item.id)}
              >
                <span className="project-assets-space-import__card-media">
                  {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <PictureOutlined />}
                  {item.style && <small>{item.style}</small>}
                  {personalAssetId === item.id && (
                    <span className="project-assets-space-import__check"><CheckOutlined /></span>
                  )}
                </span>
                <strong title={item.name}>{item.name}</strong>
              </button>
            )) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={personalAssets.length > 0
                  ? l('没有符合筛选条件的资产', 'No assets match these filters')
                  : l('个人空间暂无可导入资产', 'No assets available')}
              />
            )}
          </div>
        </Spin>

        <footer className="project-assets-space-import__footer">
          <strong>{l('已选', 'Selected')} <span>{personalAssetId ? 1 : 0}</span></strong>
          <Button type="primary" disabled={!personalAssetId} onClick={confirmPersonalImport}>
            {l('确定', 'Confirm')}
          </Button>
        </footer>
      </Modal>

      <VoiceLibraryModal open={voiceLibraryOpen} onCancel={() => setVoiceLibraryOpen(false)} />
    </main>
  )
}
