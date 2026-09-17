import {
    IMAGE_BATCH_MODE_PARALLEL_AGGREGATE,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO,
    TRANSPORT_HTTP_JSON,
    DEFAULT_TRANSPORT_OPTIONS,
    normalizeResolutionOption,
    normalizeImageResolution,
    normalizeImageRouteMode,
    normalizeImageBatchMode,
    normalizeNativeMultiImageMode,
    normalizeVideoResolution,
    DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS,
    normalizeValueNotes,
    normalizeResolutionNotes,
    normalizeCustomParams,
    getDefaultRequestTemplateForEntry,
    normalizeImageConcurrency,
    normalizeImageDispatchIntervalSeconds,
    normalizePreviewOverridePatch,
    normalizeRequestTemplate,
    normalizeTransportMode,
    normalizeTransportOptions,
    buildDefaultCapabilitySchema,
    normalizeCapabilitySchema,
    normalizeAsyncConfig,
    normalizeRequestChain,
    normalizeRequestOverridePatch
} from '../freeCanvasShared';

export function resolveApiConfig({
    modelLibraryMap,
}, config) {
        if (!config) return null;
        const libraryEntry = config.libraryId ? modelLibraryMap.get(config.libraryId) : null;
        const resolvedLibrary = libraryEntry || null;
        return {
            ...config,
            modelName: resolvedLibrary?.modelName || config.modelName || config.id,
            displayName: resolvedLibrary?.displayName || config.displayName || config.id,
            type: resolvedLibrary?.type || config.type || 'Chat',
            apiType: resolvedLibrary?.apiType || config.apiType,
            disabled: resolvedLibrary ? !!resolvedLibrary.disabled : !!config.disabled,
            imageRouteMode: normalizeImageRouteMode(
                resolvedLibrary ? resolvedLibrary.imageRouteMode : config.imageRouteMode
            ),
            imageBatchMode: normalizeImageBatchMode(
                resolvedLibrary
                    ? resolvedLibrary.imageBatchMode
                    : (config.imageBatchMode || config.batchMode || config.multiImageMode)
            ),
            nativeMultiImageMode: normalizeNativeMultiImageMode(
                resolvedLibrary
                    ? resolvedLibrary.nativeMultiImageMode
                    : (config.nativeMultiImageMode || config.nativeImageBatchMode || config.nativeMultiOutputMode)
            ),
            ratioLimits: resolvedLibrary ? resolvedLibrary.ratioLimits : (config.ratioLimits || null),
            defaultRatio: resolvedLibrary ? String(resolvedLibrary.defaultRatio || '').trim() : String(config.defaultRatio || '').trim(),
            ratioNotes: resolvedLibrary ? normalizeValueNotes(resolvedLibrary.ratioNotes) : normalizeValueNotes(config.ratioNotes),
            ratioNotesEnabled: resolvedLibrary ? !!resolvedLibrary.ratioNotesEnabled : !!config.ratioNotesEnabled,
            resolutionLimits: resolvedLibrary ? resolvedLibrary.resolutionLimits : (config.resolutionLimits || null),
            defaultResolution: resolvedLibrary
                ? (normalizeResolutionOption(resolvedLibrary.defaultResolution || '') || '')
                : (normalizeResolutionOption(config.defaultResolution || '') || ''),
            defaultImageConcurrency: normalizeImageConcurrency(
                resolvedLibrary
                    ? resolvedLibrary.defaultImageConcurrency
                    : (config.defaultImageConcurrency ?? config.imageConcurrency ?? config.concurrentImages ?? 1)
            ),
            resolutionNotes: resolvedLibrary ? normalizeResolutionNotes(resolvedLibrary.resolutionNotes) : normalizeResolutionNotes(config.resolutionNotes),
            resolutionNotesEnabled: resolvedLibrary ? !!resolvedLibrary.resolutionNotesEnabled : !!config.resolutionNotesEnabled,
            durations: resolvedLibrary ? resolvedLibrary.durations : (config.durations || null),
            defaultDuration: resolvedLibrary
                ? String(resolvedLibrary.defaultDuration || '').trim()
                : String(config.defaultDuration || '').trim(),
            durationNotes: resolvedLibrary ? normalizeValueNotes(resolvedLibrary.durationNotes) : normalizeValueNotes(config.durationNotes),
            durationNotesEnabled: resolvedLibrary ? !!resolvedLibrary.durationNotesEnabled : !!config.durationNotesEnabled,
            videoResolutions: resolvedLibrary ? resolvedLibrary.videoResolutions : (config.videoResolutions || null),
            defaultVideoResolution: resolvedLibrary
                ? (normalizeVideoResolution(resolvedLibrary.defaultVideoResolution || '') || '')
                : (normalizeVideoResolution(config.defaultVideoResolution || '') || ''),
            videoResolutionNotes: resolvedLibrary ? normalizeValueNotes(resolvedLibrary.videoResolutionNotes) : normalizeValueNotes(config.videoResolutionNotes),
            videoResolutionNotesEnabled: resolvedLibrary ? !!resolvedLibrary.videoResolutionNotesEnabled : !!config.videoResolutionNotesEnabled,
            supportsFirstLastFrame: resolvedLibrary ? !!resolvedLibrary.supportsFirstLastFrame : !!config.supportsFirstLastFrame,
            supportsHD: resolvedLibrary ? !!resolvedLibrary.supportsHD : !!config.supportsHD,
            omitRatioOnSubmit: resolvedLibrary ? !!resolvedLibrary.omitRatioOnSubmit : !!config.omitRatioOnSubmit,
            omitResolutionOnSubmit: resolvedLibrary ? !!resolvedLibrary.omitResolutionOnSubmit : !!config.omitResolutionOnSubmit,
            omitDurationOnSubmit: resolvedLibrary ? !!resolvedLibrary.omitDurationOnSubmit : !!config.omitDurationOnSubmit,
            imageDispatchIntervalSec: normalizeImageDispatchIntervalSeconds(
                resolvedLibrary ? resolvedLibrary.imageDispatchIntervalSec : config.imageDispatchIntervalSec,
                DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS
            ),
            customParams: resolvedLibrary ? normalizeCustomParams(resolvedLibrary.customParams) : normalizeCustomParams(config.customParams),
            asyncConfig: normalizeAsyncConfig(resolvedLibrary?.asyncConfig || config.asyncConfig),
            requestChain: normalizeRequestChain(resolvedLibrary?.requestChain || config.requestChain),
            transport: normalizeTransportMode(resolvedLibrary?.transport || config.transport),
            transportOptions: normalizeTransportOptions(resolvedLibrary?.transportOptions || config.transportOptions),
            capabilities: normalizeCapabilitySchema(resolvedLibrary?.capabilities || config.capabilities, resolvedLibrary?.type || config.type),
            previewOverrideEnabled: resolvedLibrary ? !!resolvedLibrary.previewOverrideEnabled : !!config.previewOverrideEnabled,
            previewOverridePatch: normalizePreviewOverridePatch(resolvedLibrary?.previewOverridePatch || config.previewOverridePatch),
            requestTemplate: normalizeRequestTemplate(resolvedLibrary?.requestTemplate || config.requestTemplate),
            requestOverrideEnabled: resolvedLibrary ? !!resolvedLibrary.requestOverrideEnabled : !!config.requestOverrideEnabled,
            requestOverridePatch: normalizeRequestOverridePatch(resolvedLibrary?.requestOverridePatch || config.requestOverridePatch)
        };
    }

export function applyNodeModelSelection({
    getApiConfigByKey,
    getDefaultCustomParamsForModel,
    getNodeRecommendedHeight,
    getPreferredImageResolutionForModel,
    getPreferredModelRatio,
    getPreferredVideoResolutionForModel,
    getRatiosForModel,
    getResolutionsForModel,
    getVideoResolutionsForModel,
    resolveModelKey,
    setNodes,
}, nodeId, nodeType, modelKey) {
        if (!nodeId || !modelKey) return;
        const resolvedModel = resolveModelKey(modelKey);
        if (!resolvedModel) return;
        setNodes((prev) => prev.map((node) => {
            if (node.id !== nodeId) return node;
            const nextSettings = { ...(node.settings || {}), model: resolvedModel };
            if (nodeType === 'gen-image') {
                const ratioOptions = getRatiosForModel(resolvedModel);
                const fallbackRatio = getPreferredModelRatio(resolvedModel, 'image');
                const currentRatio = nextSettings.ratio || '';
                nextSettings.ratio = ratioOptions.includes(currentRatio) ? currentRatio : fallbackRatio;
                const resolutionOptions = getResolutionsForModel(resolvedModel);
                const fallbackResolution = getPreferredImageResolutionForModel(resolvedModel);
                const currentResolution = normalizeImageResolution(nextSettings.resolution || '');
                nextSettings.resolution = resolutionOptions.includes(currentResolution) ? currentResolution : fallbackResolution;
                const imageConfig = getApiConfigByKey(resolvedModel);
                const fallbackImageConcurrency = normalizeImageConcurrency(imageConfig?.defaultImageConcurrency || 1);
                nextSettings.imageConcurrency = fallbackImageConcurrency;
                nextSettings.concurrentImages = fallbackImageConcurrency;
            } else if (nodeType === 'gen-video') {
                const ratioOptions = getRatiosForModel(resolvedModel);
                const fallbackRatio = getPreferredModelRatio(resolvedModel, 'video');
                const currentRatio = nextSettings.ratio || '';
                nextSettings.ratio = ratioOptions.includes(currentRatio) ? currentRatio : fallbackRatio;
                const resolutionOptions = getVideoResolutionsForModel(resolvedModel);
                const fallbackResolution = getPreferredVideoResolutionForModel(resolvedModel);
                const currentResolution = normalizeVideoResolution(nextSettings.resolution || '');
                nextSettings.resolution = resolutionOptions.includes(currentResolution) ? currentResolution : fallbackResolution;
            }
            nextSettings.customParams = getDefaultCustomParamsForModel(
                resolvedModel,
                null,
                { preserveByName: false }
            );
            const recommendedHeight = getNodeRecommendedHeight(nodeType, resolvedModel);
            const currentHeight = Number(node.height) || 0;
            const nextHeight = recommendedHeight > 0 ? Math.max(currentHeight, recommendedHeight) : currentHeight;
            return {
                ...node,
                settings: nextSettings,
                ...(nextHeight !== currentHeight ? { height: nextHeight } : {})
            };
        }));
    }

export function addModelLibraryEntry({
    setCollapsedLibraryModels,
    setEditingLibraryModels,
    setModelLibrary,
}) {
        const newId = `model-${Date.now()}`;
        const entryBase = {
            id: newId,
            displayName: newId,
            modelName: newId,
            type: 'Image',
            disabled: false,
            imageRouteMode: 'auto',
            imageBatchMode: IMAGE_BATCH_MODE_PARALLEL_AGGREGATE,
            nativeMultiImageMode: IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO,
            ratioLimits: null,
            defaultRatio: '',
            ratioNotes: {},
            ratioNotesEnabled: false,
            resolutionLimits: null,
            defaultResolution: '',
            defaultImageConcurrency: 1,
            resolutionNotes: {},
            resolutionNotesEnabled: false,
            durations: null,
            defaultDuration: '',
            durationNotes: {},
            durationNotesEnabled: false,
            videoResolutions: null,
            defaultVideoResolution: '',
            videoResolutionNotes: {},
            videoResolutionNotesEnabled: false,
            supportsFirstLastFrame: false,
            supportsHD: false,
            omitRatioOnSubmit: false,
            omitResolutionOnSubmit: false,
            omitDurationOnSubmit: false,
            imageDispatchIntervalSec: DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS,
            apiType: 'openai',
            customParams: [],
            asyncConfig: null,
            requestChain: null,
            transport: TRANSPORT_HTTP_JSON,
            transportOptions: { ...DEFAULT_TRANSPORT_OPTIONS },
            capabilities: buildDefaultCapabilitySchema('Image'),
            previewOverrideEnabled: false,
            previewOverridePatch: null,
            requestOverrideEnabled: false,
            requestOverridePatch: null
        };
        const newEntry = {
            ...entryBase,
            requestTemplate: getDefaultRequestTemplateForEntry(entryBase)
        };
        setModelLibrary(prev => [...prev, newEntry]);
        setEditingLibraryModels(prev => {
            const next = new Set(prev);
            next.add(newId);
            return next;
        });
        setCollapsedLibraryModels(prev => {
            const next = new Set(prev);
            next.add(newId);
            return next;
        });
    }

export function deleteModelLibraryEntry({
    setApiConfigs,
    setCollapsedLibraryModels,
    setEditingLibraryModels,
    setLibraryPreviewDrafts,
    setLibraryPreviewEditing,
    setLibraryPreviewModels,
    setLibraryRequestChainDrafts,
    setLibraryRequestPreviewDrafts,
    setLibraryRequestPreviewEditing,
    setLibraryRequestTemplateDrafts,
    setLibraryTransportOptionsDrafts,
    setModelLibrary,
}, id) {
        if (!id) return;
        setModelLibrary(prev => prev.filter(entry => entry.id !== id));
        setApiConfigs(prev => prev.map(config => config.libraryId === id ? { ...config, libraryId: null } : config));
        setEditingLibraryModels(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setCollapsedLibraryModels(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setLibraryPreviewModels(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setLibraryPreviewEditing(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setLibraryPreviewDrafts(prev => {
            if (!prev[id]) return prev;
            const { [id]: _removed, ...rest } = prev;
            return rest;
        });
        setLibraryRequestPreviewEditing(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setLibraryRequestPreviewDrafts(prev => {
            if (!prev[id]) return prev;
            const { [id]: _removed, ...rest } = prev;
            return rest;
        });
        setLibraryRequestTemplateDrafts(prev => {
            if (!prev[id]) return prev;
            const { [id]: _removed, ...rest } = prev;
            return rest;
        });
        setLibraryTransportOptionsDrafts(prev => {
            if (!prev[id]) return prev;
            const { [id]: _removed, ...rest } = prev;
            return rest;
        });
        setLibraryRequestChainDrafts(prev => {
            if (!prev[id]) return prev;
            const { [id]: _removed, ...rest } = prev;
            return rest;
        });
    }

export function importApiModelConfigs({
    setApiConfigs,
    showToast,
}, providerKey) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                const rawList = Array.isArray(data)
                    ? data
                    : Array.isArray(data?.models)
                        ? data.models
                        : [data];
                const normalized = rawList
                    .map((item) => {
                        if (!item || typeof item !== 'object') return null;
                        const cleaned = { ...item };
                        delete cleaned._uid;
                        delete cleaned.key;
                        delete cleaned.url;
                        delete cleaned.isCustom;
                        const id = cleaned.id || cleaned.modelName;
                        if (!id) return null;
                        return {
                            ...cleaned,
                            id,
                            provider: providerKey || cleaned.provider,
                            type: cleaned.type || 'Chat',
                            modelName: cleaned.modelName || id,
                            displayName: cleaned.displayName || cleaned.modelName || id,
                            customParams: normalizeCustomParams(cleaned.customParams),
                            _uid: `uid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
                        };
                    })
                    .filter(Boolean);
                if (normalized.length === 0) {
                    showToast('未找到可导入的模型配置', 'warning', 2000);
                    return;
                }
                setApiConfigs(prev => [...prev, ...normalized]);
                showToast(`已导入 ${normalized.length} 个模型`, 'success', 3000);
            } catch (err) {
                showToast(`导入失败: ${err.message}`, 'error', 3000);
            }
        };
        input.click();
    }
