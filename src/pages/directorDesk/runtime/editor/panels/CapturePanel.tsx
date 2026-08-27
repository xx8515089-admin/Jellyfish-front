import { useState } from "react";
import { requestViewportCapture } from "../io/captureBridge";
import { serializeProject } from "../io/exportProjectJson";
import { parseProject } from "../io/importProjectJson";
import { downloadCaptureResults } from "../io/screenshotExport";
import { useDirectorStore } from "../store/directorStore";
import { useDirectorDeskText } from "../../useDirectorDeskText";

export function CapturePanel() {
  const text = useDirectorDeskText();
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const project = useDirectorStore((state) => state.project);
  const replaceProject = useDirectorStore((state) => state.replaceProject);
  const saveLatestSnapshot = useDirectorStore((state) => state.saveLatestSnapshot);
  const restoreLatestSnapshot = useDirectorStore((state) => state.restoreLatestSnapshot);

  async function handleCapture(preset: "current" | "four" | "twelve") {
    try {
      const results = await requestViewportCapture({
        preset,
        source: "capture-panel",
      });
      const count = downloadCaptureResults(results);
      setCaptureStatus(text(`已导出 ${count} 张截图`, `Exported ${count} screenshot${count === 1 ? "" : "s"}`));
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : text("截图失败", "Screenshot failed"));
    }
  }

  return (
    <section className="panel-card">
      <h2>{text("截图", "Screenshots")}</h2>
      <button className="capture-action" type="button" onClick={() => void handleCapture("current")}>
        {text("当前视角截图", "Current view")}
      </button>
      <button className="capture-action" type="button" onClick={() => void handleCapture("four")}>
        {text("四方位截图", "Four views")}
      </button>
      <button className="capture-action" type="button" onClick={() => void handleCapture("twelve")}>
        {text("十二方位截图", "Twelve views")}
      </button>
      {captureStatus ? <p className="capture-status">{captureStatus}</p> : null}
      <button
        className="capture-action"
        type="button"
        onClick={() => {
          const blob = new Blob([serializeProject(project)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
        }}
      >
        {text("导出工程 JSON", "Export project JSON")}
      </button>
      <input
        className="ui-field"
        aria-label={text("导入工程 JSON", "Import project JSON")}
        accept="application/json"
        type="file"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          replaceProject(parseProject(await file.text()));
        }}
      />
      <button className="capture-action" type="button" onClick={saveLatestSnapshot}>
        {text("保存最近工程", "Save latest project")}
      </button>
      <button className="capture-action" type="button" onClick={restoreLatestSnapshot}>
        {text("恢复最近工程", "Restore latest project")}
      </button>
    </section>
  );
}
