import { CornerDownLeft, Crosshair, LogOut } from "lucide-react";
import type { CameraPilotMode } from "../store/directorStore";
import { useDirectorDeskText } from "../../useDirectorDeskText";

export function PilotHud({
  lockedTargetName,
  onExit,
  onRecord,
  pointedTargetName,
}: {
  lockedTargetName: string | null;
  mode: Exclude<CameraPilotMode, "idle">;
  onExit: () => void;
  onRecord: () => void;
  pointedTargetName: string | null;
}) {
  const text = useDirectorDeskText();
  const targetName = lockedTargetName ?? pointedTargetName;
  const crosshairLabel = lockedTargetName
    ? text(`掌镜准星，已锁定${lockedTargetName}`, `Camera crosshair, locked on ${lockedTargetName}`)
    : pointedTargetName
      ? text(`掌镜准星，当前对准${pointedTargetName}`, `Camera crosshair, aiming at ${pointedTargetName}`)
      : text("掌镜准星，按 F 锁定当前空间点", "Camera crosshair, press F to lock the current point");

  return (
    <div className="pilot-hud" aria-label={text("第一人称掌镜控制层", "First-person camera controls")}>
      <div className="pilot-status" role="status">
        <span className="pilot-status-dot" />
        {text("掌镜模式", "Camera pilot")}
      </div>

      <div className={`pilot-crosshair${lockedTargetName ? " is-locked" : targetName ? " is-pointing" : ""}`} aria-label={crosshairLabel}>
        <span className="pilot-crosshair-line is-top" />
        <span className="pilot-crosshair-line is-right" />
        <span className="pilot-crosshair-line is-bottom" />
        <span className="pilot-crosshair-line is-left" />
        <span className="pilot-crosshair-center" />
        {targetName ? (
          <span className="pilot-target-name">
            <Crosshair aria-hidden="true" size={13} />
            {lockedTargetName
              ? text(`已锁定：${targetName}`, `Locked: ${targetName}`)
              : text(`${targetName} · 按 F 锁定`, `${targetName} · Press F to lock`)}
          </span>
        ) : (
          <span className="pilot-target-name">
            <Crosshair aria-hidden="true" size={13} />
            {text("空白空间 · 按 F 锁定", "Open space · Press F to lock")}
          </span>
        )}
      </div>

      <div className="pilot-keyboard-help" aria-label={text("掌镜快捷键", "Camera pilot shortcuts")}>
        <span><kbd>W A S D</kbd> {text("移动", "Move")}</span>
        <span><kbd>E</kbd> {text("上升", "Up")} · <kbd>Q</kbd> {text("下降", "Down")}</span>
        <span><kbd>{text("空格", "Space")}</kbd> {text("播放/暂停", "Play / Pause")}</span>
        <span><kbd>F</kbd> {text("锁定主体 / 空间点", "Lock subject / point")}</span>
        <span><kbd>{text("滚轮", "Wheel")}</kbd> {text("调整远近", "Adjust distance")}</span>
      </div>

      <div className="pilot-hud-actions">
        <button type="button" className="pilot-hud-secondary" onClick={onExit} aria-label={text("退出掌镜模式", "Exit camera pilot")}>
          <LogOut aria-hidden="true" size={15} />
          Esc {text("退出", "Exit")}
        </button>
        <button type="button" className="pilot-hud-primary" onClick={onRecord} aria-label={text("记录当前轨迹点", "Record current route point")}>
          <CornerDownLeft aria-hidden="true" size={15} />
          Enter {text("记录轨迹点", "Record point")}
        </button>
      </div>
    </div>
  );
}
