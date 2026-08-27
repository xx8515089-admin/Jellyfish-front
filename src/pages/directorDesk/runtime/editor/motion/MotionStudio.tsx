import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  Gauge,
  LocateFixed,
  MousePointer2,
  Move3D,
  Pause,
  Play,
  Plus,
  Route,
  SlidersHorizontal,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  downloadReferenceVideo,
  requestReferenceVideoExport,
  type ReferenceVideoExportQuality,
} from "../io/referenceVideoExport";
import { getCameraMotionPath, getCameraMotionTimingPlan, getCameraMotionTimingSample } from "../schema/cameraMotion";
import {
  getAnimatedCameraFocusTarget,
  getDirectorObjectFocusTarget,
  isCameraFocusableObject,
} from "../schema/cameraTarget";
import { getObjectMotionSnapshot } from "../schema/objectMotion";
import type { CameraShotSnapshot } from "../store/directorStore";
import { useDirectorStore } from "../store/directorStore";
import {
  CAMERA_MOTION_PRESETS,
  findMatchingCameraMotionPreset,
  getCameraMotionPresetPatch,
} from "./cameraMotionPresets";
import {
  CAMERA_PATH_TEMPLATES,
  createCameraPathTemplate,
  getCameraPathTemplatesByGroup,
  type CameraPathTemplateId,
} from "./cameraPathTemplates";
import {
  DIRECTOR_CAMERA_TARGET_BODY_PART_OPTIONS,
  type DirectorCameraTargetBodyPart,
  type DirectorCameraTargetFollowMode,
} from "../schema/semanticBody";
import { RouteCustomEasingControl } from "./RouteCustomEasingControl";
import { useDirectorDeskText } from "../../useDirectorDeskText";

const CAMERA_PATH_TEMPLATE_ENGLISH: Record<
  CameraPathTemplateId,
  { label: string; description: string; suitableFor: string }
> = {
  "push-in": { label: "Push in", description: "Move closer to the subject", suitableFor: "Introductions and emotional emphasis" },
  "pull-out": { label: "Pull out", description: "Move away from the subject", suitableFor: "Environment reveals and scene endings" },
  "pan-left": { label: "Orbit left", description: "Orbit toward the subject's left side", suitableFor: "Spatial relationships and character observation" },
  "pan-right": { label: "Orbit right", description: "Orbit toward the subject's right side", suitableFor: "Spatial relationships and character observation" },
  "tilt-up": { label: "Tilt up", description: "Raise the view from a low angle", suitableFor: "Character entrances and emphasizing height" },
  "tilt-down": { label: "Tilt down", description: "Lower the view from a high angle", suitableFor: "Establishing space and overhead views" },
  "truck-left": { label: "Truck left", description: "Move sideways to create parallax", suitableFor: "Scene depth and lateral reveals" },
  "truck-right": { label: "Truck right", description: "Move sideways to create parallax", suitableFor: "Scene depth and lateral reveals" },
  "crane-orbit-up": { label: "Crane orbit up", description: "Rise while orbiting the subject", suitableFor: "Entrances, reveals and climactic shots" },
  follow: { label: "Follow", description: "Follow a moving subject at a steady distance", suitableFor: "Walking, running and moving subjects" },
  "parallel-follow": { label: "Parallel follow", description: "Move alongside the subject", suitableFor: "Walking characters and side views of vehicles" },
  handheld: { label: "Handheld", description: "Add subtle irregular handheld motion", suitableFor: "Documentary, tension and subjective presence" },
  "over-shoulder-reveal": { label: "Over-shoulder reveal", description: "Move from behind the subject to the front", suitableFor: "Dialogue, entrances and emotional turns" },
  "orbit-close": { label: "Close half orbit", description: "Make a half orbit at close range", suitableFor: "Character close-ups and product details" },
  "crane-orbit-down": { label: "Crane orbit down", description: "Lower the camera while orbiting", suitableFor: "Landing on a subject and entering a performance" },
  "low-angle-follow": { label: "Low-angle follow", description: "Follow the subject close to the ground", suitableFor: "Running, vehicles and powerful movement" },
  "overhead-follow": { label: "Overhead follow", description: "Follow the subject from above", suitableFor: "Routes, ensembles and action scenes" },
  "foreground-reveal": { label: "Foreground reveal", description: "Move past the foreground to reveal the subject", suitableFor: "Suspense reveals and spatial transitions" },
};

const CAMERA_MOTION_PRESET_ENGLISH: Record<string, { label: string; description: string }> = {
  "cinematic-push": { label: "Cinematic push", description: "8 seconds with gentle acceleration for emotion and close-ups" },
  "character-follow": { label: "Steady follow", description: "6 seconds of smooth movement for walking shots" },
  "fast-follow": { label: "Fast follow", description: "3 seconds with uniform response for action shots" },
  "product-orbit": { label: "Product orbit", description: "10 seconds of smooth, uniform movement for orbit showcases" },
  "steady-slide": { label: "Steady slide", description: "5 seconds of gentle linear movement for lateral reveals" },
  "ambient-long-take": { label: "Ambient long take", description: "15 seconds of slow, smooth movement for establishing shots" },
};

const CAMERA_TARGET_BODY_PART_ENGLISH: Record<DirectorCameraTargetBodyPart, string> = {
  center: "Center",
  head: "Head",
  chest: "Chest",
  waist: "Waist",
  leftUpperArm: "Left upper arm",
  leftForearm: "Left forearm",
  leftHand: "Left hand",
  rightUpperArm: "Right upper arm",
  rightForearm: "Right forearm",
  rightHand: "Right hand",
  leftThigh: "Left thigh",
  leftCalf: "Left calf",
  leftFoot: "Left foot",
  rightThigh: "Right thigh",
  rightCalf: "Right calf",
  rightFoot: "Right foot",
};

export function getActiveCameraWaypointIndex(progress: number, times: number[]) {
  if (times.length === 0) return -1;
  let active = 0;
  for (let index = 1; index < times.length; index += 1) {
    if (progress + 0.0001 < times[index]) break;
    active = index;
  }
  return active;
}

export function MotionStudio({
  getViewportCameraSnapshot,
  onLoadCameraSnapshot,
  onStartPilot,
}: {
  getViewportCameraSnapshot: () => CameraShotSnapshot;
  onLoadCameraSnapshot?: (snapshot: CameraShotSnapshot) => void;
  onStartPilot?: (editKeyframeId?: string | null) => void;
}) {
  const text = useDirectorDeskText();
  const open = useDirectorStore((state) => state.motionStudioOpen);
  const viewMode = useDirectorStore((state) => state.viewMode);
  const cameraPilotMode = useDirectorStore((state) => state.cameraPilotMode);
  const activeCamera = useDirectorStore((state) =>
    state.project.cameras.find((item) => item.id === state.project.activeCameraId) ?? state.project.cameras[0]
  );
  const selectedCameraKeyframeId = useDirectorStore((state) => state.selectedCameraKeyframeId);
  const selectedCameraKeyframeIds = useDirectorStore((state) => state.selectedCameraKeyframeIds);
  const cameraMotionProgress = useDirectorStore((state) => state.cameraMotionProgress);
  const cameraMotionPlaying = useDirectorStore((state) => state.cameraMotionPlaying);
  const cameraPilotFollowTarget = useDirectorStore((state) => state.cameraPilotFollowTarget);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const sceneObjects = useDirectorStore((state) => state.project.objects);
  const setMotionStudioOpen = useDirectorStore((state) => state.setMotionStudioOpen);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const ensureMotionCamera = useDirectorStore((state) => state.ensureMotionCamera);
  const startCameraPilot = useDirectorStore((state) => state.startCameraPilot);
  const recordCameraMotionSnapshot = useDirectorStore((state) => state.recordCameraMotionSnapshot);
  const selectCameraMotionKeyframe = useDirectorStore((state) => state.selectCameraMotionKeyframe);
  const setCameraMotionKeyframeSelection = useDirectorStore((state) => state.setCameraMotionKeyframeSelection);
  const setCameraMotionProgress = useDirectorStore((state) => state.setCameraMotionProgress);
  const setCameraMotionPlaying = useDirectorStore((state) => state.setCameraMotionPlaying);
  const updateCameraMotionPath = useDirectorStore((state) => state.updateCameraMotionPath);
  const updateCameraMotionKeyframe = useDirectorStore((state) => state.updateCameraMotionKeyframe);
  const deleteCameraMotionKeyframe = useDirectorStore((state) => state.deleteCameraMotionKeyframe);
  const moveCameraMotionKeyframe = useDirectorStore((state) => state.moveCameraMotionKeyframe);
  const insertCameraMotionKeyframeAfter = useDirectorStore((state) => state.insertCameraMotionKeyframeAfter);
  const setCameraPilotFollowTarget = useDirectorStore((state) => state.setCameraPilotFollowTarget);
  const beginUndoBatch = useDirectorStore((state) => state.beginUndoBatch);
  const endUndoBatch = useDirectorStore((state) => state.endUndoBatch);
  const [batchSelectionEnabled, setBatchSelectionEnabled] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFps, setExportFps] = useState(30);
  const [exportQuality, setExportQuality] = useState<ReferenceVideoExportQuality>("720p");
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [arrivalTimeDraft, setArrivalTimeDraft] = useState("");
  const [templateTargetObjectId, setTemplateTargetObjectId] = useState("");
  const [templateScale, setTemplateScale] = useState(1);
  const [templateGroup, setTemplateGroup] = useState<"official" | "community">("official");
  const [activeTemplateId, setActiveTemplateId] = useState<CameraPathTemplateId | null>(null);
  const activeTemplateRef = useRef<{
    snapshot: CameraShotSnapshot;
    targetObjectId: string;
    templateId: CameraPathTemplateId;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    ensureMotionCamera(getViewportCameraSnapshot());
  }, [ensureMotionCamera, open]);

  useEffect(() => {
    if (selectedObjectId && sceneObjects.some((object) => object.id === selectedObjectId && isCameraFocusableObject(object))) {
      setTemplateTargetObjectId(selectedObjectId);
    }
  }, [selectedObjectId]);

  const activeMotionPath = activeCamera ? getCameraMotionPath(activeCamera) : null;
  const activeSelectedKeyframe = activeMotionPath?.keyframes.find((item) => item.id === selectedCameraKeyframeId) ?? null;
  const activeTimingPlan = activeCamera ? getCameraMotionTimingPlan(activeCamera) : null;
  const activeSelectedIndex = activeMotionPath && activeSelectedKeyframe
    ? activeMotionPath.keyframes.indexOf(activeSelectedKeyframe)
    : -1;
  const activeSelectedArrival = activeSelectedIndex >= 0
    ? activeTimingPlan?.arrivals[activeSelectedIndex] ?? activeSelectedKeyframe?.time ?? 0
    : 0;

  useEffect(() => {
    setArrivalTimeDraft(
      activeSelectedKeyframe && activeMotionPath
        ? (activeSelectedArrival * activeMotionPath.duration).toFixed(1)
        : ""
    );
  }, [activeMotionPath?.duration, activeSelectedArrival, activeSelectedKeyframe?.id]);

  if (!open || !activeCamera) return null;

  const motionPath = activeMotionPath!;
  const trackableObjects = sceneObjects.filter(isCameraFocusableObject);
  const canPlay = motionPath.keyframes.length >= 2 || sceneObjects.some((item) => (item.motionPath?.keyframes?.length ?? 0) >= 2);
  const selectedKeyframe = motionPath.keyframes.find((item) => item.id === selectedCameraKeyframeId) ?? null;
  const trackingObjectId = selectedKeyframe?.targetMode === "object"
    ? selectedKeyframe.targetObjectId ?? ""
    : "";
  const trackingObject = trackableObjects.find((object) => object.id === trackingObjectId) ?? null;
  const trackingBodyPart = selectedKeyframe?.targetBodyPart ?? "center";
  const trackingFollowMode = selectedKeyframe?.targetFollowMode ?? "immediate";
  const trackingStabilizationEnabled = selectedKeyframe?.targetStabilizationEnabled ?? false;
  const stabilizedWaypointCount = motionPath.keyframes.filter((keyframe) => keyframe.targetStabilizationEnabled).length;
  const allWaypointsStabilized = motionPath.keyframes.length > 0
    && stabilizedWaypointCount === motionPath.keyframes.length;
  const matchingPreset = findMatchingCameraMotionPreset(motionPath);
  const timingSample = getCameraMotionTimingSample(activeCamera, cameraMotionProgress);
  const activeIndex = timingSample?.holdingPointIndex
    ?? timingSample?.segment
    ?? getActiveCameraWaypointIndex(cameraMotionProgress, motionPath.keyframes.map((item) => item.time));
  const timelinePreviewActive = cameraMotionPlaying || cameraMotionProgress > 0.0001;
  const visiblePathTemplates = getCameraPathTemplatesByGroup(templateGroup);
  const activeTemplate = CAMERA_PATH_TEMPLATES.find((template) => template.id === activeTemplateId) ?? null;

  function addCurrentView() {
    recordCameraMotionSnapshot(activeCamera.id, getViewportCameraSnapshot());
  }

  function selectWaypoint(id: string, time: number) {
    if (batchSelectionEnabled) {
      const nextSelection = selectedCameraKeyframeIds.includes(id)
        ? selectedCameraKeyframeIds.filter((item) => item !== id)
        : [...selectedCameraKeyframeIds, id];
      setCameraMotionKeyframeSelection(nextSelection);
      if (nextSelection.includes(id)) setCameraMotionProgress(time);
      return;
    }
    selectCameraMotionKeyframe(id);
    setCameraMotionProgress(time);
    setCameraMotionPlaying(false);
  }

  function toggleBatchSelection() {
    if (batchSelectionEnabled) {
      selectCameraMotionKeyframe(selectedCameraKeyframeId);
      setBatchSelectionEnabled(false);
      return;
    }
    setBatchSelectionEnabled(true);
  }

  function setTrackingObject(objectId: string) {
    if (!selectedKeyframe) return;
    if (!objectId) {
      const currentTrackingTarget = getAnimatedCameraFocusTarget(
        activeCamera,
        sceneObjects,
        selectedKeyframe.time
      );
      updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, {
        targetMode: "manual",
        targetObjectId: null,
        targetBodyPart: "center",
        targetFollowMode: "immediate",
        targetStabilizationEnabled: false,
        target: currentTrackingTarget ?? selectedKeyframe.target,
      });
      return;
    }

    const targetObject = trackableObjects.find((object) => object.id === objectId);
    if (!targetObject) return;
    const target = getDirectorObjectFocusTarget({
      ...targetObject,
      transform: getObjectMotionSnapshot(targetObject, selectedKeyframe.time, motionPath.duration),
    });
    updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, {
      targetMode: "object",
      targetObjectId: targetObject.id,
      targetBodyPart: targetObject.kind === "character" ? "chest" : "center",
      targetFollowMode: "immediate",
      targetStabilizationEnabled: false,
      target,
    });
  }

  function setTrackingBodyPart(bodyPart: DirectorCameraTargetBodyPart) {
    if (!selectedKeyframe || trackingObject?.kind !== "character") return;
    updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, { targetBodyPart: bodyPart });
  }

  function setTrackingFollowMode(targetFollowMode: DirectorCameraTargetFollowMode) {
    if (!selectedKeyframe || !trackingObjectId) return;
    updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, { targetFollowMode });
  }

  function setTrackingStabilization(targetStabilizationEnabled: boolean) {
    if (!selectedKeyframe || !trackingObjectId) return;
    updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, { targetStabilizationEnabled });
  }

  function setAllTrackingStabilization(targetStabilizationEnabled: boolean) {
    if (motionPath.keyframes.length === 0) return;
    setCameraMotionPlaying(false);
    updateCameraMotionPath(activeCamera.id, {
      keyframes: motionPath.keyframes.map((keyframe) => ({
        ...keyframe,
        targetStabilizationEnabled,
      })),
    });
  }

  function applyMotionPreset(presetId: string) {
    const patch = getCameraMotionPresetPatch(presetId);
    if (patch) updateCameraMotionPath(activeCamera.id, patch);
  }

  function generatePathTemplate({
    scale,
    snapshot,
    targetObjectId,
    templateId,
  }: {
    scale: number;
    snapshot: CameraShotSnapshot;
    targetObjectId: string;
    templateId: CameraPathTemplateId;
  }) {
    const targetObject = trackableObjects.find((object) => object.id === targetObjectId) ?? null;
    const focusAt = targetObject
      ? (progress: number) => getDirectorObjectFocusTarget({
          ...targetObject,
          transform: getObjectMotionSnapshot(targetObject, progress, motionPath.duration),
        })
      : () => [...snapshot.target] as [number, number, number];
    const generatedPath = createCameraPathTemplate({
      cameraId: activeCamera.id,
      focusAt,
      scale,
      snapshot,
      targetObjectId: targetObject?.id ?? null,
      targetBodyPart: targetObject?.kind === "character" ? "chest" : "center",
      templateId,
    });

    setCameraMotionPlaying(false);
    setCameraMotionProgress(0);
    setBatchSelectionEnabled(false);
    updateCameraMotionPath(activeCamera.id, generatedPath);
    selectCameraMotionKeyframe(generatedPath.keyframes[0]?.id ?? null);
  }

  function applyPathTemplate(templateId: CameraPathTemplateId) {
    const context = {
      snapshot: getViewportCameraSnapshot(),
      targetObjectId: templateTargetObjectId,
      templateId,
    };
    activeTemplateRef.current = context;
    setActiveTemplateId(templateId);
    generatePathTemplate({ ...context, scale: templateScale });
  }

  function updateTemplateScale(scale: number) {
    setTemplateScale(scale);
    const context = activeTemplateRef.current;
    if (context) generatePathTemplate({ ...context, scale });
  }

  function updateTemplateTarget(targetObjectId: string) {
    setTemplateTargetObjectId(targetObjectId);
    const context = activeTemplateRef.current;
    if (!context) return;
    const nextContext = { ...context, targetObjectId };
    activeTemplateRef.current = nextContext;
    generatePathTemplate({ ...nextContext, scale: templateScale });
  }

  function editSelectedWaypoint() {
    if (!selectedKeyframe) return;
    onLoadCameraSnapshot?.({
      position: [...selectedKeyframe.position],
      target: [...selectedKeyframe.target],
      fov: selectedKeyframe.fov,
    });
    if (onStartPilot) {
      onStartPilot(selectedKeyframe.id);
    } else {
      startCameraPilot("pilot", selectedKeyframe.id);
    }
  }

  function previewInView(mode: "director" | "camera") {
    if (!canPlay) return;
    if (cameraMotionPlaying && viewMode === mode) {
      setCameraMotionPlaying(false);
      return;
    }

    setViewMode(mode);
    if (cameraMotionProgress >= 0.999) setCameraMotionProgress(0);
    setCameraMotionPlaying(true);
  }

  function updateSelectedArrivalTime(seconds: number) {
    if (!selectedKeyframe) return;
    const index = motionPath.keyframes.indexOf(selectedKeyframe);
    if (index <= 0 || index >= motionPath.keyframes.length - 1) return;
    const previous = motionPath.keyframes[index - 1];
    const next = motionPath.keyframes[index + 1];
    const minimum = previous.time * motionPath.duration
      + (previous.pointBehavior === "hold" ? previous.holdSeconds ?? 0 : 0)
      + 0.1;
    const maximum = next.time * motionPath.duration - 0.1;
    const clamped = Math.min(maximum, Math.max(minimum, seconds));
    updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, {
      time: clamped / motionPath.duration,
    });
    setCameraMotionProgress(clamped / motionPath.duration);
    setArrivalTimeDraft(clamped.toFixed(1));
  }

  function setCameraSpeedMode(speedMode: "uniform" | "soft" | "custom") {
    const keyframes = speedMode === "custom" && motionPath.speedMode !== "custom" && activeTimingPlan
      ? motionPath.keyframes.map((keyframe, index) => ({
          ...keyframe,
          time: activeTimingPlan.arrivals[index] ?? keyframe.time,
        }))
      : motionPath.keyframes;
    updateCameraMotionPath(activeCamera.id, {
      speedMode,
      easing: speedMode === "uniform" ? "linear" : "ease-in-out",
      ...(speedMode === "custom" ? { customEasing: [0, 0, 1, 1], keyframes } : {}),
    });
  }

  function commitArrivalTimeDraft() {
    const seconds = Number(arrivalTimeDraft);
    if (Number.isFinite(seconds)) updateSelectedArrivalTime(seconds);
    else if (selectedKeyframe) setArrivalTimeDraft((selectedKeyframe.time * motionPath.duration).toFixed(1));
  }

  async function exportReferenceVideo() {
    if (motionPath.keyframes.length < 2 || exporting) return;
    setExporting(true);
    setExportStatus(text("正在录制参考视频...", "Recording reference video..."));
    try {
      const result = await requestReferenceVideoExport({
        fileName: `${activeCamera.name || text("运镜", "camera-motion")}-${text("参考视频", "reference-video")}.mp4`,
        fps: exportFps,
        quality: exportQuality,
      });
      downloadReferenceVideo(result);
      setExportStatus(text("MP4 参考视频已下载", "MP4 reference video downloaded"));
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : text("参考视频导出失败", "Reference video export failed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={`motion-studio${cameraPilotMode !== "idle" ? " is-piloting" : ""}`} aria-label={text("运镜工作台", "Camera motion studio")}>
      <header className="motion-studio-header">
        <div className="motion-studio-heading">
          <span className="motion-studio-icon"><Route aria-hidden="true" size={17} /></span>
          <div>
            <h2>{text("运镜工作台", "Camera Motion Studio")}</h2>
            <p>{text("侧边栏不挡画面 · 无需摆放机位", "Edit without blocking the view · No camera placement required")}</p>
          </div>
        </div>
        <div className="motion-studio-header-actions">
          <button type="button" className="motion-studio-export" aria-label={text("导出运镜", "Export camera motion")} aria-expanded={exportOpen} onClick={() => setExportOpen((current) => !current)}>
            <Download aria-hidden="true" size={14} />{text("导出", "Export")}
          </button>
          <button type="button" className="motion-studio-close" aria-label={text("关闭运镜工作台", "Close camera motion studio")} onClick={() => setMotionStudioOpen(false)}>
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      </header>

      {exportOpen ? (
        <section className="motion-export-panel" aria-label={text("导出运镜设置", "Camera motion export settings")}>
          <div><strong>{text("导出 MP4 参考视频", "Export MP4 reference video")}</strong><small>{text("导出干净的第一视角运镜，不包含轨迹线和操作界面", "Export a clean first-person camera move without paths or controls")}</small></div>
          <label><span>{text("画质", "Quality")}</span><select aria-label={text("参考视频画质", "Reference video quality")} value={exportQuality} onChange={(event) => setExportQuality(event.currentTarget.value as ReferenceVideoExportQuality)}><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
          <label><span>{text("帧率", "Frame rate")}</span><select aria-label={text("参考视频帧率", "Reference video frame rate")} value={exportFps} onChange={(event) => setExportFps(Number(event.currentTarget.value))}><option value="24">24 FPS</option><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label>
          <button type="button" className="motion-export-confirm" disabled={motionPath.keyframes.length < 2 || exporting} onClick={() => void exportReferenceVideo()}><Download aria-hidden="true" size={14} />{exporting ? text("正在录制", "Recording") : text("导出 MP4", "Export MP4")}</button>
          {exportStatus ? <output className="motion-export-status" role="status">{exportStatus}</output> : null}
        </section>
      ) : null}

      <section className="motion-preview-panel" aria-label={text("运镜预览方式", "Camera motion preview mode")}>
        <div className="motion-block-heading">
          <strong>{text("你想怎么看？", "Choose a preview")}</strong>
          <small>{text("路线检查和最终镜头分开预览", "Inspect the route or preview the final shot")}</small>
        </div>
        <div className="motion-preview-options">
          <button
            type="button"
            className={`motion-preview-option is-director${viewMode === "director" ? " is-active" : ""}`}
            disabled={!canPlay}
            aria-label={cameraMotionPlaying && viewMode === "director" ? text("暂停导演视角预演", "Pause director-view preview") : text("播放导演视角预演", "Play director-view preview")}
            aria-pressed={viewMode === "director"}
            onClick={() => previewInView("director")}
          >
            <Route aria-hidden="true" size={17} />
            <span><strong>{cameraMotionPlaying && viewMode === "director" ? text("暂停", "Pause") : text("看路线", "View route")}</strong><small>{text("导演视角看轨迹点", "Inspect waypoints in director view")}</small></span>
            {cameraMotionPlaying && viewMode === "director" ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
          </button>
          <button
            type="button"
            className={`motion-preview-option is-camera${viewMode === "camera" ? " is-active" : ""}`}
            disabled={!canPlay}
            aria-label={cameraMotionPlaying && viewMode === "camera" ? text("暂停第一视角运镜预演", "Pause first-person preview") : text("播放第一视角运镜预演", "Play first-person preview")}
            aria-pressed={viewMode === "camera"}
            onClick={() => previewInView("camera")}
          >
            <Video aria-hidden="true" size={17} />
            <span><strong>{cameraMotionPlaying && viewMode === "camera" ? text("暂停", "Pause") : text("看成片", "View final shot")}</strong><small>{text("第一视角看最终镜头", "Preview the final first-person shot")}</small></span>
            {cameraMotionPlaying && viewMode === "camera" ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
          </button>
        </div>
      </section>

      <div className="motion-studio-body">
        <section className="motion-template-panel" aria-label={text("镜头预设", "Camera presets")}>
          <div className="motion-block-heading">
            <strong>{text("一键镜头", "One-click shot")}</strong>
            <small>{text("选择主体和幅度，再套用镜头", "Choose a subject and range, then apply a shot")}</small>
          </div>
          <div className="motion-template-tabs" role="group" aria-label={text("镜头预设分类", "Camera preset categories")}>
            <button
              type="button"
              aria-pressed={templateGroup === "official"}
              className={templateGroup === "official" ? "is-active" : undefined}
              onClick={() => setTemplateGroup("official")}
              aria-label={text("基础预设", "Basic presets")}
            >{text("基础预设", "Basic presets")} <small>{getCameraPathTemplatesByGroup("official").length}</small></button>
            <button
              type="button"
              aria-pressed={templateGroup === "community"}
              className={templateGroup === "community" ? "is-active" : undefined}
              onClick={() => setTemplateGroup("community")}
              aria-label={text("群友预设", "Community presets")}
            ><Users aria-hidden="true" size={12} />{text("群友预设", "Community presets")} <small>{getCameraPathTemplatesByGroup("community").length}</small></button>
          </div>
          <div className="motion-template-controls">
            <label>
              <span><LocateFixed aria-hidden="true" size={13} />{text("跟踪主体", "Track subject")}</span>
              <select
                aria-label={text("镜头预设跟踪主体", "Preset tracking subject")}
                value={templateTargetObjectId}
                onChange={(event) => updateTemplateTarget(event.currentTarget.value)}
              >
                <option value="">{text("固定当前画面中心", "Lock current frame center")}</option>
                {trackableObjects.map((object) => (
                  <option key={object.id} value={object.id}>{object.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span><Move3D aria-hidden="true" size={13} />{text("轨迹范围", "Path range")}</span>
              <input
                aria-label={text("镜头预设轨迹范围", "Preset path range")}
                type="range"
                min="0.5"
                max="3"
                step="0.25"
                value={templateScale}
                onPointerDown={beginUndoBatch}
                onPointerUp={endUndoBatch}
                onPointerCancel={endUndoBatch}
                onBlur={endUndoBatch}
                onChange={(event) => updateTemplateScale(Number(event.currentTarget.value))}
              />
              <output>{Math.round(templateScale * 100)}%</output>
            </label>
          </div>
          <div className="motion-template-grid">
            {visiblePathTemplates.map((template) => {
              const english = CAMERA_PATH_TEMPLATE_ENGLISH[template.id];
              const label = text(template.label, english.label);
              return (
                <button
                  type="button"
                  key={template.id}
                  className={activeTemplateId === template.id ? "is-active" : undefined}
                  aria-label={text(`套用${template.label}镜头预设`, `Apply ${english.label} camera preset`)}
                  aria-pressed={activeTemplateId === template.id}
                  title={text(template.description, english.description)}
                  onClick={() => applyPathTemplate(template.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {templateGroup === "community" ? (
            <div className="motion-community-template-meta" aria-label={text("群友预设资料", "Community preset details")}>
              {activeTemplate?.group === "community" ? (
                <>
                  <strong>{text(activeTemplate.label, CAMERA_PATH_TEMPLATE_ENGLISH[activeTemplate.id].label)} · v{activeTemplate.version}</strong>
                  <span>{text(activeTemplate.description, CAMERA_PATH_TEMPLATE_ENGLISH[activeTemplate.id].description)}{text("；", "; ")}{text("适合：", "Best for: ")}{text(activeTemplate.suitableFor, CAMERA_PATH_TEMPLATE_ENGLISH[activeTemplate.id].suitableFor)}</span>
                  <span>{text("贡献者：", "Contributor: ")}{activeTemplate.contribution?.contributorName ?? text("待群主补充", "To be added")}</span>
                  <span>{text("许可：", "License: ")}{text(activeTemplate.contribution?.license ?? "", "Built-in implementation based on a community preset concept")}</span>
                  {activeTemplate.contribution?.contact ? <span>{text("联系：", "Contact: ")}{activeTemplate.contribution.contact}</span> : null}
                  {activeTemplate.contribution?.sourceUrl ? <a href={activeTemplate.contribution.sourceUrl} target="_blank" rel="noreferrer">{text("查看来源", "View source")}</a> : null}
                </>
              ) : (
                <span>{text("选择一个群友预设后显示贡献者、来源、版本和许可资料。", "Select a community preset to view its contributor, source, version and license.")}</span>
              )}
            </div>
          ) : null}
        </section>

        <div className="motion-studio-primary-actions">
          <div className="motion-block-heading">
            <strong>{text("制作镜头", "Create a shot")}</strong>
            <small>{text("移动镜头，按 Enter 添加轨迹点", "Move the camera and press Enter to add waypoints")}</small>
          </div>
          <button
            type="button"
            className="motion-primary-button"
            aria-label={text("开始掌镜", "Start camera control")}
            onClick={() => onStartPilot ? onStartPilot(null) : startCameraPilot("pilot")}
          >
            <MousePointer2 aria-hidden="true" size={17} />
            <span><strong>{text("开始掌镜", "Start camera control")}</strong><small>{text("WASD 自由走镜头", "Use WASD to move the camera")}</small></span>
          </button>
          <button type="button" className="motion-add-current" aria-label={text("添加当前视角为轨迹点", "Add current view as waypoint")} onClick={addCurrentView}>
            <Plus aria-hidden="true" size={16} />
            {text("添加当前视角", "Add current view")}
          </button>
        </div>

        <div className="motion-key-help" aria-label={text("掌镜键位说明", "Camera control shortcuts")}>
          <span><kbd>WASD</kbd><small>{text("移动", "Move")}</small></span>
          <span><kbd>E</kbd><small>{text("上升", "Up")}</small></span>
          <span><kbd>Q</kbd><small>{text("下降", "Down")}</small></span>
          <span><kbd>{text("空格", "Space")}</kbd><small>{text("播放 / 暂停人物", "Play / pause characters")}</small></span>
          <span><kbd>{text("鼠标", "Mouse")}</kbd><small>{text("看向", "Look")}</small></span>
          <span><kbd>F</kbd><small>{text("锁定", "Lock")}</small></span>
          <span><kbd>Enter</kbd><small>{text("记录", "Record")}</small></span>
        </div>

        <div className="motion-route-column">
          <div className="motion-route-title">
            <div><Video aria-hidden="true" size={15} /><strong>{text("镜头路线", "Camera route")}</strong><span>{text(`${motionPath.keyframes.length} 个点`, `${motionPath.keyframes.length} points`)}</span></div>
            {motionPath.keyframes.length > 0 ? (
              <button
                type="button"
                className={batchSelectionEnabled ? "is-active" : undefined}
                aria-label={text("批量选择并移动轨迹点", "Select and move multiple waypoints")}
                aria-pressed={batchSelectionEnabled}
                onClick={toggleBatchSelection}
              >
                <Move3D aria-hidden="true" size={13} />
                {text("批量移动", "Move multiple")}
              </button>
            ) : null}
          </div>

          {batchSelectionEnabled ? (
            <div className="motion-batch-selection" aria-label={text("批量轨迹点选择工具", "Waypoint multi-select tools")}>
              <span>{text(`已选 ${selectedCameraKeyframeIds.length} 个点`, `${selectedCameraKeyframeIds.length} points selected`)}</span>
              <small>{text("点下面的数字，可选 1、3、6", "Select waypoint numbers below, such as 1, 3 and 6")}</small>
              <button
                type="button"
                aria-label={text("全选所有轨迹点", "Select all waypoints")}
                onClick={() => setCameraMotionKeyframeSelection(motionPath.keyframes.map((item) => item.id))}
              >{text("全选", "Select all")}</button>
              <button
                type="button"
                aria-label={text("清空轨迹点选择", "Clear waypoint selection")}
                onClick={() => setCameraMotionKeyframeSelection([])}
              >{text("清空", "Clear")}</button>
            </div>
          ) : null}

          {motionPath.keyframes.length === 0 ? (
            <div className="motion-route-empty" role="status">
              <Route aria-hidden="true" size={20} />
              <span>{text("还没有轨迹点", "No waypoints yet")}</span>
              <small>{text("点“开始掌镜”，走到合适的位置按 Enter。", "Select Start camera control, move into position and press Enter.")}</small>
            </div>
          ) : (
            <div className="motion-waypoint-strip" role="list" aria-label={text("可编辑轨迹点", "Editable waypoints")}>
              {motionPath.keyframes.map((keyframe, index) => {
                const selected = selectedKeyframe?.id === keyframe.id;
                const reached = timelinePreviewActive && index <= activeIndex;
                const approaching = timelinePreviewActive && index === activeIndex + 1;
                const trackedObjectName = keyframe.targetMode === "object"
                  ? sceneObjects.find((object) => object.id === keyframe.targetObjectId)?.name ?? null
                  : null;
                return (
                  <div className="motion-waypoint-wrap" key={keyframe.id} role="listitem">
                    {index > 0 ? (
                      <span className="motion-waypoint-link-wrap">
                        <span className={`motion-waypoint-link${timelinePreviewActive && index <= activeIndex ? " is-lit" : ""}`} />
                        <button
                          type="button"
                          className="motion-waypoint-insert"
                          aria-label={text(`在轨迹点 ${index} 和 ${index + 1} 之间插入轨迹点`, `Insert a waypoint between ${index} and ${index + 1}`)}
                          title={text(`在 ${index} 和 ${index + 1} 中间插入`, `Insert between ${index} and ${index + 1}`)}
                          onClick={() => {
                            setBatchSelectionEnabled(false);
                            insertCameraMotionKeyframeAfter(activeCamera.id, motionPath.keyframes[index - 1].id);
                          }}
                        >
                          <Plus aria-hidden="true" size={11} />
                        </button>
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className={`motion-waypoint${(batchSelectionEnabled ? selectedCameraKeyframeIds.includes(keyframe.id) : selected) ? " is-selected" : ""}${reached ? " is-reached" : ""}${approaching ? " is-approaching" : ""}${trackedObjectName ? " has-tracking" : ""}`}
                      aria-label={batchSelectionEnabled ? text(`批量选择轨迹点 ${index + 1}`, `Add waypoint ${index + 1} to selection`) : text(`选择轨迹点 ${index + 1}`, `Select waypoint ${index + 1}`)}
                      aria-pressed={batchSelectionEnabled ? selectedCameraKeyframeIds.includes(keyframe.id) : selected}
                      title={trackedObjectName ? text(`轨迹点 ${index + 1} · 跟踪 ${trackedObjectName}`, `Waypoint ${index + 1} · Tracking ${trackedObjectName}`) : text(`轨迹点 ${index + 1} · 固定朝向`, `Waypoint ${index + 1} · Fixed direction`)}
                      onClick={() => selectWaypoint(keyframe.id, activeTimingPlan?.arrivals[index] ?? keyframe.time)}
                    >
                      <span>{index + 1}</span>
                      <small>{((activeTimingPlan?.arrivals[index] ?? keyframe.time) * motionPath.duration).toFixed(1)}s{trackedObjectName ? text(" · 跟", " · Track") : ""}</small>
                    </button>
                  </div>
                );
              })}
              <button type="button" className="motion-waypoint-add" aria-label={text("添加当前视角为轨迹点", "Add current view as waypoint")} onClick={addCurrentView}>
                <Plus aria-hidden="true" size={16} />
              </button>
            </div>
          )}

          {selectedKeyframe && !batchSelectionEnabled ? (
            <div className="motion-selected-actions" aria-label={text("当前轨迹点操作", "Current waypoint actions")}>
              <span>{text(`轨迹点 ${motionPath.keyframes.indexOf(selectedKeyframe) + 1}`, `Waypoint ${motionPath.keyframes.indexOf(selectedKeyframe) + 1}`)}</span>
              {motionPath.keyframes.indexOf(selectedKeyframe) > 0 && motionPath.keyframes.indexOf(selectedKeyframe) < motionPath.keyframes.length - 1 ? (
                <label className="motion-waypoint-arrival">
                  {text("到达", "Arrival")}
                  <input
                    aria-label={text("当前轨迹点到达时间", "Current waypoint arrival time")}
                    type="number"
                    min={(
                      motionPath.keyframes[motionPath.keyframes.indexOf(selectedKeyframe) - 1].time * motionPath.duration
                      + (motionPath.keyframes[motionPath.keyframes.indexOf(selectedKeyframe) - 1].pointBehavior === "hold"
                        ? motionPath.keyframes[motionPath.keyframes.indexOf(selectedKeyframe) - 1].holdSeconds ?? 0
                        : 0)
                      + 0.1
                    ).toFixed(1)}
                    max={(motionPath.keyframes[motionPath.keyframes.indexOf(selectedKeyframe) + 1].time * motionPath.duration - 0.1).toFixed(1)}
                    step="0.1"
                    value={arrivalTimeDraft}
                    disabled={motionPath.speedMode !== "custom"}
                    onChange={(event) => setArrivalTimeDraft(event.currentTarget.value)}
                    onBlur={commitArrivalTimeDraft}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />{text("秒", "s")}{motionPath.speedMode !== "custom" ? <small>{text("自动", "Auto")}</small> : null}
                </label>
              ) : null}
              <button type="button" onClick={editSelectedWaypoint}><MousePointer2 aria-hidden="true" size={13} />{text("进入此点调整", "Adjust this point")}</button>
              <button
                type="button"
                aria-label={text("轨迹点前移", "Move waypoint earlier")}
                disabled={motionPath.keyframes.indexOf(selectedKeyframe) === 0}
                onClick={() => moveCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, -1)}
              ><ChevronUp aria-hidden="true" size={14} /></button>
              <button
                type="button"
                aria-label={text("轨迹点后移", "Move waypoint later")}
                disabled={motionPath.keyframes.indexOf(selectedKeyframe) === motionPath.keyframes.length - 1}
                onClick={() => moveCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, 1)}
              ><ChevronDown aria-hidden="true" size={14} /></button>
              <button type="button" className="is-danger" aria-label={text("删除当前轨迹点", "Delete current waypoint")} onClick={() => deleteCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id)}>
                <Trash2 aria-hidden="true" size={14} />
              </button>
            </div>
          ) : batchSelectionEnabled ? (
            <div className="motion-batch-move-hint" role="status">
              <Move3D aria-hidden="true" size={14} />
              {selectedCameraKeyframeIds.length > 0
                ? text("在画面里拖动 XYZ 箭头，所选轨迹点会一起移动", "Drag the XYZ handles in the viewport to move selected waypoints together")
                : text("请先点选要一起移动的轨迹点", "Select the waypoints you want to move together")}
            </div>
          ) : null}
        </div>

        <div className="motion-settings-column">
          <div className="motion-block-heading">
            <strong>{text("运镜细节", "Camera motion details")}</strong>
            <small>{text("速度、平滑和主体锁定", "Speed, smoothing and subject lock")}</small>
          </div>
          <label className="motion-setting-row motion-preset-row">
            <span><SlidersHorizontal aria-hidden="true" size={14} />{text("速度与节奏", "Speed and timing")}</span>
            <select
              className="motion-tracking-select"
              aria-label={text("运镜参数预设", "Camera motion parameter preset")}
              value={matchingPreset?.id ?? "custom"}
              onChange={(event) => applyMotionPreset(event.currentTarget.value)}
            >
              <option value="custom" disabled>{text("自定义", "Custom")}</option>
              {CAMERA_MOTION_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{text(preset.label, CAMERA_MOTION_PRESET_ENGLISH[preset.id]?.label ?? preset.label)}</option>
              ))}
            </select>
            <small className="motion-tracking-status">
              {matchingPreset
                ? text(matchingPreset.description, CAMERA_MOTION_PRESET_ENGLISH[matchingPreset.id]?.description ?? matchingPreset.description)
                : text("选择预设不会改变已经摆好的轨迹点", "Selecting a preset will not move existing waypoints")}
            </small>
          </label>
          <label className="motion-setting-row">
            <span><Gauge aria-hidden="true" size={14} />{text("整段时长", "Total duration")}</span>
            <input
              aria-label={text("整段运镜时长", "Total camera motion duration")}
              type="range"
              min="0.5"
              max="30"
              step="0.5"
              value={motionPath.duration}
              onPointerDown={beginUndoBatch}
              onPointerUp={endUndoBatch}
              onPointerCancel={endUndoBatch}
              onBlur={endUndoBatch}
              onChange={(event) => updateCameraMotionPath(activeCamera.id, { duration: Number(event.currentTarget.value) })}
            />
            <output>{motionPath.duration.toFixed(1)}s</output>
          </label>
          <div className="motion-setting-row">
            <span><SlidersHorizontal aria-hidden="true" size={14} />{text("轨迹形状", "Path shape")}</span>
            <div className="motion-mini-segmented" role="group" aria-label={text("轨迹形状", "Path shape")}>
              <button type="button" aria-pressed={motionPath.interpolation === "smooth"} onClick={() => updateCameraMotionPath(activeCamera.id, { interpolation: "smooth" })}>{text("平滑", "Smooth")}</button>
              <button type="button" aria-pressed={motionPath.interpolation === "linear"} onClick={() => updateCameraMotionPath(activeCamera.id, { interpolation: "linear" })}>{text("折线", "Linear")}</button>
            </div>
          </div>
          <div className="motion-setting-row">
            <span><ArrowUp aria-hidden="true" size={14} /><ArrowDown aria-hidden="true" size={14} />{text("速度曲线", "Speed curve")}</span>
            <div className="motion-mini-segmented" role="group" aria-label={text("速度曲线", "Speed curve")}>
              <button type="button" aria-pressed={(motionPath.speedMode ?? (motionPath.easing === "linear" ? "uniform" : "soft")) === "uniform"} onClick={() => setCameraSpeedMode("uniform")}>{text("匀速", "Uniform")}</button>
              <button type="button" aria-pressed={(motionPath.speedMode ?? (motionPath.easing === "linear" ? "uniform" : "soft")) === "soft"} onClick={() => setCameraSpeedMode("soft")}>{text("柔和", "Soft")}</button>
              <button type="button" aria-pressed={motionPath.speedMode === "custom"} onClick={() => setCameraSpeedMode("custom")}>{text("自定义", "Custom")}</button>
            </div>
          </div>
          {motionPath.speedMode === "custom" ? (
            <RouteCustomEasingControl
              curve={motionPath.customEasing}
              label={text("镜头段内节奏", "Segment timing")}
              onChange={(customEasing) => updateCameraMotionPath(activeCamera.id, { customEasing })}
            />
          ) : null}
          <div className="motion-setting-row">
            <span><LocateFixed aria-hidden="true" size={14} />{text("全线防抖", "Path stabilization")}</span>
            <div className="motion-mini-segmented" role="group" aria-label={text("整条镜头路线防抖", "Full camera path stabilization")}>
              <button
                type="button"
                disabled={motionPath.keyframes.length === 0}
                aria-pressed={motionPath.keyframes.length > 0 && stabilizedWaypointCount === 0}
                onClick={() => setAllTrackingStabilization(false)}
              >{text("全部关闭", "All off")}</button>
              <button
                type="button"
                disabled={motionPath.keyframes.length === 0}
                aria-pressed={allWaypointsStabilized}
                onClick={() => setAllTrackingStabilization(true)}
              >{text("全部开启", "All on")}</button>
            </div>
            <small className="motion-tracking-status">
              {motionPath.keyframes.length === 0
                ? text("生成轨迹后可一键设置全部点", "Create a path to configure every waypoint at once")
                : text(`已开启 ${stabilizedWaypointCount} / ${motionPath.keyframes.length} 个点，仍可在下方单独修改`, `${stabilizedWaypointCount} of ${motionPath.keyframes.length} points stabilized; each point can still be adjusted below`)}
            </small>
          </div>
          <div className="motion-setting-row">
            <span><LocateFixed aria-hidden="true" size={14} />{text("此点行为", "Point behavior")}</span>
            <div className="motion-mini-segmented" role="group" aria-label={text("轨迹点行为", "Waypoint behavior")}>
              <button
                type="button"
                disabled={!selectedKeyframe}
                aria-pressed={(selectedKeyframe?.pointBehavior ?? "pass") === "pass"}
                onClick={() => selectedKeyframe && updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, { pointBehavior: "pass", holdSeconds: 0 })}
              >{text("经过", "Pass")}</button>
              <button
                type="button"
                disabled={!selectedKeyframe || motionPath.keyframes.indexOf(selectedKeyframe) === motionPath.keyframes.length - 1}
                aria-pressed={selectedKeyframe?.pointBehavior === "hold"}
                onClick={() => selectedKeyframe && updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, { pointBehavior: "hold", holdSeconds: selectedKeyframe.holdSeconds || 1 })}
              >{text("停留", "Hold")}</button>
            </div>
            <small className="motion-tracking-status">
              {!selectedKeyframe
                ? text("先选择一个轨迹点", "Select a waypoint first")
                : selectedKeyframe.pointBehavior === "hold"
                  ? text("镜头到这里后暂停", "The camera pauses at this point")
                  : text("镜头连续通过，不会自动刹停", "The camera passes through without stopping")}
            </small>
          </div>
          {selectedKeyframe?.pointBehavior === "hold" ? (
            <label className="motion-setting-row">
              <span><Pause aria-hidden="true" size={14} />{text("停留时长", "Hold duration")}</span>
              <input
                aria-label={text("轨迹点停留时长", "Waypoint hold duration")}
                type="range"
                min="0.1"
                max={motionPath.duration}
                step="0.1"
                value={selectedKeyframe.holdSeconds ?? 1}
                onPointerDown={beginUndoBatch}
                onPointerUp={endUndoBatch}
                onPointerCancel={endUndoBatch}
                onBlur={endUndoBatch}
                onChange={(event) => updateCameraMotionKeyframe(activeCamera.id, selectedKeyframe.id, { holdSeconds: Number(event.currentTarget.value) })}
              />
              <output>{(selectedKeyframe.holdSeconds ?? 1).toFixed(1)}s</output>
            </label>
          ) : null}
          <div className="motion-setting-row">
            <span><MousePointer2 aria-hidden="true" size={14} />{text("此点跟踪", "Point tracking")}</span>
            <select
              className="motion-tracking-select"
              aria-label={text("轨迹点跟踪主体", "Waypoint tracking subject")}
              value={trackingObjectId}
              disabled={!selectedKeyframe}
              onChange={(event) => setTrackingObject(event.currentTarget.value)}
            >
              <option value="">{text("不跟踪（固定朝向）", "No tracking (fixed direction)")}</option>
              {trackableObjects.map((object) => (
                <option key={object.id} value={object.id}>{object.name}</option>
              ))}
            </select>
            <small className="motion-tracking-status">
              {!selectedKeyframe
                ? text("先在上方选择一个轨迹点", "Select a waypoint above first")
                : trackingObjectId
                  ? text("这个点会实时看向所选主体", "This point looks at the selected subject in real time")
                  : text("这个点使用自己保存的固定朝向", "This point uses its saved fixed direction")}
            </small>
          </div>
          {trackingObject?.kind === "character" ? (
            <label className="motion-setting-row">
              <span><LocateFixed aria-hidden="true" size={14} />{text("跟踪部位", "Tracking point")}</span>
              <select
                className="motion-tracking-select"
                aria-label={text("轨迹点跟踪身体部位", "Waypoint tracked body part")}
                value={trackingBodyPart}
                onChange={(event) => setTrackingBodyPart(event.currentTarget.value as DirectorCameraTargetBodyPart)}
              >
                {DIRECTOR_CAMERA_TARGET_BODY_PART_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{text(option.label, CAMERA_TARGET_BODY_PART_ENGLISH[option.value])}</option>
                ))}
              </select>
              <small className="motion-tracking-status">{text("读取当前动作执行后的真实骨骼位置", "Uses the actual bone position after animation is applied")}</small>
            </label>
          ) : trackingObject ? (
            <div className="motion-setting-row">
              <span><LocateFixed aria-hidden="true" size={14} />{text("跟踪部位", "Tracking point")}</span>
              <strong>{text("物体中心", "Object center")}</strong>
              <small className="motion-tracking-status">{text("普通物体会跟踪整体中心", "Regular objects are tracked from their center")}</small>
            </div>
          ) : null}
          {trackingObject ? (
            <div className="motion-setting-row">
              <span><Gauge aria-hidden="true" size={14} />{text("响应速度", "Response speed")}</span>
              <div className="motion-mini-segmented" role="group" aria-label={text("轨迹点跟随响应速度", "Waypoint tracking response speed")}>
                <button
                  type="button"
                  aria-pressed={trackingFollowMode === "immediate"}
                  onClick={() => setTrackingFollowMode("immediate")}
                >{text("立即", "Immediate")}</button>
                <button
                  type="button"
                  aria-pressed={trackingFollowMode === "smooth"}
                  onClick={() => setTrackingFollowMode("smooth")}
                >{text("柔和", "Smooth")}</button>
              </div>
              <small className="motion-tracking-status">
                {trackingFollowMode === "smooth"
                  ? text("柔和追上目标，镜头转向更舒缓", "Ease toward the target for gentler turns")
                  : text("立即看向目标，响应最快", "Look at the target immediately for the fastest response")}
              </small>
            </div>
          ) : null}
          {trackingObject?.kind === "character" ? (
            <div className="motion-setting-row">
              <span><LocateFixed aria-hidden="true" size={14} />{text("镜头防抖", "Camera stabilization")}</span>
              <div className="motion-mini-segmented" role="group" aria-label={text("镜头跟踪抖动", "Camera tracking stabilization")}>
                <button
                  type="button"
                  aria-pressed={!trackingStabilizationEnabled}
                  onClick={() => setTrackingStabilization(false)}
                >{text("保留抖动", "Keep motion")}</button>
                <button
                  type="button"
                  aria-pressed={trackingStabilizationEnabled}
                  onClick={() => setTrackingStabilization(true)}
                >{text("开启防抖", "Stabilize")}</button>
              </div>
              <small className="motion-tracking-status">
                {trackingStabilizationEnabled
                  ? text("过滤走路和肢体动作造成的细碎晃动", "Filter small movements caused by walking and limb animation")
                  : text("保留身体部位的真实运动感", "Keep the natural motion of the tracked body part")}
              </small>
            </div>
          ) : null}
          <div className="motion-setting-row">
            <span><MousePointer2 aria-hidden="true" size={14} />{text("掌镜锁定", "Camera lock")}</span>
            <div className="motion-mini-segmented" role="group" aria-label={text("主体锁定方式", "Subject lock mode")}>
              <button
                type="button"
                aria-label={text("锁定后只保持看向主体", "Keep looking at the subject after locking")}
                aria-pressed={!cameraPilotFollowTarget}
                onClick={() => setCameraPilotFollowTarget(false)}
              >{text("只看向", "Look only")}</button>
              <button
                type="button"
                aria-label={text("锁定后跟随主体移动", "Follow the subject after locking")}
                aria-pressed={cameraPilotFollowTarget}
                onClick={() => setCameraPilotFollowTarget(true)}
              >{text("跟随移动", "Follow movement")}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
