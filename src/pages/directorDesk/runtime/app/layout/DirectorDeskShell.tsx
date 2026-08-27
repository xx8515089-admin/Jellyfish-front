import type { ReactNode } from "react";
import { ObjectTreePanel } from "../../editor/panels/ObjectTreePanel";
import { RightPanel } from "../../editor/panels/RightPanel";
import { useDirectorStore } from "../../editor/store/directorStore";
import { useDirectorDeskText } from "../../useDirectorDeskText";

export function DirectorDeskShell({ children }: { children: ReactNode }) {
  const text = useDirectorDeskText();
  const viewportPanelsCollapsed = useDirectorStore((state) => state.viewportPanelsCollapsed);
  const motionStudioOpen = useDirectorStore((state) => state.motionStudioOpen);
  const cameraPilotMode = useDirectorStore((state) => state.cameraPilotMode);
  const viewMode = useDirectorStore((state) => state.viewMode);
  const hasCameraPreviewPath = useDirectorStore((state) => {
    const activeCamera = state.project.cameras.find((camera) => camera.id === state.project.activeCameraId)
      ?? state.project.cameras[0];
    return (activeCamera?.motionPath?.keyframes.length ?? 0) >= 2;
  });
  const isCameraPiloting = cameraPilotMode !== "idle";
  const isCameraPreviewing =
    motionStudioOpen && viewMode === "camera" && hasCameraPreviewPath && !isCameraPiloting;

  return (
    <div
      className={[
        "director-shell director-shell-fullbleed",
        viewportPanelsCollapsed ? "is-sidebars-collapsed" : "",
        motionStudioOpen && !isCameraPiloting && !isCameraPreviewing ? "is-motion-studio-open" : "",
        isCameraPiloting ? "is-camera-piloting" : "",
        isCameraPreviewing ? "is-camera-previewing" : "",
      ].filter(Boolean).join(" ")}
    >
      <section className="viewport-column" aria-label={text("3D视口", "3D viewport")}>
        {children}
      </section>
      <aside
        className="left-sidebar director-sidebar"
        aria-hidden={viewportPanelsCollapsed ? "true" : undefined}
        aria-label={text("场景", "Scene")}
      >
        <ObjectTreePanel />
      </aside>
      <aside
        className="right-sidebar director-sidebar"
        aria-hidden={viewportPanelsCollapsed ? "true" : undefined}
        aria-label={text("属性", "Properties")}
      >
        <RightPanel />
      </aside>
    </div>
  );
}
