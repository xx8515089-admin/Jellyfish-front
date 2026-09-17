import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Input, Modal, Select, Spin, theme as antdTheme } from 'antd'
import './canvasLibraryPublish.css'
import { canvasRequestId } from '../../../services/studioCanvases'

export function useCanvasLibraryPublish({ session, enabled, snapshotRef, save, report, assertReady, theme = 'dark' }) {
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState(() => session?.read('libraryFlow') || null)
  const [review, setReview] = useState(() => session?.pendingLibraryReview?.receipt || null)
  const [published, setPublished] = useState(null)
  const [preview, setPreview] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewRetry, setPreviewRetry] = useState(0)
  const previewCache = useMemo(() => new Map(), [session])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const run = async fn => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { session.assertWritable(); await fn() } catch (reason) { setError(reason.message); report(reason) }
    finally { lock.current = false; setBusy(false) }
  }
  const persist = next => { session.write('libraryFlow', next); setFlow(next) }
  const show = nodeId => run(async () => {
    if (!enabled) throw new Error('服务端尚未开放图片初筛与业务库入库')
    session.assertWritable(); setPublished(null); setPreview('')
    if (session.pendingLibraryReview || session.pendingLibraryPublish) { setFlow(session.read('libraryFlow')); setReview(session.pendingLibraryReview?.receipt || null); setOpen(true); return }
    assertReady()
    const saved = await save()
    const owner = snapshotRef.current.nodes.find(n => n.id === nodeId)
    const candidates = (saved.assetBindings || []).filter(binding => {
      const node = saved.project.nodes.find(n => n.id === binding.nodeId)
      if (binding.shotId != null) return false
      return (/^\/settings\/(imageUrls|referenceImages)\/\d+$/.test(binding.fieldPath) || (binding.fieldPath === '/content' && ['input-image', 'gen-image', 'generate-character-image', 'generate-scene-image'].includes(node?.type)))
    }).map(binding => ({ ...binding, label: `${snapshotRef.current.nodes.find(n => n.id === binding.nodeId)?.title || binding.nodeId} · ${binding.fieldPath}` }))
    if (!candidates.length) throw new Error('请先上传或应用一张图片到画布，再进行入库')
    persist({ revisionNo: saved.revisionNo, candidates, selected: '', assetType: owner?.type === 'create-scene' ? 2 : 1, name: owner?.settings?.name || '', description: owner?.settings?.description || '', prompt: owner?.settings?.prompt || '', aspectRatio: '16:9', quality: 1, resolution: 1 })
    setReview(null); setOpen(true)
  })
  const selected = flow?.candidates?.find(item => `${item.nodeId}:${item.fieldPath}` === flow.selected)
  useEffect(() => {
    let active = true
    setPreview(''); setPreviewError('')
    if (!open || !selected || !session) { setPreviewLoading(false); return }
    setPreviewLoading(true)
    const assetId = selected.assetId
    if (!previewCache.has(assetId)) {
      const request = Promise.resolve().then(() => session.output({ assetId })).catch(error => { previewCache.delete(assetId); throw error })
      previewCache.set(assetId, request)
    }
    previewCache.get(assetId).then(url => { if (active) setPreview(url) })
      .catch(error => { if (active) setPreviewError(error.message || '图片加载失败，请重试') })
      .finally(() => { if (active) setPreviewLoading(false) })
    return () => { active = false }
  }, [open, flow?.selected, selected?.assetId, session, previewCache, previewRetry])
  const change = patch => { try { persist({ ...flow, ...patch }) } catch (reason) { setError(reason.message) } }
  const complete = result => {
    if (!result?.libraryItemId || !result.sourceLinkId) throw new Error('入库回执缺少库条目标识，请找回提交')
    setPublished(result); session.write('libraryFlow', null); setFlow(null); setReview(null)
  }
  const palette = theme === 'light'
    ? { bg: '#ffffff', panel: '#f4f6fa', input: '#ffffff', border: '#dce2ec', text: '#273248', muted: '#69788e', accent: '#4d74c5' }
    : theme === 'solarized'
      ? { bg: '#fffaf0', panel: '#f5efdf', input: '#fdf6e3', border: '#ddd3b9', text: '#586e75', muted: '#7c898c', accent: '#397781' }
      : { bg: '#1c2028', panel: '#161a21', input: '#252c37', border: '#353e4c', text: '#e0e6f0', muted: '#99a6ba', accent: '#82a9ec' }
  const imageLabel = item => {
    const title = String(item.label || item.nodeId).split(' · /')[0]
    const match = item.fieldPath?.match(/\/(imageUrls|referenceImages)\/(\d+)$/)
    return title + (match ? ' · ' + (match[1] === 'referenceImages' ? '参考图 ' : '生成图 ') + (Number(match[2]) + 1) : ' · 图片')
  }
  const modal = <ConfigProvider theme={{ algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: { colorBgElevated: palette.bg, colorBgContainer: palette.input, colorBorder: palette.border, colorText: palette.text, colorTextSecondary: palette.muted, colorTextPlaceholder: palette.muted, colorPrimary: palette.accent, borderRadius: 8, controlHeight: 36, fontSize: 13 },
    components: { Select: { optionSelectedBg: palette.panel, optionActiveBg: palette.panel } },
  }}>
    <Modal open={open} title={<div className="library-publish__heading"><span>图片入库</span><p>将画布图片保存为可复用的角色、场景或道具。</p></div>}
      rootClassName={`library-publish-modal library-publish-modal--${theme}`} centered
      onCancel={busy ? undefined : () => setOpen(false)} width={920} destroyOnClose
      footer={<div className="library-publish__footer">
        <p>{published ? '已保存到素材库，可在后续创作中复用。' : review?.canPublish ? '图片已通过初筛，填写名称后即可入库。' : '初筛可能产生识图费用，按平台规则计费。'}</p>
        <div className="library-publish__actions">
          <Button disabled={busy} onClick={() => setOpen(false)}>{published ? '完成' : '取消'}</Button>
          {flow && <>
        <Button loading={busy} disabled={!selected || !!session.pendingLibraryPublish} onClick={() => run(async () => {
          const receipt = await session.reviewLibrary(selected.assetId)
          setReview(receipt)
        })}>{session?.pendingLibraryReview ? '查询 / 找回初筛' : '提交图片初筛'}</Button>
        {review && Number(review.status) > 1 && !review.canPublish && <Button disabled={busy || !!session.pendingLibraryPublish} onClick={() => run(async () => setReview(await session.reviewLibrary(selected.assetId, true)))}>重新初筛</Button>}
        {review && Number(review.status) > 1 && !session.pendingLibraryPublish && <Button disabled={busy} onClick={() => { session.write('libraryReview', null); session.pendingLibraryReview = null; setReview(null); change({ selected: '' }); setPreview('') }}>更换图片</Button>}
        {!session?.pendingLibraryPublish && <Button type="primary" disabled={busy || !selected || !review?.canPublish || !flow.name.trim()} onClick={() => run(async () => {
          const body = { canvasId: session.document.canvasId, revisionNo: flow.revisionNo, nodeId: selected.nodeId, canvasAssetId: selected.assetId, reviewId: review.reviewId, assetType: flow.assetType, name: flow.name.trim(), description: flow.description, prompt: flow.prompt, aspectRatio: flow.aspectRatio, quality: flow.quality, resolution: flow.resolution, clientRequestId: canvasRequestId('publish') }
          complete(await session.publishLibrary(body))
        })}>确认入库</Button>}

          </>}
    {session?.pendingLibraryPublish && <Button disabled={busy} onClick={() => run(async () => complete(await session.recoverLibraryPublish()))}>找回入库提交</Button>}
        </div>
      </div>}>
      <ol className="library-publish__steps" aria-label="图片入库步骤">
        {['选择图片', '图片初筛', '保存入库'].map((label, index) => {
          const current = published ? 3 : review?.canPublish ? 2 : selected ? 1 : 0
          return <li key={label} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''} aria-current={index === current ? 'step' : undefined}><span>{index < current ? '✓' : index + 1}</span>{label}</li>
        })}
      </ol>
      {error && <Alert className="library-publish__notice" showIcon type="error" message={error} />}
      {published && <Alert className="library-publish__notice" showIcon type="success" message="图片已入库" description={`可在素材库中查看并复用（条目 ${published.libraryItemId}）。`} />}
      {flow && <div className="library-publish__layout">
        <section className="library-publish__source" aria-label="入库图片预览">
          <div className="library-publish__section-heading"><h3>入库图片</h3><span>使用已保存的画布图片</span></div>
          <Select aria-label="入库图片" className="library-publish__select" disabled={busy || !!session.pendingLibraryReview || !!session.pendingLibraryPublish} value={flow.selected || undefined} placeholder="选择一张图片"
            options={flow.candidates.map(item => ({ value: `${item.nodeId}:${item.fieldPath}`, label: imageLabel(item) }))}
            onChange={value => { change({ selected: value }); setReview(null); setPreview('') }} />
          <div className="library-publish__preview">
            {previewLoading ? <div className="library-publish__placeholder"><Spin /><p>正在加载图片…</p></div> : previewError ? <div className="library-publish__placeholder" role="alert"><p>{previewError}</p><Button size="small" onClick={() => { previewCache.delete(selected?.assetId); setPreviewRetry(value => value + 1) }}>重新加载</Button></div> : preview ? <img src={preview} alt="待入库图片" onError={() => setPreviewError('图片无法显示，请重新加载')} /> : <div className="library-publish__placeholder"><span aria-hidden="true">▧</span><strong>{selected ? '图片已选择' : '选择入库图片'}</strong><p>{selected ? '即将显示图片预览' : '选中图片后自动预览'}</p></div>}
          </div>
          <div className="library-publish__preview-caption"><span>{selected ? imageLabel(selected) : '支持角色、场景和道具图片'}</span></div>
      {review && <Alert type={review.canPublish ? 'success' : 'warning'} message={review.canPublish ? '初筛通过，可入库' : '尚未达到入库条件'} description={review.error || review.message || `审核状态 ${review.status} · 风险等级 ${review.riskLevel ?? '待确认'}`} />}
        </section>
        <section className="library-publish__form" aria-label="入库信息">
          <div className="library-publish__section-heading"><h3>素材信息</h3><span>方便后续查找与复用</span></div>
          <div className="library-publish__identity">
            <label className="library-publish__field">素材类型<Select aria-label="入库类型" value={flow.assetType} disabled={busy || !!session.pendingLibraryPublish} options={[{ value: 1, label: '角色' }, { value: 2, label: '场景' }, { value: 3, label: '道具' }]} onChange={assetType => change({ assetType })} /></label>
            <label className="library-publish__field" htmlFor="library-publish-name"><span>素材名称 <em>*</em></span><Input id="library-publish-name" aria-required="true" placeholder="例如：雨夜巷道" value={flow.name} disabled={busy || !!session.pendingLibraryPublish} onChange={e => change({ name: e.target.value })} /></label>
          </div>
          <label className="library-publish__field" htmlFor="library-publish-description">描述<Input.TextArea id="library-publish-description" placeholder="描述主体、场景或用途，便于识别素材" autoSize={{ minRows: 2, maxRows: 4 }} value={flow.description} disabled={busy || !!session.pendingLibraryPublish} onChange={e => change({ description: e.target.value })} /></label>
          <label className="library-publish__field" htmlFor="library-publish-prompt">复用提示词<Input.TextArea id="library-publish-prompt" placeholder="保留构图、光线、风格等生成要点" autoSize={{ minRows: 3, maxRows: 6 }} value={flow.prompt} disabled={busy || !!session.pendingLibraryPublish} onChange={e => change({ prompt: e.target.value })} /></label>
          <div className="library-publish__defaults">
            <div className="library-publish__section-heading"><h3>复用设置</h3><span>用于后续生成</span></div>
            <div className="library-publish__settings">
              <label className="library-publish__field">画幅<Select aria-label="复用画幅" value={flow.aspectRatio} disabled={busy || !!session.pendingLibraryPublish} options={['9:16', '16:9', '4:3', '3:4', '1:1', '21:9'].map(value => ({ value, label: value }))} onChange={aspectRatio => change({ aspectRatio })} /></label>
              <label className="library-publish__field">质量<Select aria-label="复用质量" value={flow.quality} disabled={busy || !!session.pendingLibraryPublish} options={[{ value: 1, label: '标准质量' }, { value: 2, label: '高质量' }]} onChange={quality => change({ quality })} /></label>
              <label className="library-publish__field">分辨率<Select aria-label="复用分辨率" value={flow.resolution} disabled={busy || !!session.pendingLibraryPublish} options={[1, 2, 4].map(value => ({ value, label: `${value}K` }))} onChange={resolution => change({ resolution })} /></label>
            </div>
            <p>模型和视觉风格可在后续生成时选择。</p>
          </div>
        </section>
      </div>}
    </Modal>
  </ConfigProvider>
  return { show, modal }
}
