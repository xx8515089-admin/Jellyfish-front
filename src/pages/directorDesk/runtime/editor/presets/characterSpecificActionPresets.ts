import type {
  CharacterBodyType,
  CharacterImportReadiness,
  CharacterRigType,
} from "../schema/directorProject";
import {
  getCharacterActionPreset,
  type CharacterActionPreset,
} from "./characterActionPresets";

export type CharacterActionProfile =
  | "natural"
  | "stylized"
  | "child"
  | "power"
  | "robot"
  | "skeletal"
  | "creature";

export interface CharacterActionContext {
  assetUrl?: string | null;
  assetName?: string | null;
  objectName?: string | null;
  bodyType?: CharacterBodyType | null;
  importReadiness?: CharacterImportReadiness | null;
  rigType?: CharacterRigType | null;
}

export const CHARACTER_ACTION_PROFILE_LABELS: Record<CharacterActionProfile, string> = {
  natural: "自然人形",
  stylized: "动漫角色",
  child: "儿童 / Q版",
  power: "力量型角色",
  robot: "机器人",
  skeletal: "骨骼角色",
  creature: "人形异形",
};

export const CHARACTER_ACTION_PROFILE_LABELS_ENGLISH: Record<CharacterActionProfile, string> = {
  natural: "Natural humanoid",
  stylized: "Stylized character",
  child: "Child / chibi",
  power: "Powerful character",
  robot: "Robot",
  skeletal: "Skeleton",
  creature: "Humanoid creature",
};

const characterSpecificActionPresets: Record<CharacterActionProfile, CharacterActionPreset[]> = {
  natural: [
    {
      id: "natural-breathing",
      label: "自然呼吸",
      labelEn: "Natural breathing",
      duration: 3.2,
      keyframes: [
        { t: 0, controls: { "body.offsetY": 0, "torso.pitch": 0, "leftShoulder.pitch": -3, "rightShoulder.pitch": -3, "leftElbow.bend": 9, "rightElbow.bend": 9 } },
        { t: 0.5, controls: { "body.offsetY": 0.02, "torso.pitch": -1.4, "leftShoulder.pitch": -5, "rightShoulder.pitch": -5, "leftElbow.bend": 12, "rightElbow.bend": 12 } },
        { t: 1, controls: { "body.offsetY": 0, "torso.pitch": 0, "leftShoulder.pitch": -3, "rightShoulder.pitch": -3, "leftElbow.bend": 9, "rightElbow.bend": 9 } },
      ],
    },
    {
      id: "natural-conversation",
      label: "自然交谈",
      labelEn: "Natural conversation",
      duration: 2.8,
      keyframes: [
        { t: 0, controls: { "body.yaw": -2, "torso.yaw": -4, "head.yaw": 7, "leftShoulder.pitch": -2, "rightShoulder.pitch": 12, "rightShoulder.spread": 5, "rightElbow.bend": 36, "leftElbow.bend": 10 } },
        { t: 0.5, controls: { "body.yaw": 2, "torso.yaw": 4, "head.yaw": -7, "leftShoulder.pitch": 1, "rightShoulder.pitch": 28, "rightShoulder.spread": 11, "rightElbow.bend": 56, "leftElbow.bend": 13 } },
        { t: 1, controls: { "body.yaw": -2, "torso.yaw": -4, "head.yaw": 7, "leftShoulder.pitch": -2, "rightShoulder.pitch": 12, "rightShoulder.spread": 5, "rightElbow.bend": 36, "leftElbow.bend": 10 } },
      ],
    },
  ],
  stylized: [
    {
      id: "stylized-ready",
      label: "动漫待机",
      labelEn: "Stylized idle",
      duration: 2.6,
      keyframes: [
        { t: 0, controls: { "body.roll": -1, "torso.yaw": -2, "head.roll": 1.5, "leftShoulder.pitch": -3, "rightShoulder.pitch": 2, "leftElbow.bend": 10, "rightElbow.bend": 9, "leftKnee.bend": 2 } },
        { t: 0.5, controls: { "body.roll": 1, "torso.yaw": 2, "head.roll": -1.5, "leftShoulder.pitch": 2, "rightShoulder.pitch": -3, "leftElbow.bend": 9, "rightElbow.bend": 10, "rightKnee.bend": 2 } },
        { t: 1, controls: { "body.roll": -1, "torso.yaw": -2, "head.roll": 1.5, "leftShoulder.pitch": -3, "rightShoulder.pitch": 2, "leftElbow.bend": 10, "rightElbow.bend": 9, "leftKnee.bend": 2 } },
      ],
    },
    {
      id: "stylized-greeting",
      label: "元气招手",
      labelEn: "Cheerful wave",
      duration: 1.8,
      keyframes: [
        { t: 0, controls: { "body.roll": -1.5, "head.roll": 2, "rightShoulder.pitch": 34, "rightShoulder.spread": 8, "rightShoulder.twist": 8, "rightElbow.bend": 64, "rightHand.roll": -10, "leftElbow.bend": 10 } },
        { t: 0.5, controls: { "body.roll": -1, "head.roll": 1, "rightShoulder.pitch": 40, "rightShoulder.spread": 12, "rightShoulder.twist": 8, "rightElbow.bend": 56, "rightHand.roll": 10, "leftElbow.bend": 10 } },
        { t: 1, controls: { "body.roll": -1.5, "head.roll": 2, "rightShoulder.pitch": 34, "rightShoulder.spread": 8, "rightShoulder.twist": 8, "rightElbow.bend": 64, "rightHand.roll": -10, "leftElbow.bend": 10 } },
      ],
    },
  ],
  child: [
    {
      id: "child-curious",
      label: "好奇张望",
      labelEn: "Curious look around",
      duration: 3,
      keyframes: [
        { t: 0, controls: { "head.yaw": -10, "head.roll": -2, "torso.yaw": -1.5, "leftElbow.bend": 10, "rightElbow.bend": 10, "leftKnee.bend": 2 } },
        { t: 0.5, controls: { "head.yaw": 10, "head.roll": 2, "torso.yaw": 1.5, "leftElbow.bend": 10, "rightElbow.bend": 10, "rightKnee.bend": 2 } },
        { t: 1, controls: { "head.yaw": -10, "head.roll": -2, "torso.yaw": -1.5, "leftElbow.bend": 10, "rightElbow.bend": 10, "leftKnee.bend": 2 } },
      ],
    },
    {
      id: "child-cheer",
      label: "开心欢呼",
      labelEn: "Happy cheer",
      duration: 1.6,
      keyframes: [
        { t: 0, controls: { "body.offsetY": 0, "leftShoulder.pitch": 24, "rightShoulder.pitch": 24, "leftShoulder.spread": 7, "rightShoulder.spread": 7, "leftElbow.bend": 24, "rightElbow.bend": 24, "leftKnee.bend": 3, "rightKnee.bend": 3 } },
        { t: 0.5, controls: { "body.offsetY": 0.012, "torso.pitch": -1.5, "leftShoulder.pitch": 38, "rightShoulder.pitch": 38, "leftShoulder.spread": 11, "rightShoulder.spread": 11, "leftElbow.bend": 32, "rightElbow.bend": 32, "leftKnee.bend": 5, "rightKnee.bend": 5 } },
        { t: 1, controls: { "body.offsetY": 0, "leftShoulder.pitch": 24, "rightShoulder.pitch": 24, "leftShoulder.spread": 7, "rightShoulder.spread": 7, "leftElbow.bend": 24, "rightElbow.bend": 24, "leftKnee.bend": 3, "rightKnee.bend": 3 } },
      ],
    },
  ],
  power: [
    {
      id: "power-guard",
      label: "沉稳警戒",
      labelEn: "Steady guard",
      duration: 2.8,
      keyframes: [
        { t: 0, controls: { "body.pitch": 1.5, "torso.yaw": -2, "head.yaw": 4, "leftShoulder.spread": 5, "rightShoulder.spread": 5, "leftElbow.bend": 18, "rightElbow.bend": 18, "leftHip.spread": -2, "rightHip.spread": 2, "leftKnee.bend": 4, "rightKnee.bend": 4 } },
        { t: 0.5, controls: { "body.pitch": 2, "torso.yaw": 2, "head.yaw": -4, "leftShoulder.spread": 7, "rightShoulder.spread": 7, "leftElbow.bend": 22, "rightElbow.bend": 22, "leftHip.spread": -2, "rightHip.spread": 2, "leftKnee.bend": 5, "rightKnee.bend": 5 } },
        { t: 1, controls: { "body.pitch": 1.5, "torso.yaw": -2, "head.yaw": 4, "leftShoulder.spread": 5, "rightShoulder.spread": 5, "leftElbow.bend": 18, "rightElbow.bend": 18, "leftHip.spread": -2, "rightHip.spread": 2, "leftKnee.bend": 4, "rightKnee.bend": 4 } },
      ],
    },
    {
      id: "power-flex",
      label: "力量展示",
      labelEn: "Power pose",
      duration: 2.4,
      keyframes: [
        { t: 0, controls: { "torso.pitch": 0, "leftShoulder.pitch": 12, "rightShoulder.pitch": 12, "leftShoulder.spread": 12, "rightShoulder.spread": 12, "leftElbow.bend": 38, "rightElbow.bend": 38 } },
        { t: 0.5, controls: { "torso.pitch": -2, "leftShoulder.pitch": 20, "rightShoulder.pitch": 20, "leftShoulder.spread": 20, "rightShoulder.spread": 20, "leftElbow.bend": 56, "rightElbow.bend": 56 } },
        { t: 1, controls: { "torso.pitch": 0, "leftShoulder.pitch": 12, "rightShoulder.pitch": 12, "leftShoulder.spread": 12, "rightShoulder.spread": 12, "leftElbow.bend": 38, "rightElbow.bend": 38 } },
      ],
    },
  ],
  robot: [
    {
      id: "robot-scan",
      label: "摇头拒绝",
      labelEn: "Shake head",
      duration: 3.2,
      robotExpressiveDuration: 1.67,
      keyframes: [
        { t: 0, controls: { "head.yaw": -16, "torso.yaw": -4, "leftShoulder.pitch": 0, "rightShoulder.pitch": 10, "leftElbow.bend": 8, "rightElbow.bend": 34 } },
        { t: 0.45, controls: { "head.yaw": 0, "torso.yaw": 0, "leftShoulder.pitch": 0, "rightShoulder.pitch": 14, "leftElbow.bend": 8, "rightElbow.bend": 42 } },
        { t: 0.55, controls: { "head.yaw": 0, "torso.yaw": 0, "leftShoulder.pitch": 0, "rightShoulder.pitch": 14, "leftElbow.bend": 8, "rightElbow.bend": 42 } },
        { t: 1, controls: { "head.yaw": 16, "torso.yaw": 4, "leftShoulder.pitch": 0, "rightShoulder.pitch": 10, "leftElbow.bend": 8, "rightElbow.bend": 34 } },
      ],
    },
    {
      id: "robot-guard",
      label: "机械待机",
      labelEn: "Robot idle",
      duration: 2.2,
      robotExpressiveDuration: 3.33,
      keyframes: [
        { t: 0, controls: { "body.pitch": 2, "head.yaw": -7, "leftShoulder.pitch": 13, "rightShoulder.pitch": 13, "leftShoulder.spread": 8, "rightShoulder.spread": 8, "leftElbow.bend": 28, "rightElbow.bend": 28, "leftKnee.bend": 4, "rightKnee.bend": 4 } },
        { t: 0.5, controls: { "body.pitch": 3, "head.yaw": 7, "leftShoulder.pitch": 17, "rightShoulder.pitch": 17, "leftShoulder.spread": 10, "rightShoulder.spread": 10, "leftElbow.bend": 34, "rightElbow.bend": 34, "leftKnee.bend": 6, "rightKnee.bend": 6 } },
        { t: 1, controls: { "body.pitch": 2, "head.yaw": -7, "leftShoulder.pitch": 13, "rightShoulder.pitch": 13, "leftShoulder.spread": 8, "rightShoulder.spread": 8, "leftElbow.bend": 28, "rightElbow.bend": 28, "leftKnee.bend": 4, "rightKnee.bend": 4 } },
      ],
    },
    {
      id: "robot-approve",
      label: "点赞确认",
      labelEn: "Thumbs up",
      duration: 1.6,
      robotExpressiveDuration: 1.58,
      keyframes: [
        { t: 0, controls: { "head.roll": 0, "rightShoulder.pitch": 18, "rightShoulder.spread": 8, "rightElbow.bend": 38, "rightHand.roll": 0 } },
        { t: 0.45, controls: { "head.roll": -5, "rightShoulder.pitch": 48, "rightShoulder.spread": 12, "rightElbow.bend": 76, "rightHand.roll": -18 } },
        { t: 0.8, controls: { "head.roll": -5, "rightShoulder.pitch": 48, "rightShoulder.spread": 12, "rightElbow.bend": 76, "rightHand.roll": -18 } },
        { t: 1, controls: { "head.roll": 0, "rightShoulder.pitch": 18, "rightShoulder.spread": 8, "rightElbow.bend": 38, "rightHand.roll": 0 } },
      ],
    },
    {
      id: "robot-punch",
      label: "机械出拳",
      labelEn: "Robot punch",
      duration: 1.1,
      robotExpressiveDuration: 0.83,
      keyframes: [
        { t: 0, controls: { "body.yaw": 0, "torso.yaw": 0, "rightShoulder.pitch": 8, "rightElbow.bend": 72, "leftElbow.bend": 42 } },
        { t: 0.3, controls: { "body.yaw": -5, "torso.yaw": -8, "rightShoulder.pitch": 22, "rightElbow.bend": 92, "leftElbow.bend": 52 } },
        { t: 0.55, controls: { "body.yaw": 8, "torso.yaw": 12, "rightShoulder.pitch": 72, "rightElbow.bend": 8, "leftElbow.bend": 58 } },
        { t: 1, controls: { "body.yaw": 0, "torso.yaw": 0, "rightShoulder.pitch": 8, "rightElbow.bend": 72, "leftElbow.bend": 42 } },
      ],
    },
    {
      id: "robot-dance",
      label: "机械舞步",
      labelEn: "Robot dance",
      duration: 3.3,
      robotExpressiveDuration: 3.33,
      keyframes: [
        { t: 0, controls: { "body.roll": -4, "torso.yaw": -7, "head.roll": 4, "leftShoulder.pitch": 22, "rightShoulder.pitch": -12, "leftElbow.bend": 38, "rightElbow.bend": 24, "leftKnee.bend": 8 } },
        { t: 0.5, controls: { "body.roll": 4, "torso.yaw": 7, "head.roll": -4, "leftShoulder.pitch": -12, "rightShoulder.pitch": 22, "leftElbow.bend": 24, "rightElbow.bend": 38, "rightKnee.bend": 8 } },
        { t: 1, controls: { "body.roll": -4, "torso.yaw": -7, "head.roll": 4, "leftShoulder.pitch": 22, "rightShoulder.pitch": -12, "leftElbow.bend": 38, "rightElbow.bend": 24, "leftKnee.bend": 8 } },
      ],
    },
  ],
  skeletal: [
    {
      id: "skeletal-idle",
      label: "骨骼待机",
      labelEn: "Skeleton idle",
      duration: 3,
      keyframes: [
        { t: 0, controls: { "body.roll": -0.8, "torso.yaw": -1.5, "head.yaw": 2, "leftElbow.bend": 6, "rightElbow.bend": 6, "leftKnee.bend": 2 } },
        { t: 0.5, controls: { "body.roll": 0.8, "torso.yaw": 1.5, "head.yaw": -2, "leftElbow.bend": 7, "rightElbow.bend": 7, "rightKnee.bend": 2 } },
        { t: 1, controls: { "body.roll": -0.8, "torso.yaw": -1.5, "head.yaw": 2, "leftElbow.bend": 6, "rightElbow.bend": 6, "leftKnee.bend": 2 } },
      ],
    },
    {
      id: "skeletal-look",
      label: "谨慎观察",
      labelEn: "Cautious look",
      duration: 3.2,
      keyframes: [
        { t: 0, controls: { "torso.yaw": -3, "head.yaw": -12, "leftShoulder.spread": 2, "rightShoulder.spread": 2, "leftElbow.bend": 8, "rightElbow.bend": 8 } },
        { t: 0.5, controls: { "torso.yaw": 3, "head.yaw": 12, "leftShoulder.spread": 3, "rightShoulder.spread": 3, "leftElbow.bend": 8, "rightElbow.bend": 8 } },
        { t: 1, controls: { "torso.yaw": -3, "head.yaw": -12, "leftShoulder.spread": 2, "rightShoulder.spread": 2, "leftElbow.bend": 8, "rightElbow.bend": 8 } },
      ],
    },
  ],
  creature: [
    {
      id: "creature-prowl",
      label: "低伏警戒",
      labelEn: "Low guard",
      duration: 2.6,
      keyframes: [
        { t: 0, controls: { "body.offsetY": -0.01, "body.pitch": 2.5, "torso.pitch": 2, "head.pitch": -1.5, "head.yaw": -7, "leftShoulder.pitch": 5, "rightShoulder.pitch": 5, "leftElbow.bend": 18, "rightElbow.bend": 18, "leftKnee.bend": 6, "rightKnee.bend": 6 } },
        { t: 0.5, controls: { "body.offsetY": -0.02, "body.pitch": 4, "torso.pitch": 3, "head.pitch": -2, "head.yaw": 7, "leftShoulder.pitch": 7, "rightShoulder.pitch": 7, "leftElbow.bend": 22, "rightElbow.bend": 22, "leftKnee.bend": 9, "rightKnee.bend": 9 } },
        { t: 1, controls: { "body.offsetY": -0.01, "body.pitch": 2.5, "torso.pitch": 2, "head.pitch": -1.5, "head.yaw": -7, "leftShoulder.pitch": 5, "rightShoulder.pitch": 5, "leftElbow.bend": 18, "rightElbow.bend": 18, "leftKnee.bend": 6, "rightKnee.bend": 6 } },
      ],
    },
    {
      id: "creature-alert",
      label: "危险环顾",
      labelEn: "Alert look around",
      duration: 3,
      keyframes: [
        { t: 0, controls: { "body.pitch": 2, "torso.yaw": -3, "head.yaw": -10, "head.roll": -1.5, "leftShoulder.spread": 5, "rightShoulder.spread": 5, "leftElbow.bend": 16, "rightElbow.bend": 16, "leftKnee.bend": 4, "rightKnee.bend": 4 } },
        { t: 0.5, controls: { "body.pitch": 2, "torso.yaw": 3, "head.yaw": 10, "head.roll": 1.5, "leftShoulder.spread": 7, "rightShoulder.spread": 7, "leftElbow.bend": 19, "rightElbow.bend": 19, "leftKnee.bend": 5, "rightKnee.bend": 5 } },
        { t: 1, controls: { "body.pitch": 2, "torso.yaw": -3, "head.yaw": -10, "head.roll": -1.5, "leftShoulder.spread": 5, "rightShoulder.spread": 5, "leftElbow.bend": 16, "rightElbow.bend": 16, "leftKnee.bend": 4, "rightKnee.bend": 4 } },
      ],
    },
  ],
};

function includesAny(value: string, terms: readonly string[]) {
  return terms.some((term) => value.includes(term));
}

const profileByModelFileName: Record<string, CharacterActionProfile> = {
  "0024_anime-basic-male-a.fbx": "stylized",
  "0025_anime-basic-female-a.fbx": "stylized",
  "0026_anime-tall-female-a.fbx": "stylized",
  "0029_male-bot-a.fbx": "robot",
  "0030_female-bot-a.fbx": "robot",
  "0036_werewolf.fbx": "creature",
  "0038_male-skeleton.fbx": "skeletal",
  "0039_anime-female.fbx": "stylized",
  "0040_muscular-male.fbx": "power",
  "0041_teen-fit-female.fbx": "natural",
  "0042_teen-fit-male.fbx": "natural",
  "0043_heavy-male.fbx": "power",
  "0044_muscular-female.fbx": "power",
  "0045_stocky-female.fbx": "power",
  "0046_stocky-male.fbx": "power",
  "0047_skinny-female.fbx": "natural",
  "0048_realistic-female.fbx": "natural",
  "0049_skinny-male.fbx": "natural",
  "0050_anime-child-girl.fbx": "child",
  "0051_anime-child-boy.fbx": "child",
  "0053_anime-curvy-female.fbx": "stylized",
  "0054_anime-male.fbx": "stylized",
  "0055_basic-female.fbx": "natural",
  "0056_tall-female.fbx": "natural",
  "0057_tall-male.fbx": "natural",
  "0058_skeleton.fbx": "skeletal",
  "0059_male-base.fbx": "natural",
  "0060_female-base.fbx": "natural",
  "0061_chibi-male.fbx": "child",
  "0062_alien-zombie.fbx": "creature",
  "0063_male-frame-mannequin.fbx": "natural",
  "0064_blocky-bot.fbx": "robot",
  "0068_stylized-fit-male.fbx": "power",
  "robot-expressive.glb": "robot",
};

const COMMON_ACTION_IDS = new Set([
  "walk-cycle",
  "run-cycle",
  "crouch-cycle",
  "side-step-left",
  "jump-cycle",
  "wave-cycle",
]);

const ROBOT_EXPRESSIVE_NATIVE_SPECIFIC_ACTION_IDS = new Set([
  "robot-scan",
  "robot-guard",
  "robot-approve",
  "robot-punch",
  "robot-dance",
]);

const compatibleCommonActionIds: Record<CharacterActionProfile, ReadonlySet<string>> = {
  natural: COMMON_ACTION_IDS,
  stylized: COMMON_ACTION_IDS,
  child: new Set(["walk-cycle", "run-cycle", "jump-cycle", "wave-cycle"]),
  power: new Set(["walk-cycle", "run-cycle", "crouch-cycle", "side-step-left", "wave-cycle"]),
  robot: new Set(["walk-cycle", "run-cycle", "side-step-left", "wave-cycle"]),
  skeletal: new Set(["walk-cycle", "run-cycle", "side-step-left", "wave-cycle"]),
  creature: new Set(["walk-cycle", "run-cycle"]),
};

// 外部骨架必须通过动作审计后才能暴露预设。跳跃动画在当前本地模型上会造成
// 大范围关节翻转；骷髅的挥手动画也超过骨骼方向误差阈值。
const unsafeExternalActionIds = new Set(["jump-cycle"]);
const blockedExternalActionIdsByModelFileName: Readonly<Record<string, ReadonlySet<string>>> = {
  "0058_skeleton.fbx": new Set(["wave-cycle"]),
};

function getModelFileName(context: CharacterActionContext) {
  const source = `${context.assetUrl ?? ""} ${context.assetName ?? ""}`.toLocaleLowerCase();
  return Object.keys(profileByModelFileName).find((fileName) => source.includes(fileName)) ?? null;
}

function isRobotExpressiveCharacter(context: CharacterActionContext) {
  return /robot-expressive\.glb(?:$|[?#\s])/i.test(`${context.assetUrl ?? ""} ${context.assetName ?? ""}`);
}

/**
 * 旧项目没有保存 characterImportReadiness。这里依据已落盘的骨架类型恢复兼容性，
 * 但仍尊重模型库对特殊模型给出的显式限制。
 */
export function resolveCharacterImportReadiness(
  context: CharacterActionContext,
): CharacterImportReadiness {
  if (context.importReadiness) return context.importReadiness;
  if (!context.assetUrl) return "ready";
  if (
    context.rigType === "mixamo"
    || context.rigType === "mannequin"
    || context.rigType === "ue4-mannequin"
  ) {
    return "ready";
  }
  return "manual-mapping";
}

function hasVerifiedActionMapping(context: CharacterActionContext) {
  return resolveCharacterImportReadiness(context) === "ready";
}

function canUseProgrammaticActionControls(context: CharacterActionContext) {
  return !context.assetUrl
    || context.rigType === "mannequin"
    || context.rigType === "ue4-mannequin";
}

function isCompatibleSpecificAction(context: CharacterActionContext, actionPresetId: string) {
  if (!hasVerifiedActionMapping(context)) return false;
  if (canUseProgrammaticActionControls(context)) return true;
  return isRobotExpressiveCharacter(context)
    && ROBOT_EXPRESSIVE_NATIVE_SPECIFIC_ACTION_IDS.has(actionPresetId);
}

function isCompatibleCommonAction(context: CharacterActionContext, actionPresetId: string) {
  if (!hasVerifiedActionMapping(context)) return false;
  if (!compatibleCommonActionIds[getCharacterActionProfile(context)].has(actionPresetId)) return false;
  if (canUseProgrammaticActionControls(context) || isRobotExpressiveCharacter(context)) return true;
  if (unsafeExternalActionIds.has(actionPresetId)) return false;
  const modelFileName = getModelFileName(context);
  if (modelFileName && blockedExternalActionIdsByModelFileName[modelFileName]?.has(actionPresetId)) {
    return false;
  }
  return Boolean(getCharacterActionPreset(actionPresetId)?.mixamoAnimationUrl);
}

export function getCharacterActionProfile(context: CharacterActionContext): CharacterActionProfile {
  const modelFileName = getModelFileName(context);
  if (modelFileName) return profileByModelFileName[modelFileName];

  const searchable = [context.assetUrl, context.assetName, context.objectName]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  if (context.bodyType === "child" || context.bodyType === "chibi"
    || includesAny(searchable, ["child", "chibi", "kid", "儿童", "女孩", "男孩", "q版"])) {
    return "child";
  }
  if (includesAny(searchable, ["robot", "bot", "blocky", "机器人", "机械人"])) return "robot";
  if (includesAny(searchable, ["skeleton", "骷髅", "骨骼"])) return "skeletal";
  if (includesAny(searchable, ["werewolf", "alien-zombie", "狼人", "异形", "僵尸"])) return "creature";
  if (context.bodyType === "broad" || context.bodyType === "muscular"
    || includesAny(searchable, ["muscular", "heavy", "stocky", "fit-male", "肌肉", "健壮", "高壮", "壮实"])) {
    return "power";
  }
  if (includesAny(searchable, ["anime", "stylized", "curvy", "tall-", "basic-female", "动漫", "风格化"])) {
    return "stylized";
  }
  return "natural";
}

export function getCharacterSpecificActionPresets(context: CharacterActionContext) {
  return characterSpecificActionPresets[getCharacterActionProfile(context)]
    .filter((preset) => isCompatibleSpecificAction(context, preset.id));
}

export function getCompatibleCharacterCommonActionPresets(
  context: CharacterActionContext,
  presets: readonly CharacterActionPreset[],
) {
  return presets.filter((preset) => isCompatibleCommonAction(context, preset.id));
}

export function resolveCompatibleCharacterActionPresetId(
  context: CharacterActionContext,
  actionPresetId: string | null | undefined,
) {
  if (!actionPresetId) return null;
  const isBuiltInSpecificAction = CHARACTER_SPECIFIC_ACTION_PRESETS.some((preset) => preset.id === actionPresetId);
  if (!COMMON_ACTION_IDS.has(actionPresetId) && !isBuiltInSpecificAction) return actionPresetId;
  if (!hasVerifiedActionMapping(context)) return null;
  if (COMMON_ACTION_IDS.has(actionPresetId)) {
    return isCompatibleCommonAction(context, actionPresetId) ? actionPresetId : null;
  }
  return getCharacterSpecificActionPresets(context).some((preset) => preset.id === actionPresetId)
    ? actionPresetId
    : null;
}

export const CHARACTER_SPECIFIC_ACTION_PRESETS = Object.values(characterSpecificActionPresets).flat();
