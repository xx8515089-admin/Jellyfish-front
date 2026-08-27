import { useEffect, useRef, useState } from "react";
import { RotateCcw, Settings2, X } from "lucide-react";
import {
  DEFAULT_VIEWPORT_ROTATE_SENSITIVITY,
  DEFAULT_VIEWPORT_ZOOM_SENSITIVITY,
  VIEWPORT_SENSITIVITY_MAX,
  VIEWPORT_SENSITIVITY_MIN,
  VIEWPORT_SENSITIVITY_STEP,
} from "../schema/viewportSensitivity";
import { useDirectorStore } from "../store/directorStore";
import { isDirectorDeskEventInside } from "../io/directorDeskDom";
import { useDirectorDeskText, type DirectorDeskText } from "../../useDirectorDeskText";

const SENSITIVITY_PERCENT_MIN = VIEWPORT_SENSITIVITY_MIN * 100;
const SENSITIVITY_PERCENT_MAX = VIEWPORT_SENSITIVITY_MAX * 100;
const SENSITIVITY_PERCENT_STEP = VIEWPORT_SENSITIVITY_STEP * 100;

function toPercent(value: number) {
  return Math.round(value * 100);
}

function getSensitivityDescription(value: number, text: DirectorDeskText) {
  if (value <= 0.25) return text("很慢", "Very slow");
  if (value <= 0.5) return text("舒缓", "Smooth");
  if (value <= 0.8) return text("适中", "Balanced");
  if (value <= 1.1) return text("灵敏", "Responsive");
  return text("很快", "Very fast");
}

export function ViewportSensitivitySettings() {
  const text = useDirectorDeskText();
  const rotateSensitivity = useDirectorStore((state) => state.viewportRotateSensitivity);
  const zoomSensitivity = useDirectorStore((state) => state.viewportZoomSensitivity);
  const setRotateSensitivity = useDirectorStore((state) => state.setViewportRotateSensitivity);
  const setZoomSensitivity = useDirectorStore((state) => state.setViewportZoomSensitivity);
  const resetSensitivity = useDirectorStore((state) => state.resetViewportSensitivity);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (isDirectorDeskEventInside(event, wrapperRef.current)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const isDefault =
    rotateSensitivity === DEFAULT_VIEWPORT_ROTATE_SENSITIVITY &&
    zoomSensitivity === DEFAULT_VIEWPORT_ZOOM_SENSITIVITY;

  return (
    <div className="viewport-sensitivity-settings" ref={wrapperRef}>
      <button
        ref={triggerRef}
        className={`viewport-sensitivity-trigger${open ? " is-active" : ""}`}
        type="button"
        aria-controls="viewport-sensitivity-popover"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings2 aria-hidden="true" size={15} strokeWidth={1.9} />
        <span>{text("视角手感", "View controls")}</span>
      </button>

      {open ? (
        <section
          id="viewport-sensitivity-popover"
          className="viewport-sensitivity-popover"
          role="dialog"
          aria-label={text("视角灵敏度设置", "View sensitivity settings")}
        >
          <header className="viewport-sensitivity-header">
            <div>
              <strong>{text("视角手感", "View controls")}</strong>
              <small>{text("拖动后立即生效，并自动保存", "Changes apply immediately and save automatically")}</small>
            </div>
            <button type="button" aria-label={text("关闭视角灵敏度设置", "Close view sensitivity settings")} onClick={() => setOpen(false)}>
              <X aria-hidden="true" size={15} />
            </button>
          </header>

          <div className="viewport-sensitivity-control">
            <div className="viewport-sensitivity-label">
              <label htmlFor="viewport-rotate-sensitivity">{text("转动视角", "Rotate view")}</label>
              <output htmlFor="viewport-rotate-sensitivity">
                {getSensitivityDescription(rotateSensitivity, text)} · {toPercent(rotateSensitivity)}%
              </output>
            </div>
            <input
              id="viewport-rotate-sensitivity"
              type="range"
              aria-label={text("转动视角灵敏度", "Rotate view sensitivity")}
              min={SENSITIVITY_PERCENT_MIN}
              max={SENSITIVITY_PERCENT_MAX}
              step={SENSITIVITY_PERCENT_STEP}
              value={toPercent(rotateSensitivity)}
              onChange={(event) => setRotateSensitivity(Number(event.currentTarget.value) / 100)}
            />
            <div className="viewport-sensitivity-scale" aria-hidden="true"><span>{text("慢", "Slow")}</span><span>{text("快", "Fast")}</span></div>
          </div>

          <div className="viewport-sensitivity-control">
            <div className="viewport-sensitivity-label">
              <label htmlFor="viewport-zoom-sensitivity">{text("拉近 / 拉远", "Zoom in / out")}</label>
              <output htmlFor="viewport-zoom-sensitivity">
                {getSensitivityDescription(zoomSensitivity, text)} · {toPercent(zoomSensitivity)}%
              </output>
            </div>
            <input
              id="viewport-zoom-sensitivity"
              type="range"
              aria-label={text("缩放视角灵敏度", "Zoom sensitivity")}
              min={SENSITIVITY_PERCENT_MIN}
              max={SENSITIVITY_PERCENT_MAX}
              step={SENSITIVITY_PERCENT_STEP}
              value={toPercent(zoomSensitivity)}
              onChange={(event) => setZoomSensitivity(Number(event.currentTarget.value) / 100)}
            />
            <div className="viewport-sensitivity-scale" aria-hidden="true"><span>{text("慢", "Slow")}</span><span>{text("快", "Fast")}</span></div>
          </div>

          <p className="viewport-sensitivity-note">{text(
            "同时作用于普通视角和掌镜模式，不会改变 WASD 移动速度。",
            "Applies to regular and camera pilot views without changing WASD movement speed."
          )}</p>

          <button
            className="viewport-sensitivity-reset"
            type="button"
            disabled={isDefault}
            onClick={resetSensitivity}
          >
            <RotateCcw aria-hidden="true" size={14} />
            {text("恢复默认手感", "Restore defaults")}
          </button>
        </section>
      ) : null}
    </div>
  );
}
