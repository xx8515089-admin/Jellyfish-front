import { getStoredAuthUser } from '../auth'
import { withCanvasOperationLock } from '../pages/canvas/TapnowStudio/canvasOperationLock'
import { createWorkflowRequestId } from '../pages/aiStudio/project/workflowMediaPolicy'
import type { ApiRequestOptions } from './generated/core/ApiRequestOptions'

export const workflowOperations: Record<string, string> = {
 '/api/v1/studio/storyboards/dubbing/generate': 'dubbing',
 '/api/v1/studio/storyboards/imagetovideo/generate': 'image_to_video',
 '/api/v1/studio/assets/generate': 'asset_image',
 '/api/v1/studio/assets/looks/generate': 'asset_look',
 '/api/v1/studio/assets/images/de-oil': 'asset_de_oil',
 '/api/v1/studio/scripts/imports/chapters/create': 'chapter_create',
 '/api/v1/studio/scripts/imports/assets/extract': 'asset_extract',
 '/api/v1/studio/scripts/imports/assets/extract/retry': 'asset_extract_retry',
}
export interface WorkflowRecord { account: string; context: string; project: string; object: string; operation: string; clientRequestId: string; body: Record<string, any>; language: string; url: string; createdAt: string; state: 'unknown' | 'accepted' | 'rejected' | 'conflict'; response?: any; current?: any; checkedAt?: string }
export const workflowAccount = () => { const user = getStoredAuthUser(); return String(user?.id ?? user?.username ?? 'anonymous') }
export const workflowProject = () => { const url = new URL(window.location.href); return url.searchParams.get('scriptImportId') || url.searchParams.get('projectId') || url.searchParams.get('id') || url.pathname }
const prefix = () => 'workflow-operations:' + workflowAccount() + ':'
const key = (record: WorkflowRecord) => 'workflow-operations:' + record.account + ':' + record.clientRequestId
const save = (record: WorkflowRecord) => { window.localStorage.setItem(key(record), JSON.stringify(record)); window.dispatchEvent(new Event('workflow-records')) }
const assertAccount = (record: WorkflowRecord) => { if (record.account !== workflowAccount()) throw new Error('账号已变化，请恢复原账户后查询原操作') }
export const workflowRecords = (): WorkflowRecord[] => {
 const result: WorkflowRecord[] = []
 for(let i=0;i<window.localStorage.length;i++) { const name=window.localStorage.key(i); if(name?.startsWith(prefix())) { const value=JSON.parse(window.localStorage.getItem(name)!); if(value.account===workflowAccount())result.push(value) } }
 return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
}
export function workflowAcceptance(error: unknown): 'rejected' | 'conflict' | 'unknown' {
 const value = error as { status?: number; body?: { code?: number; data?: { errorCode?: string; acceptance?: string } } }
 if (value?.status === 401 || value?.body?.code === 401) return 'unknown'
 const data=value?.body?.data
 if(data?.acceptance==='conflict' && data.errorCode==='IDEMPOTENCY_CONFLICT')return 'conflict'
 return data?.acceptance==='rejected' && ['WORKFLOW_INVALID_REQUEST','WORKFLOW_REQUEST_REJECTED','WORKFLOW_STORAGE_NOT_READY'].includes(data.errorCode || '') ? 'rejected' : 'unknown'
}
const envelope = (response: any) => {
 if(response?.code!==200 || response.data==null)throw Object.assign(new Error(response?.message || '提交结果未知，请查询原操作'),{body:response})
 return response
}
export async function submitWorkflow(options: ApiRequestOptions, language: string, send: (options: ApiRequestOptions)=>PromiseLike<any>) {
 const operation=workflowOperations[options.url], body=JSON.parse(JSON.stringify(options.body))
 const object=String(body.lineId ?? body.imageGenerationId ?? body.assetId ?? body.id ?? body.scriptImportId ?? body.assetSetId ?? 'new')
 const account=workflowAccount(), project=String(body.scriptImportId ?? workflowProject())
 return withCanvasOperationLock('workflow-submit:'+account+':'+operation+':'+object, async()=>{
  if(account!==workflowAccount())throw new Error('账号已变化，已停止提交')
  if(workflowRecords().some(record=>record.operation===operation && record.object===object && ['unknown','conflict'].includes(record.state)))throw new Error('存在待确认的原操作，请在操作记录中查询或原样重试')
  const record:WorkflowRecord={account,project,object,context:window.location.pathname+window.location.search,operation,clientRequestId:body.clientRequestId || createWorkflowRequestId(),body,language,url:options.url,createdAt:new Date().toISOString(),state:'unknown'}
  body.clientRequestId=record.clientRequestId
  // A known identity cannot be repurposed after success; explicit new intent gets a fresh ID.
  const old=window.localStorage.getItem(key(record))
  if(old)throw new Error('请求标识已有记录，请查询原操作')
  save(record)
  try { const response=envelope(await send({...options,body,headers:{...options.headers,language}})); assertAccount(record);record.response=response.data;record.state='accepted';save(record);return response }
  catch(error){assertAccount(record);record.state=workflowAcceptance(error);save(record);throw error}
 })
}
export async function recoverWorkflow(record: WorkflowRecord, send: (options: ApiRequestOptions)=>PromiseLike<any>, replay=false) {
 assertAccount(record)
 return withCanvasOperationLock('workflow-submit:'+record.account+':'+record.operation+':'+record.object,async()=>{
  assertAccount(record)
  const stored=JSON.parse(window.localStorage.getItem(key(record)) || 'null') as WorkflowRecord | null
  if(!stored || stored.clientRequestId!==record.clientRequestId)throw new Error('原操作记录不存在')
  if(replay && stored.state!=='unknown')throw new Error('原操作状态已变化，请先查询原操作')
  let result:any
  try { result=envelope(await send(replay ? {method:'POST',url:stored.url,body:stored.body,headers:{language:stored.language},mediaType:'application/json'} : {method:'GET',url:'/api/v1/studio/workflow/submission',query:{operation:stored.operation,clientRequestId:stored.clientRequestId}})) }
  catch(error) { assertAccount(stored); if(replay){stored.state=workflowAcceptance(error);save(stored)} throw error }
  assertAccount(stored)
  if(!replay && (result.data.acceptance!=='accepted' || result.data.operation!==stored.operation || result.data.clientRequestId!==stored.clientRequestId))throw new Error('提交凭据与原操作不一致')
  stored.response=replay?result.data:result.data.response;stored.state='accepted';save(stored)
  return stored
 })
}
/** Receipt status is never current progress. Resolve the correct business endpoint. */
export function workflowDetailRequest(record: WorkflowRecord): ApiRequestOptions {
 const data=record.response, body=record.body, base='/api/v1/studio/'
 if(record.operation==='dubbing')return {method:'GET',url:base+'storyboards/dubbing/detail',query:{id:data.id}}
 if(record.operation==='image_to_video')return {method:'GET',url:base+'storyboards/videos/detail',query:{id:data.id}}
 if(['asset_image','asset_look','asset_de_oil'].includes(record.operation))return {method:'GET',url:base+'assets/history',query:{id:body.assetId??body.id,...((data.lookId??body.lookId)!=null?{lookId:data.lookId??body.lookId}:{})}}
 if(record.operation==='chapter_create')return {method:'GET',url:base+'scripts/imports/chapters/list',query:{scriptImportId:body.scriptImportId}}
 const scriptImportId=body.scriptImportId ?? workflowRecords().find(item=>item.response?.assetSetId===body.assetSetId && item.body.scriptImportId)?.body.scriptImportId ?? (/^\d+$/.test(record.project)?record.project:undefined)
 if(scriptImportId==null)throw new Error('提取已受理，请回到原项目资产列表查询；原 taskIds 已保留')
 return {method:'GET',url:base+'scripts/imports/assets/overview',query:{scriptImportId}}
}

export function saveWorkflowCurrent(record: WorkflowRecord, current: unknown) {
 assertAccount(record)
 const stored=JSON.parse(window.localStorage.getItem(key(record)) || 'null') as WorkflowRecord | null
 if(!stored)throw new Error('原操作记录不存在')
 stored.current=current;stored.checkedAt=new Date().toISOString();save(stored)
}
