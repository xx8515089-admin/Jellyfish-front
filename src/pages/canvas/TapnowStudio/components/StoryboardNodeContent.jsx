import { Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock,
    Download,
    Edit3,
    Eye,
    FileText,
    FolderOpen,
    Image as ImageIcon,
    Layers,
    LayoutGrid,
    Link as LinkIcon,
    Loader2,
    Maximize2,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    Sparkles,
    Split,
    Square,
    Trash2,
    Users,
    Video,
    X,
    Zap
} from 'lucide-react';
import {
    LazyBase64Image,
    LocalImageManager,
    STORYBOARD_DEFAULT_TABLE_HEADERS,
    STORYBOARD_LLM_PROMPT_MODES,
    STORYBOARD_PROMPT_SLOT_OPTIONS,
    STORYBOARD_TABLE_PROMPT_MODE,
    STORYBOARD_WORKSPACE_DEFAULT_HEIGHT,
    getValueLabelWithNotes,
    isImageModelType,
    isSameShotId,
    makeStoryboardShotFocusKey,
    materializeStoryboardOutputFromSnapshot,
    normalizeImageResolution,
    normalizeStoryboardMode,
    normalizeStoryboardViewMode,
    normalizeStoryboardWorkspaceHeight,
    normalizeVideoResolution,
    parseMarkdownTable,
    isVideoUrl,
    stringifyMarkdownTable,
    t
} from '../freeCanvasShared';

function StoryboardNodeContent({ node, context }) {
    const {
        theme,
        batchQueueItems,
        batchRunningItems,
        batchConcurrency,
        batchTaskCounterRef,
        batchStateRef,
        shotBatchMapRef,
        connections,
        nodesMap,
        activeShot,
        activeDropdown,
        setActiveDropdown,
        hoveredProvider,
        setHoveredProvider,
        groupedApiConfigs,
        apiConfigs,
        localStorage,
        characterLibrary,
        characterReferenceBarExpanded,
        setCharacterReferenceBarExpanded,
        setCharactersOpen,
        updateNodeSettings,
        updateShot,
        deleteShot,
        addEmptyShot,
        generateSingleShot,
        generateSingleImage,
        stopRunningShot,
        removeQueuedBatchItem,
        clearNodeQueue,
        setBatchQueue,
        setBatchGroups,
        setBatchTick,
        setBatchConcurrency,
        saveToUndoStack,
        setNodes,
        setLightboxItem,
        setActiveShot,
        setIsMouseOverStoryboard,
        navigateStoryboardShotByDelta,
        switchStoryboardShotOutputHistory,
        captureStoryboardWorkspaceHeight,
        importStoryboardMarkdownTable,
        importStoryboardTableFromFile,
        pasteStoryboardTableFromClipboard,
        mutateStoryboardTable,
        openStoryboardTableCellEditor,
        runStoryboardTablePromptMerge,
        normalizeStoryboardTableData,
        runStoryboardLlmSplit,
        exportStoryboardPromptSlots,
        importStoryboardPromptSlots,
        getStoryboardPromptTemplate,
        getStoryboardPromptSlotKey,
        getStoryboardPromptMemoryStorageKey,
        getConnectedTextNodes,
        getConnectedVideoInputNode,
        getFirstEnabledModelKey,
        getApiConfigByKey,
        getPreferredModelRatio,
        getPreferredImageResolutionForModel,
        getPreferredVideoResolutionForModel,
        getDefaultDurationForModel,
        getDefaultDurationsForModel,
        getDefaultCustomParamsForModel,
        getRatiosForModel,
        getResolutionsForModel,
        getVideoResolutionsForModel,
        shotTimers,
        getStatusColor,
        resolveModelKey,
        renderCustomParamInputs,
        setLastUsedImageModel,
        setLastUsedVideoModel,
        showToast,
        handlePreviewRightClick,
        handleStoryboardBatchDownload
    } = context;

    // --- 辅助函数：处理单个镜头的粘贴 (Ctrl+V) ---
    const handleShotPaste = (e, shotId) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                e.stopPropagation();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = (ev) => updateShot(node.id, shotId, { image_url: ev.target.result });
                reader.readAsDataURL(blob);
                return;
            }
        }
    };

    // --- 辅助函数：处理单个镜头的拖拽 (Drop) ---
    const handleShotDrop = (e, shotId) => {
        e.preventDefault();
        e.stopPropagation();

        const currentShot = (node.settings?.shots || []).find(s => isSameShotId(s.id, shotId));
        const currentMode = normalizeStoryboardMode(node.settings?.mode);
        const applyDroppedImage = (imageUrl) => {
            if (!imageUrl) return false;
            if (currentMode === 'video') {
                const useLastFrame = currentShot?.useFirstLastFrame && currentShot?.activeInput === 'last';
                const field = useLastFrame ? 'lastFrame' : 'image_url';
                updateShot(node.id, shotId, { [field]: imageUrl, image_filename: '' });
                return true;
            }
            if (currentShot?.useMultiRef) {
                const existingRefs = currentShot.referenceImages && currentShot.referenceImages.length > 0
                    ? currentShot.referenceImages
                    : (currentShot.image_url ? [currentShot.image_url] : []);
                const nextRefs = existingRefs.slice(0, 5);
                if (nextRefs.length < 5) {
                    nextRefs.push(imageUrl);
                } else {
                    nextRefs[0] = imageUrl;
                }
                updateShot(node.id, shotId, { referenceImages: nextRefs, image_url: nextRefs[0] || imageUrl });
                return true;
            }
            updateShot(node.id, shotId, { image_url: imageUrl, image_filename: '', referenceImages: [] });
            return true;
        };

        // 1. 尝试从浏览器外部拖入文件
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => applyDroppedImage(ev.target.result);
                reader.readAsDataURL(file);
                return;
            }
        }

        // 2. 尝试从左侧历史记录拖入 (dataTransfer)
        const rawPayload = e.dataTransfer.getData('application/x-tapnow-history');
        if (rawPayload) {
            try {
                const payload = JSON.parse(rawPayload);
                const dragUrl = payload?.url || payload?.originalUrl || payload?.previewUrl || '';
                if (applyDroppedImage(dragUrl)) return;
            } catch (err) {
                console.warn('[StoryboardDrop] Failed to parse payload', err);
            }
        }

        // 3. 尝试读取 URL 文本 (浏览器内拖拽图片/链接)
        const uriList = e.dataTransfer.getData('text/uri-list') || '';
        const uriCandidate = uriList.split('\n').find(line => line && !line.startsWith('#')) || '';
        const plainText = e.dataTransfer.getData('text/plain') || '';
        const urlCandidate = (uriCandidate || plainText).trim();
        if (urlCandidate && /^(https?:|data:image\/|blob:|file:)/i.test(urlCandidate)) {
            applyDroppedImage(urlCandidate);
        }
    };

    const previewPanelWidth = 220;
    const nodeQueueItems = batchQueueItems.filter(item => item.nodeId === node.id);
    const nodeRunningItems = batchRunningItems.filter(item => item.nodeId === node.id);
    const storyboardMode = normalizeStoryboardMode(node.settings?.mode);
    const storyboardViewMode = normalizeStoryboardViewMode(node.settings?.viewMode);
    const storyboardSegmentTrackClass = theme === 'dark'
        ? 'bg-zinc-800 border border-zinc-700/80'
        : theme === 'solarized'
            ? 'bg-[#fdf6e3] border border-[#d7cfb2]'
            : 'bg-zinc-100 border border-zinc-300';
    const getStoryboardSegmentButtonClass = (active) => {
        if (active) {
            return theme === 'dark'
                ? 'bg-zinc-200 text-zinc-900 shadow-sm'
                : theme === 'solarized'
                    ? 'bg-[#7c6f4f] text-[#fdf6e3] shadow-sm'
                    : 'bg-zinc-700 text-white shadow-sm';
        }
        return theme === 'dark'
            ? 'text-zinc-400 hover:text-zinc-200'
            : theme === 'solarized'
                ? 'text-zinc-600 hover:text-zinc-800'
                : 'text-zinc-500 hover:text-zinc-700';
    };
    const storyboardSegmentButtonBaseClass = 'h-5 px-2.5 rounded-full text-[10px] leading-none font-medium transition-all';
    const storyboardPrimaryButtonClass = theme === 'dark'
        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100 border border-zinc-600'
        : theme === 'solarized'
            ? 'bg-[#7c6f4f] hover:bg-[#6d5f43] text-[#fdf6e3] border border-[#6d5f43]'
            : 'bg-zinc-700 hover:bg-zinc-600 text-white border border-zinc-600';
    const storyboardMutedButtonClass = theme === 'dark'
        ? 'bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-not-allowed'
        : theme === 'solarized'
            ? 'bg-[#fdf6e3] text-zinc-500 border border-[#d7cfb2] cursor-not-allowed'
            : 'bg-zinc-200 text-zinc-500 border border-zinc-300 cursor-not-allowed';

    return (
        <div className="flex h-full">
            <div
                className={`flex flex-col h-full rounded-xl overflow-hidden pointer-events-auto transition-colors flex-1 ${theme === 'dark'
                    ? 'bg-zinc-950 border border-zinc-800'
                    : theme === 'solarized'
                        ? 'bg-[#eee8d5] border border-[#d7cfb2]'
                    : 'bg-white border border-zinc-300 shadow-sm'
                    }`}
                onMouseEnter={() => setIsMouseOverStoryboard(true)}
                onMouseLeave={() => setIsMouseOverStoryboard(false)}
            >
                {/* 头部 */}
                <div className={`px-4 py-3 border-b flex items-center shrink-0 flex-nowrap overflow-x-auto no-scrollbar ${theme === 'dark'
                    ? 'bg-zinc-900 border-zinc-800'
                    : theme === 'solarized'
                        ? 'bg-[#eee8d5] border-[#eee8d5]'
                        : 'bg-zinc-50 border-zinc-200'
                    }`}>
                    <div className="flex items-center gap-1 shrink-0">
                        <LayoutGrid size={16} className="text-purple-500" />
                        <span className={`font-bold text-xs ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>
                            {t('智能分镜')}
                        </span>
                        <span className={`text-xs ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>/</span>
                        {/* V3.7.25: 点击画笔才能编辑，否则可拖动 */}
                        {node.settings?.isEditingTitle ? (
                            <input
                                type="text"
                                value={node.settings?.projectTitle || ''}
                                onChange={(e) => updateNodeSettings(node.id, { projectTitle: e.target.value })}
                                placeholder={t('项目名称')}
                                className={`font-bold text-xs bg-transparent border-b border-blue-500 outline-none w-32 transition-colors ${theme === 'dark' ? 'text-zinc-200 placeholder-zinc-500' : 'text-zinc-800 placeholder-zinc-400'}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter' || e.key === 'Escape') {
                                        updateNodeSettings(node.id, { isEditingTitle: false });
                                    }
                                }}
                                onBlur={() => updateNodeSettings(node.id, { isEditingTitle: false })}
                                autoFocus
                            />
                        ) : (
                            <span
                                className={`font-bold text-xs cursor-move ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'} ${!node.settings?.projectTitle ? (theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400') : ''}`}
                                title={t('拖动移动窗口')}
                            >
                                {node.settings?.projectTitle || '项目名称'}
                            </span>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                updateNodeSettings(node.id, { isEditingTitle: !node.settings?.isEditingTitle });
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`p-0.5 rounded transition-colors ${node.settings?.isEditingTitle
                                ? 'text-blue-500'
                                : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                            title={t('编辑项目名称')}
                        >
                            <Pencil size={12} />
                        </button>
                        {/* V3.6.1: 图片/视频模式切换滑块 */}
                        <div className={`flex items-center ml-2 p-0.5 rounded-full ${storyboardSegmentTrackClass}`}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // V3.7.19: 切换模式时更新所有镜头的模型为对应类型
                                    const newMode = 'image';
                                    const defaultModel = getFirstEnabledModelKey('image');
                                    const currentShots = node.settings?.shots || [];
                                    // 只更新那些使用了错误类型模型的镜头
                                    const updatedShots = currentShots.map(shot => {
                                        const shotConfig = getApiConfigByKey(shot.model);
                                        // 如果当前模型是视频类型，则更新为图片模型
                                        if (!shotConfig || shotConfig.type === 'Video') {
                                            return {
                                                ...shot,
                                                model: defaultModel,
                                                ratio: getPreferredModelRatio(defaultModel, 'image'),
                                                resolution: getPreferredImageResolutionForModel(defaultModel),
                                                duration: undefined,
                                                customParams: getDefaultCustomParamsForModel(defaultModel, null, { preserveByName: false })
                                            };
                                        }
                                        return shot;
                                    });
                                    updateNodeSettings(node.id, { mode: newMode, shots: updatedShots });
                                }}
                                className={`${storyboardSegmentButtonBaseClass} ${getStoryboardSegmentButtonClass(storyboardMode === 'image')}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                title={t('切换到图片生成模式')}
                            >
                                {t('图片')}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // V3.7.19: 切换模式时更新所有镜头的模型为对应类型
                                    const newMode = 'video';
                                    const defaultModel = getFirstEnabledModelKey('video');
                                    const currentShots = node.settings?.shots || [];
                                    // 只更新那些使用了错误类型模型的镜头
                                    const updatedShots = currentShots.map(shot => {
                                        const shotConfig = getApiConfigByKey(shot.model);
                                        // 如果当前模型是图片类型，则更新为视频模型
                                        if (!shotConfig || isImageModelType(shotConfig.type)) {
                                            return {
                                                ...shot,
                                                model: defaultModel,
                                                ratio: getPreferredModelRatio(defaultModel, 'video'),
                                                resolution: getPreferredVideoResolutionForModel(defaultModel),
                                                duration: getDefaultDurationForModel(defaultModel),
                                                customParams: getDefaultCustomParamsForModel(defaultModel, null, { preserveByName: false })
                                            };
                                        }
                                        return shot;
                                    });
                                    updateNodeSettings(node.id, { mode: newMode, shots: updatedShots });
                                }}
                                className={`${storyboardSegmentButtonBaseClass} ${getStoryboardSegmentButtonClass(storyboardMode === 'video')}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                title={t('切换到视频生成模式')}
                            >
                                {t('视频')}
                            </button>
                        </div>
                        <div className={`flex items-center ml-2 p-0.5 rounded-full ${storyboardSegmentTrackClass}`}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    updateNodeSettings(node.id, { viewMode: 'cards' });
                                }}
                                className={`${storyboardSegmentButtonBaseClass} ${getStoryboardSegmentButtonClass(storyboardViewMode === 'cards')}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                title={t('卡片视图')}
                            >
                                {t('卡片')}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const hasTableData = !!(node.settings?.tableData?.headers && node.settings.tableData.headers.length > 0)
                                        || !!parseMarkdownTable(node.settings?.tableMarkdown || '');
                                    if (hasTableData) {
                                        updateNodeSettings(node.id, { viewMode: 'table' });
                                    } else {
                                        const initialTable = { headers: [...STORYBOARD_DEFAULT_TABLE_HEADERS], rows: [] };
                                        updateNodeSettings(node.id, {
                                            viewMode: 'table',
                                            tableData: initialTable,
                                            tableMarkdown: stringifyMarkdownTable(initialTable)
                                        });
                                    }
                                }}
                                className={`${storyboardSegmentButtonBaseClass} ${getStoryboardSegmentButtonClass(storyboardViewMode === 'table')}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                title={t('表格视图')}
                            >
                                {t('表格')}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto relative z-10 shrink-0">
                        {/* V3.5.26：清空按钮移至此处 */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(t('确定要清空所有镜头吗？'))) {
                                    updateNodeSettings(node.id, { shots: [] });
                                }
                            }}
                            className="p-1 hover:bg-red-100 hover:text-red-500 rounded text-zinc-400 transition-colors"
                            title={t('清空所有镜头')}
                        >
                            <Trash2 size={14} />
                        </button>
                        {/* V3.5.18: 拆分脚本按钮 */}
                        <button
                            onClick={() => {
                                const connectedTexts = getConnectedTextNodes(node.id);
                                if (connectedTexts.length > 0) {
                                    // 有上游文本节点，直接拆分导入
                                    const text = connectedTexts.join('\n');
                                    // V3.5.36：更新正则表达式以匹配增强格式
                                    const combinedPattern = /#\s*(\d+)\s*([^#【]*)|【\s*(\d+)\s*】\s*([^#【]*)/g;
                                    const matches = [];
                                    let m;
                                    while ((m = combinedPattern.exec(text)) !== null) {
                                        const num = parseInt(m[1] || m[3]);
                                        const content = (m[2] || m[4] || '').trim();
                                        if (content) matches.push({ num, text: content });
                                    }

                                    // 回退匹配 1.、2. 这类编号
                                    if (matches.length === 0) {
                                        const lines = text.split('\n').filter(l => l.trim());
                                        lines.forEach((line, i) => {
                                            const numMatch = line.match(/^(\d+)[.、\s]+(.*)/);
                                            if (numMatch) matches.push({ num: parseInt(numMatch[1]), text: numMatch[2].trim() });
                                            else matches.push({ num: i + 1, text: line.trim() });
                                        });
                                    }

                                    if (matches.length > 0) {
                                        const existingShots = node.settings?.shots || [];
                                        const mergedShots = [...existingShots];
                                        const mode = normalizeStoryboardMode(node.settings?.mode);
                                        const defaultModel = getFirstEnabledModelKey(mode);
                                        const defaultRatio = getPreferredModelRatio(defaultModel, mode);
                                        const defaultResolution = mode === 'image'
                                            ? getPreferredImageResolutionForModel(defaultModel)
                                            : getPreferredVideoResolutionForModel(defaultModel);
                                        const defaultDuration = mode === 'video' ? getDefaultDurationForModel(defaultModel) : undefined;
                                        matches.forEach((m, i) => {
                                            if (i < existingShots.length) {
                                                mergedShots[i] = { ...mergedShots[i], prompt: m.text, description: m.text };
                                            } else {
                                                mergedShots.push({
                                                    id: Date.now() + Math.random() + i,
                                                    prompt: m.text,
                                                    description: m.text,
                                                    model: defaultModel,
                                                    ratio: defaultRatio,
                                                    resolution: defaultResolution,
                                                    duration: defaultDuration,
                                                    status: 'draft',
                                                    customParams: getDefaultCustomParamsForModel(defaultModel, null, { preserveByName: false }),
                                                    outputEnabled: false,
                                                    selectedImageIndex: -1
                                                });
                                            }
                                        });
                                        updateNodeSettings(node.id, { shots: mergedShots });
                                    } else {
                                        alert(t('未在文本中找到分镜标记 (例如: #1 镜头内容)。请检查上游节点文本格式。'));
                                    }
                                } else {
                                    // 无上游节点，显示手动输入框
                                    updateNodeSettings(node.id, { scriptExpanded: !node.settings?.scriptExpanded });
                                }
                            }}
                            className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${storyboardPrimaryButtonClass}`}
                            onMouseDown={(e) => e.stopPropagation()}
                            title={getConnectedTextNodes(node.id).length > 0 ? t('从上游文本节点导入脚本') : t('展开脚本输入区')}
                        >
                            <FileText size={12} />
                            <span className="whitespace-nowrap">{t('脚本')}</span>
                        </button>
                        {/* V3.5.18: 导入关键帧按钮 */}
                        {(() => {
                            const connectedVideoNode = getConnectedVideoInputNode(node.id);
                            const keyframeCount = connectedVideoNode?.selectedKeyframes?.length || 0;
                            const isTableImportMode = storyboardViewMode === 'table';
                            const canImportImage = !!connectedVideoNode && keyframeCount > 0;
                            const importDisabled = !isTableImportMode && !canImportImage;
                            return (
                                <button
                                    onClick={async () => {
                                        if (isTableImportMode) {
                                            importStoryboardTableFromFile(node.id);
                                            return;
                                        }

                                        if (!canImportImage) {
                                            alert(t('请先连接视频输入节点并选择关键帧'));
                                            return;
                                        }
                                        const keyframes = connectedVideoNode.selectedKeyframes;
                                        const currentShots = node.settings?.shots || [];
                                        const maxLen = Math.max(currentShots.length, keyframes.length);
                                        const mergedShots = Array.from({ length: maxLen }, (_, i) => ({
                                            id: currentShots[i]?.id || `shot-${Date.now()}-${i}`,
                                            ...currentShots[i],
                                            prompt: currentShots[i]?.prompt ?? '',
                                            description: currentShots[i]?.description ?? '',
                                            model: resolveModelKey(currentShots[i]?.model || localStorage.getItem('tapnow_last_video_model') || ''),
                                            image_url: keyframes[i]?.url ?? currentShots[i]?.image_url ?? '',
                                            image_filename: keyframes[i]?.filename || currentShots[i]?.image_filename || '',
                                            status: currentShots[i]?.status || 'draft'
                                        }));
                                        saveToUndoStack();

                                        // V3.7.6：使用 LocalImageManager 兼容 file:// URL 和 IndexedDB ID（img_*）
                                        if (LocalImageManager) {
                                            for (let s of mergedShots) {
                                                const needsResolve = s.image_url && (s.image_url.startsWith('file://') || s.image_url.startsWith('img_'));
                                                if (needsResolve) {
                                                    // img_* ID 直接使用原 ID；file:// 地址则使用 imgId 或文件名
                                                    const idOrFilename = s.image_url.startsWith('img_')
                                                        ? s.image_url
                                                        : (s.imgId || s.image_filename);
                                                    if (idOrFilename) {
                                                        try {
                                                            const blob = await LocalImageManager.getImage(idOrFilename);
                                                            if (blob) s.image_url = URL.createObjectURL(blob);
                                                        } catch (e) { console.error('[KeyframeImport] Failed to load local image:', idOrFilename, e); }
                                                    }
                                                }
                                            }
                                        }
                                        updateNodeSettings(node.id, { shots: mergedShots });
                                    }}
                                    className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${importDisabled ? storyboardMutedButtonClass : storyboardPrimaryButtonClass}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    disabled={importDisabled}
                                    title={isTableImportMode
                                        ? t('导入表格文件')
                                        : canImportImage
                                        ? `${t('导入')} ${keyframeCount} ${t('张关键帧')}`
                                        : t('请先连接视频输入节点并选择关键帧')}
                                >
                                    {isTableImportMode ? <LayoutGrid size={12} /> : <ImageIcon size={12} />}
                                    <span className="whitespace-nowrap">{t('导入')}</span>
                                </button>
                            );
                        })()}
                        {/* V3.7.25: 同步参数按钮 - 从前置节点同步配置 */}
                        {(() => {
                            const currentMode = normalizeStoryboardMode(node.settings?.mode);
                            // 查找连接到当前分镜的匹配类型节点
                            const connectedGenNode = connections
                                .filter(c => c.to === node.id)
                                .map(c => nodesMap.get(c.from))
                                .find(n => n && (
                                    (currentMode === 'image' && n.type === 'gen-image') ||
                                    (currentMode === 'video' && n.type === 'gen-video')
                                ));
                            if (!connectedGenNode) return null;
                            const sourceSettings = connectedGenNode.settings || {};
                            return (
                                <button
                                    onClick={() => {
                                        const currentShots = node.settings?.shots || [];
                                        if (currentShots.length === 0) {
                                            updateNodeSettings(node.id, { errorMsg: '请先拆分脚本' });
                                            return;
                                        }
                                        saveToUndoStack();
                                        const syncedShots = currentShots.map(shot => ({
                                            ...shot,
                                            model: sourceSettings.model || shot.model,
                                            ratio: sourceSettings.ratio || shot.ratio,
                                            resolution: sourceSettings.resolution || shot.resolution,
                                            duration: sourceSettings.duration || shot.duration,
                                            customParams: sourceSettings.customParams || shot.customParams
                                        }));
                                        updateNodeSettings(node.id, { shots: syncedShots });
                                        // V3.7.29：显示同步参数通知
                                        showToast(`✓ 已同步 ${syncedShots.length} 个镜头参数 | ${sourceSettings.model || '?'} / ${sourceSettings.ratio || '?'}`, 'success', 5000);
                                    }}
                                    className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${storyboardPrimaryButtonClass}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    title={`从 ${currentMode === 'image' ? '图片' : '视频'}节点同步: ${sourceSettings.model || '?'} / ${sourceSettings.ratio || '?'} / ${sourceSettings.resolution || '?'}${currentMode === 'video' ? ` / ${sourceSettings.duration || '?'}` : ''}`}
                                >
                                    <RefreshCw size={12} />
                                    <span className="whitespace-nowrap">{t('参数')}</span>
                                </button>
                            );
                        })()}
                        {/* V3.5.24：批量生成 */}
                        <div className={`flex items-center gap-1 border-l pl-2 ml-1 ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'}`}>
                            <input
                                type="number"
                                min="0"
                                max="20"
                                value={batchConcurrency}
                                onChange={(e) => setBatchConcurrency(Math.max(0, parseInt(e.target.value) || 0))}
                                className={`w-8 text-center text-xs rounded border outline-none py-0.5 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300'}`}
                                title={t('并发数量 (0=全部)')}
                            />
                            <button
                                onClick={() => {
                                    const mode = normalizeStoryboardMode(node.settings?.mode);
                                    const allShots = node.settings?.shots || [];

                                    // V3.7.27: 检测是否有卡住的 generating 镜头
                                    const stuckGenerating = allShots.filter(s => s.status === 'generating');
                                    if (stuckGenerating.length > 0) {
                                        // V3.7.29: 使用 prompt 实现三选项（确定=终止/取消=跳过/空=放弃）
                                        const userChoice = prompt(
                                            `检测到 ${stuckGenerating.length} 个镜头正在生成中。\n\n` +
                                            `可能是任务卡住或等待中。\n\n` +
                                            `请选择操作：\n` +
                                            `● 输入 "1" 或 "ok" = 强制终止并重新开始\n` +
                                            `● 输入 "2" 或 "skip" = 跳过这些镜头，继续其余\n` +
                                            `● 点击取消或留空 = 放弃操作`,
                                            ''
                                        );

                                        if (userChoice === null || userChoice.trim() === '') {
                                            // 放弃操作
                                            return;
                                        }

                                        const choice = userChoice.trim().toLowerCase();
                                        if (choice === '1' || choice === 'ok' || choice === '确定') {
                                            // 强制重置为 failed，并准备重新开始
                                            stuckGenerating.forEach(s => {
                                                // V3.7.29: 立即视觉上重置为 pending，因为要重新加入队列
                                                updateShot(node.id, s.id, { status: 'pending', errorMsg: '' });

                                                // 手动修改当前快照中的状态，以便通过下方的过滤器
                                                s.status = 'pending';
                                            });
                                        }
                                        // choice === '2' 或其他 = 跳过，保持 generating 状态（会被下方过滤器排除）
                                    }

                                    // 1. 第一轮：查找尚未完成的镜头
                                    // V3.7.29: 这里 stuckGenerating 如果被重置为 pending，就会被包含进来
                                    // V3.8: 也要跳过已锁定的镜头 (outputEnabled=true)
                                    let targetShots = allShots.filter(s => s.status !== 'done' && s.status !== 'generating' && !s.outputEnabled);
                                    let isReroll = false;

                                    // 2. 第二轮：若已全部完成，则检查需要重新生成的未锁定镜头
                                    if (targetShots.length === 0) {
                                        // 筛选条件：未锁定（outputEnabled == false）且状态为 done
                                        targetShots = allShots.filter(s => !s.outputEnabled && s.status === 'done');

                                        if (targetShots.length === 0) {
                                            const isAllLocked = allShots.every(s => s.outputEnabled);
                                            const hasGenerating = allShots.some(s => s.status === 'generating');
                                            if (hasGenerating) {
                                                alert(t('有镜头正在生成中，请等待完成后再试。'));
                                            } else if (isAllLocked && allShots.length > 0) {
                                                alert('所有镜头已锁定（灰框已勾选），无法重新生成。\n请取消勾选需要重新生成的镜头。');
                                            } else {
                                                alert(t('没有待生成的镜头'));
                                            }
                                            return;
                                        }
                                        isReroll = true;
                                    }

                                    // 重新生成前请求确认
                                    if (isReroll) {
                                        const confirmMsg = `所有镜头已生成完毕。\n\n即将对 ${targetShots.length} 个未锁定（灰框未勾选）的镜头进行重新生成。\n\n● 继续批量生成会覆盖原有输出但是资产在左侧可以查看\n● 已锁定（灰框勾选）的镜头将保持不变\n\n是否继续？`;
                                        if (!confirm(confirmMsg)) return;
                                    }

                                    // V3.8: 记录批次分组与任务编号
                                    const totalCount = targetShots.length;
                                    const batchConcurrencyValue = batchConcurrency === 0 ? totalCount : Math.max(1, batchConcurrency);
                                    const taskIndex = (batchTaskCounterRef.current.get(node.id) || 0) + 1;
                                    batchTaskCounterRef.current.set(node.id, taskIndex);
                                    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                                    const shotIds = targetShots.map(s => s.id);
                                    shotIds.forEach((shotId, idx) => {
                                        shotBatchMapRef.current.set(`${node.id}:${shotId}`, {
                                            batchId,
                                            batchOrder: idx,
                                            taskIndex
                                        });
                                    });
                                    setBatchGroups(prev => [
                                        ...prev,
                                        {
                                            id: batchId,
                                            nodeId: node.id,
                                            projectTitle: node.settings?.projectTitle || '未命名分镜',
                                            total: totalCount,
                                            concurrency: batchConcurrencyValue,
                                            createdAt: Date.now(),
                                            mode,
                                            taskIndex,
                                            shotIds
                                        }
                                    ]);

                                    // V3.7.5: 统一图片和视频模式的队列管理
                                    const newQueueItems = targetShots.map((s, idx) => ({
                                        nodeId: node.id,
                                        shotId: s.id,
                                        retryCount: 0,
                                        mode: mode,
                                        batchId,
                                        batchOrder: idx,
                                        batchConcurrency: batchConcurrencyValue,
                                        taskIndex
                                    }));
                                    setBatchQueue(prev => [...prev, ...newQueueItems]);

                                    // V3.7.29: 强制重置状态机，防止 cooling/running 状态阻塞
                                    if (batchStateRef.current !== 'running') {
                                        batchStateRef.current = 'idle';
                                    }
                                    // V3.7.28: 手动触发队列处理器
                                    setBatchTick(t => t + 1);

                                    showToast(`✓ 已添加 ${newQueueItems.length} 个${mode === 'image' ? '图片' : '视频'}任务 | 线程: ${batchConcurrency === 0 ? '∞' : batchConcurrency}${isReroll ? ' (重新生成)' : ''}`, 'success', 5000);
                                }}
                                className={`p-1 rounded transition-colors ${storyboardPrimaryButtonClass}`}
                                title={`批量全部生成${(normalizeStoryboardMode(node.settings?.mode)) === 'image' ? '图片' : '视频'}`}
                            >
                                <div className="flex items-center gap-1">
                                    {(normalizeStoryboardMode(node.settings?.mode)) === 'image' ? <ImageIcon size={12} /> : <Zap size={12} fill="currentColor" />}
                                    <span className="text-[10px] font-medium whitespace-nowrap">{t('批量')}</span>
                                </div>
                            </button>
                            {/* V3.8: 批量下载按钮（全部/选中） */}
                            <div className="relative">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'storyboard-download'
                                            ? null
                                            : {
                                                nodeId: node.id,
                                                type: 'storyboard-download',
                                                anchor: {
                                                    top: rect.top,
                                                    left: rect.left,
                                                    right: rect.right,
                                                    bottom: rect.bottom,
                                                    width: rect.width,
                                                    height: rect.height
                                                }
                                            });
                                    }}
                                    className={`p-1 rounded transition-colors flex items-center gap-0.5 ${theme === 'dark' ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-600'}`}
                                    title={t('批量下载')}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <Download size={12} />
                                    <ChevronDown size={10} />
                                </button>
                                {activeDropdown?.nodeId === node.id && activeDropdown.type === 'storyboard-download' && activeDropdown.anchor && createPortal(
                                    <div
                                        className={`jellyfish-canvas-runtime theme-${theme} fixed mt-1 w-32 rounded-lg shadow-xl py-1 z-[9999] border ${theme === 'dark'
                                            ? 'bg-[#18181b] border-zinc-700'
                                            : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                            }`}
                                        style={{
                                            top: activeDropdown.anchor.bottom + 6,
                                            left: activeDropdown.anchor.right,
                                            transform: 'translateX(-100%)'
                                        }}
                                        onMouseLeave={() => setActiveDropdown(null)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            onClick={() => {
                                                setActiveDropdown(null);
                                                handleStoryboardBatchDownload(node, 'all');
                                            }}
                                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${theme === 'dark'
                                                ? 'text-zinc-300 hover:bg-zinc-800'
                                                : 'text-zinc-700 hover:bg-zinc-100'
                                                }`}
                                        >
                                            全部下载
                                        </button>
                                        <button
                                            onClick={() => {
                                                setActiveDropdown(null);
                                                handleStoryboardBatchDownload(node, 'selected');
                                            }}
                                            className={`w-full text-left px-3 py-2 text-xs transition-colors ${theme === 'dark'
                                                ? 'text-zinc-300 hover:bg-zinc-800'
                                                : 'text-zinc-700 hover:bg-zinc-100'
                                                }`}
                                        >
                                            选中下载
                                        </button>
                                    </div>,
                                    document.body
                                )}
                            </div>
                            {/* V3.8: 批量队列可视化 */}
                            <div className="relative">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'batch-queue'
                                            ? null
                                            : {
                                                nodeId: node.id,
                                                type: 'batch-queue',
                                                anchor: {
                                                    top: rect.top,
                                                    left: rect.left,
                                                    right: rect.right,
                                                    bottom: rect.bottom,
                                                    width: rect.width,
                                                    height: rect.height
                                                }
                                            });
                                    }}
                                    className={`p-1 rounded transition-colors relative ${theme === 'dark'
                                        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                                        : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-600'}`}
                                    title={`队列：运行 ${nodeRunningItems.length} | 排队 ${nodeQueueItems.length}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <Layers size={12} />
                                    {nodeQueueItems.length > 0 && (
                                        <span className={`absolute -top-1 -right-1 text-[8px] px-1 rounded-full ${theme === 'dark'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-blue-600 text-white'}`}>
                                            {nodeQueueItems.length}
                                        </span>
                                    )}
                                </button>
                                {activeDropdown?.nodeId === node.id && activeDropdown.type === 'batch-queue' && activeDropdown.anchor && createPortal(
                                    <div
                                        className={`jellyfish-canvas-runtime theme-${theme} fixed mt-1 w-64 rounded-lg shadow-xl py-2 z-[9999] border ${theme === 'dark'
                                            ? 'bg-[#18181b] border-zinc-700'
                                            : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                            }`}
                                        style={{
                                            top: activeDropdown.anchor.bottom + 6,
                                            left: activeDropdown.anchor.right,
                                            transform: 'translateX(-100%)'
                                        }}
                                        onMouseLeave={() => setActiveDropdown(null)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <div className={`px-3 pb-2 text-[10px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                            运行 {nodeRunningItems.length} · 排队 {nodeQueueItems.length}
                                        </div>
                                        <div className="px-3 pb-2 flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setActiveDropdown(null);
                                                    if (nodeQueueItems.length === 0) return;
                                                    if (confirm(t('确定清空排队任务吗？'))) clearNodeQueue(node.id, false);
                                                }}
                                                className={`text-[10px] px-2 py-1 rounded ${theme === 'dark'
                                                    ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                                            >
                                                {t('清空排队')}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setActiveDropdown(null);
                                                    if (nodeRunningItems.length === 0 && nodeQueueItems.length === 0) return;
                                                    if (confirm(t('确定终止当前节点所有生成并清空队列吗？'))) clearNodeQueue(node.id, true);
                                                }}
                                                className={`text-[10px] px-2 py-1 rounded ${theme === 'dark'
                                                    ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
                                                    : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                                            >
                                                {t('终止全部')}
                                            </button>
                                        </div>
                                        {nodeRunningItems.length > 0 && (
                                            <div className="px-3 pb-2">
                                                <div className={`text-[10px] mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>运行中</div>
                                                <div className="space-y-1">
                                                    {nodeRunningItems.slice(0, 6).map((item, idx) => (
                                                        <div key={`${item.nodeId}-${item.shotId}-${idx}`} className={`text-[10px] flex items-center justify-between gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                            <span className="truncate max-w-[150px]">{item.projectTitle} · 镜头{item.sceneIndex}</span>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className="text-green-500">{t('运行')}</span>
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm(t('确定终止该生成任务吗？'))) stopRunningShot(item.nodeId, item.shotId);
                                                                    }}
                                                                    className={`p-0.5 rounded ${theme === 'dark'
                                                                        ? 'text-zinc-500 hover:text-red-300'
                                                                        : 'text-zinc-400 hover:text-red-500'}`}
                                                                    title={t('终止任务')}
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {nodeRunningItems.length > 6 && (
                                                        <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>仅显示前 6 项</div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <div className="px-3">
                                            <div className={`text-[10px] mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>排队中</div>
                                            {nodeQueueItems.length === 0 ? (
                                                <div className={`text-[10px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>队列为空</div>
                                            ) : (
                                                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                                    {nodeQueueItems.slice(0, 12).map((item) => (
                                                        <div key={`${item.nodeId}-${item.shotId}-${item.order}`} className={`text-[10px] flex items-center justify-between gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                                            <span className="truncate max-w-[150px]">#{item.order} {item.projectTitle} · 镜头{item.sceneIndex}</span>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className="text-blue-400">{item.mode === 'image' ? '图' : '视'}</span>
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm(t('确定移除该排队任务吗？'))) removeQueuedBatchItem(item.nodeId, item.shotId);
                                                                    }}
                                                                    className={`p-0.5 rounded ${theme === 'dark'
                                                                        ? 'text-zinc-500 hover:text-red-300'
                                                                        : 'text-zinc-400 hover:text-red-500'}`}
                                                                    title={t('移除任务')}
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {nodeQueueItems.length > 12 && (
                                                        <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>仅显示前 12 项</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                            {/* V3.6.1: 预览展开按钮 */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setNodes(prev => prev.map(n => {
                                        if (n.id === node.id) {
                                            const isShowing = n.settings?.showOutputPreview;
                                            // 展开时增加宽度，收起时减少宽度
                                            // 默认增加预览列宽度
                                            const newWidth = isShowing ? Math.max(380, n.width - previewPanelWidth) : n.width + previewPanelWidth;
                                            return {
                                                ...n,
                                                width: newWidth,
                                                settings: { ...n.settings, showOutputPreview: !isShowing }
                                            };
                                        }
                                        return n;
                                    }));
                                }}
                                className={`p-1 rounded transition-colors ${node.settings?.showOutputPreview
                                    ? 'bg-blue-500 text-white'
                                    : theme === 'dark' ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-400' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-500'}`}
                                title={node.settings?.showOutputPreview ? '收起输出预览' : '展开输出预览'}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <ChevronRight size={12} className={`transition-transform ${node.settings?.showOutputPreview ? 'rotate-90' : ''}`} />
                            </button>
                        </div>
                        {/* V3.7.18: 预览面板标题栏 - 独立区域 */}
                        {node.settings?.showOutputPreview && (
                            <div
                                className={`shrink-0 flex items-center justify-center gap-2 ml-1 ${theme === 'dark' ? '' : ''}`}
                                style={{ width: previewPanelWidth }}
                            >
                            {(normalizeStoryboardMode(node.settings?.mode)) === 'image' ? (
                                <>
                                    {/* 图片模式: 两个按钮 */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const shots = node.settings?.shots || [];
                                            const allEnabled = shots.length > 0 && shots.every(s => s.outputEnabled);
                                            updateNodeSettings(node.id, { shots: shots.map(s => ({ ...s, outputEnabled: !allEnabled })) });
                                        }}
                                        className={`text-[10px] px-2 py-1 rounded transition-colors whitespace-nowrap ${theme === 'dark' ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-600'}`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        title={t('全选/取消锁定（灰框勾选的不参与批量生成）')}
                                    >
                                        {(node.settings?.shots || []).every(s => s.outputEnabled) ? t('取消') : t('全选')}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const shots = node.settings?.shots || [];
                                            const hasSelectable = shots.some(s => (Array.isArray(s.output_images) && s.output_images.length > 0) || s.output_url);
                                            const anySelected = shots.some(s => s.selectedImageIndex >= 0 && ((Array.isArray(s.output_images) && s.output_images.length > 0) || s.output_url));
                                            const shouldSelect = hasSelectable && !anySelected;
                                            updateNodeSettings(node.id, {
                                                shots: shots.map(s => ({
                                                    ...s,
                                                    selectedImageIndex: s.outputEnabled
                                                        ? s.selectedImageIndex
                                                        : (shouldSelect
                                                            ? (((Array.isArray(s.output_images) && s.output_images.length > 0) || s.output_url)
                                                                ? (Number.isInteger(s.selectedImageIndex) && s.selectedImageIndex >= 0 ? s.selectedImageIndex : 0)
                                                                : -1)
                                                            : -1)
                                                }))
                                            });
                                        }}
                                        className={`text-[10px] px-2 py-1 rounded transition-colors flex items-center gap-1 whitespace-nowrap ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-500 hover:bg-blue-400 text-white'}`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        title={t('暂定=全选输出（选中所有图片），重选=取消全部')}
                                    >
                                        <ImageIcon size={10} />
                                        <span>{(node.settings?.shots || []).some(s => s.selectedImageIndex >= 0) ? t('重选') : t('暂定')}</span>
                                    </button>
                                </>
                            ) : (
                                /* 视频模式: 单个全选按钮 */
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const shots = node.settings?.shots || [];
                                        const allEnabled = shots.length > 0 && shots.every(s => s.outputEnabled);
                                        updateNodeSettings(node.id, { shots: shots.map(s => ({ ...s, outputEnabled: !allEnabled })) });
                                    }}
                                    className={`text-[10px] px-2 py-1 rounded transition-colors whitespace-nowrap ${theme === 'dark' ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-600'}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    title={t('全选/取消锁定')}
                                >
                                    {(node.settings?.shots || []).every(s => s.outputEnabled) ? t('取消') : t('全选')}
                                </button>
                            )}
                            </div>
                        )}
                    </div>
                </div>

                {/* V3.5.17：剧本拆分器的手动输入区，V3.5.24 已移除横幅 */}
                {
                    node.settings?.scriptExpanded && (
                        <div className={`border-b shrink-0 p-3 space-y-2 ${theme === 'dark'
                            ? 'bg-zinc-900/30 border-zinc-800'
                            : theme === 'solarized'
                                ? 'bg-[#fdf6e3] border-[#d7cfb2]'
                                : 'bg-zinc-50/50 border-zinc-200'
                            }`}>
                            <textarea
                                value={node.settings?.scriptText || ''}
                                onChange={(e) => updateNodeSettings(node.id, { scriptText: e.target.value })}
                                placeholder={t('程序拆分格式： # 1  第一个镜头描述 # 2 第二个镜头描述 或者直接描述换行也可识别')}
                                maxLength={10000}
                                className={`w-full min-h-[6rem] max-h-[18rem] p-2 text-xs rounded border resize-y overflow-y-auto custom-scrollbar ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'}`}
                                style={{ height: `${normalizeStoryboardWorkspaceHeight(node.settings?.llmWorkspaceHeight, STORYBOARD_WORKSPACE_DEFAULT_HEIGHT)}px` }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onMouseUp={(e) => captureStoryboardWorkspaceHeight(node.id, e)}
                                onBlur={(e) => captureStoryboardWorkspaceHeight(node.id, e)}
                                onWheel={(e) => { e.stopPropagation(); }}
                            />
                            <div className="text-right text-[10px] text-zinc-500">
                                {(node.settings?.scriptText || '').length}/10,000
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => {
                                        // V3.5.17 修复：使用 getConnectedTextNodes 辅助函数
                                        const connectedTexts = getConnectedTextNodes(node.id);
                                        const connectedText = connectedTexts.join('\n');
                                        const internalText = node.settings?.scriptText || '';
                                        const text = connectedText || internalText;
                                        const mode = normalizeStoryboardMode(node.settings?.mode);
                                        const defaultModel = getFirstEnabledModelKey(mode);
                                        const defaultRatio = getPreferredModelRatio(defaultModel, mode);
                                        const defaultResolution = mode === 'image'
                                            ? getPreferredImageResolutionForModel(defaultModel)
                                            : getPreferredVideoResolutionForModel(defaultModel);
                                        const defaultDuration = mode === 'video' ? getDefaultDurationForModel(defaultModel) : undefined;
                                        const defaultCustomParams = getDefaultCustomParamsForModel(defaultModel, null, { preserveByName: false });

                                        const matches = [];
                                        // 增强拆分格式：#1、【1】或 1.
                                        const combinedPattern = /#\s*(\d+)\s*([^#【]*)|【\s*(\d+)\s*】\s*([^#【]*)/g;
                                        let m;
                                        while ((m = combinedPattern.exec(text)) !== null) {
                                            const num = parseInt(m[1] || m[3]);
                                            const content = (m[2] || m[4] || '').trim();
                                            if (content) {
                                                matches.push({ num, text: content });
                                            }
                                        }

                                        // 若结果仍为空，则尝试匹配 1.、2. 这类数字前缀
                                        if (matches.length === 0) {
                                            const lines = text.split('\n').filter(l => l.trim());
                                            lines.forEach((line, i) => {
                                                const numMatch = line.match(/^(\d+)[.、\s]+(.*)/);
                                                if (numMatch) {
                                                    matches.push({ num: parseInt(numMatch[1]), text: numMatch[2].trim() });
                                                } else {
                                                    matches.push({ num: i + 1, text: line.trim() });
                                                }
                                            });
                                        }

                                        if (matches.length === 0) {
                                            alert(t('未检测到有效分镜。请使用格式: #1 描述 #2 描述'));
                                            return;
                                        }

                                        // 按编号排序并创建镜头
                                        matches.sort((a, b) => a.num - b.num);

                                        // V3.5.19：智能合并逻辑，尽可能更新现有镜头
                                        const existingShots = node.settings?.shots || [];
                                        const mergedShots = [...existingShots];

                                        matches.forEach((m, i) => {
                                            if (i < existingShots.length) {
                                                // 仅更新现有镜头的文本
                                                mergedShots[i] = {
                                                    ...mergedShots[i],
                                                    prompt: m.text,
                                                    description: m.text
                                                };
                                            } else {
                                                // 创建新镜头
                                                mergedShots.push({
                                                    id: Date.now() + Math.random() + i,
                                                    prompt: m.text,
                                                    description: m.text,
                                                    model: defaultModel,
                                                    ratio: defaultRatio,
                                                    resolution: defaultResolution,
                                                    duration: defaultDuration,
                                                    customParams: { ...defaultCustomParams },
                                                    status: 'draft',
                                                    outputEnabled: false,
                                                    selectedImageIndex: -1
                                                });
                                            }
                                        });

                                        updateNodeSettings(node.id, {
                                            shots: mergedShots,
                                            scriptExpanded: false // 拆分后折叠
                                        });
                                    }}
                                    className={`px-3 py-1.5 text-xs rounded transition-colors ${node.settings?.showLlmPromptEditor
                                        ? (theme === 'dark'
                                            ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                            : theme === 'solarized'
                                                ? 'bg-[#fdf6e3] text-zinc-600 hover:bg-[#eee8d5]'
                                                : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300')
                                        : storyboardPrimaryButtonClass}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {t('程序拆分')}
                                </button>
                                {(() => {
                                    const llmPromptMode = STORYBOARD_LLM_PROMPT_MODES.includes(node.settings?.llmPromptMode)
                                        ? node.settings.llmPromptMode
                                        : 'script';
                                    const isPromptEditorMode = !!node.settings?.showLlmPromptEditor;
                                    const isTablePromptEditorMode = isPromptEditorMode && llmPromptMode === STORYBOARD_TABLE_PROMPT_MODE;
                                    const workspaceHeight = normalizeStoryboardWorkspaceHeight(node.settings?.llmWorkspaceHeight, STORYBOARD_WORKSPACE_DEFAULT_HEIGHT);
                                    const activePromptText = getStoryboardPromptTemplate(llmPromptMode, node.settings || {});
                                    const activePromptSlot = getStoryboardPromptSlotKey(llmPromptMode, node.settings || {});
                                    const activeSlotConfig = STORYBOARD_PROMPT_SLOT_OPTIONS.find((item) => item.key === activePromptSlot) || STORYBOARD_PROMPT_SLOT_OPTIONS[0];
                                    const currentPromptSlots = node.settings?.llmPromptSlots && typeof node.settings.llmPromptSlots === 'object'
                                        ? node.settings.llmPromptSlots
                                        : {};
                                    const activeMemoryKey = getStoryboardPromptMemoryStorageKey(llmPromptMode, activePromptSlot);
                                    const editorPromptValue = activeSlotConfig.editable
                                        ? String(currentPromptSlots[activeMemoryKey] || (llmPromptMode === 'custom'
                                            ? (node.settings?.llmSplitPromptCustom || node.settings?.llmSplitPrompt || '')
                                            : ''))
                                        : activePromptText;
                                    const getLlmTabClass = (mode) => {
                                        const isActive = llmPromptMode === mode;
                                        if (isPromptEditorMode) {
                                            if (isActive) {
                                                return theme === 'dark'
                                                    ? 'bg-zinc-200 text-zinc-900'
                                                    : theme === 'solarized'
                                                        ? 'bg-[#7c6f4f] text-[#fdf6e3]'
                                                        : 'bg-zinc-700 text-white';
                                            }
                                            return theme === 'dark'
                                                ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                : theme === 'solarized'
                                                    ? 'bg-[#fdf6e3] text-zinc-600 hover:bg-[#eee8d5]'
                                                    : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300';
                                        }
                                        return theme === 'dark'
                                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                            : theme === 'solarized'
                                                ? 'bg-[#fdf6e3] text-zinc-700 hover:bg-[#eee8d5]'
                                                : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300';
                                    };
                                    const onLlmTabClick = (mode) => {
                                        if (isPromptEditorMode) {
                                            updateNodeSettings(node.id, { llmPromptMode: mode });
                                            return;
                                        }
                                        runStoryboardLlmSplit(node.id, mode);
                                    };
                                    const onPromptSlotClick = (slotKey) => {
                                        const currentSelection = node.settings?.llmPromptSlotSelection && typeof node.settings.llmPromptSlotSelection === 'object'
                                            ? node.settings.llmPromptSlotSelection
                                            : {};
                                        updateNodeSettings(node.id, {
                                            llmPromptSlotSelection: {
                                                ...currentSelection,
                                                [llmPromptMode]: slotKey
                                            }
                                        });
                                    };
                                    return (
                                        <>
                                            <button
                                                onClick={() => onLlmTabClick('script')}
                                                className={`px-2 py-1.5 text-xs rounded transition-colors flex items-center gap-1 ${getLlmTabClass('script')}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                disabled={node.settings?.isGenerating && !isPromptEditorMode}
                                                title={t('LLM 拆脚本')}
                                            >
                                                <Sparkles size={12} />
                                                {node.settings?.isGenerating && !isPromptEditorMode && llmPromptMode === 'script' ? '拆分中...' : 'LLM拆脚本'}
                                            </button>
                                            <button
                                                onClick={() => onLlmTabClick('novel')}
                                                className={`px-2 py-1.5 text-xs rounded transition-colors flex items-center gap-1 ${getLlmTabClass('novel')}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                disabled={node.settings?.isGenerating && !isPromptEditorMode}
                                                title={t('LLM 拆小说')}
                                            >
                                                <Sparkles size={12} />
                                                {node.settings?.isGenerating && !isPromptEditorMode && llmPromptMode === 'novel' ? '拆分中...' : 'LLM拆小说'}
                                            </button>
                                            <button
                                                onClick={() => onLlmTabClick('custom')}
                                                className={`px-2 py-1.5 text-xs rounded transition-colors flex items-center gap-1 ${getLlmTabClass('custom')}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                disabled={node.settings?.isGenerating && !isPromptEditorMode}
                                                title={t('LLM 自定义')}
                                            >
                                                <Sparkles size={12} />
                                                {node.settings?.isGenerating && !isPromptEditorMode && llmPromptMode === 'custom' ? '拆分中...' : 'LLM自定义'}
                                            </button>
                                            <button
                                                onClick={() => updateNodeSettings(node.id, { showLlmPromptEditor: !isPromptEditorMode })}
                                                className={`p-1.5 text-xs rounded transition-colors ${isPromptEditorMode
                                                    ? (theme === 'dark'
                                                        ? 'bg-zinc-200 text-zinc-900'
                                                        : theme === 'solarized'
                                                            ? 'bg-[#7c6f4f] text-[#fdf6e3]'
                                                            : 'bg-zinc-700 text-white')
                                                    : theme === 'dark'
                                                        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                                                        : theme === 'solarized'
                                                            ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700'
                                                            : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title={t('编辑 LLM Prompt')}
                                            >
                                                <Edit3 size={12} />
                                            </button>
                                            <button
                                                onClick={() => updateNodeSettings(node.id, {
                                                    llmPromptMode: STORYBOARD_TABLE_PROMPT_MODE,
                                                    showLlmPromptEditor: !isTablePromptEditorMode
                                                })}
                                                className={`px-2 py-1.5 text-xs rounded transition-colors ${isTablePromptEditorMode
                                                    ? (theme === 'dark'
                                                        ? 'bg-zinc-200 text-zinc-900'
                                                        : theme === 'solarized'
                                                            ? 'bg-[#7c6f4f] text-[#fdf6e3]'
                                                            : 'bg-zinc-700 text-white')
                                                    : theme === 'dark'
                                                        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                                                        : theme === 'solarized'
                                                            ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700'
                                                            : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title={t('LLM分镜提示词汇总')}
                                            >
                                                {t('LLM分镜提示词汇总')}
                                            </button>
                                            {isPromptEditorMode && (
                                                <>
                                                <div className="flex items-start gap-2 mt-2 w-full">
                                                    <div className="w-[78px] shrink-0 flex flex-col gap-1">
                                                        {STORYBOARD_PROMPT_SLOT_OPTIONS.map((slot) => {
                                                            const isActiveSlot = activePromptSlot === slot.key;
                                                            return (
                                                                <button
                                                                    key={slot.key}
                                                                    onClick={() => onPromptSlotClick(slot.key)}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    className={`text-[10px] px-1.5 py-1 rounded transition-colors text-left ${isActiveSlot
                                                                        ? (theme === 'dark'
                                                                            ? 'bg-zinc-200 text-zinc-900'
                                                                            : theme === 'solarized'
                                                                                ? 'bg-[#7c6f4f] text-[#fdf6e3]'
                                                                                : 'bg-zinc-700 text-white')
                                                                        : theme === 'dark'
                                                                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                                            : theme === 'solarized'
                                                                                ? 'bg-[#fdf6e3] text-zinc-700 hover:bg-[#eee8d5]'
                                                                                : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                                                                        }`}
                                                                    title={slot.editable ? t('可编辑记忆槽') : t('默认提示词（只读）')}
                                                                >
                                                                    {slot.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <textarea
                                                        value={editorPromptValue}
                                                        onChange={(e) => {
                                                            if (!activeSlotConfig.editable) return;
                                                            const memoryKey = getStoryboardPromptMemoryStorageKey(llmPromptMode, activeSlotConfig.key);
                                                            const nextPromptSlots = {
                                                                ...currentPromptSlots,
                                                                [memoryKey]: e.target.value
                                                            };
                                                            const patch = { llmPromptSlots: nextPromptSlots };
                                                            if (llmPromptMode === 'custom') {
                                                                patch.llmSplitPromptCustom = e.target.value;
                                                                patch.llmSplitPrompt = e.target.value;
                                                            }
                                                            updateNodeSettings(node.id, patch);
                                                        }}
                                                        readOnly={!activeSlotConfig.editable}
                                                        className={`flex-1 text-xs p-2 rounded resize-y min-h-[5rem] max-h-[20rem] overflow-y-auto custom-scrollbar ${theme === 'dark'
                                                            ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                                                            : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800 border-[#eee8d5]' : 'bg-white text-zinc-800 border-zinc-300'} border`}
                                                        style={{ height: `${workspaceHeight}px` }}
                                                        rows={3}
                                                        placeholder={activeSlotConfig.editable ? t('输入记忆 Prompt（该标签专属）...') : t('默认 Prompt 为只读')}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        onMouseUp={(e) => captureStoryboardWorkspaceHeight(node.id, e)}
                                                        onBlur={(e) => captureStoryboardWorkspaceHeight(node.id, e)}
                                                        onWheel={(e) => { e.stopPropagation(); }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-end gap-1 mt-1 pl-[80px]">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            exportStoryboardPromptSlots(node.id);
                                                        }}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                            ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                            : theme === 'solarized'
                                                                ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                                : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                            }`}
                                                        title={t('导出当前分镜记忆槽 JSON')}
                                                    >
                                                        {t('导出记忆槽')}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            importStoryboardPromptSlots(node.id);
                                                        }}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                            ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                            : theme === 'solarized'
                                                                ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                                : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                            }`}
                                                        title={t('导入分镜记忆槽 JSON')}
                                                    >
                                                        {t('导入记忆槽')}
                                                    </button>
                                                </div>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )
                }



                {/* 列表 */}
                <div
                    className={`flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 min-h-0 bg-opacity-50 ${theme === 'solarized' ? 'bg-[#fdf6e3]' : ''}`}
                    onWheel={(e) => {
                        e.stopPropagation();
                    }}
                >
                    {normalizeStoryboardViewMode(node.settings?.viewMode) === 'table' ? (
                        (() => {
                            const markdownInputValue = String(node.settings?.tableMarkdown || '');
                            const rawTable = node.settings?.tableData
                                || parseMarkdownTable(markdownInputValue || node.settings?.scriptText || '');
                            const tableData = normalizeStoryboardTableData(
                                rawTable && Array.isArray(rawTable.headers) && rawTable.headers.length > 0
                                    ? rawTable
                                    : { headers: [...STORYBOARD_DEFAULT_TABLE_HEADERS], rows: [] }
                            );
                            const isMarkdownCollapsed = !!node.settings?.tableMarkdownCollapsed;
                            return (
                                <div className="space-y-2">
                                    <div className={`rounded-lg border p-2 ${theme === 'dark'
                                        ? 'border-zinc-800 bg-zinc-900/40'
                                        : theme === 'solarized'
                                            ? 'border-[#d7cfb2] bg-[#fdf6e3]'
                                            : 'border-zinc-300 bg-zinc-50'
                                        }`}>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                {t('Markdown 表格')}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        runStoryboardTablePromptMerge(node.id);
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                        : theme === 'solarized'
                                                            ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                            : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                        }`}
                                                    disabled={!!node.settings?.isGenerating}
                                                    title={t('大模型汇总提示词')}
                                                >
                                                    {node.settings?.isGenerating ? t('大模型汇总中...') : t('大模型汇总提示词')}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        importStoryboardMarkdownTable(node.id, node.settings?.tableMarkdown || '', { switchToTable: true });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                        : theme === 'solarized'
                                                            ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                            : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                        }`}
                                                >
                                                    {t('应用')}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        pasteStoryboardTableFromClipboard(node.id);
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                        : theme === 'solarized'
                                                            ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                            : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                        }`}
                                                    title={t('从剪贴板批量粘贴表格（Markdown/CSV/TSV）')}
                                                >
                                                    {t('批量粘贴')}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        mutateStoryboardTable(node.id, (draft) => {
                                                            draft.rows.push(draft.headers.map(() => ''));
                                                            return draft;
                                                        });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                        : theme === 'solarized'
                                                            ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                            : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                        }`}
                                                >
                                                    {t('新增行')}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        mutateStoryboardTable(node.id, (draft) => {
                                                            draft.headers.push(`列${draft.headers.length + 1}`);
                                                            draft.rows = draft.rows.map((row) => [...row, '']);
                                                            return draft;
                                                        });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                        : theme === 'solarized'
                                                            ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                            : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                        }`}
                                                >
                                                    {t('新增列')}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateNodeSettings(node.id, { tableMarkdownCollapsed: !isMarkdownCollapsed });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                        : theme === 'solarized'
                                                            ? 'border-[#d7cfb2] text-zinc-700 hover:bg-[#eee8d5]'
                                                            : 'border-zinc-300 text-zinc-700 hover:bg-white'
                                                        }`}
                                                    title={isMarkdownCollapsed ? t('展开 Markdown 输入') : t('折叠 Markdown 输入')}
                                                >
                                                    {isMarkdownCollapsed ? 'v' : '^'}
                                                </button>
                                            </div>
                                        </div>
                                        {!isMarkdownCollapsed && (
                                            <textarea
                                                value={markdownInputValue}
                                                onChange={(e) => updateNodeSettings(node.id, { tableMarkdown: e.target.value })}
                                                className={`w-full min-h-[5rem] max-h-[14rem] p-2 text-xs rounded border resize-y overflow-y-auto custom-scrollbar ${theme === 'dark'
                                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                                    : theme === 'solarized'
                                                        ? 'bg-[#fdf6e3] border-[#d7cfb2] text-zinc-800 placeholder-zinc-500'
                                                        : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                                    }`}
                                                placeholder={t('可直接粘贴/手写 Markdown 表格，然后点击“应用”')}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onTouchStart={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => e.stopPropagation()}
                                            />
                                        )}
                                    </div>
                                    <div className={`rounded-lg border overflow-hidden ${theme === 'dark'
                                        ? 'border-zinc-800'
                                        : theme === 'solarized'
                                            ? 'border-[#d7cfb2]'
                                            : 'border-zinc-300'
                                        }`}>
                                        <div className="overflow-auto max-h-[420px] custom-scrollbar">
                                            <table className="w-full text-[10px] border-collapse">
                                                <thead className={theme === 'dark'
                                                    ? 'bg-zinc-900 text-zinc-300'
                                                    : theme === 'solarized'
                                                        ? 'bg-[#eee8d5] text-zinc-700'
                                                        : 'bg-zinc-100 text-zinc-700'}>
                                                    <tr>
                                                        {tableData.headers.map((header, idx) => (
                                                            <th
                                                                key={`storyboard-table-header-${idx}`}
                                                                className={`px-1.5 py-1 text-left border ${theme === 'dark'
                                                                    ? 'border-zinc-800'
                                                                    : theme === 'solarized'
                                                                        ? 'border-[#d7cfb2]'
                                                                        : 'border-zinc-300'
                                                                    }`}
                                                            >
                                                                <input
                                                                    value={header || ''}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        mutateStoryboardTable(node.id, (draft) => {
                                                                            draft.headers[idx] = value;
                                                                            return draft;
                                                                        });
                                                                    }}
                                                                    className={`w-full text-[10px] px-1 py-0.5 rounded border ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                                        : theme === 'solarized'
                                                                            ? 'bg-[#fdf6e3] border-[#d7cfb2] text-zinc-700'
                                                                            : 'bg-white border-zinc-300 text-zinc-700'
                                                                        }`}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onPointerDown={(e) => e.stopPropagation()}
                                                                    onTouchStart={(e) => e.stopPropagation()}
                                                                />
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tableData.rows.length > 0 ? tableData.rows.map((row, rowIdx) => (
                                                        <tr
                                                            key={`storyboard-table-row-${rowIdx}`}
                                                            className={rowIdx % 2 === 0
                                                                ? (theme === 'dark' ? 'bg-zinc-950/70' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-white')
                                                                : (theme === 'dark' ? 'bg-zinc-900/40' : theme === 'solarized' ? 'bg-[#eee8d5]' : 'bg-zinc-50')}
                                                        >
                                                            {tableData.headers.map((_, colIdx) => (
                                                                <td
                                                                    key={`storyboard-table-cell-${rowIdx}-${colIdx}`}
                                                                    className={`p-1.5 align-top border ${theme === 'dark'
                                                                        ? 'border-zinc-800 text-zinc-300'
                                                                        : theme === 'solarized'
                                                                            ? 'border-[#d7cfb2] text-zinc-700'
                                                                            : 'border-zinc-300 text-zinc-700'
                                                                        }`}
                                                                >
                                                                    <div className="relative">
                                                                        <textarea
                                                                            value={row[colIdx] || ''}
                                                                            onChange={(e) => {
                                                                                const value = e.target.value;
                                                                                mutateStoryboardTable(node.id, (draft) => {
                                                                                    if (!Array.isArray(draft.rows[rowIdx])) {
                                                                                        draft.rows[rowIdx] = draft.headers.map(() => '');
                                                                                    }
                                                                                    draft.rows[rowIdx][colIdx] = value;
                                                                                    return draft;
                                                                                });
                                                                            }}
                                                                            rows={2}
                                                                            className={`w-full text-[10px] p-1 pr-5 pb-4 rounded border resize-y min-h-[2.5rem] ${theme === 'dark'
                                                                                ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                                                : theme === 'solarized'
                                                                                    ? 'bg-[#fdf6e3] border-[#d7cfb2] text-zinc-700'
                                                                                    : 'bg-white border-zinc-300 text-zinc-700'
                                                                                }`}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            onPointerDown={(e) => e.stopPropagation()}
                                                                            onTouchStart={(e) => e.stopPropagation()}
                                                                            onKeyDown={(e) => e.stopPropagation()}
                                                                        />
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openStoryboardTableCellEditor(node.id, rowIdx, colIdx, row[colIdx] || '', e);
                                                                            }}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                            className={`absolute right-0.5 bottom-0.5 w-4 h-4 flex items-center justify-center text-[9px] rounded border transition-colors ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                                                : theme === 'solarized'
                                                                                    ? 'bg-[#eee8d5] border-[#d7cfb2] text-zinc-700 hover:bg-[#e4dcc9]'
                                                                                    : 'bg-zinc-100 border-zinc-300 text-zinc-600 hover:bg-zinc-200'
                                                                                }`}
                                                                            title={t('放大编辑（3x）')}
                                                                        >
                                                                            ↗
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    )) : (
                                                        <tr>
                                                            <td
                                                                colSpan={tableData.headers.length}
                                                                className={`px-3 py-4 text-center text-[10px] border ${theme === 'dark'
                                                                    ? 'border-zinc-800 text-zinc-500'
                                                                    : theme === 'solarized'
                                                                        ? 'border-[#d7cfb2] text-zinc-600'
                                                                        : 'border-zinc-300 text-zinc-500'
                                                                    }`}
                                                            >
                                                                {t('暂无行数据，可点击“新增行”或直接在上方 Markdown 中编辑后应用')}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()
                    ) : (
                        node.settings?.shots?.length > 0 ? (
                        node.settings.shots.map((shot, idx) => {
                            const isActiveShot = activeShot?.nodeId === node.id && activeShot?.shotId === shot.id;
                            return (
                                <Fragment key={shot.id}>
                                    {/* V3.5.20：镜头插入区域（T 形连接点） */}
                                    <div
                                        className="relative h-2 -mt-1 -mb-1 z-10 group/insert flex items-center justify-center cursor-pointer hover:h-6 transition-all"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newShots = [...(node.settings.shots || [])];
                                            const mode = normalizeStoryboardMode(node.settings?.mode);
                                            const defaultModel = getFirstEnabledModelKey(mode);
                                            const defaultRatio = getPreferredModelRatio(defaultModel, mode);
                                            const defaultResolution = mode === 'image'
                                                ? getPreferredImageResolutionForModel(defaultModel)
                                                : getPreferredVideoResolutionForModel(defaultModel);
                                            const defaultDuration = mode === 'video' ? getDefaultDurationForModel(defaultModel) : undefined;
                                            newShots.splice(idx, 0, {
                                                id: Date.now() + Math.random(),
                                                prompt: '',
                                                description: '',
                                                model: defaultModel,
                                                ratio: defaultRatio,
                                                resolution: defaultResolution,
                                                duration: defaultDuration,
                                                customParams: getDefaultCustomParamsForModel(defaultModel, null, { preserveByName: false }),
                                                status: 'draft',
                                                outputEnabled: false,
                                                selectedImageIndex: -1
                                            });
                                            updateNodeSettings(node.id, { shots: newShots });
                                        }}
                                        title={t('在此处插入新镜头')}
                                    >
                                        <div className="w-full h-[2px] bg-blue-500 opacity-0 group-hover/insert:opacity-100 transition-opacity" />
                                        <div className="absolute w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center opacity-0 group-hover/insert:opacity-100 transition-opacity shadow-sm scale-75 group-hover/insert:scale-100">
                                            <Plus size={12} />
                                        </div>
                                    </div>

                                    <div className="flex items-stretch gap-2 w-full">
                                        <div
                                            // key={shot.id} 已移至 Fragment
                                            data-storyboard-shot-key={makeStoryboardShotFocusKey(node.id, shot.id)}
                                            tabIndex={0} // 允许聚焦以响应键盘事件
                                            onClick={(e) => {
                                                e.stopPropagation(); // 防止触发节点选择
                                                setActiveShot({ nodeId: node.id, shotId: shot.id });
                                                e.currentTarget.focus(); // 关键：点击行即聚焦，激活粘贴
                                            }}
                                            onPaste={(e) => handleShotPaste(e, shot.id)} // 关键：在行级别监听粘贴
                                            onKeyDown={(e) => {
                                                const interactive = e.target.closest('textarea, input, select, [contenteditable="true"]');
                                                if (interactive && interactive !== e.currentTarget) return;
                                                if (e.key === 'ArrowLeft') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    switchStoryboardShotOutputHistory(node.id, shot.id, -1);
                                                    return;
                                                }
                                                if (e.key === 'ArrowRight') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    switchStoryboardShotOutputHistory(node.id, shot.id, 1);
                                                    return;
                                                }
                                                if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    navigateStoryboardShotByDelta(node.id, shot.id, -1);
                                                    return;
                                                }
                                                if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    navigateStoryboardShotByDelta(node.id, shot.id, 1);
                                                }
                                            }}
                                            className={`relative flex-1 flex gap-3 p-3 rounded-lg border transition-all group/shot cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/50 ${isActiveShot
                                                ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-500/5 z-10'
                                                : theme === 'dark'
                                                    ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'
                                                    : theme === 'solarized'
                                                        ? 'bg-[#fdf6e3] border-[#eee8d5] hover:border-[#d7cfb2]'
                                                        : 'bg-white border-zinc-200 hover:border-blue-300 hover:shadow-md'
                                                }`}
                                        >
                                            {/* 序号 */}
                                            <div className={`font-mono text-sm w-6 shrink-0 flex items-start pt-1 font-bold ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>{shot.scene_index || (idx + 1)}</div>

                                            {/* V3.7.4：输入预览，视频横向拆分并修复导入 */}
                                            {/* V3.7.5：增加容器宽度，以更好地支持横向布局 */}
                                            <div
                                                className="flex flex-col gap-2 shrink-0 mr-2 h-full min-h-[14rem] w-52"
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                }}
                                                onDrop={(e) => handleShotDrop(e, shot.id)}
                                            >
                                                {(() => {
                                                    const mode = normalizeStoryboardMode(node.settings?.mode);
                                                    const isVideo = mode === 'video';
                                                    const supportsFirstLastFrame = !!getApiConfigByKey(shot.model)?.supportsFirstLastFrame;
                                                    const showLastFrame = supportsFirstLastFrame && shot.useFirstLastFrame;
                                                    const activeInput = shot.activeInput || 'first';
                                                    const showMultiRef = shot.useMultiRef; // 切换状态

                                                    const borderColor = theme === 'dark'
                                                        ? 'border-zinc-800'
                                                        : theme === 'solarized'
                                                            ? 'border-[#eee8d5]'
                                                            : 'border-zinc-300';
                                                    const bgColor = theme === 'dark'
                                                        ? 'bg-black'
                                                        : theme === 'solarized'
                                                            ? 'bg-[#fdf6e3]'
                                                            : 'bg-zinc-50';



                                                    const handleUpload = (e, field) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => {
                                                            updateShot(node.id, shot.id, { [field]: ev.target.result });
                                                        };
                                                        reader.readAsDataURL(file);
                                                        e.target.value = '';
                                                    };

                                                    // 视频模式渲染（横向拆分）
                                                    if (isVideo) {
                                                        const renderVideoCard = (type, isMain) => {
                                                            const field = type === 'first' ? 'image_url' : 'lastFrame';
                                                            const imgUrl = shot[field];
                                                            const label = type === 'first' ? t('首帧') : t('尾帧');
                                                            // V3.7.5：横向拆分逻辑，主区域使用 flex-1，次区域使用 w-14
                                                            const sizeClass = isMain ? 'flex-1 h-full' : 'w-14 h-full shrink-0';

                                                            return (
                                                                <div key={type} className={`relative rounded-lg border overflow-hidden group ${sizeClass} ${bgColor} ${borderColor} flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-all`} onClick={(e) => { e.stopPropagation(); if (!isMain) updateShot(node.id, shot.id, { activeInput: type }); }}>
                                                                    {imgUrl ? <LazyBase64Image src={imgUrl} className={`w-full h-full object-cover ${!isMain ? 'opacity-60 hover:opacity-100' : ''}`} /> : <div className="flex flex-col items-center gap-1 text-zinc-500"><FolderOpen size={isMain ? 20 : 14} />{isMain && <span className="text-[10px]">选择{label}</span>}</div>}
                                                                    <div className="absolute top-0 left-0 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-br z-20 backdrop-blur-md pointer-events-none">{label}</div>

                                                                    {/* V3.7.5：恢复预览（最大化）按钮 */}
                                                                    {imgUrl && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setLightboxItem({ url: imgUrl, type: 'image' }); }}
                                                                            className="absolute bottom-1 left-1 p-1 rounded-full bg-black/60 text-white hover:bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity z-30"
                                                                            title={t('预览图片')}
                                                                        >
                                                                            <Maximize2 size={10} />
                                                                        </button>
                                                                    )}

                                                                    {isMain && (
                                                                        <>
                                                                            {imgUrl && <button onClick={(e) => { e.stopPropagation(); updateShot(node.id, shot.id, { [field]: '' }); }} className="absolute top-1 right-1 z-30 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 p-0 leading-none text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"><X size={12} /></button>}
                                                                            <label className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer opacity-0 hover:opacity-100">
                                                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, field)} />
                                                                                <div className="p-2 rounded-full bg-black/50 text-white"><FolderOpen size={16} /></div>
                                                                            </label>
                                                                            {/* V3.7.13：拆分模式开关放到右下角 */}
                                                                            {supportsFirstLastFrame && (
                                                                                <div className="absolute bottom-1 right-1 p-1 rounded bg-black/40 hover:bg-blue-500 text-white transition-colors cursor-pointer z-30" onClick={(e) => { e.stopPropagation(); updateShot(node.id, shot.id, { useFirstLastFrame: !showLastFrame, activeInput: !showLastFrame ? 'last' : 'first' }); }} title="切换首尾帧模式">
                                                                                    <Split size={12} />
                                                                                </div>
                                                                            )}
                                                                            {/* V3.7.13: 文件名只在该帧有图片时显示 */}
                                                                            {imgUrl && shot.image_filename && (
                                                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] pl-8 pr-8 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity z-20" title={shot.image_filename}>
                                                                                    {shot.image_filename}
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        };

                                                        if (!showLastFrame) return renderVideoCard('first', true);

                                                        // 稳定的横向布局：首帧在左，尾帧在右
                                                        return (
                                                            <div className="flex flex-row gap-2 h-full w-full">
                                                                {renderVideoCard('first', activeInput === 'first')}
                                                                {renderVideoCard('last', activeInput === 'last')}
                                                            </div>
                                                        );

                                                    } else {
                                                        // V3.7.11：图像模式下左侧只显示输入图片
                                                        // 输入图片: referenceImages 或 image_url
                                                        // 输出图片(output_images)只在右侧预览面板显示
                                                        const inputImages = shot.referenceImages && shot.referenceImages.length > 0
                                                            ? shot.referenceImages
                                                            : (shot.image_url ? [shot.image_url] : []);
                                                        const mainInputImg = inputImages[0] || '';

                                                        return (
                                                            <div className="flex flex-col gap-2 h-full w-full">
                                                                {/* 主图容器 - 只显示输入图片 */}
                                                                <div className={`relative flex-1 rounded-lg border overflow-hidden group ${bgColor} ${borderColor} flex flex-col items-center justify-center`}>
                                                                    {mainInputImg ? (
                                                                        <>
                                                                            <LazyBase64Image src={mainInputImg} className="w-full h-full object-cover" />
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); setLightboxItem({ url: mainInputImg, type: 'image' }); }}
                                                                                className="absolute bottom-1 left-1 p-1 rounded-full bg-black/60 text-white hover:bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity z-30"
                                                                                title={t('预览原图')}
                                                                            >
                                                                                <Maximize2 size={12} />
                                                                            </button>
                                                                            {/* V3.7.11: 文件名显示 */}
                                                                            {shot.image_filename && (
                                                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-8 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity z-20" title={shot.image_filename}>
                                                                                    {shot.image_filename}
                                                                                </div>
                                                                            )}
                                                                            {/* 删除按钮 */}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const nextRefs = inputImages.slice(1);
                                                                                    updateShot(node.id, shot.id, nextRefs.length > 0
                                                                                        ? { referenceImages: nextRefs, image_url: nextRefs[0] || '', image_filename: '' }
                                                                                        : { image_url: '', image_filename: '', referenceImages: [] });
                                                                                }}
                                                                                className="absolute top-1 right-1 z-30 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 p-0 leading-none text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                                                                                title={t('删除')}
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <div className="flex flex-col items-center gap-1 text-zinc-500">
                                                                            <FolderOpen size={20} />
                                                                            <span className="text-[10px]">{t('选择图片')}</span>
                                                                        </div>
                                                                    )}
                                                                    {/* 上传覆盖层 */}
                                                                    <label className={`absolute inset-0 z-10 flex items-center justify-center cursor-pointer ${mainInputImg ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                                                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                                            const f = e.target.files?.[0];
                                                                            if (f) {
                                                                                const r = new FileReader();
                                                                                r.onload = (v) => {
                                                                                    const uploadedUrl = v.target.result;
                                                                                    if (showMultiRef || inputImages.length > 1 || (Array.isArray(shot.referenceImages) && shot.referenceImages.length > 0)) {
                                                                                        const nextRefs = inputImages.length > 0 ? [...inputImages] : [];
                                                                                        if (nextRefs.length === 0) {
                                                                                            nextRefs.push(uploadedUrl);
                                                                                        } else {
                                                                                            nextRefs[0] = uploadedUrl;
                                                                                        }
                                                                                        updateShot(node.id, shot.id, { referenceImages: nextRefs.slice(0, 5), image_url: nextRefs[0] || uploadedUrl, image_filename: f.name });
                                                                                        return;
                                                                                    }
                                                                                    updateShot(node.id, shot.id, { image_url: uploadedUrl, image_filename: f.name, referenceImages: [] });
                                                                                };
                                                                                r.readAsDataURL(f);
                                                                            }
                                                                        }} />
                                                                        {mainInputImg && <div className="p-2 rounded-full bg-black/50 text-white"><FolderOpen size={16} /></div>}
                                                                    </label>
                                                                    {/* V3.7.11: 多图参考开关按钮 */}
                                                                    <div
                                                                        className={`absolute bottom-1 right-1 p-1 rounded bg-black/40 hover:bg-blue-500 text-white transition-colors cursor-pointer z-30 ${showMultiRef ? 'text-blue-400 bg-blue-500/30' : 'text-zinc-400'}`}
                                                                        onClick={(e) => { e.stopPropagation(); updateShot(node.id, shot.id, { useMultiRef: !showMultiRef }); }}
                                                                        title={t('多图参考开关')}
                                                                    >
                                                                        <LayoutGrid size={12} />
                                                                    </div>
                                                                </div>

                                                                {/* V3.7.11: 多图参考缩略图行 */}
                                                                {showMultiRef && (
                                                                    <div className="flex gap-2 h-14 shrink-0 overflow-x-auto no-scrollbar items-center">
                                                                        {inputImages.slice(1).map((img, idx) => (
                                                                            <div
                                                                                key={idx + 1}
                                                                                className={`group/ref-thumb relative w-12 h-14 shrink-0 rounded border overflow-hidden cursor-pointer hover:border-blue-500 transition-all ${borderColor} ${bgColor}`}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    // 点击缩略图切换为主图
                                                                                    const newRefs = [...inputImages];
                                                                                    const clickedIdx = idx + 1;
                                                                                    [newRefs[0], newRefs[clickedIdx]] = [newRefs[clickedIdx], newRefs[0]];
                                                                                    updateShot(node.id, shot.id, { referenceImages: newRefs, image_url: newRefs[0] });
                                                                                }}
                                                                                onDoubleClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setLightboxItem({ url: img, type: 'image' });
                                                                                }}
                                                                            >
                                                                                <LazyBase64Image src={img} className="w-full h-full object-cover" />
                                                                                <div className="absolute top-0 left-0 bg-black/50 text-white text-[8px] px-1 backdrop-blur-sm">{idx + 2}</div>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setLightboxItem({ url: img, type: 'image' }); }}
                                                                                    className="absolute bottom-1 left-1 p-1 rounded-full bg-black/60 text-white hover:bg-blue-500 opacity-0 group-hover/ref-thumb:opacity-100 transition-opacity z-30"
                                                                                    title={t('预览原图')}
                                                                                >
                                                                                    <Maximize2 size={8} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const removeIdx = idx + 1;
                                                                                        const newRefs = [...inputImages];
                                                                                        newRefs.splice(removeIdx, 1);
                                                                                        updateShot(node.id, shot.id, {
                                                                                            referenceImages: newRefs,
                                                                                            image_url: newRefs[0] || '',
                                                                                            image_filename: newRefs.length > 0 ? shot.image_filename : ''
                                                                                        });
                                                                                    }}
                                                                                    className="absolute top-1 right-1 z-30 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/60 p-0 leading-none text-white opacity-0 transition-opacity hover:bg-red-500 group-hover/ref-thumb:opacity-100"
                                                                                    title={t('删除')}
                                                                                >
                                                                                    <X size={8} />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                        {inputImages.length < 5 && (
                                                                            <label className={`w-12 h-14 shrink-0 rounded border border-dashed flex items-center justify-center cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${borderColor} text-zinc-400 hover:text-blue-500 hover:border-blue-500 transition-colors`}>
                                                                                <Plus size={16} />
                                                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                                                    const f = e.target.files?.[0];
                                                                                    if (f) {
                                                                                        const r = new FileReader();
                                                                                        r.onload = (v) => {
                                                                                            const nextRefs = [...inputImages, v.target.result].slice(0, 5);
                                                                                            updateShot(node.id, shot.id, { referenceImages: nextRefs, image_url: nextRefs[0] || '' });
                                                                                        };
                                                                                        r.readAsDataURL(f);
                                                                                    }
                                                                                }} />
                                                                            </label>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }
                                                })()}
                                            </div>

                                            {/* 内容 */}
                                            <div className="flex-1 min-w-0 flex flex-col gap-2">
                                                {/* 控制栏：模型、比例、时长 */}
                                                <div className="flex gap-2 items-center flex-wrap">
                                                    {/* V3.4.11：视频模型使用供应商 -> 模型双层选择器 */}
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'shot-model' && activeDropdown.shotId === shot.id
                                                                    ? null
                                                                    : { nodeId: node.id, type: 'shot-model', shotId: shot.id });
                                                            }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            className={`flex items-center justify-between gap-1 px-2 py-1 rounded border text-xs transition-colors min-w-[100px] ${theme === 'dark'
                                                                ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-600'
                                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                                }`}
                                                        >
                                                            <span className="truncate font-mono text-[10px]">
                                                                {getApiConfigByKey(shot.model)?.id || shot.model || '选择模型'}
                                                            </span>
                                                            <ChevronDown size={10} className="opacity-50 shrink-0" />
                                                        </button>
                                                        {activeDropdown?.nodeId === node.id && activeDropdown.type === 'shot-model' && activeDropdown.shotId === shot.id && (
                                                            <div
                                                                className={`absolute top-full left-0 mt-1 w-64 rounded-lg shadow-xl p-1 z-[60] border flex ${theme === 'dark'
                                                                    ? 'bg-[#18181b] border-zinc-700'
                                                                    : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                                    }`}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onMouseLeave={() => setHoveredProvider(null)}
                                                            >
                                                                {/* 供应商列表 */}
                                                                <div className={`w-24 border-r pr-1 max-h-80 overflow-y-auto custom-scrollbar ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                                                                    {(() => {
                                                                        const mode = normalizeStoryboardMode(node.settings?.mode);
                                                                        const isImageMode = mode === 'image';
                                                                        return Object.entries(groupedApiConfigs)
                                                                            .filter(([, group]) => group.models.some(m => (isImageMode ? isImageModelType(m.type) : m.type === 'Video')))
                                                                            .map(([providerKey, group]) => (
                                                                                <button
                                                                                    key={providerKey}
                                                                                    onMouseEnter={() => setHoveredProvider(providerKey)}
                                                                                    className={`w-full text-left px-2 py-1.5 text-[10px] rounded transition-colors ${hoveredProvider === providerKey
                                                                                        ? theme === 'dark' ? 'bg-zinc-800 text-white' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-zinc-100 text-zinc-900'
                                                                                        : theme === 'dark' ? 'text-zinc-400 hover:text-zinc-300' : theme === 'solarized' ? 'text-zinc-600 hover:text-zinc-700' : 'text-zinc-600 hover:text-zinc-800'
                                                                                        }`}
                                                                                >
                                                                                    {group.name || providerKey}
                                                                                </button>
                                                                            ));
                                                                    })()}
                                                                </div>
                                                                {/* 模型列表 */}
                                                                <div className="flex-1 pl-1 max-h-80 overflow-y-auto custom-scrollbar">
                                                                    {(() => {
                                                                        const mode = normalizeStoryboardMode(node.settings?.mode);
                                                                        const isImageMode = mode === 'image';
                                                                        return hoveredProvider && groupedApiConfigs[hoveredProvider]?.models
                                                                            .filter(m => (isImageMode ? isImageModelType(m.type) : m.type === 'Video'))
                                                                            .map((m) => {
                                                                                const modelKey = m._uid || m.id;
                                                                                const currentModelKey = resolveModelKey(shot.model);
                                                                                return (
                                                                                    <button
                                                                                        key={modelKey}
                                                                                        onClick={() => {
                                                                                            const mode = normalizeStoryboardMode(node.settings?.mode);
                                                                                            const defaultDuration = getDefaultDurationForModel(modelKey);
                                                                                            const defaultRatio = getPreferredModelRatio(modelKey, mode);
                                                                                            const defaultResolution = mode === 'image'
                                                                                                ? getPreferredImageResolutionForModel(modelKey)
                                                                                                : getPreferredVideoResolutionForModel(modelKey);
                                                                                            updateShot(node.id, shot.id, {
                                                                                                model: modelKey,
                                                                                                ratio: defaultRatio,
                                                                                                resolution: defaultResolution,
                                                                                                duration: mode === 'video' ? (shot.duration || defaultDuration) : undefined,
                                                                                                customParams: getDefaultCustomParamsForModel(modelKey, null, { preserveByName: false })
                                                                                            });
                                                                                            // V3.6.0.fuckedup: 根据模式保存最后使用的模型
                                                                                            const lastModelKey = mode === 'image' ? 'tapnow_last_image_model' : 'tapnow_last_video_model';
                                                                                            localStorage.setItem(lastModelKey, modelKey);
                                                                                            // 同步到状态
                                                                                            if (mode === 'image') {
                                                                                                setLastUsedImageModel(modelKey);
                                                                                            } else {
                                                                                                setLastUsedVideoModel(modelKey);
                                                                                            }
                                                                                            setActiveDropdown(null);
                                                                                            setHoveredProvider(null);
                                                                                        }}
                                                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${currentModelKey === modelKey
                                                                                            ? theme === 'dark' ? 'bg-blue-600/30 text-blue-300' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-blue-100 text-blue-700'
                                                                                            : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-300' : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'
                                                                                            }`}
                                                                                    >
                                                                                        <span className="text-[10px] font-medium truncate font-mono">{m.id}</span>
                                                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(modelKey)}`}></div>
                                                                                    </button>
                                                                                );
                                                                            });
                                                                    })()}
                                                                    {!hoveredProvider && (
                                                                        <div className={`text-[10px] px-2 py-3 text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                            ← 选择 Provider
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* V3.6.1：动态适配模式的比例选择器 */}
                                                    {(() => {
                                                        const mode = normalizeStoryboardMode(node.settings?.mode);
                                                        const ratioOptions = getRatiosForModel(shot.model);
                                                        const ratioConfig = getApiConfigByKey(shot.model);
                                                        const fallbackRatio = getPreferredModelRatio(shot.model, mode);
                                                        return (
                                                            <select
                                                                value={shot.ratio || fallbackRatio}
                                                                onChange={(e) => updateShot(node.id, shot.id, { ratio: e.target.value })}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                className={`text-xs px-2 py-1 rounded border outline-none transition-colors ${theme === 'dark'
                                                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-600'
                                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                                    }`}
                                                            >
                                                                {ratioOptions.map(ratio => (
                                                                    <option key={ratio} value={ratio}>
                                                                        {ratio === 'Auto'
                                                                            ? 'Auto'
                                                                            : getValueLabelWithNotes(ratio, !!ratioConfig?.ratioNotesEnabled, ratioConfig?.ratioNotes || {})}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        );
                                                    })()}

                                                    {/* V3.6.1：分辨率选择器，视频模式显示 720p/1080p，图片模式显示自动/1K/2K/4K */}
                                                    {(() => {
                                                        const mode = normalizeStoryboardMode(node.settings?.mode);
                                                        if (mode === 'video') {
                                                            const resOptions = getVideoResolutionsForModel(shot.model);
                                                            if (!resOptions.length) return null;
                                                            const resConfig = getApiConfigByKey(shot.model);
                                                            const currentRes = normalizeVideoResolution(shot.resolution || resOptions[0] || '720P');
                                                            const fallbackRes = getPreferredVideoResolutionForModel(shot.model);
                                                            const resolvedRes = resOptions.includes(currentRes) ? currentRes : fallbackRes;
                                                            if (resolvedRes !== currentRes) {
                                                                setTimeout(() => updateShot(node.id, shot.id, { resolution: resolvedRes }), 0);
                                                            }
                                                            return (
                                                                <select
                                                                    value={resolvedRes}
                                                                    onChange={(e) => updateShot(node.id, shot.id, { resolution: e.target.value })}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    className={`text-xs px-2 py-1 rounded border outline-none transition-colors ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-600'
                                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                                        }`}
                                                                    title={t('分辨率')}
                                                                >
                                                                    {resOptions.map((res) => (
                                                                        <option key={res} value={res}>
                                                                            {getValueLabelWithNotes(res, !!resConfig?.videoResolutionNotesEnabled, resConfig?.videoResolutionNotes || {})}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            );
                                                        } else {
                                                            // 图片模式：显示自动/1K/2K/4K
                                                            const resOptions = getResolutionsForModel(shot.model);
                                                            const resConfig = getApiConfigByKey(shot.model);
                                                            const currentRes = normalizeImageResolution(shot.resolution || '2K');
                                                            const fallbackRes = getPreferredImageResolutionForModel(shot.model);
                                                            const resolvedRes = resOptions.includes(currentRes) ? currentRes : fallbackRes;
                                                            if (resolvedRes !== currentRes) {
                                                                setTimeout(() => updateShot(node.id, shot.id, { resolution: resolvedRes }), 0);
                                                            }
                                                            return (
                                                                <select
                                                                    value={resolvedRes}
                                                                    onChange={(e) => updateShot(node.id, shot.id, { resolution: e.target.value })}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    className={`text-xs px-2 py-1 rounded border outline-none transition-colors ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-600'
                                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                                        }`}
                                                                    title={t('分辨率')}
                                                                >
                                                                    {resOptions.map(res => (
                                                                        <option key={res} value={res}>
                                                                            {getValueLabelWithNotes(res, !!resConfig?.resolutionNotesEnabled, resConfig?.resolutionNotes || {})}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            );
                                                        }
                                                    })()}

                                                    {/* V3.7.18：时长选择器仅在视频模式下显示 */}
                                                    {(normalizeStoryboardMode(node.settings?.mode)) === 'video' && (() => {
                                                        const currentModel = shot.model || (apiConfigs.find(c => c.type === 'Video' && c.id === 'sora-2')?.id || apiConfigs.find(c => c.type === 'Video')?.id || '');
                                                        const config = getApiConfigByKey(currentModel);
                                                        const availableDurations = config?.durations || getDefaultDurationsForModel(currentModel);
                                                        const defaultDuration = getDefaultDurationForModel(currentModel);
                                                        return (
                                                            <select
                                                                value={shot.duration || defaultDuration}
                                                                onChange={(e) => updateShot(node.id, shot.id, { duration: e.target.value })}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                            className={`text-xs px-2 py-1 rounded border outline-none transition-colors ${theme === 'dark'
                                                                ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-600'
                                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                                }`}
                                                        >
                                                            {availableDurations.map(duration => (
                                                                <option key={duration} value={duration}>
                                                                    {getValueLabelWithNotes(duration, !!config?.durationNotesEnabled, config?.durationNotes || {})}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    );
                                                })()}
                                                    {(normalizeStoryboardMode(node.settings?.mode)) === 'video' && (() => {
                                                        const modelId = shot.model || '';
                                                        const config = getApiConfigByKey(modelId);
                                                        const supportsFirstLastFrame = !!config?.supportsFirstLastFrame;
                                                        const supportsHD = !!config?.supportsHD;
                                                        if (!supportsFirstLastFrame && !supportsHD) return null;
                                                        return (
                                                            <div className="flex items-center gap-2">
                                                                {supportsFirstLastFrame && (
                                                                    <label className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border cursor-pointer transition-colors ${theme === 'dark'
                                                                        ? shot.useFirstLastFrame ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200' : 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                                                        : theme === 'solarized'
                                                                            ? shot.useFirstLastFrame ? 'bg-[#eee8d5] border-[#d7cfb2] text-zinc-800' : 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                                                            : shot.useFirstLastFrame ? 'bg-emerald-500/20 border-emerald-300 text-emerald-700' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                                                        }`} onClick={e => e.stopPropagation()}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!shot.useFirstLastFrame}
                                                                            onChange={(e) => {
                                                                                e.stopPropagation();
                                                                                updateShot(node.id, shot.id, { useFirstLastFrame: e.target.checked });
                                                                            }}
                                                                            className="w-3 h-3 cursor-pointer"
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                        />
                                                                        <span>{t('首尾帧')}</span>
                                                                    </label>
                                                                )}
                                                                {supportsHD && (
                                                                    <label className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border cursor-pointer transition-colors ${theme === 'dark'
                                                                        ? shot.isHD ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                                                        : theme === 'solarized'
                                                                            ? shot.isHD ? 'bg-[#eee8d5] border-[#d7cfb2] text-zinc-800' : 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                                                            : shot.isHD ? 'bg-blue-500/30 border-blue-400 text-blue-700' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                                                        }`} onClick={e => e.stopPropagation()}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!shot.isHD}
                                                                            onChange={(e) => {
                                                                                e.stopPropagation();
                                                                                updateShot(node.id, shot.id, { isHD: e.target.checked });
                                                                            }}
                                                                            className="w-3 h-3 cursor-pointer"
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                        />
                                                                        <span>HD</span>
                                                                    </label>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}


                                                </div>

                                                {(() => {
                                                    const customParamsView = renderCustomParamInputs(
                                                        shot.model,
                                                        shot.customParams,
                                                        (nextParams) => updateShot(node.id, shot.id, { customParams: nextParams }),
                                                        `${node.id}-${shot.id}`
                                                    );
                                                    if (!customParamsView) return null;
                                                    return (
                                                        <div className="mt-2" onMouseDown={(e) => e.stopPropagation()}>
                                                            {customParamsView}
                                                        </div>
                                                    );
                                                })()}

                                                <textarea
                                                    className={`text-sm outline-none resize-none bg-transparent transition-all ${theme === 'dark'
                                                        ? 'text-zinc-200 placeholder:text-zinc-700'
                                                        : 'text-zinc-800 placeholder:text-zinc-400'
                                                        }`}
                                                    value={shot.description || ''}
                                                    placeholder={t('画面描述...')}
                                                    title={shot.description || ''} /* V3.5.20：工具提示 */
                                                    onChange={(e) => updateShot(node.id, shot.id, { description: e.target.value })}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // 确保点击文本框时也激活卡片
                                                        if (!isActiveShot) {
                                                            setActiveShot({ nodeId: node.id, shotId: shot.id });
                                                        }
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onFocus={(e) => {
                                                        e.stopPropagation();
                                                        // 确保聚焦时激活卡片
                                                        if (!isActiveShot) {
                                                            setActiveShot({ nodeId: node.id, shotId: shot.id });
                                                        }
                                                    }}
                                                    onInput={(e) => {
                                                        // 输入时自动调整高度（仅在激活状态下）
                                                        if (isActiveShot) {
                                                            e.currentTarget.style.height = 'auto';
                                                            e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                                                        }
                                                    }}
                                                    ref={(el) => {
                                                        // 当卡片激活时，自动调整高度以显示所有内容
                                                        if (el && isActiveShot) {
                                                            el.style.height = 'auto';
                                                            el.style.height = el.scrollHeight + 'px';
                                                        }
                                                    }}
                                                    style={{
                                                        minHeight: isActiveShot ? '8rem' : '2.5rem',
                                                        height: isActiveShot ? 'auto' : '2.5rem',
                                                        transition: 'all 0.2s ease-in-out'
                                                    }}
                                                />
                                                <div className={`p-2 rounded text-xs font-mono border transition-all relative ${theme === 'dark'
                                                    ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-600' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                                                    }`}
                                                    style={{
                                                        minHeight: isActiveShot ? '8rem' : '2rem',
                                                        transition: 'all 0.2s ease-in-out'
                                                    }}>
                                                    <textarea
                                                        className="w-full bg-transparent outline-none resize-none placeholder:text-opacity-50 transition-all pr-8"
                                                        value={shot.prompt || ''}
                                                        placeholder={t('等待生成提示词...')}
                                                        onChange={(e) => updateShot(node.id, shot.id, { prompt: e.target.value })}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // 确保点击文本框时也激活卡片
                                                            if (!isActiveShot) {
                                                                setActiveShot({ nodeId: node.id, shotId: shot.id });
                                                            }
                                                        }}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onFocus={(e) => {
                                                            e.stopPropagation();
                                                            // 确保聚焦时激活卡片
                                                            if (!isActiveShot) {
                                                                setActiveShot({ nodeId: node.id, shotId: shot.id });
                                                            }
                                                        }}
                                                        onInput={(e) => {
                                                            // 输入时自动调整高度（仅在激活状态下）
                                                            if (isActiveShot) {
                                                                e.currentTarget.style.height = 'auto';
                                                                e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                                                            }
                                                        }}
                                                        ref={(el) => {
                                                            // 当卡片激活时，自动调整高度以显示所有内容
                                                            if (el && isActiveShot) {
                                                                el.style.height = 'auto';
                                                                el.style.height = el.scrollHeight + 'px';
                                                            }
                                                        }}
                                                        style={{
                                                            minHeight: isActiveShot ? '8rem' : '2rem',
                                                            height: isActiveShot ? 'auto' : '2rem',
                                                            transition: 'all 0.2s ease-in-out'
                                                        }}
                                                    />
                                                    {(shot.model === 'sora-2' || shot.model === 'sora-2-pro') && characterLibrary.length > 0 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCharactersOpen(true);
                                                            }}
                                                            className={`absolute top-2 right-2 p-1 rounded transition-colors ${theme === 'dark'
                                                                ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
                                                                : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200'
                                                                }`}
                                                            title={t('插入角色')}
                                                        >
                                                            <Users size={12} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* 角色引用栏 (仅 Sora 模型) */}
                                                {(() => {
                                                    const currentModel = shot.model || '';
                                                    const isSora = currentModel && (currentModel.includes('sora') || currentModel === 'sora-2' || currentModel === 'sora-2-pro');

                                                    if (!isSora || characterLibrary.length === 0) return null;

                                                    const currentPrompt = shot.prompt || '';
                                                    const expandKey = `${node.id}-${shot.id}`;
                                                    const isExpanded = characterReferenceBarExpanded[expandKey] || false;
                                                    const maxVisible = 5; // 最多显示5个角色，超过则显示展开按钮
                                                    const shouldShowExpand = characterLibrary.length > maxVisible;

                                                    return (
                                                        <div className="border-t border-dashed mt-1" style={{
                                                            borderColor: theme === 'dark' ? 'rgba(63, 63, 70, 0.5)' : 'rgba(161, 161, 170, 0.5)'
                                                        }}>
                                                            <div className="flex items-center justify-between py-1 px-1">
                                                                <div className="flex gap-2 overflow-x-auto py-2 flex-1 custom-scrollbar">
                                                                    {(isExpanded ? characterLibrary : characterLibrary.slice(0, maxVisible)).map(char => {
                                                                        const tag = `@${char.username}`;
                                                                        const isActive = currentPrompt.includes(tag);

                                                                        return (
                                                                            <button
                                                                                key={char.id}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    let newPrompt = currentPrompt || '';
                                                                                    if (isActive) {
                                                                                        // 移除标签，并清理多余空格
                                                                                        newPrompt = newPrompt.replace(tag, '').replace(/\s{2,}/g, ' ').trim();
                                                                                    } else {
                                                                                        // 添加标签到末尾（前后加空格）
                                                                                        newPrompt = newPrompt.trim();
                                                                                        newPrompt = newPrompt ? `${newPrompt} ${tag} ` : `${tag} `;
                                                                                    }
                                                                                    updateShot(node.id, shot.id, { prompt: newPrompt });
                                                                                }}
                                                                                className={`relative shrink-0 transition-all ${isActive ? 'scale-110' : 'opacity-70 hover:opacity-100'}`}
                                                                                title={char.username}
                                                                            >
                                                                                <img
                                                                                    src={char.localCacheUrl || char.profile_picture_url || ''}
                                                                                    alt={char.username}
                                                                                    className={`w-8 h-8 rounded-full object-cover border-2 ${isActive
                                                                                        ? 'border-blue-500 ring-2 ring-blue-500'
                                                                                        : 'border-transparent'
                                                                                        }`}
                                                                                    onError={(e) => {
                                                                                        e.target.style.display = 'none';
                                                                                    }}
                                                                                />
                                                                                {/* 右下角显示小的链接图标表示可用 */}
                                                                                <div className="absolute -bottom-0.5 -right-0.5 bg-black/50 rounded-full p-0.5">
                                                                                    <LinkIcon size={8} className="text-green-400" />
                                                                                </div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                                {shouldShowExpand && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (isExpanded) {
                                                                                // 收起：关闭展开状态
                                                                                setCharacterReferenceBarExpanded(prev => {
                                                                                    const updated = { ...prev };
                                                                                    delete updated[expandKey];
                                                                                    return updated;
                                                                                });
                                                                            } else {
                                                                                // 展开：打开角色库侧边栏
                                                                                setCharactersOpen(true);
                                                                                setCharacterReferenceBarExpanded(prev => ({ ...prev, [expandKey]: true }));
                                                                            }
                                                                        }}
                                                                        className={`shrink-0 px-2 py-1 text-[10px] rounded transition-colors ml-2 ${theme === 'dark'
                                                                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                                                            }`}
                                                                        title={isExpanded ? "收起" : "打开角色库"}
                                                                    >
                                                                        {isExpanded ? '收起' : `+${characterLibrary.length - maxVisible}`}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                <div className="flex gap-1 flex-wrap items-center mt-1">
                                                    {shot.tags?.map((tag, tagIdx) => (
                                                        <span key={tagIdx} className={`px-1.5 py-0.5 text-[10px] rounded border ${theme === 'dark'
                                                            ? 'bg-blue-900/30 text-blue-300 border-blue-800'
                                                            : 'bg-blue-50 text-blue-600 border-blue-200'
                                                            }`}>{tag}</span>
                                                    ))}
                                                    {shot.camera && (
                                                        <span className={`px-1.5 py-0.5 text-[10px] rounded border flex items-center gap-1 ${theme === 'dark'
                                                            ? 'bg-purple-900/30 text-purple-300 border-purple-800'
                                                            : 'bg-purple-50 text-purple-600 border-purple-200'
                                                            }`}>
                                                            <Video size={8} /> {shot.camera}
                                                        </span>
                                                    )}
                                                    {shot.time_range && (
                                                        <span className={`text-[10px] ml-auto font-mono ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'
                                                            }`}>{shot.time_range}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 操作 */}
                                            <div className={`flex flex-col items-center gap-3 justify-between border-l pl-6 pr-2 shrink-0 w-16 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
                                                }`}>
                                                <div className="flex flex-col items-center gap-2">
                                                    {(shot.status === 'generating' || shot.status === 'done' || shot.status === 'completed' || shot.status === 'failed' || shot.status === 'error') && (
                                                        <div
                                                            className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center justify-center gap-1 ${theme === 'dark'
                                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                                : 'bg-blue-50 text-blue-600 border border-blue-200'
                                                                }`}
                                                        >
                                                            <Clock size={12} />
                                                            <span>
                                                                {shot.status === 'generating'
                                                                    ? (shotTimers[`${node.id}-${shot.id}`] ? shotTimers[`${node.id}-${shot.id}`].replace('⏱ ', '') : '0.0s')
                                                                    : `${(shot.durationCost || 0).toFixed(1)}s`
                                                                }
                                                            </span>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(t('确定要删除该镜头吗？'))) deleteShot(node.id, shot.id);
                                                        }}
                                                        className={`p-1.5 transition-colors ${theme === 'dark'
                                                            ? 'text-zinc-600 hover:text-red-500'
                                                            : 'text-zinc-400 hover:text-red-600'
                                                            }`}
                                                        title={t('删除镜头')}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                {/* V3.6.1: 生成按钮 - 根据模式调用不同函数 */}
                                                {(() => {
                                                    const mode = normalizeStoryboardMode(node.settings?.mode);
                                                    const outputUrl = mode === 'image' ? shot.output_url : shot.video_url;
                                                    const isDone = shot.status === 'done' && outputUrl;
                                                    return (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (shot.status === 'generating') {
                                                                    // V3.5.20：停止或取消生成
                                                                    updateShot(node.id, shot.id, { status: 'draft', errorMsg: null });
                                                                } else {
                                                                    // V3.6.1: 根据模式调用不同的生成函数
                                                                    if (mode === 'image') {
                                                                        generateSingleImage(node.id, shot);
                                                                    } else {
                                                                        generateSingleShot(node.id, shot);
                                                                    }
                                                                }
                                                            }}
                                                            className={`p-3 rounded text-white shadow-sm transition-all active:scale-95 ${shot.status === 'generating'
                                                                ? 'bg-zinc-500 hover:bg-red-500'
                                                                : isDone
                                                                    ? 'bg-blue-500 hover:bg-green-600'
                                                                    : mode === 'image' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-green-600 hover:bg-green-500'
                                                                }`}
                                                            title={shot.status === 'generating' ? '停止生成' : (isDone ? '重新生成' : `生成${mode === 'image' ? '图片' : '视频'}`)}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                        >
                                                            {shot.status === 'generating' ? (
                                                                <div className="relative w-4 h-4 flex items-center justify-center">
                                                                    <Loader2 size={18} className="animate-spin absolute" />
                                                                    <Square size={14} fill="currentColor" className="opacity-0 hover:opacity-100 absolute z-10 transition-opacity" />
                                                                </div>
                                                            ) : isDone ? (
                                                                <CheckCircle2 size={18} />
                                                            ) : mode === 'image' ? (
                                                                <ImageIcon size={18} />
                                                            ) : (
                                                                <Play size={18} fill="currentColor" />
                                                            )}
                                                        </button>
                                                    );
                                                })()}
                                                {/* V3.5.17：用于手动排序的上移和下移按钮 */}
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <button
                                                        onClick={() => {
                                                            const shots = [...(node.settings?.shots || [])];
                                                            const currentIdx = shots.findIndex(s => s.id === shot.id);
                                                            if (currentIdx > 0) {
                                                                [shots[currentIdx - 1], shots[currentIdx]] = [shots[currentIdx], shots[currentIdx - 1]];
                                                                updateNodeSettings(node.id, { shots });
                                                            }
                                                        }}
                                                        disabled={idx === 0}
                                                        className={`p-1.5 rounded transition-colors ${idx === 0 ? 'opacity-30 cursor-not-allowed' : ''} ${theme === 'dark'
                                                            ? 'text-zinc-500 hover:text-blue-400 hover:bg-zinc-800'
                                                            : 'text-zinc-400 hover:text-blue-500 hover:bg-zinc-100'
                                                            }`}
                                                        title={t('上移')}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <ChevronUp size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const shots = [...(node.settings?.shots || [])];
                                                            const currentIdx = shots.findIndex(s => s.id === shot.id);
                                                            if (currentIdx < shots.length - 1) {
                                                                [shots[currentIdx], shots[currentIdx + 1]] = [shots[currentIdx + 1], shots[currentIdx]];
                                                                updateNodeSettings(node.id, { shots });
                                                            }
                                                        }}
                                                        disabled={idx === (node.settings?.shots?.length || 0) - 1}
                                                        className={`p-1.5 rounded transition-colors ${idx === (node.settings?.shots?.length || 0) - 1 ? 'opacity-30 cursor-not-allowed' : ''} ${theme === 'dark'
                                                            ? 'text-zinc-500 hover:text-blue-400 hover:bg-zinc-800'
                                                            : 'text-zinc-400 hover:text-blue-500 hover:bg-zinc-100'
                                                            }`}
                                                        title={t('下移')}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <ChevronDown size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* V3.6.1: 输出预览区已移至右侧弹出面板 */}
                                        </div>

                                        {/* V3.7.10: 右侧预览面板 - 4图网格 */}
                                        {node.settings?.showOutputPreview && (
                                            <div
                                                className={`shrink-0 p-2 ml-1 flex flex-col gap-2 rounded-lg border transition-all ${theme === 'dark'
                                                    ? 'bg-zinc-900/50 border-zinc-800'
                                                    : theme === 'solarized'
                                                        ? 'bg-[#fdf6e3] border-[#d7cfb2]'
                                                        : 'bg-white border-zinc-200'
                                                    } ${shot.outputEnabled ? (theme === 'dark' ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-300') : ''}`}
                                                style={{ width: previewPanelWidth }}
                                            >
                                                {/* 头部：复选框与状态 */}
                                                <div className="flex items-center justify-between">
                                                    <div
                                                        className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center transition-colors ${shot.outputEnabled
                                                            ? 'bg-blue-500 border-blue-500 text-white'
                                                            : theme === 'dark' ? 'border-zinc-600 hover:border-blue-400' : 'border-zinc-400 hover:border-blue-400'
                                                            }`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            updateShot(node.id, shot.id, { outputEnabled: !shot.outputEnabled });
                                                        }}
                                                        title={shot.outputEnabled ? '取消输出' : '允许输出'}
                                                    >
                                                        {shot.outputEnabled && <Check size={10} />}
                                                    </div>
                                                    {(() => {
                                                        const outputHistoryEntries = Array.isArray(shot.outputHistory) ? shot.outputHistory.filter(Boolean) : [];
                                                        const outputHistoryCount = outputHistoryEntries.length;
                                                        const outputHistoryCursorRaw = Number.isInteger(shot.outputHistoryCursor)
                                                            ? shot.outputHistoryCursor
                                                            : (outputHistoryCount > 0 ? outputHistoryCount - 1 : -1);
                                                        const outputHistoryCursor = outputHistoryCount > 0
                                                            ? Math.max(0, Math.min(outputHistoryCount - 1, outputHistoryCursorRaw))
                                                            : -1;
                                                        const activeHistorySnapshot = outputHistoryCursor >= 0
                                                            ? outputHistoryEntries[outputHistoryCursor]
                                                            : null;
                                                        const snapshotMaterialized = materializeStoryboardOutputFromSnapshot(activeHistorySnapshot, shot);
                                                        const outputImages = Array.isArray(snapshotMaterialized?.output_images)
                                                            ? snapshotMaterialized.output_images
                                                            : (shot.output_images || []);
                                                        const fallbackOutputUrl = String(snapshotMaterialized?.output_url || shot.output_url || '').trim();
                                                        const explicitVideoUrl = String(snapshotMaterialized?.video_url || shot.video_url || '').trim();
                                                        const previewVideoUrl = explicitVideoUrl || (isVideoUrl(fallbackOutputUrl) ? fallbackOutputUrl : '');
                                                        const hasReadyOutput = !!previewVideoUrl || outputImages.length > 0 || (!!fallbackOutputUrl && !isVideoUrl(fallbackOutputUrl));
                                                        const canSwitchHistory = outputHistoryCount > 1;
                                                        const disablePrev = !canSwitchHistory || outputHistoryCursor <= 0;
                                                        const disableNext = !canSwitchHistory || outputHistoryCursor >= (outputHistoryCount - 1);
                                                        return (
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        switchStoryboardShotOutputHistory(node.id, shot.id, -1);
                                                                    }}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    disabled={disablePrev}
                                                                    className={`p-0.5 rounded transition-colors ${disablePrev
                                                                        ? 'opacity-30 cursor-not-allowed'
                                                                        : (theme === 'dark'
                                                                            ? 'text-zinc-300 hover:text-blue-300 hover:bg-zinc-800'
                                                                            : 'text-zinc-600 hover:text-blue-700 hover:bg-zinc-100')
                                                                        }`}
                                                                    title={t('上一版')}
                                                                >
                                                                    <ChevronLeft size={13} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        switchStoryboardShotOutputHistory(node.id, shot.id, 1);
                                                                    }}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    disabled={disableNext}
                                                                    className={`p-0.5 rounded transition-colors ${disableNext
                                                                        ? 'opacity-30 cursor-not-allowed'
                                                                        : (theme === 'dark'
                                                                            ? 'text-zinc-300 hover:text-blue-300 hover:bg-zinc-800'
                                                                            : 'text-zinc-600 hover:text-blue-700 hover:bg-zinc-100')
                                                                        }`}
                                                                    title={t('下一版')}
                                                                >
                                                                    <ChevronRight size={13} />
                                                                </button>
                                                                <span className={`text-[10px] font-mono min-w-[2.6rem] text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                    {canSwitchHistory ? `${outputHistoryCursor + 1}/${outputHistoryCount}` : '-'}
                                                                </span>
                                                                <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                    {hasReadyOutput ? '已就绪' : '等待'}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                {/* 四宫格图像或单张缩略图 */}
                                                {(() => {
                                                    const outputHistoryEntries = Array.isArray(shot.outputHistory) ? shot.outputHistory.filter(Boolean) : [];
                                                    const outputHistoryCount = outputHistoryEntries.length;
                                                    const outputHistoryCursorRaw = Number.isInteger(shot.outputHistoryCursor)
                                                        ? shot.outputHistoryCursor
                                                        : (outputHistoryCount > 0 ? outputHistoryCount - 1 : -1);
                                                    const outputHistoryCursor = outputHistoryCount > 0
                                                        ? Math.max(0, Math.min(outputHistoryCount - 1, outputHistoryCursorRaw))
                                                        : -1;
                                                    const activeHistorySnapshot = outputHistoryCursor >= 0
                                                        ? outputHistoryEntries[outputHistoryCursor]
                                                        : null;
                                                    const snapshotMaterialized = materializeStoryboardOutputFromSnapshot(activeHistorySnapshot, shot);
                                                    const outputImages = Array.isArray(snapshotMaterialized?.output_images)
                                                        ? snapshotMaterialized.output_images
                                                        : (shot.output_images || []);
                                                    const selectedIndex = Number.isInteger(shot.selectedImageIndex)
                                                        ? shot.selectedImageIndex
                                                        : (Number.isInteger(snapshotMaterialized?.selectedImageIndex)
                                                            ? snapshotMaterialized.selectedImageIndex
                                                            : 0);
                                                    const fallbackOutputUrl = String(snapshotMaterialized?.output_url || shot.output_url || '').trim();
                                                    const explicitVideoUrl = String(snapshotMaterialized?.video_url || shot.video_url || '').trim();
                                                    const previewVideoUrl = explicitVideoUrl || (isVideoUrl(fallbackOutputUrl) ? fallbackOutputUrl : '');
                                                    const configuredMode = normalizeStoryboardMode(node.settings?.mode);
                                                    const mode = (activeHistorySnapshot?.mode === 'video' || previewVideoUrl || configuredMode === 'video')
                                                        ? 'video'
                                                        : 'image';
                                                    const getPreviewBgClass = (index) => theme === 'solarized'
                                                        ? (index % 2 === 0 ? 'bg-[#fdf6e3]' : 'bg-[#eee8d5]')
                                                        : '';

                                                    // 视频模式 - 显示单个视频缩略图
                                                    if (mode === 'video') {
                                                        return (
                                                            <div
                                                                className={`flex-1 min-h-[80px] rounded overflow-hidden relative group/preview cursor-pointer border ${theme === 'dark'
                                                                    ? 'border-zinc-800 bg-black'
                                                                    : theme === 'solarized'
                                                                        ? `border-[#eee8d5] ${getPreviewBgClass(0)}`
                                                                        : 'border-zinc-200 bg-zinc-50'
                                                                    }`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (previewVideoUrl) setLightboxItem({ url: previewVideoUrl, type: 'video', prompt: shot.prompt });
                                                                }}
                                                            >
                                                                {previewVideoUrl ? (
                                                                    <video src={previewVideoUrl} className="w-full h-full object-cover" muted />
                                                                ) : (
                                                                    <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                                                        <Eye size={16} />
                                                                    </div>
                                                                )}
                                                                {previewVideoUrl && (
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 flex items-center justify-center transition-opacity">
                                                                        <Maximize2 size={16} className="text-white drop-shadow-md" />
                                                                    </div>
                                                                )}
                                                                {/* V3.7.10: 视频文件名 */}
                                                                {shot.video_filename && (
                                                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate opacity-0 group-hover/preview:opacity-100 transition-opacity" title={shot.video_filename}>
                                                                        {shot.video_filename}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    // 图片模式 - V3.7.12: 激活=1大+3小(始终), 非激活=2x2
                                                    // selectedIndex >= 0 表示选中了某张图，-1 表示未选中
                                                    // outputEnabled=true 时锁定选择，不能再改
                                                    const isLocked = shot.outputEnabled;
                                                    const hasSelection = selectedIndex >= 0;
                                                    const displayMainIndex = hasSelection ? selectedIndex : 0; // 大图始终显示第一张或选中的

                                                    if (outputImages.length >= 2) {
                                                        if (isActiveShot) {
                                                            // 激活状态: 始终 1大图 + 3小图
                                                            const mainImg = outputImages[displayMainIndex] || outputImages[0];
                                                            const thumbnails = outputImages.slice(0, 4).map((img, idx) => ({ img, idx })).filter(item => item.idx !== displayMainIndex);
                                                            return (
                                                                <div className="flex flex-col gap-1 flex-1 min-h-[100px]">
                                                                    {/* 主图 - 点击切换选中状态 */}
                                                                    <div
                                                                        className={`relative flex-1 rounded border overflow-hidden transition-all group/main ${hasSelection ? 'border-blue-500 ring-1 ring-blue-500/50' : (theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300')} ${theme === 'solarized' ? getPreviewBgClass(displayMainIndex) : ''} ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!isLocked && !hasSelection) {
                                                                                updateShot(node.id, shot.id, { selectedImageIndex: displayMainIndex });
                                                                            }
                                                                        }}
                                                                        onDoubleClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setLightboxItem({
                                                                                url: mainImg,
                                                                                type: 'image',
                                                                                prompt: shot.prompt,
                                                                                mjImages: outputImages,
                                                                                selectedMjImageIndex: displayMainIndex,
                                                                                storyboardContext: { nodeId: node.id, shotId: shot.id, shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id), allShots: node.settings?.shots || [] }
                                                                            });
                                                                        }}
                                                                        onContextMenu={(e) => {
                                                                            // V3.7.29: 1大图+3小图模式的右键预览
                                                                            handlePreviewRightClick(e, {
                                                                                url: mainImg,
                                                                                type: 'image',
                                                                                prompt: shot.prompt,
                                                                                mjImages: outputImages,
                                                                                selectedMjImageIndex: displayMainIndex,
                                                                                sourceNode: node
                                                                            });
                                                                        }}
                                                                    >
                                                                        <LazyBase64Image src={mainImg} className="w-full h-full object-cover" />
                                                                        <div className={`absolute top-0 left-0 text-[8px] px-1 py-0.5 rounded-br ${hasSelection ? 'bg-blue-500 text-white' : 'bg-black/50 text-white'}`}>{displayMainIndex + 1}</div>
                                                                        {/* 选中时显示勾 */}
                                                                        {hasSelection && (
                                                                            <div className="absolute top-0 right-0 bg-blue-500 text-white p-0.5 rounded-bl"><Check size={10} /></div>
                                                                        )}
                                                                        {/* 锁定标识 */}
                                                                        {isLocked && (
                                                                            <div className="absolute top-1 right-1 bg-yellow-500 text-black p-0.5 rounded text-[8px]">🔒</div>
                                                                        )}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setLightboxItem({
                                                                                    url: mainImg,
                                                                                    type: 'image',
                                                                                    prompt: shot.prompt,
                                                                                    mjImages: outputImages,
                                                                                    selectedMjImageIndex: displayMainIndex,
                                                                                    // V3.7.21: 镜头导航上下文
                                                                                    storyboardContext: {
                                                                                        nodeId: node.id,
                                                                                        shotId: shot.id,
                                                                                        shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id),
                                                                                        allShots: node.settings?.shots || []
                                                                                    }
                                                                                });
                                                                            }}
                                                                            className="absolute bottom-0 left-0 p-0.5 rounded-tr bg-black/60 text-white hover:bg-blue-500 opacity-0 group-hover/main:opacity-100 transition-opacity z-10"
                                                                            title={t('预览原图')}
                                                                        >
                                                                            <Maximize2 size={10} />
                                                                        </button>
                                                                    </div>
                                                                    {/* 缩略图行 - 点击切换到该图 */}
                                                                    <div className="flex gap-1 h-10 shrink-0">
                                                                        {thumbnails.map(({ img, idx }) => (
                                                                            <div
                                                                                key={idx}
                                                                                className={`relative flex-1 rounded border overflow-hidden transition-all group/thumb ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'} ${theme === 'solarized' ? getPreviewBgClass(idx) : ''} ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-400'}`}
                                                                                onClick={(e) => { e.stopPropagation(); if (!isLocked) updateShot(node.id, shot.id, { selectedImageIndex: idx }); }}
                                                                                onDoubleClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setLightboxItem({
                                                                                        url: img,
                                                                                        type: 'image',
                                                                                        prompt: shot.prompt,
                                                                                        mjImages: outputImages,
                                                                                        selectedMjImageIndex: idx,
                                                                                        storyboardContext: { nodeId: node.id, shotId: shot.id, shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id), allShots: node.settings?.shots || [] }
                                                                                    });
                                                                                }}
                                                                                onContextMenu={(e) => {
                                                                                    // V3.7.29: 缩略图右键预览
                                                                                    handlePreviewRightClick(e, {
                                                                                        url: img,
                                                                                        type: 'image',
                                                                                        prompt: shot.prompt,
                                                                                        mjImages: outputImages,
                                                                                        selectedMjImageIndex: idx,
                                                                                        sourceNode: node
                                                                                    });
                                                                                }}
                                                                            >
                                                                                <LazyBase64Image src={img} className="w-full h-full object-cover" />
                                                                                <div className="absolute top-0 left-0 bg-black/50 text-white text-[7px] px-0.5">{idx + 1}</div>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setLightboxItem({
                                                                                            url: img,
                                                                                            type: 'image',
                                                                                            prompt: shot.prompt,
                                                                                            mjImages: outputImages,
                                                                                            selectedMjImageIndex: idx,
                                                                                            storyboardContext: { nodeId: node.id, shotId: shot.id, shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id), allShots: node.settings?.shots || [] }
                                                                                        });
                                                                                    }}
                                                                                    className="absolute bottom-0 left-0 p-0.5 rounded-tr bg-black/60 text-white hover:bg-blue-500 opacity-0 group-hover/thumb:opacity-100 transition-opacity z-10"
                                                                                    title={t('预览原图')}
                                                                                >
                                                                                    <Maximize2 size={8} />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        } else {
                                                            // 非激活状态: 2x2 四格
                                                            return (
                                                                <div className="grid grid-cols-2 gap-1 flex-1 min-h-[100px]">
                                                                    {outputImages.slice(0, 4).map((img, idx) => (
                                                                        <div
                                                                            key={idx}
                                                                            className={`relative rounded border overflow-hidden transition-all group/cell ${selectedIndex === idx
                                                                                ? 'border-blue-500 ring-1 ring-blue-500/50'
                                                                                : theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'
                                                                                } ${theme === 'solarized' ? getPreviewBgClass(idx) : ''} ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-blue-400'}`}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (!isLocked) updateShot(node.id, shot.id, { selectedImageIndex: selectedIndex === idx ? -1 : idx });
                                                                            }}
                                                                            onDoubleClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setLightboxItem({
                                                                                    url: img,
                                                                                    type: 'image',
                                                                                    prompt: shot.prompt,
                                                                                    mjImages: outputImages,
                                                                                    selectedMjImageIndex: idx,
                                                                                    storyboardContext: { nodeId: node.id, shotId: shot.id, shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id), allShots: node.settings?.shots || [] }
                                                                                });
                                                                            }}
                                                                            onContextMenu={(e) => {
                                                                                // V3.7.29: 右键菜单支持
                                                                                handlePreviewRightClick(e, {
                                                                                    url: img,
                                                                                    type: 'image',
                                                                                    prompt: shot.prompt,
                                                                                    mjImages: outputImages,
                                                                                    selectedMjImageIndex: idx,
                                                                                    sourceNode: node
                                                                                });
                                                                            }}
                                                                        >
                                                                            <LazyBase64Image src={img} className="w-full h-full object-cover" />
                                                                            <div className={`absolute top-0 left-0 text-[7px] px-0.5 rounded-br ${selectedIndex === idx ? 'bg-blue-500 text-white' : 'bg-black/50 text-white'}`}>{idx + 1}</div>
                                                                            {selectedIndex === idx && (
                                                                                <div className="absolute top-0 right-0 bg-blue-500 text-white p-0.5 rounded-bl"><Check size={8} /></div>
                                                                            )}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setLightboxItem({
                                                                                        url: img,
                                                                                        type: 'image',
                                                                                        prompt: shot.prompt,
                                                                                        mjImages: outputImages,
                                                                                        selectedMjImageIndex: idx,
                                                                                        // V3.7.21: 镜头导航上下文
                                                                                        storyboardContext: {
                                                                                            nodeId: node.id,
                                                                                            shotId: shot.id,
                                                                                            // 获取镜头在数组中的正确索引
                                                                                            shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id),
                                                                                            allShots: node.settings?.shots || []
                                                                                        }
                                                                                    });
                                                                                }}
                                                                                className="absolute bottom-0 left-0 p-0.5 rounded-tr bg-black/60 text-white hover:bg-blue-500 opacity-0 group-hover/cell:opacity-100 transition-opacity z-10"
                                                                                title={t('预览原图')}
                                                                            >
                                                                                <Maximize2 size={8} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        }
                                                    }

                                                    // 单图或无图 - 显示单个缩略图
                                                    const singleUrl = outputImages[0] || activeHistorySnapshot?.output_url || shot.output_url;
                                                    const singleHasSelection = selectedIndex === 0;
                                                    return (
                                                        <div
                                                            className={`flex-1 min-h-[80px] rounded overflow-hidden relative group/preview border ${singleHasSelection
                                                                ? 'border-blue-500 ring-1 ring-blue-500/50'
                                                                : (theme === 'dark'
                                                                    ? 'border-zinc-800'
                                                                    : theme === 'solarized'
                                                                        ? 'border-[#eee8d5]'
                                                                        : 'border-zinc-200')
                                                                } ${theme === 'dark'
                                                                ? 'bg-black'
                                                                : theme === 'solarized'
                                                                    ? `${getPreviewBgClass(0)}`
                                                                    : 'bg-zinc-50'
                                                                } ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (!singleUrl || isLocked) return;
                                                                updateShot(node.id, shot.id, { selectedImageIndex: singleHasSelection ? -1 : 0 });
                                                            }}
                                                            onDoubleClick={(e) => {
                                                                e.stopPropagation();
                                                                if (!singleUrl) return;
                                                                setLightboxItem({
                                                                    url: singleUrl,
                                                                    type: 'image',
                                                                    prompt: shot.prompt,
                                                                    mjImages: [singleUrl],
                                                                    selectedMjImageIndex: 0,
                                                                    storyboardContext: { nodeId: node.id, shotId: shot.id, shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id), allShots: node.settings?.shots || [] }
                                                                });
                                                            }}
                                                            onContextMenu={(e) => {
                                                                // V3.7.29: 右键菜单支持
                                                                if (singleUrl) handlePreviewRightClick(e, {
                                                                    url: singleUrl,
                                                                    type: 'image',
                                                                    prompt: shot.prompt,
                                                                    mjImages: [singleUrl],
                                                                    selectedMjImageIndex: 0,
                                                                    sourceNode: node
                                                                });
                                                            }}
                                                        >
                                                            {singleUrl ? (
                                                                <LazyBase64Image src={singleUrl} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                                                    <Eye size={16} />
                                                                </div>
                                                            )}
                                                            {singleUrl && (
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 flex items-center justify-center transition-opacity">
                                                                    <Maximize2 size={16} className="text-white drop-shadow-md" />
                                                                </div>
                                                            )}
                                                            {singleUrl && (
                                                                <div className={`absolute top-0 left-0 text-[8px] px-1 py-0.5 rounded-br ${singleHasSelection ? 'bg-blue-500 text-white' : 'bg-black/50 text-white'}`}>1</div>
                                                            )}
                                                            {singleHasSelection && (
                                                                <div className="absolute top-0 right-0 bg-blue-500 text-white p-0.5 rounded-bl"><Check size={8} /></div>
                                                            )}
                                                            {singleUrl && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setLightboxItem({
                                                                            url: singleUrl,
                                                                            type: 'image',
                                                                            prompt: shot.prompt,
                                                                            mjImages: [singleUrl],
                                                                            selectedMjImageIndex: 0,
                                                                            storyboardContext: { nodeId: node.id, shotId: shot.id, shotIndex: (node.settings?.shots || []).findIndex(s => s.id === shot.id), allShots: node.settings?.shots || [] }
                                                                        });
                                                                    }}
                                                                    className="absolute bottom-0 left-0 p-0.5 rounded-tr bg-black/60 text-white hover:bg-blue-500 opacity-0 group-hover/preview:opacity-100 transition-opacity z-10"
                                                                    title={t('预览原图')}
                                                                >
                                                                    <Maximize2 size={8} />
                                                                </button>
                                                            )}
                                                            {/* V3.7.10: 图片文件名 */}
                                                            {shot.image_filename && (
                                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate opacity-0 group-hover/preview:opacity-100 transition-opacity" title={shot.image_filename}>
                                                                    {shot.image_filename}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                    </div>{/* 外层容器结束 */}
                                </Fragment>
                            );
                        })
                    ) : (
                        <div
                            className={`flex flex-col items-center justify-center h-40 gap-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${theme === 'dark'
                                ? 'border-zinc-800 text-zinc-600 hover:border-zinc-700'
                                : 'border-zinc-300 text-zinc-400 hover:border-blue-300 hover:text-blue-500'
                                }`}
                            onClick={() => addEmptyShot(node.id)}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <LayoutGrid size={32} className="opacity-50" />
                            <span className="text-xs">{t('暂无分镜，请添加或同步分析结果')}</span>
                        </div>
                    )
                    )}
                </div>

                {/* 底部 */}
                <div className={`p-3 border-t shrink-0 ${theme === 'dark'
                    ? 'bg-zinc-900 border-zinc-800'
                    : theme === 'solarized'
                        ? 'bg-[#eee8d5] border-[#eee8d5]'
                        : 'bg-zinc-50 border-zinc-200'
                    }`}>
                    {normalizeStoryboardViewMode(node.settings?.viewMode) === 'cards' ? (
                        <button
                            onClick={() => addEmptyShot(node.id)}
                            className={`w-full py-2 border border-dashed text-xs rounded transition-colors flex items-center justify-center gap-2 ${theme === 'dark'
                                ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                                : 'border-zinc-300 text-zinc-500 hover:bg-white hover:text-blue-600 hover:border-blue-400'
                                }`}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <Plus size={14} /> {t('添加空白镜头')}
                        </button>
                    ) : (
                        <button
                            onClick={() => updateNodeSettings(node.id, { viewMode: 'cards' })}
                            className={`w-full py-2 border text-xs rounded transition-colors ${theme === 'dark'
                                ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                : 'border-zinc-300 text-zinc-600 hover:bg-white'
                                }`}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {t('切换到卡片视图')}
                        </button>
                    )}
                </div>
            </div>

            {/* V3.6.1: 独立右侧面板已移除，改用行内布局实现对齐 */}
        </div>
    );
}

export default StoryboardNodeContent;
