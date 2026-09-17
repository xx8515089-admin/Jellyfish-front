import { canvasConfirm } from '../canvasDialogs';
import React from 'react';
import { Trash2 } from 'lucide-react';
import { isSameShotId, t } from '../freeCanvasShared';

const getPanelShellClass = (theme) => (
    `rounded-lg border p-3 space-y-3 ${theme === 'dark' ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'}`
);

const getMutedTextClass = (theme) => (
    theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'
);

const ModeButton = ({ active, theme, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className={`text-[10px] px-2 py-1 rounded ${active
            ? theme === 'dark'
                ? 'bg-blue-600/30 text-blue-300'
                : 'bg-blue-100 text-blue-600'
            : theme === 'dark'
                ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                : 'bg-zinc-100 text-zinc-500 hover:text-zinc-700'
            }`}
    >
        {children}
    </button>
);

const QueuePanel = ({
    theme,
    batchQueueMode,
    setBatchQueueMode,
    batchGroups,
    batchQueue,
    batchRunningItems,
    nodesMap,
    clearBatchQueue,
    removeQueuedBatchGroup,
    removeQueuedBatchItem,
    stopRunningShot
}) => {
    const groupMap = new Map();
    batchGroups.forEach(group => {
        groupMap.set(group.id, { ...group, queued: [], running: [] });
    });

    const getFallbackGroup = (item) => {
        const node = nodesMap.get(item.nodeId);
        const projectTitle = node?.settings?.projectTitle || '未命名分镜';
        const fallbackId = item.batchId || `legacy-${item.nodeId}`;
        if (!groupMap.has(fallbackId)) {
            groupMap.set(fallbackId, {
                id: fallbackId,
                nodeId: item.nodeId,
                projectTitle,
                total: 0,
                concurrency: item.batchConcurrency || 1,
                createdAt: Date.now(),
                mode: item.mode,
                taskIndex: item.taskIndex || 0,
                shotIds: [],
                queued: [],
                running: []
            });
        }
        return groupMap.get(fallbackId);
    };

    batchQueue.forEach(item => {
        const group = item.batchId && groupMap.has(item.batchId)
            ? groupMap.get(item.batchId)
            : getFallbackGroup(item);
        if (!group) return;
        if (!Array.isArray(group.queued)) group.queued = [];
        group.queued.push(item);
    });

    batchRunningItems.forEach(item => {
        const group = item.batchId && groupMap.has(item.batchId)
            ? groupMap.get(item.batchId)
            : getFallbackGroup(item);
        if (!group) return;
        if (!Array.isArray(group.running)) group.running = [];
        group.running.push(item);
    });

    const queueGroups = [...groupMap.values()]
        .filter(group => group.queued.length > 0 || group.running.length > 0)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const getShotLabel = (nodeId, shotId) => {
        const node = nodesMap.get(nodeId);
        const shot = node?.settings?.shots?.find(s => isSameShotId(s.id, shotId));
        return (shot?.description || shot?.prompt || '未命名镜头').trim();
    };

    return (
        <div className={getPanelShellClass(theme)}>
            <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>{t('全局队列')}</span>
                <div className="flex items-center gap-1">
                    <ModeButton
                        active={batchQueueMode === 'pipeline'}
                        theme={theme}
                        onClick={() => setBatchQueueMode('pipeline')}
                    >
                        {t('管线')}
                    </ModeButton>
                    <ModeButton
                        active={batchQueueMode === 'parallel'}
                        theme={theme}
                        onClick={() => setBatchQueueMode('parallel')}
                    >
                        {t('并行')}
                    </ModeButton>
                </div>
            </div>
            <div className={`text-[10px] ${getMutedTextClass(theme)}`}>
                运行 {batchRunningItems.length} · 排队 {batchQueue.length}
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={async () => {
                        if (batchQueue.length === 0) return;
                        if (await canvasConfirm(t('确定清空排队任务吗？'), { danger: true })) clearBatchQueue(false, { queued: batchQueue, running: batchRunningItems });
                    }}
                    className={`text-[10px] px-2 py-1 rounded ${theme === 'dark'
                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                >
                    {t('清空排队')}
                </button>
                <button
                    type="button"
                    onClick={async () => {
                        if (batchRunningItems.length === 0 && batchQueue.length === 0) return;
                        if (await canvasConfirm(t('确定终止所有生成并清空队列吗？'), { danger: true })) clearBatchQueue(true, { queued: batchQueue, running: batchRunningItems });
                    }}
                    className={`text-[10px] px-2 py-1 rounded ${theme === 'dark'
                        ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
                        : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                >
                    {t('终止全部')}
                </button>
            </div>
            {queueGroups.length === 0 ? (
                <div className={`text-xs text-center py-4 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    队列为空
                </div>
            ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {queueGroups.map(group => {
                        const concurrencyValue = Math.max(1, group.concurrency || 1);
                        const totalCount = group.total || (group.queued.length + group.running.length);
                        const totalRounds = Math.ceil(totalCount / concurrencyValue);
                        const pendingRounds = Math.ceil(group.queued.length / concurrencyValue);
                        const taskLabel = group.taskIndex ? `Task ${group.taskIndex}` : 'Task';
                        const combined = [
                            ...group.running.map(item => ({ ...item, status: 'running' })),
                            ...group.queued.map(item => ({ ...item, queueItem: item, status: 'queued' }))
                        ].sort((a, b) => (a.batchOrder ?? 0) - (b.batchOrder ?? 0));

                        return (
                            <div
                                key={group.id}
                                className={`rounded-lg border p-2 ${theme === 'dark'
                                    ? 'border-zinc-800 bg-zinc-900/60'
                                    : 'border-zinc-200 bg-zinc-50'}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                                            NODE - {group.projectTitle} · {taskLabel}
                                        </div>
                                        <div className={`text-[10px] mt-0.5 ${getMutedTextClass(theme)}`}>
                                            {totalCount} 总生成 · {concurrencyValue} 每批 · {totalRounds} 批次（排队 {pendingRounds} 轮）
                                        </div>
                                    </div>
                                    {group.queued.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (await canvasConfirm(t('确定移除该任务的排队内容吗？'), { danger: true })) removeQueuedBatchGroup(group.id, group.queued);
                                            }}
                                            className={`p-1 rounded ${theme === 'dark'
                                                ? 'text-zinc-500 hover:text-red-300'
                                                : 'text-zinc-400 hover:text-red-500'}`}
                                            title={t('移除任务排队')}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="mt-2 space-y-1">
                                    {combined.map((item, idx) => {
                                        const batchIndex = Math.floor((item.batchOrder ?? 0) / concurrencyValue) + 1;
                                        const shortLabel = group.taskIndex ? `T${group.taskIndex}B${batchIndex}` : `B${batchIndex}`;
                                        const shotLabel = getShotLabel(item.nodeId, item.shotId);
                                        const statusLabel = item.status === 'running' ? '运行' : '排队';
                                        return (
                                            <div
                                                key={`${group.id}-${item.nodeId}-${item.shotId}-${idx}`}
                                                className={`text-[10px] flex items-center justify-between gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}
                                            >
                                                <span className="truncate">
                                                    {shortLabel} · {shotLabel || `镜头${item.sceneIndex || ''}`}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <span className={item.status === 'running' ? 'text-green-500' : 'text-blue-400'}>
                                                        {statusLabel}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (item.status === 'running') {
                                                                if (await canvasConfirm(t('确定终止该生成任务吗？'), { danger: true })) stopRunningShot(item.nodeId, item.shotId, item);
                                                            } else if (await canvasConfirm(t('确定移除该排队任务吗？'), { danger: true })) {
                                                                removeQueuedBatchItem(item.nodeId, item.shotId, item);
                                                            }
                                                        }}
                                                        className={`p-0.5 rounded ${theme === 'dark'
                                                            ? 'text-zinc-500 hover:text-red-300'
                                                            : 'text-zinc-400 hover:text-red-500'}`}
                                                        title={item.status === 'running' ? '终止任务' : '移除任务'}
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const SwitchControl = ({ checked, disabled, theme, onClick }) => (
    <button
        type="button"
        className={`w-10 h-5 rounded-full relative transition-colors ${checked ? 'bg-green-600' : theme === 'solarized' ? 'bg-zinc-300' : 'bg-zinc-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={onClick}
        disabled={disabled}
    >
        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
);

const LocalCachePathInput = ({
    theme,
    label,
    value,
    field,
    serverField,
    normalizeLocalPath,
    setLocalServerConfig,
    updateLocalCacheServerConfig,
    pickLocalCachePath
}) => (
    <div>
        <label className="text-[10px] block mb-1 text-zinc-500">{label}</label>
        <div className="flex items-center gap-2">
            <input
                type="text"
                value={value || ''}
                onChange={(e) => {
                    const nextValue = normalizeLocalPath(e.target.value);
                    setLocalServerConfig(prev => ({ ...prev, [field]: nextValue }));
                }}
                onBlur={(e) => updateLocalCacheServerConfig({ [serverField]: normalizeLocalPath(e.target.value || '') })}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.currentTarget.blur();
                    }
                }}
                placeholder={t('默认使用 history')}
                className={`flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:border-blue-500 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300 placeholder-zinc-600' : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'}`}
            />
            <button
                type="button"
                onClick={() => pickLocalCachePath(field, serverField)}
                className={`px-2 py-1.5 text-[10px] rounded border ${theme === 'dark' ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200'}`}
            >
                {t('浏览')}
            </button>
        </div>
    </div>
);

const CachePanel = ({
    theme,
    localServerConfig,
    setLocalServerConfig,
    normalizeLocalPath,
    updateLocalCacheServerConfig,
    pickLocalCachePath,
    localCacheEnabled,
    setLocalCacheEnabled,
    cacheRedownloadOnEnable,
    setCacheRedownloadOnEnable,
    refreshLocalCache,
    rebuildAllHistoryThumbnails
}) => (
    <div className={getPanelShellClass(theme)}>
        <div className="space-y-2">
            <LocalCachePathInput
                theme={theme}
                label={t('图片保存路径')}
                value={localServerConfig.imageSavePath}
                field="imageSavePath"
                serverField="image_save_path"
                normalizeLocalPath={normalizeLocalPath}
                setLocalServerConfig={setLocalServerConfig}
                updateLocalCacheServerConfig={updateLocalCacheServerConfig}
                pickLocalCachePath={pickLocalCachePath}
            />
            <LocalCachePathInput
                theme={theme}
                label={t('视频保存路径')}
                value={localServerConfig.videoSavePath}
                field="videoSavePath"
                serverField="video_save_path"
                normalizeLocalPath={normalizeLocalPath}
                setLocalServerConfig={setLocalServerConfig}
                updateLocalCacheServerConfig={updateLocalCacheServerConfig}
                pickLocalCachePath={pickLocalCachePath}
            />
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-[10px] text-zinc-500">{t('启用本地缓存')}</span>
                    <div className="text-[9px] text-zinc-500 mt-0.5">{t('关闭后不再使用本地缓存并隐藏提示条')}</div>
                </div>
                <SwitchControl
                    checked={localCacheEnabled}
                    theme={theme}
                    onClick={() => setLocalCacheEnabled(prev => !prev)}
                />
            </div>
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-[10px] text-zinc-500">{t('启用缓存时重新下载')}</span>
                    <div className="text-[9px] text-zinc-500 mt-0.5">{t('开启后会忽略已存在文件')}</div>
                </div>
                <SwitchControl
                    checked={cacheRedownloadOnEnable}
                    theme={theme}
                    onClick={() => setCacheRedownloadOnEnable(prev => !prev)}
                />
            </div>
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">{t('PNG 转 JPG（省空间）')}</span>
                <SwitchControl
                    checked={localServerConfig.convertPngToJpg}
                    disabled={!localServerConfig.pilAvailable}
                    theme={theme}
                    onClick={() => {
                        if (!localServerConfig.pilAvailable) return;
                        const nextValue = !localServerConfig.convertPngToJpg;
                        setLocalServerConfig(prev => ({ ...prev, convertPngToJpg: nextValue }));
                        updateLocalCacheServerConfig({ convert_png_to_jpg: nextValue }, { silent: true });
                    }}
                />
            </div>
            {!localServerConfig.pilAvailable && (
                <div className="text-[9px] text-amber-400">{t('PIL 未安装，PNG 转 JPG 不可用')}</div>
            )}
            <button
                type="button"
                className={`w-full py-2 rounded text-[10px] font-medium transition-colors ${theme === 'dark'
                    ? 'bg-orange-600/30 text-orange-200 hover:bg-orange-600/40'
                    : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                    }`}
                onClick={refreshLocalCache}
            >
                {t('刷新缓存（重新下载到新路径）')}
            </button>
            <div className="text-[9px] text-zinc-500">
                {t('提示：设置路径后点击刷新缓存可将素材保存到新文件夹')}
            </div>
            <button
                type="button"
                className={`w-full py-2 rounded text-[10px] font-medium transition-colors ${theme === 'dark'
                    ? 'bg-blue-600/20 text-blue-200 hover:bg-blue-600/30'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                onClick={rebuildAllHistoryThumbnails}
            >
                {t('全部重建历史缩略图')}
            </button>
        </div>
    </div>
);

const HistoryToolsPanel = ({
    theme,
    historyQueuePanelOpen,
    historyCachePanelOpen,
    batchQueueMode,
    setBatchQueueMode,
    batchGroups,
    batchQueue,
    batchRunningItems,
    nodesMap,
    clearBatchQueue,
    removeQueuedBatchGroup,
    removeQueuedBatchItem,
    stopRunningShot,
    localServerConfig,
    setLocalServerConfig,
    normalizeLocalPath,
    updateLocalCacheServerConfig,
    pickLocalCachePath,
    localCacheEnabled,
    setLocalCacheEnabled,
    cacheRedownloadOnEnable,
    setCacheRedownloadOnEnable,
    refreshLocalCache,
    rebuildAllHistoryThumbnails
}) => {
    if (!historyQueuePanelOpen && !historyCachePanelOpen) return null;

    return (
        <div
            className={`sticky top-0 z-20 space-y-3 pb-3 ${theme === 'dark'
                ? 'bg-[#121214]'
                : theme === 'solarized'
                    ? 'bg-[#fdf6e3]'
                    : 'bg-zinc-50'
                }`}
        >
            {historyQueuePanelOpen && (
                <QueuePanel
                    theme={theme}
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
                />
            )}
            {historyCachePanelOpen && (
                <CachePanel
                    theme={theme}
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
            )}
        </div>
    );
};

export default HistoryToolsPanel;
