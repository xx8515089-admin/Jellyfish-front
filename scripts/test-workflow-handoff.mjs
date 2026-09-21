import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { withCanvasOperationLock } from '../src/pages/canvas/TapnowStudio/canvasOperationLock.js'
function setup(values=new Map(),user={id:42}) {
 const exports={};let counter=0
 const window={location:{href:'https://test.invalid/project?id=88',pathname:'/project',search:'?id=88'},dispatchEvent(){},localStorage:{get length(){return values.size},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}}
 const source=readFileSync(new URL('../src/services/workflowSubmissions.ts',import.meta.url),'utf8')
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window,URL,Event,require:name=>{
  if(name.endsWith('/auth'))return {getStoredAuthUser:()=>user}
  if(name.endsWith('/canvasOperationLock'))return {withCanvasOperationLock}
  if(name.endsWith('/workflowMediaPolicy'))return {createWorkflowRequestId:()=>`request-${values.size}-${++counter}`}
  throw new Error(name)
 }})
 return {...exports,values,user,window}
}
const plain=value=>JSON.parse(JSON.stringify(value))
const options={method:'POST',url:'/api/v1/studio/storyboards/dubbing/generate',body:{lineId:5,input:{dialogueText:'Original',languageCode:'en',volume:1},references:[7,3],nullable:null}}
const ok=data=>({code:200,data})
for(const [url,operation] of Object.entries(setup().workflowOperations))test(`${operation}: persist before POST, retain original response shape`,async()=>{
 const h=setup();const data=operation==='chapter_create'?[{id:91}]:operation.startsWith('asset_extract')?{assetSetId:31,taskIds:[6,7]}:operation==='asset_look'?{lookId:81,taskId:71}:{id:61,taskId:71}
 await h.submitWorkflow({...options,url},'zh',async sent=>{
  const record=h.workflowRecords()[0];assert.equal(record.state,'unknown');assert.equal(record.clientRequestId,sent.body.clientRequestId);assert.equal(sent.headers.language,'zh');return ok(data)
 })
 const record=h.workflowRecords()[0];assert.equal(record.operation,operation);assert.equal(record.state,'accepted');assert.deepEqual(plain(record.response),data)
})
test('lost response survives reload; missing receipt never POSTs or creates a new identity; replay freezes input and language',async()=>{
 const h=setup();const body=structuredClone(options.body);let first
 await assert.rejects(h.submitWorkflow({...options,body},'zh',async sent=>{first=plain(sent);throw new Error('offline')}),/offline/)
 body.input.dialogueText='Changed';body.references.reverse()
 const reload=setup(h.values);const record=reload.workflowRecords()[0]
 await assert.rejects(reload.recoverWorkflow(record,async sent=>{assert.equal(sent.method,'GET');assert.equal(sent.query.clientRequestId,first.body.clientRequestId);return {code:502,data:{errorCode:'WORKFLOW_SUBMISSION_NOT_FOUND',acceptance:'unknown'}}}))
 assert.equal(reload.workflowRecords()[0].state,'unknown')
 await assert.rejects(reload.submitWorkflow(options,'en',()=>assert.fail('must not submit')),/待确认/)
 const recovered=await reload.recoverWorkflow(record,async sent=>{assert.deepEqual(plain(sent.body),first.body);assert.equal(sent.headers.language,'zh');return ok({id:90,taskId:200})},true)
 assert.equal(recovered.response.id,90);assert.equal(reload.values.size,1)
 assert.equal(reload.workflowDetailRequest(recovered).query.id,90)
})
test('receipt is an identity only; current detail is persisted separately',async()=>{
 const h=setup();await assert.rejects(h.submitWorkflow(options,'en',async()=>{throw new Error('lost')}))
 const original=h.workflowRecords()[0]
 const record=await h.recoverWorkflow(original,async()=>ok({operation:'dubbing',clientRequestId:original.clientRequestId,acceptance:'accepted',response:{id:19,status:1,taskId:200}}))
 assert.equal(h.workflowDetailRequest(record).query.id,19)
 h.saveWorkflowCurrent(record,{id:19,status:3,outputReady:true})
 assert.equal(h.workflowRecords()[0].response.status,1);assert.equal(h.workflowRecords()[0].current.status,3)
})
test('unknown HTTP errors are never classified by numeric code alone',()=>{
 const h=setup()
 for(const error of [new Error('timeout'),{status:502},{status:503,body:'<html>'},{status:422,body:{code:422}},{status:401,body:{data:{acceptance:'rejected',errorCode:'WORKFLOW_INVALID_REQUEST'}}},{body:{data:{acceptance:'rejected',errorCode:'WORKFLOW_SUBMISSION_NOT_FOUND'}}}])assert.equal(h.workflowAcceptance(error),'unknown')
 for(const errorCode of ['WORKFLOW_INVALID_REQUEST','WORKFLOW_REQUEST_REJECTED','WORKFLOW_STORAGE_NOT_READY'])assert.equal(h.workflowAcceptance({body:{data:{acceptance:'rejected',errorCode}}}),'rejected')
 assert.equal(h.workflowAcceptance({body:{data:{acceptance:'conflict',errorCode:'IDEMPOTENCY_CONFLICT'}}}),'conflict')
})
test('account changes cannot expose or replay another account record',async()=>{
 const h=setup();await assert.rejects(h.submitWorkflow(options,'en',async()=>{h.user.id=99;return ok({id:1})}),/账号/)
 assert.equal(h.workflowRecords().length,0)
 h.user.id=42;const record=h.workflowRecords()[0];assert.equal(record.state,'unknown');h.user.id=99
 await assert.rejects(h.recoverWorkflow(record,()=>assert.fail('no network')),/账号/)
})
test('storage failures stop before POST and simultaneous clicks share a lock',async()=>{
 const h=setup();h.window.localStorage.setItem=()=>{throw new Error('quota')}
 await assert.rejects(h.submitWorkflow(options,'en',()=>assert.fail('no POST')),/quota/)
 const other=setup();let release;const deferred=new Promise(resolve=>{release=resolve})
 const first=other.submitWorkflow(options,'en',()=>deferred)
 await assert.rejects(other.submitWorkflow(options,'en',()=>assert.fail('duplicate')),/处理中/)
 release(ok({id:1}));await first
})
test('accepted explicit new intents use new IDs; normal and batch video stay outside this protocol',async()=>{
 const h=setup();const ids=[]
 for(let i=0;i<2;i++)await h.submitWorkflow(options,'en',async sent=>{ids.push(sent.body.clientRequestId);return ok({id:i+1})})
 assert.notEqual(ids[0],ids[1]);assert.equal(h.workflowRecords().length,2)
 assert.equal(h.workflowOperations['/api/v1/studio/storyboards/videos/generate'],undefined)
 assert.equal(h.workflowOperations['/api/v1/studio/storyboards/video-batches/create'],undefined)
})
test('mismatched receipt is rejected without losing original record',async()=>{
 const h=setup();await assert.rejects(h.submitWorkflow(options,'en',async()=>{throw new Error('lost')}))
 await assert.rejects(h.recoverWorkflow(h.workflowRecords()[0],async()=>ok({operation:'dubbing',clientRequestId:'another',acceptance:'accepted',response:{id:999}})),/不一致/)
 assert.equal(h.workflowRecords()[0].state,'unknown')
})
