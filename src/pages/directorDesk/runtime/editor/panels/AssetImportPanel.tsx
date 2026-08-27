import { useState } from "react";
import { useDirectorDeskText } from "../../useDirectorDeskText";
import { readLocalModelFile } from "../loaders/localModelImport";
import { useDirectorStore } from "../store/directorStore";

export function AssetImportPanel() {
  const text = useDirectorDeskText();
  const addImportedAsset = useDirectorStore((state) => state.addImportedAsset);
  const assets = useDirectorStore((state) => state.project.assets);
  const [importError, setImportError] = useState<string | null>(null);

  const latestLocalModel = [...assets].reverse().find((item) => item.sourceType === "model");

  async function handleLocalModel(file: File) {
    setImportError(null);
    const result = await readLocalModelFile(file);
    addImportedAsset({ kind: "prop", ...result });
  }

  return (
    <section className="panel-card">
      <h2>{text("导入", "Import")}</h2>
      <label className="asset-import-item">
        {text("导入本地模型", "Import local model")}
        <input
          aria-label={text("导入本地模型", "Import local model")}
          accept=".fbx,.obj,.glb"
          type="file"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            try {
              await handleLocalModel(file);
            } catch (error) {
              setImportError(error instanceof Error ? error.message : text("本地模型导入失败", "Failed to import local model"));
            } finally {
              input.value = "";
            }
          }}
        />
        <p className="asset-import-status">
          {latestLocalModel
            ? text(`已导入本地模型：${latestLocalModel.fileName}`, `Imported local model: ${latestLocalModel.fileName}`)
            : text("支持 FBX / OBJ / GLB 模型文件", "Supports FBX / OBJ / GLB model files")}
        </p>
      </label>
      {importError ? <p className="capture-status">{importError}</p> : null}
    </section>
  );
}
