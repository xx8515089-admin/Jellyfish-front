import { generate } from 'openapi-typescript-codegen'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Generate the batch import contract without overwriting other domains or their authentication.
const root = new URL('../', import.meta.url)
await generate({ input: fileURLToPath(new URL('docs/contracts/asset-import.openapi.json', root)), output: fileURLToPath(new URL('src/services/assetImportGenerated', root)), httpClient: 'fetch', useOptions: true, useUnionTypes: true, exportCore: false })
const core = new URL('src/services/assetImportGenerated/core/', root)
await mkdir(core, { recursive: true })
for (const name of ['OpenAPI', 'CancelablePromise']) {
  await writeFile(new URL(`${name}.ts`, core), `// Generated bridge; regenerate with pnpm run openapi:update -- --contract=asset-import.\nexport * from '../../generated/core/${name}'\n`)
}

await writeFile(new URL('request.ts', core), `// Generated bridge; retain import-specific error headers and throttling.\nexport { request } from '../../assetImportTransport'\n`)
