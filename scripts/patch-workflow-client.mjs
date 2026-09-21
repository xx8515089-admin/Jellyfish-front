import { readFileSync, writeFileSync } from 'node:fs'
const path=new URL('../src/services/generated/core/request.ts',import.meta.url)
let source=readFileSync(path,'utf8')
if(!source.includes('export const rawRequest')) {
 source=source.replace('export const request =','export const rawRequest =')
 if(!source.includes('export const rawRequest'))throw new Error('Generated request signature changed; workflow patch cannot be applied')
 source="import { submitWorkflow, workflowOperations, workflowAccount } from '../../workflowSubmissions'\n"+source+'\n'+"/** The eight reliability operations persist identity before sending; ordinary media keeps its own protocol. */\nexport const request = <T>(config: OpenAPIConfig, options: ApiRequestOptions): CancelablePromise<T> => {\n if(options.method !== 'POST' || !workflowOperations[options.url]) return rawRequest<T>(config, options)\n return new CancelablePromise(async (resolve,reject,onCancel)=>{\n  let pending: CancelablePromise<T> | undefined\n  onCancel(()=>pending?.cancel())\n  try {\n   const owner=workflowAccount()\n   options={...options,body:JSON.parse(JSON.stringify(options.body))}\n   const headers=await getHeaders(config,options)\n   if(owner!==workflowAccount())throw new Error('账号已变化，已停止提交')\n   if(onCancel.isCancelled)return\n   const result=await submitWorkflow(options,headers.get('language') || 'en',next=>{\n    if(onCancel.isCancelled)throw new Error('已取消等待，原操作记录已保留')\n    pending=rawRequest<T>(config,next);return pending\n   })\n   resolve(result)\n  }catch(error){reject(error)}\n })\n}\n"
 writeFileSync(path,source)
}
