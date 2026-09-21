import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { File } from 'node:buffer'
import { resolve, dirname } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Load real TS modules in a small isolated runtime; transport tests never contact a service.
function load(path, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { exports, Intl, Date, URL, URLSearchParams, Headers, Response, Blob, File, AbortController, setTimeout, clearTimeout, ...globals, require(name) {
    if (name in imports) return imports[name]
    if (name.startsWith('.')) {
      const base = resolve(dirname(path), name)
      const target = [base, base + '.ts', base + '.js'].find(candidate => existsSync(candidate))
      if (!target) throw new Error(`Cannot resolve ${name} from ${path}`)
      return load(target, imports, globals)
    }
    throw new Error(`Unexpected import ${name}`)
  } }, { filename: path })
  return exports
}
const model = load('src/pages/aiStudio/efficiency/efficiencyModel.ts')
const plain = (value) => JSON.parse(JSON.stringify(value))
const filters = { range: 'custom', startDate: '2026-09-01', endDate: '2026-09-20', projectId: 23, memberId: 7 }

test('metric and drill query omit illegal scopes and export retains filters without paging', () => {
  assert.deepEqual(plain(model.metricQuery(filters, 'credits', 'asset')), { ...filters, metric: 'credits' })
  assert.deepEqual(plain(model.metricQuery(filters, 'duration', 'video')), { ...filters, metric: 'duration' })
  assert.equal(model.metricQuery(filters, 'draws', 'all').drawScope, 'all')
  const query = model.detailQuery(filters, 'draws', 'asset', { groupBy: 'project', groupKey: 'unknown' })
  assert.deepEqual(plain(query), { ...filters, metric: 'draws', drawScope: 'asset', groupBy: 'project', groupKey: 'unknown' })
  assert.equal('page' in query, false)
  assert.equal(model.detailQuery(filters, 'duration', 'asset', { operationCode: 'video' }).operationCode, undefined)
  assert.equal(model.detailQuery(filters, 'credits', 'asset', { operationCode: 'copyright' }).operationCode, 'copyright')
})

test('date validation uses inclusive 366 days, rejects invalid and future Shanghai dates', () => {
  const now = new Date('2026-09-20T17:00:00Z') // Shanghai is already September 21.
  assert.equal(model.validateDates('2026-09-21', '2026-09-21', now), undefined)
  assert.match(model.validateDates('2026-09-22', '2026-09-22', now), /上海/)
  assert.equal(model.validateDates('2025-09-21', '2026-09-21', now), undefined)
  assert.match(model.validateDates('2025-09-20', '2026-09-21', now), /366/)
  assert.match(model.validateDates('2026-09-21', '2026-09-20', now), /早于/)
  assert.match(model.validateDates('2026-02-30', '2026-03-01', now), /有效/)
})

test('date errors, comparisons and coverage support English without changing statistics', () => {
  const en = (_zh, english) => english
  const now = new Date('2026-09-20T16:30:00Z')
  assert.equal(model.validateDates('2026-09-22', '2026-09-22', now, en), 'Dates after today in Shanghai cannot be selected')
  assert.equal(model.validateDates('2026-09-21', '2026-09-21', now, en), undefined)
  assert.equal(model.comparisonText({ changeState: 'unavailable', changePercent: null }, en), 'Comparison unavailable')
  assert.equal(model.efficiencyError({ status: 401 }, en), 'Your session has expired. Please sign in again.')
  assert.equal(model.efficiencyError({ status: 401 }), '登录已过期，请重新登录')
  assert.equal(model.efficiencyError({ message: '导出失败：未收到有效 CSV 文件' }, en), 'Export failed: no valid CSV file received')
  assert.equal(model.getCoverageWarningText(en).UNKNOWN_MEMBER, 'Some records have no known member')
})

test('milliseconds and nullable credits retain their distinct meaning', () => {
  assert.equal(model.formatMetric(90000, 'duration'), '1.5')
  assert.equal(model.formatMetric(1.23, 'credits'), '1.23')
  assert.equal(model.formatMetric(0, 'credits'), '0.00')
  assert.equal(model.formatMetric(null, 'credits'), '—')
  assert.equal(model.formatMetric(NaN, 'duration'), '—')
  assert.equal(model.formatMetric(2, 'duration'), '<0.01')
})

test('comparison states do not invent percentages for empty or partial baselines', () => {
  for (const [changeState, expected] of [['new','新增'],['noData','暂无变化数据'],['unavailable','暂不可比较'],['unchanged','持平']]) assert.equal(model.comparisonText({changeState, changePercent:null}), expected)
  assert.equal(model.comparisonText({changeState:'decrease', changePercent:-12.32}), '-12.32%')
  assert.equal(model.comparisonText({changeState:'increase', changePercent:Infinity}), '暂不可比较')
})

test('HTTP-200 business errors, partial success and structured errors remain distinct', () => {
  assert.throws(() => model.unwrapEfficiency({code:502,message:'not ready',data:{errorCode:'STATISTICS_NOT_READY'}}), value => model.efficiencyError(value).includes('尚未就绪'))
  assert.throws(() => model.unwrapEfficiency({code:200,message:'success',data:null}))
  const data = { meta: { coverage: { status:'partial' } }, credits: { current:1.25 } }
  assert.equal(model.unwrapEfficiency({code:200,message:'success',data}), data)
  assert.match(model.efficiencyError({status:403,body:{message:'denied',data:null}}), /权限/)
  assert.match(model.efficiencyError({body:{data:{errorCode:'EXPORT_TOO_LARGE'}}}), /100000/)
})

test('only accessible active real project IDs may navigate', () => {
  assert.equal(model.projectHref({id:123,entityState:'active',canNavigate:true}), '/projects/create?scriptImportId=123')
  for (const entityState of ['deleted','restricted','unknown']) assert.equal(model.projectHref({id:123,entityState,canNavigate:true}), undefined)
  assert.equal(model.projectHref({id:123,entityState:'active',canNavigate:false}), undefined)
  assert.equal(model.projectHref({id:null,entityState:'active',canNavigate:true}), undefined)
})

// Execute generated service, shared request and the CSV transport together with a mocked fetch.
function client(fetcher) {
  const config = { BASE: 'https://example.test', VERSION:'1', WITH_CREDENTIALS:false, CREDENTIALS:'include', HEADERS:async () => ({Authorization:'raw-token',language:'cn'}) }
  const imports = {
    '../../../config/api': {joinApiBasePath:(base,path) => base + path},
    '../config/api': {joinApiBasePath:(base,path) => base + path},
    '../core/OpenAPI': {OpenAPI:config},
  }
  const globals = {fetch:fetcher,console:{error() {}}}
  return load('src/services/efficiencyGenerated/services/EfficiencyService.ts', imports, globals).EfficiencyService
}

test('all JSON endpoints send camelCase query and raw Java authorization', async () => {
  const calls=[]
  const api = client(async (url, options) => { calls.push({url,options}); return new Response(JSON.stringify({code:200,message:'success',data:{}}), {headers:{'Content-Type':'application/json'}}) })
  await api.getSummary(filters)
  await api.getTrend({...model.metricQuery(filters,'draws','image'),granularity:'auto'})
  await api.getRankings({...model.metricQuery(filters,'credits','all'),groupBy:'project',limit:8})
  await api.getDistribution(filters)
  await api.getRecords({...model.detailQuery(filters,'credits','all',{groupBy:'project',groupKey:'unknown'}),page:2,pageSize:20})
  assert.equal(calls.length,5)
  for (const call of calls) {
    assert.equal(call.options.headers.get('Authorization'), 'raw-token')
    assert.equal(call.options.method,'GET')
    assert.equal(new URL(call.url).searchParams.get('startDate'),'2026-09-01')
  }
  assert.equal(new URL(calls[0].url).searchParams.has('metric'),false)
  assert.equal(new URL(calls[1].url).searchParams.get('drawScope'),'image')
  assert.equal(new URL(calls[2].url).searchParams.has('drawScope'),false)
  assert.equal(new URL(calls[4].url).searchParams.get('page'),'2')
})

test('CSV export uses all matching filters, raw auth, server filename and complete bytes', async () => {
  let call
  const api = client(async (url,options) => { call={url,options}; return new Response('\ufeffrecordKey,metricValue\ncredits:123,1.25', {headers:{'Content-Type':'text/csv;charset=UTF-8','Content-Disposition':"attachment; filename*=UTF-8''%E6%95%88%E8%83%BD.csv"}}) })
  const file = await api.getExport({...model.detailQuery(filters,'credits','all',{operationCode:'video'}),page:2,pageSize:20})
  assert.equal(file.name,'效能.csv')
  assert.match(await file.text(),/credits:123,1.25/)
  assert.equal(call.options.headers.get('Authorization'),'raw-token')
  assert.equal(call.options.headers.get('Accept'),'text/csv')
  const query=new URL(call.url).searchParams
  assert.equal(query.get('operationCode'),'video')
  assert.equal(query.get('projectId'),'23')
  assert.equal(query.has('page'),false)
  assert.equal(query.has('pageSize'),false)
})

for (const [status,errorCode] of [[403,'EFFICIENCY_FORBIDDEN'],[422,'EXPORT_TOO_LARGE'],[503,'STATISTICS_NOT_READY'],[200,'INVALID_QUERY']]) test(`CSV rejects JSON errors at HTTP ${status}`, async () => {
  const api=client(async () => new Response(JSON.stringify({code:502,message:'failed',data:{errorCode}}), {status,headers:{'Content-Type':'application/json'}}))
  await assert.rejects(api.getExport({metric:'credits'}), error => error.body.data.errorCode === errorCode)
})

test('CSV rejects wrong MIME and interrupted streams before reporting success', async () => {
  let api=client(async () => new Response('<html>Login</html>',{headers:{'Content-Type':'text/html'}}))
  await assert.rejects(api.getExport({metric:'credits'}))
  api=client(async () => ({ok:true,headers:new Headers({'Content-Type':'text/csv'}),blob:async () => { throw new Error('disconnected') }}))
  await assert.rejects(api.getExport({metric:'credits'}), /disconnected/)
})

const flush = () => new Promise(resolve => setImmediate(resolve))
// Minimal rerender-capable hook runtime verifies actual cancellation and stale-result guards.
function resourceHarness() {
  let state, ref, effect, priorKey, key, cleanup
  const react = {
    useRef(value) { ref ??= {current:value}; return ref },
    useState(initial) { state ??= initial; return [state,next => { state = next }] },
    useEffect(callback,deps) { if (deps[0] !== priorKey) effect=callback },
  }
  const {useEfficiencyResource} = load('src/pages/aiStudio/efficiency/useEfficiencyResource.ts', {react})
  const pending=[]
  const loader=() => { let resolve,reject; const p=new Promise((a,b) => { resolve=a;reject=b }); const entry={resolve,reject,cancelled:false}; p.cancel=() => {entry.cancelled=true}; pending.push(entry); return p }
  return {pending,render(next) { key=next; return useEfficiencyResource(key,loader) }, commit() { if (effect) { cleanup?.(); cleanup=effect(); effect=null;priorKey=key } },unmount(){cleanup?.()} }
}

test('filter change hides old render data, cancels old calls and rejects late responses', async () => {
  const h=resourceHarness()
  assert.equal(h.render('A').loading,true); h.commit()
  assert.equal(h.render('B').data,undefined);h.commit()
  assert.equal(h.pending[0].cancelled,true)
  h.pending[0].resolve({code:200,data:{credits:999}});await flush()
  assert.equal(h.render('B').loading,true)
  h.pending[1].resolve({code:200,data:{credits:1.25}});await flush()
  assert.equal(h.render('B').data.credits,1.25)
  assert.equal(h.render('C').data,undefined)
  h.commit();h.unmount()
  assert.equal(h.pending[2].cancelled,true)
})

test('one region can fail while another succeeds; retry never converts error into zero', async () => {
  const summary=resourceHarness(),trend=resourceHarness()
  summary.render('one');summary.commit();trend.render('one');trend.commit()
  summary.pending[0].reject({body:{code:502,message:'warming',data:{errorCode:'STATISTICS_NOT_READY'}}})
  trend.pending[0].resolve({code:200,data:{totalValue:87.5}});await flush()
  assert.match(summary.render('one').error,/尚未就绪/)
  assert.equal(summary.render('one').data,undefined)
  assert.equal(trend.render('one').data.totalValue,87.5)
  assert.equal(summary.render('retry').loading,true);summary.commit()
  summary.pending[1].resolve({code:200,data:{credits:0}});await flush()
  assert.equal(summary.render('retry').data.credits,0)
})

test('v2 generated calls retain one snapshot and stable model drill keys through CSV', async () => {
  const calls=[]
  const snapshotId='00000000-0000-4000-8000-000000000001'
  const api=client(async(url,options)=>{
    calls.push({url,options})
    return url.endsWith('/snapshots') || !url.includes('/export')
      ? new Response(JSON.stringify({code:200,message:'success',data:{}}),{headers:{'Content-Type':'application/json'}})
      : new Response('recordKey,modelKey\ncredits:1,supplier:7:model:2',{headers:{'Content-Type':'text/csv'}})
  })
  await api.createSnapshot({requestBody:filters})
  const view={...filters,snapshotId}
  await api.getSummary(view)
  await api.getModelDistribution(view)
  const drill={modelGroup:'image',modelKey:'supplier:7:model:2'}
  const query=model.detailQuery(view,'credits','video',drill)
  await api.getRecords({...query,page:2,pageSize:20})
  await api.getExport(query)
  assert.equal(calls[0].options.method,'POST')
  assert.deepEqual(JSON.parse(calls[0].options.body),filters)
  for(const call of calls.slice(1))assert.equal(new URL(call.url).searchParams.get('snapshotId'),snapshotId)
  assert.equal(new URL(calls[2].url).searchParams.has('metric'),false)
  for(const call of calls.slice(3)) {
    const params=new URL(call.url).searchParams
    assert.equal(params.get('modelGroup'),'image')
    assert.equal(params.get('modelKey'),'supplier:7:model:2')
    assert.equal(params.has('drawScope'),false)
  }
  assert.equal(new URL(calls[4].url).searchParams.has('page'),false)
  assert.equal(model.detailQuery(view,'duration','all',drill).modelKey,undefined)
})

test('missing trend values display as zero without changing known contributions',()=>{
  const buckets=[{value:9,plotValue:null},{value:0,plotValue:0},{value:2,plotValue:2},{value:3,plotValue:null},{value:4,plotValue:4}]
  assert.deepEqual(buckets.map(model.trendDisplayValue),[0,0,2,0,4])
  assert.equal(buckets.reduce((sum,bucket)=>sum+bucket.value,0),18)
  assert.equal(buckets[0].plotValue,null)
  for(const plotValue of [null,undefined,NaN,Infinity])assert.equal(model.trendDisplayValue({plotValue}),0)
})

test('coverage deduplication preserves period, affected metric, attribution and unknown counts',()=>{
  const missing={id:'same-id',code:'HISTORICAL_UNVERIFIED',affectedMetrics:['duration'],impact:'metric',affectedCount:null}
  const unknown={id:'unknown-model',affectedMetrics:['credits'],impact:'attribution',affectedCount:2}
  const meta={coverage:{current:{reasons:[missing,unknown]},previous:{reasons:[missing]}}}
  const all=model.coverageIssues([meta,meta])
  assert.equal(all.length,3)
  assert.equal(all[0].affectedCount,null)
  assert.equal(model.coverageIssues([meta],'credits','metric').length,0)
  assert.equal(model.coverageIssues([meta],'duration','metric').length,2)
  assert.equal(model.coverageIssues([meta],'credits','attribution').length,1)
})

test('v2 errors distinguish view expiry, readiness and snapshot limits',()=>{
  const en=(_zh,english)=>english
  for(const code of ['SNAPSHOT_EXPIRED','SNAPSHOT_SCOPE_MISMATCH','SNAPSHOT_INVALID'])assert.equal(model.isSnapshotInvalid({body:{data:{errorCode:code}}}),true)
  assert.equal(model.isSnapshotInvalid({status:503}),false)
  assert.match(model.efficiencyError({body:{data:{errorCode:'STATISTICS_NOT_READY',readiness:{status:'missingMigration',retryable:false}}}},en),/migration is incomplete.*administrator/)
  assert.match(model.efficiencyError({body:{data:{errorCode:'SNAPSHOT_LIMIT'}}},en),/Wait for/)
})
