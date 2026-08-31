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
  _characterUrl: string,
  _actionPresetId?: string | null,
) {
  return false;
}
