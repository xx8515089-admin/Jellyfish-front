/* eslint-disable react/no-unknown-property -- React Three Fiber 使用 Three.js 对象属性扩展了 JSX。 */
import { useFrame, useLoader } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  AnimationMixer,
  Box3,
  Euler,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Quaternion,
  Vector3,
  type AnimationClip,
  type Group,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton, retargetClip } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  getCharacterActionPreset,
  sampleCharacterActionControls,
} from "../presets/characterActionPresets";
import type { CharacterRigState, DirectorModelFormat } from "../schema/directorProject";
import type { DirectorCharacterBoneMap, DirectorCharacterBonePart } from "../schema/semanticBody";
import { getSemanticBodyPartForBoneName } from "./semanticBodyTracking";
import { getRuntimePlaybackProgress } from "./playbackRuntime";
import { VIEWPORT_OBJECT_LABEL_VERTICAL_GAP } from "../schema/viewportLabels";
import { disposeIsolatedModelMaterials, isolateAndTintModelMaterials } from "./modelMaterialTint";
import {
  getCharacterActionPlaybackMode,
  shouldUseProceduralBuiltInAction,
  type CharacterActionPlaybackMode,
} from "./characterActionPlaybackPolicy";
import { getCharacterRuntimeActionSample, type CharacterRuntimeMotion } from "./characterRuntimeMotion";

interface MixamoCharacterModelProps {
  url: string;
  format?: DirectorModelFormat;
  externalAnimation?: ExternalCharacterAnimation | null;
  orientationCorrection?: [number, number, number];
  rigState?: CharacterRigState;
  actionPresetId?: string | null;
  animationTimeSeconds?: number;
  onLabelAnchorYChange?: (anchorY: number) => void;
  runtimeMotion?: CharacterRuntimeMotion;
  boneMap?: DirectorCharacterBoneMap;
  color?: string;
}

export interface ExternalCharacterAnimation {
  url: string;
  format: "fbx" | "glb";
  clipName: string;
}

const DEFAULT_ORIENTATION_CORRECTION: [number, number, number] = [0, 0, 0];

type RestTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
};

export type CharacterRestPose = ReadonlyMap<string, RestTransform>;
export type MixamoRetargetMode = "direct" | "local-rest" | "skeleton";

export type NativeActionClipNames = Partial<Record<string, string>>;

export function getCanonicalHumanoidBoneName(name: string) {
  return name.replace(/:/g, "").replace(/^mixamorig1/i, "mixamorig");
}

const XBOT_NATIVE_ACTION_CLIPS: NativeActionClipNames = {
  "crouch-cycle": "sneak_pose",
  "jump-cycle": "idle",
  "run-cycle": "run",
  "side-step-left": "walk",
  "walk-cycle": "walk",
  "wave-cycle": "agree",
};

export const SOLDIER_NATIVE_ACTION_CLIPS: NativeActionClipNames = {
  "crouch-cycle": "idle",
  "jump-cycle": "idle",
  "run-cycle": "run",
  "side-step-left": "walk",
  "walk-cycle": "walk",
  "wave-cycle": "idle",
};

export const ROBOT_EXPRESSIVE_ACTION_CLIPS: NativeActionClipNames = {
  "crouch-cycle": "sitting",
  "jump-cycle": "jump",
  "robot-approve": "thumbsup",
  "robot-dance": "dance",
  "robot-guard": "idle",
  "robot-punch": "punch",
  "robot-scan": "no",
  "run-cycle": "running",
  "side-step-left": "walking",
  "walk-cycle": "walking",
  "wave-cycle": "wave",
};

export function getNativeMixamoActionClip(
  actionPresetId: string | null | undefined,
  clips: AnimationClip[],
  clipNames: NativeActionClipNames = XBOT_NATIVE_ACTION_CLIPS
) {
  const clipName = actionPresetId ? clipNames[actionPresetId] : undefined;
  return clipName ? clips.find((clip) => clip.name.toLowerCase() === clipName) ?? null : null;
}

export function getFallbackMixamoAnimationUrl(
  actionPresetId: string | null | undefined,
  nativeClip: AnimationClip | null,
  allowExternalAnimations = true
) {
  if (nativeClip || !allowExternalAnimations) return null;
  return getCharacterActionPreset(actionPresetId)?.mixamoAnimationUrl ?? null;
}

const BONE_MAP = {
  body: "mixamorig:Hips",
  torso: "mixamorig:Spine2",
  head: "mixamorig:Head",
  leftShoulder: "mixamorig:LeftArm",
  rightShoulder: "mixamorig:RightArm",
  leftElbow: "mixamorig:LeftForeArm",
  rightElbow: "mixamorig:RightForeArm",
  leftHand: "mixamorig:LeftHand",
  rightHand: "mixamorig:RightHand",
  leftHip: "mixamorig:LeftUpLeg",
  rightHip: "mixamorig:RightUpLeg",
  leftKnee: "mixamorig:LeftLeg",
  rightKnee: "mixamorig:RightLeg",
} as const;

type ProceduralJoint = keyof typeof BONE_MAP;

const SEMANTIC_BODY_PART_TO_JOINT: Partial<Record<DirectorCharacterBonePart, ProceduralJoint>> = {
  waist: "body",
  chest: "torso",
  head: "head",
  leftUpperArm: "leftShoulder",
  leftForearm: "leftElbow",
  leftHand: "leftHand",
  rightUpperArm: "rightShoulder",
  rightForearm: "rightElbow",
  rightHand: "rightHand",
  leftThigh: "leftHip",
  leftCalf: "leftKnee",
  rightThigh: "rightHip",
  rightCalf: "rightKnee",
};

function degrees(value: number) {
  return value * Math.PI / 180;
}

export function captureCharacterRestPose(scene: Object3D): CharacterRestPose {
  const restPose = new Map<string, RestTransform>();
  scene.traverse((object) => {
    restPose.set(object.uuid, {
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
    });
  });
  return restPose;
}

export function applyCharacterRestPose(scene: Object3D, restPose: CharacterRestPose) {
  scene.traverse((object) => {
    const rest = restPose.get(object.uuid);
    if (!rest) return;
    object.position.fromArray(rest.position);
    object.quaternion.fromArray(rest.quaternion);
    object.scale.fromArray(rest.scale);
  });
  scene.updateMatrixWorld(true);
}

function getRestTransform(object: Object3D, restPose?: CharacterRestPose) {
  return restPose?.get(object.uuid) ?? {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
    scale: object.scale.toArray(),
  };
}

function getRestWorldMatrix(object: Object3D, restPose?: CharacterRestPose) {
  const hierarchy: Object3D[] = [];
  let current: Object3D | null = object;
  while (current) {
    hierarchy.unshift(current);
    current = current.parent;
  }

  return hierarchy.reduce((worldMatrix, node) => {
    const rest = getRestTransform(node, restPose);
    const localMatrix = new Matrix4().compose(
      new Vector3().fromArray(rest.position),
      new Quaternion().fromArray(rest.quaternion),
      new Vector3().fromArray(rest.scale)
    );
    return worldMatrix.multiply(localMatrix);
  }, new Matrix4());
}

function getRestWorldPosition(object: Object3D, restPose?: CharacterRestPose) {
  return new Vector3().setFromMatrixPosition(getRestWorldMatrix(object, restPose));
}

function findPrimarySkinnedMesh(scene: Object3D) {
  let primary: SkinnedMesh | null = null;
  scene.traverse((object) => {
    if (!("isSkinnedMesh" in object) || object.isSkinnedMesh !== true) return;
    const skinnedMesh = object as SkinnedMesh;
    if (!primary || skinnedMesh.skeleton.bones.length > primary.skeleton.bones.length) primary = skinnedMesh;
  });
  return primary as SkinnedMesh | null;
}

function prepareSkinnedMixamoAnimationClip(
  sourceClip: AnimationClip,
  scene: Object3D,
  sourceScene: Object3D,
  targetRestPose?: CharacterRestPose
) {
  const targetMesh = findPrimarySkinnedMesh(scene);
  const sourceMesh = findPrimarySkinnedMesh(sourceScene);
  if (!targetMesh || !sourceMesh) return null;

  const sourceBonesByNormalizedName = new Map(
    sourceMesh.skeleton.bones.map((bone) => [getCanonicalHumanoidBoneName(bone.name), bone])
  );
  const sourceHips = sourceMesh.skeleton.bones.find((bone) => getCanonicalHumanoidBoneName(bone.name).endsWith("mixamorigHips"));
  const targetHips = targetMesh.skeleton.bones.find((bone) => getCanonicalHumanoidBoneName(bone.name).endsWith("mixamorigHips"));
  if (!sourceHips || !targetHips) return null;
  const targetHipsRestPosition = new Vector3().fromArray(getRestTransform(targetHips, targetRestPose).position);

  sourceMesh.skeleton.pose();
  targetMesh.skeleton.pose();
  sourceScene.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  const sourceHipsHeight = Math.max(0.0001, Math.abs(sourceHips.getWorldPosition(new Vector3()).y));
  const hipsScale = Math.abs(targetHips.getWorldPosition(new Vector3()).y) / sourceHipsHeight;

  const clip = retargetClip(targetMesh, sourceMesh, sourceClip, {
    fps: 30,
    getBoneName: (targetBone) => sourceBonesByNormalizedName.get(getCanonicalHumanoidBoneName(targetBone.name))?.name ?? targetBone.name,
    hip: sourceHips.name,
    hipInfluence: new Vector3(0, 1, 0),
    preserveBoneMatrix: true,
    scale: hipsScale,
    useFirstFramePosition: false,
  });

  for (const track of clip.tracks) {
    const match = track.name.match(/^\.bones\[(.+)]\.(position|quaternion)$/);
    if (match) track.name = `${match[1]}.${match[2]}`;
    if (track.name === `${targetHips.name}.position` && track.getValueSize() === 3) {
      for (let index = 0; index < track.values.length; index += 3) {
        targetHipsRestPosition.toArray(track.values, index);
      }
    }
  }
  sourceMesh.skeleton.pose();
  targetMesh.skeleton.pose();
  sourceScene.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  return clip;
}

export function prepareMixamoAnimationClip(
  sourceClip: AnimationClip,
  scene: Object3D,
  sourceScene?: Object3D,
  retargetMode: MixamoRetargetMode = "direct",
  targetRestPose?: CharacterRestPose,
  sourceRestPose?: CharacterRestPose,
  targetBoneMap?: DirectorCharacterBoneMap
) {
  if (sourceScene && retargetMode === "skeleton") {
    const skinnedClip = prepareSkinnedMixamoAnimationClip(sourceClip, scene, sourceScene, targetRestPose);
    if (skinnedClip) return skinnedClip;
  }

  const clip = sourceClip.clone();
  const objectsByNormalizedName = new Map<string, Object3D>();
  const sourceObjectsByNormalizedName = new Map<string, Object3D>();
  scene.traverse((object) => {
    const normalizedName = getCanonicalHumanoidBoneName(object.name);
    if (normalizedName && !objectsByNormalizedName.has(normalizedName)) {
      objectsByNormalizedName.set(normalizedName, object);
    }
  });
  sourceScene?.traverse((object) => {
    const normalizedName = getCanonicalHumanoidBoneName(object.name);
    if (normalizedName && !sourceObjectsByNormalizedName.has(normalizedName)) {
      sourceObjectsByNormalizedName.set(normalizedName, object);
    }
  });
  clip.tracks.forEach((track) => {
    const propertySeparator = track.name.lastIndexOf(".");
    if (propertySeparator < 0) return;
    const sourceNodeName = track.name.slice(0, propertySeparator);
    const normalizedSourceNodeName = getCanonicalHumanoidBoneName(sourceNodeName);
    const semanticBodyPart = getSemanticBodyPartForBoneName(sourceNodeName);
    const mappedTargetName = semanticBodyPart ? targetBoneMap?.[semanticBodyPart] : undefined;
    const mappedTargetNode = mappedTargetName ? scene.getObjectByName(mappedTargetName) : null;
    const targetNode = mappedTargetNode
      ?? scene.getObjectByName(sourceNodeName)
      ?? objectsByNormalizedName.get(normalizedSourceNodeName);
    if (!targetNode) return;

    if (
      track.name.endsWith(".quaternion")
      && track.getValueSize() === 4
      && sourceScene
      && (retargetMode === "local-rest" || retargetMode === "skeleton")
    ) {
      const sourceNode = sourceScene.getObjectByName(sourceNodeName)
        ?? sourceObjectsByNormalizedName.get(normalizedSourceNodeName);
      if (sourceNode) {
        const targetRestQuaternion = new Quaternion().fromArray(getRestTransform(targetNode, targetRestPose).quaternion);
        const sourceRestQuaternion = new Quaternion().fromArray(getRestTransform(sourceNode, sourceRestPose).quaternion);
        const restOffset = targetRestQuaternion.multiply(sourceRestQuaternion.invert());
        const sourceRotation = new Quaternion();
        for (let index = 0; index < track.values.length; index += 4) {
          sourceRotation.fromArray(track.values, index);
          restOffset.clone().multiply(sourceRotation).normalize().toArray(track.values, index);
        }
      }
    }

    if (targetNode.name !== sourceNodeName) {
      track.name = `${targetNode.name}${track.name.slice(propertySeparator)}`;
    }
  });
  const hipsTrack = clip.tracks.find((track) => {
    const [nodeName, propertyName] = track.name.split(".");
    return propertyName === "position" && getCanonicalHumanoidBoneName(nodeName).endsWith("mixamorigHips");
  });
  if (!hipsTrack || hipsTrack.getValueSize() !== 3) return clip;

  const nodeName = hipsTrack.name.slice(0, hipsTrack.name.lastIndexOf("."));
  const targetHips = scene.getObjectByName(nodeName)
    ?? objectsByNormalizedName.get(getCanonicalHumanoidBoneName(nodeName));
  if (!targetHips || hipsTrack.values.length < 3) return clip;

  const sourceBaseY = hipsTrack.values[1];
  const sourceHips = sourceScene
    ? sourceScene.getObjectByName(nodeName)
      ?? sourceObjectsByNormalizedName.get(getCanonicalHumanoidBoneName(nodeName))
    : null;
  const sourceHipsWorldHeight = sourceHips
    ? Math.max(0.0001, Math.abs(getRestWorldPosition(sourceHips, sourceRestPose).y))
    : Math.max(0.0001, Math.abs(sourceBaseY));
  const targetHipsWorldHeight = Math.max(0.0001, Math.abs(getRestWorldPosition(targetHips, targetRestPose).y));
  const worldHeightScale = sourceScene ? targetHipsWorldHeight / sourceHipsWorldHeight : 1;
  const targetBasePosition = new Vector3().fromArray(getRestTransform(targetHips, targetRestPose).position);
  const parentWorldInverse = targetHips.parent
    ? getRestWorldMatrix(targetHips.parent, targetRestPose).invert()
    : null;
  const localOrigin = parentWorldInverse
    ? new Vector3().applyMatrix4(parentWorldInverse)
    : new Vector3();
  for (let index = 0; index < hipsTrack.values.length; index += 3) {
    const worldVerticalDelta = new Vector3(
      0,
      retargetMode === "skeleton"
        ? 0
        : (hipsTrack.values[index + 1] - sourceBaseY) * worldHeightScale,
      0
    );
    const localDelta = parentWorldInverse
      ? worldVerticalDelta.applyMatrix4(parentWorldInverse).sub(localOrigin)
      : worldVerticalDelta;
    hipsTrack.values[index] = targetBasePosition.x + localDelta.x;
    hipsTrack.values[index + 1] = targetBasePosition.y + localDelta.y;
    hipsTrack.values[index + 2] = targetBasePosition.z + localDelta.z;
  }
  return clip;
}

export function getProceduralJointForBoneName(
  name: string,
  boneMap?: DirectorCharacterBoneMap,
): ProceduralJoint | null {
  const normalizedName = getCanonicalHumanoidBoneName(name).toLowerCase();
  const directJoint = Object.entries(BONE_MAP).find(
    ([, bone]) => getCanonicalHumanoidBoneName(bone).toLowerCase() === normalizedName,
  )?.[0] as ProceduralJoint | undefined;
  if (directJoint) return directJoint;

  const mappedBodyPart = Object.entries(boneMap ?? {}).find(
    ([, bone]) => getCanonicalHumanoidBoneName(bone).toLowerCase() === normalizedName,
  )?.[0] as DirectorCharacterBonePart | undefined;
  const semanticBodyPart = mappedBodyPart ?? getSemanticBodyPartForBoneName(name);
  return semanticBodyPart ? SEMANTIC_BODY_PART_TO_JOINT[semanticBodyPart] ?? null : null;
}

function rotationForBone(
  name: string,
  controls: Record<string, number>,
  boneMap?: DirectorCharacterBoneMap,
): [number, number, number] | null {
  const joint = getProceduralJointForBoneName(name, boneMap);
  if (!joint) return null;
  const pitch = degrees(controls[`${joint}.pitch`] ?? controls[`${joint}.bend`] ?? 0);
  const yaw = degrees(controls[`${joint}.yaw`] ?? controls[`${joint}.twist`] ?? 0);
  const roll = degrees(controls[`${joint}.roll`] ?? controls[`${joint}.spread`] ?? 0);

  if (joint === "leftShoulder" || joint === "leftHip") return [yaw, pitch, roll];
  if (joint === "rightShoulder" || joint === "rightHip") return [yaw, pitch, -roll];
  if (joint === "leftElbow" || joint === "leftKnee") return [0, pitch, 0];
  if (joint === "rightElbow" || joint === "rightKnee") return [0, -pitch, 0];
  return [pitch, yaw, roll];
}

interface ProceduralBoneBinding {
  object: Object3D;
  restQuaternion: Quaternion;
}

function getProceduralBoneBindings(
  scene: Object3D,
  restPose: CharacterRestPose,
  boneMap?: DirectorCharacterBoneMap,
) {
  const bindings: ProceduralBoneBinding[] = [];
  scene.traverse((object) => {
    if (!getProceduralJointForBoneName(object.name, boneMap)) return;
    const rest = restPose.get(object.uuid);
    if (!rest) return;
    bindings.push({
      object,
      restQuaternion: new Quaternion().fromArray(rest.quaternion),
    });
  });
  return bindings;
}

function applyProceduralCharacterPose(
  bindings: ProceduralBoneBinding[],
  controls: Record<string, number>,
  boneMap?: DirectorCharacterBoneMap,
) {
  bindings.forEach(({ object, restQuaternion }) => {
    object.quaternion.copy(restQuaternion);
    const rotation = rotationForBone(object.name, controls, boneMap);
    if (rotation) object.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...rotation)));
  });
}

const ANIMATION_SAMPLE_EPSILON = 1e-7;

export function applyMixamoAnimationSample({
  animationTimeSeconds,
  clipDuration,
  lastClipTime,
  mixer,
  playbackMode = "loop",
  restPose,
  scene,
}: {
  animationTimeSeconds: number;
  clipDuration: number;
  lastClipTime: number | null;
  mixer: AnimationMixer;
  playbackMode?: CharacterActionPlaybackMode;
  restPose: CharacterRestPose;
  scene: Object3D;
}) {
  if (clipDuration <= 0) return lastClipTime;
  const clipTime = playbackMode === "once"
    ? Math.min(clipDuration, Math.max(0, animationTimeSeconds))
    : ((animationTimeSeconds % clipDuration) + clipDuration) % clipDuration;
  if (lastClipTime !== null && Math.abs(lastClipTime - clipTime) <= ANIMATION_SAMPLE_EPSILON) {
    return lastClipTime;
  }
  applyCharacterRestPose(scene, restPose);
  mixer.setTime(clipTime);
  scene.updateMatrixWorld(true);
  return clipTime;
}

function MixamoAnimationPlayer({
  animationTimeSeconds,
  clip,
  playbackMode = "loop",
  restPose,
  runtimeMotion,
  scene,
}: {
  animationTimeSeconds: number;
  clip: AnimationClip;
  playbackMode?: CharacterActionPlaybackMode;
  restPose: CharacterRestPose;
  runtimeMotion?: CharacterRuntimeMotion;
  scene: Object3D;
}) {
  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const lastClipTimeRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!clip) return;
    lastClipTimeRef.current = null;
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
    applyCharacterRestPose(scene, restPose);
    const action = mixer.clipAction(clip, scene);
    action.reset();
    action.clampWhenFinished = playbackMode === "once";
    action.setLoop(playbackMode === "once" ? LoopOnce : LoopRepeat, playbackMode === "once" ? 1 : Infinity).play();
    return () => {
      lastClipTimeRef.current = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      applyCharacterRestPose(scene, restPose);
    };
  }, [clip, mixer, playbackMode, restPose, scene]);

  useLayoutEffect(() => {
    if (!clip || clip.duration <= 0) return;
    lastClipTimeRef.current = applyMixamoAnimationSample({
      animationTimeSeconds,
      clipDuration: clip.duration,
      lastClipTime: lastClipTimeRef.current,
      mixer,
      playbackMode,
      restPose,
      scene,
    });
  }, [animationTimeSeconds, clip, mixer, playbackMode, restPose, scene]);

  useFrame(() => {
    if (!runtimeMotion || clip.duration <= 0) return;
    const animationTime = getCharacterRuntimeActionSample(
      runtimeMotion,
      getRuntimePlaybackProgress(),
    ).animationTimeSeconds;
    lastClipTimeRef.current = applyMixamoAnimationSample({
      animationTimeSeconds: animationTime,
      clipDuration: clip.duration,
      lastClipTime: lastClipTimeRef.current,
      mixer,
      playbackMode,
      restPose,
      scene,
    });
  });

  return null;
}

function ProceduralCharacterPosePlayer({
  actionPresetId,
  animationTimeSeconds,
  baseControls,
  boneMap,
  modelGroup,
  modelGroupBaseY,
  restPose,
  runtimeMotion,
  scene,
}: {
  actionPresetId?: string | null;
  animationTimeSeconds: number;
  baseControls: Record<string, number>;
  boneMap?: DirectorCharacterBoneMap;
  modelGroup: { current: Group | null };
  modelGroupBaseY: number;
  restPose: CharacterRestPose;
  runtimeMotion?: CharacterRuntimeMotion;
  scene: Object3D;
}) {
  const bindings = useMemo(
    () => getProceduralBoneBindings(scene, restPose, boneMap),
    [boneMap, restPose, scene],
  );
  const lastActionPresetIdRef = useRef<string | null>(null);

  const applySample = useCallback((sampleActionPresetId: string | null | undefined, sampleTimeSeconds: number) => {
    const controls = sampleActionPresetId
      ? sampleCharacterActionControls(sampleActionPresetId, sampleTimeSeconds, baseControls)
      : baseControls;
    applyProceduralCharacterPose(bindings, controls, boneMap);
    if (modelGroup.current) {
      modelGroup.current.position.y = modelGroupBaseY + (controls["body.offsetY"] ?? 0);
    }
    scene.updateMatrixWorld(true);
    lastActionPresetIdRef.current = sampleActionPresetId ?? null;
  }, [baseControls, bindings, boneMap, modelGroup, modelGroupBaseY, scene]);

  useLayoutEffect(() => {
    applySample(actionPresetId, animationTimeSeconds);
  }, [actionPresetId, animationTimeSeconds, applySample]);

  useFrame(() => {
    if (!runtimeMotion) return;
    const sample = getCharacterRuntimeActionSample(runtimeMotion, getRuntimePlaybackProgress());
    if (!sample.actionPresetId && !lastActionPresetIdRef.current) return;
    applySample(sample.actionPresetId, sample.animationTimeSeconds);
  });

  return null;
}

function PreparedExternalAnimationClip({
  animationTimeSeconds,
  retargetMode,
  restPose,
  scene,
  sourceClip,
  sourceScene,
  runtimeMotion,
  targetBoneMap,
  playbackMode = "loop",
}: {
  animationTimeSeconds: number;
  retargetMode: MixamoRetargetMode;
  restPose: CharacterRestPose;
  scene: Object3D;
  sourceClip: AnimationClip | null;
  sourceScene: Object3D;
  runtimeMotion?: CharacterRuntimeMotion;
  targetBoneMap?: DirectorCharacterBoneMap;
  playbackMode?: CharacterActionPlaybackMode;
}) {
  const sourceRestPose = useMemo(() => captureCharacterRestPose(sourceScene), [sourceScene]);
  const clip = useMemo(
    () => sourceClip
      ? prepareMixamoAnimationClip(
          sourceClip,
          scene,
          sourceScene,
          retargetMode,
          restPose,
          sourceRestPose,
          targetBoneMap
        )
      : null,
    [restPose, retargetMode, scene, sourceClip, sourceRestPose, sourceScene, targetBoneMap]
  );
  return clip
    ? <MixamoAnimationPlayer animationTimeSeconds={animationTimeSeconds} clip={clip} playbackMode={playbackMode} restPose={restPose} runtimeMotion={runtimeMotion} scene={scene} />
    : null;
}

function ExternalFbxAnimationClip({ animation, ...props }: {
  animation: ExternalCharacterAnimation;
  animationTimeSeconds: number;
  retargetMode: MixamoRetargetMode;
  restPose: CharacterRestPose;
  runtimeMotion?: CharacterRuntimeMotion;
  targetBoneMap?: DirectorCharacterBoneMap;
  playbackMode?: CharacterActionPlaybackMode;
  scene: Object3D;
}) {
  const source = useLoader(FBXLoader, animation.url);
  const sourceClip = source.animations.find((clip) => clip.name === animation.clipName) ?? source.animations[0] ?? null;
  return <PreparedExternalAnimationClip {...props} sourceClip={sourceClip} sourceScene={source} />;
}

function ExternalGlbAnimationClip({ animation, ...props }: {
  animation: ExternalCharacterAnimation;
  animationTimeSeconds: number;
  retargetMode: MixamoRetargetMode;
  restPose: CharacterRestPose;
  runtimeMotion?: CharacterRuntimeMotion;
  targetBoneMap?: DirectorCharacterBoneMap;
  playbackMode?: CharacterActionPlaybackMode;
  scene: Object3D;
}) {
  const source = useLoader(GLTFLoader, animation.url);
  const sourceClip = source.animations.find((clip) => clip.name === animation.clipName) ?? source.animations[0] ?? null;
  return <PreparedExternalAnimationClip {...props} sourceClip={sourceClip} sourceScene={source.scene} />;
}

function ExternalCharacterAnimationClip(props: {
  animation: ExternalCharacterAnimation;
  animationTimeSeconds: number;
  retargetMode: MixamoRetargetMode;
  restPose: CharacterRestPose;
  runtimeMotion?: CharacterRuntimeMotion;
  targetBoneMap?: DirectorCharacterBoneMap;
  playbackMode?: CharacterActionPlaybackMode;
  scene: Object3D;
}) {
  return props.animation.format === "glb"
    ? <ExternalGlbAnimationClip {...props} />
    : <ExternalFbxAnimationClip {...props} />;
}

function LoadedMixamoCharacter({
  boneMap,
  color,
  actionPresetId,
  animationTimeSeconds = 0,
  allowExternalAnimations = true,
  externalAnimation,
  orientationCorrection = DEFAULT_ORIENTATION_CORRECTION,
  nativeActionClipNames = XBOT_NATIVE_ACTION_CLIPS,
  nativeAnimations = [],
  source,
  retargetMode,
  rigState,
  runtimeMotion,
  onLabelAnchorYChange,
}: Omit<MixamoCharacterModelProps, "url"> & {
  allowExternalAnimations?: boolean;
  nativeActionClipNames?: NativeActionClipNames;
  nativeAnimations?: AnimationClip[];
  source: Object3D;
  retargetMode: MixamoRetargetMode;
}) {
  const modelGroupRef = useRef<Group>(null);
  const nativeClip = getNativeMixamoActionClip(actionPresetId, nativeAnimations, nativeActionClipNames);
  const playbackMode = getCharacterActionPlaybackMode(actionPresetId);
  const animationUrl = externalAnimation
    ? null
    : getFallbackMixamoAnimationUrl(actionPresetId, nativeClip, allowExternalAnimations);
  const hasActiveAnimationClip = Boolean(animationUrl || nativeClip || externalAnimation);
  const { scene, restPose, scale, offset } = useMemo(() => {
    const clone = cloneSkeleton(source) as Object3D;
    clone.rotation.set(...orientationCorrection);
    clone.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(clone);
    const size = bounds.getSize(new Vector3());
    const modelScale = size.y > 0 ? 1.8 / size.y : 0.01;
    return {
      scene: clone,
      restPose: captureCharacterRestPose(clone),
      scale: modelScale,
      offset: new Vector3(
        -(bounds.min.x + bounds.max.x) * .5 * modelScale,
        -bounds.min.y * modelScale,
        -(bounds.min.z + bounds.max.z) * .5 * modelScale
      ),
    };
  }, [orientationCorrection, source]);

  useLayoutEffect(() => {
    isolateAndTintModelMaterials(scene, color);
  }, [color, scene]);
  useLayoutEffect(() => () => disposeIsolatedModelMaterials(scene), [scene]);

  useLayoutEffect(() => {
    if (hasActiveAnimationClip) {
      onLabelAnchorYChange?.(1.8 + VIEWPORT_OBJECT_LABEL_VERTICAL_GAP);
      return;
    }
    const controls = rigState?.controls ?? {};
    applyCharacterRestPose(scene, restPose);
    scene.traverse((object) => {
      const rest = restPose.get(object.uuid);
      if (!rest) return;
      const rotation = rotationForBone(object.name, controls, boneMap);
      if (rotation) object.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...rotation)));
    });
    onLabelAnchorYChange?.(1.8 + VIEWPORT_OBJECT_LABEL_VERTICAL_GAP + (controls["body.offsetY"] ?? 0));
  }, [boneMap, hasActiveAnimationClip, onLabelAnchorYChange, restPose, rigState?.controls, scene]);

  const preparedNativeClip = useMemo(
    () => nativeClip?.clone() ?? null,
    [nativeClip]
  );

  const bodyOffsetY = hasActiveAnimationClip ? 0 : rigState?.controls["body.offsetY"] ?? 0;
  const proceduralBaseControls = runtimeMotion?.object.characterRig?.controls ?? rigState?.controls ?? {};
  return (
    <group ref={modelGroupRef} name="mixamo-character" position={[offset.x, offset.y + bodyOffsetY, offset.z]} scale={scale}>
      <primitive object={scene} />
      {externalAnimation ? (
        <ExternalCharacterAnimationClip
          animation={externalAnimation}
          animationTimeSeconds={animationTimeSeconds}
          retargetMode={retargetMode}
          restPose={restPose}
          runtimeMotion={runtimeMotion}
          playbackMode={playbackMode}
          targetBoneMap={boneMap}
          scene={scene}
        />
      ) : preparedNativeClip ? (
        <MixamoAnimationPlayer
          animationTimeSeconds={animationTimeSeconds}
          clip={preparedNativeClip}
          playbackMode={playbackMode}
          restPose={restPose}
          runtimeMotion={runtimeMotion}
          scene={scene}
        />
      ) : animationUrl ? (
        <ExternalFbxAnimationClip
          animation={{ url: animationUrl, format: "fbx", clipName: "" }}
          animationTimeSeconds={animationTimeSeconds}
          retargetMode={retargetMode}
          restPose={restPose}
          runtimeMotion={runtimeMotion}
          playbackMode={playbackMode}
          targetBoneMap={boneMap}
          scene={scene}
        />
      ) : (
        <ProceduralCharacterPosePlayer
          actionPresetId={actionPresetId}
          animationTimeSeconds={animationTimeSeconds}
          baseControls={proceduralBaseControls}
          boneMap={boneMap}
          modelGroup={modelGroupRef}
          modelGroupBaseY={offset.y}
          restPose={restPose}
          runtimeMotion={runtimeMotion}
          scene={scene}
        />
      )}
    </group>
  );
}

function MixamoFbxCharacter(props: MixamoCharacterModelProps) {
  const loaded = useLoader(FBXLoader, props.url);
  const useProceduralBuiltInAction = shouldUseProceduralBuiltInAction(
    props.url,
    props.actionPresetId,
  );
  return (
    <LoadedMixamoCharacter
      {...props}
      allowExternalAnimations={!useProceduralBuiltInAction}
      retargetMode="local-rest"
      source={loaded}
    />
  );
}

function MixamoGlbCharacter(props: MixamoCharacterModelProps) {
  const loaded = useLoader(GLTFLoader, props.url);
  const isRobotExpressive = /robot-expressive\.glb(?:$|[?#])/i.test(props.url);
  const isSoldier = /soldier\.glb(?:$|[?#])/i.test(props.url);
  const retargetMode: MixamoRetargetMode = isRobotExpressive || isSoldier ? "direct" : "local-rest";
  const nativeActionClipNames = isRobotExpressive
    ? ROBOT_EXPRESSIVE_ACTION_CLIPS
    : isSoldier
      ? SOLDIER_NATIVE_ACTION_CLIPS
      : XBOT_NATIVE_ACTION_CLIPS;
  return (
    <LoadedMixamoCharacter
      {...props}
      nativeActionClipNames={nativeActionClipNames}
      nativeAnimations={loaded.animations}
      retargetMode={retargetMode}
      source={loaded.scene}
    />
  );
}

export function MixamoCharacterModel(props: MixamoCharacterModelProps) {
  return props.format === "glb" || (!props.format && /\.glb(?:$|[?#])/i.test(props.url))
    ? <MixamoGlbCharacter {...props} />
    : <MixamoFbxCharacter {...props} />;
}
