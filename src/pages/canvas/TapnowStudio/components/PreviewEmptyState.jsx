import React from 'react'
import { Image as ImageIcon, Link as LinkIcon } from 'lucide-react'
import { previewSourceLabel } from '../canvasPreviewConnectionStatus.js'

export default function PreviewEmptyState({ status, t }) {
  const sourceLabel = status.source ? previewSourceLabel(status.source, t) : ''
  return (
    <div className="flex flex-col items-center justify-center text-[11px] text-zinc-500 px-3 gap-1 max-w-full text-center" role="status">
      {status.kind === 'disconnected' ? <ImageIcon className="w-6 h-6 mb-1 text-zinc-400" /> : <LinkIcon className="w-6 h-6 mb-1 text-blue-400" />}
      {status.kind === 'incoming' ? (
        <>
          <span>{t('已连接，等待上游输出')}</span>
          <span className="block max-w-full truncate" title={sourceLabel}>
            {t('来源：{{source}}', { source: sourceLabel })}
          </span>
        </>
      ) : status.kind === 'outgoing' ? (
        <>
          <span>{t('当前作为下游参考输入')}</span>
          <span>{t('连接生成节点的输出到此处以预览结果')}</span>
        </>
      ) : status.kind === 'unsupported' ? (
        <>
          <span>{t('此连接没有可预览的图片或视频')}</span>
          <span>{t('连接生成节点的输出到此处以预览结果')}</span>
        </>
      ) : (
        <>
          <span>{t('连接 AI 绘图 / AI 视频 节点')}</span>
          <span>{t('或从历史记录发送到此处进行预览')}</span>
        </>
      )}
    </div>
  )
}
