import { uiText } from '../../../../i18n/uiText'
import CanvasAssetIssues from '../components/CanvasAssetIssues';
import { canvasAlert, canvasConfirm } from '../canvasDialogs';
import PreviewEmptyState from '../components/PreviewEmptyState';
import { getPreviewConnectionStatus } from '../canvasPreviewConnectionStatus';
import { writeClipboardText } from '../canvasPreviewActions'
import { isCanvasInteractiveTarget } from '../canvasInteractions'
import { applyVideoMetadata } from '../canvasVideoInput';
import CanvasLibraryNode from '../components/CanvasLibraryNode';
import CanvasTextModelSelect from '../components/CanvasTextModelSelect';
import React from 'react';
import {
    Plus,
    Image as ImageIcon,
    Video,
    X,
    Wand2,
    Loader2,
    Link as LinkIcon,
    ImagePlus,
    Trash2,
    CheckCircle2,
    Square,
    CopyPlus,
    ArrowRightSquare,
    MessageSquare,
    FileText,
    FileVideo,
    User,
    Users,
    Maximize2,
    FileSearch,
    Sparkles,
    Mic2,
    Camera,
    Code,
    ClipboardCopy,
    CheckSquare,
    FolderOpen,
    HardDrive,
    ChevronDown,
    ChevronUp,
    UploadCloud
} from 'lucide-react';
import GenerationNodeContent from '../components/GenerationNodeContent';
import StoryboardNodeContent from '../components/StoryboardNodeContent';
import {
    t,
    LazyBase64Image,
    ResolvedVideo,
    MaskEditor,
    DEFAULT_BASE_URL,
    normalizeVideoResolution,
    isImageModelType,
    isChatModelType,
    normalizeStoryboardMode,
    getValueLabelWithNotes,
    getImageDimensions,
    isVideoUrl,
    ImageCompareView
} from '../freeCanvasShared';

export function createNodeRenderer({
    sendPreviewToCanvas,
    DESCRIPTION_STYLE_OPTIONS,
    activeDropdown,
    activeShot,
    addEmptyShot,
    addNode,
    addPromptLibraryItem,
    adjacentNodesCache,
    apiConfigs,
    applyLibraryPrompt,
    applyNodeModelSelection,
    batchConcurrency,
    batchQueueItems,
    batchRunningItems,
    batchStateRef,
    batchTaskCounterRef,
    beginNodeDragSession,
    canvasCloud,
    captureStoryboardWorkspaceHeight,
    characterLibrary,
    characterReferenceBarExpanded,
    clearNodeQueue,
    cloudDocument,
    connectingInputType,
    connectingSource,
    connectingTarget,
    connections,
    connectionsByNode,
    createCharacterEndpoint,
    deleteNode,
    deleteShot,
    dragInsertIndex,
    dragInsertNodeId,
    dragNodeId,
    dragOverNodeId,
    dragPriorityNodeIdsRef,
    ensureCharacterVideoSuffix,
    ensureImageNodeForDescription,
    ensureVideoNodeForDescription,
    exportStoryboardPromptSlots,
    generateCharacterPrompt,
    generateScenePrompt,
    generateSingleImage,
    generateSingleShot,
    generateFullWorkflow,
    getApiConfigByKey,
    getApiCredentials,
    getConnectedImageForInput,
    getConnectedInputImages,
    getConnectedTextNodes,
    getConnectedVideoInputNode,
    getDefaultCustomParamsForModel,
    getDefaultDurationForModel,
    getDefaultDurationsForModel,
    getDescriptionStylePrefix,
    getFirstEnabledModelKey,
    getLocalSaveMediaItems,
    getModelLabelWithProvider,
    getPreferredImageResolutionForModel,
    getPreferredModelRatio,
    getPreferredVideoResolutionForModel,
    getRatiosForModel,
    getResolutionsForModel,
    getStatusColor,
    getStoryboardPromptMemoryStorageKey,
    getStoryboardPromptSlotKey,
    getStoryboardPromptTemplate,
    getVideoResolutionsForModel,
    groupedApiConfigs,
    handleAutoExtractKeyframes,
    handleAutoVideoAnalysis,
    handleCanvasDragOver,
    handleDescReferenceDrop,
    handleDescReferenceSelect,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleExtractAnalysis,
    handleFileUpload,
    handleGenNodeDrop,
    handleGeneratePrompts,
    handleInputImageRightClick,
    handleKeyframeContainerDragOver,
    handleKeyframeItemDragOver,
    handleKeyframeListDrop,
    handleNodeMouseUp,
    handleNovelExtract,
    handlePreviewDrop,
    handlePreviewRightClick,
    handleSmartExtractKeyframes,
    handleStoryboardBatchDownload,
    handleToggleKeyframe,
    handleVideoAnalyzeDrop,
    handleVideoDrop,
    handleVideoFileUpload,
    history,
    hoverTargetId,
    hoveredProvider,
    importStoryboardMarkdownTable,
    importStoryboardPromptSlots,
    importStoryboardTableFromFile,
    language,
    lastUsedImageModel,
    lastUsedImageResolution,
    lastUsedVideoModel,
    lastUsedVideoResolution,
    localCacheServerConnected,
    localServerUrl,
    localStorage,
    markInteraction,
    mutateStoryboardTable,
    navigateStoryboardShotByDelta,
    nodeConnectedStatus,
    nodeTimers,
    nodesMap,
    normalizeStoryboardTableData,
    openFrameContextMenu,
    openStoryboardTableCellEditor,
    pasteStoryboardTableFromClipboard,
    promptLibrary,
    promptLibraryCollapsed,
    promptLibraryEditorOpen,
    promptLibraryForm,
    removePromptLibraryItem,
    removeQueuedBatchItem,
    renderCustomParamInputs,
    resolveHistoryUrl,
    resolveModelKey,
    resolveNodeRenderZIndex,
    runDescriptionPromptAction,
    runLocalSaveBatch,
    runStoryboardLlmSplit,
    runStoryboardTablePromptMerge,
    saveToUndoStack,
    screenToWorld,
    selectedNodeId,
    selectedNodeIds,
    setActiveDropdown,
    setActiveShot,
    setBatchConcurrency,
    setBatchGroups,
    setBatchQueue,
    setBatchTick,
    setCharacterLibrary,
    setCharacterReferenceBarExpanded,
    setCharactersOpen,
    setChatFiles,
    setConnectingInputType,
    setConnectingSource,
    setConnectingTarget,
    setConnections,
    setDragInsertIndex,
    setDragInsertNodeId,
    setDragNodeId,
    setHoverTargetId,
    setHoveredProvider,
    setIsChatOpen,
    setIsMouseOverStoryboard,
    setLastUsedAnalyzeModel,
    setLastUsedExtractModel,
    setLastUsedImageModel,
    setLastUsedImageResolution,
    setLastUsedRatio,
    setLastUsedSegmentDuration,
    setLastUsedVideoModel,
    setLastUsedVideoResolution,
    setLightboxItem,
    setMousePos,
    setNodes,
    setPromptLibraryCollapsed,
    setPromptLibraryEditorOpen,
    setPromptLibraryForm,
    setResizingNodeId,
    setSelectedNodeId,
    setSelectedNodeIds,
    setSettingsOpen,
    shotBatchMapRef,
    shotTimers,
    showToast,
    startGeneration,
    stopRunningShot,
    stripCharacterVideoSuffix,
    switchStoryboardShotOutputHistory,
    testLocalSaveServer,
    theme,
    touchNodeSelectionPriority,
    updateNodeSettings,
    updateShot,
    view,
}) {
    // Capture dependencies once per render, rather than allocate them for every node.
    return (node) => {
        // LOD (Level of Detail) 阈值
        const LOD_THRESHOLD = 0.4;
        const isLowDetail = view.zoom < LOD_THRESHOLD;

        const isSelected = selectedNodeId === node.id || selectedNodeIds.has(node.id);
        const connectedImages = !isLowDetail || node.type === 'input-image' ? getConnectedInputImages(node.id) : [];
        const isHoverTarget = hoverTargetId === node.id;
        // 使用缓存的连接状态，O(1) 查找
        const isConnected = nodeConnectedStatus.get(node.id) || false;
        // 判断节点是否正在被拖动（包括多选拖动），用于提升 z-index 避免被遮挡
        const isDragging = dragNodeId === node.id || (dragNodeId && selectedNodeIds.has(node.id));
        const nodeZIndex = resolveNodeRenderZIndex(node.id, !!isDragging, !!isSelected);
        const inputImageDisplayContent = node.type === 'input-image'
            ? String(node.content || connectedImages[0] || '')
            : String(node.content || '');
        const hasLinkedInputImage = node.type === 'input-image' && !node.content && !!inputImageDisplayContent;

        // 功能3：检查是否为相邻节点（当有节点被选中时）- 使用缓存的相邻节点集合
        const selectedId = selectedNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
        const adjacentSet = selectedId ? adjacentNodesCache.get(selectedId) : null;
        const isAdjacent = selectedId && selectedId !== node.id && adjacentSet && adjacentSet.has(node.id);

        const enableSmartDrop = node.type === 'gen-image' || node.type === 'gen-video' || node.type === 'image-compare';

        // 低细节模式：只渲染核心内容
        if (isLowDetail) {
            return (
                <div
                    key={node.id}
                    data-node-id={node.id}
                    data-node-type={node.type}
                    data-node-theme={theme}
                    className={`absolute canvas-node canvas-node--compact node-wrapper flex flex-col ${isSelected
                        ? 'ring-1 ring-blue-500'
                        : theme === 'dark'
                            ? 'border border-zinc-800'
                        : theme === 'solarized'
                            ? 'border border-[#eee8d5]'
                        : 'border border-zinc-200'
                        } ${theme === 'dark' ? 'bg-[#18181b]' : theme === 'solarized' ? 'bg-[#eee8d5]' : 'bg-white'}`}
                    style={{
                        left: node.x,
                        top: node.y,
                        width: node.width,
                        height: node.height,
                        cursor: (dragNodeId === node.id || (dragNodeId && selectedNodeIds.has(node.id))) ? 'grabbing' : 'default',
                        zIndex: nodeZIndex,
                        border: `1px solid ${theme === 'dark' ? '#3f3f46' : theme === 'solarized' ? '#eee8d5' : '#e4e4e7'}`,
                        background: theme === 'dark' ? '#18181b' : theme === 'solarized' ? '#eee8d5' : '#fff',
                        boxShadow: 'none',
                        borderRadius: '0',
                        transform: 'translateZ(0)',
                        backfaceVisibility: 'hidden'
                    }}
                    onDragOver={enableSmartDrop ? handleCanvasDragOver : undefined}
                    onDrop={enableSmartDrop ? (e) => handleGenNodeDrop(node.id, e) : undefined}
                    onMouseDownCapture={(e) => {
                        if (e.button !== 0 || e.target === e.currentTarget) return;
                        const interactive = isCanvasInteractiveTarget(e.target);
                        if (!interactive) return;
                        touchNodeSelectionPriority(node.id);
                        if (e.nativeEvent) e.nativeEvent.__tapnowSelectionHandled = true;
                        if (e.ctrlKey || e.metaKey) {
                            setSelectedNodeIds(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(node.id)) {
                                    newSet.delete(node.id);
                                } else {
                                    newSet.add(node.id);
                                }
                                if (newSet.size === 1) {
                                    setSelectedNodeId(Array.from(newSet)[0]);
                                } else {
                                    setSelectedNodeId(null);
                                }
                                return newSet;
                            });
                            return;
                        }
                        const isAlreadySelected = selectedNodeIds.has(node.id);
                        if (isAlreadySelected && selectedNodeIds.size > 1) {
                            setSelectedNodeId(node.id);
                        } else {
                            setSelectedNodeId(node.id);
                            setSelectedNodeIds(new Set([node.id]));
                        }
                    }}
                    onMouseDown={(e) => {
                        if (e.nativeEvent?.__tapnowSelectionHandled) { e.stopPropagation(); return; }
                        if (e.button === 0) {
                            touchNodeSelectionPriority(node.id);
                            e.stopPropagation();
                            markInteraction('node');
                            if (e.ctrlKey || e.metaKey) {
                                setSelectedNodeIds(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(node.id)) {
                                        newSet.delete(node.id);
                                    } else {
                                        newSet.add(node.id);
                                    }
                                    if (newSet.size === 1) {
                                        setSelectedNodeId(Array.from(newSet)[0]);
                                    } else {
                                        setSelectedNodeId(null);
                                    }
                                    return newSet;
                                });
                            } else {
                                const isAlreadySelected = selectedNodeIds.has(node.id);
                                if (isAlreadySelected && selectedNodeIds.size > 1) {
                                    setSelectedNodeId(node.id);
                                } else {
                                    setSelectedNodeId(node.id);
                                    setSelectedNodeIds(new Set([node.id]));
                                }
                            }
                            const dragNodeIds = (selectedNodeIds.size > 1 && selectedNodeIds.has(node.id))
                                ? Array.from(selectedNodeIds)
                                : [node.id];
                            const orderedDragNodeIds = [
                                ...dragNodeIds.filter((id) => id !== node.id),
                                node.id
                            ];
                            dragPriorityNodeIdsRef.current = orderedDragNodeIds;
                            beginNodeDragSession(node.id, orderedDragNodeIds, e.clientX, e.clientY);
                            setDragNodeId(node.id);
                        }
                    }}
                    onMouseEnter={() => { if (connectingSource || connectingTarget) setHoverTargetId(node.id); }}
                    onMouseLeave={() => { if ((connectingSource || connectingTarget) && hoverTargetId === node.id) setHoverTargetId(null); }}
                    onMouseUp={(e) => handleNodeMouseUp(node.id, e)}
                >
                    {/* 仅显示核心图片/视频 */}
                    {node.type === 'input-image' && inputImageDisplayContent && (
                        <div className="w-full h-full relative">
                            {isVideoUrl(inputImageDisplayContent) ? (
                                <ResolvedVideo
                                    src={inputImageDisplayContent}
                                    className="w-full h-full object-cover opacity-80"
                                    muted
                                    playsInline
                                />
                            ) : (
                                <LazyBase64Image
                                    src={inputImageDisplayContent}
                                    className="w-full h-full object-cover opacity-80"
                                    alt=""
                                />
                            )}
                        </div>
                    )}
                    {node.type === 'video-input' && node.content && (
                        <ResolvedVideo
                            src={node.content}
                            className="w-full h-full object-cover opacity-80"
                            muted
                            playsInline
                        />
                    )}
                    {!(node.type === 'input-image' ? inputImageDisplayContent : node.content) && (
                        <div className={`p-2 font-bold text-sm truncate ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                            {node.type === 'input-image' ? uiText("图片") :
                                node.type === 'video-input' ? uiText("视频") :
                                    node.type === 'gen-image' ? uiText("生成图片") :
                                        node.type === 'gen-image' ? uiText("生成图片") :
                                            node.type === 'gen-video' ? uiText("生成视频") :
                                                node.type === 'text-node' ? uiText("文字") :
                                                    node.type === 'preview' ? uiText("预览") :
                                                        node.type === 'novel-input' ? uiText("小说输入") :
                                                            node.type === 'extract-characters-scenes' ? uiText("提取角色和场景") :
                                                                node.type === 'character-description' ? uiText("角色描述") :
                                                                    node.type === 'scene-description' ? uiText("场景描述") :
                                                                        node.type === 'generate-character-video' ? uiText("生成角色视频") :
                                                                            node.type === 'generate-scene-video' ? uiText("生成场景视频") :
                                                                                node.type === 'generate-character-image' ? uiText("生成角色图片") :
                                                                                    node.type === 'generate-scene-image' ? uiText("生成场景图片") :
                                                                                        node.type === 'create-character' ? uiText("创建角色") :
                                                                                            node.type === 'create-scene' ? uiText("创建场景") :
                                                                                                node.type === 'save-to-local' ? uiText("保存到本地") :
                                                                                                    node.type === 'local-save' ? uiText("保存到本地") :
                                                                                                        node.type || uiText("节点")}
                        </div>
                    )}

                    {/* 保留连接点占位符，确保连线位置正确（简化样式） */}
                    {node.type !== 'input-image' && node.type !== 'video-input' && node.type !== 'video-analyze' && node.type !== 'preview' && (
                        node.type === 'image-compare' ? (
                            <>
                                <div
                                    className="input-point"
                                    style={{
                                        top: '33%',
                                        left: '-0.25rem',
                                        width: '0.5rem',
                                        height: '0.5rem',
                                        backgroundColor: isConnected ? '#60a5fa' : '#52525b',
                                        borderRadius: '50%',
                                        position: 'absolute',
                                        zIndex: 20,
                                        pointerEvents: 'auto'
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        const world = screenToWorld(e.clientX, e.clientY);
                                        setMousePos(world);
                                        setConnectingTarget(node.id);
                                        setConnectingInputType('default');
                                    }}
                                    onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'default')}
                                />
                                <div
                                    className="input-point"
                                    style={{
                                        top: '66%',
                                        left: '-0.25rem',
                                        width: '0.5rem',
                                        height: '0.5rem',
                                        backgroundColor: isConnected ? '#60a5fa' : '#52525b',
                                        borderRadius: '50%',
                                        position: 'absolute',
                                        zIndex: 20,
                                        pointerEvents: 'auto'
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        const world = screenToWorld(e.clientX, e.clientY);
                                        setMousePos(world);
                                        setConnectingTarget(node.id);
                                        setConnectingInputType('default');
                                    }}
                                    onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'default')}
                                />
                            </>
                        ) : (
                            <div
                                className="input-point"
                                style={{
                                    top: '50%',
                                    left: '-0.25rem',
                                    width: '0.5rem',
                                    height: '0.5rem',
                                    backgroundColor: isConnected ? '#60a5fa' : '#52525b',
                                    borderRadius: '50%',
                                    position: 'absolute',
                                    zIndex: 20,
                                    pointerEvents: 'auto'
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setMousePos(world);
                                    setConnectingTarget(node.id);
                                    setConnectingInputType('default');
                                }}
                                onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'default')}
                            />
                        )
                    )}
                    {node.type !== 'preview' && (
                        <div
                            className="connector connector-right"
                            style={{
                                position: 'absolute',
                                top: '50%',
                                right: '-0.45rem',
                                width: '0.9rem',
                                height: '0.9rem',
                                transform: 'translateY(-50%)',
                                boxSizing: 'border-box',
                                backgroundColor: connectingSource === node.id ? '#d4d4d8' : '#27272a',
                                border: '1px solid #71717a',
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: 0,
                                cursor: 'crosshair',
                                zIndex: 30,
                                opacity: connectingSource === node.id ? 1 : 0.5,
                                pointerEvents: 'auto'
                            }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const world = screenToWorld(e.clientX, e.clientY);
                                setMousePos(world);
                                setConnectingSource(node.id);
                            }}
                        >
                            <Plus size={10} />
                        </div>
                    )}
                </div>
            );
        }

        // 判断是否为Nano Banana 2模型 - 使用 Map 优化查找（O(1)）
        const currentModel = getApiConfigByKey(node.settings?.model);
        const isNanoBanana2 = currentModel
            ? ((currentModel.modelName || currentModel.id || '').includes('nano-banana-2'))
            : ((node.settings?.model || '').includes('nano-banana-2'));

        // 高细节模式：完整渲染逻辑
        return (
            <div
                key={node.id}
                data-node-id={node.id}
                    data-node-type={node.type}
                    data-node-theme={theme}
                className={`absolute rounded-xl shadow-xl transition-shadow duration-150 group flex flex-col canvas-node node-wrapper ${isSelected
                    ? 'ring-1 ring-blue-500 shadow-blue-500/20'
                    : isAdjacent
                        ? 'ring-2 ring-blue-300/60 shadow-blue-300/30'
                        : theme === 'dark'
                            ? 'border border-zinc-800 shadow-black/40'
                        : theme === 'solarized'
                            ? 'border border-[#eee8d5] shadow-black/10'
                        : 'border border-zinc-200 shadow-black/10'
                    } ${isHoverTarget && ((connectingSource && connectingSource !== node.id) || (connectingTarget && connectingTarget !== node.id)) ? 'ring-2 ring-green-500/50' : ''} ${theme === 'dark' ? 'bg-[#18181b]' : theme === 'solarized' ? 'bg-[#eee8d5]' : 'bg-white'
                    }`}
                style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    cursor: (dragNodeId === node.id || (dragNodeId && selectedNodeIds.has(node.id))) ? 'grabbing' : 'default',
                    zIndex: nodeZIndex,
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    textRendering: 'optimizeLegibility',
                    transform: 'translateZ(0)',
                    backfaceVisibility: 'hidden'
                }}
                onDragOver={enableSmartDrop ? handleCanvasDragOver : undefined}
                onDrop={enableSmartDrop ? (e) => handleGenNodeDrop(node.id, e) : undefined}
                onMouseDownCapture={(e) => {
                    if (e.button !== 0 || e.target === e.currentTarget) return;
                    const interactive = isCanvasInteractiveTarget(e.target);
                    if (!interactive) return;
                    touchNodeSelectionPriority(node.id);
                    if (e.nativeEvent) e.nativeEvent.__tapnowSelectionHandled = true;
                    if (e.ctrlKey || e.metaKey) {
                        setSelectedNodeIds(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(node.id)) {
                                newSet.delete(node.id);
                            } else {
                                newSet.add(node.id);
                            }
                            if (newSet.size === 1) {
                                setSelectedNodeId(Array.from(newSet)[0]);
                            } else {
                                setSelectedNodeId(null);
                            }
                            return newSet;
                        });
                        return;
                    }
                    const isAlreadySelected = selectedNodeIds.has(node.id);
                    if (isAlreadySelected && selectedNodeIds.size > 1) {
                        setSelectedNodeId(node.id);
                    } else {
                        setSelectedNodeId(node.id);
                        setSelectedNodeIds(new Set([node.id]));
                    }
                }}
                onMouseDown={(e) => {
                    if (e.nativeEvent?.__tapnowSelectionHandled) { e.stopPropagation(); return; }
                    if (e.button === 0) {
                        touchNodeSelectionPriority(node.id);
                        e.stopPropagation();
                        markInteraction('node');
                        // 如果按住了Ctrl键，添加到多选
                        if (e.ctrlKey || e.metaKey) {
                            setSelectedNodeIds(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(node.id)) {
                                    newSet.delete(node.id);
                                } else {
                                    newSet.add(node.id);
                                }
                                // 如果多选集合为空或只有一个，更新selectedNodeId
                                if (newSet.size === 1) {
                                    setSelectedNodeId(Array.from(newSet)[0]);
                                } else {
                                    setSelectedNodeId(null);
                                }
                                return newSet;
                            });
                        } else {
                            // 如果没有按住Ctrl，检查该节点是否已经在多选集合中
                            const isAlreadySelected = selectedNodeIds.has(node.id);
                            if (isAlreadySelected && selectedNodeIds.size > 1) {
                                // 如果节点已经在多选集合中，保持多选状态，不重置
                                // 只更新 selectedNodeId 为当前节点（用于显示详情等）
                                setSelectedNodeId(node.id);
                            } else {
                                // 单选模式：重置为只选中当前节点
                                setSelectedNodeId(node.id);
                                setSelectedNodeIds(new Set([node.id]));
                            }
                        }
                        const dragNodeIds = (selectedNodeIds.size > 1 && selectedNodeIds.has(node.id))
                            ? Array.from(selectedNodeIds)
                            : [node.id];
                        const orderedDragNodeIds = [
                            ...dragNodeIds.filter((id) => id !== node.id),
                            node.id
                        ];
                        dragPriorityNodeIdsRef.current = orderedDragNodeIds;
                        beginNodeDragSession(node.id, orderedDragNodeIds, e.clientX, e.clientY);
                        setDragNodeId(node.id);
                        setActiveDropdown(null);
                    }
                }}
                onMouseEnter={() => { if (connectingSource || connectingTarget) setHoverTargetId(node.id); }}
                onMouseLeave={() => { if ((connectingSource || connectingTarget) && hoverTargetId === node.id) setHoverTargetId(null); }}
                onMouseUp={(e) => handleNodeMouseUp(node.id, e)}
                onDoubleClick={(e) => {
                    // V3.5.26：阻止所有节点触发画布双击菜单
                    e.stopPropagation();

                    // 功能6：双击图片或视频节点显示预览弹窗
                    const previewUrl = node.type === 'input-image'
                        ? inputImageDisplayContent
                        : node.content;
                    if ((node.type === 'input-image' || node.type === 'video-input') && previewUrl) {
                        setLightboxItem({ url: previewUrl, type: isVideoUrl(previewUrl) ? 'video' : 'image' });
                    }
                }}
            >
                <CanvasAssetIssues node={node} onRetry={canvasCloud.retryNodeAssets} />
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                    className={`absolute -top-2.5 -right-2.5 z-50 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border p-0 leading-none shadow opacity-0 transition-opacity scale-90 group-hover:opacity-100 hover:scale-100 ${theme === 'dark'
                        ? 'bg-zinc-800 text-zinc-400 hover:text-red-500 hover:bg-zinc-700 border-zinc-700'
                        : 'bg-zinc-100 text-zinc-500 hover:text-red-500 hover:bg-zinc-200 border-zinc-300'
                        }`}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <X size={12} />
                </button>
                <div className="absolute bottom-1 right-1 w-4 h-4 z-[100] resize-handle flex items-end justify-end p-0.5" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setResizingNodeId(node.id); }}><svg width="6" height="6" viewBox="0 0 8 8" fill="none" className="text-zinc-600"><path d="M8 0L8 8L0 8" stroke="currentColor" strokeWidth="2" /></svg></div>

                {node.type !== 'input-image' && node.type !== 'video-input' && node.type !== 'video-analyze' && node.type !== 'preview' && (
                    node.type === 'image-compare' ? (
                        <>
                            <div
                                className={`input-point ${connectingTarget === node.id && !connectingInputType ? 'active' : ''}`}
                                style={{ top: '33%' }}
                                title={t('图 1 输入')}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    // 立即计算并更新当前鼠标的世界坐标，防止线条乱飞
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setMousePos(world);
                                    setConnectingTarget(node.id);
                                    setConnectingInputType('default');
                                }}
                                onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'default')}
                            />
                            <div
                                className={`input-point ${connectingTarget === node.id && !connectingInputType ? 'active' : ''}`}
                                style={{ top: '66%' }}
                                title={t('图 2 输入')}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    // 立即计算并更新当前鼠标的世界坐标，防止线条乱飞
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setMousePos(world);
                                    setConnectingTarget(node.id);
                                    setConnectingInputType('default');
                                }}
                                onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'default')}
                            />
                        </>
                    ) : (
                        <div
                            className={`input-point ${isConnected ? 'connected' : ''} ${connectingTarget === node.id && !connectingInputType ? 'active' : ''}`}
                            title={t('输入')}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                // 立即计算并更新当前鼠标的世界坐标，防止线条乱飞
                                const world = screenToWorld(e.clientX, e.clientY);
                                setMousePos(world);
                                setConnectingTarget(node.id);
                                setConnectingInputType('default');
                            }}
                            onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'default')}
                        />
                    )
                )}

                {node.type !== 'preview' && (
                    <div
                        className={`connector connector-right ${connectingSource === node.id ? 'active' : ''} ${connectingTarget && hoverTargetId === node.id ? 'ring-2 ring-green-500/50' : ''}`}
                        title={t('输出')}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            // 立即计算并更新当前鼠标的世界坐标，防止线条乱飞
                            const world = screenToWorld(e.clientX, e.clientY);
                            setMousePos(world);
                            setConnectingSource(node.id);
                        }}
                        onMouseEnter={() => { if (connectingTarget) setHoverTargetId(node.id); }}
                        onMouseLeave={() => { if (connectingTarget && hoverTargetId === node.id) setHoverTargetId(null); }}
                    >
                        <Plus size={10} />
                    </div>
                )}


                <div
                    className={`canvas-node__surface overflow-hidden rounded-xl flex-1 flex flex-col pointer-events-none h-full w-full relative ${theme === 'dark' ? 'bg-[#18181b]' : theme === 'solarized' ? 'bg-[#eee8d5]' : 'bg-white'
                        }`}
                >
                    {/* V2.6.1：渲染新增节点类型 */}
                    {node.type === 'novel-input' && (
                        <div className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}>
                            <div className="flex items-center gap-1.5 px-3 py-2 border-b text-xs font-semibold shrink-0">
                                <FileText size={12} className="text-blue-500" />
                                <span>{t('小说输入')}</span>
                            </div>
                            <div className="flex-1 flex flex-col gap-2 p-3 overflow-hidden min-h-0">
                                {cloudDocument && <CanvasTextModelSelect theme={theme} models={canvasCloud.textModels} ready={canvasCloud.textReady} onRefresh={canvasCloud.refreshModels} operation="extractCharactersScenes" value={node.settings?.textModelId} onChange={(textModelId) => updateNodeSettings(node.id, { textModelId })} />}
<textarea
                                    value={node.settings?.content || ''}
                                    onChange={(e) => {
                                        const newValue = e.target.value;
                                        if (newValue.length <= (cloudDocument ? 60000 : 10000)) {
                                            updateNodeSettings(node.id, { content: newValue });
                                        }
                                    }}
                                    placeholder={cloudDocument ? uiText("输入小说内容（最多60,000字符）...") : t('输入小说内容（最多10,000字）...')}
                                    maxLength={cloudDocument ? 60000 : 10000}
                                    className={`w-full flex-1 resize-none outline-none text-sm p-2 rounded border ${theme === 'dark'
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                        : theme === 'solarized'
                                            ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400'
                                            : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                        }`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                />
                                <div className="text-right text-[10px] text-zinc-500 shrink-0">
                                    {(node.settings?.content || '').length}/{cloudDocument ? '60,000' : '10,000'}
                                    {cloudDocument && node.settings?.analysisResults && <button type="button" onClick={() => generateFullWorkflow(node.id, node.settings.analysisResults)}>{uiText("创建角色/场景节点（")}{node.settings.analysisResults.characters?.length || 0} {uiText("角色 ·") + " "}{node.settings.analysisResults.scenes?.length || 0} {uiText("场景）")}</button>}
                                </div>
                                <button
                                    className="w-full py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shrink-0"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    disabled={!!cloudDocument && !canvasCloud.textReady}
                                    onClick={(e) => { e.stopPropagation(); handleNovelExtract(node.id); }}
                                >
                                    <Sparkles size={12} /> {t('提取角色和场景')}
                                </button>
                            </div>
                        </div>
                    )}
                    {node.type === 'extract-characters-scenes' && (
                        <div className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}>
                            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                                <div className="flex items-center gap-1.5 text-xs font-semibold">
                                    <Users size={12} className="text-purple-500" />
                                    <span>{t('角色与场景提取')}</span>
                                    {cloudDocument && node.settings?.analysisResults && <button type="button" onClick={() => generateFullWorkflow(node.id, node.settings.analysisResults)}>{uiText("创建角色/场景节点")}</button>}
                                </div>
                                {node.settings?.analysisResults && (
                                    <span className="text-[10px] opacity-70">
                                        {(node.settings.analysisResults.characters?.length || 0) + (node.settings.analysisResults.scenes?.length || 0)}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 flex flex-col p-3 overflow-hidden min-h-0">
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium opacity-70">{uiText("分析模型")}</label>
                                        {/* V3.4.10：供应商 -> 模型双层选择器 */}
                                        {cloudDocument ? <><CanvasTextModelSelect theme={theme} models={canvasCloud.textModels} ready={canvasCloud.textReady} onRefresh={canvasCloud.refreshModels} operation="extractCharactersScenes" value={node.settings?.textModelId} onChange={(textModelId) => updateNodeSettings(node.id, { textModelId })} /><textarea aria-label={uiText("提取文本")} placeholder={uiText("输入文本，或连接小说/文本节点")} value={node.settings?.scriptText || ''} maxLength={60000} onChange={e => updateNodeSettings(node.id, { scriptText: e.target.value })} /></> : (<div className="relative">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'extract-model' ? null : { nodeId: node.id, type: 'extract-model' }); }}
                                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs border transition-colors ${theme === 'dark'
                                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                    }`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                <span className="truncate font-mono">{getModelLabelWithProvider(node.settings?.model)}</span>
                                                <ChevronDown size={12} className="opacity-50 shrink-0" />
                                            </button>
                                            {activeDropdown?.nodeId === node.id && activeDropdown.type === 'extract-model' && (
                                                <div
                                                    className={`absolute top-full left-0 mt-1 w-64 rounded-lg shadow-xl p-1 z-[60] border flex ${theme === 'dark'
                                                        ? 'bg-[#18181b] border-zinc-700'
                                                        : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onMouseLeave={() => setHoveredProvider(null)}
                                                >
                                                    {/* 供应商列表 */}
                                                    <div className={`w-24 border-r pr-1 max-h-80 overflow-y-auto custom-scrollbar flex flex-col ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                                                        {Object.entries(groupedApiConfigs)
                                                            .filter(([, group]) => group.models.some(m => isChatModelType(m.type)))
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
                                                            ))}
                                                    </div>
                                                    {/* Model 列表 */}
                                                    <div className="flex-1 pl-1 max-h-80 overflow-y-auto custom-scrollbar">
                                                        {hoveredProvider && groupedApiConfigs[hoveredProvider]?.models
                                                            .filter(m => isChatModelType(m.type))
                                                            .map((m) => {
                                                                const modelKey = m._uid || m.id;
                                                                const currentModelKey = resolveModelKey(node.settings?.model);
                                                                return (
                                                                    <button
                                                                        key={modelKey}
                                                                        onClick={() => {
                                                                            updateNodeSettings(node.id, { model: modelKey });
                                                                            setLastUsedExtractModel(modelKey);
                                                                            try { localStorage.setItem('tapnow_last_extract_model', modelKey); } catch { }
                                                                            setActiveDropdown(null);
                                                                            setHoveredProvider(null);
                                                                        }}
                                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${currentModelKey === modelKey
                                                                            ? theme === 'dark' ? 'bg-blue-600/30 text-blue-300' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-blue-100 text-blue-700'
                                                                            : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-300' : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'
                                                                            }`}
                                                                    >
                                                                        <span className="text-[10px] font-medium truncate font-mono">{getModelLabelWithProvider(m._uid || m.id)}</span>
                                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(modelKey)}`}></div>
                                                                    </button>
                                                                );
                                                            })}
                                                        {!hoveredProvider && (
                                                            <div className={`text-[10px] px-2 py-3 text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                {uiText("← 选择 Provider")}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>)}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar mt-2">
                                    {(() => {
                                        const results = node.settings?.analysisResults;
                                        if (!results) {
                                            return (
                                                <div className="flex flex-col items-center justify-center py-6 text-[11px] opacity-70">
                                                    <Wand2 size={18} className="mb-1 opacity-70" />
                                                    <span>{t('点击“开始提取”开始分析')}</span>
                                                </div>
                                            );
                                        }
                                        const characters = Array.isArray(results.characters) ? results.characters : [];
                                        const scenes = Array.isArray(results.scenes) ? results.scenes : [];
                                        return (
                                            <div className="flex flex-col gap-3">
                                                {characters.length > 0 && (
                                                    <div>
                                                        <div className="text-[10px] font-medium mb-1 opacity-70">{uiText("角色 (")}{characters.length})</div>
                                                        {characters.map((char, idx) => (
                                                            <div key={`${char.name || 'char'}-${idx}`} className={`p-2 rounded mb-1 ${theme === 'dark' ? 'bg-zinc-800' : 'bg-white border border-zinc-200'}`}>
                                                                <div className="flex items-center gap-1 text-[11px]">
                                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-purple-500' : idx === 2 ? 'bg-blue-500' : 'bg-zinc-400'}`}></span>
                                                                    <span className="font-medium">{char.name || uiText("未命名角色")}</span>
                                                                </div>
                                                                {char.description && (
                                                                    <div className="mt-1 text-[10px] opacity-70 leading-snug">{char.description}</div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {scenes.length > 0 && (
                                                    <div>
                                                        <div className="text-[10px] font-medium mb-1 opacity-70">{uiText("场景 (")}{scenes.length})</div>
                                                        {scenes.map((scene, idx) => (
                                                            <div key={`${scene.location || 'scene'}-${idx}`} className={`p-2 rounded mb-1 ${theme === 'dark' ? 'bg-zinc-800' : 'bg-white border border-zinc-200'}`}>
                                                                <div className="flex items-center gap-1 text-[11px]">
                                                                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
                                                                    <span className="font-medium">{scene.location || scene.name || uiText("未命名场景")}</span>
                                                                </div>
                                                                {scene.description && (
                                                                    <div className="mt-1 text-[10px] opacity-70 leading-snug">{scene.description}</div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {characters.length === 0 && scenes.length === 0 && (
                                                    <div className="text-[11px] text-zinc-500">{uiText("未返回角色/场景数据")}</div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    {node.settings?.errorMsg && (
                                        <div className="mt-2 text-[10px] text-red-500 break-words">{node.settings.errorMsg}</div>
                                    )}
                                </div>

                                {node.settings?.isAnalyzing && (
                                    <div className="mt-2">
                                        <div className="text-[10px] mb-1 opacity-70">{uiText("正在分析小说内容...")}</div>
                                        <div className={`w-full h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                            <div
                                                className="h-full bg-blue-500 transition-all duration-300"
                                                style={{ width: `${node.settings?.progress || 0}%` }}
                                            />
                                        </div>
                                        <div className="text-[10px] mt-1 opacity-70">{node.settings?.progress || 0}%</div>
                                    </div>
                                )}

                                <button
                                    className={`mt-2 w-full py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${node.settings?.isAnalyzing ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    disabled={!!cloudDocument && !canvasCloud.textReady}
                                    onClick={(e) => { e.stopPropagation(); handleExtractAnalysis(node.id); }}
                                >
                                    {node.settings?.isAnalyzing ? <><Loader2 size={12} className="animate-spin" />{uiText("分析中...")}</> : <><Sparkles size={12} />{uiText("开始提取")}</>}
                                </button>
                            </div>
                        </div>
                    )}
                    {(node.type === 'character-description' || node.type === 'scene-description') && (
                        <div className={`description-node description-node--${theme} relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}>
                            {(() => {
                                const isCharacter = node.type === 'character-description';
                                const title = isCharacter ? '角色描述' : '场景描述';
                                const mode = normalizeStoryboardMode(node.settings?.mode);
                                const baseCharacter = {
                                    name: node.settings?.characterName || node.settings?.name || '角色',
                                    role: node.settings?.role || '',
                                    description: node.settings?.description || '',
                                    age: node.settings?.age || '',
                                    gender: node.settings?.gender || ''
                                };
                                const baseScene = {
                                    name: node.settings?.sceneName || node.settings?.location || '场景',
                                    location: node.settings?.sceneName || node.settings?.location || '',
                                    description: node.settings?.description || ''
                                };
                                const defaultPrompt = isCharacter
                                    ? generateCharacterPrompt(baseCharacter, mode)
                                    : generateScenePrompt(baseScene);
                                const promptValue = node.settings?.prompt || defaultPrompt;

                                return (
                                    <>
                                        <div className={`description-node__header flex items-center justify-between px-3 py-2 border-b text-xs font-semibold shrink-0 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                            <div className="flex items-center gap-1.5">
                                                <FileText size={12} className={isCharacter ? "text-red-500" : "text-green-500"} />
                                                <span>{title}</span>
                                            </div>
                                            {isCharacter ? (
                                                baseCharacter.name ? <div className="description-node__identity">{uiText("角色:") + " "}{baseCharacter.name}</div> : null
                                            ) : (
                                                baseScene.name ? <div className="description-node__identity">{uiText("场景:") + " "}{baseScene.name}</div> : null
                                            )}
                                        </div>

                                        <div className="description-node__body custom-scrollbar">
                                            <div className="description-node__modes" role="group" aria-label={uiText("生成模式")}>
                                                <button
                                                    aria-pressed={mode === 'video'}
                                                    className={`description-node__mode px-2 py-1 rounded text-[10px] transition-colors ${mode === 'video'
                                                        ? 'bg-blue-500 text-white'
                                                        : theme === 'dark'
                                                            ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={() => {
                                                        const currentPrompt = node.settings?.prompt || (isCharacter ? generateCharacterPrompt(baseCharacter, 'image') : defaultPrompt);
                                                        const updatedPrompt = isCharacter ? ensureCharacterVideoSuffix(currentPrompt) : currentPrompt;
                                                        updateNodeSettings(node.id, { mode: 'video', prompt: updatedPrompt });
                                                        setTimeout(() => ensureVideoNodeForDescription(node.id), 0);
                                                    }}
                                                >
                                                    {uiText("视频模式")}</button>
                                                <button
                                                    aria-pressed={mode === 'image'}
                                                    className={`description-node__mode px-2 py-1 rounded text-[10px] transition-colors ${mode === 'image'
                                                        ? 'bg-blue-500 text-white'
                                                        : theme === 'dark'
                                                            ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={() => {
                                                        const currentPrompt = node.settings?.prompt || (isCharacter ? generateCharacterPrompt(baseCharacter, 'video') : defaultPrompt);
                                                        const updatedPrompt = isCharacter
                                                            ? stripCharacterVideoSuffix(currentPrompt)
                                                            : currentPrompt;
                                                        updateNodeSettings(node.id, { mode: 'image', prompt: updatedPrompt });
                                                        setTimeout(() => ensureImageNodeForDescription(node.id), 0);
                                                    }}
                                                >
                                                    {uiText("图片模式")}</button>
                                            </div>

                                            <div className="description-node__prompt">
                                                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                                                    <span>{t('提示词')}</span>
                                                    {node.settings?.isEnhancing && (
                                                        <span className="flex items-center gap-1 text-blue-400">
                                                            <Loader2 size={10} className="animate-spin" />
                                                            {uiText("处理中")}</span>
                                                    )}
                                                </div>
                                                <textarea
                                                    value={promptValue}
                                                    onChange={(e) => updateNodeSettings(node.id, { prompt: e.target.value })}
                                                    placeholder={t('输入角色/场景描述提示词...')}
                                                    aria-label={isCharacter ? uiText("角色提示词") : uiText("场景提示词")}
                                                    className={`description-node__textarea w-full h-28 resize-none outline-none text-sm p-2 rounded border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                />
                                                                                            <div className="description-node__prompt-actions" onMouseDown={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => runDescriptionPromptAction(node.id, 'enhance')}
                                                        disabled={node.settings?.isEnhancing || (!!cloudDocument && !canvasCloud.textReady)}
                                                        title={cloudDocument && !canvasCloud.textReady ? uiText("服务端尚未开放文本任务") : undefined}
                                                        className={`px-2 py-1 rounded text-[10px] transition-colors ${node.settings?.isEnhancing
                                                            ? theme === 'dark'
                                                                ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                                                                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                                                            : theme === 'dark'
                                                                ? 'bg-purple-600/80 text-white hover:bg-purple-500'
                                                                : 'bg-purple-600 text-white hover:bg-purple-500'
                                                            }`}
                                                    >
                                                        {isCharacter ? uiText("增强角色描述") : uiText("增强场景描述")}
                                                    </button>
                                                    <button
                                                        onClick={() => runDescriptionPromptAction(node.id, 'filter')}
                                                        disabled={node.settings?.isEnhancing || (!!cloudDocument && !canvasCloud.textReady)}
                                                        title={cloudDocument && !canvasCloud.textReady ? uiText("服务端尚未开放文本任务") : undefined}
                                                        className={`px-2 py-1 rounded text-[10px] transition-colors ${node.settings?.isEnhancing
                                                            ? theme === 'dark'
                                                                ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                                                                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                                                            : theme === 'dark'
                                                                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                                : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                                                            }`}
                                                    >
                                                        {uiText("过滤提示词")}</button>
                                                </div>
                                            </div>

                                            {cloudDocument ? (
                                                <CanvasTextModelSelect theme={theme}
                                                    models={canvasCloud.textModels} ready={canvasCloud.textReady} onRefresh={canvasCloud.refreshModels}
                                                    value={node.settings?.textModelId}
                                                    onChange={(textModelId) => updateNodeSettings(node.id, { textModelId })}
                                                />
                                            ) : (
                                            <div className="description-node__field">
                                                <label className="text-[10px] font-medium opacity-70">{uiText("文本模型 · 用于增强 / 过滤")}</label>
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'desc-model' ? null : { nodeId: node.id, type: 'desc-model' }); }}
                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs border transition-colors ${theme === 'dark'
                                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                                                            : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                            }`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <span className="truncate font-mono">{getModelLabelWithProvider(node.settings?.chatModel)}</span>
                                                        <ChevronDown size={12} className="opacity-50 shrink-0" />
                                                    </button>
                                                    {activeDropdown?.nodeId === node.id && activeDropdown.type === 'desc-model' && (
                                                        <div
                                                            className={`absolute top-full left-0 mt-1 w-64 rounded-lg shadow-xl p-1 z-[60] border flex ${theme === 'dark'
                                                                ? 'bg-[#18181b] border-zinc-700'
                                                                : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                                }`}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onMouseLeave={() => setHoveredProvider(null)}
                                                        >
                                                            <div className={`w-24 border-r pr-1 max-h-80 overflow-y-auto custom-scrollbar flex flex-col ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                                                                {Object.entries(groupedApiConfigs)
                                                                    .filter(([, group]) => group.models.some(m => isChatModelType(m.type)))
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
                                                                    ))}
                                                            </div>
                                                            <div className="flex-1 pl-1 max-h-80 overflow-y-auto custom-scrollbar">
                                                                {hoveredProvider && groupedApiConfigs[hoveredProvider]?.models
                                                                    .filter(m => isChatModelType(m.type))
                                                                    .map((m) => {
                                                                        const modelKey = m._uid || m.id;
                                                                        const currentModelKey = resolveModelKey(node.settings?.chatModel);
                                                                        return (
                                                                            <button
                                                                                key={modelKey}
                                                                                onClick={() => {
                                                                                    updateNodeSettings(node.id, { chatModel: modelKey });
                                                                                    setLastUsedExtractModel(modelKey);
                                                                                    try { localStorage.setItem('tapnow_last_extract_model', modelKey); } catch { }
                                                                                    setActiveDropdown(null);
                                                                                    setHoveredProvider(null);
                                                                                }}
                                                                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${currentModelKey === modelKey
                                                                                    ? theme === 'dark' ? 'bg-blue-600/30 text-blue-300' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-blue-100 text-blue-700'
                                                                                    : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-300' : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'
                                                                                    }`}
                                                                            >
                                                                                <span className="text-[10px] font-medium truncate font-mono">{getModelLabelWithProvider(m._uid || m.id)}</span>
                                                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(modelKey)}`}></div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                {!hoveredProvider && (
                                                                    <div className={`text-[10px] px-2 py-3 text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                        {uiText("← 选择 Provider")}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            )}

                                            <div className="description-node__field">
                                                <label className="text-[10px] font-medium opacity-70">{uiText("风格")}</label>
                                                <select
                                                    value={node.settings?.style || 'none'}
                                                    onChange={(e) => {
                                                        const newStyle = e.target.value;
                                                        const stylePrefix = getDescriptionStylePrefix(newStyle);
                                                        const currentPrompt = node.settings?.prompt || defaultPrompt;
                                                        const updatedPrompt = currentPrompt.includes('，')
                                                            ? currentPrompt.replace(/^[^，]+，/, `${stylePrefix}，`)
                                                            : `${stylePrefix}，${currentPrompt}`;
                                                        updateNodeSettings(node.id, { style: newStyle, prompt: updatedPrompt });
                                                    }}
                                                    className={`w-full text-xs border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {DESCRIPTION_STYLE_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="description-node__field">
                                                <label className="text-[10px] font-medium opacity-70">{uiText("参考图")}</label>
                                                <div
                                                    className={`description-node__reference rounded-lg border-2 border-dashed p-2 transition-colors drop-zone ${theme === 'dark'
                                                        ? 'border-zinc-700 bg-zinc-800/60'
                                                        : 'border-zinc-300 bg-white'
                                                        }`}
                                                    onDrop={(e) => handleDescReferenceDrop(node.id, e)}
                                                    onDragOver={handleDragOver}
                                                    onDragLeave={handleDragLeave}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {node.settings?.referenceImages?.length > 0 ? (
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {node.settings.referenceImages.map((img, idx) => (
                                                                <div key={`${node.id}-ref-${idx}`} className="relative aspect-square rounded overflow-hidden">
                                                                    <LazyBase64Image src={img} className="w-full h-full object-cover" />
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const nextRefs = [...node.settings.referenceImages];
                                                                            nextRefs.splice(idx, 1);
                                                                            updateNodeSettings(node.id, { referenceImages: nextRefs });
                                                                        }}
                                                                        className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 p-0 leading-none text-white hover:bg-red-500"
                                                                        title={t('删除')}
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <label className="aspect-square rounded border border-dashed border-zinc-500/60 flex items-center justify-center text-[10px] text-zinc-400 cursor-pointer hover:border-blue-400 hover:text-blue-400">
                                                                {uiText("+ 添加")}<input
                                                                    type="file"
                                                                    className="hidden"
                                                                    accept="image/*"
                                                                    multiple
                                                                    onChange={(e) => handleDescReferenceSelect(node.id, e)}
                                                                />
                                                            </label>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center gap-1 text-[10px] text-zinc-500 cursor-pointer">
                                                            <FolderOpen size={16} />
                                                            {uiText("点击或拖拽添加参考图")}<input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                multiple
                                                                onChange={(e) => handleDescReferenceSelect(node.id, e)}
                                                            />
                                                        </label>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    {(node.type === 'generate-character-video' || node.type === 'generate-scene-video') && (
                        <div className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}>
                            {(() => {
                                const isCharacter = node.type === 'generate-character-video';
                                const descType = isCharacter ? 'character-description' : 'scene-description';
                                const imageType = isCharacter ? 'generate-character-image' : 'generate-scene-image';
                                const descriptionNode = connections
                                    .filter(c => c.to === node.id)
                                    .map(c => nodesMap.get(c.from))
                                    .find(n => n?.type === descType);
                                const imageNode = connections
                                    .filter(c => c.to === node.id)
                                    .map(c => nodesMap.get(c.from))
                                    .find(n => n?.type === imageType);

                                const latestCompleted = history.find(h => h.sourceNodeId === node.id && h.status === 'completed');
                                const latestGenerating = history.find(h => h.sourceNodeId === node.id && h.status === 'generating');
                                const latestFailed = history.find(h => h.sourceNodeId === node.id && h.status === 'failed');
                                const resolvedVideoUrl = cloudDocument ? node.content || '' : resolveHistoryUrl(latestCompleted);

                                const imageHistory = imageNode ? history.find(h => h.sourceNodeId === imageNode.id && h.status === 'completed') : null;
                                const imageUrls = imageHistory?.output_images?.length
                                    ? imageHistory.output_images
                                    : (imageHistory?.mjImages?.length ? imageHistory.mjImages : []);
                                const fallbackImage = resolveHistoryUrl(imageHistory);
                                const normalizedImageUrls = cloudDocument ? (imageNode?.settings?.imageUrls || []) : imageUrls.length > 0 ? imageUrls : (fallbackImage ? [fallbackImage] : []);
                                const selectedImageIndex = imageNode?.settings?.selectedImageIndex;
                                const selectedImageUrl = (selectedImageIndex !== null && selectedImageIndex !== undefined && normalizedImageUrls[selectedImageIndex])
                                    ? normalizedImageUrls[selectedImageIndex]
                                    : (cloudDocument ? imageNode?.content || null : null);

                                const basePrompt = node.settings?.videoPrompt || descriptionNode?.settings?.prompt || '';
                                const elapsedSeconds = nodeTimers[node.id] || 0;
                                const finalDuration = latestCompleted?.durationMs ? (latestCompleted.durationMs / 1000).toFixed(1) : null;
                                const isGenerating = !!latestGenerating;
                                const defaultVideoModel = resolveModelKey(lastUsedVideoModel)
                                    || resolveModelKey(apiConfigs.find(c => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro'))?.id)
                                    || resolveModelKey(apiConfigs.find(c => c.type === 'Video')?.id)
                                    || '';
                                const modelId = resolveModelKey(node.settings?.model || defaultVideoModel);
                                const durationOptions = getDefaultDurationsForModel(modelId);
                                const storedDuration = node.settings?.duration;
                                const currentDuration = durationOptions.includes(storedDuration)
                                    ? storedDuration
                                    : (durationOptions[0] || '5s');
                                if (durationOptions.length > 0 && storedDuration && !durationOptions.includes(storedDuration)) {
                                    setTimeout(() => {
                                        updateNodeSettings(node.id, { duration: durationOptions[0] || '5s' });
                                    }, 0);
                                }
                                const resolutionOptions = getVideoResolutionsForModel(modelId);
                                const resolutionConfig = getApiConfigByKey(modelId);
                                const currentResolution = normalizeVideoResolution(node.settings?.resolution || lastUsedVideoResolution || '720P');
                                const fallbackResolution = resolutionOptions.find((res) => res !== 'Auto') || '720P';
                                const resolvedResolution = resolutionOptions.includes(currentResolution) ? currentResolution : fallbackResolution;
                                if (resolvedResolution !== currentResolution) {
                                    setTimeout(() => {
                                        updateNodeSettings(node.id, { resolution: resolvedResolution });
                                    }, 0);
                                }

                                return (
                                    <>
                                        {(isGenerating || finalDuration) && (
                                            <div className={`m-3 mb-0 px-2 py-1 rounded text-[10px] font-mono text-center ${theme === 'dark'
                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                : 'bg-blue-50 text-blue-600 border border-blue-200'
                                                }`}>
                                                {isGenerating ? <span>? {elapsedSeconds.toFixed(1)}s</span> : <span>? {t('完成')} {finalDuration}s</span>}
                                            </div>
                                        )}
                                        <div className={`flex items-center gap-1.5 px-3 py-2 border-b text-xs font-semibold shrink-0 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                            <FileVideo size={12} className="text-green-500" />
                                            <span>{isCharacter ? t('生成角色视频') : t('生成场景视频')}</span>
                                        </div>

                                        <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto min-h-0">
                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{uiText("选择模型")}</label>
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'role-video-model' ? null : { nodeId: node.id, type: 'role-video-model' }); }}
                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs border transition-colors ${theme === 'dark'
                                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                                                            : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                            }`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <span className="truncate font-mono">{getModelLabelWithProvider(modelId)}</span>
                                                        <ChevronDown size={12} className="opacity-50 shrink-0" />
                                                    </button>
                                                    {activeDropdown?.nodeId === node.id && activeDropdown.type === 'role-video-model' && (
                                                        <div
                                                            className={`absolute top-full left-0 mt-1 w-64 rounded-lg shadow-xl p-1 z-[60] border flex ${theme === 'dark'
                                                                ? 'bg-[#18181b] border-zinc-700'
                                                                : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                                }`}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onMouseLeave={() => setHoveredProvider(null)}
                                                        >
                                                            <div className={`w-24 border-r pr-1 max-h-80 overflow-y-auto custom-scrollbar flex flex-col ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                                                                {Object.entries(groupedApiConfigs)
                                                                    .filter(([, group]) => group.models.some(m => m.type === 'Video'))
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
                                                                    ))}
                                                            </div>
                                                            <div className="flex-1 pl-1 max-h-80 overflow-y-auto custom-scrollbar">
                                                                {hoveredProvider && groupedApiConfigs[hoveredProvider]?.models
                                                                    .filter(m => m.type === 'Video' && (!cloudDocument || !m.supportedNodeTypes?.length || m.supportedNodeTypes.includes(node.type)))
                                                                    .map((m) => {
                                                                        const modelKey = m._uid || m.id;
                                                                        const currentModelKey = resolveModelKey(node.settings?.model);
                                                                        return (
                                                                            <button
                                                                                key={modelKey}
                                                                                onClick={() => {
                                                                                    updateNodeSettings(node.id, { model: modelKey });
                                                                                    setLastUsedVideoModel(modelKey);
                                                                                    try { localStorage.setItem('tapnow_last_video_model', modelKey); } catch { }
                                                                                    setActiveDropdown(null);
                                                                                    setHoveredProvider(null);
                                                                                }}
                                                                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${currentModelKey === modelKey
                                                                                    ? theme === 'dark' ? 'bg-blue-600/30 text-blue-300' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-blue-100 text-blue-700'
                                                                                    : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-300' : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'
                                                                                    }`}
                                                                            >
                                                                                <span className="text-[10px] font-medium truncate font-mono">{getModelLabelWithProvider(m._uid || m.id)}</span>
                                                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(modelKey)}`}></div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                {!hoveredProvider && (
                                                                    <div className={`text-[10px] px-2 py-3 text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                        {uiText("← 选择 Provider")}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{uiText("时长")}</label>
                                                <select
                                                    value={currentDuration}
                                                    onChange={(e) => updateNodeSettings(node.id, { duration: e.target.value })}
                                                    className={`w-full px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {(durationOptions.length > 0 ? durationOptions : ['5s', '10s', '15s']).map(d => (
                                                        <option key={d} value={d}>
                                                            {getValueLabelWithNotes(d, !!resolutionConfig?.durationNotesEnabled, resolutionConfig?.durationNotes || {})}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{uiText("比例")}</label>
                                                <select
                                                    value={node.settings?.ratio || '16:9'}
                                                    onChange={(e) => updateNodeSettings(node.id, { ratio: e.target.value })}
                                                    className={`w-full px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {getRatiosForModel(modelId).map((ratio) => (
                                                        <option key={ratio} value={ratio}>
                                                            {ratio === 'Auto'
                                                                ? 'Auto'
                                                                : getValueLabelWithNotes(ratio, !!resolutionConfig?.ratioNotesEnabled, resolutionConfig?.ratioNotes || {})}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{t('分辨率')}</label>
                                                <select
                                                    value={resolvedResolution}
                                                    onChange={(e) => {
                                                        const nextValue = e.target.value;
                                                        updateNodeSettings(node.id, { resolution: nextValue });
                                                        if (nextValue !== 'Auto') {
                                                            setLastUsedVideoResolution(nextValue);
                                                            try { localStorage.setItem('tapnow_last_video_res', nextValue); } catch { }
                                                        }
                                                    }}
                                                    className={`w-full px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {resolutionOptions.map(res => (
                                                        <option key={res} value={res}>
                                                            {res === 'Auto'
                                                                ? uiText("不选")
                                                                : getValueLabelWithNotes(res, !!resolutionConfig?.videoResolutionNotesEnabled, resolutionConfig?.videoResolutionNotes || {})}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{t('提示词')}</label>
                                                <textarea
                                                    value={basePrompt}
                                                    onChange={(e) => updateNodeSettings(node.id, { videoPrompt: e.target.value })}
                                                    placeholder={t('输入视频生成提示词...')}
                                                    className={`w-full h-20 resize-none outline-none text-sm p-2 rounded border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                />
                                            </div>

                                            {resolvedVideoUrl ? (
                                                <div
                                                    className="relative w-full aspect-video bg-black rounded-lg overflow-hidden cursor-pointer"
                                                    onDoubleClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setLightboxItem({ id: `preview-video-${node.id}`, url: resolvedVideoUrl, type: 'video' });
                                                        setLightboxOpen(true);
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const world = screenToWorld(e.clientX, e.clientY);
                                                        addNode('video-input', world.x, world.y, null, resolvedVideoUrl, { w: 400, h: 300 });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    <ResolvedVideo
                                                        src={resolvedVideoUrl}
                                                        controls
                                                        className="w-full h-full object-contain"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                            ) : (
                                                <div className={`w-full aspect-video rounded border-2 border-dashed flex items-center justify-center ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'}`}>
                                                    <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{uiText("点击下方按钮开始生成")}</span>
                                                </div>
                                            )}

                                            {latestGenerating && (
                                                <div className="mb-2">
                                                    <div className="text-[10px] mb-1 text-zinc-500">{uiText("正在生成视频...")}</div>
                                                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                                        <div
                                                            className="h-full bg-blue-500 transition-all duration-300"
                                                            style={{ width: `${latestGenerating.progress || 0}%` }}
                                                        />
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 mt-1">{latestGenerating.progress || 0}%</div>
                                                </div>
                                            )}

                                            {latestFailed?.errorMsg && (
                                                <div className="text-[10px] text-red-500">{latestFailed.errorMsg}</div>
                                            )}
                                        </div>

                                        <div className="px-3 py-2 border-t shrink-0">
                                            <button
                                                className={`w-full py-2 rounded text-xs font-medium transition-colors ${latestGenerating
                                                    ? 'bg-zinc-400 cursor-not-allowed text-white'
                                                    : theme === 'dark'
                                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
                                                        : 'bg-green-600 hover:bg-green-500 text-white'
                                                    }`}
                                                disabled={!!latestGenerating}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={() => {
                                                    if (cloudDocument) return canvasCloud.generate(node.id, { operation: 'videoGenerate', model: modelId, ratio: node.settings?.ratio || '16:9', duration: currentDuration, resolution: resolvedResolution });
                                                    const prompt = basePrompt;
                                                    const referenceImages = node.settings?.referenceImages || descriptionNode?.settings?.referenceImages || [];
                                                    const sourceImages = selectedImageUrl ? [selectedImageUrl] : referenceImages;
                                                    if (!prompt && sourceImages.length === 0) {
                                                        canvasAlert(t('请先输入提示词或选择图片'));
                                                        return;
                                                    }
                                                    if (!modelId) {
                                                        canvasAlert(t('请先选择模型'));
                                                        return;
                                                    }
                                                    startGeneration(
                                                        prompt || '',
                                                        'video',
                                                        sourceImages,
                                                        node.id,
                                                        {
                                                            model: modelId,
                                                            ratio: node.settings?.ratio || '16:9',
                                                            duration: currentDuration,
                                                            resolution: resolvedResolution
                                                        }
                                                    );
                                                }}
                                            >
                                                {latestGenerating ? uiText("生成中...") : uiText("生成视频")}
                                            </button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    {(node.type === 'generate-character-image' || node.type === 'generate-scene-image') && (
                        <div className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}>
                            {(() => {
                                const isScene = node.type === 'generate-scene-image';
                                const latestCompleted = history.find(h => h.sourceNodeId === node.id && h.status === 'completed');
                                const latestGenerating = history.find(h => h.sourceNodeId === node.id && h.status === 'generating');
                                const latestFailed = history.find(h => h.sourceNodeId === node.id && h.status === 'failed');
                                const resolvedUrl = resolveHistoryUrl(latestCompleted);
                                const outputImages = cloudDocument ? (node.settings?.imageUrls?.length ? node.settings.imageUrls : node.content ? [node.content] : []) : latestCompleted?.output_images?.length
                                    ? latestCompleted.output_images
                                    : (latestCompleted?.mjImages?.length ? latestCompleted.mjImages : (resolvedUrl ? [resolvedUrl] : []));
                                const selectedImageIndex = node.settings?.selectedImageIndex ?? null;
                                const defaultImageModel = resolveModelKey(lastUsedImageModel) || resolveModelKey(apiConfigs.find(c => isImageModelType(c.type))?.id) || '';
                                const modelId = resolveModelKey(node.settings?.model || defaultImageModel);

                                return (
                                    <>
                                        <div className={`flex items-center gap-1.5 px-3 py-2 border-b text-xs font-semibold shrink-0 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                            <FileText size={12} className="text-blue-500" />
                                            <span>{isScene ? t('生成场景图片') : t('生成角色图片')}</span>
                                        </div>

                                        <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto min-h-0">
                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{uiText("选择模型")}</label>
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'role-image-model' ? null : { nodeId: node.id, type: 'role-image-model' }); }}
                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs border transition-colors ${theme === 'dark'
                                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                                                            : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 hover:border-[#d7cfb2]' : 'bg-white border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                            }`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <span className="truncate font-mono">{getModelLabelWithProvider(modelId)}</span>
                                                        <ChevronDown size={12} className="opacity-50 shrink-0" />
                                                    </button>
                                                    {activeDropdown?.nodeId === node.id && activeDropdown.type === 'role-image-model' && (
                                                        <div
                                                            className={`absolute top-full left-0 mt-1 w-64 rounded-lg shadow-xl p-1 z-[60] border flex ${theme === 'dark'
                                                                ? 'bg-[#18181b] border-zinc-700'
                                                                : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                                }`}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onMouseLeave={() => setHoveredProvider(null)}
                                                        >
                                                            <div className={`w-24 border-r pr-1 max-h-80 overflow-y-auto custom-scrollbar flex flex-col ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                                                                {Object.entries(groupedApiConfigs)
                                                                    .filter(([, group]) => group.models.some(m => isImageModelType(m.type)))
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
                                                                    ))}
                                                            </div>
                                                            <div className="flex-1 pl-1 max-h-80 overflow-y-auto custom-scrollbar">
                                                                {hoveredProvider && groupedApiConfigs[hoveredProvider]?.models
                                                                    .filter(m => isImageModelType(m.type) && (!cloudDocument || !m.supportedNodeTypes?.length || m.supportedNodeTypes.includes(node.type)))
                                                                    .map((m) => {
                                                                        const modelKey = m._uid || m.id;
                                                                        const currentModelKey = resolveModelKey(node.settings?.model);
                                                                        return (
                                                                            <button
                                                                                key={modelKey}
                                                                                onClick={() => {
                                                                                    updateNodeSettings(node.id, { model: modelKey });
                                                                                    setLastUsedImageModel(modelKey);
                                                                                    try { localStorage.setItem('tapnow_last_image_model', modelKey); } catch { }
                                                                                    setActiveDropdown(null);
                                                                                    setHoveredProvider(null);
                                                                                }}
                                                                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${currentModelKey === modelKey
                                                                                    ? theme === 'dark' ? 'bg-blue-600/30 text-blue-300' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-blue-100 text-blue-700'
                                                                                    : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-300' : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'
                                                                                    }`}
                                                                            >
                                                                                <span className="text-[10px] font-medium truncate font-mono">{getModelLabelWithProvider(m._uid || m.id)}</span>
                                                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(modelKey)}`}></div>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                {!hoveredProvider && (
                                                                    <div className={`text-[10px] px-2 py-3 text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                        {uiText("← 选择 Provider")}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{uiText("比例")}</label>
                                                <select
                                                    value={node.settings?.ratio || '16:9'}
                                                    onChange={(e) => updateNodeSettings(node.id, { ratio: e.target.value })}
                                                    className={`w-full px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    <option value="16:9">16:9</option>
                                                    <option value="9:16">9:16</option>
                                                    <option value="1:1">1:1</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{t('分辨率')}</label>
                                                <select
                                                    value={node.settings?.resolution || '2K'}
                                                    onChange={(e) => updateNodeSettings(node.id, { resolution: e.target.value })}
                                                    className={`w-full px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    <option value="1K">1K</option>
                                                    <option value="2K">2K</option>
                                                    <option value="4K">4K</option>
                                                    <option value="Auto">Auto</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{t('提示词')}</label>
                                                <textarea
                                                    value={node.settings?.prompt || ''}
                                                    onChange={(e) => updateNodeSettings(node.id, { prompt: e.target.value })}
                                                    placeholder={t('输入图片生成提示词...')}
                                                    className={`w-full h-20 resize-none outline-none text-sm p-2 rounded border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                />
                                            </div>

                                            {outputImages.length > 0 ? (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {outputImages.map((url, idx) => (
                                                        <div
                                                            key={`${url}-${idx}`}
                                                            className={`relative aspect-square bg-black rounded-lg overflow-hidden cursor-pointer transition-all ${selectedImageIndex === idx
                                                                ? 'ring-2 ring-blue-500 ring-offset-2'
                                                                : 'hover:ring-1 hover:ring-zinc-400'
                                                                }`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newIndex = selectedImageIndex === idx ? null : idx;
                                                                updateNodeSettings(node.id, { selectedImageIndex: newIndex, ...(cloudDocument ? { imageUrls: outputImages } : {}) });
                                                            }}
                                                            onDoubleClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setLightboxItem({ id: `preview-${node.id}-${idx}`, url, type: 'image', mjImages: outputImages, selectedMjImageIndex: idx });
                                                                setLightboxOpen(true);
                                                            }}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                const world = screenToWorld(e.clientX, e.clientY);
                                                                addNode('input-image', world.x, world.y, null, url, { w: 400, h: 300 });
                                                            }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                        >
                                                            <LazyBase64Image src={url} className="w-full h-full object-contain" />
                                                            <div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1 py-0.5 rounded">
                                                                {idx + 1}/{outputImages.length}
                                                            </div>
                                                            {selectedImageIndex === idx && (
                                                                <div className="absolute top-1 right-1 bg-blue-500 text-white text-[10px] px-1 py-0.5 rounded">
                                                                    {t('已选中')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className={`w-full h-28 rounded border-2 border-dashed flex items-center justify-center ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'}`}>
                                                    <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{uiText("点击下方按钮开始生成")}</span>
                                                </div>
                                            )}

                                            {latestGenerating && (
                                                <div className="mb-2">
                                                    <div className="text-[10px] mb-1 text-zinc-500">{t('正在生成图片...')}</div>
                                                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                                        <div
                                                            className="h-full bg-blue-500 transition-all duration-300"
                                                            style={{ width: `${latestGenerating.progress || 0}%` }}
                                                        />
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500 mt-1">{latestGenerating.progress || 0}%</div>
                                                </div>
                                            )}

                                            {latestFailed?.errorMsg && (
                                                <div className="text-[10px] text-red-500">{latestFailed.errorMsg}</div>
                                            )}
                                        </div>

                                        <div className="px-3 py-2 border-t shrink-0">
                                            <button
                                                className={`w-full py-2 rounded text-xs font-medium transition-colors ${latestGenerating
                                                    ? 'bg-zinc-400 cursor-not-allowed text-white'
                                                    : theme === 'dark'
                                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white'
                                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                                    }`}
                                                disabled={!!latestGenerating}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={() => {
                                                    if (cloudDocument) return canvasCloud.generate(node.id, { operation: 'imageGenerate', model: modelId, ratio: node.settings?.ratio || '16:9', resolution: node.settings?.resolution || lastUsedImageResolution || '2K' });
                                                    const prompt = node.settings?.prompt || '';
                                                    const modelId = resolveModelKey(node.settings?.model || lastUsedImageModel || apiConfigs.find(c => isImageModelType(c.type))?.id || '');
                                                    if (!prompt && (!node.settings?.referenceImages || node.settings.referenceImages.length === 0)) {
                                                        canvasAlert(t('请先输入提示词或添加参考图'));
                                                        return;
                                                    }
                                                    if (!modelId) {
                                                        canvasAlert(t('请先选择模型'));
                                                        return;
                                                    }
                                                    startGeneration(
                                                        prompt,
                                                        'image',
                                                        node.settings?.referenceImages || [],
                                                        node.id,
                                                        {
                                                            model: modelId,
                                                            ratio: node.settings?.ratio || '16:9',
                                                            resolution: node.settings?.resolution || lastUsedImageResolution || '2K'
                                                        }
                                                    );
                                                }}
                                            >
                                                {latestGenerating ? uiText("生成中...") : uiText("生成图片")}
                                            </button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    {(node.type === 'create-character' || node.type === 'create-scene') && (
                        (cloudDocument ? <CanvasLibraryNode node={node} ready={canvasCloud.publishReady} updateNodeSettings={updateNodeSettings} onPublish={canvasCloud.publishLibrary} /> : (<div className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}>
                            {(() => {
                                const isCharacter = node.type === 'create-character';
                                const title = isCharacter ? '创建角色' : '创建场景';
                                const startSecond = Number.isFinite(node.settings?.startSecond) ? node.settings.startSecond : 1;
                                const endSecond = Number.isFinite(node.settings?.endSecond) ? node.settings.endSecond : 3;

                                return (
                                    <>
                                        <div className={`flex items-center gap-1.5 px-3 py-2 border-b text-xs font-semibold shrink-0 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                            <User size={12} className={isCharacter ? "text-blue-500" : "text-green-500"} />
                                            <span>{title}</span>
                                        </div>

                                        <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto min-h-0">
                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{isCharacter ? uiText("角色名称") : uiText("场景名称")}</label>
                                                <input
                                                    type="text"
                                                    value={node.settings?.name || ''}
                                                    onChange={(e) => updateNodeSettings(node.id, { name: e.target.value })}
                                                    className={`w-full px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                        }`}
                                                    placeholder={isCharacter ? uiText("输入角色名称...") : uiText("输入场景名称...")}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] block mb-1 text-zinc-500">{t('时间范围（秒，间隔需在 1-3 秒之间）')}</label>
                                                <div className="flex gap-2 items-center flex-wrap">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={startSecond}
                                                        onChange={(e) => updateNodeSettings(node.id, { startSecond: parseFloat(e.target.value) || 0 })}
                                                        className={`w-20 px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                            : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                            }`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    />
                                                    <span className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{uiText("到")}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={endSecond}
                                                        onChange={(e) => updateNodeSettings(node.id, { endSecond: parseFloat(e.target.value) || 0 })}
                                                        className={`w-20 px-2 py-1 rounded text-xs border ${theme === 'dark'
                                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                                            : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                            }`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    />
                                                    <span className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                                        {uiText("秒（间隔:") + " "}{(endSecond - startSecond).toFixed(1)}s）
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {node.settings?.isCreating && (
                                            <div className="px-3 py-2 border-t shrink-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[10px] text-zinc-500">{title}{uiText("中...")}</span>
                                                            <span className="text-[10px] text-zinc-500">{node.settings?.createProgress || 0}%</span>
                                                        </div>
                                                        <div className={`w-full h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                                            <div
                                                                className="h-full bg-blue-500 transition-all duration-300"
                                                                style={{ width: `${node.settings?.createProgress || 0}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                {node.settings?.createError && (
                                                    <div className="text-[10px] text-red-500 mt-1">{node.settings.createError}</div>
                                                )}
                                            </div>
                                        )}

                                        <div className="px-3 py-2 border-t shrink-0">
                                            <button
                                                className={`w-full py-2 rounded text-xs font-medium transition-colors ${(node.settings?.isCreating)
                                                    ? 'bg-zinc-400 cursor-not-allowed text-white'
                                                    : theme === 'dark'
                                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white'
                                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                                    }`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                type="button"
                                                disabled={node.settings?.isCreating}
                                                onClick={async () => {
                                                    const name = node.settings?.name || '';
                                                    if (!name || name.trim().length === 0) {
                                                        canvasAlert(uiText("请填写{0}名称", isCharacter ? uiText("角色") : uiText("场景")));
                                                        return;
                                                    }
                                                    const start = startSecond ?? 1;
                                                    const end = endSecond ?? 3;
                                                    if (end - start < 1 || end - start > 3) {
                                                        canvasAlert(t('时间范围必须在 1-3 秒之间'));
                                                        return;
                                                    }

                                                    const targetVideoType = isCharacter ? 'generate-character-video' : 'generate-scene-video';
                                                    const videoNode = connections
                                                        .filter(c => c.to === node.id)
                                                        .map(c => nodesMap.get(c.from))
                                                        .find(n => n?.type === targetVideoType);
                                                    if (!videoNode) {
                                                        canvasAlert(t('找不到关联的视频节点'));
                                                        return;
                                                    }

                                                    const historyItem = history.find(h => h.sourceNodeId === videoNode.id && h.status === 'completed');
                                                    const videoUrl = historyItem?.localCacheUrl || historyItem?.url || historyItem?.originalUrl || videoNode.content || '';
                                                    if (!videoUrl) {
                                                        canvasAlert(t('视频节点没有视频URL'));
                                                        return;
                                                    }

                                                    const fromTaskId = historyItem?.remoteTaskId || null;
                                                    updateNodeSettings(node.id, { isCreating: true, createProgress: 10, createError: null });

                                                    try {
                                                        const soraConfig = apiConfigs.find(c => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro'));
                                                        if (!soraConfig) {
                                                            updateNodeSettings(node.id, { isCreating: false, createError: '未找到 Sora 2 模型配置' });
                                                            canvasAlert(t('未找到 Sora 2 模型配置，请先在设置中配置 Sora 2 或 Sora 2 Pro'));
                                                            return;
                                                        }

                                                        const credentials = getApiCredentials(soraConfig.id);
                                                        const apiKey = credentials.key;
                                                        if (!apiKey) {
                                                            updateNodeSettings(node.id, { isCreating: false, createError: '请先配置 API Key' });
                                                            canvasAlert(t('请先配置 API Key'));
                                                            setSettingsOpen(true);
                                                            return;
                                                        }

                                                        updateNodeSettings(node.id, { createProgress: 40 });

                                                        const baseUrl = (credentials.url || DEFAULT_BASE_URL).replace(/\/+$/, '');
                                                        const endpoint = (createCharacterEndpoint && createCharacterEndpoint.trim())
                                                            ? createCharacterEndpoint.trim()
                                                            : `${baseUrl}/sora/v1/characters`;
                                                        const timestamps = `${start},${end}`;
                                                        const payload = fromTaskId
                                                            ? { from_task: fromTaskId, timestamps }
                                                            : { url: videoUrl, timestamps };

                                                        updateNodeSettings(node.id, { createProgress: 70 });

                                                        const resp = await fetch(endpoint, {
                                                            method: 'POST',
                                                            headers: {
                                                                'Authorization': `Bearer ${apiKey}`,
                                                                'Content-Type': 'application/json'
                                                            },
                                                            body: JSON.stringify(payload)
                                                        });

                                                        updateNodeSettings(node.id, { createProgress: 90 });

                                                        if (!resp.ok) {
                                                            const errText = await resp.text();
                                                            let errorData = null;
                                                            try { errorData = JSON.parse(errText); } catch { }
                                                            if (resp.status === 500 || (errorData && (errorData.code === 'get_origin_task_failed' || errorData.message?.includes('get_origin_task_failed')))) {
                                                                throw new Error('TASK_NOT_FOUND');
                                                            }
                                                            throw new Error(`API错误 (${resp.status}): ${errText || resp.statusText}`);
                                                        }

                                                        const data = await resp.json();
                                                        if (!data?.id || !data?.username) {
                                                            throw new Error('返回数据缺少 id 或 username');
                                                        }

                                                        const newCharacter = {
                                                            id: data.id,
                                                            username: data.username,
                                                            profile_picture_url: data.profile_picture_url || '',
                                                            permalink: data.permalink || ''
                                                        };
                                                        setCharacterLibrary(prev => [...prev, newCharacter]);

                                                        setTimeout(() => {
                                                            updateNodeSettings(node.id, {
                                                                isCreating: false,
                                                                createProgress: 0,
                                                                createError: null,
                                                                characterId: data.id,
                                                                characterUsername: data.username
                                                            });
                                                            canvasAlert(uiText("{0} \"{1}\" 创建成功！", isCharacter ? uiText("角色") : uiText("场景"), data.username));
                                                        }, 300);
                                                    } catch (err) {
                                                        let msg = err.message || '创建失败';
                                                        if (msg === 'TASK_NOT_FOUND') {
                                                            msg = '原任务已过期或无法访问';
                                                        } else if (msg.includes('Failed to fetch') || err.name === 'TypeError' || err.message.includes('NetworkError')) {
                                                            msg = '连接失败。可能原因：\n\n1. API 地址填写错误\n   - 请检查 API 接口地址是否多余了 "/sora" 前缀\n   - 有些服务商的路径可能不同，请询问服务商 Sora 创建接口的准确路径\n\n2. 跨域限制 (CORS)\n   - 请尝试安装 Allow CORS 浏览器插件\n\n3. 网络问题\n   - 请检查网络连接';
                                                        }
                                                        updateNodeSettings(node.id, { isCreating: false, createProgress: 0, createError: msg });
                                                        canvasAlert(uiText("{0}失败: {1}", isCharacter ? uiText("创建角色") : uiText("创建场景"), msg));
                                                    }
                                                }}
                                            >
                                                {isCharacter ? uiText("创建角色") : uiText("创建场景")}
                                            </button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>))
                    )}
                    {node.type === 'local-save' && (() => {
                        const pendingItems = getLocalSaveMediaItems(node.id);
                        const pendingCount = pendingItems.length;
                        const isSaving = !!node.settings?.isSaving;
                        const serverUrlOverride = (node.settings?.serverUrl || '').trim();
                        const serverConnected = serverUrlOverride
                            ? node.settings?.serverStatus === 'connected'
                            : localCacheServerConnected;

                        return (
                            <div className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}>
                                <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                                        <HardDrive size={12} className="text-green-500" />
                                        <span>{t('保存到本地')}</span>
                                    </div>
                                    <div className={`w-2 h-2 rounded-full ${serverConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} title={serverConnected ? uiText("已连接本地服务") : uiText("未连接")} />
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar flex flex-col gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium opacity-70">{t('服务器地址')}</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={node.settings?.serverUrl ?? ''}
                                                onChange={(e) => updateNodeSettings(node.id, { serverUrl: e.target.value })}
                                                placeholder={localServerUrl || 'http://127.0.0.1:9527'}
                                                className={`flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300 placeholder-zinc-600' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            />
                                            <button
                                                className={`px-2 py-1 text-[10px] rounded border transition-colors ${theme === 'dark'
                                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-blue-500'
                                                    : 'bg-white border-zinc-300 text-zinc-700 hover:border-blue-500'
                                                    }`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={() => testLocalSaveServer(node.id, node.settings?.serverUrl || '')}
                                            >
                                                {t('测试')}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-medium opacity-70">{t('子文件夹')}</label>
                                        <input
                                            type="text"
                                            value={node.settings?.subfolder || ''}
                                            onChange={(e) => updateNodeSettings(node.id, { subfolder: e.target.value })}
                                            placeholder="v1_characters"
                                            className={`w-full text-xs border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300 placeholder-zinc-600' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'}`}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-medium opacity-70">{t('自动保存 (新图片)')}</label>
                                        <button
                                            className={`w-10 h-5 rounded-full relative transition-colors ${node.settings?.autoSave ? 'bg-green-600' : theme === 'solarized' ? 'bg-zinc-300' : 'bg-zinc-600'}`}
                                            onClick={() => updateNodeSettings(node.id, { autoSave: !node.settings?.autoSave })}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${node.settings?.autoSave ? 'left-6' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                                        <span>{t('待保存文件')}</span>
                                        <span>{pendingCount}</span>
                                    </div>
                                    {pendingCount > 0 ? (
                                        <div className="grid grid-cols-4 gap-2">
                                            {pendingItems.slice(0, 4).map((item, idx) => {
                                                const isVideo = item.type === 'video' || isVideoUrl(item.url) || item.url.startsWith('data:video');
                                                return (
                                                    <div key={`${item.url}-${idx}`} className="relative aspect-square rounded-lg overflow-hidden bg-black/40 border border-zinc-700/40">
                                                        {isVideo ? (
                                                            <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-300">
                                                                <Video size={14} className="text-purple-300" />
                                                            </div>
                                                        ) : (
                                                            <LazyBase64Image src={item.url} className="w-full h-full object-cover" />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-zinc-500">{t('暂无待保存文件')}</div>
                                    )}

                                    <div className="mt-auto border-t pt-2 border-zinc-700/50">
                                        <div className="text-[10px] text-zinc-500 flex justify-between">
                                            <span>{t('上次保存:')}</span>
                                            <span>{node.settings?.lastSaved ? node.settings.lastSaved.split(' ')[1] : t('无')}</span>
                                        </div>
                                        <div className="text-[10px] text-zinc-500 flex justify-between mt-1">
                                            <span>{t('已保存:')}</span>
                                            <span>{node.settings?.savedFiles?.length || 0} {t('个')}</span>
                                        </div>
                                    </div>

                                    <button
                                        className={`w-full py-2 rounded text-xs font-medium transition-colors ${isSaving
                                            ? 'bg-zinc-600 cursor-not-allowed text-white'
                                            : theme === 'dark'
                                                ? 'bg-green-600 hover:bg-green-500 text-white'
                                                : 'bg-green-600 hover:bg-green-500 text-white'
                                            }`}
                                        disabled={isSaving || pendingCount === 0}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={async () => {
                                            if (pendingCount === 0) {
                                                showToast(uiText("暂无待保存文件"), 'warning');
                                                return;
                                            }
                                            updateNodeSettings(node.id, { isSaving: true });
                                            try {
                                                await runLocalSaveBatch(node, pendingItems);
                                            } catch (err) {
                                                showToast(`保存失败: ${err.message || '未知错误'}`, 'error');
                                            } finally {
                                                updateNodeSettings(node.id, { isSaving: false });
                                            }
                                        }}
                                    >
                                        {isSaving ? uiText("保存中...") : uiText("保存到本地")}
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {node.type === 'input-image' && (
                        <div
                            className={`relative w-full h-full flex flex-col items-center justify-center transition-colors pointer-events-auto drop-zone ${theme === 'dark'
                                ? 'bg-zinc-900 group-hover:bg-zinc-800'
                                : theme === 'solarized'
                                    ? 'bg-[#eee8d5] group-hover:bg-[#e4dcc2]'
                                    : 'bg-zinc-100 group-hover:bg-zinc-200'
                                }`}
                            onDrop={(e) => handleDrop(node.id, e)}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onContextMenu={(e) => handleInputImageRightClick(e, node.id)}
                        >
                            {inputImageDisplayContent ? (
                                <div className="relative w-full h-full">
                                    {isVideoUrl(inputImageDisplayContent) ? (
                                        <ResolvedVideo
                                            src={inputImageDisplayContent}
                                            controls
                                            className={`w-full h-full object-contain ${theme === 'dark'
                                                ? 'bg-black/50'
                                                : theme === 'solarized'
                                                    ? 'bg-[#eee8d5]'
                                                    : 'bg-zinc-100'
                                                }`}
                                            draggable={false}
                                            style={{
                                                imageRendering: view.zoom >= 1 ? 'auto' : 'crisp-edges',
                                                WebkitFontSmoothing: 'antialiased',
                                                transform: 'translateZ(0)',
                                                backfaceVisibility: 'hidden',
                                                WebkitBackfaceVisibility: 'hidden'
                                            }}
                                        />
                                    ) : (
                                        <LazyBase64Image
                                            src={inputImageDisplayContent}
                                            className={`w-full h-full object-contain ${theme === 'dark'
                                                ? 'bg-black/50'
                                                : theme === 'solarized'
                                                    ? 'bg-[#eee8d5]'
                                                    : 'bg-zinc-100'
                                                }`}
                                            draggable={false}
                                            loading="lazy"
                                            style={{
                                                imageRendering: view.zoom >= 1 ? 'auto' : 'crisp-edges',
                                                WebkitFontSmoothing: 'antialiased',
                                                transform: 'translateZ(0)',
                                                backfaceVisibility: 'hidden',
                                                WebkitBackfaceVisibility: 'hidden'
                                            }}
                                        />
                                    )}
                                    {node.dimensions && (
                                        <div
                                            className={`absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm border ${theme === 'dark'
                                                ? 'bg-black/70 text-white border-white/10'
                                                : 'bg-white/80 text-zinc-800 border-zinc-200'
                                                }`}
                                        >
                                            {node.dimensions.w}x{node.dimensions.h}
                                        </div>
                                    )}
                                    {hasLinkedInputImage && (
                                        <div
                                            className={`absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm border ${theme === 'dark'
                                                ? 'bg-blue-500/20 text-blue-200 border-blue-300/30'
                                                : 'bg-blue-50/90 text-blue-600 border-blue-200'
                                                }`}
                                            title={t('显示的是上游连接图片')}
                                        >
                                            {t('上游引用')}
                                        </div>
                                    )}
                                    {/* 悬浮菜单：当 isMasking 为 true 时强制隐藏 */}
                                    {!node.isMasking && (
                                        <div className="absolute inset-0 bg-black/40 transition-opacity gap-2 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center">
                                            <div className="flex items-center gap-2">
                                                <label
                                                    className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs backdrop-blur-sm border transition-colors ${theme === 'dark'
                                                        ? 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                                                        : 'bg-white hover:bg-zinc-100 text-zinc-800 border-zinc-300'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {t('更换')} <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(node.id, e)} />
                                                </label>
                                                {/* 局部重绘暂未接入，隐藏操作入口。 */}
                                            </div>
                                            <div
                                                className={`text-[10px] text-center px-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-500'
                                                    }`}
                                            >
                                                {t('或拖放图片到此处')}
                                                <br />
                                                {t('或 Ctrl+V 粘贴')}
                                            </div>
                                        </div>
                                    )}
                                    {/* 非编辑模式下的蒙版回显 */}
                                    {!node.isMasking && node.maskContent && (
                                        <div
                                            className="absolute inset-0 z-20 pointer-events-none"
                                            style={{
                                                background: 'rgba(255, 0, 0, 0.3)',
                                                mixBlendMode: 'multiply',
                                                WebkitMaskImage: `url(${node.maskContent})`,
                                                maskImage: `url(${node.maskContent})`,
                                                WebkitMaskSize: '100% 100%',
                                                maskSize: '100% 100%',
                                                WebkitMaskRepeat: 'no-repeat',
                                                maskRepeat: 'no-repeat'
                                            }}
                                        />
                                    )}
                                    {/* MaskEditor 组件 */}
                                    {node.isMasking && !isVideoUrl(inputImageDisplayContent) && (
                                        <MaskEditor
                                            nodeId={node.id}
                                            imageUrl={inputImageDisplayContent}
                                            imageDimensions={node.dimensions}
                                            isActive={node.isMasking}
                                            onClose={() => {
                                                setNodes((prev) => prev.map((n) =>
                                                    n.id === node.id
                                                        ? { ...n, isMasking: false }
                                                        : n
                                                ));
                                            }}
                                            onSave={(maskDataUrl) => {
                                            }}
                                            onUpdateNode={(nodeId, updates) => {
                                                setNodes((prev) => prev.map((n) =>
                                                    n.id === nodeId
                                                        ? { ...n, ...updates }
                                                        : n
                                                ));
                                            }}
                                            theme={theme}
                                            view={view}
                                            maskContent={node.maskContent}
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="canvas-node__media-empty flex flex-col items-center justify-center h-full w-full">
                                    <div className="canvas-node__media-title">{node.type === 'video-input' ? uiText("视频素材") : uiText("参考图片")}</div>
                                    <div
                                        className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 border ${theme === 'dark'
                                            ? 'bg-zinc-800 border-zinc-700/50'
                                            : 'bg-zinc-100 border-zinc-300'
                                            }`}
                                    >
                                        <ImageIcon
                                            className={`w-6 h-6 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
                                                }`}
                                        />
                                    </div>
                                    <label
                                        className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer pointer-events-auto ${theme === 'solarized'
                                            ? 'bg-[#616161] hover:bg-[#4b4b4b] text-white'
                                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                                            }`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        {t('选择图片')}
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(node.id, e)} />
                                    </label>
                                    <div
                                        className={`text-[10px] text-center mt-2 pointer-events-none ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'
                                            }`}
                                    >
                                        {t('或拖放图片到此处')}
                                        <br />
                                        {t('或 Ctrl+V 粘贴')}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {node.type === 'video-input' && (
                        <div
                            className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto drop-zone video-input-container ${theme === 'dark'
                                ? 'bg-zinc-900/80'
                            : theme === 'solarized'
                                ? 'bg-[#eee8d5]'
                                    : 'bg-zinc-100'
                                }`}
                            /* V3.5.20：移除容器的全局 onDrop，以区分不同投放区域 */
                            /* 旧的容器级 onDrop：onDrop={(e) => handleVideoDrop(node.id, e)} */
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                        >
                            <div className="flex items-center justify-between px-3 py-2 border-b text-xs font-semibold">
                                <div className="flex items-center gap-1.5">
                                    <Video size={13} className="text-blue-500" />
                                    <span>{t('视频输入 / 关键帧整理')}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const isExpanding = node.settings?.videoExpanded === false;

                                            // V3.5.36：调整分栏阈值，较宽节点使用约 290 的阈值
                                            const framesCount = (node.frames || []).length;
                                            const cols = isExpanding ? Math.max(1, Math.floor(node.width / 290)) : 1;
                                            const rows = Math.max(1, Math.ceil(framesCount / cols));

                                            const headerAreaH = 72; // 横幅（44）+ 元数据行（28）
                                            const videoAreaH = isExpanding ? (node.content ? 230 : 190) : 0;
                                            const controlsH = (node.content && isExpanding) ? 48 : 0;
                                            const thumbnailsTitleH = 36;
                                            const flexPaddingH = 30;

                                            const rowH = isExpanding ? 158 : 106; // 卡片 + 间距 + 边框 + 缓冲空间

                                            // 计算新高度以完整容纳全部内容
                                            const calculatedH = headerAreaH + videoAreaH + controlsH + thumbnailsTitleH + (rows * rowH) + flexPaddingH;

                                            // 直接更新节点根元素高度，以触发“手动调整尺寸”效果
                                            setNodes(prev => prev.map(n => n.id === node.id ? {
                                                ...n,
                                                height: Math.max(isExpanding ? 500 : 220, calculatedH),
                                                settings: { ...n.settings, videoExpanded: isExpanding }
                                            } : n));
                                        }}
                                        className={`p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors ml-1 ${node.settings?.videoExpanded === false ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
                                        title={node.settings?.videoExpanded === false ? uiText("展开视频") : uiText("收起视频")}
                                    >
                                        {node.settings?.videoExpanded === false ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                    {node.videoMeta?.duration ? <span>{t('时长')} {node.videoMeta.duration.toFixed(1)}s</span> : null}
                                    {(node.videoMeta?.width || node.videoMeta?.w) ? <span>{node.videoMeta.width || node.videoMeta.w}x{node.videoMeta.height || node.videoMeta.h}</span> : null}
                                    {node.selectedKeyframes?.length ? <span className="text-blue-500">{uiText("关键帧") + " "}{node.selectedKeyframes.length} {uiText("个")}</span> : null}
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col gap-3 p-3 overflow-hidden min-h-0">
                                {node.content ? (
                                    <div className="space-y-2">
                                        {node.settings?.videoExpanded !== false && (
                                            <div
                                                className="relative w-full max-w-[360px] aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center mx-auto"
                                                onDrop={(e) => handleVideoDrop(node.id, e)} /* V3.5.20：明确的放置区域 */
                                            >
                                                <ResolvedVideo
                                                    src={node.content}
                                                    controls
                                                    playsInline
                                                    preload="metadata"
                                                    onLoadedMetadata={event => {
                                                        const video = event.currentTarget;
                                                        setNodes(previous => applyVideoMetadata(previous, node.id, node.content, { duration: video.duration, width: video.videoWidth, height: video.videoHeight }));
                                                    }}
                                                    className="w-full h-full object-contain"
                                                    draggable={false}
                                                />
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <label
                                                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                {t('更换视频')}
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="video/*"
                                                    onChange={(e) => handleVideoFileUpload(node.id, e.target.files?.[0])}
                                                />
                                            </label>
                                            <button
                                                className={`px-3 py-1.5 rounded text-xs border transition-colors ${theme === 'dark'
                                                    ? 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-blue-500 hover:text-blue-400'
                                                    : 'border-zinc-300 hover:border-blue-500 hover:text-blue-600'
                                                    }`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={() => handleAutoExtractKeyframes(node.id, 2)}
                                            >
                                                <span className="whitespace-nowrap">{t('自动抽帧（2fps）')}</span>
                                            </button>
                                            <button
                                                className={`px-3 py-1.5 rounded text-xs border transition-colors ${theme === 'dark'
                                                    ? 'bg-green-600/40 border-green-500 text-green-200 hover:bg-green-600/60 hover:border-green-400'
                                                    : 'bg-green-50 border-green-300 hover:border-green-500 hover:text-green-600'
                                                    }`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={() => handleSmartExtractKeyframes(node.id, 30)}
                                            >
                                                <span className="whitespace-nowrap">{t('智能抽帧')}</span>
                                            </button>
                                            {node.extractingFrames && (
                                                <span className="text-[11px] text-blue-500">{t('抽帧中...')}</span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* 修复：上传框为空时也允许折叠 */
                                    (node.settings?.videoExpanded !== false) && (
                                        <div className="flex flex-col items-center justify-center gap-3 w-full px-4 mx-auto shrink-0 transition-colors border-2 border-transparent hover:border-blue-500/30 rounded-lg p-4"
                                            onDrop={(e) => handleVideoDrop(node.id, e)} /* V3.5.20：明确的放置区域 */
                                        >
                                            <div className="flex flex-col gap-2 items-center justify-center shrink-0 w-full">
                                                {/* V3.5.21 布局修复：强制使用固定尺寸容器 */}
                                                <div className={`relative w-full h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-colors ${dragOverNodeId === node.id && !dragInsertNodeId
                                                    ? 'border-blue-500 bg-blue-500/10'
                                                    : theme === 'dark' ? 'border-zinc-700 hover:border-zinc-500' : 'border-zinc-300 hover:border-zinc-400'
                                                    }`}>

                                                    <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                                                        <UploadCloud size={48} className={`mb-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                                                        <span className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                                            {t('点击选择或拖入视频')}
                                                        </span>
                                                        <input
                                                            type="file"
                                                            className="hidden"
                                                            accept="video/*"
                                                            onChange={(e) => handleVideoFileUpload(node.id, e.target.files?.[0])}
                                                        />
                                                    </label>
                                                </div>
                                                <div className="text-[10px] text-center text-zinc-500 pointer-events-none">
                                                    {t('支持 MP4/WEBM，拖拽或 Ctrl+V 不可用')}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )
                                }

                                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>{t('抽帧缩略图')}</span>
                                    <div className="flex items-center gap-2 flex-nowrap shrink-0 whitespace-nowrap">
                                        <span>{(node.frames || []).length} {t('张')}</span>
                                        {(node.frames || []).length > 0 && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        const frames = node.frames || [];
                                                        const currentSelected = node.selectedKeyframes || [];
                                                        let newSelected = [];

                                                        if (currentSelected.length === 0) {
                                                            // 全选
                                                            // 全选修复：保存引用对象而不是索引
                                                            newSelected = frames.map(f => ({ url: f.url, time: f.time, filename: f.filename }));
                                                        } else {
                                                            // 已有选中项时取消全选
                                                            newSelected = [];
                                                        }

                                                        setNodes(prev => prev.map(n =>
                                                            n.id === node.id ? { ...n, selectedKeyframes: newSelected } : n
                                                        ));
                                                    }}
                                                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${theme === 'dark'
                                                        ? 'bg-blue-600/30 text-blue-300 hover:bg-blue-600/50'
                                                        : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    title={(node.selectedKeyframes || []).length > 0 ? t('取消全选') : t('全选')}
                                                >
                                                    {(node.selectedKeyframes || []).length > 0 ? <Square size={10} /> : <CheckSquare size={10} />}
                                                    {(node.selectedKeyframes || []).length > 0 ? t('取消') : t('全选')}
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        const framesToRemove = new Set(node.frames || []);
                                                        const selectionToRemove = new Set(node.selectedKeyframes || []);
                                                        if (await canvasConfirm(t('确定要清空所有抽帧缩略图吗？'), { danger: true })) {
                                                            setNodes(prev => prev.map(n =>
                                                                n.id === node.id
                                                                    ? { ...n, frames: (n.frames || []).filter(frame => !framesToRemove.has(frame)), selectedKeyframes: (n.selectedKeyframes || []).filter(frame => !selectionToRemove.has(frame)) }
                                                                    : n
                                                            ));
                                                        }
                                                    }}
                                                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 flex-nowrap ${theme === 'dark'
                                                        ? 'bg-red-600/30 text-red-300 hover:bg-red-600/50'
                                                        : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    title={t('清空所有缩略图')}
                                                >
                                                    <Trash2 size={10} />
                                                    {t('清空')}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div
                                    className="grid gap-3 w-full overflow-y-auto custom-scrollbar flex-1 min-h-0 relative p-1 content-start items-start"
                                    style={{
                                        gridTemplateColumns: node.settings?.videoExpanded === false ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
                                        gridAutoRows: 'auto'
                                    }}
                                    /* V3.5.20：关键帧插入投放区域 */
                                    onDrop={(e) => handleKeyframeListDrop(node.id, e)}
                                    // 在空白处投放时传入数组长度，表示追加到末尾
                                    onDragOver={(e) => handleKeyframeContainerDragOver(e, node.id, (node.frames || []).length)}
                                    /* V3.5.31：拖拽离开容器时清除插入指示线 */
                                    onDragLeave={(e) => {
                                        // 仅在完全离开容器时清除，进入子元素时不清除
                                        if (!e.currentTarget.contains(e.relatedTarget)) {
                                            setDragInsertNodeId(null);
                                            setDragInsertIndex(null);
                                        }
                                    }}
                                >
                                    {(node.frames || []).length === 0 ? (
                                        <div className={`col-span-full text-[11px] text-zinc-500 text-center py-4 border rounded ${theme === 'dark' ? 'bg-zinc-800/40 border-zinc-700' : 'bg-white/40 border-zinc-300'
                                            }`}>
                                            {t('点击「自动抽帧」即可生成缩略图')}
                                            <div className="mt-1 opacity-50 text-[9px]">{t('可拖拽图片插入')}</div>
                                        </div>
                                    ) : (
                                        (node.frames || []).map((frame, idx) => {
                                            const selected = (node.selectedKeyframes || []).some(f => f.url === frame.url && f.time === frame.time);
                                            // V3.5.20：插入位置可视化
                                            const showInsertLineBefore = dragInsertNodeId === node.id && dragInsertIndex === idx;
                                            const showInsertLineAfter = dragInsertNodeId === node.id && dragInsertIndex === (node.frames || []).length && idx === (node.frames || []).length - 1;

                                            return (
                                                <div key={`${frame.url}-${idx}`} className="relative">
                                                    {/* V3.5.31：位于按钮外侧的前置插入线 */}
                                                    {showInsertLineBefore && (
                                                        <div className="absolute -top-1.5 left-0 right-0 h-1 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] z-50" />
                                                    )}
                                                    <button
                                                        className={`relative w-full rounded overflow-hidden group transition-all ${selected
                                                            ? 'ring-2 ring-blue-500 border-2 border-blue-500 bg-blue-900/30'
                                                            : theme === 'dark' ? 'border border-zinc-700 hover:border-zinc-500' : 'border border-zinc-300 hover:border-zinc-400'}`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onClick={(e) => handleToggleKeyframe(node.id, frame, idx, e)}
                                                        onContextMenu={(e) => openFrameContextMenu(e, node.id, frame)}
                                                        /* V3.5.20：拖过条目时计算插入位置 */
                                                        onDragOver={(e) => handleKeyframeItemDragOver(e, node.id, idx)}
                                                    >

                                                        <LazyBase64Image
                                                            src={frame.url}
                                                            className={`w-full bg-black ${node.settings?.videoExpanded === false ? 'h-[90px] object-cover' : 'aspect-video object-contain max-h-[140px]'}`}
                                                            alt={`frame-${idx}`}
                                                        />
                                                        <div className="absolute left-1 top-1 text-[10px] px-1 py-0.5 rounded bg-black/60 text-white">
                                                            {typeof frame.time === 'number' ? frame.time.toFixed(2) : frame.time}s
                                                        </div>
                                                        {/* V3.5.30：在提示框中显示文件名 */}
                                                        {frame.filename && (
                                                            <div
                                                                className="absolute left-0 bottom-0 right-0 bg-black/80 text-white text-[9px] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate"
                                                                title={frame.filename}
                                                            >
                                                                {frame.filename}
                                                            </div>
                                                        )}
                                                        {/* 右侧垂直控制条 */}
                                                        <div className="absolute top-1 bottom-1 right-1 flex flex-col justify-between items-center z-20 pointer-events-none">
                                                            {/* 顶部：选择按钮 */}
                                                            <div className="pointer-events-auto w-5 h-5 rounded-full border border-white/80 bg-black/40 flex items-center justify-center shrink-0 mb-auto">
                                                                {selected ? <CheckCircle2 size={12} className="text-white" /> : null}
                                                            </div>

                                                            {/* 中部：悬停时显示删除按钮 */}
                                                            {/* V3.5.18：删除按钮 */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setNodes(prev => prev.map(n => {
                                                                        if (n.id !== node.id) return n;
                                                                        const newFrames = (n.frames || []).filter((_, i) => i !== idx);
                                                                        const newSelected = (n.selectedKeyframes || []).filter(f => f.url !== frame.url);
                                                                        return { ...n, frames: newFrames, selectedKeyframes: newSelected };
                                                                    }));
                                                                }}
                                                                className="pointer-events-auto my-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600/80 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                                                                title={t('删除此帧')}
                                                            >
                                                                <X size={12} />
                                                            </button>

                                                            {/* 底部：悬停时显示排序按钮 */}
                                                            {/* V3.5.17：重新排序按钮 */}
                                                            <div className="pointer-events-auto flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-auto">
                                                                {idx > 0 && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            // 与前一项交换
                                                                            setNodes(prev => prev.map(n => {
                                                                                if (n.id !== node.id) return n;
                                                                                const newFrames = [...(n.frames || [])];
                                                                                [newFrames[idx - 1], newFrames[idx]] = [newFrames[idx], newFrames[idx - 1]];
                                                                                // 同时更新 selectedKeyframes 的顺序
                                                                                const newSelected = [...(n.selectedKeyframes || [])];
                                                                                const selIdx = newSelected.findIndex(f => f.url === frame.url);
                                                                                if (selIdx > 0) {
                                                                                    [newSelected[selIdx - 1], newSelected[selIdx]] = [newSelected[selIdx], newSelected[selIdx - 1]];
                                                                                }
                                                                                return { ...n, frames: newFrames, selectedKeyframes: newSelected };
                                                                            }));
                                                                        }}
                                                                        className="w-5 h-5 rounded bg-black/70 text-white flex items-center justify-center hover:bg-blue-600"
                                                                        title={t('上移')}
                                                                    >
                                                                        <ChevronUp size={12} />
                                                                    </button>
                                                                )}
                                                                {idx < (node.frames || []).length - 1 && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            // 与后一项交换
                                                                            setNodes(prev => prev.map(n => {
                                                                                if (n.id !== node.id) return n;
                                                                                const newFrames = [...(n.frames || [])];
                                                                                [newFrames[idx], newFrames[idx + 1]] = [newFrames[idx + 1], newFrames[idx]];
                                                                                // 同时更新 selectedKeyframes 的顺序
                                                                                const newSelected = [...(n.selectedKeyframes || [])];
                                                                                const selIdx = newSelected.findIndex(f => f.url === frame.url);
                                                                                if (selIdx >= 0 && selIdx < newSelected.length - 1) {
                                                                                    [newSelected[selIdx], newSelected[selIdx + 1]] = [newSelected[selIdx + 1], newSelected[selIdx]];
                                                                                }
                                                                                return { ...n, frames: newFrames, selectedKeyframes: newSelected };
                                                                            }));
                                                                        }}
                                                                        className="w-5 h-5 rounded bg-black/70 text-white flex items-center justify-center hover:bg-blue-600"
                                                                        title={t('下移')}
                                                                    >
                                                                        <ChevronDown size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                    {/* V3.5.31：最后一项之后的插入线 */}
                                                    {showInsertLineAfter && (
                                                        <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] z-50" />
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {node.type === 'text-node' && (
                        <div
                            className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto ${theme === 'dark'
                                ? 'bg-zinc-900/80'
                            : theme === 'solarized'
                                ? 'bg-[#eee8d5]'
                                    : 'bg-zinc-100'
                                }`}
                        >
                            <div className="flex items-center justify-between px-3 py-2 border-b text-xs font-semibold">
                                <div className="flex items-center gap-1.5">
                                    <FileText size={13} className="text-blue-500" />
                                    <span>{t('文字节点')}</span>
                                </div>
                            </div>
                            <div className="flex-1 p-3">
                                <textarea
                                    data-node-type="text-node"
                                    data-node-id={node.id}
                                    value={node.settings?.text || ''}
                                    onChange={(e) => {
                                        updateNodeSettings(node.id, { text: e.target.value });
                                    }}
                                    placeholder={t('输入文字内容...')}
                                    className={`w-full h-full resize-none outline-none text-sm p-2 rounded border ${theme === 'dark'
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                        }`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    )}

                    {node.type === 'video-analyze' && (cloudDocument ? canvasCloud.renderAnalysisNode(node) : (
                        <div
                            className={`canvas-node__form relative w-full h-full flex flex-col transition-colors pointer-events-auto video-analyze-container ${theme === 'dark' ? 'bg-zinc-900/80' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100'}`}
                            onDrop={(e) => handleVideoAnalyzeDrop(node.id, e)}
                            onDragOver={handleCanvasDragOver}
                            onClick={(e) => {
                                // 检查是否有文本选择，如果有则不阻止事件
                                const selection = window.getSelection();
                                if (selection && selection.toString().length > 0) {
                                    return; // 允许文本选择
                                }
                                // 检查是否点击在可交互元素上
                                const target = e.target;
                                if (target && (
                                    target.tagName === 'INPUT' ||
                                    target.tagName === 'TEXTAREA' ||
                                    target.tagName === 'SELECT' ||
                                    target.tagName === 'BUTTON' ||
                                    target.isContentEditable ||
                                    isCanvasInteractiveTarget(target)
                                )) {
                                    return; // 允许交互元素正常工作
                                }
                                e.stopPropagation();
                            }}
                        >
                            <div className="flex items-center justify-between px-3 py-2 border-b text-xs font-semibold">
                                <div className="flex items-center gap-1.5">
                                    <FileSearch size={13} className="text-blue-500" />
                                    <span>{t('视频拆解 / 提示词反推')}</span>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col gap-3 p-3 overflow-hidden min-h-0">
                                {(() => {
                                    const videoInputNode = getConnectedVideoInputNode(node.id);
                                    if (!videoInputNode) {
                                        return (
                                            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-[11px] text-zinc-500">
                                                <LinkIcon size={24} className="text-zinc-400" />
                                                <span>{t('请连接视频输入、AI 视频或视频预览节点')}</span>
                                            </div>
                                        );
                                    }

                                    const videoFileName = videoInputNode.videoFileName || '未命名视频';
                                    const videoDuration = Number(videoInputNode.videoMeta?.duration) || 0;
                                    const selectedKeyframes = videoInputNode.selectedKeyframes || [];

                                    return (
                                        <>
                                            <div className="space-y-2">
                                                {!videoInputNode.isImageInput && !videoInputNode.isStoryboardInput && (
                                                    videoInputNode.content ? <ResolvedVideo
                                                        src={videoInputNode.content}
                                                        controls
                                                        playsInline
                                                        preload="metadata"
                                                        className="canvas-video-analysis-player"
                                                        onLoadedMetadata={event => {
                                                            const video = event.currentTarget;
                                                            const metadata = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
                                                            setNodes(previous => applyVideoMetadata(previous, videoInputNode.id, videoInputNode.content, metadata));
                                                        }}
                                                    /> : <p className="text-[11px] text-zinc-500">{uiText("已连接视频节点，请先在生成任务中应用视频结果，或为视频输入节点上传视频。")}</p>
                                                )}
                                                <div className={`text-[11px] px-2 py-1.5 rounded border ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-300'}`}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-zinc-500">{videoInputNode.isImageInput ? uiText("关联的图片") : uiText("关联的视频")}</span>
                                                    </div>
                                                    <div className="text-zinc-700 dark:text-zinc-300">
                                                        <div>{t('文件名:')} {videoInputNode.isImageInput ? t('图片输入') : videoFileName}</div>
                                                        {!videoInputNode.isImageInput && <div>{t('总时长:')} {videoDuration.toFixed(1)}s</div>}
                                                        <div>{t('已选关键帧:')} {selectedKeyframes.length} {t('个')}</div>
                                                    </div>
                                                </div>

                                                {!!cloudDocument && (
                                                    <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-500">
                                                        {uiText("云端视频拆解暂未开放。当前可预览视频、在视频输入节点整理关键帧；AI 提示词反推、导演拆解和口播转写暂不可用。")}</p>
                                                )}
                                                {!cloudDocument && (node.settings?.analysisMode || 'manual') === 'manual' && selectedKeyframes.length === 0 && (
                                                    <p className="text-[11px] text-zinc-500">{uiText("请先连接“视频输入 / 关键帧整理”节点，抽帧并选中关键帧后再生成提示词。")}</p>
                                                )}
                                                {/* 模式选择切换按钮 */}
                                                <div className={`flex items-center gap-2 p-1 rounded-lg border shadow-inner ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-100 border-zinc-200'
                                                    }`}>
                                                    <button
                                                        onClick={() => updateNodeSettings(node.id, { analysisMode: 'manual' })}
                                                        className={`flex-1 py-1 px-2 text-[11px] rounded transition-all flex justify-center items-center gap-1 ${(node.settings?.analysisMode || 'manual') === 'manual'
                                                            ? theme === 'dark'
                                                                ? 'bg-zinc-600 shadow-md text-blue-300 font-bold'
                                                                : 'bg-white shadow-md text-blue-600 font-bold'
                                                            : theme === 'dark'
                                                                ? 'text-zinc-500 hover:text-zinc-300'
                                                                : 'text-zinc-500 hover:text-zinc-700'
                                                            }`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <Camera size={12} /> {uiText("手动选帧拆解")}</button>
                                                    <button
                                                        onClick={() => updateNodeSettings(node.id, { analysisMode: 'auto' })}
                                                        className={`flex-1 py-1 px-2 text-[11px] rounded transition-all flex justify-center items-center gap-1 ${node.settings?.analysisMode === 'auto'
                                                            ? theme === 'dark'
                                                                ? 'bg-zinc-600 shadow-md text-purple-300 font-bold'
                                                                : 'bg-white shadow-md text-purple-600 font-bold'
                                                            : theme === 'dark'
                                                                ? 'text-zinc-500 hover:text-zinc-300'
                                                                : 'text-zinc-500 hover:text-zinc-700'
                                                            }`}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <Sparkles size={12} /> {uiText("AI 导演拆解")}</button>
                                                </div>

                                                {(node.settings?.analysisMode || 'manual') === 'manual' && (
                                                    <>
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[11px] text-zinc-500">{uiText("按时间段分组:")}</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="30"
                                                                value={node.settings?.segmentDuration || 3}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value) || 3;
                                                                    updateNodeSettings(node.id, { segmentDuration: val });
                                                                    setLastUsedSegmentDuration(val.toString());
                                                                    try { localStorage.setItem('tapnow_last_segment_duration', val.toString()); } catch { }
                                                                }}
                                                                className={`w-16 px-2 py-1 text-[11px] rounded border ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'}`}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                            />
                                                            <span className="text-[11px] text-zinc-500">{uiText("秒")}</span>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[11px] text-zinc-500">{uiText("模型:")}</label>
                                                            {/* V3.4.10：供应商 -> 模型双层选择器 */}
                                                            <div className="relative flex-1">
                                                                <button
                                                                    disabled={!!cloudDocument}
                                                                    onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown.type === 'analyze-model' ? null : { nodeId: node.id, type: 'analyze-model' }); }}
                                                                    className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] border transition-colors ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                                                                        : 'bg-zinc-50 border-zinc-300 text-zinc-800 hover:border-zinc-400'
                                                                        }`}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                >
                                                                    <span className="truncate font-mono">{cloudDocument ? uiText("视频分析模型暂未开放") : (getApiConfigByKey(node.settings?.model)?.id || node.settings?.model || 'gemini-3-pro')}</span>
                                                                    <ChevronDown size={10} className="opacity-50 shrink-0 ml-1" />
                                                                </button>
                                                                {!cloudDocument && activeDropdown?.nodeId === node.id && activeDropdown.type === 'analyze-model' && (
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
                                                                            {Object.entries(groupedApiConfigs)
                                                                                .filter(([, group]) => group.models.some(m => isChatModelType(m.type)))
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
                                                                                ))}
                                                                        </div>
                                                                        {/* Model 列表 */}
                                                                        <div className="flex-1 pl-1 max-h-80 overflow-y-auto custom-scrollbar">
                                                                            {hoveredProvider && groupedApiConfigs[hoveredProvider]?.models
                                                                                .filter(m => isChatModelType(m.type))
                                                                                .map((m) => {
                                                                                    const modelKey = m._uid || m.id;
                                                                                    const currentModelKey = resolveModelKey(node.settings?.model);
                                                                                    return (
                                                                                        <button
                                                                                            key={modelKey}
                                                                                            onClick={() => {
                                                                                                updateNodeSettings(node.id, { model: modelKey });
                                                                                                setLastUsedAnalyzeModel(modelKey);
                                                                                                try { localStorage.setItem('tapnow_last_analyze_model', modelKey); } catch { }
                                                                                                setActiveDropdown(null);
                                                                                                setHoveredProvider(null);
                                                                                            }}
                                                                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${currentModelKey === modelKey
                                                                                                ? theme === 'dark' ? 'bg-blue-600/30 text-blue-300' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-blue-100 text-blue-700'
                                                                                                : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-300' : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'
                                                                                                }`}
                                                                                        >
                                                                                            <span className="text-[10px] font-medium truncate font-mono">{m.displayName || m.modelName || m.id}</span>
                                                                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(modelKey)}`}></div>
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            {!hoveredProvider && (
                                                                                <div className={`text-[10px] px-2 py-3 text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                                    {uiText("← 选择 Provider")}</div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                <button
                                                    onClick={() => node.settings?.analysisMode === 'auto' ? handleAutoVideoAnalysis(node.id) : handleGeneratePrompts(node.id)}
                                                    disabled={!!cloudDocument || node.isGenerating || ((node.settings?.analysisMode || 'manual') === 'manual' && selectedKeyframes.length === 0)}
                                                    className={`w-full px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${node.isGenerating
                                                        ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                                                        : node.settings?.analysisMode === 'auto'
                                                            ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg'
                                                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                                                        }`}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                >
                                                    {node.isGenerating ? (
                                                        <>
                                                            <Loader2 size={14} className="animate-spin" />
                                                            <span>{node.settings?.analysisMode === 'auto' ? t('AI 正在拉片分析中...') : t('生成中...')}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Sparkles size={14} />
                                                            <span>{node.settings?.analysisMode === 'auto' ? t('开始全自动拆解视频') : t('为选中关键帧生成提示词')}</span>
                                                        </>
                                                    )}
                                                </button>

                                                {node.errorMsg && (
                                                    <div className="text-[10px] text-red-500 px-2 py-1 rounded bg-red-500/10">
                                                        {node.errorMsg}
                                                    </div>
                                                )}
                                            </div>

                                            {/* 结果展示区（自动模式） */}
                                            {node.settings?.analysisMode === 'auto' && node.settings?.analysisResults?.length > 0 && (
                                                <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
                                                    {/* 口播文案 (Voiceover) */}
                                                    {node.settings.voiceoverResults?.length > 0 && (
                                                        <div className={`p-2 rounded-lg mb-4 ${theme === 'dark' ? 'bg-zinc-700/50 border border-zinc-700' : 'bg-zinc-50 border border-blue-200'}`}>
                                                            <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1 ${theme === 'dark' ? 'text-white' : 'text-blue-700'}`}>
                                                                <Mic2 size={12} /> {uiText("提取口播文案")}</h4>
                                                            <div className="space-y-1">
                                                                {node.settings.voiceoverResults.map((v, i) => (
                                                                    <p
                                                                        key={i}
                                                                        className={`text-[10px] select-text cursor-text ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
                                                                        onMouseDown={(e) => e.stopPropagation()}
                                                                    >
                                                                        <span className="font-mono text-xs mr-2 opacity-70">[{v.time_range || `${v.time}s`}]</span>
                                                                        {v.text || <span className="text-zinc-400 italic">{uiText("（无口播）")}</span>}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* 场景拆解结果 */}
                                                    <h4 className={`text-xs font-semibold mb-3 flex items-center gap-1 ${theme === 'dark' ? 'text-white' : 'text-zinc-800'}`}>
                                                        <Camera size={12} /> {uiText("导演级场景分析 (")}{node.settings.analysisResults.length} {uiText("场景)")}</h4>

                                                    <div className="space-y-4">
                                                        {node.settings.analysisResults.map((scene, i) => (
                                                            <div key={i} className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-zinc-800 border border-zinc-700' : 'bg-zinc-50 border border-zinc-200'}`}>
                                                                <h5 className={`text-sm font-bold mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-700'}`}>
                                                                    {uiText("场景") + " "}{scene.scene_index || scene.scene_id || i + 1} <span className="text-xs font-normal opacity-70 ml-2">({scene.time_range})</span>
                                                                </h5>

                                                                {/* 视觉分析 */}
                                                                <div className="text-[11px] space-y-1 mb-3">
                                                                    {scene.keyframes?.[0]?.description && (
                                                                        <p
                                                                            className={`select-text cursor-text ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                        >
                                                                            <span className="font-semibold mr-1">{uiText("运镜/动态:")}</span> {scene.keyframes[0].description}
                                                                        </p>
                                                                    )}
                                                                    {scene.global_tags?.style?.[0] && (
                                                                        <p
                                                                            className={`select-text cursor-text ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
                                                                            onMouseDown={(e) => e.stopPropagation()}
                                                                        >
                                                                            <span className="font-semibold mr-1">{uiText("氛围/风格:")}</span> {scene.global_tags.style[0]}
                                                                        </p>
                                                                    )}
                                                                </div>

                                                                {/* 提示词输出 */}
                                                                <div className="space-y-2">
                                                                    {/* 即梦 Prompt */}
                                                                    {scene.keyframes?.[0]?.jimeng_prompt && (
                                                                        <div className={`p-2 rounded ${theme === 'dark' ? 'bg-zinc-700 border border-zinc-600' : 'bg-zinc-50 border border-gray-300'}`}>
                                                                            <h6 className={`text-[10px] font-semibold mb-1 flex items-center gap-1 ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}><Code size={10} /> {uiText("即梦 Prompt")}</h6>
                                                                            <p
                                                                                className={`text-[10px] whitespace-pre-wrap select-text cursor-text ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}
                                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                            >{scene.keyframes[0].jimeng_prompt}</p>
                                                                            <button onClick={() => navigator.clipboard.writeText(scene.keyframes[0].jimeng_prompt)} className="mt-1 flex items-center text-[9px] text-blue-400 hover:text-blue-300" onMouseDown={(e) => e.stopPropagation()}>
                                                                                <ClipboardCopy size={10} className="mr-1" /> {t('复制')}
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                    {/* Midjourney 提示词 */}
                                                                    {scene.keyframes?.[0]?.mj_prompt && (
                                                                        <div className={`p-2 rounded ${theme === 'dark' ? 'bg-zinc-700 border border-zinc-600' : 'bg-zinc-50 border border-gray-300'}`}>
                                                                            <h6 className={`text-[10px] font-semibold mb-1 flex items-center gap-1 ${theme === 'dark' ? 'text-green-300' : 'text-green-700'}`}><Code size={10} /> MJ Prompt</h6>
                                                                            <p
                                                                                className={`text-[10px] whitespace-pre-wrap select-text cursor-text ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}
                                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                            >{scene.keyframes[0].mj_prompt}</p>
                                                                            <button onClick={() => navigator.clipboard.writeText(scene.keyframes[0].mj_prompt)} className="mt-1 flex items-center text-[9px] text-blue-400 hover:text-blue-300" onMouseDown={(e) => e.stopPropagation()}>
                                                                                <ClipboardCopy size={10} className="mr-1" /> {t('复制')}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 结果展示区 (Manual 模式) */}
                                            {(node.settings?.analysisMode || 'manual') === 'manual' && node.analysisResults && node.analysisResults.length > 0 ? (
                                                <div className="space-y-3 flex-1 flex flex-col min-h-0">
                                                    <div className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 shrink-0">{uiText("拆解提示词 (")}{node.analysisResults.length} {uiText("个场景)")}</div>
                                                    <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                                                        {node.analysisResults.map((result, idx) => {
                                                            // 获取关键帧对应的图片URL（从videoInputNode的frames或selectedKeyframes中查找）
                                                            const getFrameImageUrl = (frameTime) => {
                                                                // 先从selectedKeyframes中查找
                                                                const selectedFrame = videoInputNode.selectedKeyframes?.find(f => Math.abs(f.time - frameTime) < 0.1);
                                                                if (selectedFrame) return selectedFrame.url;
                                                                // 再从frames中查找
                                                                const frame = videoInputNode.frames?.find(f => Math.abs(f.time - frameTime) < 0.1);
                                                                return frame?.url || null;
                                                            };

                                                            // 获取当前场景的主要关键帧（prev/current/next）
                                                            const currentKeyframe = result.keyframes?.find(k => k.type === 'current') || result.keyframes?.[0];
                                                            const prevKeyframe = result.keyframes?.find(k => k.type === 'prev');
                                                            const nextKeyframe = result.keyframes?.find(k => k.type === 'next');

                                                            // 获取简短描述（使用current的描述，如果没有则使用第一个）
                                                            const shortDescription = currentKeyframe?.description || result.keyframes?.[0]?.description || '无描述';

                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-300'}`}
                                                                >
                                                                    {/* 场景标题和时间区间 */}
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <div className="font-medium text-[11px] text-zinc-800 dark:text-zinc-200">
                                                                            {uiText("场景") + " "}{result.scene_index || idx + 1}
                                                                        </div>
                                                                        <div className="text-[10px] text-zinc-500">
                                                                            {result.time_range}
                                                                        </div>
                                                                    </div>

                                                                    {/* 简短描述 */}
                                                                    <div
                                                                        className="text-[10px] text-zinc-600 dark:text-zinc-400 mb-3 line-clamp-2 select-text cursor-text"
                                                                        onMouseDown={(e) => e.stopPropagation()}
                                                                    >
                                                                        {shortDescription}
                                                                    </div>

                                                                    {/* 关键帧缩略图 */}
                                                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                                                        {[prevKeyframe, currentKeyframe, nextKeyframe].map((kf, kfIdx) => {
                                                                            if (!kf) return <div key={kfIdx} className="aspect-video bg-zinc-200 dark:bg-zinc-700 rounded"></div>;
                                                                            const imageUrl = getFrameImageUrl(kf.time);
                                                                            return (
                                                                                <div key={kfIdx} className="relative aspect-video bg-black rounded overflow-hidden">
                                                                                    {imageUrl ? (
                                                                                        <LazyBase64Image src={imageUrl} className="w-full h-full object-cover" alt={uiText("关键帧 {0}", kfIdx + 1)} loading="lazy" />
                                                                                    ) : (
                                                                                        <div className="w-full h-full flex items-center justify-center text-[8px] text-zinc-500">
                                                                                            {kf.type === 'prev' ? uiText("上一帧") : kf.type === 'current' ? uiText("当前帧") : uiText("下一帧")}
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 text-center">
                                                                                        {kf.time.toFixed(1)}s
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>

                                                                    {/* 提示词列表 */}
                                                                    <div className="space-y-2">
                                                                        {result.keyframes?.map((kf, kfIdx) => (
                                                                            <div key={kfIdx} className="space-y-1.5">
                                                                                <div className="text-[9px] text-zinc-500">
                                                                                    {kf.type === 'prev' ? uiText("上一帧") : kf.type === 'current' ? uiText("当前帧") : uiText("下一帧")} ({kf.time.toFixed(1)}s)
                                                                                </div>

                                                                                {/* MJ 提示词 */}
                                                                                {kf.mj_prompt && (
                                                                                    <div className={`p-2 rounded border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-600' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'}`}>
                                                                                        <div className="flex items-start justify-between gap-2">
                                                                                            <div className="flex-1">
                                                                                                <div className="text-[9px] text-zinc-500 mb-1">{uiText("Midjourney 提示词")}</div>
                                                                                                <div
                                                                                                    className="text-[10px] text-zinc-700 dark:text-zinc-300 break-words select-text cursor-text"
                                                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                                                >{kf.mj_prompt}</div>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                                <button
                                                                                                    onClick={async () => {
                                                                                                        try {
                                                                                                            await navigator.clipboard.writeText(kf.mj_prompt);
                                                                                                            canvasAlert(t('已复制到剪贴板'));
                                                                                                        } catch (e) {
                                                                                                            canvasAlert(t('复制失败'));
                                                                                                        }
                                                                                                    }}
                                                                                                    className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${theme === 'dark' ? 'text-zinc-400 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700'}`}
                                                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                                                    title={t('复制')}
                                                                                                >
                                                                                                    <CopyPlus size={12} />
                                                                                                </button>
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        const world = screenToWorld(node.x + node.width + 100, node.y + node.height / 2);
                                                                                                        const newNodeId = `node-${Date.now()}`;

                                                                                                        // 创建图生图节点
                                                                                                        const genImageNode = {
                                                                                                            id: newNodeId,
                                                                                                            type: 'gen-image',
                                                                                                            x: world.x - 180,
                                                                                                            y: world.y - 170,
                                                                                                            width: 360,
                                                                                                            height: 340,
                                                                                                             settings: {
                                                                                                                 model: 'mj-v6',
                                                                                                                 prompt: kf.mj_prompt,
                                                                                                                 ratio: 'Auto',
                                                                                                                resolution: '2K'
                                                                                                             }
                                                                                                         };

                                                                                                        setNodes((prev) => [...prev, genImageNode]);

                                                                                                        // 创建预览节点并连接
                                                                                                        setTimeout(() => {
                                                                                                            const previewWorld = screenToWorld(node.x + node.width + 200, node.y + node.height / 2);
                                                                                                            const previewNodeId = `node-${Date.now() + 1}`;
                                                                                                            const previewNode = {
                                                                                                                id: previewNodeId,
                                                                                                                type: 'preview',
                                                                                                                x: previewWorld.x - 160,
                                                                                                                y: previewWorld.y - 130,
                                                                                                                width: 320,
                                                                                                                height: 260
                                                                                                            };

                                                                                                            setNodes((prev) => [...prev, previewNode]);

                                                                                                            // 连接图生图节点到预览节点
                                                                                                            setConnections((prev) => [...prev, {
                                                                                                                id: `conn-${Date.now()}`,
                                                                                                                from: newNodeId,
                                                                                                                to: previewNodeId
                                                                                                            }]);
                                                                                                        }, 50);
                                                                                                    }}
                                                                                                    className={`p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-600 dark:text-blue-400`}
                                                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                                                    title={t('生成图生图节点')}
                                                                                                >
                                                                                                    <ImagePlus size={12} />
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                )}

                                                                                {/* 即梦提示词 */}
                                                                                {kf.jimeng_prompt && (
                                                                                    <div className={`p-2 rounded border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-600' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'}`}>
                                                                                        <div className="flex items-start justify-between gap-2">
                                                                                            <div className="flex-1">
                                                                                                <div className="text-[9px] text-zinc-500 mb-1">{uiText("即梦提示词")}</div>
                                                                                                <div
                                                                                                    className="text-[10px] text-zinc-700 dark:text-zinc-300 break-words select-text cursor-text"
                                                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                                                >{kf.jimeng_prompt}</div>
                                                                                            </div>
                                                                                            <button
                                                                                                onClick={async () => {
                                                                                                    try {
                                                                                                        await navigator.clipboard.writeText(kf.jimeng_prompt);
                                                                                                        canvasAlert(t('已复制到剪贴板'));
                                                                                                    } catch (e) {
                                                                                                        canvasAlert(t('复制失败'));
                                                                                                    }
                                                                                                }}
                                                                                                className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${theme === 'dark' ? 'text-zinc-400 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700'}`}
                                                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                                                title={t('复制')}
                                                                                            >
                                                                                                <CopyPlus size={12} />
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>

                                                                    {/* 全局标签 */}
                                                                    {result.global_tags && (
                                                                        <div className="mt-2 pt-2 border-t border-zinc-300 dark:border-zinc-700">
                                                                            <div className="text-[9px] text-zinc-500 mb-1">{uiText("全局标签")}</div>
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {Object.entries(result.global_tags).map(([key, values]) => (
                                                                                    Array.isArray(values) && values.map((val, valIdx) => (
                                                                                        <span key={`${key}-${valIdx}`} className="text-[8px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                                                                            {val}
                                                                                        </span>
                                                                                    ))
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    ))}

                    {node.type === 'storyboard-node' ? (
                        <StoryboardNodeContent
                            node={node}
                            context={{
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
                                generateCloudBatch: cloudDocument ? canvasCloud.openBatch : null,
                                cloudText: cloudDocument ? canvasCloud : null,
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
                            }}
                        />
                    ) : null}

                    {node.type === 'image-compare' && (
                        <div className="w-full h-full pointer-events-auto">
                            <ImageCompareView
                                img1={connectedImages[0]}
                                img2={connectedImages[1]}
                                theme={theme}
                                language={language}
                            />
                        </div>
                    )
                    }

                    {
                        node.type === 'preview' && (
                            <div className="flex flex-col h-full pointer-events-auto">
                                <div
                                    className={`flex items-center justify-between px-3 py-2 border-b text-xs font-semibold ${theme === 'dark'
                                        ? 'border-zinc-800 text-zinc-200'
                                        : 'border-zinc-200 text-zinc-700'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <Maximize2 size={13} className="text-blue-500" />
                                        <span>{t('预览窗口')}</span>
                                    </div>
                                    <span className="text-[10px] text-zinc-500">
                                        {node.previewType === 'video' ? uiText("视频预览") : uiText("图片预览")}
                                    </span>
                                </div>
                                <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
                                    <div
                                        className={`relative flex-1 rounded-lg overflow-hidden flex items-center justify-center min-h-0 ${theme === 'dark'
                                            ? 'bg-zinc-900'
                                            : theme === 'solarized'
                                                ? 'bg-[#fdf6e3]'
                                                : 'bg-zinc-100'
                                            }`}
                                        onDrop={(e) => handlePreviewDrop(node.id, e)}
                                        onDragOver={handleCanvasDragOver}
                                        onContextMenu={(e) => {
                                            const previewUrl = node.content || (node.previewMjImages && node.previewMjImages[0]);
                                            if (previewUrl) {
                                                handlePreviewRightClick(e, { url: previewUrl, type: node.previewType || (isVideoUrl(previewUrl) ? 'video' : 'image'), sourceNode: node });
                                            }
                                        }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            const previewUrl = node.content || (node.previewMjImages && node.previewMjImages[0]);
                                            if (previewUrl) {
                                                setLightboxItem({ url: previewUrl, type: node.previewType || (isVideoUrl(previewUrl) ? 'video' : 'image') });
                                            }
                                        }}
                                    >
                                        {node.content || (node.previewMjImages && node.previewMjImages.length > 0) ? (
                                            isVideoUrl(node.content) || node.previewType === 'video' ? (
                                                <ResolvedVideo
                                                    src={node.content}
                                                    className={`w-full h-full object-contain ${theme === 'dark'
                                                        ? 'bg-black'
                                                        : theme === 'solarized'
                                                            ? 'bg-[#fdf6e3]'
                                                            : 'bg-zinc-100'
                                                        }`}
                                                    controls
                                                    draggable={false}
                                                />
                                            ) : node.previewMjImages && (node.previewMjImages.length === 4 || node.previewMjImages.length > 1) ? (
                                                // 多张图片网格显示（即梦回传的四张图）
                                                <div className={`w-full h-full grid gap-0.5 p-0.5 ${node.previewMjImages.length === 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}>
                                                    {node.previewMjImages.map((imgUrl, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`relative w-full h-full overflow-hidden flex items-center justify-center group ${theme === 'dark'
                                                                ? 'bg-black'
                                                                : theme === 'solarized'
                                                                    ? 'bg-[#fdf6e3]'
                                                                    : 'bg-zinc-100'
                                                                }`}
                                                        >
                                                            <LazyBase64Image
                                                                src={imgUrl}
                                                                className="max-w-full max-h-full w-auto h-auto object-contain"
                                                                alt={uiText("预览图 {0}", idx + 1)}
                                                                draggable={false}
                                                                onError={(e) => {
                                                                    console.error(`预览图片 ${idx + 1} 加载失败`);
                                                                    e.target.style.display = 'none';
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="w-full h-full relative group/preview">
                                                    <LazyBase64Image
                                                        src={node.content || (node.previewMjImages && node.previewMjImages[0])}
                                                        className={`w-full h-full object-contain ${theme === 'dark'
                                                            ? 'bg-black'
                                                            : theme === 'solarized'
                                                                ? 'bg-[#fdf6e3]'
                                                                : 'bg-zinc-100'
                                                            }`}
                                                        draggable={false}
                                                        onError={(e) => {
                                                            // 错误处理：由于 LazyBase64Image 有内部状态，这里主要处理外部 URL 错误
                                                            console.warn('[Preview] Image load error');
                                                        }}
                                                    />
                                                    {/* V3.7.8：文件名浮层 */}
                                                    {node.previewFilename && (
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate opacity-0 group-hover/preview:opacity-100 transition-opacity backdrop-blur-sm" title={node.previewFilename}>
                                                            {node.previewFilename}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        ) : (
                                            <PreviewEmptyState
                                                status={getPreviewConnectionStatus(node.id, {
                                                    nodesMap,
                                                    incoming: id => connectionsByNode.to.get(id) || [],
                                                    outgoing: id => connectionsByNode.from.get(id) || [],
                                                })}
                                                t={t}
                                            />
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <button
                                            className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded border ${theme === 'dark'
                                                ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                                                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                                                }`}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={async (event) => {
                                                event.stopPropagation();
                                                try {
                                                    const link = canvasCloud.getPreviewLink(node);
                                                    await writeClipboardText(link.url, navigator, document);
                                                    showToast(link.authenticated ? uiText("已复制素材预览链接，需登录有权限的账号打开") : uiText("链接已复制"), 'success');
                                                } catch (error) { showToast(error.message || uiText("复制失败，请重试"), 'error'); }
                                            }}
                                        >
                                            <CopyPlus size={13} />
                                            {t('复制链接')}
                                        </button>
                                        <button
                                            className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded border ${theme === 'dark'
                                                ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                                                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                                                }`}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                try {
                                                    sendPreviewToCanvas(node);
                                                    showToast(uiText("已添加到画布并定位到新素材节点"), 'success');
                                                } catch (error) { showToast(error.message || uiText("发送失败，请重试"), 'error'); }
                                            }}
                                        >
                                            <ArrowRightSquare size={13} />
                                            {t('发送到画布')}
                                        </button>
                                        <button
                                            className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded border ${theme === 'dark'
                                                ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                                                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                                                }`}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={() => {
                                                if (!node.content) return;
                                                const isVideo = node.previewType === 'video' || isVideoUrl(node.content);
                                                const newFile = {
                                                    name: isVideo ? 'Preview.mp4' : 'Preview.png',
                                                    type: isVideo ? 'video/mp4' : 'image/png',
                                                    content: node.content,
                                                    isImage: !isVideo,
                                                    isVideo,
                                                    isAudio: false,
                                                    fromPreview: true
                                                };
                                                setChatFiles((prev) => [...prev, newFile]);
                                                setIsChatOpen(true);
                                            }}
                                        >
                                            <MessageSquare size={13} />
                                            {t('发送到对话')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    {
                        (node.type === 'gen-image' || node.type === 'gen-video') ? (
                            <GenerationNodeContent
                                node={node}
                                context={{
                                    history,
                                    nodeTimers,
                                    theme,
                                    connectedImages,
                                    connections,
                                    nodesMap,
                                    updateNodeSettings,
                                    characterLibrary,
                                    setCharactersOpen,
                                    characterReferenceBarExpanded,
                                    setCharacterReferenceBarExpanded,
                                    getApiConfigByKey,
                                    getConnectedImageForInput,
                                    connectingTarget,
                                    connectingInputType,
                                    screenToWorld,
                                    setMousePos,
                                    setConnectingTarget,
                                    setConnectingInputType,
                                    handleNodeMouseUp,
                                    isNanoBanana2,
                                    promptLibraryCollapsed,
                                    setPromptLibraryCollapsed,
                                    promptLibrary,
                                    promptLibraryEditorOpen,
                                    setPromptLibraryEditorOpen,
                                    promptLibraryForm,
                                    setPromptLibraryForm,
                                    applyLibraryPrompt,
                                    removePromptLibraryItem,
                                    addPromptLibraryItem,
                                    renderCustomParamInputs,
                                    getModelLabelWithProvider,
                                    activeDropdown,
                                    setActiveDropdown,
                                    getStatusColor,
                                    resolveModelKey,
                                    groupedApiConfigs,
                                    hoveredProvider,
                                    setHoveredProvider,
                                    applyNodeModelSelection,
                                    setLastUsedImageModel,
                                    setLastUsedVideoModel,
                                    localStorage,
                                    getRatiosForModel,
                                    setLastUsedRatio,
                                    lastUsedVideoResolution,
                                    getVideoResolutionsForModel,
                                    setLastUsedVideoResolution,
                                    getResolutionsForModel,
                                    setLastUsedImageResolution,
                                    getDefaultDurationsForModel,
                                    getConnectedTextNodes,
                                    startGeneration
                                }}
                            />
                        ) : null
                    }
                </div>
            </div >
        );
    };
}
