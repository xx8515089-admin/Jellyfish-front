import { getObjectMotionActionSample } from "../schema/objectMotion";
import type { DirectorObject } from "../schema/directorProject";

export interface CharacterRuntimeMotion {
  duration: number;
  object: DirectorObject;
  previewActionPresetId?: string | null;
}

export function getCharacterRuntimeActionSample(
  runtimeMotion: CharacterRuntimeMotion,
  progress: number,
) {
  if (runtimeMotion.previewActionPresetId) {
    return {
      actionPresetId: runtimeMotion.previewActionPresetId,
      animationTimeSeconds: Math.min(1, Math.max(0, progress)) * runtimeMotion.duration,
      previewing: true,
    };
  }

  return {
    ...getObjectMotionActionSample(runtimeMotion.object, progress, runtimeMotion.duration),
    previewing: false,
  };
}
