import { canvasAlert, canvasConfirm, canvasPrompt, canvasDialogStore } from './canvasDialogs';
import CanvasDialogHost from './components/CanvasDialogHost';
import { message } from 'antd'
import { bindCanvasPointerEvents } from './canvasPointerEvents'
import { canvasRequestId } from '../../../services/studioCanvases'
import { connectCanvasNodes, stableMediaNodes } from './canvasConnections'
import { buildConnectedNodeIOEnvelopeCache } from './canvasNodeIOCache'
import { filterVisibleCanvasNodes } from './canvasViewport'
import { useCanvasViewportBounds, useCanvasWheelZoom } from './hooks/useCanvasViewport'
import { insertPreviewMedia } from './canvasPreviewActions'
import { removeQueuedSnapshot, stopRunningSnapshot } from './canvasQueueSnapshots'
import { isCanvasInteractiveTarget } from './canvasInteractions'
import { buildConnectedVideoInputCache } from './canvasVideoInput';
import * as modelsActions from './actions/modelsActions';
import * as nodesActions from './actions/nodesActions';
import * as chatActions from './actions/chatActions';
import * as mediaActions from './actions/mediaActions';
import * as pollingActions from './actions/pollingActions';
import * as generationActions from './actions/generationActions';
import * as projectsActions from './actions/projectsActions';
import * as storyboardActions from './actions/storyboardActions';
import * as historyActions from './actions/historyActions';
import * as renderCanvasNode from './views/renderCanvasNode';
import TapnowAppView from './views/TapnowAppView';
import { canvasEditorScope } from '../canvasCache';
import { useCanvasCloud } from './useCanvasCloud';
import { canvasModelConfigs } from './canvasCloud';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { downloadSelectedHistory } from './downloadSelectedHistory_stub';
import { getConnectionGeometry } from './components/ConnectionLayer';
import { useRafNodeUpdates } from './hooks/useRafNodeUpdates';
import i18n, { normalizeCanvasLanguage, toReelmaxLanguage } from './i18n';
import { configureCanvasRuntime, createCanvasStorage, getCanvasDatabaseName } from './jellyfishRuntime';
import {
    DEFAULT_VIEW,
    t,
    LocalImageManager,
    normalizeDataUrl,
    normalizeBase64Payload,
    dataUrlToBlob,
    styles,
    IMAGE_TASK_TIMEOUT_MS,
    VIDEO_TASK_TIMEOUT_MS,
    DEFAULT_BASE_URL,
    DEFAULT_PROVIDERS,
    DEFAULT_API_CONFIGS,
    RATIOS,
    VIDEO_RES_OPTIONS,
    PROMPT_LIBRARY_KEY,
    GRID_PROMPT_TEXT,
    UPSCALE_PROMPT_TEXT,
    STORYBOARD_PROMPT_TEXT,
    CHARACTER_SHEET_PROMPT_TEXT,
    MOOD_BOARD_PROMPT_TEXT,
    DELETED_MODEL_IDS,
    isSameShotId,
    makeStoryboardShotFocusKey,
    materializeStoryboardOutputFromSnapshot,
    isStoryboardDebugEnabled,
    findStoryboardNodeById,
    resolveStoryboardShotCandidate,
    parseStoryboardSourceNodeId,
    NATIVE_MULTI_IMAGE_CAPABILITY_STORAGE_KEY,
    NODE_IO_ENVELOPE_VERSION,
    DEFAULT_MODEL_LIBRARY,
    getDefaultRatiosForModel,
    RESOLUTIONS,
    normalizeResolutionOption,
    normalizeImageResolution,
    normalizeNodeIOMediaType,
    isNodeIOEnvelopeValid,
    normalizeVideoResolution,
    isImageModelType,
    isChatModelType,
    MAX_CUSTOM_PARAMS,
    DEFAULT_STORYBOARD_SCRIPT_PROMPT,
    DEFAULT_STORYBOARD_NOVEL_PROMPT,
    DEFAULT_STORYBOARD_TABLE_SUMMARY_PROMPT,
    STORYBOARD_TABLE_PROMPT_MODE,
    STORYBOARD_LLM_PROMPT_MODES,
    STORYBOARD_PROMPT_SLOT_OPTIONS,
    STORYBOARD_EDITABLE_PROMPT_SLOT_KEYS,
    STORYBOARD_DEFAULT_TABLE_HEADERS,
    STORYBOARD_WORKSPACE_DEFAULT_HEIGHT,
    normalizeStoryboardWorkspaceHeight,
    normalizeStoryboardMode,
    parseStoryboardTableInput,
    stringifyMarkdownTable,
    getStoryboardTableShotColumnIndex,
    getStoryboardTablePromptColumnIndex,
    normalizeStoryboardSceneIndex,
    isCompletedLikeStatus,
    normalizeCustomParams,
    getDefaultRequestTemplateForEntry,
    isCustomParamInputMode,
    normalizeImageConcurrency,
    normalizePreviewOverridePatch,
    normalizeRequestTemplate,
    normalizeTransportMode,
    normalizeTransportOptions,
    normalizeCapabilitySchema,
    validateModelLibraryContract,
    normalizeRequestChain,
    normalizeModelLibraryEntry,
    normalizeRequestOverridePatch,
    getValueByPathLoose,
    getDefaultResolutionsForModel,
    AUTOSAVE_LOCAL_KEY,
    AUTOSAVE_META_KEY,
    AUTOSAVE_IDB_NAME,
    AUTOSAVE_IDB_STORE,
    readAssetBundleMeta,
    writeAssetBundleMeta,
    AUTOSAVE_IDB_KEY,
    openAutoSaveDb,
    readAutoSaveFromIdb,
    writeAutoSaveToIdb,
    readAutoSaveMeta,
    writeAutoSaveMeta,
    getImageDimensions,
    isVideoUrl,
    getVideoMetadata,
    extractKeyFrames,
    debounce
} from './freeCanvasShared';
import './components/CanvasNodes.css';
import './components/DescriptionNode.css';









// V3.5.20-1：直接导入图标以提升性能，避免包装组件的额外开销

















function TapnowApp({ cloudDocument, cloudModels = [], cloudCapabilities = {}, cloudTextModels = [], onRefreshCloudModels, workspaceId = 'default', workspaceName = '', language: appLanguage, onLanguageChange, onWorkspaceChanged } = {}) {
    const storageScope = cloudDocument ? canvasEditorScope(String(cloudDocument.canvasId)) : workspaceId;
    const localStorage = useMemo(
        () => createCanvasStorage(storageScope, onWorkspaceChanged),
        [storageScope, onWorkspaceChanged]
    );
    configureCanvasRuntime(storageScope, onWorkspaceChanged);
    LocalImageManager.setWorkspace(storageScope);
    const defaultProjectName = workspaceName || '\u672a\u547d\u540d\u9879\u76ee';
    const [arrangeMessage, arrangeMessageContext] = message.useMessage();
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem('tapnow_theme') || 'dark';
        } catch (e) {
            return 'dark';
        }
    });
    const [language, setLanguage] = useState(() => normalizeCanvasLanguage(appLanguage || i18n.language));

    const handleLanguageChange = useCallback((nextLanguage, notifyHost = true) => {
        const normalizedLanguage = normalizeCanvasLanguage(nextLanguage);
        if (i18n.language !== normalizedLanguage) {
            void i18n.changeLanguage(normalizedLanguage);
        }
        setLanguage(prev => prev === normalizedLanguage ? prev : normalizedLanguage);
        if (notifyHost && typeof onLanguageChange === 'function') {
            onLanguageChange(toReelmaxLanguage(normalizedLanguage));
        }
    }, [onLanguageChange]);

    useEffect(() => {
        if (!appLanguage) return;
        handleLanguageChange(appLanguage, false);
    }, [appLanguage, handleLanguageChange]);

    // V3.7.27: Toast 通知系统
    const [toasts, setToasts] = useState([]);
    const toastTimersRef = useRef(new Map());
    const showToast = useCallback((message, type = 'info', duration = 3000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
        const timer = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
            toastTimersRef.current.delete(id);
        }, duration);
        toastTimersRef.current.set(id, timer);
        return id;
    }, []);
    const dismissToast = useCallback((id) => {
        if (!id) return;
        const timer = toastTimersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            toastTimersRef.current.delete(id);
        }
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);
    useEffect(() => {
        return () => {
            toastTimersRef.current.forEach((timer) => clearTimeout(timer));
            toastTimersRef.current.clear();
        };
    }, []);

    useEffect(() => {
        const styleSheet = document.createElement('style');
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
        return () => { document.head.removeChild(styleSheet); };
    }, []);

    useEffect(() => {
        window.__APP_BOOTED__ = true;
        if (window.__APP_BOOT_TIMER__) {
            clearTimeout(window.__APP_BOOT_TIMER__);
            window.__APP_BOOT_TIMER__ = null;
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('tapnow_theme', theme);
        } catch (e) { }
        const root = document.documentElement;
        const previousBodyBackground = document.body.style.backgroundColor;
        root.classList.remove('theme-dark', 'theme-light', 'theme-solarized');
        root.classList.add(`theme-${theme}`);
        document.body.style.backgroundColor = theme === 'dark'
            ? '#09090b'
            : theme === 'solarized'
                ? '#fdf6e3'
                : '#f4f4f5';

        return () => {
            root.classList.remove('theme-dark', 'theme-light', 'theme-solarized');
            document.body.style.backgroundColor = previousBodyBackground;
        };
    }, [theme, localStorage]);

    const autoSaveUseIdbRef = useRef(false);
    useEffect(() => {
        const meta = readAutoSaveMeta();
        autoSaveUseIdbRef.current = meta?.storage === 'idb';
    }, []);
    useEffect(() => {
        if (cloudDocument) return;
        const meta = readAssetBundleMeta();
        if (!meta) return;
        const idToOriginal = meta.idToOriginal || {};
        const pathToOriginal = meta.pathToOriginal || {};
        const pathToId = meta.pathToId || {};
        const effectivePathToId = { ...pathToId };
        Object.entries(idToOriginal).forEach(([id, url]) => {
            if (id && url) assetBundleIdToOriginalRef.current.set(id, url);
        });
        Object.entries(pathToOriginal).forEach(([path, url]) => {
            if (path && url) assetBundlePathToOriginalRef.current.set(path, url);
        });
        if (Object.keys(effectivePathToId).length === 0 && Object.keys(idToOriginal).length > 0 && Object.keys(pathToOriginal).length > 0) {
            const originalToId = new Map(Object.entries(idToOriginal).map(([id, url]) => [url, id]));
            Object.entries(pathToOriginal).forEach(([path, url]) => {
                if (!path || !url) return;
                const mappedId = originalToId.get(url);
                if (mappedId) effectivePathToId[path] = mappedId;
            });
        }
        Object.entries(effectivePathToId).forEach(([path, id]) => {
            if (path && id) assetBundlePathToIdRef.current.set(path, id);
        });
        if (Object.keys(idToOriginal).length > 0 || Object.keys(pathToOriginal).length > 0 || Object.keys(effectivePathToId).length > 0) {
            setAssetBundleActive(true);
        }
    }, []);

    // V3.5.12-a：每 60 秒自动保存一次，防止内存溢出导致数据丢失
    useEffect(() => {
        // Cloud documents use the explicit cloud draft flow, never the legacy autosave loader.
        if (cloudDocument) return;
        let cancelled = false;
        const databaseName = getCanvasDatabaseName(AUTOSAVE_IDB_NAME);
        const saveInterval = setInterval(() => {
            const saveAuto = async () => {
                const timestamp = Date.now();
                const safeNodes = await sanitizeObjectForAutoSave(nodesRef.current);
                if (cancelled) return;
                const saveData = {
                    nodes: safeNodes,
                    connections: connectionsRef.current,
                    timestamp
                };
                const payload = JSON.stringify(saveData);
                try {
                    await writeAutoSaveToIdb(payload, databaseName);
                    if (cancelled) return;
                    autoSaveUseIdbRef.current = true;
                    localStorage.setItem(AUTOSAVE_META_KEY, JSON.stringify({ timestamp, storage: 'idb' }));
                    try { localStorage.removeItem(AUTOSAVE_LOCAL_KEY); } catch (e) { }
                    console.log('[AutoSave] 已写入 IndexedDB', new Date().toLocaleTimeString());
                } catch (e) {
                    if (cancelled) return;
                    try {
                        if (payload.length > 4 * 1024 * 1024) {
                            throw new Error('payload too large');
                        }
                        localStorage.setItem(AUTOSAVE_LOCAL_KEY, payload);
                        autoSaveUseIdbRef.current = false;
                        localStorage.setItem(AUTOSAVE_META_KEY, JSON.stringify({ timestamp, storage: 'local' }));
                        console.log('[AutoSave] IndexedDB 失败，已降级本地存储', new Date().toLocaleTimeString());
                    } catch (err) {
                        console.warn('[AutoSave] 自动保存失败:', err.message || err);
                    }
                }
            };
            saveAuto();
        }, 60000); // 60 seconds

        return () => { cancelled = true; clearInterval(saveInterval); };
    }, []);

    // V3.5.12-a：离开页面前发出警告，防止意外丢失数据
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            // 仅当画布中存在节点时才发出警告
            if (nodesRef.current && nodesRef.current.length > 0) {
                e.preventDefault();
                e.returnValue = '您有未保存的更改，确定要离开吗？';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const [nodes, setNodes] = useState(() => {
        if (cloudDocument) return cloudDocument.project.nodes || [];
        try {
            const meta = readAutoSaveMeta();
            if (meta?.storage === 'idb') return [];
            const saved = localStorage.getItem(AUTOSAVE_LOCAL_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed.nodes || [];
            }
            // 兼容旧版存储格式
            const legacy = localStorage.getItem('tapnow_nodes');
            return legacy ? JSON.parse(legacy) : [];
        } catch (e) { return []; }
    });
    const [connections, setConnections] = useState(() => {
        if (cloudDocument) return cloudDocument.project.connections || [];
        try {
            const meta = readAutoSaveMeta();
            if (meta?.storage === 'idb') return [];
            const saved = localStorage.getItem(AUTOSAVE_LOCAL_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed.connections || [];
            }
            // 兼容旧版存储格式
            const legacy = localStorage.getItem('tapnow_connections');
            return legacy ? JSON.parse(legacy) : [];
        } catch (e) { return []; }
    });

    useEffect(() => {
        const meta = readAutoSaveMeta();
        if (cloudDocument || meta?.storage !== 'idb') return;
        let cancelled = false;
        const loadAutoSave = async () => {
            const saved = await readAutoSaveFromIdb();
            if (!saved || cancelled) return;
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.nodes)) setNodes(parsed.nodes);
                if (Array.isArray(parsed.connections)) setConnections(parsed.connections);
            } catch (e) { }
        };
        loadAutoSave();
        return () => { cancelled = true; };
    }, []);

    // === V3.4.7: Undo/Redo 功能 (可配置步数) ===
    const [maxUndoSteps, setMaxUndoSteps] = useState(() => {
        const saved = localStorage.getItem('tapnow_max_undo_steps');
        return saved ? Math.min(30, Math.max(1, parseInt(saved) || 5)) : 5;
    });
    const [undoStack, setUndoStack] = useState([]); // { nodes, connections }[]
    const [redoStack, setRedoStack] = useState([]);
    const isUndoRedoRef = useRef(false); // 防止 undo/redo 操作本身被记录

    // V3.5.20：视频关键帧和分镜的拖拽插入状态
    const [dragInsertNodeId, setDragInsertNodeId] = useState(null);
    const [dragInsertIndex, setDragInsertIndex] = useState(null);
    const [dragOverNodeId, setDragOverNodeId] = useState(null); // V3.5.22：修复 ReferenceError

    // V3.5.24：批量生成状态
    const [batchQueue, setBatchQueue] = useState([]); // 数组元素结构：{nodeId, shotId, retryCount}
    const [batchGroups, setBatchGroups] = useState([]); // 批次分组元数据
    const batchTaskCounterRef = useRef(new Map()); // 映射关系：nodeId -> taskIndex
    const shotBatchMapRef = useRef(new Map()); // 键：nodeId:shotId；值：{ batchId, batchOrder, taskIndex }
    const [batchQueueMode, setBatchQueueMode] = useState(() => {
        try {
            return localStorage.getItem('tapnow_batch_queue_mode') || 'parallel';
        } catch (e) {
            return 'parallel';
        }
    });
    const [batchTick, setBatchTick] = useState(0); // 冷却结束后用于触发下一批任务
    const [batchConcurrency, setBatchConcurrency] = useState(() => parseInt(localStorage.getItem('tapnow_batch_concurrency') || '1')); // 默认值为 1
    const pendingStartsRef = useRef(new Set()); // 跟踪已经开始但节点尚未进入“生成中”的项目
    const batchStateRef = useRef('idle'); // 'idle' | 'running' | 'cooling'

    // 将批量并发数保存到 localStorage
    useEffect(() => {
        localStorage.setItem('tapnow_batch_concurrency', batchConcurrency);
    }, [batchConcurrency]);

    useEffect(() => {
        localStorage.setItem('tapnow_batch_queue_mode', batchQueueMode);
    }, [batchQueueMode]);

    // 保存当前状态到撤销栈
    const saveToUndoStack = useCallback(() => {
        if (isUndoRedoRef.current) return; // undo/redo 操作不记录
        setUndoStack(prev => {
            const newStack = [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), connections: JSON.parse(JSON.stringify(connections)) }];
            // 限制最多保存 maxUndoSteps 步
            return newStack.slice(-maxUndoSteps);
        });
        setRedoStack([]); // 有新操作时清空 redo 栈
    }, [nodes, connections]);

    // 使用 ref 来解决 useEffect 闭包问题
    const saveToUndoStackRef = useRef(saveToUndoStack);
    useEffect(() => {
        saveToUndoStackRef.current = saveToUndoStack;
    }, [saveToUndoStack]);

    // V3.5.24：批量队列处理器
    // V3.7.26：严格按批次处理队列，每批完成后等待 1 秒
    // V3.7.29：增强状态机逻辑并补充调试日志
    useEffect(() => {
        // 1. 计算当前正在执行的镜头数
        let currentGeneratingCount = 0;
        const stuckTasks = []; // V3.7.27: 检测卡住的任务
        const now = Date.now();

        nodes.forEach(n => {
            if (n.settings?.shots) {
                n.settings.shots.forEach(s => {
                    if (s.status === 'generating') {
                        currentGeneratingCount++;
                        // V3.7.27: 检测超时任务
                        const mode = normalizeStoryboardMode(n.settings?.mode);
                        const taskTimeoutMs = mode === 'image' ? IMAGE_TASK_TIMEOUT_MS : VIDEO_TASK_TIMEOUT_MS;
                        if (s.generationStartTime && (now - s.generationStartTime) > taskTimeoutMs) {
                            stuckTasks.push({ nodeId: n.id, shotId: s.id, timeoutMs: taskTimeoutMs });
                        }
                    }
                    // 清理等待启动的任务
                    const key = `${n.id}:${s.id}`;
                    if (pendingStartsRef.current.has(key)) {
                        if (s.status === 'generating' || s.status === 'done' || s.status === 'failed') {
                            pendingStartsRef.current.delete(key);
                        }
                    }
                });
            }
        });

        // V3.7.27: 自动标记超时任务为 failed，防止队列阻塞
        if (stuckTasks.length > 0) {
            console.warn(`[Batch] ${stuckTasks.length} tasks timed out (image>${IMAGE_TASK_TIMEOUT_MS / 1000}s, video>${VIDEO_TASK_TIMEOUT_MS / 1000}s). Auto-marking as failed.`);
            stuckTasks.forEach(({ nodeId, shotId, timeoutMs }) => {
                const timeoutSeconds = Math.round((timeoutMs || IMAGE_TASK_TIMEOUT_MS) / 1000);
                // V3.7.29: 使用条件更新，防止覆盖已完成的状态
                updateShot(nodeId, shotId, { status: 'failed', errorMsg: `任务超时（${timeoutSeconds}s）` }, { onlyIfStatus: 'generating' });
            });
            currentGeneratingCount -= stuckTasks.length;
        }

        // 加入等待启动的任务，即已触发但尚未进入生成状态的任务
        const totalActive = currentGeneratingCount + pendingStartsRef.current.size;

        if (batchQueue.length === 0) {
            if (totalActive === 0) {
                batchStateRef.current = 'idle';
                pendingStartsRef.current.clear(); // V3.7.29: 清理挂起任务
            }
            return;
        }

        // 2. 状态机逻辑
        if (totalActive > 0) {
            batchStateRef.current = 'running';
            return; // 等待当前批次完成
        }

        // 当 totalActive 为 0 时：
        if (batchStateRef.current === 'running') {
            // 表示刚刚完成一个批次
            batchStateRef.current = 'cooling';
            setTimeout(() => {
                batchStateRef.current = 'idle';
                setBatchTick(t => t + 1); // 触发下一批任务
            }, 1000);
            return;
        }

        if (batchStateRef.current === 'cooling') {
            return; // 仍处于冷却阶段
        }

        // 3. 状态为 idle 时启动下一批任务
        const batchSize = batchConcurrency === 0 ? batchQueue.length : batchConcurrency;
        const toProcess = batchQueue.slice(0, batchSize);
        const remaining = batchQueue.slice(batchSize);

        if (toProcess.length > 0) {

            // 先更新队列
            setBatchQueue(remaining);

            // 标记为严格批次执行状态
            batchStateRef.current = 'running';

            // 同一批内并发触发，延迟仅发生在批次之间
            toProcess.forEach((item) => {
                pendingStartsRef.current.add(`${item.nodeId}:${item.shotId}`);

                // 查找对应的镜头对象
                const currentNode = nodes.find(n => n.id === item.nodeId);
                const currentShot = currentNode?.settings?.shots?.find(s => isSameShotId(s.id, item.shotId));

                if (currentShot) {
                    if (item.mode === 'image') {
                        generateSingleImage(item.nodeId, currentShot);
                    } else {
                        generateSingleShot(item.nodeId, currentShot);
                    }
                }
            });
        }
    }, [batchQueue, nodes, batchConcurrency, batchTick]);

    // V3.7.27: 周期性触发队列检查，防止因状态更新遗漏导致的阻塞
    useEffect(() => {
        const hasGenerating = nodes.some(n => (n.settings?.shots || []).some(s => s.status === 'generating'));
        const hasPendingStarts = pendingStartsRef.current.size > 0;
        if (batchQueue.length === 0 && !hasGenerating && !hasPendingStarts) return;
        const interval = setInterval(() => {
            setBatchTick(t => t + 1);
        }, 5000); // 每5秒检查一次
        return () => clearInterval(interval);
    }, [batchQueue.length, nodes]);

    const clearBatchQueue = useCallback((stopRunning = false, snapshot) => {
        if (snapshot) {
            setBatchQueue(prev => removeQueuedSnapshot(prev, snapshot.queued));
            if (stopRunning) setNodes(prev => stopRunningSnapshot(prev, snapshot.running));
            return;
        }
        setBatchQueue([]);
        pendingStartsRef.current.clear();
        batchStateRef.current = 'idle';
        shotBatchMapRef.current.clear();

        if (!stopRunning) return;

        setNodes(prev => prev.map(n => {
            if (n.type !== 'storyboard-node') return n;
            const shots = n.settings?.shots || [];
            let changed = false;
            const updatedShots = shots.map(s => {
                if (s.status === 'generating') {
                    changed = true;
                    return { ...s, status: 'failed', errorMsg: '已手动终止' };
                }
                return s;
            });
            if (!changed) return n;
            return { ...n, settings: { ...n.settings, shots: updatedShots } };
        }));
    }, [setBatchQueue, setNodes]);

    const removeQueuedBatchItem = useCallback((nodeId, shotId, snapshot) => {
        if (snapshot) {
            setBatchQueue(prev => removeQueuedSnapshot(prev, [snapshot]));
            return;
        }
        setBatchQueue(prev => prev.filter(item => !(item.nodeId === nodeId && item.shotId === shotId)));
        pendingStartsRef.current.delete(`${nodeId}:${shotId}`);
        updateShot(nodeId, shotId, { status: 'draft', errorMsg: '' });
    }, [setBatchQueue]);

    const stopRunningShot = useCallback((nodeId, shotId, snapshot) => {
        if (snapshot) {
            setNodes(prev => stopRunningSnapshot(prev, [snapshot]));
            return;
        }
        updateShot(nodeId, shotId, { status: 'failed', errorMsg: '已手动终止' });
    }, []);

    const removeQueuedBatchGroup = useCallback((batchId, snapshotItems) => {
        if (snapshotItems) {
            setBatchQueue(prev => removeQueuedSnapshot(prev, snapshotItems));
            return;
        }
        setBatchQueue(prev => prev.filter(item => {
            if (item.batchId !== batchId) return true;
            pendingStartsRef.current.delete(`${item.nodeId}:${item.shotId}`);
            shotBatchMapRef.current.delete(`${item.nodeId}:${item.shotId}`);
            updateShot(item.nodeId, item.shotId, { status: 'draft', errorMsg: '' });
            return false;
        }));
    }, [setBatchQueue]);

    const clearNodeQueue = useCallback((nodeId, stopRunning = false, snapshot) => {
        if (snapshot) {
            setBatchQueue(prev => removeQueuedSnapshot(prev, (snapshot.queued || []).filter(item => item.nodeId === nodeId)));
            if (stopRunning) setNodes(prev => stopRunningSnapshot(prev, (snapshot.running || []).filter(item => item.nodeId === nodeId)));
            return;
        }
        setBatchQueue(prev => prev.filter(item => {
            if (item.nodeId !== nodeId) return true;
            pendingStartsRef.current.delete(`${item.nodeId}:${item.shotId}`);
            shotBatchMapRef.current.delete(`${item.nodeId}:${item.shotId}`);
            return false;
        }));

        if (!stopRunning) return;
        setNodes(prev => prev.map(n => {
            if (n.id !== nodeId || n.type !== 'storyboard-node') return n;
            const shots = n.settings?.shots || [];
            let changed = false;
            const updatedShots = shots.map(s => {
                if (s.status === 'generating') {
                    changed = true;
                    return { ...s, status: 'failed', errorMsg: '已手动终止' };
                }
                return s;
            });
            if (!changed) return n;
            return { ...n, settings: { ...n.settings, shots: updatedShots } };
        }));
    }, [setBatchQueue, setNodes]);

    const batchQueueItems = useMemo(() => {
        return batchQueue.map((item, idx) => {
            const node = nodes.find(n => n.id === item.nodeId);
            const shots = node?.settings?.shots || [];
            const shotIndex = shots.findIndex(s => s.id === item.shotId);
            const shot = shotIndex >= 0 ? shots[shotIndex] : null;
            return {
                ...item,
                queueItem: item,
                order: idx + 1,
                projectTitle: node?.settings?.projectTitle || '未命名分镜',
                sceneIndex: shot?.scene_index || (shotIndex >= 0 ? shotIndex + 1 : '?'),
                taskIndex: item.taskIndex,
                batchId: item.batchId,
                batchOrder: item.batchOrder,
                batchConcurrency: item.batchConcurrency
            };
        });
    }, [batchQueue, nodes]);

    const batchRunningItems = useMemo(() => {
        const running = [];
        nodes.forEach(n => {
            if (n.type !== 'storyboard-node') return;
            const shots = n.settings?.shots || [];
            shots.forEach((s, idx) => {
                if (s.status !== 'generating') return;
                const batchMeta = shotBatchMapRef.current.get(`${n.id}:${s.id}`) || {};
                running.push({
                    nodeId: n.id,
                    shotId: s.id,
                    shot: s,
                    generationStartTime: s.generationStartTime,
                    projectTitle: n.settings?.projectTitle || '未命名分镜',
                    sceneIndex: s.scene_index || idx + 1,
                    batchId: batchMeta.batchId,
                    batchOrder: batchMeta.batchOrder,
                    taskIndex: batchMeta.taskIndex
                });
            });
        });
        return running;
    }, [nodes]);

    useEffect(() => {
        const activeKeys = new Set();
        batchQueue.forEach(item => {
            activeKeys.add(`${item.nodeId}:${item.shotId}`);
        });
        nodes.forEach(n => {
            if (n.type !== 'storyboard-node') return;
            const shots = n.settings?.shots || [];
            shots.forEach(s => {
                if (s.status === 'generating') {
                    activeKeys.add(`${n.id}:${s.id}`);
                }
            });
        });

        if (activeKeys.size === 0) {
            shotBatchMapRef.current.clear();
            setBatchGroups([]);
            return;
        }

        shotBatchMapRef.current.forEach((value, key) => {
            if (!activeKeys.has(key)) shotBatchMapRef.current.delete(key);
        });

        setBatchGroups(prev => prev.filter(group =>
            group.shotIds.some(shotId => activeKeys.has(`${group.nodeId}:${shotId}`))
        ));
    }, [batchQueue, nodes]);

    // 撤销操作
    const undo = useCallback(() => {
        if (undoStack.length === 0) return;
        isUndoRedoRef.current = true;
        const lastState = undoStack[undoStack.length - 1];
        // 当前状态入 redo 栈
        setRedoStack(prev => [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), connections: JSON.parse(JSON.stringify(connections)) }]);
        // 恢复上一个状态
        setNodes(lastState.nodes);
        setConnections(lastState.connections);
        // 移除已使用的状态
        setUndoStack(prev => prev.slice(0, -1));
        setTimeout(() => { isUndoRedoRef.current = false; }, 100);
    }, [undoStack, nodes, connections]);

    // 重做操作
    const redo = useCallback(() => {
        if (redoStack.length === 0) return;
        isUndoRedoRef.current = true;
        const nextState = redoStack[redoStack.length - 1];
        // 当前状态入 undo 栈
        setUndoStack(prev => [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), connections: JSON.parse(JSON.stringify(connections)) }]);
        // 恢复下一个状态
        setNodes(nextState.nodes);
        setConnections(nextState.connections);
        // 移除已使用的状态
        setRedoStack(prev => prev.slice(0, -1));
        setTimeout(() => { isUndoRedoRef.current = false; }, 100);
    }, [redoStack, nodes, connections]);

    // 快捷键监听
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (canvasDialogStore.getSnapshot()) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);
    // === 撤销/重做功能结束 ===
    const [view, setView] = useState(() => ({ ...(cloudDocument?.project.view || DEFAULT_VIEW) }));
    const normalizeViewState = (candidate) => {
        if (!candidate || typeof candidate !== 'object') return { ...DEFAULT_VIEW };
        const x = Number.isFinite(candidate.x) ? candidate.x : DEFAULT_VIEW.x;
        const y = Number.isFinite(candidate.y) ? candidate.y : DEFAULT_VIEW.y;
        const zoom = Number.isFinite(candidate.zoom) && candidate.zoom > 0 ? candidate.zoom : DEFAULT_VIEW.zoom;
        return { x, y, zoom };
    };
    // 性能优化：使用 ref 存储 view 和拖拽状态，避免频繁 setState
    const viewRef = useRef(view);
    const dragOffsetRef = useRef(new Map()); // 映射关系：nodeId -> { x, y }
    const dragStartPosRef = useRef(new Map()); // 映射关系：nodeId -> { x, y }
    const [selectedNodeId, setSelectedNodeId] = useState(null);

    const normalizeProviderConfig = (providerKey, config = {}) => {
        const defaults = DEFAULT_PROVIDERS[providerKey] || {
            key: '',
            url: DEFAULT_BASE_URL,
            apiType: 'openai',
            useProxy: false,
            forceAsync: false
        };
        return {
            ...defaults,
            ...config,
            enabled: config?.enabled !== false
        };
    };

    const [modelLibrary, setModelLibrary] = useState(() => {
        const saved = localStorage.getItem('tapnow_model_library');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map((entry, idx) => normalizeModelLibraryEntry(entry, idx))
                        .filter(Boolean);
                }
            } catch (e) {
                console.error('加载 modelLibrary 配置失败:', e);
            }
        }
    return DEFAULT_MODEL_LIBRARY.map((entry) => ({ ...entry }));
});
    const collapsedLibraryStateLoadedRef = useRef(false);
    const [collapsedLibraryModels, setCollapsedLibraryModels] = useState(() => {
        const saved = localStorage.getItem('tapnow_model_library_collapsed');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    collapsedLibraryStateLoadedRef.current = true;
                    return new Set(parsed.filter(Boolean));
                }
            } catch (e) {
                console.warn('加载模型库折叠状态失败:', e);
            }
        }
        return new Set();
    });
    useEffect(() => {
        try {
            localStorage.setItem('tapnow_model_library', JSON.stringify(modelLibrary));
        } catch (e) {
            console.error('保存 modelLibrary 配置失败:', e);
        }
    }, [modelLibrary]);
    useEffect(() => {
        if (!modelLibrary.length) return;
        setCollapsedLibraryModels(prev => {
            const next = new Set();
            const hasStoredState = collapsedLibraryStateLoadedRef.current;
            modelLibrary.forEach((entry) => {
                if (prev.has(entry.id)) {
                    next.add(entry.id);
                } else if (!hasStoredState) {
                    // 初次加载时默认全部折叠
                    next.add(entry.id);
                }
            });
            collapsedLibraryStateLoadedRef.current = true;
            return next;
        });
    }, [modelLibrary]);

    useEffect(() => {
        try {
            const payload = Array.from(collapsedLibraryModels);
            localStorage.setItem('tapnow_model_library_collapsed', JSON.stringify(payload));
        } catch (e) {
            console.error('保存模型库折叠状态失败:', e);
        }
    }, [collapsedLibraryModels]);
    const [nativeMultiImageCapabilities, setNativeMultiImageCapabilities] = useState(() => {
        try {
            const saved = localStorage.getItem(NATIVE_MULTI_IMAGE_CAPABILITY_STORAGE_KEY);
            if (!saved) return {};
            const parsed = JSON.parse(saved);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            return parsed;
        } catch (e) {
            return {};
        }
    });
    const nativeMultiImageCapabilitiesRef = useRef(nativeMultiImageCapabilities);
    useEffect(() => {
        nativeMultiImageCapabilitiesRef.current = nativeMultiImageCapabilities;
        try {
            localStorage.setItem(
                NATIVE_MULTI_IMAGE_CAPABILITY_STORAGE_KEY,
                JSON.stringify(nativeMultiImageCapabilities)
            );
        } catch (e) { }
    }, [nativeMultiImageCapabilities]);
    const getNativeMultiImageCapabilityKey = useCallback((modelId, configLike = null) => {
        const provider = String(configLike?.provider || 'unknown').trim().toLowerCase() || 'unknown';
        const apiType = String(configLike?.apiType || 'openai').trim().toLowerCase() || 'openai';
        const id = String(modelId || configLike?.id || configLike?.modelName || '').trim().toLowerCase();
        if (!id) return '';
        return `${provider}::${apiType}::${id}`;
    }, []);
    const getNativeMultiImageCapabilityStatus = useCallback((modelId, configLike = null) => {
        const key = getNativeMultiImageCapabilityKey(modelId, configLike);
        if (!key) return '';
        const entry = nativeMultiImageCapabilitiesRef.current?.[key];
        const status = String(entry?.status || '').trim().toLowerCase();
        return status === 'supported' || status === 'unsupported' ? status : '';
    }, [getNativeMultiImageCapabilityKey]);
    const updateNativeMultiImageCapability = useCallback((modelId, configLike, nextStatus, evidence = null) => {
        const key = getNativeMultiImageCapabilityKey(modelId, configLike);
        if (!key) return;
        const normalizedStatus = String(nextStatus || '').trim().toLowerCase();
        if (normalizedStatus !== 'supported' && normalizedStatus !== 'unsupported') return;
        setNativeMultiImageCapabilities((prev) => {
            const current = prev?.[key];
            if (current?.status === normalizedStatus) return prev;
            return {
                ...(prev || {}),
                [key]: {
                    status: normalizedStatus,
                    updatedAt: Date.now(),
                    modelId: String(modelId || configLike?.id || ''),
                    provider: String(configLike?.provider || ''),
                    apiType: String(configLike?.apiType || ''),
                    evidence: evidence && typeof evidence === 'object' ? evidence : null
                }
            };
        });
    }, [getNativeMultiImageCapabilityKey]);

    const [apiConfigs, setApiConfigs] = useState(() => {
        if (cloudDocument) return canvasModelConfigs(cloudModels);
        const saved = localStorage.getItem('tapnow_api_configs');

        // V3.6.0: 如果有存量数据，直接使用（不再合并默认模型）
        if (saved) {
            try {
                let configs = JSON.parse(saved);

                // V3.6.0 迁移：将旧格式转换为新格式
                configs = configs.map(config => {
                    const normalized = {
                        ...config,
                        id: config.id || config.modelName,
                        provider: config.provider,
                        type: config.type || 'Chat',
                        modelName: config.modelName || config.id,
                        displayName: config.displayName || config.modelName || config.id,
                        ...(config.durations ? { durations: config.durations } : {})
                    };
                    const { key, url, isCustom, ...rest } = normalized;
                    return rest;
                });

                // 过滤掉已删除的模型配置
                configs = configs.filter(c => !DELETED_MODEL_IDS.includes(c.id));

                // V3.7.22: 允许同名模型共存（不再按 id 去重）
                const existingIds = new Set(configs.map(c => c.id).filter(Boolean));

                // V3.7.24: 确保 Chat 模型存在（旧版本可能没有 Chat 类型）
                const chatModels = DEFAULT_API_CONFIGS.filter(m => isChatModelType(m.type));
                chatModels.forEach(m => {
                    if (!existingIds.has(m.id)) {
                        configs.push(m);
                        existingIds.add(m.id);
                    }
                });

                // V3.8.2：确保每项配置都有唯一的内部 ID，以保证界面渲染稳定
                // 避免编辑 ID 时输入框意外失去焦点
                configs = configs.map(c => c._uid ? c : { ...c, _uid: `uid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` });

                return configs;
            } catch (e) {
                console.error('[V3.6.0] 迁移 apiConfigs 失败:', e);
            }
        }

        // V3.6.0: 首次加载才使用默认模型
        return DEFAULT_API_CONFIGS.map(c => ({ ...c, _uid: `uid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }));
    });

    useEffect(() => {
        if (cloudDocument) setApiConfigs(canvasModelConfigs(cloudModels));
    }, [cloudDocument, cloudModels]);

    // V3.3：供应商状态管理
    // V3.4.18：使用 _deleted 标记追踪已删除的供应商
    const [providers, setProviders] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_providers');
            if (saved) {
                const parsed = JSON.parse(saved);
                // 直接使用用户保存的数据，不再自动补充默认供应商
                // 用户删除供应商后，该供应商不会再次出现
                return Object.fromEntries(Object.entries(parsed).map(([key, config]) => [key, normalizeProviderConfig(key, config)]));
            }
        } catch (e) {
            console.error('加载 providers 配置失败:', e);
        }
        return Object.fromEntries(Object.entries(DEFAULT_PROVIDERS).map(([key, config]) => [key, normalizeProviderConfig(key, config)]));
    });

    // V3.3: 持久化 providers
    useEffect(() => {
        try {
            localStorage.setItem('tapnow_providers', JSON.stringify(providers));
        } catch (e) {
            console.error('保存 providers 配置失败:', e);
        }
    }, [providers]);

    // V3.6.0: 辅助函数 - 获取模型的 key 和 url
    const getModelConfig = useCallback((modelId) => {
        const config = apiConfigs.find(c => c.id === modelId);
        if (!config) return { key: '', url: DEFAULT_BASE_URL, id: modelId };

        const providerConfig = providers[config.provider] || {};
        return {
            ...config,
            // V3.6.0: 直接用 id 作为 modelName
            modelName: config.id,
            key: providerConfig.key || '',
            url: providerConfig.url || DEFAULT_BASE_URL
        };
    }, [apiConfigs, providers]);

    const [globalApiKey, setGlobalApiKey] = useState(() => localStorage.getItem('tapnow_global_key') || '');

    // API 黑名单机制 (比照 Jimeng-api-tool 实现)
    const [apiBlacklist, setApiBlacklist] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_api_blacklist');
            if (!saved) return {};
            const parsed = JSON.parse(saved);
            const today = new Date().toDateString();
            // 每日重置：如果日期变更，清空黑名单
            if (parsed.date !== today) return {};
            return parsed.blacklist || {};
        } catch (e) {
            return {};
        }
    });

    // 持久化黑名单
    useEffect(() => {
        try {
            localStorage.setItem('tapnow_api_blacklist', JSON.stringify({
                date: new Date().toDateString(),
                blacklist: apiBlacklist
            }));
        } catch (e) { }
    }, [apiBlacklist]);

    // 黑名单 ref 用于并发请求间的同步访问（解决 React 状态异步更新问题）
    const apiBlacklistRef = useRef(apiBlacklist);
    useEffect(() => {
        apiBlacklistRef.current = apiBlacklist;
    }, [apiBlacklist]);

    const addToBlacklist = (key, reason) => {
        if (!key) return;
        const entry = {
            date: new Date().toDateString(),
            reason: reason,
            timestamp: Date.now()
        };
        // 立即同步更新 ref（解决并发请求竞态）
        const oldBlacklist = apiBlacklistRef.current || {};
        apiBlacklistRef.current = { ...oldBlacklist, [key]: entry };

        // V3.5.1 调试：详细追踪黑名单更新

        // 异步更新 React 状态（用于持久化和 UI）
        setApiBlacklist(prev => ({
            ...prev,
            [key]: entry
        }));
    };

    // V3.7.23: API 临时暂停列表（用于登录失效等可恢复错误，TTL 60分钟）
    const [apiSuspendList, setApiSuspendList] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_api_suspend');
            if (!saved) return {};
            const parsed = JSON.parse(saved);
            const now = Date.now();
            // 清理过期项（60分钟）
            return Object.fromEntries(
                Object.entries(parsed).filter(([, v]) => now - v.timestamp < 60 * 60 * 1000)
            );
        } catch (e) { return {}; }
    });

    // 持久化暂停列表
    useEffect(() => {
        try {
            localStorage.setItem('tapnow_api_suspend', JSON.stringify(apiSuspendList));
        } catch (e) { }
    }, [apiSuspendList]);

    const apiSuspendListRef = useRef(apiSuspendList);
    useEffect(() => { apiSuspendListRef.current = apiSuspendList; }, [apiSuspendList]);

    const addToSuspendList = (key, reason, ttlMs = 60 * 60 * 1000) => {
        if (!key) return;
        const entry = { reason, timestamp: Date.now(), ttl: ttlMs };
        apiSuspendListRef.current = { ...apiSuspendListRef.current, [key]: entry };
        setApiSuspendList(prev => ({ ...prev, [key]: entry }));
    };

    const isKeySuspended = (key) => {
        const entry = apiSuspendListRef.current?.[key];
        if (!entry) return false;
        return Date.now() - entry.timestamp < (entry.ttl || 60 * 60 * 1000);
    };

    // V3.7.23: 1006 错误熔断机制（2分钟内10次触发熔断）
    const error1006WindowRef = useRef([]);
    const CIRCUIT_BREAKER_WINDOW_MS = 2 * 60 * 1000; // 2分钟
    const CIRCUIT_BREAKER_THRESHOLD = 10; // 10次

    const checkCircuitBreaker = () => {
        const now = Date.now();
        const recentErrors = error1006WindowRef.current.filter(t => now - t < CIRCUIT_BREAKER_WINDOW_MS);
        error1006WindowRef.current = recentErrors;
        return recentErrors.length >= CIRCUIT_BREAKER_THRESHOLD;
    };

    const record1006Error = () => {
        error1006WindowRef.current.push(Date.now());
    };

    // 即梦图生图使用本地文件设置（默认true，强制使用本地文件而不是URL）
    const [jimengUseLocalFile, setJimengUseLocalFile] = useState(() => {
        const saved = localStorage.getItem('tapnow_jimeng_use_local_file');
        return saved !== null ? saved === 'true' : true; // 默认true
    });

    // V3.4.7: 项目名称状态 - 新项目（无节点）始终显示"未命名项目"
    const [projectName, setProjectName] = useState(() => {
        if (cloudDocument) return cloudDocument.project.projectName || cloudDocument.name;
        try {
            const saved = localStorage.getItem('tapnow_project_name');
            if (saved) return saved;
            localStorage.setItem('tapnow_project_name', defaultProjectName);
            return defaultProjectName;
        } catch (e) {
            return defaultProjectName;
        }
    });
    const [isEditingProjectName, setIsEditingProjectName] = useState(false);
    const projectNameInputRef = useRef(null);
    const commitProjectNameEdit = useCallback(() => {
        setIsEditingProjectName(false);
        try {
            localStorage.setItem('tapnow_project_name', projectName);
        } catch (e) { }
    }, [localStorage, projectName]);

    // 进度条状态
    const [progressState, setProgressState] = useState({
        visible: false,
        progress: 0,
        status: '',
        type: 'import' // 'import' | 'export'
    });

    // V2.6.1：历史面板性能模式
    // off: 关闭 (显示原图)
    // normal: 普通 (缩略图质量 0.6)
    // ultra: 极速 (缩略图质量 0.3)
    const [performanceMode, setPerformanceMode] = useState(() => {
        try {
            const savedHistory = localStorage.getItem('tapnow_history_performance_mode');
            if (savedHistory !== null) {
                if (savedHistory === 'true') return 'normal';
                if (savedHistory === 'false') return 'off';
                return savedHistory || 'off';
            }
            return localStorage.getItem('tapnow_performance_mode') || 'off';
        } catch (e) {
            return 'off';
        }
    });
    // 全局性能模式（与历史面板独立）
    const [globalPerformanceMode, setGlobalPerformanceMode] = useState(() => {
        try {
            return localStorage.getItem('tapnow_global_performance_mode') || 'off';
        } catch (e) {
            return 'off';
        }
    });

    // V2.6.1：本地服务器 URL
    const [localServerUrl, setLocalServerUrl] = useState(() => {
        return localStorage.getItem('tapnow_local_server_url') || 'http://127.0.0.1:9527';
    });

    // V2.6.1：本地缓存服务器状态
    const [localCacheServerConnected, setLocalCacheServerConnected] = useState(false);
    const [localCacheEnabled, setLocalCacheEnabled] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_local_cache_enabled');
            if (saved !== null) return saved === 'true';
            const legacy = localStorage.getItem('tapnow_show_local_cache_banner');
            return legacy === null ? true : legacy === 'true';
        } catch (e) {
            return true;
        }
    });
    const [cacheRedownloadOnEnable, setCacheRedownloadOnEnable] = useState(() => {
        try {
            return localStorage.getItem('tapnow_cache_redownload_on_enable') === 'true';
        } catch (e) {
            return false;
        }
    });
    const [saveHistoryAssets, setSaveHistoryAssets] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_save_history_assets');
            if (saved === null) return true;
            return saved === 'true';
        } catch (e) {
            return true;
        }
    });
    const HISTORY_SAVE_LIMIT_MIN = 20;
    const HISTORY_SAVE_LIMIT_MAX = 160;
    const normalizeHistorySaveLimit = (value) => {
        const parsed = Number.parseInt(value, 10);
        const safe = Number.isFinite(parsed) ? parsed : 80;
        return Math.min(HISTORY_SAVE_LIMIT_MAX, Math.max(HISTORY_SAVE_LIMIT_MIN, safe));
    };
    const [historySaveLimit, setHistorySaveLimit] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_history_limit');
            if (saved === null) return 80;
            return normalizeHistorySaveLimit(saved);
        } catch (e) {
            return 80;
        }
    });
    const [historySaveLimitInput, setHistorySaveLimitInput] = useState(() => String(historySaveLimit));
    const historySaveLimitTimerRef = useRef(null);
    const historySaveLimitErrorRef = useRef({ lastValue: null, toastId: null });
    const [cacheRefreshTick, setCacheRefreshTick] = useState(0);
    const [localCacheBannerVisible, setLocalCacheBannerVisible] = useState(false);
    const localCacheBannerTimerRef = useRef(null);
    const localCacheActive = localCacheEnabled && localCacheServerConnected;
    const [localServerConfig, setLocalServerConfig] = useState({
        savePath: '',
        imageSavePath: '',
        videoSavePath: '',
        convertPngToJpg: true,
        jpgQuality: 95,
        pilAvailable: false
    });
    const thumbnailCacheRef = useRef(new Map());
    const triedCacheIdsRef = useRef(new Set());
    const localCacheCheckRef = useRef(new Map());
    const cachedHistoryUrlRef = useRef(new Map());
    const localCachePathRef = useRef({ savePath: '', imageSavePath: '', videoSavePath: '' });
    const cacheFetchFailureRef = useRef(new Map());
    const cacheHeadProbeRef = useRef(new Map());
    const cacheImageRunRef = useRef(false);
    const cacheVideoRunRef = useRef(false);
    const localCacheFileIndexRef = useRef(new Set());
    const localCacheIndexReadyRef = useRef(false);
    const [localCacheIndexTick, setLocalCacheIndexTick] = useState(0);
    const assetBundlePathToOriginalRef = useRef(new Map());
    const assetBundlePathToIdRef = useRef(new Map());
    const assetBundleBlobToOriginalRef = useRef(new Map());
    const assetBundleIdToOriginalRef = useRef(new Map());
    const assetBundleBlobUrlsRef = useRef(new Set());
    const [assetBundleActive, setAssetBundleActive] = useState(false);
    const autoSaveUrlCacheRef = useRef(new Map());
    const normalizeLocalCacheRelPath = useCallback((value) => {
        if (!value) return '';
        return String(value).replace(/\\/g, '/').replace(/^\/+/, '');
    }, []);
    const extractLocalCacheRelPath = useCallback((url) => {
        if (!url) return '';
        const base = (localServerUrl || '').replace(/\/+$/, '');
        if (!base || !url.startsWith(base)) return '';
        const rest = url.slice(base.length);
        const match = rest.match(/^\/file\/(.+)/);
        if (!match) return '';
        try {
            return normalizeLocalCacheRelPath(decodeURIComponent(match[1]));
        } catch (e) {
            return normalizeLocalCacheRelPath(match[1]);
        }
    }, [localServerUrl, normalizeLocalCacheRelPath]);
    const isLocalCacheUrl = useCallback((url) => {
        if (!url) return false;
        const str = String(url);
        const base = (localServerUrl || '').trim().replace(/\/+$/, '');
        if (base && str.startsWith(`${base}/file/`)) return true;
        try {
            const parsed = new URL(str);
            if ((parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') && parsed.pathname.startsWith('/file/')) {
                return true;
            }
        } catch (e) { }
        return false;
    }, [localServerUrl]);
    const isComfyLocalUrl = useCallback((url) => {
        if (!url) return false;
        try {
            const parsed = new URL(String(url));
            const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
            return isLocalHost && parsed.port === '8188';
        } catch (e) {
            return false;
        }
    }, []);
    const isLocalCacheUrlAvailable = useCallback((url) => {
        if (!url) return false;
        const relPath = extractLocalCacheRelPath(url);
        if (!relPath) return false;
        // 索引未就绪时，先视为不可用，避免触发 404 噪音
        if (!localCacheIndexReadyRef.current) return false;
        return localCacheFileIndexRef.current.has(relPath);
    }, [extractLocalCacheRelPath, localCacheIndexTick]);
    const resetAssetBundleState = useCallback((options = {}) => {
        assetBundlePathToOriginalRef.current.clear();
        assetBundlePathToIdRef.current.clear();
        assetBundleBlobToOriginalRef.current.clear();
        assetBundleIdToOriginalRef.current.clear();
        assetBundleBlobUrlsRef.current.forEach((url) => {
            if (url && url.startsWith('blob:')) {
                try { URL.revokeObjectURL(url); } catch (e) { }
            }
        });
        assetBundleBlobUrlsRef.current.clear();
        autoSaveUrlCacheRef.current.clear();
        if (!options.keepStorage) {
            writeAssetBundleMeta(null);
        }
        if (!options.keepActive) {
            setAssetBundleActive(false);
        }
    }, []);
    const persistAssetBundleMeta = useCallback(() => {
        const idToOriginal = Object.fromEntries(assetBundleIdToOriginalRef.current);
        const pathToOriginal = Object.fromEntries(assetBundlePathToOriginalRef.current);
        const pathToId = Object.fromEntries(assetBundlePathToIdRef.current);
        if (Object.keys(idToOriginal).length === 0 && Object.keys(pathToOriginal).length === 0 && Object.keys(pathToId).length === 0) {
            writeAssetBundleMeta(null);
            return;
        }
        writeAssetBundleMeta({
            idToOriginal,
            pathToOriginal,
            pathToId,
            updatedAt: Date.now()
        });
    }, []);
    const resolveAssetBundleUrl = useCallback((value) => {
        if (!value || typeof value !== 'string') return value;
        if (!value.startsWith('asset://')) return value;
        const path = value.replace(/^asset:\/\//, '');
        if (!path) return value;
        return assetBundlePathToIdRef.current.get(path)
            || assetBundlePathToOriginalRef.current.get(path)
            || value;
    }, []);
    const getAssetFallbackUrl = useCallback((value) => {
        if (!value || typeof value !== 'string') return '';
        if (LocalImageManager.isImageId(value)) {
            return assetBundleIdToOriginalRef.current.get(value) || '';
        }
        if (value.startsWith('asset://')) {
            const path = value.replace(/^asset:\/\//, '');
            return assetBundlePathToOriginalRef.current.get(path) || '';
        }
        if (value.startsWith('blob:')) {
            return assetBundleBlobToOriginalRef.current.get(value) || '';
        }
        return '';
    }, []);
    const resolveSpecialUrl = useCallback(async (value) => {
        if (!value || typeof value !== 'string') return value;
        let next = value;
        if (next.startsWith('asset://')) {
            next = resolveAssetBundleUrl(next);
        }
        if (LocalImageManager.isImageId(next)) {
            const dataUrl = await LocalImageManager.getImage(next);
            if (dataUrl) return dataUrl;
            const fallback = getAssetFallbackUrl(next);
            return fallback || next;
        }
        return next;
    }, [resolveAssetBundleUrl, getAssetFallbackUrl]);

    const resolveUrlForMediaMeta = useCallback(async (value) => {
        if (!value || typeof value !== 'string') return '';
        if (LocalImageManager.isImageId(value) || value.startsWith('asset://')) {
            const resolved = await resolveSpecialUrl(value);
            return resolved || value;
        }
        return value;
    }, [resolveSpecialUrl]);
    const getLocalCacheCandidateUrl = useCallback((expectedId, extensions = [], preferHistoryPath = false) => {
        const base = (localServerUrl || '').trim().replace(/\/+$/, '');
        if (!base || !expectedId) return '';
        if (!localCacheIndexReadyRef.current) return '';
        const segments = [
            preferHistoryPath ? 'history' : '.tapnow_cache/history',
            preferHistoryPath ? '.tapnow_cache/history' : 'history'
        ];
        const candidates = [];
        segments.forEach((seg) => {
            extensions.forEach((ext) => {
                candidates.push(`${seg}/${expectedId}${ext}`);
            });
        });
        for (const rel of candidates) {
            const normalized = normalizeLocalCacheRelPath(rel);
            if (localCacheFileIndexRef.current.has(normalized)) {
                return `${base}/file/${normalized}`;
            }
        }
        return '';
    }, [localServerUrl, normalizeLocalCacheRelPath, localCacheIndexTick]);

    const refreshLocalCacheFileIndex = useCallback(async (options = {}) => {
        if (!localCacheActive) return;
        const base = (localServerUrl || '').replace(/\/+$/, '');
        if (!base) return;
        const silent = options.silent === true;
        try {
            const res = await fetch(`${base}/list-files`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const files = Array.isArray(data?.files)
                ? data.files
                : (Array.isArray(data?.data?.files) ? data.data.files : []);
            const next = new Set();
            files.forEach((file) => {
                const rel = normalizeLocalCacheRelPath(file?.rel_path || file?.relPath || file?.path || '');
                if (rel) next.add(rel);
            });
            localCacheFileIndexRef.current = next;
            localCacheIndexReadyRef.current = true;
            setLocalCacheIndexTick((prev) => prev + 1);
            if (!silent) showToast('本地缓存索引已更新', 'success', 1500);
        } catch (e) {
            localCacheIndexReadyRef.current = false;
            if (!silent) showToast('本地缓存索引更新失败', 'warning', 1500);
        }
    }, [localCacheActive, localServerUrl, normalizeLocalCacheRelPath, showToast]);

    // 持久化性能模式和本地服务器设置
    useEffect(() => {
        localStorage.setItem('tapnow_performance_mode', performanceMode);
        localStorage.setItem('tapnow_history_performance_mode', performanceMode);
    }, [performanceMode]);
    useEffect(() => {
        localStorage.setItem('tapnow_save_history_assets', String(saveHistoryAssets));
    }, [saveHistoryAssets]);
    useEffect(() => {
        try {
            localStorage.setItem('tapnow_history_limit', String(historySaveLimit));
        } catch (e) { }
    }, [historySaveLimit]);

    useEffect(() => {
        setHistorySaveLimitInput(String(historySaveLimit));
    }, [historySaveLimit]);

    const applyHistorySaveLimitInput = useCallback((rawValue) => {
        const trimmed = String(rawValue ?? '').trim();
        if (!trimmed) {
            if (historySaveLimitErrorRef.current.toastId) {
                dismissToast(historySaveLimitErrorRef.current.toastId);
                historySaveLimitErrorRef.current.toastId = null;
                historySaveLimitErrorRef.current.lastValue = null;
            }
            return;
        }
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(parsed)) return;
        if (parsed < HISTORY_SAVE_LIMIT_MIN || parsed > HISTORY_SAVE_LIMIT_MAX) {
            if (historySaveLimitErrorRef.current.lastValue !== trimmed) {
                historySaveLimitErrorRef.current.lastValue = trimmed;
                if (historySaveLimitErrorRef.current.toastId) {
                    dismissToast(historySaveLimitErrorRef.current.toastId);
                }
                historySaveLimitErrorRef.current.toastId = showToast(`${t('历史保存上限需在')} ${HISTORY_SAVE_LIMIT_MIN}-${HISTORY_SAVE_LIMIT_MAX} ${t('之间')}`, 'error', 300000);
            }
            return;
        }
        if (historySaveLimitErrorRef.current.toastId) {
            dismissToast(historySaveLimitErrorRef.current.toastId);
            historySaveLimitErrorRef.current.toastId = null;
        }
        historySaveLimitErrorRef.current.lastValue = null;
        setHistorySaveLimit(parsed);
        setHistorySaveLimitInput(String(parsed));
    }, [HISTORY_SAVE_LIMIT_MIN, HISTORY_SAVE_LIMIT_MAX, showToast, dismissToast, t]);
    useEffect(() => {
        return () => {
            if (historySaveLimitTimerRef.current) {
                clearTimeout(historySaveLimitTimerRef.current);
                historySaveLimitTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        localStorage.setItem('tapnow_global_performance_mode', globalPerformanceMode);
    }, [globalPerformanceMode]);

    useEffect(() => {
        localStorage.setItem('tapnow_local_server_url', localServerUrl);
    }, [localServerUrl]);
    useEffect(() => {
        try { localStorage.setItem('tapnow_local_cache_enabled', String(localCacheEnabled)); } catch (e) { }
    }, [localCacheEnabled]);
    useEffect(() => {
        try { localStorage.setItem('tapnow_cache_redownload_on_enable', String(cacheRedownloadOnEnable)); } catch (e) { }
    }, [cacheRedownloadOnEnable]);
    useEffect(() => {
        if (!localCacheActive) {
            localCacheIndexReadyRef.current = false;
            return;
        }
        refreshLocalCacheFileIndex({ silent: true });
    }, [localCacheActive, localServerUrl, localServerConfig.savePath, localServerConfig.imageSavePath, localServerConfig.videoSavePath, cacheRefreshTick, refreshLocalCacheFileIndex]);

    const getHistoryFallbackUrl = (item, options = {}) => {
        const allowLocalCache = options.allowLocalCache ?? localCacheActive;
        if (!item) return '';
        const candidates = [];
        if (allowLocalCache) {
            if (item.localCacheUrl) candidates.push(item.localCacheUrl);
            if (item.localCacheMap && typeof item.localCacheMap === 'object') {
                candidates.push(...Object.values(item.localCacheMap));
            }
        }
        if (item.localCacheMap && typeof item.localCacheMap === 'object') {
            candidates.push(...Object.keys(item.localCacheMap));
        }
        if (Array.isArray(item.mjImages)) candidates.push(...item.mjImages);
        if (Array.isArray(item.output_images)) candidates.push(...item.output_images);
        if (item.originalUrl) candidates.push(item.originalUrl);
        if (item.mjOriginalUrl) candidates.push(item.mjOriginalUrl);
        if (item.url) candidates.push(item.url);
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate && !candidate.startsWith('blob:')) {
                if (!allowLocalCache && isLocalCacheUrl(candidate)) continue;
                return candidate;
            }
        }
        return '';
    };

    const sanitizeHistoryUrlValue = (value, fallback = '', options = {}) => {
        const allowLocalCache = options.allowLocalCache ?? localCacheActive;
        if (!value || typeof value !== 'string') return value;
        if (!allowLocalCache && isLocalCacheUrl(value)) return fallback || '';
        if (LocalImageManager.isImageId(value)) return value;
        if (value.startsWith('asset://')) {
            const resolved = resolveAssetBundleUrl(value);
            if (resolved && resolved !== value) return resolved;
            const assetFallback = getAssetFallbackUrl(value);
            return assetFallback || value;
        }
        if (value.startsWith('data:') && value.includes('...')) {
            return fallback || '';
        }
        if (value.startsWith('blob:')) {
            return fallback || '';
        }
        return value;
    };

    const sanitizeHistoryItemForLoad = (item) => {
        const fallback = getHistoryFallbackUrl(item, { allowLocalCache: localCacheActive });
        const next = { ...item };
        next.url = sanitizeHistoryUrlValue(next.url, fallback, { allowLocalCache: localCacheActive });
        next.originalUrl = sanitizeHistoryUrlValue(next.originalUrl, fallback, { allowLocalCache: localCacheActive });
        next.mjOriginalUrl = sanitizeHistoryUrlValue(next.mjOriginalUrl, fallback, { allowLocalCache: localCacheActive });
        if (Array.isArray(next.output_images)) {
            next.output_images = next.output_images.map((url) => sanitizeHistoryUrlValue(url, fallback, { allowLocalCache: localCacheActive })).filter(Boolean);
        }
        if (Array.isArray(next.mjImages)) {
            const sanitized = next.mjImages.map((url) => sanitizeHistoryUrlValue(url, fallback, { allowLocalCache: localCacheActive })).filter(Boolean);
            if (sanitized.length === 0 && next.mjOriginalUrl) {
                next.mjImages = null;
                next.mjNeedsSplit = true;
            } else {
                next.mjImages = sanitized;
            }
        }
        if (Array.isArray(next.mjImages) && next.mjImages.length > 1) {
            if (!Array.isArray(next.output_images) || next.output_images.length < next.mjImages.length) {
                next.output_images = [...next.mjImages];
            }
        }
        if ((!Array.isArray(next.output_images) || next.output_images.length < 2)
            && next.localCacheMap && typeof next.localCacheMap === 'object') {
            const cacheKeys = Object.keys(next.localCacheMap).filter(Boolean);
            if (cacheKeys.length > 1) {
                next.output_images = cacheKeys.slice(0, 12);
            }
        }
        if (Array.isArray(next.mjThumbnails)) {
            next.mjThumbnails = next.mjThumbnails.map((url) => sanitizeHistoryUrlValue(url, fallback, { allowLocalCache: localCacheActive })).filter(Boolean);
        }
        if (next.thumbnailUrl) {
            next.thumbnailUrl = sanitizeHistoryUrlValue(next.thumbnailUrl, fallback, { allowLocalCache: localCacheActive });
        }
        return next;
    };

    const [history, setHistory] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_history');
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            // 检查是否有需要重新切割的Midjourney图片 + 修复 blob/asset 残留
            return parsed.map(item => {
                const sanitized = sanitizeHistoryItemForLoad(item);
                if (sanitized.mjNeedsSplit && sanitized.mjOriginalUrl && sanitized.apiConfig?.modelId?.includes('mj')) {
                    // 标记需要重新切割，但不立即切割（避免阻塞初始化）
                    return { ...sanitized, url: sanitized.mjOriginalUrl, mjImages: null, mjNeedsSplit: true };
                }
                return sanitized;
            });
        } catch (e) {
            console.error('加载历史记录失败:', e);
            return [];
        }
    });

    // V3.4.12: 会话开始时间，用于追踪"本次生成"
    const [sessionStartTime] = useState(() => Date.now());
    // V3.4.12: 下载进度状态
    const [downloadProgress, setDownloadProgress] = useState({ active: false, current: 0, total: 0, filename: '' });
    const [downloadDisplay, setDownloadDisplay] = useState({ visible: false, current: 0, total: 0 });
    const downloadDisplayRef = useRef({ lastCurrent: 0, lastTotal: 0, holdUntil: 0, wasActive: false, timer: null });
    // V3.4.12: 历史记录选择状态
    const [historySelection, setHistorySelection] = useState(new Set());
    useEffect(() => {
        const now = Date.now();
        const ref = downloadDisplayRef.current;
        if (downloadProgress.total > 0) {
            ref.lastCurrent = downloadProgress.current;
            ref.lastTotal = downloadProgress.total;
        }
        if (downloadProgress.active) {
            if (ref.timer) {
                clearTimeout(ref.timer);
                ref.timer = null;
            }
            ref.holdUntil = 0;
            setDownloadDisplay({ visible: true, current: downloadProgress.current, total: downloadProgress.total });
        } else {
            if (ref.wasActive && ref.lastTotal > 0) {
                ref.holdUntil = now + 10000;
                if (ref.timer) clearTimeout(ref.timer);
                ref.timer = setTimeout(() => {
                    setDownloadDisplay((prev) => ({ ...prev, visible: false }));
                    downloadDisplayRef.current.timer = null;
                }, 10000);
                setDownloadDisplay({ visible: true, current: ref.lastCurrent, total: ref.lastTotal });
            } else if (ref.holdUntil > now) {
                setDownloadDisplay({ visible: true, current: ref.lastCurrent, total: ref.lastTotal });
            } else {
                setDownloadDisplay((prev) => (prev.visible ? { ...prev, visible: false } : prev));
            }
        }
        ref.wasActive = downloadProgress.active;
    }, [downloadProgress]);
    useEffect(() => {
        return () => {
            if (downloadDisplayRef.current.timer) {
                clearTimeout(downloadDisplayRef.current.timer);
                downloadDisplayRef.current.timer = null;
            }
        };
    }, []);
    // V3.4.12: 自动保存配置
    const [autoSaveConfig, setAutoSaveConfig] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_auto_save_config');
            return saved ? JSON.parse(saved) : { enabled: false, interval: 5, folderPath: '' };
        } catch (e) {
            return { enabled: false, interval: 5, folderPath: '' };
        }
    });
    // V3.4.12: 是否显示自动保存恢复弹窗
    const [showAutoSaveRecovery, setShowAutoSaveRecovery] = useState(false);


    const [chatSessions, setChatSessions] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_chat_sessions');
            return saved ? JSON.parse(saved) : [{ id: 'default', title: t('新对话'), messages: [] }];
        } catch (e) {
            return [{ id: 'default', title: t('新对话'), messages: [] }];
        }
    });
    const [currentChatId, setCurrentChatId] = useState('default');
    const [chatInput, setChatInput] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatWidth, setChatWidth] = useState(400);
    const [chatFiles, setChatFiles] = useState([]);
    const [chatModel, setChatModel] = useState(() => {
        try { return localStorage.getItem('tapnow_chat_model') || 'gemini-3-pro'; } catch { return 'gemini-3-pro'; }
    });
    const [chatModelDropdownOpen, setChatModelDropdownOpen] = useState(false);
    const [chatHoveredProvider, setChatHoveredProvider] = useState(null);
    const [isChatSending, setIsChatSending] = useState(false);

    // V3.7.24: 保存聊天模型选择到 localStorage
    useEffect(() => {
        try { localStorage.setItem('tapnow_chat_model', chatModel); } catch { }
    }, [chatModel]);

    const [lightboxItem, setLightboxItem] = useState(null);
    // V3.7.22: Ref 用于解决 onNavigate 闭包过时问题
    const lightboxItemRef = useRef(lightboxItem);
    lightboxItemRef.current = lightboxItem;
    const lightboxHistorySnapshotRef = useRef(null); // 保存打开时的历史顺序，避免滚动/新增导致跳序
    const lightboxHistoryIndexRef = useRef(-1);
    const [promptLibrary, setPromptLibrary] = useState(() => {
        try {
            const saved = localStorage.getItem(PROMPT_LIBRARY_KEY);
            const parsed = saved ? JSON.parse(saved) : [];
            const defaults = [
                { id: 'grid-default', name: t('九宫格分镜脚本'), prompt: GRID_PROMPT_TEXT },
                { id: 'upscale-default', name: t('高清放大'), prompt: UPSCALE_PROMPT_TEXT },
                { id: 'moodboard-default', name: t('情绪版'), prompt: MOOD_BOARD_PROMPT_TEXT },
                { id: 'storyboard-default', name: t('【分镜版】'), prompt: STORYBOARD_PROMPT_TEXT },
                { id: 'character-sheet-default', name: t('【角色板】'), prompt: CHARACTER_SHEET_PROMPT_TEXT }
            ];
            // 确保默认项存在且不重复
            const existingIds = new Set((parsed || []).map(p => p.id));
            const merged = [...parsed];
            defaults.forEach(def => {
                const hasSameName = merged.some(p => p.name === def.name);
                if (!existingIds.has(def.id) && !hasSameName) merged.unshift(def);
            });
            return merged;
        } catch (e) {
            return [
                { id: 'grid-default', name: t('九宫格分镜脚本'), prompt: GRID_PROMPT_TEXT },
                { id: 'upscale-default', name: t('高清放大'), prompt: UPSCALE_PROMPT_TEXT },
                { id: 'moodboard-default', name: t('情绪版'), prompt: MOOD_BOARD_PROMPT_TEXT },
                { id: 'storyboard-default', name: t('【分镜版】'), prompt: STORYBOARD_PROMPT_TEXT },
                { id: 'character-sheet-default', name: t('【角色板】'), prompt: CHARACTER_SHEET_PROMPT_TEXT }
            ];
        }
    });
    const [promptLibraryForm, setPromptLibraryForm] = useState({ name: '', prompt: '' });
    const [promptLibraryCollapsed, setPromptLibraryCollapsed] = useState(false);
    const [promptLibraryEditorOpen, setPromptLibraryEditorOpen] = useState(false);
    useEffect(() => {
        try {
            localStorage.setItem(PROMPT_LIBRARY_KEY, JSON.stringify(promptLibrary));
        } catch (e) { }
    }, [promptLibrary]);

    // 状态管理
    const [isPanning, setIsPanning] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragNodeId, setDragNodeId] = useState(null);
    const [resizingNodeId, setResizingNodeId] = useState(null);
    const [connectingSource, setConnectingSource] = useState(null);
    const [connectingTarget, setConnectingTarget] = useState(null); // 从输入端口开始的连接目标节点ID
    const [connectingInputType, setConnectingInputType] = useState(null); // 'default', 'oref', 'sref'
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [hoverTargetId, setHoverTargetId] = useState(null);
    const [isMouseOverStoryboard, setIsMouseOverStoryboard] = useState(false); // 鼠标是否在智能分镜表窗口内

    // 框选相关状态
    // V3.7.33：分镜镜头执行计时器
    const [shotTimers, setShotTimers] = useState({});

    useEffect(() => {
        const activeShots = nodes.flatMap(node => node.type === 'storyboard-node'
            ? (node.settings?.shots || []).filter(shot => shot.status === 'generating' && shot.generationStartTime)
                .map(shot => ({ key: node.id + '-' + shot.id, start: shot.generationStartTime }))
            : []);
        if (!activeShots.length) {
            setShotTimers(previous => Object.keys(previous).length ? {} : previous);
            return;
        }
        const interval = setInterval(() => {
            const now = Date.now();
            const updates = {};
            activeShots.forEach(shot => { updates[shot.key] = ((now - shot.start) / 1000).toFixed(1) + 's'; });
            setShotTimers(updates);
        }, 500);
        return () => clearInterval(interval);
    }, [nodes]);

    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionBox, setSelectionBox] = useState(null); // { startX, startY, endX, endY } (屏幕坐标)
    const [selectedNodeIds, setSelectedNodeIds] = useState(new Set()); // 多选节点ID集合
    const [nodeSelectionPriority, setNodeSelectionPriority] = useState({}); // nodeId -> 最近点选顺序（越新越靠上）
    const isSelectingRef = useRef(false); // 使用ref跟踪框选状态，确保即使Ctrl松开也能继续框选
    const nodeSelectionOrderRef = useRef(0);
    const dragPriorityNodeIdsRef = useRef([]);
    const touchNodeSelectionPriorityBatch = useCallback((nodeIds) => {
        const normalizedIds = Array.from(new Set(
            (Array.isArray(nodeIds) ? nodeIds : [nodeIds])
                .map((id) => String(id || '').trim())
                .filter(Boolean)
        ));
        if (normalizedIds.length === 0) return;
        setNodeSelectionPriority((prev) => {
            const next = { ...prev };
            let nextOrder = nodeSelectionOrderRef.current;
            normalizedIds.forEach((nodeId) => {
                nextOrder += 1;
                next[nodeId] = nextOrder;
            });
            nodeSelectionOrderRef.current = nextOrder;
            return next;
        });
    }, []);
    const touchNodeSelectionPriority = useCallback((nodeId) => {
        touchNodeSelectionPriorityBatch([nodeId]);
    }, [touchNodeSelectionPriorityBatch]);

    const [contextMenu, setContextMenu] = useState({ x: 0, y: 0, worldX: 0, worldY: 0, visible: false });
    const [contextMenuExpanded, setContextMenuExpanded] = useState(false);
    const [selectionContextMenu, setSelectionContextMenu] = useState({ visible: false, x: 0, y: 0 });
    const [historyContextMenu, setHistoryContextMenu] = useState({ visible: false, x: 0, y: 0, worldX: 0, worldY: 0, item: null });
    const [historySendMenuOpen, setHistorySendMenuOpen] = useState(false);
    const [isChatInputFocused, setIsChatInputFocused] = useState(false);
    const [isChatHovered, setIsChatHovered] = useState(false);
    const lastInteractionRef = useRef({ target: null, at: 0 });
    const markInteraction = useCallback((target) => {
        lastInteractionRef.current = { target, at: Date.now() };
    }, []);
    const historySendMenuCloseTimerRef = useRef(null);
    const openHistorySendMenu = useCallback(() => {
        if (historySendMenuCloseTimerRef.current) {
            clearTimeout(historySendMenuCloseTimerRef.current);
            historySendMenuCloseTimerRef.current = null;
        }
        setHistorySendMenuOpen(true);
    }, []);
    const scheduleHistorySendMenuClose = useCallback(() => {
        if (historySendMenuCloseTimerRef.current) {
            clearTimeout(historySendMenuCloseTimerRef.current);
        }
        historySendMenuCloseTimerRef.current = setTimeout(() => {
            setHistorySendMenuOpen(false);
            historySendMenuCloseTimerRef.current = null;
        }, 1000);
    }, []);
    // 记录当前选中的分镜格，用于接收历史记录图片
    const [activeShot, setActiveShot] = useState({ nodeId: null, shotId: null });
    const [storyboardTableCellEditor, setStoryboardTableCellEditor] = useState({
        visible: false,
        nodeId: null,
        rowIdx: -1,
        colIdx: -1,
        value: '',
        width: 540,
        height: 240
    });
    const [frameContextMenu, setFrameContextMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null, frame: null });
    const [previewContextMenu, setPreviewContextMenu] = useState({ visible: false, x: 0, y: 0, item: null });
    const [inputImageContextMenu, setInputImageContextMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState('providers');
    const [editingApiModels, setEditingApiModels] = useState(() => new Set());
    const [editingLibraryModels, setEditingLibraryModels] = useState(() => new Set());
    const [libraryPreviewModels, setLibraryPreviewModels] = useState(() => new Set());
    const [libraryPreviewEditing, setLibraryPreviewEditing] = useState(() => new Set());
    const [libraryPreviewDrafts, setLibraryPreviewDrafts] = useState(() => ({}));
    const [libraryRequestPreviewEditing, setLibraryRequestPreviewEditing] = useState(() => new Set());
    const [libraryRequestPreviewDrafts, setLibraryRequestPreviewDrafts] = useState(() => ({}));
    const [libraryRequestTemplateDrafts, setLibraryRequestTemplateDrafts] = useState(() => ({}));
    const [libraryTransportOptionsDrafts, setLibraryTransportOptionsDrafts] = useState(() => ({}));
    const [libraryAsyncConfigDrafts, setLibraryAsyncConfigDrafts] = useState(() => ({}));
    const [libraryRequestChainDrafts, setLibraryRequestChainDrafts] = useState(() => ({}));
    const [libraryAsyncPreviewModels, setLibraryAsyncPreviewModels] = useState(() => new Set());
    const [libraryNotesCollapsed, setLibraryNotesCollapsed] = useState(() => ({}));
    const [librarySectionCollapsed, setLibrarySectionCollapsed] = useState(() => ({}));
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyCachePanelOpen, setHistoryCachePanelOpen] = useState(false);
    const [historyQueuePanelOpen, setHistoryQueuePanelOpen] = useState(false);
    const [historyFocusIndex, setHistoryFocusIndex] = useState(-1); // V3.7.28: 历史列表键盘导航
    const [historyFocusId, setHistoryFocusId] = useState(null);
    const [charactersOpen, setCharactersOpen] = useState(false);
    const [characterLibrary, setCharacterLibrary] = useState(() => {
        try {
            const saved = localStorage.getItem('tapnow_characters');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('加载角色库失败:', e);
            return [];
        }
    });
    const [createCharacterOpen, setCreateCharacterOpen] = useState(false);
    const [createCharacterVideoSourceType, setCreateCharacterVideoSourceType] = useState('url');
    const [createCharacterVideoUrl, setCreateCharacterVideoUrl] = useState('');
    const [createCharacterSelectedTaskId, setCreateCharacterSelectedTaskId] = useState('');
    const [createCharacterStartSecond, setCreateCharacterStartSecond] = useState(1);
    const [createCharacterEndSecond, setCreateCharacterEndSecond] = useState(3);
    const [createCharacterEndpoint, setCreateCharacterEndpoint] = useState('');
    const [createCharacterSubmitting, setCreateCharacterSubmitting] = useState(false);
    const [createCharacterVideoError, setCreateCharacterVideoError] = useState(null);
    const [characterReferenceBarExpanded, setCharacterReferenceBarExpanded] = useState({});
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [batchSelectedIds, setBatchSelectedIds] = useState(new Set());
    const [chatSessionDropdownOpen, setChatSessionDropdownOpen] = useState(false);
    const [activeTool, setActiveTool] = useState('select');
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [hoveredProvider, setHoveredProvider] = useState(null); // V3.4.6: Provider 二级菜单状态
    const [expandedProviders, setExpandedProviders] = useState({}); // V3.4.7: Settings Modal Provider 展开状态
    const [editingProvider, setEditingProvider] = useState(null); // V3.4.7: Settings Modal Provider 编辑状态
    const [deletingProviderKey, setDeletingProviderKey] = useState(null); // V3.4.7: Settings Modal Provider 删除确认状态
    const [apiTesting, setApiTesting] = useState(null);
    const [apiStatus, setApiStatus] = useState({});
    // 实时计时器状态：nodeId -> elapsedSeconds
    const [nodeTimers, setNodeTimers] = useState({});
    // V3.4.8: 记住上次使用的模型
    const [lastUsedImageModel, setLastUsedImageModel] = useState(() => {
        if (cloudDocument) { const model = cloudModels.find((model) => model.type === 2 && model.defaultModel) || cloudModels.find((model) => model.type === 2); return model ? `studio-${model.id}` : ''; }
        try { return localStorage.getItem('tapnow_last_image_model') || 'nano-banana'; } catch { return 'nano-banana'; }
    });
    const [lastUsedVideoModel, setLastUsedVideoModel] = useState(() => {
        if (cloudDocument) { const model = cloudModels.find((model) => model.type === 3 && model.defaultModel) || cloudModels.find((model) => model.type === 3); return model ? `studio-${model.id}` : ''; }
        try { return localStorage.getItem('tapnow_last_video_model') || 'sora-2'; } catch { return 'sora-2'; }
    });
    const [lastUsedRatio, setLastUsedRatio] = useState(() => {
        try { return localStorage.getItem('tapnow_last_ratio') || '1:1'; } catch { return '1:1'; }
    });
    const [lastUsedImageResolution, setLastUsedImageResolution] = useState(() => {
        try { return normalizeImageResolution(localStorage.getItem('tapnow_last_image_res') || '2K'); } catch { return '2K'; }
    });
    const [lastUsedVideoResolution, setLastUsedVideoResolution] = useState(() => {
        try { return normalizeVideoResolution(localStorage.getItem('tapnow_last_video_res') || '720P'); } catch { return '720P'; }
    });
    const [lastUsedSegmentDuration, setLastUsedSegmentDuration] = useState(() => {
        try { return localStorage.getItem('tapnow_last_segment_duration') || '3'; } catch { return '3'; }
    });
    const [lastUsedAnalyzeModel, setLastUsedAnalyzeModel] = useState(() => {
        try { return localStorage.getItem('tapnow_last_analyze_model') || 'gemini-3-pro'; } catch { return 'gemini-3-pro'; }
    });
    const [lastUsedExtractModel, setLastUsedExtractModel] = useState(() => {
        try { return localStorage.getItem('tapnow_last_extract_model') || ''; } catch { return ''; }
    });

    // V2.6.1：本地缓存服务器连接检查
    useEffect(() => {
        if (!localCacheEnabled) {
            setLocalCacheServerConnected(false);
            return;
        }
        const baseUrl = (localServerUrl || '').replace(/\/+$/, '');
        if (!baseUrl) {
            setLocalCacheServerConnected(false);
            return;
        }

        let cancelled = false;
        const checkLocalCacheServer = async () => {
            try {
                const res = await fetch(`${baseUrl}/ping`, { method: 'GET' });
                if (res.ok) {
                    const data = await res.json();
                    if (cancelled) return;
                    const rawImagePath = data.image_save_path_raw ?? data.image_save_path ?? '';
                    const rawVideoPath = data.video_save_path_raw ?? data.video_save_path ?? '';
                    setLocalCacheServerConnected(true);
                    setLocalServerConfig(prev => ({
                        ...prev,
                        savePath: normalizeLocalPath(data.save_path || prev.savePath || ''),
                        imageSavePath: normalizeLocalPath(rawImagePath || ''),
                        videoSavePath: normalizeLocalPath(rawVideoPath || ''),
                        convertPngToJpg: data.convert_png_to_jpg !== false,
                        jpgQuality: data.jpg_quality || prev.jpgQuality,
                        pilAvailable: data.pil_available || false
                    }));
                    return;
                }
            } catch (e) { }
            if (cancelled) return;
            setLocalCacheServerConnected(false);
        };

        checkLocalCacheServer();
        const interval = setInterval(checkLocalCacheServer, 30000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [localServerUrl, localCacheEnabled]);

    useEffect(() => {
        if (localCacheBannerTimerRef.current) {
            clearTimeout(localCacheBannerTimerRef.current);
            localCacheBannerTimerRef.current = null;
        }
        if (!localCacheEnabled) {
            setLocalCacheBannerVisible(false);
            return;
        }
        if (localCacheServerConnected) {
            setLocalCacheBannerVisible(true);
            return;
        }
        setLocalCacheBannerVisible(true);
        localCacheBannerTimerRef.current = setTimeout(() => {
            setLocalCacheBannerVisible(false);
            localCacheBannerTimerRef.current = null;
        }, 180000);
        return () => {
            if (localCacheBannerTimerRef.current) {
                clearTimeout(localCacheBannerTimerRef.current);
                localCacheBannerTimerRef.current = null;
            }
        };
    }, [localCacheEnabled, localCacheServerConnected]);

    // V2.6.1：同步 local-save 节点连接状态
    useEffect(() => {
        setNodes(prev => prev.map(n => {
            if (n.type !== 'local-save') return n;
            if (n.settings?.serverUrl) return n;
            const nextStatus = localCacheServerConnected ? 'connected' : 'disconnected';
            if (n.settings?.serverStatus === nextStatus) return n;
            return { ...n, settings: { ...n.settings, serverStatus: nextStatus } };
        }));
    }, [localCacheServerConnected]);

    // V2.6.1：本地缓存与缩略图辅助函数
    const sanitizeCacheId = useCallback((value) => {
        if (!value) return '';
        return value
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 120);
    }, []);

    const normalizeLocalPath = useCallback((value) => {
        if (!value) return '';
        const hasDrive = /^[a-zA-Z]:/.test(value);
        if (!hasDrive) return value.trim();
        return value.replace(/\//g, '\\').replace(/\\+/g, '\\').trim();
    }, []);

    const getFilenameFromUrl = useCallback((url) => {
        if (!url) return null;
        try {
            const urlWithoutQuery = url.split('?')[0];
            const parts = urlWithoutQuery.split('/');
            const filename = parts[parts.length - 1];
            const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
            const sanitized = sanitizeCacheId(nameWithoutExt || '');
            return sanitized || null;
        } catch (e) {
            return null;
        }
    }, [sanitizeCacheId]);

    const getDataUrlExt = useCallback((dataUrl, fallback = '') => {
        if (!dataUrl || !dataUrl.startsWith('data:')) return fallback;
        const match = dataUrl.match(/^data:([^;]+);/i);
        if (!match) return fallback;
        const mime = match[1].toLowerCase();
        const map = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'video/quicktime': '.mov'
        };
        return map[mime] || fallback;
    }, []);

    const detectBase64ImageMime = useCallback((raw, fallback = 'image/png') => {
        if (!raw || typeof raw !== 'string') return fallback;
        const trimmed = raw.trim();
        if (!trimmed) return fallback;
        if (trimmed.startsWith('data:')) {
            const match = trimmed.match(/^data:([^;]+);/i);
            return match?.[1]?.toLowerCase() || fallback;
        }
        if (trimmed.startsWith('/9j/')) return 'image/jpeg';
        if (trimmed.startsWith('iVBORw0KGgo')) return 'image/png';
        if (trimmed.startsWith('R0lGOD')) return 'image/gif';
        if (trimmed.startsWith('UklGR') && trimmed.toUpperCase().includes('WEBP')) return 'image/webp';
        return fallback;
    }, []);

    const normalizeImageUrlValue = (value, mimeHint = 'image/png') => {
        if (!value || typeof value !== 'string') return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('data:')) return normalizeDataUrl(trimmed);
        if (trimmed.startsWith('blob:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
        if (LocalImageManager.isImageId(trimmed) || trimmed.startsWith('asset://')) return trimmed;
        const base64Like = /^[A-Za-z0-9+/=_-]+$/.test(trimmed);
        if (base64Like && trimmed.length > 64) {
            const mimeType = detectBase64ImageMime(trimmed, mimeHint);
            const normalized = normalizeBase64Payload(trimmed);
            if (!normalized) return '';
            return `data:${mimeType};base64,${normalized}`;
        }
        return trimmed;
    };

    const persistBase64ImageUrl = async (value, options = {}) => {
        if (!value || typeof value !== 'string' || !value.startsWith('data:')) return value;
        if (options.persistBase64 === false) return value;
        if (!LocalImageManager?.saveImage) return value;
        const minLength = Number.isFinite(options.minLength) ? options.minLength : 2000;
        if (value.length < minLength) return value;
        try {
            const imgId = await LocalImageManager.saveImage(value);
            return imgId || value;
        } catch (e) {
            return value;
        }
    };

    const normalizeImageUrls = async (urls, options = {}) => {
        if (!Array.isArray(urls)) return [];
        const normalized = urls
            .map((url) => normalizeImageUrlValue(url, options.mimeHint || 'image/png'))
            .filter(Boolean);
        const unique = [];
        normalized.forEach((url) => {
            if (!unique.includes(url)) unique.push(url);
        });
        if (options.persistBase64 === false) return unique;
        const persisted = await Promise.all(unique.map((url) => persistBase64ImageUrl(url, options)));
        return persisted.filter(Boolean);
    };

    const getUrlExt = useCallback((url, fallback = '') => {
        if (!url) return fallback;
        const clean = url.split('?')[0].split('#')[0];
        const match = clean.match(/\.([a-zA-Z0-9]+)$/);
        if (!match) return fallback;
        const ext = `.${match[1].toLowerCase()}`;
        if (ext === '.jpeg') return '.jpg';
        return ext;
    }, []);

    const hashString = useCallback((value) => {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }, []);

    const getCacheIdFromUrl = useCallback((url, fallbackId) => {
        const safeFallback = sanitizeCacheId(fallbackId || '');
        if (!url) return safeFallback || `cache_${Date.now()}`;
        const hashed = hashString(url);
        if (safeFallback) return `${safeFallback}_${hashed}`;
        const fromUrl = getFilenameFromUrl(url);
        if (fromUrl) return `${fromUrl}_${hashed}`;
        return `cache_${hashed}`;
    }, [getFilenameFromUrl, sanitizeCacheId, hashString]);

    const resolveCacheFetchUrl = useCallback((rawUrl, useProxy = false) => {
        if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
        if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl;
        if (!/^https?:/i.test(rawUrl)) return rawUrl;
        if (!useProxy) return rawUrl;
        const base = (localServerUrl || '').trim().replace(/\/+$/, '');
        if (!base) return rawUrl;
        if (rawUrl.startsWith(base)) return rawUrl;
        return `${base}/proxy?url=${encodeURIComponent(rawUrl)}`;
    }, [localServerUrl]);

    // 获取 Blob 对象（统一资源获取渠道）
    const getBlobFromUrl = async (url, options = {}) => {
        if (!url) throw new Error('Invalid URL');
        const preferLocal = options.preferLocal !== false && localCacheActive;
        const proxyBaseUrl = (options.proxyBaseUrl || localServerUrl || '').trim().replace(/\/+$/, '');
        let rawUrl = String(url);
        rawUrl = await resolveSpecialUrl(rawUrl);
        rawUrl = applyMediaCachePolicy(rawUrl);
        if (!rawUrl) throw new Error('Invalid URL');
        const fetchBlob = async (target) => {
            const res = await fetch(target);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.blob();
        };
        if (rawUrl.startsWith('data:')) {
            const normalized = normalizeDataUrl(rawUrl);
            const blob = dataUrlToBlob(normalized);
            if (!blob) throw new Error('Invalid base64 payload');
            return blob;
        }
        if (rawUrl.startsWith('blob:')) {
            try {
                return await fetchBlob(rawUrl);
            } catch (e) {
                throw new Error('Blob 已失效');
            }
        }
        let targetUrl = rawUrl;
        const cachedUrl = preferLocal && historyLocalCacheMap && historyLocalCacheMap.has(rawUrl)
            ? historyLocalCacheMap.get(rawUrl)
            : null;
        if (cachedUrl) {
            const canUseCached = !isLocalCacheUrl(cachedUrl) || isLocalCacheUrlAvailable(cachedUrl);
            if (canUseCached) {
                try {
                    if (cachedUrl.startsWith('data:')) {
                        const normalized = normalizeDataUrl(cachedUrl);
                        const blob = dataUrlToBlob(normalized);
                        if (blob) return blob;
                    } else if (cachedUrl.startsWith('blob:')) {
                        return await fetchBlob(cachedUrl);
                    } else {
                        return await fetchBlob(cachedUrl);
                    }
                } catch (e) {
                    // 本地缓存不可用时回退到原始URL
                }
            }
        }
        targetUrl = rawUrl;
        if (targetUrl.startsWith('data:')) {
            const normalized = normalizeDataUrl(targetUrl);
            const blob = dataUrlToBlob(normalized);
            if (!blob) throw new Error('Invalid base64 payload');
            return blob;
        }
        if (targetUrl.startsWith('blob:')) {
            try {
                return await fetchBlob(targetUrl);
            } catch (e) {
                throw new Error('Blob 已失效');
            }
        }
        const useProxy = options.useProxy === true;
        let resolvedTarget = targetUrl;
        if (useProxy) {
            if (proxyBaseUrl) {
                resolvedTarget = targetUrl.startsWith(proxyBaseUrl)
                    ? targetUrl
                    : `${proxyBaseUrl}/proxy?url=${encodeURIComponent(targetUrl)}`;
            } else {
                resolvedTarget = resolveCacheFetchUrl(targetUrl, true);
            }
        }
        if (!resolvedTarget) throw new Error('Invalid URL');
        return await fetchBlob(resolvedTarget);
    };

    const coerceImageBlobForJimeng = useCallback(async (blob) => {
        if (!blob) return blob;
        const type = (blob.type || '').toLowerCase();
        if (type.includes('png') || type.includes('jpeg') || type.includes('jpg')) return blob;
        if (typeof createImageBitmap === 'undefined') return blob;
        try {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width || 0;
            canvas.height = bitmap.height || 0;
            const ctx = canvas.getContext('2d');
            if (!ctx) return blob;
            ctx.drawImage(bitmap, 0, 0);
            const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            return pngBlob || blob;
        } catch (e) {
            return blob;
        }
    }, []);

    // 获取 Base64 字符串（自动识别 Data URL 或 Blob URL 并转换）
    const getBase64FromUrl = async (url, options = {}) => {
        let resolvedUrl = url;
        if (resolvedUrl && typeof resolvedUrl === 'string') {
            resolvedUrl = await resolveSpecialUrl(resolvedUrl);
        }
        if (resolvedUrl && resolvedUrl.startsWith('data:')) {
            const normalized = normalizeDataUrl(resolvedUrl);
            const blob = dataUrlToBlob(normalized);
            if (!blob) throw new Error('Invalid base64 payload');
            const dataUrl = await blobToDataURL(blob);
            return dataUrl.split(',')[1] || '';
        }
        const blob = await getBlobFromUrl(resolvedUrl, options);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const res = reader.result;
                // 返回纯 Base64 部分
                resolve(res.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const blobToDataURL = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const normalizePersistLookupKey = useCallback((value) => {
        if (!value || typeof value !== 'string') return '';
        const raw = String(value).trim();
        if (!raw) return '';
        const noHash = raw.split('#')[0];
        const noQuery = noHash.split('?')[0];
        try {
            const parsed = new URL(noQuery);
            const host = String(parsed.hostname || '').toLowerCase();
            let pathname = parsed.pathname || '';
            try { pathname = decodeURIComponent(pathname); } catch (e) { }
            if ((host === '127.0.0.1' || host === 'localhost') && pathname.startsWith('/file/')) {
                return pathname.toLowerCase();
            }
            return `${parsed.origin}${pathname}`.toLowerCase();
        } catch (e) {
            return noQuery.toLowerCase();
        }
    }, []);

    const sourceReferenceLookupRef = useRef(new Map());
    const sourceReferenceResolveCacheRef = useRef(new Map());
    const refreshSourceReferenceLookup = useCallback(() => {
        const map = new Map();
        const pickSourceFallback = (historyItem) => {
            if (!historyItem || typeof historyItem !== 'object') return '';
            const candidates = [
                ...(Array.isArray(historyItem.output_images) ? historyItem.output_images : []),
                ...(Array.isArray(historyItem.mjImages) ? historyItem.mjImages : []),
                historyItem.originalUrl,
                historyItem.mjOriginalUrl,
                historyItem.url
            ];
            for (const candidate of candidates) {
                if (!candidate || typeof candidate !== 'string') continue;
                const normalized = candidate.trim();
                if (!normalized || normalized.startsWith('blob:') || isLocalCacheUrl(normalized)) continue;
                return normalized;
            }
            return '';
        };
        const addPair = (cacheUrl, sourceUrl) => {
            if (!cacheUrl || !sourceUrl) return;
            const normalizedSource = typeof sourceUrl === 'string' ? sourceUrl.trim() : '';
            if (!normalizedSource || normalizedSource.startsWith('blob:') || isLocalCacheUrl(normalizedSource)) return;
            const rawCache = String(cacheUrl);
            map.set(rawCache, normalizedSource);
            const strippedCache = rawCache.split('#')[0].split('?')[0];
            if (strippedCache && strippedCache !== rawCache) {
                map.set(strippedCache, normalizedSource);
            }
            const key = normalizePersistLookupKey(rawCache);
            if (key) map.set(key, normalizedSource);
        };
        for (const [sourceUrl, cacheUrl] of cachedHistoryUrlRef.current.entries()) {
            addPair(cacheUrl, sourceUrl);
        }
        history.forEach((historyItem) => {
            if (!historyItem || typeof historyItem !== 'object') return;
            if (historyItem.localCacheMap && typeof historyItem.localCacheMap === 'object') {
                Object.entries(historyItem.localCacheMap).forEach(([sourceUrl, cacheUrl]) => {
                    addPair(cacheUrl, sourceUrl);
                });
            }
            if (historyItem.localCacheUrl) {
                const fallback = pickSourceFallback(historyItem);
                if (fallback) addPair(historyItem.localCacheUrl, fallback);
            }
        });
        sourceReferenceLookupRef.current = map;
        sourceReferenceResolveCacheRef.current.clear();
    }, [history, isLocalCacheUrl, normalizePersistLookupKey]);
    useEffect(() => {
        refreshSourceReferenceLookup();
    }, [refreshSourceReferenceLookup]);

    const resolveSourceReferenceUrl = useCallback((value) => {
        if (!value || typeof value !== 'string') return value;
        if (sourceReferenceResolveCacheRef.current.has(value)) {
            return sourceReferenceResolveCacheRef.current.get(value);
        }
        let next = value.trim();
        if (!next) {
            sourceReferenceResolveCacheRef.current.set(value, '');
            return '';
        }
        if (LocalImageManager.isImageId(next) || next.startsWith('data:') || next.startsWith('asset://') || next.startsWith('blob:')) {
            sourceReferenceResolveCacheRef.current.set(value, next);
            return next;
        }
        const looksLikeLocalRuntimeUrl = next.includes('127.0.0.1')
            || next.includes('localhost')
            || next.includes('/proxy?url=')
            || next.includes('/file/.tapnow_cache/')
            || next.includes('.tapnow_cache\\');
        if (!looksLikeLocalRuntimeUrl) {
            sourceReferenceResolveCacheRef.current.set(value, next);
            return next;
        }

        const unwrapProxy = (raw) => {
            try {
                const parsed = new URL(String(raw));
                const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
                if (isLocalHost && parsed.pathname === '/proxy') {
                    const target = parsed.searchParams.get('url');
                    if (target) return target;
                }
            } catch (e) { }
            return raw;
        };
        next = unwrapProxy(next);

        if (!isLocalCacheUrl(next)) {
            sourceReferenceResolveCacheRef.current.set(value, next);
            return next;
        }

        const direct = sourceReferenceLookupRef.current.get(next);
        if (direct) {
            sourceReferenceResolveCacheRef.current.set(value, direct);
            return direct;
        }
        const stripped = next.split('#')[0].split('?')[0];
        if (stripped) {
            const fromStripped = sourceReferenceLookupRef.current.get(stripped);
            if (fromStripped) {
                sourceReferenceResolveCacheRef.current.set(value, fromStripped);
                return fromStripped;
            }
        }
        const targetKey = normalizePersistLookupKey(next);
        if (targetKey) {
            const fromKey = sourceReferenceLookupRef.current.get(targetKey);
            if (fromKey) {
                sourceReferenceResolveCacheRef.current.set(value, fromKey);
                return fromKey;
            }
        }
        sourceReferenceResolveCacheRef.current.set(value, next);
        return next;
    }, [isLocalCacheUrl, normalizePersistLookupKey]);

    const resolveAutoSaveUrl = useCallback(async (value) => {
        if (!value || typeof value !== 'string') return value;
        if (value.startsWith('asset://')) return value;
        if (!value.startsWith('blob:')) {
            const maybeLocalRuntime = value.includes('127.0.0.1')
                || value.includes('localhost')
                || value.includes('/proxy?url=')
                || value.includes('/file/.tapnow_cache/')
                || value.includes('.tapnow_cache\\');
            if (!maybeLocalRuntime) return value;
            return resolveSourceReferenceUrl(value);
        }
        if (autoSaveUrlCacheRef.current.has(value)) return autoSaveUrlCacheRef.current.get(value);
        const fallback = getAssetFallbackUrl(value);
        if (fallback) {
            autoSaveUrlCacheRef.current.set(value, fallback);
            return fallback;
        }
        try {
            const blob = await getBlobFromUrl(value);
            if (blob && blob.type && blob.type.startsWith('image/')) {
                try {
                    const imgId = await LocalImageManager.saveImage(blob);
                    if (imgId) {
                        autoSaveUrlCacheRef.current.set(value, imgId);
                        return imgId;
                    }
                } catch (e) { }
                const dataUrl = await blobToDataURL(blob);
                autoSaveUrlCacheRef.current.set(value, dataUrl);
                return dataUrl;
            }
            if (blob && blob.type && blob.type.startsWith('video/')) {
                if (blob.size <= 8 * 1024 * 1024) {
                    const dataUrl = await blobToDataURL(blob);
                    autoSaveUrlCacheRef.current.set(value, dataUrl);
                    return dataUrl;
                }
            }
        } catch (e) { }
        const sourceFallback = resolveSourceReferenceUrl(value);
        autoSaveUrlCacheRef.current.set(value, sourceFallback);
        return sourceFallback;
    }, [getBlobFromUrl, getAssetFallbackUrl, resolveSourceReferenceUrl]);

    const sanitizeObjectForAutoSave = useCallback(async (obj) => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'string') {
            return await resolveAutoSaveUrl(obj);
        }
        if (Array.isArray(obj)) {
            const next = [];
            for (let i = 0; i < obj.length; i++) {
                next[i] = await sanitizeObjectForAutoSave(obj[i]);
            }
            return next;
        }
        if (typeof obj === 'object') {
            const next = {};
            const entries = Object.entries(obj);
            for (let i = 0; i < entries.length; i++) {
                const [key, value] = entries[i];
                next[key] = await sanitizeObjectForAutoSave(value);
            }
            return next;
        }
        return obj;
    }, [resolveAutoSaveUrl]);

    const persistAutoSaveSnapshot = useCallback(async (override = {}) => {
        const snapshotNodes = Array.isArray(override.nodes) ? override.nodes : (nodesRef.current || []);
        const snapshotConnections = Array.isArray(override.connections) ? override.connections : (connectionsRef.current || []);
        const timestamp = Date.now();
        const safeNodes = await sanitizeObjectForAutoSave(snapshotNodes);
        const saveData = {
            nodes: safeNodes,
            connections: snapshotConnections,
            timestamp
        };
        const payload = JSON.stringify(saveData);
        try {
            await writeAutoSaveToIdb(payload);
            autoSaveUseIdbRef.current = true;
            writeAutoSaveMeta({ timestamp, storage: 'idb' });
            try { localStorage.removeItem(AUTOSAVE_LOCAL_KEY); } catch (e) { }
            console.log('[AutoSave] 已立即写入 IndexedDB', new Date().toLocaleTimeString());
        } catch (e) {
            try {
                if (payload.length > 4 * 1024 * 1024) {
                    throw new Error('payload too large');
                }
                localStorage.setItem(AUTOSAVE_LOCAL_KEY, payload);
                autoSaveUseIdbRef.current = false;
                writeAutoSaveMeta({ timestamp, storage: 'local' });
                console.log('[AutoSave] 已立即写入本地存储', new Date().toLocaleTimeString());
            } catch (err) {
                console.warn('[AutoSave] 立即保存失败:', err.message || err);
            }
        }
    }, [sanitizeObjectForAutoSave]);

    const generateThumbnail = useCallback(async (imageUrl, quality = 'normal', options = {}) => {
        const config = quality === 'ultra'
            ? { maxSize: 80, jpegQuality: 0.3 }
            : { maxSize: 150, jpegQuality: 0.6 };
        let resolvedUrl = imageUrl;
        if (!resolvedUrl) return null;
        try {
            if (LocalImageManager.isImageId(resolvedUrl)) {
                resolvedUrl = await LocalImageManager.getImage(resolvedUrl);
            }
        } catch (e) {
            return null;
        }
        if (!resolvedUrl) return null;
        try {
            const blob = await getBlobFromUrl(resolvedUrl, {
                useProxy: options.useProxy,
                preferLocal: options.preferLocal
            });
            if (!blob) return null;
            const blobUrl = URL.createObjectURL(blob);
            return await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;
                    if (w > h) {
                        if (w > config.maxSize) { h = h * config.maxSize / w; w = config.maxSize; }
                    } else {
                        if (h > config.maxSize) { w = w * config.maxSize / h; h = config.maxSize; }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', config.jpegQuality);
                    URL.revokeObjectURL(blobUrl);
                    resolve(dataUrl);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(blobUrl);
                    resolve(null);
                };
                img.src = blobUrl;
            });
        } catch (e) {
            return null;
        }
    }, [getBlobFromUrl]);

    // 辅助函数：将 Base64 Data URL 转换为 Blob URL
    const base64ToBlobUrl = async (base64Data) => {
        try {
            if (!base64Data || typeof base64Data !== 'string') {
                return base64Data;
            }
            // 如果已经是 Blob URL 或 HTTP URL，直接返回
            if (base64Data.startsWith('blob:') || base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
                return base64Data;
            }
            // 如果是 Base64 Data URL，转换为 Blob URL
            if (base64Data.startsWith('data:')) {
                const blob = dataUrlToBlob(base64Data);
                return URL.createObjectURL(blob);
            }
            // 其他情况直接返回
            return base64Data;
        } catch (e) {
            console.error('Base64转Blob失败', e);
            return base64Data; // 失败则返回原数据
        }
    };

    const CACHE_FETCH_RETRY_MS = 5 * 60 * 1000;
    const getCacheFailureKey = useCallback((url) => {
        if (!url) return '';
        try {
            const parsed = new URL(url);
            return parsed.origin || url;
        } catch (e) {
            return url;
        }
    }, []);
    const shouldSkipCacheFetch = useCallback((url) => {
        if (!url) return false;
        const key = getCacheFailureKey(url);
        const lastFail = cacheFetchFailureRef.current.get(key);
        return lastFail && (Date.now() - lastFail < CACHE_FETCH_RETRY_MS);
    }, [getCacheFailureKey]);
    const recordCacheFetchFailure = useCallback((url) => {
        if (!url) return;
        const key = getCacheFailureKey(url);
        cacheFetchFailureRef.current.set(key, Date.now());
    }, [getCacheFailureKey]);
    const shouldProbeCacheHead = useCallback((url, ttlMs = 60000) => {
        if (!url) return false;
        const now = Date.now();
        const last = cacheHeadProbeRef.current.get(url) || 0;
        if (now - last < ttlMs) return false;
        cacheHeadProbeRef.current.set(url, now);
        return true;
    }, []);
    const fetchCacheSource = useCallback(async (imageUrl, options = {}) => {
        const useProxy = options.useProxy === true;
        const proxyBaseUrl = options.proxyBaseUrl;
        const preferLocal = options.preferLocal === true;
        if (!imageUrl) throw new Error('缓存拉取失败: 空链接');
        try {
            const blob = await getBlobFromUrl(imageUrl, { useProxy, preferLocal, proxyBaseUrl });
            if (!blob || blob.size === 0) throw new Error('缓存拉取失败: 空文件');
            return { blob, source: imageUrl };
        } catch (err) {
            throw err || new Error('缓存拉取失败');
        }
    }, [getBlobFromUrl]);

    const saveImageToLocalCache = useCallback(async (itemId, imageUrl, category = 'history', options = {}) => {
        if (!localCacheActive) return null;
        const baseUrl = (localServerUrl || '').replace(/\/+$/, '');
        if (!baseUrl) return null;
        const useProxy = options.useProxy === true;
        try {
            const forcedId = options?.forceId ? sanitizeCacheId(itemId || '') : '';
            const saveId = forcedId || getCacheIdFromUrl(imageUrl, itemId);

            let content = imageUrl;
            if (!imageUrl.startsWith('data:')) {
                if (!useProxy && shouldSkipCacheFetch(imageUrl)) return null;
                const { blob } = await fetchCacheSource(imageUrl, { useProxy });
                content = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } else {
                content = normalizeDataUrl(imageUrl);
            }
            const ext = getDataUrlExt(content, getUrlExt(imageUrl, '.jpg'));

            const res = await fetch(`${baseUrl}/save-cache`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: saveId, content, category, ext, type: 'image' })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    const relPath = extractLocalCacheRelPath(data.url);
                    if (relPath) {
                        localCacheFileIndexRef.current.add(relPath);
                        localCacheIndexReadyRef.current = true;
                        setLocalCacheIndexTick((prev) => prev + 1);
                    }
                    return { url: data.url, path: data.path };
                }
            }
        } catch (e) {
            if (imageUrl && !imageUrl.startsWith('data:')) {
                recordCacheFetchFailure(imageUrl);
            }
            console.warn('[缓存] 保存图片缓存失败:', e);
        }
        return null;
    }, [localCacheActive, localServerUrl, getCacheIdFromUrl, getDataUrlExt, getUrlExt, sanitizeCacheId, shouldSkipCacheFetch, fetchCacheSource, recordCacheFetchFailure, extractLocalCacheRelPath]);

    const saveVideoToLocalCache = useCallback(async (itemId, videoUrl, category = 'history', options = {}) => {
        if (!localCacheActive) return null;
        const baseUrl = (localServerUrl || '').replace(/\/+$/, '');
        if (!baseUrl) return null;
        const useProxy = options.useProxy === true;
        try {
            const saveId = getCacheIdFromUrl(videoUrl, itemId);

            if (!useProxy && shouldSkipCacheFetch(videoUrl)) return null;
            const { blob } = await fetchCacheSource(videoUrl, { useProxy });
            const content = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            const ext = getDataUrlExt(content, getUrlExt(videoUrl, '.mp4'));

            const saveRes = await fetch(`${baseUrl}/save-cache`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: saveId, content, category, ext, type: 'video' })
            });
            if (saveRes.ok) {
                const data = await saveRes.json();
                if (data.success) {
                    const relPath = extractLocalCacheRelPath(data.url);
                    if (relPath) {
                        localCacheFileIndexRef.current.add(relPath);
                        localCacheIndexReadyRef.current = true;
                        setLocalCacheIndexTick((prev) => prev + 1);
                    }
                    return { url: data.url, path: data.path };
                }
            }
        } catch (e) {
            if (videoUrl) {
                recordCacheFetchFailure(videoUrl);
            }
            console.warn('[缓存] 保存视频缓存失败:', e);
        }
        return null;
    }, [localCacheActive, localServerUrl, getCacheIdFromUrl, getDataUrlExt, getUrlExt, shouldSkipCacheFetch, fetchCacheSource, recordCacheFetchFailure, extractLocalCacheRelPath]);

    const updateLocalCacheServerConfig = useCallback(async (patch, options = {}) => {
        const silent = options.silent === true;
        const baseUrl = (localServerUrl || '').replace(/\/+$/, '');
        if (!baseUrl) {
            if (!silent) showToast('本地服务地址为空', 'error');
            return false;
        }
        const normalizedPatch = { ...patch };
        if (normalizedPatch.save_path) normalizedPatch.save_path = normalizeLocalPath(normalizedPatch.save_path);
        if (normalizedPatch.image_save_path) normalizedPatch.image_save_path = normalizeLocalPath(normalizedPatch.image_save_path);
        if (normalizedPatch.video_save_path) normalizedPatch.video_save_path = normalizeLocalPath(normalizedPatch.video_save_path);
        try {
            const res = await fetch(`${baseUrl}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(normalizedPatch)
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || '配置更新失败');
            }
            const data = await res.json();
            const serverConfig = data?.config || {};
            const rawImagePath = serverConfig.image_save_path_raw;
            const rawVideoPath = serverConfig.video_save_path_raw;
            setLocalServerConfig(prev => ({
                ...prev,
                savePath: normalizeLocalPath(
                    serverConfig.save_path ?? normalizedPatch.save_path ?? prev.savePath ?? ''
                ),
                imageSavePath: normalizeLocalPath(
                    rawImagePath !== undefined
                        ? rawImagePath
                        : (serverConfig.image_save_path ?? normalizedPatch.image_save_path ?? prev.imageSavePath ?? '')
                ),
                videoSavePath: normalizeLocalPath(
                    rawVideoPath !== undefined
                        ? rawVideoPath
                        : (serverConfig.video_save_path ?? normalizedPatch.video_save_path ?? prev.videoSavePath ?? '')
                ),
                convertPngToJpg: (serverConfig.convert_png_to_jpg ?? normalizedPatch.convert_png_to_jpg) !== undefined
                    ? (serverConfig.convert_png_to_jpg ?? normalizedPatch.convert_png_to_jpg) !== false
                    : prev.convertPngToJpg,
                jpgQuality: serverConfig.jpg_quality ?? normalizedPatch.jpg_quality ?? prev.jpgQuality,
                pilAvailable: serverConfig.pil_available ?? prev.pilAvailable
            }));
            if (!silent) showToast(data?.message || '本地缓存配置已更新', 'success', 2000);
            return true;
        } catch (err) {
            if (!silent) showToast(`配置更新失败: ${err.message || '网络错误'}`, 'error', 2000);
            return false;
        }
    }, [localServerUrl, showToast, normalizeLocalPath]);

    const refreshLocalCache = useCallback((options = {}) => {
        const silent = !!options.silent;
        const reset = options.reset !== false;
        triedCacheIdsRef.current = new Set();
        thumbnailCacheRef.current = new Map();
        localCacheCheckRef.current = new Map();
        cachedHistoryUrlRef.current = new Map();
        cacheFetchFailureRef.current = new Map();
        localCacheFileIndexRef.current = new Set();
        localCacheIndexReadyRef.current = false;
        setLocalCacheIndexTick((prev) => prev + 1);
        if (reset) {
            setHistory(prev => prev.map(item => ({
                ...item,
                localCacheUrl: null,
                localFilePath: null,
                localCacheMap: null
            })));
            setCharacterLibrary(prev => prev.map(item => ({
                ...item,
                localCacheUrl: null,
                localFilePath: null
            })));
        }
        setCacheRefreshTick(prev => prev + 1);
        if (!silent) {
            showToast('已触发缓存刷新，将重新写入本地缓存路径', 'success');
        }
        refreshLocalCacheFileIndex({ silent: true });
    }, [showToast, refreshLocalCacheFileIndex]);

    useEffect(() => {
        if (!localCacheActive) return;
        refreshLocalCache({ silent: true, reset: cacheRedownloadOnEnable });
    }, [localCacheActive, refreshLocalCache, cacheRedownloadOnEnable]);

    const getItemProxyPreference = useCallback((item) => {
        if (typeof item?.useProxy === 'boolean') return item.useProxy;
        if (typeof item?.apiConfig?.useProxy === 'boolean') return item.apiConfig.useProxy;
        let providerKey = String(item?.provider || item?.apiConfig?.provider || '').trim();
        if (!providerKey) {
            const modelKey = String(item?.model || item?.modelName || item?.apiConfig?.modelId || '').trim();
            if (modelKey) {
                const matched = apiConfigs.find(cfg =>
                    cfg?.id === modelKey
                    || cfg?.modelName === modelKey
                    || cfg?.displayName === modelKey
                );
                providerKey = String(matched?.provider || '').trim();
            }
        }
        if (!providerKey) return false;
        if (providers[providerKey]?.useProxy) return true;
        const normalizedKey = providerKey.toLowerCase();
        if (normalizedKey && providers[normalizedKey]?.useProxy) return true;
        return false;
    }, [providers, apiConfigs]);

    const historyLocalCacheMap = useMemo(() => {
        const map = new Map();
        history.forEach((item) => {
            if (!item) return;
            if (item.localCacheMap) {
                Object.entries(item.localCacheMap).forEach(([sourceUrl, cacheUrl]) => {
                    if (sourceUrl && cacheUrl) map.set(sourceUrl, cacheUrl);
                });
            }
            if (item.localCacheUrl) {
                const primaryUrls = [item.url, item.originalUrl, item.mjOriginalUrl].filter(Boolean);
                primaryUrls.forEach((url) => map.set(url, item.localCacheUrl));
                if ((!item.localCacheMap || Object.keys(item.localCacheMap).length === 0)) {
                    if (Array.isArray(item.mjImages) && item.mjImages.length === 1) {
                        map.set(item.mjImages[0], item.localCacheUrl);
                    }
                    if (Array.isArray(item.output_images) && item.output_images.length === 1) {
                        map.set(item.output_images[0], item.localCacheUrl);
                    }
                }
            }
        });
        return map;
    }, [history]);

    const normalizeLocalCacheLookupKey = useCallback((value) => {
        if (!value || typeof value !== 'string') return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        const noHash = trimmed.split('#')[0];
        const noQuery = noHash.split('?')[0];
        try {
            const parsed = new URL(noQuery);
            const host = String(parsed.hostname || '').toLowerCase();
            let pathname = parsed.pathname || '';
            try {
                pathname = decodeURIComponent(pathname);
            } catch (e) { }
            if ((host === '127.0.0.1' || host === 'localhost') && pathname.startsWith('/file/')) {
                return pathname.toLowerCase();
            }
            return `${parsed.origin}${pathname}`.toLowerCase();
        } catch (e) {
            return noQuery.toLowerCase();
        }
    }, []);

    const localCacheSourceMap = useMemo(() => {
        const map = new Map();
        const addPair = (cacheUrl, sourceUrl) => {
            if (!cacheUrl || !sourceUrl) return;
            const normalizedSource = sanitizeHistoryUrlValue(sourceUrl, '', { allowLocalCache: false }) || sourceUrl;
            if (!normalizedSource || isLocalCacheUrl(normalizedSource)) return;
            const rawCache = String(cacheUrl);
            map.set(rawCache, normalizedSource);
            const strippedCache = rawCache.split('#')[0].split('?')[0];
            if (strippedCache && strippedCache !== rawCache) {
                map.set(strippedCache, normalizedSource);
            }
            const key = normalizeLocalCacheLookupKey(rawCache);
            if (key) {
                map.set(key, normalizedSource);
            }
        };
        history.forEach((item) => {
            if (!item) return;
            if (item.localCacheMap && typeof item.localCacheMap === 'object') {
                Object.entries(item.localCacheMap).forEach(([sourceUrl, cacheUrl]) => {
                    addPair(cacheUrl, sourceUrl);
                });
            }
            if (item.localCacheUrl) {
                const fallback = getHistoryFallbackUrl(item, { allowLocalCache: false });
                if (fallback) addPair(item.localCacheUrl, fallback);
            }
        });
        return map;
    }, [history, getHistoryFallbackUrl, sanitizeHistoryUrlValue, isLocalCacheUrl, normalizeLocalCacheLookupKey]);

    const resolveLocalCacheSourceUrl = useCallback((value) => {
        if (!value || typeof value !== 'string') return '';
        if (!isLocalCacheUrl(value)) return value;
        const direct = localCacheSourceMap.get(value);
        if (direct && !isLocalCacheUrl(direct)) return direct;
        const stripped = value.split('#')[0].split('?')[0];
        if (stripped) {
            const byStripped = localCacheSourceMap.get(stripped);
            if (byStripped && !isLocalCacheUrl(byStripped)) return byStripped;
        }
        const key = normalizeLocalCacheLookupKey(value);
        if (key) {
            const byKey = localCacheSourceMap.get(key);
            if (byKey && !isLocalCacheUrl(byKey)) return byKey;
        }
        return '';
    }, [localCacheSourceMap, normalizeLocalCacheLookupKey, isLocalCacheUrl]);

    const isHistoryCacheMappingValid = useCallback((item, sourceUrl, cacheUrl) => {
        if (!cacheUrl) return false;
        if (!isLocalCacheUrl(cacheUrl)) return true;
        if (!sourceUrl || isLocalCacheUrl(sourceUrl)) return true;
        const safeItemId = sanitizeCacheId(item?.id || '');
        if (!safeItemId) return true;
        const multiImages = Array.isArray(item?.mjImages) && item.mjImages.length > 1
            ? item.mjImages
            : (Array.isArray(item?.output_images) && item.output_images.length > 1 ? item.output_images : null);
        const sourceIndex = multiImages ? multiImages.indexOf(sourceUrl) : -1;
        const fallbackSeed = sourceIndex >= 0 ? `${safeItemId}-${sourceIndex}` : safeItemId;
        const expectedCacheIdRaw = getCacheIdFromUrl(sourceUrl, fallbackSeed);
        const expectedCacheId = sanitizeCacheId(expectedCacheIdRaw) || expectedCacheIdRaw;
        if (!expectedCacheId) return true;
        return String(cacheUrl).includes(expectedCacheId);
    }, [isLocalCacheUrl, sanitizeCacheId, getCacheIdFromUrl]);

    const resolveLocalCacheTargetUrl = useCallback((sourceUrl, options = {}) => {
        if (!sourceUrl || typeof sourceUrl !== 'string') return '';
        if (!localCacheActive) return '';
        if (isLocalCacheUrl(sourceUrl)) {
            return isLocalCacheUrlAvailable(sourceUrl) ? sourceUrl : '';
        }
        const historyItem = options.historyItem || null;
        if (historyItem?.localCacheMap?.[sourceUrl]) {
            const fromItem = historyItem.localCacheMap[sourceUrl];
            if (fromItem
                && isHistoryCacheMappingValid(historyItem, sourceUrl, fromItem)
                && isLocalCacheUrlAvailable(fromItem)) {
                return fromItem;
            }
        }
        if (historyLocalCacheMap && historyLocalCacheMap.has(sourceUrl)) {
            const fromGlobal = historyLocalCacheMap.get(sourceUrl);
            const valid = historyItem
                ? isHistoryCacheMappingValid(historyItem, sourceUrl, fromGlobal)
                : true;
            if (fromGlobal && valid && isLocalCacheUrlAvailable(fromGlobal)) {
                return fromGlobal;
            }
        }
        return '';
    }, [localCacheActive, isLocalCacheUrl, isLocalCacheUrlAvailable, historyLocalCacheMap, isHistoryCacheMappingValid]);

    const applyMediaCachePolicy = useCallback((value, options = {}) => {
        if (!value || typeof value !== 'string') return value;
        if (LocalImageManager.isImageId(value)) return value;
        if (value.startsWith('asset://')) return value;
        if (value.startsWith('blob:')) return value;

        const historyItem = options.historyItem || null;
        const normalized = sanitizeHistoryUrlValue(value, '', { allowLocalCache: true }) || '';
        if (!normalized) return '';

        if (!localCacheActive) {
            if (isLocalCacheUrl(normalized)) {
                const fallback = resolveLocalCacheSourceUrl(normalized);
                if (!fallback) return '';
                const source = sanitizeHistoryUrlValue(fallback, '', { allowLocalCache: false }) || '';
                return normalizeHistoryUrl(source || '');
            }
            return normalizeHistoryUrl(sanitizeHistoryUrlValue(normalized, '', { allowLocalCache: false }) || '');
        }

        let next = normalized;
        if (isLocalCacheUrl(next)) {
            if (isLocalCacheUrlAvailable(next)) {
                return normalizeHistoryUrl(next);
            }
            const fallback = resolveLocalCacheSourceUrl(next);
            next = fallback || next;
        }

        const localTarget = resolveLocalCacheTargetUrl(next, { historyItem });
        if (localTarget) return normalizeHistoryUrl(localTarget);
        if (isComfyLocalUrl(next)) {
            const base = (localServerUrl || '').trim().replace(/\/+$/, '');
            if (base) return `${base}/proxy?url=${encodeURIComponent(next)}`;
        }
        return normalizeHistoryUrl(sanitizeHistoryUrlValue(next, '', { allowLocalCache: true }) || '');
    }, [localCacheActive, isLocalCacheUrl, isLocalCacheUrlAvailable, resolveLocalCacheSourceUrl, sanitizeHistoryUrlValue, resolveLocalCacheTargetUrl, isComfyLocalUrl, localServerUrl]);

    // 统一资产解析渠道 X：所有图片/视频消费方统一调用此函数获取最终 URL
    const resolveAssetChannelUrl = useCallback((value, options = {}) => {
        return applyMediaCachePolicy(value, options);
    }, [applyMediaCachePolicy]);

    const historyUrlProxyMap = useMemo(() => {
        const map = new Map();
        history.forEach((item) => {
            if (!item) return;
            const useProxy = getItemProxyPreference(item);
            const urls = [
                item.url,
                item.originalUrl,
                item.mjOriginalUrl,
                ...(Array.isArray(item.mjImages) ? item.mjImages : []),
                ...(Array.isArray(item.output_images) ? item.output_images : [])
            ].filter(Boolean);
            urls.forEach((url) => {
                if (typeof url !== 'string') return;
                if (!/^https?:/i.test(url)) return;
                map.set(url, useProxy);
            });
        });
        return map;
    }, [history, getItemProxyPreference]);

    const getProxyPreferenceForUrl = useCallback((url, fallback = false) => {
        if (!url) return !!fallback;
        const raw = String(url);
        if (raw.startsWith('data:') || raw.startsWith('blob:')) return false;
        const base = (localServerUrl || '').trim();
        if (base && raw.startsWith(base)) return false;
        if (localCacheActive && isComfyLocalUrl(raw)) return true;
        if (localCacheActive && historyLocalCacheMap.has(raw)) {
            const cached = historyLocalCacheMap.get(raw);
            if (cached && isLocalCacheUrlAvailable(cached)) return false;
        }
        if (historyUrlProxyMap.has(raw)) return !!historyUrlProxyMap.get(raw);
        return !!fallback;
    }, [historyUrlProxyMap, historyLocalCacheMap, localServerUrl, localCacheActive, isLocalCacheUrlAvailable, isComfyLocalUrl]);

    useEffect(() => {
        const nextPath = {
            savePath: localServerConfig.savePath || '',
            imageSavePath: localServerConfig.imageSavePath || '',
            videoSavePath: localServerConfig.videoSavePath || ''
        };
        const prevPath = localCachePathRef.current;
        const changed = prevPath.savePath !== nextPath.savePath
            || prevPath.imageSavePath !== nextPath.imageSavePath
            || prevPath.videoSavePath !== nextPath.videoSavePath;
        localCachePathRef.current = nextPath;
        if (!localCacheEnabled || !changed) return;
        if (!prevPath.savePath && !prevPath.imageSavePath && !prevPath.videoSavePath) return;
        refreshLocalCache({ silent: true, reset: cacheRedownloadOnEnable });
    }, [localServerConfig.savePath, localServerConfig.imageSavePath, localServerConfig.videoSavePath, localCacheEnabled, refreshLocalCache, cacheRedownloadOnEnable]);

    const handleHistoryCacheMissing = useCallback((itemId, failedUrl) => {
        if (!itemId) return;
        sourceReferenceResolveCacheRef.current.clear();
        if (failedUrl) {
            for (const [sourceUrl, cacheUrl] of cachedHistoryUrlRef.current.entries()) {
                if (cacheUrl === failedUrl) {
                    cachedHistoryUrlRef.current.delete(sourceUrl);
                }
            }
            const relPath = extractLocalCacheRelPath(failedUrl);
            if (relPath) {
                localCacheFileIndexRef.current.delete(relPath);
                setLocalCacheIndexTick((prev) => prev + 1);
            }
        }
        setHistory(prev => prev.map(item => {
            if (item.id !== itemId) return item;
            if (!failedUrl) {
                return { ...item, localCacheUrl: null, localFilePath: null, localCacheMap: null };
            }
            let nextMap = item.localCacheMap ? { ...item.localCacheMap } : null;
            if (nextMap) {
                Object.entries(nextMap).forEach(([sourceUrl, cacheUrl]) => {
                    if (cacheUrl === failedUrl || sourceUrl === failedUrl) {
                        delete nextMap[sourceUrl];
                    }
                });
            }
            const nextMapKeys = nextMap ? Object.keys(nextMap) : [];
            const nextLocalCacheUrl = item.localCacheUrl === failedUrl
                ? (nextMapKeys.length > 0 ? nextMap[nextMapKeys[0]] : null)
                : item.localCacheUrl;
            return {
                ...item,
                localCacheUrl: nextLocalCacheUrl || null,
                localFilePath: nextLocalCacheUrl ? item.localFilePath : null,
                localCacheMap: nextMapKeys.length > 0 ? nextMap : null
            };
        }));
    }, []);

    const normalizeHistoryUrl = (value) => {
        if (!value || typeof value !== 'string') return value;
        if (value.startsWith('asset://')) {
            const resolved = resolveAssetBundleUrl(value);
            if (resolved && resolved !== value) return resolved;
            const fallback = getAssetFallbackUrl(value);
            return fallback || value;
        }
        if (value.startsWith('data:')) return normalizeDataUrl(value);
        return value;
    };

    const resolveHistoryUrl = useCallback((item, specificUrl = null) => {
        if (!item) return '';
        if (specificUrl) {
            if (localCacheActive && historyLocalCacheMap && historyLocalCacheMap.has(specificUrl)) {
                const cached = historyLocalCacheMap.get(specificUrl);
                if (cached && isHistoryCacheMappingValid(item, specificUrl, cached) && isLocalCacheUrlAvailable(cached)) return cached;
            }
            if (localCacheActive && item.localCacheMap && item.localCacheMap[specificUrl]) {
                const cached = item.localCacheMap[specificUrl];
                if (cached && isHistoryCacheMappingValid(item, specificUrl, cached) && isLocalCacheUrlAvailable(cached)) return cached;
            }
            const normalized = sanitizeHistoryUrlValue(specificUrl, '', { allowLocalCache: localCacheActive });
            if (!normalized || normalized.startsWith('blob:')) {
                const fallback = sanitizeHistoryUrlValue(
                    getHistoryFallbackUrl(item, { allowLocalCache: localCacheActive }),
                    '',
                    { allowLocalCache: localCacheActive }
                );
                return normalizeHistoryUrl(fallback || '');
            }
            if (!localCacheActive && normalized.startsWith('data:')) {
                const fallback = sanitizeHistoryUrlValue(
                    getHistoryFallbackUrl(item, { allowLocalCache: false }),
                    '',
                    { allowLocalCache: false }
                );
                return normalizeHistoryUrl(fallback || '');
            }
            if (!localCacheActive && isLocalCacheUrl(normalized)) {
                const fallback = sanitizeHistoryUrlValue(
                    getHistoryFallbackUrl(item, { allowLocalCache: false }),
                    '',
                    { allowLocalCache: false }
                );
                return normalizeHistoryUrl(fallback || '');
            }
            if (localCacheActive && isComfyLocalUrl(normalized)) {
                const base = (localServerUrl || '').trim().replace(/\/+$/, '');
                if (base) return `${base}/proxy?url=${encodeURIComponent(normalized)}`;
            }
            return normalizeHistoryUrl(normalized);
        }
        const cacheUrl = localCacheActive
            ? (item.localCacheUrl || (item.localCacheMap ? Object.values(item.localCacheMap)[0] : null))
            : null;
        if (cacheUrl && isLocalCacheUrlAvailable(cacheUrl)) {
            return normalizeHistoryUrl(cacheUrl);
        }
        const fallback = sanitizeHistoryUrlValue(
            getHistoryFallbackUrl(item, { allowLocalCache: localCacheActive }),
            '',
            { allowLocalCache: localCacheActive }
        );
        return normalizeHistoryUrl(fallback || '');
    }, [localCacheActive, historyLocalCacheMap, isLocalCacheUrlAvailable, localCacheIndexTick, sanitizeHistoryUrlValue, getHistoryFallbackUrl, isLocalCacheUrl, isComfyLocalUrl, localServerUrl, isHistoryCacheMappingValid]);

    const resolveHistoryPreviewUrl = useCallback((item, specificUrl = null) => {
        if (!item) return '';
        if (specificUrl) {
            if (localCacheActive && historyLocalCacheMap && historyLocalCacheMap.has(specificUrl)) {
                const cached = historyLocalCacheMap.get(specificUrl);
                if (cached && isHistoryCacheMappingValid(item, specificUrl, cached) && isLocalCacheUrlAvailable(cached)) return cached;
            }
            if (localCacheActive && item.localCacheMap && item.localCacheMap[specificUrl]) {
                const cached = item.localCacheMap[specificUrl];
                if (cached && isHistoryCacheMappingValid(item, specificUrl, cached) && isLocalCacheUrlAvailable(cached)) return cached;
            }
            if (performanceMode !== 'off' && item.mjImages && item.mjThumbnails) {
                const idx = item.mjImages.indexOf(specificUrl);
                if (idx >= 0 && item.mjThumbnails[idx]) {
                    return item.mjThumbnails[idx];
                }
            }
            const normalized = sanitizeHistoryUrlValue(specificUrl, '', { allowLocalCache: localCacheActive });
            if (!normalized || normalized.startsWith('blob:')) {
                const fallback = getHistoryFallbackUrl(item, { allowLocalCache: localCacheActive })
                    || sanitizeHistoryUrlValue(item.thumbnailUrl, '', { allowLocalCache: localCacheActive });
                return normalizeHistoryUrl(sanitizeHistoryUrlValue(fallback || '', '', { allowLocalCache: localCacheActive }) || '');
            }
            if (!localCacheActive && normalized.startsWith('data:')) {
                const fallback = getHistoryFallbackUrl(item, { allowLocalCache: false })
                    || sanitizeHistoryUrlValue(item.thumbnailUrl, '', { allowLocalCache: false });
                return normalizeHistoryUrl(sanitizeHistoryUrlValue(fallback || '', '', { allowLocalCache: false }) || '');
            }
            if (!localCacheActive && isLocalCacheUrl(normalized)) {
                const fallback = getHistoryFallbackUrl(item, { allowLocalCache: false })
                    || sanitizeHistoryUrlValue(item.thumbnailUrl, '', { allowLocalCache: false });
                return normalizeHistoryUrl(sanitizeHistoryUrlValue(fallback || '', '', { allowLocalCache: false }) || '');
            }
            if (localCacheActive && isComfyLocalUrl(normalized)) {
                const base = (localServerUrl || '').trim().replace(/\/+$/, '');
                if (base) return `${base}/proxy?url=${encodeURIComponent(normalized)}`;
            }
            return normalizeHistoryUrl(normalized);
        }
        const cacheUrl = localCacheActive
            ? (item.localCacheUrl || (item.localCacheMap ? Object.values(item.localCacheMap)[0] : null))
            : null;
        if (performanceMode === 'off') {
            if (cacheUrl && isLocalCacheUrlAvailable(cacheUrl)) {
                return normalizeHistoryUrl(cacheUrl);
            }
            const fallback = getHistoryFallbackUrl(item, { allowLocalCache: localCacheActive });
            return normalizeHistoryUrl(fallback || '');
        }
        if (cacheUrl && isLocalCacheUrlAvailable(cacheUrl)) {
            return normalizeHistoryUrl(cacheUrl);
        }
        const fallback = sanitizeHistoryUrlValue(item.thumbnailUrl, '', { allowLocalCache: localCacheActive })
            || getHistoryFallbackUrl(item, { allowLocalCache: localCacheActive });
        return normalizeHistoryUrl(sanitizeHistoryUrlValue(fallback || '', '', { allowLocalCache: localCacheActive }) || '');
    }, [localCacheActive, performanceMode, historyLocalCacheMap, isLocalCacheUrlAvailable, localCacheIndexTick, sanitizeHistoryUrlValue, getHistoryFallbackUrl, isLocalCacheUrl, isComfyLocalUrl, localServerUrl, isHistoryCacheMappingValid]);

    const getHistoryMultiImages = useCallback((item) => {
        if (!item) return null;
        if (Array.isArray(item.mjImages) && item.mjImages.length > 1) return item.mjImages;
        if (Array.isArray(item.output_images) && item.output_images.length > 1) return item.output_images;
        return null;
    }, []);
    const normalizeHistoryNavComparableUrl = useCallback((value) => {
        if (!value || typeof value !== 'string') return '';
        const unwrapProxyUrl = (raw) => {
            try {
                const parsed = new URL(String(raw));
                const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
                if (isLocalHost && parsed.pathname === '/proxy') {
                    const target = parsed.searchParams.get('url');
                    if (target) return target;
                }
            } catch (e) { }
            return raw;
        };
        const normalized = sanitizeHistoryUrlValue(unwrapProxyUrl(value), '', { allowLocalCache: true }) || '';
        if (!normalized) return '';
        const mapped = isLocalCacheUrl(normalized) ? (resolveLocalCacheSourceUrl(normalized) || normalized) : normalized;
        try {
            const parsed = new URL(mapped);
            const cleanPath = parsed.pathname || '';
            const cleanSearch = parsed.search || '';
            return `${parsed.origin}${cleanPath}${cleanSearch}`;
        } catch (e) {
            return mapped;
        }
    }, [sanitizeHistoryUrlValue, isLocalCacheUrl, resolveLocalCacheSourceUrl]);

    const getHistoryNavPreview = useCallback((item, options = {}) => {
        if (!item) return { url: '', index: 0 };
        const multiImages = getHistoryMultiImages(item);
        const maxIndex = multiImages ? multiImages.length - 1 : 0;
        const forceFirstImage = !!options.forceFirstImage;
        const rawIndex = forceFirstImage
            ? 0
            : (Number.isInteger(item.selectedMjImageIndex) ? item.selectedMjImageIndex : 0);
        const index = Math.max(0, Math.min(rawIndex, maxIndex));
        const selectedUrl = multiImages ? multiImages[index] : null;
        const resolvedUrl = selectedUrl
            ? resolveHistoryUrl(item, selectedUrl)
            : resolveHistoryUrl(item);
        const fallbackUrl = selectedUrl || item.url || item.originalUrl || item.mjOriginalUrl || '';
        return { url: resolvedUrl || fallbackUrl || '', index };
    }, [getHistoryMultiImages, resolveHistoryUrl]);

    const rebuildHistoryThumbnail = useCallback(async (item, options = {}) => {
        if (!item) return;
        const rawUrls = item.mjImages && item.mjImages.length > 0
            ? item.mjImages
            : [item.url || item.originalUrl || item.mjOriginalUrl].filter(Boolean);
        if (rawUrls.length === 0) {
            showToast('没有可用的图片地址', 'warning');
            return;
        }
        const baseProxy = getItemProxyPreference(item);
        const quality = performanceMode === 'ultra' ? 'ultra' : 'normal';
        rawUrls.forEach(url => {
            if (url) thumbnailCacheRef.current.delete(url);
            const resolved = resolveHistoryUrl(item, url);
            if (resolved) thumbnailCacheRef.current.delete(resolved);
        });

        if (rawUrls.length > 1) {
            const mjThumbnails = await Promise.all(rawUrls.map(async (url) => {
                const resolved = resolveHistoryUrl(item, url);
                if (!resolved) return null;
                const useProxy = getProxyPreferenceForUrl(resolved, baseProxy);
                return await generateThumbnail(resolved, quality, { useProxy });
            }));
            setHistory(prev => prev.map(h => h.id === item.id ? { ...h, mjThumbnails } : h));
        } else {
            const resolved = resolveHistoryUrl(item, rawUrls[0]);
            const useProxy = resolved ? getProxyPreferenceForUrl(resolved, baseProxy) : false;
            const thumbnail = resolved ? await generateThumbnail(resolved, quality, { useProxy }) : null;
            setHistory(prev => prev.map(h => h.id === item.id ? { ...h, thumbnailUrl: thumbnail || null } : h));
        }
        if (!options.silent) {
            showToast('缩略图已更新', 'success');
        }
    }, [generateThumbnail, performanceMode, resolveHistoryUrl, showToast, getItemProxyPreference, getProxyPreferenceForUrl]);

    const rebuildAllHistoryThumbnails = useCallback(async () => {
        const imageItems = history.filter(item =>
            item.type === 'image' && (
                (item.mjImages && item.mjImages.length > 0) ||
                item.url || item.originalUrl || item.mjOriginalUrl
            )
        );
        if (imageItems.length === 0) {
            showToast('没有可重建的图片', 'warning');
            return;
        }
        showToast(`开始重建 ${imageItems.length} 张缩略图`, 'success');
        for (const item of imageItems) {
            await rebuildHistoryThumbnail(item, { silent: true });
        }
        showToast('历史缩略图已全部重建', 'success');
    }, [history, rebuildHistoryThumbnail, showToast]);

    const pickLocalCachePath = useCallback(async (fieldKey, patchKey) => {
        const baseUrl = (localServerUrl || '').replace(/\/+$/, '');
        if (baseUrl) {
            try {
                const res = await fetch(`${baseUrl}/pick-path`);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.path) {
                        const normalized = normalizeLocalPath(data.path);
                        const ok = await updateLocalCacheServerConfig({ [patchKey]: normalized }, { silent: true });
                        if (ok) {
                            showToast('路径已更新', 'success', 2000);
                            refreshLocalCache({ silent: true });
                            return;
                        }
                        showToast('路径更新失败，请确认允许目录', 'error', 2000);
                        return;
                    }
                }
            } catch (e) {
                // 失败时回退到浏览器文件选择器
            }
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
        input.multiple = true;
        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const rawPath = file.path || '';
            if (!rawPath) {
                showToast('浏览器无法读取本地路径，请手动输入', 'warning', 3000);
                return;
            }
            const folderPath = rawPath.replace(/[\\/][^\\/]+$/, '');
            const normalized = normalizeLocalPath(folderPath);
            const ok = await updateLocalCacheServerConfig({ [patchKey]: normalized }, { silent: true });
            if (ok) {
                showToast('路径已更新', 'success', 2000);
                refreshLocalCache({ silent: true });
            } else {
                showToast('路径更新失败，请确认允许目录', 'error', 2000);
            }
        };
        input.click();
    }, [localServerUrl, normalizeLocalPath, updateLocalCacheServerConfig, showToast, refreshLocalCache]);

    // V2.6.1：性能模式缩略图生成
    useEffect(() => {
        if (performanceMode === 'off') return;

        const generateThumbnailsForHistory = async () => {
            const quality = performanceMode === 'ultra' ? 'ultra' : 'normal';
            const itemsNeedThumbnail = history.filter(item =>
                item.status === 'completed' &&
                item.type === 'image' &&
                (item.url || item.originalUrl || item.mjOriginalUrl) &&
                !item.thumbnailUrl
            );

            const batch = itemsNeedThumbnail.slice(0, 5);
            if (batch.length === 0) return;

            for (const item of batch) {
                try {
                    const sourceUrl = item.url || item.originalUrl || item.mjOriginalUrl;
                    if (!sourceUrl) continue;
                    let thumbnail = thumbnailCacheRef.current.get(sourceUrl);
                    if (!thumbnail) {
                        const useProxy = getProxyPreferenceForUrl(sourceUrl, false);
                        thumbnail = await generateThumbnail(sourceUrl, quality, { useProxy });
                        if (thumbnail) thumbnailCacheRef.current.set(sourceUrl, thumbnail);
                    }

                    let mjThumbnails = null;
                    if (item.mjImages && item.mjImages.length > 0) {
                        mjThumbnails = await Promise.all(item.mjImages.map(async (url) => {
                            if (!url) return null;
                            const cached = thumbnailCacheRef.current.get(url);
                            if (cached) return cached;
                            const useProxy = getProxyPreferenceForUrl(url, false);
                            const thumb = await generateThumbnail(url, quality, { useProxy });
                            if (thumb) thumbnailCacheRef.current.set(url, thumb);
                            return thumb;
                        }));
                    }

                    if (thumbnail || mjThumbnails) {
                        setHistory(prev => prev.map(h =>
                            h.id === item.id
                                ? { ...h, thumbnailUrl: thumbnail || h.thumbnailUrl, mjThumbnails: mjThumbnails || h.mjThumbnails }
                                : h
                        ));
                    }
                } catch (e) {
                    console.warn('[缩略图] 生成失败:', e);
                }
            }
        };

        const timer = setTimeout(generateThumbnailsForHistory, 100);
        return () => clearTimeout(timer);
    }, [performanceMode, history, generateThumbnail]);

    // V2.6.1：角色库本地缓存
    useEffect(() => {
        if (!localCacheActive) return;

        const cacheCharacterImages = async () => {
            for (const char of characterLibrary) {
                if (char.localCacheUrl) continue;
                if (!char.profile_picture_url || char.profile_picture_url.startsWith('blob:')) continue;
                try {
                    const result = await saveImageToLocalCache(char.id, char.profile_picture_url, 'characters');
                    if (result) {
                        setCharacterLibrary(prev => prev.map(c =>
                            c.id === char.id ? { ...c, localCacheUrl: result.url, localFilePath: result.path } : c
                        ));
                    }
                } catch (e) {
                    console.warn('[角色库缓存] 缓存失败:', char.username, e);
                }
            }
        };

        const timer = setTimeout(cacheCharacterImages, 2000);
        return () => clearTimeout(timer);
    }, [characterLibrary, localCacheActive, saveImageToLocalCache]);

    // V2.6.1：历史记录本地缓存（图片）
    useEffect(() => {
        if (!localCacheActive) return;

        const cacheHistoryImages = async () => {
            if (cacheImageRunRef.current) return;
            cacheImageRunRef.current = true;
            const summary = {
                total: history.length,
                processed: 0,
                skippedStatus: 0,
                skippedVideo: 0,
                skippedEmpty: 0,
                saved: 0,
                failed: 0,
                proxy: 0,
                direct: 0
            };
            try {
                const preferHistoryPath = !!(localServerConfig.imageSavePath || localServerConfig.videoSavePath);
                const expectedSegment = preferHistoryPath ? '/file/history/' : '/file/.tapnow_cache/history/';
                const localBase = (localServerUrl || '').trim().replace(/\/+$/, '');
                if (!localCacheIndexReadyRef.current) {
                    await refreshLocalCacheFileIndex({ silent: true });
                }

                for (const item of history) {
                const status = item?.status;
                const isCacheableStatus = isCompletedLikeStatus(status);
                if (!isCacheableStatus) { summary.skippedStatus++; continue; }
                const candidateUrl = item?.url || item?.originalUrl || item?.mjOriginalUrl || '';
                const isVideoItem = item?.type === 'video' || isVideoUrl(candidateUrl);
                if (isVideoItem) { summary.skippedVideo++; continue; }
                const baseProxy = getItemProxyPreference(item);
                let localCacheUrl = item.localCacheUrl || null;
                let localFilePath = item.localFilePath || null;
                let cacheMap = item.localCacheMap ? { ...item.localCacheMap } : {};
                let cacheMapUpdated = false;

                const firstCacheUrl = localCacheUrl || (Object.keys(cacheMap).length > 0 ? Object.values(cacheMap)[0] : null);
                if (firstCacheUrl) {
                    if (localCacheIndexReadyRef.current && !isLocalCacheUrlAvailable(firstCacheUrl)) {
                        if (cacheMap && Object.keys(cacheMap).length > 0) {
                            Object.entries(cacheMap).forEach(([sourceUrl, cacheUrl]) => {
                                if (cachedHistoryUrlRef.current.get(sourceUrl) === cacheUrl) {
                                    cachedHistoryUrlRef.current.delete(sourceUrl);
                                }
                            });
                        }
                        localCacheUrl = null;
                        localFilePath = null;
                        cacheMap = {};
                        cacheMapUpdated = true;
                        triedCacheIdsRef.current.delete(item.id);
                    }
                }

                const rawImageUrls = item.mjImages && item.mjImages.length > 0
                    ? item.mjImages
                    : (item.output_images && item.output_images.length > 0
                        ? item.output_images
                        : [item.url || item.originalUrl || item.mjOriginalUrl].filter(Boolean));
                const imageUrls = [...new Set(rawImageUrls.filter(Boolean))];

                if (imageUrls.length === 0) { summary.skippedEmpty++; continue; }
                const isMultiImage = imageUrls.length > 1;
                if (isMultiImage) {
                    const mappedCacheValues = imageUrls.map((url) => cacheMap[url]).filter(Boolean);
                    const uniqueMappedCacheValues = new Set(mappedCacheValues);
                    // 修复：多图缓存若全部映射到同一文件，会导致预览/拖拽错图（如 4 号位始终打开 0 号位）
                    if (mappedCacheValues.length >= imageUrls.length && uniqueMappedCacheValues.size <= 1) {
                        cacheMap = {};
                        cacheMapUpdated = true;
                        localCacheUrl = null;
                        localFilePath = null;
                        triedCacheIdsRef.current.delete(item.id);
                    }
                }

                const cachedCount = imageUrls.reduce((count, url) => (cacheMap[url] ? count + 1 : count), 0);

                if (triedCacheIdsRef.current.has(item.id) && cachedCount >= imageUrls.length) continue;
                triedCacheIdsRef.current.add(item.id);
                summary.processed++;

                if (!cacheRedownloadOnEnable && localCacheUrl) {
                    if (imageUrls.length <= 1) {
                        let updated = false;
                        imageUrls.forEach((url) => {
                            if (!url) return;
                            if (!cacheMap[url]) {
                                cacheMap[url] = localCacheUrl;
                                updated = true;
                            }
                        });
                        if (updated || localCacheUrl !== item.localCacheUrl) {
                            const nextCacheMap = Object.keys(cacheMap).length > 0 ? cacheMap : null;
                            setHistory(prev => prev.map(h =>
                                h.id === item.id ? { ...h, localCacheUrl: localCacheUrl || null, localFilePath: localFilePath || null, localCacheMap: nextCacheMap } : h
                            ));
                        }
                        continue;
                    }
                    const mappedCount = imageUrls.reduce((count, url) => (cacheMap[url] ? count + 1 : count), 0);
                    if (mappedCount >= imageUrls.length) {
                        continue;
                    }
                }

                for (let idx = 0; idx < imageUrls.length; idx++) {
                    const imageUrl = imageUrls[idx];
                    if (!imageUrl || imageUrl.startsWith('blob:') || imageUrl.includes('...')) continue;

                    const cacheSeed = imageUrls.length > 1 ? `${item.id}-${idx}` : `${item.id}`;
                    const cacheId = getCacheIdFromUrl(imageUrl, cacheSeed);
                    const expectedId = sanitizeCacheId(cacheId) || cacheId;

                    if (cacheMap[imageUrl] && expectedId && !String(cacheMap[imageUrl]).includes(expectedId)) {
                        delete cacheMap[imageUrl];
                        cacheMapUpdated = true;
                    }

                    if (!cacheRedownloadOnEnable) {
                        // 如果全局缓存映射已存在，直接绑定并跳过远程拉取
                        const globalCached = historyLocalCacheMap && historyLocalCacheMap.get(imageUrl);
                        if (globalCached && isHistoryCacheMappingValid(item, imageUrl, globalCached)) {
                            if (!cacheMap[imageUrl]) {
                                cacheMap[imageUrl] = globalCached;
                                cacheMapUpdated = true;
                            }
                            if (!localCacheUrl) {
                                localCacheUrl = globalCached;
                            }
                            continue;
                        }

                        // 尝试在当前本地缓存目录中按 cacheId 直接命中已有文件，避免重新拉取远端
                        if (localBase && expectedId) {
                            const matchedLocal = getLocalCacheCandidateUrl(expectedId, ['.jpg', '.png', '.webp'], preferHistoryPath);
                            if (matchedLocal) {
                                if (!cacheMap[imageUrl]) {
                                    cacheMap[imageUrl] = matchedLocal;
                                    cacheMapUpdated = true;
                                }
                                if (!localCacheUrl) {
                                    localCacheUrl = matchedLocal;
                                }
                                continue;
                            }
                        }

                        if (cachedHistoryUrlRef.current.has(imageUrl)) {
                            const cachedUrl = cachedHistoryUrlRef.current.get(imageUrl);
                            if (cachedUrl && (expectedId && !String(cachedUrl).includes(expectedId))) {
                                cachedHistoryUrlRef.current.delete(imageUrl);
                            } else {
                                if (cachedUrl && !cacheMap[imageUrl]) {
                                    cacheMap[imageUrl] = cachedUrl;
                                    cacheMapUpdated = true;
                                }
                                if (!localCacheUrl && cachedUrl) {
                                    localCacheUrl = cachedUrl;
                                }
                                continue;
                            }
                        }
                    }

                    try {
                        const useProxy = getProxyPreferenceForUrl(imageUrl, baseProxy);
                        if (useProxy) summary.proxy++; else summary.direct++;
                        const result = await saveImageToLocalCache(cacheId, imageUrl, 'history', { forceId: true, useProxy });
                        if (result) {
                            cachedHistoryUrlRef.current.set(imageUrl, result.url);
                            cacheMap[imageUrl] = result.url;
                            cacheMapUpdated = true;
                            if (!localCacheUrl) {
                                localCacheUrl = result.url;
                                localFilePath = result.path;
                            }
                            summary.saved++;
                        } else {
                            summary.failed++;
                        }
                    } catch (e) {
                        console.warn('[历史缓存] 缓存失败:', item.id, e);
                        summary.failed++;
                    }
                }

                const primaryUrl = imageUrls[0];
                if (primaryUrl) {
                    const primaryCacheUrl = cacheMap[primaryUrl] || null;
                    if (primaryCacheUrl) {
                        localCacheUrl = primaryCacheUrl;
                    } else {
                        localCacheUrl = null;
                        localFilePath = null;
                    }
                }

                    if (cacheMapUpdated || localCacheUrl !== item.localCacheUrl) {
                        const nextCacheMap = Object.keys(cacheMap).length > 0 ? cacheMap : null;
                        setHistory(prev => prev.map(h =>
                            h.id === item.id ? { ...h, localCacheUrl: localCacheUrl || null, localFilePath: localFilePath || null, localCacheMap: nextCacheMap } : h
                        ));
                    }
                }
            } finally {
                cacheImageRunRef.current = false;
            }
        };

        cacheHistoryImages();
        const timer = setTimeout(cacheHistoryImages, 3000);
        return () => clearTimeout(timer);
    }, [history, localCacheActive, localServerConfig.imageSavePath, localServerConfig.videoSavePath, localServerUrl, saveImageToLocalCache, sanitizeCacheId, getCacheIdFromUrl, getItemProxyPreference, getProxyPreferenceForUrl, cacheRefreshTick, historyLocalCacheMap, cacheRedownloadOnEnable, refreshLocalCacheFileIndex, getLocalCacheCandidateUrl, isLocalCacheUrlAvailable, isHistoryCacheMappingValid]);

    // V2.6.1：历史记录本地缓存（视频）
    useEffect(() => {
        if (!localCacheActive) return;

        const cacheHistoryVideos = async () => {
            if (cacheVideoRunRef.current) return;
            cacheVideoRunRef.current = true;
            const summary = {
                total: history.length,
                processed: 0,
                skippedStatus: 0,
                skippedNonVideo: 0,
                skippedEmpty: 0,
                saved: 0,
                failed: 0,
                proxy: 0,
                direct: 0
            };
            try {
                const localBase = (localServerUrl || '').trim().replace(/\/+$/, '');
                const savePathRaw = localServerConfig.videoSavePath || localServerConfig.savePath || '';
                const preferHistoryPath = !!(savePathRaw && !String(savePathRaw).includes('.tapnow_cache'));
                const expectedSegment = preferHistoryPath ? '/file/history/' : '/file/.tapnow_cache/history/';
                if (!localCacheIndexReadyRef.current) {
                    await refreshLocalCacheFileIndex({ silent: true });
                }
                for (const item of history) {
                const status = item?.status;
                const isCacheableStatus = isCompletedLikeStatus(status);
                if (!isCacheableStatus) { summary.skippedStatus++; continue; }
                const videoUrl = item?.url || item?.originalUrl || '';
                const isVideoItem = item?.type === 'video' || isVideoUrl(videoUrl);
                if (!isVideoItem) { summary.skippedNonVideo++; continue; }
                const baseProxy = getItemProxyPreference(item);
                let localCacheUrl = item.localCacheUrl || null;
                if (localCacheUrl && !cacheRedownloadOnEnable) {
                    if (localCacheIndexReadyRef.current && !isLocalCacheUrlAvailable(localCacheUrl)) {
                        localCacheUrl = null;
                        setHistory(prev => prev.map(h =>
                            h.id === item.id ? { ...h, localCacheUrl: null, localFilePath: null } : h
                        ));
                    }
                    if (localCacheUrl) continue;
                }
                if (triedCacheIdsRef.current.has(item.id)) continue;
                triedCacheIdsRef.current.add(item.id);
                    if (videoUrl && (videoUrl.includes('localhost:') || videoUrl.includes('127.0.0.1:'))) continue;

                    if (!videoUrl || videoUrl.startsWith('blob:') || videoUrl.includes('...')) { summary.skippedEmpty++; continue; }
                    summary.processed++;

                    if (!cacheRedownloadOnEnable) {
                        const globalCached = historyLocalCacheMap && historyLocalCacheMap.get(videoUrl);
                        if (globalCached) {
                            setHistory(prev => prev.map(h =>
                                h.id === item.id ? { ...h, localCacheUrl: globalCached } : h
                            ));
                            continue;
                        }

                        if (localBase) {
                            const cacheId = getCacheIdFromUrl(videoUrl, item.id);
                            const expectedId = sanitizeCacheId(cacheId) || cacheId;
                            if (expectedId) {
                                const matchedLocal = getLocalCacheCandidateUrl(expectedId, ['.mp4', '.webm', '.mov'], preferHistoryPath);
                                if (matchedLocal) {
                                    setHistory(prev => prev.map(h =>
                                        h.id === item.id ? { ...h, localCacheUrl: matchedLocal } : h
                                    ));
                                    continue;
                                }
                            }
                        }
                    }

                    try {
                        const useProxy = getProxyPreferenceForUrl(videoUrl, baseProxy);
                        if (useProxy) summary.proxy++; else summary.direct++;
                        const result = await saveVideoToLocalCache(item.id, videoUrl, 'history', { useProxy });
                        if (result) {
                            setHistory(prev => prev.map(h =>
                                h.id === item.id ? { ...h, localCacheUrl: result.url, localFilePath: result.path } : h
                            ));
                            summary.saved++;
                        } else {
                            summary.failed++;
                        }
                    } catch (e) {
                        console.warn('[历史缓存] 视频缓存失败:', item.id, e);
                        summary.failed++;
                    }
                }
            } finally {
                cacheVideoRunRef.current = false;
            }
        };

        cacheHistoryVideos();
        const timer = setTimeout(cacheHistoryVideos, 5000);
        return () => clearTimeout(timer);
    }, [history, localCacheActive, localServerConfig.videoSavePath, localServerConfig.savePath, localServerUrl, saveVideoToLocalCache, getItemProxyPreference, getProxyPreferenceForUrl, cacheRefreshTick, historyLocalCacheMap, cacheRedownloadOnEnable, sanitizeCacheId, getCacheIdFromUrl, refreshLocalCacheFileIndex, getLocalCacheCandidateUrl, isLocalCacheUrlAvailable]);

    const canvasRef = useRef(null);
    const viewportBounds = useCanvasViewportBounds(canvasRef, view);
    const isZooming = useCanvasWheelZoom(canvasRef, viewRef, setView);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const chatEndRef = useRef(null);
    const chatInputRef = useRef(null);
    const connectionLayerRef = useRef(null);
    const nodesRef = useRef(nodes);
    const selectedNodeIdRef = useRef(selectedNodeId);
    const selectedNodeIdsRef = useRef(selectedNodeIds); // 存储多选节点ID的ref
    const connectionsRef = useRef(connections);
    const frameSelectionRef = useRef({});
    const copiedNodesRef = useRef(null); // 存储复制的节点数据
    const isPanningRef = useRef(false); // 使用ref跟踪画布拖动状态，避免状态丢失
    const panRafRef = useRef(null); // 画布拖动的 requestAnimationFrame
    const pendingPanUpdate = useRef(null); // 待处理的画布拖动更新
    const nodeDragSessionRef = useRef(null);
    const nodeDragRafRef = useRef(null);
    const pendingNodeDragProjectionRef = useRef(null);
    const multiNodeDragStartPos = useRef(null); // 多节点拖动起始位置，用于防止累积误差
    const singleNodeDragStartPos = useRef(null); // 单节点拖动起始位置，避免 RAF 合并时丢失 movement 增量
    const lastZoomRef = useRef(null); // 跟踪上次的 zoom 值，用于检测缩放切换

    useEffect(() => {
        // 保存配置到 localStorage（不再过滤任何模型）
        localStorage.setItem('tapnow_api_configs', JSON.stringify(apiConfigs));
    }, [apiConfigs]);

    // --- 将辅助函数移到此处以修复 ReferenceError ---
    const deleteNode = useCallback((id) => {
        saveToUndoStack(); // V3.4.6: 保存到撤销栈
        setNodes((prev) => prev.filter((n) => n.id !== id));
        setConnections((prev) => prev.filter((c) => c.from !== id && c.to !== id));
        if (selectedNodeId === id) setSelectedNodeId(null);
    }, [selectedNodeId, saveToUndoStack]);

    const updateNodeSettings = useCallback((id, newSettings) => {
        setNodes((prev) => prev.map((n) => n.id === id ? { ...n, settings: { ...n.settings, ...newSettings } } : n));
    }, []);

    const handleVideoFileUpload = (nodeId, file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const content = ev.target.result;
            let videoMeta = { duration: 0, w: 0, h: 0 };
            try { videoMeta = await getVideoMetadata(content); } catch (e) { console.warn('读取视频元信息失败', e); }
            setNodes((prev) => prev.map((n) =>
                n.id === nodeId
                    ? { ...n, content, videoMeta, frames: [], selectedKeyframes: [], extractingFrames: false, videoFileName: file.name }
                    : n
            ));
        };
        reader.readAsDataURL(file);
    };
    // ---------------------

    // 全局 Delete 键删除节点
    useEffect(() => {
        const handleDeleteKey = (e) => {
            if (canvasDialogStore.getSnapshot()) return;
            // 防止在输入框中触发
            if (isCanvasInteractiveTarget(e.target)) return;

            // 检查是否按下了 Delete 或 Del 键
            if (e.key === 'Delete' || e.key === 'Del') {
                e.preventDefault();
                e.stopPropagation();

                const currentSelectedId = selectedNodeIdRef.current;
                const currentSelectedIds = selectedNodeIdsRef.current;

                // 删除选中的节点
                if (currentSelectedId) {
                    deleteNode(currentSelectedId);
                    setSelectedNodeId(null);
                } else if (currentSelectedIds && currentSelectedIds.size > 0) {
                    // V3.4.7: 批量删除 - 只保存一次撤销状态 (使用 ref 确保获取最新状态)
                    if (saveToUndoStackRef.current) {
                        saveToUndoStackRef.current();
                    }
                    const idsToDelete = new Set(currentSelectedIds);
                    setNodes(prev => prev.filter(n => !idsToDelete.has(n.id)));
                    setConnections(prev => prev.filter(c => !idsToDelete.has(c.from) && !idsToDelete.has(c.to)));
                    setSelectedNodeIds(new Set());
                }
            }
        };

        window.addEventListener('keydown', handleDeleteKey);
        return () => {
            window.removeEventListener('keydown', handleDeleteKey);
        };
    }, []);
    // 保存角色库到 localStorage（使用防抖优化）
    const debouncedSaveCharacters = useMemo(() => debounce((charactersToSave) => {
        try {
            localStorage.setItem('tapnow_characters', JSON.stringify(charactersToSave));
        } catch (e) {
            console.error('保存角色库失败:', e);
        }
    }, 500), []);

    useEffect(() => {
        debouncedSaveCharacters(characterLibrary);
    }, [characterLibrary, debouncedSaveCharacters]);

    const historyDisplayItems = useMemo(() => {
        const sessionItems = history.filter(item => (item.startTime || 0) >= sessionStartTime);
        const previousItems = history.filter(item => (item.startTime || 0) < sessionStartTime);
        return [...sessionItems, ...previousItems];
    }, [history, sessionStartTime]);
    const isHistoryItemNavigable = useCallback((item) => {
        if (!item) return false;
        const status = item?.status;
        if (!isCompletedLikeStatus(status)) return false;
        const preview = getHistoryNavPreview(item);
        return !!preview?.url;
    }, [getHistoryNavPreview]);
    const historyNavItems = useMemo(
        () => historyDisplayItems.filter(isHistoryItemNavigable),
        [historyDisplayItems, isHistoryItemNavigable]
    );
    const getHistoryNavAnchorIndex = useCallback((currentItem, items) => {
        if (!items || items.length === 0) return -1;
        const currentId = currentItem?.id;
        if (currentId) {
            const idxById = items.findIndex(item => item?.id === currentId);
            if (idxById >= 0) return idxById;
        }
        const currentUrlCandidates = new Set();
        const addCurrentUrlCandidate = (url) => {
            const normalized = normalizeHistoryNavComparableUrl(url);
            if (normalized) currentUrlCandidates.add(normalized);
        };
        addCurrentUrlCandidate(currentItem?.url);
        addCurrentUrlCandidate(currentItem?.originalUrl);
        addCurrentUrlCandidate(currentItem?.mjOriginalUrl);
        if (Array.isArray(currentItem?.mjImages)) {
            currentItem.mjImages.forEach((url) => addCurrentUrlCandidate(url));
        }
        if (Array.isArray(currentItem?.output_images)) {
            currentItem.output_images.forEach((url) => addCurrentUrlCandidate(url));
        }
        if (currentUrlCandidates.size > 0) {
            for (let idx = 0; idx < items.length; idx++) {
                const item = items[idx];
                if (!item) continue;
                const preview = getHistoryNavPreview(item);
                const previewUrl = normalizeHistoryNavComparableUrl(preview?.url);
                if (previewUrl && currentUrlCandidates.has(previewUrl)) return idx;
                const fallbackUrl = normalizeHistoryNavComparableUrl(resolveHistoryUrl(item));
                if (fallbackUrl && currentUrlCandidates.has(fallbackUrl)) return idx;
                const multiImages = getHistoryMultiImages(item) || [];
                for (const rawUrl of multiImages) {
                    const resolved = normalizeHistoryNavComparableUrl(resolveHistoryUrl(item, rawUrl));
                    if (resolved && currentUrlCandidates.has(resolved)) return idx;
                }
            }
        }
        const currentTimeRaw = currentItem?.startTime || currentItem?.created || currentItem?.timestamp;
        const currentTime = Number.isFinite(currentTimeRaw) ? currentTimeRaw : Number.parseFloat(currentTimeRaw);
        if (Number.isFinite(currentTime)) {
            let bestIdx = -1;
            let bestDiff = Infinity;
            items.forEach((item, idx) => {
                const itemTimeRaw = item?.startTime || item?.created || item?.timestamp;
                const itemTime = Number.isFinite(itemTimeRaw) ? itemTimeRaw : Number.parseFloat(itemTimeRaw);
                if (!Number.isFinite(itemTime)) return;
                const diff = Math.abs(itemTime - currentTime);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestIdx = idx;
                }
            });
            if (bestIdx >= 0) return bestIdx;
        }
        if (historyFocusId) {
            const idxByFocus = items.findIndex(item => item?.id === historyFocusId);
            if (idxByFocus >= 0) return idxByFocus;
        }
        return 0;
    }, [historyFocusId, getHistoryNavPreview, normalizeHistoryNavComparableUrl, resolveHistoryUrl, getHistoryMultiImages]);
    const getHistoryNavIndexById = useCallback((id) => {
        if (!id) return -1;
        return historyNavItems.findIndex(item => item?.id === id);
    }, [historyNavItems]);
    const findHistoryNavIndex = useCallback((items, currentIndex, direction) => {
        if (!Array.isArray(items) || items.length === 0) return -1;
        const step = direction < 0 ? -1 : 1;
        let idx = currentIndex;
        while (true) {
            idx += step;
            if (idx < 0 || idx >= items.length) return -1;
            const candidate = items[idx];
            if (isHistoryItemNavigable(candidate)) return idx;
        }
    }, [isHistoryItemNavigable]);

    useEffect(() => {
        const current = lightboxItemRef.current;
        if (!current || current.storyboardContext) {
            lightboxHistorySnapshotRef.current = null;
            lightboxHistoryIndexRef.current = -1;
            return;
        }
        if (!lightboxHistorySnapshotRef.current) {
            const validIds = historyNavItems
                .filter(item => !!getHistoryNavPreview(item).url)
                .map(item => item.id);
            if (current.id && !validIds.includes(current.id)) {
                validIds.unshift(current.id);
            }
            lightboxHistorySnapshotRef.current = validIds;
        }
        if (lightboxHistorySnapshotRef.current) {
            lightboxHistoryIndexRef.current = lightboxHistorySnapshotRef.current.indexOf(current.id);
        }
    }, [lightboxItem?.id, lightboxItem?.storyboardContext, historyNavItems, getHistoryNavPreview]);

    // 当视频 URL 改变时清除错误提示
    useEffect(() => {
        setCreateCharacterVideoError(null);
    }, [createCharacterVideoUrl, createCharacterSelectedTaskId, createCharacterVideoSourceType]);

    // V3.7.28: 历史面板键盘导航 (上下箭头跳转、ESC关闭)
    useEffect(() => {
        if (!historyOpen) {
            setHistoryFocusIndex(-1);
            setHistoryFocusId(null);
            return;
        }

        const handleHistoryKeyDown = (e) => {
            if (canvasDialogStore.getSnapshot()) return;
            // 不在输入框中触发
            if (isCanvasInteractiveTarget(e.target)) return;
            // 如果 Lightbox 打开则不处理
            if (lightboxItem) return;
            if (historyNavItems.length === 0) return;
            let currentIndex = historyFocusId
                ? getHistoryNavIndexById(historyFocusId)
                : -1;
            if (currentIndex < 0) currentIndex = 0;
            if (currentIndex < 0) return;

            if (e.key === 'ArrowUp' || e.key === 'Up') {
                e.preventDefault();
                e.stopPropagation();
                const newIdx = Math.max(0, currentIndex - 1);
                if (newIdx === currentIndex) return;
                const targetItem = historyNavItems[newIdx];
                const preview = getHistoryNavPreview(targetItem);
                if (preview?.url) {
                    setLightboxItem({
                        ...targetItem,
                        url: preview.url,
                        selectedMjImageIndex: preview.index,
                        storyboardContext: null
                    });
                }
                setHistoryFocusId(targetItem?.id || null);
                setHistoryFocusIndex(newIdx);
            } else if (e.key === 'ArrowDown' || e.key === 'Down') {
                e.preventDefault();
                e.stopPropagation();
                const newIdx = Math.min(historyNavItems.length - 1, currentIndex + 1);
                if (newIdx === currentIndex) return;
                const targetItem = historyNavItems[newIdx];
                const preview = getHistoryNavPreview(targetItem);
                if (preview?.url) {
                    setLightboxItem({
                        ...targetItem,
                        url: preview.url,
                        selectedMjImageIndex: preview.index,
                        storyboardContext: null
                    });
                }
                setHistoryFocusId(targetItem?.id || null);
                setHistoryFocusIndex(newIdx);
            } else if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                e.stopPropagation();
                setHistoryOpen(false);
            }
        };

        window.addEventListener('keydown', handleHistoryKeyDown);
        return () => window.removeEventListener('keydown', handleHistoryKeyDown);
    }, [historyOpen, historyNavItems, lightboxItem, getHistoryNavPreview, historyFocusId, historyFocusIndex, getHistoryNavIndexById]);

    useEffect(() => {
        if (!historyOpen) return;
        if (historyNavItems.length === 0) {
            setHistoryFocusIndex(-1);
            setHistoryFocusId(null);
            return;
        }
        const idx = historyFocusId ? getHistoryNavIndexById(historyFocusId) : -1;
        if (idx >= 0) {
            if (idx !== historyFocusIndex) setHistoryFocusIndex(idx);
            return;
        }
        setHistoryFocusIndex(0);
        setHistoryFocusId(historyNavItems[0]?.id || null);
    }, [historyOpen, historyNavItems, historyFocusId, historyFocusIndex, getHistoryNavIndexById]);

    const historyLimit = normalizeHistorySaveLimit(historySaveLimit);
    const historyLimitWarningRef = useRef({ initialized: false, lastCount: 0, lastLimit: historyLimit, toastId: null });

    useEffect(() => {
        const limit = historyLimit;
        const count = history.length;
        const ref = historyLimitWarningRef.current;
        if (!ref.initialized) {
            ref.initialized = true;
            ref.lastCount = count;
            ref.lastLimit = limit;
            return;
        }
        if (!limit || limit <= 0) {
            ref.lastCount = count;
            ref.lastLimit = limit;
            return;
        }
        const threshold = Math.max(1, Math.ceil(limit * 0.9));
        const crossed = ref.lastCount < threshold && count >= threshold;
        const limitChanged = ref.lastLimit !== limit;
        if ((crossed || limitChanged) && count >= threshold) {
            if (!ref.toastId) {
                ref.toastId = showToast(`${t('历史数量已接近上限')} (${count}/${limit})，${t('建议保存资产包或清理历史')}`, 'warning', 300000);
            }
        }
        if (count < threshold && ref.toastId) {
            dismissToast(ref.toastId);
            ref.toastId = null;
        }
        ref.lastCount = count;
        ref.lastLimit = limit;
    }, [history.length, historyLimit, showToast, dismissToast, t]);

    const trimHistoryUrlForStorage = (url) => {
        if (!url) return url;
        if (url.startsWith('data:') && url.length > 5000) return '';
        return url;
    };
    const compactCacheMapForStorage = (cacheMap, limit = 8) => {
        if (!cacheMap || typeof cacheMap !== 'object') return null;
        const entries = Object.entries(cacheMap).filter(([k, v]) => k && v);
        if (entries.length === 0) return null;
        const next = {};
        entries.slice(0, limit).forEach(([k, v]) => {
            next[k] = v;
        });
        return next;
    };

    const compactHistoryItemForStorage = (item) => {
        const saved = { ...item };
        const fallback = resolveSourceReferenceUrl(getHistoryFallbackUrl(saved, { allowLocalCache: false }));
        const toStorageUrl = (url, customFallback = fallback) => {
            const sourceRef = resolveSourceReferenceUrl(url);
            return trimHistoryUrlForStorage(
                sanitizeHistoryUrlValue(sourceRef, customFallback, { allowLocalCache: false })
            );
        };
        if (saved.url) saved.url = toStorageUrl(saved.url);
        if (saved.originalUrl) saved.originalUrl = toStorageUrl(saved.originalUrl);
        if (saved.mjOriginalUrl) saved.mjOriginalUrl = toStorageUrl(saved.mjOriginalUrl);
        if (Array.isArray(saved.output_images)) {
            saved.output_images = saved.output_images
                .slice(0, 12)
                .map((url) => toStorageUrl(url))
                .filter(Boolean);
        }
        if (Array.isArray(saved.mjImages)) {
            const sanitized = saved.mjImages
                .map((url) => sanitizeHistoryUrlValue(resolveSourceReferenceUrl(url), fallback, { allowLocalCache: false }))
                .filter(Boolean);
            if (sanitized.length === 0 && saved.mjOriginalUrl) {
                saved.mjImages = null;
                saved.mjNeedsSplit = true;
            } else {
                saved.mjImages = sanitized.slice(0, 12).map(trimHistoryUrlForStorage);
            }
        }
        if (Array.isArray(saved.mjImages) && saved.mjImages.length > 1) {
            const needsOutputImages = !Array.isArray(saved.output_images) || saved.output_images.length < saved.mjImages.length;
            if (needsOutputImages) {
                saved.output_images = saved.mjImages.slice(0, 12);
            }
        }
        if (Array.isArray(saved.mjThumbnails)) {
            saved.mjThumbnails = saved.mjThumbnails
                .map((url) => sanitizeHistoryUrlValue(resolveSourceReferenceUrl(url), fallback, { allowLocalCache: false }))
                .filter(Boolean)
                .map(trimHistoryUrlForStorage);
        }
        if (saved.thumbnailUrl) {
            saved.thumbnailUrl = toStorageUrl(saved.thumbnailUrl);
        }
        delete saved.mjImageInfo;
        if (saved.localCacheMap && typeof saved.localCacheMap === 'object') {
            const nextCacheMap = {};
            Object.entries(saved.localCacheMap).forEach(([sourceUrl, cacheUrl]) => {
                const normalizedSource = toStorageUrl(sourceUrl, '');
                if (!normalizedSource || !cacheUrl) return;
                nextCacheMap[normalizedSource] = cacheUrl;
            });
            saved.localCacheMap = nextCacheMap;
        }
        saved.localCacheMap = compactCacheMapForStorage(saved.localCacheMap);
        saved.localCacheUrl = saved.localCacheUrl || null;
        saved.localFilePath = saved.localFilePath || null;
        delete saved.apiConfig;
        return saved;
    };

    // localStorage 写入防抖函数
    const debouncedSaveHistory = useMemo(() => debounce((historyToSave) => {
        try {
            localStorage.setItem('tapnow_history', JSON.stringify(historyToSave));
        } catch (e) {
            console.error('保存历史记录失败（可能超出存储配额）:', e);
            // 如果存储失败，尝试减少数据量
            try {
                const reduced = historyToSave.map(item => ({
                    id: item.id,
                    type: item.type,
                    url: trimHistoryUrlForStorage(resolveSourceReferenceUrl(item.url)),
                    prompt: item.prompt?.substring(0, 200) || '',
                    time: item.time,
                    status: item.status,
                    modelName: item.modelName,
                    width: item.width,
                    height: item.height,
                    ratio: item.ratio,
                    mjImages: Array.isArray(item.mjImages) ? item.mjImages.slice(0, 8).map((url) => trimHistoryUrlForStorage(resolveSourceReferenceUrl(url))) : item.mjImages,
                    selectedMjImageIndex: item.selectedMjImageIndex,
                    mjRatio: item.mjRatio,
                    mjNeedsSplit: item.mjNeedsSplit
                }));
                localStorage.setItem('tapnow_history', JSON.stringify(reduced));
            } catch (e2) {
                console.error('减少数据后保存也失败:', e2);
                try {
                    // 最小化保存：只保留必要字段
                    const minimal = historyToSave.map(item => ({
                        id: item.id,
                        type: item.type,
                        url: trimHistoryUrlForStorage(resolveSourceReferenceUrl(item.url)),
                        prompt: item.prompt?.substring(0, 100) || '',
                        time: item.time,
                        status: item.status,
                        modelName: item.modelName
                    }));
                    debouncedSaveHistory(minimal);
                } catch (e3) {
                    console.error('最小化保存也失败:', e3);
                }
            }
        }
    }, 1000), []);

    const persistHistorySnapshot = (historyItems = []) => {
        try {
            const historyToSave = historyItems
                .slice(0, historyLimit)
                .map((item) => compactHistoryItemForStorage(item));
            localStorage.setItem('tapnow_history', JSON.stringify(historyToSave));
            return true;
        } catch (e) {
            console.error('立即保存历史记录失败:', e);
            try {
                const reduced = historyItems.map(item => ({
                    id: item.id,
                    type: item.type,
                    url: trimHistoryUrlForStorage(resolveSourceReferenceUrl(item.url)),
                    prompt: item.prompt?.substring(0, 200) || '',
                    time: item.time,
                    status: item.status,
                    modelName: item.modelName,
                    width: item.width,
                    height: item.height,
                    ratio: item.ratio,
                    output_images: Array.isArray(item.output_images) ? item.output_images.slice(0, 8).map((url) => trimHistoryUrlForStorage(resolveSourceReferenceUrl(url))) : item.output_images,
                    mjImages: Array.isArray(item.mjImages) ? item.mjImages.slice(0, 8).map((url) => trimHistoryUrlForStorage(resolveSourceReferenceUrl(url))) : item.mjImages,
                    selectedMjImageIndex: item.selectedMjImageIndex,
                    mjRatio: item.mjRatio,
                    mjNeedsSplit: item.mjNeedsSplit
                }));
                localStorage.setItem('tapnow_history', JSON.stringify(reduced));
                return true;
            } catch (e2) {
                console.error('立即保存历史记录失败（降级后）:', e2);
                return false;
            }
        }
    };

    const debouncedSaveGlobalKey = useMemo(() => debounce((key) => {
        localStorage.setItem('tapnow_global_key', key);
    }, 1000), []);

    useEffect(() => { debouncedSaveGlobalKey(globalApiKey); }, [globalApiKey, debouncedSaveGlobalKey]);

    // 优化localStorage存储，处理配额超限问题
    useEffect(() => {
        try {
            // 只存储必要的元数据，不存储完整的base64图片和长URL
            const historyToSave = history
                .slice(0, historyLimit)
                .map((item) => {
                    const saved = compactHistoryItemForStorage(item);
                    // V3.4.10: 只对 Midjourney 切割图片清空 mjImages，保留 Jimeng 等其他模型的多图
                    // 判断条件：mjImages 有 4 张图 且 模型为 Midjourney（mj）
                    const isMjModel = item.apiConfig?.modelId?.includes('mj') || item.modelName?.toLowerCase()?.includes('midjourney');
                    if (item.mjImages && item.mjImages.length === 4 && isMjModel) {
                        // Midjourney: 保存切割标记和原图URL，切割后的图片在需要时重新生成
                        saved.mjImages = null; // 不保存 MJ base64 数组
                        saved.mjNeedsSplit = true; // 标记需要重新切割
                        saved.mjOriginalUrl = trimHistoryUrlForStorage(item.mjOriginalUrl || item.url); // 保存原图URL
                    }
                    return saved;
                });
            debouncedSaveHistory(historyToSave);
        } catch (e) {
            console.error('保存历史记录失败（可能超出存储配额）:', e);
            // 如果存储失败，尝试清理旧数据，只保留最近20条
            try {
                const reduced = history.slice(0, 20).map(item => compactHistoryItemForStorage(item));
                debouncedSaveHistory(reduced);
            } catch (e2) {
                console.error('清理后仍无法保存:', e2);
                // 最后尝试：只保存最基本的字段
                try {
                    const minimal = history.slice(0, 10).map(item => ({
                        id: item.id,
                        type: item.type,
                        prompt: item.prompt?.substring(0, 100),
                        time: item.time,
                        status: item.status,
                        modelName: item.modelName
                    }));
                    debouncedSaveHistory(minimal);
                } catch (e3) {
                    console.error('最小化保存也失败:', e3);
                }
            }
        }
    }, [history, debouncedSaveHistory]);
    const debouncedSaveChatSessions = useMemo(() => debounce((sessions) => {
        try { localStorage.setItem('tapnow_chat_sessions', JSON.stringify(sessions)); } catch (e) { }
    }, 1000), []);
    useEffect(() => { debouncedSaveChatSessions(chatSessions); }, [chatSessions, debouncedSaveChatSessions]);
    useEffect(() => {
        nodesRef.current = nodes;
        selectedNodeIdRef.current = selectedNodeId;
        selectedNodeIdsRef.current = selectedNodeIds; // 同步更新多选节点ref
        connectionsRef.current = connections;
        isSelectingRef.current = isSelecting; // 同步更新框选状态ref
    }, [nodes, selectedNodeId, selectedNodeIds, connections, isSelecting]);
    useEffect(() => {
        const aliveIds = new Set(nodes.map((node) => node.id));
        setNodeSelectionPriority((prev) => {
            let changed = false;
            const next = {};
            Object.entries(prev).forEach(([nodeId, order]) => {
                if (aliveIds.has(nodeId)) {
                    next[nodeId] = order;
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [nodes]);
    useEffect(() => {
        const selectedIds = Array.from(new Set([
            ...(selectedNodeIds ? Array.from(selectedNodeIds).filter(Boolean) : []),
            selectedNodeId
        ].filter(Boolean)));
        if (selectedIds.length === 0) return;
        touchNodeSelectionPriorityBatch(selectedIds);
    }, [selectedNodeId, selectedNodeIds, touchNodeSelectionPriorityBatch]);

    // 使用 useMemo 创建 nodes Map，优化节点查找性能（O(1) 查找）
    const nodesMap = useMemo(() => {
        const map = new Map();
        nodes.forEach(node => {
            map.set(node.id, node);
        });
        return map;
    }, [nodes]);

    const modelLibraryMap = useMemo(() => {
        const map = new Map();
        modelLibrary.forEach((entry, idx) => {
            const normalized = normalizeModelLibraryEntry(entry, idx);
            if (!normalized?.id) return;
            map.set(normalized.id, normalized);
        });
        return map;
    }, [modelLibrary]);
    const modelLibraryContractIssuesById = useMemo(() => {
        const result = {};
        modelLibrary.forEach((entry, idx) => {
            const normalized = normalizeModelLibraryEntry(entry, idx);
            if (!normalized?.id) return;
            const issues = validateModelLibraryContract(normalized);
            if (issues.length > 0) {
                result[normalized.id] = issues;
            }
        });
        return result;
    }, [modelLibrary]);

    const hasExpandedLibraryModels = modelLibrary.some(entry => !collapsedLibraryModels.has(entry.id));

    const resolveApiConfig = useCallback((...args) => modelsActions.resolveApiConfig({
        modelLibraryMap,
    }, ...args), [modelLibraryMap]);

    // 使用 useMemo 创建 apiConfigs Map，优化配置查找性能（O(1) 查找）
    // 使用 _uid 作为唯一键，避免同名模型相互覆盖
    const apiConfigsMap = useMemo(() => {
        const map = new Map();
        apiConfigs.forEach((config) => {
            const resolved = resolveApiConfig(config);
            if (resolved?._uid) {
                map.set(resolved._uid, resolved);
            }
        });
        return map;
    }, [apiConfigs, resolveApiConfig]);

    const apiConfigsById = useMemo(() => {
        const map = new Map();
        apiConfigs.forEach((config) => {
            const resolved = resolveApiConfig(config);
            if (!resolved?.id) return;
            if (!map.has(resolved.id)) map.set(resolved.id, []);
            map.get(resolved.id).push(resolved);
        });
        return map;
    }, [apiConfigs, resolveApiConfig]);

    const getApiConfigByKey = useCallback((modelKey) => {
        if (!modelKey) return null;
        const byUid = apiConfigsMap.get(modelKey);
        if (byUid) return byUid;
        const byId = apiConfigsById.get(modelKey);
        if (!byId || byId.length === 0) return null;
        if (byId.length === 1) return byId[0];
        const noLibrary = byId.find(c => !c.libraryId);
        return noLibrary || byId[0];
    }, [apiConfigsMap, apiConfigsById]);

    const resolveModelKey = useCallback((modelKey) => {
        if (!modelKey) return '';
        if (apiConfigsMap.has(modelKey)) return modelKey;
        const byId = apiConfigsById.get(modelKey);
        if (!byId || byId.length === 0) return modelKey;
        if (byId.length === 1) return byId[0]?._uid || modelKey;
        const noLibrary = byId.find(c => !c.libraryId);
        return noLibrary?._uid || byId[0]?._uid || modelKey;
    }, [apiConfigsMap, apiConfigsById]);

    useEffect(() => {
        if (!apiConfigs.length) return;
        setNodes(prev => {
            let changed = false;
            const nextNodes = prev.map(node => {
                if (!node.settings) return node;
                let settings = node.settings;
                let settingsChanged = false;

                const normalizeSettingModel = (field) => {
                    if (!settings?.[field]) return;
                    const resolved = resolveModelKey(settings[field]);
                    if (resolved && resolved !== settings[field]) {
                        if (!settingsChanged) settings = { ...settings };
                        settings[field] = resolved;
                        settingsChanged = true;
                    }
                };

                normalizeSettingModel('model');
                normalizeSettingModel('chatModel');
                normalizeSettingModel('imageModel');

                if (Array.isArray(settings.shots)) {
                    let shotsChanged = false;
                    const nextShots = settings.shots.map(shot => {
                        if (!shot?.model) return shot;
                        const resolved = resolveModelKey(shot.model);
                        if (resolved && resolved !== shot.model) {
                            shotsChanged = true;
                            return { ...shot, model: resolved };
                        }
                        return shot;
                    });
                    if (shotsChanged) {
                        if (!settingsChanged) settings = { ...settings };
                        settings.shots = nextShots;
                        settingsChanged = true;
                    }
                }

                if (!settingsChanged) return node;
                changed = true;
                return { ...node, settings };
            });
            return changed ? nextNodes : prev;
        });
    }, [apiConfigs.length, resolveModelKey, setNodes]);

    // V3.4.19：统一获取 API 凭据，仅从供应商获取，不再从模型获取
    const getApiCredentials = useCallback((modelId) => {
        const config = getApiConfigByKey(modelId);
        if (!config) {
            return {
                key: globalApiKey,
                url: DEFAULT_BASE_URL.replace(/\/+$/, ''),
                modelName: modelId,
                displayName: modelId,
                apiType: 'openai',
                useProxy: false,
                forceAsync: false
            };
        }

        // V3.4.19：只从供应商获取凭据，不再使用模型级别的 key/url
        const provider = providers[config.provider];
        // 供应商未配置 key 时，最后回退到全局 key
        const key = provider?.key || globalApiKey;
        const url = (provider?.url || DEFAULT_BASE_URL).replace(/\/+$/, '');

        return {
            key,
            url,
            modelName: config.modelName,
            displayName: config.displayName,
            provider: config.provider,
            type: config.type,
            apiType: config.apiType || provider?.apiType || 'openai',
            useProxy: !!provider?.useProxy,
            forceAsync: !!provider?.forceAsync
        };
    }, [getApiConfigByKey, providers, globalApiKey]);

    const buildProxyUrl = useCallback((targetUrl, providerKey) => {
        if (!targetUrl) return targetUrl;
        const provider = providers[providerKey];
        if (!provider?.useProxy) return targetUrl;
        const base = (localServerUrl || '').trim().replace(/\/+$/, '');
        if (!base) return targetUrl;
        return `${base}/proxy?url=${encodeURIComponent(targetUrl)}`;
    }, [providers, localServerUrl]);

    const getModelLabel = useCallback((modelId) => {
        if (!modelId) return '选择模型';
        const config = getApiConfigByKey(modelId);
        return config?.displayName || config?.modelName || config?.id || modelId;
    }, [getApiConfigByKey]);
    const getModelLabelWithProvider = useCallback((modelId) => {
        if (!modelId) return '选择模型';
        const config = getApiConfigByKey(modelId);
        const providerKey = config?.provider || '';
        const providerLabel = providerKey || '';
        const modelLabel = config?.displayName || config?.modelName || config?.id || modelId;
        if (providerLabel) return `${providerLabel} / ${modelLabel}`;
        return modelLabel;
    }, [getApiConfigByKey]);

    const getHistoryMeta = useCallback((...args) => nodesActions.getHistoryMeta({
        getApiConfigByKey,
    }, ...args), [getApiConfigByKey]);

    const renderCustomParamInputs = useCallback((...args) => nodesActions.renderCustomParamInputs({
        getApiConfigByKey,
        theme,
    }, ...args), [getApiConfigByKey, theme]);

    // V3.4.7：按供应商分组的 API 配置（用于两级菜单）
    const groupedApiConfigs = useMemo(() => {
        const groups = {};

        // 1. 初始化: 确保所有在 providers 中的供应商都显示 (即使没有模型)
        // V3.6.0: 直接使用 key 作为名称（用户可直接修改 key）
        Object.entries(providers).forEach(([key]) => {
            groups[key] = {
                name: key,
                models: []
            };
        });

        // 2. 填充模型
        apiConfigs.forEach(config => {
            if (DELETED_MODEL_IDS.includes(config.id)) return;
            const resolved = resolveApiConfig(config);
            if (!resolved) return;
            if (resolved.disabled) return;
            const providerKey = resolved.provider || 'Other';
            if (!groups[providerKey]) {
                groups[providerKey] = {
                    name: providerKey,
                    models: []
                };
            }
            groups[providerKey].models.push(resolved);
        });
        return groups;
    }, [apiConfigs, providers, resolveApiConfig]);

    const getFirstEnabledModelKey = useCallback((mode = 'image') => {
        const storageKey = mode === 'image' ? 'tapnow_last_image_model' : 'tapnow_last_video_model';
        const preferredFromState = mode === 'image' ? lastUsedImageModel : lastUsedVideoModel;
        let preferredStored = '';
        try {
            preferredStored = localStorage.getItem(storageKey) || '';
        } catch (e) {
            preferredStored = '';
        }
        const preferredKey = resolveModelKey(preferredFromState || preferredStored || '');
        const preferredConfig = getApiConfigByKey(preferredKey);
        const preferredMatches = !!preferredConfig
            && !preferredConfig.disabled
            && (mode === 'image' ? isImageModelType(preferredConfig.type) : preferredConfig.type === 'Video');
        if (preferredMatches) return preferredKey;

        const fallback = apiConfigs
            .map((config) => resolveApiConfig(config))
            .find((config) => config
                && !config.disabled
                && (mode === 'image' ? isImageModelType(config.type) : config.type === 'Video'));
        return resolveModelKey(fallback?._uid || fallback?.id || '');
    }, [lastUsedImageModel, lastUsedVideoModel, resolveModelKey, getApiConfigByKey, apiConfigs, resolveApiConfig]);

    const getRatiosForModel = useCallback((modelId) => {
        if (!modelId) return RATIOS;
        const config = getApiConfigByKey(modelId);
        if (config?.ratioLimits && Array.isArray(config.ratioLimits) && config.ratioLimits.length > 0) {
            const normalized = config.ratioLimits.map((ratio) => String(ratio));
            return cloudDocument ? normalized.filter((value) => value !== 'Auto') : normalized.includes('Auto') ? normalized : ['Auto', ...normalized];
        }
        const resolvedId = config?.id || modelId;
        return getDefaultRatiosForModel(resolvedId);
    }, [getApiConfigByKey]);

    const getResolutionsForModel = useCallback((modelId) => {
        if (!modelId) return RESOLUTIONS;
        const config = getApiConfigByKey(modelId);
        if (config?.resolutionLimits && Array.isArray(config.resolutionLimits) && config.resolutionLimits.length > 0) {
            const normalized = config.resolutionLimits
                .map((res) => normalizeResolutionOption(res))
                .filter(Boolean);
            const withAuto = cloudDocument ? normalized.filter((value) => value !== 'Auto') : normalized.includes('Auto') ? normalized : ['Auto', ...normalized];
            return Array.from(new Set(withAuto));
        }
        const resolvedId = config?.id || modelId;
        return getDefaultResolutionsForModel(resolvedId);
    }, [getApiConfigByKey]);

    const getVideoResolutionsForModel = useCallback((modelId) => {
        const config = modelId ? getApiConfigByKey(modelId) : null;
        const baseOptions = Array.isArray(config?.videoResolutions) && config.videoResolutions.length > 0
            ? config.videoResolutions
            : VIDEO_RES_OPTIONS;
        const normalized = baseOptions
            .map((res) => normalizeVideoResolution(res))
            .filter(Boolean);
        const withAuto = cloudDocument ? normalized.filter((value) => value !== 'Auto') : normalized.includes('Auto') ? normalized : ['Auto', ...normalized];
        return Array.from(new Set(withAuto));
    }, [getApiConfigByKey]);

    const getPreferredModelRatio = useCallback((modelId, mode = 'image') => {
        const ratioOptions = getRatiosForModel(modelId);
        const config = getApiConfigByKey(modelId);
        const preferred = String(config?.defaultRatio || '').trim();
        if (preferred && ratioOptions.includes(preferred)) return preferred;
        return ratioOptions.find((value) => value !== 'Auto') || ratioOptions[0] || (mode === 'video' ? '16:9' : '1:1');
    }, [getRatiosForModel, getApiConfigByKey]);

    const getPreferredImageResolutionForModel = useCallback((modelId) => {
        const resolutionOptions = getResolutionsForModel(modelId);
        const config = getApiConfigByKey(modelId);
        const preferred = normalizeImageResolution(config?.defaultResolution || '');
        if (preferred && resolutionOptions.includes(preferred)) return preferred;
        return resolutionOptions.find((value) => value !== 'Auto') || resolutionOptions[0] || '2K';
    }, [getResolutionsForModel, getApiConfigByKey]);

    const getPreferredVideoResolutionForModel = useCallback((modelId) => {
        const resolutionOptions = getVideoResolutionsForModel(modelId);
        const config = getApiConfigByKey(modelId);
        const preferredRaw = normalizeVideoResolution(config?.defaultVideoResolution || '');
        const preferred = preferredRaw === 'Auto' ? '' : preferredRaw;
        if (preferred && resolutionOptions.includes(preferred)) return preferred;
        return resolutionOptions.find((value) => value !== 'Auto') || resolutionOptions[0] || '720P';
    }, [getVideoResolutionsForModel, getApiConfigByKey]);
    const getDefaultCustomParamsForModel = useCallback((modelId, currentSelections = null, options = {}) => {
        const config = getApiConfigByKey(modelId);
        const customParams = Array.isArray(config?.customParams) ? config.customParams : [];
        if (!customParams.length) return {};
        const preserveByName = options.preserveByName === true;
        const safeSelections = currentSelections && typeof currentSelections === 'object' ? currentSelections : {};
        const next = {};
        customParams.forEach((param, index) => {
            const paramId = param.id || param.name || `param-${index}`;
            if (!paramId) return;
            let value = '';
            if (param.id && safeSelections[param.id] !== undefined && safeSelections[param.id] !== null && safeSelections[param.id] !== '') {
                value = safeSelections[param.id];
            } else if (preserveByName && param.name && safeSelections[param.name] !== undefined && safeSelections[param.name] !== null && safeSelections[param.name] !== '') {
                value = safeSelections[param.name];
            } else {
                value = param?.defaultValue ?? '';
            }
            if (value === undefined || value === null) value = '';
            value = String(value).trim();
            const allowedValues = Array.isArray(param.values) ? param.values : [];
            if (value && allowedValues.length > 0 && !isCustomParamInputMode(param) && !allowedValues.includes(value)) {
                value = '';
            }
            if (value) next[paramId] = value;
        });
        return next;
    }, [getApiConfigByKey]);
    const getNodeRecommendedHeight = useCallback((nodeType, modelId) => {
        const config = getApiConfigByKey(modelId);
        const customParamCount = Array.isArray(config?.customParams) ? config.customParams.length : 0;
        if (nodeType === 'gen-image') {
            return Math.min(860, 340 + Math.max(0, customParamCount - 1) * 36);
        }
        if (nodeType === 'gen-video') {
            return Math.min(900, 420 + Math.max(0, customParamCount - 1) * 36);
        }
        return 0;
    }, [getApiConfigByKey]);
    const applyNodeModelSelection = useCallback((...args) => modelsActions.applyNodeModelSelection({
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
    }, ...args), [
        resolveModelKey,
        getRatiosForModel,
        getResolutionsForModel,
        getVideoResolutionsForModel,
        getPreferredModelRatio,
        getPreferredImageResolutionForModel,
        getPreferredVideoResolutionForModel,
        getApiConfigByKey,
        getDefaultCustomParamsForModel,
        getNodeRecommendedHeight
    ]);

    // 使用 useMemo 创建 history Map，优化历史记录查找性能（O(1) 查找）
    const historyMap = useMemo(() => {
        const map = new Map();
        history.forEach(item => {
            map.set(item.id, item);
        });
        return map;
    }, [history]);

    // ResizeObserver keeps culling correct when side panels or the browser resize.
    // Keep selected/dragged nodes mounted so an ongoing interaction cannot lose its DOM.
    const visibleNodes = useMemo(() => {
        const retainedIds = new Set(selectedNodeIds);
        [selectedNodeId, dragNodeId, resizingNodeId, connectingSource, connectingTarget].forEach(id => {
            if (id) retainedIds.add(id);
        });
        return filterVisibleCanvasNodes(nodes, viewportBounds, retainedIds);
    }, [nodes, viewportBounds, selectedNodeIds, selectedNodeId, dragNodeId, resizingNodeId, connectingSource, connectingTarget]);

    // 同步 viewRef 和 view state
    useEffect(() => {
        viewRef.current = view;
    }, [view]);

    // 使用 useMemo 缓存连接相关的计算，避免重复计算
    const connectionsByNode = useMemo(() => {
        const byNode = {
            to: new Map(), // 映射关系：nodeId -> connections[]
            from: new Map() // 映射关系：nodeId -> connections[]
        };
        connections.forEach(conn => {
            if (!byNode.to.has(conn.to)) {
                byNode.to.set(conn.to, []);
            }
            byNode.to.get(conn.to).push(conn);

            if (!byNode.from.has(conn.from)) {
                byNode.from.set(conn.from, []);
            }
            byNode.from.get(conn.from).push(conn);
        });
        return byNode;
    }, [connections]);


    const getLocalSaveMediaItems = useCallback((...args) => nodesActions.getLocalSaveMediaItems({
        connectionsByNode,
        getApiConfigByKey,
        getItemProxyPreference,
        history,
        nodesMap,
    }, ...args), [connectionsByNode, nodesMap, history, getItemProxyPreference, getApiConfigByKey]);

    // An idle graph must not wake the entire editor every 500 ms.
    useEffect(() => {
        const activeTasks = history.filter(task => task.sourceNodeId && task.status === 'generating' && task.startTime);
        if (activeTasks.length === 0) {
            setNodeTimers(previous => Object.keys(previous).length ? {} : previous);
            return;
        }
        const interval = setInterval(() => {
            const now = Date.now();
            const newTimers = {};
            activeTasks.forEach(task => {
                const elapsed = Math.floor((now - task.startTime) / 100);
                newTimers[task.sourceNodeId] = elapsed / 10; // 转换为秒，保留1位小数
            });

            setNodeTimers(newTimers);
        }, 500); // V3.5.20-1: 改为 500ms 更新一次，减少 CPU 占用

        return () => clearInterval(interval);
    }, [history]);

    // 检查并重新切割需要切割的Midjourney图片（使用useRef避免重复切割）
    const splittingRef = useRef(new Set());
    useEffect(() => {
        history.forEach(item => {
            if (item.mjNeedsSplit && item.mjOriginalUrl && item.apiConfig?.modelId?.includes('mj') && item.status === 'completed') {
                // 避免重复切割
                if (splittingRef.current.has(item.id)) {
                    return;
                }
                splittingRef.current.add(item.id);

                // 延迟切割，避免阻塞UI
                setTimeout(() => {
                    // 获取比例信息
                    let ratio = item.mjRatio || '1:1';
                    if (item.prompt && item.prompt.includes('--ar ')) {
                        const arMatch = item.prompt.match(/--ar\s+([\d:]+)/);
                        if (arMatch && arMatch[1]) {
                            ratio = arMatch[1];
                        }
                    }


                    // 重新切割图片
                    splitMidjourneyImage(item.mjOriginalUrl, ratio).then((splitImages) => {
                        const imageUrls = splitImages.map(img => typeof img === 'string' ? img : img.url);
                        const firstImage = splitImages[0];
                        const firstUrl = typeof firstImage === 'string' ? firstImage : firstImage.url;

                        setHistory((prev) => prev.map((hItem) =>
                            hItem.id === item.id
                                ? {
                                    ...hItem,
                                    mjImages: imageUrls,
                                    url: firstUrl,
                                    selectedMjImageIndex: 0,
                                    mjRatio: ratio,
                                    mjNeedsSplit: false, // 标记已切割
                                    mjImageInfo: splitImages.map(img => typeof img === 'string' ? null : { width: img.width, height: img.height, ratio: img.ratio })
                                }
                                : hItem
                        ));

                        splittingRef.current.delete(item.id);
                    }).catch((err) => {
                        console.error('Midjourney: 重新切割图片失败:', err);
                        splittingRef.current.delete(item.id);
                        // 保持原图显示，标记需要重新切割
                        setHistory((prev) => prev.map((hItem) =>
                            hItem.id === item.id
                                ? { ...hItem, mjNeedsSplit: true }
                                : hItem
                        ));
                    });
                }, 500); // 延迟500ms，确保UI已完全渲染
            }
        });
    }, [history]);

    const buildLocalSaveFiles = useCallback((...args) => nodesActions.buildLocalSaveFiles({
        fetchCacheSource,
        getDataUrlExt,
        getFilenameFromUrl,
        getProxyPreferenceForUrl,
        getUrlExt,
        projectName,
        resolveSpecialUrl,
        sanitizeCacheId,
    }, ...args), [fetchCacheSource, getDataUrlExt, getFilenameFromUrl, getUrlExt, sanitizeCacheId, projectName, getProxyPreferenceForUrl, resolveSpecialUrl]);

    const getLocalSaveBaseUrl = useCallback((node) => {
        const raw = (node?.settings?.serverUrl || localServerUrl || '').trim();
        return raw.replace(/\/+$/, '');
    }, [localServerUrl]);

    const runLocalSaveBatch = useCallback((...args) => nodesActions.runLocalSaveBatch({
        buildLocalSaveFiles,
        getFilenameFromUrl,
        getItemProxyPreference,
        getLocalSaveBaseUrl,
        showToast,
        updateNodeSettings,
    }, ...args), [buildLocalSaveFiles, getFilenameFromUrl, getItemProxyPreference, getLocalSaveBaseUrl, showToast]);

    const testLocalSaveServer = useCallback(async (nodeId, rawUrl) => {
        const baseUrl = (rawUrl || localServerUrl || '').trim().replace(/\/+$/, '');
        if (!baseUrl) {
            showToast('请输入本地服务地址', 'warning');
            return;
        }
        updateNodeSettings(nodeId, { serverStatus: 'checking' });
        try {
            const res = await fetch(`${baseUrl}/ping`, { method: 'GET' });
            if (res.ok) {
                updateNodeSettings(nodeId, { serverStatus: 'connected' });
                showToast('本地服务已连接', 'success');
                return;
            }
        } catch (e) { }
        updateNodeSettings(nodeId, { serverStatus: 'disconnected' });
        showToast('本地服务连接失败', 'error');
    }, [localServerUrl, showToast, updateNodeSettings]);

    // V2.6.1：自动保存功能（local-save 节点）
    const autoSaveProcessingRef = useRef(new Set());
    useEffect(() => {
        const localSaveNodes = nodes.filter(n => n.type === 'local-save' && n.settings?.autoSave);
        if (localSaveNodes.length === 0) return;

        localSaveNodes.forEach(async (node) => {
            const baseUrl = getLocalSaveBaseUrl(node);
            if (!baseUrl) return;
            const connectedItems = getLocalSaveMediaItems(node.id);
            if (connectedItems.length === 0) return;

            const lastSavedKeys = node.settings?.lastSavedUrls || [];
            const subfolderScope = (node.settings?.subfolder || '').trim();
            const dedupeScope = `${baseUrl}::${subfolderScope}`;
            const newItems = connectedItems.filter(item => {
                const rawKey = item?.originalUrl || item?.url;
                const dedupeKey = rawKey ? (getFilenameFromUrl(rawKey) || rawKey) : '';
                const scopedKey = dedupeKey ? `${dedupeScope}::${dedupeKey}` : '';
                const legacyDuplicate = !subfolderScope && dedupeKey && lastSavedKeys.includes(dedupeKey);
                const isDuplicate = (scopedKey && lastSavedKeys.includes(scopedKey)) || legacyDuplicate;
                return scopedKey && !isDuplicate;
            });
            if (newItems.length === 0) return;

            const processKey = `${node.id}-${newItems.map(item => item.url).join('|')}`;
            if (autoSaveProcessingRef.current.has(processKey)) return;
            autoSaveProcessingRef.current.add(processKey);

            setTimeout(async () => {
                try {
                    await runLocalSaveBatch(node, newItems, { silent: true });
                } catch (err) {
                    console.error('自动保存失败:', err);
                } finally {
                    autoSaveProcessingRef.current.delete(processKey);
                }
            }, 1000);
        });
    }, [nodes, history, getLocalSaveMediaItems, runLocalSaveBatch, getLocalSaveBaseUrl, getFilenameFromUrl]);

    const handleChatResizeStart = (e) => { e.preventDefault(); setIsResizingChat(true); };
    const [isResizingChat, setIsResizingChat] = useState(false);

    const handleChatResizeMove = useCallback((e) => {
        if (canvasDialogStore.getSnapshot()) return;
        if (!isResizingChat) return;
        const newWidth = window.innerWidth - e.clientX;
        setChatWidth(Math.max(300, Math.min(newWidth, 800)));
    }, [isResizingChat]);

    const handleChatResizeEnd = useCallback(() => {
        setIsResizingChat(false);
    }, []);

    // 屏蔽滚轮事件相关的控制台错误（passive 事件监听器错误）- 双重保护
    useEffect(() => {
        const originalError = console.error;
        const originalWarn = console.warn;

        const shouldFilter = (args) => {
            const msg = args.map(arg => {
                if (typeof arg === 'string') return arg;
                if (arg && arg.toString) return arg.toString();
                return '';
            }).join(' ');
            return msg.includes('Unable to preventDefault') ||
                msg.includes('passive event listener') ||
                (msg.includes('preventDefault') && msg.includes('passive'));
        };

        console.error = function (...args) {
            if (shouldFilter(args)) return;
            originalError.apply(console, args);
        };

        console.warn = function (...args) {
            if (shouldFilter(args)) return;
            originalWarn.apply(console, args);
        };

        return () => {
            console.error = originalError;
            console.warn = originalWarn;
        };
    }, []);

    // 全局禁止 Ctrl+滚轮 缩放（捕获阶段，阻止浏览器缩放）；使用 try-catch 避免控制台报错
    useEffect(() => {
        const preventCtrlZoom = (e) => {
            if (canvasDialogStore.getSnapshot()) return;
            if (!e.ctrlKey) return;
            try {
                if (e.cancelable) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            } catch (err) {
                // 静默处理 passive 事件监听器的错误
            }
        };

        const opts = { passive: false, capture: true };
        window.addEventListener('wheel', preventCtrlZoom, opts);
        document.addEventListener('wheel', preventCtrlZoom, opts);
        window.addEventListener('mousewheel', preventCtrlZoom, opts);
        document.addEventListener('mousewheel', preventCtrlZoom, opts);

        return () => {
            window.removeEventListener('wheel', preventCtrlZoom, opts);
            document.removeEventListener('wheel', preventCtrlZoom, opts);
            window.removeEventListener('mousewheel', preventCtrlZoom, opts);
            document.removeEventListener('mousewheel', preventCtrlZoom, opts);
        };
    }, []);

    useEffect(() => {
        if (isResizingChat) {
            window.addEventListener('mousemove', handleChatResizeMove);
            window.addEventListener('mouseup', handleChatResizeEnd);
        } else {
            window.removeEventListener('mousemove', handleChatResizeMove);
            window.removeEventListener('mouseup', handleChatResizeEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleChatResizeMove);
            window.removeEventListener('mouseup', handleChatResizeEnd);
        };
    }, [isResizingChat, handleChatResizeMove, handleChatResizeEnd]);

    const screenToWorld = useCallback((sx, sy) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const localX = rect ? sx - rect.left : sx;
        const localY = rect ? sy - rect.top : sy;
        const currentView = viewRef.current || DEFAULT_VIEW;
        const zoom = Number.isFinite(currentView.zoom) && currentView.zoom > 0 ? currentView.zoom : DEFAULT_VIEW.zoom;
        return { x: (localX - currentView.x) / zoom, y: (localY - currentView.y) / zoom };
    }, []);

    const handleMouseDown = (e) => {
        if (canvasDialogStore.getSnapshot()) return;
        if (e.button === 0 || e.button === 1) {
            if (e.currentTarget.id === 'canvas-bg') {
                // 检查是否点击了可交互元素
                const target = e.target;
                if (target && (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.tagName === 'BUTTON' ||
                    target.isContentEditable ||
                    isCanvasInteractiveTarget(target)
                )) {
                    return; // 点击交互元素时不处理拖拽
                }

                // 从画布背景开始拖动时自动清除文本选区
                // 防止意外选中文字导致拖动卡住
                const selection = window.getSelection();
                if (selection && selection.toString().length > 0) {
                    selection.removeAllRanges();
                }
                // 检测Ctrl+鼠标左键，开始框选
                if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    setIsSelecting(true);
                    isSelectingRef.current = true; // 设置ref标志
                    setIsPanning(false);
                    const rect = canvasRef.current?.getBoundingClientRect();
                    const startX = e.clientX - (rect?.left || 0);
                    const startY = e.clientY - (rect?.top || 0);
                    setSelectionBox({ startX, startY, endX: startX, endY: startY });
                    setSelectedNodeIds(new Set()); // 清空之前的选择
                    setSelectedNodeId(null);
                    return;
                }
                // 普通拖动画布（只有在不是框选状态时才能拖拽）
                // 修复：无论是否选中节点，只要点击的是 canvas-bg，都应该允许拖动
                if (!isSelectingRef.current) {
                    setIsPanning(true);
                    isPanningRef.current = true; // 同步ref状态
                    setIsDragging(false);
                    lastMousePos.current = { x: e.clientX, y: e.clientY };
                }
            }
        }
    };

    const {
        nodeUpdateRef,
        nodeUpdateRaf,
        multiNodeUpdateRef,
        flushNodeUpdate,
        scheduleNodeUpdate
    } = useRafNodeUpdates(setNodes);

    useEffect(() => {
        return () => {
            if (panRafRef.current) {
                cancelAnimationFrame(panRafRef.current);
            }
            if (nodeDragRafRef.current) {
                cancelAnimationFrame(nodeDragRafRef.current);
            }
        };
    }, []);

    // 使用 requestAnimationFrame 节流框选逻辑
    const selectionRafRef = useRef(null);
    const pendingSelectionUpdate = useRef(null);

    const getCurrentDragZoom = useCallback(() => {
        const zoom = viewRef.current?.zoom;
        return Number.isFinite(zoom) && zoom > 0
            ? Math.max(0.2, Math.min(3, zoom))
            : 1;
    }, []);

    const getDataAttrSelector = useCallback((attr, value) => {
        const rawValue = String(value ?? '');
        const escapeValue = globalThis.CSS?.escape;
        const safeValue = typeof escapeValue === 'function'
            ? escapeValue(rawValue)
            : rawValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `[${attr}="${safeValue}"]`;
    }, []);

    const getCanvasNodeElement = useCallback((nodeId) => {
        return canvasRef.current?.querySelector(getDataAttrSelector('data-node-id', nodeId)) || null;
    }, [getDataAttrSelector]);

    const getProjectedDragNode = useCallback((session, nodeId, deltaX, deltaY) => {
        const node = nodesMap.get(nodeId);
        const startPosition = session?.startPositions?.get(nodeId);
        if (!node || !startPosition) return node;
        return {
            ...node,
            x: startPosition.x + deltaX,
            y: startPosition.y + deltaY
        };
    }, [nodesMap]);

    const collectDragConnectionElements = useCallback((nodeIds) => {
        const layer = connectionLayerRef.current;
        const affectedConnections = new Map();

        nodeIds.forEach((nodeId) => {
            (connectionsByNode.from.get(nodeId) || []).forEach((conn) => affectedConnections.set(conn.id, conn));
            (connectionsByNode.to.get(nodeId) || []).forEach((conn) => affectedConnections.set(conn.id, conn));
        });

        return Array.from(affectedConnections.values()).map((conn) => ({
            conn,
            group: layer?.querySelector(getDataAttrSelector('data-connection-id', conn.id)) || null
        }));
    }, [connectionsByNode, getDataAttrSelector]);

    const applyConnectionDragProjection = useCallback((session, deltaX, deltaY) => {
        if (!session?.nodeIds?.length) return;

        const connectionElements = session.connectionElements || collectDragConnectionElements(session.nodeIds);
        connectionElements.forEach(({ conn, group }) => {
            const fromNode = getProjectedDragNode(session, conn.from, deltaX, deltaY);
            const toNode = getProjectedDragNode(session, conn.to, deltaX, deltaY);
            const geometry = getConnectionGeometry({
                conn,
                fromNode,
                toNode,
                connectionsByNode,
                getApiConfigByKey
            });
            if (!geometry) return;

            if (!group) return;

            group.querySelectorAll('[data-conn-path]').forEach((path) => {
                path.setAttribute('d', geometry.pathD);
            });

            const movePoint = (pointName, x, y) => {
                const point = group.querySelector(getDataAttrSelector('data-conn-point', pointName));
                if (!point) return;
                point.setAttribute('cx', String(x));
                point.setAttribute('cy', String(y));
            };

            movePoint('start', geometry.startX, geometry.startY);
            movePoint('end', geometry.endX, geometry.endY);
            movePoint('delete-hot', geometry.midX, geometry.midY);
            movePoint('delete-outer', geometry.midX, geometry.midY);
            movePoint('delete-inner', geometry.midX, geometry.midY);

            const deleteIcon = group.querySelector('[data-conn-icon="delete"]');
            if (deleteIcon) {
                deleteIcon.setAttribute('x', String(geometry.midX - 5));
                deleteIcon.setAttribute('y', String(geometry.midY - 5));
            }
        });
    }, [collectDragConnectionElements, connectionsByNode, getApiConfigByKey, getDataAttrSelector, getProjectedDragNode]);

    const applyNodeDragProjection = useCallback((session, deltaX, deltaY) => {
        if (!session?.nodeIds?.length) return;

        session.nodeIds.forEach((nodeId) => {
            const nodeElement = getCanvasNodeElement(nodeId);
            if (!nodeElement) return;
            nodeElement.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
        });

        applyConnectionDragProjection(session, deltaX, deltaY);
    }, [applyConnectionDragProjection, getCanvasNodeElement]);

    const clearNodeDragProjection = useCallback((session) => {
        if (!session?.nodeIds?.length) return;
        session.nodeIds.forEach((nodeId) => {
            const nodeElement = getCanvasNodeElement(nodeId);
            if (!nodeElement) return;
            nodeElement.style.transform = 'translateZ(0)';
            nodeElement.style.willChange = '';
        });
    }, [getCanvasNodeElement]);

    const beginNodeDragSession = useCallback((primaryNodeId, nodeIds, clientX, clientY) => {
        const orderedNodeIds = Array.from(new Set((nodeIds?.length ? nodeIds : [primaryNodeId]).filter(Boolean)));
        const nodeMap = new Map(nodesRef.current.map((node) => [node.id, node]));
        const startPositions = new Map();

        orderedNodeIds.forEach((nodeId) => {
            const node = nodeMap.get(nodeId);
            if (!node) return;
            startPositions.set(nodeId, { x: node.x, y: node.y });

            const nodeElement = getCanvasNodeElement(nodeId);
            if (nodeElement) {
                nodeElement.style.willChange = 'transform';
            }
        });

        if (!startPositions.has(primaryNodeId)) return;

        if (nodeDragRafRef.current) {
            cancelAnimationFrame(nodeDragRafRef.current);
            nodeDragRafRef.current = null;
        }

        nodeDragSessionRef.current = {
            primaryNodeId,
            nodeIds: Array.from(startPositions.keys()),
            startClientX: clientX,
            startClientY: clientY,
            zoom: getCurrentDragZoom(),
            startPositions,
            connectionElements: collectDragConnectionElements(Array.from(startPositions.keys())),
            deltaX: 0,
            deltaY: 0,
            moved: false
        };
        pendingNodeDragProjectionRef.current = null;
    }, [collectDragConnectionElements, getCanvasNodeElement, getCurrentDragZoom]);

    const updateNodeDragProjection = useCallback((clientX, clientY) => {
        const session = nodeDragSessionRef.current;
        if (!session) return false;

        const deltaX = (clientX - session.startClientX) / session.zoom;
        const deltaY = (clientY - session.startClientY) / session.zoom;
        if (Math.abs(deltaX - session.deltaX) < 0.01 && Math.abs(deltaY - session.deltaY) < 0.01) {
            return true;
        }

        pendingNodeDragProjectionRef.current = { deltaX, deltaY };

        if (!nodeDragRafRef.current) {
            nodeDragRafRef.current = requestAnimationFrame(() => {
                const currentSession = nodeDragSessionRef.current;
                const pendingProjection = pendingNodeDragProjectionRef.current;
                nodeDragRafRef.current = null;
                pendingNodeDragProjectionRef.current = null;
                if (!currentSession || !pendingProjection) return;

                currentSession.deltaX = pendingProjection.deltaX;
                currentSession.deltaY = pendingProjection.deltaY;
                currentSession.moved = currentSession.moved ||
                    Math.abs(pendingProjection.deltaX) > 0.01 ||
                    Math.abs(pendingProjection.deltaY) > 0.01;
                applyNodeDragProjection(currentSession, pendingProjection.deltaX, pendingProjection.deltaY);
            });
        }

        return true;
    }, [applyNodeDragProjection]);

    const commitNodeDragSession = useCallback(() => {
        const session = nodeDragSessionRef.current;
        if (!session) return;

        if (nodeDragRafRef.current) {
            cancelAnimationFrame(nodeDragRafRef.current);
            nodeDragRafRef.current = null;
        }

        if (pendingNodeDragProjectionRef.current) {
            const { deltaX, deltaY } = pendingNodeDragProjectionRef.current;
            session.deltaX = deltaX;
            session.deltaY = deltaY;
            session.moved = session.moved || Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01;
            applyNodeDragProjection(session, deltaX, deltaY);
            pendingNodeDragProjectionRef.current = null;
        }

        if (session.moved) {
            const finalDeltaX = session.deltaX;
            const finalDeltaY = session.deltaY;
            flushSync(() => {
                setNodes((prev) => {
                    let hasChanges = false;
                    const next = prev.map((node) => {
                        const startPosition = session.startPositions.get(node.id);
                        if (!startPosition) return node;

                        const nextX = startPosition.x + finalDeltaX;
                        const nextY = startPosition.y + finalDeltaY;
                        if (Math.abs(node.x - nextX) < 0.01 && Math.abs(node.y - nextY) < 0.01) {
                            return node;
                        }

                        hasChanges = true;
                        return {
                            ...node,
                            x: nextX,
                            y: nextY
                        };
                    });
                    return hasChanges ? next : prev;
                });
            });
            clearNodeDragProjection(session);
        } else {
            clearNodeDragProjection(session);
            applyConnectionDragProjection(session, 0, 0);
        }

        nodeDragSessionRef.current = null;
        pendingNodeDragProjectionRef.current = null;
    }, [applyConnectionDragProjection, applyNodeDragProjection, clearNodeDragProjection, setNodes]);

    const handleMouseMove = useCallback((e) => {
        if (canvasDialogStore.getSnapshot()) return;
        const { clientX, clientY } = e;
        const shouldTrackMousePos = !!connectingSource || !!connectingTarget;
        const worldPos = (shouldTrackMousePos || !!resizingNodeId) ? screenToWorld(clientX, clientY) : null;
        if (shouldTrackMousePos && worldPos) {
            setMousePos(worldPos);
        }

        // 框选模式 - 使用 requestAnimationFrame 节流
        // 使用ref检查，确保即使Ctrl松开也能继续框选
        if (isSelecting || isSelectingRef.current) {
            // 如果isSelecting为false但ref为true，说明Ctrl松开了，但框选应该继续
            if (!isSelecting) {
                setIsSelecting(true);
            }
            const rect = canvasRef.current?.getBoundingClientRect();
            const endX = clientX - (rect?.left || 0);
            const endY = clientY - (rect?.top || 0);

            // 立即更新框选框位置（视觉反馈）
            setSelectionBox(prev => {
                if (!prev) return null;
                return { ...prev, endX, endY };
            });

            // 节流节点选择计算
            pendingSelectionUpdate.current = { endX, endY, rect };

            if (!selectionRafRef.current) {
                selectionRafRef.current = requestAnimationFrame(() => {
                    if (!pendingSelectionUpdate.current) {
                        selectionRafRef.current = null;
                        return;
                    }

                    const { endX, endY, rect } = pendingSelectionUpdate.current;
                    const currentSelectionBox = selectionBox;
                    if (!currentSelectionBox) {
                        selectionRafRef.current = null;
                        return;
                    }

                    // 计算被框选的节点
                    const boxStartX = Math.min(currentSelectionBox.startX, endX);
                    const boxStartY = Math.min(currentSelectionBox.startY, endY);
                    const boxEndX = Math.max(currentSelectionBox.startX, endX);
                    const boxEndY = Math.max(currentSelectionBox.startY, endY);

                    // 将屏幕坐标转换为世界坐标
                    const worldStart = screenToWorld(boxStartX + (rect?.left || 0), boxStartY + (rect?.top || 0));
                    const worldEnd = screenToWorld(boxEndX + (rect?.left || 0), boxEndY + (rect?.top || 0));

                    // 使用 ref 获取最新的 nodes，避免闭包问题
                    const currentNodes = nodesRef.current;
                    const selected = new Set();
                    currentNodes.forEach(node => {
                        // V3.5.11: 添加默认尺寸，修复缩放后无法框选的问题
                        const nodeRight = node.x + (node.width || 260);
                        const nodeBottom = node.y + (node.height || 200);
                        // 检查节点是否与框选框相交
                        if (node.x < worldEnd.x && nodeRight > worldStart.x &&
                            node.y < worldEnd.y && nodeBottom > worldStart.y) {
                            selected.add(node.id);
                        }
                    });
                    setSelectedNodeIds(selected);

                    pendingSelectionUpdate.current = null;
                    selectionRafRef.current = null;
                });
            }
            return;
        }

        // 只有在不是框选状态时才能拖拽画布
        // 使用 ref 检查，确保即使状态更新延迟也能继续拖动
        if ((isPanning || isPanningRef.current) && !isSelectingRef.current) {
            setIsDragging(true);
            const dx = clientX - lastMousePos.current.x;
            const dy = clientY - lastMousePos.current.y;

            // 添加阈值判断，忽略微小移动（<1px）避免不必要的重渲染
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
                return;
            }

            // 使用 requestAnimationFrame 节流画布拖动更新，提升性能
            // 累积移动距离，而不是只保留最后一次
            if (pendingPanUpdate.current) {
                pendingPanUpdate.current.dx += dx;
                pendingPanUpdate.current.dy += dy;
            } else {
                pendingPanUpdate.current = { dx, dy };
            }

            if (!panRafRef.current) {
                panRafRef.current = requestAnimationFrame(() => {
                    if (!pendingPanUpdate.current) {
                        panRafRef.current = null;
                        return;
                    }

                    const { dx, dy } = pendingPanUpdate.current;
                    // 使用函数式更新，避免依赖 view
                    // 使用 Math.round 处理高缩放级别下的浮点数精度问题
                    // 添加 zoom 边界检查，防止极端缩放下的位置漂移
                    setView((prev) => {
                        // 确保 zoom 在有效范围内（0.2-3.0）
                        const safeZoom = Math.max(0.2, Math.min(3.0, prev.zoom));
                        // 在极端缩放下使用更高精度的舍入
                        const precision = safeZoom < 0.5 || safeZoom > 2.5 ? 1000 : 100;
                        const nextView = {
                            ...prev,
                            zoom: safeZoom,
                            x: Math.round((prev.x + dx) * precision) / precision,
                            y: Math.round((prev.y + dy) * precision) / precision
                        };
                        viewRef.current = nextView;
                        return nextView;
                    });

                    pendingPanUpdate.current = null;
                    panRafRef.current = null;
                });
            }

            lastMousePos.current = { x: clientX, y: clientY };
            return;
        }

        if (resizingNodeId && worldPos) {
            scheduleNodeUpdate(resizingNodeId, (node) => ({
                ...node,
                width: Math.max(250, worldPos.x - node.x),
                height: Math.max(250, worldPos.y - node.y)
            }));
        } else if (dragNodeId || nodeDragSessionRef.current) {
            updateNodeDragProjection(clientX, clientY);
        }
    }, [isPanning, isSelecting, selectionBox, dragNodeId, resizingNodeId, connectingSource, connectingTarget, screenToWorld, scheduleNodeUpdate, updateNodeDragProjection]);

    const handleMouseUp = () => {
        const releasedDragNodeIds = Array.isArray(dragPriorityNodeIdsRef.current)
            ? dragPriorityNodeIdsRef.current.filter(Boolean)
            : [];
        const commitDragPriority = () => {
            if (releasedDragNodeIds.length > 0) {
                touchNodeSelectionPriorityBatch(releasedDragNodeIds);
            }
            dragPriorityNodeIdsRef.current = [];
        };
        // 清理画布拖动的 requestAnimationFrame
        if (panRafRef.current) {
            cancelAnimationFrame(panRafRef.current);
            panRafRef.current = null;
        }
        // 处理待处理的画布拖动更新
        if (pendingPanUpdate.current) {
            const { dx, dy } = pendingPanUpdate.current;
            // 使用 Math.round 处理高缩放级别下的浮点数精度问题
            // 添加 zoom 边界检查，防止极端缩放下的位置漂移
            setView((prev) => {
                // 确保 zoom 在有效范围内（0.2-3.0）
                const safeZoom = Math.max(0.2, Math.min(3.0, prev.zoom));
                // 在极端缩放下使用更高精度的舍入
                const precision = safeZoom < 0.5 || safeZoom > 2.5 ? 1000 : 100;
                const nextView = {
                    ...prev,
                    zoom: safeZoom,
                    x: Math.round((prev.x + dx) * precision) / precision,
                    y: Math.round((prev.y + dy) * precision) / precision
                };
                viewRef.current = nextView;
                return nextView;
            });
            pendingPanUpdate.current = null;
        }

        commitNodeDragSession();

        // 确保节点更新被刷新（处理待处理的单节点/多节点更新）
        if ((nodeUpdateRef.current || multiNodeUpdateRef.current) && nodeUpdateRaf.current) {
            // 取消当前的 RAF，立即执行更新
            cancelAnimationFrame(nodeUpdateRaf.current);
            flushNodeUpdate();
        }

        // 结束框选
        if (isSelecting || isSelectingRef.current) {
            setIsSelecting(false);
            isSelectingRef.current = false; // 重置 ref 状态
            setSelectionBox(null);
            // 如果只选中一个节点，设置selectedNodeId
            if (selectedNodeIds.size === 1) {
                const nodeId = Array.from(selectedNodeIds)[0];
                setSelectedNodeId(nodeId);
            } else if (selectedNodeIds.size === 0) {
                setSelectedNodeId(null);
            }
            // 确保清理拖动状态
            setIsDragging(false);
            setIsPanning(false);
            isPanningRef.current = false;
            // 清理多节点拖动状态
            multiNodeDragStartPos.current = null;
            singleNodeDragStartPos.current = null;
            // 清理 zoom 跟踪，防止缩放切换导致的状态不一致
            lastZoomRef.current = null;
            commitDragPriority();
            return;
        }

        if (isPanning || isPanningRef.current) {
            setIsPanning(false);
            isPanningRef.current = false;
            setIsDragging(false); // 确保清理拖动状态
            if (!connectingSource && !connectingTarget && !dragNodeId && !resizingNodeId) {
                setSelectedNodeId(null);
                setSelectedNodeIds(new Set());
                setContextMenu(prev => ({ ...prev, visible: false }));
                setActiveDropdown(null);
                setHistoryContextMenu(prev => ({ ...prev, visible: false }));
            }
        }
        if (!connectingSource && !connectingTarget) {
            setDragNodeId(null);
            setResizingNodeId(null);
            // 清理多节点拖动状态
            multiNodeDragStartPos.current = null;
            singleNodeDragStartPos.current = null;
            // 清理 zoom 跟踪
            lastZoomRef.current = null;
        }
        // 确保在所有情况下都清理拖动状态
        setIsDragging(false);
        // 重置 isSelectingRef（防止状态残留）
        isSelectingRef.current = false;
        // 重置 lastMousePos，防止状态残留导致后续拖动异常
        // 注意：不重置为 null，而是重置为初始值，保持类型一致
        lastMousePos.current = { x: 0, y: 0 };
        commitDragPriority();
    };

    const cancelCanvasConnection = useCallback(() => {
        setConnectingSource(null);
        setConnectingTarget(null);
        setConnectingInputType(null);
        setHoverTargetId(null);
        setIsPanning(false);
        isPanningRef.current = false;
        setDragNodeId(null);
        setResizingNodeId(null);
    }, []);

    const handleNodeMouseUp = useCallback((targetId, e, inputType = 'default') => {
        e.stopPropagation();
        try {
            commitNodeDragSession();
            const releasedDragNodeIds = Array.isArray(dragPriorityNodeIdsRef.current)
                ? dragPriorityNodeIdsRef.current.filter(Boolean)
                : [];
            if (releasedDragNodeIds.length > 0) {
                touchNodeSelectionPriorityBatch(releasedDragNodeIds);
            }
            dragPriorityNodeIdsRef.current = [];
            const edge = connectingSource
                ? { from: connectingSource, to: targetId, inputType }
                : connectingTarget ? { from: targetId, to: connectingTarget, inputType: connectingInputType || inputType } : null;
            if (edge) {
                edge.id = canvasRequestId('connection');
                const change = connectCanvasNodes(connections, nodesMap, edge);
                if (change.reason) showToast(change.reason, 'warning');
                if (change.connections !== connections) {
                    saveToUndoStack();
                    setConnections(previous => previous === connections ? change.connections : connectCanvasNodes(previous, nodesMap, edge).connections);
                }
            }
        } catch (error) {
            showToast(error?.message || '连接失败，请重试', 'error');
        } finally {
            cancelCanvasConnection();
        }
    }, [connectingSource, connectingTarget, connectingInputType, connections, nodesMap, saveToUndoStack, showToast, touchNodeSelectionPriorityBatch, commitNodeDragSession, cancelCanvasConnection]);

    const handleBackgroundClick = (e) => {
        if (connectingSource) {
            const world = screenToWorld(e.clientX, e.clientY);
            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, worldX: world.x, worldY: world.y, sourceNodeId: connectingSource });
            setContextMenuExpanded(false);
            setConnectingSource(null);
        } else if (connectingTarget) {
            // 从输入端口开始的连接，点击背景时弹出参考图窗口
            const world = screenToWorld(e.clientX, e.clientY);
            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, worldX: world.x, worldY: world.y, targetNodeId: connectingTarget, inputType: connectingInputType });
            setContextMenuExpanded(false);
            setConnectingTarget(null);
            setConnectingInputType(null);
        }
    };

    // Bind once; pointer movement reads current callbacks without rebinding listeners.
    const canvasPointerHandlers = useRef(null);
    canvasPointerHandlers.current = {
        active: !!(isPanning || isDragging || dragNodeId || resizingNodeId || isSelecting || connectingSource || connectingTarget),
        connecting: !!(connectingSource || connectingTarget),
        get canvas() { return canvasRef.current; },
        move: handleMouseMove,
        end: handleMouseUp,
        connect: handleNodeMouseUp,
        background: handleBackgroundClick,
        cancel: cancelCanvasConnection,
        report: error => showToast(error?.message || '连接失败，请重试', 'error'),
    };
    useEffect(() => bindCanvasPointerEvents(window, () => canvasPointerHandlers.current), []);

    const handleDoubleClick = (e) => {
        if (e.currentTarget.id === 'canvas-bg') {
            const world = screenToWorld(e.clientX, e.clientY);
            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, worldX: world.x, worldY: world.y, sourceNodeId: undefined });
            setContextMenuExpanded(false);
        }
    };

    // 框选节点右键菜单
    const handleCanvasContextMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hasSelection = selectedNodeIds.size > 0 || selectedNodeId;
        if (hasSelection) {
            setSelectionContextMenu({ visible: true, x: e.clientX, y: e.clientY });
        }
    };

    const extractNodeIOTextPayload = useCallback((sourceNode) => {
        if (!sourceNode || typeof sourceNode !== 'object') return [];
        const settings = sourceNode.settings && typeof sourceNode.settings === 'object' ? sourceNode.settings : {};
        const texts = [];
        const pushText = (value) => {
            if (typeof value !== 'string') return;
            const trimmed = value.trim();
            if (!trimmed) return;
            if (texts.includes(trimmed)) return;
            texts.push(trimmed);
        };
        if (sourceNode.type === 'text-node') pushText(settings.text);
        if (sourceNode.type === 'gen-image') pushText(settings.prompt);
        if (sourceNode.type === 'gen-video') pushText(settings.videoPrompt);
        if (sourceNode.type === 'novel-input') pushText(settings.content);
        if (sourceNode.type === 'storyboard-node') {
            const shots = Array.isArray(settings.shots) ? settings.shots : [];
            shots.forEach((shot) => {
                if (!shot || typeof shot !== 'object') return;
                pushText(shot.prompt);
                pushText(shot.description);
                pushText(shot.scene_description);
            });
        }
        const fallbackFields = ['text', 'prompt', 'videoPrompt', 'content', 'description', 'summary'];
        fallbackFields.forEach((field) => pushText(settings[field]));
        return texts;
    }, []);

    const semanticNodesRef = useRef([]);
    const semanticNodes = useMemo(() => {
        const next = stableMediaNodes(nodes, semanticNodesRef.current);
        semanticNodesRef.current = next;
        return next;
    }, [nodes]);
    const semanticNodesMap = useMemo(() => new Map(semanticNodes.map(node => [node.id, node])), [semanticNodes]);
    const extractNodeIOMediaPayload = useCallback((...args) => nodesActions.extractNodeIOMediaPayload({
        nodesMap: semanticNodesMap, connectionsByNode, resolveAssetChannelUrl,
    }, ...args), [resolveAssetChannelUrl, semanticNodesMap, connectionsByNode]);

    const connectedNodeIOEnvelopeCache = useMemo(() => buildConnectedNodeIOEnvelopeCache({
        connections,
        nodesMap: semanticNodesMap,
        readMedia: extractNodeIOMediaPayload,
        readText: extractNodeIOTextPayload,
        version: NODE_IO_ENVELOPE_VERSION,
        isValid: isNodeIOEnvelopeValid,
    }), [connections, semanticNodesMap, extractNodeIOMediaPayload, extractNodeIOTextPayload]);

    const getConnectedNodeIOEnvelopes = useCallback((targetNodeId, inputType = 'default') => {
        const nodeCache = connectedNodeIOEnvelopeCache.get(targetNodeId);
        if (!nodeCache) return [];
        return nodeCache.get(inputType) || [];
    }, [connectedNodeIOEnvelopeCache]);

    const getConnectedInputImages = useCallback((targetNodeId, inputType = 'default') => {
        const envelopes = getConnectedNodeIOEnvelopes(targetNodeId, inputType);
        const images = [];
        const pushImage = (url) => {
            const normalized = String(url || '').trim();
            if (!normalized) return;
            if (images.includes(normalized)) return;
            images.push(normalized);
        };
        envelopes.forEach((envelope) => {
            const mediaItems = Array.isArray(envelope?.media) ? envelope.media : [];
            mediaItems.forEach((item) => {
                if (normalizeNodeIOMediaType(item?.type, item?.url) !== 'image') return;
                pushImage(item?.url);
            });
        });
        return images;
    }, [getConnectedNodeIOEnvelopes]);
    // Share applied video/image outputs with downstream analysis nodes.
    const connectedVideoInputCache = useMemo(
        () => buildConnectedVideoInputCache(semanticNodesMap, connections, normalizeStoryboardMode),
        [connections, semanticNodesMap]
    );

    // 获取连接的 video-input 节点（用于 video-analyze 节点）
    const getConnectedVideoInputNode = useCallback((targetNodeId) => {
        return connectedVideoInputCache.get(targetNodeId) || null;
    }, [connectedVideoInputCache]);

    // 获取连接的 video-analyze 节点（用于 storyboard-node 节点）
    const getConnectedVideoAnalyzeNode = useCallback((targetNodeId) => {
        for (const conn of connections) {
            if (conn.to === targetNodeId) {
                const sourceNode = nodesMap.get(conn.from);
                if (sourceNode && sourceNode.type === 'video-analyze') {
                    return sourceNode;
                }
            }
        }
        return null;
    }, [connections, nodesMap]);

    // 功能2：获取连接的文字节点内容
    const getConnectedTextNodes = useCallback((targetNodeId) => {
        const texts = [];
        const pushText = (value) => {
            if (typeof value !== 'string') return;
            const trimmed = value.trim();
            if (!trimmed) return;
            if (texts.includes(trimmed)) return;
            texts.push(trimmed);
        };
        const envelopes = getConnectedNodeIOEnvelopes(targetNodeId, 'default');
        envelopes.forEach((envelope) => {
            if (!Array.isArray(envelope?.text)) return;
            envelope.text.forEach(pushText);
        });
        return texts;
    }, [getConnectedNodeIOEnvelopes]);

    // 获取连接到特定输入点的首张图片URL（统一走 NodeIOEnvelope）
    const getConnectedImageForInput = useCallback((targetNodeId, inputType) => {
        const images = getConnectedInputImages(targetNodeId, inputType || 'default');
        return images[0] || null;
    }, [getConnectedInputImages]);


    // 将生成结果同步到连接的预览节点
    const updatePreviewFromTask = (...args) => nodesActions.updatePreviewFromTask({
        connections,
        connectionsRef,
        historyMap,
        nodesMap,
        setNodes,
        updateShot,
    }, ...args);

    const deleteHistoryItem = (id) => {
        setHistory(prev => {
            const filtered = prev.filter(item => item.id !== id);
            // 立即保存到 localStorage，不等待防抖
            try {
                localStorage.setItem('tapnow_history', JSON.stringify(filtered));
            } catch (e) {
                console.error('立即保存历史记录失败:', e);
            }
            return filtered;
        });
        if (historyContextMenu.item && historyContextMenu.item.id === id) {
            setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
        }
    };

    const addModelLibraryEntry = (...args) => modelsActions.addModelLibraryEntry({
        setCollapsedLibraryModels,
        setEditingLibraryModels,
        setModelLibrary,
    }, ...args);

    const duplicateModelLibraryEntry = (entryId) => {
        const source = modelLibrary.find(entry => entry.id === entryId);
        if (!source) return;
        const baseId = `${source.id}-copy`;
        let newId = baseId;
        let counter = 1;
        while (modelLibrary.some(entry => entry.id === newId)) {
            newId = `${baseId}-${counter++}`;
        }
        const cloned = JSON.parse(JSON.stringify(source));
        const displayBase = cloned.displayName || cloned.modelName || cloned.id || newId;
        const duplicatedParams = Array.isArray(cloned.customParams)
            ? cloned.customParams.map((param) => ({ ...param, id: '' }))
            : [];
        const newEntry = {
            ...cloned,
            id: newId,
            displayName: `${displayBase}（复制）`,
            modelName: cloned.modelName || cloned.id || newId,
            customParams: normalizeCustomParams(duplicatedParams),
            requestChain: normalizeRequestChain(cloned.requestChain),
            transport: normalizeTransportMode(cloned.transport),
            transportOptions: normalizeTransportOptions(cloned.transportOptions),
            capabilities: normalizeCapabilitySchema(cloned.capabilities, cloned.type || source.type),
            requestTemplate: normalizeRequestTemplate(cloned.requestTemplate || getDefaultRequestTemplateForEntry(cloned)),
            previewOverridePatch: normalizePreviewOverridePatch(cloned.previewOverridePatch),
            requestOverridePatch: normalizeRequestOverridePatch(cloned.requestOverridePatch)
        };
        setModelLibrary(prev => [...prev, newEntry]);
        setEditingLibraryModels(prev => {
            const next = new Set(prev);
            next.add(newId);
            return next;
        });
        setCollapsedLibraryModels(prev => {
            const next = new Set(prev);
            next.delete(newId);
            return next;
        });
    };

    const isLibraryNotesCollapsed = useCallback((entryId, fieldKey) => {
        const key = `${entryId}:${fieldKey}`;
        return !!libraryNotesCollapsed[key];
    }, [libraryNotesCollapsed]);

    const toggleLibraryNotesCollapsed = useCallback((entryId, fieldKey) => {
        const key = `${entryId}:${fieldKey}`;
        setLibraryNotesCollapsed(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    }, [extractLocalCacheRelPath]);

    const isLibrarySectionCollapsed = useCallback((entryId, sectionKey) => {
        const key = `${entryId}:${sectionKey}`;
        return !!librarySectionCollapsed[key];
    }, [librarySectionCollapsed]);

    const toggleLibrarySectionCollapsed = useCallback((entryId, sectionKey) => {
        const key = `${entryId}:${sectionKey}`;
        setLibrarySectionCollapsed(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    }, []);

    const addModelLibraryCustomParam = (entryId) => {
        if (!entryId) return;
        setModelLibrary(prev => prev.map((entry) => {
            if (entry.id !== entryId) return entry;
            const nextParams = Array.isArray(entry.customParams) ? [...entry.customParams] : [];
            if (nextParams.length >= MAX_CUSTOM_PARAMS) {
                showToast(`自定义参数最多 ${MAX_CUSTOM_PARAMS} 个`, 'warning', 2000);
                return entry;
            }
            nextParams.push({
                id: `param-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: '',
                values: [],
                override: false,
                notesEnabled: false,
                valueNotes: {},
                defaultValue: ''
            });
            return { ...entry, customParams: nextParams };
        }));
    };

    const updateModelLibraryCustomParam = (entryId, paramId, updates) => {
        if (!entryId || !paramId) return;
        setModelLibrary(prev => prev.map((entry) => {
            if (entry.id !== entryId) return entry;
            const nextParams = Array.isArray(entry.customParams) ? entry.customParams.map((param) => (
                param.id === paramId ? { ...param, ...updates } : param
            )) : [];
            return { ...entry, customParams: nextParams };
        }));
    };

    const deleteModelLibraryCustomParam = (entryId, paramId) => {
        if (!entryId || !paramId) return;
        setModelLibrary(prev => prev.map((entry) => {
            if (entry.id !== entryId) return entry;
            const nextParams = Array.isArray(entry.customParams)
                ? entry.customParams.filter((param) => param.id !== paramId)
                : [];
            return { ...entry, customParams: nextParams };
        }));
    };

    const updateModelLibraryEntry = (id, updates) => {
        if (!id) return;
        setModelLibrary(prev => prev.map(entry => entry.id === id ? { ...entry, ...updates } : entry));
    };

    const deleteModelLibraryEntry = (...args) => modelsActions.deleteModelLibraryEntry({
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
    }, ...args);

    const setApiModelEditing = useCallback((uid, enabled) => {
        if (!uid) return;
        setEditingApiModels(prev => {
            const next = new Set(prev);
            if (enabled) next.add(uid);
            else next.delete(uid);
            return next;
        });
    }, []);

    const setLibraryModelEditing = useCallback((id, enabled) => {
        if (!id) return;
        setEditingLibraryModels(prev => {
            const next = new Set(prev);
            if (enabled) next.add(id);
            else next.delete(id);
            return next;
        });
        if (enabled) {
            setCollapsedLibraryModels(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }, []);

    const toggleLibraryModelCollapse = useCallback((id) => {
        if (!id) return;
        setCollapsedLibraryModels(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleLibraryPreview = useCallback((id) => {
        if (!id) return;
        setLibraryPreviewModels(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
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
    }, []);

    const toggleLibraryAsyncPreview = useCallback((id) => {
        if (!id) return;
        setLibraryAsyncPreviewModels(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // V3.6.0: 添加新模型（简化格式）
    const addNewModel = () => {
        const uid = `uid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newConfig = {
            id: `new-model-${Date.now()}`,
            provider: 'openai',
            type: 'Chat',
            _uid: uid
        };
        setApiConfigs([...apiConfigs, newConfig]);
        setApiModelEditing(uid, true);
    };
    // V3.6.0: 更新模型配置，支持 id 变更
    const updateApiConfig = (uid, updates) => setApiConfigs((prev) => prev.map((c) => {
        if (c._uid === uid) {
            return { ...c, ...updates };
        }
        return c;
    }));
    const deleteApiConfig = (uid) => {
        setApiConfigs((prev) => prev.filter((c) => c._uid !== uid));
        setEditingApiModels(prev => {
            const next = new Set(prev);
            next.delete(uid);
            return next;
        });
    };

    const testApiConnection = async (modelKey) => {
        const config = getApiConfigByKey(modelKey);
        const statusKey = config?._uid || modelKey;
        setApiTesting(statusKey);
        setApiStatus((prev) => ({ ...prev, [statusKey]: 'idle' }));

        // V3.4.8: 使用 getApiCredentials 获取 Provider 配置
        const { key: apiKey, url: baseUrl } = getApiCredentials(modelKey);

        if (!apiKey) {
            setApiStatus((prev) => ({ ...prev, [statusKey]: 'error' }));
            setApiTesting(null);
            return;
        }

        try {
            const response = await fetch(`${baseUrl}/v1/models`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (response.ok) setApiStatus((prev) => ({ ...prev, [statusKey]: 'success' }));
            else setApiStatus((prev) => ({ ...prev, [statusKey]: 'error' }));
        } catch {
            setApiStatus((prev) => ({ ...prev, [statusKey]: 'error' }));
        }
        setApiTesting(null);
    };

    const getStatusColor = (modelId) => {
        if (!modelId) return 'bg-zinc-600';
        const status = apiStatus[modelId];
        if (status === 'success') return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]';
        if (status === 'error') return 'bg-red-500';
        // V3.4.8: 使用 getApiCredentials 检查是否有 key
        const { key } = getApiCredentials(modelId);
        return key ? 'bg-zinc-400' : 'bg-zinc-700';
    };

    const currentSession = useMemo(() => chatSessions.find(s => s.id === currentChatId) || chatSessions[0], [chatSessions, currentChatId]);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [currentSession?.messages, isChatOpen]);

    const createNewChat = () => {
        const newId = `chat-${Date.now()}`;
        const newSession = { id: newId, title: t('新对话'), messages: [] };
        setChatSessions(prev => [newSession, ...prev]);
        setCurrentChatId(newId);
    };

    const deleteChatSession = (e, id) => {
        e.stopPropagation();
        const newSessions = chatSessions.filter(s => s.id !== id);
        if (newSessions.length === 0) {
            const defaultSession = { id: 'default', title: t('新对话'), messages: [] };
            setChatSessions([defaultSession]);
            setCurrentChatId('default');
        } else {
            setChatSessions(newSessions);
            if (currentChatId === id) setCurrentChatId(newSessions[0].id);
        }
    };

    const appendChatFiles = useCallback((...args) => chatActions.appendChatFiles({
        setChatFiles,
    }, ...args), [setChatFiles]);

    const handleChatFileUpload = (e) => {
        appendChatFiles(e.target.files);
        e.target.value = '';
    };

    const removeChatFile = (index) => {
        setChatFiles(prev => prev.filter((_, i) => i !== index));
    };

    const extractImageUrlsFromText = (text) => {
        if (!text || typeof text !== 'string') return [];
        const urls = new Set();
        const markdownMatches = text.match(/!\[[^\]]*]\(([^)]+)\)/g) || [];
        markdownMatches.forEach((match) => {
            const inner = match.match(/\(([^)]+)\)/);
            if (inner?.[1]) urls.add(inner[1].trim());
        });
        const dataMatches = text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g) || [];
        dataMatches.forEach((match) => urls.add(match));
        const urlMatches = text.match(/https?:\/\/[^\s)]+/g) || [];
        urlMatches.forEach((match) => {
            const cleaned = match.replace(/[),.]+$/, '');
            if (cleaned.match(/\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|#|$)/i)) {
                urls.add(cleaned);
            }
        });
        return Array.from(urls);
    };

    const extractChatImageUrls = (...args) => chatActions.extractChatImageUrls({
        detectBase64ImageMime,
        extractImageUrlsFromText,
    }, ...args);

    const extractTransportTextContent = (payload, preferredPath = '') => {
        if (preferredPath) {
            const byPreferredPath = getValueByPathLoose(payload, preferredPath);
            if (typeof byPreferredPath === 'string') return byPreferredPath;
            if (Array.isArray(byPreferredPath)) {
                const joined = byPreferredPath
                    .map(item => (typeof item === 'string' ? item : ''))
                    .filter(Boolean)
                    .join('\n');
                if (joined) return joined;
            }
        }
        const directCandidates = [
            payload?.choices?.[0]?.delta?.content,
            payload?.choices?.[0]?.message?.content,
            payload?.delta?.content,
            payload?.message?.content,
            payload?.text,
            payload?.content,
            payload?.output_text,
            payload?.data?.text,
            payload?.data?.content
        ];
        for (const candidate of directCandidates) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate;
            }
        }
        return '';
    };

    const executeTransportRequest = (...args) => chatActions.executeTransportRequest({
        buildProxyUrl,
        extractTransportTextContent,
    }, ...args);

    const runRequestChain = (...args) => chatActions.runRequestChain({
        executeTransportRequest,
    }, ...args);

    const sendChatMessage = (...args) => chatActions.sendChatMessage({
        cloudDocument,
        canvasCloud,
        blobToDataURL,
        chatFiles,
        chatInput,
        chatModel,
        chatSessions,
        currentChatId,
        executeTransportRequest,
        extractChatImageUrls,
        getApiConfigByKey,
        getApiCredentials,
        getBase64FromUrl,
        getBlobFromUrl,
        getProxyPreferenceForUrl,
        isChatSending,
        providers,
        runRequestChain,
        setChatFiles,
        setChatInput,
        setChatSessions,
        setCurrentChatId,
        setHistory,
        setIsChatSending,
        setSettingsOpen,
    }, ...args);

    // 压缩/缩放图片用于Midjourney上传（Discord对图片有尺寸和大小限制）
    const prepareImageForMidjourneyUpload = (...args) => mediaActions.prepareImageForMidjourneyUpload({}, ...args);

    // 上传图片到Midjourney并获取HTTP URL（用于oref和sref指令）
    const uploadMidjourneyImages = (...args) => mediaActions.uploadMidjourneyImages({
        blobToDataURL,
        getBlobFromUrl,
        getProxyPreferenceForUrl,
        prepareImageForMidjourneyUpload,
    }, ...args);

    // 上传单个图片到图床并获取HTTP URL（用于Midjourney的oref和sref指令，以及拓展图片）
    const uploadImageToGetHttpUrl = (...args) => mediaActions.uploadImageToGetHttpUrl({
        getBase64FromUrl,
        resolveSpecialUrl,
    }, ...args);

    // 缩放图片到合理尺寸（用于Veo接口，避免图片过大）
    const resizeImageForVeo = (...args) => mediaActions.resizeImageForVeo({
        getBase64FromUrl,
        getBlobFromUrl,
        getProxyPreferenceForUrl,
    }, ...args);

    const disconnectConnection = useCallback((connectionId) => {
        saveToUndoStack();
        setConnections(prev => prev.filter(conn => conn.id !== connectionId));
    }, [saveToUndoStack]);

    const normalizeHistoryVideoUrl = (url, type) => {
        if (!url) return '';
        if (LocalImageManager.isImageId(url) || url.startsWith('asset://') || url.startsWith('blob:')) return url;
        if (type === 'video' && !isVideoUrl(url)) {
            return url + (url.includes('?') ? '&' : '?') + 'force_video_display=true';
        }
        return url;
    };

    const getHistoryDragPayload = (e) => {
        const rawPayload = e.dataTransfer.getData('application/x-tapnow-history');
        if (!rawPayload) return null;
        try {
            return JSON.parse(rawPayload);
        } catch (err) {
            console.warn('[Drag] Failed to parse history payload', err);
            return null;
        }
    };

    const exportApiModelConfig = useCallback((config) => {
        if (!config) return;
        const { _uid, key, url, isCustom, ...rest } = config;
        const payload = { ...rest };
        const rawName = payload.id || payload.modelName || 'model';
        const safeName = String(rawName).replace(/[^\w.-]+/g, '_');
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const fileName = `tapnow-model-${safeName}.json`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
    }, []);
    const exportModelLibraryEntry = useCallback((entry) => {
        if (!entry) return;
        const normalized = normalizeModelLibraryEntry(entry);
        if (!normalized) return;
        const safeName = String(normalized.id || 'model').replace(/[^\w.-]+/g, '_');
        const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
        const fileName = `tapnow-model-library-${safeName}.json`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('模型库模型已导出', 'success', 2000);
    }, [showToast]);

    const importApiModelConfigs = useCallback((...args) => modelsActions.importApiModelConfigs({
        setApiConfigs,
        showToast,
    }, ...args), [showToast]);
    const importModelLibraryEntries = useCallback(() => {
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
                    : Array.isArray(data?.modelLibrary)
                        ? data.modelLibrary
                        : [data];
                const normalized = rawList
                    .map((entry, idx) => normalizeModelLibraryEntry(entry, idx))
                    .filter(Boolean);
                if (normalized.length === 0) {
                    showToast('未识别到可导入的模型库配置', 'warning', 2000);
                    return;
                }
                setModelLibrary((prev) => {
                    const existingIds = new Set(prev.map(item => item.id));
                    const next = [...prev];
                    normalized.forEach((entry) => {
                        let id = entry.id;
                        if (existingIds.has(id)) {
                            id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
                        }
                        existingIds.add(id);
                        next.push({ ...entry, id });
                    });
                    return next;
                });
                showToast('模型库导入完成', 'success', 2000);
            } catch (err) {
                showToast('模型库导入失败：JSON 无效', 'error', 2000);
            }
        };
        input.click();
    }, [showToast]);

    const resolveHistoryPayloadUrl = useCallback((payload, specificUrl = null) => {
        if (!payload) return '';
        const candidates = [specificUrl, payload.url, payload.originalUrl, payload.mjOriginalUrl]
            .filter((url) => typeof url === 'string' && url);
        const historyItem = payload.itemId ? historyMap.get(payload.itemId) : null;
        if (historyItem) {
            for (const url of candidates) {
                const resolved = resolveAssetChannelUrl(resolveHistoryUrl(historyItem, url), { historyItem });
                if (resolved) return resolved;
            }
            const fallback = resolveAssetChannelUrl(resolveHistoryUrl(historyItem), { historyItem });
            if (fallback) return fallback;
        }
        for (const url of candidates) {
            const resolved = resolveAssetChannelUrl(url);
            if (resolved) return resolved;
        }
        return '';
    }, [historyMap, resolveHistoryUrl, resolveAssetChannelUrl]);

    const resolveHistoryPayloadImages = useCallback((payload) => {
        if (!payload || !Array.isArray(payload.mjImages) || payload.mjImages.length === 0) return null;
        const historyItem = payload.itemId ? historyMap.get(payload.itemId) : null;
        const resolved = historyItem
            ? payload.mjImages.map((url) => resolveAssetChannelUrl(resolveHistoryUrl(historyItem, url), { historyItem }))
            : payload.mjImages.map((url) => resolveAssetChannelUrl(url));
        const filtered = resolved.filter(Boolean);
        return filtered.length > 0 ? filtered : null;
    }, [historyMap, resolveHistoryUrl, resolveAssetChannelUrl]);

    const resolveDroppedUrlCandidate = useCallback((url, type = null) => {
        const normalized = resolveAssetChannelUrl(url);
        if (!normalized) return '';
        return normalizeHistoryVideoUrl(normalized, type);
    }, [resolveAssetChannelUrl]);

    const rewriteAssetRouteValue = useCallback((value) => {
        if (typeof value === 'string') {
            const next = resolveAssetChannelUrl(value);
            return next || '';
        }
        if (Array.isArray(value)) {
            let changed = false;
            const mapped = value.map((entry) => {
                const next = rewriteAssetRouteValue(entry);
                if (next !== entry) changed = true;
                return next;
            });
            return changed ? mapped : value;
        }
        if (!value || typeof value !== 'object') return value;
        let changed = false;
        let nextObj = value;
        Object.keys(value).forEach((key) => {
            const current = value[key];
            const next = rewriteAssetRouteValue(current);
            if (next === current) return;
            if (!changed) nextObj = { ...value };
            nextObj[key] = next;
            changed = true;
        });
        return changed ? nextObj : value;
    }, [resolveAssetChannelUrl]);

    useEffect(() => {
        setNodes((prev) => {
            let changed = false;
            const next = prev.map((node) => {
                const sanitized = rewriteAssetRouteValue(node);
                if (sanitized !== node) changed = true;
                return sanitized;
            });
            return changed ? next : prev;
        });
        setChatFiles((prev) => {
            let changed = false;
            const next = prev.map((file) => {
                if (!file || typeof file !== 'object') return file;
                const nextContent = rewriteAssetRouteValue(file.content);
                if (nextContent === file.content) return file;
                changed = true;
                return { ...file, content: nextContent };
            });
            return changed ? next : prev;
        });
    }, [localCacheEnabled, localCacheActive, localCacheIndexTick, cacheRefreshTick, rewriteAssetRouteValue]);

    const getDragUrlCandidate = (e) => {
        const uriList = e.dataTransfer.getData('text/uri-list') || '';
        const uriCandidate = uriList.split('\n').find(line => line && !line.startsWith('#')) || '';
        const plainText = e.dataTransfer.getData('text/plain') || '';
        const urlCandidate = (uriCandidate || plainText).trim();
        if (!urlCandidate) return '';
        if (/^(https?:|data:image\/|data:video\/|blob:|file:)/i.test(urlCandidate)) return urlCandidate;
        return '';
    };

    const handleDrop = (...args) => nodesActions.handleDrop({
        getDragUrlCandidate,
        getHistoryDragPayload,
        resolveDroppedUrlCandidate,
        resolveHistoryPayloadUrl,
        resolveUrlForMediaMeta,
        saveToUndoStack,
        setNodes,
    }, ...args);

    const appendReferenceImagesToNode = useCallback(async (nodeId, files) => {
        const node = nodesMap.get(nodeId);
        if (!node) return;
        const imageFiles = Array.from(files || []).filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        const newImages = await Promise.all(imageFiles.map((file) => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
        })));

        updateNodeSettings(nodeId, {
            referenceImages: [...(node.settings?.referenceImages || []), ...newImages]
        });
    }, [nodesMap, updateNodeSettings]);

    const handleDescReferenceDrop = (nodeId, e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('drag-over');
        if (e.dataTransfer?.files?.length) {
            appendReferenceImagesToNode(nodeId, e.dataTransfer.files);
        }
    };

    const handleDescReferenceSelect = (nodeId, e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            appendReferenceImagesToNode(nodeId, files);
        }
        e.target.value = '';
    };

    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over'); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over'); };

    const handlePreviewDrop = (nodeId, e) => {
        e.preventDefault();
        e.stopPropagation();
        const payload = getHistoryDragPayload(e);
        let dragUrl = '';
        let previewImages = null;
        let previewType = 'image';

        if (payload) {
            dragUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            if (payload.mjImages && payload.mjImages.length > 1) {
                previewImages = resolveHistoryPayloadImages(payload);
                const selectedIndex = payload.selectedIndex ?? 0;
                const candidate = previewImages && previewImages[selectedIndex] ? previewImages[selectedIndex] : (previewImages ? previewImages[0] : '');
                dragUrl = candidate || dragUrl;
            }
            if (payload.type === 'video' || isVideoUrl(dragUrl)) previewType = 'video';
        }

        if (!dragUrl) {
            const candidate = getDragUrlCandidate(e);
            if (candidate) {
                dragUrl = resolveDroppedUrlCandidate(candidate);
                previewType = isVideoUrl(dragUrl) ? 'video' : 'image';
            }
        }

        if (!dragUrl) return;

        setNodes(prev => prev.map(n =>
            n.id === nodeId
                ? { ...n, content: dragUrl, previewSourceNodeId: null, previewType, previewMjImages: previewImages }
                : n
        ));
    };

    const handleCanvasDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleCanvasDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.id !== 'canvas-bg') return;

        const payload = getHistoryDragPayload(e);
        let dragUrl = '';
        let isVideo = false;
        if (payload) {
            dragUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            isVideo = payload.type === 'video' || isVideoUrl(dragUrl);
        }
        if (!dragUrl) {
            const candidate = getDragUrlCandidate(e);
            if (candidate) {
                dragUrl = resolveDroppedUrlCandidate(candidate);
                isVideo = isVideoUrl(dragUrl);
            }
        }
        if (!dragUrl) return;

        const world = screenToWorld(e.clientX, e.clientY);
        if (isVideo) {
            addNode('video-input', world.x, world.y, null, dragUrl);
            return;
        }

        let dims = undefined;
        try {
            const real = await getImageDimensions(dragUrl);
            if (real?.w && real?.h) dims = { w: real.w, h: real.h };
        } catch { }
        addNode('input-image', world.x, world.y, null, dragUrl, dims);
    };

    const handleChatDrop = (...args) => nodesActions.handleChatDrop({
        appendChatFiles,
        getDragUrlCandidate,
        getHistoryDragPayload,
        resolveDroppedUrlCandidate,
        resolveHistoryPayloadUrl,
        setChatFiles,
        setIsChatOpen,
    }, ...args);

    // 将HTML表格转换为Markdown表格格式
    const convertTableToMarkdown = (table) => {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) return '';

        const markdownRows = rows.map((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            const cellTexts = cells.map(cell => {
                const text = cell.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
                return text || ' ';
            });
            return '| ' + cellTexts.join(' | ') + ' |';
        });

        // 添加分隔行（第二行）
        if (markdownRows.length > 0) {
            const firstRowCells = markdownRows[0].split('|').filter(c => c.trim()).length - 2;
            const separator = '| ' + Array(firstRowCells).fill('---').join(' | ') + ' |';
            markdownRows.splice(1, 0, separator);
        }

        return '\n' + markdownRows.join('\n') + '\n';
    };

    // 优化后的复制粘贴逻辑
    useEffect(() => {
        // 复制功能（Ctrl+C / Cmd+C）
        const handleCopy = async (e) => {
            if (canvasDialogStore.getSnapshot()) return;
            const target = e.target;
            const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            // 优先级1：文本输入框 - 如果有选中文本，使用浏览器默认行为
            if (isTextInput) {
                const selection = window.getSelection();
                if (selection && selection.toString().trim()) {
                    // 有选中文本，让浏览器默认处理
                    return;
                }
                // 没有选中文本，不触发任何动作
                e.preventDefault();
                return;
            }

            // 优先级2和3：节点复制（包括所有类型的节点）
            const currentSelectedId = selectedNodeIdRef.current;
            const currentSelectedIds = selectedNodeIdsRef.current;
            const selectedIds = currentSelectedId ? [currentSelectedId] : (currentSelectedIds && currentSelectedIds.size > 0 ? Array.from(currentSelectedIds) : []);

            if (selectedIds.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const selectedNodes = nodesRef.current.filter(n => selectedIds.includes(n.id));
                const relatedConnections = connectionsRef.current.filter(c =>
                    selectedIds.includes(c.from) || selectedIds.includes(c.to)
                );

                // 只保存选中的节点之间的连接
                const internalConnections = relatedConnections.filter(c =>
                    selectedIds.includes(c.from) && selectedIds.includes(c.to)
                );

                copiedNodesRef.current = {
                    nodes: selectedNodes.map(n => ({ ...n })),
                    connections: internalConnections.map(c => ({ ...c })),
                    timestamp: Date.now()
                };

                // 可选：给用户反馈
            }
        };

        // 粘贴功能（Ctrl+V / Cmd+V）
        const handlePaste = async (e) => {
            if (canvasDialogStore.getSnapshot()) return;
            const target = e.target;
            const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            // 优先级1：文本输入框 - 使用浏览器默认行为
            if (isTextInput) {
                // 让浏览器默认处理文本粘贴
                return;
            }

            // 优先级2：图像节点截图粘贴
            const currentSelectedId = selectedNodeIdRef.current;
            let targetNode = null;
            if (currentSelectedId) {
                targetNode = nodesRef.current.find(n => n.id === currentSelectedId);
            }
            // 如果选中了图像或视频节点，尝试粘贴图像/视频
            if (targetNode && (targetNode.type === 'input-image' || targetNode.type === 'video-input')) {
                const items = Array.from(e.clipboardData.items);
                const imageItem = items.find(item => item.type.startsWith('image/'));
                const videoItem = items.find(item => item.type.startsWith('video/'));

                if (imageItem && targetNode.type === 'input-image') {
                    e.preventDefault();
                    const file = imageItem.getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                            const content = ev.target.result;
                            let dimensions = { w: 0, h: 0 };
                            try {
                                dimensions = await getImageDimensions(content);
                            } catch (e) { }
                            // V3.4.7: 保存撤销状态（图片粘贴是可撤销的操作）
                            saveToUndoStack();
                            setNodes((prev) => prev.map((n) =>
                                n.id === targetNode.id
                                    ? { ...n, content: content, dimensions }
                                    : n
                            ));
                        };
                        reader.readAsDataURL(file);
                    }
                    return;
                } else if (videoItem && targetNode.type === 'video-input') {
                    e.preventDefault();
                    const file = videoItem.getAsFile();
                    if (file) {
                        handleVideoFileUpload(targetNode.id, file);
                    }
                    return;
                }
            }

            // 优先级3：节点粘贴
            if (copiedNodesRef.current && copiedNodesRef.current.nodes && copiedNodesRef.current.nodes.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const copied = copiedNodesRef.current;

                // 计算粘贴位置：使用视图中心或鼠标位置
                const canvasElement = canvasRef.current;
                let pasteX = 0, pasteY = 0;
                if (canvasElement) {
                    const rect = canvasElement.getBoundingClientRect();
                    const centerX = (rect.left + rect.width / 2 - view.x) / view.zoom;
                    const centerY = (rect.top + rect.height / 2 - view.y) / view.zoom;
                    pasteX = centerX;
                    pasteY = centerY;
                }

                // 计算原节点的中心点
                const originalNodes = copied.nodes;
                if (originalNodes.length === 0) return;

                const minX = Math.min(...originalNodes.map(n => n.x || 0));
                const minY = Math.min(...originalNodes.map(n => n.y || 0));
                const maxX = Math.max(...originalNodes.map(n => (n.x || 0) + (n.width || 0)));
                const maxY = Math.max(...originalNodes.map(n => (n.y || 0) + (n.height || 0)));
                const originalCenterX = (minX + maxX) / 2;
                const originalCenterY = (minY + maxY) / 2;

                // 计算偏移量，使新节点中心对齐到粘贴位置
                const offsetX = pasteX - originalCenterX;
                const offsetY = pasteY - originalCenterY;

                // 创建新节点ID映射
                const idMap = new Map();
                const baseTime = Date.now();
                copied.nodes.forEach((node, index) => {
                    const newId = `node-${baseTime}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                    idMap.set(node.id, newId);
                });

                // 创建新节点
                const newNodes = copied.nodes.map(node => ({
                    ...node,
                    id: idMap.get(node.id),
                    x: node.x + offsetX,
                    y: node.y + offsetY
                }));

                // 创建新连接（只保留两个端点都在新节点中的连接）
                const newConnections = (copied.connections || [])
                    .filter(conn => conn && idMap.has(conn.from) && idMap.has(conn.to))
                    .map((conn, index) => ({
                        ...conn,
                        id: `conn-${baseTime}-${index}-${Math.random().toString(36).substr(2, 9)}`,
                        from: idMap.get(conn.from),
                        to: idMap.get(conn.to)
                    }));


                // V3.4.7: 保存撤销状态（粘贴节点是可撤销的操作）
                saveToUndoStack();
                setNodes(prev => [...prev, ...newNodes]);
                setConnections(prev => [...prev, ...newConnections]);

                // 选中粘贴的节点
                if (newNodes.length === 1) {
                    setSelectedNodeId(newNodes[0].id);
                    setSelectedNodeIds(new Set([newNodes[0].id]));
                } else if (newNodes.length > 1) {
                    setSelectedNodeId(null);
                    setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
                }

            }
        };

        // 添加keydown事件监听，确保Ctrl+V/Cmd+V能触发节点粘贴
        const handleKeyDown = (e) => {
            if (canvasDialogStore.getSnapshot()) return;
            const target = e.target;
            const isTextInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            // 如果不在文本输入框中，且按下了Ctrl+V或Cmd+V
            if (!isTextInput && (e.ctrlKey || e.metaKey) && e.key === 'v') {
                // 先检查是否选中了图像节点，如果是，让paste事件处理图像粘贴
                const currentSelectedId = selectedNodeIdRef.current;
                if (currentSelectedId) {
                    const targetNode = nodesRef.current.find(n => n.id === currentSelectedId);
                    if (targetNode && (targetNode.type === 'input-image' || targetNode.type === 'video-input')) {
                        // 选中了图像节点，让paste事件处理，不在这里处理
                        return;
                    }
                }

                // 检查是否有复制的节点
                if (copiedNodesRef.current && copiedNodesRef.current.nodes && copiedNodesRef.current.nodes.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    // 直接调用粘贴逻辑
                    const copied = copiedNodesRef.current;

                    // 计算粘贴位置：使用视图中心
                    const canvasElement = canvasRef.current;
                    let pasteX = 0, pasteY = 0;
                    if (canvasElement) {
                        const rect = canvasElement.getBoundingClientRect();
                        const centerX = (rect.left + rect.width / 2 - view.x) / view.zoom;
                        const centerY = (rect.top + rect.height / 2 - view.y) / view.zoom;
                        pasteX = centerX;
                        pasteY = centerY;
                    }

                    // 计算原节点的中心点
                    const originalNodes = copied.nodes;
                    if (originalNodes.length === 0) return;

                    const minX = Math.min(...originalNodes.map(n => n.x || 0));
                    const minY = Math.min(...originalNodes.map(n => n.y || 0));
                    const maxX = Math.max(...originalNodes.map(n => (n.x || 0) + (n.width || 0)));
                    const maxY = Math.max(...originalNodes.map(n => (n.y || 0) + (n.height || 0)));
                    const originalCenterX = (minX + maxX) / 2;
                    const originalCenterY = (minY + maxY) / 2;

                    // 计算偏移量
                    const offsetX = pasteX - originalCenterX;
                    const offsetY = pasteY - originalCenterY;

                    // 创建新节点ID映射
                    const idMap = new Map();
                    const baseTime = Date.now();
                    copied.nodes.forEach((node, index) => {
                        const newId = `node-${baseTime}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                        idMap.set(node.id, newId);
                    });

                    // 创建新节点
                    const newNodes = copied.nodes.map(node => ({
                        ...node,
                        id: idMap.get(node.id),
                        x: node.x + offsetX,
                        y: node.y + offsetY
                    }));

                    // 创建新连接（只保留两个端点都在新节点中的连接）
                    const newConnections = (copied.connections || [])
                        .filter(conn => conn && idMap.has(conn.from) && idMap.has(conn.to))
                        .map((conn, index) => ({
                            ...conn,
                            id: `conn-${baseTime}-${index}-${Math.random().toString(36).substr(2, 9)}`,
                            from: idMap.get(conn.from),
                            to: idMap.get(conn.to)
                        }));

                    // V3.4.7: 保存撤销状态（粘贴节点是可撤销的操作）
                    saveToUndoStack();
                    setNodes(prev => [...prev, ...newNodes]);
                    setConnections(prev => [...prev, ...newConnections]);

                    // 选中粘贴的节点
                    if (newNodes.length === 1) {
                        setSelectedNodeId(newNodes[0].id);
                        setSelectedNodeIds(new Set([newNodes[0].id]));
                    } else if (newNodes.length > 1) {
                        setSelectedNodeId(null);
                        setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
                    }

                }
            }
        };

        window.addEventListener('copy', handleCopy);
        window.addEventListener('paste', handlePaste);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('copy', handleCopy);
            window.removeEventListener('paste', handlePaste);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [updateNodeSettings, handleVideoFileUpload, setNodes, setConnections, setSelectedNodeId, setSelectedNodeIds, view]);

    const pollVeoJob = (...args) => pollingActions.pollVeoJob({
        historyMap,
        pollVeoJob,
        setHistory,
        storyboardTaskMapRef,
        updatePreviewFromTask,
        updateShot,
    }, ...args);

    const pollSoraJob = (...args) => pollingActions.pollSoraJob({
        historyMap,
        pollSoraJob,
        setHistory,
        storyboardTaskMapRef,
        updatePreviewFromTask,
        updateShot,
    }, ...args);

    // 切割Midjourney返回的4张图（2x2网格）
    // 压缩图片以减少存储大小
    const compressImage = (dataUrl, maxWidth = 1024, quality = 0.8) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 计算压缩后的尺寸
                let width = img.width;
                let height = img.height;
                if (width > maxWidth || height > maxWidth) {
                    const scale = maxWidth / Math.max(width, height);
                    width = Math.floor(width * scale);
                    height = Math.floor(height * scale);
                }

                canvas.width = width;
                canvas.height = height;

                // 绘制并压缩
                ctx.drawImage(img, 0, 0, width, height);
                // 使用JPEG格式压缩，减少文件大小
                const compressed = canvas.toDataURL('image/jpeg', quality);
                resolve(compressed);
            };
            img.onerror = () => resolve(dataUrl); // 如果压缩失败，返回原图
            img.src = dataUrl;
        });
    };

    const splitMidjourneyImage = (...args) => pollingActions.splitMidjourneyImage({}, ...args);

    // 异步图像生成任务轮询函数
    const pollImageTask = (...args) => pollingActions.pollImageTask({
        consumeImageBatchFailure,
        consumeImageBatchSuccess,
        normalizeImageUrls,
        pollImageTask,
        setHistory,
        storyboardTaskMapRef,
        updatePreviewFromTask,
        updateShot,
    }, ...args);

    const buildAsyncRequest = (...args) => pollingActions.buildAsyncRequest({
        buildProxyUrl,
    }, ...args);

    const pollAsyncTask = (...args) => pollingActions.pollAsyncTask({
        buildAsyncRequest,
        consumeImageBatchFailure,
        consumeImageBatchSuccess,
        normalizeImageUrls,
        pollAsyncTask,
        setHistory,
        storyboardTaskMapRef,
        updatePreviewFromTask,
        updateShot,
    }, ...args);

    // ModelScope 异步任务轮询函数
    const pollModelScopeTask = (...args) => pollingActions.pollModelScopeTask({
        buildProxyUrl,
        consumeImageBatchFailure,
        consumeImageBatchSuccess,
        normalizeImageUrls,
        pollModelScopeTask,
        setHistory,
        storyboardTaskMapRef,
        updatePreviewFromTask,
        updateShot,
    }, ...args);

    // Midjourney任务轮询函数
    const pollMidjourneyJob = (...args) => pollingActions.pollMidjourneyJob({
        pollMidjourneyJob,
        setHistory,
        setNodes,
        splitMidjourneyImage,
        updatePreviewFromTask,
    }, ...args);

    // 处理蒙版用于 Inpainting：将"透明背景上的白色笔触"转换为"白色背景上的透明区域"
    const processMaskForInpainting = async (maskContent) => {
        if (!maskContent) return null;

        try {
            // 加载蒙版图片
            const maskImg = new Image();
            maskImg.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                maskImg.onload = resolve;
                maskImg.onerror = reject;
                maskImg.src = maskContent;
            });

            // 创建新 Canvas
            const canvas = document.createElement('canvas');
            canvas.width = maskImg.width;
            canvas.height = maskImg.height;
            const ctx = canvas.getContext('2d');

            // 填充黑色背景（代表保留区域，不透明 Alpha=1）
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 使用 destination-out 混合模式：绘制原蒙版，将用户涂抹的区域"挖空"变成透明（代表重绘区域，Alpha=0）
            ctx.globalCompositeOperation = 'destination-out';
            ctx.drawImage(maskImg, 0, 0);

            // 将 Canvas 转换为 Blob（PNG 格式保留透明度）
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('蒙版转换失败'));
                    }
                }, 'image/png');
            });
        } catch (error) {
            console.error('[Inpainting] 蒙版处理失败:', error);
            return null;
        }
    };

    const canvasCloud = useCanvasCloud({
        theme,
        document: cloudDocument, models: cloudModels, capabilities: cloudCapabilities, textModels: cloudTextModels, onRefreshCloudModels, nodes, connections, view, projectName, workspaceId, historyVisible: historyOpen,
        onExportLocal: () => handleSaveProject(),
        onCloudDocumentApplied: () => { setUndoStack([]); setRedoStack([]); setSelectedNodeId(null); setSelectedNodeIds(new Set()); },
        setNodes, setConnections, setView, setProjectName,
        resolveMedia: async (value) => {
            if (LocalImageManager.isImageId(value)) return await LocalImageManager.getImage(value);
            return await resolveSpecialUrl(value);
        }
    });
    const startGeneration = (...args) => generationActions.startGeneration({
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
    }, ...args);

    const handleToggleTheme = () => {
        setTheme((prev) => {
            if (prev === 'dark') return 'light';
            if (prev === 'light') return 'solarized';
            return 'dark';
        });
    };

    const getDataUrlFromUrl = async (url, options = {}) => {
        if (!url) return url;
        if (url.startsWith('data:')) return url;
        const cachedUrl = localCacheActive
            ? (historyLocalCacheMap.get(url)
                || (cachedHistoryUrlRef.current.has(url) ? cachedHistoryUrlRef.current.get(url) : null))
            : null;
        const resolvedUrl = cachedUrl || url;
        const useProxy = getProxyPreferenceForUrl(resolvedUrl, options.useProxy === true);
        const blob = await getBlobFromUrl(resolvedUrl, { useProxy });
        return await blobToDataURL(blob);
    };

    // 功能1：批量下载选中的图片/视频节点
    const handleBatchDownload = (...args) => projectsActions.handleBatchDownload({
        getBlobFromUrl,
        getProxyPreferenceForUrl,
        nodesRef,
        selectedNodeIdRef,
        selectedNodeIdsRef,
    }, ...args);

    // 获取东八区时间戳（用于项目数据）
    const getCSTTimestamp = () => {
        const now = new Date();
        // 获取UTC时间并加上8小时（东八区）
        const cstTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        return cstTime.toISOString();
    };

    // 获取东八区时间戳（用于文件名）
    const getCSTFilenameTimestamp = () => {
        const now = new Date();
        const cstTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const year = cstTime.getUTCFullYear();
        const month = String(cstTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(cstTime.getUTCDate()).padStart(2, '0');
        const hours = String(cstTime.getUTCHours()).padStart(2, '0');
        const minutes = String(cstTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(cstTime.getUTCSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
    };

    const isLikelyAssetUrl = (value) => {
        if (!value || typeof value !== 'string') return false;
        if (LocalImageManager.isImageId(value) || value.startsWith('asset://')) return true;
        if (value.startsWith('data:image/') || value.startsWith('data:video/') || value.startsWith('data:audio/')) return true;
        if (value.startsWith('blob:')) return true;
        return /\.(png|jpg|jpeg|webp|gif|mp4|webm|mov|mp3|wav|ogg|m4a)(\?|$)/i.test(value);
    };
    const collectAssetUrlsFromObject = (obj, collector) => {
        if (!obj) return;
        if (typeof obj === 'string') {
            if (isLikelyAssetUrl(obj)) collector.add(obj);
            return;
        }
        if (Array.isArray(obj)) {
            obj.forEach((item) => collectAssetUrlsFromObject(item, collector));
            return;
        }
        if (typeof obj === 'object') {
            Object.values(obj).forEach((val) => collectAssetUrlsFromObject(val, collector));
        }
    };
    const replaceAssetUrlsInObject = (obj, assetMap) => {
        if (!obj) return obj;
        if (typeof obj === 'string') {
            const mapped = assetMap.get(obj);
            return mapped ? `asset://${mapped}` : obj;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => replaceAssetUrlsInObject(item, assetMap));
        }
        if (typeof obj === 'object') {
            const next = {};
            Object.entries(obj).forEach(([key, val]) => {
                next[key] = replaceAssetUrlsInObject(val, assetMap);
            });
            return next;
        }
        return obj;
    };

    const saveProjectAsBundle = async (projectData, options = {}) => {
        const zip = new JSZip();
        const assetMap = new Map();
        const assetManifest = {};
        const assetFolder = 'assets';
        const progress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const historyItems = Array.isArray(options.historyItems) ? options.historyItems : history;
        const assetCandidates = new Set();
        const trackCandidate = (url) => {
            if (!url || typeof url !== 'string') return;
            assetCandidates.add(url);
        };
        historyItems.forEach((item) => {
            if (!item) return;
            if (Array.isArray(item.mjImages)) item.mjImages.forEach(trackCandidate);
            if (Array.isArray(item.output_images)) item.output_images.forEach(trackCandidate);
            [item.url, item.originalUrl, item.mjOriginalUrl, item.thumbnailUrl, item.localCacheUrl].forEach(trackCandidate);
            if (item.localCacheMap) {
                Object.keys(item.localCacheMap).forEach(trackCandidate);
            }
        });
        collectAssetUrlsFromObject(projectData.nodes, assetCandidates);
        collectAssetUrlsFromObject(projectData.characterLibrary, assetCandidates);
        collectAssetUrlsFromObject(projectData.chatSessions, assetCandidates);
        const totalAssets = Math.max(assetCandidates.size, 1);
        let processedCount = 0;
        const processedUrls = new Set();
        const reportProgress = () => {
            if (!progress) return;
            progress({ current: processedCount, total: totalAssets, filename: options.filename || '' });
        };
        reportProgress();
        let assetIndex = 0;
        const addAsset = async (sourceUrl, resolvedUrl, meta = {}) => {
            if (!sourceUrl || assetMap.has(sourceUrl) || processedUrls.has(sourceUrl)) return;
            processedUrls.add(sourceUrl);
            processedCount = processedUrls.size;
            reportProgress();
            const fetchUrl = resolvedUrl || sourceUrl;
            try {
                let blob;
                if (fetchUrl.startsWith('data:')) {
                    blob = dataUrlToBlob(fetchUrl);
                } else {
                    const { blob: fetched } = await fetchCacheSource(fetchUrl, {
                        useProxy: meta.useProxy === true,
                        preferLocal: true
                    });
                    blob = fetched;
                }
                if (!blob || blob.size === 0) throw new Error('素材文件为空');
                const extFromUrl = getUrlExt(fetchUrl, '');
                const extFromData = fetchUrl.startsWith('data:') ? getDataUrlExt(fetchUrl, '') : '';
                const ext = (extFromData || extFromUrl || (blob.type ? `.${blob.type.split('/')[1]}` : '')) || (meta.type === 'video' ? '.mp4' : '.png');
                const baseId = sanitizeCacheId(meta.cacheId || getCacheIdFromUrl(sourceUrl, meta.itemId || 'asset')) || `asset_${assetIndex++}`;
                const filename = `${baseId}_${assetIndex++}${meta.suffix || ''}${ext}`;
                const assetPath = `${assetFolder}/${filename}`;
                zip.file(assetPath, blob);
                assetMap.set(sourceUrl, assetPath);
                assetManifest[sourceUrl] = assetPath;
                if (resolvedUrl && resolvedUrl !== sourceUrl) {
                    assetMap.set(resolvedUrl, assetPath);
                    assetManifest[resolvedUrl] = assetPath;
                }
            } catch (e) {
                throw new Error(`素材打包失败，未生成不完整的工程文件：${e?.message || e}`);
            }
        };

        // 1) 历史记录资产
        for (const item of historyItems) {
            if (!item) continue;
            const baseProxy = getItemProxyPreference(item);
            const addFromList = async (list, suffixPrefix = '') => {
                if (!Array.isArray(list)) return;
                for (let i = 0; i < list.length; i++) {
                    const rawUrl = list[i];
                    if (!rawUrl || typeof rawUrl !== 'string') continue;
                    const resolved = resolveHistoryUrl(item, rawUrl) || rawUrl;
                    const useProxy = getProxyPreferenceForUrl(resolved, baseProxy);
                    await addAsset(rawUrl, resolved, { useProxy, itemId: item.id, cacheId: getCacheIdFromUrl(rawUrl, item.id), suffix: suffixPrefix ? `${suffixPrefix}${i + 1}` : `_${i + 1}`, type: item.type });
                }
            };
            await addFromList(item.mjImages, '_mj_');
            await addFromList(item.output_images, '_out_');
            const singleUrls = [item.url, item.originalUrl, item.mjOriginalUrl, item.thumbnailUrl, item.localCacheUrl].filter(Boolean);
            for (const rawUrl of singleUrls) {
                const resolved = resolveHistoryUrl(item, rawUrl) || rawUrl;
                const useProxy = getProxyPreferenceForUrl(resolved, baseProxy);
                await addAsset(rawUrl, resolved, { useProxy, itemId: item.id, cacheId: getCacheIdFromUrl(rawUrl, item.id), type: item.type });
            }
            if (item.localCacheMap) {
                for (const [rawUrl, cacheUrl] of Object.entries(item.localCacheMap)) {
                    const useProxy = getProxyPreferenceForUrl(cacheUrl, baseProxy);
                    await addAsset(rawUrl, cacheUrl, { useProxy, itemId: item.id, cacheId: getCacheIdFromUrl(rawUrl, item.id), type: item.type });
                }
            }
        }

        // 2) 节点与角色库资产（兜底扫描）
        const genericAssets = new Set();
        collectAssetUrlsFromObject(projectData.nodes, genericAssets);
        collectAssetUrlsFromObject(projectData.characterLibrary, genericAssets);
        collectAssetUrlsFromObject(projectData.chatSessions, genericAssets);
        for (const rawUrl of genericAssets) {
            if (!rawUrl) continue;
            await addAsset(rawUrl, rawUrl, { useProxy: false, cacheId: getCacheIdFromUrl(rawUrl, 'node'), type: isVideoUrl(rawUrl) ? 'video' : 'image' });
        }

        // 3) 写入 project.json（资产 URL 替换为 asset://）
        const bundleProjectData = replaceAssetUrlsInObject(projectData, assetMap);
        bundleProjectData.assetBundle = true;
        bundleProjectData.assetManifest = assetManifest;

        zip.file('project.json', JSON.stringify(bundleProjectData, (key, value) => (value === undefined ? null : value), 2));
        zip.file('manifest.json', JSON.stringify({ assets: assetManifest }, null, 2));

        const content = await zip.generateAsync({ type: 'blob', streamFiles: true });
        const timestamp = getCSTFilenameTimestamp();
        const bundleName = `${projectName || '未命名项目'}_${timestamp}.zip`;
        if (options.handle) {
            const writable = await options.handle.createWritable();
            await writable.write(content);
            await writable.close();
        } else {
            saveAs(content, bundleName);
        }
        return bundleName;
    };

    const clearAutoSaveStorage = useCallback(async () => {
        try { localStorage.removeItem(AUTOSAVE_LOCAL_KEY); } catch (e) { }
        try { writeAutoSaveMeta(null); } catch (e) { }
        try {
            const db = await openAutoSaveDb();
            await new Promise((resolve) => {
                const tx = db.transaction(AUTOSAVE_IDB_STORE, 'readwrite');
                const store = tx.objectStore(AUTOSAVE_IDB_STORE);
                const req = store.delete(AUTOSAVE_IDB_KEY);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
                tx.oncomplete = () => db.close();
                tx.onerror = () => db.close();
            });
        } catch (e) { }
    }, []);

    const resetProjectState = useCallback(async (options = {}) => {
        setNodes([]);
        setConnections([]);
        setHistory([]);
        setHistorySelection(new Set());
        setSelectedNodeId(null);
        setSelectedNodeIds(new Set());
        setUndoStack([]);
        setRedoStack([]);
        setLightboxItem(null);
        setProjectName('未命名项目');
        setView({ ...DEFAULT_VIEW });
        setChatSessions([{ id: 'default', title: t('新对话'), messages: [] }]);
        setCurrentChatId('default');
        setChatInput('');
        setChatFiles([]);
        setCharacterLibrary([]);
        setBatchQueue([]);
        setBatchGroups([]);
        if (!options.keepAssetBundle) resetAssetBundleState();
        if (!options.keepAutoSave) await clearAutoSaveStorage();
        try { localStorage.removeItem('tapnow_project_name'); } catch (e) { }
    }, [resetAssetBundleState, clearAutoSaveStorage]);

    // 功能5：保存项目到JSON文件（流式写入，支持超大文件）
    const handleSaveProject = (...args) => projectsActions.handleSaveProject({
        blobToDataURL,
        characterLibrary,
        chatSessions,
        compactHistoryItemForStorage,
        connections,
        fetchCacheSource,
        getBase64FromUrl,
        getBlobFromUrl,
        getCSTFilenameTimestamp,
        getCSTTimestamp,
        getItemProxyPreference,
        getProxyPreferenceForUrl,
        history,
        historySaveLimit,
        modelLibrary,
        nodes,
        normalizeHistorySaveLimit,
        projectName,
        resolveSourceReferenceUrl,
        saveHistoryAssets,
        saveProjectAsBundle,
        setDownloadProgress,
        theme,
        view,
    }, ...args);

    const handleNewProject = useCallback(async () => {
        const hasContent = (nodes?.length || 0) > 0
            || (connections?.length || 0) > 0
            || (history?.length || 0) > 0
            || (chatSessions?.length || 0) > 1
            || (characterLibrary?.length || 0) > 0;
        if (hasContent) {
            const shouldSave = await canvasConfirm('当前项目有内容，请选择保存后新建或直接新建。', {
                okText: '保存后新建', cancelText: '直接新建', dismissValue: null,
            });
            if (shouldSave === null) return;
            if (shouldSave) {
                await handleSaveProject();
            }
        }
        await resetProjectState();
    }, [nodes, connections, history, chatSessions, characterLibrary, handleSaveProject, resetProjectState]);

    // 保存选中的工作流（框选节点后右键保存）
    const handleSaveSelectedWorkflow = (...args) => projectsActions.handleSaveSelectedWorkflow({
        blobToDataURL,
        connections,
        getBase64FromUrl,
        getBlobFromUrl,
        getCSTFilenameTimestamp,
        getCSTTimestamp,
        nodes,
        resolveSourceReferenceUrl,
        selectedNodeId,
        selectedNodeIds,
        setSelectionContextMenu,
    }, ...args);

    // 导入工作流（将工作流节点添加到当前画布）
    const handleImportWorkflow = (...args) => projectsActions.handleImportWorkflow({
        canvasRef,
        localServerUrl,
        screenToWorld,
        setConnections,
        setNodes,
        setSelectedNodeIds,
    }, ...args);

    // 功能5：从JSON文件加载项目（流式读取，支持超大文件，修复多行JSON解析问题，解决内存泄露）
    const applyLoadedProjectState = (tempState) => {
        if (!tempState || typeof tempState !== 'object') return;
        setProjectName(tempState.projectName || '未命名项目');
        setView(normalizeViewState(tempState.view));
        if (Array.isArray(tempState.connections)) setConnections(tempState.connections);
        if (Array.isArray(tempState.chatSessions)) setChatSessions(tempState.chatSessions);
        if (Array.isArray(tempState.characterLibrary)) setCharacterLibrary(tempState.characterLibrary);
        const shouldLoadModelLibrary = tempState.modelLibraryLoaded || (Array.isArray(tempState.modelLibrary) && tempState.modelLibrary.length > 0);
        if (shouldLoadModelLibrary) {
            const normalizedLibrary = (tempState.modelLibrary || [])
                .map((entry, idx) => normalizeModelLibraryEntry(entry, idx))
                .filter(Boolean);
            setModelLibrary(normalizedLibrary);
        }
        if (['dark', 'light', 'solarized'].includes(tempState.theme)) {
            setTheme(tempState.theme);
        }
        if (Array.isArray(tempState.nodes)) setNodes(tempState.nodes);
        if (Array.isArray(tempState.history)) setHistory(tempState.history);
    };

    const importProjectBundle = (...args) => projectsActions.importProjectBundle({
        applyLoadedProjectState,
        assetBundleBlobToOriginalRef,
        assetBundleBlobUrlsRef,
        assetBundleIdToOriginalRef,
        assetBundlePathToIdRef,
        assetBundlePathToOriginalRef,
        persistAssetBundleMeta,
        persistAutoSaveSnapshot,
        persistHistorySnapshot,
        resetAssetBundleState,
        setAssetBundleActive,
        setProgressState,
    }, ...args);

    const handleLoadProject = (...args) => projectsActions.handleLoadProject({
        applyLoadedProjectState,
        importProjectBundle,
        localServerUrl,
        persistAutoSaveSnapshot,
        persistHistorySnapshot,
        setProgressState,
    }, ...args);

    // --- 节点操作 ---
    const addNode = (...args) => nodesActions.addNode({
        nodesMap,
        getApiConfigByKey,
        lastUsedAnalyzeModel,
        lastUsedExtractModel,
        lastUsedImageModel,
        lastUsedImageResolution,
        lastUsedRatio,
        lastUsedSegmentDuration,
        lastUsedVideoModel,
        lastUsedVideoResolution,
        localCacheServerConnected,
        localServerUrl,
        resolveModelKey,
        saveToUndoStack,
        setConnectingInputType,
        setConnectingSource,
        setConnectingTarget,
        setConnections,
        setContextMenu,
        setContextMenuExpanded,
        setNodes,
    }, ...args);

    const insertPreviewNode = (node) => insertPreviewMedia(node, {
        addNode, setSelectedNodeId, setSelectedNodeIds, setView,
        viewport: canvasRef.current?.getBoundingClientRect(), zoom: view.zoom,
    });

    // V2.6.1: 角色/场景提示词生成与自动流程
    const normalizeCharacterAge = (ageValue) => {
        if (!ageValue) return '';
        if (typeof ageValue === 'number') return `${ageValue}岁左右`;
        const text = String(ageValue).trim();
        if (!text) return '';
        if (text.includes('岁') || text.includes('年')) return text;
        return `${text}岁左右`;
    };

    const DESCRIPTION_STYLE_OPTIONS = [
        { value: 'none', label: '无' },
        { value: '2d-anime', label: t('2D动漫') },
        { value: '3d-anime', label: t('3D动漫') },
        { value: 'realistic', label: t('写实') },
        { value: 'selfie', label: t('自拍') },
        { value: 'news', label: t('新闻') },
        { value: 'manga', label: t('漫画') }
    ];

    const getDescriptionStylePrefix = useCallback((style) => {
        switch (style) {
            case '2d-anime':
                return '2D动漫风格';
            case '3d-anime':
                return '3D动漫风格';
            case 'realistic':
                return '写实风格';
            case 'selfie':
                return '自拍风格';
            case 'news':
                return '新闻风格';
            case 'manga':
                return '漫画风格';
            default:
                return '动漫风格';
        }
    }, []);

    const stripCharacterVideoSuffix = (text) => {
        if (!text) return '';
        let cleaned = text.replace(/，然后缓慢转一圈360度全方位展示身体/g, '');
        const markers = [
            '，正在用中文普通话面向镜头做自我介绍，说着：我是',
            '，正在用中文普通话面向镜头做自我介绍'
        ];
        markers.forEach((marker) => {
            const idx = cleaned.indexOf(marker);
            if (idx !== -1) cleaned = cleaned.slice(0, idx);
        });
        return cleaned;
    };

    const ensureCharacterVideoSuffix = (text) => {
        if (!text) return text;
        return text.includes('360度全方位展示身体') ? text : `${text}，然后缓慢转一圈360度全方位展示身体`;
    };

    const generateCharacterPrompt = useCallback((character, mode = 'video') => {
        const name = character?.name || character?.characterName || '角色';
        const role = (character?.role || character?.identity || character?.profession || '').trim();
        const description = (character?.description || character?.appearance || '').trim();
        const ageText = normalizeCharacterAge(character?.age);
        const genderText = character?.gender ? String(character.gender).trim() : '';
        const subjectText = `${ageText}${genderText}`.trim() || '角色';

        const detailText = [role, description].filter(Boolean).join('，');
        const detailPart = detailText ? `，${detailText}` : '';
        const introRole = role || description ? `，${role || description}` : '';

        const basePrompt = `动漫风格，全身视角，名叫${name}的${subjectText}站在白色背景前${detailPart}`;
        const speechPrompt = `${basePrompt}，正在用中文普通话面向镜头做自我介绍，说着：我是${name}${introRole}`;
        if (mode === 'video') {
            return `${speechPrompt}，然后缓慢转一圈360度全方位展示身体`;
        }
        return basePrompt;
    }, []);

    const generateScenePrompt = useCallback((scene) => {
        const location = scene?.location || scene?.name || scene?.sceneName || '';
        const description = scene?.description || '极度奢华的星际战舰舰桥内部，空间广阔如同一座宫殿，四壁装饰着繁复的黄金浮雕与象牙立柱，地面铺着深红色的天鹅绒地毯，巨大的落地舷窗外是深邃星空，中央悬挂着水晶吊灯，操作台被伪装成古典家具的样子，整体色调金碧辉煌，氛围庄严却透着一种不切实际的荒谬感';
        return location ? `${location}，${description}` : description;
    }, []);

    const runDescriptionPromptAction = (...args) => storyboardActions.runDescriptionPromptAction({
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
    }, ...args);

    const generateFullWorkflow = useCallback((...args) => storyboardActions.generateFullWorkflow({
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
    }, ...args), [nodesMap, apiConfigs, lastUsedVideoModel, lastUsedImageModel, lastUsedExtractModel, lastUsedRatio, lastUsedVideoResolution, lastUsedImageResolution, generateCharacterPrompt, generateScenePrompt]);

    const ensureImageNodeForDescription = (...args) => storyboardActions.ensureImageNodeForDescription({
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
    }, ...args);

    const ensureVideoNodeForDescription = (...args) => storyboardActions.ensureVideoNodeForDescription({
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
    }, ...args);



    // 获取连接的 gen-image 或 gen-video 节点（用于 storyboard-node 节点）
    const getConnectedGenNodes = useCallback((sourceNodeId) => {
        const genNodes = [];
        for (const conn of connections) {
            if (conn.from === sourceNodeId) {
                const targetNode = nodesMap.get(conn.to);
                if (targetNode && (targetNode.type === 'gen-image' || targetNode.type === 'gen-video')) {
                    genNodes.push(targetNode);
                }
            }
        }
        return genNodes;
    }, [connections, nodesMap]);

    // 获取模型的默认时长
    const getDefaultDurationForModel = (modelId) => {
        if (!modelId) return '5s';
        const config = getApiConfigByKey(modelId);
        const configuredDefaultRaw = String(config?.defaultDuration || '').trim();
        const configuredDefault = configuredDefaultRaw
            ? (configuredDefaultRaw.endsWith('s') ? configuredDefaultRaw : `${configuredDefaultRaw}s`)
            : '';
        if (configuredDefault) {
            if (!Array.isArray(config?.durations) || config.durations.length === 0) return configuredDefault;
            if (config.durations.includes(configuredDefault)) return configuredDefault;
        }
        if (Array.isArray(config?.durations) && config.durations.length > 0) {
            return config.durations[0];
        }
        const resolvedId = config?.id || modelId;
        if (resolvedId === 'sora-2-pro') return '15s';
        if (resolvedId.includes('sora-2') || resolvedId === 'sora-2') return '15s';
        if (resolvedId.includes('veo') || resolvedId === 'google-veo3') return '8s';
        if (resolvedId.includes('grok') || resolvedId === 'grok-3') return '8s';
        if (resolvedId.includes('jimeng-video-sora2') || resolvedId.includes('jimeng-sora2')) return '4s';
        return '5s';
    };

    // 获取模型可用的时长选项
    const getDefaultDurationsForModel = (modelId) => {
        if (!modelId) return ['5s', '10s'];
        const config = getApiConfigByKey(modelId);
        if (Array.isArray(config?.durations) && config.durations.length > 0) {
            return config.durations;
        }
        const resolvedId = config?.id || modelId;
        if (resolvedId === 'sora-2-pro') return ['15s', '25s'];
        if (resolvedId.includes('sora-2') || resolvedId === 'sora-2') return ['5s', '10s', '15s'];
        if (resolvedId.includes('veo') || resolvedId === 'google-veo3') return ['8s'];
        if (resolvedId.includes('grok') || resolvedId === 'grok-3') return ['8s', '5s'];
        if (resolvedId.includes('jimeng-video-sora2') || resolvedId.includes('jimeng-sora2')) return ['4s', '8s', '12s'];
        if (resolvedId.includes('jimeng')) return ['5s', '10s'];  // Jimeng 只支持 5s 和 10s
        return ['5s', '10s'];
    };

    const getStoryboardDefaultPromptByMode = (mode) => {
        const normalizedMode = STORYBOARD_LLM_PROMPT_MODES.includes(mode) ? mode : 'script';
        if (normalizedMode === 'novel') return DEFAULT_STORYBOARD_NOVEL_PROMPT;
        if (normalizedMode === STORYBOARD_TABLE_PROMPT_MODE) return DEFAULT_STORYBOARD_TABLE_SUMMARY_PROMPT;
        if (normalizedMode === 'custom') {
            return '你是分镜提示词设计助手。请将输入内容拆分为镜头提示词 JSON 数组。只输出 JSON，不要解释。';
        }
        return DEFAULT_STORYBOARD_SCRIPT_PROMPT;
    };
    const getStoryboardPromptSlotKey = (mode, nodeSettings = {}) => {
        const normalizedMode = STORYBOARD_LLM_PROMPT_MODES.includes(mode) ? mode : 'script';
        const selectionMap = nodeSettings?.llmPromptSlotSelection;
        const slot = selectionMap && typeof selectionMap === 'object'
            ? selectionMap[normalizedMode]
            : '';
        return STORYBOARD_PROMPT_SLOT_OPTIONS.some((item) => item.key === slot) ? slot : 'default';
    };
    const getStoryboardPromptMemoryStorageKey = (mode, slotKey) => {
        const normalizedMode = STORYBOARD_LLM_PROMPT_MODES.includes(mode) ? mode : 'script';
        const normalizedSlot = STORYBOARD_PROMPT_SLOT_OPTIONS.some((item) => item.key === slotKey) ? slotKey : 'memory1';
        return `${normalizedMode}:${normalizedSlot}`;
    };
    const getStoryboardPromptTemplate = (mode, nodeSettings = {}) => {
        const normalizedMode = STORYBOARD_LLM_PROMPT_MODES.includes(mode) ? mode : 'script';
        const activeSlot = getStoryboardPromptSlotKey(normalizedMode, nodeSettings);
        const defaultPrompt = getStoryboardDefaultPromptByMode(normalizedMode);
        if (activeSlot === 'default') return defaultPrompt;
        const memoryMap = nodeSettings?.llmPromptSlots;
        const memoryKey = getStoryboardPromptMemoryStorageKey(normalizedMode, activeSlot);
        const memoryPrompt = memoryMap && typeof memoryMap === 'object'
            ? String(memoryMap[memoryKey] || '').trim()
            : '';
        if (memoryPrompt) return memoryPrompt;
        if (normalizedMode === 'custom') {
            const legacyCustom = String(nodeSettings?.llmSplitPromptCustom || nodeSettings?.llmSplitPrompt || '').trim();
            if (legacyCustom) return legacyCustom;
        }
        return defaultPrompt;
    };
    const normalizeImportedStoryboardPromptSlots = (payload) => {
        if (!payload || typeof payload !== 'object') return {};
        const next = {};
        const applySlotValue = (mode, slot, value) => {
            if (!STORYBOARD_LLM_PROMPT_MODES.includes(mode)) return;
            if (!STORYBOARD_EDITABLE_PROMPT_SLOT_KEYS.includes(slot)) return;
            if (typeof value !== 'string') return;
            const trimmed = String(value).trim();
            if (!trimmed) return;
            next[`${mode}:${slot}`] = value;
        };
        Object.entries(payload).forEach(([key, value]) => {
            if (key.includes(':')) {
                const [mode, slot] = key.split(':');
                applySlotValue(mode, slot, value);
                return;
            }
            if (STORYBOARD_LLM_PROMPT_MODES.includes(key) && value && typeof value === 'object') {
                STORYBOARD_EDITABLE_PROMPT_SLOT_KEYS.forEach((slot) => {
                    applySlotValue(key, slot, value[slot]);
                });
            }
        });
        return next;
    };
    const exportStoryboardPromptSlots = useCallback(async (nodeId) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        const currentSlots = node.settings?.llmPromptSlots && typeof node.settings.llmPromptSlots === 'object'
            ? node.settings.llmPromptSlots
            : {};
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            llmPromptSlotSelection: node.settings?.llmPromptSlotSelection || {},
            llmPromptSlots: normalizeImportedStoryboardPromptSlots(currentSlots)
        };
        const jsonText = JSON.stringify(payload, null, 2);
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(jsonText);
                showToast('LLM 记忆槽已复制到剪贴板', 'success', 2200);
                return;
            }
        } catch (err) { }
        await canvasPrompt('复制以下 JSON（可用于导入记忆槽）', jsonText, { multiline: true, readOnly: true, okText: '完成' });
    }, [nodesMap, showToast]);
    const importStoryboardPromptSlots = useCallback((...args) => storyboardActions.importStoryboardPromptSlots({
        nodesMap,
        normalizeImportedStoryboardPromptSlots,
        showToast,
        updateNodeSettings,
    }, ...args), [nodesMap, showToast, updateNodeSettings]);
    const captureStoryboardWorkspaceHeight = useCallback((nodeId, event) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        const rawHeight = event?.currentTarget?.offsetHeight ?? event?.currentTarget?.clientHeight;
        const nextHeight = normalizeStoryboardWorkspaceHeight(rawHeight, STORYBOARD_WORKSPACE_DEFAULT_HEIGHT);
        const currentHeight = normalizeStoryboardWorkspaceHeight(node.settings?.llmWorkspaceHeight, STORYBOARD_WORKSPACE_DEFAULT_HEIGHT);
        if (Math.abs(nextHeight - currentHeight) < 1) return;
        updateNodeSettings(nodeId, { llmWorkspaceHeight: nextHeight });
    }, [nodesMap, updateNodeSettings]);

    const runStoryboardLlmSplit = (...args) => storyboardActions.runStoryboardLlmSplit({
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
    }, ...args);
    const normalizeStoryboardTableData = useCallback((tableInput) => {
        const sourceHeaders = Array.isArray(tableInput?.headers) ? tableInput.headers : [];
        let headers = sourceHeaders
            .map((header, idx) => {
                const value = String(header || '').trim();
                return value || `列${idx + 1}`;
            })
            .filter(Boolean);
        if (!headers.length) headers = [...STORYBOARD_DEFAULT_TABLE_HEADERS];
        let rows = Array.isArray(tableInput?.rows)
            ? tableInput.rows.map((row) => headers.map((_, colIdx) => String(Array.isArray(row) ? (row[colIdx] ?? '') : '')))
            : [];
        let shotColumnIndex = getStoryboardTableShotColumnIndex(headers);
        if (shotColumnIndex < 0) {
            headers = ['场次镜号', ...headers];
            rows = rows.map((row, rowIdx) => [String(rowIdx + 1), ...row]);
            shotColumnIndex = 0;
        }
        rows = rows.map((row, rowIdx) => {
            const normalizedRow = headers.map((_, colIdx) => String(Array.isArray(row) ? (row[colIdx] ?? '') : ''));
            normalizedRow[shotColumnIndex] = String(rowIdx + 1);
            return normalizedRow;
        });
        return { headers, rows };
    }, []);
    const buildStoryboardShotsFromTableData = useCallback((...args) => storyboardActions.buildStoryboardShotsFromTableData({
        getDefaultCustomParamsForModel,
        getDefaultDurationForModel,
        getFirstEnabledModelKey,
        getPreferredImageResolutionForModel,
        getPreferredModelRatio,
        getPreferredVideoResolutionForModel,
    }, ...args), [getDefaultDurationForModel, getDefaultCustomParamsForModel, getFirstEnabledModelKey, getPreferredImageResolutionForModel, getPreferredModelRatio, getPreferredVideoResolutionForModel]);
    const buildStoryboardTableSyncPatch = useCallback((node, tableInput, options = {}) => {
        const normalized = normalizeStoryboardTableData(tableInput);
        let headers = [...normalized.headers];
        let rows = normalized.rows.map((row) => [...row]);
        const promptBySceneIndex = options?.promptBySceneIndex instanceof Map ? options.promptBySceneIndex : null;
        if (promptBySceneIndex && promptBySceneIndex.size > 0) {
            let promptColumnIndex = getStoryboardTablePromptColumnIndex(headers);
            if (promptColumnIndex < 0) {
                headers.push('生图提示词');
                rows = rows.map((row) => [...row, '']);
                promptColumnIndex = headers.length - 1;
            }
            const shotColumnIndex = getStoryboardTableShotColumnIndex(headers);
            rows = rows.map((row, rowIdx) => {
                const nextRow = headers.map((_, colIdx) => String(Array.isArray(row) ? (row[colIdx] ?? '') : ''));
                const sceneIndex = normalizeStoryboardSceneIndex(shotColumnIndex >= 0 ? nextRow[shotColumnIndex] : '', rowIdx + 1);
                if (promptBySceneIndex.has(sceneIndex)) {
                    nextRow[promptColumnIndex] = String(promptBySceneIndex.get(sceneIndex) || '').trim();
                }
                return nextRow;
            });
        }
        const finalTable = normalizeStoryboardTableData({ headers, rows });
        return {
            tableData: finalTable,
            tableMarkdown: stringifyMarkdownTable(finalTable),
            shots: buildStoryboardShotsFromTableData(node, finalTable, options)
        };
    }, [buildStoryboardShotsFromTableData, normalizeStoryboardTableData]);
    const runStoryboardTablePromptMerge = useCallback((...args) => storyboardActions.runStoryboardTablePromptMerge({
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
    }, ...args), [cloudDocument, canvasCloud, buildStoryboardTableSyncPatch, chatModel, getApiCredentials, getStoryboardPromptTemplate, nodesMap, normalizeStoryboardTableData, saveToUndoStack, showToast, updateNodeSettings]);
    const importStoryboardMarkdownTable = useCallback((nodeId, markdownText, options = {}) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return false;
        const rawText = String(markdownText || '').trim();
        if (!rawText) {
            showToast('请先输入表格内容', 'warning', 2200);
            return false;
        }
        const parsedResult = parseStoryboardTableInput(rawText);
        const parsedTable = parsedResult?.table || null;
        if (!parsedTable) {
            showToast('未识别到有效表格。请确认首行是表头，并使用 Markdown / CSV / TSV（Tab）格式', 'warning', 3600);
            return false;
        }
        const shouldSwitchView = options?.switchToTable !== false;
        const patch = buildStoryboardTableSyncPatch(node, parsedTable);
        updateNodeSettings(nodeId, {
            ...patch,
            ...(shouldSwitchView ? { viewMode: 'table' } : {})
        });
        const formatLabel = parsedResult?.format === 'tsv'
            ? 'TSV'
            : parsedResult?.format === 'csv'
                ? 'CSV'
                : 'Markdown';
        showToast(`${formatLabel} 表格导入成功：${parsedTable.rows.length} 行`, 'success', 2400);
        return true;
    }, [buildStoryboardTableSyncPatch, nodesMap, showToast, updateNodeSettings]);
    const pasteStoryboardTableFromClipboard = useCallback(async (nodeId) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        if (!navigator?.clipboard?.readText) {
            showToast('当前环境不支持剪贴板读取，请手动粘贴到 Markdown 输入框', 'warning', 3000);
            return;
        }
        try {
            const rawText = await navigator.clipboard.readText();
            if (!String(rawText || '').trim()) {
                showToast('剪贴板为空', 'warning', 2200);
                return;
            }
            importStoryboardMarkdownTable(nodeId, rawText, { switchToTable: true });
        } catch (error) {
            showToast(`读取剪贴板失败: ${error?.message || '未知错误'}`, 'error', 2800);
        }
    }, [importStoryboardMarkdownTable, nodesMap, showToast]);
    const importStoryboardTableFromFile = useCallback((nodeId) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.markdown,.txt,.csv,text/markdown,text/plain,text/csv';
        input.onchange = async (event) => {
            const file = event?.target?.files?.[0];
            if (!file) return;
            try {
                const content = await file.text();
                const rawText = String(content || '').replace(/^\uFEFF/, '').trim();
                if (!rawText) {
                    showToast('文件内容为空', 'warning', 2200);
                    return;
                }
                importStoryboardMarkdownTable(nodeId, rawText, { switchToTable: true });
            } catch (error) {
                showToast(`读取文件失败: ${error?.message || '未知错误'}`, 'error', 2800);
            } finally {
                input.value = '';
            }
        };
        input.click();
    }, [importStoryboardMarkdownTable, nodesMap, showToast]);
    const getStoryboardTableDraft = useCallback((node) => {
        const parsed = node?.settings?.tableData
            || parseStoryboardTableInput(node?.settings?.tableMarkdown || node?.settings?.scriptText || '')?.table;
        if (parsed && Array.isArray(parsed.headers) && parsed.headers.length > 0) {
            return normalizeStoryboardTableData(parsed);
        }
        return normalizeStoryboardTableData({ headers: [...STORYBOARD_DEFAULT_TABLE_HEADERS], rows: [] });
    }, [normalizeStoryboardTableData]);
    const mutateStoryboardTable = useCallback((nodeId, mutator) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return false;
        const current = getStoryboardTableDraft(node);
        const draft = {
            headers: [...current.headers],
            rows: current.rows.map((row) => [...row])
        };
        const next = (typeof mutator === 'function' ? (mutator(draft) || draft) : draft) || draft;
        const headers = (Array.isArray(next.headers) ? next.headers : draft.headers)
            .map((header, idx) => {
                const value = String(header || '').trim();
                return value || `列${idx + 1}`;
            })
            .filter(Boolean);
        if (!headers.length) return false;
        const rows = (Array.isArray(next.rows) ? next.rows : draft.rows)
            .map((row) => headers.map((_, colIdx) => String(Array.isArray(row) ? (row[colIdx] ?? '') : '')));
        const normalized = normalizeStoryboardTableData({ headers, rows });
        const patch = buildStoryboardTableSyncPatch(node, normalized);
        updateNodeSettings(nodeId, {
            ...patch,
            viewMode: 'table'
        });
        return true;
    }, [buildStoryboardTableSyncPatch, getStoryboardTableDraft, nodesMap, normalizeStoryboardTableData, updateNodeSettings]);
    const buildStoryboardTablePatchFromShots = useCallback((...args) => storyboardActions.buildStoryboardTablePatchFromShots({
        normalizeStoryboardTableData,
    }, ...args), [normalizeStoryboardTableData]);
    useEffect(() => {
        setNodes((prevNodes) => {
            let changed = false;
            const nextNodes = prevNodes.map((node) => {
                if (!node || node.type !== 'storyboard-node') return node;
                const patch = buildStoryboardTablePatchFromShots(node);
                if (!patch) return node;
                changed = true;
                return {
                    ...node,
                    settings: {
                        ...node.settings,
                        ...patch
                    }
                };
            });
            return changed ? nextNodes : prevNodes;
        });
    }, [buildStoryboardTablePatchFromShots]);
    const closeStoryboardTableCellEditor = useCallback(() => {
        setStoryboardTableCellEditor({
            visible: false,
            nodeId: null,
            rowIdx: -1,
            colIdx: -1,
            value: '',
            width: 540,
            height: 240
        });
    }, []);
    const openStoryboardTableCellEditor = useCallback((nodeId, rowIdx, colIdx, currentValue, event) => {
        const cell = event?.currentTarget?.closest ? event.currentTarget.closest('td') : null;
        const rect = cell?.getBoundingClientRect ? cell.getBoundingClientRect() : null;
        const baseWidth = rect?.width || 220;
        const baseHeight = rect?.height || 84;
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
        const width = Math.round(Math.min(viewportWidth * 0.9, Math.max(360, baseWidth * 3)));
        const height = Math.round(Math.min(viewportHeight * 0.8, Math.max(220, baseHeight * 3)));
        setStoryboardTableCellEditor({
            visible: true,
            nodeId,
            rowIdx,
            colIdx,
            value: String(currentValue || ''),
            width,
            height
        });
    }, []);
    const handleStoryboardTableCellEditorChange = useCallback((nextValue) => {
        const value = String(nextValue ?? '');
        setStoryboardTableCellEditor((prev) => {
            if (!prev.visible || !prev.nodeId || prev.rowIdx < 0 || prev.colIdx < 0) {
                return { ...prev, value };
            }
            mutateStoryboardTable(prev.nodeId, (draft) => {
                if (!Array.isArray(draft.rows[prev.rowIdx])) {
                    draft.rows[prev.rowIdx] = draft.headers.map(() => '');
                }
                draft.rows[prev.rowIdx][prev.colIdx] = value;
                return draft;
            });
            return { ...prev, value };
        });
    }, [mutateStoryboardTable]);
    useEffect(() => {
        if (!storyboardTableCellEditor.visible) return undefined;
        const handleEsc = (event) => {
            if (canvasDialogStore.getSnapshot()) return;
            if (event.key === 'Escape') {
                event.stopPropagation();
                closeStoryboardTableCellEditor();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => {
            window.removeEventListener('keydown', handleEsc);
        };
    }, [storyboardTableCellEditor.visible, closeStoryboardTableCellEditor]);

    // 分镜表节点功能函数
    const addEmptyShot = (nodeId) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;

        // V3.7.18: 根据当前模式选择正确的模型
        const mode = normalizeStoryboardMode(node.settings?.mode);
        let defaultModel;
        let defaultRatio;
        let defaultDuration;
        let defaultResolution;

        if (mode === 'image') {
            // 图片模式: 使用图片模型
            defaultModel = getFirstEnabledModelKey('image');
            defaultRatio = getPreferredModelRatio(defaultModel, 'image');
            defaultResolution = getPreferredImageResolutionForModel(defaultModel);
            defaultDuration = undefined;  // 图片没有秒数
        } else {
            // 视频模式: 使用视频模型
            defaultModel = getFirstEnabledModelKey('video');
            defaultRatio = getPreferredModelRatio(defaultModel, 'video');
            defaultResolution = getPreferredVideoResolutionForModel(defaultModel);
            defaultDuration = getDefaultDurationForModel(defaultModel);
        }

        const newShot = {
            id: `shot-${Date.now()}`,
            scene_index: (node.settings?.shots?.length || 0) + 1,
            time_range: '',
            image_url: '',
            description: '',
            prompt: '',
            camera: '',
            tags: [],
            status: 'draft',
            model: defaultModel,
            ratio: defaultRatio,
            resolution: defaultResolution,
            duration: defaultDuration,
            outputEnabled: false,  // V3.7.26: 默认不启用输出（需要用户确认）
            selectedImageIndex: -1  // V3.7.26: 默认不选中
        };
        updateNodeSettings(nodeId, {
            shots: [...(node.settings?.shots || []), newShot]
        });
    };

    const deleteShot = (nodeId, shotId) => {
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        const updatedShots = (node.settings?.shots || []).filter(s => s.id !== shotId);
        // 重新编号
        updatedShots.forEach((shot, idx) => {
            shot.scene_index = idx + 1;
        });
        updateNodeSettings(nodeId, { shots: updatedShots });
    };

    // V3.7.29: 修复并发预览覆盖 - 使用函数式更新避免陈旧闭包问题
    // V3.7.29 fix3: 使用 setTimeout(0) 代替 queueMicrotask，更可靠
    // V3.7.29: 修复并发预览覆盖 - 使用函数式更新避免陈旧闭包问题
    // V3.7.29 fix3: 使用 setTimeout(0) 代替 queueMicrotask，更可靠
    // V3.7.29 fix4: 添加 options 参数支持条件更新（如 onlyIfStatus）
    // V3.7.30 fix: 移除 setTimeout 包装，直接调用确保状态更新不丢失
    const updateShot = (...args) => storyboardActions.updateShot({
        setNodes,
        setShotTimers,
        updatePreviewFromTask,
    }, ...args);
    const focusStoryboardShotCard = useCallback((nodeId, shotId) => {
        const selector = `[data-storyboard-shot-key="${makeStoryboardShotFocusKey(nodeId, shotId)}"]`;
        requestAnimationFrame(() => {
            const target = document.querySelector(selector);
            if (target && typeof target.focus === 'function') {
                target.focus();
            }
        });
    }, []);
    const navigateStoryboardShotByDelta = useCallback((nodeId, shotId, delta) => {
        if (!delta) return null;
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return null;
        const shots = node.settings?.shots || [];
        if (!shots.length) return null;
        const currentIdx = shots.findIndex((s) => isSameShotId(s.id, shotId));
        if (currentIdx < 0) return null;
        const nextIdx = Math.max(0, Math.min(shots.length - 1, currentIdx + delta));
        const targetShot = shots[nextIdx];
        if (!targetShot || isSameShotId(targetShot.id, shotId)) return targetShot || null;
        setActiveShot({ nodeId, shotId: targetShot.id });
        focusStoryboardShotCard(nodeId, targetShot.id);
        return targetShot;
    }, [nodesMap, focusStoryboardShotCard]);
    const switchStoryboardShotOutputHistory = useCallback((nodeId, shotId, delta) => {
        if (!delta) return;
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'storyboard-node') return;
        const shots = node.settings?.shots || [];
        const shot = shots.find((item) => isSameShotId(item.id, shotId));
        if (!shot) return;
        const historyEntries = Array.isArray(shot.outputHistory) ? shot.outputHistory.filter(Boolean) : [];
        if (historyEntries.length <= 1) return;
        const currentCursorRaw = Number.isInteger(shot.outputHistoryCursor)
            ? shot.outputHistoryCursor
            : historyEntries.length - 1;
        const currentCursor = Math.max(0, Math.min(historyEntries.length - 1, currentCursorRaw));
        const nextCursor = Math.max(0, Math.min(historyEntries.length - 1, currentCursor + delta));
        if (nextCursor === currentCursor) return;
        const snapshot = historyEntries[nextCursor];
        const restored = materializeStoryboardOutputFromSnapshot(snapshot, shot);
        if (!restored) return;
        setActiveShot({ nodeId, shotId: shot.id });
        focusStoryboardShotCard(nodeId, shot.id);
        updateShot(nodeId, shot.id, {
            ...restored,
            outputHistoryCursor: nextCursor,
            __skipOutputHistory: true
        });
    }, [nodesMap, focusStoryboardShotCard]);

    // 从 video-analyze 节点导入分析结果
    const importShotsFromAnalysis = (...args) => storyboardActions.importShotsFromAnalysis({
        getConnectedVideoAnalyzeNode,
        nodesMap,
        updateNodeSettings,
    }, ...args);

    // 自动从分析结果创建分镜表节点
    const createStoryboardFromAnalysisResult = (...args) => storyboardActions.createStoryboardFromAnalysisResult({
        nodesMap,
        setConnections,
        setNodes,
    }, ...args);

    // 分镜表任务映射：用于追踪从分镜表触发的生成任务
    const storyboardTaskMapRef = useRef(new Map()); // 映射关系：taskId -> { storyboardNodeId, shotId }
    const storyboardHistoryMapRef = useRef(new Map()); // 映射关系：historyId -> { nodeId, shotId, isImageMode }
    const storyboardHistorySyncRef = useRef(new Set()); // 映射关系：historyId -> synced
    const imageBatchTaskMapRef = useRef(new Map()); // 映射关系：taskId -> { total, completed, failed, intervalMs }

    const mergeHistoryImageUrlsForBatch = useCallback((historyItem, incomingUrls) => {
        const incoming = Array.isArray(incomingUrls)
            ? incomingUrls.map((url) => String(url || '').trim()).filter(Boolean)
            : [];
        if (incoming.length === 0) return [];
        const merged = [];
        const push = (url) => {
            const value = String(url || '').trim();
            if (!value || merged.includes(value)) return;
            merged.push(value);
        };
        if (Array.isArray(historyItem?.output_images)) {
            historyItem.output_images.forEach(push);
        } else if (Array.isArray(historyItem?.mjImages)) {
            historyItem.mjImages.forEach(push);
        } else if (historyItem?.url) {
            push(historyItem.url);
        }
        incoming.forEach(push);
        return merged;
    }, []);

    const consumeImageBatchSuccess = useCallback((taskId, historyItem, incomingUrls) => {
        const incoming = Array.isArray(incomingUrls)
            ? incomingUrls.map((url) => String(url || '').trim()).filter(Boolean)
            : [];
        if (incoming.length === 0) {
            return { urls: [], status: 'completed', progress: 100, done: true };
        }
        const ctx = imageBatchTaskMapRef.current.get(taskId);
        if (!ctx) {
            return { urls: incoming, status: 'completed', progress: 100, done: true };
        }
        const total = Math.max(1, normalizeImageConcurrency(ctx.total || 1));
        const mergedUrls = mergeHistoryImageUrlsForBatch(historyItem, incoming);
        const completed = Math.min(total, Number(ctx.completed || 0) + 1);
        const failed = Math.max(0, Number(ctx.failed || 0));
        const settled = Math.min(total, completed + failed);
        const done = settled >= total;
        if (done) {
            imageBatchTaskMapRef.current.delete(taskId);
        } else {
            imageBatchTaskMapRef.current.set(taskId, { ...ctx, total, completed, failed });
        }
        const progress = done
            ? 100
            : Math.max(10, Math.min(95, Math.round((settled / total) * 95)));
        return {
            urls: mergedUrls.length > 0 ? mergedUrls : incoming,
            status: done ? 'completed' : 'generating',
            progress,
            done,
            total,
            completed,
            failed
        };
    }, [mergeHistoryImageUrlsForBatch]);

    const consumeImageBatchFailure = useCallback((taskId) => {
        const ctx = imageBatchTaskMapRef.current.get(taskId);
        if (!ctx) return null;
        const total = Math.max(1, normalizeImageConcurrency(ctx.total || 1));
        const completed = Math.max(0, Number(ctx.completed || 0));
        const failed = Math.min(total, Math.max(0, Number(ctx.failed || 0)) + 1);
        const settled = Math.min(total, completed + failed);
        const done = settled >= total;
        if (done) {
            imageBatchTaskMapRef.current.delete(taskId);
        } else {
            imageBatchTaskMapRef.current.set(taskId, { ...ctx, total, completed, failed });
        }
        return { total, completed, failed, settled, done };
    }, []);

    useEffect(() => {
        if (!Array.isArray(history) || history.length === 0) return;
        const synced = storyboardHistorySyncRef.current;
        const nodesSnapshot = nodesRef.current || [];
        const debugStoryboard = isStoryboardDebugEnabled();
        history.forEach((item) => {
            if (!item || synced.has(item.id)) return;
            const status = String(item.status || '').toLowerCase();
            if (status !== 'completed' && status !== 'done') return;
            if (item.type && item.type !== 'image') return;
            const mappedInfo = storyboardHistoryMapRef.current.get(item.id);
            const storyboardInfo = mappedInfo || parseStoryboardSourceNodeId(item.sourceNodeId);
            if (!storyboardInfo || !storyboardInfo.isImageMode) {
                if (debugStoryboard) {
                    console.warn('[Storyboard Sync] sourceNodeId 解析失败', { historyId: item.id, sourceNodeId: item.sourceNodeId });
                }
                synced.add(item.id);
                return;
            }
            const node = findStoryboardNodeById(nodesSnapshot, storyboardInfo.nodeId);
            if (!node) {
                if (debugStoryboard) {
                    console.warn('[Storyboard Sync] 未找到分镜节点', { historyId: item.id, nodeId: storyboardInfo.nodeId });
                }
                synced.add(item.id);
                return;
            }
            const resolved = resolveStoryboardShotCandidate(node, storyboardInfo.shotId, item);
            if (!resolved || !resolved.shot) {
                if (debugStoryboard) {
                    console.warn('[Storyboard Sync] 未找到镜头', { historyId: item.id, nodeId: storyboardInfo.nodeId, shotId: storyboardInfo.shotId });
                }
                synced.add(item.id);
                return;
            }
            const shot = resolved.shot;
            const shotHasOutput = Array.isArray(shot.output_images) && shot.output_images.length > 0;
            const historyStartTime = Number(item.startTime || item.time || 0);
            const shotStartTime = Number(shot.generationStartTime || 0);
            const isLikelyCurrentRun = shot.status === 'generating'
                || (
                    historyStartTime > 0
                    && shotStartTime > 0
                    && Math.abs(historyStartTime - shotStartTime) <= 2 * 60 * 1000
                );
            if (shotHasOutput && !isLikelyCurrentRun) {
                synced.add(item.id);
                return;
            }
            const fallbackImages = Array.isArray(item.output_images) && item.output_images.length > 0
                ? item.output_images
                : (Array.isArray(item.mjImages) && item.mjImages.length > 0 ? item.mjImages : (item.url ? [item.url] : []));
            if (fallbackImages.length === 0) {
                if (debugStoryboard) {
                    console.warn('[Storyboard Sync] history 无可用图片', { historyId: item.id, nodeId: storyboardInfo.nodeId, shotId: storyboardInfo.shotId });
                }
                return;
            }
            if (resolved.reason === 'fallback' && !isSameShotId(shot.id, storyboardInfo.shotId)) {
                if (debugStoryboard) {
                    console.warn('[Storyboard Sync] 使用兜底镜头匹配', {
                        historyId: item.id,
                        nodeId: storyboardInfo.nodeId,
                        originalShotId: storyboardInfo.shotId,
                        matchedShotId: shot.id
                    });
                }
            }
            updateShot(storyboardInfo.nodeId, shot.id, {
                output_images: fallbackImages,
                output_url: fallbackImages[0],
                selectedImageIndex: 0,
                outputEnabled: false,
                status: 'done'
            });
            synced.add(item.id);
            console.log('[Storyboard Sync] 回填分镜输出', {
                historyId: item.id,
                nodeId: storyboardInfo.nodeId,
                shotId: storyboardInfo.shotId,
                count: fallbackImages.length
            });
        });
    }, [history]);

    // 跟踪当前聚焦的提示词文本框
    const focusedPromptTextareaRef = useRef(null);

    // 生成单个镜头
    // 重构后的生成单个镜头函数：原地生成，不依赖外部节点
    // 创建角色
    const createCharacter = (...args) => mediaActions.createCharacter({
        cloudDocument,
        canvasCloud,
        apiConfigs,
        characterLibrary,
        getApiCredentials,
        setCharacterLibrary,
        setCreateCharacterEndSecond,
        setCreateCharacterEndpoint,
        setCreateCharacterOpen,
        setCreateCharacterSelectedTaskId,
        setCreateCharacterStartSecond,
        setCreateCharacterSubmitting,
        setCreateCharacterVideoSourceType,
        setCreateCharacterVideoUrl,
    }, ...args);

    const scheduleStoryboardTimeout = (nodeId, shotId, startAt, mode) => {
        const timeoutMs = mode === 'image' ? IMAGE_TASK_TIMEOUT_MS : VIDEO_TASK_TIMEOUT_MS;
        const timeoutSeconds = Math.round(timeoutMs / 1000);
        setTimeout(() => {
            const currentNodes = nodesRef.current || [];
            const node = currentNodes.find(n => n.id === nodeId);
            const currentShot = node?.settings?.shots?.find(s => isSameShotId(s.id, shotId));
            if (!currentShot) return;
            if (currentShot.status !== 'generating') return;
            if (currentShot.generationStartTime !== startAt) return;
            updateShot(nodeId, shotId, { status: 'failed', errorMsg: `任务超时（${timeoutSeconds}s）` }, { onlyIfStatus: 'generating' });
        }, timeoutMs);
    };

    const generateSingleShot = (...args) => mediaActions.generateSingleShot({
        apiConfigs,
        canvasCloud,
        cloudDocument,
        getApiConfigByKey,
        getDefaultDurationForModel,
        getDefaultDurationsForModel,
        resolveModelKey,
        scheduleStoryboardTimeout,
        startGeneration,
        updateShot,
    }, ...args);

    // V3.6.1: 智能分镜图片生成函数
    const generateSingleImage = (...args) => mediaActions.generateSingleImage({
        apiConfigs,
        canvasCloud,
        cloudDocument,
        getApiConfigByKey,
        getApiCredentials,
        localStorage,
        resolveModelKey,
        scheduleStoryboardTimeout,
        setSettingsOpen,
        startGeneration,
        updateShot,
    }, ...args);

    // 拓展图片 Zoom Out 功能
    const handleExpandImageZoom = (...args) => mediaActions.handleExpandImageZoom({
        cloudDocument,
        canvasCloud,
        apiConfigs,
        getApiCredentials,
        nodesMap,
        pollMidjourneyJob,
        setHistory,
        setHistoryOpen,
        setSettingsOpen,
        uploadImageToGetHttpUrl,
    }, ...args);


    // V2.6.1: 角色场景提取逻辑
    const handleExtractAnalysis = (...args) => mediaActions.handleExtractAnalysis({
        cloudDocument,
        canvasCloud,
        connections,
        generateFullWorkflow,
        getApiConfigByKey,
        getApiCredentials,
        localStorage,
        nodesMap,
        resolveModelKey,
        setLastUsedExtractModel,
        setNodes,
        setSettingsOpen,
        showToast,
        updateNodeSettings,
    }, ...args);

    const handleNovelExtract = (nodeId) => {
        if (cloudDocument) return canvasCloud.textExecute(nodeId, 'extractCharactersScenes');
        const node = nodesMap.get(nodeId);
        if (!node) return;

        const inputText = node.settings?.content || '';
        if (!inputText || inputText.trim().length === 0) {
            showToast('请先输入小说内容', 'error');
            return;
        }

        const existing = connections.find(c => c.from === nodeId && nodesMap.get(c.to)?.type === 'extract-characters-scenes');
        let targetId = existing?.to;
        let targetNode = targetId ? nodesMap.get(targetId) : null;
        if (!targetId) {
            const extractWidth = 400;
            const extractHeight = 500;
            const worldX = node.x + node.width + 50 + extractWidth / 2;
            const worldY = node.y + node.height / 2;
            const created = addNode('extract-characters-scenes', worldX, worldY, nodeId);
            targetId = created?.id;
            targetNode = created || null;
        }

        if (!targetId) return;

        const modelId = resolveModelKey(
            targetNode?.settings?.model
            || nodesMap.get(targetId)?.settings?.model
            || lastUsedExtractModel
            || ''
        );
        if (!modelId) {
            showToast('请在“提取角色和场景”节点选择分析模型', 'warning', 4000);
            setActiveDropdown({ nodeId: targetId, type: 'extract-model' });
            return;
        }

        const credentials = getApiCredentials(modelId);
        if (!credentials.key) {
            showToast('请先在设置中配置 API Key', 'error');
            setSettingsOpen(true);
            return;
        }

        updateNodeSettings(targetId, { model: modelId });
        requestAnimationFrame(() => {
            handleExtractAnalysis(targetId, { inputText, modelId });
        });
    };

    const handleFileUpload = (nodeId, e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const content = ev.target.result;
                let dimensions = { w: 0, h: 0 };
                try { dimensions = await getImageDimensions(content); } catch (e) { }
                // V3.4.7: 保存撤销状态（图片更换是可撤销的操作）
                saveToUndoStack();
                setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, content: content, dimensions } : n));
            };
            reader.readAsDataURL(file);
        }
    };

    // 按时间段分组关键帧
    const groupKeyframesByTime = (keyframes, segmentDuration) => {
        if (!keyframes || keyframes.length === 0) return [];
        const sorted = [...keyframes].sort((a, b) => a.time - b.time);
        const groups = [];
        let currentGroup = [];
        let currentGroupStart = sorted[0].time;

        sorted.forEach((frame, idx) => {
            if (frame.time - currentGroupStart >= segmentDuration && currentGroup.length > 0) {
                groups.push([...currentGroup]);
                currentGroup = [frame];
                currentGroupStart = frame.time;
            } else {
                currentGroup.push(frame);
            }
        });

        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        return groups;
    };

    // 为选中关键帧生成提示词
    const handleGeneratePrompts = (...args) => mediaActions.handleGeneratePrompts({
        cloudDocument,
        canvasCloud,
        getApiConfigByKey,
        getApiCredentials,
        getConnectedVideoInputNode,
        groupKeyframesByTime,
        nodesMap,
        resolveModelKey,
        setHistory,
        setNodes,
        setSettingsOpen,
    }, ...args);

    // AI 视频全自动分析
    const handleAutoVideoAnalysis = (...args) => mediaActions.handleAutoVideoAnalysis({
        cloudDocument,
        canvasCloud,
        apiConfigs,
        createStoryboardFromAnalysisResult,
        getApiCredentials,
        getConnectedVideoInputNode,
        nodesMap,
        setNodes,
        setSettingsOpen,
    }, ...args);

    const addPromptLibraryItem = () => {
        const name = promptLibraryForm.name.trim();
        const prompt = promptLibraryForm.prompt.trim();
        if (!name || !prompt) {
            canvasAlert(t('请输入名称和提示词内容'));
            return;
        }
        setPromptLibrary((prev) => [
            { id: `custom-${Date.now()}`, name, prompt },
            ...prev
        ]);
        setPromptLibraryForm({ name: '', prompt: '' });
    };
    const removePromptLibraryItem = (id) => {
        setPromptLibrary((prev) => prev.filter((p) => p.id !== id));
    };
    const applyLibraryPrompt = (nodeId, promptText) => {
        if (!nodeId || !promptText) return;
        updateNodeSettings(nodeId, { prompt: promptText });
    };

    // 生成九宫格分镜脚本提示词
    const generateGridPrompt = () => {
        const currentSelectedId = selectedNodeIdRef.current;
        if (!currentSelectedId) {
            canvasAlert(t('请先选中一个AI绘图节点'));
            return;
        }

        const targetNode = nodesRef.current.find(n => n.id === currentSelectedId);
        if (!targetNode || targetNode.type !== 'gen-image') {
            canvasAlert(t('请选中一个AI绘图节点（gen-image）'));
            return;
        }

        // 获取连接的参考图
        const connectedImages = getConnectedInputImages(targetNode.id, 'default');
        const hasReferenceImage = connectedImages.length > 0;

        // 生成提示词
        const gridPrompt = hasReferenceImage
            ? GRID_PROMPT_TEXT
            : `生成一张九宫格（3x3 grid）布局的分镜脚本。在9个格子中展示同一个角色不同的动作、表情和拍摄角度（如正面、侧面、背面、特写等）。要求风格高度统一，形成一张完整的角色动态表（Character Sheet）。`;

        // 更新节点的提示词，保持模型、分辨率、比例不变
        updateNodeSettings(targetNode.id, { prompt: gridPrompt });

        // 提示用户
        canvasAlert(t('已生成九宫格分镜脚本提示词！'));
    };

    // 智能拆分放大：直接生成提示词
    const handleUpscale = () => {
        const currentSelectedId = selectedNodeIdRef.current;
        if (!currentSelectedId) {
            canvasAlert(t('请选择图片生成节点进行放大。'));
            return;
        }

        const targetNode = nodesRef.current.find(n => n.id === currentSelectedId);
        if (!targetNode || targetNode.type !== 'gen-image') {
            canvasAlert(t('请选择图片生成节点进行放大。'));
            return;
        }

        const upscalePrompt = UPSCALE_PROMPT_TEXT;

        // 更新节点的提示词
        updateNodeSettings(targetNode.id, { prompt: upscalePrompt });

        // 提示用户
        canvasAlert(t('已生成高清放大提示词！'));
    };

    // 切割九宫格图片（3x3网格）
    const splitGridImage = (...args) => mediaActions.splitGridImage({}, ...args);

    // 裁切九宫格图片并创建节点
    const handleSplitGridImage = (...args) => mediaActions.handleSplitGridImage({
        nodesRef,
        selectedNodeIdRef,
        setNodes,
        splitGridImage,
    }, ...args);

    const handleSplitGridFromUrl = (...args) => mediaActions.handleSplitGridFromUrl({
        screenToWorld,
        selectedNodeIdsRef,
        setNodes,
        splitGridImage,
    }, ...args);

    // 智能整理节点：DAG 层级布局 + 交叉最小化 (Barycenter Heuristic)
    const autoArrangeNodes = (...args) => mediaActions.autoArrangeNodes({
        connectionsRef,
        nodesRef,
        selectedNodeIdRef,
        selectedNodeIdsRef,
        setNodes,
        saveToUndoStack,
        notify: (type, content) => arrangeMessage.open({ type, content, key: 'canvas-auto-arrange' }),
    }, ...args);



    const insertKeyframesFromUrls = useCallback((nodeId, urls, insertIdx = null) => {
        const existingNode = nodesMap.get(nodeId);
        if (!existingNode) return;
        const existingFrames = existingNode?.frames || [];
        const existingKeyframes = existingNode?.selectedKeyframes || [];
        const validUrls = (urls || []).filter(Boolean);
        if (validUrls.length === 0) return;

        const newKeyframes = validUrls.map((url, idx) => ({
            time: Date.now() + idx,
            url,
            filename: ''
        }));

        const targetIndex = insertIdx !== null ? insertIdx : existingFrames.length;
        const updatedFrames = [
            ...existingFrames.slice(0, targetIndex),
            ...newKeyframes,
            ...existingFrames.slice(targetIndex)
        ];
        const framesToSelect = new Set([...existingKeyframes, ...newKeyframes]);
        const normalizedFrames = updatedFrames.map((f, i) => ({ ...f, time: i }));
        const newSelectedKeyframes = normalizedFrames.filter((_, i) => framesToSelect.has(updatedFrames[i]));

        setNodes(prev => prev.map(n =>
            n.id === nodeId
                ? { ...n, frames: normalizedFrames, selectedKeyframes: newSelectedKeyframes }
                : n
        ));
    }, [nodesMap, setNodes]);

    const handleVideoDrop = (...args) => mediaActions.handleVideoDrop({
        getDragUrlCandidate,
        getHistoryDragPayload,
        handleVideoFileUpload,
        insertKeyframesFromUrls,
        nodesMap,
        resolveDroppedUrlCandidate,
        resolveHistoryPayloadUrl,
        resolveUrlForMediaMeta,
        saveToUndoStack,
        setNodes,
    }, ...args);

    // V3.5.20：拖放插入逻辑处理器
    const handleKeyframeItemDragOver = (e, nodeId, idx) => {
        e.preventDefault(); e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        // 判断插入位置：左半区域插到前面，右半区域插到后面
        const isRightHalf = (e.clientX - rect.left) > (rect.width / 2);
        const insertIdx = isRightHalf ? idx + 1 : idx;

        if (dragInsertIndex !== insertIdx || dragInsertNodeId !== nodeId) {
            setDragInsertIndex(insertIdx);
            setDragInsertNodeId(nodeId);
        }
    };

    const handleKeyframeContainerDragOver = (e, nodeId, length) => {
        e.preventDefault(); e.stopPropagation();
        // 悬停在容器空白区域时默认追加到末尾
        if (e.target === e.currentTarget) {
            if (dragInsertIndex !== length || dragInsertNodeId !== nodeId) {
                setDragInsertIndex(length);
                setDragInsertNodeId(nodeId);
            }
        }
    };

    const handleKeyframeListDrop = (...args) => mediaActions.handleKeyframeListDrop({
        dragInsertIndex,
        dragInsertNodeId,
        getDragUrlCandidate,
        getHistoryDragPayload,
        insertKeyframesFromUrls,
        nodesMap,
        resolveDroppedUrlCandidate,
        resolveHistoryPayloadUrl,
        setDragInsertIndex,
        setDragInsertNodeId,
        setNodes,
    }, ...args);

    // 智能抽帧：场景检测算法
    const detectScenesAndCapture = (...args) => mediaActions.detectScenesAndCapture({}, ...args);

    const handleAutoExtractKeyframes = async (nodeId, fps = 2) => {
        const node = nodesMap.get(nodeId);
        if (!node?.content) return;
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, extractingFrames: true } : n));
        try {
            const frames = await extractKeyFrames(node.content, { fps });
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, frames, selectedKeyframes: [], extractingFrames: false } : n));
        } catch (error) {
            console.error('视频抽帧失败', error);
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, extractingFrames: false } : n));
        }
    };

    const handleSmartExtractKeyframes = async (nodeId, threshold = 30) => {
        const node = nodesMap.get(nodeId);
        if (!node?.content) return;
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, extractingFrames: true } : n));
        try {
            const frames = await detectScenesAndCapture(node.content, threshold);
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, frames, selectedKeyframes: [], extractingFrames: false } : n));
        } catch (error) {
            console.error('智能抽帧失败', error);
            canvasAlert(`智能抽帧失败: ${error.message}`);
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, extractingFrames: false } : n));
        }
    };

    // 提取口播文案
    const handleExtractVoiceover = (...args) => mediaActions.handleExtractVoiceover({
        cloudDocument,
        canvasCloud,
        getApiCredentials,
        getConnectedVideoInputNode,
        nodesMap,
        setNodes,
        setSettingsOpen,
    }, ...args);

    const handleToggleKeyframe = (nodeId, frame, index = 0, event = null) => {
        const shiftKey = !!event?.shiftKey;
        setNodes(prev => prev.map(n => {
            if (n.id !== nodeId) return n;
            const frames = n.frames || [];
            const keyOf = (f) => `${f.time}-${f.url}`;
            const frameMap = new Map(frames.map(f => [keyOf(f), f]));
            const currentSelected = n.selectedKeyframes || [];
            let nextSelected = [...currentSelected];

            if (shiftKey && frameSelectionRef.current[nodeId] !== undefined && frameSelectionRef.current[nodeId] !== null && frames.length > 0) {
                const lastIndex = frameSelectionRef.current[nodeId];
                const start = Math.min(lastIndex, index);
                const end = Math.max(lastIndex, index);
                const rangeFrames = frames.slice(start, end + 1);
                const selectedKeys = new Set(nextSelected.map(keyOf));
                rangeFrames.forEach(f => selectedKeys.add(keyOf(f)));
                nextSelected = Array.from(selectedKeys).map(k => frameMap.get(k)).filter(Boolean);
            } else {
                const exists = nextSelected.some(f => keyOf(f) === keyOf(frame));
                nextSelected = exists
                    ? nextSelected.filter(f => keyOf(f) !== keyOf(frame))
                    : [...nextSelected, frame];
            }

            frameSelectionRef.current[nodeId] = index;
            return { ...n, selectedKeyframes: nextSelected };
        }));
    };

    const openFrameContextMenu = (e, nodeId, frame) => {
        e.preventDefault();
        e.stopPropagation();
        setFrameContextMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId, frame });
    };

    const closeFrameContextMenu = () => {
        setFrameContextMenu({ visible: false, x: 0, y: 0, nodeId: null, frame: null });
    };

    const sendFrameToChat = () => {
        const { frame } = frameContextMenu;
        if (!frame?.url) return;
        const newFile = {
            name: `Frame-${(frame.time ?? 0).toFixed(2)}s.png`,
            type: 'image/png',
            content: frame.url,
            isImage: true,
            isVideo: false,
            isAudio: false,
            fromHistory: true,
            fileExt: 'png'
        };
        setChatFiles(prev => [...prev, newFile]);
        setIsChatOpen(true);
        closeFrameContextMenu();
    };

    const sendFrameToCanvas = async () => {
        const { frame } = frameContextMenu;
        if (!frame?.url) return;

        let imageUrl = frame.url;

        // 如果是 Blob URL，转换为 data URL（避免项目保存后失效）
        if (imageUrl.startsWith('blob:')) {
            try {
                const base64 = await getBase64FromUrl(imageUrl);
                imageUrl = `data:image/png;base64,${base64}`;
            } catch (e) {
                console.error('⚠️ Blob URL 转换失败，使用原始 URL:', e);
            }
        }

        let dims;
        try {
            const real = await getImageDimensions(imageUrl);
            if (real?.w && real?.h) dims = { w: real.w, h: real.h };
        } catch (e) { }

        // V3.4.12: 修复层叠逻辑 - 找最后一个 input-image 节点位置作为基准
        const inputImageNodes = nodes.filter(n => n.type === 'input-image');
        let baseX, baseY;

        if (inputImageNodes.length > 0) {
            // 使用最后一个 input-image 节点的位置
            const lastNode = inputImageNodes[inputImageNodes.length - 1];
            baseX = lastNode.x - 40;  // 向左偏移
            baseY = lastNode.y + 35;  // 向下偏移
        } else {
            // 没有 input-image 节点时使用屏幕中心
            const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
            baseX = world.x + 50;
            baseY = world.y + 50;
        }

        // 检查目标位置是否有重叠，继续偏移
        let targetX = baseX;
        let targetY = baseY;
        const checkOverlap = (x, y) => nodes.some(n =>
            Math.abs(n.x - x) < 80 && Math.abs(n.y - y) < 80
        );
        let attempts = 0;
        while (checkOverlap(targetX, targetY) && attempts < 50) {
            targetX -= 40;
            targetY += 35;
            attempts++;
        }

        addNode('input-image', targetX, targetY, null, imageUrl, dims);
        closeFrameContextMenu();
    };

    const sendFrameToPreview = () => {
        const { frame } = frameContextMenu;
        if (!frame?.url) return;
        setNodes(prev => {
            // 优先使用当前选中的预览节点
            const selectedId = selectedNodeIdRef.current;
            const selectedIds = selectedNodeIdsRef.current;
            const previews = prev.filter(n => n.type === 'preview');
            if (!previews.length) return prev;

            // 先查找选中的预览节点
            let targetId = null;
            if (selectedId) {
                const selectedPreview = previews.find(p => p.id === selectedId);
                if (selectedPreview) targetId = selectedPreview.id;
            }
            if (!targetId && selectedIds && selectedIds.size > 0) {
                const selectedPreview = previews.find(p => selectedIds.has(p.id));
                if (selectedPreview) targetId = selectedPreview.id;
            }
            // 如果没有选中预览节点，则默认使用最后一个预览窗口
            if (!targetId) {
                targetId = previews[previews.length - 1].id;
            }

            return prev.map(n =>
                n.id === targetId
                    ? { ...n, content: frame.url, previewSourceNodeId: null, previewType: 'image', previewMjImages: null, previewFilename: '' }
                    : n
            );
        });
        closeFrameContextMenu();
    };

    const applyFrameToSelectedNode = () => {
        const { frame } = frameContextMenu;
        if (!frame?.url) return;
        const targetId = selectedNodeId;
        const targetNode = nodesMap.get(targetId);
        if (targetNode && targetNode.type === 'input-image') {
            setNodes(prev => prev.map(n => n.id === targetId ? { ...n, content: frame.url } : n));
        } else {
            canvasAlert(t('请先选择一个"图片输入"节点'));
        }
        closeFrameContextMenu();
    };

    const handleHistoryRightClick = (e, item, imageUrl = null, imageIndex = null) => {
        e.preventDefault();
        e.stopPropagation();
        // 如果提供了 imageUrl 和 imageIndex，说明是点击了多图中的某一张
        // 否则使用 item.url（单图情况）
        const selectedUrl = imageUrl ? resolveHistoryUrl(item, imageUrl) : resolveHistoryUrl(item);
        const selectedIndex = imageIndex !== null ? imageIndex : (item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : null);

        // 创建一个修改后的item，使用选中的图片URL
        const menuItem = {
            ...item,
            url: selectedUrl,
            selectedMjImageIndex: selectedIndex
        };

        const world = screenToWorld(e.clientX, e.clientY);
        setHistoryContextMenu({ visible: true, x: e.clientX, y: e.clientY, worldX: world.x, worldY: world.y, item: menuItem });
        setHistorySendMenuOpen(false);
    };

    const applyHistoryToSelectedNode = () => {
        const item = historyContextMenu.item;
        const targetId = selectedNodeId;
        const targetNode = nodesMap.get(targetId);
        const resolvedUrl = resolveHistoryUrl(item);

        if (targetNode && targetNode.type === 'input-image' && resolvedUrl) {
            setNodes(prev => prev.map(n => n.id === targetId ? { ...n, content: resolvedUrl } : n));
        } else {
            canvasAlert(t('请先选择一个"图片输入"节点'));
        }
        setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
    };

    const applyHistoryToActiveShot = (item) => {
        if (!activeShot.nodeId || !activeShot.shotId) return false;
        const imageUrl = resolveHistoryUrl(item);
        if (!imageUrl) return false;
        if (item.type === 'video' || isVideoUrl(imageUrl)) {
            showToast('当前分镜仅支持图片参考', 'warning');
            return false;
        }
        updateShot(activeShot.nodeId, activeShot.shotId, { image_url: imageUrl, image_filename: '' });
        return true;
    };

    const getDefaultNodeSize = useCallback((type) => {
        if (type === 'video-input') return { w: 580, h: 460 };
        if (type === 'input-image') return { w: 260, h: 260 };
        return { w: 260, h: 260 };
    }, []);

    const createLinkedInputNode = useCallback(async (targetNode, url, isVideo) => {
        if (!targetNode || !url) return false;
        const nodeType = isVideo ? 'video-input' : 'input-image';
        const size = getDefaultNodeSize(nodeType);
        const gap = 40;
        const worldX = targetNode.x - gap - size.w / 2;
        const worldY = targetNode.y + (targetNode.height / 2);

        let dims = undefined;
        if (!isVideo) {
            try {
                const metaUrl = await resolveUrlForMediaMeta(url);
                dims = await getImageDimensions(metaUrl);
            } catch { }
        }

        const newNode = addNode(nodeType, worldX, worldY, null, url, dims, targetNode.id);

        if (isVideo && newNode?.id) {
            try {
                const metaUrl = await resolveUrlForMediaMeta(url);
                const videoMeta = await getVideoMetadata(metaUrl);
                setNodes(prev => prev.map(n =>
                    n.id === newNode.id
                        ? { ...n, content: url, videoMeta, frames: [], selectedKeyframes: [], extractingFrames: false, videoFileName: '' }
                        : n
                ));
            } catch { }
        }

        return true;
    }, [addNode, getDefaultNodeSize, resolveUrlForMediaMeta, setNodes]);

    const applyHistoryToNode = (...args) => historyActions.applyHistoryToNode({
        createLinkedInputNode,
        getHistoryMultiImages,
        insertKeyframesFromUrls,
        normalizeHistoryVideoUrl,
        resolveHistoryUrl,
        resolveUrlForMediaMeta,
        setNodes,
        showToast,
    }, ...args);

    const handleVideoAnalyzeDrop = async (nodeId, e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetNode = nodesMap.get(nodeId);
        if (!targetNode) return;

        const payload = getHistoryDragPayload(e);
        if (payload) {
            const dragUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            if (dragUrl) {
                const isVideo = payload.type === 'video' || isVideoUrl(dragUrl);
                await createLinkedInputNode(targetNode, dragUrl, isVideo);
            }
            return;
        }

        const candidate = resolveDroppedUrlCandidate(getDragUrlCandidate(e));
        if (candidate) {
            await createLinkedInputNode(targetNode, candidate, isVideoUrl(candidate));
            return;
        }

        const files = Array.from(e.dataTransfer.files || []);
        const videoFile = files.find(file => file.type.startsWith('video/'));
        if (videoFile) {
            const size = getDefaultNodeSize('video-input');
            const gap = 40;
            const worldX = targetNode.x - gap - size.w / 2;
            const worldY = targetNode.y + (targetNode.height / 2);
            const newNode = addNode('video-input', worldX, worldY, null, undefined, undefined, targetNode.id);
            if (newNode?.id) {
                handleVideoFileUpload(newNode.id, videoFile);
            }
            return;
        }

        const imageFile = files.find(file => file.type.startsWith('image/'));
        if (imageFile) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const content = ev.target.result;
                if (content) {
                    await createLinkedInputNode(targetNode, content, false);
                }
            };
            reader.readAsDataURL(imageFile);
        }
    };

    const handleGenNodeDrop = (...args) => historyActions.handleGenNodeDrop({
        createLinkedInputNode,
        getDragUrlCandidate,
        getHistoryDragPayload,
        nodesMap,
        resolveDroppedUrlCandidate,
        resolveHistoryPayloadUrl,
        showToast,
    }, ...args);

    const sendHistoryToCanvas = (...args) => historyActions.sendHistoryToCanvas({
        addNode,
        historyContextMenu,
        nodes,
        resolveHistoryUrl,
        screenToWorld,
        setHistoryContextMenu,
        setHistorySendMenuOpen,
    }, ...args);

    const sendHistoryToChat = () => {
        const item = historyContextMenu.item;
        const resolvedUrl = resolveHistoryUrl(item, item?.url || item?.originalUrl || item?.mjOriginalUrl || null);
        if (!item || !resolvedUrl) return;

        // 确保正确识别图片和视频类型
        const isImage = item.type === 'image';
        const isVideo = item.type === 'video';
        const fileExt = isImage ? 'png' : (isVideo ? 'mp4' : 'file');
        const mimeType = isImage ? 'image/png' : (isVideo ? 'video/mp4' : 'application/octet-stream');

        const newFile = {
            name: `Generated-${item.id}.${fileExt}`,
            type: mimeType,
            content: resolvedUrl,
            isImage,
            isVideo,
            isAudio: false,
            fromHistory: true,
            fileExt
        };

        setChatFiles(prev => [...prev, newFile]);
        setIsChatOpen(true);
        setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
        setHistorySendMenuOpen(false);
    };

    const sendHistoryToPreview = () => {
        const item = historyContextMenu.item;
        const resolvedUrl = resolveHistoryUrl(item, item?.url || item?.originalUrl || item?.mjOriginalUrl || null);
        if (!resolvedUrl) return;
        const previewImages = item?.mjImages && item.mjImages.length > 1 ? item.mjImages : null;
        const selectedIndex = item?.selectedMjImageIndex ?? 0;
        const previewUrl = previewImages ? (previewImages[selectedIndex] || previewImages[0] || resolvedUrl) : resolvedUrl;
        setNodes(prev => {
            const previews = prev.filter(n => n.type === 'preview');
            if (!previews.length) return prev;
            const selectedId = selectedNodeIdRef.current;
            const selectedIds = selectedNodeIdsRef.current;
            let targetId = null;
            if (selectedId) {
                const selectedPreview = previews.find(p => p.id === selectedId);
                if (selectedPreview) targetId = selectedPreview.id;
            }
            if (!targetId && selectedIds && selectedIds.size > 0) {
                const selectedPreview = previews.find(p => selectedIds.has(p.id));
                if (selectedPreview) targetId = selectedPreview.id;
            }
            if (!targetId) targetId = previews[previews.length - 1].id;

            return prev.map(n =>
                n.id === targetId
                    ? {
                        ...n,
                        content: previewUrl,
                        previewType: item.type === 'video' || isVideoUrl(previewUrl) ? 'video' : 'image',
                        previewSourceNodeId: null,
                        previewMjImages: previewImages
                    }
                    : n
            );
        });
        setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
        setHistorySendMenuOpen(false);
    };

    const resolvePrimarySelectedNodeId = () => {
        if (selectedNodeIdRef.current) return selectedNodeIdRef.current;
        if (selectedNodeIdsRef.current && selectedNodeIdsRef.current.size > 0) {
            return [...selectedNodeIdsRef.current][0];
        }
        return null;
    };

    const applyHistoryPromptToNode = (...args) => historyActions.applyHistoryPromptToNode({
        nodesMap,
        updateNodeSettings,
    }, ...args);

    const sendHistoryPromptSmart = async () => {
        const item = historyContextMenu.item;
        const promptText = String(item?.prompt || '').trim();
        if (!promptText) {
            showToast('该历史记录无可发送提示词', 'warning', 2800);
            setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
            setHistorySendMenuOpen(false);
            return;
        }

        if (activeShot.nodeId && activeShot.shotId) {
            const activeNode = nodesMap.get(activeShot.nodeId);
            if (activeNode?.type === 'storyboard-node') {
                updateShot(activeShot.nodeId, activeShot.shotId, { prompt: promptText });
                focusStoryboardShotCard(activeShot.nodeId, activeShot.shotId);
                showToast('已发送提示词到激活镜头', 'success', 2200);
                setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
                setHistorySendMenuOpen(false);
                return;
            }
        }

        const targetNodeId = resolvePrimarySelectedNodeId();
        if (targetNodeId) {
            const result = applyHistoryPromptToNode(targetNodeId, promptText);
            if (result.applied) {
                if (result.target === 'script') {
                    showToast('已发送提示词到激活脚本', 'success', 2200);
                } else {
                    showToast('已发送提示词到激活节点', 'success', 2200);
                }
                setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
                setHistorySendMenuOpen(false);
                return;
            }
        }

        try {
            await navigator.clipboard.writeText(promptText);
            showToast('未检测到激活节点，提示词已复制到剪贴板', 'info', 2800);
        } catch (error) {
            console.error('复制历史提示词失败:', error);
            showToast('复制提示词失败，请手动复制', 'error', 3000);
        }
        setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
        setHistorySendMenuOpen(false);
    };

    const sendHistorySmart = async () => {
        const item = historyContextMenu.item;
        if (!item) return;

        const chatRecent = lastInteractionRef.current.target === 'chat' && (Date.now() - lastInteractionRef.current.at) < 3000;
        if (isChatInputFocused || isChatHovered || chatRecent) {
            sendHistoryToChat();
            return;
        }

        const targetId = resolvePrimarySelectedNodeId();
        if (targetId) {
            const targetNode = nodesMap.get(targetId);
            if (targetNode) {
                if (targetNode.type === 'storyboard-node') {
                    if (activeShot.nodeId && activeShot.shotId) {
                        const handled = applyHistoryToActiveShot(item);
                        if (handled) {
                            setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
                            setHistorySendMenuOpen(false);
                            return;
                        }
                    }
                    showToast('请先选中分镜中的镜头', 'warning');
                    return;
                }

                const handled = await applyHistoryToNode(targetNode, item);
                if (handled) {
                    setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
                    setHistorySendMenuOpen(false);
                    return;
                }
            }
        }

        if (activeShot.nodeId && activeShot.shotId) {
            const handled = applyHistoryToActiveShot(item);
            if (handled) {
                setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
                setHistorySendMenuOpen(false);
                return;
            }
        }

        sendHistoryToCanvas();
    };

    // V3.5.0: 批量下载 (ZIP打包 / 单文件直接下载)
    const handleHistoryBatchDownload = async (items) => {
        await downloadSelectedHistory({
            items,
            resolveHistoryUrl,
            setDownloadProgress,
            alertMessage: (message) => canvasAlert(message),
            fetchBlob: async (url, item) => {
                const useProxy = getItemProxyPreference(item);
                const { blob } = await fetchCacheSource(url, { useProxy });
                return blob;
            }
        });
    };

    const buildStoryboardDownloadItems = (...args) => historyActions.buildStoryboardDownloadItems({
        getDataUrlExt,
        getUrlExt,
        sanitizeCacheId,
    }, ...args);

    const handleStoryboardBatchDownload = (...args) => historyActions.handleStoryboardBatchDownload({
        buildStoryboardDownloadItems,
        sanitizeCacheId,
        setDownloadProgress,
    }, ...args);


    const handlePreviewRightClick = (e, item) => {
        if (!item?.url) return;
        e.preventDefault();
        e.stopPropagation();
        setPreviewContextMenu({ visible: true, x: e.clientX, y: e.clientY, item });
    };
    const closePreviewContextMenu = () => setPreviewContextMenu({ visible: false, x: 0, y: 0, item: null });

    const sendPreviewToChat = () => {
        const item = previewContextMenu.item;
        if (!item?.url) return;
        const isImage = item.type !== 'video';
        const isVideo = item.type === 'video';
        const fileExt = isImage ? 'png' : 'mp4';
        const mimeType = isImage ? 'image/png' : 'video/mp4';
        const newFile = { name: `Preview-${Date.now()}.${fileExt}`, type: mimeType, content: item.url, isImage, isVideo, isAudio: false, fileExt };
        setChatFiles(prev => [...prev, newFile]);
        setIsChatOpen(true);
        closePreviewContextMenu();
    };

    const sendPreviewToCanvas = async () => {
        const item = previewContextMenu.item;
        if (!item?.url) return;
        const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
        let dims = { w: 512, h: 512 };
        try { dims = await getImageDimensions(item.url); } catch (e) { console.warn('Preview dims fail', e); }
        addNode('input-image', world.x + 50, world.y + 50, null, item.url, dims);
        closePreviewContextMenu();
    };

    // 图片输入节点右键菜单处理
    const handleInputImageRightClick = (e, nodeId) => {
        e.preventDefault();
        e.stopPropagation();
        const node = nodesMap.get(nodeId);
        if (!node || !node.content) return;
        setInputImageContextMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId });
    };

    const closeInputImageContextMenu = () => {
        setInputImageContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    };

    const sendInputImageToChat = () => {
        const nodeId = inputImageContextMenu.nodeId;
        const node = nodesMap.get(nodeId);
        if (!node || !node.content) return;

        const isImage = !isVideoUrl(node.content);
        const isVideo = isVideoUrl(node.content);
        const fileExt = isImage ? 'png' : 'mp4';
        const mimeType = isImage ? 'image/png' : 'video/mp4';
        const newFile = {
            name: `InputImage-${Date.now()}.${fileExt}`,
            type: mimeType,
            content: node.content,
            isImage,
            isVideo,
            isAudio: false,
            fileExt
        };
        setChatFiles(prev => [...prev, newFile]);
        setIsChatOpen(true);
        closeInputImageContextMenu();
    };

    // 使用 useMemo 缓存节点的连接状态，避免每次渲染时重复计算
    const nodeConnectedStatus = useMemo(() => {
        const status = new Map(); // 映射关系：nodeId -> boolean
        connections.forEach(conn => {
            if (!conn.inputType || conn.inputType === 'default') {
                status.set(conn.to, true);
            }
        });
        return status;
    }, [connections]);

    // 功能3：获取相邻节点（上游和下游）- 使用缓存的连接映射优化性能
    const getAdjacentNodes = useCallback((nodeId) => {
        const adjacent = new Set();
        const fromConns = connectionsByNode.from.get(nodeId) || [];
        const toConns = connectionsByNode.to.get(nodeId) || [];
        fromConns.forEach(conn => adjacent.add(conn.to));
        toConns.forEach(conn => adjacent.add(conn.from));
        return adjacent;
    }, [connectionsByNode]);

    // 缓存相邻节点集合，避免在renderNode中重复计算
    const adjacentNodesCache = useMemo(() => {
        const cache = new Map();
        if (selectedNodeId || selectedNodeIds.size > 0) {
            const selectedId = selectedNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
            if (selectedId) {
                cache.set(selectedId, getAdjacentNodes(selectedId));
            }
        }
        return cache;
    }, [selectedNodeId, selectedNodeIds, getAdjacentNodes]);
    const resolveNodeRenderZIndex = useCallback((nodeId, dragging = false, selected = false) => {
        const order = nodeSelectionPriority[nodeId];
        const base = Number.isFinite(order)
            ? 1000 + order
            : 100;
        const selectedBoost = selected ? 2000 : 0;
        return dragging ? base + selectedBoost + 5000 : (base + selectedBoost);
    }, [nodeSelectionPriority]);

    // During pointer gestures, reuse node DOM only while its semantic/UI state is unchanged.
    const nodeRenderState = useMemo(() => ({}), [
        nodes, connections, history, apiConfigs, characterLibrary, theme, language,
        activeDropdown, activeShot, batchConcurrency, batchQueueItems, batchRunningItems,
        characterReferenceBarExpanded, cloudDocument, canvasCloud.textModels, canvasCloud.textReady, canvasCloud.publishReady,
        connectingInputType, connectingSource, connectingTarget, dragInsertIndex, dragInsertNodeId,
        dragNodeId, dragOverNodeId, hoverTargetId, hoveredProvider, selectedNodeId, selectedNodeIds,
        lastUsedImageModel, lastUsedImageResolution, lastUsedVideoModel, lastUsedVideoResolution,
        localCacheServerConnected, localServerUrl, nodeConnectedStatus, nodeSelectionPriority,
        nodeTimers, shotTimers, promptLibrary, promptLibraryCollapsed, promptLibraryEditorOpen, promptLibraryForm,
        groupedApiConfigs, createCharacterEndpoint, view.zoom < 1,
    ]);

    const renderNode = useCallback(renderCanvasNode.createNodeRenderer({
        sendPreviewToCanvas: insertPreviewNode,
        generateFullWorkflow,
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
    }), [nodeRenderState, selectedNodeId, selectedNodeIds, hoverTargetId, nodeConnectedStatus, adjacentNodesCache, apiConfigsMap, getConnectedInputImages, theme, view, dragNodeId, connectingSource, connectingTarget, connectingInputType, deleteNode, handleNodeMouseUp, screenToWorld, setDragNodeId, setSelectedNodeId, setSelectedNodeIds, setActiveDropdown, setHoverTargetId, setConnectingSource, setConnectingTarget, setConnectingInputType, setResizingNodeId, setLightboxItem, isVideoUrl, updateNodeSettings, getConnectedTextNodes, startGeneration, getDefaultDurationForModel, getDefaultDurationsForModel, getConnectedGenNodes, getConnectedVideoInputNode, getConnectedVideoAnalyzeNode, handleCanvasDragOver, handleGenNodeDrop, importStoryboardMarkdownTable, importStoryboardTableFromFile, mutateStoryboardTable, normalizeStoryboardTableData, openStoryboardTableCellEditor, runStoryboardTablePromptMerge, markInteraction, resolveNodeRenderZIndex, touchNodeSelectionPriority, beginNodeDragSession]);

    // 高性能模式：当节点数量超过 50 或手动开启时启用
    const isPerfMode = nodes.length > 50 || globalPerformanceMode !== 'off';
    const selectedNodeIdForAdjacency = useMemo(() => {
        if (selectedNodeId) return selectedNodeId;
        if (selectedNodeIds.size === 1) return selectedNodeIds.values().next().value;
        return null;
    }, [selectedNodeId, selectedNodeIds]);
    const selectedAdjacentSet = selectedNodeIdForAdjacency ? adjacentNodesCache.get(selectedNodeIdForAdjacency) : null;

    // 交互模式：拖拽、平移、缩放、框选、连线时启用节点渲染边界
    const isInteracting = !!(isZooming || isDragging || isPanning || dragNodeId || resizingNodeId || isSelecting || connectingSource || connectingTarget);
    const isLowDetail = view.zoom < 0.4;

    return <><CanvasDialogHost theme={theme} language={language} /><TapnowAppView {...{
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
    }} /></>;
}

export default TapnowApp;
