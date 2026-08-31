import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { LocateFixed, MapPinPlus, Plus, Trash2, Upload } from "lucide-react";
import {
  InspectorAxisGroup,
  InspectorColorField,
  InspectorPanel,
  InspectorRangeNumberField,
  InspectorTextField,
  InspectorSection,
} from "./InspectorControls";
import { MANNEQUIN_POSE_PRESETS } from "../presets/mannequinPosePresets";
import {
  CHARACTER_ACTION_PRESETS,
  getCharacterActionDisplayDuration,
} from "../presets/characterActionPresets";
import {
  CHARACTER_ACTION_PROFILE_LABELS,
  CHARACTER_ACTION_PROFILE_LABELS_ENGLISH,
  getCompatibleCharacterCommonActionPresets,
  getCharacterActionProfile,
  getCharacterSpecificActionPresets,
  resolveCharacterImportReadiness,
  resolveCompatibleCharacterActionPresetId,
} from "../presets/characterSpecificActionPresets";
import { getCameraMotionPath } from "../schema/cameraMotion";
import { getObjectMotionTimingPlan, normalizeObjectMotionPath } from "../schema/objectMotion";
import { getCrowdAnchorTransform, useDirectorStore } from "../store/directorStore";
import { inspectCharacterAnimationFile } from "../loaders/characterAnimationInspection";
import { readLocalModelFile } from "../loaders/localModelImport";
import { createImportedCharacterActionId } from "../schema/importedCharacterAction";
import type { CharacterRigProfile } from "../schema/directorProject";
import { isCompleteDirectorCharacterBoneMap } from "../schema/semanticBody";
import { RouteCustomEasingControl } from "../motion/RouteCustomEasingControl";
import {
  areAnimationProfilesCompatible,
  isNativeAnimationForCharacter,
  normalizeAnimationRigProfile,
} from "./characterAnimationCompatibility";
import { useDirectorDeskText } from "../../useDirectorDeskText";

export { areAnimationProfilesCompatible, isNativeAnimationForCharacter } from "./characterAnimationCompatibility";

function replaceAxis(tuple: [number, number, number], axis: 0 | 1 | 2, value: number): [number, number, number] {
  return tuple.map((item, index) => (index === axis ? value : item)) as [number, number, number];
}

export function CharacterPanel() {
  const text = useDirectorDeskText();
  const animationInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<"properties" | "pose" | "action" | "route">("properties");
  const [animationImportStatus, setAnimationImportStatus] = useState<string | null>(null);
  const [animationImportBusy, setAnimationImportBusy] = useState(false);
  const selectedCrowdId = useDirectorStore((state) => state.selectedCrowdId);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const objects = useDirectorStore((state) => state.project.objects);
  const assets = useDirectorStore((state) => state.project.assets);
  const cameras = useDirectorStore((state) => state.project.cameras);
  const animationAssets = useDirectorStore((state) => state.project.animationAssets ?? []);
  const activeCameraId = useDirectorStore((state) => state.project.activeCameraId);
  const updateObjectName = useDirectorStore((state) => state.updateObjectName);
  const updateCrowdLabel = useDirectorStore((state) => state.updateCrowdLabel);
  const updateObjectTransform = useDirectorStore((state) => state.updateObjectTransform);
  const updateCrowdTransform = useDirectorStore((state) => state.updateCrowdTransform);
  const updateUniformScale = useDirectorStore((state) => state.updateUniformScale);
  const updateCrowdUniformScale = useDirectorStore((state) => state.updateCrowdUniformScale);
  const updateObjectColor = useDirectorStore((state) => state.updateObjectColor);
  const updateCrowdColor = useDirectorStore((state) => state.updateCrowdColor);
  const applyPosePreset = useDirectorStore((state) => state.applyPosePreset);
  const applyCrowdPosePreset = useDirectorStore((state) => state.applyCrowdPosePreset);
  const updatePoseControl = useDirectorStore((state) => state.updatePoseControl);
  const updateCrowdPoseControl = useDirectorStore((state) => state.updateCrowdPoseControl);
  const applyCharacterActionPreset = useDirectorStore((state) => state.applyCharacterActionPreset);
  const applyCrowdActionPreset = useDirectorStore((state) => state.applyCrowdActionPreset);
  const addImportedAnimationAsset = useDirectorStore((state) => state.addImportedAnimationAsset);
  const removeImportedAnimationAsset = useDirectorStore((state) => state.removeImportedAnimationAsset);
  const setCameraMotionProgress = useDirectorStore((state) => state.setCameraMotionProgress);
  const setCameraMotionPlaying = useDirectorStore((state) => state.setCameraMotionPlaying);
  const restartCameraMotionPlayback = useDirectorStore((state) => state.restartCameraMotionPlayback);
  const addCharacterRoutePoint = useDirectorStore((state) => state.addCharacterRoutePoint);
  const insertObjectMotionKeyframeAfter = useDirectorStore((state) => state.insertObjectMotionKeyframeAfter);
  const deleteObjectMotionKeyframe = useDirectorStore((state) => state.deleteObjectMotionKeyframe);
  const selectedObjectMotionKeyframeId = useDirectorStore((state) => state.selectedObjectMotionKeyframeId);
  const selectObjectMotionKeyframe = useDirectorStore((state) => state.selectObjectMotionKeyframe);
  const updateObjectMotionKeyframe = useDirectorStore((state) => state.updateObjectMotionKeyframe);
  const updateObjectMotionPath = useDirectorStore((state) => state.updateObjectMotionPath);

  const selection = useMemo(() => {
    const role = objects.find((item) => item.id === selectedObjectId && item.kind === "character");

    if (selectedCrowdId) {
      const crowdMembers = objects.filter((item) => item.kind === "character" && item.crowdId === selectedCrowdId);
      const crowdAnchor = getCrowdAnchorTransform(objects, selectedCrowdId);

      if (crowdMembers.length && crowdAnchor) {
        return {
          mode: "crowd" as const,
          crowdId: selectedCrowdId,
          crowdMembers,
          crowdAnchor,
          role: crowdMembers[crowdMembers.length - 1] ?? crowdMembers[0],
          name: crowdMembers[0]?.crowdLabel ?? text("群众", "Crowd"),
          color: crowdMembers[0]?.color ?? "#4F8EF7",
        };
      }
    }

    if (!role) return null;

    return {
      mode: "single" as const,
      crowdId: null,
      crowdMembers: [role],
      crowdAnchor: role.transform,
      role,
      name: role.name,
      color: role.color ?? "#4F8EF7",
    };
  }, [objects, selectedCrowdId, selectedObjectId, text]);

  if (!selection) return null;

  const role = selection.role;
  const roleAsset = assets.find((asset) => asset.id === role.assetRefId);
  const roleRigProfile: CharacterRigProfile = roleAsset?.characterRigProfile
    ?? (role.characterRig?.rigType === "mixamo" ? "mixamo" : role.characterRig?.rigType === "ue4-mannequin" ? "bip" : "unknown");
  const roleImportReadiness = resolveCharacterImportReadiness({
    assetUrl: roleAsset?.url,
    assetName: roleAsset?.name ?? roleAsset?.fileName,
    objectName: role.name,
    bodyType: role.bodyType,
    importReadiness: roleAsset?.characterImportReadiness,
    rigType: role.characterRig?.rigType,
  });
  const allowsHumanoidActions = roleImportReadiness === "ready";
  const roleHasCompleteBoneMap = isCompleteDirectorCharacterBoneMap(roleAsset?.characterBoneMap);
  const compatibleAnimationAssets = animationAssets.filter((animationAsset) =>
    isNativeAnimationForCharacter(animationAsset, roleAsset)
      || (allowsHumanoidActions && areAnimationProfilesCompatible(roleRigProfile, animationAsset.rigProfile, roleHasCompleteBoneMap))
  );
  const importedActionOptions = compatibleAnimationAssets.flatMap((animationAsset) =>
    animationAsset.clips.map((clip) => ({
      id: createImportedCharacterActionId(animationAsset.id, clip.id),
      label: `${animationAsset.name} · ${clip.name}`,
      displayLabel: clip.name,
      duration: clip.duration,
      asset: animationAsset,
    }))
  );

  async function handleAnimationImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setAnimationImportBusy(true);
    setAnimationImportStatus(text("正在检查动作文件...", "Inspecting animation file..."));

    try {
      const report = await inspectCharacterAnimationFile(file);
      const validClips = report.clips.filter((clip) => clip.duration > 0.05 && clip.trackCount > 0);
      if (!validClips.length) {
        throw new Error(report.warnings[0] ?? text("没有检测到可播放动作", "No playable animation was detected"));
      }
      const stored = await readLocalModelFile(file);
      const rigProfile = normalizeAnimationRigProfile(report.rigProfile);
      const animationAssetId = addImportedAnimationAsset({
        name: stored.name,
        fileName: stored.fileName,
        url: stored.url,
        modelFormat: report.format,
        storageKey: stored.storageKey,
        byteLength: stored.byteLength,
        rigProfile,
        clips: validClips.map((clip, index) => ({
          id: `clip_${index + 1}`,
          name: clip.name,
          duration: clip.duration,
          trackCount: clip.trackCount,
        })),
      });

      if (areAnimationProfilesCompatible(roleRigProfile, rigProfile, roleHasCompleteBoneMap)) {
        const actionPresetId = createImportedCharacterActionId(animationAssetId, "clip_1");
        applyCharacterActionPreset(role.id, actionPresetId);
        restartCameraMotionPlayback({
          objectId: role.id,
          actionPresetId,
          durationSeconds: validClips[0].duration,
        });
        setAnimationImportStatus(text(
          `已导入 ${validClips.length} 个动作，正在预览第一段`,
          `Imported ${validClips.length} animation(s). Previewing the first clip.`,
        ));
      } else {
        setAnimationImportStatus(text(
          `动作已保存，但与当前人物骨架不兼容（人物 ${roleRigProfile} / 动作 ${rigProfile}）`,
          `Animation saved, but its rig is incompatible with this character (${roleRigProfile} / ${rigProfile}).`,
        ));
      }
    } catch (error) {
      setAnimationImportStatus(error instanceof Error ? error.message : text("动作导入失败", "Animation import failed"));
    } finally {
      setAnimationImportBusy(false);
      input.value = "";
    }
  }
  const roleColor = role.color ?? (roleAsset ? "#ffffff" : selection.color);
  const transform = selection.crowdAnchor;
  const isCrowd = selection.mode === "crowd";
  const characterActionContext = {
    assetUrl: roleAsset?.url,
    assetName: roleAsset?.name ?? roleAsset?.fileName,
    objectName: role.name,
    bodyType: role.bodyType,
    importReadiness: roleImportReadiness,
    rigType: role.characterRig?.rigType,
  };
  const characterActionProfile = getCharacterActionProfile(characterActionContext);
  const compatibleCommonActionPresets = getCompatibleCharacterCommonActionPresets(
    characterActionContext,
    CHARACTER_ACTION_PRESETS,
  );
  const characterSpecificActionPresets = !isCrowd && allowsHumanoidActions
    ? getCharacterSpecificActionPresets(characterActionContext)
    : [];
  const availableActionPresets = [...compatibleCommonActionPresets, ...characterSpecificActionPresets];
  const activeActionPresetId = resolveCompatibleCharacterActionPresetId(
    characterActionContext,
    role.characterRig?.actionPresetId,
  );
  const routePath = normalizeObjectMotionPath(role.motionPath, role.transform);
  const selectedRoutePoint = routePath.keyframes.find((item) => item.id === selectedObjectMotionKeyframeId) ?? null;
  const activeCamera = cameras.find((item) => item.id === activeCameraId) ?? cameras[0];
  const timelineDuration = activeCamera ? getCameraMotionPath(activeCamera).duration : 6;
  const routeTimingPlan = getObjectMotionTimingPlan(role, timelineDuration);
  const selectedRoutePointIndex = selectedRoutePoint
    ? routePath.keyframes.indexOf(selectedRoutePoint)
    : -1;
  const selectedArrivalProgress = selectedRoutePointIndex >= 0
    ? routeTimingPlan?.arrivals[selectedRoutePointIndex] ?? selectedRoutePoint?.time ?? 0
    : 0;
  const selectedArrivalMinimum = selectedRoutePointIndex > 0
    ? routePath.keyframes[selectedRoutePointIndex - 1].time * timelineDuration
      + (routePath.keyframes[selectedRoutePointIndex - 1].pointBehavior === "hold"
        ? routePath.keyframes[selectedRoutePointIndex - 1].holdSeconds ?? 0
        : 0)
      + 0.1
    : 0;
  const selectedArrivalMaximum = selectedRoutePointIndex >= 0 && selectedRoutePointIndex < routePath.keyframes.length - 1
    ? routePath.keyframes[selectedRoutePointIndex + 1].time * timelineDuration - 0.1
    : timelineDuration;

  function setRouteSpeedMode(speedMode: "uniform" | "soft" | "custom") {
    const keyframes = speedMode === "custom" && routePath.speedMode !== "custom" && routeTimingPlan
      ? routePath.keyframes.map((keyframe, index) => ({
          ...keyframe,
          time: routeTimingPlan.arrivals[index] ?? keyframe.time,
        }))
      : routePath.keyframes;
    updateObjectMotionPath(role.id, {
      speedMode,
      ...(speedMode === "custom" ? { customEasing: [0, 0, 1, 1], keyframes } : {}),
    });
  }
  const poseGroups = [
    {
      title: text("身体", "Body"),
      controls: [
        { key: "body.pitch", label: text("前倾", "Lean") },
        { key: "body.yaw", label: text("转身", "Turn") },
        { key: "body.roll", label: text("侧倾", "Side lean") },
      ],
    },
    {
      title: text("躯干", "Torso"),
      controls: [
        { key: "torso.pitch", label: text("前倾", "Lean") },
        { key: "torso.yaw", label: text("扭转", "Twist") },
        { key: "torso.roll", label: text("侧倾", "Side lean") },
      ],
    },
    {
      title: text("头部", "Head"),
      controls: [
        { key: "head.pitch", label: text("点头", "Nod") },
        { key: "head.yaw", label: text("转头", "Turn") },
        { key: "head.roll", label: text("歪头", "Tilt") },
      ],
    },
    {
      title: text("左肩", "Left shoulder"),
      controls: [
        { key: "leftShoulder.pitch", label: text("前举", "Raise") },
        { key: "leftShoulder.spread", label: text("外展", "Spread") },
        { key: "leftShoulder.twist", label: text("扭转", "Twist") },
      ],
    },
    {
      title: text("右肩", "Right shoulder"),
      controls: [
        { key: "rightShoulder.pitch", label: text("前举", "Raise") },
        { key: "rightShoulder.spread", label: text("外展", "Spread") },
        { key: "rightShoulder.twist", label: text("扭转", "Twist") },
      ],
    },
    {
      title: text("左肘", "Left elbow"),
      controls: [{ key: "leftElbow.bend", label: text("弯曲", "Bend") }],
    },
    {
      title: text("右肘", "Right elbow"),
      controls: [{ key: "rightElbow.bend", label: text("弯曲", "Bend") }],
    },
    {
      title: text("左髋", "Left hip"),
      controls: [
        { key: "leftHip.pitch", label: text("前抬", "Raise") },
        { key: "leftHip.spread", label: text("外展", "Spread") },
        { key: "leftHip.twist", label: text("扭转", "Twist") },
      ],
    },
    {
      title: text("右髋", "Right hip"),
      controls: [
        { key: "rightHip.pitch", label: text("前抬", "Raise") },
        { key: "rightHip.spread", label: text("外展", "Spread") },
        { key: "rightHip.twist", label: text("扭转", "Twist") },
      ],
    },
    {
      title: text("左膝", "Left knee"),
      controls: [{ key: "leftKnee.bend", label: text("弯曲", "Bend") }],
    },
    {
      title: text("右膝", "Right knee"),
      controls: [{ key: "rightKnee.bend", label: text("弯曲", "Bend") }],
    },
  ] as const;

  return (
    <InspectorPanel
      title={text("角色", "Character")}
      ariaLabel={text("角色右侧属性面板", "Character properties panel")}
      className="character-inspector"
      tabs={[
        { label: text("属性", "Properties"), active: activeTab === "properties", onClick: () => setActiveTab("properties") },
        { label: text("姿势", "Pose"), active: activeTab === "pose", onClick: () => setActiveTab("pose") },
        { label: text("动作", "Animation"), active: activeTab === "action", onClick: () => setActiveTab("action") },
        { label: text("路线", "Route"), active: activeTab === "route", onClick: () => setActiveTab("route") },
      ]}
    >
      {activeTab === "properties" ? (
        <>
          <InspectorTextField
            label={text("名称", "Name")}
            ariaLabel={text("角色名称", "Character name")}
            value={selection.name}
            onChange={(value) => {
              if (isCrowd && selection.crowdId) {
                updateCrowdLabel(selection.crowdId, value);
                return;
              }

              updateObjectName(role.id, value);
            }}
          />
          <InspectorAxisGroup
            label={text("位置", "Position")}
            axes={[
              {
                axis: "X",
                ariaLabel: text("角色位置 X", "Character position X"),
                value: transform.position[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 0, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        position: replaceAxis(transform.position, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: text("角色位置 Y", "Character position Y"),
                value: transform.position[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 1, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        position: replaceAxis(transform.position, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: text("角色位置 Z", "Character position Z"),
                value: transform.position[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 2, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        position: replaceAxis(transform.position, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorAxisGroup
            label={text("旋转", "Rotation")}
            axes={[
              {
                axis: "X",
                ariaLabel: text("角色旋转 X", "Character rotation X"),
                value: transform.rotation[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 0, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: text("角色旋转 Y", "Character rotation Y"),
                value: transform.rotation[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 1, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: text("角色旋转 Z", "Character rotation Z"),
                value: transform.rotation[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 2, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorAxisGroup
            label={text("缩放", "Scale")}
            axes={[
              {
                axis: "X",
                ariaLabel: text("角色缩放 X", "Character scale X"),
                step: "0.01",
                value: transform.scale[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 0, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        scale: replaceAxis(transform.scale, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: text("角色缩放 Y", "Character scale Y"),
                step: "0.01",
                value: transform.scale[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 1, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        scale: replaceAxis(transform.scale, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: text("角色缩放 Z", "Character scale Z"),
                step: "0.01",
                value: transform.scale[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 2, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        scale: replaceAxis(transform.scale, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorRangeNumberField
            label={text("统一缩放", "Uniform scale")}
            rangeAriaLabel={text("角色统一缩放滑杆", "Character uniform scale slider")}
            numberAriaLabel={text("角色统一缩放", "Character uniform scale")}
            max="3"
            min="0.2"
            step="0.01"
            value={transform.scale[0]}
            onValueChange={(value) =>
              isCrowd && selection.crowdId
                ? updateCrowdUniformScale(selection.crowdId, Number(value))
                : updateUniformScale(role.id, Number(value))
            }
          />
          <InspectorColorField
            label={text("颜色", "Color")}
            colorAriaLabel={text("角色颜色", "Character color")}
            hexAriaLabel={text("角色颜色 HEX", "Character color HEX")}
            value={roleColor}
            onColorChange={(value) =>
              isCrowd && selection.crowdId ? updateCrowdColor(selection.crowdId, value) : updateObjectColor(role.id, value)
            }
            onHexChange={(value) =>
              isCrowd && selection.crowdId ? updateCrowdColor(selection.crowdId, value) : updateObjectColor(role.id, value)
            }
          />
        </>
      ) : activeTab === "pose" ? (
        <InspectorSection title={text("姿势预设", "Pose presets")} className="pose-preset-section">
          {role.characterRig && allowsHumanoidActions ? (
            <>
              <div className="preset-grid">
                {MANNEQUIN_POSE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={role.characterRig?.posePresetId === preset.id ? "is-active" : undefined}
                    type="button"
                    onClick={() => {
                      setCameraMotionPlaying(false);
                      if (isCrowd && selection.crowdId) {
                        applyCrowdPosePreset(selection.crowdId, preset.id);
                      } else {
                        applyPosePreset(role.id, preset.id);
                      }
                    }}
                  >
                    {text(preset.label, preset.labelEn)}
                  </button>
                ))}
              </div>
              <InspectorSection title={text("姿势调节", "Pose controls")} className="pose-adjust-section">
                <div className="pose-groups">
                  {poseGroups.map((group) => (
                    <section key={group.title} className="pose-group">
                      <h4>{group.title}</h4>
                      {group.controls.map((control) => (
                        <InspectorRangeNumberField
                          key={control.key}
                          label={control.label}
                          rangeAriaLabel={text(
                            `${group.title} · ${control.label} 滑杆`,
                            `${group.title} · ${control.label} slider`,
                          )}
                          numberAriaLabel={`${group.title} · ${control.label}`}
                          max="90"
                          min="-90"
                          step="1"
                          value={role.characterRig?.controls[control.key] ?? 0}
                          onValueChange={(value) => {
                            setCameraMotionPlaying(false);
                            if (isCrowd && selection.crowdId) {
                              updateCrowdPoseControl(selection.crowdId, control.key, Number(value));
                            } else {
                              updatePoseControl(role.id, control.key, Number(value));
                            }
                          }}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              </InspectorSection>
            </>
          ) : (
            <p className="character-action-compatibility" role="status">
              {text(
                "该模型尚未完成标准人形骨骼映射，暂不支持人形姿势编辑。",
                "This model does not have a complete humanoid bone map, so humanoid pose editing is unavailable.",
              )}
            </p>
          )}
        </InspectorSection>
      ) : activeTab === "action" ? (
        <InspectorSection title={text("动作预设", "Animation presets")} className="pose-preset-section">
          {!allowsHumanoidActions ? (
            <p className="character-action-compatibility" role="status">
              {roleImportReadiness === "native-only"
                ? text(
                    "这个模型只保证播放自带动作，暂不套用人形走路、跑步等预设。",
                    "This model only supports its embedded animations; humanoid walk and run presets are disabled.",
                  )
                : roleImportReadiness === "manual-mapping"
                  ? text(
                      "这个模型需要补全骨骼映射后，才能安全使用人形动作预设。",
                      "Complete the bone mapping before using humanoid animation presets.",
                    )
                  : text("这个模型只能静态使用。", "This model can only be used as a static character.")}
            </p>
          ) : null}
          <div className="character-action-group">
            <span className="character-action-group-label">{text("通用动作", "Common animations")}</span>
            <div className="preset-grid">
              <button
                className={!activeActionPresetId ? "is-active" : undefined}
                type="button"
                onClick={() => {
                  if (isCrowd && selection.crowdId) applyCrowdActionPreset(selection.crowdId, null);
                  else applyCharacterActionPreset(role.id, null);
                  setCameraMotionPlaying(false);
                }}
              >
                {text("无动作", "No animation")}
              </button>
              {allowsHumanoidActions ? compatibleCommonActionPresets.map((preset) => (
                <button
                  key={preset.id}
                  className={activeActionPresetId === preset.id ? "is-active" : undefined}
                  type="button"
                  aria-label={text(`播放动作 ${preset.label}`, `Play animation ${preset.labelEn}`)}
                  onClick={() => {
                    if (isCrowd && selection.crowdId) applyCrowdActionPreset(selection.crowdId, preset.id);
                    else applyCharacterActionPreset(role.id, preset.id);
                    restartCameraMotionPlayback({
                      objectId: role.id,
                      objectIds: isCrowd ? selection.crowdMembers.map((item) => item.id) : undefined,
                      actionPresetId: preset.id,
                      durationSeconds: getCharacterActionDisplayDuration(
                        preset,
                        roleAsset?.url,
                        role.characterRig?.rigType,
                      ),
                    });
                  }}
                >
                  <span>{text(preset.label, preset.labelEn)}</span>
                  <small>{getCharacterActionDisplayDuration(
                    preset,
                    roleAsset?.url,
                    role.characterRig?.rigType,
                  ).toFixed(2)} {text("秒", "sec")}</small>
                </button>
              )) : null}
            </div>
          </div>
          {allowsHumanoidActions && characterSpecificActionPresets.length ? (
            <div className="character-action-group character-action-group--specific">
              <span className="character-action-group-label">
                {text(
                  `${CHARACTER_ACTION_PROFILE_LABELS[characterActionProfile]}适配动作`,
                  `${CHARACTER_ACTION_PROFILE_LABELS_ENGLISH[characterActionProfile]} animations`,
                )}
              </span>
              <div className="preset-grid">
                {characterSpecificActionPresets.map((preset) => (
                  <button
                    key={preset.id}
                    className={activeActionPresetId === preset.id ? "is-active" : undefined}
                    type="button"
                    aria-label={text(`播放角色适配动作 ${preset.label}`, `Play adapted animation ${preset.labelEn}`)}
                    onClick={() => {
                      applyCharacterActionPreset(role.id, preset.id);
                      restartCameraMotionPlayback({
                        objectId: role.id,
                        actionPresetId: preset.id,
                        durationSeconds: getCharacterActionDisplayDuration(
                          preset,
                          roleAsset?.url,
                          role.characterRig?.rigType,
                        ),
                      });
                    }}
                  >
                    <span>{text(preset.label, preset.labelEn)}</span>
                    <small>{getCharacterActionDisplayDuration(
                      preset,
                      roleAsset?.url,
                      role.characterRig?.rigType,
                    ).toFixed(2)} {text("秒", "sec")}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {!isCrowd && importedActionOptions.length ? (
            <div className="character-action-group character-action-group--specific">
              <span className="character-action-group-label">{text("已导入动作", "Imported animations")}</span>
              <div className="preset-grid">
                {importedActionOptions.map((action) => (
                  <button
                    key={action.id}
                    className={`imported-action-preset${role.characterRig?.actionPresetId === action.id ? " is-active" : ""}`}
                    type="button"
                    aria-label={text(`播放导入动作 ${action.label}`, `Play imported animation ${action.label}`)}
                    onClick={() => {
                      applyCharacterActionPreset(role.id, action.id);
                      restartCameraMotionPlayback({
                        objectId: role.id,
                        actionPresetId: action.id,
                        durationSeconds: action.duration,
                      });
                    }}
                  >
                    <span>{action.displayLabel}</span>
                    <small>{action.duration.toFixed(2)} {text("秒", "sec")}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {!isCrowd ? (
            <div className="imported-action-section">
              <div className="imported-action-header">
                <div>
                  <strong>{text("我的动作", "My animations")}</strong>
                  <span>{animationAssets.length
                    ? text(
                        `${compatibleAnimationAssets.length}/${animationAssets.length} 个文件兼容`,
                        `${compatibleAnimationAssets.length}/${animationAssets.length} compatible files`,
                      )
                    : text("支持 FBX / GLB", "Supports FBX / GLB")}</span>
                </div>
                <button
                  className="imported-action-upload"
                  disabled={animationImportBusy || roleImportReadiness === "static-only"}
                  type="button"
                  onClick={() => animationInputRef.current?.click()}
                >
                  <Upload aria-hidden="true" size={14} />
                  {animationImportBusy ? text("检查中", "Inspecting") : text("导入动作", "Import animation")}
                </button>
              </div>
              <input
                ref={animationInputRef}
                aria-label={text("选择人物动作文件", "Select character animation file")}
                className="hidden-file-input"
                accept=".fbx,.glb"
                type="file"
                onChange={(event) => void handleAnimationImport(event)}
              />
              {animationImportStatus ? <p className="imported-action-status" role="status">{animationImportStatus}</p> : null}
              {animationAssets.length ? (
                <div className="imported-action-files">
                  {animationAssets.map((animationAsset) => {
                    const compatible = isNativeAnimationForCharacter(animationAsset, roleAsset)
                      || (allowsHumanoidActions && areAnimationProfilesCompatible(
                        roleRigProfile,
                        animationAsset.rigProfile,
                        roleHasCompleteBoneMap
                      ));
                    return (
                      <div key={animationAsset.id} className="imported-action-file">
                        <span>
                          <strong>{animationAsset.name}</strong>
                          <small>{compatible
                            ? text(`${animationAsset.clips.length} 个动作`, `${animationAsset.clips.length} animations`)
                            : text(`不兼容 · ${animationAsset.rigProfile}`, `Incompatible · ${animationAsset.rigProfile}`)}</small>
                        </span>
                        <button
                          aria-label={text(`删除动作文件 ${animationAsset.name}`, `Remove animation file ${animationAsset.name}`)}
                          type="button"
                          onClick={() => removeImportedAnimationAsset(animationAsset.id)}
                        >
                          <Trash2 aria-hidden="true" size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </InspectorSection>
      ) : (
        <InspectorSection title={text("人物路线", "Character route")} className="pose-preset-section">
          {isCrowd ? (
            <p>{text(
              "群众组暂不支持共用路线。请先选中单个人物。",
              "Crowd groups cannot share a route. Select an individual character first.",
            )}</p>
          ) : (
            <>
              <div className="character-route-toolbar" aria-label={text("路线编辑操作", "Route editing actions")}>
                <button
                  className="character-route-add"
                  type="button"
                  onClick={() => {
                    setCameraMotionPlaying(false);
                    const id = addCharacterRoutePoint(role.id);
                    if (id) selectObjectMotionKeyframe(id);
                  }}
                >
                  <MapPinPlus aria-hidden="true" size={14} />
                  {text("添加点", "Add point")}
                </button>
                <button
                  aria-label={text("预览当前路线点", "Preview current route point")}
                  title={text("定位预览", "Preview position")}
                  className="character-route-icon-button"
                  type="button"
                  disabled={!selectedRoutePoint}
                  onClick={() => {
                    if (selectedRoutePoint) setCameraMotionProgress(selectedArrivalProgress);
                  }}
                >
                  <LocateFixed aria-hidden="true" size={14} />
                </button>
                <button
                  aria-label={text("在当前路线点后插入", "Insert after current route point")}
                  title={text("在当前点后插入", "Insert after current point")}
                  className="character-route-icon-button"
                  type="button"
                  disabled={!selectedRoutePoint || routePath.keyframes[routePath.keyframes.length - 1]?.id === selectedRoutePoint.id}
                  onClick={() => {
                    if (!selectedRoutePoint) return;
                    const id = insertObjectMotionKeyframeAfter(role.id, selectedRoutePoint.id);
                    if (id) selectObjectMotionKeyframe(id);
                  }}
                >
                  <Plus aria-hidden="true" size={15} />
                </button>
                <button
                  aria-label={text("删除当前路线点", "Delete current route point")}
                  title={text("删除当前点", "Delete current point")}
                  className="character-route-icon-button is-danger"
                  type="button"
                  disabled={!selectedRoutePoint}
                  onClick={() => {
                    if (!selectedRoutePoint) return;
                    deleteObjectMotionKeyframe(role.id, selectedRoutePoint.id);
                    selectObjectMotionKeyframe(null);
                  }}
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
              <div className="character-route-shape" role="group" aria-label={text("路线形状", "Route shape")}>
                <span>{text("形状", "Shape")}</span>
                <button
                  type="button"
                  aria-pressed={routePath.interpolation === "smooth"}
                  onClick={() => updateObjectMotionPath(role.id, { interpolation: "smooth" })}
                >
                  {text("平滑", "Smooth")}
                </button>
                <button
                  type="button"
                  aria-pressed={routePath.interpolation === "linear"}
                  onClick={() => updateObjectMotionPath(role.id, { interpolation: "linear" })}
                >
                  {text("折线", "Linear")}
                </button>
              </div>
              <div className="character-route-shape character-route-shape--speed" role="group" aria-label={text("路线速度", "Route speed")}>
                <span>{text("速度", "Speed")}</span>
                <button type="button" aria-pressed={routePath.speedMode === "uniform"} onClick={() => setRouteSpeedMode("uniform")}>{text("匀速", "Uniform")}</button>
                <button type="button" aria-pressed={routePath.speedMode === "soft"} onClick={() => setRouteSpeedMode("soft")}>{text("柔和", "Smooth")}</button>
                <button type="button" aria-pressed={(routePath.speedMode ?? "custom") === "custom"} onClick={() => setRouteSpeedMode("custom")}>{text("自定义", "Custom")}</button>
              </div>
              {routePath.speedMode === "custom" ? (
                <RouteCustomEasingControl
                  curve={routePath.customEasing}
                  label={text("人物段内节奏", "Segment timing")}
                  onChange={(customEasing) => updateObjectMotionPath(role.id, { customEasing })}
                />
              ) : null}
              <div className="character-route-points" role="group" aria-label={text("人物路线点列表", "Character route point list")}>
                {routePath.keyframes.map((point, index) => (
                  <button
                    key={point.id}
                    className={point.id === selectedRoutePoint?.id ? "is-active" : undefined}
                    type="button"
                    aria-label={text(`选择路线点 ${index + 1}`, `Select route point ${index + 1}`)}
                    aria-pressed={point.id === selectedRoutePoint?.id}
                    onClick={() => {
                      selectObjectMotionKeyframe(point.id);
                    }}
                  >
                    <strong>{index + 1}</strong>
                    <span>{((routeTimingPlan?.arrivals[index] ?? point.time) * timelineDuration).toFixed(1)} {text("秒", "sec")}</span>
                  </button>
                ))}
              </div>
              {selectedRoutePoint ? (
                <InspectorSection
                  title={text(
                    `路线点 ${routePath.keyframes.findIndex((point) => point.id === selectedRoutePoint.id) + 1}`,
                    `Route point ${routePath.keyframes.findIndex((point) => point.id === selectedRoutePoint.id) + 1}`,
                  )}
                  className="character-route-editor"
                >
                  <InspectorRangeNumberField
                    label={text("到达时间", "Arrival time")}
                    rangeAriaLabel={text("路线点到达时间滑杆", "Route point arrival time slider")}
                    numberAriaLabel={text("路线点到达时间", "Route point arrival time")}
                    min={String(selectedArrivalMinimum)}
                    max={String(selectedArrivalMaximum)}
                    step="0.1"
                    disabled={routePath.speedMode !== "custom" || selectedRoutePointIndex <= 0 || selectedRoutePointIndex >= routePath.keyframes.length - 1}
                    value={Number((selectedArrivalProgress * timelineDuration).toFixed(1))}
                    onValueChange={(value) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                      time: Math.min(selectedArrivalMaximum, Math.max(selectedArrivalMinimum, Number(value))) / timelineDuration,
                    })}
                  />
                  <div className="inspector-field">
                    <span className="inspector-field-label">{text("到点行为", "Point behavior")}</span>
                    <div className="character-route-shape character-route-shape--compact" role="group" aria-label={text("人物路线点行为", "Character route point behavior")}>
                      <button
                        type="button"
                        aria-pressed={(selectedRoutePoint.pointBehavior ?? "pass") === "pass"}
                        onClick={() => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, { pointBehavior: "pass", holdSeconds: 0 })}
                      >{text("经过", "Pass")}</button>
                      <button
                        type="button"
                        disabled={selectedRoutePointIndex === routePath.keyframes.length - 1}
                        aria-pressed={selectedRoutePoint.pointBehavior === "hold"}
                        onClick={() => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                          pointBehavior: "hold",
                          holdSeconds: selectedRoutePoint.holdSeconds || 1,
                        })}
                      >{text("停留", "Hold")}</button>
                    </div>
                  </div>
                  {selectedRoutePoint.pointBehavior === "hold" ? (
                    <>
                      <InspectorRangeNumberField
                        label={text("停留时长", "Hold duration")}
                        rangeAriaLabel={text("路线点停留时长滑杆", "Route point hold duration slider")}
                        numberAriaLabel={text("路线点停留时长", "Route point hold duration")}
                        min="0.1"
                        max={String(timelineDuration)}
                        step="0.1"
                        value={selectedRoutePoint.holdSeconds ?? 1}
                        onValueChange={(value) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                          holdSeconds: Math.max(0.1, Number(value)),
                        })}
                      />
                      <label className="inspector-field">
                        <span className="inspector-field-label">{text("停留动作", "Hold animation")}</span>
                        <select
                          aria-label={text("路线点停留动作方式", "Route point hold animation mode")}
                          value={selectedRoutePoint.holdAction ?? "current"}
                          onChange={(event) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                            holdAction: event.currentTarget.value === "stand"
                              ? "stand"
                              : event.currentTarget.value === "custom"
                                ? "custom"
                                : "current",
                          })}
                        >
                          <option value="stand">{text("站立", "Stand")}</option>
                          <option value="current">{text("保持当前动作", "Keep current animation")}</option>
                          <option value="custom">{text("指定动作", "Choose animation")}</option>
                        </select>
                      </label>
                      {selectedRoutePoint.holdAction === "custom" ? (
                        <label className="inspector-field">
                          <span className="inspector-field-label">{text("指定动作", "Animation")}</span>
                          <select
                            aria-label={text("路线点指定停留动作", "Route point selected hold animation")}
                            value={resolveCompatibleCharacterActionPresetId(
                              characterActionContext,
                              selectedRoutePoint.holdActionPresetId,
                            ) ?? ""}
                            onChange={(event) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                              holdActionPresetId: event.currentTarget.value || null,
                            })}
                          >
                            <option value="">{text("站立", "Stand")}</option>
                            {allowsHumanoidActions ? availableActionPresets.map((preset) => (
                              <option key={preset.id} value={preset.id}>{text(preset.label, preset.labelEn)}</option>
                            )) : null}
                            {importedActionOptions.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}
                          </select>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  <InspectorAxisGroup
                    label={text("路线点位置", "Route point position")}
                    axes={([0, 1, 2] as const).map((axis) => ({
                      axis: (["X", "Y", "Z"] as const)[axis],
                      ariaLabel: text(
                        `路线点位置 ${(["X", "Y", "Z"] as const)[axis]}`,
                        `Route point position ${(["X", "Y", "Z"] as const)[axis]}`,
                      ),
                      value: selectedRoutePoint.transform.position[axis],
                      onChange: (value: string) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        transform: { position: replaceAxis(selectedRoutePoint.transform.position, axis, Number(value)) },
                      }),
                    }))}
                  />
                  <label className="inspector-field">
                    <span className="inspector-field-label">{text("本段动作", "Segment animation")}</span>
                    <select
                      aria-label={text("路线点本段动作", "Route point segment animation")}
                      value={resolveCompatibleCharacterActionPresetId(
                        characterActionContext,
                        selectedRoutePoint.actionPresetId,
                      ) ?? ""}
                      onChange={(event) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        actionPresetId: event.currentTarget.value || null,
                      })}
                    >
                      <option value="">{text("自动行走", "Automatic walk")}</option>
                      {allowsHumanoidActions ? availableActionPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{text(preset.label, preset.labelEn)}</option>
                      )) : null}
                      {importedActionOptions.map((action) => <option key={action.id} value={action.id}>{action.label}</option>)}
                    </select>
                  </label>
                  <label className="inspector-field">
                    <span className="inspector-field-label">{text("到点朝向", "Facing at point")}</span>
                    <select
                      aria-label={text("路线点朝向方式", "Route point facing mode")}
                      value={selectedRoutePoint.facingMode ?? "manual"}
                      onChange={(event) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        facingMode: event.currentTarget.value === "path" ? "path" : "manual",
                      })}
                    >
                      <option value="path">{text("面向下一个点", "Face next point")}</option>
                      <option value="manual">{text("手动朝向", "Manual facing")}</option>
                    </select>
                  </label>
                  {selectedRoutePoint.facingMode !== "path" ? (
                    <InspectorRangeNumberField
                      label={text("手动朝向", "Manual facing")}
                      rangeAriaLabel={text("路线点手动朝向滑杆", "Route point manual facing slider")}
                      numberAriaLabel={text("路线点手动朝向", "Route point manual facing")}
                      min="-180"
                      max="180"
                      step="1"
                      value={selectedRoutePoint.transform.rotation[1] * 180 / Math.PI}
                      onValueChange={(value) => updateObjectMotionKeyframe(role.id, selectedRoutePoint.id, {
                        transform: {
                          rotation: replaceAxis(
                            selectedRoutePoint.transform.rotation,
                            1,
                            Number(value) * Math.PI / 180
                          ),
                        },
                      })}
                    />
                  ) : null}
                </InspectorSection>
              ) : <p>{text(
                "添加第一个路线点后，可在场景里拖动编号点继续摆路线。",
                "Add the first route point, then drag numbered points in the scene to shape the route.",
              )}</p>}
            </>
          )}
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
