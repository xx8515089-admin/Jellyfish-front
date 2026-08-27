import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const root = process.cwd();
const publicRoot = path.join(root, "public");
const guoModelRoot = path.join(
  publicRoot,
  "director-desk-assets",
  "local-assets",
  "guo-3d-assets",
  "guo-skeleton-models",
);
const mixamoRoot = path.join(
  publicRoot,
  "director-desk-assets",
  "local-assets",
  "mixamo",
);

globalThis.ProgressEvent ??= class ProgressEvent {};

const failures = [];

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

function normalizePublicUrl(url) {
  const pathname = String(url ?? "").split(/[?#]/, 1)[0].replace(/^\/+/, "");
  return path.join(publicRoot, ...pathname.split("/"));
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function loadCharacterModel(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (/\.glb$/i.test(filePath)) {
    const loaded = await new GLTFLoader().parseAsync(toArrayBuffer(buffer), "");
    return { scene: loaded.scene, animations: loaded.animations };
  }

  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (String(args[0] ?? "").includes("more than 4 skinning weights")) return;
    originalWarn(...args);
  };
  try {
    const scene = new FBXLoader().parse(toArrayBuffer(buffer), "");
    return { scene, animations: scene.animations ?? [] };
  } finally {
    console.warn = originalWarn;
  }
}

function getChangingControlKeys(preset) {
  const valuesByKey = new Map();
  preset.keyframes.forEach((keyframe) => {
    Object.entries(keyframe.controls).forEach(([key, value]) => {
      const values = valuesByKey.get(key) ?? [];
      values.push(value);
      valuesByKey.set(key, values);
    });
  });
  return [...valuesByKey.entries()]
    .filter(([, values]) => Math.max(...values) - Math.min(...values) > 1e-6)
    .map(([key]) => key);
}

function getControlRange(key) {
  if (key === "body.offsetY") return [-0.5, 0.5];
  if (/^(body|torso)\.(pitch|yaw|roll)$/.test(key)) return [-45, 45];
  if (/^head\.(pitch|yaw|roll)$/.test(key)) return [-60, 60];
  if (/Shoulder\.pitch$/.test(key)) return [-120, 120];
  if (/Shoulder\.(spread|twist)$/.test(key)) return [-90, 90];
  if (/Elbow\.bend$/.test(key)) return [0, 135];
  if (/Hip\.pitch$/.test(key)) return [-90, 90];
  if (/Hip\.(spread|twist)$/.test(key)) return [-60, 60];
  if (/Knee\.bend$/.test(key)) return [0, 135];
  if (/Hand\.roll$/.test(key)) return [-90, 90];
  return null;
}

function validatePreset(
  preset,
  getCharacterActionPreset,
  getCharacterActionPlaybackMode,
  sampleCharacterActionControls,
) {
  const scope = `动作 ${preset.id}`;
  if (!Number.isFinite(preset.duration) || preset.duration <= 0) {
    fail(scope, "duration 必须是正数");
  }
  if (!Array.isArray(preset.keyframes) || preset.keyframes.length < 2) {
    fail(scope, "至少需要两个关键帧");
    return;
  }
  if (preset.keyframes[0].t !== 0 || preset.keyframes.at(-1)?.t !== 1) {
    fail(scope, "关键帧必须从 t=0 开始并在 t=1 结束");
  }
  preset.keyframes.forEach((keyframe, index) => {
    if (!Number.isFinite(keyframe.t) || keyframe.t < 0 || keyframe.t > 1) {
      fail(scope, `第 ${index + 1} 个关键帧时间不合法`);
    }
    if (index > 0 && keyframe.t <= preset.keyframes[index - 1].t) {
      fail(scope, `第 ${index + 1} 个关键帧没有按时间递增`);
    }
    Object.entries(keyframe.controls).forEach(([key, value]) => {
      if (!Number.isFinite(value)) fail(scope, `${key} 不是有限数值`);
      const range = getControlRange(key);
      if (!range) {
        fail(scope, `包含未知控制项 ${key}`);
      } else if (value < range[0] || value > range[1]) {
        fail(scope, `${key}=${value} 超出安全范围 ${range[0]}..${range[1]}`);
      }
    });
  });

  for (let index = 1; index < preset.keyframes.length; index += 1) {
    const previous = preset.keyframes[index - 1];
    const current = preset.keyframes[index];
    const transitionSeconds = (current.t - previous.t) * preset.duration;
    const keys = new Set([...Object.keys(previous.controls), ...Object.keys(current.controls)]);
    keys.forEach((key) => {
      const delta = Math.abs((current.controls[key] ?? 0) - (previous.controls[key] ?? 0));
      const maxSpeed = key === "body.offsetY" ? 2 : 540;
      if (delta / Math.max(transitionSeconds, 1e-6) > maxSpeed) {
        fail(scope, `${key} 在关键帧 ${index}→${index + 1} 变化过快`);
      }
    });
  }

  if (getCharacterActionPlaybackMode(preset.id) === "loop") {
    const firstControls = preset.keyframes[0].controls;
    const lastControls = preset.keyframes.at(-1).controls;
    const loopKeys = new Set([...Object.keys(firstControls), ...Object.keys(lastControls)]);
    loopKeys.forEach((key) => {
      if (Math.abs((firstControls[key] ?? 0) - (lastControls[key] ?? 0)) > 1e-6) {
        fail(scope, `${key} 的循环首尾不闭合`);
      }
    });
  }

  if (getCharacterActionPreset(preset.id) !== preset) {
    fail(scope, "无法通过统一动作查询器取回");
  }
  if (!getChangingControlKeys(preset).length) {
    fail(scope, "所有关键帧完全相同，播放时不会产生动作");
  }

  const sampleTimes = new Set([
    0,
    preset.duration * 0.25,
    preset.duration * 0.5,
    preset.duration * 0.75,
    ...preset.keyframes.map((keyframe) => keyframe.t * preset.duration),
  ]);
  sampleTimes.forEach((time) => {
    const controls = sampleCharacterActionControls(preset.id, time, {});
    Object.entries(controls).forEach(([key, value]) => {
      if (!Number.isFinite(value)) fail(scope, `${time.toFixed(3)} 秒采样得到无效控制值 ${key}`);
    });
  });
}

const server = await createServer({
  appType: "custom",
  configFile: false,
  define: {
    __LOCAL_GUO_ASSETS_AVAILABLE__: "true",
    __LOCAL_MIXAMO_ANIMATIONS_AVAILABLE__: "true",
    __LOCAL_MIXAMO_CHARACTER_AVAILABLE__: "true",
  },
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true },
});

try {
  const [
    actionPresetsModule,
    specificPresetsModule,
    compatibilityModule,
    playbackPolicyModule,
    characterModelModule,
  ] = await Promise.all([
    server.ssrLoadModule("/src/pages/directorDesk/runtime/editor/presets/characterActionPresets.ts"),
    server.ssrLoadModule("/src/pages/directorDesk/runtime/editor/presets/characterSpecificActionPresets.ts"),
    server.ssrLoadModule("/src/pages/directorDesk/runtime/editor/modelLibrary/guoCharacterCompatibility.ts"),
    server.ssrLoadModule("/src/pages/directorDesk/runtime/editor/runtime/characterActionPlaybackPolicy.ts"),
    server.ssrLoadModule("/src/pages/directorDesk/runtime/editor/runtime/MixamoCharacterModel.tsx"),
  ]);

  const {
    CHARACTER_ACTION_PRESETS,
    getCharacterActionPreset,
    sampleCharacterActionControls,
  } = actionPresetsModule;
  const {
    CHARACTER_SPECIFIC_ACTION_PRESETS,
    getCharacterActionProfile,
    getCharacterSpecificActionPresets,
    getCompatibleCharacterCommonActionPresets,
    resolveCompatibleCharacterActionPresetId,
  } = specificPresetsModule;
  const { getGuoCharacterCompatibility } = compatibilityModule;
  const { shouldUseProceduralBuiltInAction } = playbackPolicyModule;
  const { getCharacterActionPlaybackMode } = playbackPolicyModule;
  const {
    getNativeMixamoActionClip,
    getProceduralJointForBoneName,
    ROBOT_EXPRESSIVE_ACTION_CLIPS,
  } = characterModelModule;

  const allPresets = [...CHARACTER_ACTION_PRESETS, ...CHARACTER_SPECIFIC_ACTION_PRESETS];
  const uniquePresetIds = new Set(allPresets.map((preset) => preset.id));
  if (uniquePresetIds.size !== allPresets.length) fail("动作目录", "存在重复动作 id");
  allPresets.forEach((preset) => validatePreset(
    preset,
    getCharacterActionPreset,
    getCharacterActionPlaybackMode,
    sampleCharacterActionControls,
  ));

  const guoManifestPath = path.join(
    guoModelRoot,
    "guoCharactersManifest.json",
  );
  const sourceManifestPath = path.join(
    root,
    "src",
    "pages",
    "directorDesk",
    "runtime",
    "editor",
    "modelLibrary",
    "guoCharactersManifest.json",
  );
  const manifest = JSON.parse(fs.readFileSync(
    fs.existsSync(guoManifestPath) ? guoManifestPath : sourceManifestPath,
    "utf8",
  ));

  const characters = manifest.items.map((item) => {
    const compatibility = getGuoCharacterCompatibility(item.id);
    return {
      id: item.id,
      label: item.label,
      filePath: path.join(guoModelRoot, ...item.localModelPath.split("/")),
      source: `/director-desk-assets/local-assets/guo-3d-assets/guo-skeleton-models/${item.localModelPath}`,
      ...compatibility,
    };
  });
  characters.push(
    {
      id: "mixamo-character:camille",
      label: "Camille（Mixamo）",
      filePath: path.join(mixamoRoot, "characters", "camille.fbx"),
      source: "camille.fbx",
      readiness: "ready",
      rigProfile: "mixamo",
    },
    {
      id: "rigged-character:robot-expressive",
      label: "表情机器人（自带动作）",
      filePath: path.join(mixamoRoot, "characters", "robot-expressive.glb"),
      source: "robot-expressive.glb",
      readiness: "ready",
      rigProfile: "mixamo",
    },
  );

  const profileCounts = new Map();
  let checkedActionCombinations = 0;
  let parsedModels = 0;
  let blockedModels = 0;
  const parsedAnimationFiles = new Map();

  async function validateExternalAnimation(animationPath, scope) {
    if (parsedAnimationFiles.has(animationPath)) return parsedAnimationFiles.get(animationPath);

    const result = (async () => {
      if (!fs.existsSync(animationPath)) {
        fail(scope, `动画文件不存在：${path.relative(root, animationPath)}`);
        return false;
      }
      try {
        const loaded = await loadCharacterModel(animationPath);
        if (!loaded.animations.length) {
          fail(scope, "动画文件中没有动画片段");
          return false;
        }
        const runtimeClip = loaded.animations[0];
        if (!Number.isFinite(runtimeClip.duration) || runtimeClip.duration <= 0) {
          fail(scope, "运行时首个动画片段时长无效");
          return false;
        }
        if (!runtimeClip.tracks.length) {
          fail(scope, "运行时首个动画片段没有轨道");
          return false;
        }
        return true;
      } catch (error) {
        fail(scope, `动画解析失败：${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    })();

    parsedAnimationFiles.set(animationPath, result);
    return result;
  }

  for (const character of characters) {
    const scope = `模型 ${character.label}`;
    if (!fs.existsSync(character.filePath)) {
      fail(scope, `模型文件不存在：${path.relative(root, character.filePath)}`);
      continue;
    }

    let loaded;
    try {
      loaded = await loadCharacterModel(character.filePath);
      parsedModels += 1;
    } catch (error) {
      fail(scope, `模型解析失败：${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const context = {
      assetName: character.label,
      assetUrl: character.source,
      importReadiness: character.readiness,
      objectName: character.label,
    };
    const profile = getCharacterActionProfile(context);
    profileCounts.set(profile, (profileCounts.get(profile) ?? 0) + 1);

    const commonPresets = getCompatibleCharacterCommonActionPresets(
      context,
      CHARACTER_ACTION_PRESETS,
    );
    if (character.readiness !== "ready") {
      blockedModels += 1;
      if (commonPresets.length) fail(scope, "需映射模型不应暴露通用动作");
      for (const preset of allPresets) {
        if (resolveCompatibleCharacterActionPresetId(context, preset.id) !== null) {
          fail(scope, `需映射模型错误接受了动作 ${preset.id}`);
        }
      }
      continue;
    }

    const specificPresets = getCharacterSpecificActionPresets(context);
    const visiblePresets = [...commonPresets, ...specificPresets];
    if (!commonPresets.length) fail(scope, "没有可用的通用动作");
    if (!specificPresets.length) fail(scope, "没有角色适配动作");

    const boneNames = [];
    loaded.scene.traverse((object) => {
      if (object.isBone) boneNames.push(object.name);
    });
    const matchedJoints = new Set(
      boneNames.map((name) => getProceduralJointForBoneName(name)).filter(Boolean),
    );
    const requiredCoreJoints = [
      "body",
      "torso",
      "head",
      "leftShoulder",
      "rightShoulder",
      "leftElbow",
      "rightElbow",
      "leftHip",
      "rightHip",
      "leftKnee",
      "rightKnee",
    ];
    const missingCoreJoints = requiredCoreJoints.filter((joint) => !matchedJoints.has(joint));
    if (missingCoreJoints.length) {
      fail(scope, `缺少程序化动作关节：${missingCoreJoints.join(", ")}`);
    }

    for (const preset of visiblePresets) {
      checkedActionCombinations += 1;
      if (resolveCompatibleCharacterActionPresetId(context, preset.id) !== preset.id) {
        fail(scope, `界面动作 ${preset.id} 无法通过兼容性解析`);
      }

      const isRobotExpressive = character.id === "rigged-character:robot-expressive";
      if (isRobotExpressive) {
        const clip = getNativeMixamoActionClip(
          preset.id,
          loaded.animations,
          ROBOT_EXPRESSIVE_ACTION_CLIPS,
        );
        if (!clip) fail(scope, `原生动作 ${preset.id} 没有对应动画片段`);
        continue;
      }

      const useProcedural = specificPresets.includes(preset)
        || shouldUseProceduralBuiltInAction(character.source, preset.id)
        || !preset.mixamoAnimationUrl;
      if (!useProcedural) {
        const animationPath = normalizePublicUrl(preset.mixamoAnimationUrl);
        await validateExternalAnimation(animationPath, `${scope} / 动作 ${preset.id}`);
        continue;
      }

      const missingActionJoints = getChangingControlKeys(preset)
        .filter((key) => key !== "body.offsetY")
        .map((key) => key.split(".", 1)[0])
        .filter((joint, index, joints) => joints.indexOf(joint) === index)
        .filter((joint) => !matchedJoints.has(joint));
      if (missingActionJoints.length) {
        fail(scope, `动作 ${preset.id} 找不到目标关节：${missingActionJoints.join(", ")}`);
      }
    }
  }

  if (failures.length) {
    console.error(`\n动作审计失败（${failures.length}）：`);
    failures.forEach((message) => console.error(`- ${message}`));
    process.exitCode = 1;
  } else {
    const profiles = [...profileCounts.entries()]
      .map(([profile, count]) => `${profile}=${count}`)
      .join(", ");
    console.log("3D 导演台角色动作审计通过");
    console.log(`- 解析本地角色：${parsedModels}/${characters.length}`);
    console.log(`- 可用角色：${parsedModels - blockedModels}，需映射角色：${blockedModels}`);
    console.log(`- 角色 × 动作组合：${checkedActionCombinations}`);
    console.log(`- 外部动画资源：${parsedAnimationFiles.size}`);
    console.log(`- 动作预设：${allPresets.length}`);
    console.log(`- 角色分类：${profiles}`);
  }
} finally {
  await server.close();
}
