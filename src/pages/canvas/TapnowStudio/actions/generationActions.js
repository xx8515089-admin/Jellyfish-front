import { canvasAlert } from '../canvasDialogs';
import {
    t,
    LocalImageManager,
    normalizeDataUrl,
    DEFAULT_BASE_URL,
    ASYNC_CONFIG_TEMPLATE,
    parseStoryboardSourceNodeId,
    IMAGE_BATCH_MODE_PARALLEL_AGGREGATE,
    IMAGE_BATCH_MODE_STANDARD_BATCH,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE,
    normalizeImageResolution,
    normalizeImageRouteMode,
    normalizeImageBatchMode,
    normalizeNativeMultiImageMode,
    getAntigravityQualityByResolution,
    getAntigravityImageSizeByResolution,
    getAntigravitySizeParam,
    isExplicitImageResolution,
    normalizeVideoResolution,
    normalizeJimengVideoRatio,
    supportsJimengVideoResolution,
    normalizeJimengVideoResolution,
    normalizeDurationValue,
    normalizeJimengVideoDuration,
    DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS,
    getImageSourceFallbackByParam,
    getCustomParamSelection,
    applyCustomParamsToPayload,
    applyImageBatchCountToPayload,
    normalizeImageDispatchIntervalSeconds,
    waitForMilliseconds,
    resolveImageConcurrencyFromCustomParams,
    attachHistoryThrottleStats,
    applyPreviewOverridePatch,
    normalizeRequestTemplate,
    validateModelLibraryContract,
    normalizeAsyncConfig,
    normalizeRequestOverridePatch,
    getValueByPathAny,
    collectDeepImageValues,
    collectImmediateImageUrls,
    buildRequestFromTemplate,
    applyRequestOverridePatch,
    coerceFormDataFromObject,
    calculateResolution,
    getModelParams,
    getImageDimensions
} from '../freeCanvasShared';

export async function startGeneration({
    addToBlacklist,
    addToSuspendList,
    apiBlacklistRef,
    blobToDataURL,
    buildProxyUrl,
    canvasCloud,
    checkCircuitBreaker,
    cloudDocument,
    coerceImageBlobForJimeng,
    connections,
    consumeImageBatchFailure,
    consumeImageBatchSuccess,
    detectBase64ImageMime,
    extractChatImageUrls,
    getApiConfigByKey,
    getApiCredentials,
    getAssetFallbackUrl,
    getBase64FromUrl,
    getBlobFromUrl,
    getConnectedImageForInput,
    getDataUrlFromUrl,
    getNativeMultiImageCapabilityStatus,
    getProxyPreferenceForUrl,
    getUrlExt,
    globalApiKey,
    history,
    historyMap,
    imageBatchTaskMapRef,
    isComfyLocalUrl,
    isKeySuspended,
    isLocalCacheUrl,
    nodes,
    nodesMap,
    normalizeImageUrls,
    pollAsyncTask,
    pollImageTask,
    pollMidjourneyJob,
    pollModelScopeTask,
    pollSoraJob,
    pollVeoJob,
    processMaskForInpainting,
    providers,
    record1006Error,
    resizeImageForVeo,
    resolveLocalCacheSourceUrl,
    resolveSpecialUrl,
    sanitizeHistoryUrlValue,
    setHistory,
    setHistoryOpen,
    setSettingsOpen,
    showToast,
    startGeneration,
    storyboardHistoryMapRef,
    storyboardTaskMapRef,
    updateNativeMultiImageCapability,
    updatePreviewFromTask,
    updateShot,
    uploadMidjourneyImages,
}, prompt, type, sourceImages, nodeId, options = {}) {
        if (cloudDocument) return canvasCloud.generate(nodeId, { ...options, operation: type === 'video' ? 'videoGenerate' : 'imageGenerate' });
        // V3.5.20: 优先解析 IndexedDB 图片键 (img_xxx)
        // 解决 "Failed to fetch" 错误，确保所有 img_ 键都转换为 Blob URL
        let resolvedSourceImages = [];
        const rawSourceImages = Array.isArray(sourceImages) ? sourceImages : (sourceImages ? [sourceImages] : []);

        if (rawSourceImages.length > 0) {
            try {
                resolvedSourceImages = await Promise.all(rawSourceImages.map(async (img) => {
                    const resolved = await resolveSpecialUrl(img);
                    if (resolved && resolved !== img) return resolved;
                    if (LocalImageManager.isImageId(img)) {
                        const fallback = getAssetFallbackUrl(img);
                        if (fallback) return fallback;
                        console.warn(`[startGeneration] Failed to resolve IDB image: ${img}`);
                    }
                    return img;
                }));
            } catch (e) {
                console.error('[startGeneration] Error resolving images:', e);
                resolvedSourceImages = rawSourceImages;
            }
        }

        const connectedImages = resolvedSourceImages;
        const sourceImage = connectedImages.length > 0 ? connectedImages[0] : undefined;


        if (!prompt && !sourceImage) { canvasAlert(t('请输入提示词或连接参考图片')); return; }

        // 检查是否是分镜表的虚拟节点ID（格式：storyboard-${nodeId}-shot-${shotId}）
        let node = null;
        if (nodeId && nodeId.startsWith('storyboard-') && nodeId.includes('-shot-')) {
            // 这是分镜表的任务，不需要查找实际节点
            node = null;
        } else {
            node = nodes.find((n) => n.id === nodeId);
        }

        // 处理蒙版：先检查当前节点，如果没有则从上游节点查找
        let finalMaskBlob = null;
        let finalMaskContent = node?.maskContent;
        if (!finalMaskContent) {
            // 查找连接到当前节点的源节点（优先查找 default 输入，如果没有则查找所有输入）
            let incomingConn = connections.find(c => c.to === nodeId && (!c.inputType || c.inputType === 'default'));
            if (!incomingConn) {
                // 如果没有 default 连接，查找任何连接到该节点的连接
                incomingConn = connections.find(c => c.to === nodeId);
            }
            if (incomingConn) {
                // 使用 nodesMap 进行 O(1) 查找
                const sourceNode = nodesMap.get(incomingConn.from);
                if (sourceNode && sourceNode.maskContent) {
                    finalMaskContent = sourceNode.maskContent;
                }
            }
        } else {
        }

        // 如果存在蒙版，处理蒙版（反转逻辑）
        if (finalMaskContent) {
            finalMaskBlob = await processMaskForInpainting(finalMaskContent);
            if (finalMaskBlob) {
            } else {
                console.warn('[Inpainting] 蒙版处理失败，将使用原始蒙版');
            }
        }

        // 规范化 prompt：确保角色引用 @{username} 前后有空格（仅对 Sora 2 模型）
        const normalizePromptForSora = (text, modelId) => {
            if (!text || !modelId || (!modelId.includes('sora') && modelId !== 'sora-2' && modelId !== 'sora-2-pro')) {
                return text;
            }
            // 先处理不带大括号的格式 @username，转换为 @{username}
            text = text.replace(/@([a-zA-Z0-9_\.]+)(?![a-zA-Z0-9_\.])/g, (match, username) => {
                return `@{${username}}`;
            });
            // 然后处理带大括号的格式 @{username}，确保前后有空格
            return text.replace(/@\{([^\}]+)\}/g, (match, username) => {
                return ` @{${username}} `;
            }).replace(/\s{2,}/g, ' ').trim(); // 清理多余空格
        };
        // 优先使用 options 中的 model，其次使用节点设置，最后使用默认值
        const modelId = options.model || node?.settings?.model || (type === 'image' ? 'nano-banana' : 'sora-2');
        const customParamSelections = options.customParams || node?.settings?.customParams || null;
        const resolvedConfig = getApiConfigByKey(modelId);
        const generationContractIssues = validateModelLibraryContract(resolvedConfig || {});
        const generationBlockingIssue = generationContractIssues.find((issue) => issue.level === 'error');
        if (generationBlockingIssue) {
            throw new Error(`[配置校验阻断] ${generationBlockingIssue.message}`);
        }
        const resolvedCustomParams = Array.isArray(resolvedConfig?.customParams) ? resolvedConfig.customParams : [];
        const fallbackImageConcurrency = options.imageConcurrency
            || options.concurrentImages
            || node?.settings?.imageConcurrency
            || node?.settings?.concurrentImages
            || resolvedConfig?.defaultImageConcurrency
            || 1;
        const requestedImageConcurrency = type === 'image'
            ? resolveImageConcurrencyFromCustomParams(
                resolvedCustomParams,
                customParamSelections,
                fallbackImageConcurrency
            )
            : 1;
        const requestedImageBatchMode = type === 'image'
            ? normalizeImageBatchMode(
                options.imageBatchMode
                || options.batchMode
                || resolvedConfig?.imageBatchMode
                || node?.settings?.imageBatchMode
            )
            : IMAGE_BATCH_MODE_PARALLEL_AGGREGATE;
        const nativeMultiImageMode = type === 'image'
            ? normalizeNativeMultiImageMode(
                options.nativeMultiImageMode
                || resolvedConfig?.nativeMultiImageMode
                || node?.settings?.nativeMultiImageMode
            )
            : IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO;
        const detectedNativeMultiImageCapability = type === 'image'
            ? getNativeMultiImageCapabilityStatus(modelId, resolvedConfig)
            : '';
        const shouldAutoProbeNativeMultiImage = type === 'image'
            && requestedImageConcurrency > 1
            && requestedImageBatchMode === IMAGE_BATCH_MODE_PARALLEL_AGGREGATE
            && nativeMultiImageMode === IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO
            && detectedNativeMultiImageCapability !== 'supported'
            && !options._standardBatchFallback;
        const activeImageBatchMode = shouldAutoProbeNativeMultiImage
            ? IMAGE_BATCH_MODE_STANDARD_BATCH
            : requestedImageBatchMode;
        const supportsNativeMultiImage = type === 'image' && (
            nativeMultiImageMode === IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE
            || (
                nativeMultiImageMode === IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO
                && detectedNativeMultiImageCapability === 'supported'
            )
        );
        const shouldPreferNativeSingleRequest = type === 'image'
            && requestedImageConcurrency > 1
            && activeImageBatchMode === IMAGE_BATCH_MODE_PARALLEL_AGGREGATE
            && supportsNativeMultiImage;
        const effectiveImageConcurrency = shouldPreferNativeSingleRequest ? 1 : requestedImageConcurrency;
        const shouldUseStandardBatchMode = type === 'image'
            && effectiveImageConcurrency > 1
            && activeImageBatchMode === IMAGE_BATCH_MODE_STANDARD_BATCH;
        const isNativeBatchProbeRun = type === 'image'
            && shouldUseStandardBatchMode
            && requestedImageBatchMode === IMAGE_BATCH_MODE_PARALLEL_AGGREGATE
            && nativeMultiImageMode === IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO
            && detectedNativeMultiImageCapability !== 'supported';
        const requestedImageCountForSubmit = shouldUseStandardBatchMode
            ? effectiveImageConcurrency
            : 1;
        const requestedDispatchIntervalSec = type === 'image'
            ? normalizeImageDispatchIntervalSeconds(
                options.imageDispatchIntervalSec ?? resolvedConfig?.imageDispatchIntervalSec ?? DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS,
                DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS
            )
            : DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS;
        const requestedDispatchIntervalMs = Math.round(requestedDispatchIntervalSec * 1000);
        if (shouldPreferNativeSingleRequest && !options._isRetry && !options._batchImageDispatched) {
            const nativeHint = nativeMultiImageMode === IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE
                ? `${modelId} 已按模型设置启用原生多图，已关闭并发聚合。`
                : `检测到 ${modelId} 支持原生多图，已自动关闭并发聚合。`;
            showToast(nativeHint, 'warning', 3200);
        }
        if (isNativeBatchProbeRun && !options._isRetry && !options._batchImageDispatched) {
            showToast(`正在探测 ${modelId} 的原生多图能力，优先尝试单任务返图。`, 'info', 2600);
        }
        // V3.4.19: 使用统一的 getApiCredentials 获取凭据（只从Provider获取）
        const credentials = getApiCredentials(modelId);
        let apiKeyRaw = credentials.key;

        // 支持逗号分隔的多个API Key (Load Balancing)
        let apiKey = apiKeyRaw;
        if (apiKeyRaw && apiKeyRaw.includes(',')) {
            const allKeys = apiKeyRaw.split(',').map(k => k.trim()).filter(k => k);
            // 使用 ref 获取最新黑名单，过滤已黑名单的 key
            const currentBlacklist = apiBlacklistRef.current || {};

            // V3.5.1 调试：输出详细日志

            const availableKeys = allKeys.filter(k => !currentBlacklist[k]);

            if (availableKeys.length > 0) {
                // 从可用 key 中随机选择
                apiKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
            } else if (allKeys.length > 0) {
                // 所有 key 都在黑名单，降级到随机选择（避免完全失败）
                apiKey = allKeys[Math.floor(Math.random() * allKeys.length)];
                console.warn(`⚠️ [Load Balancing] All ${allKeys.length} keys are blacklisted, using random selection`);
            }
        }

        // [调试] 记录选中的 API 密钥，输出时进行脱敏
        if (apiKey) {
            console.log(`[API Select] Using Key ending in ...${apiKey.slice(-4)}`);
        }
        let baseUrlRaw = credentials.url;

        // 支持逗号分隔的多个API地址 (Load Balancing)
        let baseUrl = baseUrlRaw;
        if (baseUrlRaw.includes(',')) {
            const urls = baseUrlRaw.split(',').map(u => u.trim()).filter(u => u);
            if (urls.length > 0) {
                // 随机选择一个
                baseUrl = urls[Math.floor(Math.random() * urls.length)];
            }
        }

        if (!apiKey) { canvasAlert(t('请先在设置中配置 API Key')); setSettingsOpen(true); return; }

        // 规范化 prompt（确保角色引用 @{username} 前后有空格，仅对 Sora 2 模型）
        if (prompt && (modelId.includes('sora') || modelId === 'sora-2' || modelId === 'sora-2-pro')) {
            // 先处理不带大括号的格式 @username，转换为 @{username}
            prompt = prompt.replace(/@([a-zA-Z0-9_\.]+)(?![a-zA-Z0-9_\.])/g, (match, username) => {
                return `@{${username}}`;
            });
            // 然后处理带大括号的格式 @{username}，确保前后有空格
            prompt = prompt.replace(/@\{([^\}]+)\}/g, (match, username) => {
                return ` @{${username}} `;
            }).replace(/\s{2,}/g, ' ').trim(); // 清理多余空格
        }

        // 优先使用 options 中的 ratio，其次使用节点设置，最后使用默认值
        let ratio = options.ratio || node?.settings?.ratio || (modelId.includes('grok') ? '3:2' : '1:1');
        // V3.5.0: 覆盖分辨率设置 (Jimeng/Grok)
        let resolution = options.resolution || node?.settings?.resolution || (type === 'video' ? '720P' : '2K');
        let resolutionForCalc = resolution;
        if (type === 'image') {
            resolution = normalizeImageResolution(resolution);
            resolutionForCalc = resolution;
        }
        if (type === 'video') {
            resolution = normalizeVideoResolution(resolution);
            resolutionForCalc = resolution === 'Auto' ? '720P' : resolution;
        }
        let { sizeStr, w, h } = getModelParams(modelId, ratio, resolutionForCalc);

        // 自动分辨率逻辑：直接使用源尺寸，不缩放，仅做对齐
        // 修复：仅当比例同样为自动时才使用源尺寸；用户指定比例（如 1:1）时应尊重该设置
        if (resolution === 'Auto' && ratio === 'Auto' && sourceImage) {
            try {
                const dims = await getImageDimensions(sourceImage);
                // 强制使用原始尺寸并按 64 对齐，不进行缩小
                const safeW = Math.round(dims.w / 64) * 64;
                const safeH = Math.round(dims.h / 64) * 64;

                w = safeW;
                h = safeH;
                sizeStr = `${safeW}x${safeH}`;
            } catch (e) { console.error("Auto Res Error", e); }
        } else {
            if (!w || !h) {
                const def = calculateResolution(ratio, resolution);
                w = def.w;
                h = def.h;
                sizeStr = def.str;
            }
        }

        // 当有参考图且选择了 Auto + (1K/2K/4K) 时：
        // 希望保持原图纵横比，只在原图分辨率基础上等比放大到目标级别（而不是变成固定 1:1 或 16:9）
        if (sourceImage && ratio === 'Auto' && ['1K', '2K', '4K'].includes(resolution)) {
            try {
                const dims = await getImageDimensions(sourceImage);
                const longSideTarget = resolution === '4K'
                    ? 4096
                    : resolution === '2K'
                        ? 2048
                        : 1024;

                const maxSide = Math.max(dims.w, dims.h) || 1;
                const scale = longSideTarget / maxSide;
                let newW = Math.round((dims.w * scale) / 16) * 16;
                let newH = Math.round((dims.h * scale) / 16) * 16;

                // 双保险，避免数值异常
                newW = Math.max(16, newW);
                newH = Math.max(16, newH);

                w = newW;
                h = newH;
                sizeStr = `${newW}x${newH}`;
            } catch (e) {
                console.error('Auto+K Upscale Error', e);
            }
        }

        // 优先使用 options 中的 duration，其次使用节点设置，最后使用默认值
        let duration = options.duration ? String(options.duration).replace('s', '') : (node?.settings?.duration?.replace('s', '') || '5');
        if (modelId.includes('veo')) duration = '8';
        if (type === 'video') {
            const durationConfig = getApiConfigByKey(modelId);
            const rawDurationOptions = Array.isArray(durationConfig?.durations) ? durationConfig.durations : null;
            const normalizedDurationOptions = rawDurationOptions
                ? rawDurationOptions.map((d) => String(d || '').replace(/[^\d]/g, '')).filter(Boolean)
                : null;
            const isJimengVideoModel = durationConfig?.provider === 'jimeng' || modelId.includes('jimeng') || (durationConfig?.modelName ?? '').includes('jimeng');
            const isJimengSora2Model = isJimengVideoModel && (modelId.includes('sora2') || (durationConfig?.modelName ?? '').includes('sora2'));
            if (isJimengVideoModel) {
                const allowed = (normalizedDurationOptions && normalizedDurationOptions.length > 0)
                    ? normalizedDurationOptions
                    : (isJimengSora2Model ? ['4', '8', '12'] : ['5', '10']);
                if (!allowed.includes(String(duration))) {
                    duration = allowed[0] || duration;
                }
            }
        }

        // V3.7.27: 确保 taskId 唯一性（避免同一毫秒内多个任务冲突）
        const taskId = options._existingTaskId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // 获取正确的模型显示名称（用于历史记录）
        const getModelDisplayName = () => {
            const config = getApiConfigByKey(modelId);
            // 如果是 jimeng 模型，直接返回 modelId (如 jimeng-4.5, jimeng-video-3.0)
            if (modelId.includes('jimeng')) return modelId;
            // 其他模型优先使用 displayName，再回退到 modelName/id
            return config?.displayName || config?.modelName || config?.id || modelId;
        };

        const now = Date.now();
        const actualSourceNodeId = node?.id || nodeId || null;
        const useProxy = !!credentials.useProxy;
        const shouldInsertHistoryItem = !options._isRetry && !options._skipHistoryInsert;

        // V3.5.31：重试时跳过历史记录创建，防止产生重复任务
        if (shouldInsertHistoryItem) {
            setHistory((prev) => [{
                id: taskId, type, url: '',
                prompt: prompt || (sourceImage ? `Img2${type === 'image' ? 'Img' : 'Vid'}` : 'Untitled'),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'generating', progress: 5, modelName: getModelDisplayName(), width: w, height: h,
                remoteTaskId: null,
                apiConfig: { modelId, baseUrl, apiKey, provider: credentials.provider, useProxy },
                provider: credentials.provider,
                useProxy,
                sourceNodeId: actualSourceNodeId,
                startTime: now,
                durationMs: null,
                ratio: ratio, // 保存比例信息，用于后续验证返回结果
                resolution: resolution, // V3.7.26: 保存分辨率
                duration: type === 'video' ? duration : null,
                hasInputImages: connectedImages.length > 0, // V3.7.26: 是否有参考图（用于判断文→图还是图→图）
                customParams: customParamSelections || null,
                imageBatchMode: type === 'image' ? activeImageBatchMode : null,
                requestedImageCount: type === 'image' ? effectiveImageConcurrency : 1,
                throttleStats: type === 'image'
                    ? {
                        dispatchIntervalSec: requestedDispatchIntervalSec,
                        requestedImageCount: effectiveImageConcurrency,
                        imageBatchMode: activeImageBatchMode,
                        retryCount: 0,
                        http429Count: 0,
                        timeoutCount: 0,
                        fallbackToParallel: false,
                        lastErrorType: '',
                        lastErrorAt: null
                    }
                    : null
            }, ...prev]);
        }

        // 检查是否是分镜表的任务
        // V3.6.1: 支持两种格式：
        // - 视频模式: storyboard-${nodeId}-shot-${shotId}
        // - 图片模式: storyboard-img-${nodeId}-shot-${shotId}
        if (actualSourceNodeId && actualSourceNodeId.startsWith('storyboard-') && actualSourceNodeId.includes('-shot-')) {
            const parts = actualSourceNodeId.split('-shot-');
            if (parts.length === 2) {
                const shotId = parts[1];
                // V3.6.1: 区分图片和视频模式
                const isImageMode = parts[0].startsWith('storyboard-img-');
                const storyboardNodeId = isImageMode
                    ? parts[0].replace('storyboard-img-', '')
                    : parts[0].replace('storyboard-', '');
                // 记录任务映射，包含模式信息
                const taskInfo = {
                    nodeId: storyboardNodeId,
                    shotId: shotId,
                    isImageMode: isImageMode  // V3.6.1: 记录任务类型
                };
                storyboardTaskMapRef.current.set(taskId, taskInfo);
                storyboardHistoryMapRef.current.set(taskId, taskInfo);
            }
        }

        // V3.5.31：重试时不重复打开历史面板
        if (shouldInsertHistoryItem) {
            // 优化：延迟打开历史面板，避免与 setHistory 同时触发造成卡顿
            requestAnimationFrame(() => {
                setTimeout(() => {
                    setHistoryOpen(true);
                }, 0);
            });
        }

        if (
            type === 'image'
            && effectiveImageConcurrency > 1
            && activeImageBatchMode === IMAGE_BATCH_MODE_PARALLEL_AGGREGATE
            && !options._batchImageDispatched
            && !options._isRetry
        ) {
            imageBatchTaskMapRef.current.set(taskId, {
                total: effectiveImageConcurrency,
                completed: 0,
                failed: 0,
                intervalMs: requestedDispatchIntervalMs
            });
            const childOptions = {
                ...options,
                _batchImageDispatched: true,
                _batchAggregate: true,
                _isRetry: true,
                _existingTaskId: taskId,
                imageConcurrency: 1,
                concurrentImages: 1
            };
            for (let idx = 0; idx < effectiveImageConcurrency; idx += 1) {
                if (idx > 0 && requestedDispatchIntervalMs > 0) {
                    await waitForMilliseconds(requestedDispatchIntervalMs);
                }
                startGeneration(prompt, type, resolvedSourceImages, nodeId, {
                    ...childOptions,
                    _batchDispatchIndex: idx
                }).catch((err) => {
                    console.error('[Image Batch] dispatch child failed', { taskId, idx, err });
                });
            }
            const intervalLabel = (requestedDispatchIntervalMs / 1000).toFixed(requestedDispatchIntervalMs % 1000 === 0 ? 0 : 1);
            showToast(`已发起 ${effectiveImageConcurrency} 张并发生成（同窗口聚合，间隔 ${intervalLabel}s）`, 'success', 2600);
            return;
        }

        try {
            if (type === 'image') {
                let endpoint = `${baseUrl}/v1/images/generations`;
                let payload;
                let useMultipart = false;
                // V3.4.20: 获取模型配置用于后续判断
                const config = getApiConfigByKey(modelId);
                const customParams = Array.isArray(config?.customParams) ? config.customParams : [];
                const providerKey = config?.provider;
                const apiType = credentials.apiType || providers[providerKey]?.apiType || 'openai';
                const useProxy = !!credentials.useProxy;
                const forceAsync = !!credentials.forceAsync;
                const omitRatioOnSubmit = !!config?.omitRatioOnSubmit;
                const omitResolutionOnSubmit = !!config?.omitResolutionOnSubmit;
                const requestTemplate = normalizeRequestTemplate(config?.requestTemplate);
                const requestOverrideEnabled = !!config?.requestOverrideEnabled;
                const requestOverridePatch = normalizeRequestOverridePatch(config?.requestOverridePatch);
                const requestTemplateEnabled = !!requestTemplate?.enabled;
                const isModelScope = apiType === 'modelscope';
                const isGeminiNative = apiType === 'gemini';
                const isChatImage = config?.type === 'ChatImage';
                const useAsync = isModelScope ? forceAsync : false;
                const resolveSourceProxy = (url) => getProxyPreferenceForUrl(url, useProxy);
                const asyncConfig = normalizeAsyncConfig(config?.asyncConfig)
                    || ((baseUrl && String(baseUrl).includes('127.0.0.1:9527')) ? normalizeAsyncConfig(ASYNC_CONFIG_TEMPLATE) : null);
                const isLocalMiddlewareTarget = (() => {
                    try {
                        const parsed = new URL(String(baseUrl || ''));
                        const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
                        return isLocalHost && parsed.port === '9527';
                    } catch (e) {
                        const raw = String(baseUrl || '');
                        return raw.includes('127.0.0.1:9527') || raw.includes('localhost:9527');
                    }
                })();
                const normalizeRequestInputUrl = (rawUrl) => {
                    if (!rawUrl || typeof rawUrl !== 'string') return '';
                    let next = sanitizeHistoryUrlValue(rawUrl, '', { allowLocalCache: true }) || '';
                    if (!next) return '';
                    try {
                        const parsed = new URL(String(next));
                        const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
                        if (isLocalHost && parsed.pathname === '/proxy') {
                            const unwrapped = parsed.searchParams.get('url');
                            if (unwrapped) next = unwrapped;
                        }
                    } catch (e) { }
                    if (isLocalCacheUrl(next)) {
                        const source = resolveLocalCacheSourceUrl(next);
                        if (source) next = source;
                        else if (!isLocalMiddlewareTarget) return '';
                    }
                    if (!isLocalMiddlewareTarget && isComfyLocalUrl(next)) {
                        return '';
                    }
                    return next;
                };
                const normalizeRequestInputUrlAsync = async (rawUrl) => {
                    const normalized = normalizeRequestInputUrl(rawUrl);
                    if (!normalized) return '';
                    if (LocalImageManager.isImageId(normalized) || normalized.startsWith('asset://')) {
                        try {
                            const resolved = await resolveSpecialUrl(normalized);
                            if (resolved && typeof resolved === 'string') {
                                return resolved.startsWith('data:')
                                    ? normalizeDataUrl(resolved)
                                    : resolved;
                            }
                        } catch (e) { }
                        return '';
                    }
                    return normalized;
                };
                const rewriteTemplateInputMapUrls = (mapValue) => {
                    if (!mapValue || typeof mapValue !== 'object' || Array.isArray(mapValue)) return mapValue;
                    let changed = false;
                    const nextMap = { ...mapValue };
                    Object.entries(mapValue).forEach(([key, val]) => {
                        if (typeof val !== 'string') return;
                        const trimmed = val.trim();
                        if (!trimmed) return;
                        const looksLikeUrl = /^(https?:|data:|blob:)/i.test(trimmed)
                            || isLocalCacheUrl(trimmed)
                            || isComfyLocalUrl(trimmed)
                            || trimmed.includes('/proxy?url=')
                            || trimmed.startsWith('asset://')
                            || LocalImageManager.isImageId(trimmed);
                        if (!looksLikeUrl) return;
                        if (LocalImageManager.isImageId(trimmed)) {
                            nextMap[key] = '';
                            changed = true;
                            return;
                        }
                        const normalized = normalizeRequestInputUrl(trimmed);
                        if (!normalized) {
                            nextMap[key] = '';
                            changed = true;
                            return;
                        }
                        if (normalized === val) return;
                        nextMap[key] = normalized;
                        changed = true;
                    });
                    return changed ? nextMap : mapValue;
                };
                const sanitizeTemplateInputMap = (mapValue) => {
                    if (!mapValue || typeof mapValue !== 'object' || Array.isArray(mapValue)) return mapValue;
                    const rewritten = rewriteTemplateInputMapUrls(mapValue);
                    const nextMap = {};
                    Object.entries(rewritten).forEach(([key, val]) => {
                        if (val === '' || val === null || val === undefined) return;
                        nextMap[key] = val;
                    });
                    return nextMap;
                };
                const sanitizeTemplateBodyInputs = (value) => {
                    if (!value || typeof value !== 'object') return value;
                    if (Array.isArray(value)) {
                        let changed = false;
                        const next = value.map((entry) => {
                            const sanitized = sanitizeTemplateBodyInputs(entry);
                            if (sanitized !== entry) changed = true;
                            return sanitized;
                        }).filter((entry) => {
                            if (entry === '' || entry === null || entry === undefined) {
                                changed = true;
                                return false;
                            }
                            return true;
                        });
                        return changed ? next : value;
                    }
                    let changed = false;
                    const nextObj = {};
                    Object.entries(value).forEach(([key, val]) => {
                        let nextVal = val;
                        if (key === 'input_values' || key === 'inputs') {
                            nextVal = sanitizeTemplateInputMap(val);
                        } else {
                            nextVal = sanitizeTemplateBodyInputs(val);
                        }
                        if (nextVal === '' || nextVal === null || nextVal === undefined) {
                            changed = true;
                            return;
                        }
                        if (nextVal !== val) changed = true;
                        nextObj[key] = nextVal;
                    });
                    return changed ? nextObj : value;
                };
                const sanitizeTemplateRequestBody = (bodyValue) => {
                    if (!bodyValue) return bodyValue;
                    if (bodyValue instanceof FormData) return bodyValue;
                    if (typeof bodyValue === 'string') {
                        const trimmed = bodyValue.trim();
                        if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return bodyValue;
                        try {
                            const parsed = JSON.parse(trimmed);
                            const sanitized = sanitizeTemplateBodyInputs(parsed);
                            if (sanitized === parsed) return bodyValue;
                            return JSON.stringify(sanitized);
                        } catch (e) {
                            return bodyValue;
                        }
                    }
                    if (typeof bodyValue === 'object') {
                        return sanitizeTemplateBodyInputs(bodyValue);
                    }
                    return bodyValue;
                };

                // --- 模型特征定义 (融合 V2.5-3 和 V2.5-4) ---
                // isBananaLike: 用于旧版/通用香蕉模型 (排除 nano-banana-2)
                const isBananaLike = (modelId.includes('banana') || modelId.includes('edit') || modelId.includes('qwen')) && !(modelId.includes('nano-banana-2') || (config?.modelName ?? '').includes('nano-banana-2'));
                const isOpenAIImage = modelId.includes('gpt') || (config?.modelName ?? '').includes('gpt-image') || (config?.provider ?? '').toLowerCase().includes('gpt-4o image');
                const isFluxKontext = modelId.includes('flux') || (config?.modelName ?? '').includes('flux-kontext');
                // isNanoBanana2: V2.5-4 新增的异步模型标识
                const isNanoBanana2 = (config?.modelName ?? '').includes('nano-banana-2') || modelId.includes('nano-banana-2');
                const isMidjourney = !requestTemplateEnabled
                    && (modelId.includes('mj') || (config?.provider ?? '').toLowerCase().includes('midjourney'));
                const isJimeng = modelId.includes('jimeng') || (config?.modelName ?? '').includes('jimeng') || config?.provider === 'jimeng';
                const antigravityRouteMode = normalizeImageRouteMode(config?.imageRouteMode);
                const modelNameLower = String(config?.modelName || modelId || '').toLowerCase();
                const providerLower = String(config?.provider || '').toLowerCase();
                const baseUrlLower = String(baseUrl || '').toLowerCase();
                const isAntigravityImage = !requestTemplateEnabled
                    && !isGeminiNative
                    && (
                        antigravityRouteMode !== 'auto'
                        || providerLower.includes('antigravity')
                        || modelNameLower.includes('gemini-3-pro-image')
                        || baseUrlLower.includes('localhost:8045')
                        || baseUrlLower.includes('127.0.0.1:8045')
                    );

                // 辅助函数
                const getJimengModelName = () => {
                    if (modelId.includes('jimeng-4.5')) return 'jimeng-4.5';
                    if (modelId.includes('jimeng-4.1')) return 'jimeng-4.1';
                    if (modelId.includes('jimeng-4.0')) return 'jimeng-4.0';
                    if (modelId.includes('jimeng-3.1')) return 'jimeng-3.1';
                    if (modelId.includes('jimeng-3.0')) return 'jimeng-3.0';
                    if (config?.modelName?.includes('jimeng')) {
                        return config.modelName;
                    }
                    return 'jimeng-4.5'; // 默认使用最新版本
                };

                const getImageSizeFlag = () => {
                    if (!isNanoBanana2) return undefined;
                    if (resolution === '4K') return '4K';
                    if (resolution === '2K') return '2K';
                    return '1K';
                };
                const imageSizeFlag = getImageSizeFlag();
                const hasExplicitSize = isExplicitImageResolution(resolution);
                const aspect = ratio === 'Auto' || hasExplicitSize ? undefined : ratio;

                // --- 核心逻辑分支 ---

                // 0. Chat Image (使用 Chat 格式返回图片)
                if (isChatImage) {
                    endpoint = '/v1/chat/completions';
                    const contentParts = [];
                    if (prompt) contentParts.push({ type: 'text', text: prompt });
                    const inputImages = connectedImages.length > 0
                        ? connectedImages
                        : (sourceImage ? [sourceImage] : []);
                    inputImages.forEach((img) => {
                        if (!img) return;
                        contentParts.push({ type: 'image_url', image_url: { url: img } });
                    });
                    if (contentParts.length === 0) {
                        contentParts.push({ type: 'text', text: t('生成图片') });
                    }
                    payload = {
                        model: config?.modelName || modelId,
                        messages: [{ role: 'user', content: contentParts }],
                        stream: false
                    };
                }
                // 0. ModelScope Z-Image (异步任务)
                else if (isModelScope) {
                    const modelName = config?.modelName || 'Tongyi-MAI/Z-Image-Turbo';
                    endpoint = `${baseUrl}/v1/images/generations`;
                    payload = {
                        model: modelName,
                        prompt: prompt || '',
                        n: requestedImageCountForSubmit,
                        size: sizeStr,
                        ...(useAsync ? { async_mode: true } : {})
                    };
                    if (aspect) payload.aspect_ratio = aspect;
                }
                // 0.5 Gemini 原生模式（Yunwu/VibeCoding）
                else if (isGeminiNative) {
                    const modelName = config?.modelName || 'gemini-3-pro-image-preview';
                    const parts = [];
                    if (prompt) parts.push({ text: prompt });

                    const inputImages = connectedImages.length > 0
                        ? connectedImages
                        : (sourceImage ? [sourceImage] : []);

                    const getGeminiMimeType = (imageUrl) => {
                        if (!imageUrl) return 'image/png';
                        if (imageUrl.startsWith('data:')) {
                            const match = imageUrl.match(/^data:([^;]+);/i);
                            if (match && match[1]) return match[1];
                        }
                        const ext = getUrlExt(imageUrl, '.png');
                        if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
                        if (ext === '.webp') return 'image/webp';
                        if (ext === '.gif') return 'image/gif';
                        return 'image/png';
                    };

                    for (const img of inputImages) {
                        const base64 = await getBase64FromUrl(img, { useProxy: resolveSourceProxy(img) });
                        const mimeType = getGeminiMimeType(img);
                        parts.push({
                            inline_data: {
                                mime_type: mimeType,
                                data: base64
                            }
                        });
                    }

                    const imageConfig = {};
                    if (aspect) imageConfig.aspectRatio = aspect;
                    if (resolution && resolution !== 'Auto') imageConfig.imageSize = resolution;

                    payload = {
                        contents: [{ role: 'user', parts }],
                        generationConfig: {
                            responseModalities: ['TEXT', 'IMAGE'],
                            ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {})
                        }
                    };

                    const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
                    endpoint = `${baseUrl}/v1beta/models/${modelName}:generateContent${keyParam}`;
                }
                // 0.6 Antigravity Gemini-3-Pro-Image（兼容 OpenAI）
                else if (isAntigravityImage) {
                    const modelName = config?.modelName || modelId || 'gemini-3-pro-image';
                    const antigravityQuality = getAntigravityQualityByResolution(resolution);
                    const antigravityImageSize = getAntigravityImageSizeByResolution(resolution);
                    const antigravitySize = getAntigravitySizeParam(ratio, sizeStr);
                    const refs = connectedImages.length > 0
                        ? connectedImages
                        : (sourceImage ? [sourceImage] : []);
                    const shouldUseEdit = antigravityRouteMode === 'edit'
                        || (antigravityRouteMode === 'auto' && (refs.length > 0 || finalMaskBlob));
                    if (antigravityRouteMode === 'edit' && refs.length === 0 && !finalMaskBlob) {
                        throw new Error('当前模型为仅Edit模式，请先连接参考图或提供蒙版。');
                    }

                    if (shouldUseEdit) {
                        endpoint = `${baseUrl}/v1/images/edits`;
                        useMultipart = true;
                        const formData = new FormData();
                        formData.append('model', modelName);
                        formData.append('prompt', prompt || 'enhance');
                        formData.append('n', String(requestedImageCountForSubmit));
                        if (antigravitySize) formData.append('size', antigravitySize);
                        if (ratio && ratio !== 'Auto') formData.append('aspect_ratio', ratio);
                        if (antigravityImageSize) formData.append('image_size', antigravityImageSize);
                        if (antigravityQuality) formData.append('quality', antigravityQuality);

                        const blobPromises = refs.map((url) => getBlobFromUrl(url, { useProxy: resolveSourceProxy(url) }));
                        const blobs = await Promise.all(blobPromises);
                        blobs.forEach((blob, i) => {
                            formData.append(`image${i + 1}`, blob, `input_${i + 1}.png`);
                        });
                        if (finalMaskBlob) {
                            formData.append('mask', finalMaskBlob, 'mask.png');
                        }
                        payload = formData;
                    } else {
                        endpoint = `${baseUrl}/v1/images/generations`;
                        payload = {
                            model: modelName,
                            prompt: prompt || '',
                            n: requestedImageCountForSubmit,
                            size: antigravitySize,
                            response_format: 'url'
                        };
                        if (antigravityQuality) payload.quality = antigravityQuality;
                    }
                }
                // 1. 旧版 Banana/Edit (必须有参考图) - 修复: 只有在有图时才进入此逻辑
                else if (connectedImages.length > 0 && isBananaLike) {
                    endpoint = `${baseUrl}/v1/images/edits`;
                    useMultipart = true;
                    const formData = new FormData();
                    formData.append('model', config?.modelName || 'nano-banana');
                    formData.append('prompt', prompt || 'enhance');
                    formData.append('n', String(requestedImageCountForSubmit));
                    formData.append('size', sizeStr);
                    if (aspect) formData.append('aspect_ratio', aspect);
                    if (imageSizeFlag) formData.append('image_size', imageSizeFlag);

                    const blobPromises = connectedImages.map(url => getBlobFromUrl(url, { useProxy: resolveSourceProxy(url) }));
                    const blobs = await Promise.all(blobPromises);
                    blobs.forEach((blob, i) => {
                        formData.append('image', blob, `input_${i}.png`);
                    });

                    // 尝试添加蒙版 (V2.5-4特性)
                    if (finalMaskBlob) {
                        formData.append('mask', finalMaskBlob, 'mask.png');
                    }

                    payload = formData;
                }
                // 2. Flux Kontext 模型
                else if (isFluxKontext) {
                    endpoint = `${baseUrl}/v1/images/edits`;
                    useMultipart = true;
                    const formData = new FormData();
                    formData.append('model', config?.modelName || 'flux-kontext-pro');
                    formData.append('prompt', prompt || '');
                    if (aspect) formData.append('aspect_ratio', aspect);
                    if (sizeStr) formData.append('size', sizeStr);

                    const refs = connectedImages.length > 0 ? connectedImages : (sourceImage ? [sourceImage] : []);
                    if (refs.length > 0) {
                        const blobPromises = refs.map(url => getBlobFromUrl(url, { useProxy: resolveSourceProxy(url) }));
                        const blobs = await Promise.all(blobPromises);
                        blobs.forEach((blob, i) => formData.append('image', blob, `flux_ref_${i}.png`));
                    }
                    if (finalMaskBlob) {
                        formData.append('mask', finalMaskBlob, 'mask.png');
                    }
                    payload = formData;
                }
                // 3. OpenAI 图像模型
                else if (isOpenAIImage) {
                    let finalPrompt = prompt || '';
                    const jsonBody = {
                        model: config?.modelName || 'gpt-4o-image',
                        prompt: finalPrompt,
                        n: requestedImageCountForSubmit,
                        size: sizeStr,
                        response_format: 'url'
                    };
                    if (aspect) jsonBody.aspect_ratio = aspect;

                    if (connectedImages.length > 0) {
                        const b64Promises = connectedImages.map(url => getBase64FromUrl(url, { useProxy: resolveSourceProxy(url) }));
                        const b64s = await Promise.all(b64Promises);
                        jsonBody.image = b64s.map(b => `data:image/png;base64,${b}`);
                    }
                    payload = jsonBody;
                }
                // 4. [关键] Nano Banana 2 (V2.5-4 核心逻辑，包含异步处理)
                else if (isNanoBanana2) {
                    const useAsync = true; // 保持异步开启
                    if (connectedImages.length > 0) {
                        endpoint = `${baseUrl}/v1/images/edits${useAsync ? '?async=true' : ''}`;
                        useMultipart = true;
                        const formData = new FormData();
                        formData.append('model', config?.modelName || 'nano-banana-2');
                        formData.append('prompt', prompt || '');
                        formData.append('response_format', 'url');
                        if (aspect) formData.append('aspect_ratio', aspect);
                        if (imageSizeFlag) formData.append('image_size', imageSizeFlag);

                        const blobPromises = connectedImages.map(url => getBlobFromUrl(url, { useProxy: resolveSourceProxy(url) }));
                        const blobs = await Promise.all(blobPromises);
                        blobs.forEach((blob, i) => {
                            formData.append('image', blob, `input_${i}.png`);
                        });
                        if (finalMaskBlob) {
                            formData.append('mask', finalMaskBlob, 'mask.png');
                        }
                        payload = formData;
                    } else {
                        endpoint = `${baseUrl}/v1/images/generations${useAsync ? '?async=true' : ''}`;
                        const jsonBody = {
                            model: config?.modelName || 'nano-banana-2',
                            prompt: prompt || '',
                            response_format: 'url',
                            ...(aspect ? { aspect_ratio: aspect } : {}),
                            ...(imageSizeFlag ? { image_size: imageSizeFlag } : {}),
                        };
                        if (sourceImage) {
                            const trimmedImg = sourceImage.trim();
                            if (trimmedImg.startsWith('http')) {
                                jsonBody.image = [trimmedImg];
                            } else if (trimmedImg.startsWith('data:')) {
                                jsonBody.image = [trimmedImg];
                            } else {
                                const b64 = await getBase64FromUrl(trimmedImg, { useProxy: resolveSourceProxy(trimmedImg) });
                                jsonBody.image = [`data:image/png;base64,${b64}`];
                            }
                        }
                        payload = jsonBody;
                    }
                }
                // 5. Midjourney (V2.5-4 逻辑，支持 oref/sref)
                else if (isMidjourney) {
                    const mjMode = node?.settings?.mjMode || 'fast';
                    const mjVersion = node?.settings?.mjVersion || '--v 7';
                    let mjPrompt = prompt || '';
                    if (ratio && ratio !== 'Auto') {
                        if (!mjPrompt.includes('--ar ')) {
                            mjPrompt = `${mjPrompt} --ar ${ratio}`.trim();
                        }
                    }
                    const orefConnected = getConnectedImageForInput(nodeId, 'oref');
                    const srefConnected = getConnectedImageForInput(nodeId, 'sref');

                    const imagesToUpload = [];
                    const imageIndexMap = new Map();
                    let orefImageUrl = null;
                    let srefImageUrl = null;
                    let defaultImageUrls = [];

                    const orefUrl = orefConnected || (node?.settings?.mjOref && node.settings.mjOref.trim());
                    if (orefUrl && orefUrl.trim()) {
                        let finalOrefUrl = orefUrl.trim();
                        if (finalOrefUrl.startsWith('http')) { orefImageUrl = finalOrefUrl; }
                        else if (finalOrefUrl.startsWith('data:')) { imagesToUpload.push(finalOrefUrl); imageIndexMap.set('oref', imagesToUpload.length - 1); }
                        else { orefImageUrl = finalOrefUrl; }
                    }
                    const srefUrl = srefConnected || (node?.settings?.mjSref && node.settings.mjSref.trim());
                    if (srefUrl && srefUrl.trim()) {
                        let finalSrefUrl = srefUrl.trim();
                        if (finalSrefUrl.startsWith('http')) { srefImageUrl = finalSrefUrl; }
                        else if (finalSrefUrl.startsWith('data:')) { imagesToUpload.push(finalSrefUrl); imageIndexMap.set('sref', imagesToUpload.length - 1); }
                        else { srefImageUrl = finalSrefUrl; }
                    }
                    if (connectedImages.length > 0) {
                        for (const img of connectedImages) {
                            const isOrefImage = orefConnected && img === orefConnected;
                            const isSrefImage = srefConnected && img === srefConnected;
                            if (!isOrefImage && !isSrefImage) {
                                if (img.startsWith('http')) { defaultImageUrls.push(img); }
                                else if (img.startsWith('data:')) { imagesToUpload.push(img); imageIndexMap.set(`default_${defaultImageUrls.length}`, imagesToUpload.length - 1); defaultImageUrls.push(null); }
                                else { defaultImageUrls.push(img); }
                            }
                        }
                    }
                    if (imagesToUpload.length > 0) {
                        try {
                            const uploadedUrls = await uploadMidjourneyImages(imagesToUpload, baseUrl, apiKey);
                            if (imageIndexMap.has('oref')) orefImageUrl = uploadedUrls[imageIndexMap.get('oref')];
                            if (imageIndexMap.has('sref')) srefImageUrl = uploadedUrls[imageIndexMap.get('sref')];
                            for (let i = 0; i < defaultImageUrls.length; i++) {
                                if (defaultImageUrls[i] === null) {
                                    const key = `default_${i}`;
                                    if (imageIndexMap.has(key)) defaultImageUrls[i] = uploadedUrls[imageIndexMap.get(key)];
                                }
                            }
                        } catch (error) {
                            setHistory((prev) => prev.map((hItem) => hItem.id === taskId ? { ...hItem, status: 'failed', progress: 0, errorMsg: `图片上传失败: ${error.message}` } : hItem));
                            return;
                        }
                    }
                    defaultImageUrls = defaultImageUrls.filter(url => url !== null);
                    let finalMjPrompt = '';
                    if (defaultImageUrls.length > 0) finalMjPrompt = defaultImageUrls.join(' ') + ' ';
                    finalMjPrompt += mjPrompt.trim();
                    if (!finalMjPrompt.includes('--v ') && !finalMjPrompt.includes('--niji ')) finalMjPrompt = `${finalMjPrompt} ${mjVersion}`.trim();
                    if (ratio && ratio !== 'Auto' && !finalMjPrompt.includes('--ar ')) finalMjPrompt = `${finalMjPrompt} --ar ${ratio}`.trim();
                    if (orefImageUrl && !finalMjPrompt.includes('--oref ')) finalMjPrompt = `${finalMjPrompt} --oref ${orefImageUrl}`.trim();
                    if (node?.settings?.mjOw && node.settings.mjOw > 0 && !finalMjPrompt.includes('--ow ')) finalMjPrompt = `${finalMjPrompt} --ow ${Math.min(1000, Math.max(1, node.settings.mjOw))}`.trim();
                    if (srefImageUrl && !finalMjPrompt.includes('--sref ')) finalMjPrompt = `${finalMjPrompt} --sref ${srefImageUrl}`.trim();

                    endpoint = `${baseUrl}/${mjMode}/mj/submit/imagine`;
                    payload = { prompt: finalMjPrompt, base64Array: [] };

                    const mjResp = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    const mjText = await mjResp.text();
                    if (!mjResp.ok) throw new Error(mjText || `Midjourney API error: ${mjResp.status}`);
                    let mjData = JSON.parse(mjText);
                    if (mjData.code !== 1 && mjData.code !== 22) throw new Error(mjData.description || `Midjourney提交失败: code ${mjData.code}`);
                    const remoteTaskId = mjData.result;
                    if (!remoteTaskId) throw new Error('未获取到任务ID');
                    setHistory((prev) => prev.map((hItem) => hItem.id === taskId ? { ...hItem, remoteTaskId, status: 'generating', progress: 5 } : hItem));
                    pollMidjourneyJob(remoteTaskId, taskId, baseUrl, apiKey, mjMode, w, h);
                    return;
                }
                // 6. 即梦 (Jimeng) - [修复] 恢复 V2.5-3 的稳定逻辑
                else if (isJimeng) {
                    if (connectedImages.length > 0) {
                        // 图生图 (使用 compositions)
                        endpoint = `${baseUrl}/v1/images/compositions`;
                        if (!prompt || prompt.trim() === '') throw new Error('图生图功能需要提供提示词');

                        let jimengRatio = ratio;
                        let jimengResolution = '2k';

                        if (ratio === 'Auto' && sourceImage) {
                            try {
                                const sourceDims = await getImageDimensions(sourceImage);
                                // V3.7.19: 计算最接近的标准比例，而不是直接使用原始比例
                                const supportedRatios = [
                                    { name: '1:1', value: 1 },
                                    { name: '4:3', value: 4 / 3 },
                                    { name: '3:4', value: 3 / 4 },
                                    { name: '16:9', value: 16 / 9 },
                                    { name: '9:16', value: 9 / 16 },
                                    { name: '3:2', value: 3 / 2 },
                                    { name: '2:3', value: 2 / 3 },
                                    { name: '21:9', value: 21 / 9 }
                                ];
                                const actualRatio = sourceDims.w / sourceDims.h;
                                // 找到最接近的支持比例
                                let closestRatio = supportedRatios[0];
                                let minDiff = Math.abs(actualRatio - closestRatio.value);
                                for (const r of supportedRatios) {
                                    const diff = Math.abs(actualRatio - r.value);
                                    if (diff < minDiff) {
                                        minDiff = diff;
                                        closestRatio = r;
                                    }
                                }
                                jimengRatio = closestRatio.name;

                                if (resolution === 'Auto') {
                                    const maxSide = Math.max(sourceDims.w, sourceDims.h);
                                    jimengResolution = maxSide <= 1024 ? '1k' : (maxSide <= 2048 ? '2k' : '4k');
                                }
                            } catch (e) { jimengRatio = '1:1'; }
                        } else {
                            jimengRatio = ratio === 'Auto' ? '1:1' : ratio;
                        }

                        if (resolution !== 'Auto') {
                            if (resolution === '1K') jimengResolution = '1k';
                            else if (resolution === '2K') jimengResolution = '2k';
                            else if (resolution === '4K') jimengResolution = '4k';
                        }

                        const maskDataUrl = finalMaskBlob ? await blobToDataURL(finalMaskBlob) : null;
                        const imagePromises = connectedImages.map(async (imgUrl) => {
                            try {
                                return await getDataUrlFromUrl(imgUrl, { useProxy: resolveSourceProxy(imgUrl) });
                            } catch (e) {
                                if (imgUrl.startsWith('blob:')) {
                                    console.error('[Jimeng] Blob URL 恢复失败:', e);
                                    throw new Error('引用图片已失效（Blob URL），请重新添加图片到画布');
                                }
                                throw new Error(`图片加载失败: ${e.message}。请尝试重新添加图片到画布`);
                            }
                        });
                        const base64Images = await Promise.all(imagePromises);
                        const jimengModelName = getJimengModelName();

                        payload = {
                            model: jimengModelName,
                            prompt: prompt.trim(),
                            images: base64Images,
                            ratio: jimengRatio,
                            resolution: jimengResolution,
                            response_format: 'url'
                        };
                        if (maskDataUrl) payload.mask = maskDataUrl;
                    } else {
                        // 文生图 (使用 generations)
                        endpoint = `${baseUrl}/v1/images/generations`;
                        const jimengRatio = ratio === 'Auto' ? '1:1' : ratio;
                        let jimengResolution = '2k';
                        if (resolution === '1K') jimengResolution = '1k';
                        else if (resolution === '2K') jimengResolution = '2k';
                        else if (resolution === '4K') jimengResolution = '4k';

                        if (!prompt || prompt.trim() === '') throw new Error('提示词不能为空');

                        const jimengModelName = getJimengModelName();
                        payload = {
                            model: jimengModelName,
                            prompt: prompt.trim(),
                            ratio: jimengRatio,
                            resolution: jimengResolution,
                            response_format: 'url'
                        };
                    }
                }
                // 7. [修复] 通用兜底 (修复 Banana T2I 问题)
                // 这部分是 V2.5-4 缺失的，导致普通 Banana 模型和其他通用 OpenAI 格式模型无法进行文生图
                else {
                    payload = {
                        model: config?.modelName || modelId,
                        prompt,
                        n: requestedImageCountForSubmit,
                        size: sizeStr,
                        response_format: 'url'
                    };
                }

                if (shouldUseStandardBatchMode && !isMidjourney) {
                    payload = applyImageBatchCountToPayload(payload, requestedImageCountForSubmit);
                }
                payload = applyCustomParamsToPayload(payload, customParams, customParamSelections);
                if (config?.previewOverrideEnabled && config.previewOverridePatch) {
                    payload = applyPreviewOverridePatch(payload, config.previewOverridePatch);
                }

                const getTemplateImageSources = async (inputImages = []) => {
                    const imageSources = [];
                    for (const rawUrl of inputImages) {
                        let normalized = await normalizeRequestInputUrlAsync(rawUrl);
                        if (!normalized) continue;
                        // 本地中间件下优先内联远程 URL，避免目标侧无法拉取带签名/防盗链图片
                        if (isLocalMiddlewareTarget && /^https?:/i.test(normalized)) {
                            try {
                                const base64 = await getBase64FromUrl(normalized, { useProxy: resolveSourceProxy(normalized) });
                                if (base64) {
                                    const ext = getUrlExt(normalized, '.png');
                                    const mime = ext === '.jpg' || ext === '.jpeg'
                                        ? 'image/jpeg'
                                        : ext === '.webp'
                                            ? 'image/webp'
                                            : 'image/png';
                                    normalized = `data:${mime};base64,${base64}`;
                                }
                            } catch (e) {
                                // 失败时保留 URL 继续尝试，避免完全阻断
                            }
                        }
                        imageSources.push(normalized);
                    }
                    return imageSources;
                };

                const buildAsyncTemplateVars = async () => {
                    const vars = {
                        modelName: config?.modelName || modelId,
                        prompt: prompt || '',
                        ratio: omitRatioOnSubmit ? '' : ratio,
                        resolution: omitResolutionOnSubmit ? '' : resolution,
                        size: (omitRatioOnSubmit || omitResolutionOnSubmit) ? '' : sizeStr,
                        duration: type === 'video' ? duration : undefined,
                        durationNumber: normalizeDurationValue(duration, 5),
                        seed: node?.settings?.seed,
                        n: requestedImageCountForSubmit,
                        imageCount: requestedImageCountForSubmit,
                        requestedImageCount: effectiveImageConcurrency,
                        imageBatchMode: activeImageBatchMode,
                        provider: {
                            key: apiKey,
                            baseUrl,
                            id: credentials.provider,
                            useProxy
                        }
                    };
                    const inputImages = connectedImages.length > 0
                        ? connectedImages
                        : (sourceImage ? [sourceImage] : []);
                    const imageSources = await getTemplateImageSources(inputImages);
                    if (imageSources.length > 0) {
                        vars.imageUrl = imageSources[0];
                        vars.imageUrls = imageSources;
                        vars.imagesUrl = imageSources;
                        vars.imagesUrls = imageSources;
                        imageSources.forEach((url, idx) => {
                            const index = idx + 1;
                            vars[`imageUrl${index}`] = url;
                            vars[`image${index}Url`] = url;
                        });
                    }
                    if (finalMaskBlob) {
                        vars.maskBlob = finalMaskBlob;
                    }
                    if (customParams.length > 0 && customParamSelections) {
                        customParams.forEach((param) => {
                            const name = String(param?.name || '').trim();
                            if (!name) return;
                            const value = getCustomParamSelection(param, customParamSelections);
                            if (value === '' || value === undefined || value === null) {
                                const fallback = getImageSourceFallbackByParam(name, imageSources);
                                if (fallback) {
                                    vars[name] = fallback;
                                }
                                return;
                            }
                            vars[name] = value;
                        });
                    }
                    return vars;
                };

                let requestOverride = null;
                if (requestTemplate?.enabled) {
                    const buildRequestTemplateVars = async () => {
                        const vars = {
                            modelName: config?.modelName || modelId,
                            prompt: prompt || '',
                            ratio: omitRatioOnSubmit ? '' : ratio,
                            resolution: omitResolutionOnSubmit ? '' : resolution,
                            size: (omitRatioOnSubmit || omitResolutionOnSubmit) ? '' : sizeStr,
                            duration: type === 'video' ? duration : undefined,
                            durationNumber: normalizeDurationValue(duration, 5),
                            seed: node?.settings?.seed,
                            n: requestedImageCountForSubmit,
                            imageCount: requestedImageCountForSubmit,
                            requestedImageCount: effectiveImageConcurrency,
                            imageBatchMode: activeImageBatchMode,
                            provider: {
                                key: apiKey,
                                baseUrl,
                                id: credentials.provider,
                                useProxy
                            }
                        };
                        const inputImages = connectedImages.length > 0
                            ? connectedImages
                            : (sourceImage ? [sourceImage] : []);
                        const imageSources = await getTemplateImageSources(inputImages);
                        if (imageSources.length > 0) {
                            vars.imageUrl = imageSources[0];
                            vars.imageUrls = imageSources;
                            vars.imagesUrl = imageSources;
                            vars.imagesUrls = imageSources;
                            imageSources.forEach((url, idx) => {
                                const index = idx + 1;
                                vars[`imageUrl${index}`] = url;
                                vars[`image${index}Url`] = url;
                            });
                        }
                        if (finalMaskBlob) {
                            vars.maskBlob = finalMaskBlob;
                            try {
                                vars.maskDataUrl = await blobToDataURL(finalMaskBlob);
                                vars.maskDataURL = vars.maskDataUrl;
                            } catch (e) { }
                        }
                        const templateText = JSON.stringify(requestTemplate || {});
                        const needsBlob = (requestTemplate?.bodyType || '').toLowerCase() === 'multipart'
                            || /:blob\s*}}/.test(templateText);
                        const needsDataUrl = /:blob\s*}}/.test(templateText);
                        if (needsBlob && imageSources.length > 0) {
                            const blobs = await Promise.all(imageSources.map((url) => getBlobFromUrl(url, { useProxy: resolveSourceProxy(url) })));
                            vars.imageBlob = blobs[0];
                            vars.imageBlobs = blobs;
                            vars.imagesBlob = blobs;
                            blobs.forEach((blob, idx) => {
                                const index = idx + 1;
                                vars[`imageBlob${index}`] = blob;
                                vars[`image${index}Blob`] = blob;
                            });
                        }
                        if (needsDataUrl && imageSources.length > 0) {
                            const dataUrls = await Promise.all(imageSources.map(async (url) => {
                                if (!url) return '';
                                if (url.startsWith('data:')) return url;
                                const base64 = await getBase64FromUrl(url, { useProxy: resolveSourceProxy(url) });
                                const ext = getUrlExt(url, '.png');
                                const mime = ext === '.jpg' || ext === '.jpeg'
                                    ? 'image/jpeg'
                                    : ext === '.webp'
                                        ? 'image/webp'
                                        : 'image/png';
                                return `data:${mime};base64,${base64}`;
                            }));
                            vars.imageDataUrl = dataUrls[0];
                            vars.imageDataURL = dataUrls[0];
                            vars.imageDataUrls = dataUrls;
                            vars.imagesDataUrl = dataUrls;
                            vars.imagesDataURL = dataUrls;
                            dataUrls.forEach((dataUrl, idx) => {
                                const index = idx + 1;
                                vars[`imageDataUrl${index}`] = dataUrl;
                                vars[`imageDataURL${index}`] = dataUrl;
                                vars[`image${index}DataUrl`] = dataUrl;
                                vars[`image${index}DataURL`] = dataUrl;
                            });
                        }
                        if (customParams.length > 0 && customParamSelections) {
                            customParams.forEach((param) => {
                                const name = String(param?.name || '').trim();
                                if (!name) return;
                                const value = getCustomParamSelection(param, customParamSelections);
                                if (value === '' || value === undefined || value === null) {
                                    const fallback = getImageSourceFallbackByParam(name, imageSources);
                                    if (fallback) {
                                        vars[name] = fallback;
                                    }
                                    return;
                                }
                                vars[name] = value;
                            });
                        }
                        return vars;
                    };
                    try {
                        const templateVars = await buildRequestTemplateVars();
                        const templateRequest = buildRequestFromTemplate(requestTemplate, templateVars, { bodyType: requestTemplate.bodyType });
                        if (templateRequest && templateRequest.url) {
                            templateRequest.body = sanitizeTemplateRequestBody(templateRequest.body);
                            requestOverride = requestOverrideEnabled && requestOverridePatch
                                ? applyRequestOverridePatch({ ...templateRequest }, requestOverridePatch)
                                : templateRequest;
                        }
                    } catch (e) {
                        console.warn('[RequestTemplate] 构建失败，已回退默认请求:', e);
                        requestOverride = null;
                    }
                }
                if (shouldUseStandardBatchMode && !isMidjourney) {
                    payload = applyImageBatchCountToPayload(payload, requestedImageCountForSubmit);
                    if (requestOverride && requestOverride.body !== undefined) {
                        requestOverride = {
                            ...requestOverride,
                            body: applyImageBatchCountToPayload(requestOverride.body, requestedImageCountForSubmit)
                        };
                    }
                }

                // --- 发送请求逻辑 (通用) (Supports Failover) ---
                // --- 发送请求逻辑 (通用) (Supports Failover) ---

                // 执行 fetch 请求的辅助函数
                const performFetch = async (currentApiKey, currentBaseUrl) => {
                    const overrideUrl = requestOverride?.url || endpoint;
                    const overrideMethod = (requestOverride?.method || 'POST').toString().toUpperCase();
                    let overrideBodyType = (requestOverride?.bodyType || (useMultipart ? 'multipart' : 'json')).toString().toLowerCase();
                    const overrideHeaders = requestOverride?.headers && typeof requestOverride.headers === 'object'
                        ? { ...requestOverride.headers }
                        : {};
                    let requestBody = requestOverride && requestOverride.body !== undefined ? requestOverride.body : payload;
                    requestBody = sanitizeTemplateRequestBody(requestBody);
                    if (requestBody instanceof FormData) {
                        overrideBodyType = 'multipart';
                    }

                    if (currentApiKey && !overrideHeaders.Authorization && !overrideHeaders.authorization) {
                        overrideHeaders.Authorization = `Bearer ${currentApiKey}`;
                    }
                    if (overrideBodyType === 'json' && !overrideHeaders['Content-Type'] && !overrideHeaders['content-type']) {
                        overrideHeaders['Content-Type'] = 'application/json';
                    }
                    if (isModelScope && useProxy && useAsync) {
                        overrideHeaders['X-ModelScope-Async-Mode'] = 'true';
                    }

                    let fullUrl;
                    if (overrideUrl.startsWith('http')) {
                        if (currentBaseUrl !== baseUrl && overrideUrl.includes(baseUrl)) {
                            fullUrl = overrideUrl.replace(baseUrl, currentBaseUrl);
                        } else {
                            fullUrl = overrideUrl;
                        }
                    } else {
                        const cleanBaseUrl = currentBaseUrl.replace(/\/+$/, '');
                        fullUrl = `${cleanBaseUrl}${overrideUrl.startsWith('/') ? overrideUrl : '/' + overrideUrl}`;
                    }

                    if (overrideBodyType === 'multipart') {
                        requestBody = coerceFormDataFromObject(requestBody);
                        delete overrideHeaders['Content-Type'];
                        delete overrideHeaders['content-type'];
                    } else if (overrideBodyType === 'raw') {
                        if (typeof requestBody !== 'string') {
                            requestBody = JSON.stringify(requestBody ?? {});
                        }
                    } else if (overrideBodyType === 'json') {
                        if (!(requestBody instanceof FormData) && typeof requestBody !== 'string') {
                            requestBody = JSON.stringify(requestBody ?? {});
                        }
                    }

                    const finalUrl = buildProxyUrl(fullUrl, providerKey);
                    return await fetch(finalUrl, {
                        method: overrideMethod,
                        headers: overrideHeaders,
                        body: requestBody,
                    });
                };

                const apiKeysList = apiKeyRaw && apiKeyRaw.includes(',')
                    ? apiKeyRaw.split(',').map(k => k.trim()).filter(k => k)
                    : [apiKeyRaw || globalApiKey];
                const baseUrlsList = baseUrlRaw.includes(',')
                    ? baseUrlRaw.split(',').map(u => u.trim()).filter(u => u)
                    : [(baseUrlRaw || DEFAULT_BASE_URL).replace(/\/+$/, '')];

                const shuffleArray = (array) => {
                    for (let i = array.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [array[i], array[j]] = [array[j], array[i]];
                    }
                    return array;
                };

                if (apiKeysList.length > 1) shuffleArray(apiKeysList);
                if (baseUrlsList.length > 1) shuffleArray(baseUrlsList);

                let resp;
                let data; // 直接存储解析后的数据
                let text; // 存储文本正文
                let lastError;
                let success = false;

                // 使用 ref 获取最新黑名单（解决并发请求竞态）
                const currentBlacklist = apiBlacklistRef.current || {};
                const combinations = [];
                for (const k of apiKeysList) {
                    if (currentBlacklist[k]) {
                        continue;
                    }
                    // V3.7.23: 跳过暂停列表中的 key
                    if (isKeySuspended(k)) {
                        continue;
                    }
                    for (const u of baseUrlsList) {
                        combinations.push({ key: k, url: u });
                    }
                }

                if (combinations.length === 0 && apiKeysList.length > 0) {
                    console.warn('[Blacklist] All specified keys are blacklisted. Trying anyway with all available keys to avoid total failure.');
                    for (const k of apiKeysList) {
                        for (const u of baseUrlsList) {
                            combinations.push({ key: k, url: u });
                        }
                    }
                }

                if (combinations.length > 1) shuffleArray(combinations);

                for (const combo of combinations) {
                    try {
                        resp = await performFetch(combo.key, combo.url);

                        // 需要严格处理的网络层错误（401/402/403）
                        if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
                            const reason = resp.status === 402 ? '积分耗尽 (402)' : (resp.status === 401 ? '认证失效 (401)' : '访问被拒绝 (403)');
                            console.warn(`[API Failover] Key ending in ...${combo.key.slice(-4)} failed with status ${resp.status}. Trying next...`);
                            addToBlacklist(combo.key, reason);
                            lastError = new Error(`API returned ${resp.status}: ${reason}`);
                            continue;
                        }

                        // 业务逻辑层错误（如即梦 1006）
                        // 注意：resp.text() 会消耗响应体，因此必须保存读取结果
                        text = await resp.text();
                        try {
                            data = JSON.parse(text);
                        } catch (e) {
                            // 状态码为 200 但 JSON 解析失败时，通常说明响应内容无效
                            // 一般在后续流程中统一抛出错误
                        }

                        // 调试：检查响应数据
                        if (isJimeng && data) {
                        }

                        // 从代理包装的响应中提取真实错误码（代理返回 code=-2001，真实错误在 message 中）
                        let realErrorCode = data?.code;
                        if (data?.message && typeof data.message === 'string') {
                            const match = data.message.match(/错误码:\s*(\d+)/);
                            if (match) {
                                realErrorCode = parseInt(match[1], 10);
                            }
                        }

                        // V3.7.23: 详细错误日志
                        if (isJimeng && data && (data.code !== 0 || realErrorCode)) {
                        }

                        // V3.7.23: 参数错误 (1000) - 致命错误，不应重试
                        if (isJimeng && (realErrorCode === 1000 || (data?.message && data.message.toLowerCase().includes('invalid parameter')))) {
                            console.error(`⛔ [API Fatal] 参数错误 (1000): ${data.message}`);
                            throw new Error(`参数错误: ${data.message || 'Invalid parameter'} (错误码 1000)`);
                        }

                        // V3.7.23: 登录失效 (34010105) - 暂停列表，不入黑名单
                        if (isJimeng && (realErrorCode === 34010105 || (data?.message && data.message.includes('34010105')))) {
                            console.warn(`⏳ [API Suspend] Key ending in ...${combo.key.slice(-4)} 登录失效 (34010105)，暂停 60 分钟`);
                            addToSuspendList(combo.key, '登录失效 (34010105)', 60 * 60 * 1000);
                            lastError = new Error(`登录失效: 请刷新 session (错误码 34010105)`);
                            continue; // 尝试下一个 key
                        }

                        // V3.7.23: 积分耗尽 (1006) - 仅精确匹配 realErrorCode===1006 才入黑名单
                        if (isJimeng && realErrorCode === 1006) {
                            // 熔断检查
                            record1006Error();
                            if (checkCircuitBreaker()) {
                                throw new Error(`⚡ 熔断保护: 短时间内多个账号积分耗尽，已暂停请求。请检查账号状态。`);
                            }
                            const reason = '积分耗尽 (1006)';
                            console.warn(`🚫 [API Blacklist] Key ending in ...${combo.key.slice(-4)} 积分耗尽 (1006)`);
                            addToBlacklist(combo.key, reason);
                            lastError = new Error(`Jimeng Error: ${data.message || 'Not enough credits'}`);
                            continue; // 故障转移
                        }

                        success = true;
                        break;

                    } catch (err) {
                        // V3.7.23: 参数错误和熔断错误不应被捕获后继续
                        if (err.message.includes(t('参数错误')) || err.message.includes(t('熔断保护'))) {
                            throw err; // 重新抛出致命错误
                        }
                        console.warn(`[API Failover] Network/Parse request failed for ...${combo.key.slice(-4)}. Error: ${err.message}`);
                        lastError = err;
                    }
                }

                if (!success || (!resp && !text)) {
                    const errorMsg = lastError ? lastError.message : "All API combinations failed.";
                    throw new Error(errorMsg);
                }

                // 请求成功时已经取得 `text` 和 `data`
                // 下方逻辑要求已经调用 `resp.text()` 或存在可用的 `text`
                // 此处不能再次调用 resp.text()
                // 确保变量与后续逻辑保持一致

                // success=true 时，数据已在循环内部完成解析
                if (!data && text) {
                    try { data = JSON.parse(text); } catch (e) { throw new Error(`响应解析失败: ${text.substring(0, 100)}`); }
                }

                if (!resp.ok) {
                    let errorMsg = data?.message || data?.error?.message || text;
                    if (isOpenAIImage && resp.status === 500) {
                        const detailedError = data?.error?.message || data?.error || data?.message || text;
                        errorMsg = `GPT - 4o 图片生成失败(500错误): ${detailedError} \n\n请检查：\n1.API Key 是否正确\n2.模型名称是否正确(${config?.modelName || 'gpt-4o-image'}) \n3.提示词是否符合要求\n4.服务是否正常运行`;
                        setHistory((prev) => prev.map((hItem) =>
                            hItem.id === taskId
                                ? { ...hItem, status: 'failed', progress: 0, errorMsg }
                                : hItem
                        ));
                    }
                    throw new Error(errorMsg);
                }

                // 处理即梦特定错误码
                if (isJimeng && data?.code !== undefined && data.code !== 0 && data.code !== 1 && data.code !== 200) {
                    throw new Error(data.message || `即梦API错误: ${data.code} `);
                }

                const immediateImageCandidates = collectImmediateImageUrls(data);

                // [保留 V2.5-4 特性] 处理异步任务 (Nano Banana 2)
                // 如果响应中包含 task_id，进入异步轮询模式
                if (isNanoBanana2 && (data?.task_id || (typeof data?.data === 'string' && data.data.startsWith('task-')))) {
                    const taskIdForPoll = data.task_id || data.data;
                    setHistory((prev) => prev.map((hItem) =>
                        hItem.id === taskId ? { ...hItem, status: 'generating', progress: 10, remoteTaskId: taskIdForPoll } : hItem
                    ));
                    pollImageTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, actualSourceNodeId, 0, true);
                    return;
                }

                if (asyncConfig?.enabled) {
                    const requestId = getValueByPathAny(data, asyncConfig.requestIdPaths);
                    if (requestId && immediateImageCandidates.length === 0) {
                        const asyncVars = await buildAsyncTemplateVars();
                        asyncVars.requestId = requestId;
                        setHistory((prev) => prev.map((hItem) =>
                            hItem.id === taskId ? { ...hItem, status: 'generating', progress: 10, remoteTaskId: requestId } : hItem
                        ));
                        pollAsyncTask(taskId, requestId, asyncConfig, asyncVars, w, h, actualSourceNodeId, providerKey, 0);
                        return;
                    }
                }
                if (!asyncConfig?.enabled && baseUrl && (String(baseUrl).includes('127.0.0.1:9527') || String(baseUrl).includes('localhost:9527'))) {
                    const requestId = getValueByPathAny(data, ['requestId', 'request_id', 'data.requestId', 'data.request_id', 'taskId', 'task_id', 'job_id']);
                    if (requestId && immediateImageCandidates.length === 0) {
                        const fallbackConfig = normalizeAsyncConfig(ASYNC_CONFIG_TEMPLATE);
                        if (fallbackConfig) {
                            const asyncVars = await buildAsyncTemplateVars();
                            asyncVars.requestId = requestId;
                            setHistory((prev) => prev.map((hItem) =>
                                hItem.id === taskId ? { ...hItem, status: 'generating', progress: 10, remoteTaskId: requestId } : hItem
                            ));
                            pollAsyncTask(taskId, requestId, fallbackConfig, asyncVars, w, h, actualSourceNodeId, providerKey, 0);
                            return;
                        }
                    }
                }

                let imageUrls = immediateImageCandidates.length > 0 ? [...immediateImageCandidates] : [];
                if (imageUrls.length === 0 && isChatImage) {
                    let chatContent = null;
                    const primaryMessage = data?.choices?.[0]?.message || data?.data?.choices?.[0]?.message;
                    if (primaryMessage?.content !== undefined) {
                        if (Array.isArray(primaryMessage.content)) {
                            chatContent = primaryMessage.content
                                .map(part => (typeof part?.text === 'string' ? part.text : ''))
                                .filter(Boolean)
                                .join('\n');
                        } else {
                            chatContent = primaryMessage.content;
                        }
                    } else if (data?.content) {
                        chatContent = data.content;
                    } else if (data?.text) {
                        chatContent = data.text;
                    } else if (data?.message) {
                        chatContent = typeof data.message === 'string' ? data.message : data.message.content;
                    } else if (data?.result) {
                        chatContent = typeof data.result === 'string' ? data.result : data.result.content;
                    } else if (data?.data?.content) {
                        chatContent = data.data.content;
                    } else if (data?.data?.text) {
                        chatContent = data.data.text;
                    } else if (data?.data?.message) {
                        chatContent = typeof data.data.message === 'string' ? data.data.message : data.data.message.content;
                    } else if (data?.data?.result) {
                        chatContent = typeof data.data.result === 'string' ? data.data.result : data.data.result.content;
                    }
                    if (chatContent && typeof chatContent !== 'string') {
                        chatContent = JSON.stringify(chatContent);
                    }
                    imageUrls = extractChatImageUrls(data, chatContent || '');
                } else if (imageUrls.length === 0 && isModelScope) {
                    const taskIdForPoll = data?.task_id || data?.taskId || data?.data?.task_id || data?.output?.task_id || data?.output?.taskId;
                    const rawImages = data?.output_images || data?.output?.output_images || data?.data?.output_images || data?.output?.images || data?.data?.output?.output_images || [];
                    imageUrls = Array.isArray(rawImages)
                        ? rawImages.map((img) => {
                            if (typeof img === 'string') return img;
                            return img?.url || img?.image_url || img?.imageUrl || img?.path || '';
                        }).filter(Boolean)
                        : [];

                    if (taskIdForPoll && imageUrls.length === 0) {
                        setHistory((prev) => prev.map((hItem) =>
                            hItem.id === taskId ? { ...hItem, status: 'generating', progress: 10, remoteTaskId: taskIdForPoll } : hItem
                        ));
                        pollModelScopeTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, actualSourceNodeId, providerKey, useProxy, 0);
                        return;
                    }
                } else if (imageUrls.length === 0 && isGeminiNative) {
                    const collected = new Set();
                    const pushUrl = (value, mimeHint = 'image/png') => {
                        if (!value) return;
                        if (typeof value === 'string') {
                            const trimmed = value.trim();
                            if (!trimmed) return;
                            if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                                collected.add(trimmed);
                                return;
                            }
                            const base64Like = /^[A-Za-z0-9+/=]+$/.test(trimmed);
                            if (base64Like && trimmed.length > 64) {
                                const mimeType = detectBase64ImageMime(trimmed, mimeHint);
                                collected.add(`data:${mimeType};base64,${trimmed}`);
                            }
                            return;
                        }
                        if (typeof value === 'object') {
                            const url = value.url
                                || value.image_url
                                || value.imageUrl
                                || value.object_url
                                || value.objectUrl
                                || value.file_uri
                                || value.fileUri
                                || value.uri;
                            if (url) {
                                collected.add(url);
                                return;
                            }
                            const data = value.data || value.base64 || value.b64;
                            if (data) {
                                const mimeType = detectBase64ImageMime(data, value.mime_type || value.mimeType || mimeHint);
                                collected.add(`data:${mimeType};base64,${data}`);
                            }
                        }
                    };
                    const extractFromText = (text) => {
                        if (!text || typeof text !== 'string') return;
                        const dataMatches = text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g) || [];
                        dataMatches.forEach((match) => collected.add(match));
                        const urlMatches = text.match(/https?:\/\/[^\s)]+/g) || [];
                        urlMatches.forEach((match) => {
                            if (match.match(/\.(png|jpg|jpeg|webp|gif)(\?|#|$)/i)) {
                                collected.add(match);
                            }
                        });
                    };
                    const candidateSources = [
                        data?.candidates,
                        data?.data?.candidates,
                        data?.response?.candidates,
                        data?.result?.candidates,
                        data?.data?.result?.candidates,
                        data?.output?.candidates
                    ];
                    candidateSources.forEach((candidateList) => {
                        if (!Array.isArray(candidateList)) return;
                        candidateList.forEach((candidate) => {
                            const parts = Array.isArray(candidate?.content?.parts)
                                ? candidate.content.parts
                                : (Array.isArray(candidate?.parts) ? candidate.parts : []);
                            parts.forEach((part) => {
                                const inline = part?.inline_data || part?.inlineData;
                                if (inline?.data) {
                                    const mimeType = inline.mime_type || inline.mimeType || 'image/png';
                                    const rawData = inline.data;
                                    const dataUrl = rawData.startsWith('data:')
                                        ? rawData
                                        : `data:${mimeType};base64,${rawData}`;
                                    collected.add(dataUrl);
                                }
                                const fileData = part?.file_data || part?.fileData;
                                if (fileData) {
                                    const fileUrl = fileData.file_uri || fileData.fileUri || fileData.uri;
                                    if (fileUrl) collected.add(fileUrl);
                                }
                                if (part?.data) pushUrl(part.data, part?.mime_type || part?.mimeType || 'image/png');
                                if (part?.image_url || part?.imageUrl) pushUrl(part.image_url || part.imageUrl);
                                if (part?.text) extractFromText(part.text);
                            });
                        });
                    });

                    const fallbackCollections = [
                        data?.images,
                        data?.image,
                        data?.outputs,
                        data?.data?.images,
                        data?.data?.image,
                        data?.data?.outputs,
                        data?.result?.images,
                        data?.result?.image,
                        data?.result?.output_images,
                        data?.result?.output?.output_images,
                        data?.data?.result?.images,
                        data?.data?.result?.output_images,
                        data?.data?.result?.output?.output_images,
                        data?.output_images,
                        data?.output?.images,
                        data?.output?.output_images,
                        data?.data?.output_images,
                        data?.data?.output?.output_images
                    ];
                    fallbackCollections.forEach((entry) => {
                        if (Array.isArray(entry)) {
                            entry.forEach((item) => pushUrl(item));
                        } else if (entry) {
                            pushUrl(entry);
                        }
                    });

                    imageUrls = Array.from(collected).filter(Boolean);
                }

                // 处理同步返回结果 (标准 OpenAI 格式或嵌套格式)
                if (imageUrls.length === 0) {
                    if (data?.data && Array.isArray(data.data)) {
                        // 标准 OpenAI 格式
                        imageUrls = data.data.map(item => {
                            if (typeof item === 'string') return item;
                            if (!item) return null;
                            return item.url
                                || item.image_url
                                || item.imageUrl
                                || (item.b64_json ? `data:${detectBase64ImageMime(item.b64_json)};base64,${item.b64_json}` : null)
                                || (item.base64 ? `data:${detectBase64ImageMime(item.base64)};base64,${item.base64}` : null);
                        }).filter(url => typeof url === 'string');
                    } else if (data?.data?.data && Array.isArray(data.data.data)) {
                        // 嵌套格式
                        imageUrls = data.data.data.map(item => {
                            if (typeof item === 'string') return item;
                            if (!item) return null;
                            return item.url
                                || item.image_url
                                || item.imageUrl
                                || (item.b64_json ? `data:${detectBase64ImageMime(item.b64_json)};base64,${item.b64_json}` : null)
                                || (item.base64 ? `data:${detectBase64ImageMime(item.base64)};base64,${item.base64}` : null);
                        }).filter(Boolean);
                    }
                }

                if (imageUrls.length === 0) {
                    const deepCandidates = collectDeepImageValues(data);
                    if (deepCandidates.length > 0) {
                        imageUrls = deepCandidates;
                    }
                }

                if (imageUrls.length === 0) {
                    console.warn('[Image Parse] 未找到图片URL', {
                        keys: data && typeof data === 'object' ? Object.keys(data) : [],
                        data
                    });
                    throw new Error('未能在响应中找到图片URL');
                }

                imageUrls = await normalizeImageUrls(imageUrls);
                if (imageUrls.length === 0) {
                    console.warn('[Image Parse] 图片URL规范化后为空');
                    throw new Error('图片返回结果无效');
                }
                if (type === 'image') {
                    if (imageUrls.length > 1) {
                        updateNativeMultiImageCapability(modelId, resolvedConfig, 'supported', {
                            detectedBy: 'response_images_count',
                            returnedCount: imageUrls.length,
                            requestedCount: requestedImageCountForSubmit,
                            batchMode: activeImageBatchMode
                        });
                    } else if (shouldUseStandardBatchMode && requestedImageCountForSubmit > 1 && imageUrls.length <= 1) {
                        updateNativeMultiImageCapability(modelId, resolvedConfig, 'unsupported', {
                            detectedBy: 'standard_batch_single_output',
                            returnedCount: imageUrls.length,
                            requestedCount: requestedImageCountForSubmit,
                            batchMode: activeImageBatchMode
                        });
                    }
                }
                if (
                    shouldUseStandardBatchMode
                    && !options._standardBatchFallback
                    && imageUrls.length < requestedImageCountForSubmit
                ) {
                    throw new Error(`标准批次返图数量不足: ${imageUrls.length}/${requestedImageCountForSubmit}`);
                }

                const endTime = Date.now();
                const durationMs = endTime - now;

                // V3.6.1: 检查是否是分镜表的图片任务
                // V3.7.9: 保存所有生成的图片到 output_images 数组
                // V3.7.30: 添加调试日志
                const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                const fallbackStoryboard = !storyboardTask ? parseStoryboardSourceNodeId(actualSourceNodeId) : null;
                if (storyboardTask) {
                    if (storyboardTask.isImageMode) {
                        updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                            output_images: imageUrls, // V3.7.9: 保存所有图片
                            output_url: imageUrls[0], // 兼容旧逻辑
                            selectedImageIndex: 0, // V3.7.9: 默认选中第一张
                            outputEnabled: false, // V3.7.25: 默认不勾选，用户手动选择满意的
                            status: 'done',
                            durationCost: durationMs / 1000
                        });
                    } else {
                        console.warn('[V3.7.30 Debug] 分镜表任务未找到或不是图片模式，无法回填');
                    }
                    // 清理任务映射
                    storyboardTaskMapRef.current.delete(taskId);
                } else if (fallbackStoryboard?.isImageMode) {
                    updateShot(fallbackStoryboard.nodeId, fallbackStoryboard.shotId, {
                        output_images: imageUrls,
                        output_url: imageUrls[0],
                        selectedImageIndex: 0,
                        outputEnabled: false,
                        status: 'done',
                        durationCost: durationMs / 1000
                    });
                }

                setHistory((prev) => {
                    const updated = prev.map((hItem) => {
                        if (hItem.id === taskId) {
                            const batchState = consumeImageBatchSuccess(taskId, hItem, imageUrls);
                            const mergedImageUrls = batchState.urls.length > 0 ? batchState.urls : imageUrls;
                            const primaryUrl = mergedImageUrls[0];
                            const updatedItem = {
                                ...hItem,
                                status: batchState.status,
                                progress: batchState.progress,
                                url: primaryUrl,
                                width: w,
                                height: h,
                                durationMs,
                                output_images: mergedImageUrls,
                                mjImages: mergedImageUrls.length > 1 ? mergedImageUrls : null,
                                selectedMjImageIndex: 0
                            };

                            // 更新预览窗口（非分镜表任务）
                            if (updatedItem.sourceNodeId && !storyboardTask) {
                                setTimeout(() => {
                                    updatePreviewFromTask(taskId, primaryUrl, 'image', updatedItem.sourceNodeId, updatedItem.mjImages);
                                }, 0);
                            }
                            return updatedItem;
                        }
                        return hItem;
                    });
                    return updated;
                });
                return;
            } // type === 'image' 分支结束

            if (type === 'video') {
                // V3.4.20：为视频生成分支显式定义配置
                const config = getApiConfigByKey(modelId);
                const customParams = Array.isArray(config?.customParams) ? config.customParams : [];
                const providerKey = config?.provider || credentials.provider;
                const modelName = config?.modelName || '';
                const isJimengVideo = providerKey === 'jimeng'
                    || modelId.includes('jimeng')
                    || modelName.includes('jimeng')
                    || modelId.includes('dreamina')
                    || modelName.includes('dreamina');
                const isJimengSora2 = isJimengVideo && (modelId.includes('sora2') || modelName.includes('sora2'));
                const isOpenAISora = !isJimengVideo && (modelId.includes('sora') || modelName.includes('sora'));
                const isGrokVideo = providerKey === 'grok' || modelId.includes('grok') || modelName.includes('grok');
                const useProxy = !!credentials.useProxy;
                const requestTemplate = normalizeRequestTemplate(config?.requestTemplate);
                const requestOverrideEnabled = !!config?.requestOverrideEnabled;
                const requestOverridePatch = normalizeRequestOverridePatch(config?.requestOverridePatch);
                const omitRatioOnSubmit = !!config?.omitRatioOnSubmit;
                const omitResolutionOnSubmit = !!config?.omitResolutionOnSubmit;
                const omitDurationOnSubmit = !!config?.omitDurationOnSubmit;
                const resolveSourceProxy = (url) => getProxyPreferenceForUrl(url, useProxy);
                const applyVideoCustomParams = (payload) => {
                    const updated = applyCustomParamsToPayload(payload, customParams, customParamSelections);
                    if (config?.previewOverrideEnabled && config.previewOverridePatch) {
                        applyPreviewOverridePatch(updated, config.previewOverridePatch);
                    }
                    return updated;
                };
                // Veo 3.x 图生视频：按 /v2/videos/generations 规范发送 JSON，使用 images 数组而不是 input_image
                if (modelId.includes('veo')) {
                    const endpoint = `${baseUrl}/v2/videos/generations`;

                    // 根据文档：images 支持 url 或 base64
                    // 对于Veo接口，如果图片过大，自动缩放到合理尺寸（1920x1080等）
                    // 首尾帧：当开启“首尾帧”时，优先使用 veo_start / veo_end 两个输入点，顺序为 [首帧, 尾帧]，最多 2 张
                    const currentNodeForVeo = nodesMap.get(nodeId);
                    const supportsFirstLastFrame = !!config?.supportsFirstLastFrame;
                    const useFirstLastFrame = supportsFirstLastFrame && !!(currentNodeForVeo?.settings?.useFirstLastFrame || currentNodeForVeo?.settings?.veoFramesMode);
                    const veoStartFrame = useFirstLastFrame ? getConnectedImageForInput(nodeId, 'veo_start') : null;
                    const veoEndFrame = useFirstLastFrame ? getConnectedImageForInput(nodeId, 'veo_end') : null;
                    const veoFrameImages = [veoStartFrame, veoEndFrame].filter(Boolean);
                    const effectiveConnectedImages = (veoFrameImages.length > 0 ? veoFrameImages : connectedImages).slice(0, 2);
                    const effectiveSourceImage = (veoFrameImages.length > 0 ? veoFrameImages[0] : sourceImage);
                    let images = [];
                    if (effectiveConnectedImages && effectiveConnectedImages.length > 0) {
                        // 处理多张图片：先缩放，再转换为data URL
                        images = await Promise.all(effectiveConnectedImages
                            .filter(img => img && typeof img === 'string' && img.trim().length > 0)
                            .map(async (img) => {
                                const trimmedImg = img.trim();

                                // 如果是 http/https URL，先检查尺寸，如果太大就缩放
                                if (trimmedImg.startsWith('http://') || trimmedImg.startsWith('https://')) {
                                    // 对于URL，先尝试获取尺寸，如果太大就缩放
                                    try {
                                        const dims = await getImageDimensions(trimmedImg);
                                        if (dims.w > 1920 || dims.h > 1920) {
                                            const resized = await resizeImageForVeo(trimmedImg, 1920, 1920);
                                            return resized;
                                        }
                                        // 尺寸合适，直接使用URL
                                        return trimmedImg;
                                    } catch (e) {
                                        console.warn('Veo: 无法获取图片尺寸，尝试直接使用URL', e);
                                        return trimmedImg;
                                    }
                                }

                                // 对于 data URL、blob URL 或其他格式，统一缩放处理
                                try {
                                    // 先获取尺寸
                                    const dims = await getImageDimensions(trimmedImg);
                                    if (dims.w > 1920 || dims.h > 1920) {
                                        const resized = await resizeImageForVeo(trimmedImg, 1920, 1920);
                                        return resized;
                                    }
                                    // 尺寸合适，转换为data URL格式
                                    if (trimmedImg.startsWith('data:')) {
                                        return trimmedImg;
                                    } else if (trimmedImg.startsWith('blob:')) {
                                        const base64 = await getBase64FromUrl(trimmedImg, { useProxy: resolveSourceProxy(trimmedImg) });
                                        return `data:image/png;base64,${base64}`;
                                    } else if (trimmedImg.length > 100 && !trimmedImg.includes('://') && !trimmedImg.startsWith('data:')) {
                                        return `data:image/png;base64,${trimmedImg}`;
                                    } else {
                                        const base64 = await getBase64FromUrl(trimmedImg, { useProxy: resolveSourceProxy(trimmedImg) });
                                        return `data:image/png;base64,${base64}`;
                                    }
                                } catch (e) {
                                    console.error('Veo: Failed to process image:', e);
                                    throw new Error(`无法处理图片格式: ${trimmedImg.substring(0, 50)}...`);
                                }
                            }));
                    } else if (effectiveSourceImage) {
                        // 单张图片处理：先检查尺寸，如果太大就缩放
                        const trimmedSource = effectiveSourceImage.trim();

                        try {
                            // 先获取图片尺寸
                            const dims = await getImageDimensions(trimmedSource);

                            // 如果图片过大，先缩放
                            if (dims.w > 1920 || dims.h > 1920) {
                                const resized = await resizeImageForVeo(trimmedSource, 1920, 1920);
                                images = [resized];
                            } else {
                                // 尺寸合适，根据格式处理
                                if (trimmedSource.startsWith('http://') || trimmedSource.startsWith('https://')) {
                                    images = [trimmedSource];
                                } else if (trimmedSource.startsWith('data:')) {
                                    images = [trimmedSource];
                                } else if (trimmedSource.startsWith('blob:')) {
                                    const base64 = await getBase64FromUrl(trimmedSource, { useProxy: resolveSourceProxy(trimmedSource) });
                                    images = [`data:image/png;base64,${base64}`];
                                } else {
                                    if (trimmedSource.length > 100 && !trimmedSource.includes('://') && !trimmedSource.startsWith('data:')) {
                                        images = [`data:image/png;base64,${trimmedSource}`];
                                    } else {
                                        const base64 = await getBase64FromUrl(trimmedSource, { useProxy: resolveSourceProxy(trimmedSource) });
                                        images = [`data:image/png;base64,${base64}`];
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('Veo: Failed to process source image:', e);
                            throw new Error(`无法处理图片格式: ${e.message} `);
                        }
                    }

                    // 构建 Veo 请求 payload
                    // 根据文档，images 是 required 字段，文生视频时传空数组，图生视频时传图片数据
                    // 图生视频时，确保 images 数组不为空
                    if (images.length === 0 && (effectiveConnectedImages?.length > 0 || effectiveSourceImage)) {
                        console.error('Veo: 图片处理失败，images 数组为空', { effectiveConnectedImages, effectiveSourceImage });
                        throw new Error('图片处理失败：无法获取图片数据');
                    }

                    // 验证图片数据格式：过滤掉无效数据，但不阻止请求发送
                    const validImages = images.filter((img, idx) => {
                        if (!img || typeof img !== 'string') {
                            console.warn(`Veo: 跳过无效图片（索引 ${idx}）: 不是字符串`);
                            return false;
                        }
                        if (img === 'base64_data' || img.trim() === 'base64_data') {
                            console.warn(`Veo: 跳过占位符图片（索引 ${idx}）: base64_data`);
                            return false;
                        }
                        return true;
                    });

                    if (validImages.length === 0 && (effectiveConnectedImages?.length > 0 || effectiveSourceImage)) {
                        console.error('Veo: 所有图片数据都无效', { images, effectiveConnectedImages, effectiveSourceImage });
                        throw new Error('图片数据格式错误：所有图片数据都无效');
                    }

                    // 对于 veo3.1 系列模型，确保 aspect_ratio 格式正确（只支持 '16:9' 和 '9:16'）
                    let aspectRatio = null;
                    if (!omitRatioOnSubmit && ratio && ratio !== 'Auto') {
                        // 确保比例格式符合 API 要求
                        if (ratio === '16:9' || ratio === '9:16') {
                            aspectRatio = ratio;
                        } else {
                            // 对于其他比例，根据实际宽高计算最接近的比例
                            const aspectRatioValue = w / h;
                            if (Math.abs(aspectRatioValue - 16 / 9) < Math.abs(aspectRatioValue - 9 / 16)) {
                                aspectRatio = '16:9';
                            } else {
                                aspectRatio = '9:16';
                            }
                        }
                    }

                    const veoPayload = {
                        model: config?.modelName || 'veo3.1',
                        prompt,
                        enhance_prompt: false,
                        images: validImages.length > 0 ? validImages : [], // 使用验证后的图片数组
                        // 按接口说明：不传 aspect_ratio 时自动根据参考图匹配；只有非 Auto 时才显式传
                        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {})
                    };
                    applyVideoCustomParams(veoPayload);

                    // 详细调试日志
                    console.log('Veo: 准备发送请求', {
                        endpoint,
                        model: veoPayload.model,
                        prompt: veoPayload.prompt?.substring(0, 50) + '...',
                        imagesCount: veoPayload.images.length,
                        firstImageType: veoPayload.images[0] ?
                            (veoPayload.images[0].startsWith('http') ? 'HTTP URL' :
                                veoPayload.images[0].startsWith('data:') ? 'Data URL' :
                                    'Unknown') : 'empty',
                        firstImagePreview: veoPayload.images[0] ?
                            (veoPayload.images[0].startsWith('http') ?
                                veoPayload.images[0].substring(0, 80) :
                                veoPayload.images[0].substring(0, 100)) : 'empty',
                        aspect_ratio: veoPayload.aspect_ratio,
                        payloadSize: JSON.stringify(veoPayload).length
                    });

                    try {
                        const resp = await fetch(endpoint, {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${apiKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(veoPayload)
                        });

                        const text = await resp.text();

                        if (!resp.ok) {
                            console.error('Veo: 请求失败', { status: resp.status, text });
                            throw new Error(text || `Veo error: ${resp.status} `);
                        }

                        const data = JSON.parse(text);
                        const jobId = data?.data?.id || data?.id || data?.task_id || data?.data?.task_id;

                        if (!jobId) {
                            console.error('Veo: 未找到 JobId', data);
                            throw new Error('Veo No JobId');
                        }

                        setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'generating', progress: 10 } : h));
                        pollVeoJob(jobId, taskId, baseUrl, apiKey, w, h);
                        return;
                    } catch (error) {
                        console.error('Veo: 请求发送失败', error);
                        setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'failed', errorMsg: error.message || '请求发送失败' } : h));
                        throw error;
                    }
                }

                let endpoint = '';
                let body;
                const headers = { Authorization: `Bearer ${apiKey}` };
                // 统一将时长转为纯数字秒，避免后端期望 int 时收到字符串
                const durationValueNum = (() => {
                    if (duration === null || duration === undefined) return 8;
                    const cleaned = String(duration).trim().replace(/[^\d]/g, '');
                    const parsed = parseInt(cleaned, 10);
                    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
                })();

                // --- Grok-3 视频逻辑：使用纯 JSON 修复整数类型错误，并对齐 /v2/videos/generations 规范 ---
                if (isGrokVideo) {
                    const endpoint = `${baseUrl}/v2/videos/generations`;
                    // 1. 强制转换为整数 (解决 Go 后端类型错误)
                    const durationInt = parseInt(duration, 10);
                    const aspectRatioStr = ratio && ratio !== 'Auto' ? ratio : '3:2'; // 按官方枚举优先 3:2/2:3/1:1
                    const resolutionStr = (resolution && resolution !== 'Auto') ? resolution : '1080P'; // 官方支持 720P/1080P


                    // 2. 准备基础 Payload
                    const payload = {
                        model: config?.modelName || 'grok-video-3',
                        prompt: prompt
                    };
                    if (!omitRatioOnSubmit && aspectRatioStr && aspectRatioStr !== 'Auto') {
                        payload.ratio = aspectRatioStr;
                    }
                    if (!omitResolutionOnSubmit && resolutionStr && resolutionStr !== 'Auto') {
                        payload.resolution = resolutionStr;
                    }
                    if (!omitDurationOnSubmit && Number.isFinite(durationInt) && durationInt > 0) {
                        payload.duration = durationInt;
                    }

                    // 3. 处理图片：转为 Base64 字符串
                    if (sourceImage) {
                        try {
                            let base64Data = '';

                            if (sourceImage.startsWith('data:')) {
                                base64Data = sourceImage; // 已经是 Base64
                            } else {
                                // 下载 blob 或 url 并转换
                                const blob = await getBlobFromUrl(sourceImage, { useProxy: resolveSourceProxy(sourceImage) });
                                base64Data = await new Promise((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                            }

                            // 将完整的 data URI 放入 images 数组（官方字段）
                            payload.images = [base64Data];
                        } catch (e) {
                            console.error('Grok Image Conversion Failed:', e);
                            canvasAlert(t('图片处理失败，请检查图片链接或跨域设置'));
                            return;
                        }
                    }

                    // 4. 发送纯 JSON 请求
                    applyVideoCustomParams(payload);
                    const resp = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json' // 必须是 JSON
                        },
                        body: JSON.stringify(payload)
                    });

                    const text = await resp.text();

                    // 5. 错误处理
                    if (!resp.ok) {
                        console.error('[Grok API Error]', text);
                        throw new Error(text || `Grok API error: ${resp.status} `);
                    }

                    // 6. 解析响应
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        throw new Error('API 返回了非 JSON 格式数据');
                    }

                    // 兼容多种 ID 返回格式
                    const jobId = data?.data?.id || data?.id || data?.task_id;
                    if (!jobId) {
                        console.error('Grok No Task ID:', data);
                        throw new Error('API 未返回 Task ID');
                    }

                    // 7. 进入轮询 (Grok 兼容 Sora 查询接口)
                    setHistory(prev => prev.map(h => h.id === taskId ? { ...h, status: 'generating', progress: 10, remoteTaskId: jobId } : h));
                    pollSoraJob(jobId, taskId, baseUrl, apiKey, w, h, modelId);

                    return; // 阻断后续代码执行
                }

                // 通用视频逻辑（Sora、可灵等）：图像输入强制使用 Multipart 并传递正确字段名
                if (isJimengVideo) {
                    endpoint = `${baseUrl}/v1/videos/generations`;
                    const allowedDurations = Array.isArray(config?.durations)
                        ? config.durations.map((d) => normalizeDurationValue(d, durationValueNum)).filter((d) => Number.isFinite(d))
                        : (isJimengSora2 ? [4, 8, 12] : [5, 10]);
                    const baseDuration = normalizeJimengVideoDuration(durationValueNum, allowedDurations);
                    const ratioOptions = isJimengSora2
                        ? { defaultRatio: 'auto', allowedRatios: ['16:9', '9:16', 'auto'] }
                        : { defaultRatio: '1:1' };
                    const jimengRatio = normalizeJimengVideoRatio(ratio, ratioOptions);
                    const modelKey = config?.modelName || modelId || 'jimeng-video-3.0';
                    const supportsResolution = supportsJimengVideoResolution(modelKey);
                    const jimengResolution = supportsResolution ? normalizeJimengVideoResolution(resolution) : '';

                    const supportsFirstLastFrame = !!config?.supportsFirstLastFrame;
                    const useFirstLastFrame = supportsFirstLastFrame && !!(node?.settings?.useFirstLastFrame || node?.settings?.veoFramesMode);
                    const startFrame = useFirstLastFrame ? getConnectedImageForInput(nodeId, 'veo_start') : null;
                    const endFrame = useFirstLastFrame ? getConnectedImageForInput(nodeId, 'veo_end') : null;
                    const frameImages = [startFrame, endFrame].filter(Boolean);
                    const fallbackImages = connectedImages.filter(Boolean);
                    const baseImages = frameImages.length > 0 ? frameImages : fallbackImages;
                    const jimengImages = baseImages.slice(0, isJimengSora2 ? 1 : 2);
                    if (!prompt || !prompt.trim()) throw new Error('提示词不能为空');

                    if (jimengImages.length > 0) {
                        const formData = new FormData();
                        formData.append('model', modelKey);
                        formData.append('prompt', prompt);
                        if (!omitDurationOnSubmit) formData.append('duration', String(baseDuration));
                        if (!omitRatioOnSubmit) formData.append('ratio', jimengRatio);
                        if (!omitResolutionOnSubmit && supportsResolution && jimengResolution) formData.append('resolution', jimengResolution);

                        const jimengBlobs = await Promise.all(jimengImages.map(async (img) => {
                            const blob = await getBlobFromUrl(img, { useProxy: resolveSourceProxy(img) });
                            return await coerceImageBlobForJimeng(blob);
                        }));
                        if (jimengBlobs[0]) formData.append('image_file_1', jimengBlobs[0], 'first.png');
                        if (jimengBlobs[1]) formData.append('image_file_2', jimengBlobs[1], 'last.png');

                        applyVideoCustomParams(formData);
                        if (isJimengSora2) {
                            formData.delete('image_file_2');
                            formData.delete('image_file_3');
                        }

                        if (!omitDurationOnSubmit) {
                            const durationOverride = normalizeJimengVideoDuration(formData.get('duration'), allowedDurations);
                            if (durationOverride) formData.set('duration', String(durationOverride));
                        } else {
                            formData.delete('duration');
                        }

                        if (!omitRatioOnSubmit) {
                            const ratioOverride = normalizeJimengVideoRatio(formData.get('ratio') || jimengRatio || ratioOptions.defaultRatio, ratioOptions);
                            if (isJimengSora2 && ratioOverride === 'auto') {
                                formData.delete('ratio');
                            } else {
                                formData.set('ratio', ratioOverride);
                            }
                        } else {
                            formData.delete('ratio');
                        }

                        const resolutionOverride = (!omitResolutionOnSubmit && supportsResolution)
                            ? normalizeJimengVideoResolution(formData.get('resolution') || jimengResolution)
                            : '';
                        if (!omitResolutionOnSubmit && supportsResolution && resolutionOverride) {
                            formData.set('resolution', resolutionOverride);
                        } else {
                            formData.delete('resolution');
                        }
                        console.log('[Jimeng Video] request', {
                            model: modelKey,
                            mode: 'image',
                            images: jimengImages.length,
                            duration: formData.get('duration'),
                            ratio: formData.get('ratio') || 'auto',
                            resolution: formData.get('resolution') || 'n/a'
                        });
                        body = formData;
                    } else {
                        headers['Content-Type'] = 'application/json';
                        const payload = {
                            model: modelKey,
                            prompt: prompt
                        };
                        if (!omitDurationOnSubmit) {
                            payload.duration = baseDuration;
                        }
                        if (!omitRatioOnSubmit && !(isJimengSora2 && jimengRatio === 'auto')) {
                            payload.ratio = jimengRatio;
                        }
                        if (!omitResolutionOnSubmit && supportsResolution && jimengResolution) payload.resolution = jimengResolution;
                        applyVideoCustomParams(payload);

                        if (!omitDurationOnSubmit) {
                            const durationOverride = normalizeJimengVideoDuration(payload.duration, allowedDurations);
                            if (durationOverride) payload.duration = durationOverride;
                        } else {
                            delete payload.duration;
                        }

                        if (!omitRatioOnSubmit) {
                            const ratioOverride = normalizeJimengVideoRatio(payload.ratio || jimengRatio || ratioOptions.defaultRatio, ratioOptions);
                            if (isJimengSora2 && ratioOverride === 'auto') {
                                delete payload.ratio;
                            } else {
                                payload.ratio = ratioOverride;
                            }
                        } else {
                            delete payload.ratio;
                        }

                        const resolutionOverride = (!omitResolutionOnSubmit && supportsResolution)
                            ? normalizeJimengVideoResolution(payload.resolution || jimengResolution)
                            : '';
                        if (!omitResolutionOnSubmit && supportsResolution && resolutionOverride) {
                            payload.resolution = resolutionOverride;
                        } else {
                            delete payload.resolution;
                        }
                        console.log('[Jimeng Video] request', {
                            model: modelKey,
                            mode: 'text',
                            images: 0,
                            duration: payload.duration,
                            ratio: payload.ratio || 'auto',
                            resolution: payload.resolution || 'n/a'
                        });
                        body = JSON.stringify(payload);
                    }
                } else if (sourceImage) {
                    const formData = new FormData();
                    const blob = await getBlobFromUrl(sourceImage, { useProxy: resolveSourceProxy(sourceImage) });

                    if (isOpenAISora) {
                        endpoint = `${baseUrl}/v1/videos/generations`;
                        // 发送前移除大括号：将 @{username} 转换为 @username
                        let finalPrompt = prompt.replace(/@\{([^\}]+)\}/g, (match, username) => {
                            return `@${username} `;
                        });
                        formData.append('model', config?.modelName || 'sora-2');
                        formData.append('prompt', finalPrompt);
                        if (!omitDurationOnSubmit) formData.append('seconds', duration);
                        if (!omitRatioOnSubmit && !omitResolutionOnSubmit) formData.append('size', sizeStr);
                        // Sora 2 HD 模式支持
                        if (config?.supportsHD && (options.isHD || node?.settings?.isHD)) {
                            formData.append('quality', 'hd');
                        }
                        // Sora 可能使用 input_reference 或 image 字段，为兼容性同时附加两者
                        formData.append('input_reference', blob, 'ref.png');
                        formData.append('image', blob, 'ref.png');
                    } else if (isGrokVideo) {
                        endpoint = `${baseUrl}/v1/videos/generations`;
                        formData.append('model', config?.modelName || 'grok-video-3');
                        formData.append('prompt', prompt);
                        if (!omitRatioOnSubmit) formData.append('aspect_ratio', ratio);
                        if (!omitDurationOnSubmit) formData.append('duration', durationValueNum);
                        formData.append('image', blob, 'input.png');
                    } else {
                        endpoint = `${baseUrl}/v1/videos/generations`;
                        formData.append('model', config?.modelName);
                        formData.append('prompt', prompt);
                        formData.append('image', blob, 'input.png');
                        if (!omitRatioOnSubmit && !omitResolutionOnSubmit) formData.append('size', sizeStr); // 确保通用接口能够收到尺寸参数
                    }
                    applyVideoCustomParams(formData);
                    body = formData;
                } else {
                    headers['Content-Type'] = 'application/json';
                    if (isOpenAISora) {
                        delete headers['Content-Type'];
                        endpoint = `${baseUrl}/v1/videos/generations`;
                        const formData = new FormData();
                        // 发送前移除大括号：将 @{username} 转换为 @username
                        let finalPrompt = prompt.replace(/@\{([^\}]+)\}/g, (match, username) => {
                            return `@${username} `;
                        });
                        formData.append('model', config?.modelName || 'sora-2');
                        formData.append('prompt', finalPrompt);
                        if (!omitDurationOnSubmit) formData.append('seconds', duration);
                        if (!omitRatioOnSubmit && !omitResolutionOnSubmit) formData.append('size', sizeStr);
                        // Sora 2 HD 模式支持
                        if (config?.supportsHD && (options.isHD || node?.settings?.isHD)) {
                            formData.append('quality', 'hd');
                        }
                        applyVideoCustomParams(formData);
                        body = formData;
                    } else if (isGrokVideo) {
                        endpoint = `${baseUrl}/v1/videos/generations`;
                        const payload = {
                            model: config?.modelName || 'grok-video-3',
                            prompt
                        };
                        if (!omitRatioOnSubmit) payload.aspect_ratio = ratio;
                        if (!omitDurationOnSubmit) payload.duration = durationValueNum;
                        applyVideoCustomParams(payload);
                        body = JSON.stringify(payload);
                    } else {
                        endpoint = `${baseUrl}/v1/videos/generations`;
                        const payload = { model: config?.modelName, prompt };
                        if (!omitRatioOnSubmit && !omitResolutionOnSubmit) {
                            payload.resolution = sizeStr;
                        }
                        applyVideoCustomParams(payload);
                        body = JSON.stringify(payload);
                    }
                }

                let requestOverride = null;
                if (requestTemplate?.enabled) {
                    const buildRequestTemplateVars = async () => {
                        const vars = {
                            modelName: config?.modelName || modelId,
                            prompt: prompt || '',
                            ratio: omitRatioOnSubmit ? '' : ratio,
                            resolution: omitResolutionOnSubmit ? '' : resolution,
                            size: (omitRatioOnSubmit || omitResolutionOnSubmit) ? '' : sizeStr,
                            duration: omitDurationOnSubmit ? undefined : durationValueNum,
                            durationNumber: omitDurationOnSubmit ? undefined : durationValueNum,
                            seed: node?.settings?.seed,
                            provider: {
                                key: apiKey,
                                baseUrl,
                                id: credentials.provider,
                                useProxy
                            }
                        };
                        if (isJimengVideo) {
                            const allowedDurations = Array.isArray(config?.durations)
                                ? config.durations.map((d) => normalizeDurationValue(d, durationValueNum)).filter((d) => Number.isFinite(d))
                                : (isJimengSora2 ? [4, 8, 12] : [5, 10]);
                            const ratioOptions = isJimengSora2
                                ? { defaultRatio: 'auto', allowedRatios: ['16:9', '9:16', 'auto'] }
                                : { defaultRatio: '1:1' };
                            const jimengDuration = normalizeJimengVideoDuration(durationValueNum, allowedDurations);
                            const rawJimengRatio = normalizeJimengVideoRatio(ratio, ratioOptions);
                            const jimengRatio = (isJimengSora2 && rawJimengRatio === 'auto') ? undefined : rawJimengRatio;
                            const supportsResolution = supportsJimengVideoResolution(config?.modelName || modelId || '');
                            const rawResolution = supportsResolution ? normalizeJimengVideoResolution(resolution) : '';
                            const jimengResolution = supportsResolution && rawResolution ? rawResolution : undefined;
                            vars.jimengDuration = omitDurationOnSubmit ? undefined : jimengDuration;
                            vars.jimengRatio = omitRatioOnSubmit ? undefined : jimengRatio;
                            vars.jimengResolution = omitResolutionOnSubmit ? undefined : jimengResolution;
                        }
                        const inputImages = connectedImages.length > 0
                            ? connectedImages
                            : (sourceImage ? [sourceImage] : []);
                        const imageSources = inputImages.filter(Boolean);
                        const supportsFirstLastFrame = !!config?.supportsFirstLastFrame;
                        const useFirstLastFrame = supportsFirstLastFrame && !!(node?.settings?.useFirstLastFrame || node?.settings?.veoFramesMode);
                        const startFrame = useFirstLastFrame ? getConnectedImageForInput(nodeId, 'veo_start') : null;
                        const endFrame = useFirstLastFrame ? getConnectedImageForInput(nodeId, 'veo_end') : null;
                        const firstFrameSource = startFrame || imageSources[0] || null;
                        const lastFrameSource = endFrame || imageSources[1] || null;
                        if (imageSources.length > 0) {
                            vars.imageUrl = imageSources[0];
                            vars.imageUrls = imageSources;
                            vars.imagesUrl = imageSources;
                            vars.imagesUrls = imageSources;
                        }
                        vars.firstFrameUrl = firstFrameSource;
                        vars.lastFrameUrl = lastFrameSource;
                        const templateText = JSON.stringify(requestTemplate || {});
                        const needsBlob = (requestTemplate?.bodyType || '').toLowerCase() === 'multipart'
                            || /:blob\s*}}/.test(templateText);
                        const needsDataUrl = /:blob\s*}}/.test(templateText);
                        if (needsBlob && imageSources.length > 0) {
                            const blobMap = new Map();
                            const blobs = await Promise.all(imageSources.map(async (url) => {
                                const blob = await getBlobFromUrl(url, { useProxy: resolveSourceProxy(url) });
                                const normalized = isJimengVideo ? await coerceImageBlobForJimeng(blob) : blob;
                                blobMap.set(url, normalized);
                                return normalized;
                            }));
                            const ensureBlob = async (sourceUrl) => {
                                if (!sourceUrl) return null;
                                if (blobMap.has(sourceUrl)) return blobMap.get(sourceUrl);
                                const blob = await getBlobFromUrl(sourceUrl, { useProxy: resolveSourceProxy(sourceUrl) });
                                const normalized = isJimengVideo ? await coerceImageBlobForJimeng(blob) : blob;
                                blobMap.set(sourceUrl, normalized);
                                return normalized;
                            };
                            vars.imageBlob = blobs[0];
                            vars.imageBlobs = blobs;
                            vars.imagesBlob = blobs;
                            vars.firstFrameBlob = await ensureBlob(firstFrameSource);
                            vars.lastFrameBlob = await ensureBlob(lastFrameSource);
                        }
                        if (needsDataUrl && imageSources.length > 0) {
                            const dataUrlMap = new Map();
                            const dataUrls = await Promise.all(imageSources.map(async (url) => {
                                if (!url) return '';
                                if (url.startsWith('data:')) return url;
                                const base64 = await getBase64FromUrl(url, { useProxy: resolveSourceProxy(url) });
                                const ext = getUrlExt(url, '.png');
                                const mime = ext === '.jpg' || ext === '.jpeg'
                                    ? 'image/jpeg'
                                    : ext === '.webp'
                                        ? 'image/webp'
                                        : 'image/png';
                                const dataUrl = `data:${mime};base64,${base64}`;
                                dataUrlMap.set(url, dataUrl);
                                return dataUrl;
                            }));
                            vars.imageDataUrl = dataUrls[0];
                            vars.imageDataURL = dataUrls[0];
                            vars.imageDataUrls = dataUrls;
                            vars.imagesDataUrl = dataUrls;
                            vars.imagesDataURL = dataUrls;
                            const ensureDataUrl = async (sourceUrl) => {
                                if (!sourceUrl) return '';
                                if (dataUrlMap.has(sourceUrl)) return dataUrlMap.get(sourceUrl);
                                if (sourceUrl.startsWith('data:')) return sourceUrl;
                                const base64 = await getBase64FromUrl(sourceUrl, { useProxy: resolveSourceProxy(sourceUrl) });
                                const ext = getUrlExt(sourceUrl, '.png');
                                const mime = ext === '.jpg' || ext === '.jpeg'
                                    ? 'image/jpeg'
                                    : ext === '.webp'
                                        ? 'image/webp'
                                        : 'image/png';
                                const dataUrl = `data:${mime};base64,${base64}`;
                                dataUrlMap.set(sourceUrl, dataUrl);
                                return dataUrl;
                            };
                            vars.firstFrameDataUrl = await ensureDataUrl(firstFrameSource);
                            vars.firstFrameDataURL = vars.firstFrameDataUrl;
                            vars.lastFrameDataUrl = await ensureDataUrl(lastFrameSource);
                            vars.lastFrameDataURL = vars.lastFrameDataUrl;
                        }
                        if (customParams.length > 0 && customParamSelections) {
                            customParams.forEach((param) => {
                                const name = String(param?.name || '').trim();
                                if (!name) return;
                                const value = getCustomParamSelection(param, customParamSelections);
                                if (value === '' || value === undefined || value === null) return;
                                vars[name] = value;
                            });
                        }
                        return vars;
                    };
                    try {
                        const templateVars = await buildRequestTemplateVars();
                        const templateRequest = buildRequestFromTemplate(requestTemplate, templateVars, { bodyType: requestTemplate.bodyType });
                        if (templateRequest && templateRequest.url) {
                            requestOverride = requestOverrideEnabled && requestOverridePatch
                                ? applyRequestOverridePatch({ ...templateRequest }, requestOverridePatch)
                                : templateRequest;
                        }
                    } catch (e) {
                        console.warn('[RequestTemplate] 构建失败，已回退默认请求:', e);
                        requestOverride = null;
                    }
                }

                const overrideUrl = requestOverride?.url || endpoint;
                const overrideMethod = (requestOverride?.method || 'POST').toString().toUpperCase();
                let overrideBodyType = (requestOverride?.bodyType || (body instanceof FormData ? 'multipart' : 'json')).toString().toLowerCase();
                const overrideHeaders = requestOverride?.headers && typeof requestOverride.headers === 'object'
                    ? { ...requestOverride.headers }
                    : { ...headers };
                let requestBody = requestOverride && requestOverride.body !== undefined ? requestOverride.body : body;
                if (requestBody instanceof FormData) {
                    overrideBodyType = 'multipart';
                }

                if (apiKey && !overrideHeaders.Authorization && !overrideHeaders.authorization) {
                    overrideHeaders.Authorization = `Bearer ${apiKey}`;
                }
                if (overrideBodyType === 'json' && !overrideHeaders['Content-Type'] && !overrideHeaders['content-type']) {
                    overrideHeaders['Content-Type'] = 'application/json';
                }
                if (overrideBodyType === 'multipart') {
                    requestBody = coerceFormDataFromObject(requestBody);
                    delete overrideHeaders['Content-Type'];
                    delete overrideHeaders['content-type'];
                } else if (overrideBodyType === 'raw') {
                    if (typeof requestBody !== 'string') {
                        requestBody = JSON.stringify(requestBody ?? {});
                    }
                } else if (overrideBodyType === 'json') {
                    if (!(requestBody instanceof FormData) && typeof requestBody !== 'string') {
                        requestBody = JSON.stringify(requestBody ?? {});
                    }
                }

                let finalEndpoint = overrideUrl;
                if (!finalEndpoint.startsWith('http')) {
                    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
                    finalEndpoint = `${cleanBaseUrl}${finalEndpoint.startsWith('/') ? finalEndpoint : '/' + finalEndpoint}`;
                }

                const resp = await fetch(finalEndpoint, { method: overrideMethod, headers: overrideHeaders, body: requestBody });
                const text = await resp.text();
                if (!resp.ok) throw new Error(text || `Video API error: ${resp.status} `);
                const data = JSON.parse(text);

                // V3.7.22: 使用精确匹配提取错误码，避免误判
                const errorCode = data?.code || data?.data?.code;
                const errorMessage = data?.message || data?.data?.message || '';

                // 从消息中提取真实错误码 (格式: "错误码: 1006")
                let realErrorCode = errorCode;
                const errorCodeMatch = errorMessage.match(/错误码[：:]\s*(\d+)/);
                if (errorCodeMatch) {
                    realErrorCode = parseInt(errorCodeMatch[1], 10);
                }

                // V3.7.22: 参数错误 (1000) - 立即停止，不重试
                const is1000Error = realErrorCode === 1000;
                if (is1000Error) {
                    console.error(`⛔ [Video API] 参数错误 (1000): ${errorMessage}`);
                    throw new Error(`视频参数错误: ${errorMessage || 'Invalid parameter'} (错误码 1000)`);
                }

                // 使用精确匹配检测 1006 (积分耗尽)
                const is1006Error = realErrorCode === 1006;
                const isLoginError = errorCode === -2001 && errorMessage.includes('34010105');

                // V3.5.31：处理即梦 API 生成失败（code -2008、status 30、error 2060）
                const isGenerationError = errorCode === -2008 || errorMessage.includes('2060');
                if (isGenerationError) {
                    // 提取更详细的错误信息
                    let detailedMsg = '❌ 视频生成失败';
                    if (errorMessage.includes('状态码: 30')) {
                        detailedMsg += '\\n\\n⚠️ 可能原因：\\n• 图片格式不支持\\n• 图片分辨率过低或过高\\n• 服务端繁忙，请稍后重试\\n• 内容审核未通过';
                    }
                    if (errorMessage.includes('2060')) {
                        detailedMsg += '\\n\\n错误码: 2060 (内部处理失败)';
                    }
                    throw new Error(detailedMsg);
                }

                if (is1006Error || isLoginError) {
                    const reason = is1006Error ? '积分耗尽 (1006)' : '登录失效 (34010105)';
                    console.warn(`🚫 [Video API] Key ending in ...${apiKey.slice(-4)} failed: ${reason}. Adding to blacklist.`);
                    addToBlacklist(apiKey, reason);
                    // 抛出带特殊标记的错误，以便触发重试
                    const retryError = new Error(`RETRY_WITH_NEW_KEY: ${errorMessage}`);
                    retryError.shouldRetry = true;
                    throw retryError;
                }

                // V3.4.26：支持 data.data 数组格式（如 [{"url": "..."}]）
                const immediateUrl = data?.video_url || data?.url || data?.data?.video_url || data?.data?.url || (Array.isArray(data?.data) && data.data[0]?.url);
                if (immediateUrl) {
                    const endTime = Date.now();
                    // 在更新 history 之前，先获取 sourceNodeId
                    const historyItem = historyMap.get(taskId);
                    const sourceNodeId = historyItem?.sourceNodeId;
                    const durationMs = endTime - (historyItem?.startTime || endTime);
                    // 使用 setHistory 的回调来确保获取最新的 historyItem
                    setHistory((prev) => {
                        const updated = prev.map((hItem) => hItem.id === taskId ? { ...hItem, status: 'completed', progress: 100, url: immediateUrl, width: w, height: h, durationMs } : hItem);
                        // 检查是否是分镜表的任务，如果是则回填到分镜表
                        const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                        if (storyboardTask) {
                            updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                video_url: immediateUrl,
                                status: 'done',
                                durationCost: durationMs / 1000 // 以秒为单位保存耗时
                            });
                            // 清理任务映射
                            storyboardTaskMapRef.current.delete(taskId);
                        } else {
                            // 更新预览窗口（非分镜表任务）
                            const updatedItem = updated.find(h => h.id === taskId);
                            if (updatedItem?.sourceNodeId) {
                                setTimeout(() => {
                                    updatePreviewFromTask(taskId, immediateUrl, 'video', updatedItem.sourceNodeId);
                                }, 0);
                            } else {
                                console.warn('[Tapnow] 视频立即返回: 未找到 sourceNodeId', { taskId, updatedItem });
                            }
                        }
                        return updated;
                    });
                    return;
                }
                const jobId = data?.data?.id || data?.id || data?.task_id || data?.data?.task_id || data?.job_id || data?.data?.job_id;
                if (!jobId) throw new Error(`No Task/Job ID returned. Response: ${JSON.stringify(data).substring(0, 200)}`);

                if (modelId.includes('veo')) pollVeoJob(jobId, taskId, baseUrl, apiKey, w, h);
                else pollSoraJob(jobId, taskId, baseUrl, apiKey, w, h, modelId);
            } // type === 'video' 分支结束
        } catch (err) {
            // V3.5.12：错误包含 shouldRetry 标记时，使用新密钥递归重试
            if (err.shouldRetry) {
                if (type === 'image') {
                    const retryMessage = err?.message || '重试中';
                    setHistory((prev) => prev.map((hItem) => {
                        if (hItem.id !== taskId) return hItem;
                        return attachHistoryThrottleStats({
                            ...hItem,
                            status: 'generating',
                            errorMsg: retryMessage
                        }, retryMessage, {
                            retryCountInc: 1,
                            touchError: true,
                            dispatchIntervalSec: requestedDispatchIntervalSec,
                            requestedImageCount: effectiveImageConcurrency,
                            imageBatchMode: activeImageBatchMode,
                            lastErrorType: 'retry'
                        });
                    }));
                    if (requestedDispatchIntervalMs > 0) {
                        await waitForMilliseconds(requestedDispatchIntervalMs);
                    }
                }
                // V3.5.31：传递 _isRetry 和 _existingTaskId，防止生成重复历史项
                return startGeneration(prompt, type, sourceImages, nodeId, { ...options, _isRetry: true, _existingTaskId: taskId });
            }
            if (
                type === 'image'
                && effectiveImageConcurrency > 1
                && shouldUseStandardBatchMode
                && !options._standardBatchFallback
            ) {
                console.warn('[Image Batch] standard_batch failed, fallback to parallel_aggregate', {
                    taskId,
                    requestedImageConcurrency: effectiveImageConcurrency,
                    err: err?.message || err
                });
                const fallbackErrMessage = String(err?.message || '');
                const unsupportedByError = /standard_batch_single_output|标准批次返图数量不足|unsupported|not\s*support|unknown\s*parameter.*\bn\b|invalid.*\bn\b/i.test(fallbackErrMessage);
                if (isNativeBatchProbeRun && unsupportedByError) {
                    updateNativeMultiImageCapability(modelId, resolvedConfig, 'unsupported', {
                        detectedBy: 'standard_batch_fallback_error',
                        requestedCount: effectiveImageConcurrency,
                        batchMode: activeImageBatchMode,
                        message: fallbackErrMessage.slice(0, 240)
                    });
                }
                const fallbackHint = isNativeBatchProbeRun
                    ? `原生多图探测失败，已回退并发聚合（${effectiveImageConcurrency} 张）`
                    : `标准批次失败，已回退并发聚合（${effectiveImageConcurrency} 张）`;
                showToast(fallbackHint, 'warning', 2800);
                setHistory((prev) => prev.map((hItem) => {
                    if (hItem.id !== taskId) return hItem;
                    return attachHistoryThrottleStats({
                        ...hItem,
                        status: 'generating',
                        errorMsg: fallbackHint
                    }, err?.message || '', {
                        retryCountInc: 1,
                        fallbackToParallel: true,
                        touchError: true,
                        dispatchIntervalSec: requestedDispatchIntervalSec,
                        requestedImageCount: effectiveImageConcurrency,
                        imageBatchMode: activeImageBatchMode,
                        lastErrorType: 'standard_batch_fallback'
                    });
                }));
                if (requestedDispatchIntervalMs > 0) {
                    await waitForMilliseconds(requestedDispatchIntervalMs);
                }
                return startGeneration(prompt, type, sourceImages, nodeId, {
                    ...options,
                    _isRetry: false,
                    _skipHistoryInsert: true,
                    _existingTaskId: taskId,
                    _standardBatchFallback: true,
                    _batchImageDispatched: false,
                    _batchAggregate: false,
                    imageBatchMode: IMAGE_BATCH_MODE_PARALLEL_AGGREGATE,
                    imageConcurrency: effectiveImageConcurrency,
                    concurrentImages: effectiveImageConcurrency
                });
            }

            console.error('[CONSOLE_ERROR]', err);
            // V3.5.12：计算执行时长并停止计时器
            const endTime = Date.now();
            const currentItem = history.find(h => h.id === taskId);
            const durationMs = currentItem?.startTime ? endTime - currentItem.startTime : 0;

            // 尝试解析错误信息，提取更友好的错误消息
            let errorMsg = err?.message || '生成失败';
            try {
                // 如果错误信息是 JSON 字符串，尝试解析
                if (typeof errorMsg === 'string' && errorMsg.trim().startsWith('{')) {
                    const errorData = JSON.parse(errorMsg);
                    if (errorData?.error?.message) {
                        errorMsg = errorData.error.message;
                    } else if (errorData?.error) {
                        errorMsg = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
                    } else if (errorData?.message) {
                        errorMsg = errorData.message;
                    }
                }

                // 检查是否是后端服务模块缺失错误，优化错误信息显示
                if (errorMsg.includes('Cannot find module') || errorMsg.includes('octetstream') || errorMsg.includes('MODULE_NOT_FOUND')) {
                    // 检查是否已经包含优化后的错误信息，避免重复
                    if (!errorMsg.includes('即梦API代理服务缺少必要模块') && !errorMsg.includes('❌')) {
                        // 提取原始错误信息（去掉可能的重复前缀）
                        const originalError = errorMsg.replace(/后端服务错误[：:].*?错误详情[：:]/g, '').trim();
                        errorMsg = `❌ 即梦API代理服务缺少必要模块\n\n错误：${originalError} \n\n🔧 解决方案：\n1.停止jimeng - api.exe并重新下载最新版本\n2.或使用Docker：docker pull ghcr.io / iptag / jimeng - api: latest`;
                    } else if (!errorMsg.includes('🔧')) {
                        // 如果已经有基本错误信息但没有解决方案，添加解决方案
                        errorMsg = errorMsg + '\n\n🔧 解决方案：\n1. 停止jimeng-api.exe并重新下载最新版本\n2. 或使用Docker：docker pull ghcr.io/iptag/jimeng-api:latest';
                    }
                }
            } catch (e) {
                // 如果解析失败，使用原始错误信息
                // 但仍然检查是否是模块缺失错误
                if (errorMsg.includes('Cannot find module') || errorMsg.includes('octetstream') || errorMsg.includes('MODULE_NOT_FOUND')) {
                    // 检查是否已经包含优化后的错误信息
                    if (!errorMsg.includes('即梦API代理服务缺少必要模块') && !errorMsg.includes('❌')) {
                        errorMsg = `❌ 即梦API代理服务缺少必要模块\n\n🔧 解决方案：\n1.停止jimeng - api.exe并重新下载最新版本\n2.或使用Docker：docker pull ghcr.io / iptag / jimeng - api: latest`;
                    }
                }
            }
            if (type === 'image') {
                const batchFailure = consumeImageBatchFailure(taskId);
                if (batchFailure) {
                    setHistory((prev) => prev.map((hItem) => {
                        if (hItem.id !== taskId) return hItem;
                        const hasOutput = Array.isArray(hItem.output_images) && hItem.output_images.length > 0;
                        const progress = Math.max(10, Math.min(95, Math.round((batchFailure.settled / batchFailure.total) * 95)));
                        if (!batchFailure.done) {
                            return attachHistoryThrottleStats({
                                ...hItem,
                                status: 'generating',
                                progress: Math.max(hItem.progress || 5, progress),
                                errorMsg: hasOutput ? hItem.errorMsg : errorMsg
                            }, errorMsg, {
                                touchError: true,
                                dispatchIntervalSec: requestedDispatchIntervalSec,
                                requestedImageCount: effectiveImageConcurrency,
                                imageBatchMode: activeImageBatchMode,
                                lastErrorType: 'batch_partial_failure'
                            });
                        }
                        if (hasOutput) {
                            return attachHistoryThrottleStats({
                                ...hItem,
                                status: 'completed',
                                progress: 100
                            }, '', {
                                dispatchIntervalSec: requestedDispatchIntervalSec,
                                requestedImageCount: effectiveImageConcurrency,
                                imageBatchMode: activeImageBatchMode,
                                lastErrorType: ''
                            });
                        }
                        return attachHistoryThrottleStats({
                            ...hItem,
                            status: 'failed',
                            errorMsg,
                            durationMs
                        }, errorMsg, {
                            touchError: true,
                            dispatchIntervalSec: requestedDispatchIntervalSec,
                            requestedImageCount: effectiveImageConcurrency,
                            imageBatchMode: activeImageBatchMode,
                            lastErrorType: 'batch_failed'
                        });
                    }));
                    return;
                }
            }
            // V3.5.12：失败时也传入 durationMs 以停止计时器
            setHistory((prev) => prev.map((hItem) => {
                if (hItem.id !== taskId) return hItem;
                return attachHistoryThrottleStats({
                    ...hItem,
                    status: 'failed',
                    errorMsg,
                    durationMs
                }, errorMsg, {
                    touchError: true,
                    dispatchIntervalSec: requestedDispatchIntervalSec,
                    requestedImageCount: effectiveImageConcurrency,
                    imageBatchMode: activeImageBatchMode,
                    lastErrorType: 'failed'
                });
            }));
        }
    }
