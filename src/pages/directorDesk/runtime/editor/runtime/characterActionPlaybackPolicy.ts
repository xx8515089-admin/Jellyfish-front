const GUO_CHARACTER_LIBRARY_PATH = /\/guo-3d-assets\/guo-skeleton-models\//i;

const PROCEDURAL_FALLBACK_PRESET_IDS = new Set([
  "crouch-cycle",
  "jump-cycle",
]);

const ONE_SHOT_ACTION_PRESET_IDS = new Set([
  "robot-scan",
  "robot-approve",
  "robot-punch",
]);

export type CharacterActionPlaybackMode = "loop" | "once";

export function getCharacterActionPlaybackMode(
  actionPresetId?: string | null,
): CharacterActionPlaybackMode {
  return actionPresetId && ONE_SHOT_ACTION_PRESET_IDS.has(actionPresetId)
    ? "once"
    : "loop";
}

export function shouldUseProceduralBuiltInAction(
  characterUrl: string,
  actionPresetId?: string | null,
) {
  return Boolean(
    actionPresetId
      && GUO_CHARACTER_LIBRARY_PATH.test(characterUrl.replace(/\\/g, "/"))
      && PROCEDURAL_FALLBACK_PRESET_IDS.has(actionPresetId),
  );
}
