import {
  MapPinPlus,
  Package,
  Pause,
  PersonStanding,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { DEFAULT_CAMERA_MOTION_PATH, getCameraMotionPath, getCameraMotionTimingPlan } from "../schema/cameraMotion";
import { getObjectMotionTimingPlan, normalizeObjectMotionPath } from "../schema/objectMotion";
import type { RouteTimingPlan } from "../schema/routeTiming";
import { useDirectorStore } from "../store/directorStore";
import { useDirectorDeskText, type DirectorDeskText } from "../../useDirectorDeskText";

const CURRENT_KEYFRAME_TOLERANCE = 0.005;

function formatSeconds(seconds: number, text: DirectorDeskText) {
  return text(`${seconds.toFixed(1)} 秒`, `${seconds.toFixed(1)} sec`);
}

function getRouteSpans(times: number[], plan: RouteTimingPlan | null) {
  const arrivals = plan?.arrivals ?? times;
  const departures = plan?.departures ?? times;
  return {
    arrivals,
    holds: arrivals.slice(0, -1).flatMap((arrival, index) => {
      const departure = departures[index] ?? arrival;
      return departure - arrival > 0.0001 ? [{ end: departure, index, start: arrival }] : [];
    }),
    moves: arrivals.slice(1).map((arrival, index) => ({
      end: arrival,
      index,
      start: departures[index] ?? arrivals[index],
    })),
  };
}

function getRoutePlaybackStatus(
  spans: ReturnType<typeof getRouteSpans> | null,
  progress: number,
  text: DirectorDeskText,
) {
  if (!spans) return text("无路线", "No route");
  if (spans.holds.some((span) => progress >= span.start && progress < span.end)) return text("停留中", "Holding");
  if (spans.moves.some((span) => progress >= span.start && progress < span.end)) return text("移动中", "Moving");
  const lastArrival = spans.arrivals[spans.arrivals.length - 1] ?? 0;
  if (progress >= lastArrival - CURRENT_KEYFRAME_TOLERANCE) return text("已结束", "Finished");
  return progress <= CURRENT_KEYFRAME_TOLERANCE ? text("等待", "Waiting") : text("已到点", "Arrived");
}

/**
 * 所有角色和道具动画共用的播放控制器。
 *
 * 物体动画和相机动画有意共用同一个归一化进度值，
 * 这样导演暂停角色、调整镜头后可以继续播放而不丢失同步。
 */
export function ObjectMotionTransport() {
  const text = useDirectorDeskText();
  const progress = useDirectorStore((state) => state.cameraMotionProgress);
  const playing = useDirectorStore((state) => state.cameraMotionPlaying);
  const pilotMode = useDirectorStore((state) => state.cameraPilotMode);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const objects = useDirectorStore((state) => state.project.objects);
  const activeCamera = useDirectorStore((state) =>
    state.project.cameras.find((camera) => camera.id === state.project.activeCameraId)
      ?? state.project.cameras[0]
  );
  const addObjectMotionKeyframe = useDirectorStore((state) => state.addObjectMotionKeyframe);
  const deleteObjectMotionKeyframe = useDirectorStore((state) => state.deleteObjectMotionKeyframe);
  const selectObjectMotionKeyframe = useDirectorStore((state) => state.selectObjectMotionKeyframe);
  const setProgress = useDirectorStore((state) => state.setCameraMotionProgress);
  const setPlaying = useDirectorStore((state) => state.setCameraMotionPlaying);
  const updateCameraMotionPath = useDirectorStore((state) => state.updateCameraMotionPath);

  const duration = activeCamera
    ? getCameraMotionPath(activeCamera).duration
    : DEFAULT_CAMERA_MOTION_PATH.duration;
  const currentSeconds = progress * duration;
  const isPiloting = pilotMode !== "idle";
  const selectedObject = objects.find(
    (object) => object.id === selectedObjectId && (object.kind === "character" || object.kind === "prop")
  );
  const selectedMotionPath = selectedObject
    ? normalizeObjectMotionPath(selectedObject.motionPath, selectedObject.transform)
    : null;
  const keyframes = selectedMotionPath?.keyframes ?? [];
  const cameraPath = activeCamera ? getCameraMotionPath(activeCamera) : null;
  const cameraSpans = cameraPath
    ? getRouteSpans(cameraPath.keyframes.map((keyframe) => keyframe.time), getCameraMotionTimingPlan(activeCamera))
    : null;
  const objectTimingPlan = selectedObject ? getObjectMotionTimingPlan(selectedObject, duration) : null;
  const objectSpans = selectedMotionPath
    ? getRouteSpans(selectedMotionPath.keyframes.map((keyframe) => keyframe.time), objectTimingPlan)
    : null;
  const hasPlayableObjectMotion =
    (activeCamera?.motionPath?.keyframes.length ?? 0) >= 2
    || objects.some(
      (object) => (object.motionPath?.keyframes?.length ?? 0) >= 2 || Boolean(object.characterRig?.actionPresetId)
    );
  const currentKeyframe = keyframes.find((keyframe, index) =>
    Math.abs((objectSpans?.arrivals[index] ?? keyframe.time) - progress) <= CURRENT_KEYFRAME_TOLERANCE
  );
  const isAtStart = progress <= CURRENT_KEYFRAME_TOLERANCE;
  const isCharacterRoute = selectedObject?.kind === "character";
  const pointLabel = isCharacterRoute ? text("路线点", "route point") : text("动作点", "motion point");
  const recordLabel = isAtStart ? text("记录起点", "Record start") : text("记录当前位置", "Record current position");

  function togglePlayback() {
    if (!hasPlayableObjectMotion) return;
    if (playing) {
      setPlaying(false);
      return;
    }

    if (progress >= 1 - CURRENT_KEYFRAME_TOLERANCE) {
      setProgress(0);
    }
    setPlaying(true);
  }

  function seek(nextProgress: number) {
    setPlaying(false);
    setProgress(nextProgress);
  }

  if (isPiloting) {
    return (
      <section
        className="object-motion-transport object-motion-transport--pilot"
        aria-label={text("掌镜人物和道具动作播放条", "Pilot object motion controls")}
      >
        <button
          className="object-motion-transport__play object-motion-transport__play--compact"
          type="button"
          disabled={!hasPlayableObjectMotion}
          aria-label={hasPlayableObjectMotion
            ? playing ? text("暂停人物和物品动作", "Pause object motion") : text("播放人物和物品动作", "Play object motion")
            : text("还没有可播放的人物和物品动作", "No playable object motion")}
          aria-pressed={playing}
          onClick={togglePlayback}
        >
          {playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
        </button>
        <output className="object-motion-transport__compact-time" aria-label={text("当前动作时间", "Current motion time")}>
          {formatSeconds(currentSeconds, text)}
        </output>
        <span className="object-motion-transport__shortcut" aria-label={text("空格键播放或暂停", "Space to play or pause")}>
          <kbd>{text("空格", "Space")}</kbd>
          {text("播放/暂停", "Play/Pause")}
        </span>
      </section>
    );
  }

  const objectKindLabel = selectedObject?.kind === "character" ? text("人物", "Character") : text("道具", "Prop");

  return (
    <section
      className="object-motion-transport object-motion-transport--full"
      aria-label={text("人物和道具动作播放条", "Object motion controls")}
    >
      <div className="object-motion-transport__subject" aria-label={text("当前动作对象", "Current motion subject")}>
        <span className="object-motion-transport__subject-icon" aria-hidden="true">
          {selectedObject?.kind === "character"
            ? <PersonStanding size={17} />
            : <Package size={17} />}
        </span>
        <span className="object-motion-transport__subject-copy">
          <small>{selectedObject ? isCharacterRoute ? text("人物路线播放", "Character route") : text(`${objectKindLabel}动作`, `${objectKindLabel} motion`) : text("人物 / 道具动作", "Character / prop motion")}</small>
          <strong title={selectedObject?.name}>
            {selectedObject?.name ?? text("请先选中人物或道具", "Select a character or prop")}
          </strong>
        </span>
      </div>

      <div className="object-motion-transport__player" aria-label={text("动作播放控制", "Motion playback controls")}>
        <button
          className="object-motion-transport__icon-button"
          type="button"
          aria-label={text("回到动作开头", "Return to motion start")}
          onClick={() => seek(0)}
        >
          <RotateCcw aria-hidden="true" size={15} />
        </button>
        <button
          className="object-motion-transport__play"
          type="button"
          disabled={!hasPlayableObjectMotion}
          aria-label={hasPlayableObjectMotion
            ? playing ? text("暂停人物和物品动作", "Pause object motion") : text("播放人物和物品动作", "Play object motion")
            : text("还没有可播放的人物和物品动作", "No playable object motion")}
          aria-pressed={playing}
          onClick={togglePlayback}
        >
          {playing ? <Pause aria-hidden="true" size={17} /> : <Play aria-hidden="true" size={17} />}
        </button>
        <output className="object-motion-transport__time" aria-label={text("当前动作时间", "Current motion time")}>
          {formatSeconds(currentSeconds, text)}
        </output>
        <input
          className="object-motion-transport__scrubber"
          aria-label={text("场景动作时间轴", "Scene motion timeline")}
          aria-valuetext={text(`${formatSeconds(currentSeconds, text)}，共 ${formatSeconds(duration, text)}`, `${formatSeconds(currentSeconds, text)} of ${formatSeconds(duration, text)}`)}
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={progress}
          onChange={(event) => seek(Number(event.currentTarget.value))}
        />
        <label className="object-motion-transport__duration-control">
          <span>{text("总时长", "Duration")}</span>
          <input
            aria-label={text("动作总时长（秒）", "Motion duration in seconds")}
            type="number"
            min="0.5"
            max="30"
            step="0.5"
            value={duration}
            onChange={(event) => {
              if (!activeCamera) return;
              updateCameraMotionPath(activeCamera.id, { duration: Number(event.currentTarget.value) });
            }}
          />
          <span>{text("秒", "sec")}</span>
        </label>
      </div>

      {(cameraSpans?.moves.length || objectSpans?.moves.length) ? (
        <div className="object-motion-transport__tracks" aria-label={text("镜头与对象移动停留时间轴", "Camera and object movement timeline")}>
          <div className="object-motion-transport__tracks-heading">
            <strong>{text("镜头与人物时间轴", "Camera and character timeline")}</strong>
            <span><i className="is-move" />{text("移动", "Move")} <i className="is-hold" />{text("停留", "Hold")} <i className="is-playhead" />{text("当前时间", "Current")}</span>
          </div>
          {cameraSpans?.moves.length ? (
            <div className="object-motion-transport__track object-motion-transport__track--camera">
              <span className="object-motion-transport__track-label">
                <strong>{text("镜头移动", "Camera motion")}</strong>
                <small>{getRoutePlaybackStatus(cameraSpans, progress, text)}</small>
              </span>
              <div className="object-motion-transport__track-line">
                {cameraSpans.moves.map((span) => (
                  <span
                    key={`camera-move-${span.index}`}
                    className={`object-motion-transport__span is-move${progress >= span.start && progress < span.end ? " is-active" : ""}`}
                    style={{ left: `${span.start * 100}%`, width: `${Math.max(0, span.end - span.start) * 100}%` }}
                    title={`${text("镜头移动", "Camera motion")} ${formatSeconds(span.start * duration, text)} - ${formatSeconds(span.end * duration, text)}`}
                  />
                ))}
                {cameraSpans.holds.map((span) => (
                  <span
                    key={`camera-hold-${span.index}`}
                    className={`object-motion-transport__span is-hold${progress >= span.start && progress < span.end ? " is-active" : ""}`}
                    style={{ left: `${span.start * 100}%`, width: `${Math.max(0, span.end - span.start) * 100}%` }}
                    title={`${text("镜头停留", "Camera hold")} ${formatSeconds((span.end - span.start) * duration, text)}`}
                  />
                ))}
                <i className="object-motion-transport__playhead" style={{ left: `${progress * 100}%` }} />
                <input
                  className="object-motion-transport__track-scrubber"
                  aria-label={text("拖动镜头时间轴", "Scrub camera timeline")}
                  aria-valuetext={text(`${formatSeconds(currentSeconds, text)}，共 ${formatSeconds(duration, text)}`, `${formatSeconds(currentSeconds, text)} of ${formatSeconds(duration, text)}`)}
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={progress}
                  onChange={(event) => seek(Number(event.currentTarget.value))}
                />
              </div>
            </div>
          ) : null}
          {objectSpans?.moves.length ? (
            <div className="object-motion-transport__track object-motion-transport__track--object">
              <span className="object-motion-transport__track-label" title={selectedObject?.name}>
                <strong>{selectedObject?.name ?? objectKindLabel} {text("移动", "motion")}</strong>
                <small>{getRoutePlaybackStatus(objectSpans, progress, text)}</small>
              </span>
              <div className="object-motion-transport__track-line">
                {objectSpans.moves.map((span) => (
                  <span
                    key={`object-move-${span.index}`}
                    className={`object-motion-transport__span is-move${progress >= span.start && progress < span.end ? " is-active" : ""}`}
                    style={{ left: `${span.start * 100}%`, width: `${Math.max(0, span.end - span.start) * 100}%` }}
                    title={`${selectedObject?.name ?? text("对象", "Object")} ${text("移动", "motion")} ${formatSeconds(span.start * duration, text)} - ${formatSeconds(span.end * duration, text)}`}
                  />
                ))}
                {objectSpans.holds.map((span) => (
                  <span
                    key={`object-hold-${span.index}`}
                    className={`object-motion-transport__span is-hold${progress >= span.start && progress < span.end ? " is-active" : ""}`}
                    style={{ left: `${span.start * 100}%`, width: `${Math.max(0, span.end - span.start) * 100}%` }}
                    title={`${selectedObject?.name ?? text("对象", "Object")} ${text("停留", "hold")} ${formatSeconds((span.end - span.start) * duration, text)}`}
                  />
                ))}
                <i className="object-motion-transport__playhead" style={{ left: `${progress * 100}%` }} />
                <input
                  className="object-motion-transport__track-scrubber"
                  aria-label={text("拖动人物时间轴", "Scrub object timeline")}
                  aria-valuetext={text(`${formatSeconds(currentSeconds, text)}，共 ${formatSeconds(duration, text)}`, `${formatSeconds(currentSeconds, text)} of ${formatSeconds(duration, text)}`)}
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={progress}
                  onChange={(event) => seek(Number(event.currentTarget.value))}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="object-motion-transport__editor">
        {!isCharacterRoute ? <>
          <button
            className="object-motion-transport__record"
            type="button"
            disabled={!selectedObject}
            aria-label={selectedObject ? `${recordLabel}: ${selectedObject.name}` : text("记录人物或道具动作点", "Record a character or prop motion point")}
            title={recordLabel}
            onClick={() => {
              if (!selectedObject) return;
              setPlaying(false);
              const recorded = addObjectMotionKeyframe(selectedObject.id, progress);
              if (recorded) selectObjectMotionKeyframe(recorded);
            }}
          >
            <MapPinPlus aria-hidden="true" size={15} />
            <span>{recordLabel}</span>
          </button>
          <div
            className="object-motion-transport__keyframes"
            role="group"
            aria-label={selectedObject ? `${selectedObject.name} ${pointLabel}` : pointLabel}
          >
            {keyframes.length > 0 ? keyframes.map((keyframe, index) => {
            const isCurrent = keyframe.id === currentKeyframe?.id;
            return (
              <button
                key={keyframe.id}
                className={isCurrent ? "is-current" : undefined}
                type="button"
                aria-label={`${text("跳转到", "Go to ")}${selectedObject?.name ?? text("对象", "object")} ${pointLabel} ${index + 1}`}
                aria-pressed={isCurrent}
                title={`${formatSeconds((objectSpans?.arrivals[index] ?? keyframe.time) * duration, text)} · ${pointLabel} ${index + 1}`}
                onClick={() => {
                  selectObjectMotionKeyframe(keyframe.id);
                  seek(objectSpans?.arrivals[index] ?? keyframe.time);
                }}
              >
                {index + 1}
              </button>
            );
            }) : (
              <small>{selectedObject ? text("还没有动作点", "No motion points yet") : text("选择对象后记录动作", "Select an object to record motion")}</small>
            )}
          </div>
        </> : <span className="object-motion-transport__route-hint">{text("路线点、每段动作和朝向请在右侧“路线”页编辑", "Edit route points, segment actions, and orientation in the Route tab on the right")}</span>}

        <button
          className="object-motion-transport__delete"
          type="button"
          disabled={isCharacterRoute || !selectedObject || !currentKeyframe}
          aria-label={selectedObject ? `${text("删除", "Delete ")}${selectedObject.name}${text("当前", " current ")}${pointLabel}` : text("删除当前动作点", "Delete current motion point")}
          title={text("删除当前点", "Delete current point")}
          onClick={() => {
            if (!selectedObject || !currentKeyframe) return;
            setPlaying(false);
            deleteObjectMotionKeyframe(selectedObject.id, currentKeyframe.id);
            selectObjectMotionKeyframe(null);
          }}
        >
          <Trash2 aria-hidden="true" size={14} />
          <span>{text("删除当前点", "Delete current point")}</span>
        </button>
      </div>
    </section>
  );
}
