import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import React, { useState } from 'react'

export default function CanvasAssetIssues({ node, onRetry }) {
  useUiLanguage()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const issues = (node._canvasAssetIssues || []).filter(issue => {
    if (issue.fieldPath === 'analysisKeyframe') return JSON.stringify([node.settings?.analysisResults, node.settings?.analysisResultData]).includes('canvas-asset:')
    let target = issue.shotId == null ? node : node.settings?.shots?.find(shot => String(shot.id) === String(issue.shotId))
    for (const part of issue.fieldPath.slice(1).split('/')) target = target?.[part.replace(/~1/g, '/').replace(/~0/g, '~')]
    return typeof target === 'string' && target.startsWith('canvas-asset:')
  })
  if (!issues.length) return null
  const missing = issues.some(issue => ['MEDIA_FILE_NOT_FOUND', 'CANVAS_ASSET_NOT_FOUND', 'CANVAS_ASSET_UNAVAILABLE'].includes(issue.errorCode))
  return <div role="status" className="canvas-node-asset-issue" title={issues.map(issue => '素材 #' + issue.assetId + (issue.shotId == null ? '' : ' · 镜头 ' + issue.shotId) + ' · ' + issue.fieldPath).join('\n')}>
    {missing ? uiText("部分素材缺失，原引用已保留") : uiText("部分素材暂时加载失败，可重试预览")}
    {onRetry && <button type="button" disabled={busy} onPointerDown={event => event.stopPropagation()} onClick={async event => {
      event.stopPropagation(); setBusy(true); setError('')
      try { await onRetry(node) } catch (reason) { setError(reason.message || '预览仍不可用，请稍后重试') } finally { setBusy(false) }
    }}>{busy ? uiText("读取中…") : uiText("重试预览")}</button>}
    {error && <span role="alert">{error}</span>}
  </div>
}
