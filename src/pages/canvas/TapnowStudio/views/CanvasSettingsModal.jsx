import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import { canvasAlert } from '../canvasDialogs';
import React from 'react';
import {
    Plus,
    Loader2,
    Link as LinkIcon,
    Trash2,
    Edit2,
    CheckCircle2,
    CopyPlus,
    ChevronsUp,
    Code,
    Check,
    Download,
    FolderOpen,
    ChevronDown,
    UploadCloud,
    Zap,
    Ban,
    Clock,
    Edit3,
    Pencil
} from 'lucide-react';
import {
    t,
    TagListEditor,
    ASYNC_CONFIG_TEMPLATE_TEXT,
    REQUEST_CHAIN_TEMPLATE_TEXT,
    buildEmptyAsyncConfig,
    IMAGE_BATCH_MODE_PARALLEL_AGGREGATE,
    IMAGE_BATCH_MODE_STANDARD_BATCH,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_DISABLE,
    TRANSPORT_HTTP_JSON,
    TRANSPORT_HTTP_SSE,
    TRANSPORT_WS_STREAM,
    getDefaultRatiosForModel,
    normalizeResolutionOption,
    normalizeImageRouteMode,
    normalizeImageBatchMode,
    normalizeNativeMultiImageMode,
    normalizeVideoResolution,
    normalizeDurationValue,
    isImageModelType,
    MAX_CUSTOM_PARAMS,
    DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS,
    INTERNAL_CUSTOM_PARAM_NAMES,
    MAX_CUSTOM_PARAM_VALUES,
    normalizeResolutionNotes,
    getDefaultRequestTemplateForEntry,
    getValueLabelWithNotes,
    getCustomParamValueLabel,
    buildCustomParamPreviewPayload,
    normalizeImageConcurrency,
    normalizeImageDispatchIntervalSeconds,
    normalizePreviewOverridePatch,
    buildPreviewOverridePatch,
    applyPreviewOverridePatch,
    normalizeRequestTemplate,
    normalizeTransportMode,
    normalizeTransportOptions,
    normalizeCapabilitySchema,
    normalizeAsyncConfig,
    normalizeRequestChain,
    normalizeModelLibraryEntry,
    normalizeRequestOverridePatch,
    buildRequestFromTemplate,
    applyRequestOverridePatch,
    formatRequestPreview,
    getModelLibraryPreviewEndpoint,
    buildPythonPreviewSnippet,
    getDefaultResolutionsForModel,
    Button,
    Modal
} from '../freeCanvasShared';

export default function CanvasSettingsModal({
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
}) {
  useUiLanguage()

    return (
<Modal isOpen={settingsOpen && !cloudDocument} onClose={() => setSettingsOpen(false)} title={t('模型接口配置')} theme={theme}>
                            <div className="px-4 pt-3">
                                <div className={`inline-flex rounded-md border ${theme === 'dark'
                                    ? 'border-zinc-800 bg-[#18181b]'
                                    : theme === 'solarized'
                                        ? 'border-[#d7cfb2] bg-[#eee8d5]'
                                        : 'border-zinc-200 bg-zinc-50'
                                    } p-1`}>
                                    <button
                                        onClick={() => setSettingsTab('providers')}
                                        className={`px-3 py-1 text-xs rounded ${settingsTab === 'providers'
                                            ? theme === 'dark'
                                                ? 'bg-zinc-800 text-zinc-100'
                                                : theme === 'solarized'
                                                    ? 'bg-[#fdf6e3] text-zinc-800'
                                                    : 'bg-white text-zinc-800'
                                            : theme === 'dark'
                                                ? 'text-zinc-400 hover:text-zinc-200'
                                                : theme === 'solarized'
                                                    ? 'text-[#586e75] hover:text-zinc-800'
                                                    : 'text-zinc-500 hover:text-zinc-700'
                                            }`}
                                    >
                                        {t('接口配置')}
                                    </button>
                                    <button
                                        onClick={() => setSettingsTab('library')}
                                        className={`px-3 py-1 text-xs rounded ${settingsTab === 'library'
                                            ? theme === 'dark'
                                                ? 'bg-zinc-800 text-zinc-100'
                                                : theme === 'solarized'
                                                    ? 'bg-[#fdf6e3] text-zinc-800'
                                                    : 'bg-white text-zinc-800'
                                            : theme === 'dark'
                                                ? 'text-zinc-400 hover:text-zinc-200'
                                                : theme === 'solarized'
                                                    ? 'text-[#586e75] hover:text-zinc-800'
                                                    : 'text-zinc-500 hover:text-zinc-700'
                                            }`}
                                    >
                                        {t('模型库')}
                                    </button>
                                </div>
                            </div>
                            {settingsTab === 'providers' && (
                                <>
                                    <details className={`mx-4 mt-3 rounded-md border ${theme === 'dark'
                                        ? 'border-zinc-800 bg-[#18181b]'
                                        : theme === 'solarized'
                                            ? 'border-[#d7cfb2] bg-[#eee8d5]'
                                            : 'border-zinc-200 bg-white'
                                        }`}>
                                        <summary className={`cursor-pointer select-none px-3 py-2 text-xs font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                            {t('基础设置')}
                                        </summary>
                                        <div className="px-3 pb-3 pt-2 space-y-4">
                                            <div className="space-y-2">
                                                <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('全局 API Key（可选，全局默认 Key）')}</label>
                                                <input
                                                    type="password"
                                                    value={globalApiKey}
                                                    onChange={(e) => setGlobalApiKey(e.target.value)}
                                                    className={`w-full rounded px-2 py-1 text-xs outline-none focus:border-blue-600/50 border ${theme === 'dark'
                                                        ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                        : 'bg-white border-zinc-300 text-zinc-900'
                                                        }`}
                                                    placeholder={t('如果不想每个模型单独填 Key，可以在这里填一个全局 Key')}
                                                />
                                            </div>

                                            <div className="border-t pt-3 border-zinc-700/50">
                                                <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('实验室功能')}</label>
                                                <div className="grid grid-cols-2 gap-3 mt-2">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className={`text-xs ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{t('保存资产包（Zip）')}</span>
                                                            <button
                                                                className={`w-10 h-5 rounded-full relative transition-colors ${saveHistoryAssets ? 'bg-blue-600' : theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-300'}`}
                                                                onClick={() => setSaveHistoryAssets(prev => !prev)}
                                                            >
                                                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${saveHistoryAssets ? 'left-6' : 'left-1'}`} />
                                                            </button>
                                                        </div>
                                                        <p className="text-[9px] text-zinc-500">{t('导出时打包历史图片/视频与项目文件，便于离线恢复。')}</p>
                                                        <div className="mt-2 flex items-center justify-between gap-2">
                                                            <span className={`text-xs ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{t('历史保存上限')}</span>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    min={HISTORY_SAVE_LIMIT_MIN}
                                                                    max={HISTORY_SAVE_LIMIT_MAX}
                                                                    step="10"
                                                                    value={historySaveLimitInput}
                                                                    onChange={(e) => {
                                                                        const raw = e.target.value;
                                                                        setHistorySaveLimitInput(raw);
                                                                        if (historySaveLimitTimerRef.current) {
                                                                            clearTimeout(historySaveLimitTimerRef.current);
                                                                        }
                                                                        historySaveLimitTimerRef.current = setTimeout(() => {
                                                                            applyHistorySaveLimitInput(raw);
                                                                        }, 1000);
                                                                    }}
                                                                    onBlur={() => {
                                                                        if (historySaveLimitTimerRef.current) {
                                                                            clearTimeout(historySaveLimitTimerRef.current);
                                                                            historySaveLimitTimerRef.current = null;
                                                                        }
                                                                        applyHistorySaveLimitInput(historySaveLimitInput);
                                                                        if (!historySaveLimitInput || Number.isNaN(Number.parseInt(historySaveLimitInput, 10))) {
                                                                            setHistorySaveLimitInput(String(historySaveLimit));
                                                                        }
                                                                    }}
                                                                    className={`w-20 text-xs rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300'
                                                                        : 'bg-white border-zinc-300 text-zinc-800'
                                                                        }`}
                                                                />
                                                                <span className="text-[10px] text-zinc-500">{uiText("条")}</span>
                                                            </div>
                                                        </div>
                                                        <p className="text-[9px] text-zinc-500">{t('影响历史持久化与打包范围，最大160条。')}</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex flex-col gap-1">
                                                            <span className={`text-xs ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{t('本地服务地址')}</span>
                                                            <input
                                                                type="text"
                                                                value={localServerUrl}
                                                                onChange={(e) => {
                                                                    const url = e.target.value;
                                                                    setLocalServerUrl(url);
                                                                    localStorage.setItem('tapnow_local_server_url', url);
                                                                }}
                                                                placeholder="http://127.0.0.1:9527"
                                                                className={`w-full text-xs rounded px-2 py-1 border outline-none ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300'}`}
                                                            />
                                                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                                                <span className={`inline-block w-2 h-2 rounded-full ${localCacheEnabled ? (localCacheServerConnected ? 'bg-green-500' : 'bg-red-500') : 'bg-zinc-400'}`} />
                                                                <span>
                                                                    {localCacheEnabled
                                                                        ? (localCacheServerConnected ? t('本地缓存已连接') : t('本地缓存未连接'))
                                                                        : t('本地缓存已关闭')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <p className="text-[9px] text-zinc-500 mt-1">{t('用于连接本地后端服务，支持大文件保存和处理。')}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border-t pt-3 border-zinc-700/50 space-y-2">
                                                <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('其他设置')}</label>
                                                <div className="mb-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                {t('界面语言')}
                                                            </label>
                                                            <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                                                {t('切换中文/英文')}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-3">
                                                            <button
                                                                onClick={() => handleLanguageChange('zh')}
                                                                className={`px-2 py-1 text-[10px] rounded border transition-colors ${language === 'zh'
                                                                    ? 'bg-blue-600 text-white border-blue-500'
                                                                    : theme === 'dark'
                                                                        ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                                                                        : 'bg-white text-zinc-600 border-zinc-300 hover:text-zinc-800'
                                                                    }`}
                                                            >
                                                                {t('中文')}
                                                            </button>
                                                            <button
                                                                onClick={() => handleLanguageChange('en')}
                                                                className={`px-2 py-1 text-[10px] rounded border transition-colors ${language === 'en'
                                                                    ? 'bg-blue-600 text-white border-blue-500'
                                                                    : theme === 'dark'
                                                                        ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                                                                        : 'bg-white text-zinc-600 border-zinc-300 hover:text-zinc-800'
                                                                    }`}
                                                            >
                                                                {t('英文')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mb-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                {t('撤销/重做步数')}
                                                            </label>
                                                            <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                                                {uiText("设置可撤销的最大步数 (粘贴图片、删除节点等操作)")}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 ml-3">
                                                            <input
                                                                type="range"
                                                                min="1"
                                                                max="30"
                                                                value={maxUndoSteps}
                                                                onChange={(e) => {
                                                                    const newValue = parseInt(e.target.value) || 5;
                                                                    setMaxUndoSteps(newValue);
                                                                    localStorage.setItem('tapnow_max_undo_steps', String(newValue));
                                                                }}
                                                                className="w-20"
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                            />
                                                            <span className={`text-xs font-mono w-6 text-center ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                                {maxUndoSteps}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mb-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                {t('即梦图生图使用本地文件')}
                                                            </label>
                                                            <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                                                {t('启用后，即梦模型的图生图功能将强制使用本地文件（FormData），URL图片会自动下载转换为本地文件')}
                                                            </p>
                                                        </div>
                                                        <label className="relative inline-flex items-center cursor-pointer ml-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={jimengUseLocalFile}
                                                                onChange={(e) => {
                                                                    const newValue = e.target.checked;
                                                                    setJimengUseLocalFile(newValue);
                                                                    localStorage.setItem('tapnow_jimeng_use_local_file', String(newValue));
                                                                }}
                                                                className="sr-only peer"
                                                            />
                                                            <div className={`w-11 h-6 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 ${jimengUseLocalFile
                                                                ? 'bg-blue-600'
                                                                : theme === 'dark'
                                                                    ? 'bg-zinc-700'
                                                                    : 'bg-zinc-300'
                                                                } peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all`}></div>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </details>

                                    <div className={`mx-4 mt-3 rounded-md border ${theme === 'dark'
                                        ? 'border-zinc-800 bg-[#18181b]'
                                        : theme === 'solarized'
                                            ? 'border-[#d7cfb2] bg-[#eee8d5]'
                                            : 'border-zinc-200 bg-white'
                                        }`}>
                                        <div className="px-3 py-3">
                                            <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('API 配置备份')}</label>
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    onClick={() => {
                                                        const exportData = {
                                                            version: '3.4.23',
                                                            exportTime: new Date().toISOString(),
                                                            globalApiKey,
                                                            providers,
                                                            modelLibrary,
                                                            modelLibraryCollapsed: Array.from(collapsedLibraryModels),
                                                            // V3.4.23: 导出时移除模型级别的 key/url，只保留纯净的配置
                                                            apiConfigs: apiConfigs.map(({ key, url, ...c }) => c),
                                                        };
                                                        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                                                        const url = URL.createObjectURL(blob);
                                                        const a = document.createElement('a');
                                                        a.href = url;
                                                        const now = new Date();
                                                        const yy = now.getFullYear().toString().slice(2);
                                                        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
                                                        const dd = now.getDate().toString().padStart(2, '0');
                                                        const hh = now.getHours().toString().padStart(2, '0');
                                                        const min = now.getMinutes().toString().padStart(2, '0');
                                                        a.download = `tapnow-api-keys-${yy}${mm}${dd}-${hh}${min}.json`;
                                                        a.click();
                                                        URL.revokeObjectURL(url);
                                                    }}
                                                    className={`flex-1 px-3 py-2 text-xs rounded flex items-center justify-center gap-2 transition-colors ${theme === 'dark'
                                                        ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30'
                                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                                                        }`}
                                                >
                                                    <Download size={14} />
                                                    {t('导出 API Keys')}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.accept = '.json';
                                                        input.onchange = async (e) => {
                                                            const file = e.target.files[0];
                                                            if (!file) return;
                                                            try {
                                                                const text = await file.text();
                                                                const data = JSON.parse(text);
                                                                if (data.globalApiKey) {
                                                                    setGlobalApiKey(data.globalApiKey);
                                                                    localStorage.setItem('tapnow_global_key', data.globalApiKey);
                                                                }
                                                                if (data.providers) {
                                                                    const normalized = Object.fromEntries(
                                                                        Object.entries(data.providers).map(([key, config]) => [key, normalizeProviderConfig(key, config)])
                                                                    );
                                                                    setProviders(prev => ({ ...prev, ...normalized }));
                                                                }
                                                                if (data.modelLibrary && Array.isArray(data.modelLibrary)) {
                                                                    const normalizedLibrary = data.modelLibrary
                                                                        .map((entry, idx) => normalizeModelLibraryEntry(entry, idx))
                                                                        .filter(Boolean);
                                                                    setModelLibrary(normalizedLibrary);
                                                                }
                                                                if (Array.isArray(data.modelLibraryCollapsed)) {
                                                                    const collapsedSet = new Set(data.modelLibraryCollapsed.filter(Boolean));
                                                                    collapsedLibraryStateLoadedRef.current = true;
                                                                    setCollapsedLibraryModels(collapsedSet);
                                                                    try {
                                                                        localStorage.setItem('tapnow_model_library_collapsed', JSON.stringify(Array.from(collapsedSet)));
                                                                    } catch (e) {
                                                                        console.error('保存模型库折叠状态失败:', e);
                                                                    }
                                                                }
                                                                if (data.apiConfigs && Array.isArray(data.apiConfigs)) {
                                                                    // V3.6.0: 迁移导入的旧格式配置
                                                                    const migratedConfigs = data.apiConfigs.map(config => {
                                                                        const normalized = {
                                                                            ...config,
                                                                            id: config.id || config.modelName,
                                                                            provider: config.provider,
                                                                            type: config.type || 'Chat',
                                                                            modelName: config.modelName || config.id,
                                                                            displayName: config.displayName || config.modelName || config.id,
                                                                            _uid: config._uid || `uid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                                                            ...(config.durations ? { durations: config.durations } : {})
                                                                        };
                                                                        const { key, url, isCustom, ...rest } = normalized;
                                                                        return rest;
                                                                    });
                                                                    // 直接替换，不合并
                                                                    setApiConfigs(migratedConfigs);
                                                                }
                                                                canvasAlert(t('API 配置导入成功！'));
                                                            } catch (err) {
                                                                canvasAlert(uiText("导入失败: ") + err.message);
                                                            }
                                                        };
                                                        input.click();
                                                    }}
                                                    className={`flex-1 px-3 py-2 text-xs rounded flex items-center justify-center gap-2 transition-colors ${theme === 'dark'
                                                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                                                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-300'
                                                        }`}
                                                >
                                                    <FolderOpen size={14} />
                                                    {t('导入 API Keys')}
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-zinc-500 mt-1">{t('导出包含：全局 Key、Provider 配置、模型库、所有模型配置（含 Key）')}</p>
                                        </div>
                                    </div>

                                    <div className={`mx-4 mt-3 rounded-md border ${theme === 'dark'
                                        ? 'border-zinc-800 bg-[#18181b]'
                                        : theme === 'solarized'
                                            ? 'border-[#d7cfb2] bg-[#eee8d5]'
                                            : 'border-zinc-200 bg-white'
                                        }`}>
                                        <div className="px-3 py-3">
                                            <label className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('API 运行状态管理')}</label>
                                            <div className="grid grid-cols-3 gap-2 mt-2">
                                                <button
                                                    onClick={() => {
                                                        setApiBlacklist({});
                                                        apiBlacklistRef.current = {};
                                                        canvasAlert(t('黑名单已清空'));
                                                    }}
                                                    className={`px-2 py-1.5 text-[10px] rounded flex items-center justify-center gap-1 transition-colors ${theme === 'dark'
                                                        ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30'
                                                        : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}
                                                >
                                                    <Ban size={12} />{t('清空黑名单')}
                                                    {Object.keys(apiBlacklist).length > 0 && <span className="ml-1 px-1 rounded bg-red-500/30 text-[9px]">{Object.keys(apiBlacklist).length}</span>}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setApiSuspendList({});
                                                        canvasAlert(t('暂停列表已清空'));
                                                    }}
                                                    className={`px-2 py-1.5 text-[10px] rounded flex items-center justify-center gap-1 transition-colors ${theme === 'dark'
                                                        ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/30'
                                                        : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'}`}
                                                >
                                                    <Clock size={12} />{t('清空暂停')}
                                                    {Object.keys(apiSuspendList).length > 0 && <span className="ml-1 px-1 rounded bg-amber-500/30 text-[9px]">{Object.keys(apiSuspendList).length}</span>}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        error1006WindowRef.current = [];
                                                        canvasAlert(t('熔断已重置'));
                                                    }}
                                                    className={`px-2 py-1.5 text-[10px] rounded flex items-center justify-center gap-1 transition-colors ${theme === 'dark'
                                                        ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30'
                                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'}`}
                                                >
                                                    <Zap size={12} />{t('重置熔断')}
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-zinc-500 mt-1">{t('黑名单 = 积分耗尽，暂停 = 临时错误（60分钟后自动恢复），熔断 = 短时大量1006错误保护')}</p>
                                        </div>
                                    </div>

                                    <div className={`mx-4 mt-3 rounded-md border ${theme === 'dark'
                                        ? 'border-zinc-800 bg-[#18181b]'
                                        : theme === 'solarized'
                                            ? 'border-[#d7cfb2] bg-[#eee8d5]'
                                            : 'border-zinc-200 bg-white'
                                        }`}>
                                        <div className={`px-3 py-2 text-xs font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                            {t('接口与模型列表')}
                                        </div>
                                        <div className="px-3 pb-3 pt-2">
                            <div className="flex justify-between items-center mb-2">
                                <span className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{t('管理您的第三方模型接口。')}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            // 切换全部：存在展开项时全部折叠，否则全部展开
                                            const hasExpanded = Object.values(expandedProviders).some(v => v);
                                            const newExpanded = {};
                                            if (!hasExpanded) {
                                                Object.keys(groupedApiConfigs).forEach(key => newExpanded[key] = true);
                                            }
                                            setExpandedProviders(newExpanded);
                                        }}
                                        className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}
                                        title={Object.values(expandedProviders).some(v => v) ? uiText("折叠所有") : uiText("展开所有")}
                                    >
                                        <ChevronsUp size={14} className={`transition-transform ${!Object.values(expandedProviders).some(v => v) ? 'rotate-180' : ''}`} />
                                    </button>
                                    <Button className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-500" onClick={() => {
                                        // V3.4.7: 添加供应商 - 自动创建并进入编辑模式
                                        const newKey = `custom-${Date.now()}`;
                                        const newName = 'New Provider';
                                        setProviders(prev => ({ ...prev, [newKey]: normalizeProviderConfig(newKey, { key: '', url: '', enabled: true }) }));
                                        setExpandedProviders(prev => ({ ...prev, [newKey]: true }));
                                        setEditingProvider({ key: newKey, tempName: newName });
                                    }}><Plus size={14} className="mr-1" /> {t('添加供应商')}</Button>
                                </div>
                            </div>
                                    <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                                        {/* V3.4.7：按供应商分组显示模型 */}
                                        {Object.entries(groupedApiConfigs).map(([providerKey, group]) => (
                                            <div key={providerKey} className={`group rounded-lg border ${theme === 'dark'
                                                ? 'bg-[#18181b] border-zinc-800'
                                                : theme === 'solarized'
                                                    ? 'bg-[#fdf6e3] border-[#d7cfb2]'
                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                                }`}>
                                        {/* 可折叠的供应商标题行 */}
                                        <button
                                            onClick={() => setExpandedProviders(prev => ({ ...prev, [providerKey]: !prev[providerKey] }))}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${theme === 'dark'
                                                ? 'hover:bg-zinc-800/50'
                                                : theme === 'solarized'
                                                    ? 'hover:bg-[#eee8d5]'
                                                    : 'hover:bg-zinc-100'
                                                }`}
                                        >
                                            {deletingProviderKey === providerKey ? (
                                                <div className="flex items-center justify-between w-full">
                                                    <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-800'}`}>
                                                        {uiText("确定删除") + " "}{group.name}?
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                // 删除供应商
                                                                setProviders(prev => {
                                                                    const next = { ...prev };
                                                                    delete next[providerKey];
                                                                    return next;
                                                                });
                                                                setDeletingProviderKey(null);
                                                            }}
                                                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                                                        >
                                                            {t('删除')}
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDeletingProviderKey(null);
                                                            }}
                                                            className={`text-xs px-2 py-1 rounded ${theme === 'dark' ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'}`}
                                                        >
                                                            {t('取消')}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <div className={`w-2 h-2 rounded-full ${providers[providerKey]?.enabled !== false ? 'bg-green-500' : 'bg-zinc-500'}`}></div>
                                                        {editingProvider?.key === providerKey ? (
                                                            <input
                                                                type="text"
                                                                value={editingProvider.tempName}
                                                                onChange={(e) => setEditingProvider(prev => ({ ...prev, tempName: e.target.value }))}
                                                                onBlur={() => {
                                                                    const newKey = editingProvider.tempName.trim();
                                                                    const oldKey = providerKey;
                                                                    if (newKey && newKey !== oldKey) {
                                                                        // V3.6.0: 重命名 provider key（不用 name 字段）
                                                                        setProviders(prev => {
                                                                            const { [oldKey]: oldConfig, ...rest } = prev;
                                                                            return { ...rest, [newKey]: oldConfig };
                                                                        });
                                                                        // 同步更新所有引用该 provider 的模型
                                                                        setApiConfigs(prev => prev.map(c =>
                                                                            c.provider === oldKey ? { ...c, provider: newKey } : c
                                                                        ));
                                                                    }
                                                                    setEditingProvider(null);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.target.blur();
                                                                    }
                                                                    e.stopPropagation();
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                autoFocus
                                                                className={`text-sm font-semibold bg-transparent border-b border-blue-500 outline-none w-full ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-800'}`}
                                                            />
                                                        ) : (
                                                            <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-800'}`}>{group.name}</span>
                                                        )}
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${theme === 'dark'
                                                            ? 'bg-zinc-800 text-zinc-500'
                                                            : theme === 'solarized'
                                                                ? 'bg-[#eee8d5] text-zinc-600'
                                                                : 'bg-zinc-200 text-zinc-500'}`}>
                                                            {group.models.length} {uiText("模型")}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {!editingProvider && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setEditingProvider({ key: providerKey, tempName: group.name });
                                                                    }}
                                                                    className={`p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100`}
                                                                    title={t('修改名称')}
                                                                >
                                                                    <Edit2 size={12} className={theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setDeletingProviderKey(providerKey);
                                                                    }}
                                                                    className={`p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100`}
                                                                    title={t('删除供应商')}
                                                                >
                                                                    <Trash2 size={12} className={theme === 'dark' ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-500 hover:text-red-500'} />
                                                                </button>
                                                            </>
                                                        )}
                                                        <ChevronDown size={16} className={`transition-transform ${expandedProviders[providerKey] ? 'rotate-180' : ''} ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                                                    </div>
                                                </>
                                            )}
                                        </button>

                                        {/* 供应商展开内容 */}
                                        {expandedProviders[providerKey] && (
                                            <div className={`px-3 pb-3 border-t ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                                                {/* 供应商级别设置 */}
                                                <div className="pt-3 pb-2 space-y-2">
                                                    <div className="grid grid-cols-4 items-center gap-2">
                                                        <label className={`text-[10px] font-medium uppercase tracking-wider text-right ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('接口类型')}</label>
                                                        <select
                                                            value={providers[providerKey]?.apiType || 'openai'}
                                                            onChange={(e) => setProviders(prev => ({ ...prev, [providerKey]: { ...prev[providerKey], apiType: e.target.value } }))}
                                                            className={`col-span-3 w-full rounded px-2 py-1 text-xs outline-none focus:border-blue-600/50 border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                                        >
                                                            <option value="openai">OpenAI</option>
                                                            <option value="gemini">Gemini</option>
                                                            <option value="modelscope">ModelScope</option>
                                                        </select>
                                                    </div>
                                                    <div className="grid grid-cols-4 items-center gap-2">
                                                        <label className={`text-[10px] font-medium uppercase tracking-wider text-right ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('本地代理')}</label>
                                                        <div className="col-span-3 flex items-center gap-2">
                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!providers[providerKey]?.useProxy}
                                                                    onChange={(e) => setProviders(prev => ({ ...prev, [providerKey]: { ...prev[providerKey], useProxy: e.target.checked } }))}
                                                                    className="sr-only peer"
                                                                />
                                                                <div className={`w-9 h-5 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 ${providers[providerKey]?.useProxy
                                                                    ? 'bg-blue-600'
                                                                    : theme === 'dark'
                                                                        ? 'bg-zinc-700'
                                                                        : 'bg-zinc-300'
                                                                    } peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                                                            </label>
                                                            <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{uiText("使用") + " "}{localServerUrl || 'http://127.0.0.1:9527'}/proxy</span>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-4 items-center gap-2">
                                                        <label className={`text-[10px] font-medium uppercase tracking-wider text-right ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('异步模式')}</label>
                                                        <div className="col-span-3 flex items-center gap-2">
                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!providers[providerKey]?.forceAsync}
                                                                    onChange={(e) => setProviders(prev => ({ ...prev, [providerKey]: { ...prev[providerKey], forceAsync: e.target.checked } }))}
                                                                    className="sr-only peer"
                                                                />
                                                                <div className={`w-9 h-5 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/50 ${providers[providerKey]?.forceAsync
                                                                    ? 'bg-blue-600'
                                                                    : theme === 'dark'
                                                                        ? 'bg-zinc-700'
                                                                        : 'bg-zinc-300'
                                                                    } peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                                                            </label>
                                                            <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('ModelScope 建议开启')}</span>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-4 items-center gap-2">
                                                        <label className={`text-[10px] font-medium uppercase tracking-wider text-right ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>API Key</label>
                                                        <input
                                                            type="password"
                                                            value={providers[providerKey]?.key || ''}
                                                            onChange={(e) => setProviders(prev => ({ ...prev, [providerKey]: { ...prev[providerKey], key: e.target.value } }))}
                                                            className={`col-span-3 w-full rounded px-2 py-1 text-xs outline-none focus:border-blue-600/50 border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                                            placeholder="sk-..."
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-4 items-center gap-2">
                                                        <label className={`text-[10px] font-medium uppercase tracking-wider text-right ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>Base URL</label>
                                                        <input
                                                            type="text"
                                                            value={providers[providerKey]?.url || ''}
                                                            onChange={(e) => setProviders(prev => ({ ...prev, [providerKey]: { ...prev[providerKey], url: e.target.value } }))}
                                                            className={`col-span-3 w-full rounded px-2 py-1 text-xs outline-none focus:border-blue-600/50 border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                                            placeholder="https://..."
                                                        />
                                                    </div>
                                                </div>

                                                {/* 该供应商下的模型列表 */}
                                                <div className={`mt-2 pt-2 border-t ${theme === 'dark' ? 'border-zinc-800/50' : 'border-zinc-200'}`}>

                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('模型')}</div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => importApiModelConfigs(providerKey)}
                                                                className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'}`}
                                                            >
                                                                <UploadCloud size={10} /> {t('导入模型')}
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const newId = `${providerKey}-${Date.now()}`;
                                                                    const uid = `uid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                                                    setApiConfigs(prev => [...prev, {
                                                                        id: newId,
                                                                        provider: providerKey,
                                                                        type: 'Chat',
                                                                        _uid: uid
                                                                    }]);
                                                                    setApiModelEditing(uid, true);
                                                                }}
                                                                className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'}`}
                                                            >
                                                                <Plus size={10} /> {t('添加模型')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        {group.models.map(api => {
                                                            const isEditing = editingApiModels.has(api._uid);
                                                            const libraryLabel = api.libraryId
                                                                ? (modelLibraryMap.get(api.libraryId)?.displayName
                                                                    || modelLibraryMap.get(api.libraryId)?.modelName
                                                                    || api.libraryId)
                                                                : '';
                                                            const resolvedApiType = api.apiType || providers[providerKey]?.apiType || 'openai';
                                                            const statusKey = api._uid || api.id;
                                                            return (
                                                                <div key={api._uid} className={`flex flex-col gap-2 px-2 py-2 rounded ${theme === 'dark'
                                                                    ? 'bg-zinc-900/50 hover:bg-zinc-800/50'
                                                                    : theme === 'solarized'
                                                                        ? 'bg-[#fdf6e3] hover:bg-[#eee8d5]'
                                                                        : 'bg-white hover:bg-zinc-100'
                                                                    }`}>
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="flex flex-wrap items-center gap-2 flex-1">
                                                                            <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(api._uid)}`}></div>
                                                                            <input
                                                                                type="text"
                                                                                value={api.id || ''}
                                                                                onChange={(e) => updateApiConfig(api._uid, { id: e.target.value })}
                                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className={`text-xs bg-transparent border-b border-transparent hover:border-zinc-600 focus:border-blue-500 outline-none flex-1 min-w-[120px] font-mono ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}
                                                                                placeholder="model-id"
                                                                                title={uiText("模型 ID: {0}", api.id)}
                                                                                disabled={!isEditing}
                                                                            />
                                                                            <select
                                                                                value={api.type || 'Chat'}
                                                                                onChange={(e) => updateApiConfig(api._uid, { type: e.target.value })}
                                                                                className={`text-[9px] px-1 py-0.5 rounded cursor-pointer outline-none ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300'}`}
                                                                                disabled={!isEditing || !!api.libraryId}
                                                                            >
                                                                                <option value="Chat">Chat</option>
                                                                                <option value="Image">Image</option>
                                                                                <option value="ChatImage">Chat Image</option>
                                                                                <option value="Video">Video</option>
                                                                            </select>
                                                                            <select
                                                                                value={api.libraryId || ''}
                                                                                onChange={(e) => {
                                                                                    const selectedId = e.target.value || null;
                                                                                    const selected = selectedId ? modelLibraryMap.get(selectedId) : null;
                                                                                    const updates = { libraryId: selectedId };
                                                                                    if (selected) {
                                                                                        updates.modelName = selected.modelName;
                                                                                        updates.displayName = selected.displayName;
                                                                                        updates.type = selected.type || api.type;
                                                                                        updates.apiType = selected.apiType || api.apiType;
                                                                                        updates.ratioLimits = Array.isArray(selected.ratioLimits) ? selected.ratioLimits : null;
                                                                                        updates.resolutionLimits = Array.isArray(selected.resolutionLimits) ? selected.resolutionLimits : null;
                                                                                        updates.durations = Array.isArray(selected.durations) ? selected.durations : null;
                                                                                        updates.videoResolutions = Array.isArray(selected.videoResolutions) ? selected.videoResolutions : null;
                                                                                    }
                                                                                    updateApiConfig(api._uid, updates);
                                                                                }}
                                                                                className={`text-[9px] px-1 py-0.5 rounded cursor-pointer outline-none min-w-[120px] ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300'}`}
                                                                                disabled={!isEditing}
                                                                            >
                                                                                <option value="">{t('不引用模型库')}</option>
                                                                                {modelLibrary.map((entry) => (
                                                                                    <option key={entry.id} value={entry.id}>{entry.displayName || entry.modelName || entry.id}</option>
                                                                                ))}
                                                                            </select>
                                                                            <select
                                                                                value={api.apiType || ''}
                                                                                onChange={(e) => updateApiConfig(api._uid, { apiType: e.target.value || null })}
                                                                                className={`text-[9px] px-1 py-0.5 rounded cursor-pointer outline-none ${theme === 'dark' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300'}`}
                                                                                disabled={!isEditing || !!api.libraryId}
                                                                            >
                                                                                <option value="">{t('跟随 Provider')}</option>
                                                                                <option value="openai">OpenAI</option>
                                                                                <option value="gemini">Gemini</option>
                                                                                <option value="modelscope">ModelScope</option>
                                                                            </select>
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <button
                                                                                onClick={() => exportApiModelConfig(api)}
                                                                                className={`px-1.5 py-0.5 rounded text-[9px] ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                title={t('导出该模型')}
                                                                            >
                                                                                <Download size={10} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setApiModelEditing(api._uid, !isEditing)}
                                                                                className={`px-1.5 py-0.5 rounded text-[9px] ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                title={isEditing ? t('完成编辑') : t('编辑')}
                                                                            >
                                                                                {isEditing ? <Check size={10} /> : <Pencil size={10} />}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => testApiConnection(statusKey)}
                                                                                disabled={apiTesting === statusKey}
                                                                                className={`px-1.5 py-0.5 rounded text-[9px] ${apiStatus[statusKey] === 'success' ? 'text-green-500' : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                            >
                                                                                {apiTesting === statusKey ? <Loader2 size={10} className="animate-spin" /> : apiStatus[statusKey] === 'success' ? <CheckCircle2 size={10} /> : <LinkIcon size={10} />}
                                                                            </button>
                                                                            <button onClick={() => deleteApiConfig(api._uid)} className={`px-1 ${theme === 'dark' ? 'text-zinc-600 hover:text-red-500' : 'text-zinc-400 hover:text-red-500'}`}>
                                                                                <Trash2 size={10} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className={`flex flex-wrap items-center gap-2 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                                                        <span>{t('模型库：')}{api.libraryId ? libraryLabel : t('未引用')}</span>
                                                                        <span>{t('API模型：')}{api.modelName || api.id}</span>
                                                                        <span>{t('接口：')}{resolvedApiType}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {settingsTab === 'library' && (
                                <div className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className={`text-xs font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{t('模型库')}</div>
                                            <p className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>{t('统一维护模型能力与限制，供应商模型可直接引用。')}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => importModelLibraryEntries()}
                                                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 ${theme === 'dark' ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'}`}
                                            >
                                                <UploadCloud size={10} /> {t('导入模型')}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (hasExpandedLibraryModels) {
                                                        setCollapsedLibraryModels(new Set(modelLibrary.map(entry => entry.id)));
                                                    } else {
                                                        setCollapsedLibraryModels(new Set());
                                                    }
                                                }}
                                                className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}
                                                title={hasExpandedLibraryModels ? t('全部折叠') : t('全部展开')}
                                            >
                                                <ChevronsUp size={14} className={`transition-transform ${!hasExpandedLibraryModels ? 'rotate-180' : ''}`} />
                                            </button>
                                            <button
                                                onClick={addModelLibraryEntry}
                                                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 ${theme === 'dark' ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'}`}
                                            >
                                                <Plus size={10} /> {t('添加模型')}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                                        {modelLibrary.map((entry) => {
                                            const isEditing = editingLibraryModels.has(entry.id);
                                            const isCollapsed = collapsedLibraryModels.has(entry.id);
                                            const isPreviewOpen = libraryPreviewModels.has(entry.id);
                                            const ratioAll = entry.ratioLimits === null;
                                            const ratioValues = Array.isArray(entry.ratioLimits) ? entry.ratioLimits : [];
                                            const ratioDefaultOptions = Array.from(new Set(
                                                (ratioValues.length > 0 ? ratioValues : getDefaultRatiosForModel(entry.modelName || entry.id))
                                                    .map((value) => String(value || '').trim())
                                                    .filter((value) => value && value !== 'Auto')
                                            ));
                                            const ratioNotes = entry.ratioNotes || {};
                                            const ratioNotesEnabled = !!entry.ratioNotesEnabled;
                                            const resolutionValues = Array.isArray(entry.resolutionLimits) ? entry.resolutionLimits : [];
                                            const imageResolutionDefaultOptions = Array.from(new Set(
                                                (resolutionValues.length > 0 ? resolutionValues : getDefaultResolutionsForModel(entry.modelName || entry.id))
                                                    .map((value) => normalizeResolutionOption(value))
                                                    .filter((value) => value && value !== 'Auto')
                                            ));
                                            const resolutionNotes = normalizeResolutionNotes(entry.resolutionNotes);
                                            const resolutionNotesEnabled = !!entry.resolutionNotesEnabled;
                                            const durationValues = Array.isArray(entry.durations) ? entry.durations : [];
                                            const durationDefaultOptions = Array.from(new Set(
                                                (durationValues.length > 0 ? durationValues : getDefaultDurationsForModel(entry.modelName || entry.id))
                                                    .map((value) => {
                                                        const trimmed = String(value || '').trim();
                                                        if (!trimmed) return '';
                                                        return trimmed.endsWith('s') ? trimmed : `${trimmed}s`;
                                                    })
                                                    .filter(Boolean)
                                            ));
                                            const durationNotes = entry.durationNotes || {};
                                            const durationNotesEnabled = !!entry.durationNotesEnabled;
                                            const videoResolutionValues = Array.isArray(entry.videoResolutions) ? entry.videoResolutions : [];
                                            const videoResolutionDefaultOptions = Array.from(new Set(
                                                (videoResolutionValues.length > 0 ? videoResolutionValues : getVideoResolutionsForModel(entry.modelName || entry.id))
                                                    .map((value) => normalizeVideoResolution(value))
                                                    .filter((value) => value && value !== 'Auto')
                                            ));
                                            const videoResolutionNotes = entry.videoResolutionNotes || {};
                                            const videoResolutionNotesEnabled = !!entry.videoResolutionNotesEnabled;
                                            const customParams = Array.isArray(entry.customParams) ? entry.customParams : [];
                                            const requestTemplateValue = normalizeRequestTemplate(entry.requestTemplate || getDefaultRequestTemplateForEntry(entry));
                                            const requestTemplateEnabled = requestTemplateValue?.enabled !== false;
                                            const requestOverridePatch = normalizeRequestOverridePatch(entry.requestOverridePatch);
                                            const previewBase = {
                                                model: entry.modelName || entry.id,
                                                type: entry.type || 'Chat',
                                                apiType: entry.apiType || 'openai'
                                            };
                                            if (isImageModelType(entry.type)) {
                                                previewBase.ratio = entry.defaultRatio || ratioDefaultOptions[0] || '1:1';
                                                previewBase.size = entry.defaultResolution || imageResolutionDefaultOptions[0] || '2K';
                                            }
                                            if (entry.type === 'Video') {
                                                previewBase.ratio = entry.defaultRatio || ratioDefaultOptions[0] || '16:9';
                                                previewBase.duration = entry.defaultDuration || durationDefaultOptions[0] || '5s';
                                                previewBase.resolution = entry.defaultVideoResolution || videoResolutionDefaultOptions[0] || '720P';
                                            }
                                            const previewPayloadBase = buildCustomParamPreviewPayload(previewBase, customParams);
                                            const previewOverridePatch = normalizePreviewOverridePatch(entry.previewOverridePatch);
                                            const previewPayload = entry.previewOverrideEnabled && previewOverridePatch
                                                ? applyPreviewOverridePatch({ ...previewPayloadBase }, previewOverridePatch)
                                                : previewPayloadBase;
                                            const previewEndpoint = getModelLibraryPreviewEndpoint(entry);
                                            const previewPython = buildPythonPreviewSnippet(previewEndpoint, previewPayload);
                                            const isPreviewEditing = libraryPreviewEditing.has(entry.id);
                                            const previewDraft = libraryPreviewDrafts[entry.id] || '';
                                            const requestPreviewVars = (() => {
                                                const vars = {
                                                    modelName: entry.modelName || entry.id,
                                                    prompt: '示例提示词',
                                                    ratio: entry.omitRatioOnSubmit ? '' : (previewBase.ratio || '1:1'),
                                                    resolution: entry.omitResolutionOnSubmit ? '' : (previewBase.resolution || previewBase.size || '2K'),
                                                    size: (entry.omitRatioOnSubmit || entry.omitResolutionOnSubmit) ? '' : (previewBase.size || previewBase.resolution || '2K'),
                                                    duration: entry.omitDurationOnSubmit ? '' : (previewBase.duration || '5'),
                                                    durationNumber: entry.omitDurationOnSubmit ? undefined : normalizeDurationValue(previewBase.duration || '5', 5),
                                                    provider: {
                                                        key: 'API_KEY',
                                                        baseUrl: 'https://api.example.com'
                                                    },
                                                    messages: [
                                                        { role: 'system', content: '你是一名多模态AI助手。' },
                                                        { role: 'user', content: [{ type: 'text', text: '示例提示词' }] }
                                                    ],
                                                    imageUrl: 'https://example.com/image.png',
                                                    imageDataUrl: 'data:image/png;base64,PLACEHOLDER'
                                                };
                                                vars.imageUrl1 = vars.imageUrl;
                                                vars.imageUrl2 = vars.imageUrl;
                                                vars.image1Url = vars.imageUrl;
                                                vars.image2Url = vars.imageUrl;
                                                vars.imageUrls = [vars.imageUrl];
                                                vars.imagesUrl = vars.imageUrls;
                                                vars.imagesUrls = vars.imageUrls;
                                                if (customParams.length > 0) {
                                                    customParams.forEach((param) => {
                                                        const name = String(param?.name || '').trim();
                                                        if (!name) return;
                                                        if (INTERNAL_CUSTOM_PARAM_NAMES.has(name)) return;
                                                        const value = Array.isArray(param.values) && param.values.length > 0 ? param.values[0] : '';
                                                        if (!value) return;
                                                        vars[name] = value;
                                                    });
                                                }
                                                return vars;
                                            })();
                                            const requestPreviewBase = requestTemplateValue
                                                ? buildRequestFromTemplate(requestTemplateValue, requestPreviewVars, { bodyType: requestTemplateValue.bodyType })
                                                : null;
                                            const requestPreviewFinal = requestPreviewBase && entry.requestOverrideEnabled && requestOverridePatch
                                                ? applyRequestOverridePatch({ ...requestPreviewBase }, requestOverridePatch)
                                                : requestPreviewBase;
                                            const requestPreviewDisplay = formatRequestPreview(requestPreviewFinal);
                                            const isRequestPreviewEditing = libraryRequestPreviewEditing.has(entry.id);
                                            const requestPreviewDraft = libraryRequestPreviewDrafts[entry.id]
                                                || (requestPreviewDisplay ? JSON.stringify(requestPreviewDisplay, null, 2) : '');
                                            const requestTemplateDraft = libraryRequestTemplateDrafts[entry.id] || {
                                                headers: JSON.stringify(requestTemplateValue?.headers || {}, null, 2),
                                                body: requestTemplateValue?.bodyType === 'raw'
                                                    ? String(requestTemplateValue?.body ?? '')
                                                    : JSON.stringify(requestTemplateValue?.body || {}, null, 2),
                                                query: JSON.stringify(requestTemplateValue?.query || {}, null, 2),
                                                files: JSON.stringify(requestTemplateValue?.files || {}, null, 2),
                                                timeoutMs: requestTemplateValue?.timeoutMs ?? '',
                                                responseParser: requestTemplateValue?.responseParser || ''
                                            };
                                            const transportModeValue = normalizeTransportMode(entry.transport);
                                            const transportOptionsValue = normalizeTransportOptions(entry.transportOptions);
                                            const transportOptionsDraft = libraryTransportOptionsDrafts[entry.id]
                                                || JSON.stringify(transportOptionsValue, null, 2);
                                            const capabilitiesValue = normalizeCapabilitySchema(entry.capabilities, entry.type);
                                            const contractIssues = modelLibraryContractIssuesById[entry.id] || [];
                                            const contractErrors = contractIssues.filter(issue => issue.level === 'error');
                                            const asyncConfigValue = normalizeAsyncConfig(entry.asyncConfig);
                                            const asyncConfigEnabled = !!asyncConfigValue?.enabled;
                                            const asyncConfigDraft = libraryAsyncConfigDrafts[entry.id] || (
                                                asyncConfigValue
                                                    ? JSON.stringify(asyncConfigValue, null, 2)
                                                    : ASYNC_CONFIG_TEMPLATE_TEXT
                                            );
                                            const requestChainValue = normalizeRequestChain(entry.requestChain);
                                            const requestChainDraft = libraryRequestChainDrafts[entry.id] || (
                                                requestChainValue
                                                    ? JSON.stringify(requestChainValue, null, 2)
                                                    : REQUEST_CHAIN_TEMPLATE_TEXT
                                            );
                                            const isAsyncPreviewOpen = libraryAsyncPreviewModels.has(entry.id);
                                            const isRequestTemplateCollapsed = isLibrarySectionCollapsed(entry.id, 'request-template');
                                            const isAsyncSectionCollapsed = isLibrarySectionCollapsed(entry.id, 'async-task');
                                            const asyncPreviewVars = {
                                                requestId: 'REQUEST_ID',
                                                prompt: '示例提示词',
                                                provider: { key: 'API_KEY', baseUrl: 'https://api.example.com' }
                                            };
                                            const asyncStatusPreviewRaw = asyncConfigValue?.statusRequest
                                                ? buildRequestFromTemplate(asyncConfigValue.statusRequest, asyncPreviewVars, { bodyType: asyncConfigValue.statusRequest.bodyType })
                                                : null;
                                            const asyncStatusPreview = formatRequestPreview(asyncStatusPreviewRaw);
                                            const asyncOutputsPreviewRaw = asyncConfigValue?.outputsRequest
                                                ? buildRequestFromTemplate(asyncConfigValue.outputsRequest, asyncPreviewVars, { bodyType: asyncConfigValue.outputsRequest.bodyType })
                                                : null;
                                            const asyncOutputsPreview = formatRequestPreview(asyncOutputsPreviewRaw);
                                            const updateRequestTemplate = (updates) => {
                                                const nextTemplate = normalizeRequestTemplate({
                                                    ...(requestTemplateValue || getDefaultRequestTemplateForEntry(entry)),
                                                    ...updates
                                                });
                                                updateModelLibraryEntry(entry.id, { requestTemplate: nextTemplate });
                                            };
                                            return (
                                                <div key={entry.id} className={`rounded-lg border p-3 space-y-3 ${theme === 'dark'
                                                    ? 'bg-[#18181b] border-zinc-800'
                                                    : theme === 'solarized'
                                                        ? 'bg-[#fdf6e3] border-[#d7cfb2]'
                                                        : 'bg-white border-zinc-200'
                                                    }`}>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex flex-col gap-1 flex-1">
                                                            <div className="flex items-center gap-2 w-full">
                                                                <div className={`text-xs font-medium ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>
                                                                    {entry.displayName || entry.modelName || entry.id}
                                                                </div>
                                                                <div className="ml-auto flex items-center justify-end">
                                                                    {isEditing ? (
                                                                        <select
                                                                            value={entry.type || 'Chat'}
                                                                            onChange={(e) => {
                                                                                const nextType = e.target.value;
                                                                                updateModelLibraryEntry(entry.id, {
                                                                                    type: nextType,
                                                                                    capabilities: normalizeCapabilitySchema(entry.capabilities, nextType)
                                                                                });
                                                                            }}
                                                                            className={`text-[9px] px-1 py-0.5 rounded border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
                                                                                : 'bg-white border-zinc-300 text-zinc-700'
                                                                                }`}
                                                                            disabled={!isEditing}
                                                                        >
                                                                            <option value="Chat">Chat</option>
                                                                            <option value="Image">Image</option>
                                                                            <option value="ChatImage">Chat Image</option>
                                                                            <option value="Video">Video</option>
                                                                        </select>
                                                                    ) : (
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${theme === 'dark'
                                                                            ? 'bg-zinc-800 text-zinc-300'
                                                                            : theme === 'solarized'
                                                                                ? 'bg-[#eee8d5] text-zinc-600'
                                                                                : 'bg-zinc-100 text-zinc-600'
                                                                            }`}>
                                                                            {entry.type || 'Chat'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                                                {t('系统调用模型ID：')}{entry.modelName || entry.id}
                                                            </div>
                                                            {contractIssues.length > 0 && (
                                                                <div className={`text-[9px] ${contractErrors.length > 0 ? 'text-amber-500' : 'text-blue-500'}`}>
                                                                    {t('配置校验：')} {contractErrors.length > 0 ? t('存在阻断项') : t('存在提示项')} · {contractIssues[0]?.message}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => toggleLibraryPreview(entry.id)}
                                                                className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                title={isPreviewOpen ? t('隐藏请求预览') : t('查看请求预览')}
                                                            >
                                                                <Code size={12} className={isPreviewOpen ? 'text-blue-500' : ''} />
                                                            </button>
                                                            <button
                                                                onClick={() => duplicateModelLibraryEntry(entry.id)}
                                                                className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                title={t('复制模型')}
                                                            >
                                                                <CopyPlus size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => toggleLibraryModelCollapse(entry.id)}
                                                                className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                title={isCollapsed ? t('展开') : t('折叠')}
                                                            >
                                                                <ChevronDown size={12} className={`transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                                                            </button>
                                                            <button
                                                                onClick={() => exportModelLibraryEntry(entry)}
                                                                className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                title={t('导出该模型')}
                                                            >
                                                                <Download size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => setLibraryModelEditing(entry.id, !isEditing)}
                                                                className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                title={isEditing ? t('完成编辑') : t('编辑')}
                                                            >
                                                                {isEditing ? <Check size={12} /> : <Pencil size={12} />}
                                                            </button>
                                                            <button
                                                                onClick={() => deleteModelLibraryEntry(entry.id)}
                                                                className={`p-1 ${theme === 'dark' ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-400 hover:text-red-500'}`}
                                                                title={t('删除')}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {!isCollapsed && (
                                                        <>
                                                            <div className="grid grid-cols-12 gap-2 items-end">
                                                                <div className="col-span-5 space-y-1">
                                                                    <label className={`text-[9px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('显示名（仅展示）')}</label>
                                                                    <input
                                                                        className={`w-full text-xs rounded px-2 py-1 border outline-none ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                                                        value={entry.displayName || ''}
                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { displayName: e.target.value })}
                                                                        placeholder={t('例如：香蕉')}
                                                                        disabled={!isEditing}
                                                                    />
                                                                </div>
                                                                <div className="col-span-5 space-y-1">
                                                                    <label className={`text-[9px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('模型ID（系统调用）')}</label>
                                                                    <input
                                                                        className={`w-full text-xs rounded px-2 py-1 border outline-none ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                                                        value={entry.modelName || ''}
                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { modelName: e.target.value })}
                                                                        placeholder={t('例如：gemini-3-pro-image-preview')}
                                                                        disabled={!isEditing}
                                                                    />
                                                                </div>
                                                                <div className="col-span-2 space-y-1">
                                                                    <label className={`text-[9px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('接口类型')}</label>
                                                                    <select
                                                                        value={entry.apiType || 'openai'}
                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { apiType: e.target.value })}
                                                                        className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                                                        disabled={!isEditing}
                                                                    >
                                                                        <option value="openai">OpenAI</option>
                                                                        <option value="gemini">Gemini</option>
                                                                        <option value="modelscope">ModelScope</option>
                                                                    </select>
                                                                </div>
                                                            </div>

                                                            {isImageModelType(entry.type) && (
                                                                <div className="grid grid-cols-12 gap-2 items-end mt-2">
                                                                    <div className="col-span-3 space-y-1">
                                                                        <label className={`text-[9px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('图像路由')}</label>
                                                                        <select
                                                                            value={normalizeImageRouteMode(entry.imageRouteMode)}
                                                                            onChange={(e) => updateModelLibraryEntry(entry.id, { imageRouteMode: normalizeImageRouteMode(e.target.value) })}
                                                                            className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                                                            disabled={!isEditing}
                                                                        >
                                                                            <option value="auto">{t('自动（接图走Edit）')}</option>
                                                                            <option value="t2i">{t('仅Text-to-Image')}</option>
                                                                            <option value="edit">{t('仅Edit')}</option>
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {isImageModelType(entry.type) && (
                                                                <>
                                                                <div className="grid grid-cols-12 gap-2">
                                                                    <div className="col-span-6">
                                                                        <TagListEditor
                                                                            label={t('图片比例')}
                                                                            values={ratioValues}
                                                                            onChange={(values) => {
                                                                                const nextNotes = { ...ratioNotes };
                                                                                Object.keys(nextNotes).forEach((key) => {
                                                                                    if (!values.includes(key)) delete nextNotes[key];
                                                                                });
                                                                                const updates = { ratioLimits: values, ratioNotes: nextNotes };
                                                                                if (entry.defaultRatio && values.length > 0 && !values.includes(entry.defaultRatio)) {
                                                                                    updates.defaultRatio = '';
                                                                                }
                                                                                updateModelLibraryEntry(entry.id, updates);
                                                                            }}
                                                                            placeholder={t('例：1:1,16:9')}
                                                                            disabled={!isEditing}
                                                                            inputDisabled={!isEditing || ratioAll}
                                                                            theme={theme}
                                                                            allowAllLabel={t('全比例')}
                                                                            allowAll={ratioAll}
                                                                            allLabelPosition="left"
                                                                            onToggleAll={(checked) => updateModelLibraryEntry(entry.id, { ratioLimits: checked ? null : [] })}
                                                                            headerLeft={(
                                                                                <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={!!entry.omitRatioOnSubmit}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { omitRatioOnSubmit: e.target.checked })}
                                                                                        disabled={!isEditing}
                                                                                        className="w-3 h-3"
                                                                                    />
                                                                                    <span>{t('禁用')}</span>
                                                                                </label>
                                                                            )}
                                                                            headerRight={(
                                                                                <div className="flex items-center gap-1">
                                                                                    <select
                                                                                        value={entry.defaultRatio || ''}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { defaultRatio: e.target.value })}
                                                                                        disabled={!isEditing}
                                                                                        className={`text-[9px] rounded px-1 py-0.5 border outline-none w-[76px] ${theme === 'dark'
                                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                                            }`}
                                                                                    >
                                                                                        <option value="">{t('默认参数')}</option>
                                                                                        {ratioDefaultOptions.map((value) => (
                                                                                            <option key={value} value={value}>{getValueLabelWithNotes(value, ratioNotesEnabled, ratioNotes)}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            )}
                                                                            formatItem={(value) => getValueLabelWithNotes(value, ratioNotesEnabled, ratioNotes)}
                                                                        />
                                                                        {ratioValues.length > 0 && (
                                                                            <div className="mt-1 space-y-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('映射提示名')}</div>
                                                                                    <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={ratioNotesEnabled}
                                                                                            onChange={(e) => updateModelLibraryEntry(entry.id, { ratioNotesEnabled: e.target.checked })}
                                                                                            disabled={!isEditing}
                                                                                        />
                                                                                        <span>{t('启用')}</span>
                                                                                    </label>
                                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('仅用于辅助选择')}</span>
                                                                                    <button
                                                                                        onClick={() => toggleLibraryNotesCollapsed(entry.id, 'ratio')}
                                                                                        className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                        title={isLibraryNotesCollapsed(entry.id, 'ratio') ? t('展开提示') : t('折叠提示')}
                                                                                    >
                                                                                        <ChevronDown size={12} className={`transition-transform ${isLibraryNotesCollapsed(entry.id, 'ratio') ? '' : 'rotate-180'}`} />
                                                                                    </button>
                                                                                </div>
                                                                                {ratioNotesEnabled && !isLibraryNotesCollapsed(entry.id, 'ratio') && ratioValues.map((value) => (
                                                                                    <div key={value} className="flex items-center gap-2">
                                                                                        <span className={`text-[9px] w-24 truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`} title={value}>{value}</span>
                                                                                        <input
                                                                                            value={ratioNotes[value] || ''}
                                                                                            onChange={(e) => {
                                                                                                const nextNotes = { ...ratioNotes };
                                                                                                const noteValue = e.target.value;
                                                                                                if (noteValue) {
                                                                                                    nextNotes[value] = noteValue;
                                                                                                } else {
                                                                                                    delete nextNotes[value];
                                                                                                }
                                                                                                updateModelLibraryEntry(entry.id, { ratioNotes: nextNotes });
                                                                                            }}
                                                                                            placeholder={t('例：1:1 / 竖屏')}
                                                                                            disabled={!isEditing}
                                                                                            className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                                }`}
                                                                                        />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="col-span-6">
                                                                        <TagListEditor
                                                                            label={t('图片分辨率')}
                                                                            values={resolutionValues}
                                                                            onChange={(values) => {
                                                                                const nextNotes = { ...resolutionNotes };
                                                                                Object.keys(nextNotes).forEach((key) => {
                                                                                    if (!values.includes(key)) delete nextNotes[key];
                                                                                });
                                                                                const updates = { resolutionLimits: values, resolutionNotes: nextNotes };
                                                                                if (entry.defaultResolution && values.length > 0 && !values.includes(entry.defaultResolution)) {
                                                                                    updates.defaultResolution = '';
                                                                                }
                                                                                updateModelLibraryEntry(entry.id, updates);
                                                                            }}
                                                                            placeholder={t('例：1K,2K,4K')}
                                                                            disabled={!isEditing}
                                                                            theme={theme}
                                                                            headerLeft={(
                                                                                <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={!!entry.omitResolutionOnSubmit}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { omitResolutionOnSubmit: e.target.checked })}
                                                                                        disabled={!isEditing}
                                                                                        className="w-3 h-3"
                                                                                    />
                                                                                    <span>{t('禁用')}</span>
                                                                                </label>
                                                                            )}
                                                                            headerRight={(
                                                                                <div className="flex items-center gap-1">
                                                                                    <select
                                                                                        value={entry.defaultResolution || ''}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { defaultResolution: e.target.value })}
                                                                                        disabled={!isEditing}
                                                                                        className={`text-[9px] rounded px-1 py-0.5 border outline-none w-[76px] ${theme === 'dark'
                                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                                            }`}
                                                                                    >
                                                                                        <option value="">{t('默认参数')}</option>
                                                                                        {imageResolutionDefaultOptions.map((value) => (
                                                                                            <option key={value} value={value}>{getValueLabelWithNotes(value, resolutionNotesEnabled, resolutionNotes)}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            )}
                                                                            normalizeItem={(value) => normalizeResolutionOption(value)}
                                                                            formatItem={(value) => getValueLabelWithNotes(value, resolutionNotesEnabled, resolutionNotes)}
                                                                        />
                                                                        {resolutionValues.length > 0 && (
                                                                            <div className="mt-1 space-y-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('映射提示名')}</div>
                                                                                    <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={resolutionNotesEnabled}
                                                                                            onChange={(e) => updateModelLibraryEntry(entry.id, { resolutionNotesEnabled: e.target.checked })}
                                                                                            disabled={!isEditing}
                                                                                        />
                                                                                        <span>{t('启用')}</span>
                                                                                    </label>
                                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('仅用于辅助选择')}</span>
                                                                                    <button
                                                                                        onClick={() => toggleLibraryNotesCollapsed(entry.id, 'resolution')}
                                                                                        className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                        title={isLibraryNotesCollapsed(entry.id, 'resolution') ? t('展开提示') : t('折叠提示')}
                                                                                    >
                                                                                        <ChevronDown size={12} className={`transition-transform ${isLibraryNotesCollapsed(entry.id, 'resolution') ? '' : 'rotate-180'}`} />
                                                                                    </button>
                                                                                </div>
                                                                                {resolutionNotesEnabled && !isLibraryNotesCollapsed(entry.id, 'resolution') && resolutionValues.map((value) => (
                                                                                    <div key={value} className="flex items-center gap-2">
                                                                                        <span className={`text-[9px] w-24 truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`} title={value}>{value}</span>
                                                                                        <input
                                                                                            value={resolutionNotes[value] || ''}
                                                                                            onChange={(e) => {
                                                                                                const nextNotes = { ...resolutionNotes };
                                                                                                const noteValue = e.target.value;
                                                                                                if (noteValue) {
                                                                                                    nextNotes[value] = noteValue;
                                                                                                } else {
                                                                                                    delete nextNotes[value];
                                                                                                }
                                                                                                updateModelLibraryEntry(entry.id, { resolutionNotes: nextNotes });
                                                                                            }}
                                                                                            placeholder={t('例：1:1 / 高清')}
                                                                                            disabled={!isEditing}
                                                                                            className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                                }`}
                                                                                        />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('并发间隔(秒)')}</span>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max="30"
                                                                        step="0.5"
                                                                        value={normalizeImageDispatchIntervalSeconds(entry.imageDispatchIntervalSec, DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS)}
                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { imageDispatchIntervalSec: normalizeImageDispatchIntervalSeconds(e.target.value, DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS) })}
                                                                        disabled={!isEditing}
                                                                        className={`w-[76px] text-[9px] rounded px-1 py-0.5 border outline-none ${theme === 'dark'
                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                            }`}
                                                                    />
                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('多图模式')}</span>
                                                                    <select
                                                                        value={normalizeImageBatchMode(entry.imageBatchMode)}
                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { imageBatchMode: normalizeImageBatchMode(e.target.value) })}
                                                                        disabled={!isEditing}
                                                                        className={`w-[112px] text-[9px] rounded px-1 py-0.5 border outline-none ${theme === 'dark'
                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                            }`}
                                                                    >
                                                                        <option value={IMAGE_BATCH_MODE_PARALLEL_AGGREGATE}>{t('并发聚合')}</option>
                                                                        <option value={IMAGE_BATCH_MODE_STANDARD_BATCH}>{t('标准批次')}</option>
                                                                    </select>
                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('原生多图')}</span>
                                                                    <select
                                                                        value={normalizeNativeMultiImageMode(entry.nativeMultiImageMode)}
                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { nativeMultiImageMode: normalizeNativeMultiImageMode(e.target.value) })}
                                                                        disabled={!isEditing}
                                                                        className={`w-[116px] text-[9px] rounded px-1 py-0.5 border outline-none ${theme === 'dark'
                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                            }`}
                                                                    >
                                                                        <option value={IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO}>{t('自动检测')}</option>
                                                                        <option value={IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE}>{t('强制原生')}</option>
                                                                        <option value={IMAGE_NATIVE_MULTI_IMAGE_MODE_DISABLE}>{t('禁用原生')}</option>
                                                                    </select>
                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('默认张数')}</span>
                                                                    <select
                                                                        value={normalizeImageConcurrency(entry.defaultImageConcurrency || 1)}
                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { defaultImageConcurrency: normalizeImageConcurrency(e.target.value) })}
                                                                        disabled={!isEditing}
                                                                        className={`w-[76px] text-[9px] rounded px-1 py-0.5 border outline-none ${theme === 'dark'
                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                            }`}
                                                                    >
                                                                        {[1, 2, 4, 9].map((count) => (
                                                                            <option key={count} value={count}>{uiText("{0}张", count)}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                                </>
                                                            )}

                                                            {entry.type === 'Video' && (
                                                                <div className="grid grid-cols-12 gap-2">
                                                                    <div className="col-span-4">
                                                                        <TagListEditor
                                                                            label={t('视频比例')}
                                                                            values={ratioValues}
                                                                            onChange={(values) => {
                                                                                const nextNotes = { ...ratioNotes };
                                                                                Object.keys(nextNotes).forEach((key) => {
                                                                                    if (!values.includes(key)) delete nextNotes[key];
                                                                                });
                                                                                const updates = { ratioLimits: values, ratioNotes: nextNotes };
                                                                                if (entry.defaultRatio && values.length > 0 && !values.includes(entry.defaultRatio)) {
                                                                                    updates.defaultRatio = '';
                                                                                }
                                                                                updateModelLibraryEntry(entry.id, updates);
                                                                            }}
                                                                            placeholder={t('例：16:9,9:16')}
                                                                            disabled={!isEditing}
                                                                            inputDisabled={!isEditing || ratioAll}
                                                                            theme={theme}
                                                                            allowAllLabel={t('全比例')}
                                                                            allowAll={ratioAll}
                                                                            allLabelPosition="left"
                                                                            onToggleAll={(checked) => updateModelLibraryEntry(entry.id, { ratioLimits: checked ? null : [] })}
                                                                            headerLeft={(
                                                                                <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={!!entry.omitRatioOnSubmit}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { omitRatioOnSubmit: e.target.checked })}
                                                                                        disabled={!isEditing}
                                                                                        className="w-3 h-3"
                                                                                    />
                                                                                    <span>{t('禁用')}</span>
                                                                                </label>
                                                                            )}
                                                                            headerRight={(
                                                                                <div className="flex items-center gap-1">
                                                                                    <select
                                                                                        value={entry.defaultRatio || ''}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { defaultRatio: e.target.value })}
                                                                                        disabled={!isEditing}
                                                                                        className={`text-[9px] rounded px-1 py-0.5 border outline-none w-[76px] ${theme === 'dark'
                                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                                            }`}
                                                                                    >
                                                                                        <option value="">{t('默认参数')}</option>
                                                                                        {ratioDefaultOptions.map((value) => (
                                                                                            <option key={value} value={value}>{getValueLabelWithNotes(value, ratioNotesEnabled, ratioNotes)}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            )}
                                                                            formatItem={(value) => getValueLabelWithNotes(value, ratioNotesEnabled, ratioNotes)}
                                                                        />
                                                                        {ratioValues.length > 0 && (
                                                                            <div className="mt-1 space-y-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('映射提示名')}</div>
                                                                                    <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={ratioNotesEnabled}
                                                                                            onChange={(e) => updateModelLibraryEntry(entry.id, { ratioNotesEnabled: e.target.checked })}
                                                                                            disabled={!isEditing}
                                                                                        />
                                                                                        <span>{t('启用')}</span>
                                                                                    </label>
                                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('仅用于辅助选择')}</span>
                                                                                    <button
                                                                                        onClick={() => toggleLibraryNotesCollapsed(entry.id, 'ratio')}
                                                                                        className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                        title={isLibraryNotesCollapsed(entry.id, 'ratio') ? t('展开提示') : t('折叠提示')}
                                                                                    >
                                                                                        <ChevronDown size={12} className={`transition-transform ${isLibraryNotesCollapsed(entry.id, 'ratio') ? '' : 'rotate-180'}`} />
                                                                                    </button>
                                                                                </div>
                                                                                {ratioNotesEnabled && !isLibraryNotesCollapsed(entry.id, 'ratio') && ratioValues.map((value) => (
                                                                                    <div key={value} className="flex items-center gap-2">
                                                                                        <span className={`text-[9px] w-24 truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`} title={value}>{value}</span>
                                                                                        <input
                                                                                            value={ratioNotes[value] || ''}
                                                                                            onChange={(e) => {
                                                                                                const nextNotes = { ...ratioNotes };
                                                                                                const noteValue = e.target.value;
                                                                                                if (noteValue) {
                                                                                                    nextNotes[value] = noteValue;
                                                                                                } else {
                                                                                                    delete nextNotes[value];
                                                                                                }
                                                                                                updateModelLibraryEntry(entry.id, { ratioNotes: nextNotes });
                                                                                            }}
                                                                                            placeholder={t('例：16:9 / 横屏')}
                                                                                            disabled={!isEditing}
                                                                                            className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                                }`}
                                                                                        />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="col-span-4">
                                                                        <TagListEditor
                                                                            label={t('视频时长')}
                                                                            values={durationValues}
                                                                            onChange={(values) => {
                                                                                const nextNotes = { ...durationNotes };
                                                                                Object.keys(nextNotes).forEach((key) => {
                                                                                    if (!values.includes(key)) delete nextNotes[key];
                                                                                });
                                                                                const updates = { durations: values, durationNotes: nextNotes };
                                                                                if (entry.defaultDuration && values.length > 0 && !values.includes(entry.defaultDuration)) {
                                                                                    updates.defaultDuration = '';
                                                                                }
                                                                                updateModelLibraryEntry(entry.id, updates);
                                                                            }}
                                                                            placeholder={t('例：5s,10s')}
                                                                            disabled={!isEditing}
                                                                            theme={theme}
                                                                            headerLeft={(
                                                                                <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={!!entry.omitDurationOnSubmit}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { omitDurationOnSubmit: e.target.checked })}
                                                                                        disabled={!isEditing}
                                                                                        className="w-3 h-3"
                                                                                    />
                                                                                    <span>{t('禁用')}</span>
                                                                                </label>
                                                                            )}
                                                                            headerRight={(
                                                                                <div className="flex items-center gap-1">
                                                                                    <select
                                                                                        value={entry.defaultDuration || ''}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { defaultDuration: e.target.value })}
                                                                                        disabled={!isEditing}
                                                                                        className={`text-[9px] rounded px-1 py-0.5 border outline-none w-[76px] ${theme === 'dark'
                                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                                            }`}
                                                                                    >
                                                                                        <option value="">{t('默认参数')}</option>
                                                                                        {durationDefaultOptions.map((value) => (
                                                                                            <option key={value} value={value}>{getValueLabelWithNotes(value, durationNotesEnabled, durationNotes)}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            )}
                                                                            normalizeItem={(value) => {
                                                                                const trimmed = String(value).trim();
                                                                                return trimmed.endsWith('s') ? trimmed : `${trimmed}s`;
                                                                            }}
                                                                            formatItem={(value) => getValueLabelWithNotes(value, durationNotesEnabled, durationNotes)}
                                                                        />
                                                                        {durationValues.length > 0 && (
                                                                            <div className="mt-1 space-y-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('映射提示名')}</div>
                                                                                    <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={durationNotesEnabled}
                                                                                            onChange={(e) => updateModelLibraryEntry(entry.id, { durationNotesEnabled: e.target.checked })}
                                                                                            disabled={!isEditing}
                                                                                        />
                                                                                        <span>{t('启用')}</span>
                                                                                    </label>
                                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('仅用于辅助选择')}</span>
                                                                                    <button
                                                                                        onClick={() => toggleLibraryNotesCollapsed(entry.id, 'duration')}
                                                                                        className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                        title={isLibraryNotesCollapsed(entry.id, 'duration') ? t('展开提示') : t('折叠提示')}
                                                                                    >
                                                                                        <ChevronDown size={12} className={`transition-transform ${isLibraryNotesCollapsed(entry.id, 'duration') ? '' : 'rotate-180'}`} />
                                                                                    </button>
                                                                                </div>
                                                                                {durationNotesEnabled && !isLibraryNotesCollapsed(entry.id, 'duration') && durationValues.map((value) => (
                                                                                    <div key={value} className="flex items-center gap-2">
                                                                                        <span className={`text-[9px] w-24 truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`} title={value}>{value}</span>
                                                                                        <input
                                                                                            value={durationNotes[value] || ''}
                                                                                            onChange={(e) => {
                                                                                                const nextNotes = { ...durationNotes };
                                                                                                const noteValue = e.target.value;
                                                                                                if (noteValue) {
                                                                                                    nextNotes[value] = noteValue;
                                                                                                } else {
                                                                                                    delete nextNotes[value];
                                                                                                }
                                                                                                updateModelLibraryEntry(entry.id, { durationNotes: nextNotes });
                                                                                            }}
                                                                                            placeholder={t('例：5s / 快速')}
                                                                                            disabled={!isEditing}
                                                                                            className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                                }`}
                                                                                        />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="col-span-4">
                                                                        <TagListEditor
                                                                            label={t('视频分辨率')}
                                                                            values={videoResolutionValues}
                                                                            onChange={(values) => {
                                                                                const nextNotes = { ...videoResolutionNotes };
                                                                                Object.keys(nextNotes).forEach((key) => {
                                                                                    if (!values.includes(key)) delete nextNotes[key];
                                                                                });
                                                                                const updates = { videoResolutions: values, videoResolutionNotes: nextNotes };
                                                                                if (entry.defaultVideoResolution && values.length > 0 && !values.includes(entry.defaultVideoResolution)) {
                                                                                    updates.defaultVideoResolution = '';
                                                                                }
                                                                                updateModelLibraryEntry(entry.id, updates);
                                                                            }}
                                                                            placeholder={t('例：720P,1080P')}
                                                                            disabled={!isEditing}
                                                                            theme={theme}
                                                                            headerLeft={(
                                                                                <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={!!entry.omitResolutionOnSubmit}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { omitResolutionOnSubmit: e.target.checked })}
                                                                                        disabled={!isEditing}
                                                                                        className="w-3 h-3"
                                                                                    />
                                                                                    <span>{t('禁用')}</span>
                                                                                </label>
                                                                            )}
                                                                            headerRight={(
                                                                                <div className="flex items-center gap-1">
                                                                                    <select
                                                                                        value={entry.defaultVideoResolution || ''}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { defaultVideoResolution: e.target.value })}
                                                                                        disabled={!isEditing}
                                                                                        className={`text-[9px] rounded px-1 py-0.5 border outline-none w-[76px] ${theme === 'dark'
                                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                            : 'bg-white border-zinc-300 text-zinc-900'
                                                                                            }`}
                                                                                    >
                                                                                        <option value="">{t('默认参数')}</option>
                                                                                        {videoResolutionDefaultOptions.map((value) => (
                                                                                            <option key={value} value={value}>{getValueLabelWithNotes(value, videoResolutionNotesEnabled, videoResolutionNotes)}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            )}
                                                                            normalizeItem={(value) => normalizeVideoResolution(value)}
                                                                            formatItem={(value) => getValueLabelWithNotes(value, videoResolutionNotesEnabled, videoResolutionNotes)}
                                                                        />
                                                                        {videoResolutionValues.length > 0 && (
                                                                            <div className="mt-1 space-y-1">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('映射提示名')}</div>
                                                                                    <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={videoResolutionNotesEnabled}
                                                                                            onChange={(e) => updateModelLibraryEntry(entry.id, { videoResolutionNotesEnabled: e.target.checked })}
                                                                                            disabled={!isEditing}
                                                                                        />
                                                                                        <span>{t('启用')}</span>
                                                                                    </label>
                                                                                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('仅用于辅助选择')}</span>
                                                                                    <button
                                                                                        onClick={() => toggleLibraryNotesCollapsed(entry.id, 'video-resolution')}
                                                                                        className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                        title={isLibraryNotesCollapsed(entry.id, 'video-resolution') ? t('展开提示') : t('折叠提示')}
                                                                                    >
                                                                                        <ChevronDown size={12} className={`transition-transform ${isLibraryNotesCollapsed(entry.id, 'video-resolution') ? '' : 'rotate-180'}`} />
                                                                                    </button>
                                                                                </div>
                                                                                {videoResolutionNotesEnabled && !isLibraryNotesCollapsed(entry.id, 'video-resolution') && videoResolutionValues.map((value) => (
                                                                                    <div key={value} className="flex items-center gap-2">
                                                                                        <span className={`text-[9px] w-24 truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`} title={value}>{value}</span>
                                                                                        <input
                                                                                            value={videoResolutionNotes[value] || ''}
                                                                                            onChange={(e) => {
                                                                                                const nextNotes = { ...videoResolutionNotes };
                                                                                                const noteValue = e.target.value;
                                                                                                if (noteValue) {
                                                                                                    nextNotes[value] = noteValue;
                                                                                                } else {
                                                                                                    delete nextNotes[value];
                                                                                                }
                                                                                                updateModelLibraryEntry(entry.id, { videoResolutionNotes: nextNotes });
                                                                                            }}
                                                                                            placeholder={t('例：16:9 / 竖屏')}
                                                                                            disabled={!isEditing}
                                                                                            className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                                }`}
                                                                                        />
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="col-span-12 flex items-center gap-3">
                                                                        <label className={`flex items-center gap-1 text-[10px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={!!entry.supportsFirstLastFrame}
                                                                                onChange={(e) => updateModelLibraryEntry(entry.id, { supportsFirstLastFrame: e.target.checked })}
                                                                                className="w-3 h-3 cursor-pointer"
                                                                                disabled={!isEditing}
                                                                            />
                                                                            <span>{t('首尾帧')}</span>
                                                                        </label>
                                                                        <label className={`flex items-center gap-1 text-[10px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={!!entry.supportsHD}
                                                                                onChange={(e) => updateModelLibraryEntry(entry.id, { supportsHD: e.target.checked })}
                                                                                className="w-3 h-3 cursor-pointer"
                                                                                disabled={!isEditing}
                                                                            />
                                                                            <span>HD</span>
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <label className={`text-[9px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('自定义参数')}</label>
                                                                    <button
                                                                        onClick={() => addModelLibraryCustomParam(entry.id)}
                                                                        disabled={!isEditing || customParams.length >= MAX_CUSTOM_PARAMS}
                                                                        className={`text-[9px] px-1.5 py-0.5 rounded ${theme === 'dark'
                                                                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                                            : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300'
                                                                            } ${(!isEditing || customParams.length >= MAX_CUSTOM_PARAMS) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        {uiText("+ 添加参数 (")}{customParams.length}/{MAX_CUSTOM_PARAMS})
                                                                    </button>
                                                                </div>
                                                                {customParams.length > 0 ? (
                                                                    <div className="space-y-2">
                                                                        {customParams.map((param) => (
                                                                            <div key={param.id} className={`rounded-md border p-2 space-y-2 ${theme === 'dark'
                                                                                ? 'bg-zinc-900/60 border-zinc-800'
                                                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                                                                }`}>
                                                                                {(() => {
                                                                                    const paramValues = Array.isArray(param.values) ? param.values : [];
                                                                                    const paramNotes = param.valueNotes || {};
                                                                                    const notesEnabled = !!param.notesEnabled;
                                                                                    const paramDefaultValue = typeof param.defaultValue === 'string' ? param.defaultValue : '';
                                                                                    return (
                                                                                        <>
                                                                                <div className="flex items-center gap-2">
                                                                                    <input
                                                                                        value={param.name || ''}
                                                                                        onChange={(e) => updateModelLibraryCustomParam(entry.id, param.id, { name: e.target.value })}
                                                                                        placeholder={t('参数名（如 size / quality / model）')}
                                                                                        disabled={!isEditing}
                                                                                        className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                            : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                            }`}
                                                                                    />
                                                                                    <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={!!param.override}
                                                                                            onChange={(e) => updateModelLibraryCustomParam(entry.id, param.id, { override: e.target.checked })}
                                                                                            disabled={!isEditing}
                                                                                        />
                                                                                        <span>{t('覆盖同名参数')}</span>
                                                                                    </label>
                                                                                    <button
                                                                                        onClick={() => deleteModelLibraryCustomParam(entry.id, param.id)}
                                                                                        disabled={!isEditing}
                                                                                        className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-400 hover:text-red-500'} ${!isEditing ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                                        title={t('删除参数')}
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                                <TagListEditor
                                                                                    label={t('参数值')}
                                                                                    values={paramValues}
                                                                                    onChange={(values) => {
                                                                                        const nextNotes = { ...paramNotes };
                                                                                        Object.keys(nextNotes).forEach((key) => {
                                                                                            if (!values.includes(key)) delete nextNotes[key];
                                                                                        });
                                                                                        const nextUpdates = { values, valueNotes: nextNotes };
                                                                                        if (paramDefaultValue && values.length > 0 && !values.includes(paramDefaultValue)) {
                                                                                            nextUpdates.defaultValue = '';
                                                                                        }
                                                                                        updateModelLibraryCustomParam(entry.id, param.id, nextUpdates);
                                                                                    }}
                                                                                    placeholder={t('例：1024x1024,2K,low,high')}
                                                                                    disabled={!isEditing}
                                                                                    theme={theme}
                                                                                    formatItem={(value) => getCustomParamValueLabel(param, value)}
                                                                                    maxItems={MAX_CUSTOM_PARAM_VALUES}
                                                                                />
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={`text-[9px] min-w-[72px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('默认值')}</div>
                                                                                    {paramValues.length > 0 ? (
                                                                                        <select
                                                                                            value={paramDefaultValue}
                                                                                            onChange={(e) => updateModelLibraryCustomParam(entry.id, param.id, { defaultValue: e.target.value })}
                                                                                            disabled={!isEditing}
                                                                                            className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                                : 'bg-white border-zinc-300 text-zinc-900'
                                                                                                }`}
                                                                                        >
                                                                                            <option value="">{t('不设置')}</option>
                                                                                            {paramValues.map((value) => (
                                                                                                <option key={value} value={value}>{getCustomParamValueLabel(param, value)}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                    ) : (
                                                                                        <input
                                                                                            value={paramDefaultValue}
                                                                                            onChange={(e) => updateModelLibraryCustomParam(entry.id, param.id, { defaultValue: e.target.value })}
                                                                                            placeholder={t('不设置')}
                                                                                            disabled={!isEditing}
                                                                                            className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                                }`}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                                {paramValues.length > 0 && (
                                                                                    <div className="space-y-1">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('映射提示名')}</div>
                                                                                            <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                                <input
                                                                                                    type="checkbox"
                                                                                                    checked={notesEnabled}
                                                                                                    onChange={(e) => updateModelLibraryCustomParam(entry.id, param.id, { notesEnabled: e.target.checked })}
                                                                                                    disabled={!isEditing}
                                                                                                />
                                                                                                <span>{t('启用')}</span>
                                                                                            </label>
                                                                                            <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('仅用于辅助选择')}</span>
                                                                                            <button
                                                                                                onClick={() => toggleLibraryNotesCollapsed(entry.id, `param-${param.id}`)}
                                                                                                className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                                title={isLibraryNotesCollapsed(entry.id, `param-${param.id}`) ? t('展开提示') : t('折叠提示')}
                                                                                            >
                                                                                                <ChevronDown size={12} className={`transition-transform ${isLibraryNotesCollapsed(entry.id, `param-${param.id}`) ? '' : 'rotate-180'}`} />
                                                                                            </button>
                                                                                        </div>
                                                                                        {notesEnabled && !isLibraryNotesCollapsed(entry.id, `param-${param.id}`) && paramValues.map((value) => (
                                                                                            <div key={value} className="flex items-center gap-2">
                                                                                                <span className={`text-[9px] w-24 truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`} title={value}>{value}</span>
                                                                                                <input
                                                                                                    value={paramNotes[value] || ''}
                                                                                                    onChange={(e) => {
                                                                                                        const nextNotes = { ...paramNotes };
                                                                                                        const noteValue = e.target.value;
                                                                                                        if (noteValue) {
                                                                                                            nextNotes[value] = noteValue;
                                                                                                        } else {
                                                                                                            delete nextNotes[value];
                                                                                                        }
                                                                                                        updateModelLibraryCustomParam(entry.id, param.id, { valueNotes: nextNotes });
                                                                                                    }}
                                                                                                    placeholder={t('例：1:1 / 高清')}
                                                                                                    disabled={!isEditing}
                                                                                                    className={`flex-1 text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                                        ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                                        : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                                        }`}
                                                                                                />
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                                    </>
                                                                                );
                                                                            })()}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>{t('未设置自定义参数')}</div>
                                                                )}
                                                            </div>
                                                            <div className={`rounded-md border p-2 ${theme === 'dark'
                                                                ? 'bg-zinc-950/60 border-zinc-800'
                                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                                                }`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('请求模板')}</div>
                                                                    <div className="flex items-center gap-2">
                                                                        <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={requestTemplateEnabled}
                                                                                onChange={(e) => updateRequestTemplate({ enabled: e.target.checked })}
                                                                                disabled={!isEditing}
                                                                            />
                                                                            <span>{t('启用')}</span>
                                                                        </label>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (isRequestTemplateCollapsed) {
                                                                                    toggleLibrarySectionCollapsed(entry.id, 'request-template');
                                                                                }
                                                                                toggleLibraryPreview(entry.id);
                                                                            }}
                                                                            className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                            title={isPreviewOpen ? t('隐藏请求预览') : t('查看请求预览')}
                                                                        >
                                                                            <Code size={12} className={isPreviewOpen ? 'text-blue-500' : ''} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => toggleLibrarySectionCollapsed(entry.id, 'request-template')}
                                                                            className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                            title={isRequestTemplateCollapsed ? t('展开') : t('折叠')}
                                                                        >
                                                                            <ChevronDown size={12} className={`transition-transform ${isRequestTemplateCollapsed ? '' : 'rotate-180'}`} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {!isRequestTemplateCollapsed && (
                                                                <>
                                                                <div className="grid grid-cols-12 gap-2">
                                                                    <div className="col-span-7 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('请求路径')}</label>
                                                                        <input
                                                                            value={requestTemplateValue?.endpoint || ''}
                                                                            onChange={(e) => updateRequestTemplate({ endpoint: e.target.value })}
                                                                            placeholder="/v1/images/generations"
                                                                            disabled={!isEditing}
                                                                            className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                    <div className="col-span-2 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('方法')}</label>
                                                                        <select
                                                                            value={requestTemplateValue?.method || 'POST'}
                                                                            onChange={(e) => updateRequestTemplate({ method: e.target.value })}
                                                                            disabled={!isEditing}
                                                                            className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                : 'bg-white border-zinc-300 text-zinc-900'
                                                                                }`}
                                                                        >
                                                                            <option value="POST">POST</option>
                                                                            <option value="GET">GET</option>
                                                                            <option value="PUT">PUT</option>
                                                                            <option value="PATCH">PATCH</option>
                                                                            <option value="DELETE">DELETE</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="col-span-3 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>BodyType</label>
                                                                        <select
                                                                            value={requestTemplateValue?.bodyType || 'json'}
                                                                            onChange={(e) => {
                                                                                updateRequestTemplate({ bodyType: e.target.value });
                                                                                setLibraryRequestTemplateDrafts(prev => {
                                                                                    if (!prev[entry.id]) return prev;
                                                                                    const { [entry.id]: _removed, ...rest } = prev;
                                                                                    return rest;
                                                                                });
                                                                            }}
                                                                            disabled={!isEditing}
                                                                            className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                : 'bg-white border-zinc-300 text-zinc-900'
                                                                                }`}
                                                                        >
                                                                            <option value="auto">{t('自动')}</option>
                                                                            <option value="json">json</option>
                                                                            <option value="multipart">multipart</option>
                                                                            <option value="raw">raw</option>
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-12 gap-2 mt-2">
                                                                    <div className="col-span-4 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('Transport')}</label>
                                                                        <select
                                                                            value={transportModeValue}
                                                                            onChange={(e) => updateModelLibraryEntry(entry.id, { transport: normalizeTransportMode(e.target.value) })}
                                                                            disabled={!isEditing}
                                                                            className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                : 'bg-white border-zinc-300 text-zinc-900'
                                                                                }`}
                                                                        >
                                                                            <option value={TRANSPORT_HTTP_JSON}>http-json</option>
                                                                            <option value={TRANSPORT_HTTP_SSE}>http-sse</option>
                                                                            <option value={TRANSPORT_WS_STREAM}>ws-stream</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="col-span-8 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('Transport Options（JSON）')}</label>
                                                                        <textarea
                                                                            value={transportOptionsDraft}
                                                                            onChange={(e) => setLibraryTransportOptionsDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                                                            disabled={!isEditing}
                                                                            className={`w-full h-20 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                : 'bg-white border-zinc-300 text-zinc-800'
                                                                                }`}
                                                                        />
                                                                        <div className="flex items-center justify-end">
                                                                            <button
                                                                                onClick={() => {
                                                                                    try {
                                                                                        const parsed = transportOptionsDraft ? JSON.parse(transportOptionsDraft) : {};
                                                                                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                                                                            throw new Error('Transport Options 必须是对象');
                                                                                        }
                                                                                        updateModelLibraryEntry(entry.id, { transportOptions: normalizeTransportOptions(parsed) });
                                                                                        setLibraryTransportOptionsDrafts(prev => {
                                                                                            const { [entry.id]: _removed, ...rest } = prev;
                                                                                            return rest;
                                                                                        });
                                                                                        showToast(uiText("Transport 配置已保存"), 'success', 2000);
                                                                                    } catch (e) {
                                                                                        showToast(uiText("Transport Options JSON 格式无效"), 'error', 2000);
                                                                                    }
                                                                                }}
                                                                                disabled={!isEditing}
                                                                                className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                    ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                                                                                    : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                                                                                    } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                            >
                                                                                {t('保存 Transport')}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="mt-2 space-y-1">
                                                                    <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('Capabilities')}</label>
                                                                    <div className="flex flex-wrap items-center gap-3">
                                                                        {[
                                                                            { key: 'supportsMultipart', label: 'multipart' },
                                                                            { key: 'supportsRequestChain', label: 'requestChain' },
                                                                            { key: 'supportsSSE', label: 'sse' },
                                                                            { key: 'supportsWS', label: 'ws' },
                                                                            { key: 'supportsTools', label: 'tools' }
                                                                        ].map((cap) => (
                                                                            <label key={cap.key} className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={!!capabilitiesValue?.[cap.key]}
                                                                                    onChange={(e) => {
                                                                                        updateModelLibraryEntry(entry.id, {
                                                                                            capabilities: {
                                                                                                ...capabilitiesValue,
                                                                                                [cap.key]: e.target.checked
                                                                                            }
                                                                                        });
                                                                                    }}
                                                                                    disabled={!isEditing}
                                                                                />
                                                                                <span>{cap.label}</span>
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                {contractIssues.length > 0 && (
                                                                    <div className={`mt-2 rounded px-2 py-1 text-[9px] ${contractErrors.length > 0
                                                                        ? 'bg-amber-500/15 text-amber-500'
                                                                        : theme === 'dark'
                                                                            ? 'bg-blue-500/15 text-blue-300'
                                                                            : 'bg-blue-50 text-blue-600'
                                                                        }`}>
                                                                        {contractIssues.map((issue, idx) => (
                                                                            <div key={`${entry.id}-issue-${idx}`}>[{issue.level}] {issue.message}</div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <div className="grid grid-cols-12 gap-2 mt-2">
                                                                    <div className="col-span-6 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('请求头（JSON）')}</label>
                                                                        <textarea
                                                                            value={requestTemplateDraft.headers}
                                                                            onChange={(e) => setLibraryRequestTemplateDrafts(prev => ({
                                                                                ...prev,
                                                                                [entry.id]: { ...requestTemplateDraft, headers: e.target.value }
                                                                            }))}
                                                                            disabled={!isEditing}
                                                                            className={`w-full h-24 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                : 'bg-white border-zinc-300 text-zinc-800'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                    <div className="col-span-6 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('请求体（JSON / Raw）')}</label>
                                                                        <textarea
                                                                            value={requestTemplateDraft.body}
                                                                            onChange={(e) => setLibraryRequestTemplateDrafts(prev => ({
                                                                                ...prev,
                                                                                [entry.id]: { ...requestTemplateDraft, body: e.target.value }
                                                                            }))}
                                                                            disabled={!isEditing}
                                                                            className={`w-full h-24 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                : 'bg-white border-zinc-300 text-zinc-800'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-12 gap-2 mt-2">
                                                                    <div className="col-span-6 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>Query（JSON）</label>
                                                                        <textarea
                                                                            value={requestTemplateDraft.query}
                                                                            onChange={(e) => setLibraryRequestTemplateDrafts(prev => ({
                                                                                ...prev,
                                                                                [entry.id]: { ...requestTemplateDraft, query: e.target.value }
                                                                            }))}
                                                                            disabled={!isEditing}
                                                                            className={`w-full h-20 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                : 'bg-white border-zinc-300 text-zinc-800'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                    <div className="col-span-6 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>Files（JSON）</label>
                                                                        <textarea
                                                                            value={requestTemplateDraft.files}
                                                                            onChange={(e) => setLibraryRequestTemplateDrafts(prev => ({
                                                                                ...prev,
                                                                                [entry.id]: { ...requestTemplateDraft, files: e.target.value }
                                                                            }))}
                                                                            disabled={!isEditing}
                                                                            className={`w-full h-20 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                : 'bg-white border-zinc-300 text-zinc-800'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-12 gap-2 mt-2">
                                                                    <div className="col-span-4 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('超时（ms）')}</label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            value={requestTemplateDraft.timeoutMs}
                                                                            onChange={(e) => setLibraryRequestTemplateDrafts(prev => ({
                                                                                ...prev,
                                                                                [entry.id]: { ...requestTemplateDraft, timeoutMs: e.target.value }
                                                                            }))}
                                                                            disabled={!isEditing}
                                                                            className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                                                                : 'bg-white border-zinc-300 text-zinc-900'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                    <div className="col-span-8 space-y-1">
                                                                        <label className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('响应解析器')}</label>
                                                                        <input
                                                                            value={requestTemplateDraft.responseParser}
                                                                            onChange={(e) => setLibraryRequestTemplateDrafts(prev => ({
                                                                                ...prev,
                                                                                [entry.id]: { ...requestTemplateDraft, responseParser: e.target.value }
                                                                            }))}
                                                                            disabled={!isEditing}
                                                                            placeholder={t('例如：openai.image / jimeng.video')}
                                                                            className={`w-full text-[10px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 placeholder-zinc-600'
                                                                                : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between mt-2">
                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                                                        {uiText("变量示例：")}{'{{prompt}}'}, {'{{duration:number}}'}, {'{{image:blob}}'}, {'{{size}}'}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => {
                                                                                try {
                                                                                    const headersText = requestTemplateDraft.headers?.trim() || '{}';
                                                                                    const bodyText = requestTemplateDraft.body ?? '';
                                                                                    const queryText = requestTemplateDraft.query?.trim() || '{}';
                                                                                    const filesText = requestTemplateDraft.files?.trim() || '{}';
                                                                                    const parsedHeaders = headersText ? JSON.parse(headersText) : {};
                                                                                    if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
                                                                                        throw new Error('请求头必须是对象');
                                                                                    }
                                                                                    const parsedQuery = queryText ? JSON.parse(queryText) : {};
                                                                                    if (!parsedQuery || typeof parsedQuery !== 'object' || Array.isArray(parsedQuery)) {
                                                                                        throw new Error('Query 必须是对象');
                                                                                    }
                                                                                    const parsedFiles = filesText ? JSON.parse(filesText) : {};
                                                                                    if (!parsedFiles || typeof parsedFiles !== 'object' || Array.isArray(parsedFiles)) {
                                                                                        throw new Error('Files 必须是对象');
                                                                                    }
                                                                                    let parsedBody = bodyText;
                                                                                    if ((requestTemplateValue?.bodyType || 'json') !== 'raw') {
                                                                                        const rawBodyText = bodyText?.trim() || '{}';
                                                                                        parsedBody = rawBodyText ? JSON.parse(rawBodyText) : {};
                                                                                        if (!parsedBody || typeof parsedBody !== 'object') {
                                                                                            throw new Error('请求体必须是对象');
                                                                                        }
                                                                                    }
                                                                                    const timeoutRaw = requestTemplateDraft.timeoutMs;
                                                                                    const timeoutMs = timeoutRaw === '' || timeoutRaw === null || timeoutRaw === undefined
                                                                                        ? null
                                                                                        : Number(timeoutRaw);
                                                                                    if (timeoutMs !== null && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
                                                                                        throw new Error('超时必须是非负数字');
                                                                                    }
                                                                                    const responseParser = (requestTemplateDraft.responseParser || '').trim();
                                                                                    updateRequestTemplate({
                                                                                        headers: parsedHeaders,
                                                                                        body: parsedBody,
                                                                                        query: parsedQuery,
                                                                                        files: parsedFiles,
                                                                                        timeoutMs,
                                                                                        responseParser
                                                                                    });
                                                                                    setLibraryRequestTemplateDrafts(prev => {
                                                                                        const { [entry.id]: _removed, ...rest } = prev;
                                                                                        return rest;
                                                                                    });
                                                                                    showToast(uiText("请求模板已保存"), 'success', 2000);
                                                                                } catch (e) {
                                                                                    showToast(uiText("请求模板 JSON 格式无效"), 'error', 2000);
                                                                                }
                                                                            }}
                                                                            disabled={!isEditing}
                                                                            className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                                                                                : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                                                                                } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            {t('保存模板')}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                updateModelLibraryEntry(entry.id, { requestTemplate: getDefaultRequestTemplateForEntry(entry) });
                                                                                setLibraryRequestTemplateDrafts(prev => {
                                                                                    const { [entry.id]: _removed, ...rest } = prev;
                                                                                    return rest;
                                                                                });
                                                                            }}
                                                                            disabled={!isEditing}
                                                                            className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                                                                                } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            {t('重置')}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                </>
                                                                )}
                                                            </div>
                                                            <div className={`rounded-md border p-2 mt-3 ${theme === 'dark'
                                                                ? 'bg-zinc-950/60 border-zinc-800'
                                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                                                }`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('异步任务（通用轮询）')}</div>
                                                                    <div className="flex items-center gap-2">
                                                                        <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={asyncConfigEnabled}
                                                                                onChange={(e) => {
                                                                                    const enabled = e.target.checked;
                                                                                    const baseConfig = asyncConfigValue || buildEmptyAsyncConfig();
                                                                                    updateModelLibraryEntry(entry.id, { asyncConfig: { ...baseConfig, enabled } });
                                                                                }}
                                                                                disabled={!isEditing}
                                                                            />
                                                                            <span>{t('启用')}</span>
                                                                        </label>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (isAsyncSectionCollapsed) {
                                                                                    toggleLibrarySectionCollapsed(entry.id, 'async-task');
                                                                                }
                                                                                toggleLibraryAsyncPreview(entry.id);
                                                                            }}
                                                                            className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                            title={isAsyncPreviewOpen ? t('隐藏预览') : t('查看预览')}
                                                                        >
                                                                            <Code size={12} className={isAsyncPreviewOpen ? 'text-blue-500' : ''} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => toggleLibrarySectionCollapsed(entry.id, 'async-task')}
                                                                            className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                            title={isAsyncSectionCollapsed ? t('展开') : t('折叠')}
                                                                        >
                                                                            <ChevronDown size={12} className={`transition-transform ${isAsyncSectionCollapsed ? '' : 'rotate-180'}`} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {!isAsyncSectionCollapsed && (
                                                                    <>
                                                                        <textarea
                                                                            value={asyncConfigDraft}
                                                                            onChange={(e) => setLibraryAsyncConfigDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                                                            disabled={!isEditing}
                                                                            className={`w-full h-48 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                : 'bg-white border-zinc-300 text-zinc-800'
                                                                                }`}
                                                                        />
                                                                        <div className="flex items-center justify-between mt-2">
                                                                            <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                                                                {uiText("变量示例：")}{'{{requestId}}'}, {'{{provider.key}}'}, {'{{provider.baseUrl}}'}
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        try {
                                                                                            const parsed = asyncConfigDraft ? JSON.parse(asyncConfigDraft) : {};
                                                                                            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                                                                                throw new Error('异步配置必须是对象');
                                                                                            }
                                                                                            updateModelLibraryEntry(entry.id, { asyncConfig: parsed });
                                                                                            setLibraryAsyncConfigDrafts(prev => {
                                                                                                const { [entry.id]: _removed, ...rest } = prev;
                                                                                                return rest;
                                                                                            });
                                                                                            showToast(uiText("异步配置已保存"), 'success', 2000);
                                                                                        } catch (e) {
                                                                                            showToast(uiText("异步配置 JSON 格式无效"), 'error', 2000);
                                                                                        }
                                                                                    }}
                                                                                    disabled={!isEditing}
                                                                                    className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                        ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                                                                                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                                                                                        } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                                >
                                                                                    {t('保存异步配置')}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        updateModelLibraryEntry(entry.id, { asyncConfig: null });
                                                                                        setLibraryAsyncConfigDrafts(prev => {
                                                                                            const { [entry.id]: _removed, ...rest } = prev;
                                                                                            return rest;
                                                                                        });
                                                                                    }}
                                                                                    disabled={!isEditing}
                                                                                    className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                        ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                                        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                                                                                        } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                                >
                                                                                    {t('重置')}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        {isAsyncPreviewOpen && (
                                                                            <div className={`mt-2 rounded-md border p-2 ${theme === 'dark'
                                                                                ? 'bg-zinc-950/60 border-zinc-800'
                                                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                                                                }`}>
                                                                                <div className={`text-[9px] mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('状态请求预览')}</div>
                                                                                {asyncStatusPreview ? (
                                                                                    <pre className={`text-[9px] whitespace-pre-wrap ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                                                        {JSON.stringify(asyncStatusPreview, null, 2)}
                                                                                    </pre>
                                                                                ) : (
                                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('未配置')}</div>
                                                                                )}
                                                                                <div className={`text-[9px] mt-2 mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('结果请求预览')}</div>
                                                                                {asyncOutputsPreview ? (
                                                                                    <pre className={`text-[9px] whitespace-pre-wrap ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                                                        {JSON.stringify(asyncOutputsPreview, null, 2)}
                                                                                    </pre>
                                                                                ) : (
                                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>{t('未配置')}</div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className={`rounded-md border p-2 mt-3 ${theme === 'dark'
                                                                ? 'bg-zinc-950/60 border-zinc-800'
                                                                : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                                                }`}>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                        {t('Request Chain V1（upload -> extract -> chat）')}
                                                                    </div>
                                                                </div>
                                                                <textarea
                                                                    value={requestChainDraft}
                                                                    onChange={(e) => setLibraryRequestChainDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                                                    disabled={!isEditing}
                                                                    className={`w-full h-40 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                        ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                        : 'bg-white border-zinc-300 text-zinc-800'
                                                                        }`}
                                                                />
                                                                <div className="flex items-center justify-between mt-2">
                                                                    <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                                                        {uiText("Step 类型：`http` / `transform`，支持 extract 变量回填")}</div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => {
                                                                                try {
                                                                                    const parsed = requestChainDraft ? JSON.parse(requestChainDraft) : {};
                                                                                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                                                                        throw new Error('Request Chain 必须是对象');
                                                                                    }
                                                                                    const normalized = normalizeRequestChain(parsed);
                                                                                    updateModelLibraryEntry(entry.id, { requestChain: normalized });
                                                                                    setLibraryRequestChainDrafts(prev => {
                                                                                        const { [entry.id]: _removed, ...rest } = prev;
                                                                                        return rest;
                                                                                    });
                                                                                    showToast(uiText("Request Chain 已保存"), 'success', 2000);
                                                                                } catch (e) {
                                                                                    showToast(uiText("Request Chain JSON 格式无效"), 'error', 2000);
                                                                                }
                                                                            }}
                                                                            disabled={!isEditing}
                                                                            className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                                                                                : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                                                                                } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            {t('保存链路')}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                updateModelLibraryEntry(entry.id, { requestChain: null });
                                                                                setLibraryRequestChainDrafts(prev => {
                                                                                    const { [entry.id]: _removed, ...rest } = prev;
                                                                                    return rest;
                                                                                });
                                                                            }}
                                                                            disabled={!isEditing}
                                                                            className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                                                                                } ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            {t('重置')}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {isPreviewOpen && (
                                                                <div className={`rounded-md border p-2 ${theme === 'dark'
                                                                    ? 'bg-zinc-950/60 border-zinc-800'
                                                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                                                                    }`}>
                                                                    <div className="flex items-center justify-between mb-1">
                                                                        <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('请求预览（JSON）')}</div>
                                                                        <div className="flex items-center gap-2">
                                                                            <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={!!entry.previewOverrideEnabled}
                                                                                    onChange={(e) => updateModelLibraryEntry(entry.id, { previewOverrideEnabled: e.target.checked })}
                                                                                />
                                                                                <span>{t('修改覆盖')}</span>
                                                                            </label>
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (isPreviewEditing) {
                                                                                        setLibraryPreviewEditing(prev => {
                                                                                            const next = new Set(prev);
                                                                                            next.delete(entry.id);
                                                                                            return next;
                                                                                        });
                                                                                        setLibraryPreviewDrafts(prev => {
                                                                                            const { [entry.id]: _removed, ...rest } = prev;
                                                                                            return rest;
                                                                                        });
                                                                                    } else {
                                                                                        setLibraryPreviewEditing(prev => {
                                                                                            const next = new Set(prev);
                                                                                            next.add(entry.id);
                                                                                            return next;
                                                                                        });
                                                                                        setLibraryPreviewDrafts(prev => ({
                                                                                            ...prev,
                                                                                            [entry.id]: JSON.stringify(previewPayload, null, 2)
                                                                                        }));
                                                                                    }
                                                                                }}
                                                                                className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                title={isPreviewEditing ? t('取消编辑') : t('编辑预览')}
                                                                            >
                                                                                <Edit3 size={12} className={isPreviewEditing ? 'text-blue-500' : ''} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className={`text-[9px] mb-1 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>Endpoint: {previewEndpoint}</div>
                                                                    {isPreviewEditing ? (
                                                                        <div className="space-y-2">
                                                                            <textarea
                                                                                value={previewDraft}
                                                                                onChange={(e) => setLibraryPreviewDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                                                                className={`w-full h-40 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                    ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                    : 'bg-white border-zinc-300 text-zinc-800'
                                                                                    }`}
                                                                            />
                                                                            <div className="flex items-center justify-end gap-2">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        try {
                                                                                            const parsed = previewDraft ? JSON.parse(previewDraft) : {};
                                                                                            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                                                                                throw new Error('预览 JSON 必须是对象');
                                                                                            }
                                                                                            const patch = buildPreviewOverridePatch(previewPayloadBase, parsed);
                                                                                            updateModelLibraryEntry(entry.id, { previewOverridePatch: patch });
                                                                                            setLibraryPreviewEditing(prev => {
                                                                                                const next = new Set(prev);
                                                                                                next.delete(entry.id);
                                                                                                return next;
                                                                                            });
                                                                                            setLibraryPreviewDrafts(prev => {
                                                                                                const { [entry.id]: _removed, ...rest } = prev;
                                                                                                return rest;
                                                                                            });
                                                                                            showToast(uiText("预览参数已更新"), 'success', 2000);
                                                                                        } catch (e) {
                                                                                            showToast(uiText("JSON 格式无效，请检查后再保存"), 'error', 2000);
                                                                                        }
                                                                                    }}
                                                                                    className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                        ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                                                                                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                                                                                        }`}
                                                                                >
                                                                                    {t('保存')}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setLibraryPreviewEditing(prev => {
                                                                                            const next = new Set(prev);
                                                                                            next.delete(entry.id);
                                                                                            return next;
                                                                                        });
                                                                                        setLibraryPreviewDrafts(prev => {
                                                                                            const { [entry.id]: _removed, ...rest } = prev;
                                                                                            return rest;
                                                                                        });
                                                                                    }}
                                                                                    className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                        ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                                        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                                                                                        }`}
                                                                                >
                                                                                    {t('取消')}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <pre className={`text-[9px] whitespace-pre-wrap ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                                            {JSON.stringify(previewPayload, null, 2)}
                                                                        </pre>
                                                                    )}
                                                                    <div className={`text-[9px] mt-2 mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('Python 示例')}</div>
                                                                    <pre className={`text-[9px] whitespace-pre-wrap ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                                        {previewPython}
                                                                    </pre>
                                                                    <div className="mt-3 pt-2 border-t border-dashed border-zinc-400/30">
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <div className={`text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('最终请求预览')}</div>
                                                                            <div className="flex items-center gap-2">
                                                                                <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={!!entry.requestOverrideEnabled}
                                                                                        onChange={(e) => updateModelLibraryEntry(entry.id, { requestOverrideEnabled: e.target.checked })}
                                                                                    />
                                                                                    <span>{t('修改覆盖')}</span>
                                                                                </label>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        if (isRequestPreviewEditing) {
                                                                                            setLibraryRequestPreviewEditing(prev => {
                                                                                                const next = new Set(prev);
                                                                                                next.delete(entry.id);
                                                                                                return next;
                                                                                            });
                                                                                            setLibraryRequestPreviewDrafts(prev => {
                                                                                                const { [entry.id]: _removed, ...rest } = prev;
                                                                                                return rest;
                                                                                            });
                                                                                        } else {
                                                                                            setLibraryRequestPreviewEditing(prev => {
                                                                                                const next = new Set(prev);
                                                                                                next.add(entry.id);
                                                                                                return next;
                                                                                            });
                                                                                            setLibraryRequestPreviewDrafts(prev => ({
                                                                                                ...prev,
                                                                                                [entry.id]: requestPreviewDisplay ? JSON.stringify(requestPreviewDisplay, null, 2) : ''
                                                                                            }));
                                                                                        }
                                                                                    }}
                                                                                    className={`p-1 rounded ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                                                    title={isRequestPreviewEditing ? t('取消编辑') : t('编辑请求')}
                                                                                >
                                                                                    <Edit3 size={12} className={isRequestPreviewEditing ? 'text-blue-500' : ''} />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        <div className={`text-[9px] mb-1 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>
                                                                            {uiText("模板状态：")}{requestTemplateEnabled ? t('已启用') : t('未启用')} · BodyType: {requestTemplateValue?.bodyType || 'json'} · Transport: {transportModeValue}
                                                                        </div>
                                                                        {isRequestPreviewEditing ? (
                                                                            <div className="space-y-2">
                                                                                <textarea
                                                                                    value={requestPreviewDraft}
                                                                                    onChange={(e) => setLibraryRequestPreviewDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                                                                    className={`w-full h-40 text-[9px] rounded px-2 py-1 border outline-none ${theme === 'dark'
                                                                                        ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                                                                                        : 'bg-white border-zinc-300 text-zinc-800'
                                                                                        }`}
                                                                                />
                                                                                <div className="flex items-center justify-end gap-2">
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            try {
                                                                                                const parsed = requestPreviewDraft ? JSON.parse(requestPreviewDraft) : {};
                                                                                                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                                                                                    throw new Error('请求预览必须是对象');
                                                                                                }
                                                                                                const patch = buildPreviewOverridePatch(requestPreviewDisplay || {}, parsed);
                                                                                                updateModelLibraryEntry(entry.id, { requestOverridePatch: patch });
                                                                                                setLibraryRequestPreviewEditing(prev => {
                                                                                                    const next = new Set(prev);
                                                                                                    next.delete(entry.id);
                                                                                                    return next;
                                                                                                });
                                                                                                setLibraryRequestPreviewDrafts(prev => {
                                                                                                    const { [entry.id]: _removed, ...rest } = prev;
                                                                                                    return rest;
                                                                                                });
                                                                                                showToast(uiText("请求覆盖已更新"), 'success', 2000);
                                                                                            } catch (e) {
                                                                                                showToast(uiText("请求预览 JSON 无效"), 'error', 2000);
                                                                                            }
                                                                                        }}
                                                                                        className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                            ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                                                                                            : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                                                                                            }`}
                                                                                    >
                                                                                        {t('保存')}
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setLibraryRequestPreviewEditing(prev => {
                                                                                                const next = new Set(prev);
                                                                                                next.delete(entry.id);
                                                                                                return next;
                                                                                            });
                                                                                            setLibraryRequestPreviewDrafts(prev => {
                                                                                                const { [entry.id]: _removed, ...rest } = prev;
                                                                                                return rest;
                                                                                            });
                                                                                        }}
                                                                                        className={`px-2 py-1 rounded text-[9px] ${theme === 'dark'
                                                                                            ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                                                                                            }`}
                                                                                    >
                                                                                        {t('取消')}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <pre className={`text-[9px] whitespace-pre-wrap ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                                                                {requestPreviewDisplay ? JSON.stringify(requestPreviewDisplay, null, 2) : uiText("请求模板为空")}
                                                                            </pre>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[9px] text-zinc-500">{uiText("提示：映射提示名仅用于展示，模型ID用于真实调用；不填写列表将使用默认限制。")}</p>
                                </div>
                            )}

                            <div className={`pt-2 flex justify-end gap-2 border-t mt-3 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                                <Button variant="secondary" onClick={() => setSettingsOpen(false)}>{t('关闭')}</Button>
                            </div>


                        </Modal>
    );
}
