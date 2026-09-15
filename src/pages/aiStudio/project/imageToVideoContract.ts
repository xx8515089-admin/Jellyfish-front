import type { ImageToVideoGenerate } from '../../../services/generated/models/ImageToVideoGenerate'
import type { StoryboardPanelImage } from '../../../services/generated/models/StoryboardPanelImage'

/** Prompt eligibility depends on successful media and descriptions, never confirmation status or crop bounds. */
export function canGenerateImageVideoPrompt(image: StoryboardPanelImage | undefined, scope: 'whole_image' | 'single_panel' | 'all_panels', panelId: string | undefined, duration: number): boolean {
  if (image?.status !== 3) return false
  if (scope === 'whole_image') return true
  const panels = scope === 'single_panel' ? (image.panels ?? []).filter((panel) => panel.panelId === panelId) : image.panels ?? []
  return panels.length > 0 && panels.every((panel) => Boolean(panel.description?.trim())) && (scope !== 'all_panels' || panels.length <= duration)
}

/** Build the dedicated API payload explicitly so multi-reference fields never leak into it. */
export function buildImageToVideoRequest(input: {
  imageGenerationId: string; modelId?: number; resolution: string; duration: number;
  prompt: string; visualStyleId: number | null; toneStyleId: number | null;
  scope?: 'whole_image' | 'single_panel' | 'all_panels'; panelId?: string | null; panelRevision?: number | null;
}): ImageToVideoGenerate {
  const imageGenerationId = Number(input.imageGenerationId)
  if (!Number.isSafeInteger(imageGenerationId) || imageGenerationId <= 0) throw new Error('图片生成记录 ID 无效')
  for (const id of [input.visualStyleId, input.toneStyleId]) {
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('风格 ID 无效，请重新选择')
  }
  if (input.scope && input.scope !== 'whole_image' && (!Number.isSafeInteger(input.panelRevision) || input.panelRevision! < 1 || (input.scope === 'single_panel' && !input.panelId))) throw new Error('请重新选择分镜并生成提示词')
  return {
    imageGenerationId, modelId: input.modelId, resolution: input.resolution,
    durationSeconds: input.duration, prompt: input.prompt.trim(),
    visualStyleId: input.visualStyleId, toneStyleId: input.toneStyleId,
    ...(input.scope === 'whole_image' ? { scope: input.scope } : input.scope ? { scope: input.scope, panelRevision: input.panelRevision!, ...(input.scope === 'single_panel' ? { panelId: input.panelId! } : {}) } : {}),
  }
}

/** Only valid normalized first-frame bounds permit a panel video; prompt generation needs no coordinates. */
export function validPanelBounds(bounds?: { x: number; y: number; width: number; height: number } | null): bounds is { x: number; y: number; width: number; height: number } {
  return Boolean(bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.x >= 0 && bounds.y >= 0 && bounds.width > 0 && bounds.height > 0
    && bounds.x + bounds.width <= 1 && bounds.y + bounds.height <= 1)
}

/** HappyHorse counts Han characters twice; other models use the normal character limit. */
export function imageToVideoPromptLength(prompt: string, modelCode?: string) {
  return modelCode === 'happyhorse/image-to-video'
    ? [...prompt.trim()].reduce((sum, char) => sum + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0)
    : prompt.trim().length
}
