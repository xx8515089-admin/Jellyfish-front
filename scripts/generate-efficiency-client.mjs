import { generate } from 'openapi-typescript-codegen'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Generate only this contract so existing Java and canvas clients are preserved.
const root = new URL('../', import.meta.url)
await generate({
  input: fileURLToPath(new URL('docs/contracts/efficiency-overview.openapi.json', root)),
  output: fileURLToPath(new URL('src/services/efficiencyGenerated', root)),
  httpClient: 'fetch', useOptions: true, useUnionTypes: true, exportCore: false,
})
const core = new URL('src/services/efficiencyGenerated/core/', root)
await mkdir(core, { recursive: true })
// Share the existing login configuration and cancellation runtime; CSV needs a binary transport.
for (const [name, source] of Object.entries({
  OpenAPI: '../../generated/core/OpenAPI',
  CancelablePromise: '../../generated/core/CancelablePromise',
  request: '../../efficiencyTransport',
})) await writeFile(new URL(`${name}.ts`, core), `// Generated bridge; regenerate with npm run openapi:efficiency.\nexport * from '${source}'\n`)
