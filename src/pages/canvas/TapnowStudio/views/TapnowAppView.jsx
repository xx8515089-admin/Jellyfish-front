import { canvasAlert, canvasConfirm } from '../canvasDialogs';
import { Tooltip } from 'antd'
import CanvasModelSettings from '../components/CanvasModelSettings';
import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
    Plus,
    X,
    Layers,
    MousePointer2,
    Loader2,
    History,
    Trash2,
    CheckCircle2,
    Circle,
    CopyPlus,
    ArrowRightSquare,
    MessageSquare,
    Send,
    Paperclip,
    FileText,
    FileAudio,
    FileImage,
    ChevronRight,
    Bot,
    User,
    Users,
    RefreshCw,
    Maximize2,
    LayoutGrid,
    Check,
    Scissors,
    Layout,
    Download,
    Save,
    FolderOpen,
    ChevronDown,
    Zap
} from 'lucide-react';
import { CanvasEmptyHint, CanvasTopBar } from '../components/CanvasChrome';
import CanvasNodeRenderBoundary from '../components/CanvasNodeRenderBoundary';
import ConnectionLayer from '../components/ConnectionLayer';
import HistoryToolsPanel from '../components/HistoryToolsPanel';
import CanvasCharacterLibrary from '../components/CanvasCharacterLibrary';
import {
    t,
    LazyBase64Image,
    ResolvedVideo,
    ArtisticProgress,
    HistoryItem,
    VIRTUAL_CANVAS_WIDTH,
    VIRTUAL_CANVAS_HEIGHT,
    DEFAULT_BASE_URL,
    DEFAULT_PROVIDERS,
    isChatModelType,
    getImageDimensions,
    isVideoUrl,
    getLightboxNavImages,
    Lightbox
} from '../freeCanvasShared';
import CanvasSettingsModal from './CanvasSettingsModal';

export default function TapnowAppView({
    arrangeMessageContext,
    HISTORY_SAVE_LIMIT_MAX,
    HISTORY_SAVE_LIMIT_MIN,
    activeDropdown,
    activeTool,
    addModelLibraryCustomParam,
    addModelLibraryEntry,
    addNode,
    apiBlacklist,
    apiBlacklistRef,
    apiConfigs,
    apiStatus,
    apiSuspendList,
    apiTesting,
    applyFrameToSelectedNode,
    applyHistorySaveLimitInput,
    assetBundleBlobUrlsRef,
    autoArrangeNodes,
    batchGroups,
    batchModalOpen,
    batchQueue,
    batchQueueMode,
    batchRunningItems,
    batchSelectedIds,
    cacheRedownloadOnEnable,
    canvasCloud,
    canvasRef,
    charactersOpen,
    chatEndRef,
    chatFiles,
    chatHoveredProvider,
    chatInput,
    chatInputRef,
    chatModel,
    chatModelDropdownOpen,
    chatSessionDropdownOpen,
    chatSessions,
    chatWidth,
    clearBatchQueue,
    closeInputImageContextMenu,
    closePreviewContextMenu,
    closeStoryboardTableCellEditor,
    cloudDocument,
    collapsedLibraryModels,
    collapsedLibraryStateLoadedRef,
    commitProjectNameEdit,
    connectingInputType,
    connectingSource,
    connectingTarget,
    connectionLayerRef,
    connections,
    connectionsByNode,
    contextMenu,
    contextMenuExpanded,
    createCharacter,
    createCharacterEndSecond,
    createCharacterEndpoint,
    createCharacterOpen,
    createCharacterSelectedTaskId,
    createCharacterStartSecond,
    createCharacterSubmitting,
    createCharacterVideoError,
    createCharacterVideoSourceType,
    createCharacterVideoUrl,
    createNewChat,
    currentChatId,
    currentSession,
    deleteApiConfig,
    deleteChatSession,
    deleteHistoryItem,
    deleteModelLibraryCustomParam,
    deleteModelLibraryEntry,
    deletingProviderKey,
    disconnectConnection,
    downloadDisplay,
    dragNodeId,
    duplicateModelLibraryEntry,
    editingApiModels,
    editingLibraryModels,
    editingProvider,
    error1006WindowRef,
    expandedProviders,
    exportApiModelConfig,
    exportModelLibraryEntry,
    fetchCacheSource,
    findHistoryNavIndex,
    frameContextMenu,
    getApiConfigByKey,
    getDefaultDurationsForModel,
    getHistoryMeta,
    getHistoryMultiImages,
    getHistoryNavAnchorIndex,
    getHistoryNavPreview,
    getItemProxyPreference,
    getModelLabelWithProvider,
    getStatusColor,
    getVideoResolutionsForModel,
    globalApiKey,
    globalPerformanceMode,
    groupedApiConfigs,
    handleBackgroundClick,
    handleBatchDownload,
    handleCanvasContextMenu,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleChatDrop,
    handleChatFileUpload,
    handleChatResizeStart,
    handleDoubleClick,
    handleHistoryBatchDownload,
    handleHistoryCacheMissing,
    handleHistoryRightClick,
    handleImportWorkflow,
    handleLanguageChange,
    handleLoadProject,
    handleMouseDown,
    handleNewProject,
    handleSaveProject,
    handleSaveSelectedWorkflow,
    handleSplitGridFromUrl,
    handleStoryboardTableCellEditorChange,
    handleToggleTheme,
    hasExpandedLibraryModels,
    history,
    historyCachePanelOpen,
    historyContextMenu,
    historyLimit,
    historyLocalCacheMap,
    historyMap,
    historyNavItems,
    historyOpen,
    historyQueuePanelOpen,
    historySaveLimit,
    historySaveLimitInput,
    historySaveLimitTimerRef,
    historySelection,
    historySendMenuOpen,
    hoverTargetId,
    importApiModelConfigs,
    importModelLibraryEntries,
    inputImageContextMenu,
    isChatOpen,
    isChatSending,
    isEditingProjectName,
    isInteracting,
    isLibraryNotesCollapsed,
    isLibrarySectionCollapsed,
    isLocalCacheUrlAvailable,
    isLowDetail,
    isPerfMode,
    jimengUseLocalFile,
    language,
    libraryAsyncConfigDrafts,
    libraryAsyncPreviewModels,
    libraryPreviewDrafts,
    libraryPreviewEditing,
    libraryPreviewModels,
    libraryRequestChainDrafts,
    libraryRequestPreviewDrafts,
    libraryRequestPreviewEditing,
    libraryRequestTemplateDrafts,
    libraryTransportOptionsDrafts,
    lightboxHistoryIndexRef,
    lightboxHistorySnapshotRef,
    lightboxItem,
    lightboxItemRef,
    localCacheActive,
    localCacheBannerVisible,
    localCacheEnabled,
    localCacheServerConnected,
    localServerConfig,
    localServerUrl,
    localStorage,
    markInteraction,
    maxUndoSteps,
    modelLibrary,
    modelLibraryContractIssuesById,
    modelLibraryMap,
    mousePos,
    nodeConnectedStatus,
    nodes,
    nodesMap,
    normalizeLocalPath,
    normalizeProviderConfig,
    onRefreshCloudModels,
    openHistorySendMenu,
    performanceMode,
    pickLocalCachePath,
    pollSoraJob,
    pollVeoJob,
    previewContextMenu,
    progressState,
    projectName,
    projectNameInputRef,
    providers,
    rebuildAllHistoryThumbnails,
    rebuildHistoryThumbnail,
    redo,
    redoStack,
    refreshLocalCache,
    removeChatFile,
    removeQueuedBatchGroup,
    removeQueuedBatchItem,
    renderNode,
    resolveHistoryUrl,
    resolveModelKey,
    saveHistoryAssets,
    scheduleHistorySendMenuClose,
    screenToWorld,
    selectedAdjacentSet,
    selectedNodeId,
    selectedNodeIdForAdjacency,
    selectedNodeIds,
    selectedNodeIdsRef,
    selectionBox,
    selectionContextMenu,
    sendChatMessage,
    sendFrameToCanvas,
    sendFrameToChat,
    sendFrameToPreview,
    sendHistoryPromptSmart,
    sendHistorySmart,
    sendHistoryToCanvas,
    sendHistoryToChat,
    sendHistoryToPreview,
    sendInputImageToChat,
    sendPreviewToCanvas,
    sendPreviewToChat,
    sessionStartTime,
    setActiveDropdown,
    setActiveTool,
    setApiBlacklist,
    setApiConfigs,
    setApiModelEditing,
    setApiSuspendList,
    setBatchModalOpen,
    setBatchQueueMode,
    setBatchSelectedIds,
    setCacheRedownloadOnEnable,
    setCharactersOpen,
    setChatHoveredProvider,
    setChatInput,
    setChatModel,
    setChatModelDropdownOpen,
    setChatSessionDropdownOpen,
    setCollapsedLibraryModels,
    setContextMenu,
    setContextMenuExpanded,
    setCreateCharacterEndSecond,
    setCreateCharacterEndpoint,
    setCreateCharacterOpen,
    setCreateCharacterSelectedTaskId,
    setCreateCharacterStartSecond,
    setCreateCharacterSubmitting,
    setCreateCharacterVideoError,
    setCreateCharacterVideoSourceType,
    setCreateCharacterVideoUrl,
    setCurrentChatId,
    setDeletingProviderKey,
    setEditingProvider,
    setExpandedProviders,
    setFrameContextMenu,
    setGlobalApiKey,
    setGlobalPerformanceMode,
    setHistory,
    setHistoryCachePanelOpen,
    setHistoryContextMenu,
    setHistoryFocusId,
    setHistoryFocusIndex,
    setHistoryOpen,
    setHistoryQueuePanelOpen,
    setHistorySaveLimitInput,
    setHistorySelection,
    setHistorySendMenuOpen,
    setIsChatHovered,
    setIsChatInputFocused,
    setIsChatOpen,
    setIsEditingProjectName,
    setJimengUseLocalFile,
    setLibraryAsyncConfigDrafts,
    setLibraryModelEditing,
    setLibraryPreviewDrafts,
    setLibraryPreviewEditing,
    setLibraryRequestChainDrafts,
    setLibraryRequestPreviewDrafts,
    setLibraryRequestPreviewEditing,
    setLibraryRequestTemplateDrafts,
    setLibraryTransportOptionsDrafts,
    setLightboxItem,
    setLocalCacheBannerVisible,
    setLocalCacheEnabled,
    setLocalServerConfig,
    setLocalServerUrl,
    setMaxUndoSteps,
    setModelLibrary,
    setPerformanceMode,
    setProjectName,
    setProviders,
    setSaveHistoryAssets,
    setSelectionContextMenu,
    setSettingsOpen,
    setSettingsTab,
    settingsOpen,
    settingsTab,
    showToast,
    stopRunningShot,
    storyboardTableCellEditor,
    testApiConnection,
    theme,
    toasts,
    toggleLibraryAsyncPreview,
    toggleLibraryModelCollapse,
    toggleLibraryNotesCollapsed,
    toggleLibraryPreview,
    toggleLibrarySectionCollapsed,
    undo,
    undoStack,
    updateApiConfig,
    updateLocalCacheServerConfig,
    updateModelLibraryCustomParam,
    updateModelLibraryEntry,
    view,
    visibleNodes,
    viewportBounds,
    nodeRenderState,
}) {
    return (
<>
            {arrangeMessageContext}
            {canvasCloud.controls}
            {/* 极简艺术进度条 */}
            <ArtisticProgress
                visible={progressState.visible}
                progress={progressState.progress}
                status={progressState.status}
                type={progressState.type}
            />
            <div
                className={`jellyfish-canvas-runtime theme-${theme} w-full h-full font-sans overflow-hidden select-none flex flex-col transition-colors duration-300 ${theme === 'dark'
                    ? 'bg-[#09090b] text-white'
                    : theme === 'solarized'
                        ? 'bg-[#fdf6e3] text-[#586e75]'
                        : 'bg-zinc-100 text-zinc-900'
                    } ${isPerfMode ? 'perf-mode' : ''} ${isInteracting ? 'interacting' : ''}`}
                onClick={() => {
                    if (historyContextMenu.visible) setHistoryContextMenu(prev => ({ ...prev, visible: false }));
                    if (historySendMenuOpen) setHistorySendMenuOpen(false);
                    if (frameContextMenu.visible) setFrameContextMenu(prev => ({ ...prev, visible: false }));
                }}
            >
                <CanvasTopBar
                    theme={theme}
                    projectName={projectName}
                    setProjectName={setProjectName}
                    isEditingProjectName={isEditingProjectName}
                    setIsEditingProjectName={setIsEditingProjectName}
                    projectNameInputRef={projectNameInputRef}
                    onProjectNameCommit={commitProjectNameEdit}
                    onNewProject={handleNewProject}
                    globalPerformanceMode={globalPerformanceMode}
                    setGlobalPerformanceMode={setGlobalPerformanceMode}
                    onBatchDownload={handleBatchDownload}
                    onToggleTheme={handleToggleTheme}
                    language={language}
                    onLanguageChange={handleLanguageChange}
                    onUndo={undo}
                    onRedo={redo}
                    undoDisabled={undoStack.length === 0}
                    redoDisabled={redoStack.length === 0}
                    onOpenSettings={() => setSettingsOpen(true)}
                />

                <div className={`flex-1 relative overflow-hidden flex transition-colors duration-300 ${theme === 'dark'
                    ? 'bg-[#09090b]'
                    : theme === 'solarized'
                        ? 'bg-[#fdf6e3]'
                        : 'bg-zinc-100'
                    }`}>
                    {/* 侧边栏 */}
                    <div
                        className={`w-14 border-r flex flex-col items-center py-3 gap-3 z-40 shrink-0 transition-colors duration-300 ${theme === 'dark'
                            ? 'bg-[#09090b] border-zinc-800'
                            : theme === 'solarized'
                                ? 'bg-[#eee8d5] border-[#d7cfb2]'
                                : 'bg-white border-zinc-200'
                            }`}
                    >
                        <Tooltip placement="right" title={t('自动整理节点：多选时整理所选，未选择时整理全部，可撤销')}>
                            <button
                                onClick={autoArrangeNodes}
                                className={`p-2.5 rounded-lg transition-all mb-2 ${theme === 'dark'
                                    ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200'
                                    }`}
                                type="button"
                                aria-label={t('自动整理节点')}
                            >
                                <Layout size={18} />
                            </button>
                        </Tooltip>
                        {[{ id: 'select', icon: MousePointer2 }, { id: 'history', icon: History }, { id: 'characters', icon: Users }].map((tool) => (
                            <button
                                key={tool.id}
                                onClick={() => {
                                    setActiveTool(tool.id);
                                    if (tool.id === 'history') setHistoryOpen(!historyOpen);
                                    if (tool.id === 'characters') setCharactersOpen(!charactersOpen);
                                }}
                                className={`p-2.5 rounded-lg transition-all ${activeTool === tool.id
                                    ? theme === 'dark'
                                        ? 'bg-zinc-800 text-white'
                                        : theme === 'solarized'
                                            ? 'bg-[#616161] text-[#fdf6e3] hover:bg-[#555555]'
                                            : 'bg-zinc-200 text-zinc-900'
                                    : theme === 'dark'
                                        ? 'text-zinc-500 hover:text-zinc-300'
                                        : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                            >
                                <tool.icon size={18} />
                            </button>
                        ))}
                        <div className="flex-1"></div>
                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            className={`p-2.5 rounded-lg transition-all mb-2 ${isChatOpen
                                ? theme === 'solarized'
                                    ? 'bg-[#616161] text-[#fdf6e3] hover:bg-[#555555]'
                                    : 'bg-blue-600 text-white'
                                : theme === 'dark'
                                    ? 'text-zinc-500 hover:text-zinc-300'
                                    : 'text-zinc-500 hover:text-zinc-800'
                                }`}
                            title={t('AI 对话')}
                        >
                            <MessageSquare size={18} />
                        </button>
                        {/* 功能5：保存和加载按钮 */}
                        <button
                            onClick={handleSaveProject}
                            className={`p-2.5 rounded-lg transition-all ${theme === 'dark'
                                ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200'
                                }`}
                            title={t('保存项目')}
                        >
                            <Save size={18} />
                        </button>
                        <button
                            onClick={handleLoadProject}
                            className={`p-2.5 rounded-lg transition-all mb-2 ${theme === 'dark'
                                ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200'
                                }`}
                            title={t('加载项目')}
                        >
                            <FolderOpen size={18} />
                        </button>
                        <button
                            onClick={handleImportWorkflow}
                            className={`p-2.5 rounded-lg transition-all mb-2 ${theme === 'dark'
                                ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200'
                                }`}
                            title={t('导入工作流')}
                        >
                            <Download size={18} />
                        </button>
                    </div>

                    {/* 历史记录面板 */}
                    {historyOpen && cloudDocument && (
                        <aside className="canvas-history-inline canvas-history-drawer" aria-label="生成历史">
                            <header className="canvas-history-inline__header">
                                <div><h3>{t('生成历史')}</h3><span>云端任务记录</span></div>
                                <button type="button" onClick={() => setHistoryOpen(false)} aria-label="关闭生成历史"><X size={16} /></button>
                            </header>
                            {canvasCloud.historyPanel}
                        </aside>
                    )}
                    {historyOpen && !cloudDocument && (
                        <div
                            className={`w-72 z-30 flex flex-col animate-in slide-in-from-left border-r transition-colors duration-300 ${theme === 'dark'
                                ? 'bg-[#121214] border-zinc-800'
                                : theme === 'solarized'
                                    ? 'bg-[#fdf6e3] border-[#d7cfb2]'
                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                }`}
                        >
                            <div
                                className={`p-3 border-b flex justify-between items-center ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
                                    }`}
                            >
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-end gap-2">
                                        <h3
                                            className={`font-bold text-xs leading-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                                                }`}
                                        >
                                            <span className="block">{t('生成')}</span>
                                            <span className="block">{t('历史')}</span>
                                        </h3>
                                        <span className="text-[9px] text-zinc-500 font-mono whitespace-nowrap">
                                            {downloadDisplay.visible
                                                ? `${downloadDisplay.current}/${downloadDisplay.total > 0 ? Math.round((downloadDisplay.current / downloadDisplay.total) * 100) : 0}%`
                                                : `${history.length}/${historyLimit > 0 ? Math.min(100, Math.round((history.length / historyLimit) * 100)) : 0}%`}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            const modes = ['off', 'normal', 'ultra'];
                                            const currentIdx = modes.indexOf(performanceMode);
                                            const nextIdx = (currentIdx + 1) % modes.length;
                                            setPerformanceMode(modes[nextIdx]);
                                        }}
                                        className={`p-1.5 rounded transition-colors flex items-center gap-1 ${performanceMode === 'ultra'
                                            ? theme === 'dark'
                                                ? 'text-orange-400 bg-orange-500/20 hover:bg-orange-500/30'
                                                : 'text-orange-600 bg-orange-100 hover:bg-orange-200'
                                            : performanceMode === 'normal'
                                                ? theme === 'dark'
                                                    ? 'text-green-400 bg-green-500/20 hover:bg-green-500/30'
                                                    : 'text-green-600 bg-green-100 hover:bg-green-200'
                                                : theme === 'dark'
                                                    ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                            }`}
                                        title={
                                            performanceMode === 'ultra' ? '极致性能模式（点击关闭）'
                                                : performanceMode === 'normal' ? '普通性能模式（点击切换极致）'
                                                    : '性能模式已关闭（点击开启）'
                                        }
                                    >
                                        <Zap size={14} />
                                    </button>
                                    <button
                                        onClick={() => setHistoryCachePanelOpen(prev => !prev)}
                                        className={`p-1.5 rounded transition-colors ${historyCachePanelOpen
                                            ? theme === 'dark'
                                                ? 'text-blue-400 bg-blue-500/20 hover:bg-blue-500/30'
                                                : 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                                            : theme === 'dark'
                                                ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                            }`}
                                        title={t('本地缓存设置')}
                                    >
                                        <FolderOpen size={14} />
                                    </button>
                                    <button
                                        onClick={() => setHistoryQueuePanelOpen(prev => !prev)}
                                        className={`p-1.5 rounded transition-colors ${historyQueuePanelOpen
                                            ? theme === 'dark'
                                                ? 'text-blue-400 bg-blue-500/20 hover:bg-blue-500/30'
                                                : 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                                            : theme === 'dark'
                                                ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                            }`}
                                        title={t('全局队列')}
                                    >
                                        <Layers size={14} />
                                    </button>
                                    {/* V3.5.8: 全选/取消全选按钮 */}
                                    <button
                                        onClick={() => {
                                            // V3.5.18 修复：智能全选逻辑
                                            // 存在搜索或收藏筛选时，仅选择筛选后的条目
                                            // 没有筛选条件时，选择全部已完成条目，不再采用容易造成困惑的 24 小时会话逻辑

                                            // 确定当前可见或筛选后的列表；筛选已在渲染阶段完成，此处采用简化逻辑
                                            // 若不重构就难以在当前作用域直接访问 filteredHistory
                                            // 因此点击全选时，暂按用户希望选择历史列表中全部已完成条目处理
                                            // 待办：搜索或筛选生效时，理想行为应仅选择当前可见条目

                                            const allCompletedItems = history.filter(h => h.status === 'completed');
                                            const targetItems = allCompletedItems;

                                            if (historySelection.size > 0) {
                                                // 有选中的，清空选择
                                                setHistorySelection(new Set());
                                            } else {
                                                // 没有选中的，全选当前可见项目
                                                setHistorySelection(new Set(targetItems.map(h => h.id)));
                                            }
                                        }}
                                        className={`p-1.5 rounded transition-colors flex items-center gap-1 ${historySelection.size > 0
                                            ? theme === 'dark'
                                                ? 'text-blue-400 bg-blue-500/20 hover:bg-blue-500/30'
                                                : 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                                            : theme === 'dark'
                                                ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                                                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                            }`}
                                        title={historySelection.size > 0 ? `${t('取消全选')} (${historySelection.size})` : t('全选')}
                                    >
                                        {historySelection.size > 0 ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                        {historySelection.size > 0 && (
                                            <span className="text-[9px] font-bold">{historySelection.size}</span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setBatchModalOpen(true)}
                                        className={`p-1.5 rounded transition-colors ${theme === 'dark'
                                            ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                            : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                            }`}
                                        title={t('批量管理')}
                                    >
                                        <LayoutGrid size={14} />
                                    </button>
                                    {/* V3.4.12: 批量下载按钮 - 重做 */}
                                    <div className="relative">
                                        <button
                                            onClick={() => {
                                                // 如果有选中的历史项，直接下载选中项
                                                if (historySelection.size > 0) {
                                                    const selectedItems = [...historySelection].map(id => history.find(h => h.id === id)).filter(Boolean);
                                                    handleHistoryBatchDownload(selectedItems);
                                                } else {
                                                    setActiveDropdown(activeDropdown?.type === 'batch-download' ? null : { type: 'batch-download' });
                                                }
                                            }}
                                            className={`p-1.5 rounded transition-colors ${historySelection.size > 0
                                                ? 'text-blue-400 bg-blue-500/20'
                                                : theme === 'dark'
                                                    ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                                }`}
                                            title={historySelection.size > 0 ? `${t('下载选中')} (${historySelection.size})` : t('批量下载')}
                                        >
                                            <Download size={14} />
                                        </button>
                                        {activeDropdown?.type === 'batch-download' && historySelection.size === 0 && (
                                            <div
                                                className={`absolute right-0 top-full mt-1 w-40 rounded-lg shadow-xl py-1 z-50 border ${theme === 'dark'
                                                    ? 'bg-[#18181b] border-zinc-700'
                                                    : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                    }`}
                                                onMouseLeave={() => setActiveDropdown(null)}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setActiveDropdown(null);
                                                        // 本次生成：sessionStartTime 之后的记录
                                                        const sessionItems = history.filter(item => (item.startTime || 0) >= sessionStartTime);
                                                        handleHistoryBatchDownload(sessionItems);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${theme === 'dark'
                                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                                        : 'text-zinc-700 hover:bg-zinc-100'
                                                        }`}
                                                >
                                                    {t('本次生成')} ({history.filter(item => (item.startTime || 0) >= sessionStartTime).length})
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setActiveDropdown(null);
                                                        handleHistoryBatchDownload(history);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${theme === 'dark'
                                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                                        : 'text-zinc-700 hover:bg-zinc-100'
                                                        }`}
                                                >
                                                    {t('全部资产')} ({history.length})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setHistoryOpen(false)}>
                                        <X
                                            size={12}
                                            className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}
                                        />
                                    </button>
                                </div>
                            </div>
                            {downloadDisplay.visible && (
                                <div className="w-full px-3 pb-2">
                                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                        <div
                                            className="h-full bg-blue-500 transition-all duration-200"
                                            style={{ width: `${downloadDisplay.total > 0 ? (downloadDisplay.current / downloadDisplay.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            {localCacheEnabled && localCacheBannerVisible && (
                                <div className={`w-full border-b ${theme === 'dark' ? 'border-zinc-800' : theme === 'solarized' ? 'border-[#d7cfb2]' : 'border-zinc-200'}`}>
                                    <div className={`flex items-center justify-between gap-2 text-[10px] px-3 py-1.5 ${localCacheServerConnected
                                        ? theme === 'dark'
                                            ? 'bg-emerald-500/10 text-emerald-200'
                                            : 'bg-emerald-50 text-emerald-700'
                                        : theme === 'dark'
                                            ? 'bg-red-500/10 text-red-200'
                                            : 'bg-red-50 text-red-600'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-block w-2 h-2 rounded-full ${localCacheServerConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            <span>{localCacheServerConnected ? t('本地缓存已连接 - 图片将优先从本地读取') : t('本地缓存未连接')}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setLocalCacheEnabled(false);
                                                setLocalCacheBannerVisible(false);
                                            }}
                                            className={`p-0.5 rounded ${theme === 'dark'
                                                ? 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                                                : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200'
                                                }`}
                                            title={t('关闭本地缓存')}
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                                <HistoryToolsPanel
                                    theme={theme}
                                    historyQueuePanelOpen={historyQueuePanelOpen}
                                    historyCachePanelOpen={historyCachePanelOpen}
                                    batchQueueMode={batchQueueMode}
                                    setBatchQueueMode={setBatchQueueMode}
                                    batchGroups={batchGroups}
                                    batchQueue={batchQueue}
                                    batchRunningItems={batchRunningItems}
                                    nodesMap={nodesMap}
                                    clearBatchQueue={clearBatchQueue}
                                    removeQueuedBatchGroup={removeQueuedBatchGroup}
                                    removeQueuedBatchItem={removeQueuedBatchItem}
                                    stopRunningShot={stopRunningShot}
                                    localServerConfig={localServerConfig}
                                    setLocalServerConfig={setLocalServerConfig}
                                    normalizeLocalPath={normalizeLocalPath}
                                    updateLocalCacheServerConfig={updateLocalCacheServerConfig}
                                    pickLocalCachePath={pickLocalCachePath}
                                    localCacheEnabled={localCacheEnabled}
                                    setLocalCacheEnabled={setLocalCacheEnabled}
                                    cacheRedownloadOnEnable={cacheRedownloadOnEnable}
                                    setCacheRedownloadOnEnable={setCacheRedownloadOnEnable}
                                    refreshLocalCache={refreshLocalCache}
                                    rebuildAllHistoryThumbnails={rebuildAllHistoryThumbnails}
                                />
                                {/* V3.4.16: 历史列表添加本次生成分隔线 */}
                                {(() => {
                                    const sessionItems = history.filter(item => (item.startTime || 0) >= sessionStartTime);
                                    const previousItems = history.filter(item => (item.startTime || 0) < sessionStartTime);
                                    return (
                                        <>
                                            {sessionItems.length > 0 && (
                                                <>
                                                    <div className={`flex items-center gap-2 text-[10px] ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                                                        <div className="flex-1 h-px bg-blue-500/30"></div>
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 font-medium">{t('本次生成')} ({sessionItems.length})</span>
                                                        <div className="flex-1 h-px bg-blue-500/30"></div>
                                                    </div>
                                                    {sessionItems.map((item) => (
                                                        <HistoryItem
                                                            key={item.id}
                                                            item={item}
                                                            theme={theme}
                                                            language={language}
                                                            lightboxItem={lightboxItem}
                                                            performanceMode={performanceMode}
                                                            providers={providers}
                                                            defaultProviders={DEFAULT_PROVIDERS}
                                                            localCacheActive={localCacheActive}
                                                            historyLocalCacheMap={historyLocalCacheMap}
                                                            onCacheMissing={handleHistoryCacheMissing}
                                                            onDelete={deleteHistoryItem}
                                                            getHistoryMeta={getHistoryMeta}
                                                            resolveHistoryUrl={resolveHistoryUrl}
                                                            isLocalCacheUrlAvailable={isLocalCacheUrlAvailable}
                                                            isSelected={historySelection.has(item.id)}
                                                            onSelect={(id) => {
                                                                setHistorySelection(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(id)) next.delete(id);
                                                                    else next.add(id);
                                                                    return next;
                                                                });
                                                            }}
                                                            onClick={() => {
                                                                setHistoryFocusId(item.id);
                                                                const multiImages = getHistoryMultiImages(item);
                                                                const maxIndex = multiImages
                                                                    ? multiImages.length - 1
                                                                    : 0;
                                                                const rawIndex = item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0;
                                                                const currentIndex = Math.max(0, Math.min(rawIndex, maxIndex));
                                                                const selectedUrl = multiImages
                                                                    ? multiImages[currentIndex]
                                                                    : null;
                                                                const displayUrl = selectedUrl
                                                                    ? resolveHistoryUrl(item, selectedUrl)
                                                                    : resolveHistoryUrl(item);
                                                                if (displayUrl) {
                                                                    const lightboxImages = multiImages || getLightboxNavImages(item);
                                                                    setLightboxItem({
                                                                        ...item,
                                                                        mjImages: lightboxImages || item.mjImages || null,
                                                                        url: displayUrl,
                                                                        selectedMjImageIndex: currentIndex,
                                                                        // V3.7.22: 明确清除 storyboardContext，避免与分镜导航冲突
                                                                        storyboardContext: null
                                                                    });
                                                                }
                                                            }}
                                                            onContextMenu={(e) => handleHistoryRightClick(e, item)}
                                                            onImageClick={(e, item, imgUrl, idx) => {
                                                                e.stopPropagation();
                                                                setHistoryFocusId(item.id);
                                                                setHistory((prev) => prev.map((hItem) =>
                                                                    hItem.id === item.id
                                                                        ? { ...hItem, url: imgUrl, selectedMjImageIndex: idx }
                                                                        : hItem
                                                                ));
                                                                const latestItem = historyMap.get(item.id) || item;
                                                                const resolvedUrl = resolveHistoryUrl(latestItem, imgUrl);
                                                                const lightboxImages = getHistoryMultiImages(latestItem) || getLightboxNavImages(latestItem);
                                                                const updatedItem = {
                                                                    ...latestItem,
                                                                    mjImages: lightboxImages || latestItem.mjImages || null,
                                                                    url: resolvedUrl,
                                                                    selectedMjImageIndex: idx,
                                                                    // V3.7.22: 明确清除 storyboardContext
                                                                    storyboardContext: null
                                                                };
                                                                setLightboxItem(updatedItem);
                                                            }}
                                                            onImageContextMenu={(e, item, imgUrl, idx) => handleHistoryRightClick(e, item, imgUrl, idx)}
                                                            onRebuildThumbnail={rebuildHistoryThumbnail}
                                                            onRefresh={(item) => {
                                                                if (item.apiConfig) {
                                                                    setHistory(prev => prev.map(h => h.id === item.id ? { ...h, status: 'generating', errorMsg: null, progress: 5 } : h));
                                                                    if (item.modelName.includes('veo')) pollVeoJob(item.remoteTaskId, item.id, item.apiConfig.baseUrl, item.apiConfig.apiKey, item.width, item.height);
                                                                    else pollSoraJob(item.remoteTaskId, item.id, item.apiConfig.baseUrl, item.apiConfig.apiKey, item.width, item.height, item.apiConfig.modelId || '');
                                                                }
                                                            }}
                                                            Loader2={Loader2}
                                                            Trash2={Trash2}
                                                            RefreshCw={RefreshCw}
                                                        />
                                                    ))}
                                                </>
                                            )}
                                            {previousItems.length > 0 && (
                                                <>
                                                    <div className={`flex items-center gap-2 text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                        <div className={`flex-1 h-px ${theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}></div>
                                                        <span className="px-2 py-0.5 font-medium">{t('之前生成')} ({previousItems.length})</span>
                                                        <div className={`flex-1 h-px ${theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}></div>
                                                    </div>
                                                    {previousItems.map((item) => (
                                                        <HistoryItem
                                                            key={item.id}
                                                            item={item}
                                                            theme={theme}
                                                            language={language}
                                                            lightboxItem={lightboxItem}
                                                            performanceMode={performanceMode}
                                                            providers={providers}
                                                            defaultProviders={DEFAULT_PROVIDERS}
                                                            localCacheActive={localCacheActive}
                                                            historyLocalCacheMap={historyLocalCacheMap}
                                                            onCacheMissing={handleHistoryCacheMissing}
                                                            onDelete={deleteHistoryItem}
                                                            getHistoryMeta={getHistoryMeta}
                                                            resolveHistoryUrl={resolveHistoryUrl}
                                                            isLocalCacheUrlAvailable={isLocalCacheUrlAvailable}
                                                            isSelected={historySelection.has(item.id)}
                                                            onSelect={(id) => {
                                                                setHistorySelection(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(id)) next.delete(id);
                                                                    else next.add(id);
                                                                    return next;
                                                                });
                                                            }}
                                                            onClick={() => {
                                                                setHistoryFocusId(item.id);
                                                                const multiImages = getHistoryMultiImages(item);
                                                                const maxIndex = multiImages
                                                                    ? multiImages.length - 1
                                                                    : 0;
                                                                const rawIndex = item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0;
                                                                const currentIndex = Math.max(0, Math.min(rawIndex, maxIndex));
                                                                const selectedUrl = multiImages
                                                                    ? multiImages[currentIndex]
                                                                    : null;
                                                                const displayUrl = selectedUrl
                                                                    ? resolveHistoryUrl(item, selectedUrl)
                                                                    : resolveHistoryUrl(item);
                                                                if (displayUrl) {
                                                                    const lightboxImages = multiImages || getLightboxNavImages(item);
                                                                    setLightboxItem({
                                                                        ...item,
                                                                        mjImages: lightboxImages || item.mjImages || null,
                                                                        url: displayUrl,
                                                                        selectedMjImageIndex: currentIndex,
                                                                        // V3.7.22: 明确清除 storyboardContext
                                                                        storyboardContext: null
                                                                    });
                                                                }
                                                            }}
                                                            onContextMenu={(e) => handleHistoryRightClick(e, item)}
                                                            onImageClick={(e, item, imgUrl, idx) => {
                                                                e.stopPropagation();
                                                                setHistoryFocusId(item.id);
                                                                setHistory((prev) => prev.map((hItem) =>
                                                                    hItem.id === item.id
                                                                        ? { ...hItem, url: imgUrl, selectedMjImageIndex: idx }
                                                                        : hItem
                                                                ));
                                                                const latestItem = historyMap.get(item.id) || item;
                                                                const resolvedUrl = resolveHistoryUrl(latestItem, imgUrl);
                                                                const lightboxImages = getHistoryMultiImages(latestItem) || getLightboxNavImages(latestItem);
                                                                const updatedItem = {
                                                                    ...latestItem,
                                                                    mjImages: lightboxImages || latestItem.mjImages || null,
                                                                    url: resolvedUrl,
                                                                    selectedMjImageIndex: idx,
                                                                    // V3.7.22: 明确清除 storyboardContext
                                                                    storyboardContext: null
                                                                };
                                                                setLightboxItem(updatedItem);
                                                            }}
                                                            onImageContextMenu={(e, item, imgUrl, idx) => handleHistoryRightClick(e, item, imgUrl, idx)}
                                                            onRebuildThumbnail={rebuildHistoryThumbnail}
                                                            onRefresh={(item) => {
                                                                if (item.apiConfig) {
                                                                    setHistory(prev => prev.map(h => h.id === item.id ? { ...h, status: 'generating', errorMsg: null, progress: 5 } : h));
                                                                    if (item.modelName.includes('veo')) pollVeoJob(item.remoteTaskId, item.id, item.apiConfig.baseUrl, item.apiConfig.apiKey, item.width, item.height);
                                                                    else pollSoraJob(item.remoteTaskId, item.id, item.apiConfig.baseUrl, item.apiConfig.apiKey, item.width, item.height, item.apiConfig.modelId || '');
                                                                }
                                                            }}
                                                            Loader2={Loader2}
                                                            Trash2={Trash2}
                                                            RefreshCw={RefreshCw}
                                                        />
                                                    ))}
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* 角色面板 */}
                    {charactersOpen && (
                        <CanvasCharacterLibrary
                            theme={theme}
                            onClose={() => setCharactersOpen(false)}
                            onAttach={cloudDocument ? canvasCloud.attachLibrary : undefined}
                            onInsert={(blob) => {
                                const url = URL.createObjectURL(blob);
                                assetBundleBlobUrlsRef.current.add(url);
                                const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                                addNode('input-image', world.x, world.y, null, url);
                            }}
                        />
                    )}

                    {/* 创建角色弹窗 */}
                    {createCharacterOpen && (
                        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center" onClick={() => setCreateCharacterOpen(false)}>
                            <div
                                className={`w-[500px] max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col ${theme === 'dark'
                                    ? 'bg-[#121214] border-zinc-800'
                                    : theme === 'solarized'
                                        ? 'bg-[#eee8d5] border-[#d7cfb2]'
                                        : 'bg-white border-zinc-200'
                                    } border`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className={`p-4 border-b flex justify-between items-center ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
                                    }`}>
                                    <h3 className={`font-bold text-sm ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                                        }`}>
                                        {t('新建角色')}
                                    </h3>
                                    <button onClick={() => setCreateCharacterOpen(false)}>
                                        <X size={16} className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'} />
                                    </button>
                                </div>
                                <div className="p-4 space-y-4">
                                    {/* 视频源选择 */}
                                    <div>
                                        <label className={`block text-xs mb-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                                            }`}>
                                            视频源
                                        </label>
                                        <div className="flex gap-2 mb-2">
                                            <button
                                                onClick={() => {
                                                    setCreateCharacterVideoSourceType('url');
                                                    setCreateCharacterSelectedTaskId('');
                                                }}
                                                className={`px-3 py-1.5 text-xs rounded transition-colors ${createCharacterVideoSourceType === 'url'
                                                    ? theme === 'dark'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-blue-500 text-white'
                                                    : theme === 'dark'
                                                        ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                                    }`}
                                            >
                                                输入视频 URL
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setCreateCharacterVideoSourceType('history');
                                                    setCreateCharacterVideoUrl('');
                                                    setCreateCharacterVideoError(null);
                                                }}
                                                className={`px-3 py-1.5 text-xs rounded transition-colors ${createCharacterVideoSourceType === 'history'
                                                    ? theme === 'dark'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-blue-500 text-white'
                                                    : theme === 'dark'
                                                        ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                                    }`}
                                            >
                                                从历史记录选择
                                            </button>
                                        </div>

                                        {createCharacterVideoSourceType === 'url' ? (
                                            <input
                                                type="text"
                                                value={createCharacterVideoUrl}
                                                onChange={(e) => setCreateCharacterVideoUrl(e.target.value)}
                                                placeholder={t('输入视频 URL...')}
                                                className={`w-full px-3 py-2 text-xs rounded border outline-none ${theme === 'dark'
                                                    ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-600'
                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                                    }`}
                                            />
                                        ) : (
                                            <select
                                                value={createCharacterSelectedTaskId}
                                                onChange={(e) => {
                                                    const taskId = e.target.value;
                                                    setCreateCharacterSelectedTaskId(taskId);
                                                    // 当选中历史视频时，自动获取视频URL并填充到URL输入框
                                                    if (taskId) {
                                                        const selectedHistoryItem = historyMap.get(taskId);
                                                        const resolvedUrl = resolveHistoryUrl(selectedHistoryItem);
                                                        if (resolvedUrl) {
                                                            // 切换到URL输入模式并填充URL
                                                            setCreateCharacterVideoSourceType('url');
                                                            setCreateCharacterVideoUrl(resolvedUrl);
                                                            setCreateCharacterSelectedTaskId(''); // 清空选择
                                                        }
                                                    }
                                                }}
                                                className={`w-full px-3 py-2 text-xs rounded border outline-none ${theme === 'dark'
                                                    ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                    }`}
                                            >
                                                <option value="">{t('选择历史记录中的视频...')}</option>
                                                {history.filter(h => h.type === 'video' && h.status === 'completed' && (h.url || h.localCacheUrl || h.originalUrl)).map(item => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.prompt?.slice(0, 50) || 'Untitled'} - {item.time}
                                                    </option>
                                                ))}
                                            </select>
                                        )}

                                        {/* 视频预览区域 */}
                                        {(() => {
                                            let currentVideoUrl = null;
                                            if (createCharacterVideoSourceType === 'url' && createCharacterVideoUrl.trim()) {
                                                currentVideoUrl = createCharacterVideoUrl.trim();
                                            } else if (createCharacterVideoSourceType === 'history' && createCharacterSelectedTaskId) {
                                                const selectedHistoryItem = historyMap.get(createCharacterSelectedTaskId);
                                                const resolvedUrl = resolveHistoryUrl(selectedHistoryItem);
                                                if (resolvedUrl) {
                                                    currentVideoUrl = resolvedUrl;
                                                }
                                            }

                                            return currentVideoUrl ? (
                                                <div className="mt-2 mb-2">
                                                    <video
                                                        key={currentVideoUrl}
                                                        controls
                                                        crossOrigin="anonymous"
                                                        className="w-full h-40 object-contain bg-black rounded-lg"
                                                        src={currentVideoUrl}
                                                        onError={(e) => {
                                                            console.error('视频加载失败:', currentVideoUrl, e);
                                                            setCreateCharacterVideoError('无法加载视频预览，请检查链接有效性或跨域限制');
                                                        }}
                                                        onLoadStart={() => {
                                                            // 清除错误提示
                                                            setCreateCharacterVideoError(null);
                                                        }}
                                                        onLoadedData={() => {
                                                            // 视频加载成功，清除错误
                                                            setCreateCharacterVideoError(null);
                                                        }}
                                                    />
                                                    {createCharacterVideoError && (
                                                        <div className="text-red-500 text-xs mt-1 text-center">
                                                            {createCharacterVideoError}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null;
                                        })()}
                                    </div>

                                    {/* 时间范围 */}
                                    <div>
                                        <label className={`block text-xs mb-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                                            }`}>
                                            {t('时间范围（秒，间隔需在 1-3 秒之间）')}
                                        </label>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={createCharacterStartSecond}
                                                onChange={(e) => setCreateCharacterStartSecond(parseFloat(e.target.value) || 0)}
                                                className={`w-20 px-2 py-1.5 text-xs rounded border outline-none ${theme === 'dark'
                                                    ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                    }`}
                                            />
                                            <span className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>到</span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                value={createCharacterEndSecond}
                                                onChange={(e) => setCreateCharacterEndSecond(parseFloat(e.target.value) || 0)}
                                                className={`w-20 px-2 py-1.5 text-xs rounded border outline-none ${theme === 'dark'
                                                    ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                                    }`}
                                            />
                                            <span className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                                秒（间隔: {(createCharacterEndSecond - createCharacterStartSecond).toFixed(1)}s）
                                            </span>
                                        </div>
                                    </div>

                                    {/* 高级设置：API 接口地址 */}
                                    <div>
                                        <label className={`block text-xs mb-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                                            }`}>
                                            API 接口地址 (API Endpoint)
                                        </label>
                                        <input
                                            type="text"
                                            value={createCharacterEndpoint}
                                            onChange={(e) => setCreateCharacterEndpoint(e.target.value)}
                                            placeholder={t('例如: https://your-domain.com/sora/v1/characters')}
                                            className={`w-full px-3 py-2 text-xs rounded border outline-none font-mono ${theme === 'dark'
                                                ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-600'
                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                                }`}
                                            onFocus={(e) => {
                                                // 如果为空，自动填充默认值
                                                if (!e.target.value) {
                                                    const soraConfig = apiConfigs.find(c => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro'));
                                                    const baseUrl = soraConfig
                                                        ? (soraConfig.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
                                                        : DEFAULT_BASE_URL.replace(/\/+$/, '');
                                                    setCreateCharacterEndpoint(`${baseUrl}/sora/v1/characters`);
                                                }
                                            }}
                                        />
                                        <p className={`text-[10px] mt-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
                                            }`}>
                                            默认自动填充，可根据服务商要求修改路径
                                        </p>
                                    </div>

                                    {/* 提交按钮 */}
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            onClick={() => setCreateCharacterOpen(false)}
                                            className={`px-4 py-2 text-xs rounded transition-colors ${theme === 'dark'
                                                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                                                }`}
                                        >
                                            {t('取消')}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (createCharacterVideoSourceType === 'url' && !createCharacterVideoUrl.trim()) {
                                                    canvasAlert(t('请输入视频 URL'));
                                                    return;
                                                }
                                                if (createCharacterVideoSourceType === 'history' && !createCharacterSelectedTaskId) {
                                                    canvasAlert(t('请选择历史记录中的视频'));
                                                    return;
                                                }
                                                if (createCharacterEndSecond - createCharacterStartSecond < 1 || createCharacterEndSecond - createCharacterStartSecond > 3) {
                                                    canvasAlert(t('时间范围必须在 1-3 秒之间'));
                                                    return;
                                                }
                                                setCreateCharacterSubmitting(true);
                                                try {
                                                    // 优先使用用户手动输入的 API 地址，如果为空则使用默认地址
                                                    const endpointToUse = createCharacterEndpoint.trim() || null;

                                                    if (createCharacterVideoSourceType === 'url') {
                                                        await createCharacter(createCharacterVideoUrl, createCharacterStartSecond, createCharacterEndSecond, null, endpointToUse);
                                                    } else {
                                                        await createCharacter('', createCharacterStartSecond, createCharacterEndSecond, createCharacterSelectedTaskId, endpointToUse);
                                                    }
                                                } finally {
                                                    setCreateCharacterSubmitting(false);
                                                }
                                            }}
                                            disabled={createCharacterSubmitting}
                                            className={`px-4 py-2 text-xs rounded transition-colors ${createCharacterSubmitting
                                                ? 'bg-zinc-400 text-zinc-200 cursor-not-allowed'
                                                : theme === 'dark'
                                                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                                                    : 'bg-blue-500 text-white hover:bg-blue-600'
                                                }`}
                                        >
                                            {createCharacterSubmitting ? '创建中...' : '创建角色'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 主画布区域 */}
                    <div className="flex-1 relative overflow-hidden flex">
                        <div ref={canvasRef} id="canvas-bg" className="flex-1 h-full cursor-default relative"
                            onMouseDown={handleMouseDown} onClick={handleBackgroundClick} onDoubleClick={handleDoubleClick} onContextMenu={handleCanvasContextMenu}
                            onDrop={handleCanvasDrop} onDragOver={handleCanvasDragOver}
                            style={{
                                backgroundColor: theme === 'dark' ? '#09090b' : (theme === 'solarized' ? '#fdf6e3' : '#f4f4f5'),
                                backgroundImage: (() => {
                                    const mergeThreshold = 0.6;
                                    const mergeScale = view.zoom < mergeThreshold ? 2 : 1;
                                    const gridSize = Math.max(12, Math.round(20 * view.zoom * mergeScale));
                                    const dotRadius = Math.max(0.55, Math.min(1.4, gridSize * 0.035));
                                    const haloRadius = dotRadius + 0.45;
                                    const dotColor = theme === 'dark'
                                        ? 'rgb(96, 96, 104)'
                                        : theme === 'solarized'
                                            ? 'rgb(212, 212, 216)'
                                            : 'rgb(212, 212, 216)';
                                    const haloColor = theme === 'dark'
                                        ? 'rgba(96, 96, 104, 0.22)'
                                        : theme === 'solarized'
                                            ? 'rgba(212, 212, 216, 0.16)'
                                            : 'rgba(212, 212, 216, 0.16)';
                                    return `radial-gradient(${dotColor} ${dotRadius}px, transparent ${dotRadius + 0.2}px), radial-gradient(${haloColor} ${haloRadius}px, transparent ${haloRadius + 0.2}px)`;
                                })(),
                                backgroundSize: `${Math.max(12, Math.round(20 * view.zoom * (view.zoom < 0.6 ? 2 : 1)))}px ${Math.max(12, Math.round(20 * view.zoom * (view.zoom < 0.6 ? 2 : 1)))}px`,
                                backgroundPosition: `${Math.round(view.x)}px ${Math.round(view.y)}px`,
                                backgroundRepeat: 'repeat',
                                WebkitFontSmoothing: 'antialiased',
                                MozOsxFontSmoothing: 'grayscale',
                                textRendering: 'optimizeLegibility',
                                transform: 'translateZ(0)',
                                backfaceVisibility: 'hidden'
                            }}>
                            <div className="absolute origin-top-left will-change-transform" style={{
                                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
                                width: VIRTUAL_CANVAS_WIDTH,
                                height: VIRTUAL_CANVAS_HEIGHT,
                                WebkitFontSmoothing: 'antialiased',
                                MozOsxFontSmoothing: 'grayscale',
                                textRendering: 'optimizeLegibility',
                                transformOrigin: 'top left',
                                imageRendering: view.zoom >= 1 ? 'auto' : 'crisp-edges'
                            }}>
                                <ConnectionLayer
                                    layerRef={connectionLayerRef}
                                    connections={connections}
                                    nodesMap={nodesMap}
                                    connectionsByNode={connectionsByNode}
                                    connectingSource={connectingSource}
                                    connectingTarget={connectingTarget}
                                    connectingInputType={connectingInputType}
                                    mousePos={mousePos}
                                    getApiConfigByKey={getApiConfigByKey}
                                    selectedNodeId={selectedNodeId}
                                    onDisconnectConnection={disconnectConnection}
                                    visibleNodes={visibleNodes}
                                    viewportBounds={viewportBounds}
                                    isLowDetail={isLowDetail}
                                />
                                {visibleNodes.map((node) => {
                                    const isNodeSelected = selectedNodeId === node.id || selectedNodeIds.has(node.id);
                                    const isNodeDragging = !!(dragNodeId === node.id || (dragNodeId && selectedNodeIds.has(node.id)));
                                    const isNodeAdjacent = !!(
                                        selectedNodeIdForAdjacency &&
                                        selectedNodeIdForAdjacency !== node.id &&
                                        selectedAdjacentSet &&
                                        selectedAdjacentSet.has(node.id)
                                    );

                                    return (
                                        <CanvasNodeRenderBoundary
                                            key={node.id}
                                            node={node}
                                            renderNode={renderNode}
                                            renderState={nodeRenderState}
                                            theme={theme}
                                            isInteracting={isInteracting}
                                            isLowDetail={isLowDetail}
                                            isSelected={isNodeSelected}
                                            isDragging={isNodeDragging}
                                            isHoverTarget={hoverTargetId === node.id}
                                            isAdjacent={isNodeAdjacent}
                                            isConnected={nodeConnectedStatus.get(node.id) || false}
                                        />
                                    );
                                })}
                            </div>

                            {nodes.length === 0 && <CanvasEmptyHint theme={theme} />}

                            {/* 框选框 */}
                            {selectionBox && (
                                <div
                                    className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-50"
                                    style={{
                                        left: Math.min(selectionBox.startX, selectionBox.endX),
                                        top: Math.min(selectionBox.startY, selectionBox.endY),
                                        width: Math.abs(selectionBox.endX - selectionBox.startX),
                                        height: Math.abs(selectionBox.endY - selectionBox.startY),
                                    }}
                                />
                            )}
                        </div>

                        {/* 聊天侧边栏面板 */}
                        <div
                            className={`fixed right-0 top-12 bottom-0 border-l shadow-2xl flex flex-col z-50 transition-transform duration-300 ease-in-out select-text ${theme === 'dark'
                                ? 'bg-[#121214] border-zinc-800'
                                : theme === 'solarized'
                                    ? 'bg-[#eee8d5] border-[#d7cfb2]'
                                    : 'bg-white border-zinc-200'
                                } ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}
                            style={{
                                width: chatWidth,
                                pointerEvents: isChatOpen ? 'auto' : 'none'
                            }}
                            onMouseEnter={() => setIsChatHovered(true)}
                            onMouseLeave={() => setIsChatHovered(false)}
                            onMouseDown={() => markInteraction('chat')}
                            onDragOver={handleCanvasDragOver}
                            onDrop={cloudDocument ? (event) => { event.preventDefault(); event.stopPropagation(); } : handleChatDrop}
                        >
                            <div
                                className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize transition-colors z-50 flex items-center justify-center group ${theme === 'dark' ? 'hover:bg-blue-600/50' : 'hover:bg-blue-400/30'
                                    }`}
                                onMouseDown={handleChatResizeStart}
                            >
                                <div
                                    className={`h-8 w-1 rounded transition-colors ${theme === 'dark'
                                        ? 'bg-zinc-700 group-hover:bg-blue-500'
                                        : 'bg-zinc-300 group-hover:bg-blue-500'
                                        }`}
                                ></div>
                            </div>
                            {cloudDocument ? canvasCloud.renderChat({ theme, active: isChatOpen, onClose: () => setIsChatOpen(false), queuedFiles: chatFiles, removeQueuedFile: removeChatFile }) : <>
                            <div
                                className={`h-12 flex items-center justify-between px-3 shrink-0 border-b ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="relative z-50">
                                        {/* V3.7.24: 双层模型选择器 */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setChatModelDropdownOpen(!chatModelDropdownOpen);
                                                setChatHoveredProvider(null);
                                            }}
                                            className={`flex items-center gap-2 text-xs border rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer max-w-[200px] ${theme === 'dark'
                                                ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-600'
                                                : 'bg-white text-zinc-800 border-zinc-300 hover:border-zinc-400'}`}
                                        >
                                            <span className="truncate font-mono">{getModelLabelWithProvider(chatModel)}</span>
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(resolveModelKey(chatModel))}`}></div>
                                            <ChevronDown size={12} className="shrink-0 opacity-50" />
                                        </button>
                                        {chatModelDropdownOpen && (
                                            <div
                                                className={`absolute top-full left-0 mt-1 w-72 rounded-lg shadow-xl p-1 z-[60] border flex ${theme === 'dark'
                                                    ? 'bg-[#18181b] border-zinc-700'
                                                    : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'}`}
                                                onMouseLeave={() => setChatHoveredProvider(null)}
                                            >
                                                {/* 供应商列表 */}
                                                <div className={`w-24 border-r pr-1 max-h-64 overflow-y-auto custom-scrollbar flex flex-col ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                                                    {Object.entries(groupedApiConfigs)
                                                        .filter(([, group]) => group.models.some(m => isChatModelType(m.type)))
                                                        .map(([providerKey, group]) => (
                                                            <button
                                                                key={providerKey}
                                                                onMouseEnter={() => setChatHoveredProvider(providerKey)}
                                                                className={`w-full text-left px-2 py-1.5 text-[10px] rounded transition-colors ${chatHoveredProvider === providerKey
                                                                    ? theme === 'dark' ? 'bg-zinc-800 text-white' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-zinc-100 text-zinc-900'
                                                                    : theme === 'dark' ? 'text-zinc-400 hover:text-zinc-300' : theme === 'solarized' ? 'text-zinc-600 hover:text-zinc-700' : 'text-zinc-600 hover:text-zinc-800'}`}
                                                            >
                                                                {group.name || providerKey}
                                                            </button>
                                                        ))}
                                                </div>
                                                {/* Model 列表 */}
                                                <div className="flex-1 pl-1 max-h-64 overflow-y-auto custom-scrollbar">
                                                    {chatHoveredProvider && groupedApiConfigs[chatHoveredProvider]?.models
                                                        .filter(m => isChatModelType(m.type))
                                                        .map((m) => {
                                                            const modelKey = m._uid || m.id;
                                                            const currentModelKey = resolveModelKey(chatModel);
                                                            return (
                                                                <button
                                                                    key={modelKey}
                                                                    onClick={() => {
                                                                        setChatModel(modelKey);
                                                                        setChatModelDropdownOpen(false);
                                                                        setChatHoveredProvider(null);
                                                                    }}
                                                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${currentModelKey === modelKey
                                                                        ? theme === 'dark' ? 'bg-blue-600/30 text-blue-300' : theme === 'solarized' ? 'bg-[#fdf6e3] text-zinc-800' : 'bg-blue-100 text-blue-700'
                                                                        : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-300' : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'}`}
                                                                >
                                                                    <span className="text-[10px] font-medium truncate font-mono">{m.displayName || m.modelName || m.id}</span>
                                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(modelKey)}`}></div>
                                                                </button>
                                                            );
                                                        })}
                                                    {!chatHoveredProvider && (
                                                        <div className={`text-[10px] px-2 py-3 text-center ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                            ← 选择 Provider
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={createNewChat}
                                        className={`p-1.5 rounded ${theme === 'dark'
                                            ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                            : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                            }`}
                                        title={t('新对话')}
                                    >
                                        <Plus size={16} />
                                    </button>
                                    {chatSessions.length > 1 && (
                                        <div className="relative">
                                            <button
                                                onClick={() => setChatSessionDropdownOpen(!chatSessionDropdownOpen)}
                                                className={`p-1.5 rounded ${theme === 'dark'
                                                    ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                                    }`}
                                            >
                                                <History size={16} />
                                            </button>
                                            {chatSessionDropdownOpen && (
                                                <div
                                                    className={`absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl py-1 z-50 border ${theme === 'dark'
                                                        ? 'bg-[#18181b] border-zinc-700'
                                                        : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                        }`}
                                                    onMouseLeave={() => setChatSessionDropdownOpen(false)}
                                                >
                                                    {chatSessions.map(s => (
                                                        <div
                                                            key={s.id}
                                                            className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer ${currentChatId === s.id
                                                                ? theme === 'dark'
                                                                    ? 'bg-zinc-800 text-white'
                                                                    : 'bg-zinc-100 text-zinc-900'
                                                                : theme === 'dark'
                                                                    ? 'text-zinc-400 hover:bg-zinc-800/50'
                                                                    : 'text-zinc-500 hover:bg-zinc-100'
                                                                }`}
                                                            onClick={() => {
                                                                setCurrentChatId(s.id);
                                                                setChatSessionDropdownOpen(false);
                                                            }}
                                                        >
                                                            <span className="truncate flex-1">{s.title}</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteChatSession(e, s.id);
                                                                }}
                                                                className={`p-1 ${theme === 'dark'
                                                                    ? 'text-zinc-600 hover:text-red-500'
                                                                    : 'text-zinc-400 hover:text-red-500'
                                                                    }`}
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setIsChatOpen(false)}
                                        className={`p-1.5 rounded ${theme === 'dark'
                                            ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                            : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                            }`}
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 select-text">
                                {currentSession?.messages.map((msg) => (
                                    <div key={msg.id || msg.timestamp || `msg-${Math.random()}`} className={`flex gap-3 select-text ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 select-none ${msg.role === 'user' ? 'bg-blue-600' : 'bg-green-600'}`}>{msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}</div>
                                        <div className={`flex flex-col gap-1 max-w-[85%] select-text ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            {msg.files && msg.files.length > 0 && (
                                                <div className={`flex flex-wrap gap-2 mb-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    {msg.files.map((f, i) => (
                                                        <div
                                                            key={i}
                                                            className={`rounded p-1 border flex items-center gap-1 ${theme === 'dark'
                                                                ? 'bg-zinc-800 border-zinc-700'
                                                                : 'bg-zinc-100 border-zinc-300'
                                                                }`}
                                                        >
                                                            {f.isImage ? (
                                                                <LazyBase64Image src={f.content} className="w-16 h-16 object-cover rounded" alt={f.name} />
                                                            ) : f.isVideo ? (
                                                                <video
                                                                    src={f.content}
                                                                    controls
                                                                    className={`max-w-full rounded-lg bg-black max-h-[300px] border ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'
                                                                        }`}
                                                                    playsInline
                                                                />
                                                            ) : f.isAudio ? (
                                                                <div
                                                                    className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                                        : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                                        }`}
                                                                >
                                                                    <FileAudio size={16} />
                                                                    <span className="text-[8px] mt-1">音频</span>
                                                                </div>
                                                            ) : f.isPDF ? (
                                                                <div
                                                                    className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                                        : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                                        }`}
                                                                >
                                                                    <FileText size={16} />
                                                                    <span className="text-[8px] mt-1">PDF</span>
                                                                </div>
                                                            ) : f.isDoc ? (
                                                                <div
                                                                    className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                                        : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                                        }`}
                                                                >
                                                                    <FileText size={16} />
                                                                    <span className="text-[8px] mt-1">DOC</span>
                                                                </div>
                                                            ) : f.isExcel ? (
                                                                <div
                                                                    className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                                        : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                                        }`}
                                                                >
                                                                    <FileText size={16} />
                                                                    <span className="text-[8px] mt-1">XLS</span>
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                                        : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                                        }`}
                                                                >
                                                                    <FileText size={16} />
                                                                    <span className="text-[8px] mt-1 max-w-full truncate px-1">
                                                                        {f.fileExt || f.name.split('.').pop() || '文件'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {msg.content && msg.content.trim() && (
                                                <div
                                                    className={`rounded-2xl px-4 py-2.5 text-sm select-text break-words ${msg.role === 'user'
                                                        ? theme === 'dark'
                                                            ? 'bg-zinc-800 text-white rounded-tr-none'
                                                            : 'bg-zinc-300 text-zinc-900 rounded-tr-none'
                                                        : theme === 'dark'
                                                            ? 'bg-zinc-800/50 text-zinc-300 rounded-tl-none border border-zinc-800'
                                                            : 'bg-zinc-100 text-zinc-800 rounded-tl-none border border-zinc-200'
                                                        }`}
                                                    style={{ userSelect: 'text', cursor: 'text' }}
                                                >
                                                    {msg.isError ? (
                                                        <span className="text-red-500 select-text cursor-text" style={{ userSelect: 'text', cursor: 'text' }}>{msg.content}</span>
                                                    ) : msg.content ? (
                                                        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.content)) }} style={{ userSelect: 'text', cursor: 'text' }}></div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isChatSending && (
                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                                            <Bot size={16} className="text-white" />
                                        </div>
                                        <div
                                            className={`rounded-2xl rounded-tl-none px-4 py-2 border flex items-center ${theme === 'dark'
                                                ? 'bg-zinc-800/50 border-zinc-800'
                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-100 border-zinc-200'
                                                }`}
                                        >
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>
                            <div
                                className={`p-3 border-t ${theme === 'dark'
                                    ? 'border-zinc-800 bg-[#121214]'
                                    : theme === 'solarized'
                                        ? 'border-[#d7cfb2] bg-[#eee8d5]'
                                        : 'border-zinc-200 bg-zinc-50'
                                    }`}
                            >
                                {chatFiles.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto pb-2 mb-2 custom-scrollbar">
                                        {chatFiles.map((f, i) => (
                                            <div key={i} className="relative group shrink-0">
                                                {f.isImage ? (
                                                    <LazyBase64Image
                                                        src={f.content}
                                                        className={`w-12 h-12 object-cover rounded border ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'
                                                            }`}
                                                        alt={f.name}
                                                    />
                                                ) : f.isVideo ? (
                                                    <video
                                                        src={f.content}
                                                        className={`w-16 h-12 object-cover rounded border bg-black ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'
                                                            }`}
                                                        muted
                                                        playsInline
                                                    />
                                                ) : f.isAudio ? (
                                                    <div
                                                        className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                            ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                            : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                            }`}
                                                    >
                                                        <FileAudio size={16} />
                                                        <span className="text-[8px] mt-1">音频</span>
                                                    </div>
                                                ) : f.isPDF ? (
                                                    <div
                                                        className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                            ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                            : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                            }`}
                                                    >
                                                        <FileText size={16} />
                                                        <span className="text-[8px] mt-1">PDF</span>
                                                    </div>
                                                ) : f.isDoc ? (
                                                    <div
                                                        className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                            ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                            : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                            }`}
                                                    >
                                                        <FileText size={16} />
                                                        <span className="text-[8px] mt-1">DOC</span>
                                                    </div>
                                                ) : f.isExcel ? (
                                                    <div
                                                        className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                            ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                            : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                            }`}
                                                    >
                                                        <FileText size={16} />
                                                        <span className="text-[8px] mt-1">XLS</span>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className={`w-12 h-12 rounded flex flex-col items-center justify-center ${theme === 'dark'
                                                            ? 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                                                            : 'bg-zinc-100 border border-zinc-300 text-zinc-500'
                                                            }`}
                                                    >
                                                        <FileText size={16} />
                                                        <span className="text-[8px] mt-1 max-w-full truncate px-1">
                                                            {f.fileExt || f.name.split('.').pop() || '文件'}
                                                        </span>
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => removeChatFile(i)}
                                                    className={`absolute -top-1 -right-1 rounded-full p-0.5 border opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark'
                                                        ? 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-700'
                                                        : 'bg-white text-zinc-500 hover:text-zinc-900 border-zinc-300'
                                                        }`}
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div
                                    className={`relative rounded-xl flex items-end p-2 focus-within:border-blue-500/50 transition-colors border ${theme === 'dark'
                                        ? 'bg-zinc-800/50 border-zinc-700'
                                        : 'bg-white border-zinc-300'
                                        }`}
                                >
                                    <label
                                        className={`p-2 cursor-pointer transition-colors ${theme === 'dark'
                                            ? 'text-zinc-400 hover:text-white'
                                            : 'text-zinc-500 hover:text-zinc-900'
                                            }`}
                                        title={t('上传文件')}
                                    >
                                        <Paperclip size={18} />
                                        <input type="file" multiple className="hidden" onChange={handleChatFileUpload} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.js,.py,.html,.css,.json,.csv" />
                                    </label>
                                    <textarea
                                        ref={chatInputRef}
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                                        onFocus={() => { setIsChatInputFocused(true); markInteraction('chat'); }}
                                        onBlur={() => setIsChatInputFocused(false)}
                                        placeholder={t('发送消息...')}
                                        className={`w-full bg-transparent text-sm resize-none outline-none max-h-32 py-2 px-1 custom-scrollbar ${theme === 'dark'
                                            ? 'text-white placeholder-zinc-500'
                                            : 'text-zinc-800 placeholder-zinc-400'
                                            }`}
                                        rows={1}
                                        style={{ minHeight: '36px' }}
                                    />
                                    <button
                                        onClick={sendChatMessage}
                                        disabled={(!chatInput.trim() && chatFiles.length === 0) || isChatSending}
                                        className={`p-2 rounded-lg transition-all mb-0.5 ${(!chatInput.trim() && chatFiles.length === 0) || isChatSending
                                            ? 'opacity-50 bg-transparent text-zinc-400'
                                            : 'bg-blue-600 text-white hover:bg-blue-500'
                                            }`}
                                    >
                                        <Send size={16} />
                                    </button>
                                </div>
                                <div className={`text-[10px] text-center mt-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                    支持 MP4/MP3/PDF/Doc/Excel/Code 等格式 • Enter 发送
                                </div>
                            </div>
                            </>}
                        </div>

                        {contextMenu.visible && (
                            <div
                                className={`fixed z-50 w-40 rounded-lg shadow-xl border ${theme === 'dark' ? 'bg-[#18181b] border-zinc-800' : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                    }`}
                                style={{ left: contextMenu.x, top: contextMenu.y, transform: 'translate(-50%, -50%)' }}
                                onMouseLeave={() => {
                                    setContextMenu(prev => ({ ...prev, visible: false }));
                                    setContextMenuExpanded(false);
                                }}
                            >
                                <div className="p-1">
                                    {[
                                        { type: 'input-image', label: t('图片输入') },
                                        { type: 'text-node', label: t('文字节点') },
                                        { type: 'novel-input', label: t('小说输入') },
                                        {
                                            type: 'extract-characters-scenes',
                                            label: t('提取角色和场景'),
                                            children: [
                                                { type: 'character-description', label: t('角色描述') },
                                                { type: 'scene-description', label: t('场景描述') },
                                                { type: 'generate-character-image', label: t('生成角色图片') },
                                                { type: 'generate-scene-image', label: t('生成场景图片') },
                                                { type: 'generate-character-video', label: t('生成角色视频') },
                                                { type: 'generate-scene-video', label: t('生成场景视频') },
                                                { type: 'create-character', label: t('创建角色') },
                                                { type: 'create-scene', label: t('创建场景') }
                                            ]
                                        },
                                        { type: 'video-input', label: t('视频输入 / 关键帧整理') },
                                        { type: 'video-analyze', label: t('视频拆解 / 提示词反推') },
                                        { type: 'storyboard-node', label: t('智能分镜表') },
                                        { type: 'gen-image', label: t('AI 绘图') },
                                        { type: 'gen-video', label: t('AI 视频') },
                                        { type: 'image-compare', label: t('图像对比') },
                                        { type: 'preview', label: t('预览窗口') },
                                        { type: 'local-save', label: t('保存到本地') }
                                    ].map(item => (
                                        <div key={item.type}>
                                            {item.children ? (
                                                <div className="relative">
                                                    <div
                                                        className="flex items-center"
                                                        onMouseEnter={() => setContextMenuExpanded(true)}
                                                    >
                                                        <button
                                                            className={`flex-1 text-left px-3 py-2 text-xs rounded transition-colors ${theme === 'dark'
                                                                ? 'text-zinc-300 hover:bg-zinc-800'
                                                                : 'text-zinc-700 hover:bg-zinc-100'
                                                                }`}
                                                            onClick={() => addNode(item.type, contextMenu.worldX, contextMenu.worldY, contextMenu.sourceNodeId, undefined, undefined, contextMenu.targetNodeId, contextMenu.inputType)}
                                                        >
                                                            {item.label}
                                                        </button>
                                                        <button
                                                            className={`px-2 py-2 rounded transition-colors ${theme === 'dark'
                                                                ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                                                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
                                                                }`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setContextMenuExpanded(prev => !prev);
                                                            }}
                                                            onMouseEnter={() => setContextMenuExpanded(true)}
                                                            title={t('展开子目录')}
                                                        >
                                                            <ChevronRight size={12} className="transition-transform" />
                                                        </button>
                                                    </div>
                                                    {contextMenuExpanded && (
                                                        <div
                                                            className={`absolute left-full top-0 ml-1 w-40 rounded-lg shadow-xl p-1 border ${theme === 'dark'
                                                                ? 'bg-[#18181b] border-zinc-700'
                                                                : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                                }`}
                                                        >
                                                            {item.children.map(child => (
                                                                <button
                                                                    key={child.type}
                                                                    className={`w-full text-left px-3 py-2 text-[11px] rounded transition-colors ${theme === 'dark'
                                                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                                                        : 'text-zinc-700 hover:bg-zinc-100'
                                                                        }`}
                                                                    onClick={() => addNode(child.type, contextMenu.worldX, contextMenu.worldY, contextMenu.sourceNodeId, undefined, undefined, contextMenu.targetNodeId, contextMenu.inputType)}
                                                                >
                                                                    {child.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <button
                                                    className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${theme === 'dark'
                                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                                        : 'text-zinc-700 hover:bg-zinc-100'
                                                        }`}
                                                    onClick={() => addNode(item.type, contextMenu.worldX, contextMenu.worldY, contextMenu.sourceNodeId, undefined, undefined, contextMenu.targetNodeId, contextMenu.inputType)}
                                                >
                                                    {item.label}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {historyContextMenu.visible && (
                            <div
                                className={`fixed z-[100] w-max rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${theme === 'dark' ? 'bg-[#18181b] border-zinc-700' : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                    }`}
                                style={{ left: historyContextMenu.x, top: historyContextMenu.y }}
                            >
                                <div
                                    className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${theme === 'dark' ? 'text-zinc-500 border-zinc-800' : 'text-zinc-500 border-zinc-200'
                                        }`}
                                >
                                    操作
                                </div>
                                <div
                                    className="relative"
                                    onMouseEnter={openHistorySendMenu}
                                    onMouseLeave={scheduleHistorySendMenuClose}
                                >
                                    <button
                                        className={`w-full whitespace-nowrap text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                            ? 'text-zinc-300 hover:bg-zinc-800'
                                            : 'text-zinc-700 hover:bg-zinc-100'
                                            }`}
                                        onClick={sendHistorySmart}
                                    >
                                        <Send size={14} className="text-blue-500" /> 智能发送
                                    </button>
                                    <button
                                        className={`w-full whitespace-nowrap text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                            ? 'text-zinc-300 hover:bg-zinc-800'
                                            : 'text-zinc-700 hover:bg-zinc-100'
                                            }`}
                                        onClick={sendHistoryPromptSmart}
                                    >
                                        <FileText size={14} className="text-amber-500" /> 发送提示词
                                    </button>
                                    <button
                                        className={`absolute right-2 top-2 p-1 rounded ${theme === 'dark'
                                            ? 'text-zinc-500 hover:text-zinc-200'
                                            : 'text-zinc-400 hover:text-zinc-700'
                                            }`}
                                        onMouseEnter={openHistorySendMenu}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setHistorySendMenuOpen(prev => !prev);
                                        }}
                                        title={t('展开发送到')}
                                    >
                                        <ChevronRight size={12} className={`transition-transform ${historySendMenuOpen ? 'rotate-90' : ''}`} />
                                    </button>
                                    {historySendMenuOpen && (
                                        <div
                                            className={`absolute left-full top-0 ml-1 w-max rounded-lg shadow-2xl py-1 border ${theme === 'dark'
                                                ? 'bg-[#18181b] border-zinc-700'
                                                : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                }`}
                                            onMouseEnter={openHistorySendMenu}
                                            onMouseLeave={scheduleHistorySendMenuClose}
                                        >
                                            <button
                                                className={`w-full whitespace-nowrap text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                                    ? 'text-zinc-300 hover:bg-zinc-800'
                                                    : 'text-zinc-700 hover:bg-zinc-100'
                                                    }`}
                                                onClick={sendHistoryToChat}
                                            >
                                                <MessageSquare size={14} className="text-purple-500" /> {t('发送到对话')}
                                            </button>
                                            <button
                                                className={`w-full whitespace-nowrap text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                                    ? 'text-zinc-300 hover:bg-zinc-800'
                                                    : 'text-zinc-700 hover:bg-zinc-100'
                                                    }`}
                                                onClick={sendHistoryToPreview}
                                            >
                                                <Maximize2 size={14} className="text-emerald-500" /> 发送到预览
                                            </button>
                                            <button
                                                className={`w-full whitespace-nowrap text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                                    ? 'text-zinc-300 hover:bg-zinc-800'
                                                    : 'text-zinc-700 hover:bg-zinc-100'
                                                    }`}
                                                onClick={sendHistoryToCanvas}
                                            >
                                                <CopyPlus size={14} className="text-blue-500" /> {t('发送到画布')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={() => {
                                        const item = historyContextMenu.item;
                                        const resolvedUrl = item?.url || item?.localCacheUrl || item?.originalUrl || item?.mjOriginalUrl;
                                        if (resolvedUrl) {
                                            // 将九宫格切割结果推到历史卡片右侧，避免遮挡列表
                                            const startX = (historyContextMenu.worldX || 0) + 340; // 侧边栏约 320px，再留 20px 间距
                                            const startY = historyContextMenu.worldY || 0;
                                            handleSplitGridFromUrl(resolvedUrl, { originX: startX, originY: startY });
                                        }
                                        setHistoryContextMenu({ visible: false, x: 0, y: 0, worldX: 0, worldY: 0, item: null });
                                    }}
                                >
                                    <Scissors size={14} className="text-blue-500" /> 九宫格裁切
                                </button>
                                {/* V3.5.8: 下载单个项目 */}
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={async () => {
                                        const item = historyContextMenu.item;
                                        const resolvedUrl = item?.url || item?.localCacheUrl || item?.originalUrl || item?.mjOriginalUrl;
                                        if (!resolvedUrl) return;
                                        try {
                                            const isVideo = item.type === 'video' || resolvedUrl.includes('/video/') || resolvedUrl.includes('video_mp4');
                                            const ext = isVideo ? 'mp4' : 'png';
                                            const promptSlug = (item.prompt || 'download').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
                                            const filename = `${promptSlug}.${ext}`;

                                            const useProxy = getItemProxyPreference(item);
                                            const { blob } = await fetchCacheSource(resolvedUrl, { useProxy });
                                            const blobUrl = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = blobUrl;
                                            a.download = filename;
                                            a.click();
                                            window.URL.revokeObjectURL(blobUrl);
                                        } catch (err) {
                                            console.error('下载失败:', err);
                                            canvasAlert(t('下载失败，请重试'));
                                        }
                                        setHistoryContextMenu({ visible: false, x: 0, y: 0, worldX: 0, worldY: 0, item: null });
                                    }}
                                >
                                    <Download size={14} className="text-green-500" /> {historyContextMenu.item?.type === 'video' ? '下载视频' : '下载图片'}
                                </button>
                            </div>
                        )}

                        {selectionContextMenu.visible && (
                            <div
                                className={`fixed z-[120] w-52 rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${theme === 'dark' ? 'bg-[#18181b] border-zinc-700' : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                    }`}
                                style={{ left: selectionContextMenu.x, top: selectionContextMenu.y }}
                                onMouseLeave={() => setSelectionContextMenu({ visible: false, x: 0, y: 0 })}
                            >
                                <div
                                    className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${theme === 'dark' ? 'text-zinc-500 border-zinc-800' : 'text-zinc-500 border-zinc-200'
                                        }`}
                                >
                                    选中 {selectedNodeIds.size > 0 ? selectedNodeIds.size : (selectedNodeId ? 1 : 0)} 个节点
                                </div>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={handleSaveSelectedWorkflow}
                                >
                                    <Save size={14} className="text-blue-500" /> 保存当前选取工作流
                                </button>
                            </div>
                        )}

                        {frameContextMenu.visible && (
                            <div
                                className={`fixed z-[110] w-48 rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${theme === 'dark' ? 'bg-[#18181b] border-zinc-700' : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                    }`}
                                style={{ left: frameContextMenu.x, top: frameContextMenu.y }}
                            >
                                <div
                                    className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${theme === 'dark' ? 'text-zinc-500 border-zinc-800' : 'text-zinc-500 border-zinc-200'
                                        }`}
                                >
                                    操作
                                </div>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={sendFrameToChat}
                                >
                                    <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
                                </button>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={sendFrameToCanvas}
                                >
                                    <CopyPlus size={14} className="text-blue-500" /> {t('发送到画布')}
                                </button>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={sendFrameToPreview}
                                >
                                    <Maximize2 size={14} className="text-emerald-500" /> 发送到预览窗口
                                </button>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={applyFrameToSelectedNode}
                                >
                                    <ArrowRightSquare size={14} className={selectedNodeId ? 'text-green-500' : 'text-zinc-400'} /> 应用到选中节点
                                </button>
                            </div>
                        )}

                        {previewContextMenu.visible && (
                            <div
                                className={`fixed z-[110] w-48 rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${theme === 'dark' ? 'bg-[#18181b] border-zinc-700' : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                    }`}
                                style={{ left: previewContextMenu.x, top: previewContextMenu.y }}
                                onMouseLeave={closePreviewContextMenu}
                            >
                                <div
                                    className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${theme === 'dark' ? 'text-zinc-500 border-zinc-800' : 'text-zinc-500 border-zinc-200'
                                        }`}
                                >
                                    操作
                                </div>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={sendPreviewToChat}
                                >
                                    <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
                                </button>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={sendPreviewToCanvas}
                                >
                                    <CopyPlus size={14} className="text-blue-500" /> {t('发送到画布')}
                                </button>
                                {/* V3.7.27: 预览原图选项 */}
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={() => {
                                        const item = previewContextMenu.item;
                                        if (item?.url) {
                                            setLightboxItem({
                                                url: item.url,
                                                type: item.type || 'image',
                                                prompt: item.prompt || '',
                                                mjImages: getLightboxNavImages(item),
                                                output_images: item.output_images,
                                                selectedMjImageIndex: item.selectedMjImageIndex || 0
                                            });
                                        }
                                        closePreviewContextMenu();
                                    }}
                                >
                                    <Maximize2 size={14} className="text-green-500" /> {t('预览原图')}
                                </button>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={() => {
                                        const item = previewContextMenu.item;
                                        if (item?.url) {
                                            // 检查是否有框选的节点，且数量正好是9个
                                            const currentSelectedIds = selectedNodeIdsRef.current;
                                            const hasSelectedNodes = currentSelectedIds && currentSelectedIds.size === 9;

                                            if (hasSelectedNodes) {
                                                // 替换模式：直接替换已选中的9个节点
                                                handleSplitGridFromUrl(item.url, { replaceSelected: true });
                                            } else {
                                                // 创建新节点模式：在源节点旁边创建
                                                const source = item.sourceNode;
                                                const originX = source ? source.x + source.width + 20 : undefined;
                                                const originY = source ? source.y : undefined;
                                                handleSplitGridFromUrl(item.url, { originX, originY });
                                            }
                                        }
                                        closePreviewContextMenu();
                                    }}
                                >
                                    <Scissors size={14} className="text-blue-500" /> 九宫格裁切
                                </button>
                                {/* V3.7.29: 下载按钮 */}
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={async () => {
                                        const item = previewContextMenu.item;
                                        if (!item?.url) {
                                            closePreviewContextMenu();
                                            return;
                                        }
                                        try {
                                            const isVideo = item.type === 'video' || item.url.includes('/video/') || item.url.includes('video_mp4');
                                            const ext = isVideo ? 'mp4' : 'png';
                                            const promptSlug = (item.prompt || 'download').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
                                            const filename = `${promptSlug}_${Date.now()}.${ext}`;

                                            const useProxy = getItemProxyPreference(item);
                                            const { blob } = await fetchCacheSource(item.url, { useProxy });
                                            const blobUrl = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = blobUrl;
                                            a.download = filename;
                                            a.click();
                                            window.URL.revokeObjectURL(blobUrl);
                                        } catch (err) {
                                            console.error('下载失败:', err);
                                            showToast('下载失败，请重试', 'error');
                                        }
                                        closePreviewContextMenu();
                                    }}
                                >
                                    <Download size={14} className="text-cyan-500" /> {t('下载')}
                                </button>
                            </div>
                        )}

                        {inputImageContextMenu.visible && (
                            <div
                                className={`fixed z-[110] w-48 rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${theme === 'dark' ? 'bg-[#18181b] border-zinc-700' : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                    }`}
                                style={{ left: inputImageContextMenu.x, top: inputImageContextMenu.y }}
                                onMouseLeave={closeInputImageContextMenu}
                            >
                                <div
                                    className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${theme === 'dark' ? 'text-zinc-500 border-zinc-800' : 'text-zinc-500 border-zinc-200'
                                        }`}
                                >
                                    操作
                                </div>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={sendInputImageToChat}
                                >
                                    <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
                                </button>
                                <button
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${theme === 'dark'
                                        ? 'text-zinc-300 hover:bg-zinc-800'
                                        : 'text-zinc-700 hover:bg-zinc-100'
                                        }`}
                                    onClick={() => {
                                        const nodeId = inputImageContextMenu.nodeId;
                                        const node = nodesMap.get(nodeId);
                                        if (!node || !node.content) return;

                                        // 检查是否有框选的节点，且数量正好是9个
                                        const currentSelectedIds = selectedNodeIdsRef.current;
                                        const hasSelectedNodes = currentSelectedIds && currentSelectedIds.size === 9;

                                        if (hasSelectedNodes) {
                                            // 替换模式：直接替换已选中的9个节点
                                            handleSplitGridFromUrl(node.content, { replaceSelected: true });
                                        } else {
                                            // 创建新节点模式：在源节点旁边创建
                                            const originX = node.x + node.width + 20;
                                            const originY = node.y;
                                            handleSplitGridFromUrl(node.content, { originX, originY });
                                        }
                                        closeInputImageContextMenu();
                                    }}
                                >
                                    <Scissors size={14} className="text-blue-500" /> 九宫格裁切
                                </button>
                            </div>
                        )}

                        <Lightbox
                            item={lightboxItem}
                            onClose={() => setLightboxItem(null)}
                            onNavigate={(newIndex) => {
                                // V3.7.22: 使用 ref 获取最新的 lightboxItem，避免闭包过时
                                const currentItem = lightboxItemRef.current;
                                const currentImages = getHistoryMultiImages(currentItem) || getLightboxNavImages(currentItem);
                                if (currentItem && currentImages && currentImages.length > newIndex && newIndex >= 0) {
                                    // 确保newIndex在有效范围内
                                    const validIndex = Math.max(0, Math.min(newIndex, currentImages.length - 1));
                                    const selectedUrl = currentImages[validIndex];
                                    const resolvedUrl = resolveHistoryUrl(currentItem, selectedUrl);

                                    // V3.7.22: 只有历史记录项（有 id 字段且无 storyboardContext）才更新历史记录
                                    if (currentItem.id && !currentItem.storyboardContext) {
                                        setHistory((prev) => prev.map((hItem) =>
                                            hItem.id === currentItem.id
                                                ? { ...hItem, url: selectedUrl, selectedMjImageIndex: validIndex }
                                                : hItem
                                        ));
                                    }

                                    // 更新lightboxItem显示，保持 storyboardContext 状态
                                    setLightboxItem({
                                        ...currentItem,
                                        mjImages: currentImages,
                                        url: resolvedUrl,
                                        selectedMjImageIndex: validIndex
                                    });
                                }
                            }}
                            onShotNavigate={(newShotIndex, allShots) => {
                                // V3.7.22: 使用 ref 获取最新的 lightboxItem
                                const currentItem = lightboxItemRef.current;
                                if (!currentItem?.storyboardContext || !allShots) return;

                                const currentIndex = currentItem.storyboardContext.shotIndex;
                                const direction = newShotIndex > currentIndex ? 1 : -1;

                                // V3.7.29: 跳过没有图片的镜头，找到下一个有图片的镜头
                                let targetIndex = newShotIndex;
                                let targetShot = null;

                                while (targetIndex >= 0 && targetIndex < allShots.length) {
                                    const candidateShot = allShots[targetIndex];
                                    const outputImages = candidateShot?.output_images || [];
                                    if (outputImages.length > 0) {
                                        targetShot = candidateShot;
                                        break;
                                    }
                                    targetIndex += direction;
                                }

                                if (!targetShot) return; // 找不到有图片的镜头

                                const outputImages = targetShot.output_images || [];
                                const imgIndex = 0; // 切换到新镜头时从第一张开始
                                setLightboxItem({
                                    url: outputImages[imgIndex],
                                    type: 'image',
                                    mjImages: outputImages,
                                    selectedMjImageIndex: imgIndex,
                                    prompt: targetShot.prompt,
                                    storyboardContext: {
                                        ...currentItem.storyboardContext,
                                        shotId: targetShot.id,
                                        shotIndex: targetIndex
                                    }
                                });
                            }}
                            onHistoryNavigate={(direction) => {
                                // V3.7.29: 历史项导航功能 (direction: -1=上一项, 1=下一项)
                                const currentItem = lightboxItemRef.current;
                                const debugNav = (stage, extra = {}) => {
                                    console.log('[Lightbox][history_nav]', {
                                        stage,
                                        direction,
                                        currentId: currentItem?.id || null,
                                        ...extra
                                    });
                                };
                                if (!currentItem || currentItem.storyboardContext) {
                                    debugNav('blocked', { reason: !currentItem ? 'no_current_item' : 'storyboard_context' });
                                    return; // 分镜模式不使用历史导航
                                }

                                const snapshotIds = lightboxHistorySnapshotRef.current;
                                const baseItems = historyNavItems;
                                let items = snapshotIds && snapshotIds.length > 1
                                    ? snapshotIds.map(id => historyMap.get(id)).filter(Boolean)
                                    : baseItems;
                                if (!items.length || items.length <= 1) {
                                    items = baseItems;
                                }
                                if (!items.length) {
                                    debugNav('blocked', { reason: 'no_items', snapshotCount: snapshotIds?.length || 0, baseCount: baseItems.length });
                                    return;
                                }

                                let currentIndex = getHistoryNavAnchorIndex(currentItem, items);
                                if (currentIndex === -1) {
                                    items = baseItems;
                                    currentIndex = getHistoryNavAnchorIndex(currentItem, items);
                                }
                                if (currentIndex === -1) {
                                    debugNav('blocked', { reason: 'anchor_not_found', itemCount: items.length, snapshotCount: snapshotIds?.length || 0 });
                                    return;
                                }
                                if (!snapshotIds || snapshotIds.length === 0) {
                                    lightboxHistorySnapshotRef.current = items.map(h => h.id);
                                }

                                let nextIndex = findHistoryNavIndex(items, currentIndex, direction);
                                if (nextIndex < 0 && items !== baseItems) {
                                    items = baseItems;
                                    currentIndex = getHistoryNavAnchorIndex(currentItem, items);
                                    if (currentIndex < 0) {
                                        debugNav('blocked', { reason: 'fallback_anchor_not_found', baseCount: baseItems.length });
                                        return;
                                    }
                                    nextIndex = findHistoryNavIndex(items, currentIndex, direction);
                                }
                                if (nextIndex < 0) {
                                    debugNav('blocked', { reason: 'next_index_not_found', currentIndex, itemCount: items.length });
                                    return;
                                }
                                let candidate = items[nextIndex];
                                if (candidate?.id === currentItem.id) {
                                    const retryIndex = findHistoryNavIndex(items, nextIndex, direction);
                                    if (retryIndex < 0) {
                                        debugNav('blocked', { reason: 'retry_index_not_found', nextIndex, itemCount: items.length });
                                        return;
                                    }
                                    nextIndex = retryIndex;
                                    candidate = items[nextIndex];
                                }
                                if (!candidate) {
                                    debugNav('blocked', { reason: 'candidate_missing', nextIndex });
                                    return;
                                }
                                // 纵向切组时强制落在组内第 1 张，避免跨组索引污染导致跳图
                                const preview = getHistoryNavPreview(candidate, { forceFirstImage: true });
                                const resolvedUrl = preview.url;
                                const selectedIndex = preview.index;
                                if (!candidate || candidate.id === currentItem.id) {
                                    debugNav('blocked', { reason: 'candidate_same_as_current', candidateId: candidate?.id || null });
                                    return;
                                }
                                if (!resolvedUrl) {
                                    debugNav('blocked', { reason: 'empty_preview_url', candidateId: candidate.id, selectedIndex });
                                    return;
                                }

                                lightboxHistoryIndexRef.current = nextIndex;
                                setHistoryFocusId(candidate.id);
                                setHistoryFocusIndex(nextIndex);
                                const candidateImages = getHistoryMultiImages(candidate) || getLightboxNavImages(candidate);
                                debugNav('navigate', {
                                    fromIndex: currentIndex,
                                    toIndex: nextIndex,
                                    candidateId: candidate.id,
                                    itemCount: items.length,
                                    snapshotCount: snapshotIds?.length || 0
                                });
                                setLightboxItem({
                                    ...candidate,
                                    mjImages: candidateImages || candidate.mjImages || null,
                                    url: resolvedUrl,
                                    selectedMjImageIndex: selectedIndex,
                                    storyboardContext: null
                                });
                            }}
                        />

                        {cloudDocument && settingsOpen && <CanvasModelSettings theme={theme} onClose={() => setSettingsOpen(false)} onRefresh={onRefreshCloudModels} />}
                        <CanvasSettingsModal {...{
                                HISTORY_SAVE_LIMIT_MAX,
                                HISTORY_SAVE_LIMIT_MIN,
                                addModelLibraryCustomParam,
                                addModelLibraryEntry,
                                apiBlacklist,
                                apiBlacklistRef,
                                apiConfigs,
                                apiStatus,
                                apiSuspendList,
                                apiTesting,
                                applyHistorySaveLimitInput,
                                cloudDocument,
                                collapsedLibraryModels,
                                collapsedLibraryStateLoadedRef,
                                deleteApiConfig,
                                deleteModelLibraryCustomParam,
                                deleteModelLibraryEntry,
                                deletingProviderKey,
                                duplicateModelLibraryEntry,
                                editingApiModels,
                                editingLibraryModels,
                                editingProvider,
                                error1006WindowRef,
                                expandedProviders,
                                exportApiModelConfig,
                                exportModelLibraryEntry,
                                getDefaultDurationsForModel,
                                getStatusColor,
                                getVideoResolutionsForModel,
                                globalApiKey,
                                groupedApiConfigs,
                                handleLanguageChange,
                                hasExpandedLibraryModels,
                                historySaveLimit,
                                historySaveLimitInput,
                                historySaveLimitTimerRef,
                                importApiModelConfigs,
                                importModelLibraryEntries,
                                isLibraryNotesCollapsed,
                                isLibrarySectionCollapsed,
                                jimengUseLocalFile,
                                language,
                                libraryAsyncConfigDrafts,
                                libraryAsyncPreviewModels,
                                libraryPreviewDrafts,
                                libraryPreviewEditing,
                                libraryPreviewModels,
                                libraryRequestChainDrafts,
                                libraryRequestPreviewDrafts,
                                libraryRequestPreviewEditing,
                                libraryRequestTemplateDrafts,
                                libraryTransportOptionsDrafts,
                                localCacheEnabled,
                                localCacheServerConnected,
                                localServerUrl,
                                localStorage,
                                maxUndoSteps,
                                modelLibrary,
                                modelLibraryContractIssuesById,
                                modelLibraryMap,
                                normalizeProviderConfig,
                                providers,
                                saveHistoryAssets,
                                setApiBlacklist,
                                setApiConfigs,
                                setApiModelEditing,
                                setApiSuspendList,
                                setCollapsedLibraryModels,
                                setDeletingProviderKey,
                                setEditingProvider,
                                setExpandedProviders,
                                setGlobalApiKey,
                                setHistorySaveLimitInput,
                                setJimengUseLocalFile,
                                setLibraryAsyncConfigDrafts,
                                setLibraryModelEditing,
                                setLibraryPreviewDrafts,
                                setLibraryPreviewEditing,
                                setLibraryRequestChainDrafts,
                                setLibraryRequestPreviewDrafts,
                                setLibraryRequestPreviewEditing,
                                setLibraryRequestTemplateDrafts,
                                setLibraryTransportOptionsDrafts,
                                setLocalServerUrl,
                                setMaxUndoSteps,
                                setModelLibrary,
                                setProviders,
                                setSaveHistoryAssets,
                                setSettingsOpen,
                                setSettingsTab,
                                settingsOpen,
                                settingsTab,
                                showToast,
                                testApiConnection,
                                theme,
                                toggleLibraryAsyncPreview,
                                toggleLibraryModelCollapse,
                                toggleLibraryNotesCollapsed,
                                toggleLibraryPreview,
                                toggleLibrarySectionCollapsed,
                                updateApiConfig,
                                updateModelLibraryCustomParam,
                                updateModelLibraryEntry,
                            }} />

                        {/* 批量素材管理模态框 */}
                        {batchModalOpen && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center">
                                <div
                                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                                    onClick={() => {
                                        setBatchModalOpen(false);
                                        setBatchSelectedIds(new Set());
                                    }}
                                />
                                <div className={`relative w-[90vw] h-[85vh] max-w-7xl rounded-lg shadow-2xl flex flex-col ${theme === 'dark'
                                    ? 'bg-[#121214] border border-zinc-800'
                                    : theme === 'solarized'
                                        ? 'bg-[#eee8d5] border border-[#d7cfb2]'
                                        : 'bg-white border border-zinc-200'
                                    }`}>
                                    {/* 顶部栏 */}
                                    <div className={`p-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
                                        }`}>
                                        <div className="flex items-center gap-4">
                                            <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'
                                                }`}>
                                                {t('批量素材管理')}
                                            </h2>
                                            <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'
                                                }`}>
                                                已选中 {batchSelectedIds.size} 项
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    if (batchSelectedIds.size === history.length) {
                                                        setBatchSelectedIds(new Set());
                                                    } else {
                                                        setBatchSelectedIds(new Set(history.map(item => item.id)));
                                                    }
                                                }}
                                                className={`px-3 py-1.5 text-xs rounded transition-colors ${theme === 'dark'
                                                    ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                                                    }`}
                                            >
                                                {batchSelectedIds.size === history.length ? t('取消全选') : t('全选')}
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (batchSelectedIds.size === 0) return;
                                                    const selectedIds = new Set(batchSelectedIds);
                                                    if (await canvasConfirm(`确定要删除选中的 ${selectedIds.size} 项吗？`, { danger: true })) {
                                                        setHistory(prev => {
                                                            const filtered = prev.filter(item => !selectedIds.has(item.id));
                                                            // 立即保存到 localStorage，不等待防抖
                                                            try {
                                                                localStorage.setItem('tapnow_history', JSON.stringify(filtered));
                                                            } catch (e) {
                                                                console.error('立即保存历史记录失败:', e);
                                                            }
                                                            return filtered;
                                                        });
                                                        setBatchSelectedIds(prev => new Set([...prev].filter(id => !selectedIds.has(id))));
                                                    }
                                                }}
                                                disabled={batchSelectedIds.size === 0}
                                                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${batchSelectedIds.size === 0
                                                    ? theme === 'dark'
                                                        ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                                                        : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                                                    : 'bg-red-600 text-white hover:bg-red-700'
                                                    }`}
                                            >
                                                <Trash2 size={14} />
                                                {t('批量删除')}
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (batchSelectedIds.size === 0) return;
                                                    const baseUrl = (localServerUrl || '').replace(/\/+$/, '');
                                                    if (!baseUrl) {
                                                        showToast('本地服务地址为空', 'error');
                                                        return;
                                                    }
                                                    const selectedItems = history.filter(item => batchSelectedIds.has(item.id));
                                                    const files = selectedItems
                                                        .map(item => item.localFilePath || item.localCacheUrl)
                                                        .filter(Boolean);
                                                    if (files.length === 0) {
                                                        showToast('选中项没有本地缓存可清理', 'warning');
                                                        return;
                                                    }
                                                    try {
                                                        const res = await fetch(`${baseUrl}/delete-batch`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ files })
                                                        });
                                                        if (!res.ok) {
                                                            const errText = await res.text();
                                                            throw new Error(errText || '清理缓存失败');
                                                        }
                                                        const data = await res.json();
                                                        setHistory(prev => prev.map(item =>
                                                            batchSelectedIds.has(item.id)
                                                                ? { ...item, localCacheUrl: null, localFilePath: null }
                                                                : item
                                                        ));
                                                        showToast(data?.message || `已清理 ${files.length} 个缓存文件`, 'success');
                                                    } catch (err) {
                                                        showToast(`清理缓存失败: ${err.message || '网络错误'}`, 'error');
                                                    }
                                                }}
                                                disabled={batchSelectedIds.size === 0}
                                                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${batchSelectedIds.size === 0
                                                    ? theme === 'dark'
                                                        ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                                                        : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                                                    : theme === 'dark'
                                                        ? 'bg-amber-600/30 text-amber-200 hover:bg-amber-600/40'
                                                        : 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                                                    }`}
                                            >
                                                <Trash2 size={14} />
                                                {t('清理缓存')}
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (batchSelectedIds.size === 0) return;
                                                    const selectedItems = history.filter(item =>
                                                        batchSelectedIds.has(item.id) && (item.url || item.localCacheUrl || item.originalUrl || item.mjOriginalUrl)
                                                    );
                                                    if (selectedItems.length === 0) {
                                                        canvasAlert(t('选中的项目中没有有效的素材'));
                                                        return;
                                                    }

                                                    // 获取画布中心坐标
                                                    const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);

                                                    // 计算起始位置（稍微偏移，避免重叠）
                                                    const startX = world.x;
                                                    const startY = world.y;

                                                    // 批量添加到画布
                                                    selectedItems.forEach((item, index) => {
                                                        const offsetX = (index % 5) * 20; // 每行5个，横向偏移
                                                        const offsetY = Math.floor(index / 5) * 20; // 纵向偏移

                                                        let content = item.localCacheUrl || item.url || item.originalUrl || item.mjOriginalUrl;
                                                        if (item.type === 'video' && !isVideoUrl(content)) {
                                                            content += (content.includes('?') ? '&' : '?') + 'force_video_display=true';
                                                        }

                                                        // 根据类型添加节点
                                                        if (item.type === 'image') {
                                                            // 尝试获取图片尺寸
                                                            (async () => {
                                                                try {
                                                                    const dims = await getImageDimensions(content);
                                                                    addNode('input-image', startX + offsetX, startY + offsetY, null, content, dims);
                                                                } catch (e) {
                                                                    addNode('input-image', startX + offsetX, startY + offsetY, null, content);
                                                                }
                                                            })();
                                                        } else if (item.type === 'video') {
                                                            addNode('video-input', startX + offsetX, startY + offsetY, null, content);
                                                        }
                                                    });

                                                    setBatchModalOpen(false);
                                                    setBatchSelectedIds(new Set());
                                                }}
                                                disabled={batchSelectedIds.size === 0}
                                                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${batchSelectedIds.size === 0
                                                    ? theme === 'dark'
                                                        ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                                                        : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                                    }`}
                                            >
                                                <ArrowRightSquare size={14} />
                                                {t('发送到画布')}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setBatchModalOpen(false);
                                                    setBatchSelectedIds(new Set());
                                                }}
                                                className={`p-1.5 rounded transition-colors ${theme === 'dark'
                                                    ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                                    }`}
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* 内容区 - 网格布局 */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                                        <div className="grid grid-cols-4 gap-4">
                                            {history.map((item) => {
                                                const isSelected = batchSelectedIds.has(item.id);
                                                const fullModelName = item.modelName || item.apiConfig?.modelId || item.apiConfig?.model || item.apiConfig?.modelName || item.model || '未知模型';
                                                const modelDisplay = fullModelName.length > 12 ? `${fullModelName.slice(0, 9)}...` : fullModelName;
                                                const baseUrl = (localCacheActive ? (item.localCacheUrl || (item.localCacheMap ? Object.values(item.localCacheMap)[0] : null)) : null) || item.url || item.originalUrl || item.mjOriginalUrl;
                                                const previewImages = item.mjImages && item.mjImages.length > 0
                                                    ? item.mjImages
                                                    : (item.output_images && item.output_images.length > 0 ? item.output_images : null);
                                                const mappedPreviewImages = previewImages
                                                    ? previewImages.map((url) => (localCacheActive && item.localCacheMap && item.localCacheMap[url]) ? item.localCacheMap[url] : url)
                                                    : null;
                                                const selectedIndex = typeof item.selectedMjImageIndex === 'number' ? item.selectedMjImageIndex : 0;
                                                const safeIndex = mappedPreviewImages ? Math.min(selectedIndex, mappedPreviewImages.length - 1) : 0;
                                                const gridImages = mappedPreviewImages && mappedPreviewImages.length >= 4
                                                    ? mappedPreviewImages.slice(0, 4)
                                                    : null;
                                                const gridSelectedIndex = gridImages ? Math.min(safeIndex, gridImages.length - 1) : 0;
                                                const displayUrl = mappedPreviewImages
                                                    ? (mappedPreviewImages[safeIndex] || mappedPreviewImages[0])
                                                    : baseUrl;
                                                const resolvedDisplayUrl = resolveHistoryUrl(item, displayUrl);
                                                const resolvedGridImages = gridImages
                                                    ? gridImages.map((img) => resolveHistoryUrl(item, img)).filter(Boolean)
                                                    : null;
                                                const hasBackendCache = !!(localCacheActive && (item.localCacheUrl || item.localFilePath || (item.localCacheMap && Object.keys(item.localCacheMap).length > 0)));
                                                const isVideoItem = item.type === 'video' || (resolvedDisplayUrl ? isVideoUrl(resolvedDisplayUrl) : false);
                                                const ratioValue = item.ratio || item.mjRatio || '';
                                                const rawResolution = item.resolution || (item.width && item.height ? `${item.width}x${item.height}` : '');
                                                const resolutionValue = rawResolution ? rawResolution.replace(/p$/i, '') : '';
                                                const durationValue = isVideoItem && item.duration ? `${String(item.duration).replace(/s$/i, '')}s` : '';
                                                const specParts = [ratioValue, resolutionValue].filter(Boolean);
                                                if (isVideoItem && durationValue) specParts.push(durationValue);
                                                const specText = specParts.join('/');
                                                const timeLabel = item.startTime
                                                    ? new Date(item.startTime).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
                                                    : (item.time || '');
                                                const costLabel = typeof item.durationMs === 'number' && item.durationMs > 0
                                                    ? `${(item.durationMs / 60000).toFixed(1)}m`
                                                    : '';
                                                const genTypeLabel = isVideoItem
                                                    ? (item.hasInputImages ? '图→视' : '文→视')
                                                    : (item.hasInputImages ? '图→图' : '文→图');

                                                return (
                                                    <div
                                                        key={item.id}
                                                        className={`relative rounded-lg overflow-hidden border-2 transition-all ${isSelected
                                                            ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                                                            : theme === 'dark'
                                                                ? 'border-zinc-800 hover:border-zinc-700'
                                                                : 'border-zinc-200 hover:border-zinc-300'
                                                            }`}
                                                    >
                                                        {/* 选中标记和查看按钮 */}
                                                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                                                            {isSelected && (
                                                                <div className="bg-blue-500 rounded-full p-1">
                                                                    <Check size={16} className="text-white" />
                                                                </div>
                                                            )}
                                                            {item.status === 'completed' && resolvedDisplayUrl && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        // 准备要显示的item，确保包含正确的url和selectedMjImageIndex
                                                                        const displayItem = {
                                                                            ...item,
                                                                            mjImages: previewImages || getLightboxNavImages(item),
                                                                            url: resolvedDisplayUrl,
                                                                            selectedMjImageIndex: previewImages && previewImages.length > 1
                                                                                ? safeIndex
                                                                                : undefined
                                                                        };
                                                                        setLightboxItem(displayItem);
                                                                    }}
                                                                    className={`p-1.5 rounded-full transition-colors backdrop-blur-sm ${theme === 'dark'
                                                                        ? 'bg-black/60 text-white hover:bg-black/80'
                                                                        : 'bg-white/80 text-zinc-700 hover:bg-white'
                                                                        }`}
                                                                    title={t('查看大图 (双击也可查看)')}
                                                                >
                                                                    <Maximize2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* 缩略图 */}
                                                        <div className={`relative ${((previewImages && previewImages.length > 1) || (item.mjNeedsSplit && item.apiConfig?.modelId?.includes('mj')))
                                                            ? (() => {
                                                                const ratio = item.mjRatio || '1:1';
                                                                if (ratio === '16:9') return 'aspect-video';
                                                                if (ratio === '9:16') return 'aspect-[9/16]';
                                                                if (ratio === '4:3') return 'aspect-[4/3]';
                                                                if (ratio === '3:4') return 'aspect-[3/4]';
                                                                if (ratio === '21:9') return 'aspect-[21/9]';
                                                                return 'aspect-square';
                                                            })()
                                                            : 'aspect-video'
                                                            } ${theme === 'dark' ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                                                            {hasBackendCache && (
                                                                <div className="absolute top-2 left-2 z-10 text-[9px] px-2 py-0.5 rounded bg-orange-500 text-white shadow">
                                                                    后端缓存
                                                                </div>
                                                            )}
                                                            {item.status === 'completed' && (resolvedDisplayUrl || (resolvedGridImages && resolvedGridImages.length > 0)) ? (
                                                                isVideoItem ? (
                                                                    <ResolvedVideo
                                                                        src={resolvedDisplayUrl}
                                                                        className="w-full h-full object-contain"
                                                                        controls
                                                                        playsInline
                                                                        preload="metadata"
                                                                    />
                                                                ) : resolvedGridImages && resolvedGridImages.length > 0 ? (
                                                                    <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                                                                        {resolvedGridImages.map((img, idx) => {
                                                                            const isActive = gridSelectedIndex === idx;
                                                                            return (
                                                                                <div
                                                                                    key={`${item.id}-${idx}`}
                                                                                    className={`relative w-full h-full cursor-pointer ${isActive ? 'ring-2 ring-blue-400' : ''}`}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setHistory(prev => prev.map(h =>
                                                                                            h.id === item.id ? { ...h, selectedMjImageIndex: idx } : h
                                                                                        ));
                                                                                    }}
                                                                                    onDoubleClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        setLightboxItem({
                                                                                            ...item,
                                                                                            mjImages: previewImages || getLightboxNavImages(item),
                                                                                            url: img,
                                                                                            selectedMjImageIndex: idx
                                                                                        });
                                                                                    }}
                                                                                >
                                                                                    <LazyBase64Image
                                                                                        src={img}
                                                                                        className={`w-full h-full object-cover ${isActive ? 'opacity-80' : ''}`}
                                                                                        alt={`生成图-${idx + 1}`}
                                                                                    />
                                                                                    {isActive && (
                                                                                        <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
                                                                                    )}
                                                                                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                                                                                        {idx + 1}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : (
                                                                    <LazyBase64Image
                                                                        src={resolvedDisplayUrl}
                                                                        className="w-full h-full object-contain"
                                                                        alt={t('生成图')}
                                                                        onError={(e) => {
                                                                            e.target.style.display = 'none';
                                                                        }}
                                                                    />
                                                                )
                                                            ) : (
                                                                <div className={`w-full h-full flex items-center justify-center ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'
                                                                    }`}>
                                                                    {item.status === 'generating' ? (
                                                                        <Loader2 size={24} className="animate-spin" />
                                                                    ) : (
                                                                        <FileImage size={24} />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* 底部信息 */}
                                                        <div
                                                            onClick={() => {
                                                                const newSet = new Set(batchSelectedIds);
                                                                if (isSelected) {
                                                                    newSet.delete(item.id);
                                                                } else {
                                                                    newSet.add(item.id);
                                                                }
                                                                setBatchSelectedIds(newSet);
                                                            }}
                                                            className={`p-2 text-xs cursor-pointer ${theme === 'dark' ? 'bg-zinc-900 text-zinc-300' : 'bg-zinc-50 text-zinc-700'
                                                                }`}
                                                        >
                                                            <div className="truncate font-medium">{item.prompt || '未命名'}</div>
                                                            <div className="text-[10px] opacity-70 mt-0.5">
                                                                <span>{genTypeLabel} </span>
                                                                <span title={fullModelName}>{modelDisplay}</span>
                                                                {specText && <span> · {specText}</span>}
                                                                {timeLabel && <span> · {timeLabel}</span>}
                                                                {costLabel && <span> · {costLabel}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div >

            {storyboardTableCellEditor.visible && (
                <div
                    className="fixed inset-0 z-[9997] flex items-center justify-center p-4"
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        closeStoryboardTableCellEditor();
                    }}
                >
                    <div className="absolute inset-0 bg-black/45" />
                    <div
                        className={`relative rounded-xl border shadow-2xl flex flex-col ${theme === 'dark'
                            ? 'bg-zinc-900 border-zinc-700'
                            : theme === 'solarized'
                                ? 'bg-[#fdf6e3] border-[#d7cfb2]'
                                : 'bg-white border-zinc-300'
                            }`}
                        style={{
                            width: `${Math.max(360, Math.round(storyboardTableCellEditor.width))}px`,
                            height: `${Math.max(220, Math.round(storyboardTableCellEditor.height))}px`
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className={`px-3 py-2 border-b flex items-center justify-between text-xs ${theme === 'dark'
                            ? 'border-zinc-700 text-zinc-300'
                            : theme === 'solarized'
                                ? 'border-[#d7cfb2] text-zinc-700'
                                : 'border-zinc-200 text-zinc-700'
                            }`}>
                            <span>{t('表格单元格编辑（3x）')}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeStoryboardTableCellEditor();
                                }}
                                className={`p-1 rounded transition-colors ${theme === 'dark'
                                    ? 'hover:bg-zinc-800 text-zinc-300'
                                    : theme === 'solarized'
                                        ? 'hover:bg-[#eee8d5] text-zinc-700'
                                        : 'hover:bg-zinc-100 text-zinc-600'
                                    }`}
                                title={t('关闭')}
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex-1 p-3">
                            <textarea
                                value={storyboardTableCellEditor.value}
                                onChange={(e) => handleStoryboardTableCellEditorChange(e.target.value)}
                                className={`w-full h-full text-xs p-2 rounded border resize-none ${theme === 'dark'
                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                    : theme === 'solarized'
                                        ? 'bg-[#fdf6e3] border-[#d7cfb2] text-zinc-700'
                                        : 'bg-white border-zinc-300 text-zinc-700'
                                    }`}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                autoFocus
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* V3.7.27: Toast 通知容器 */}
            < div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none" >
                {
                    toasts.map(toast => (
                        <div
                            key={toast.id}
                            className={`px-4 py-2 rounded-lg shadow-lg text-sm font-medium pointer-events-auto animate-pulse ${toast.type === 'success' ? 'bg-green-600 text-white' :
                                toast.type === 'error' ? 'bg-red-600 text-white' :
                                    toast.type === 'warning' ? 'bg-yellow-500 text-black' :
                                        'bg-zinc-800 text-white'
                                }`}
                        >
                            {toast.message}
                        </div>
                    ))
                }
            </div >
        </>
    );
}
