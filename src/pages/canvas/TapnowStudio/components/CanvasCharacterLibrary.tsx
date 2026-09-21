import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { getAuthToken } from '../../../../auth'
import { StudioAssetLibraryApi, type StudioAssetLibraryItem } from '../../../../services/studioAssetLibrary'
import { buildFileContentUrl, resolveAssetUrl } from '../../../aiStudio/assets/utils'
import './CanvasCharacterLibrary.css'

async function loadPortrait(item: StudioAssetLibraryItem, signal: AbortSignal) {
  const source = buildFileContentUrl(item.coverFileId) || resolveAssetUrl(item.coverUrl)
  if (!source) return null
  const url = new URL(source, window.location.origin)
  const fileEndpoint = new URL(buildFileContentUrl(1)!, window.location.origin)
  const headers: Record<string, string> = {}
  // Only send credentials to our configured file endpoint, never to external covers.
  if (url.origin === fileEndpoint.origin && url.pathname === fileEndpoint.pathname) {
    const token = getAuthToken()
    if (token) headers.Authorization = token
  }
  const response = await fetch(url.href, { headers, signal })
  if (!response.ok) throw new Error('角色图片加载失败')
  const blob = await response.blob()
  if (!blob.size || !blob.type.startsWith('image/')) throw new Error('角色资产没有可用的图片')
  return blob
}

function CharacterCard({ item, onInsert, onAttach }: { item: StudioAssetLibraryItem; onInsert: (blob: Blob) => void; onAttach?: (item: StudioAssetLibraryItem) => Promise<void> }) {
  useUiLanguage()

  const [portrait, setPortrait] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [added, setAdded] = useState(false)
  const [attaching, setAttaching] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let preview = ''
    setPortrait(null)
    setError('')
    setLoading(true)
    setAdded(false)
    loadPortrait(item, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      if (blob) {
        preview = URL.createObjectURL(blob)
        setPortrait({ blob, url: preview })
      }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message || '角色图片加载失败')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => { controller.abort(); if (preview) URL.revokeObjectURL(preview) }
  }, [item.id, item.coverFileId, item.coverUrl])
  return <article className="canvas-character-card">
    <div className="canvas-character-portrait">
      {portrait ? <img src={portrait.url} alt={item.name} /> : <span>{loading ? uiText("加载图片…") : error || uiText("暂无角色图片")}</span>}
    </div>
    <div className="canvas-character-info">
      <strong>{item.name}</strong>
      {item.lookName && <small>{item.lookName}</small>}
      {item.description && <p title={item.description}>{item.description}</p>}
      <button disabled={attaching || (!onAttach && !portrait)} onClick={async () => { setAttaching(true); setError(''); try { if (onAttach) await onAttach(item); else if (portrait) onInsert(portrait.blob); setAdded(true) } catch (reason) { setError(reason instanceof Error ? reason.message : '关联失败，请重试') } finally { setAttaching(false) } }}>
        {attaching ? uiText("正在关联…") : added ? uiText("再次添加到画布") : uiText("添加到画布")}
      </button>
      {error && <small role="alert">{error}</small>}{added && <small role="status">{uiText("已添加为参考图片")}</small>}
    </div>
  </article>
}

export default function CanvasCharacterLibrary({ theme, onClose, onInsert, onAttach }: {
  theme: string; onClose: () => void; onInsert: (blob: Blob) => void; onAttach?: (item: StudioAssetLibraryItem) => Promise<void>
}) {
  useUiLanguage()

  const [assetType, setAssetType] = useState<1 | 2 | 3>(1)
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [items, setItems] = useState<StudioAssetLibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pageSize = 12
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setItems([])
    StudioAssetLibraryApi.listItems({ assetType, status: 1, keyword, page, pageSize }).then(result => {
      if (!active) return
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
      setTotal(result.total)
      if (page > lastPage) { setPage(lastPage); return }
      setItems(result.items)
    }).catch(error => {
      if (active) setError(error.message || '角色资产加载失败，请重试')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [assetType, keyword, page, refresh])
  return <aside className={`canvas-character-library ${theme === 'light' ? 'is-light' : ''}`} aria-label={uiText("角色资产库")}>
    <header><div><strong>{uiText("资产库")}</strong><small>{uiText("角色、场景与道具资产")}</small></div><button aria-label={uiText("关闭角色库")} onClick={onClose}><X size={16} /></button></header>
    <div style={{ display: 'flex', gap: 8, padding: '12px 12px 0' }}>{([1, 2, 3] as const).map(value => <button key={value} aria-pressed={assetType === value} onClick={() => { setAssetType(value); setPage(1) }}>{({1:'角色',2:'场景',3:'道具'})[value]}</button>)}</div>
    <form onSubmit={event => { event.preventDefault(); setKeyword(search.trim()); setPage(1); setRefresh(value => value + 1) }}>
      <input aria-label={uiText("搜索角色资产")} placeholder={uiText("搜索资产名称")} value={search} onChange={event => setSearch(event.target.value)} />
      <button type="submit">{uiText("搜索")}</button>
      <button type="button" aria-label={uiText("刷新角色资产")} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /></button>
    </form>
    <div className="canvas-character-list" aria-busy={loading}>
      {loading ? <p className="canvas-character-empty" role="status">{uiText("正在加载角色资产…")}</p> : error ? <div className="canvas-character-empty" role="alert"><p>{error}</p><button onClick={() => setRefresh(value => value + 1)}>{uiText("重试")}</button></div> : items.length === 0 ? <p className="canvas-character-empty">{keyword ? uiText("没有找到匹配的资产") : uiText("暂无可用资产，请先在资产库中添加。")}</p> : items.map(item => <CharacterCard key={item.id} item={item} onInsert={onInsert} onAttach={onAttach} />)}
    </div>
    <footer><span>{uiText("共") + " "}{total} {uiText("项资产")}</span><button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>{uiText("上一页")}</button><span>{page} / {Math.max(1, Math.ceil(total / pageSize))}</span><button disabled={loading || page * pageSize >= total} onClick={() => setPage(value => value + 1)}>{uiText("下一页")}</button></footer>
  </aside>
}
