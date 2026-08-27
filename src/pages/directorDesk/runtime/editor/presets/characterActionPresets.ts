import { HUMANOID_CONTROL_KEYS } from "./skeletonMappings";
import { CHARACTER_SPECIFIC_ACTION_PRESETS } from "./characterSpecificActionPresets";
import { getCharacterActionPlaybackMode } from "../runtime/characterActionPlaybackPolicy";

export interface CharacterActionKeyframe {
  t: number;
  controls: Record<string, number>;
}

export interface CharacterActionPreset {
  id: string;
  label: string;
  labelEn: string;
  duration: number;
  /** 供导入的 Mixamo 兼容角色使用的可选 Mixamo FBX 动画片段。 */
  mixamoAnimationUrl?: string;
  mixamoDuration?: number;
  robotExpressiveDuration?: number;
  keyframes: CharacterActionKeyframe[];
}

export function getCharacterActionDisplayDuration(
  preset: CharacterActionPreset,
  characterUrl?: string | null,
  rigType?: string | null,
) {
  if (/robot-expressive\.glb(?:$|[?#])/i.test(characterUrl ?? "")) {
    return preset.robotExpressiveDuration ?? preset.duration;
  }
  return rigType === "mixamo" ? preset.mixamoDuration ?? preset.duration : preset.duration;
}

const mixamoAnimationUrl = (fileName: string) =>
  __LOCAL_MIXAMO_ANIMATIONS_AVAILABLE__
    ? `${import.meta.env.BASE_URL}director-desk-assets/local-assets/mixamo/animations/${fileName}`
    : undefined;

export const CHARACTER_ACTION_PRESETS: CharacterActionPreset[] = [
  { id: "walk-cycle", label: "正常行走", labelEn: "Walk", duration: 1.1, mixamoDuration: 1.03, robotExpressiveDuration: .96, mixamoAnimationUrl: mixamoAnimationUrl("walk.fbx"), keyframes: [
    { t: 0, controls: { "leftShoulder.pitch": 24, "rightShoulder.pitch": -24, "leftElbow.bend": 18, "rightElbow.bend": 24, "leftHip.pitch": -22, "rightHip.pitch": 22, "leftKnee.bend": 8, "rightKnee.bend": 28 } },
    { t: .25, controls: { "leftShoulder.pitch": 0, "rightShoulder.pitch": 0, "leftElbow.bend": 16, "rightElbow.bend": 16, "leftHip.pitch": 0, "rightHip.pitch": 0, "leftKnee.bend": 18, "rightKnee.bend": 10 } },
    { t: .5, controls: { "leftShoulder.pitch": -24, "rightShoulder.pitch": 24, "leftElbow.bend": 24, "rightElbow.bend": 18, "leftHip.pitch": 22, "rightHip.pitch": -22, "leftKnee.bend": 28, "rightKnee.bend": 8 } },
    { t: .75, controls: { "leftShoulder.pitch": 0, "rightShoulder.pitch": 0, "leftElbow.bend": 16, "rightElbow.bend": 16, "leftHip.pitch": 0, "rightHip.pitch": 0, "leftKnee.bend": 10, "rightKnee.bend": 18 } },
    { t: 1, controls: { "leftShoulder.pitch": 24, "rightShoulder.pitch": -24, "leftElbow.bend": 18, "rightElbow.bend": 24, "leftHip.pitch": -22, "rightHip.pitch": 22, "leftKnee.bend": 8, "rightKnee.bend": 28 } },
  ] },
  { id: "run-cycle", label: "跑步", labelEn: "Run", duration: .72, mixamoDuration: .72, robotExpressiveDuration: .96, mixamoAnimationUrl: mixamoAnimationUrl("run.fbx"), keyframes: [
    { t: 0, controls: { "body.pitch": 12, "leftShoulder.pitch": 46, "rightShoulder.pitch": -46, "leftElbow.bend": 78, "rightElbow.bend": 86, "leftHip.pitch": -38, "rightHip.pitch": 44, "leftKnee.bend": 26, "rightKnee.bend": 70 } },
    { t: .25, controls: { "body.pitch": 12, "leftShoulder.pitch": 0, "rightShoulder.pitch": 0, "leftElbow.bend": 82, "rightElbow.bend": 82, "leftHip.pitch": 6, "rightHip.pitch": 6, "leftKnee.bend": 46, "rightKnee.bend": 30 } },
    { t: .5, controls: { "body.pitch": 12, "leftShoulder.pitch": -46, "rightShoulder.pitch": 46, "leftElbow.bend": 86, "rightElbow.bend": 78, "leftHip.pitch": 44, "rightHip.pitch": -38, "leftKnee.bend": 70, "rightKnee.bend": 26 } },
    { t: .75, controls: { "body.pitch": 12, "leftShoulder.pitch": 0, "rightShoulder.pitch": 0, "leftElbow.bend": 82, "rightElbow.bend": 82, "leftHip.pitch": 6, "rightHip.pitch": 6, "leftKnee.bend": 30, "rightKnee.bend": 46 } },
    { t: 1, controls: { "body.pitch": 12, "leftShoulder.pitch": 46, "rightShoulder.pitch": -46, "leftElbow.bend": 78, "rightElbow.bend": 86, "leftHip.pitch": -38, "rightHip.pitch": 44, "leftKnee.bend": 26, "rightKnee.bend": 70 } },
  ] },
  { id: "crouch-cycle", label: "蹲下起立", labelEn: "Crouch and stand", duration: 2.2, mixamoDuration: .6, robotExpressiveDuration: .42, mixamoAnimationUrl: mixamoAnimationUrl("sit-stand.fbx"), keyframes: [
    { t: 0, controls: { "body.offsetY": 0, "body.pitch": 0, "torso.pitch": 0, "leftHip.pitch": 0, "rightHip.pitch": 0, "leftKnee.bend": 0, "rightKnee.bend": 0, "leftShoulder.pitch": 0, "rightShoulder.pitch": 0, "leftElbow.bend": 10, "rightElbow.bend": 10 } },
    { t: .5, controls: { "body.offsetY": -.26, "body.pitch": 6, "torso.pitch": -8, "leftHip.pitch": 52, "rightHip.pitch": 52, "leftKnee.bend": 72, "rightKnee.bend": 72, "leftShoulder.pitch": 10, "rightShoulder.pitch": 10, "leftElbow.bend": 22, "rightElbow.bend": 22 } },
    { t: 1, controls: { "body.offsetY": 0, "body.pitch": 0, "torso.pitch": 0, "leftHip.pitch": 0, "rightHip.pitch": 0, "leftKnee.bend": 0, "rightKnee.bend": 0, "leftShoulder.pitch": 0, "rightShoulder.pitch": 0, "leftElbow.bend": 10, "rightElbow.bend": 10 } },
  ] },
  { id: "side-step-left", label: "左跨步", labelEn: "Step left", duration: 1.4, mixamoDuration: 1.23, robotExpressiveDuration: .96, mixamoAnimationUrl: mixamoAnimationUrl("side-step-left.fbx"), keyframes: [
    { t: 0, controls: { "body.roll": 0, "leftHip.spread": 0, "rightHip.spread": 0, "leftKnee.bend": 0, "rightKnee.bend": 0, "leftShoulder.spread": 0, "rightShoulder.spread": 0 } },
    { t: .5, controls: { "body.roll": -4, "leftHip.spread": -18, "rightHip.spread": 6, "leftKnee.bend": 12, "rightKnee.bend": 8, "leftShoulder.spread": -10, "rightShoulder.spread": 8 } },
    { t: 1, controls: { "body.roll": 0, "leftHip.spread": 0, "rightHip.spread": 0, "leftKnee.bend": 0, "rightKnee.bend": 0, "leftShoulder.spread": 0, "rightShoulder.spread": 0 } },
  ] },
  { id: "jump-cycle", label: "原地跳跃", labelEn: "Jump in place", duration: 1, mixamoDuration: 1.9, robotExpressiveDuration: .71, mixamoAnimationUrl: mixamoAnimationUrl("jump.fbx"), keyframes: [
    { t: 0, controls: { "body.offsetY": 0, "leftHip.pitch": 0, "rightHip.pitch": 0, "leftKnee.bend": 0, "rightKnee.bend": 0, "leftShoulder.pitch": 0, "rightShoulder.pitch": 0 } },
    { t: .3, controls: { "body.offsetY": -.15, "leftHip.pitch": 28, "rightHip.pitch": 28, "leftKnee.bend": 45, "rightKnee.bend": 45, "leftShoulder.pitch": -8, "rightShoulder.pitch": -8 } },
    { t: .55, controls: { "body.offsetY": .22, "leftHip.pitch": -4, "rightHip.pitch": -4, "leftKnee.bend": 8, "rightKnee.bend": 8, "leftShoulder.pitch": 26, "rightShoulder.pitch": 26 } },
    { t: .8, controls: { "body.offsetY": -.12, "leftHip.pitch": 24, "rightHip.pitch": 24, "leftKnee.bend": 40, "rightKnee.bend": 40, "leftShoulder.pitch": -4, "rightShoulder.pitch": -4 } },
    { t: 1, controls: { "body.offsetY": 0, "leftHip.pitch": 0, "rightHip.pitch": 0, "leftKnee.bend": 0, "rightKnee.bend": 0, "leftShoulder.pitch": 0, "rightShoulder.pitch": 0 } },
  ] },
  { id: "wave-cycle", label: "挥手打招呼", labelEn: "Wave hello", duration: 1.2, mixamoDuration: 4.73, robotExpressiveDuration: 1.83, mixamoAnimationUrl: mixamoAnimationUrl("wave.fbx"), keyframes: [
    { t: 0, controls: { "rightShoulder.pitch": 60, "rightShoulder.spread": 0, "rightShoulder.twist": 30, "rightElbow.bend": 90, "rightHand.roll": -30, "leftShoulder.pitch": -10, "leftElbow.bend": 18 } },
    { t: .5, controls: { "rightShoulder.pitch": 60, "rightShoulder.spread": 0, "rightShoulder.twist": 30, "rightElbow.bend": 60, "rightHand.roll": 10, "leftShoulder.pitch": -10, "leftElbow.bend": 18 } },
    { t: 1, controls: { "rightShoulder.pitch": 60, "rightShoulder.spread": 0, "rightShoulder.twist": 30, "rightElbow.bend": 90, "rightHand.roll": -30, "leftShoulder.pitch": -10, "leftElbow.bend": 18 } },
  ] },
];

export function getCharacterActionPreset(presetId: string | null | undefined) {
  return CHARACTER_ACTION_PRESETS.find((item) => item.id === presetId)
    ?? CHARACTER_SPECIFIC_ACTION_PRESETS.find((item) => item.id === presetId)
    ?? null;
}

const ACTION_NEUTRAL_CONTROL_KEYS = [
  ...HUMANOID_CONTROL_KEYS,
  "body.offsetY",
  "leftHand.roll",
  "rightHand.roll",
] as const;

function getNeutralActionControls(baseControls: Record<string, number>) {
  const controls = { ...baseControls };
  ACTION_NEUTRAL_CONTROL_KEYS.forEach((key) => {
    controls[key] = 0;
  });
  return controls;
}

export function sampleCharacterActionControls(presetId: string | null | undefined, elapsedSeconds: number, baseControls: Record<string, number> = {}) {
  const preset = getCharacterActionPreset(presetId);
  if (!preset?.keyframes.length) return baseControls;
  const progress = getCharacterActionPlaybackMode(presetId) === "once"
    ? Math.min(1, Math.max(0, elapsedSeconds / preset.duration))
    : (((elapsedSeconds % preset.duration) + preset.duration) % preset.duration) / preset.duration;
  let start = preset.keyframes[0];
  let end = preset.keyframes[preset.keyframes.length - 1];
  for (let index = 1; index < preset.keyframes.length; index += 1) {
    if (progress <= preset.keyframes[index].t) {
      start = preset.keyframes[index - 1];
      end = preset.keyframes[index];
      break;
    }
  }
  const blend = Math.min(1, Math.max(0, (progress - start.t) / Math.max(.0001, end.t - start.t)));
  // 内置动作是完整姿态。如果关键帧省略的关节继续沿用手动姿态值，
  // 可能会因模型差异产生扭曲结果。
  const controls = getNeutralActionControls(baseControls);
  new Set([...Object.keys(start.controls), ...Object.keys(end.controls)]).forEach((key) => {
    const from = start.controls[key] ?? 0;
    controls[key] = from + ((end.controls[key] ?? 0) - from) * blend;
  });
  return controls;
}
