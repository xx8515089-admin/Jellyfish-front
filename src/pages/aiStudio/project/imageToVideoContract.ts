import type { ImageToVideoGenerate } from '../../../services/generated/models/ImageToVideoGenerate'

/** Build the dedicated API payload explicitly so multi-reference fields never leak into it. */
export function buildImageToVideoRequest(input: {
  imageGenerationId: string; modelId?: number; resolution: string; duration: number;
  prompt: string; visualStyleId: number | null; toneStyleId: number | null;
  scope?: 'single_panel' | 'all_panels'; panelId?: string; panelRevision?: number;
}): ImageToVideoGenerate {
  const imageGenerationId = Number(input.imageGenerationId)
  if (!Number.isSafeInteger(imageGenerationId) || imageGenerationId <= 0) throw new Error('图片生成记录 ID 无效')
  for (const id of [input.visualStyleId, input.toneStyleId]) {
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('风格 ID 无效，请重新选择')
  }
  if (input.scope && (!Number.isSafeInteger(input.panelRevision) || input.panelRevision! < 1 || (input.scope === 'single_panel' && !input.panelId))) throw new Error('请重新选择已确认分镜并生成提示词')
  return {
    imageGenerationId, modelId: input.modelId, resolution: input.resolution,
    durationSeconds: input.duration, prompt: input.prompt.trim(),
    visualStyleId: input.visualStyleId, toneStyleId: input.toneStyleId,
    ...(input.scope ? { scope: input.scope, panelRevision: input.panelRevision, ...(input.scope === 'single_panel' ? { panelId: input.panelId } : {}) } : {}),
  }
}

/** HappyHorse counts Han characters twice; other models use the normal character limit. */
export function imageToVideoPromptLength(prompt: string, modelCode?: string) {
  return modelCode === 'happyhorse/image-to-video'
    ? [...prompt.trim()].reduce((sum, char) => sum + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0)
    : prompt.trim().length
}
