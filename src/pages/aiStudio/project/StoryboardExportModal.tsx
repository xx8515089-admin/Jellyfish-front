import { useEffect, useRef, useState } from 'react'
import { Alert, Button, InputNumber, Modal, Radio, Space, message } from 'antd'
import './StoryboardExportModal.css'
import { buildExportRequest, downloadStoryboardZip, exportInteger, readExportSelections, selectionsInRange, StoryboardExportError, writeExportSelections, type ExportPreview, type ExportRequest, type ExportSelection } from '../../../services/storyboardExport'
import { getApiErrorMessage } from '../../../services/apiErrors'

export default function StoryboardExportModal({ open, onCancel, scriptImportId, episodeId, episodeMax, segmentMax }: { open: boolean; onCancel: () => void; scriptImportId: string | number; episodeId: string | number | null; episodeMax: number; segmentMax: number }) {
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
  const max = dimension === 'episode' ? episodeMax : segmentMax
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
      if (!max || (dimension === 'segment' && !episodeId)) throw new Error('当前范围没有可导出的分集或片段')
      if (scope === 'custom' && (exportInteger(end) > max || exportInteger(start) > max)) throw new Error('导出范围超出当前列表')
      await downloadStoryboardZip(buildExportRequest(input, selections), abort.signal, setPreview)
      message.success('浏览器已接管素材包下载'); onCancel()
    } catch (reason) {
      if (!abort.signal.aborted) { setError(getApiErrorMessage(reason, '导出失败，请重试')); setProblems(reason instanceof StoryboardExportError ? reason.problems.map((item) => item.message) : []) }
    } finally { if (controller.current === abort) controller.current = undefined; setBusy(false) }
  }
  return <Modal className="storyboard-export-modal" width={558} centered title="导出剪映格式" open={open} onCancel={() => { controller.current?.abort(); onCancel() }} maskClosable={!busy} footer={<Space size={8}><Button className="storyboard-export-modal__cancel" onClick={() => { controller.current?.abort(); onCancel() }}>{busy ? '取消导出' : '取消'}</Button><Button className="storyboard-export-modal__confirm" type="primary" loading={busy} disabled={!max || (dimension === 'segment' && !episodeId)} onClick={() => void submit()}>{busy ? '正在准备素材包' : '确认导出'}</Button></Space>}>
    <div className="storyboard-export-modal__body">
      <section className="storyboard-export-modal__section">
        <h3 id="export-dimension-label">导出维度</h3>
        <Radio.Group className="storyboard-export-modal__segments" aria-labelledby="export-dimension-label" value={dimension} disabled={busy} onChange={(event) => setDimension(event.target.value)}>
          <Radio.Button value="episode">分集导出</Radio.Button><Radio.Button value="segment">分片段导出（本集）</Radio.Button>
        </Radio.Group>
      </section>
      <section className="storyboard-export-modal__section">
        <h3 id="export-scope-label">导出范围</h3>
        <Radio.Group className="storyboard-export-modal__segments" aria-labelledby="export-scope-label" value={scope} disabled={busy} onChange={(event) => setScope(event.target.value)}>
          <Radio.Button value="all">导出全部{dimension === 'episode' ? '分集' : '片段'}</Radio.Button><Radio.Button value="custom">自定义{dimension === 'episode' ? '分集' : '片段'}</Radio.Button>
        </Radio.Group>
        {scope === 'custom' && <div className="storyboard-export-modal__range"><InputNumber aria-label="起始序号" min={1} max={max} precision={0} value={start} disabled={busy} onChange={setStart} /><span>至</span><InputNumber aria-label="结束序号" min={1} max={max} precision={0} value={end} disabled={busy} onChange={setEnd} /><span>共 {max} {dimension === 'episode' ? '集' : '个片段'}</span></div>}
      </section>
      <section className="storyboard-export-modal__section">
        <h3 id="export-content-label">导出内容</h3>
        <Radio.Group className="storyboard-export-modal__cards" aria-labelledby="export-content-label" value={content} disabled={busy} onChange={(event) => setContent(event.target.value)}>
          <Radio value="media"><strong>图片/视频素材</strong><small>包含各片段选中的图片或视频；未选择时使用最新成功视频</small></Radio>
          <Radio value="audio"><strong>独立配音音轨</strong><small>仅导出在【配音面板】生成的台词音频，导入剪映后需对位</small></Radio>
          <Radio value="mixed"><strong>素材＋音频混合包</strong><small>包含图片/视频及独立配音，导入后请手动关闭视频原声并对位</small></Radio>
        </Radio.Group>
      </section>
      {!!selected.length && <div style={{ maxHeight: 140, overflowY: 'auto', width: '100%' }}>{selected.map((item) => <div key={item.segmentId}>第{item.episodeIndex}集 · 片段{item.segmentIndex} · {item.mediaType === 'image' ? '图片' : '视频'} #{item.generationId}<Button size="small" type="link" disabled={busy} onClick={() => { const next = selections.filter((value) => value.segmentId !== item.segmentId); writeExportSelections(scriptImportId, next); setSelections(next) }}>取消选择</Button></div>)}</div>}
      {preview && <div>图片 {preview.imageCount} · 视频 {preview.videoCount} · 音频 {preview.audioCount} · 原始素材合计 {(preview.totalBytes / 1024 / 1024).toFixed(1)} MiB</div>}
      {error && <Alert type="error" message={error} />}
      {!!problems.length && <div role="alert" style={{ maxHeight: 180, overflowY: 'auto', width: '100%' }}>{problems.map((item, index) => <p key={index}>{item}</p>)}</div>}
    </div>
  </Modal>
}
