import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const outputPath = resolve(projectRoot, 'openapi.json')

/** 读取简单的 .env 文件，让接口生成脚本复用前端后端地址配置。 */
function readEnvFile(fileName) {
  const filePath = resolve(projectRoot, fileName)
  if (!existsSync(filePath)) return {}

  const env = {}
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

/** 合并命令行环境变量和本地 .env 配置，命令行变量优先生效。 */
function loadConfiguredEnv() {
  return {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
    ...process.env,
  }
}

/** 规范化 URL，避免默认拼接 /v3/api-docs 时出现重复斜杠。 */
function trimTrailingSlash(value) {
  return (value ?? '').trim().replace(/\/+$/, '')
}

/** 解析 OpenAPI 文档地址，优先使用显式配置，其次使用 Java 后端默认文档路径。 */
function resolveOpenApiUrl(env) {
  const explicitUrl = env.OPENAPI_URL || env.VITE_OPENAPI_URL
  if (explicitUrl?.trim()) return explicitUrl.trim()

  const backendUrl = trimTrailingSlash(env.VITE_BACKEND_URL || env.BACKEND_URL)
  if (backendUrl) return `${backendUrl}/v3/api-docs`

  throw new Error('未配置 OpenAPI 地址。请设置 OPENAPI_URL，或设置 VITE_BACKEND_URL 后使用默认 /v3/api-docs 路径。')
}

const openApiUrl = resolveOpenApiUrl(loadConfiguredEnv())
console.log(`[openapi] 正在拉取 ${openApiUrl}`)

const response = await fetch(openApiUrl, {
  headers: {
    Accept: 'application/json',
  },
})

if (!response.ok) {
  throw new Error(`[openapi] 拉取失败：HTTP ${response.status} ${response.statusText}`)
}

const body = await response.text()
try {
  JSON.parse(body)
} catch (error) {
  throw new Error(`[openapi] 返回内容不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
}

writeFileSync(outputPath, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
console.log(`[openapi] 已写入 ${outputPath}`)
