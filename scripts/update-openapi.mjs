import { spawnSync } from 'node:child_process'

// A scoped contract update preserves existing generated domains; default keeps the remote update workflow.
if (process.argv.includes('--contract=asset-import')) {
  await import('./generate-asset-import-client.mjs')
} else {
  await import('./fetch-openapi.mjs')
  const result = spawnSync(process.execPath, ['node_modules/openapi-typescript-codegen/bin/index.js', '--input', './openapi.json', '--output', './src/services/generated', '--client', 'fetch', '--useOptions', '--useUnionTypes'], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
  if(result.status === 0) await import('./patch-workflow-client.mjs')
}
