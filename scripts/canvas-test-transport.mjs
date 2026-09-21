import { withCanvasOperationLock } from '../src/pages/canvas/TapnowStudio/canvasOperationLock.js'
export { withCanvasOperationLock }

/** Existing domain tests keep their request recorder while exercising the fetch-based adapter. */
export function canvasMockFetch(imports) {
  const request = imports['./generated/core/request']?.request
  if (!request) return undefined
  return async (url, init) => {
    const parsed = new URL(url, 'http://canvas.test')
    const query = Object.fromEntries(parsed.searchParams)
    for (const key of ['canvasId', 'page', 'pageSize', 'status', 'batchId', 'taskId', 'sessionId', 'workflowId']) if (query[key] != null && /^\d+$/.test(query[key])) query[key] = Number(query[key])
    const options = { url: parsed.pathname, method: init.method, query }
    if (init.body instanceof FormData) {
      options.formData = Object.fromEntries(init.body)
      if (options.formData.canvasId) options.formData.canvasId = Number(options.formData.canvasId)
    } else if (init.body) { options.body = JSON.parse(init.body); options.mediaType = 'application/json' }
    try { return new Response(JSON.stringify(await request(imports['./generated'].OpenAPI, options)), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
    catch (error) {
      if (!error.status) throw error
      return new Response(JSON.stringify(error.body), { status: error.status, headers: { 'Content-Type': 'application/json' } })
    }
  }
}
