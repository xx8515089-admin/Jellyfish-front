/** Convert native scenes to stable shots; media lives in standard shot-relative asset bindings. */
export function analysisStoryboardShots(task, language, media) {
  if (task.status !== 3 || !['videoAnalyze', 'framePromptGenerate'].includes(task.operation) || (task.result?.operation && task.result.operation !== task.operation)) throw new Error('请先完成视频分析或关键帧反推')
  if (!['zh', 'en'].includes(language)) throw new Error('请选择中文或英文提示词')
  const scenes = task.result?.scenes
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > 100 || new Set(scenes.map(scene => scene.sceneId)).size !== scenes.length) throw new Error('分析结果需要 1–100 个具有唯一标识的场景')
  return scenes.map((scene, index) => {
    if (!scene.sceneId || !Number.isFinite(scene.startSeconds) || !Number.isFinite(scene.endSeconds) || scene.startSeconds < 0 || scene.endSeconds < scene.startSeconds || typeof scene.prompts?.[language] !== 'string' || !scene.prompts[language].trim() || !Array.isArray(scene.keyframes)) throw new Error('场景时间、提示词或关键帧不完整')
    const keyframes = scene.keyframes.map(frame => {
      if (!Number.isSafeInteger(Number(frame.assetId)) || Number(frame.assetId) <= 0 || !frame.frameId || !Number.isFinite(frame.timeSeconds) || frame.timeSeconds < 0) throw new Error('关键帧缺少有效素材或来源标识')
      const url = media.get(String(frame.assetId))
      if (!url) throw new Error('关键帧尚未关联当前画布素材')
      // Do not duplicate raw assetId here: copy remaps standard bindings, not arbitrary ID fields.
      return { frameId: frame.frameId, timeSeconds: frame.timeSeconds, role: frame.role || 'current', description: frame.description || '', image_url: url }
    })
    const keyframe = keyframes.find(frame => frame.role === 'current') || keyframes[0]
    return {
      id: 'analysis-' + encodeURIComponent(String(task.canvasId)) + '-' + encodeURIComponent(String(task.taskId ?? task.nodeId)) + '-' + encodeURIComponent(scene.sceneId),
      scene_index: index + 1, description: scene.description || '', prompt: scene.prompts[language],
      prompts: { zh: scene.prompts.zh, en: scene.prompts.en }, duration: String(Number((scene.endSeconds - scene.startSeconds).toFixed(3))) + 's',
      time_range: scene.startSeconds + '–' + scene.endSeconds, camera: scene.cameraMovement || '', tags: Object.values(scene.tags || {}).flat(),
      image_url: keyframe?.image_url || '', status: 'draft', outputEnabled: false, selectedImageIndex: -1,
      analysisSource: { taskId: task.taskId, nodeId: task.nodeId, sceneId: scene.sceneId, startSeconds: scene.startSeconds, endSeconds: scene.endSeconds, keyframes },
    }
  })
}
