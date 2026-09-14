import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workspaceSource = readFileSync(
  new URL('../src/pages/aiStudio/project/AssetGenerationWorkspace.tsx', import.meta.url),
  'utf8',
)
const assetsStepSource = readFileSync(
  new URL('../src/pages/aiStudio/project/ProjectAssetsStep.tsx', import.meta.url),
  'utf8',
)
const serviceSource = readFileSync(
  new URL('../src/services/studioAssetGeneration.ts', import.meta.url),
  'utf8',
)

test('history references attach existing file IDs instead of fetching remote image URLs', () => {
  assert.doesNotMatch(workspaceSource, /fetch\(/)
  assert.doesNotMatch(workspaceSource, /createReferenceFileFromHistory/)
  assert.match(workspaceSource, /const\s+uploadReferenceImageIds\s*=\s*async\s*\(fileIds:\s*string\[\]\)/)
  assert.match(workspaceSource, /await\s+uploadReferenceImageIds\(\[item\.fileId\]\)/)
  assert.match(workspaceSource, /await\s+uploadReferenceImageIds\(\[historyItem\.fileId\]\)/)
  assert.doesNotMatch(workspaceSource, /setData\('text\/plain',\s*item\.imageUrl\)/)
})

test('history and reference thumbnails keep API image URLs for display while downloads use file IDs', () => {
  assert.match(workspaceSource, /resolveAssetUrl\(reference\.url\s*\?\?\s*reference\.fileId\)/)
  assert.match(workspaceSource, /resolveAssetUrl\(item\.imageUrl\s*\?\?\s*item\.fileUrl\s*\?\?\s*item\.fileId\s*\?\?\s*item\.thumbnailUrl\)/)
  assert.match(workspaceSource, /resolveAssetUrl\(item\.coverUrl\s*\?\?\s*item\.coverFileId\)/)
  assert.match(workspaceSource, /const\s+downloadPreviewImage\s*=\s*async\s*\(\)\s*=>/)
  assert.match(workspaceSource, /await\s+downloadMediaFile\(fileId\)/)
  assert.match(assetsStepSource, /key:\s*'download'/)
  assert.match(assetsStepSource, /const\s+downloadAssetImage\s*=\s*async\s*\(asset:\s*AssetDraft\)\s*=>/)
  assert.match(assetsStepSource, /await\s+downloadMediaFile\(fileId\)/)
  assert.doesNotMatch(workspaceSource, /buildFileDownloadUrl/)
  assert.doesNotMatch(assetsStepSource, /buildFileDownloadUrl/)
})

test('existing fileId references post to the references API through the parent service path', () => {
  assert.match(serviceSource, /function\s+attachAssetReference/)
  assert.match(serviceSource, /url:\s*'\/api\/v1\/studio\/assets\/references'/)
  assert.match(serviceSource, /body:\s*requestBody/)
  assert.match(serviceSource, /mediaType:\s*'application\/json'/)
  assert.match(serviceSource, /requestReferenceAttach\(assetId:\s*number,\s*fileId:\s*string\)/)
  assert.match(assetsStepSource, /const\s+attachGenerationAssetReferences\s*=\s*async\s*\(fileIds:\s*string\[\]\)/)
  assert.match(assetsStepSource, /StudioAssetGenerationApi\.requestReferenceAttach\(assetId,\s*fileId\)/)
  assert.match(assetsStepSource, /onReferenceImageIdsUpload=\{generationAssetReferenceKey[\s\S]*?attachGenerationAssetReferences/)
})
