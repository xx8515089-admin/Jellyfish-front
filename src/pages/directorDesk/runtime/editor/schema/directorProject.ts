import type {
  DirectorCharacterBoneMap,
  DirectorCameraTargetBodyPart,
  DirectorCameraTargetFollowMode,
} from "./semanticBody";

export type ViewMode = "director" | "camera";
export type RightPanelKind = "scene" | "character" | "prop" | "camera";
export type DirectorObjectKind = "character" | "scene" | "prop" | "camera" | "panorama";
export const GEOMETRY_PRIMITIVE_OPTIONS = [
  { type: "box", label: "立方体" },
  { type: "sphere", label: "球体" },
  { type: "cylinder", label: "圆柱体" },
  { type: "torus", label: "环状体" },
  { type: "cone", label: "圆锥" },
  { type: "pyramid", label: "棱锥" },
] as const;
export type GeometryPrimitiveType = (typeof GEOMETRY_PRIMITIVE_OPTIONS)[number]["type"];
export type CharacterRigType = "mannequin" | "ue4-mannequin" | "mixamo" | "vrm" | "custom-humanoid";
export type CharacterBodyType =
  | "mannequin"
  | "female"
  | "broad"
  | "muscular"
  | "slim"
  | "teen"
  | "child"
  | "chibi";
export type DirectorAssetKind = "character" | "scene" | "prop" | "panorama";
export type DirectorAssetSource = "local" | "library";
export type PanoramaProjectionMode = "equirectangular" | "backdrop";
export type DirectorModelFormat = "fbx" | "obj" | "glb";
export type GroundMaterialPresetId = "studio" | "concrete" | "asphalt" | "wood" | "grass";
export type CharacterRigProfile = "mixamo" | "mixamo-alt" | "bip" | "cc-base" | "generic-humanoid" | "unknown";
export type CharacterImportReadiness = "ready" | "native-only" | "manual-mapping" | "static-only";

export interface DirectorTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SceneSettings {
  scale: number;
  position: [number, number, number];
  rotation: [number, number, number];
  backgroundColor: string;
  backgroundBrightness: number;
  panoramaYaw: number;
  panoramaRadius: number;
  showLabels: boolean;
  snapToGrid: boolean;
  showGrid: boolean;
  showGround: boolean;
  groundMaterialPreset: GroundMaterialPresetId;
  /** 每个地面纹理图块世界空间尺寸的倍率。 */
  groundTextureScale: number;
  groundColor: string;
  groundBrightness: number;
  groundOpacity: number;
  groundHeight: number;
  pathCollisionEnabled: boolean;
}

export interface CharacterRigState {
  rigType: CharacterRigType;
  posePresetId: string | null;
  actionPresetId?: string | null;
  controls: Record<string, number>;
}

export interface DirectorAssetRef {
  cloudFileId?: number;
  id: string;
  kind: DirectorAssetKind;
  sourceType: "model" | "image";
  fileName: string;
  name?: string;
  url: string;
  assetSource?: DirectorAssetSource;
  projectionMode?: PanoramaProjectionMode;
  modelFormat?: DirectorModelFormat;
  storageKey?: string;
  byteLength?: number;
  characterRigProfile?: CharacterRigProfile;
  characterImportReadiness?: CharacterImportReadiness;
  characterOrientationCorrection?: [number, number, number];
  characterBoneMap?: DirectorCharacterBoneMap;
}

export interface DirectorAnimationClipRef {
  id: string;
  name: string;
  duration: number;
  trackCount: number;
}

export interface DirectorAnimationAssetRef {
  cloudFileId?: number;
  id: string;
  name: string;
  fileName: string;
  url: string;
  modelFormat: Extract<DirectorModelFormat, "fbx" | "glb">;
  storageKey?: string;
  byteLength?: number;
  rigProfile: CharacterRigProfile;
  sourceCharacterAssetId?: string;
  clips: DirectorAnimationClipRef[];
}

export interface DirectorObject {
  id: string;
  name: string;
  kind: DirectorObjectKind;
  visible: boolean;
  locked: boolean;
  transform: DirectorTransform;
  bodyType?: CharacterBodyType;
  color?: string;
  assetRefId?: string;
  geometryType?: GeometryPrimitiveType;
  crowdId?: string;
  crowdLabel?: string;
  linkedCameraId?: string | null;
  characterRig?: CharacterRigState;
  motionPath?: DirectorObjectMotionPath;
}

export interface DirectorObjectMotionKeyframe {
  id: string;
  time: number;
  transform: DirectorTransform;
  /** 从当前路径点到下一个路径点期间播放的角色动作。 */
  actionPresetId?: string | null;
  /** 路径朝向会转向下一个路径点；手动模式则保留当前点的旋转。 */
  facingMode?: "path" | "manual";
  /** 穿行模式会继续移动；停留模式会在当前点暂停 holdSeconds 秒。 */
  pointBehavior?: DirectorRoutePointBehavior;
  holdSeconds?: number;
  /** 在当前路径点停留期间使用的角色姿态或动作。 */
  holdAction?: DirectorRouteHoldAction;
  holdActionPresetId?: string | null;
}

export interface DirectorObjectMotionPath {
  interpolation: CameraMotionInterpolation;
  speedMode?: DirectorRouteSpeedMode;
  customEasing?: DirectorRouteCubicBezier;
  keyframes: DirectorObjectMotionKeyframe[];
}

export interface DirectorCameraCapture {
  id: string;
  index: number;
  name: string;
  dataUrl: string;
}

export type CameraMotionInterpolation = "linear" | "smooth";
export type CameraMotionEasing = "linear" | "ease-in-out";
export type DirectorRouteSpeedMode = "uniform" | "soft" | "custom";
export type DirectorRoutePointBehavior = "pass" | "hold";
export type DirectorRouteHoldAction = "stand" | "current" | "custom";
export type DirectorRouteCubicBezier = [number, number, number, number];

export interface DirectorCameraMotionKeyframe {
  id: string;
  time: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** 每个路径点都可以独立瞄准场景中移动的主体。 */
  targetMode?: "manual" | "object";
  targetObjectId?: string | null;
  /** 目标为角色时使用的语义化动画身体部位。 */
  targetBodyPart?: DirectorCameraTargetBodyPart;
  /** 即时模式会精确跟随；平滑模式会在各渲染视图中应用时间阻尼。 */
  targetFollowMode?: DirectorCameraTargetFollowMode;
  /** 在保留主体移动的同时抑制身体动画的高频抖动。 */
  targetStabilizationEnabled?: boolean;
  /** 穿行模式会继续移动；停留模式会在当前点暂停 holdSeconds 秒。 */
  pointBehavior?: DirectorRoutePointBehavior;
  holdSeconds?: number;
}

export interface DirectorCameraMotionPath {
  duration: number;
  loop: boolean;
  interpolation: CameraMotionInterpolation;
  easing: CameraMotionEasing;
  speedMode?: DirectorRouteSpeedMode;
  customEasing?: DirectorRouteCubicBezier;
  keyframes: DirectorCameraMotionKeyframe[];
}

export interface DirectorCameraShot {
  id: string;
  name: string;
  /** 为初级运镜工作流创建的内部相机，不包含场景辅助对象。 */
  isVirtual?: boolean;
  fov: number;
  transform: DirectorTransform;
  targetMode: "manual" | "object";
  targetObjectId?: string | null;
  target: [number, number, number];
  lastCaptureUrl?: string | null;
  captures?: DirectorCameraCapture[];
  motionPath?: DirectorCameraMotionPath;
}

export interface DirectorProject {
  jellyfishCloudAssets?: { assetFileId: number; packageId?: string | null; relativePath: string; sha256: string; byteSize: number }[];
  version: 1;
  scene: SceneSettings;
  assets: DirectorAssetRef[];
  animationAssets?: DirectorAnimationAssetRef[];
  objects: DirectorObject[];
  cameras: DirectorCameraShot[];
  activeCameraId: string | null;
  panoramaAssetId: string | null;
}
