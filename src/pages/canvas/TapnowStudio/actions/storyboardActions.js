import { canvasAlert, canvasConfirm, canvasPrompt } from '../canvasDialogs';
import {
    t,
    DEFAULT_BASE_URL,
    isSameShotId,
    MAX_STORYBOARD_OUTPUT_HISTORY,
    normalizeStoryboardOutputSnapshot,
    isSameStoryboardOutputSnapshot,
    isImageModelType,
    isChatModelType,
    STORYBOARD_TABLE_PROMPT_MODE,
    STORYBOARD_LLM_SPLIT_MODES,
    STORYBOARD_LLM_PROMPT_MODES,
    STORYBOARD_PROMPT_SLOT_OPTIONS,
    STORYBOARD_DEFAULT_TABLE_HEADERS,
    normalizeStoryboardMode,
    normalizeStoryboardViewMode,
    parseMarkdownTable,
    parseStoryboardTableInput,
    stringifyMarkdownTable,
    getStoryboardTableShotColumnIndex,
    getStoryboardTablePromptColumnIndex,
    getStoryboardTableDescriptionColumnIndex,
    normalizeStoryboardSceneIndex,
    parseJsonArrayFromText
} from '../freeCanvasShared';

export async function runDescriptionPromptAction({
    canvasCloud,
    cloudDocument,
    getApiConfigByKey,
    getApiCredentials,
    lastUsedExtractModel,
    nodesMap,
    resolveModelKey,
    setActiveDropdown,
    setSettingsOpen,
    showToast,
    updateNodeSettings,
}, nodeId, action) {
        const node = nodesMap.get(nodeId);
        if (!node || (node.type !== 'character-description' && node.type !== 'scene-description')) return;

        if (cloudDocument) return canvasCloud.textExecute(nodeId, action === 'enhance' ? 'promptEnhance' : 'promptFilter');

        const modelId = resolveModelKey(node.settings?.chatModel || lastUsedExtractModel || '');
        if (!modelId) {
            showToast('请先选择大模型', 'warning', 3000);
            setActiveDropdown({ nodeId, type: 'desc-model' });
            return;
        }

        const credentials = getApiCredentials(modelId);
        if (!credentials.key) {
            showToast('请先在设置中配置 API Key', 'error', 4000);
            setSettingsOpen(true);
            return;
        }

        const promptText = (node.settings?.prompt || '').trim();
        if (!promptText) {
            showToast('请先输入提示词', 'warning', 3000);
            return;
        }

        const config = getApiConfigByKey(modelId);
        const baseUrl = (credentials.url || DEFAULT_BASE_URL).replace(/\/+$/, '');
        const modelName = config?.modelName || modelId;
        const isCharacter = node.type === 'character-description';
        const characterFilterPrompt = '你是一个提示词优化专家。请分析以下提示词，只保留关于人物外貌、服装、姿态等角色特征的描述，去除所有剧情、动作、对话和背景信息。输出应简洁，只包含角色特征描述，格式为"全身视角，[人物特征描述]，站在纯白色背景前"。必须确保背景始终是纯白色，不能有任何场景描述。';
        const sceneEnhancePrompt = '你是一个场景描述优化专家。请分析以下提示词，只保留关于场景、环境、建筑、背景等场景特征的描述，去除所有人物、角色、字符、对话和动作描述。输出应简洁，只包含场景特征描述，不能包含任何人物或角色。';

        let systemPrompt = '';
        let userPrompt = promptText;
        let temperature = 0.7;

        if (isCharacter && action === 'filter') {
            systemPrompt = characterFilterPrompt;
            temperature = 0.3;
        } else if (!isCharacter && action === 'enhance') {
            systemPrompt = sceneEnhancePrompt;
            temperature = 0.3;
        } else {
            systemPrompt = action === 'enhance'
                ? '你是影视分镜提示词优化专家。请在保持原意的基础上扩展细节、镜头语言与氛围质感，输出一段中文提示词。不要输出解释或JSON。'
                : '你是提示词清洗助手。请移除无效/冲突/敏感词，保留核心语义并更精炼，输出一段中文提示词。不要输出解释或JSON。';
        }

        updateNodeSettings(nodeId, { isEnhancing: true });
        try {
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${credentials.key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature
                })
            });

            if (!response.ok) {
                let detail = '';
                try {
                    const err = await response.json();
                    detail = err?.error?.message || err?.message || '';
                } catch { }
                throw new Error(`API Error: ${response.status}${detail ? ` - ${detail}` : ''}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || data.content || '';
            const cleaned = content.replace(/```[\s\S]*?```/g, '').trim();
            if (cleaned) {
                updateNodeSettings(nodeId, { prompt: cleaned });
                showToast(action === 'enhance' ? '已增强提示词' : '已过滤提示词', 'success', 2000);
            } else {
                showToast('返回内容为空，请重试', 'warning', 3000);
            }
        } catch (err) {
            console.error('[描述提示词处理失败]', err);
            showToast(`处理失败: ${err.message || '未知错误'}`, 'error', 4000);
        } finally {
            updateNodeSettings(nodeId, { isEnhancing: false });
        }
    }

export function generateFullWorkflow({
    apiConfigs,
    generateCharacterPrompt,
    generateScenePrompt,
    lastUsedExtractModel,
    lastUsedImageModel,
    lastUsedImageResolution,
    lastUsedRatio,
    lastUsedVideoModel,
    lastUsedVideoResolution,
    nodesMap,
    resolveModelKey,
    saveToUndoStack,
    setConnections,
    setNodes,
}, extractNodeId, analysisResults) {
        const extractNode = nodesMap.get(extractNodeId);
        if (!extractNode) return;

        const characters = Array.isArray(analysisResults?.characters) ? analysisResults.characters : [];
        const scenes = Array.isArray(analysisResults?.scenes) ? analysisResults.scenes : [];
        if (characters.length === 0 && scenes.length === 0) return;

        saveToUndoStack();

        const baseX = extractNode.x + extractNode.width + 100;
        const baseY = extractNode.y;
        const rowGap = 450;
        const timestamp = Date.now();

        const defaultVideoModel = resolveModelKey(lastUsedVideoModel)
            || resolveModelKey(apiConfigs.find(c => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro'))?.id)
            || resolveModelKey(apiConfigs.find(c => c.type === 'Video')?.id)
            || '';
        const defaultImageModel = resolveModelKey(lastUsedImageModel) || resolveModelKey(apiConfigs.find(c => isImageModelType(c.type))?.id) || '';
        const defaultChatModel = resolveModelKey(lastUsedExtractModel) || resolveModelKey(apiConfigs.find(c => isChatModelType(c.type))?.id) || '';
        const defaultRatio = lastUsedRatio || '16:9';
        const defaultVideoResolution = lastUsedVideoResolution || '720p';
        const defaultImageResolution = lastUsedImageResolution || '2K';

        const newNodes = [];
        const newConnections = [];

        if (characters.length > 0) {
            characters.forEach((character, idx) => {
                const descId = `node - char-desc - ${timestamp} - ${idx}`;
                const videoId = `node - char-video - ${timestamp} - ${idx}`;
                const createId = `node - char-create - ${timestamp} - ${idx}`;
                const prompt = generateCharacterPrompt(character, 'video');

                newNodes.push({
                    id: descId,
                    type: 'character-description',
                    x: baseX,
                    y: baseY + (idx * rowGap),
                    width: 400,
                    height: 400,
                    settings: {
                        characterId: character?.id || '',
                        characterName: character?.name || '',
                        role: character?.role || '',
                        age: character?.age || '',
                        gender: character?.gender || '',
                        description: character?.description || '',
                        prompt,
                        mode: 'video',
                        imageModel: defaultImageModel,
                        imageRatio: defaultRatio,
                        imageResolution: defaultImageResolution,
                        referenceImages: [],
                        chatModel: defaultChatModel
                    }
                });

                newNodes.push({
                    id: videoId,
                    type: 'generate-character-video',
                    x: baseX + 420,
                    y: baseY + (idx * rowGap),
                    width: 400,
                    height: 450,
                    settings: {
                        model: defaultVideoModel,
                        duration: '15s',
                        ratio: defaultRatio,
                        resolution: defaultVideoResolution,
                        videoPrompt: prompt,
                        referenceImages: [],
                        sourceType: 'character-description',
                        sourceId: descId
                    }
                });

                newNodes.push({
                    id: createId,
                    type: 'create-character',
                    x: baseX + 840,
                    y: baseY + (idx * rowGap),
                    width: 350,
                    height: 300,
                    settings: {
                        name: character?.name || '',
                        startSecond: 1,
                        endSecond: 3
                    }
                });

                newConnections.push(
                    { id: `conn - char-desc - ${timestamp} - ${idx}`, from: extractNodeId, to: descId },
                    { id: `conn - char-video - ${timestamp} - ${idx}`, from: descId, to: videoId },
                    { id: `conn - char-create - ${timestamp} - ${idx}`, from: videoId, to: createId }
                );
            });
        }

        if (scenes.length > 0) {
            const characterCount = characters.length;
            scenes.forEach((scene, idx) => {
                const sceneIndex = characterCount + idx;
                const descId = `node - scene-desc - ${timestamp} - ${idx}`;
                const videoId = `node - scene-video - ${timestamp} - ${idx}`;
                const createId = `node - scene-create - ${timestamp} - ${idx}`;
                const prompt = generateScenePrompt(scene);
                const sceneName = scene?.location || scene?.name || scene?.sceneName || '';

                newNodes.push({
                    id: descId,
                    type: 'scene-description',
                    x: baseX,
                    y: baseY + (sceneIndex * rowGap),
                    width: 400,
                    height: 400,
                    settings: {
                        sceneId: scene?.id || '',
                        sceneName,
                        description: scene?.description || '',
                        prompt,
                        mode: 'video',
                        style: scene?.style || '',
                        imageModel: defaultImageModel,
                        imageRatio: defaultRatio,
                        imageResolution: defaultImageResolution,
                        referenceImages: [],
                        chatModel: defaultChatModel
                    }
                });

                newNodes.push({
                    id: videoId,
                    type: 'generate-scene-video',
                    x: baseX + 420,
                    y: baseY + (sceneIndex * rowGap),
                    width: 400,
                    height: 450,
                    settings: {
                        model: defaultVideoModel,
                        duration: '15s',
                        ratio: defaultRatio,
                        resolution: defaultVideoResolution,
                        videoPrompt: prompt,
                        referenceImages: [],
                        sourceType: 'scene-description',
                        sourceId: descId
                    }
                });

                newNodes.push({
                    id: createId,
                    type: 'create-scene',
                    x: baseX + 840,
                    y: baseY + (sceneIndex * rowGap),
                    width: 350,
                    height: 300,
                    settings: {
                        name: sceneName,
                        startSecond: 1,
                        endSecond: 3
                    }
                });

                newConnections.push(
                    { id: `conn - scene-desc - ${timestamp} - ${idx}`, from: extractNodeId, to: descId },
                    { id: `conn - scene-video - ${timestamp} - ${idx}`, from: descId, to: videoId },
                    { id: `conn - scene-create - ${timestamp} - ${idx}`, from: videoId, to: createId }
                );
            });
        }

        if (newNodes.length > 0) {
            setNodes(prev => [...prev, ...newNodes]);
        }
        if (newConnections.length > 0) {
            setConnections(prev => [...prev, ...newConnections]);
        }
    }

export function ensureImageNodeForDescription({
    addNode,
    apiConfigs,
    connections,
    generateCharacterPrompt,
    generateScenePrompt,
    lastUsedExtractModel,
    lastUsedImageModel,
    lastUsedImageResolution,
    lastUsedRatio,
    nodesMap,
    resolveModelKey,
    stripCharacterVideoSuffix,
    updateNodeSettings,
}, descNodeId) {
        const descNode = nodesMap.get(descNodeId);
        if (!descNode) return;
        const isCharacter = descNode.type === 'character-description';
        const targetType = isCharacter ? 'generate-character-image' : 'generate-scene-image';

        const existing = connections.find(conn => conn.from === descNodeId && nodesMap.get(conn.to)?.type === targetType);
        if (existing) return;

                const baseCharacter = {
                    name: descNode.settings?.characterName || descNode.settings?.name || '角色',
                    role: descNode.settings?.role || '',
                    description: descNode.settings?.description || '',
                    age: descNode.settings?.age || '',
                    gender: descNode.settings?.gender || ''
                };
        const baseScene = {
            name: descNode.settings?.sceneName || descNode.settings?.location || '场景',
            location: descNode.settings?.sceneName || descNode.settings?.location || '',
            description: descNode.settings?.description || ''
        };
        const defaultPrompt = isCharacter
            ? generateCharacterPrompt(baseCharacter, 'image')
            : generateScenePrompt(baseScene);

        const worldX = descNode.x + descNode.width + 200;
        const worldY = descNode.y + descNode.height / 2;
        const created = addNode(targetType, worldX, worldY, descNodeId);
        if (!created?.id) return;

        const defaultImageModel = resolveModelKey(descNode.settings?.imageModel || lastUsedImageModel || apiConfigs.find(c => isImageModelType(c.type))?.id || '');
        const defaultRatio = descNode.settings?.imageRatio || lastUsedRatio || '16:9';
        const defaultResolution = descNode.settings?.imageResolution || lastUsedImageResolution || '2K';
        const defaultChatModel = resolveModelKey(descNode.settings?.chatModel || lastUsedExtractModel || '');

        const rawPrompt = descNode.settings?.prompt || defaultPrompt;
        const imagePrompt = isCharacter ? stripCharacterVideoSuffix(rawPrompt) : rawPrompt;

        updateNodeSettings(created.id, {
            model: defaultImageModel,
            ratio: defaultRatio,
            resolution: defaultResolution,
            prompt: imagePrompt,
            referenceImages: descNode.settings?.referenceImages || [],
            chatModel: defaultChatModel,
            sourceType: descNode.type,
            sourceId: descNode.id
        });
    }

export function ensureVideoNodeForDescription({
    addNode,
    apiConfigs,
    connections,
    ensureCharacterVideoSuffix,
    generateCharacterPrompt,
    generateScenePrompt,
    lastUsedRatio,
    lastUsedVideoModel,
    lastUsedVideoResolution,
    nodesMap,
    resolveModelKey,
    updateNodeSettings,
}, descNodeId) {
        const descNode = nodesMap.get(descNodeId);
        if (!descNode) return;
        const isCharacter = descNode.type === 'character-description';
        const targetType = isCharacter ? 'generate-character-video' : 'generate-scene-video';

        const existing = connections.find(conn => conn.from === descNodeId && nodesMap.get(conn.to)?.type === targetType);
        if (existing) return;

        const baseCharacter = {
            name: descNode.settings?.characterName || descNode.settings?.name || '角色',
            role: descNode.settings?.role || '',
            description: descNode.settings?.description || '',
            age: descNode.settings?.age || '',
            gender: descNode.settings?.gender || ''
        };
        const baseScene = {
            name: descNode.settings?.sceneName || descNode.settings?.location || '场景',
            location: descNode.settings?.sceneName || descNode.settings?.location || '',
            description: descNode.settings?.description || ''
        };
        const defaultPrompt = isCharacter
            ? generateCharacterPrompt(baseCharacter, 'video')
            : generateScenePrompt(baseScene);
        const rawPrompt = descNode.settings?.prompt || defaultPrompt;
        const videoPrompt = isCharacter ? ensureCharacterVideoSuffix(rawPrompt) : rawPrompt;

        const worldX = descNode.x + descNode.width + 200;
        const worldY = descNode.y + descNode.height / 2;
        const created = addNode(targetType, worldX, worldY, descNodeId);
        if (!created?.id) return;

        const defaultVideoModel = resolveModelKey(lastUsedVideoModel)
            || resolveModelKey(apiConfigs.find(c => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro'))?.id)
            || resolveModelKey(apiConfigs.find(c => c.type === 'Video')?.id)
            || '';
        const defaultRatio = descNode.settings?.imageRatio || lastUsedRatio || '16:9';
        const defaultResolution = lastUsedVideoResolution || '720p';

        updateNodeSettings(created.id, {
            model: defaultVideoModel,
            duration: '15s',
            ratio: defaultRatio,
            resolution: defaultResolution,
            videoPrompt,
            referenceImages: descNode.settings?.referenceImages || [],
            sourceType: descNode.type,
            sourceId: descNode.id
        });
    }

export async function importStoryboardPromptSlots({
    nodesMap,
    normalizeImportedStoryboardPromptSlots,
    showToast,
    updateNodeSettings,
}, nodeId) {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        let rawText = '';
        try {
            if (navigator?.clipboard?.readText) {
                rawText = await navigator.clipboard.readText();
            }
        } catch (err) { }
        if (!String(rawText || '').trim()) {
            rawText = await canvasPrompt('粘贴 LLM 记忆槽 JSON（支持 flat key: script:memory1）', '', { multiline: true });
            if (rawText === null) return;
        }
        if (!String(rawText || '').trim()) {
            showToast('未读取到可导入内容', 'warning', 2200);
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (err) {
            showToast('导入失败：JSON 格式不正确', 'error', 2600);
            return;
        }
        const sourceSlots = parsed?.llmPromptSlots && typeof parsed.llmPromptSlots === 'object'
            ? parsed.llmPromptSlots
            : parsed;
        const normalizedSlots = normalizeImportedStoryboardPromptSlots(sourceSlots);
        if (Object.keys(normalizedSlots).length === 0) {
            showToast('导入失败：未识别到有效记忆槽', 'warning', 2800);
            return;
        }
        const currentSlots = node.settings?.llmPromptSlots && typeof node.settings.llmPromptSlots === 'object'
            ? node.settings.llmPromptSlots
            : {};
        const currentSelection = node.settings?.llmPromptSlotSelection && typeof node.settings.llmPromptSlotSelection === 'object'
            ? node.settings.llmPromptSlotSelection
            : {};
        const incomingSelection = parsed?.llmPromptSlotSelection && typeof parsed.llmPromptSlotSelection === 'object'
            ? parsed.llmPromptSlotSelection
            : {};
        const nextSelection = { ...currentSelection };
        STORYBOARD_LLM_PROMPT_MODES.forEach((mode) => {
            const slot = incomingSelection[mode];
            if (STORYBOARD_PROMPT_SLOT_OPTIONS.some((item) => item.key === slot)) {
                nextSelection[mode] = slot;
            }
        });
        updateNodeSettings(nodeId, {
            llmPromptSlots: { ...currentSlots, ...normalizedSlots },
            llmPromptSlotSelection: nextSelection
        });
        showToast(`已导入 ${Object.keys(normalizedSlots).length} 个记忆槽`, 'success', 2600);
    }

export async function runStoryboardLlmSplit({
    cloudDocument,
    canvasCloud,
    chatModel,
    getApiCredentials,
    getConnectedTextNodes,
    getDefaultCustomParamsForModel,
    getDefaultDurationForModel,
    getFirstEnabledModelKey,
    getPreferredImageResolutionForModel,
    getPreferredModelRatio,
    getPreferredVideoResolutionForModel,
    getStoryboardPromptTemplate,
    nodesMap,
    saveToUndoStack,
    updateNodeSettings,
}, nodeId, mode = 'script') {
        if (cloudDocument) return canvasCloud.textExecute(nodeId, 'storyboardSplit');
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        const normalizedMode = STORYBOARD_LLM_SPLIT_MODES.includes(mode) ? mode : 'script';
        let scriptText = node.settings?.scriptText || '';
        if (!scriptText.trim()) {
            const connectedTexts = getConnectedTextNodes(nodeId);
            if (connectedTexts.length > 0) {
                scriptText = connectedTexts.join('\n\n');
            }
        }
        if (!scriptText.trim()) {
            updateNodeSettings(nodeId, { errorMsg: '请先输入分镜脚本' });
            return;
        }

        const existingShots = node.settings?.shots || [];
        let shouldAppend = false;
        if (existingShots.length > 0) {
            const overwrite = await canvasConfirm('当前已有镜头内容，请选择覆盖或追加到末尾。', {
                okText: '覆盖',
                cancelText: '追加',
                dismissValue: null,
            });
            if (overwrite === null) return;
            shouldAppend = !overwrite;
        }

        const { key: apiKey, url: baseUrl } = getApiCredentials(chatModel);
        if (!apiKey) {
            updateNodeSettings(nodeId, { errorMsg: '请配置 Chat 模型 Key' });
            return;
        }

        try {
            saveToUndoStack();
            updateNodeSettings(nodeId, { isGenerating: true, errorMsg: '', llmPromptMode: normalizedMode, scriptText });
            const systemPrompt = getStoryboardPromptTemplate(normalizedMode, node.settings);
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: chatModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: scriptText }
                    ],
                    stream: false
                })
            });
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            const parsedShots = parseJsonArrayFromText(content);
            if (!Array.isArray(parsedShots) || parsedShots.length === 0) {
                throw new Error('AI 未返回可用镜头');
            }

            const modeForShot = normalizeStoryboardMode(node.settings?.mode);
            const defaultModel = getFirstEnabledModelKey(modeForShot);
            const defaultRatio = getPreferredModelRatio(defaultModel, modeForShot);
            const defaultResolution = modeForShot === 'image'
                ? getPreferredImageResolutionForModel(defaultModel)
                : getPreferredVideoResolutionForModel(defaultModel);
            const defaultDuration = modeForShot === 'video' ? getDefaultDurationForModel(defaultModel) : undefined;
            const defaultCustomParams = getDefaultCustomParamsForModel(defaultModel, null, { preserveByName: false });

            const newShots = parsedShots.map((item, idx) => ({
                id: `shot-${Date.now()}-${idx}`,
                scene_index: idx + 1,
                prompt: item?.prompt || item?.description || '',
                description: item?.description || item?.prompt || '',
                image_url: '',
                video_url: '',
                output_url: '',
                model: defaultModel,
                ratio: defaultRatio,
                resolution: defaultResolution,
                duration: defaultDuration,
                customParams: { ...defaultCustomParams },
                status: 'draft',
                outputEnabled: false,
                selectedImageIndex: -1
            }));

            const finalShots = shouldAppend ? [...existingShots, ...newShots] : newShots;
            updateNodeSettings(nodeId, {
                shots: finalShots,
                scriptExpanded: false,
                isGenerating: false
            });
        } catch (err) {
            console.error('[LLM Split] Error:', err);
            updateNodeSettings(nodeId, { isGenerating: false, errorMsg: err.message || 'LLM 拆分失败' });
        }
    }

export function buildStoryboardShotsFromTableData({
    getDefaultCustomParamsForModel,
    getDefaultDurationForModel,
    getFirstEnabledModelKey,
    getPreferredImageResolutionForModel,
    getPreferredModelRatio,
    getPreferredVideoResolutionForModel,
}, node, tableData, options = {}) {
        if (!node || node.type !== 'storyboard-node') return [];
        const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
        const headers = Array.isArray(tableData?.headers) ? tableData.headers : [];
        const existingShots = Array.isArray(node.settings?.shots) ? node.settings.shots : [];
        const promptColumnIndex = getStoryboardTablePromptColumnIndex(headers);
        const descriptionColumnIndex = getStoryboardTableDescriptionColumnIndex(headers);
        const shotColumnIndex = getStoryboardTableShotColumnIndex(headers);
        const promptBySceneIndex = options?.promptBySceneIndex instanceof Map ? options.promptBySceneIndex : new Map();

        const modeForShot = normalizeStoryboardMode(node.settings?.mode);
        const defaultModel = getFirstEnabledModelKey(modeForShot);
        const defaultRatio = getPreferredModelRatio(defaultModel, modeForShot);
        const defaultResolution = modeForShot === 'image'
            ? getPreferredImageResolutionForModel(defaultModel)
            : getPreferredVideoResolutionForModel(defaultModel);
        const defaultDuration = modeForShot === 'video' ? getDefaultDurationForModel(defaultModel) : undefined;
        const defaultCustomParams = getDefaultCustomParamsForModel(defaultModel, null, { preserveByName: false });
        const nowSeed = Date.now();

        return rows.map((row, rowIdx) => {
            const baseShot = existingShots[rowIdx] ? { ...existingShots[rowIdx] } : {};
            const sceneIndex = normalizeStoryboardSceneIndex(shotColumnIndex >= 0 ? row[shotColumnIndex] : '', rowIdx + 1);
            const tablePrompt = promptColumnIndex >= 0 ? String(row[promptColumnIndex] || '').trim() : '';
            const tableDescription = descriptionColumnIndex >= 0 ? String(row[descriptionColumnIndex] || '').trim() : '';
            const prompt = String(promptBySceneIndex.get(sceneIndex) || tablePrompt || baseShot.prompt || '').trim();
            const description = String(tableDescription || prompt || baseShot.description || '').trim();
            return {
                ...baseShot,
                id: baseShot.id || `shot-${nowSeed}-${rowIdx}`,
                scene_index: sceneIndex,
                prompt,
                description,
                model: baseShot.model || defaultModel,
                ratio: baseShot.ratio || defaultRatio,
                resolution: baseShot.resolution || defaultResolution,
                duration: modeForShot === 'video' ? (baseShot.duration || defaultDuration) : undefined,
                customParams: baseShot.customParams || { ...defaultCustomParams },
                status: baseShot.status || 'draft',
                outputEnabled: !!baseShot.outputEnabled,
                selectedImageIndex: Number.isInteger(baseShot.selectedImageIndex) ? baseShot.selectedImageIndex : -1
            };
        });
    }

export async function runStoryboardTablePromptMerge({
    cloudDocument,
    canvasCloud,
    buildStoryboardTableSyncPatch,
    chatModel,
    getApiCredentials,
    getStoryboardPromptTemplate,
    nodesMap,
    normalizeStoryboardTableData,
    saveToUndoStack,
    showToast,
    updateNodeSettings,
}, nodeId) {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        const normalizedTable = normalizeStoryboardTableData(
            node.settings?.tableData
            || parseMarkdownTable(node.settings?.tableMarkdown || node.settings?.scriptText || '')
            || { headers: [...STORYBOARD_DEFAULT_TABLE_HEADERS], rows: [] }
        );
        if (!Array.isArray(normalizedTable.rows) || normalizedTable.rows.length === 0) {
            showToast('请先填写至少一行表格数据', 'warning', 2400);
            return;
        }

        if (cloudDocument) return canvasCloud.textExecute(nodeId, 'storyboardPromptMerge', buildStoryboardTableSyncPatch(node, normalizedTable));

        const { key: apiKey, url: baseUrl } = getApiCredentials(chatModel);
        if (!apiKey) {
            updateNodeSettings(nodeId, { errorMsg: '请配置 Chat 模型 Key' });
            return;
        }

        const tableRowsForPrompt = normalizedTable.rows.map((row, rowIdx) => {
            const rowPayload = { scene_index: rowIdx + 1 };
            normalizedTable.headers.forEach((header, colIdx) => {
                rowPayload[String(header || `列${colIdx + 1}`)] = String(row[colIdx] || '');
            });
            return rowPayload;
        });

        try {
            saveToUndoStack();
            updateNodeSettings(nodeId, {
                isGenerating: true,
                errorMsg: '',
                llmPromptMode: STORYBOARD_TABLE_PROMPT_MODE
            });
            const systemPrompt = getStoryboardPromptTemplate(STORYBOARD_TABLE_PROMPT_MODE, node.settings || {});
            const userPrompt = [
                '请按 scene_index 一一对应地汇总提示词。',
                '必须返回 JSON 数组，每项至少包含 scene_index 和 prompt 字段。',
                JSON.stringify(tableRowsForPrompt, null, 2)
            ].join('\n\n');
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: chatModel,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    stream: false
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error?.message || data?.message || `请求失败 (${response.status})`);
            }
            const content = data.choices?.[0]?.message?.content || '';
            const parsedRows = parseJsonArrayFromText(content);
            if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
                throw new Error('AI 未返回有效 JSON 数组');
            }
            const promptBySceneIndex = new Map();
            parsedRows.forEach((item, idx) => {
                const value = item && typeof item === 'object' ? item : {};
                const sceneCandidate = typeof item === 'string'
                    ? idx + 1
                    : (value.scene_index ?? value.sceneIndex ?? value.scene ?? value.shot ?? value.shot_index ?? value['场次镜号'] ?? value['镜号'] ?? idx + 1);
                const sceneIndex = normalizeStoryboardSceneIndex(sceneCandidate, idx + 1);
                const promptText = typeof item === 'string'
                    ? String(item || '').trim()
                    : String(value.prompt ?? value['生图提示词'] ?? value['提示词'] ?? value.description ?? value['描述'] ?? '').trim();
                if (promptText) promptBySceneIndex.set(sceneIndex, promptText);
            });
            if (promptBySceneIndex.size === 0) {
                throw new Error('AI 返回中未找到可用提示词');
            }

            const patch = buildStoryboardTableSyncPatch(node, normalizedTable, { promptBySceneIndex });
            updateNodeSettings(nodeId, {
                ...patch,
                isGenerating: false,
                errorMsg: '',
                llmPromptMode: STORYBOARD_TABLE_PROMPT_MODE,
                viewMode: 'table'
            });
            showToast(`已回填 ${promptBySceneIndex.size} 条提示词到卡片`, 'success', 2600);
        } catch (err) {
            console.error('[StoryboardTablePromptMerge] Error:', err);
            const message = err?.message || '表格提示词汇总失败';
            updateNodeSettings(nodeId, { isGenerating: false, errorMsg: message });
            showToast(message, 'error', 2800);
        }
    }

export function buildStoryboardTablePatchFromShots({
    normalizeStoryboardTableData,
}, node) {
        if (!node || node.type !== 'storyboard-node') return null;
        const settings = node.settings || {};
        if (normalizeStoryboardViewMode(settings.viewMode) === 'table') return null;
        const hasTableSource = !!(settings.tableData?.headers && settings.tableData.headers.length > 0)
            || !!String(settings.tableMarkdown || '').trim();
        if (!hasTableSource) return null;
        const shots = Array.isArray(settings.shots) ? settings.shots : [];
        if (shots.length === 0) return null;

        const sourceTable = normalizeStoryboardTableData(
            settings.tableData
            || parseStoryboardTableInput(settings.tableMarkdown || '')?.table
            || { headers: [...STORYBOARD_DEFAULT_TABLE_HEADERS], rows: [] }
        );
        let headers = [...sourceTable.headers];
        let rows = sourceTable.rows.map((row) => headers.map((_, colIdx) => String(Array.isArray(row) ? (row[colIdx] ?? '') : '')));
        let shotColumnIndex = getStoryboardTableShotColumnIndex(headers);
        if (shotColumnIndex < 0) {
            headers = ['场次镜号', ...headers];
            rows = rows.map((row, rowIdx) => [String(rowIdx + 1), ...row]);
            shotColumnIndex = 0;
        }
        const promptColumnIndex = getStoryboardTablePromptColumnIndex(headers);
        const descriptionColumnIndex = getStoryboardTableDescriptionColumnIndex(headers);
        const rowBySceneIndex = new Map();
        rows.forEach((row, rowIdx) => {
            const sceneIndex = normalizeStoryboardSceneIndex(row[shotColumnIndex], rowIdx + 1);
            if (!rowBySceneIndex.has(sceneIndex)) {
                rowBySceneIndex.set(sceneIndex, row);
            }
        });
        const nextRows = shots.map((shot, rowIdx) => {
            const sceneIndex = normalizeStoryboardSceneIndex(shot?.scene_index, rowIdx + 1);
            const seedRow = rowBySceneIndex.get(sceneIndex) || rows[rowIdx] || headers.map(() => '');
            const nextRow = headers.map((_, colIdx) => String(Array.isArray(seedRow) ? (seedRow[colIdx] ?? '') : ''));
            nextRow[shotColumnIndex] = String(sceneIndex);
            if (promptColumnIndex >= 0) {
                nextRow[promptColumnIndex] = String(shot?.prompt ?? '');
            }
            if (descriptionColumnIndex >= 0) {
                nextRow[descriptionColumnIndex] = String(shot?.description ?? '');
            }
            return nextRow;
        });
        const finalTable = normalizeStoryboardTableData({ headers, rows: nextRows });
        const nextMarkdown = stringifyMarkdownTable(finalTable);
        const currentMarkdown = stringifyMarkdownTable(sourceTable);
        if (currentMarkdown === nextMarkdown) return null;
        return {
            tableData: finalTable,
            tableMarkdown: nextMarkdown
        };
    }

export function updateShot({
    setNodes,
    setShotTimers,
    updatePreviewFromTask,
}, nodeId, shotId, updates, options = {}) {
        let didUpdate = false;
        let statusForTimer = updates.status;

        setNodes(prevNodes => {
            const node = prevNodes.find(n => n.id === nodeId);
            if (!node || node.type !== 'storyboard-node') {
                console.warn(`[updateShot] 节点未找到或类型不匹配:`, { nodeId, found: !!node, type: node?.type });
                return prevNodes;
            }

            // 检查条件更新
            if (options.onlyIfStatus) {
                const currentShot = (node.settings?.shots || []).find(s => isSameShotId(s.id, shotId));
                if (currentShot && currentShot.status !== options.onlyIfStatus) {
                    console.warn(`[updateShot] 跳过更新: ${shotId}, 当前状态 ${currentShot.status} !== 期望状态 ${options.onlyIfStatus}`);
                    return prevNodes;
                }
            }

            const currentShot = (node.settings?.shots || []).find(s => isSameShotId(s.id, shotId));
            if (!currentShot) {
                console.warn(`[updateShot] 镜头未找到:`, { nodeId, shotId });
                return prevNodes;
            }
            const finalUpdates = { ...updates };
            const skipOutputHistory = !!finalUpdates.__skipOutputHistory;
            delete finalUpdates.__skipOutputHistory;
            const hasDurationCost = Object.prototype.hasOwnProperty.call(finalUpdates, 'durationCost');
            const finishingStatuses = new Set(['done', 'completed', 'failed', 'error']);

            if (finalUpdates.status === 'generating' && !hasDurationCost) {
                finalUpdates.durationCost = 0;
            }

            if (finalUpdates.status && finishingStatuses.has(finalUpdates.status) && !hasDurationCost) {
                if (currentShot?.generationStartTime) {
                    const elapsedSeconds = (Date.now() - currentShot.generationStartTime) / 1000;
                    finalUpdates.durationCost = Number(elapsedSeconds.toFixed(1));
                }
            }
            const hasOutputPayload = ['output_images', 'output_url', 'video_url'].some((key) =>
                Object.prototype.hasOwnProperty.call(finalUpdates, key)
            );
            if (hasOutputPayload && !skipOutputHistory) {
                const beforeSnapshot = normalizeStoryboardOutputSnapshot(currentShot);
                const afterSnapshot = normalizeStoryboardOutputSnapshot({ ...currentShot, ...finalUpdates });
                if (afterSnapshot && !isSameStoryboardOutputSnapshot(beforeSnapshot, afterSnapshot)) {
                    const previousHistory = Array.isArray(currentShot.outputHistory)
                        ? currentShot.outputHistory.filter(Boolean)
                        : [];
                    const normalizedPreviousHistory = [...previousHistory];
                    if (normalizedPreviousHistory.length === 0 && beforeSnapshot) {
                        normalizedPreviousHistory.push({
                            ...beforeSnapshot,
                            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-prev`,
                            createdAt: Date.now(),
                            sourceTaskId: String(options.sourceTaskId || 'legacy')
                        });
                    }
                    const nextEntry = {
                        ...afterSnapshot,
                        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        createdAt: Date.now(),
                        sourceTaskId: String(options.sourceTaskId || '')
                    };
                    const tail = normalizedPreviousHistory.length > 0 ? normalizedPreviousHistory[normalizedPreviousHistory.length - 1] : null;
                    const mergedHistory = (!tail || !isSameStoryboardOutputSnapshot(tail, nextEntry))
                        ? [...normalizedPreviousHistory, nextEntry]
                        : normalizedPreviousHistory;
                    if (mergedHistory.length > MAX_STORYBOARD_OUTPUT_HISTORY) {
                        mergedHistory.splice(0, mergedHistory.length - MAX_STORYBOARD_OUTPUT_HISTORY);
                    }
                    finalUpdates.outputHistory = mergedHistory;
                    finalUpdates.outputHistoryCursor = mergedHistory.length - 1;
                }
            }

            didUpdate = true;
            statusForTimer = finalUpdates.status;

            const updatedShots = (node.settings?.shots || []).map(shot =>
                isSameShotId(shot.id, shotId) ? { ...shot, ...finalUpdates } : shot
            );

            // [日志清理] 已移除 updateShot 信息


            // 返回更新后的节点数组
            return prevNodes.map(n =>
                n.id === nodeId
                    ? { ...n, settings: { ...n.settings, shots: updatedShots } }
                    : n
            );
        });

        if (didUpdate && statusForTimer) {
            const key = `${nodeId}-${shotId}`;
            if (statusForTimer === 'generating') {
                setShotTimers(prev => ({ ...prev, [key]: '0.0s' }));
            } else {
                setShotTimers(prev => {
                    if (!prev[key]) return prev;
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
            }
        }

        // V3.7.5: 如果更新了图片或视频，且有连接的预览窗口，自动更新预览
        // 注意：这里的 updates 是传入的参数，不受闭包影响
        if (updates.video_url || updates.output_url || updates.output_images || updates.image_url || updates.lastFrame) {
            const finalUrl = updates.video_url || updates.output_url || (updates.output_images && updates.output_images[0]) || updates.image_url || updates.lastFrame;
            const type = updates.video_url ? 'video' : 'image';
            const filename = updates.image_filename || '';

            setTimeout(() => {
                updatePreviewFromTask(`temp-${Date.now()}`, finalUrl, type, nodeId, null, filename);
            }, 50);
        }
    }

export function importShotsFromAnalysis({
    getConnectedVideoAnalyzeNode,
    nodesMap,
    updateNodeSettings,
}, nodeId) {
        const storyboardNode = nodesMap.get(nodeId);
        if (!storyboardNode || storyboardNode.type !== 'storyboard-node') return;

        const analyzeNode = getConnectedVideoAnalyzeNode(nodeId);
        if (!analyzeNode) {
            canvasAlert(t('请先连接一个视频拆解节点'));
            return;
        }

        // 获取分析结果（优先使用 settings.analysisResults，其次使用 analysisResults）
        const analysisResults = analyzeNode.settings?.analysisResults || analyzeNode.analysisResults || [];
        if (analysisResults.length === 0) {
            canvasAlert(t('视频拆解节点没有分析结果，请先执行分析'));
            return;
        }

        // 转换为 shots 格式
        const newShots = analysisResults.map((result, idx) => {
            const keyframe = result.keyframes?.find(k => k.type === 'current') || result.keyframes?.[0];
            const mjPrompt = keyframe?.mj_prompt || '';
            const jimengPrompt = keyframe?.jimeng_prompt || '';
            const description = keyframe?.description || result.keyframes?.[0]?.description || '';

            // 提取标签
            const tags = [];
            if (result.global_tags?.style?.[0]) tags.push(result.global_tags.style[0]);
            if (keyframe?.description) {
                // 简单提取运镜信息
                const cameraKeywords = ['推', '拉', '摇', '移', '跟', '升', '降', 'Dolly', 'Pan', 'Tilt', 'Zoom'];
                cameraKeywords.forEach(keyword => {
                    if (description.includes(keyword)) {
                        tags.push(keyword);
                    }
                });
            }

            return {
                id: `shot - ${Date.now()} -${idx} `,
                scene_index: idx + 1,
                time_range: result.time_range || '',
                image_url: '',
                description: description,
                prompt: mjPrompt || jimengPrompt,
                camera: tags.find(t => ['推', '拉', '摇', '移', '跟', 'Dolly', 'Pan', 'Tilt', 'Zoom'].some(k => t.includes(k))) || '',
                tags: tags,
                status: 'draft'
            };
        });

        updateNodeSettings(nodeId, { shots: newShots });
    }

export function createStoryboardFromAnalysisResult({
    nodesMap,
    setConnections,
    setNodes,
}, analyzeNodeId, analysisResults) {
        const analyzeNode = nodesMap.get(analyzeNodeId);
        if (!analyzeNode || !analysisResults || analysisResults.length === 0) {
            console.warn('[自动生成分镜表] 分析节点不存在或分析结果为空');
            return;
        }

        // 1. 数据转换 (复用现有逻辑)
        const newShots = analysisResults.map((result, idx) => {
            const keyframe = result.keyframes?.find(k => k.type === 'current') || result.keyframes?.[0];
            const mjPrompt = keyframe?.mj_prompt || '';
            const jimengPrompt = keyframe?.jimeng_prompt || '';
            const description = keyframe?.description || result.keyframes?.[0]?.description || '';

            // 提取标签
            const tags = [];
            if (result.global_tags?.style?.[0]) tags.push(result.global_tags.style[0]);
            if (result.global_tags?.camera?.[0]) tags.push(result.global_tags.camera[0]);
            if (keyframe?.description) {
                // 简单提取运镜信息
                const cameraKeywords = ['推', '拉', '摇', '移', '跟', '升', '降', 'Dolly', 'Pan', 'Tilt', 'Zoom'];
                cameraKeywords.forEach(keyword => {
                    if (description.includes(keyword)) {
                        tags.push(keyword);
                    }
                });
            }

            // 提取运镜信息
            const camera = result.global_tags?.camera?.[0] ||
                tags.find(t => ['推', '拉', '摇', '移', '跟', 'Dolly', 'Pan', 'Tilt', 'Zoom'].some(k => t.includes(k))) ||
                '';

            return {
                id: `shot - ${Date.now()} -${idx} `,
                scene_index: idx + 1,
                time_range: result.time_range || '',
                image_url: '',
                description: description,
                prompt: mjPrompt || jimengPrompt,
                camera: camera,
                tags: tags,
                status: 'draft'
            };
        });

        // 2. 计算新节点位置（放在源节点右侧）
        const newX = analyzeNode.x + analyzeNode.width + 100;
        const newY = analyzeNode.y;
        const storyboardId = `node - storyboard - ${Date.now()} `;

        // 3. 创建节点
        const newNode = {
            id: storyboardId,
            type: 'storyboard-node',
            x: newX,
            y: newY,
            width: 600,
            height: 500,
            settings: {
                projectTitle: t('AI 拆解结果'),
                shots: newShots
            }
        };

        // 4. 更新状态
        setNodes(prev => [...prev, newNode]);
        setConnections(prev => [...prev, {
            id: `conn - ${Date.now()} `,
            from: analyzeNodeId,
            to: storyboardId
        }]);

    }
