import type { DirectorRouteCubicBezier } from "../schema/directorProject";
import { useDirectorDeskText } from "../../useDirectorDeskText";
import {
  ROUTE_CUSTOM_EASING_PRESETS,
  findRouteCustomEasingPresetId,
} from "./routeCustomEasingPresets";

export function RouteCustomEasingControl({
  curve,
  label,
  onChange,
}: {
  curve?: DirectorRouteCubicBezier;
  label?: string;
  onChange: (curve: DirectorRouteCubicBezier) => void;
}) {
  const text = useDirectorDeskText();
  const displayLabel = label ?? text("段内节奏", "Segment easing");
  const activeId = findRouteCustomEasingPresetId(curve);
  return (
    <div className="route-custom-easing" role="group" aria-label={displayLabel}>
      <span>{displayLabel}</span>
      <div>
        {ROUTE_CUSTOM_EASING_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activeId === preset.id}
            onClick={() => onChange([...preset.curve] as DirectorRouteCubicBezier)}
          >{text(preset.label, {
            linear: "Linear",
            "ease-in": "Ease in",
            "ease-out": "Ease out",
            "ease-in-out": "Ease in/out",
          }[preset.id])}</button>
        ))}
      </div>
    </div>
  );
}
