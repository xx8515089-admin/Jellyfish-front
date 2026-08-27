import { Camera, Download, Eye, Images, Pause, Play, Plus, Route, Send, Trash2, Waypoints, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  InspectorAxisGroup,
  InspectorPanel,
  InspectorRangeNumberField,
  InspectorSection,
  InspectorSelectField,
  InspectorTextField,
} from "./InspectorControls";
import { requestViewportCapture } from "../io/captureBridge";
import { downloadDataUrl } from "../io/screenshotExport";
import { postDirectorDeskCapturesToHost } from "../io/hostBridge";
import { getDirectorObjectFocusTarget, isCameraFocusableObject } from "../schema/cameraTarget";
import type { DirectorCameraCapture, DirectorCameraShot } from "../schema/directorProject";
import { getCameraMotionPath, getCameraMotionTimingPlan } from "../schema/cameraMotion";
import { useDirectorStore } from "../store/directorStore";
import { useDirectorDeskText } from "../../useDirectorDeskText";

const VIEWER_ZOOM_MIN = 0.25;
const VIEWER_ZOOM_MAX = 5;
const VIEWER_ZOOM_STEP = 0.25;
const CAMERA_MOTION_DURATION_MIN = 0.5;
const CAMERA_MOTION_DURATION_MAX = 30;
const CAMERA_MOTION_FOV_MIN = 10;
const CAMERA_MOTION_FOV_MAX = 120;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function replaceAxis(tuple: [number, number, number], axis: 0 | 1 | 2, value: number): [number, number, number] {
  return tuple.map((item, index) => (index === axis ? value : item)) as [number, number, number];
}

export function CameraPanel() {
  const camera = useDirectorStore((state) =>
    state.project.cameras.find((item) => item.id === state.project.activeCameraId)
  );

  if (!camera) return null;

  return <CameraPanelContent key={camera.id} camera={camera} />;
}

function CameraPanelContent({ camera }: { camera: DirectorCameraShot }) {
  const text = useDirectorDeskText();
  const [activeTab, setActiveTab] = useState<"properties" | "motion" | "captures">("properties");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [hoveredCaptureId, setHoveredCaptureId] = useState<string | null>(null);
  const [viewerCapture, setViewerCapture] = useState<DirectorCameraCapture | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  const [viewerOffset, setViewerOffset] = useState({ x: 0, y: 0 });
  const [viewerDragging, setViewerDragging] = useState(false);
  const [motionDurationDraft, setMotionDurationDraft] = useState("6");
  const [motionFovDraft, setMotionFovDraft] = useState("50");
  const viewerDragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const allCameras = useDirectorStore((state) => state.project.cameras);
  const cameras = useMemo(() => allCameras.filter((item) => !item.isVirtual), [allCameras]);
  const objects = useDirectorStore((state) => state.project.objects);
  const setActiveCamera = useDirectorStore((state) => state.setActiveCamera);
  const addCameraCaptures = useDirectorStore((state) => state.addCameraCaptures);
  const updateCamera = useDirectorStore((state) => state.updateCamera);
  const selectedCameraKeyframeId = useDirectorStore((state) => state.selectedCameraKeyframeId);
  const cameraMotionProgress = useDirectorStore((state) => state.cameraMotionProgress);
  const cameraMotionPlaying = useDirectorStore((state) => state.cameraMotionPlaying);
  const selectCameraMotionKeyframe = useDirectorStore((state) => state.selectCameraMotionKeyframe);
  const addCameraMotionKeyframe = useDirectorStore((state) => state.addCameraMotionKeyframe);
  const updateCameraMotionKeyframe = useDirectorStore((state) => state.updateCameraMotionKeyframe);
  const deleteCameraMotionKeyframe = useDirectorStore((state) => state.deleteCameraMotionKeyframe);
  const updateCameraMotionPath = useDirectorStore((state) => state.updateCameraMotionPath);
  const setCameraMotionProgress = useDirectorStore((state) => state.setCameraMotionProgress);
  const setCameraMotionPlaying = useDirectorStore((state) => state.setCameraMotionPlaying);
  const setViewMode = useDirectorStore((state) => state.setViewMode);

  const currentCamera = camera;
  const captures = useMemo(() => currentCamera.captures ?? [], [currentCamera.captures]);
  const cameraCaptureGroups = useMemo(
    () =>
      cameras.map((item) => ({
        camera: item,
        captures: item.captures ?? [],
      })),
    [cameras]
  );
  const hasAnyCameraCapture = cameraCaptureGroups.some((group) => group.captures.length > 0);
  const focusableObjects = useMemo(() => objects.filter(isCameraFocusableObject), [objects]);
  const targetSelectValue =
    currentCamera.targetMode === "object" && currentCamera.targetObjectId
      ? `object:${currentCamera.targetObjectId}`
      : "manual";
  const motionPath = useMemo(() => getCameraMotionPath(currentCamera), [currentCamera]);
  const motionTimingPlan = useMemo(() => getCameraMotionTimingPlan(currentCamera), [currentCamera]);
  const selectedMotionKeyframe =
    motionPath.keyframes.find((item) => item.id === selectedCameraKeyframeId) ?? motionPath.keyframes[0] ?? null;

  useEffect(() => {
    setMotionDurationDraft(String(motionPath.duration));
  }, [currentCamera.id, motionPath.duration]);

  useEffect(() => {
    setMotionFovDraft(selectedMotionKeyframe ? String(selectedMotionKeyframe.fov) : "");
  }, [selectedMotionKeyframe?.fov, selectedMotionKeyframe?.id]);

  useEffect(() => {
    if (!viewerCapture) {
      setViewerScale(1);
      setViewerOffset({ x: 0, y: 0 });
      setViewerDragging(false);
      viewerDragStateRef.current = null;
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setViewerCapture(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerCapture]);

  useEffect(() => {
    if (viewerScale <= 1) {
      setViewerOffset({ x: 0, y: 0 });
      setViewerDragging(false);
      viewerDragStateRef.current = null;
    }
  }, [viewerScale]);

  useEffect(() => {
    if (!viewerDragging) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const dragState = viewerDragStateRef.current;
      if (!dragState) {
        return;
      }

      setViewerOffset({
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY,
      });
    }

    function handleMouseUp() {
      setViewerDragging(false);
      viewerDragStateRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [viewerDragging]);

  const clampViewerScale = useCallback((value: number) => {
    return Math.min(VIEWER_ZOOM_MAX, Math.max(VIEWER_ZOOM_MIN, value));
  }, []);

  const updateViewerScale = useCallback((updater: (currentScale: number) => number) => {
    setViewerScale((currentScale) => clampViewerScale(Number(updater(currentScale).toFixed(2))));
  }, [clampViewerScale]);

  const sendCaptureToCanvas = useCallback((capture: DirectorCameraCapture) => {
    postDirectorDeskCapturesToHost([
      {
        dataUrl: capture.dataUrl,
        fileName: `${capture.name}.png`,
      },
    ]);
  }, []);

  const sendAllCapturesToCanvas = useCallback(() => {
    postDirectorDeskCapturesToHost(
      cameraCaptureGroups.flatMap((group) =>
        group.captures.map((capture) => ({
          dataUrl: capture.dataUrl,
          fileName: `${capture.name}.png`,
        }))
      )
    );
  }, [cameraCaptureGroups]);

  async function handleCameraCapture() {
    try {
      setCaptureError(null);
      const results = await requestViewportCapture({
        preset: "current",
        source: "camera-panel",
        cameraId: currentCamera.id,
      });
      const preview = results[0];
      if (preview) {
        addCameraCaptures(currentCamera.id, [preview.dataUrl]);
      }
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : text("机位截图失败", "Camera capture failed"));
    }
  }

  function handleDeleteCapture(captureId: string) {
    const captureCamera = cameras.find((item) => (item.captures ?? []).some((capture) => capture.id === captureId));
    if (!captureCamera) return;

    const nextCaptures = (captureCamera.captures ?? []).filter((item) => item.id !== captureId);
    updateCamera(captureCamera.id, {
      captures: nextCaptures,
      lastCaptureUrl: nextCaptures[nextCaptures.length - 1]?.dataUrl ?? null,
    });
    setHoveredCaptureId((current) => (current === captureId ? null : current));
    setViewerCapture((current) => (current?.id === captureId ? null : current));
  }

  function handleClearAllCaptures() {
    cameras.forEach((item) => {
      if ((item.captures ?? []).length === 0 && !item.lastCaptureUrl) return;

      updateCamera(item.id, {
        captures: [],
        lastCaptureUrl: null,
      });
    });
    setHoveredCaptureId(null);
    setViewerCapture(null);
  }

  function handleViewerZoom(direction: "in" | "out") {
    updateViewerScale((current) => current + (direction === "in" ? VIEWER_ZOOM_STEP : -VIEWER_ZOOM_STEP));
  }

  function handleViewerWheel(event: React.WheelEvent<HTMLImageElement>) {
    event.preventDefault();
    event.stopPropagation();
    updateViewerScale((current) => current + (event.deltaY < 0 ? VIEWER_ZOOM_STEP : -VIEWER_ZOOM_STEP));
  }

  function handleViewerMouseDown(event: React.MouseEvent<HTMLImageElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (viewerScale <= 1) {
      return;
    }

    viewerDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: viewerOffset.x,
      originY: viewerOffset.y,
    };
    setViewerDragging(true);
  }

  function closeViewer() {
    setViewerCapture(null);
  }

  function handleTargetSelection(value: string) {
    if (value === "manual") {
      updateCamera(currentCamera.id, {
        targetMode: "manual",
        targetObjectId: null,
      });
      return;
    }

    const objectId = value.replace(/^object:/, "");
    const targetObject = focusableObjects.find((item) => item.id === objectId);

    if (!targetObject) {
      updateCamera(currentCamera.id, {
        targetMode: "manual",
        targetObjectId: null,
      });
      return;
    }

    updateCamera(currentCamera.id, {
      targetMode: "object",
      targetObjectId: targetObject.id,
      target: getDirectorObjectFocusTarget(targetObject),
    });
  }

  function updateManualTarget(axis: 0 | 1 | 2, value: string) {
    updateCamera(currentCamera.id, {
      targetMode: "manual",
      targetObjectId: null,
      target: replaceAxis(currentCamera.target, axis, Number(value)),
    });
  }

  function handleAddMotionKeyframe() {
    const keyframeId = addCameraMotionKeyframe(currentCamera.id);
    if (!keyframeId) return;
    setActiveTab("motion");
    setViewMode("director");
  }

  function handleOpenMotionTab() {
    setActiveTab("motion");
    setViewMode("director");

    if (selectedCameraKeyframeId && motionPath.keyframes.some((item) => item.id === selectedCameraKeyframeId)) {
      return;
    }

    const firstKeyframe = motionPath.keyframes[0];
    if (!firstKeyframe) return;
    selectCameraMotionKeyframe(firstKeyframe.id);
    setCameraMotionProgress(firstKeyframe.time);
  }

  function handleSelectMotionKeyframe(keyframeId: string, time: number) {
    selectCameraMotionKeyframe(keyframeId);
    setCameraMotionProgress(time);
    setCameraMotionPlaying(false);
    setViewMode("director");
  }

  function handleToggleMotionPlayback() {
    if (motionPath.keyframes.length < 2) return;
    if (cameraMotionProgress >= 0.999) setCameraMotionProgress(0);
    setViewMode("camera");
    setCameraMotionPlaying(!cameraMotionPlaying);
  }

  function updateSelectedMotionPosition(axis: 0 | 1 | 2, value: string) {
    if (!selectedMotionKeyframe) return;
    updateCameraMotionKeyframe(currentCamera.id, selectedMotionKeyframe.id, {
      position: replaceAxis(selectedMotionKeyframe.position, axis, Number(value)),
    });
  }

  function commitMotionDuration(value: string) {
    const parsed = Number(value);
    const nextDuration = Number.isFinite(parsed)
      ? clampNumber(parsed, CAMERA_MOTION_DURATION_MIN, CAMERA_MOTION_DURATION_MAX)
      : motionPath.duration;
    updateCameraMotionPath(currentCamera.id, { duration: nextDuration });
    setMotionDurationDraft(String(nextDuration));
  }

  function commitSelectedMotionFov(value: string) {
    if (!selectedMotionKeyframe) return;
    const parsed = Number(value);
    const nextFov = Number.isFinite(parsed)
      ? clampNumber(parsed, CAMERA_MOTION_FOV_MIN, CAMERA_MOTION_FOV_MAX)
      : selectedMotionKeyframe.fov;
    updateCameraMotionKeyframe(currentCamera.id, selectedMotionKeyframe.id, { fov: nextFov });
    setMotionFovDraft(String(nextFov));
  }

  function formatMotionTime(time: number) {
    return `${(time * motionPath.duration).toFixed(1)}s`;
  }

  function renderCaptureCards(captureList: DirectorCameraCapture[]) {
    return (
      <div className="camera-capture-grid" aria-label={text("相机截图列表", "Camera capture list")}>
        {captureList.map((capture) => {
          const captureActive = hoveredCaptureId === capture.id;

          return (
            <div key={capture.id} className="camera-capture-card">
              <div
                className="camera-capture-thumb-wrap"
                onClick={() => setViewerCapture(capture)}
                onMouseEnter={() => setHoveredCaptureId(capture.id)}
                onMouseLeave={() => setHoveredCaptureId((current) => (current === capture.id ? null : current))}
              >
                <img
                  className="camera-capture-thumb"
                  alt={text(`${capture.name} 缩略图`, `${capture.name} thumbnail`)}
                  src={capture.dataUrl}
                />
                <div
                  aria-label={text(`${capture.name} 缩略图操作`, `${capture.name} thumbnail actions`)}
                  className={`camera-capture-actions${captureActive ? " is-visible" : ""}`}
                  role="group"
                >
                  <button
                    aria-label={text(`删除截图 ${capture.name}`, `Delete capture ${capture.name}`)}
                    className="camera-capture-action"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteCapture(capture.id);
                    }}
                  >
                    <Trash2 aria-hidden="true" size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    aria-label={text(`发送到画布 ${capture.name}`, `Send ${capture.name} to canvas`)}
                    className="camera-capture-action"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      sendCaptureToCanvas(capture);
                    }}
                  >
                    <Send aria-hidden="true" size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    aria-label={text(`查看截图 ${capture.name}`, `View capture ${capture.name}`)}
                    className="camera-capture-action"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setViewerCapture(capture);
                    }}
                  >
                    <Eye aria-hidden="true" size={14} strokeWidth={1.9} />
                  </button>
                </div>
              </div>
              <span className="camera-capture-name">{capture.name}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCurrentCameraCaptureGrid() {
    if (captures.length === 0) {
      return (
        <div className="capture-list-placeholder">
          {text(
            "当前还没有机位截图，可先从当前机位生成一张预览。",
            "No captures for this camera yet. Create a preview from the current camera first.",
          )}
        </div>
      );
    }

    return renderCaptureCards(captures);
  }

  function renderCaptureEmptyState() {
    return (
      <div
        className="camera-capture-empty object-search-empty-state"
        role="status"
        aria-label={text("暂无摄像机截图", "No camera captures")}
      >
        <span className="object-search-empty-icon" data-testid="camera-capture-empty-icon">
          <Images aria-hidden="true" size={16} strokeWidth={1.8} />
        </span>
        <span>{text("暂无摄像机截图", "No camera captures")}</span>
      </div>
    );
  }

  function renderAllCameraCaptures() {
    return (
      <div className="camera-capture-overview">
        <div className="camera-capture-overview-scroll">
          {hasAnyCameraCapture ? (
            cameraCaptureGroups
              .filter((group) => group.captures.length > 0)
              .map((group) => (
                <section
                  key={group.camera.id}
                  aria-label={text(`${group.camera.name}截图`, `${group.camera.name} captures`)}
                  className="camera-capture-group"
                >
                  <h3>{text(`${group.camera.name}截图`, `${group.camera.name} captures`)}</h3>
                  {renderCaptureCards(group.captures)}
                </section>
              ))
          ) : (
            renderCaptureEmptyState()
          )}
        </div>
      </div>
    );
  }

  function renderCaptureOverviewFooter() {
    if (activeTab !== "captures") {
      return null;
    }

    return (
      <div className="camera-capture-overview-footer">
        <button className="camera-capture-clear-all" type="button" onClick={handleClearAllCaptures}>
          <Trash2 aria-hidden="true" data-testid="camera-capture-clear-icon" size={14} strokeWidth={1.9} />
          <span>{text("清空全部", "Clear all")}</span>
        </button>
        <button
          className="camera-capture-send-all viewport-toolbar-crowd-confirm"
          type="button"
          onClick={sendAllCapturesToCanvas}
        >
          <Send aria-hidden="true" data-testid="camera-capture-send-icon" size={14} strokeWidth={1.9} />
          <span>{text("发送到画布", "Send to canvas")}</span>
        </button>
      </div>
    );
  }

  function renderViewer() {
    if (!viewerCapture || typeof document === "undefined") {
      return null;
    }

    const viewerImageClassName = [
      "camera-capture-viewer-image",
      viewerScale > 1 ? "is-zoomed" : "",
      viewerDragging ? "is-dragging" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return createPortal(
      <div
        aria-label={text("相机截图查看器", "Camera capture viewer")}
        aria-modal="true"
        className="camera-capture-viewer"
        role="dialog"
        onClick={closeViewer}
      >
        <div
          aria-label={text("相机截图查看器工具栏", "Camera capture viewer toolbar")}
          className="camera-capture-viewer-toolbar"
          role="toolbar"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-label={text("放大图片", "Zoom in")}
            className="camera-capture-viewer-tool"
            type="button"
            onClick={() => handleViewerZoom("in")}
          >
            <ZoomIn aria-hidden="true" size={18} strokeWidth={2} />
          </button>
          <button
            aria-label={text("缩小图片", "Zoom out")}
            className="camera-capture-viewer-tool"
            type="button"
            onClick={() => handleViewerZoom("out")}
          >
            <ZoomOut aria-hidden="true" size={18} strokeWidth={2} />
          </button>
          <button
            aria-label={text("下载图片", "Download image")}
            className="camera-capture-viewer-tool"
            type="button"
            onClick={() => downloadDataUrl(viewerCapture.dataUrl, `${viewerCapture.name}.png`)}
          >
            <Download aria-hidden="true" size={18} strokeWidth={2} />
          </button>
          <button
            aria-label={text("关闭相机截图查看器", "Close camera capture viewer")}
            className="camera-capture-viewer-tool camera-capture-viewer-close"
            type="button"
            onClick={closeViewer}
          >
            <X aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="camera-capture-viewer-stage">
          <img
            className={viewerImageClassName}
            alt={text(`${viewerCapture.name} 查看大图`, `View ${viewerCapture.name}`)}
            src={viewerCapture.dataUrl}
            style={{ transform: `translate(${viewerOffset.x}px, ${viewerOffset.y}px) scale(${viewerScale})` }}
            onClick={(event) => event.stopPropagation()}
            onWheel={handleViewerWheel}
            onMouseDown={handleViewerMouseDown}
            draggable={false}
          />
        </div>
      </div>,
      document.body
    );
  }

  function renderMotionEditor() {
    return (
      <div className="camera-motion-tab">
        <div className="camera-motion-intro">
          <span className="camera-motion-intro-icon"><Route aria-hidden="true" size={18} /></span>
          <div>
            <h3>{text("自由摄影机轨迹", "Free camera path")}</h3>
            <p>{text(
              "先移动当前机位，再添加轨迹点；橙色轨迹点可直接在 3D 视口中拖动。",
              "Move the current camera, then add a path point. Orange points can be dragged directly in the 3D viewport.",
            )}</p>
          </div>
        </div>

        <button className="camera-motion-add-button" type="button" onClick={handleAddMotionKeyframe}>
          <Plus aria-hidden="true" size={15} />
          {text("将当前机位添加为轨迹点", "Add current camera as path point")}
        </button>

        {motionPath.keyframes.length === 0 ? (
          <div className="camera-motion-empty" role="status">
            <Waypoints aria-hidden="true" size={22} />
            <strong>{text("还没有摄影机轨迹", "No camera path yet")}</strong>
            <span>{text(
              "添加两个或更多轨迹点后，即可预演任意推、拉、摇、移和环绕路线。",
              "Add two or more path points to preview dolly, pan, truck, and orbit movements.",
            )}</span>
          </div>
        ) : (
          <>
            <InspectorRangeNumberField
              label={text("镜头时长", "Shot duration")}
              rangeAriaLabel={text("摄影机轨迹时长滑杆", "Camera path duration slider")}
              numberAriaLabel={text("摄影机轨迹时长", "Camera path duration")}
              min="0.5"
              max="30"
              step="0.1"
              value={motionDurationDraft}
              onValueChange={commitMotionDuration}
              onRangeChange={commitMotionDuration}
              onNumberBlur={commitMotionDuration}
              onNumberChange={setMotionDurationDraft}
            />
            <InspectorSelectField
              label={text("路径插值", "Path interpolation")}
              ariaLabel={text("摄影机路径插值", "Camera path interpolation")}
              value={motionPath.interpolation}
              onChange={(value) => updateCameraMotionPath(currentCamera.id, { interpolation: value === "linear" ? "linear" : "smooth" })}
            >
              <option value="smooth">{text("平滑曲线", "Smooth curve")}</option>
              <option value="linear">{text("直线分段", "Linear segments")}</option>
            </InspectorSelectField>

            <div className="camera-motion-playback">
              <button
                className="camera-motion-play-button"
                type="button"
                disabled={motionPath.keyframes.length < 2}
                aria-label={cameraMotionPlaying
                  ? text("暂停轨迹预演", "Pause path preview")
                  : text("播放轨迹预演", "Play path preview")}
                onClick={handleToggleMotionPlayback}
              >
                {cameraMotionPlaying ? <Pause aria-hidden="true" size={15} /> : <Play aria-hidden="true" size={15} />}
              </button>
              <input
                aria-label={text("摄影机轨迹播放位置", "Camera path playback position")}
                max="1"
                min="0"
                step="0.001"
                type="range"
                value={cameraMotionProgress}
                onChange={(event) => {
                  setCameraMotionPlaying(false);
                  setCameraMotionProgress(Number(event.currentTarget.value));
                  setViewMode("camera");
                }}
              />
              <span>{formatMotionTime(cameraMotionProgress)} / {motionPath.duration.toFixed(1)}s</span>
            </div>

            <button
              className={`camera-motion-loop-button${motionPath.loop ? " is-active" : ""}`}
              type="button"
              aria-pressed={motionPath.loop}
              onClick={() => updateCameraMotionPath(currentCamera.id, { loop: !motionPath.loop })}
            >
              {text("循环播放", "Loop playback")}
            </button>

            <div className="camera-motion-keyframes" role="list" aria-label={text("摄影机轨迹点", "Camera path points")}>
              {motionPath.keyframes.map((keyframe, index) => (
                <div key={keyframe.id} role="listitem">
                  <button
                    className={selectedMotionKeyframe?.id === keyframe.id ? "is-active" : ""}
                    type="button"
                    aria-label={text(`选择轨迹点 K${index + 1}`, `Select path point K${index + 1}`)}
                    aria-pressed={selectedMotionKeyframe?.id === keyframe.id}
                    onClick={() => handleSelectMotionKeyframe(
                      keyframe.id,
                      motionTimingPlan?.arrivals[index] ?? keyframe.time
                    )}
                  >
                    <span>K{index + 1}</span>
                    <small>{formatMotionTime(motionTimingPlan?.arrivals[index] ?? keyframe.time)}</small>
                  </button>
                </div>
              ))}
            </div>

            {selectedMotionKeyframe ? (
              <InspectorSection
                title={text(
                  `轨迹点 K${motionPath.keyframes.indexOf(selectedMotionKeyframe) + 1}`,
                  `Path point K${motionPath.keyframes.indexOf(selectedMotionKeyframe) + 1}`,
                )}
                className="camera-motion-keyframe-editor"
              >
                <InspectorAxisGroup
                  label={text("位置", "Position")}
                  axes={[
                    { axis: "X", ariaLabel: text("轨迹点位置 X", "Path point position X"), value: selectedMotionKeyframe.position[0], onChange: (value) => updateSelectedMotionPosition(0, value) },
                    { axis: "Y", ariaLabel: text("轨迹点位置 Y", "Path point position Y"), value: selectedMotionKeyframe.position[1], onChange: (value) => updateSelectedMotionPosition(1, value) },
                    { axis: "Z", ariaLabel: text("轨迹点位置 Z", "Path point position Z"), value: selectedMotionKeyframe.position[2], onChange: (value) => updateSelectedMotionPosition(2, value) },
                  ]}
                />
                <InspectorRangeNumberField
                  label={text("此点视野角度 (FOV)", "Point field of view (FOV)")}
                  rangeAriaLabel={text("轨迹点 FOV 滑杆", "Path point FOV slider")}
                  numberAriaLabel={text("轨迹点 FOV", "Path point FOV")}
                  min="10"
                  max="120"
                  step="0.1"
                  value={motionFovDraft}
                  onValueChange={commitSelectedMotionFov}
                  onRangeChange={commitSelectedMotionFov}
                  onNumberBlur={commitSelectedMotionFov}
                  onNumberChange={setMotionFovDraft}
                />
                <button
                  className="camera-motion-delete-button"
                  type="button"
                  onClick={() => deleteCameraMotionKeyframe(currentCamera.id, selectedMotionKeyframe.id)}
                >
                  <Trash2 aria-hidden="true" size={14} /> {text("删除当前轨迹点", "Delete current path point")}
                </button>
              </InspectorSection>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <InspectorPanel
      title={text("摄像机", "Camera")}
      ariaLabel={text("摄像机右侧属性面板", "Camera properties panel")}
      className={activeTab === "captures" ? "camera-inspector-captures" : undefined}
      footer={renderCaptureOverviewFooter()}
      tabs={[
        { label: text("属性", "Properties"), active: activeTab === "properties", onClick: () => setActiveTab("properties") },
        { label: text("轨迹", "Path"), active: activeTab === "motion", onClick: handleOpenMotionTab },
        { label: text("摄像机截图", "Captures"), active: activeTab === "captures", onClick: () => setActiveTab("captures") },
      ]}
    >
      {activeTab === "properties" ? (
        <>
          <InspectorTextField
            label={text("名称", "Name")}
            ariaLabel={text("机位名称", "Camera name")}
            value={currentCamera.name}
            onChange={(value) => updateCamera(currentCamera.id, { name: value })}
          />
          <InspectorSelectField
            label={text("切换机位", "Switch camera")}
            ariaLabel={text("切换机位", "Switch camera")}
            value={currentCamera.id}
            onChange={(value) => setActiveCamera(value)}
          >
            {cameras.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </InspectorSelectField>
          <InspectorAxisGroup
            label={text("位置", "Position")}
            axes={[
              {
                axis: "X",
                ariaLabel: text("机位位置 X", "Camera position X"),
                value: currentCamera.transform.position[0],
                onChange: (value) =>
                  updateCamera(currentCamera.id, {
                    transform: {
                      ...currentCamera.transform,
                      position: replaceAxis(currentCamera.transform.position, 0, Number(value)),
                    },
                  }),
              },
              {
                axis: "Y",
                ariaLabel: text("机位位置 Y", "Camera position Y"),
                value: currentCamera.transform.position[1],
                onChange: (value) =>
                  updateCamera(currentCamera.id, {
                    transform: {
                      ...currentCamera.transform,
                      position: replaceAxis(currentCamera.transform.position, 1, Number(value)),
                    },
                  }),
              },
              {
                axis: "Z",
                ariaLabel: text("机位位置 Z", "Camera position Z"),
                value: currentCamera.transform.position[2],
                onChange: (value) =>
                  updateCamera(currentCamera.id, {
                    transform: {
                      ...currentCamera.transform,
                      position: replaceAxis(currentCamera.transform.position, 2, Number(value)),
                    },
                  }),
              },
            ]}
          />
          <InspectorSelectField
            label={text("注视目标", "Look-at target")}
            ariaLabel={text("注视目标模式", "Look-at target mode")}
            value={targetSelectValue}
            onChange={handleTargetSelection}
          >
            <option value="manual">{text("手动坐标", "Manual coordinates")}</option>
            {focusableObjects.map((item) => (
              <option key={item.id} value={`object:${item.id}`}>
                {item.name}
              </option>
            ))}
          </InspectorSelectField>
          <InspectorAxisGroup
            label={text("注视坐标", "Look-at coordinates")}
            axes={[
              {
                axis: "X",
                ariaLabel: text("注视坐标 X", "Look-at coordinate X"),
                value: currentCamera.target[0],
                onChange: (value) => updateManualTarget(0, value),
              },
              {
                axis: "Y",
                ariaLabel: text("注视坐标 Y", "Look-at coordinate Y"),
                value: currentCamera.target[1],
                onChange: (value) => updateManualTarget(1, value),
              },
              {
                axis: "Z",
                ariaLabel: text("注视坐标 Z", "Look-at coordinate Z"),
                value: currentCamera.target[2],
                onChange: (value) => updateManualTarget(2, value),
              },
            ]}
          />
          <InspectorRangeNumberField
            label={text("视野角度 (FOV)", "Field of view (FOV)")}
            rangeAriaLabel={text("机位 FOV 滑杆", "Camera FOV slider")}
            numberAriaLabel={text("机位 FOV", "Camera FOV")}
            max="120"
            min="10"
            step="0.1"
            value={currentCamera.fov}
            onValueChange={(value) => updateCamera(currentCamera.id, { fov: Number(value) })}
          />
          <InspectorSection title={text("相机截图", "Camera captures")} className="camera-capture-section">
            <button
              className="camera-capture-current-button"
              type="button"
              onClick={() => void handleCameraCapture()}
            >
              <Camera aria-hidden="true" data-testid="camera-current-capture-icon" size={14} strokeWidth={1.9} />
              <span>{text("当前机位截图", "Capture current camera")}</span>
            </button>
            {captureError ? <p>{captureError}</p> : null}
            {renderCurrentCameraCaptureGrid()}
          </InspectorSection>
        </>
      ) : activeTab === "motion" ? (
        renderMotionEditor()
      ) : (
        <div className="camera-capture-tab">
          {captureError ? <p>{captureError}</p> : null}
          {renderAllCameraCaptures()}
        </div>
      )}
      {renderViewer()}
    </InspectorPanel>
  );
}
