import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  InspectorAxisGroup,
  InspectorColorField,
  InspectorPanel,
  InspectorRangeNumberField,
  InspectorSection,
  InspectorSelectField,
} from "./InspectorControls";
import { useDirectorStore } from "../store/directorStore";
import { readPanoramaFile } from "../loaders/panoramaImport";
import { useResolvedLocalAssetUrl } from "../loaders/useResolvedLocalAssetUrl";
import { GROUND_MATERIAL_PRESETS } from "../canvas/groundMaterialPresets";
import type { GroundMaterialPresetId } from "../schema/directorProject";
import { useDirectorDeskText } from "../../useDirectorDeskText";

const SCENE_SCALE_MIN = 0.1;
const SCENE_SCALE_MAX = 3;
const GROUND_HEIGHT_MIN = -5;
const GROUND_HEIGHT_MAX = 5;
const GROUND_TEXTURE_SCALE_MIN = 0.25;
const GROUND_TEXTURE_SCALE_MAX = 8;
const SCENE_BRIGHTNESS_MIN = 0;
const SCENE_BRIGHTNESS_MAX = 3;

function replaceAxis(tuple: [number, number, number], axis: 0 | 1 | 2, value: number): [number, number, number] {
  return tuple.map((item, index) => (index === axis ? value : item)) as [number, number, number];
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ScenePanel() {
  const text = useDirectorDeskText();
  const scene = useDirectorStore((state) => state.project.scene);
  const panoramaAsset = useDirectorStore((state) =>
    state.project.assets.find((asset) => asset.id === state.project.panoramaAssetId)
  );
  const updateScene = useDirectorStore((state) => state.updateScene);
  const setPanoramaAsset = useDirectorStore((state) => state.setPanoramaAsset);
  const removePanoramaAsset = useDirectorStore((state) => state.removePanoramaAsset);
  const resolvedPanoramaUrl = useResolvedLocalAssetUrl(panoramaAsset);
  const panoramaInputRef = useRef<HTMLInputElement>(null);
  const [sceneScaleDraft, setSceneScaleDraft] = useState(String(scene.scale));
  const [groundTextureScaleDraft, setGroundTextureScaleDraft] = useState(String(scene.groundTextureScale));
  const [groundHeightDraft, setGroundHeightDraft] = useState(String(scene.groundHeight));
  const [panoramaImporting, setPanoramaImporting] = useState(false);
  const [panoramaError, setPanoramaError] = useState<string | null>(null);

  useEffect(() => {
    setSceneScaleDraft(String(scene.scale));
  }, [scene.scale]);

  useEffect(() => {
    setGroundTextureScaleDraft(String(scene.groundTextureScale));
  }, [scene.groundTextureScale]);

  useEffect(() => {
    setGroundHeightDraft(String(scene.groundHeight));
  }, [scene.groundHeight]);

  function commitSceneScale(value: string) {
    const parsed = Number(value);
    const nextScale = Number.isFinite(parsed) ? clampNumber(parsed, SCENE_SCALE_MIN, SCENE_SCALE_MAX) : scene.scale;
    updateScene({ scale: nextScale });
    setSceneScaleDraft(String(nextScale));
  }

  function commitGroundHeight(value: string) {
    const parsed = Number(value);
    const nextHeight = Number.isFinite(parsed) ? clampNumber(parsed, GROUND_HEIGHT_MIN, GROUND_HEIGHT_MAX) : scene.groundHeight;
    updateScene({ groundHeight: nextHeight });
    setGroundHeightDraft(String(nextHeight));
  }

  function commitGroundTextureScale(value: string) {
    const parsed = Number(value);
    const nextScale = Number.isFinite(parsed)
      ? clampNumber(parsed, GROUND_TEXTURE_SCALE_MIN, GROUND_TEXTURE_SCALE_MAX)
      : scene.groundTextureScale;
    updateScene({ groundTextureScale: nextScale });
    setGroundTextureScaleDraft(String(nextScale));
  }

  async function importPanorama(file: File) {
    setPanoramaImporting(true);
    setPanoramaError(null);
    try {
      setPanoramaAsset(await readPanoramaFile(file));
    } catch (error) {
      setPanoramaError(error instanceof Error
        ? error.message
        : text("全景图导入失败，请重新选择图片", "Panorama import failed. Please choose another image."));
    } finally {
      setPanoramaImporting(false);
    }
  }

  return (
    <InspectorPanel
      title={text("3D场景", "3D scene")}
      ariaLabel={text("3D场景右侧属性面板", "3D scene properties panel")}
      className="scene-inspector"
    >
      <InspectorRangeNumberField
        label={text("场景缩放", "Scene scale")}
        rangeAriaLabel={text("场景缩放滑杆", "Scene scale slider")}
        numberAriaLabel={text("场景缩放", "Scene scale")}
        max={SCENE_SCALE_MAX}
        min={SCENE_SCALE_MIN}
        step="0.01"
        value={sceneScaleDraft}
        onValueChange={commitSceneScale}
        onRangeChange={commitSceneScale}
        onNumberBlur={commitSceneScale}
        onNumberChange={(value) => {
          setSceneScaleDraft(value);
          if (value !== "") {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              updateScene({ scale: parsed });
            }
          }
        }}
      />
      <InspectorAxisGroup
        label={text("场景平移", "Scene position")}
        axes={[
          {
            axis: "X",
            ariaLabel: text("场景平移 X", "Scene position X"),
            step: "0.1",
            value: scene.position[0],
            onChange: (value) => updateScene({ position: replaceAxis(scene.position, 0, Number(value)) }),
          },
          {
            axis: "Y",
            ariaLabel: text("场景平移 Y", "Scene position Y"),
            step: "0.1",
            value: scene.position[1],
            onChange: (value) => updateScene({ position: replaceAxis(scene.position, 1, Number(value)) }),
          },
          {
            axis: "Z",
            ariaLabel: text("场景平移 Z", "Scene position Z"),
            step: "0.1",
            value: scene.position[2],
            onChange: (value) => updateScene({ position: replaceAxis(scene.position, 2, Number(value)) }),
          },
        ]}
      />
      <InspectorAxisGroup
        label={text("场景旋转", "Scene rotation")}
        axes={[
          {
            axis: "X",
            ariaLabel: text("场景旋转 X", "Scene rotation X"),
            step: "1",
            value: scene.rotation[0],
            onChange: (value) => updateScene({ rotation: replaceAxis(scene.rotation, 0, Number(value)) }),
          },
          {
            axis: "Y",
            ariaLabel: text("场景旋转 Y", "Scene rotation Y"),
            step: "1",
            value: scene.rotation[1],
            onChange: (value) => updateScene({ rotation: replaceAxis(scene.rotation, 1, Number(value)) }),
          },
          {
            axis: "Z",
            ariaLabel: text("场景旋转 Z", "Scene rotation Z"),
            step: "1",
            value: scene.rotation[2],
            onChange: (value) => updateScene({ rotation: replaceAxis(scene.rotation, 2, Number(value)) }),
          },
        ]}
      />
      <InspectorSection title={text("背景", "Background")}>
        <div className="panorama-control-card">
          {panoramaAsset && resolvedPanoramaUrl ? (
            <div className="panorama-thumbnail-card">
              <img loading="lazy" decoding="async"
                alt={text("当前全景图", "Current panorama")}
                className="panorama-thumbnail-image"
                src={resolvedPanoramaUrl}
              />
              <span className="panorama-thumbnail-name">{panoramaAsset.fileName}</span>
              <button
                aria-label={text("删除全景图", "Remove panorama")}
                className="panorama-thumbnail-delete"
                title={text("删除全景图", "Remove panorama")}
                type="button"
                onClick={() => {
                  removePanoramaAsset();
                  setPanoramaError(null);
                }}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="panorama-empty-card">
              <span className="panorama-empty-icon"><ImagePlus aria-hidden="true" size={16} /></span>
              <span>{text("可选：加入一张环境全景图", "Optional: add an environment panorama")}</span>
            </div>
          )}
          <div className="panorama-action-row">
            <button
              className="inspector-action-button"
              disabled={panoramaImporting}
              type="button"
              onClick={() => panoramaInputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" size={15} />
              {panoramaImporting
                ? text("正在处理...", "Processing...")
                : panoramaAsset
                  ? text("更换全景图", "Replace panorama")
                  : text("导入全景图", "Import panorama")}
            </button>
            {panoramaAsset ? (
              <button
                aria-label={text("恢复全景默认方向", "Reset panorama direction")}
                className="panorama-reset-button"
                disabled={scene.panoramaYaw === 0}
                title={text("恢复默认方向", "Reset direction")}
                type="button"
                onClick={() => updateScene({ panoramaYaw: 0 })}
              >
                <RotateCcw aria-hidden="true" size={15} />
              </button>
            ) : null}
          </div>
          <input
            ref={panoramaInputRef}
            aria-label={text("选择全景图文件", "Choose panorama file")}
            className="visually-hidden"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            type="file"
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (file) void importPanorama(file);
              input.value = "";
            }}
          />
          {panoramaError ? <p className="panorama-import-error" role="alert">{panoramaError}</p> : null}
        </div>
        <InspectorColorField
          label={text("天空颜色", "Sky color")}
          colorAriaLabel={text("天空颜色", "Sky color")}
          hexAriaLabel={text("天空颜色 HEX", "Sky color HEX")}
          value={scene.backgroundColor}
          onColorChange={(value) => updateScene({ backgroundColor: value })}
          onHexChange={(value) => updateScene({ backgroundColor: value })}
        />
        <InspectorRangeNumberField
          label={panoramaAsset ? text("全景亮度", "Panorama brightness") : text("天空亮度", "Sky brightness")}
          rangeAriaLabel={panoramaAsset ? text("全景亮度滑杆", "Panorama brightness slider") : text("天空亮度滑杆", "Sky brightness slider")}
          numberAriaLabel={panoramaAsset ? text("全景亮度", "Panorama brightness") : text("天空亮度", "Sky brightness")}
          max={SCENE_BRIGHTNESS_MAX}
          min={SCENE_BRIGHTNESS_MIN}
          step="0.05"
          value={scene.backgroundBrightness}
          onValueChange={(value) => updateScene({ backgroundBrightness: Number(value) })}
        />
        {panoramaAsset ? (
          <InspectorRangeNumberField
            label={text("左右旋转", "Horizontal rotation")}
            rangeAriaLabel={text("全景左右旋转滑杆", "Panorama rotation slider")}
            numberAriaLabel={text("全景左右旋转", "Panorama rotation")}
            max="180"
            min="-180"
            step="1"
            value={scene.panoramaYaw}
            onValueChange={(value) => updateScene({ panoramaYaw: Number(value) })}
          />
        ) : null}
      </InspectorSection>
      <InspectorSection title={text("开关项", "Display options")}>
        <div className="scene-switch-row" role="group" aria-label={text("开关项设置", "Display settings")}>
          <div className="inspector-toggle-row">
            <input
              aria-label={text("角色标签", "Character labels")}
              checked={scene.showLabels}
              type="checkbox"
              onChange={(event) => updateScene({ showLabels: event.target.checked })}
            />
            <span>{text("角色标签", "Character labels")}</span>
          </div>
          <div className="inspector-toggle-row">
            <input
              aria-label={text("显示编辑网格", "Show editor grid")}
              checked={scene.showGrid}
              type="checkbox"
              onChange={(event) => updateScene({ showGrid: event.target.checked })}
            />
            <span>{text("编辑网格", "Editor grid")}</span>
          </div>
          <div className="inspector-toggle-row">
            <input
              aria-label={text("移动时吸附网格", "Snap to grid while moving")}
              checked={scene.snapToGrid}
              type="checkbox"
              onChange={(event) => updateScene({ snapToGrid: event.target.checked })}
            />
            <span>{text("移动吸附", "Snap movement")}</span>
          </div>
          <div className="inspector-toggle-row">
            <input
              aria-label={text("显示地面", "Show ground")}
              checked={scene.showGround}
              type="checkbox"
              onChange={(event) => updateScene({ showGround: event.target.checked })}
            />
            <span>{text("显示地面", "Show ground")}</span>
          </div>
          <div className="inspector-toggle-row">
            <input
              aria-label={text("启用地面和场景碰撞", "Enable ground and scene collision")}
              checked={scene.pathCollisionEnabled}
              type="checkbox"
              onChange={(event) => updateScene({ pathCollisionEnabled: event.target.checked })}
            />
            <span>{text("路线防穿模", "Route collision")}</span>
          </div>
        </div>
      </InspectorSection>
      {scene.showGround ? (
        <InspectorSection title={text("地面", "Ground")}>
          <InspectorSelectField
            ariaLabel={text("地面材质", "Ground material")}
            label={text("材质", "Material")}
            options={GROUND_MATERIAL_PRESETS.map((preset) => ({
              value: preset.id,
              label: text(preset.label, {
                studio: "Studio",
                concrete: "Concrete",
                asphalt: "Asphalt",
                wood: "Wood floor",
                grass: "Grass",
              }[preset.id]),
            }))}
            value={scene.groundMaterialPreset}
            onChange={(value) => updateScene({ groundMaterialPreset: value as GroundMaterialPresetId })}
          />
          <InspectorColorField
            label={text("地面颜色", "Ground color")}
            colorAriaLabel={text("地面颜色", "Ground color")}
            hexAriaLabel={text("地面颜色 HEX", "Ground color HEX")}
            value={scene.groundColor}
            onColorChange={(value) => updateScene({ groundColor: value })}
            onHexChange={(value) => updateScene({ groundColor: value })}
          />
          <InspectorRangeNumberField
            label={text("纹理大小", "Texture scale")}
            rangeAriaLabel={text("地面纹理大小滑杆", "Ground texture scale slider")}
            numberAriaLabel={text("地面纹理大小", "Ground texture scale")}
            max={GROUND_TEXTURE_SCALE_MAX}
            min={GROUND_TEXTURE_SCALE_MIN}
            step="0.05"
            value={groundTextureScaleDraft}
            onValueChange={commitGroundTextureScale}
            onRangeChange={commitGroundTextureScale}
            onNumberBlur={commitGroundTextureScale}
            onNumberChange={(value) => {
              setGroundTextureScaleDraft(value);
              if (value !== "") {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) updateScene({ groundTextureScale: parsed });
              }
            }}
          />
          <InspectorRangeNumberField
            label={text("地面亮度", "Ground brightness")}
            rangeAriaLabel={text("地面亮度滑杆", "Ground brightness slider")}
            numberAriaLabel={text("地面亮度", "Ground brightness")}
            max={SCENE_BRIGHTNESS_MAX}
            min={SCENE_BRIGHTNESS_MIN}
            step="0.05"
            value={scene.groundBrightness}
            onValueChange={(value) => updateScene({ groundBrightness: Number(value) })}
          />
          <InspectorRangeNumberField
            label={text("透明度", "Opacity")}
            rangeAriaLabel={text("地面透明度滑杆", "Ground opacity slider")}
            numberAriaLabel={text("地面透明度", "Ground opacity")}
            max="1"
            min="0"
            step="0.01"
            value={scene.groundOpacity}
            onValueChange={(value) => updateScene({ groundOpacity: Number(value) })}
          />
          <InspectorRangeNumberField
            label={text("高度", "Height")}
            rangeAriaLabel={text("地面高度滑杆", "Ground height slider")}
            numberAriaLabel={text("地面高度", "Ground height")}
            max={GROUND_HEIGHT_MAX}
            min={GROUND_HEIGHT_MIN}
            step="0.1"
            value={groundHeightDraft}
            onValueChange={commitGroundHeight}
            onRangeChange={commitGroundHeight}
            onNumberBlur={commitGroundHeight}
            onNumberChange={(value) => {
              setGroundHeightDraft(value);
              if (value !== "") {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                  updateScene({ groundHeight: parsed });
                }
              }
            }}
          />
        </InspectorSection>
      ) : null}
    </InspectorPanel>
  );
}
