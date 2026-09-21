import { uiText, useUiLanguage } from '../../../i18n/uiText'
import { StudioScriptsApi } from '../../../services/studioScripts'
import { StudioAssetGenerationApi } from '../../../services/studioAssetGeneration'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, InputNumber, Modal, Radio, Space, message } from 'antd'
import './StoryboardExportModal.css'
import { buildExportRequest, downloadStoryboardZip, exportInteger, readExportSelections, selectionsInRange, StoryboardExportError, writeExportSelections, type ExportPreview, type ExportRequest, type ExportSelection } from '../../../services/storyboardExport'
import { getApiErrorMessage } from '../../../services/apiErrors'

export default function StoryboardExportModal({ open, onCancel, scriptImportId, episodeId, episodeMax, segmentMax }: { open: boolean; onCancel: () => void; scriptImportId: string | number; episodeId: string | number | null; episodeMax: number; segmentMax: number }) {
  useUiLanguage()

  const [dimension, setDimension] = useState<ExportRequest['dimension']>('episode')
  const [scope, setScope] = useState<ExportRequest['scope']>('all')
  const [content, setContent] = useState<ExportRequest['content']>('media')
  const [start, setStart] = useState<number | null>(1)
  const [end, setEnd] = useState<number | null>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  const [preview, setPreview] = useState<ExportPreview>()
  const [selections, setSelections] = useState<ExportSelection[]>([])
  const controller = useRef<AbortController>()
  const [range, setRange] = useState<{episodes:number;segments:number}>()
  useEffect(() => {
    if (!open) return
    let active = true
    setRange(undefined)
    const episodes = StudioScriptsApi.requestAssetEpisodes(scriptImportId)
    const requests: ReturnType<typeof StudioAssetGenerationApi.requestEpisodeStoryboardEditor>[] = []
    void episodes.promise.then(async items => {
      const selected = readExportSelections(scriptImportId)
      const needed = [...new Set([...selected.map(item => item.episodeId), ...(episodeId == null ? [] : [Number(episodeId)])])]
      const editors = await Promise.all(needed.map(id => { const request = StudioAssetGenerationApi.requestEpisodeStoryboardEditor({scriptImportId,episodeId:id}); requests.push(request); return request.promise.then(editor => ({id,editor})) }))
      if (!active) return
      const refreshed = selected.map(item => {
        const episode = items.find(value => String(value.id) === String(item.episodeId))
        const segment = editors.find(value => value.id === item.episodeId)?.editor.segments.find(value => String(value.id) === String(item.segmentId))
        if (!episode || !segment) throw new Error('已选历史记录对应的分集或片段已变化，请重新选择导出素材')
        return {...item, episodeIndex:episode.index, segmentIndex:segment.segmentIndex}
      })
      setSelections(refreshed)
      setRange({episodes:Math.max(0,...items.map(item=>item.index)),segments:Math.max(0,...(editors.find(item=>String(item.id)===String(episodeId))?.editor.segments.map(item=>item.segmentIndex)||[]))})
    }).catch(reason=>{if(active)setError(getApiErrorMessage(reason))})
    return ()=>{active=false;episodes.cancel();requests.forEach(request=>request.cancel());controller.current?.abort()}
  },[open,scriptImportId,episodeId])
  const max = dimension === 'episode' ? (range?.episodes ?? episodeMax) : (range?.segments ?? segmentMax)
  useEffect(() => { if (open) { setSelections(readExportSelections(scriptImportId)); setError(''); setProblems([]); setPreview(undefined) } }, [open, scriptImportId])
  useEffect(() => { setStart(1); setEnd(Math.max(1, max)) }, [dimension, max])
  useEffect(() => { setPreview(undefined); setError(''); setProblems([]) }, [dimension, scope, content, start, end, selections])
  useEffect(() => () => controller.current?.abort(), [])
  const input: ExportRequest = { scriptImportId: Number(scriptImportId), dimension, scope, content, episodeId: Number(episodeId), start: start ?? undefined, end: end ?? undefined }
  const selected = content === 'audio' ? [] : selectionsInRange(input, selections)
  const submit = async () => {
    if (controller.current) return
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError(''); setProblems([])
    try {
      if (!range) throw new Error('最新导出范围尚未加载，请稍后重试')
      if (!max || (dimension === 'segment' && !episodeId)) throw new Error('当前范围没有可导出的分集或片段')
      if (scope === 'custom' && (exportInteger(end) > max || exportInteger(start) > max)) throw new Error('导出范围超出当前列表')
      await downloadStoryboardZip(buildExportRequest(input, selections), abort.signal, setPreview)
      message.success(uiText("浏览器已接管素材包下载")); onCancel()
    } catch (reason) {
      if (!abort.signal.aborted) { setError(getApiErrorMessage(reason, '导出失败，请重试')); setProblems(reason instanceof StoryboardExportError ? reason.problems.map((item) => item.message) : []) }
    } finally { if (controller.current === abort) controller.current = undefined; setBusy(false) }
  }
  return <Modal className="storyboard-export-modal" width={558} centered title={uiText("导出剪映格式")} open={open} onCancel={() => { controller.current?.abort(); onCancel() }} maskClosable={!busy} footer={<Space size={8}><Button className="storyboard-export-modal__cancel" onClick={() => { controller.current?.abort(); onCancel() }}>{busy ? uiText("取消导出") : uiText("取消")}</Button><Button className="storyboard-export-modal__confirm" type="primary" loading={busy} disabled={!max || (dimension === 'segment' && !episodeId)} onClick={() => void submit()}>{busy ? uiText("正在准备素材包") : uiText("确认导出")}</Button></Space>}>
    <div className="storyboard-export-modal__body">
      <section className="storyboard-export-modal__section">
        <h3 id="export-dimension-label">{uiText("导出维度")}</h3>
        <Radio.Group className="storyboard-export-modal__segments" aria-labelledby="export-dimension-label" value={dimension} disabled={busy} onChange={(event) => setDimension(event.target.value)}>
          <Radio.Button value="episode">{uiText("分集导出")}</Radio.Button><Radio.Button value="segment">{uiText("分片段导出（本集）")}</Radio.Button>
        </Radio.Group>
      </section>
      <section className="storyboard-export-modal__section">
        <h3 id="export-scope-label">{uiText("导出范围")}</h3>
        <Radio.Group className="storyboard-export-modal__segments" aria-labelledby="export-scope-label" value={scope} disabled={busy} onChange={(event) => setScope(event.target.value)}>
          <Radio.Button value="all">{uiText("导出全部")}{dimension === 'episode' ? uiText("分集") : uiText("片段")}</Radio.Button><Radio.Button value="custom">{uiText("自定义")}{dimension === 'episode' ? uiText("分集") : uiText("片段")}</Radio.Button>
        </Radio.Group>
        {scope === 'custom' && <div className="storyboard-export-modal__range"><InputNumber aria-label={uiText("起始序号")} min={1} max={max} precision={0} value={start} disabled={busy} onChange={setStart} /><span>{uiText("至")}</span><InputNumber aria-label={uiText("结束序号")} min={1} max={max} precision={0} value={end} disabled={busy} onChange={setEnd} /><span>{uiText("共") + " "}{max} {dimension === 'episode' ? uiText("集") : uiText("个片段")}</span></div>}
      </section>
      <section className="storyboard-export-modal__section">
        <h3 id="export-content-label">{uiText("导出内容")}</h3>
        <Radio.Group className="storyboard-export-modal__cards" aria-labelledby="export-content-label" value={content} disabled={busy} onChange={(event) => setContent(event.target.value)}>
          <Radio value="media"><strong>{uiText("图片/视频素材")}</strong><small>{uiText("包含各片段选中的图片或视频；未选择时使用最新成功视频")}</small></Radio>
          <Radio value="audio"><strong>{uiText("独立配音音轨")}</strong><small>{uiText("仅导出在【配音面板】生成的台词音频，导入剪映后需对位")}</small></Radio>
          <Radio value="mixed"><strong>{uiText("素材＋音频混合包")}</strong><small>{uiText("包含图片/视频及独立配音，导入后请手动关闭视频原声并对位")}</small></Radio>
        </Radio.Group>
      </section>
      {!!selected.length && <div style={{ maxHeight: 140, overflowY: 'auto', width: '100%' }}>{selected.map((item) => <div key={item.segmentId}>{uiText("第")}{item.episodeIndex}{uiText("集 · 片段")}{item.segmentIndex} · {item.mediaType === 'image' ? uiText("图片") : uiText("视频")} #{item.generationId}<Button size="small" type="link" disabled={busy} onClick={() => { const next = selections.filter((value) => value.segmentId !== item.segmentId); writeExportSelections(scriptImportId, next); setSelections(next) }}>{uiText("取消选择")}</Button></div>)}</div>}
      {preview && <div>{uiText("图片") + " "}{preview.imageCount} {uiText("· 视频") + " "}{preview.videoCount} {uiText("· 音频") + " "}{preview.audioCount} {uiText("· 原始素材合计") + " "}{(preview.totalBytes / 1024 / 1024).toFixed(1)} MiB</div>}
      {error && <Alert type="error" message={error} />}
      {!!problems.length && <div role="alert" style={{ maxHeight: 180, overflowY: 'auto', width: '100%' }}>{problems.map((item, index) => <p key={index}>{item}</p>)}</div>}
    </div>
  </Modal>
}
