import { generate } from 'openapi-typescript-codegen'
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Generate only the documented analysis extension, preserving the shared client and authentication.
const output = await mkdtemp(join(tmpdir(), 'canvas-analysis-codegen-'))
try {
  await generate({ input: resolve('docs/contracts/canvas-analysis.openapi.json'), output, httpClient: 'fetch', useOptions: true, useUnionTypes: true })
  for (const directory of ['models', 'services']) {
    const destination = resolve('src/services/generated', directory)
    await mkdir(destination, { recursive: true })
    for (const file of await readdir(join(output, directory))) {
      if (!file.startsWith('CanvasAnalysis') || !file.endsWith('.ts')) throw new Error('Unexpected analysis contract output: ' + file)
      await copyFile(join(output, directory, file), join(destination, file))
    }
  }
  console.log('Generated CanvasAnalysis models and service from the documented contract snapshot.')
} finally {
  // This absolute directory was created by mkdtemp above and contains only this generation output.
  await rm(output, { recursive: true, force: true })
}
