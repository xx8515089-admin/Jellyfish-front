import { uiText, useUiLanguage } from '../i18n/uiText'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Drawer, List, Space, Tag } from 'antd'
import { useLocation } from 'react-router-dom'
import { OpenAPI } from '../services/generated/core/OpenAPI'
import { rawRequest } from '../services/generated/core/request'
import { saveWorkflowCurrent, recoverWorkflow, workflowAccount, workflowDetailRequest, workflowProject, workflowRecords, type WorkflowRecord } from '../services/workflowSubmissions'
const labels: Record<string,string>={get dubbing() { return uiText("配音") },get image_to_video() { return uiText("图生视频") },get asset_image() { return uiText("资产生图") },get asset_look() { return uiText("新造型") },get asset_de_oil() { return uiText("图片去油") },get chapter_create() { return uiText("新增分集") },get asset_extract() { return uiText("资产提取") },get asset_extract_retry() { return uiText("重试资产提取") }}
export default function WorkflowRecovery() {
  useUiLanguage()

 const epoch=useRef(0)
 const location=useLocation(), [records,setRecords]=useState<WorkflowRecord[]>([]), [open,setOpen]=useState(false), [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('')
 useEffect(()=>{
  epoch.current++;setError('');setResult('')
  const update=()=>{try{setRecords(workflowRecords().filter(record=>(record.project===workflowProject() || record.context===window.location.pathname+window.location.search)).slice(0,30))}catch{setError('操作记录读取失败，请检查浏览器存储')}}
  update();window.addEventListener('workflow-records',update);window.addEventListener('storage',update)
  return ()=>{epoch.current++;window.removeEventListener('workflow-records',update);window.removeEventListener('storage',update)}
 },[location.pathname,location.search])
 const query=async(record:WorkflowRecord,replay=false)=>{
  const account=workflowAccount(),context=window.location.href,sequence=++epoch.current
  setBusy(true);setError('');setResult('')
  try {
   const send=(options:Parameters<typeof rawRequest>[1])=>rawRequest<any>(OpenAPI,options)
   const recovered=record.state==='accepted'?record:await recoverWorkflow(record,send,replay)
   const latest=await send(workflowDetailRequest(recovered))
   if(sequence!==epoch.current || account!==workflowAccount() || context!==window.location.href)return
   if(latest.code!==200)throw new Error(latest.message || '业务详情查询失败')
   saveWorkflowCurrent(recovered,latest.data)
   const response=recovered.response
   const ids=Array.isArray(response)?response.map(item=>item.id):response.taskIds || [response.taskId??response.id??response.lookId]
   setResult(labels[record.operation]+'原操作已受理；已查询当前业务状态。关联记录：'+ids.filter((id:unknown)=>id!=null).join('、')+(latest.data?.statusName?' · '+latest.data.statusName:''))
   window.dispatchEvent(new CustomEvent('workflow-recovered',{detail:{record:recovered,current:latest.data}}))
  }catch(reason){if(sequence===epoch.current && account===workflowAccount() && context===window.location.href)setError(reason instanceof Error?reason.message:'查询失败，原记录已保留')}
  finally{setBusy(false)}
 }
 const visibleRecords=records.filter(record=>record.account===workflowAccount() && (record.project===workflowProject() || record.context===window.location.pathname+window.location.search))
 if(!visibleRecords.length || location.pathname==='/login')return null
 return <><Button style={{position:'fixed',right:20,bottom:20,zIndex:1100}} onClick={()=>setOpen(true)}>{uiText("操作记录")}{visibleRecords.some(record=>['unknown','conflict'].includes(record.state))?uiText(" · 有待确认提交"):''}</Button>
 <Drawer title={uiText("操作记录与恢复")} open={open} onClose={()=>setOpen(false)} width={520}>
  {error&&<Alert type="warning" message={error}/>} {result&&<Alert type="success" message={result}/>}
  <List dataSource={visibleRecords} renderItem={record=><List.Item><Space direction="vertical"><span>{labels[record.operation]} {uiText("· 对象") + " "}{record.object} <Tag>{({unknown:'提交待确认',accepted:'已受理',rejected:'未受理',conflict:'参数冲突'})[record.state]}</Tag></span><small>{record.createdAt}</small><Space>
  {record.state!=='rejected'&&<Button disabled={busy} onClick={()=>void query(record)}>{uiText("查询原操作")}</Button>}
  {record.state==='unknown'&&<Button disabled={busy} onClick={()=>void query(record,true)}>{uiText("按原参数重试")}</Button>}
  </Space></Space></List.Item>}/>
 </Drawer></>
}
