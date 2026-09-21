import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import React from 'react'

export default function CanvasLibraryNode({ node, ready, updateNodeSettings, onPublish }) {
  useUiLanguage()

  const label = node.type === 'create-scene' ? '场景' : '角色'
  return <div className="canvas-node__form p-3 flex flex-col gap-3" onMouseDown={event => event.stopPropagation()}>
    <strong>{label}{uiText("入库")}</strong>
    <label>{uiText("名称")}<input className="w-full" value={node.settings?.name || ''} onChange={event => updateNodeSettings(node.id, { name: event.target.value })} /></label>
    <label>{uiText("描述")}<textarea className="w-full" value={node.settings?.description || ''} onChange={event => updateNodeSettings(node.id, { description: event.target.value })} /></label>
    <p>{uiText("选择画布中的图片，通过服务器初筛后保存到")}{label}{uiText("库。")}</p>
    <button type="button" disabled={!ready} onClick={() => onPublish(node.id)}>{ready ? uiText("选择图片并入库") : uiText("服务端尚未开放图片入库")}</button>
    <p>{uiText("供应商角色身份创建暂未开放。")}</p>
  </div>
}
