// 全局屏蔽滚轮事件相关的控制台错误（在 React 渲染之前设置）
(function () {
    if (window.parent === window) return;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalLog = console.log;

    const shouldFilter = (args) => {
        // 检查所有参数，包括字符串、对象、错误等
        for (let arg of args) {
            let msg = '';
            if (typeof arg === 'string') {
                msg = arg;
            } else if (arg && typeof arg === 'object') {
                // 检查错误对象的 message 属性
                if (arg.message) msg = arg.message;
                else if (arg.toString) msg = arg.toString();
                else msg = JSON.stringify(arg);
            } else if (arg !== null) {
                msg = String(arg);
            }

            // 精确匹配 passive 事件监听器相关的错误
            if (msg.includes('Unable to preventDefault inside passive event listener') ||
                msg.includes('passive event listener invocation') ||
                (msg.includes('preventDefault') && msg.includes('passive'))) {
                return true;
            }
        }
        return false;
    };

    console.error = function (...args) {
        if (shouldFilter(args)) return;
        originalError.apply(console, args);
    };

    console.warn = function (...args) {
        if (shouldFilter(args)) return;
        originalWarn.apply(console, args);
    };

    console.log = function (...args) {
        if (shouldFilter(args)) return;
        originalLog.apply(console, args);
    };
})();

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
// V3.5.20-1: Direct icon imports for better performance (eliminates wrapper overhead)
import {
    Plus, Image as ImageIcon, Video, Settings, X, Play, Layers, MousePointer2, Wand2, Loader2,
    Link as LinkIcon, History, ImagePlus, Trash2, Edit2, CheckCircle2, Square, Circle, Unlink, CopyPlus,
    ArrowRightSquare, MessageSquare, Send, Paperclip, FileText, FileAudio, FileVideo, FileImage,
    ChevronRight, ChevronLeft, MoreHorizontal, Bot, User, Users, GripVertical, Forward, RefreshCw,
    RotateCcw, RotateCw, Split, ChevronsUp, ChevronsDown, Maximize2, Sun, Moon, FileSearch,
    Sparkles, Mic, Mic2, Camera, Code, ClipboardCopy, Edit, LayoutGrid, Check, CheckSquare, Eye,
    Scissors, Layout, Download, Save, FolderOpen, Brush, Undo2, Eraser, HardDrive, ChevronDown, ChevronUp, UploadCloud,
    Monitor,
    Zap, // V3.5.24
    Ban, Clock, Edit3, Pencil // V3.7.24: API management buttons + V3.7.25: Edit icons
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import i18n, { normalizeCanvasLanguage, toReelmaxLanguage } from './i18n';
import {
    activeCanvasStorage,
    configureCanvasRuntime,
    createCanvasStorage,
    getCanvasDatabaseName
} from './jellyfishRuntime';

const localStorage = activeCanvasStorage;

const DEFAULT_VIEW = { x: 0, y: 0, zoom: 1 };
const t = i18n.t.bind(i18n);


// --- MaskVisualFeedback 组件：蒙版视觉反馈层 ---
const MaskVisualFeedback = ({ canvasRef, isDrawing }) => {
    const [maskUrl, setMaskUrl] = useState('');
    const rafRef = useRef(null);

    const updateMask = useCallback(() => {
        if (canvasRef.current) {
            setMaskUrl(canvasRef.current.toDataURL());
        }
    }, [canvasRef]);

    // 初始更新
    useEffect(() => {
        if (!canvasRef.current) return;
        updateMask();
    }, [canvasRef, updateMask]);

    // 仅在绘制时使用 requestAnimationFrame 更新
    useEffect(() => {
        if (!isDrawing) {
            // 绘制结束时更新一次
            updateMask();
            return;
        }

        // 绘制中：使用 requestAnimationFrame 更新
        const animate = () => {
            updateMask();
            if (isDrawing) {
                rafRef.current = requestAnimationFrame(animate);
            }
        };

        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [isDrawing, updateMask]);

    if (!maskUrl) return null;

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{
                background: 'rgba(255, 0, 0, 0.3)',
                mixBlendMode: 'multiply',
                WebkitMaskImage: `url(${maskUrl})`,
                maskImage: `url(${maskUrl})`,
                WebkitMaskSize: '100% 100%',
                maskSize: '100% 100%',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
            }}
        />
    );
};

// --- V3.5.16: LocalImageManager - IndexedDB-based image storage ---
// Replaces localStorage Base64 storage with IndexedDB for better performance and larger capacity
const LocalImageManager = (() => {
    const DB_NAME = 'tapnow_images_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'images';
    let dbInstance = null;
    let dbInitPromise = null;
    const blobUrlCache = new Map(); // Cache: id -> blobUrl
    let workspaceId = null;

    const initDB = () => {
        if (dbInitPromise) return dbInitPromise;

        dbInitPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('[LocalImageManager] IndexedDB not supported, falling back to memory');
                resolve(null);
                return;
            }

            const request = window.indexedDB.open(getCanvasDatabaseName(DB_NAME), DB_VERSION);

            request.onerror = (event) => {
                console.error('[LocalImageManager] IndexedDB init failed:', event.target.error);
                resolve(null);
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                console.log('[LocalImageManager] IndexedDB initialized');
                resolve(dbInstance);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('[LocalImageManager] Object store created');
                }
            };
        });

        return dbInitPromise;
    };

    // Generate unique ID for image
    const generateId = () => `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Save image (Base64 or Blob) to IndexedDB
    const saveImage = async (data, existingId = null) => {
        const db = await initDB();
        if (!db) return null;

        const id = existingId || generateId();

        return new Promise((resolve, reject) => {
            try {
                let blob;
                if (typeof data === 'string' && data.startsWith('data:')) {
                    // Convert Base64 to Blob
                    const parts = data.split(',');
                    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
                    const binaryStr = atob(parts[1]);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    blob = new Blob([bytes], { type: mime });
                } else if (data instanceof Blob) {
                    blob = data;
                } else {
                    console.warn('[LocalImageManager] Invalid data type for saveImage');
                    resolve(null);
                    return;
                }

                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                const record = {
                    id,
                    blob,
                    timestamp: Date.now(),
                    size: blob.size
                };

                const request = store.put(record);

                request.onsuccess = () => {
                    resolve(id);
                };

                request.onerror = (event) => {
                    console.error('[LocalImageManager] Save failed:', event.target.error);
                    resolve(null);
                };
            } catch (err) {
                console.error('[LocalImageManager] Save error:', err);
                resolve(null);
            }
        });
    };

    // Get image as Blob URL from IndexedDB
    const getImage = async (id) => {
        // Check cache first
        if (blobUrlCache.has(id)) {
            return blobUrlCache.get(id);
        }

        const db = await initDB();
        if (!db) return null;

        return new Promise((resolve) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(id);

                request.onsuccess = () => {
                    const record = request.result;
                    if (record && record.blob) {
                        // V3.7.32 Fix: Use FileReader to return Base64 avoiding blob:null security error in file:// protocol
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const base64 = reader.result;
                            blobUrlCache.set(id, base64);
                            resolve(base64);
                        };
                        reader.onerror = () => {
                            console.error('[LocalImageManager] Failed to convert blob to base64');
                            resolve(null);
                        };
                        reader.readAsDataURL(record.blob);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => resolve(null);
            } catch (err) {
                console.error('[LocalImageManager] Get error:', err);
                resolve(null);
            }
        });
    };

    // Delete image from IndexedDB
    const deleteImage = async (id) => {
        const db = await initDB();
        if (!db) return false;

        // Revoke cached blob URL (only if it is a blob url)
        if (blobUrlCache.has(id)) {
            const url = blobUrlCache.get(id);
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
            blobUrlCache.delete(id);
        }

        return new Promise((resolve) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    };

    // Get storage stats
    const getStats = async () => {
        const db = await initDB();
        if (!db) return { count: 0, totalSize: 0 };

        return new Promise((resolve) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const records = request.result || [];
                const totalSize = records.reduce((sum, r) => sum + (r.size || 0), 0);
                resolve({ count: records.length, totalSize });
            };

            request.onerror = () => resolve({ count: 0, totalSize: 0 });
        });
    };

    // Check if ID is an image reference
    const isImageId = (str) => typeof str === 'string' && str.startsWith('img_');

    // V3.7.19: Removed auto-init on module load - now lazy-loaded on first use
    // initDB();

    const setWorkspace = (nextWorkspaceId) => {
        const normalizedWorkspaceId = nextWorkspaceId || 'default';
        if (workspaceId === normalizedWorkspaceId) return;
        workspaceId = normalizedWorkspaceId;
        if (dbInstance) {
            try { dbInstance.close(); } catch (e) { /* empty */ }
        }
        dbInstance = null;
        dbInitPromise = null;
        blobUrlCache.forEach((url) => {
            if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        blobUrlCache.clear();
    };

    return { saveImage, getImage, deleteImage, getStats, isImageId, initDB, setWorkspace };
})();

// Keep the image manager scoped to the canvas runtime.


const normalizeDataUrl = (value) => {
    if (!value || typeof value !== 'string') return value;
    if (!value.startsWith('data:')) return value;
    const cleaned = value.replace(/\s+/g, '');
    const match = cleaned.match(/^data:([^;,]+)(;base64)?,(.*)$/i);
    if (!match) return cleaned;
    const mime = match[1] || 'application/octet-stream';
    const isBase64 = !!match[2];
    if (!isBase64) return cleaned;
    const payload = normalizeBase64Payload(match[3] || '');
    if (!payload) return cleaned;
    return `data:${mime};base64,${payload}`;
};

const normalizeBase64Payload = (value) => {
    if (!value) return '';
    let cleaned = value.replace(/\s+/g, '');
    if (/%[0-9A-Fa-f]{2}/.test(cleaned)) {
        try {
            cleaned = decodeURIComponent(cleaned);
        } catch (e) {
            // Keep original when decode fails.
        }
    }
    cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, '');
    const pad = cleaned.length % 4;
    if (pad) cleaned += '='.repeat(4 - pad);
    return cleaned;
};

const dataUrlToBlob = (dataUrl) => {
    const normalized = normalizeDataUrl(dataUrl);
    const match = normalized.match(/^data:([^;,]+)(;base64)?,(.*)$/i);
    if (!match) return null;
    const mime = match[1] || 'application/octet-stream';
    const isBase64 = !!match[2];
    let data = match[3] || '';
    if (!isBase64) {
        try {
            return new Blob([decodeURIComponent(data)], { type: mime });
        } catch (e) {
            return new Blob([data], { type: mime });
        }
    }
    data = normalizeBase64Payload(data);
    let binary = '';
    try {
        binary = atob(data);
    } catch (e) {
        return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
};

const truncateByBytes = (value, maxBytes) => {
    if (!value || !maxBytes || maxBytes <= 0) return value || '';
    const encoder = new TextEncoder();
    let used = 0;
    let output = '';
    for (const ch of value) {
        const size = encoder.encode(ch).length;
        if (used + size > maxBytes) break;
        output += ch;
        used += size;
    }
    if (output.length < value.length) return `${output}...`;
    return output;
};

// --- LazyBase64Image 组件：将 Base64 转换为 Blob URL 的智能图片组件 ---
const LazyBase64Image = ({ src, className, alt, onError, onLoad, ...props }) => {
    const [blobUrl, setBlobUrl] = useState(null);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false); // V3.5.39: Add loading state for IDB images
    const blobUrlRef = useRef(null);

    useEffect(() => {
        let active = true;
        // src 变更时先清空旧图，避免“新图未加载时仍显示上一张”
        if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(blobUrlRef.current);
        }
        blobUrlRef.current = null;
        setError(false);
        setBlobUrl(null);
        // 如果已经是 Blob URL 或 HTTP URL，直接使用
        if (!src || src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) {
            if (active) {
                setBlobUrl(src);
                setLoading(false);
            }
            return () => { active = false; };
        }

        // V3.5.16: If it's an IndexedDB image reference (img_xxx), resolve it
        if (LocalImageManager.isImageId(src)) {
            // V3.5.39: Set loading state to prevent rendering invalid src
            setLoading(true);
            const resolveFromIDB = async () => {
                try {
                    const url = await LocalImageManager.getImage(src);
                    if (!active) return;
                    if (url) {
                        blobUrlRef.current = url;
                        setBlobUrl(url);
                    } else {
                        const fallback = getAssetBundleFallbackById(src);
                        if (fallback) {
                            blobUrlRef.current = fallback;
                            setBlobUrl(fallback);
                        } else {
                            console.warn(`[LazyBase64Image] Image not found in IDB: ${src}`);
                            setError(true);
                        }
                    }
                } catch (err) {
                    if (!active) return;
                    console.error('[LazyBase64Image] IDB resolve failed:', err);
                    setError(true);
                }
                if (active) setLoading(false);
            };
            resolveFromIDB();
            return () => { active = false; };
        }

        // 如果是 Base64 Data URL，优先直用（file:// 下避免 blob: 安全限制）
        if (src.startsWith('data:')) {
            const normalized = normalizeDataUrl(src);
            const isFileProtocol = typeof window !== 'undefined' && window.location?.protocol === 'file:';
            if (isFileProtocol) {
                if (active) {
                    blobUrlRef.current = normalized;
                    setBlobUrl(normalized);
                    setLoading(false);
                }
                return () => { active = false; };
            }
            const convertToBlobUrl = async () => {
                try {
                    const blob = dataUrlToBlob(normalized);
                    if (!active) return;
                    if (!blob) {
                        setError(true);
                        setBlobUrl(null);
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    blobUrlRef.current = url;
                    setBlobUrl(url);
                } catch (err) {
                    if (!active) return;
                    console.warn('Base64转Blob失败', err);
                    setError(true);
                    setBlobUrl(null);
                }
            };
            convertToBlobUrl();
        } else {
            setBlobUrl(src);
        }

        // 清理函数：组件卸载时释放 Blob URL
        return () => {
            active = false;
            if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [src]);

    // V3.5.39: Don't render while loading IDB image to prevent 404 on "img_xxx"
    if (loading) {
        return null;
    }

    if (error && !blobUrl) {
        return null;
    }

    // V3.5.39: Only render if blobUrl is valid (not an img_xxx string)
    if (!blobUrl || LocalImageManager.isImageId(blobUrl)) {
        return null;
    }

    return (
        <img
            src={blobUrl}
            className={className}
            alt={alt}
            onError={onError}
            onLoad={onLoad}
            {...props}
        />
    );
};

const ResolvedVideo = ({ src, className, onError, onLoadedMetadata, ...props }) => {
    const [resolvedSrc, setResolvedSrc] = useState('');
    useEffect(() => {
        let active = true;
        setResolvedSrc('');
        if (!src) {
            return () => { active = false; };
        }
        if (LocalImageManager.isImageId(src)) {
            (async () => {
                const dataUrl = await LocalImageManager.getImage(src);
                if (!active) return;
                if (dataUrl) {
                    setResolvedSrc(dataUrl);
                } else {
                    const fallback = getAssetBundleFallbackById(src);
                    setResolvedSrc(fallback || '');
                }
            })();
            return () => { active = false; };
        }
        setResolvedSrc(src);
        return () => { active = false; };
    }, [src]);

    if (!resolvedSrc) return null;

    return (
        <video
            src={resolvedSrc}
            className={className}
            onError={onError}
            onLoadedMetadata={onLoadedMetadata}
            {...props}
        />
    );
};

const HistoryMjImageCell = memo(({
    item,
    idx,
    imgUrl,
    displayImgUrl,
    theme,
    canDrag,
    lightboxItem,
    onImageClick,
    onImageContextMenu,
    onCacheMissing,
    handleDragStart,
    language
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        setIsLoaded(false);
        setLoadFailed(false);
    }, [displayImgUrl]);

    const isActive = item.selectedMjImageIndex === idx && lightboxItem && lightboxItem.id === item.id;
    const placeholderClass = theme === 'dark' ? 'text-zinc-500' : 'text-[#616161]';

    return (
        <div
            onClick={(e) => onImageClick && onImageClick(e, item, imgUrl, idx)}
            onContextMenu={(e) => onImageContextMenu && onImageContextMenu(e, item, imgUrl, idx)}
            onDragStart={(e) => {
                if (!canDrag) return;
                e.stopPropagation();
                handleDragStart(e, imgUrl);
            }}
            draggable={canDrag}
            className={`relative w-full h-full cursor-pointer border-2 transition-all overflow-hidden ${isActive
                ? 'border-blue-500 scale-95'
                : 'border-transparent hover:border-blue-500/50'
                }`}
        >
            <LazyBase64Image
                src={displayImgUrl}
                loading="lazy"
                className="w-full h-full object-contain"
                alt=""
                onLoad={() => {
                    setIsLoaded(true);
                    setLoadFailed(false);
                }}
                onError={(e) => {
                    setIsLoaded(false);
                    setLoadFailed(true);
                    console.error(`图片 ${idx + 1} 加载失败`);
                    onCacheMissing && onCacheMissing(item.id, displayImgUrl);
                    e.target.style.display = 'none';
                }}
            />
            {!isLoaded && (
                <div
                    className={`absolute inset-0 flex items-center justify-center text-[12px] ${loadFailed ? 'text-red-400' : placeholderClass} pointer-events-none select-none`}
                    style={{ fontFamily: '"Microsoft YaHei","微软雅黑","KaiTi","楷体",serif' }}
                >
                    {loadFailed ? t('加载失败') : `${t('图片')}${idx + 1}`}
                </div>
            )}
            {isActive && (
                <div className="absolute top-1 right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center z-10">
                    <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                </div>
            )}
        </div>
    );
});
HistoryMjImageCell.displayName = 'HistoryMjImageCell';

const TagListEditor = ({
    label,
    values,
    onChange,
    placeholder,
    addLabel = '+',
    formatItem = (value) => value,
    disabled = false,
    inputDisabled = false,
    theme = 'dark',
    allowAll = false,
    allowAllLabel = '',
    onToggleAll = null,
    normalizeItem = (value) => value,
    maxItems = Infinity,
    allLabelPosition = 'right',
    headerLeft = null,
    headerRight = null
}) => {
    const [inputValue, setInputValue] = useState('');
    const list = Array.isArray(values) ? values : [];
    const listDisabled = disabled || inputDisabled;
    const maxCount = Number.isFinite(maxItems) ? maxItems : Infinity;
    const isMaxed = list.length >= maxCount;

    const addValues = () => {
        if (listDisabled) return;
        if (isMaxed) return;
        const raw = inputValue.trim();
        if (!raw) return;
        const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
        if (parts.length === 0) return;
        const next = [...list];
        parts.forEach((part) => {
            const normalized = normalizeItem(part);
            if (next.length >= maxCount) return;
            if (normalized && !next.includes(normalized)) {
                next.push(normalized);
            }
        });
        onChange(next);
        setInputValue('');
    };

    const removeValue = (value) => {
        if (listDisabled) return;
        onChange(list.filter(item => item !== value));
    };

    const allLabelNode = allowAllLabel ? (
        <label className={`flex items-center gap-1 text-[9px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>
            <input
                type="checkbox"
                checked={!!allowAll}
                onChange={(e) => onToggleAll && onToggleAll(e.target.checked)}
                disabled={disabled}
            />
            <span>{allowAllLabel}</span>
        </label>
    ) : null;
    const hasRightHeader = (allLabelPosition !== 'left' && !!allLabelNode) || !!headerRight;
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <label className={`text-[9px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{label}</label>
                    {Number.isFinite(maxCount) && maxCount !== Infinity && (
                        <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-500'}`}>({list.length}/{maxCount})</span>
                    )}
                    {headerLeft}
                    {allLabelPosition === 'left' && allLabelNode}
                </div>
                {hasRightHeader && (
                    <div className="flex items-center gap-2">
                        {allLabelPosition !== 'left' && allLabelNode}
                        {headerRight}
                    </div>
                )}
            </div>
            <div className="flex flex-wrap gap-1 min-h-[18px]">
                {list.length > 0 ? list.map((item) => (
                    <span
                        key={item}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] ${theme === 'dark'
                            ? 'bg-zinc-800 text-zinc-300'
                            : 'bg-zinc-100 text-zinc-600'
                            }`}
                    >
                        {formatItem(item)}
                        {!listDisabled && (
                            <button
                                onClick={() => removeValue(item)}
                                className={`${theme === 'dark' ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-400 hover:text-red-500'}`}
                            >
                                x
                            </button>
                        )}
                    </span>
                )) : (
                    <span className={`text-[9px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>未设置</span>
                )}
            </div>
            <div className="flex items-center gap-1">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addValues();
                        }
                    }}
                    placeholder={placeholder}
                    disabled={listDisabled}
                    className={`flex-1 rounded px-2 py-1 text-[10px] outline-none border ${theme === 'dark'
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        : 'bg-white border-zinc-300 text-zinc-900'
                        }`}
                />
                <button
                    onClick={addValues}
                    disabled={listDisabled || !inputValue.trim() || isMaxed}
                    className={`px-2 py-1 rounded text-[10px] ${listDisabled || !inputValue.trim() || isMaxed
                        ? theme === 'dark'
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                        : theme === 'dark'
                            ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                            : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                        }`}
                >
                    {addLabel}
                </button>
            </div>
        </div>
    );
};

// --- 极简艺术进度条组件 (Centered & Artistic) ---
const ArtisticProgress = ({ visible, progress, status, type }) => {
    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300 pointer-events-none select-none">
            <div className="relative bg-[#09090b]/90 border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col items-center min-w-[300px] backdrop-blur-xl">
                {/* 装饰性光晕 */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-blue-500/20 blur-[50px] rounded-full pointer-events-none" />

                {/* 标题与百分比 */}
                <div className="flex flex-col items-center gap-1 mb-6 z-10">
                    <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-zinc-500">
                        {type === 'import' ? 'DATA INGESTION' : 'SYSTEM ARCHIVING'}
                    </span>
                    <div className="text-4xl font-bold text-zinc-200 tracking-tighter font-sans">
                        {progress.toFixed(0)}<span className="text-sm text-zinc-500 ml-1">%</span>
                    </div>
                </div>

                {/* 进度条轨道 */}
                <div className="relative w-full h-[2px] bg-zinc-800 rounded-full overflow-hidden mb-4">
                    <div
                        className="absolute top-0 left-0 h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-100 ease-linear"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* 状态文本 */}
                <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase animate-pulse">
                    {status}
                </span>
            </div>
        </div>
    );
};

// --- HistoryItem 组件：历史记录项，使用 React.memo 优化 ---
const HistoryItem = memo(({
    item,
    theme,
    lightboxItem,
    onDelete,
    onClick,
    onContextMenu,
    onImageClick,
    onImageContextMenu,
    onRefresh,
    onRebuildThumbnail,
    performanceMode, // V2.6.1 Feature
    localServerUrl, // V2.6.1 Feature
    localCacheActive,
    onCacheMissing,
    getHistoryMeta,
    isSelected, // V3.4.16: 选择状态
    onSelect, // V3.4.16: 选择回调
    providers,
    defaultProviders,
    historyLocalCacheMap,
    resolveHistoryUrl,
    isLocalCacheUrlAvailable,
    language
}) => {
    const multiImages = Array.isArray(item.mjImages) && item.mjImages.length > 1
        ? item.mjImages
        : (Array.isArray(item.output_images) && item.output_images.length > 1 ? item.output_images : null);
    const primaryUrl = item.url || item.originalUrl || item.mjOriginalUrl || (multiImages && multiImages.length > 0 ? multiImages[0] : null);
    const mappedCacheUrl = localCacheActive && primaryUrl
        ? (historyLocalCacheMap && historyLocalCacheMap.has(primaryUrl)
            ? historyLocalCacheMap.get(primaryUrl)
            : (item.localCacheMap ? item.localCacheMap[primaryUrl] : null))
        : null;
    const localCacheFallback = mappedCacheUrl || item.localCacheUrl || (item.localCacheMap ? Object.values(item.localCacheMap)[0] : null);
    const hasLocalCache = !!(localCacheActive && localCacheFallback && (!isLocalCacheUrlAvailable || isLocalCacheUrlAvailable(localCacheFallback)));
    const thumbnailUrl = item.thumbnailUrl || null;
    const canDrag = isCompletedLikeStatus(item.status) && (item.type === 'image' || (multiImages && multiImages.length > 0));
    const historyMeta = getHistoryMeta ? getHistoryMeta(item) : null;
    const resolvedModelLabel = historyMeta?.modelLabel;
    const rawModelName = (() => {
        if (resolvedModelLabel) return resolvedModelLabel;
        const fallback = item.apiConfig?.modelId || item.apiConfig?.model || item.model || item.modelName || '未知模型';
        if (item.modelName && item.provider && item.modelName.toLowerCase() === item.provider.toLowerCase()) return fallback;
        return item.modelName || fallback;
    })();
    const displayModelName = truncateByBytes(rawModelName, 15);
    const providerTitle = item.provider || item.apiConfig?.provider || '';
    const modelTooltip = providerTitle ? `${providerTitle} / ${rawModelName}` : rawModelName;
    const getDisplayUrl = (originalUrl) => {
        if (hasLocalCache) return localCacheFallback;
        if (performanceMode !== 'off' && thumbnailUrl) return thumbnailUrl;
        return originalUrl;
    };
    const getResolvedDisplayUrl = (originalUrl) => {
        const raw = getDisplayUrl(originalUrl);
        if (resolveHistoryUrl) return resolveHistoryUrl(item, raw);
        return raw;
    };
    const [videoSrc, setVideoSrc] = useState(null);
    const resolveItemUrl = (specificUrl = null) => {
        if (resolveHistoryUrl) return resolveHistoryUrl(item, specificUrl);
        if (specificUrl) {
            if (localCacheActive && item.localCacheMap && item.localCacheMap[specificUrl]) {
                return item.localCacheMap[specificUrl];
            }
            return specificUrl;
        }
        return item.localCacheUrl || (item.localCacheMap ? Object.values(item.localCacheMap)[0] : '') || item.originalUrl || item.mjOriginalUrl || item.url || '';
    };
    const getDragUrl = (specificUrl = null) => {
        if (specificUrl) return resolveItemUrl(specificUrl);
        if (multiImages && multiImages.length > 0) {
            const index = item.selectedMjImageIndex ?? 0;
            const selected = multiImages[index] || multiImages[0];
            if (selected) return resolveItemUrl(selected);
        }
        return resolveItemUrl();
    };
    const getSelectedDragRawUrl = (specificUrl = null) => {
        if (specificUrl) return specificUrl;
        if (multiImages && multiImages.length > 0) {
            const rawIndex = Number.isInteger(item.selectedMjImageIndex) ? item.selectedMjImageIndex : 0;
            const clampedIndex = Math.max(0, Math.min(rawIndex, multiImages.length - 1));
            return multiImages[clampedIndex] || multiImages[0] || '';
        }
        return item.url || item.originalUrl || item.mjOriginalUrl || '';
    };
    const handleDragStart = (e, specificUrl = null) => {
        const selectedRawUrl = getSelectedDragRawUrl(specificUrl);
        const dragUrl = getDragUrl(selectedRawUrl || specificUrl);
        if (!dragUrl) return;
        const selectedIndex = (() => {
            if (!multiImages || multiImages.length === 0) return 0;
            if (selectedRawUrl) {
                const idx = multiImages.indexOf(selectedRawUrl);
                if (idx >= 0) return idx;
            }
            const rawIndex = Number.isInteger(item.selectedMjImageIndex) ? item.selectedMjImageIndex : 0;
            return Math.max(0, Math.min(rawIndex, multiImages.length - 1));
        })();
        const payload = {
            source: 'history',
            itemId: item.id,
            type: item.type || 'image',
            url: selectedRawUrl || dragUrl,
            originalUrl: item.originalUrl || item.mjOriginalUrl || item.url || dragUrl,
            mjOriginalUrl: item.mjOriginalUrl || item.originalUrl || item.url || dragUrl,
            mjImages: multiImages ? multiImages.slice(0, 12) : null,
            selectedIndex
        };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-tapnow-history', JSON.stringify(payload));
        e.dataTransfer.setData('text/uri-list', dragUrl);
        e.dataTransfer.setData('text/plain', dragUrl);
    };

    useEffect(() => {
        const fallback = item.url || item.originalUrl || item.mjOriginalUrl;
        const nextSrc = hasLocalCache ? localCacheFallback : fallback;
        const resolved = resolveHistoryUrl ? resolveHistoryUrl(item, nextSrc) : nextSrc;
        setVideoSrc(resolved);
    }, [item.url, item.originalUrl, item.mjOriginalUrl, hasLocalCache, localCacheFallback, resolveHistoryUrl]);

    useEffect(() => {
        if (!localCacheActive || !localCacheFallback || !onCacheMissing) return;
        if (isLocalCacheUrlAvailable && !isLocalCacheUrlAvailable(localCacheFallback)) {
            onCacheMissing(item.id, localCacheFallback);
        }
    }, [localCacheActive, localCacheFallback, item.id, onCacheMissing, isLocalCacheUrlAvailable]);

    const ratioLabel = historyMeta?.ratioLabel ?? (item.ratio || item.mjRatio);
    const resolutionLabel = historyMeta?.resolutionLabel ?? (item.resolution || (item.width && item.height ? `${item.width}x${item.height}` : null));
    const durationLabel = historyMeta?.durationLabel ?? ((item.type === 'video' && item.duration) ? `${item.duration}s` : null);
    const customParamLabels = historyMeta?.customParamLabels || [];
    const singleImageDisplayUrl = getResolvedDisplayUrl(item.url || item.originalUrl || item.mjOriginalUrl);
    const singleVideoDisplayUrl = videoSrc || item.url || item.originalUrl || item.mjOriginalUrl || '';
    const singlePreviewKey = item.type === 'video' ? singleVideoDisplayUrl : singleImageDisplayUrl;
    const [singlePreviewLoading, setSinglePreviewLoading] = useState(item.status === 'completed');
    const [singlePreviewFailed, setSinglePreviewFailed] = useState(false);
    useEffect(() => {
        setSinglePreviewLoading(item.status === 'completed');
        setSinglePreviewFailed(false);
    }, [item.id, item.type, item.status, singlePreviewKey]);
    const throttleStats = item?.throttleStats && typeof item.throttleStats === 'object' ? item.throttleStats : null;
    const throttleInfo = useMemo(() => {
        if (!throttleStats) return '';
        const info = [];
        const batchMode = String(throttleStats.imageBatchMode || '').trim();
        if (batchMode === IMAGE_BATCH_MODE_STANDARD_BATCH) info.push('标准批次');
        if (batchMode === IMAGE_BATCH_MODE_PARALLEL_AGGREGATE) info.push('并发聚合');
        const requested = Number(throttleStats.requestedImageCount || 0);
        if (requested > 1) info.push(`${requested}张`);
        const interval = Number(throttleStats.dispatchIntervalSec || 0);
        if (interval > 0) info.push(`间隔${interval}s`);
        const retries = Number(throttleStats.retryCount || 0);
        if (retries > 0) info.push(`重试×${retries}`);
        const count429 = Number(throttleStats.http429Count || 0);
        if (count429 > 0) info.push(`429×${count429}`);
        const timeoutCount = Number(throttleStats.timeoutCount || 0);
        if (timeoutCount > 0) info.push(`超时×${timeoutCount}`);
        if (throttleStats.fallbackToParallel) info.push('已回退并发');
        return info.join(' · ');
    }, [throttleStats]);
    const hasThrottleWarning = !!(throttleStats && (Number(throttleStats.http429Count || 0) > 0 || Number(throttleStats.timeoutCount || 0) > 0));

    return (
        <div
            className={`group rounded-lg overflow-hidden border relative cursor-pointer transition-colors ${isSelected
                ? 'border-blue-500 ring-2 ring-blue-500/30'
                : theme === 'dark'
                    ? 'bg-zinc-900 border-zinc-800 hover:border-blue-500/50'
                    : theme === 'solarized'
                        ? 'bg-white border-zinc-200 hover:border-blue-500/50'
                        : 'bg-white border-zinc-200 hover:border-blue-500/50'
                }`}
            style={{
                contentVisibility: 'auto',
                containIntrinsicSize: '1px 300px'
            }}
            onClick={onClick}
            onContextMenu={onContextMenu}
            draggable={canDrag}
            onDragStart={canDrag ? (e) => handleDragStart(e) : undefined}
        >
            {/* 性能/本地缓存标识 */}
            {hasLocalCache && (
                <div className={`absolute top-1 left-1 z-10 px-1 py-0.5 rounded text-[8px] bg-black/60 text-green-300`}>
                    {t('本地')}
                </div>
            )}
            {!hasLocalCache && performanceMode !== 'off' && thumbnailUrl && (
                <div className={`absolute top-1 left-1 z-10 px-1 py-0.5 rounded text-[8px] bg-black/60 ${performanceMode === 'ultra' ? 'text-orange-400' : 'text-zinc-400'}`}>
                    {performanceMode === 'ultra' ? t('极速') : t('缩略')}
                </div>
            )}
            {/* V3.5.1: 圆形选择按钮 - 始终可见 */}
            {onSelect && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onSelect(item.id);
                    }}
                    className={`absolute bottom-2 right-2 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
                        ? 'bg-green-500 border-green-400 opacity-100'
                        : 'border-white/60 bg-black/50 opacity-100 hover:bg-black/70'
                        }`}
                    title={isSelected ? t('取消选择') : t('选择')}
                >
                    {isSelected && <CheckCircle2 size={16} className="text-white" />}
                </button>
            )}
            <div className={`${theme === 'dark' ? 'bg-black' : theme === 'solarized' ? 'bg-[#fafafa]' : 'bg-[#fafafa]'} relative ${((multiImages && multiImages.length > 1) || (item.mjNeedsSplit && item.apiConfig?.modelId?.includes('mj')))
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
                }`}>
                {item.status === 'completed' ? (
                    multiImages && multiImages.length > 1 ? (
                        <div className={`w-full h-full grid gap-0.5 p-0.5 ${multiImages.length === 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}>
                            {multiImages.map((imgUrl, idx) => {
                                const imgInfo = item.mjImageInfo && item.mjImageInfo[idx];
                                const cachedImgUrl = localCacheActive && item.localCacheMap ? item.localCacheMap[imgUrl] : null;
                                const rawDisplayImgUrl = cachedImgUrl
                                    || (performanceMode !== 'off' && item.mjThumbnails && item.mjThumbnails[idx]
                                        ? item.mjThumbnails[idx]
                                        : imgUrl);
                                const displayImgUrl = resolveHistoryUrl
                                    ? resolveHistoryUrl(item, rawDisplayImgUrl)
                                    : rawDisplayImgUrl;
                                return (
                                    <HistoryMjImageCell
                                        key={idx}
                                        item={item}
                                        idx={idx}
                                        imgUrl={imgUrl}
                                        displayImgUrl={displayImgUrl}
                                        theme={theme}
                                        canDrag={canDrag}
                                        lightboxItem={lightboxItem}
                                        language={language}
                                        onImageClick={onImageClick}
                                        onImageContextMenu={onImageContextMenu}
                                        onCacheMissing={onCacheMissing}
                                        handleDragStart={handleDragStart}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        item.type === 'image' ? (
                            <LazyBase64Image
                                src={singleImageDisplayUrl}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                alt={item.prompt || '生成的图片'}
                                onLoad={() => {
                                    setSinglePreviewLoading(false);
                                    setSinglePreviewFailed(false);
                                }}
                                onError={(e) => {
                                    const rawUrl = item.url || item.originalUrl || item.mjOriginalUrl;
                                    const resolvedUrl = getResolvedDisplayUrl(rawUrl);
                                    console.error('图片加载失败:', resolvedUrl || rawUrl);
                                    onCacheMissing && onCacheMissing(item.id, resolvedUrl || rawUrl);
                                    setSinglePreviewLoading(false);
                                    setSinglePreviewFailed(true);
                                    e.target.style.display = 'none';
                                }}
                            />
                        ) : (
                            // V2.6.1: 性能模式处理
                            (() => {
                                // 简单处理：直接显示视频，后续可优化
                                return (
                                    <ResolvedVideo
                                        src={singleVideoDisplayUrl}
                                        className="w-full h-full object-cover"
                                        muted
                                        loop
                                        playsInline
                                        preload="metadata"
                                        onLoadedMetadata={() => {
                                            setSinglePreviewLoading(false);
                                            setSinglePreviewFailed(false);
                                        }}
                                        onCanPlay={() => {
                                            setSinglePreviewLoading(false);
                                            setSinglePreviewFailed(false);
                                        }}
                                        onError={() => {
                                            const fallback = item.url || item.originalUrl || item.mjOriginalUrl;
                                            if (hasLocalCache && fallback && videoSrc === localCacheFallback) {
                                                setSinglePreviewLoading(true);
                                                setSinglePreviewFailed(false);
                                                setVideoSrc(fallback);
                                                onCacheMissing && onCacheMissing(item.id, localCacheFallback);
                                            } else {
                                                console.error('视频加载失败:', fallback);
                                                setSinglePreviewLoading(false);
                                                setSinglePreviewFailed(true);
                                            }
                                        }}
                                    />
                                );
                            })()
                        )
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="animate-spin text-zinc-600" />
                    </div>
                )}
                {item.status === 'completed' && (!multiImages || multiImages.length <= 1) && singlePreviewLoading && !singlePreviewFailed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white/80 text-[10px] pointer-events-none">
                        {t('预览加载中...')}
                    </div>
                )}
                {item.status === 'completed' && (!multiImages || multiImages.length <= 1) && singlePreviewFailed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-red-200 text-[10px] px-3 text-center pointer-events-none">
                        {t('预览加载失败（可点击进入灯箱重试）')}
                    </div>
                )}
                <div className={`absolute bottom-0 left-0 right-0 h-1 ${theme === 'dark' ? 'bg-zinc-800' : theme === 'solarized' ? 'bg-zinc-200' : 'bg-zinc-200'}`}>
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${item.progress}%` }}></div>
                </div>
            </div>
            {/* 信息区域：合并按钮和文本信息以节省空间 */}
            <div className={`px-3 py-2 text-[11px] ${theme === 'solarized' ? 'bg-[#eee8d5]' : ''}`}>
                {/* 第一行：提示词 + 操作按钮 */}
                <div className="flex justify-between items-start gap-2">
                    <span className={`line-clamp-2 ${theme === 'dark' ? 'text-zinc-300' : theme === 'solarized' ? 'text-black' : 'text-zinc-700'}`}>
                        {item.prompt || 'Untitled'}
                    </span>
                    <div className={`shrink-0 ml-1 ${item.type === 'image' ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}`}>
                        {item.type === 'video' && (item.status === 'generating' || item.status === 'failed') && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRefresh && onRefresh(item);
                                }}
                                className={`shrink-0 p-0.5 ${theme === 'dark'
                                    ? 'text-zinc-500 hover:text-white'
                                    : theme === 'solarized'
                                        ? 'text-black hover:text-zinc-700'
                                        : 'text-zinc-400 hover:text-zinc-900'
                                    }`}
                                title={t('刷新状态')}
                            >
                                <RefreshCw size={12} />
                            </button>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete && onDelete(item.id); }}
                            className={`shrink-0 p-0.5 ${theme === 'dark'
                                ? 'text-zinc-500 hover:text-red-500'
                                : theme === 'solarized'
                                    ? 'text-black hover:text-red-600'
                                    : 'text-zinc-400 hover:text-red-500'
                                }`}
                            title={t('删除')}
                        >
                            <Trash2 size={12} />
                        </button>
                        {item.type === 'image' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRebuildThumbnail && onRebuildThumbnail(item);
                                }}
                                className={`shrink-0 p-0.5 rounded ${theme === 'dark'
                                    ? 'text-blue-300 hover:text-blue-200 hover:bg-blue-500/20'
                                    : 'text-blue-500 hover:text-blue-600 hover:bg-blue-100'
                                    }`}
                                title={t('重建缩略图')}
                            >
                                <RefreshCw size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* 状态信息（如果有） */}
                {item.status === 'failed' && item.errorMsg && (
                    <p className="text-[9px] text-red-500 mt-1 break-words whitespace-pre-wrap">
                        {item.errorMsg.split('\n').map((line, idx) => (
                            <span key={idx}>
                                {line}
                                {idx < item.errorMsg.split('\n').length - 1 && <br />}
                            </span>
                        ))}
                    </p>
                )}
                {item.status === 'generating' && (
                    <p className="text-[9px] text-blue-500 mt-1">
                        {item.errorMsg || '生成中...'}
                    </p>
                )}
                {throttleInfo && (
                    <p className={`text-[9px] mt-1 ${hasThrottleWarning ? 'text-amber-400' : (theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500')}`}>
                        {throttleInfo}
                    </p>
                )}

                {/* 第二行 - 空行 (通过 margin 实现) */}
                <div className="h-1.5"></div>

                {/* 第三行 - 生成类型·比率·分辨率 */}
                <div className="flex flex-col w-full">
                    <span className={theme === 'dark' ? 'text-zinc-500' : theme === 'solarized' ? 'text-black' : 'text-zinc-400'}>
                        {(() => {
                            const hasRefImage = item.hasInputImages === true;
                            const isVideo = item.type === 'video';
                            const genType = isVideo
                                ? (hasRefImage ? '图→视频' : '文→视频')
                                : (hasRefImage ? '图→图' : '文→图');
                            const resDisplay = resolutionLabel;
                            return [
                                genType,
                                ratioLabel,
                                resDisplay,
                                isVideo && durationLabel ? durationLabel : null,
                                ...customParamLabels
                            ].filter(Boolean).join(' · ');
                        })()}
                    </span>

                    {/* 第四行 - 时间·模型·用时 */}
                    <span className={theme === 'dark' ? 'text-zinc-500' : theme === 'solarized' ? 'text-black' : 'text-zinc-400'}>
                        {item.time} · <span title={modelTooltip}>{displayModelName}</span>
                        {typeof item.durationMs === 'number' && item.durationMs > 0 && (
                            <> · {t('用时')} {(item.durationMs / 1000).toFixed(1)}s</>
                        )}
                    </span>
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // 自定义对比函数：只检查关键属性变化，包括选择状态
    return (
        prevProps.item === nextProps.item &&
        prevProps.theme === nextProps.theme &&
        prevProps.lightboxItem?.id === nextProps.lightboxItem?.id &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.performanceMode === nextProps.performanceMode &&
        prevProps.localCacheActive === nextProps.localCacheActive &&
        prevProps.getHistoryMeta === nextProps.getHistoryMeta &&
        prevProps.historyLocalCacheMap === nextProps.historyLocalCacheMap &&
        prevProps.resolveHistoryUrl === nextProps.resolveHistoryUrl &&
        prevProps.isLocalCacheUrlAvailable === nextProps.isLocalCacheUrlAvailable
    );
});
HistoryItem.displayName = 'HistoryItem';

// --- MaskEditor 组件：图片标注/局部重绘 ---
const MaskEditor = ({ nodeId, imageUrl, imageDimensions, isActive, onClose, onSave, theme, view, maskContent, onUpdateNode }) => {
    const canvasRef = useRef(null);
    const ctxRef = useRef(null);
    const lastPointRef = useRef(null); // V3.7.27: 用于平滑绘制
    const [brushSize, setBrushSize] = useState(30);
    const [isDrawing, setIsDrawing] = useState(false);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const maxHistory = 10;
    const [resolvedDimensions, setResolvedDimensions] = useState(imageDimensions);

    useEffect(() => {
        if (imageDimensions?.w && imageDimensions?.h) {
            setResolvedDimensions(imageDimensions);
        }
    }, [imageDimensions]);

    useEffect(() => {
        if (!isActive || !imageUrl) return;
        if (imageDimensions?.w && imageDimensions?.h) return;
        let cancelled = false;
        getImageDimensions(imageUrl)
            .then((dims) => {
                if (cancelled) return;
                if (dims?.w && dims?.h) {
                    setResolvedDimensions(dims);
                    if (onUpdateNode) onUpdateNode(nodeId, { dimensions: dims });
                }
            })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [isActive, imageUrl, imageDimensions, nodeId, onUpdateNode]);

    // 初始化 Canvas
    useEffect(() => {
        if (!isActive || !canvasRef.current || !resolvedDimensions) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctxRef.current = ctx;

        // 设置 Canvas 尺寸为图片原始分辨率
        canvas.width = resolvedDimensions.w;
        canvas.height = resolvedDimensions.h;

        // 清空画布（透明背景）
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 如果有保存的蒙版，恢复它
        if (maskContent) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                saveToHistory();
            };
            img.src = maskContent;
        } else {
            saveToHistory();
        }
    }, [isActive, resolvedDimensions, nodeId, maskContent]);

    // 保存当前状态到历史记录
    const saveToHistory = () => {
        if (!canvasRef.current || !ctxRef.current) return;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(imageData);
        if (newHistory.length > maxHistory) {
            newHistory.shift();
        }
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    // 获取鼠标在 Canvas 上的真实像素坐标
    const getCanvasCoordinates = (e) => {
        if (!canvasRef.current) return null;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // 使用 getBoundingClientRect 获取 Canvas 在视口中的绝对位置
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 计算缩放比例（图片原始尺寸 / DOM 显示尺寸）
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // 映射回真实像素坐标
        return {
            x: Math.round(x * scaleX),
            y: Math.round(y * scaleY)
        };
    };

    // 绘制函数 V3.7.27: 使用 lineTo 实现平滑绘制
    const draw = (e) => {
        if (!isDrawing || !canvasRef.current || !ctxRef.current) return;
        const coords = getCanvasCoordinates(e);
        if (!coords) return;

        const ctx = ctxRef.current;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (lastPointRef.current) {
            // 连接到上一个点
            ctx.beginPath();
            ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
        } else {
            // 第一个点：画一个圆
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        lastPointRef.current = coords;
    };

    // 鼠标事件处理
    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // 只处理左键
        e.preventDefault();
        e.stopPropagation();
        lastPointRef.current = null; // V3.7.27: 重置上一个点
        setIsDrawing(true);
        saveToHistory();
        draw(e);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        e.stopPropagation();
        draw(e);
    };

    const handleMouseUp = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDrawing(false);
        lastPointRef.current = null; // V3.7.27: 清除上一个点
        saveToHistory();
    };

    // 撤销
    const handleUndo = () => {
        if (historyIndex <= 0 || !canvasRef.current || !ctxRef.current) return;
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const ctx = ctxRef.current;
        ctx.putImageData(history[newIndex], 0, 0);
    };

    // 清空
    const handleClear = () => {
        if (!canvasRef.current || !ctxRef.current) return;
        const ctx = ctxRef.current;
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        saveToHistory();
    };

    // 保存蒙版
    const handleSave = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const maskDataUrl = canvas.toDataURL('image/png');

        // 更新节点状态
        if (onUpdateNode) {
            onUpdateNode(nodeId, { maskContent: maskDataUrl, isMasking: false });
        }

        if (onSave) onSave(maskDataUrl);
        if (onClose) onClose();
    };

    // 键盘快捷键：Ctrl+Z 撤销
    useEffect(() => {
        if (!isActive) return;
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, historyIndex, history]);

    if (!isActive || !imageUrl || !resolvedDimensions) return null;

    return (
        <>
            <div
                className="absolute inset-0 z-50 pointer-events-auto"
                style={{
                    mixBlendMode: 'normal',
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
            >
                {/* Canvas 层：用于绘制蒙版 */}
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{
                        opacity: 0.5,
                        mixBlendMode: 'multiply',
                        cursor: 'crosshair',
                        pointerEvents: 'auto',
                        imageRendering: 'auto'
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />

                {/* 视觉反馈层：半透明红色覆盖 - 使用 Canvas 作为 mask */}
                <MaskVisualFeedback canvasRef={canvasRef} isDrawing={isDrawing} />
            </div>

            {/* 工具栏 - 使用 Portal 固定到 Body，避免被 Canvas Transform 影响 */}
            {createPortal(
                <div
                    className={`jellyfish-canvas-runtime theme-${theme} fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-row items-center gap-4 p-2 rounded-full border backdrop-blur-md shadow-xl z-[9999] ${theme === 'dark'
                        ? 'bg-zinc-900/90 border-zinc-700 text-zinc-200'
                        : 'bg-white/90 border-zinc-300 text-zinc-800'
                        }`}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {/* 笔刷粗细 */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium whitespace-nowrap">笔刷</span>
                        <input
                            type="range"
                            min="10"
                            max="150"
                            value={brushSize}
                            onChange={(e) => setBrushSize(Number(e.target.value))}
                            className="w-20"
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                        <span className="text-[10px] w-8 text-right whitespace-nowrap">{brushSize}px</span>
                    </div>

                    {/* 按钮组 */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleUndo}
                            disabled={historyIndex <= 0}
                            className={`p-1.5 rounded-full transition-colors ${theme === 'dark'
                                ? 'hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed'
                                : 'hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed'
                                }`}
                            title={t('撤销 (Ctrl+Z)')}
                        >
                            <Undo2 size={14} />
                        </button>
                        <button
                            onClick={handleClear}
                            className={`p-1.5 rounded-full transition-colors ${theme === 'dark'
                                ? 'hover:bg-zinc-800'
                                : 'hover:bg-zinc-100'
                                }`}
                            title={t('清空')}
                        >
                            <Eraser size={14} />
                        </button>
                        <button
                            onClick={handleSave}
                            className="p-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                            title={t('保存/完成')}
                        >
                            <Check size={14} />
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

// --- 自定义样式 ---
const styles = `
        /* 全局字体渲染优化 */
        .jellyfish-canvas-runtime, .jellyfish-canvas-runtime * {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
        }

        .jellyfish-canvas-runtime {
            --canvas-grid-color: #666666;
        }
        .theme-dark {
            --canvas-grid-color: #bfbfbf;
        }
        .theme-solarized {
            --canvas-grid-color: #666666;
        }

        /* 画布容器渲染优化 */
        #canvas-bg {
            transform: translateZ(0);
            backface-visibility: hidden;
            perspective: 1000px;
            background-image: radial-gradient(var(--canvas-grid-color) 6.0px, transparent 6.0px);
            background-size: 24px 24px;
            background-position: 0 0;
        }
        .theme-solarized #canvas-bg {
            box-shadow: inset 0 0 0 1px #eee8d5;
        }

        .theme-solarized button[class*="bg-blue-"],
        .theme-solarized button[class*="bg-green-"] {
            background-color: #616161 !important;
            border-color: #616161 !important;
            color: #fdf6e3 !important;
        }
        .theme-solarized button[class*="bg-blue-"]:hover,
        .theme-solarized button[class*="bg-green-"]:hover {
            background-color: #4b4b4b !important;
        }

        /* 画布内容容器优化 */
        #canvas-bg > div[style*="transform"] {
            transform: translateZ(0);
            will-change: transform;
        }

        /* 节点容器优化 */
        .node-wrapper {
            transform: translateZ(0);
            backface-visibility: hidden;
            contain: layout style;
            will-change: transform, left, top;
        }

        /* 节点内图片渲染优化 - 使用高质量渲染 */
        .node-wrapper img,
        .node-wrapper video {
            image-rendering: auto;
            image-rendering: -webkit-optimize-contrast;
            transform: translateZ(0);
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            pointer-events: none;
        }

        /* 连接线优化 */
        svg {
            shape-rendering: geometricPrecision;
            text-rendering: optimizeLegibility;
        }

        /* 高性能模式：当节点数量超过阈值时自动启用 */
        .perf-mode .node-wrapper {
            box-shadow: none !important;
            backdrop-filter: none !important;
            border-radius: 0 !important;
            transition: none !important;
        }
        .perf-mode .connection-group {
            opacity: 1 !important;
        }

        /* 交互时动态降级：拖拽或缩放时降低渲染质量 */
        .interacting .node-wrapper img {
            image-rendering: pixelated;
        }
        .interacting .connection-group {
            display: none;
            pointer-events: none;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .theme-dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
        .theme-dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
        .theme-light .custom-scrollbar::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 2px; }
        .theme-light .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        .theme-solarized .custom-scrollbar::-webkit-scrollbar-thumb { background: #c9c2a8; border-radius: 2px; }
        .theme-solarized .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #b9b091; }
        .theme-solarized button[class*="bg-blue-"],
        .theme-solarized button[class*="bg-green-"],
        .theme-solarized button[class*="from-blue-"],
        .theme-solarized button[class*="from-green-"],
        .theme-solarized button[class*="to-emerald-"],
        .theme-solarized button[class*="to-indigo-"] {
            background-image: none !important;
            background-color: #616161 !important;
            border-color: #525252 !important;
            color: #fdf6e3 !important;
        }
        .theme-solarized button[class*="bg-blue-"]:hover,
        .theme-solarized button[class*="bg-green-"]:hover,
        .theme-solarized button[class*="from-blue-"]:hover,
        .theme-solarized button[class*="from-green-"]:hover,
        .theme-solarized button[class*="to-emerald-"]:hover,
        .theme-solarized button[class*="to-indigo-"]:hover {
            background-color: #555555 !important;
        }
        .theme-solarized [class*="hover:bg-zinc-100"]:hover {
            background-color: #fdf6e3 !important;
        }
        .theme-solarized [class*="hover:bg-zinc-200"]:hover {
            background-color: #eee8d5 !important;
        }
        .resize-handle { cursor: nwse-resize; opacity: 0; transition: opacity 0.2s; }
        .node-wrapper:hover .resize-handle { opacity: 1; }

        /* 连接点样式 */
        .connector { position: absolute; top: 50%; transform: translateY(-50%); box-sizing: border-box; width: 0.9rem; height: 0.9rem; background-color: #27272a; border: 1px solid #71717a; color: #a1a1aa; border-radius: 9999px; display: inline-flex; align-items: center; justify-content: center; line-height: 0; cursor: crosshair; transition: all 0.2s; z-index: 30; opacity: 0; pointer-events: auto; }
        .connector svg { display: block; flex: 0 0 auto; }
        .node-wrapper:hover .connector { opacity: 1; }
        .connector:hover, .connector.active { background-color: #d4d4d8; border-color: #fff; transform: translateY(-50%) scale(1.2); opacity: 1; color: #000; }
        .connector-right { right: -0.45rem; }

        /* 输入点样式 */
        .input-point { position: absolute; top: 50%; transform: translateY(-50%); left: -0.25rem; width: 0.5rem; height: 0.5rem; background-color: #52525b; border-radius: 50%; border: 1px solid #18181b; transition: all 0.2s; z-index: 20; cursor: crosshair; }
        .node-wrapper:hover .input-point { background-color: #a1a1aa; }
        .input-point.connected { background-color: #60a5fa; box-shadow: 0 0 6px #60a5fa; }
        .input-point.active { background-color: #60a5fa; border-color: #fff; transform: translateY(-50%) scale(1.3); box-shadow: 0 0 8px #60a5fa; }

        /* Lightbox & Overlay */
        .lightbox-overlay { background-color: rgba(0, 0, 0, 0.95); backdrop-filter: blur(5px); }

        /* Stack Items */
        .thumb-stack-item {
             transition: transform 0.2s, z-index 0.2s;
        }
        .thumb-stack-item:hover {
            transform: scale(1.1) translateY(-2px);
            z-index: 10 !important;
            border-color: #60a5fa;
        }

        /* 连接线删除按钮 */
        .connection-delete {
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: auto; /* 关键：确保鼠标能交互 */
        }
        /* 当鼠标悬停在整个连接组（包含粗透明线）时显示 */
        .connection-group:hover .connection-delete {
            opacity: 1;
        }

        /* 拖放区域样式 */
        .drop-zone {
            border: 2px dashed transparent;
            transition: all 0.3s;
        }
        .drop-zone.drag-over {
            border-color: #60a5fa;
            background-color: rgba(96, 165, 250, 0.1);
        }

        /* Markdown Styles for Chat */
        .markdown-body { font-size: 13px; line-height: 1.5; color: #e4e4e7; word-wrap: break-word; user-select: text !important; cursor: text; }
        .markdown-body * { user-select: text !important; cursor: text; }
        .markdown-body pre { background: #27272a; padding: 10px; border-radius: 6px; overflow-x: auto; margin: 8px 0; white-space: pre-wrap; word-wrap: break-word; user-select: text !important; cursor: text; }
        .markdown-body code { font-family: monospace; background: #3f3f46; padding: 2px 4px; border-radius: 4px; font-size: 12px; user-select: text !important; cursor: text; }
        .markdown-body pre code { background: transparent; padding: 0; color: #a1a1aa; user-select: text !important; cursor: text; }
        .markdown-body p { margin-bottom: 8px; user-select: text !important; cursor: text; }
        .markdown-body ul, .markdown-body ol { margin-left: 20px; margin-bottom: 8px; list-style: disc; user-select: text !important; cursor: text; }
        .markdown-body li { user-select: text !important; cursor: text; }
        .markdown-body video { max-width: 100%; border-radius: 0.5rem; margin-top: 0.5rem; }
        .markdown-body table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .markdown-body table th, .markdown-body table td { border: 1px solid #3f3f46; padding: 8px 12px; text-align: left; }
        .markdown-body table th { background-color: #3f3f46; font-weight: 600; }
        .markdown-body table tr:nth-child(even) { background-color: #27272a; }
        .theme-light .markdown-body table th, .theme-light .markdown-body table td { border-color: #d4d4d8; }
        .theme-light .markdown-body table th { background-color: #e4e4e7; }
        .theme-light .markdown-body table tr:nth-child(even) { background-color: #f4f4f5; }
        .theme-light .markdown-body { color: #18181b; }
        .theme-light .markdown-body pre { background: #f4f4f5; color: #18181b; }
        .theme-light .markdown-body code { background: #e4e4e7; color: #18181b; }
        .theme-light .markdown-body pre code { color: #18181b; }
        .theme-solarized .markdown-body table th, .theme-solarized .markdown-body table td { border-color: #d7cfb2; }
        .theme-solarized .markdown-body table th { background-color: #ddddc1; }
        .theme-solarized .markdown-body table tr:nth-child(even) { background-color: #eee8d5; }
        .theme-solarized .markdown-body { color: #586e75; }
        .theme-solarized .markdown-body pre { background: #ddddc1; color: #586e75; }
        .theme-solarized .markdown-body code { background: #ddddc1; color: #586e75; }
        .theme-solarized .markdown-body pre code { color: #586e75; }
        `;

// --- 虚拟画布尺寸 ---
const VIRTUAL_CANVAS_WIDTH = 4000;
const VIRTUAL_CANVAS_HEIGHT = 4000;
const IMAGE_TASK_TIMEOUT_MS = 60 * 1000;
const VIDEO_TASK_TIMEOUT_MS = 5 * 60 * 1000;

// --- 默认配置 ---
const DEFAULT_BASE_URL = 'https://ai.comfly.chat';

// 即梦API配置（代理地址，默认本地5100端口）
const JIMENG_API_BASE_URL = 'http://localhost:5100';
const JIMENG_SESSION_ID = '7a16459fbd65d9c87b4ea44d3318f5fa';

// V3.6.0: 供应商配置（简化版 - 无 name 字段，直接用 key 作为显示名）
const DEFAULT_PROVIDERS = {
    'openai': { key: '', url: DEFAULT_BASE_URL, apiType: 'openai', useProxy: false, forceAsync: false },
    'google': { key: '', url: DEFAULT_BASE_URL, apiType: 'openai', useProxy: false, forceAsync: false },
    'deepseek': { key: '', url: DEFAULT_BASE_URL, apiType: 'openai', useProxy: false, forceAsync: false },
    'midjourney': { key: '', url: 'https://api.midjourney.com', apiType: 'openai', useProxy: false, forceAsync: false },
    'jimeng': { key: '', url: JIMENG_API_BASE_URL, apiType: 'openai', useProxy: false, forceAsync: false },
    'grok': { key: '', url: 'https://ai.t8star.cn', apiType: 'openai', useProxy: false, forceAsync: false },
    'yunwu': { key: '', url: 'https://yunwu.ai', apiType: 'gemini', useProxy: false, forceAsync: false },
};

// V3.6.0: 模型配置（简化版 - id 即 modelName，无 displayName）
const DEFAULT_API_CONFIGS = [
    // Chat Models
    { id: 'gpt-5.1', provider: 'openai', type: 'Chat' },
    { id: 'gpt-5.2', provider: 'openai', type: 'Chat' },
    { id: 'gpt-4o', provider: 'openai', type: 'Chat' },
    { id: 'deepseek-v3-1-250821', provider: 'deepseek', type: 'Chat' },
    { id: 'gemini-3-pro-preview', provider: 'google', type: 'Chat' },

    // Image Models
    { id: 'MJ V6', provider: 'midjourney', type: 'Image' },
    { id: 'gpt-4o-image', provider: 'openai', type: 'Image' },
    { id: 'gemini-3-pro-image-preview', provider: 'yunwu', type: 'Image' },
    { id: 'jimeng-4.5', provider: 'jimeng', type: 'Image' },
    { id: 'jimeng-4.1', provider: 'jimeng', type: 'Image' },
    { id: 'jimeng-4.0', provider: 'jimeng', type: 'Image' },
    { id: 'jimeng-3.1', provider: 'jimeng', type: 'Image' },
    { id: 'jimeng-3.0', provider: 'jimeng', type: 'Image' },
    { id: 'jimeng-2.1', provider: 'jimeng', type: 'Image' },
    { id: 'jimeng-xl-pro', provider: 'jimeng', type: 'Image' },
    { id: 'nanobananapro', provider: 'jimeng', type: 'Image' },
    { id: 'nanobanana', provider: 'jimeng', type: 'Image' },

    // Video Models
    { id: 'sora-2', provider: 'openai', type: 'Video', durations: ['5s', '10s'] },
    { id: 'sora-2-pro', provider: 'openai', type: 'Video', durations: ['15s', '25s'] },
    { id: 'jimeng-video-3.5-pro', provider: 'jimeng', type: 'Video', durations: ['5s', '10s'] },
    { id: 'jimeng-video-veo3', provider: 'jimeng', type: 'Video', durations: ['8s'] },
    { id: 'jimeng-video-veo3.1', provider: 'jimeng', type: 'Video', durations: ['8s'] },
    { id: 'jimeng-video-sora2', provider: 'jimeng', type: 'Video', durations: ['4s', '8s', '12s'] },
    { id: 'jimeng-video-3.0-pro', provider: 'jimeng', type: 'Video', durations: ['5s', '10s'] },
    { id: 'jimeng-video-3.0', provider: 'jimeng', type: 'Video', durations: ['5s', '10s'] },
    { id: 'jimeng-video-3.0-fast', provider: 'jimeng', type: 'Video', durations: ['5s', '10s'] },
    { id: 'jimeng-video-2.0-pro', provider: 'jimeng', type: 'Video', durations: ['5s', '10s'] },
    { id: 'jimeng-video-2.0', provider: 'jimeng', type: 'Video', durations: ['5s', '10s'] },
    { id: 'grok-video-3', provider: 'grok', type: 'Video', durations: ['8s', '5s'] },
];

const RATIOS = ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'];
const GROK_VIDEO_RATIOS = ['3:2', '2:3', '1:1'];
const VIDEO_RES_OPTIONS = ['1080P', '720P'];
const PROMPT_LIBRARY_KEY = 'tapnow_prompt_library';
const GRID_PROMPT_TEXT = `基于我上传的这张参考图，生成一张九宫格（3x3 grid）布局的分镜脚本。请严格保持角色与参考图一致（Keep character strictly consistent），但在9个格子中展示该角色不同的动作、表情和拍摄角度（如正面、侧面、背面、特写等）。要求风格高度统一，形成一张完整的角色动态表（Character Sheet）。`;
const UPSCALE_PROMPT_TEXT = `请对参考图片进行无损高清放大（Upscale）。请严格保持原图的构图、色彩、光影和所有细节元素不变，不要进行任何创造性的重绘或添加新内容。仅专注于提升分辨率、锐化边缘（Sharpening）和去除噪点（Denoising），实现像素级的高清修复。Best quality, 8k, masterpiece, highres, ultra detailed, sharp focus, image restoration, upscale, faithful to original.`;
const STORYBOARD_PROMPT_TEXT = `you are a veteran Hollywood storyboard artist with years of experience. You have the ability to accurately analyze character features and scene characteristics based on images. Provide me with the most suitable camera angles and storyboards. Strictly base this on the uploaded character and scene images, while maintaining a consistent visual style.

MANDATORY LAYOUT: Create a precise 3x3 GRID containing exactly 9 distinct panels.

- The output image MUST be a single image divided into a 3 (rows) by 3 (columns) matrix.
- There must be EXACTLY 3 horizontal rows and 3 vertical columns.
- Each panel must be completely separated by a thin, distinct, solid black line.
- DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes.
- The grid structure must be perfectly aligned for slicing.

Subject Content: "[在此处填充你对故事的描述]"

Styling Instructions:
- Each panel shows the SAME subject/scene from a DIFFERENT angle (e.g., Front, Side, Back, Action, Close-up).
- Maintain perfect consistency of the character/object across all panels.
- Cinematic lighting, high fidelity, 8k resolution.

Negative Constraints:
- No text, no captions, no UI elements.
- No watermarks.
- No broken grid lines.`;

const CHARACTER_SHEET_PROMPT_TEXT = `(strictly mimic source image art style:1.5), (same visual style:1.4),
score_9, score_8_up, masterpiece, best quality, (character sheet:1.4), (reference sheet:1.3), (consistent art style:1.3), matching visual style,

[Structure & General Annotations]:
multiple views, full body central figure, clean background,
(heavy annotation:1.4), (text labels with arrows:1.3), handwriting, data readout,

[SPECIAL CHARACTER DESCRIPTION AREA]:
(prominent character profile text box:1.6), (dedicated biography section:1.5), large descriptive text block,
[在此处填写特殊角色说明，例如：姓名、种族、背景故事等],

[Clothing Breakdown]:
(clothing breakdown:1.5), (outfit decomposition:1.4), garment analysis, (floating apparel:1.3),
displaying outerwear, displaying upper body garment, displaying lower body garment,

[Footwear Focus]:
(detailed footwear display:1.5), (floating shoes:1.4), shoe design breakdown, focus on shoes,

[Inventory & Details]:
(inventory knolling:1.2), open container, personal accessories, organized items display, expression panels`;

const MOOD_BOARD_PROMPT_TEXT = `# Directive: Create a "Rich Narrative Mood Board" (8-Grid Layout)

## 1. PROJECT INPUT

**A. [Story & Concept / 故事与核心想法]**
> [跟据自身内容书写]

**B. [Key Symbols / 核心意象 (Optional)]**
> [深度理解参考图，自行创作]

**C. [Color Preferences / 色彩倾向 (Optional)]**
> [深度理解参考图，自行创作]

**D. [Reference Images / 参考图]**
> (See attached images / 请读取我上传的图片)

---

## 2. Role Definition
Act as a **Senior Art Director**. Synthesize the Input above into a single, cohesive, high-density **Visual Mood Board** using a complex **8-Panel Asymmetrical Grid Layout**.

## 3. Layout Mapping (Strict Adherence)
You must design a visual composition that tells the story through **8 distinct panels** within one image. **Do not** generate random grids. Map the content exactly as follows:

* **Panel 1 (The World):** A wide, cinematic establishing shot of the environment (based on Input A).
* **Panel 2 (The Protagonist):** A portrait close-up (based on reference images), focusing on micro-expressions.
* **Panel 3 (The Metaphor):** An **abstract symbolic object** representing the core theme (based on Input B).
* **Panel 4 (The Palette):** A graphical **Color Palette Strip** showcasing 5 specific colors extracted from the scene.
* **Panel 5 (The Texture):** Extreme macro close-up of a material surface (e.g., rust, skin, fabric) to add tactile richness.
* **Panel 6 (The Motion):** A motion-blurred or long-exposure shot representing time/chaos.
* **Panel 7 (The Detail):** A focused shot of a specific prop or accessory relevant to the plot.
* **Panel 8 (The AI Art Interpretation - CRITICAL):** This is your **free creative space**. Generate an artistic, surreal, or abstract re-interpretation of the story's emotion. **Do not just copy the inputs.** Create a "Vibe Image" (e.g., Double Exposure, Oil Painting style, or abstract geometry) that captures the *soul* of the narrative.

## 4. Execution Requirements
* **Composition Style:** High-end Editorial / Magazine Layout. Clean, thin white borders.
* **Visual Unity:** All panels must share the same lighting conditions and color grading logic (Unified Aesthetic).
* **Task:** Provide the **Final English Image Prompt** that explicitly describes this 8-grid layout, ensuring Panel 8 stands out as an artistic variation.`;
// 已删除的模型ID列表（用于过滤）
const DELETED_MODEL_IDS = [
    'gemini-image',
    'qwen-image',
    'doubao-seedream',
    'hailuo-02',
    'kling-v1-6',
    'wan-2.5'
];

const ASYNC_CONFIG_TEMPLATE = {
    enabled: true,
    requestIdPaths: ['requestId', 'request_id'],
    pollIntervalMs: 3000,
    maxAttempts: 300,
    statusRequest: {
        endpoint: '/w/v1/webapp/task/openapi/detail',
        method: 'GET',
        headers: { Authorization: 'Bearer {{provider.key}}' },
        query: { requestId: '{{requestId}}' },
        bodyType: 'json',
        body: {}
    },
    statusPath: 'data.status',
    successValues: ['Success'],
    failureValues: ['Failed', 'Canceled'],
    outputsRequest: {
        endpoint: '/w/v1/webapp/task/openapi/outputs',
        method: 'GET',
        headers: { Authorization: 'Bearer {{provider.key}}' },
        query: { requestId: '{{requestId}}' },
        bodyType: 'json',
        body: {}
    },
    outputsPath: 'data.outputs',
    outputsUrlField: 'object_url',
    errorPath: 'message'
};

const normalizeShotIdValue = (value) => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
};
const SIMPLE_NUMERIC_SHOT_ID_RE = /^-?\d+(?:\.\d+)?$/;
const isSameShotId = (a, b) => {
    const rawA = normalizeShotIdValue(a);
    const rawB = normalizeShotIdValue(b);
    if (!rawA || !rawB) return false;
    if (rawA === rawB) return true;
    if (!SIMPLE_NUMERIC_SHOT_ID_RE.test(rawA) || !SIMPLE_NUMERIC_SHOT_ID_RE.test(rawB)) return false;
    const numA = Number(rawA);
    const numB = Number(rawB);
    if (!Number.isFinite(numA) || !Number.isFinite(numB)) return false;
    if (Math.abs(numA - numB) < 1e-6) return true;
    return false;
};
const MAX_STORYBOARD_OUTPUT_HISTORY = 20;
const makeStoryboardShotFocusKey = (nodeId, shotId) => `${encodeURIComponent(String(nodeId || ''))}::${encodeURIComponent(String(shotId || ''))}`;
const normalizeStoryboardOutputSnapshot = (shotLike) => {
    if (!shotLike || typeof shotLike !== 'object') return null;
    const explicitVideoUrl = String(shotLike.video_url || '').trim();
    const explicitImages = Array.isArray(shotLike.output_images)
        ? shotLike.output_images.map((url) => String(url || '').trim()).filter(Boolean)
        : [];
    const explicitOutputUrl = String(shotLike.output_url || '').trim();
    const mode = explicitVideoUrl || (explicitOutputUrl && isVideoUrl(explicitOutputUrl))
        ? 'video'
        : 'image';
    if (mode === 'video') {
        const videoUrl = explicitVideoUrl || explicitOutputUrl;
        if (!videoUrl) return null;
        return {
            mode: 'video',
            output_url: videoUrl,
            video_url: videoUrl,
            output_images: [],
            selectedImageIndex: -1
        };
    }
    const imageUrls = explicitImages.length > 0
        ? explicitImages
        : (explicitOutputUrl ? [explicitOutputUrl] : []);
    if (imageUrls.length === 0) return null;
    const selectedRaw = Number.isInteger(shotLike.selectedImageIndex)
        ? shotLike.selectedImageIndex
        : 0;
    const selectedImageIndex = Math.max(-1, Math.min(imageUrls.length - 1, selectedRaw));
    return {
        mode: 'image',
        output_url: imageUrls[0],
        video_url: '',
        output_images: imageUrls,
        selectedImageIndex
    };
};
const isSameStoryboardOutputSnapshot = (a, b) => {
    if (!a || !b) return false;
    if (a.mode !== b.mode) return false;
    if (String(a.output_url || '') !== String(b.output_url || '')) return false;
    if (String(a.video_url || '') !== String(b.video_url || '')) return false;
    const imagesA = Array.isArray(a.output_images) ? a.output_images : [];
    const imagesB = Array.isArray(b.output_images) ? b.output_images : [];
    if (imagesA.length !== imagesB.length) return false;
    for (let i = 0; i < imagesA.length; i += 1) {
        if (String(imagesA[i] || '') !== String(imagesB[i] || '')) return false;
    }
    return Number(a.selectedImageIndex ?? -1) === Number(b.selectedImageIndex ?? -1);
};
const materializeStoryboardOutputFromSnapshot = (snapshot, currentShot) => {
    const normalized = normalizeStoryboardOutputSnapshot(snapshot) || normalizeStoryboardOutputSnapshot(currentShot);
    if (!normalized) return null;
    if (normalized.mode === 'video') {
        return {
            video_url: normalized.video_url,
            output_url: normalized.output_url,
            output_images: [],
            selectedImageIndex: -1
        };
    }
    const outputImages = Array.isArray(normalized.output_images) ? normalized.output_images : [];
    const safeIndex = Number.isInteger(normalized.selectedImageIndex)
        ? Math.max(-1, Math.min(outputImages.length - 1, normalized.selectedImageIndex))
        : (outputImages.length > 0 ? 0 : -1);
    return {
        video_url: '',
        output_images: outputImages,
        output_url: outputImages[0] || '',
        selectedImageIndex: safeIndex
    };
};
const isStoryboardDebugEnabled = () => {
    try {
        return localStorage.getItem('tapnow_debug_storyboard') === '1';
    } catch (e) {
        return false;
    }
};
const findStoryboardNodeById = (nodes, nodeId) => {
    if (!Array.isArray(nodes) || !nodeId) return null;
    const direct = nodes.find(n => n.id === nodeId);
    if (direct) return direct;
    const trimmed = String(nodeId).trim();
    if (!trimmed) return null;
    return nodes.find(n => String(n.id || '').trim() === trimmed) || null;
};
const resolveStoryboardShotCandidate = (node, shotId, historyItem) => {
    const shots = node?.settings?.shots || [];
    const direct = shots.find(s => isSameShotId(s.id, shotId));
    if (direct) return { shot: direct, reason: 'direct' };
    if (!historyItem) return null;
    const prompt = (historyItem.prompt || '').trim();
    const desc = (historyItem.description || '').trim();
    const startTime = historyItem.startTime || historyItem.time || null;
    let best = null;
    let bestScore = -Infinity;
    shots.forEach((s) => {
        let score = 0;
        if (prompt && s.prompt && s.prompt.trim() === prompt) score += 5;
        if (prompt && s.description && s.description.trim() === prompt) score += 4;
        if (desc && s.description && s.description.trim() === desc) score += 3;
        if (startTime && s.generationStartTime) {
            const diff = Math.abs(Number(startTime) - Number(s.generationStartTime));
            if (Number.isFinite(diff)) {
                if (diff < 20000) score += Math.max(0, 2 - diff / 10000);
            }
        }
        if (s.status === 'generating') score += 1;
        if (Array.isArray(s.output_images) && s.output_images.length > 0) score -= 2;
        if (score > bestScore) {
            bestScore = score;
            best = s;
        }
    });
    if (bestScore > 0 && best) return { shot: best, reason: 'fallback' };
    if (shots.length === 1) return { shot: shots[0], reason: 'fallback' };
    const generatingShots = shots.filter((s) => s.status === 'generating');
    if (generatingShots.length === 1) return { shot: generatingShots[0], reason: 'fallback' };
    const emptyShots = shots.filter((s) => !Array.isArray(s.output_images) || s.output_images.length === 0);
    if (emptyShots.length === 1) return { shot: emptyShots[0], reason: 'fallback' };
    return null;
};

const parseStoryboardSourceNodeId = (sourceNodeId) => {
    if (!sourceNodeId || typeof sourceNodeId !== 'string') return null;
    if (!sourceNodeId.startsWith('storyboard-') || !sourceNodeId.includes('-shot-')) return null;
    const parts = sourceNodeId.split('-shot-');
    if (parts.length !== 2) return null;
    const shotId = parts[1];
    const isImageMode = parts[0].startsWith('storyboard-img-');
    const nodeId = isImageMode
        ? parts[0].replace('storyboard-img-', '')
        : parts[0].replace('storyboard-', '');
    if (!nodeId || !shotId) return null;
    return { nodeId, shotId, isImageMode };
};
const ASYNC_CONFIG_TEMPLATE_TEXT = JSON.stringify(ASYNC_CONFIG_TEMPLATE, null, 2);
const REQUEST_CHAIN_TEMPLATE = {
    enabled: false,
    steps: [
        {
            id: 'upload_file',
            type: 'http',
            onError: 'stop',
            request: {
                endpoint: '/v1/files',
                method: 'POST',
                bodyType: 'multipart',
                headers: {},
                query: {},
                files: {
                    file: '{{fileBlob1:blob}}'
                },
                body: {}
            },
            extract: {
                uploadedFileId: 'id'
            }
        }
    ]
};
const REQUEST_CHAIN_TEMPLATE_TEXT = JSON.stringify(REQUEST_CHAIN_TEMPLATE, null, 2);
const buildEmptyAsyncConfig = () => ({
    enabled: false,
    requestIdPaths: ['requestId', 'request_id'],
    pollIntervalMs: 3000,
    maxAttempts: 300,
    statusRequest: {
        endpoint: '',
        method: 'GET',
        headers: {},
        query: {},
        bodyType: 'json',
        body: {}
    },
    statusPath: '',
    successValues: [],
    failureValues: [],
    outputsRequest: {
        endpoint: '',
        method: 'GET',
        headers: {},
        query: {},
        bodyType: 'json',
        body: {}
    },
    outputsPath: '',
    outputsUrlField: '',
    errorPath: ''
});
const IMAGE_BATCH_MODE_PARALLEL_AGGREGATE = 'parallel_aggregate';
const IMAGE_BATCH_MODE_STANDARD_BATCH = 'standard_batch';
const IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO = 'auto';
const IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE = 'force_native';
const IMAGE_NATIVE_MULTI_IMAGE_MODE_DISABLE = 'disable_native';
const NATIVE_MULTI_IMAGE_CAPABILITY_STORAGE_KEY = 'tapnow_native_multi_image_capabilities';
const NODE_IO_ENVELOPE_VERSION = '1.0';
const TRANSPORT_HTTP_JSON = 'http-json';
const TRANSPORT_HTTP_SSE = 'http-sse';
const TRANSPORT_WS_STREAM = 'ws-stream';
const DEFAULT_TRANSPORT_OPTIONS = Object.freeze({
    sseDataPrefix: 'data:',
    sseDoneToken: '[DONE]',
    sseDeltaPath: '',
    sseDelimiter: '\n\n',
    wsMessagePath: '',
    wsDoneToken: '[DONE]'
});

const DEFAULT_MODEL_LIBRARY = [
    ...DEFAULT_API_CONFIGS
        .filter((config) => !DELETED_MODEL_IDS.includes(config.id))
        .filter((config) => !['Tongyi-MAI/Z-Image-Turbo'].includes(config.id))
        .map((config) => {
            const isVideo = config.type === 'Video';
            const supportsFirstLastFrame = isVideo && /veo3\.1/i.test(config.id);
            const supportsHD = isVideo && /sora-2/i.test(config.id);
            const entryBase = {
                id: config.id,
                displayName: config.id,
                modelName: config.id,
                type: config.type || 'Chat',
                disabled: false,
                imageRouteMode: 'auto',
                imageBatchMode: IMAGE_BATCH_MODE_PARALLEL_AGGREGATE,
                nativeMultiImageMode: IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO,
                ratioLimits: null,
                defaultRatio: '',
                resolutionLimits: null,
                defaultResolution: '',
                defaultImageConcurrency: 1,
                durations: Array.isArray(config.durations) ? config.durations : null,
                defaultDuration: '',
                videoResolutions: isVideo ? [...VIDEO_RES_OPTIONS] : null,
                defaultVideoResolution: '',
                supportsFirstLastFrame,
                supportsHD,
                apiType: DEFAULT_PROVIDERS[config.provider]?.apiType || 'openai',
                customParams: [],
                asyncConfig: null,
                requestChain: null,
                transport: TRANSPORT_HTTP_JSON,
                transportOptions: { ...DEFAULT_TRANSPORT_OPTIONS },
                capabilities: buildDefaultCapabilitySchema(config.type || 'Chat')
            };
            return ({
                ...entryBase,
                requestTemplate: getDefaultRequestTemplateForEntry(entryBase),
                requestOverrideEnabled: false,
                requestOverridePatch: null
            });
    })
];

const getDefaultRatiosForModel = (modelId) => {
    if (!modelId) return RATIOS;
    if (modelId.includes('grok')) return GROK_VIDEO_RATIOS;
    return RATIOS;
};
const RESOLUTIONS = ['Auto', '1K', '2K', '4K'];
const normalizeResolutionOption = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (upper === 'AUTO') return 'Auto';
    if (upper === '1K' || upper === '2K' || upper === '4K') return upper;
    const sizeMatch = raw.match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (sizeMatch) return `${sizeMatch[1]}x${sizeMatch[2]}`;
    const kMatch = upper.match(/^(\d+)K$/);
    if (kMatch) return `${kMatch[1]}K`;
    return raw;
};
const normalizeImageResolution = (value) => {
    const normalized = normalizeResolutionOption(value);
    if (normalized) return normalized;
    return '2K';
};
const normalizeImageRouteMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'edit') return 'edit';
    if (mode === 't2i') return 't2i';
    return 'auto';
};
const normalizeImageBatchMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    if (
        mode === IMAGE_BATCH_MODE_STANDARD_BATCH
        || mode === 'standard'
        || mode === 'batch'
        || mode === 'standardbatch'
    ) {
        return IMAGE_BATCH_MODE_STANDARD_BATCH;
    }
    return IMAGE_BATCH_MODE_PARALLEL_AGGREGATE;
};
const normalizeNativeMultiImageMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    if (
        mode === IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE
        || mode === 'force'
        || mode === 'native'
        || mode === 'enabled'
        || mode === 'on'
        || mode === 'true'
    ) {
        return IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE;
    }
    if (
        mode === IMAGE_NATIVE_MULTI_IMAGE_MODE_DISABLE
        || mode === 'disable'
        || mode === 'disabled'
        || mode === 'off'
        || mode === 'false'
    ) {
        return IMAGE_NATIVE_MULTI_IMAGE_MODE_DISABLE;
    }
    return IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO;
};
const normalizeNodeIOMediaType = (type, url = '') => {
    const raw = String(type || '').trim().toLowerCase();
    if (raw === 'image' || raw === 'video') return raw;
    return isVideoUrl(url) ? 'video' : 'image';
};
const isNodeIOMediaItemValid = (item) => {
    if (!item || typeof item !== 'object') return false;
    const mediaType = normalizeNodeIOMediaType(item.type, item.url);
    if (!mediaType) return false;
    const url = String(item.url || '').trim();
    return !!url;
};
const isNodeIOEnvelopeValid = (envelope) => {
    if (!envelope || typeof envelope !== 'object') return false;
    if (String(envelope.version || '') !== NODE_IO_ENVELOPE_VERSION) return false;
    if (!Array.isArray(envelope.text) || !Array.isArray(envelope.media)) return false;
    if (envelope.text.some((textItem) => typeof textItem !== 'string')) return false;
    if (envelope.media.some((mediaItem) => !isNodeIOMediaItemValid(mediaItem))) return false;
    if (!envelope.meta || typeof envelope.meta !== 'object') return false;
    return true;
};
const getAntigravityQualityByResolution = (value) => {
    const normalized = normalizeImageResolution(value);
    if (normalized === '4K') return 'hd';
    if (normalized === '2K') return 'medium';
    if (normalized === '1K') return 'standard';
    return '';
};
const getAntigravityImageSizeByResolution = (value) => {
    const normalized = normalizeImageResolution(value);
    if (normalized === '4K' || normalized === '2K' || normalized === '1K') return normalized;
    return '';
};
const getAntigravitySizeParam = (ratio, sizeStr) => {
    const normalizedRatio = String(ratio || '').trim();
    if (normalizedRatio && normalizedRatio !== 'Auto' && /^\d+\s*:\s*\d+$/.test(normalizedRatio)) {
        return normalizedRatio.replace(/\s+/g, '');
    }
    const normalizedSize = String(sizeStr || '').trim();
    return normalizedSize || '1:1';
};
const isExplicitImageResolution = (value) => {
    const raw = String(value || '').trim();
    return /^\d+\s*[xX]\s*\d+$/.test(raw);
};
const normalizeVideoResolution = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '720P';
    if (raw === '不选') return 'Auto';
    const upper = raw.toUpperCase();
    if (upper === 'AUTO') return 'Auto';
    if (upper.endsWith('P') || upper.endsWith('K')) return upper;
    return upper;
};
const normalizeVideoResolutionLower = (value) => {
    const normalized = normalizeVideoResolution(value);
    if (!normalized || normalized === 'Auto') return '';
    return normalized.toLowerCase();
};
const stripValueNotes = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/\s+/g, '')
        .trim();
};
const normalizeJimengVideoRatio = (value, options = {}) => {
    const defaultRatio = options.defaultRatio ? String(options.defaultRatio) : '1:1';
    const allowed = Array.isArray(options.allowedRatios)
        ? new Set(options.allowedRatios.map((item) => String(item).toLowerCase()))
        : null;
    const raw = stripValueNotes(value);
    if (!raw) return defaultRatio;
    const lower = raw.toLowerCase();
    if (lower === 'auto') {
        return allowed ? (allowed.has('auto') ? 'auto' : defaultRatio) : defaultRatio;
    }
    const match = raw.match(/^(\d+):(\d+)$/);
    if (match) {
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            const normalized = `${w}:${h}`;
            if (allowed && !allowed.has(normalized.toLowerCase())) return defaultRatio;
            return normalized;
        }
    }
    if (allowed && !allowed.has(raw.toLowerCase())) return defaultRatio;
    return raw;
};
const supportsJimengVideoResolution = (modelKey) => {
    if (!modelKey) return false;
    const raw = String(modelKey).toLowerCase();
    if (!raw) return false;
    if (raw.includes('sora2')) return false;
    if (raw.includes('veo3')) return false;
    if (raw.includes('3.5')) return false;
    if (raw.includes('3.0-pro') || raw.includes('3.5-pro')) return false;
    if (raw.includes('2.0')) return false;
    if (raw.includes('vgfm_3.0_fast')) return true;
    if (raw.includes('vgfm_3.0') && !raw.includes('_pro')) return true;
    return raw.includes('video-3.0-fast') || raw.includes('video-3.0');
};
const normalizeJimengVideoResolution = (value, { allowExplicit = false } = {}) => {
    const normalized = normalizeVideoResolutionLower(stripValueNotes(value));
    if (!normalized || normalized === 'auto') return '';
    if (normalized === '720p' || normalized === '1080p') return normalized;
    if (normalized === '2k' || normalized === '4k') return '1080p';
    const cleaned = normalized.replace(/[^0-9x]/g, '');
    if (/^\d+x\d+$/.test(cleaned)) {
        if (!allowExplicit) {
            const [wRaw, hRaw] = cleaned.split('x').map((v) => parseInt(v, 10));
            const maxSide = Math.max(wRaw || 0, hRaw || 0);
            if (!maxSide) return '';
            return maxSide <= 1280 ? '720p' : '1080p';
        }
        return cleaned;
    }
    return '';
};
const normalizeDurationValue = (value, fallback = 8) => {
    if (value === null || value === undefined) return fallback;
    const cleaned = String(value).trim().replace(/[^\d]/g, '');
    const parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeJimengVideoDuration = (value, allowed = []) => {
    const fallback = allowed && allowed.length > 0 ? allowed[0] : 5;
    const parsed = normalizeDurationValue(value, fallback);
    if (!allowed || allowed.length === 0) return parsed;
    return allowed.includes(parsed) ? parsed : fallback;
};
const isImageModelType = (type) => type === 'Image' || type === 'ChatImage';
const isChatModelType = (type) => type === 'Chat' || type === 'ChatImage';
const MAX_CUSTOM_PARAMS = 30;
const DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS = 2;
const INTERNAL_CUSTOM_PARAM_NAMES = new Set([
    'tapnow_image_concurrency',
    'tapnow_concurrency',
    'image_concurrency'
]);
const DEFAULT_STORYBOARD_SCRIPT_PROMPT = `你是一个分镜脚本分析专家。请将用户提供的脚本按镜头拆分，每个镜头生成一个简洁的画面描述提示词。
输出格式为 JSON 数组: [{"prompt": "镜头1的画面描述"}, {"prompt": "镜头2的画面描述"}, ...]
只输出 JSON，不要其他内容。`;
const DEFAULT_STORYBOARD_NOVEL_PROMPT = `你是影视分镜策划师。请把用户提供的小说/剧情文本拆分成镜头列表，每个镜头输出一句可直接用于生图/生视频的画面提示词。
要求：
1) 保留剧情顺序与关键动作；
2) 每个镜头一条，避免空话；
3) 输出格式必须是 JSON 数组: [{"prompt":"..."}, ...]
只输出 JSON，不要其他内容。`;
const DEFAULT_STORYBOARD_TABLE_SUMMARY_PROMPT = `你是影视分镜提示词整合专家。请基于用户提供的分镜表逐行生成可直接用于生图/生视频的镜头提示词。
要求：
1) 每一行输出一条提示词，必须保持与 scene_index 一一对应；
2) 提示词应综合景别、运镜、场景描述、人物动作、情绪、台词等字段；
3) 不要输出解释；
4) 仅输出 JSON 数组，格式:
[{"scene_index":1,"prompt":"..."},{"scene_index":2,"prompt":"..."}]`;
const STORYBOARD_TABLE_PROMPT_MODE = 'table_summary';
const STORYBOARD_LLM_SPLIT_MODES = ['script', 'novel', 'custom'];
const STORYBOARD_LLM_PROMPT_MODES = [...STORYBOARD_LLM_SPLIT_MODES, STORYBOARD_TABLE_PROMPT_MODE];
const STORYBOARD_PROMPT_SLOT_OPTIONS = [
    { key: 'default', label: 'LLM Prompt', editable: false },
    { key: 'memory1', label: '记忆1', editable: true },
    { key: 'memory2', label: '记忆2', editable: true }
];
const STORYBOARD_EDITABLE_PROMPT_SLOT_KEYS = STORYBOARD_PROMPT_SLOT_OPTIONS
    .filter((item) => item.editable)
    .map((item) => item.key);
const STORYBOARD_DEFAULT_TABLE_HEADERS = [
    '场次镜号',
    '时长',
    '景别',
    '运镜',
    '场景描述',
    '人物动作',
    '生图提示词',
    '人物情绪',
    '台词和旁白',
    '参考画面',
    '音频音效',
    'BGM段落',
    '场景图',
    '人物图',
    '合成图',
    '片段视频'
];
const STORYBOARD_DEFAULT_MODE = 'image';
const STORYBOARD_VIEW_MODES = ['cards', 'table'];
const STORYBOARD_DEFAULT_VIEW_MODE = 'cards';
const STORYBOARD_WORKSPACE_MIN_HEIGHT = 96;
const STORYBOARD_WORKSPACE_MAX_HEIGHT = 360;
const STORYBOARD_WORKSPACE_DEFAULT_HEIGHT = 144;
const normalizeStoryboardWorkspaceHeight = (value, fallback = STORYBOARD_WORKSPACE_DEFAULT_HEIGHT) => {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(STORYBOARD_WORKSPACE_MIN_HEIGHT, Math.min(parsed, STORYBOARD_WORKSPACE_MAX_HEIGHT));
};
const MAX_CUSTOM_PARAM_VALUES = 50;
const COMPLETED_STATUS_SET = new Set(['completed', 'complete', 'success', 'succeeded', 'done', 'finished', 'ok']);
const normalizeStoryboardMode = (mode) => (String(mode || '').toLowerCase() === 'video' ? 'video' : STORYBOARD_DEFAULT_MODE);
const normalizeStoryboardViewMode = (mode) => (
    STORYBOARD_VIEW_MODES.includes(String(mode || '').toLowerCase())
        ? String(mode).toLowerCase()
        : STORYBOARD_DEFAULT_VIEW_MODE
);
const parseMarkdownTableRow = (line = '') => {
    const trimmed = String(line || '').trim();
    if (!trimmed.includes('|')) return [];
    const core = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    return core.split('|').map((cell) => cell.trim());
};
const isMarkdownTableSeparator = (line = '') => {
    const cells = parseMarkdownTableRow(line);
    if (!cells.length) return false;
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
};
const parseMarkdownTable = (text = '') => {
    if (!text || typeof text !== 'string') return null;
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.includes('|'));
    if (lines.length < 2) return null;
    let headerIndex = -1;
    for (let i = 0; i < lines.length - 1; i += 1) {
        if (!isMarkdownTableSeparator(lines[i + 1])) continue;
        const headerCells = parseMarkdownTableRow(lines[i]).filter(Boolean);
        if (headerCells.length > 0) {
            headerIndex = i;
            break;
        }
    }
    if (headerIndex < 0) return null;
    const headers = parseMarkdownTableRow(lines[headerIndex]).map((value) => value || '');
    if (headers.length === 0) return null;
    const rows = [];
    for (let i = headerIndex + 2; i < lines.length; i += 1) {
        const cells = parseMarkdownTableRow(lines[i]);
        if (cells.length === 0) continue;
        const normalized = headers.map((_, idx) => cells[idx] || '');
        if (normalized.some((cell) => cell)) rows.push(normalized);
    }
    return { headers, rows };
};
const parseDelimitedRow = (line = '', delimiter = ',') => {
    const raw = String(line ?? '');
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < raw.length; i += 1) {
        const char = raw[i];
        if (char === '"') {
            if (inQuotes && raw[i + 1] === '"') {
                current += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (char === delimiter && !inQuotes) {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    cells.push(current.trim());
    return cells;
};
const detectDelimitedSeparator = (lines = []) => {
    const candidates = ['\t', ',', ';'];
    let bestDelimiter = '';
    let bestScore = 0;
    candidates.forEach((delimiter) => {
        const score = lines.slice(0, 8).reduce((acc, line) => {
            const row = parseDelimitedRow(line, delimiter);
            return acc + Math.max(0, row.length - 1);
        }, 0);
        if (score > bestScore) {
            bestDelimiter = delimiter;
            bestScore = score;
        }
    });
    return bestScore > 0 ? bestDelimiter : '';
};
const parseDelimitedTable = (text = '') => {
    if (!text || typeof text !== 'string') return null;
    const lines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => String(line || '').trim())
        .filter((line) => line.length > 0);
    if (lines.length < 2) return null;
    const delimiter = detectDelimitedSeparator(lines);
    if (!delimiter) return null;
    const parsedRows = lines.map((line) => parseDelimitedRow(line, delimiter));
    const maxColumns = parsedRows.reduce((max, row) => Math.max(max, row.length), 0);
    if (maxColumns < 2) return null;
    const normalizeRow = (row) => Array.from({ length: maxColumns }, (_, idx) => String(row[idx] ?? '').trim());
    const isSeparatorRow = (row) => row.every((cell) => /^:?-{3,}:?$/.test(String(cell || '').replace(/\s+/g, '')));
    const headerRow = normalizeRow(parsedRows[0]);
    if (!headerRow.some((cell) => !!cell)) return null;
    const rawDataRows = parsedRows.slice(1);
    const startIndex = rawDataRows.length > 0 && isSeparatorRow(normalizeRow(rawDataRows[0])) ? 1 : 0;
    const rows = rawDataRows
        .slice(startIndex)
        .map((row) => normalizeRow(row))
        .filter((row) => row.some((cell) => !!cell));
    return { headers: headerRow, rows, delimiter };
};
const parseStoryboardTableInput = (text = '') => {
    const rawText = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!rawText) return { table: null, format: 'empty' };
    const markdownTable = parseMarkdownTable(rawText);
    if (markdownTable) return { table: markdownTable, format: 'markdown' };
    const delimitedTable = parseDelimitedTable(rawText);
    if (delimitedTable) {
        return {
            table: { headers: delimitedTable.headers, rows: delimitedTable.rows },
            format: delimitedTable.delimiter === '\t' ? 'tsv' : 'csv'
        };
    }
    return { table: null, format: 'unknown' };
};
const stringifyMarkdownTable = (tableData) => {
    const headers = Array.isArray(tableData?.headers)
        ? tableData.headers.map((header) => String(header ?? '').trim())
        : [];
    if (!headers.length) return '';
    const normalizedHeaders = headers.map((header, idx) => header || `列${idx + 1}`);
    const rows = Array.isArray(tableData?.rows)
        ? tableData.rows.map((row) => normalizedHeaders.map((_, colIdx) => String(Array.isArray(row) ? (row[colIdx] ?? '') : '')))
        : [];
    const headerLine = `| ${normalizedHeaders.join(' | ')} |`;
    const separatorLine = `| ${normalizedHeaders.map(() => '---').join(' | ')} |`;
    const rowLines = rows.map((row) => `| ${row.map((cell) => String(cell || '').replace(/\r?\n/g, '<br>')).join(' | ')} |`);
    return [headerLine, separatorLine, ...rowLines].join('\n');
};
const includesStoryboardHeaderKeyword = (header, keywords = []) => {
    const normalized = String(header || '').toLowerCase().replace(/\s+/g, '');
    if (!normalized) return false;
    return keywords.some((keyword) => normalized.includes(String(keyword || '').toLowerCase().replace(/\s+/g, '')));
};
const getStoryboardTableShotColumnIndex = (headers = []) => headers.findIndex((header) => includesStoryboardHeaderKeyword(header, ['场次镜号', '镜头号', '镜号', 'scene', 'shot']));
const getStoryboardTablePromptColumnIndex = (headers = []) => headers.findIndex((header) => includesStoryboardHeaderKeyword(header, ['生图提示词', '提示词', 'prompt']));
const getStoryboardTableDescriptionColumnIndex = (headers = []) => headers.findIndex((header) => includesStoryboardHeaderKeyword(header, ['场景描述', '人物动作', '镜头描述', '描述', 'description']));
const normalizeStoryboardSceneIndex = (value, fallback = 1) => {
    const fallbackValue = Number.isFinite(Number(fallback)) && Number(fallback) > 0 ? Number(fallback) : 1;
    const raw = String(value ?? '').trim();
    if (!raw) return fallbackValue;
    const match = raw.match(/\d+/);
    if (!match) return fallbackValue;
    const parsed = Number.parseInt(match[0], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
};
const parseJsonArrayFromText = (text = '') => {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const candidates = [];
    const fencedMatches = raw.match(/```(?:json)?\s*([\s\S]*?)```/ig);
    if (Array.isArray(fencedMatches) && fencedMatches.length > 0) {
        fencedMatches.forEach((block) => {
            const stripped = String(block || '').replace(/```(?:json)?/i, '').replace(/```$/, '').trim();
            if (stripped) candidates.push(stripped);
        });
    }
    candidates.push(raw);
    for (const candidate of candidates) {
        const trimmed = String(candidate || '').trim();
        if (!trimmed) continue;
        try {
            const parsedDirect = JSON.parse(trimmed);
            if (Array.isArray(parsedDirect)) return parsedDirect;
        } catch (err) {
            // ignore and try bracket extraction
        }
        const match = trimmed.match(/\[[\s\S]*\]/);
        if (!match) continue;
        try {
            const parsedArray = JSON.parse(match[0]);
            if (Array.isArray(parsedArray)) return parsedArray;
        } catch (err) {
            // ignore and continue
        }
    }
    return null;
};
const isCompletedLikeStatus = (status) => {
    if (status === null || status === undefined || status === '') return true;
    const normalized = String(status).trim().toLowerCase();
    if (!normalized) return true;
    return COMPLETED_STATUS_SET.has(normalized);
};
const normalizeCustomParamNotes = (notes) => {
    if (!notes || typeof notes !== 'object') return {};
    const next = {};
    Object.entries(notes).forEach(([value, note]) => {
        const key = String(value || '').trim();
        const text = typeof note === 'string' ? note.trim() : '';
        if (key && text) next[key] = text;
    });
    return next;
};
const normalizeValueNotes = (notes) => normalizeCustomParamNotes(notes);
const normalizeResolutionNotes = (notes) => {
    if (!notes || typeof notes !== 'object') return {};
    const next = {};
    Object.entries(notes).forEach(([value, note]) => {
        const key = normalizeResolutionOption(value);
        const text = typeof note === 'string' ? note.trim() : '';
        if (key && text) next[key] = text;
    });
    return next;
};
const normalizeCustomParams = (params) => {
    if (!Array.isArray(params)) return [];
    return params.map((param, index) => {
        if (!param) return null;
        const id = String(param.id || '').trim()
            || `param-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${index}`;
        const rawName = param?.name ?? param?.label ?? param?.displayName ?? param?.paramName ?? param?.key;
        const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';
        const values = Array.isArray(param.values)
            ? param.values.map(value => String(value).trim()).filter(Boolean)
            : [];
        const rawDefault = param?.defaultValue ?? param?.default ?? '';
        const defaultValue = rawDefault === null || rawDefault === undefined
            ? ''
            : String(rawDefault).trim();
        const normalizedNotes = normalizeCustomParamNotes(param.valueNotes || param.valueLabels || param.notes);
        const notesEnabled = typeof param.notesEnabled === 'boolean'
            ? param.notesEnabled
            : Object.keys(normalizedNotes).length > 0;
        return {
            id,
            name,
            values,
            override: !!param.override,
            notesEnabled,
            valueNotes: normalizedNotes,
            defaultValue
        };
    }).filter(Boolean);
};
const getImageSourceFallbackByParam = (paramName, imageSources = []) => {
    if (!paramName || !Array.isArray(imageSources) || imageSources.length === 0) return null;
    const lower = String(paramName).toLowerCase();
    let index = null;
    if (lower.includes('imagea')) index = 0;
    else if (lower.includes('imageb')) index = 1;
    else if (lower.includes('imagec')) index = 2;
    else if (lower.includes('imaged')) index = 3;
    if (index === null) {
        const numberMatch = lower.match(/image(?:_|-)?(\d+)/);
        if (numberMatch) {
            const parsed = parseInt(numberMatch[1], 10);
            if (Number.isFinite(parsed) && parsed > 0) index = parsed - 1;
        }
    }
    if (index === null) return null;
    return imageSources[index] || null;
};
function getDefaultRequestTemplateForType(type) {
    const modelType = type || 'Chat';
    let endpoint = '/v1/images/generations';
    if (modelType === 'Video') endpoint = '/v1/videos/generations';
    if (modelType === 'Chat' || modelType === 'ChatImage') endpoint = '/v1/chat/completions';
    let body = {
        model: '{{modelName}}',
        prompt: '{{prompt}}'
    };
    if (modelType === 'Video') {
        body = {
            model: '{{modelName}}',
            prompt: '{{prompt}}',
            duration: '{{duration:number}}',
            ratio: '{{ratio}}',
            resolution: '{{resolution}}'
        };
    } else if (modelType === 'Chat' || modelType === 'ChatImage') {
        body = {
            model: '{{modelName}}',
            messages: '{{messages}}',
            stream: false
        };
    } else {
        body = {
            model: '{{modelName}}',
            prompt: '{{prompt}}',
            n: '{{n:number}}',
            size: '{{size}}'
        };
    }
    return {
        enabled: false,
        endpoint,
        method: 'POST',
        bodyType: 'json',
        headers: { 'Content-Type': 'application/json' },
        query: {},
        files: {},
        timeoutMs: null,
        responseParser: '',
        body
    };
}
function isJimengVideoModelId(value) {
    const raw = String(value || '').toLowerCase();
    if (!raw) return false;
    return raw.includes('jimeng') || raw.includes('dreamina');
}
function getJimengVideoRequestTemplate() {
    return {
        enabled: true,
        endpoint: '/v1/videos/generations',
        method: 'POST',
        bodyType: 'auto',
        headers: { 'Content-Type': 'application/json' },
        query: {},
        files: {
            image_file_1: '{{firstFrame:blob}}',
            image_file_2: '{{lastFrame:blob}}'
        },
        timeoutMs: null,
        responseParser: 'jimeng.video',
        body: {
            model: '{{modelName}}',
            prompt: '{{prompt}}',
            duration: '{{jimengDuration:number}}',
            ratio: '{{jimengRatio}}',
            resolution: '{{jimengResolution}}'
        }
    };
}
function getDefaultRequestTemplateForEntry(entry) {
    const type = entry?.type || 'Chat';
    const id = entry?.id || entry?.modelName || '';
    if (type === 'Video' && isJimengVideoModelId(id)) {
        return getJimengVideoRequestTemplate();
    }
    return getDefaultRequestTemplateForType(type);
}
const getCustomParamSelection = (param, selections) => {
    if (!param) return '';
    if (selections) {
        const byId = param.id && selections[param.id];
        if (byId !== undefined && byId !== null && byId !== '') return byId;
        const byName = param.name && selections[param.name];
        if (byName !== undefined && byName !== null && byName !== '') return byName;
    }
    const fallback = param?.defaultValue ?? '';
    if (fallback !== undefined && fallback !== null && fallback !== '') return fallback;
    return '';
};
const getValueLabelWithNotes = (value, notesEnabled, notes) => {
    if (!value) return '';
    if (!notesEnabled) return value;
    const note = notes?.[value];
    return note ? `${value}(${note})` : value;
};
const getNoteLabelWithNotes = (value, notesEnabled, notes) => {
    if (!value) return '';
    if (!notesEnabled) return value;
    const note = notes?.[value];
    return note || value;
};
const getCustomParamValueLabel = (param, value) => {
    return getValueLabelWithNotes(value, !!param?.notesEnabled, param?.valueNotes || {});
};
const isCustomParamInputMode = (param) => {
    if (!param) return false;
    const rawName = String(param?.name || '');
    const name = rawName.toLowerCase();
    if (name.includes('input') || rawName.includes('输入')) return true;
    const values = Array.isArray(param?.values) ? param.values : [];
    return values.some((value) => {
        const rawValue = String(value || '');
        return rawValue.toLowerCase().includes('input') || rawValue.includes('输入');
    });
};
const applyCustomParamsToPayload = (payload, customParams, selections) => {
    if (!payload || !Array.isArray(customParams) || customParams.length === 0) return payload;
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    customParams.forEach((param) => {
        const name = String(param?.name || '').trim();
        if (!name) return;
        if (INTERNAL_CUSTOM_PARAM_NAMES.has(name)) return;
        const value = getCustomParamSelection(param, selections);
        if (value === '' || value === undefined || value === null) return;
        if (isFormData) {
            if (param.override || !payload.has(name)) {
                payload.set(name, value);
            }
            return;
        }
        if (param.override || payload[name] === undefined) {
            payload[name] = value;
        }
    });
    return payload;
};
const buildCustomParamPreviewPayload = (basePayload, customParams) => {
    if (!basePayload) return basePayload;
    if (!Array.isArray(customParams) || customParams.length === 0) return basePayload;
    const preview = { ...basePayload };
    customParams.forEach((param) => {
        const name = String(param?.name || '').trim();
        if (!name) return;
        if (INTERNAL_CUSTOM_PARAM_NAMES.has(name)) return;
        const value = Array.isArray(param.values) && param.values.length > 0 ? param.values[0] : '';
        if (value === '') return;
        if (param.override || preview[name] === undefined) {
            preview[name] = value;
        }
    });
    return preview;
};
const normalizeImageConcurrency = (value) => {
    const parsed = parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(parsed, 9));
};
const applyImageBatchCountToPayload = (payload, imageCount) => {
    const safeCount = normalizeImageConcurrency(imageCount);
    if (safeCount <= 1 || payload === null || payload === undefined) return payload;
    if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        payload.set('n', String(safeCount));
        return payload;
    }
    if (typeof payload === 'string') {
        const trimmed = payload.trim();
        if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return payload;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                parsed.n = safeCount;
                return JSON.stringify(parsed);
            }
            return payload;
        } catch (e) {
            return payload;
        }
    }
    if (typeof payload === 'object' && !Array.isArray(payload)) {
        return { ...payload, n: safeCount };
    }
    return payload;
};
const normalizeImageDispatchIntervalSeconds = (value, fallback = DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS) => {
    const parsed = parseFloat(String(value ?? '').trim());
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(parsed, 30));
};
const waitForMilliseconds = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const resolveImageConcurrencyFromCustomParams = (customParams, selections, fallback = 1) => {
    const safeFallback = normalizeImageConcurrency(fallback);
    if (!Array.isArray(customParams) || customParams.length === 0) return safeFallback;
    for (const param of customParams) {
        const name = String(param?.name || '').trim();
        if (!name || !INTERNAL_CUSTOM_PARAM_NAMES.has(name)) continue;
        const value = getCustomParamSelection(param, selections || {});
        if (value === '' || value === undefined || value === null) continue;
        return normalizeImageConcurrency(value);
    }
    return safeFallback;
};
const detectThrottleSignalsFromError = (message = '') => {
    const text = String(message || '');
    const is429 = /(^|[^\d])429([^\d]|$)/.test(text) || /too many requests/i.test(text);
    const isTimeout = /timeout|timed out|超时/i.test(text);
    return {
        http429Count: is429 ? 1 : 0,
        timeoutCount: isTimeout ? 1 : 0
    };
};
const attachHistoryThrottleStats = (historyItem, message = '', patch = {}) => {
    if (!historyItem || typeof historyItem !== 'object') return historyItem;
    const current = historyItem.throttleStats && typeof historyItem.throttleStats === 'object'
        ? historyItem.throttleStats
        : {};
    const signals = detectThrottleSignalsFromError(message);
    const next = {
        dispatchIntervalSec: Number.isFinite(Number(patch.dispatchIntervalSec))
            ? Number(patch.dispatchIntervalSec)
            : (Number.isFinite(Number(current.dispatchIntervalSec)) ? Number(current.dispatchIntervalSec) : 0),
        requestedImageCount: patch.requestedImageCount ?? current.requestedImageCount ?? null,
        imageBatchMode: patch.imageBatchMode ?? current.imageBatchMode ?? null,
        retryCount: Math.max(0, Number(current.retryCount || 0) + Math.max(0, Number(patch.retryCountInc || 0))),
        http429Count: Math.max(0, Number(current.http429Count || 0) + signals.http429Count + Math.max(0, Number(patch.http429CountInc || 0))),
        timeoutCount: Math.max(0, Number(current.timeoutCount || 0) + signals.timeoutCount + Math.max(0, Number(patch.timeoutCountInc || 0))),
        fallbackToParallel: patch.fallbackToParallel === true ? true : !!current.fallbackToParallel,
        lastErrorType: patch.lastErrorType
            || (signals.http429Count > 0 ? 'http_429' : '')
            || (signals.timeoutCount > 0 ? 'timeout' : '')
            || current.lastErrorType
            || '',
        lastErrorAt: patch.touchError ? Date.now() : (current.lastErrorAt || null)
    };
    return {
        ...historyItem,
        throttleStats: next
    };
};
const applyBatchFailureToHistoryItem = (historyItem, taskId, errorMsg, durationMs, consumeBatchFailure) => {
    if (typeof consumeBatchFailure !== 'function') return null;
    const batchFailure = consumeBatchFailure(taskId);
    if (!batchFailure) return null;
    const total = Math.max(1, Number(batchFailure.total || 1));
    const settled = Math.max(0, Number(batchFailure.settled || 0));
    const hasOutput = Array.isArray(historyItem?.output_images) && historyItem.output_images.length > 0;
    const progress = Math.max(10, Math.min(95, Math.round((settled / total) * 95)));
    if (!batchFailure.done) {
        return attachHistoryThrottleStats({
            ...historyItem,
            status: 'generating',
            progress: Math.max(historyItem?.progress || 5, progress),
            errorMsg: hasOutput ? (historyItem?.errorMsg || null) : errorMsg,
            durationMs: durationMs ?? historyItem?.durationMs ?? null
        }, errorMsg, { touchError: true, lastErrorType: 'batch_partial_failure' });
    }
    if (hasOutput || Number(batchFailure.completed || 0) > 0) {
        return attachHistoryThrottleStats({
            ...historyItem,
            status: 'completed',
            progress: 100,
            errorMsg: hasOutput ? null : (historyItem?.errorMsg || null),
            durationMs: durationMs ?? historyItem?.durationMs ?? null
        }, '', { lastErrorType: '' });
    }
    return attachHistoryThrottleStats({
        ...historyItem,
        status: 'failed',
        errorMsg,
        durationMs: durationMs ?? historyItem?.durationMs ?? null
    }, errorMsg, { touchError: true, lastErrorType: 'batch_failed' });
};
const normalizePreviewOverridePatch = (patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
    return { ...patch };
};
const isPreviewValueEqual = (left, right) => {
    if (left === right) return true;
    if (typeof left === 'object' || typeof right === 'object') {
        try {
            return JSON.stringify(left) === JSON.stringify(right);
        } catch (e) {
            return false;
        }
    }
    return false;
};
const buildPreviewOverridePatch = (basePayload, editedPayload) => {
    if (!basePayload || !editedPayload || typeof editedPayload !== 'object') return null;
    const patch = {};
    const baseKeys = new Set(Object.keys(basePayload));
    Object.keys(editedPayload).forEach((key) => {
        const editedValue = editedPayload[key];
        const baseValue = basePayload[key];
        if (!isPreviewValueEqual(baseValue, editedValue)) {
            patch[key] = editedValue;
        }
        baseKeys.delete(key);
    });
    baseKeys.forEach((key) => {
        patch[key] = null;
    });
    return Object.keys(patch).length > 0 ? patch : null;
};
const applyPreviewOverridePatch = (payload, patch) => {
    if (!payload || !patch || typeof patch !== 'object') return payload;
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    Object.entries(patch).forEach(([key, value]) => {
        if (!key) return;
        if (value === null) {
            if (isFormData) {
                payload.delete(key);
            } else {
                delete payload[key];
            }
            return;
        }
        if (isFormData) {
            const nextValue = typeof value === 'string' ? value : JSON.stringify(value);
            payload.set(key, nextValue);
            return;
        }
        payload[key] = value;
    });
    return payload;
};
const normalizeRequestTemplate = (template) => {
    if (!template || typeof template !== 'object') return null;
    const normalized = {
        enabled: template.enabled !== false,
        endpoint: typeof template.endpoint === 'string' ? template.endpoint.trim() : '',
        method: (template.method || 'POST').toString().toUpperCase(),
        bodyType: (template.bodyType || 'json').toString().toLowerCase(),
        headers: (template.headers && typeof template.headers === 'object' && !Array.isArray(template.headers))
            ? { ...template.headers }
            : {},
        query: (template.query && typeof template.query === 'object' && !Array.isArray(template.query))
            ? { ...template.query }
            : {},
        files: (template.files && typeof template.files === 'object' && !Array.isArray(template.files))
            ? { ...template.files }
            : {},
        timeoutMs: Number.isFinite(template.timeoutMs) ? Number(template.timeoutMs) : null,
        responseParser: typeof template.responseParser === 'string' ? template.responseParser.trim() : '',
        body: (template.body && typeof template.body === 'object' && !Array.isArray(template.body))
            ? template.body
            : (template.body ?? {})
    };
    return normalized;
};
const normalizeTransportMode = (transport) => {
    const raw = String(transport || '').trim().toLowerCase();
    if (raw === TRANSPORT_HTTP_SSE || raw === 'sse' || raw === 'http_sse') return TRANSPORT_HTTP_SSE;
    if (raw === TRANSPORT_WS_STREAM || raw === 'ws' || raw === 'websocket' || raw === 'ws_stream') return TRANSPORT_WS_STREAM;
    return TRANSPORT_HTTP_JSON;
};
const normalizeTransportOptions = (options) => {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        return { ...DEFAULT_TRANSPORT_OPTIONS };
    }
    return {
        sseDataPrefix: String(options.sseDataPrefix || DEFAULT_TRANSPORT_OPTIONS.sseDataPrefix),
        sseDoneToken: String(options.sseDoneToken || DEFAULT_TRANSPORT_OPTIONS.sseDoneToken),
        sseDeltaPath: String(options.sseDeltaPath || ''),
        sseDelimiter: String(options.sseDelimiter || DEFAULT_TRANSPORT_OPTIONS.sseDelimiter),
        wsMessagePath: String(options.wsMessagePath || ''),
        wsDoneToken: String(options.wsDoneToken || DEFAULT_TRANSPORT_OPTIONS.wsDoneToken)
    };
};
function buildDefaultCapabilitySchema(type) {
    const modelType = String(type || 'Chat');
    const isChat = modelType === 'Chat' || modelType === 'ChatImage';
    const isMedia = modelType === 'Image' || modelType === 'Video' || modelType === 'ChatImage';
    return {
        supportsMultipart: isMedia,
        supportsRequestChain: false,
        supportsSSE: false,
        supportsWS: false,
        supportsTools: isChat
    };
}
const normalizeCapabilitySchema = (capabilities, type) => {
    const defaults = buildDefaultCapabilitySchema(type);
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
        return defaults;
    }
    return {
        supportsMultipart: capabilities.supportsMultipart === true,
        supportsRequestChain: capabilities.supportsRequestChain === true,
        supportsSSE: capabilities.supportsSSE === true,
        supportsWS: capabilities.supportsWS === true,
        supportsTools: capabilities.supportsTools === true
    };
};
const validateModelLibraryContract = (entry) => {
    const issues = [];
    if (!entry || typeof entry !== 'object') return issues;
    const capabilities = normalizeCapabilitySchema(entry.capabilities, entry.type);
    const requestTemplate = normalizeRequestTemplate(entry.requestTemplate || getDefaultRequestTemplateForEntry(entry));
    const requestChain = normalizeRequestChain(entry.requestChain);
    const transportMode = normalizeTransportMode(entry.transport);

    const bodyType = String(requestTemplate?.bodyType || '').toLowerCase();
    if (bodyType === 'multipart' && !capabilities.supportsMultipart) {
        issues.push({ level: 'error', code: 'cap_multipart', message: '模板使用 multipart，但 capabilities.supportsMultipart=false' });
    }
    if (requestChain?.enabled) {
        if (!capabilities.supportsRequestChain) {
            issues.push({ level: 'error', code: 'cap_chain', message: 'requestChain 已启用，但 capabilities.supportsRequestChain=false' });
        }
        if (!Array.isArray(requestChain.steps) || requestChain.steps.length === 0) {
            issues.push({ level: 'error', code: 'chain_empty', message: 'requestChain 已启用，但 steps 为空' });
        }
    }
    if (transportMode === TRANSPORT_HTTP_SSE && !capabilities.supportsSSE) {
        issues.push({ level: 'error', code: 'cap_sse', message: 'transport=http-sse，但 capabilities.supportsSSE=false' });
    }
    if (transportMode === TRANSPORT_WS_STREAM && !capabilities.supportsWS) {
        issues.push({ level: 'error', code: 'cap_ws', message: 'transport=ws-stream，但 capabilities.supportsWS=false' });
    }
    const streamValue = getValueByPathLoose(requestTemplate?.body || {}, 'stream');
    if (transportMode === TRANSPORT_HTTP_SSE && streamValue !== true) {
        issues.push({ level: 'warning', code: 'sse_stream_flag', message: 'transport=http-sse 建议 body.stream=true' });
    }
    if (transportMode === TRANSPORT_WS_STREAM && requestTemplate?.endpoint && !/^wss?:\/\//i.test(String(requestTemplate.endpoint))) {
        issues.push({ level: 'warning', code: 'ws_endpoint', message: 'ws-stream 建议 endpoint 使用 ws:// 或 wss://' });
    }
    let bodyText = '';
    try {
        bodyText = JSON.stringify(requestTemplate?.body || {});
    } catch {
        bodyText = '';
    }
    if (/"tools"\s*:|"tool_choice"\s*:|"search"\s*:/i.test(bodyText) && !capabilities.supportsTools) {
        issues.push({ level: 'error', code: 'cap_tools', message: '模板包含 tools/tool_choice/search 字段，但 capabilities.supportsTools=false' });
    }

    return issues;
};
const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
    return [];
};
const normalizeAsyncRequestTemplate = (template) => {
    if (!template || typeof template !== 'object') return null;
    return normalizeRequestTemplate({ ...template, enabled: true });
};
const coerceAsyncRequestTemplate = (value, defaultMethod = 'GET') => {
    if (!value) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const hasRequestId = /\{\{\s*requestId\s*\}\}/i.test(trimmed)
            || /requestId=|request_id=|taskId=/.test(trimmed);
        const endpoint = hasRequestId
            ? trimmed
            : `${trimmed}${trimmed.includes('?') ? '&' : '?'}requestId={{requestId}}`;
        return normalizeRequestTemplate({ endpoint, method: defaultMethod });
    }
    if (typeof value === 'object') {
        return normalizeAsyncRequestTemplate(value);
    }
    return null;
};
const normalizeAsyncConfig = (config) => {
    if (!config || typeof config !== 'object') return null;
    const normalized = {
        enabled: config.enabled === true,
        requestIdPaths: normalizeStringArray(config.requestIdPaths || config.requestIdPath || config.requestId),
        pollIntervalMs: Number.isFinite(Number(config.pollIntervalMs)) ? Number(config.pollIntervalMs) : 3000,
        maxAttempts: Number.isFinite(Number(config.maxAttempts)) ? Number(config.maxAttempts) : 300,
        statusRequest: coerceAsyncRequestTemplate(config.statusRequest || config.status || config.pollRequest || config.detail),
        statusPath: typeof config.statusPath === 'string' ? config.statusPath.trim() : '',
        successValues: normalizeStringArray(config.successValues || config.successStatuses || config.successStatus || config.success),
        failureValues: normalizeStringArray(config.failureValues || config.failureStatuses || config.failureStatus || config.failure),
        outputsRequest: coerceAsyncRequestTemplate(config.outputsRequest || config.outputs || config.resultRequest),
        outputsPath: typeof config.outputsPath === 'string' ? config.outputsPath.trim() : '',
        outputsUrlField: typeof config.outputsUrlField === 'string' ? config.outputsUrlField.trim() : '',
        errorPath: typeof config.errorPath === 'string' ? config.errorPath.trim() : ''
    };
    if (!normalized.requestIdPaths.length) {
        normalized.requestIdPaths = ['requestId', 'request_id', 'data.requestId', 'data.request_id'];
    }
    normalized.successValues = normalized.successValues.length
        ? normalized.successValues.map(v => v.toUpperCase())
        : ['SUCCESS', 'SUCCEED', 'COMPLETED', 'FINISHED', 'DONE'];
    normalized.failureValues = normalized.failureValues.length
        ? normalized.failureValues.map(v => v.toUpperCase())
        : ['FAILED', 'ERROR', 'CANCELLED', 'CANCELED', 'FAILURE'];
    return normalized;
};
const normalizeRequestChainExtract = (extract) => {
    if (!extract) return {};
    if (Array.isArray(extract)) {
        const mapped = {};
        extract.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const targetKey = String(item.to || item.key || item.var || item.name || '').trim();
            const sourcePath = String(item.path || item.from || item.value || '').trim();
            if (!targetKey || !sourcePath) return;
            mapped[targetKey] = sourcePath;
        });
        return mapped;
    }
    if (typeof extract === 'object') {
        const mapped = {};
        Object.entries(extract).forEach(([targetKey, sourcePath]) => {
            const key = String(targetKey || '').trim();
            const path = String(sourcePath || '').trim();
            if (!key || !path) return;
            mapped[key] = path;
        });
        return mapped;
    }
    return {};
};
const normalizeRequestChainStep = (step, index = 0) => {
    if (!step || typeof step !== 'object') return null;
    const typeRaw = String(step.type || 'http').trim().toLowerCase();
    const type = typeRaw === 'transform' ? 'transform' : 'http';
    const id = String(step.id || step.name || `step-${index + 1}`).trim() || `step-${index + 1}`;
    const onErrorRaw = String(step.onError || step.errorStrategy || 'stop').trim().toLowerCase();
    const onError = ['stop', 'continue', 'fallback'].includes(onErrorRaw) ? onErrorRaw : 'stop';
    const fallbackVars = step.fallbackVars && typeof step.fallbackVars === 'object' && !Array.isArray(step.fallbackVars)
        ? { ...step.fallbackVars }
        : {};

    if (type === 'transform') {
        const assign = step.assign && typeof step.assign === 'object' && !Array.isArray(step.assign)
            ? step.assign
            : {};
        return {
            id,
            type,
            onError,
            assign,
            extract: normalizeRequestChainExtract(step.extract),
            fallbackVars
        };
    }

    const requestRaw = step.request || step.template || step.requestTemplate || step.http || step;
    const request = normalizeRequestTemplate({ ...requestRaw, enabled: true });
    return {
        id,
        type,
        onError,
        request,
        extract: normalizeRequestChainExtract(step.extract),
        transport: normalizeTransportMode(step.transport),
        transportOptions: normalizeTransportOptions(step.transportOptions),
        fallbackVars
    };
};
const normalizeRequestChain = (chain) => {
    if (!chain || typeof chain !== 'object') return null;
    const steps = Array.isArray(chain.steps)
        ? chain.steps.map((step, idx) => normalizeRequestChainStep(step, idx)).filter(Boolean)
        : [];
    return {
        enabled: chain.enabled === true,
        steps
    };
};
const normalizeModelLibraryEntry = (entry, index = 0) => {
    if (!entry || typeof entry !== 'object') return null;
    const rawId = String(entry.id || entry.modelName || entry.displayName || '').trim();
    const id = rawId || `library-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${index}`;
    const normalizedDefaultRatio = String(entry.defaultRatio || '').trim();
    const normalizedDefaultResolution = normalizeResolutionOption(entry.defaultResolution || '') || '';
    const normalizedDefaultDurationRaw = String(entry.defaultDuration || '').trim();
    const normalizedDefaultDuration = normalizedDefaultDurationRaw
        ? (normalizedDefaultDurationRaw.endsWith('s') ? normalizedDefaultDurationRaw : `${normalizedDefaultDurationRaw}s`)
        : '';
    const normalizedDefaultVideoResolution = normalizeVideoResolution(entry.defaultVideoResolution || '');
    const normalizedDefaultImageConcurrency = normalizeImageConcurrency(
        entry.defaultImageConcurrency ?? entry.defaultImageCount ?? entry.imageConcurrency ?? entry.concurrentImages ?? 1
    );
    return {
        id,
        displayName: entry.displayName || entry.modelName || id,
        modelName: entry.modelName || entry.displayName || id,
        type: entry.type || 'Chat',
        apiType: entry.apiType || 'openai',
        disabled: !!entry.disabled,
        imageRouteMode: normalizeImageRouteMode(entry.imageRouteMode || entry.antigravityRouteMode),
        imageBatchMode: normalizeImageBatchMode(entry.imageBatchMode || entry.batchMode || entry.multiImageMode),
        nativeMultiImageMode: normalizeNativeMultiImageMode(
            entry.nativeMultiImageMode
            || entry.nativeImageBatchMode
            || entry.nativeMultiOutputMode
            || entry.nativeMultiImage
        ),
        ratioLimits: Array.isArray(entry.ratioLimits) ? entry.ratioLimits : null,
        defaultRatio: normalizedDefaultRatio,
        ratioNotes: normalizeValueNotes(entry.ratioNotes),
        ratioNotesEnabled: !!entry.ratioNotesEnabled,
        resolutionLimits: Array.isArray(entry.resolutionLimits) ? entry.resolutionLimits : null,
        defaultResolution: normalizedDefaultResolution,
        defaultImageConcurrency: normalizedDefaultImageConcurrency,
        resolutionNotes: normalizeResolutionNotes(entry.resolutionNotes),
        resolutionNotesEnabled: !!entry.resolutionNotesEnabled,
        durations: Array.isArray(entry.durations) ? entry.durations : null,
        defaultDuration: normalizedDefaultDuration,
        durationNotes: normalizeValueNotes(entry.durationNotes),
        durationNotesEnabled: !!entry.durationNotesEnabled,
        videoResolutions: Array.isArray(entry.videoResolutions) ? entry.videoResolutions : null,
        defaultVideoResolution: normalizedDefaultVideoResolution && normalizedDefaultVideoResolution !== 'Auto'
            ? normalizedDefaultVideoResolution
            : '',
        videoResolutionNotes: normalizeValueNotes(entry.videoResolutionNotes),
        videoResolutionNotesEnabled: !!entry.videoResolutionNotesEnabled,
        supportsFirstLastFrame: !!entry.supportsFirstLastFrame,
        supportsHD: !!entry.supportsHD,
        omitRatioOnSubmit: !!entry.omitRatioOnSubmit,
        omitResolutionOnSubmit: !!entry.omitResolutionOnSubmit,
        omitDurationOnSubmit: !!entry.omitDurationOnSubmit,
        imageDispatchIntervalSec: normalizeImageDispatchIntervalSeconds(
            entry.imageDispatchIntervalSec,
            DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS
        ),
        customParams: normalizeCustomParams(entry.customParams),
        asyncConfig: normalizeAsyncConfig(entry.asyncConfig),
        requestChain: normalizeRequestChain(entry.requestChain),
        transport: normalizeTransportMode(entry.transport),
        transportOptions: normalizeTransportOptions(entry.transportOptions),
        capabilities: normalizeCapabilitySchema(entry.capabilities, entry.type),
        previewOverrideEnabled: !!entry.previewOverrideEnabled,
        previewOverridePatch: normalizePreviewOverridePatch(entry.previewOverridePatch),
        requestTemplate: normalizeRequestTemplate(entry.requestTemplate || getDefaultRequestTemplateForEntry(entry)),
        requestOverrideEnabled: !!entry.requestOverrideEnabled,
        requestOverridePatch: normalizeRequestOverridePatch(entry.requestOverridePatch),
        responseParser: entry.responseParser || ''
    };
};
const normalizeRequestOverridePatch = (patch) => {
    return normalizePreviewOverridePatch(patch);
};
const TEMPLATE_VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_-]+))?\s*\}\}/g;
const getTemplateVarValue = (vars, path) => {
    if (!vars || !path) return undefined;
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), vars);
};
const coerceTemplateValue = (value, type, options = {}) => {
    if (type === 'number') {
        if (value === null || value === undefined || value === '') return value;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : value;
    }
    if (type === 'string') {
        return value === null || value === undefined ? '' : String(value);
    }
    if (type === 'blob') {
        if (options.bodyType === 'json' && options.fallbackBlobAsDataUrl) {
            return options.fallbackBlobAsDataUrl;
        }
        return value;
    }
    return value;
};
const getValueByPath = (data, path) => {
    if (!data || !path) return undefined;
    const normalizedPath = String(path).replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
    const parts = normalizedPath.split('.').filter(Boolean);
    let current = data;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
};
const getValueByPathLoose = (data, path) => {
    const raw = String(path || '').trim();
    if (!raw) return undefined;
    const normalizedPath = raw.replace(/^\$\.?/, '');
    return getValueByPath(data, normalizedPath);
};
const getValueByPathAny = (data, paths) => {
    if (!paths || paths.length === 0) return undefined;
    for (const path of paths) {
        const value = getValueByPath(data, path);
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
};
const normalizeAsyncStatusValue = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim().toUpperCase();
};
const extractAsyncOutputUrls = (outputs, urlField) => {
    const urls = [];
    const pushUrl = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) urls.push(trimmed);
        }
    };
    const pushFromObject = (value) => {
        if (!value || typeof value !== 'object') return;
        if (urlField && value[urlField]) {
            pushUrl(value[urlField]);
            return;
        }
        const directUrl = value.url || value.image_url || value.imageUrl || value.object_url || value.objectUrl || value.path || value.uri || value.file_uri || value.fileUri;
        if (directUrl) pushUrl(directUrl);
        const base64Payload = value.b64_json || value.base64 || value.data;
        if (typeof base64Payload === 'string' && base64Payload.trim()) {
            pushUrl(base64Payload);
        }
    };
    if (Array.isArray(outputs)) {
        outputs.forEach((item) => {
            if (!item) return;
            if (typeof item === 'string') {
                pushUrl(item);
                return;
            }
            if (typeof item === 'object') {
                pushFromObject(item);
            }
        });
    } else if (outputs && typeof outputs === 'object') {
        pushFromObject(outputs);
    } else if (typeof outputs === 'string') {
        pushUrl(outputs);
    }
    return urls;
};
const isLikelyImagePayload = (value) => {
    if (!value || typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return true;
    if (LocalImageManager?.isImageId && LocalImageManager.isImageId(trimmed)) return true;
    const base64Like = /^[A-Za-z0-9+/=_-]+$/.test(trimmed);
    return base64Like && trimmed.length > 64;
};
const collectDeepImageValues = (input, maxDepth = 6) => {
    const results = new Set();
    const visited = new WeakSet();
    const pushValue = (value) => {
        if (isLikelyImagePayload(value)) results.add(value.trim());
    };
    const walk = (obj, depth = 0) => {
        if (depth > maxDepth || obj === null || obj === undefined) return;
        if (typeof obj === 'string') {
            pushValue(obj);
            return;
        }
        if (typeof obj !== 'object') return;
        if (visited.has(obj)) return;
        visited.add(obj);
        const urlFields = ['url', 'image_url', 'imageUrl', 'image', 'src', 'link', 'href', 'object_url', 'objectUrl', 'path', 'uri', 'file_uri', 'fileUri', 'data', 'base64', 'b64_json'];
        for (const field of urlFields) {
            if (obj[field]) pushValue(obj[field]);
        }
        if (Array.isArray(obj)) {
            obj.forEach((item) => walk(item, depth + 1));
            return;
        }
        Object.values(obj).forEach((value) => walk(value, depth + 1));
    };
    walk(input, 0);
    return Array.from(results);
};
const collectImmediateImageUrls = (data) => {
    if (!data || typeof data !== 'object') return [];
    const urls = new Set();
    const pushUrl = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) urls.add(trimmed);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((entry) => pushUrl(entry));
            return;
        }
        if (typeof value === 'object') {
            const directUrl = value.url || value.image_url || value.imageUrl || value.object_url || value.objectUrl || value.path || value.uri || value.file_uri || value.fileUri;
            if (directUrl) pushUrl(directUrl);
            const b64 = value.b64_json || value.base64 || value.data;
            if (typeof b64 === 'string' && b64.trim()) urls.add(b64.trim());
        }
    };
    const sources = [
        data?.data?.data,
        data?.data,
        data?.preview,
        data?.preview?.data,
        data?.response,
        data?.response?.data,
        data?.result,
        data?.result?.data,
        data?.output,
        data?.output?.data,
        data?.images,
        data?.data?.images,
        data?.output_images,
        data?.output?.output_images,
        data?.data?.output_images,
        data?.data?.output?.output_images,
        data?.result?.output_images,
        data?.result?.output?.output_images,
        data?.output?.images,
        data?.data?.output?.images
    ];
    sources.forEach((entry) => pushUrl(entry));
    return Array.from(urls);
};
const resolveTemplateString = (value, vars, options = {}) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const singleMatch = trimmed.match(/^{{\s*([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_-]+))?\s*}}$/);
    if (singleMatch) {
        const [, varName, varType] = singleMatch;
        const fallbackBlob = varType === 'blob'
            ? (getTemplateVarValue(vars, `${varName}DataUrl`) || getTemplateVarValue(vars, `${varName}DataURL`))
            : undefined;
        const raw = getTemplateVarValue(vars, varType === 'blob' ? `${varName}Blob` : varName);
        return coerceTemplateValue(raw, varType, { bodyType: options.bodyType, fallbackBlobAsDataUrl: fallbackBlob });
    }
    return value.replace(TEMPLATE_VAR_PATTERN, (matchText, varName, varType, offset) => {
        const fallbackBlob = varType === 'blob'
            ? (getTemplateVarValue(vars, `${varName}DataUrl`) || getTemplateVarValue(vars, `${varName}DataURL`))
            : undefined;
        const raw = getTemplateVarValue(vars, varType === 'blob' ? `${varName}Blob` : varName);
        const coerced = coerceTemplateValue(raw, varType, { bodyType: options.bodyType, fallbackBlobAsDataUrl: fallbackBlob });
        if (coerced === null || coerced === undefined) {
            if (options.bodyType === 'raw') {
                const prevChar = value[offset - 1];
                const nextChar = value[offset + matchText.length];
                if (prevChar === '"' && nextChar === '"') {
                    return '';
                }
                return 'null';
            }
            return '';
        }
        if (typeof coerced === 'object') {
            try {
                return JSON.stringify(coerced);
            } catch (e) {
                return '';
            }
        }
        return String(coerced);
    });
};
const resolveTemplateValue = (value, vars, options = {}) => {
    if (Array.isArray(value)) {
        return value.map((item) => resolveTemplateValue(item, vars, options));
    }
    if (value && typeof value === 'object' && !(value instanceof Blob) && !(value instanceof File)) {
        const next = {};
        Object.entries(value).forEach(([key, val]) => {
            next[key] = resolveTemplateValue(val, vars, options);
        });
        return next;
    }
    if (typeof value === 'string') {
        return resolveTemplateString(value, vars, options);
    }
    return value;
};
const appendQueryParams = (endpoint, query) => {
    if (!endpoint || !query || typeof query !== 'object') return endpoint;
    const entries = Object.entries(query).filter(([key, val]) => key);
    if (entries.length === 0) return endpoint;
    const isAbsolute = /^https?:/i.test(endpoint);
    const base = isAbsolute ? undefined : 'http://placeholder';
    let urlObj;
    try {
        urlObj = new URL(endpoint, base);
    } catch (e) {
        return endpoint;
    }
    entries.forEach(([key, val]) => {
        if (val === undefined || val === null || val === '') return;
        if (Array.isArray(val)) {
            val.forEach((item) => {
                if (item === undefined || item === null || item === '') return;
                urlObj.searchParams.append(key, String(item));
            });
            return;
        }
        urlObj.searchParams.set(key, String(val));
    });
    if (isAbsolute) return urlObj.toString();
    const path = urlObj.pathname || '';
    const search = urlObj.search || '';
    const hash = urlObj.hash || '';
    return `${path}${search}${hash}`;
};
const compactTemplateObject = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((item) => compactTemplateObject(item))
            .filter((item) => item !== undefined && item !== null);
    }
    if (value && typeof value === 'object' && !(value instanceof Blob) && !(value instanceof File)) {
        const next = {};
        Object.entries(value).forEach(([key, val]) => {
            if (!key) return;
            const cleaned = compactTemplateObject(val);
            if (cleaned === undefined || cleaned === null) return;
            next[key] = cleaned;
        });
        return next;
    }
    return value;
};
const hasBinaryTemplateValue = (value) => {
    if (!value) return false;
    if (value instanceof Blob || value instanceof File) return true;
    if (typeof value === 'string' && value.startsWith('data:')) return true;
    if (Array.isArray(value)) return value.some((item) => hasBinaryTemplateValue(item));
    if (typeof value === 'object') {
        return Object.values(value).some((item) => hasBinaryTemplateValue(item));
    }
    return false;
};
const buildRequestFromTemplate = (template, vars, options = {}) => {
    if (!template) return null;
    const rawBodyType = (template.bodyType || 'json').toString().toLowerCase();
    const method = (template.method || 'POST').toString().toUpperCase();
    const resolveTemplateWith = (bodyTypeForResolve) => ({
        resolvedEndpoint: resolveTemplateString(template.endpoint || '', vars, { bodyType: bodyTypeForResolve }),
        headers: compactTemplateObject(resolveTemplateValue(template.headers || {}, vars, { bodyType: bodyTypeForResolve })),
        resolvedQuery: compactTemplateObject(resolveTemplateValue(template.query || {}, vars, { bodyType: bodyTypeForResolve })),
        resolvedBody: compactTemplateObject(resolveTemplateValue(template.body || {}, vars, { bodyType: bodyTypeForResolve })),
        resolvedFiles: compactTemplateObject(resolveTemplateValue(template.files || {}, vars, { bodyType: bodyTypeForResolve }))
    });
    const resolveBodyType = rawBodyType === 'auto' ? 'multipart' : rawBodyType;
    let { resolvedEndpoint, headers, resolvedQuery, resolvedBody, resolvedFiles } = resolveTemplateWith(resolveBodyType);
    let bodyType = rawBodyType === 'auto'
        ? (hasBinaryTemplateValue(resolvedBody) || hasBinaryTemplateValue(resolvedFiles) ? 'multipart' : 'json')
        : rawBodyType;
    if (rawBodyType === 'auto' && bodyType === 'json') {
        ({ resolvedEndpoint, headers, resolvedQuery, resolvedBody, resolvedFiles } = resolveTemplateWith('json'));
    }
    let body = resolvedBody;
    if (bodyType === 'multipart') {
        const form = new FormData();
        Object.entries(resolvedBody || {}).forEach(([key, val]) => {
            if (val === undefined || val === null || key === '') return;
            if (Array.isArray(val)) {
                val.forEach((item) => {
                    if (item === undefined || item === null) return;
                    if (item instanceof Blob || item instanceof File) {
                        form.append(key, item, item.name || 'file');
                    } else if (typeof item === 'object') {
                        form.append(key, JSON.stringify(item));
                    } else {
                        form.append(key, String(item));
                    }
                });
                return;
            }
            if (val instanceof Blob || val instanceof File) {
                form.append(key, val, val.name || 'file');
            } else if (typeof val === 'object') {
                form.append(key, JSON.stringify(val));
            } else {
                form.append(key, String(val));
            }
        });
        Object.entries(resolvedFiles || {}).forEach(([key, val]) => {
            if (!key || val === undefined || val === null) return;
            const appendFile = (fileVal) => {
                if (!fileVal) return;
                if (fileVal instanceof Blob || fileVal instanceof File) {
                    form.append(key, fileVal, fileVal.name || 'file');
                    return;
                }
                if (typeof fileVal === 'string' && fileVal.startsWith('data:')) {
                    try {
                        const blob = dataUrlToBlob(fileVal);
                        form.append(key, blob, 'file');
                    } catch { /* empty */ }
                }
            };
            if (Array.isArray(val)) {
                val.forEach(appendFile);
                return;
            }
            appendFile(val);
        });
        body = form;
    } else if (bodyType === 'raw') {
        if (typeof body !== 'string') {
            body = JSON.stringify(body ?? {});
        }
    }
    return {
        url: appendQueryParams(resolvedEndpoint, resolvedQuery),
        method,
        headers,
        body,
        bodyType,
        timeoutMs: Number.isFinite(template.timeoutMs) ? Number(template.timeoutMs) : null,
        responseParser: template.responseParser || ''
    };
};
const applyRequestOverridePatch = (request, patch) => {
    if (!request || !patch || typeof patch !== 'object') return request;
    const next = { ...request };
    Object.entries(patch).forEach(([key, value]) => {
        if (!key) return;
        if (value === null) {
            delete next[key];
        } else {
            next[key] = value;
        }
    });
    return next;
};
const coerceFormDataFromObject = (data) => {
    if (typeof FormData === 'undefined') return data;
    if (data instanceof FormData) return data;
    const form = new FormData();
    const entries = data && typeof data === 'object' ? Object.entries(data) : [];
    entries.forEach(([key, val]) => {
        if (val === undefined || val === null || key === '') return;
        if (Array.isArray(val)) {
            val.forEach((item) => {
                if (item === undefined || item === null) return;
                if (item instanceof Blob || item instanceof File) {
                    form.append(key, item, item.name || 'file');
                } else if (typeof item === 'object') {
                    form.append(key, JSON.stringify(item));
                } else {
                    form.append(key, String(item));
                }
            });
            return;
        }
        if (val instanceof Blob || val instanceof File) {
            form.append(key, val, val.name || 'file');
        } else if (typeof val === 'object') {
            form.append(key, JSON.stringify(val));
        } else {
            form.append(key, String(val));
        }
    });
    return form;
};
const formatRequestPreview = (request) => {
    if (!request) return null;
    const formatted = { ...request };
    if (request.body instanceof FormData) {
        const formEntries = {};
        request.body.forEach((value, key) => {
            if (!formEntries[key]) formEntries[key] = [];
            if (value instanceof Blob || value instanceof File) {
                formEntries[key].push('[Blob]');
            } else {
                formEntries[key].push(value);
            }
        });
        formatted.body = formEntries;
    }
    return formatted;
};
const getModelLibraryPreviewEndpoint = (entry) => {
    if (!entry) return '/v1/images/generations';
    if (entry.type === 'Video') return '/v1/videos/generations';
    if (entry.type === 'Chat' || entry.type === 'ChatImage') return '/v1/chat/completions';
    return '/v1/images/generations';
};
const buildPythonPreviewSnippet = (endpoint, payload) => {
    const jsonText = JSON.stringify(payload || {}, null, 2);
    return [
        'import requests, json',
        'BASE_URL = "https://api.example.com"',
        'API_KEY = "YOUR_API_KEY"',
        `url = f"{BASE_URL}${endpoint}"`,
        'headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}',
        `payload = json.loads('''${jsonText}''')`,
        'resp = requests.post(url, headers=headers, json=payload)',
        'print(resp.json())'
    ].join('\n');
};
// 根据模型返回不同的分辨率选项
const getDefaultResolutionsForModel = (modelId) => {
    if (!modelId) return RESOLUTIONS;
    // jimeng-4.5模型只显示2K和4K两个选项
    if (modelId.includes('jimeng-4.5')) return ['2K', '4K'];
    return RESOLUTIONS;
};
// Midjourney版本列表
const MJ_VERSIONS = [
    { label: 'MJ V7', value: '--v 7' },
    { label: 'MJ V6.1', value: '--v 6.1' },
    { label: 'MJ V6', value: '--v 6' },
    { label: 'MJ V5.2', value: '--v 5.2' },
    { label: 'MJ V5.1', value: '--v 5.1' },
    { label: 'Niji V6', value: '--niji 6' },
    { label: 'Niji V5', value: '--niji 5' },
    { label: 'Niji V4', value: '--niji 4' }
];

// --- 辅助：计算真实分辨率 ---
const calculateResolution = (ratio, baseResolution) => {
    let baseW = 1024;
    let baseH = 1024;

    if (isExplicitImageResolution(baseResolution)) {
        const parts = String(baseResolution).trim().split(/[xX]/);
        const parsedW = parseInt(parts[0], 10);
        const parsedH = parseInt(parts[1], 10);
        if (Number.isFinite(parsedW) && Number.isFinite(parsedH)) {
            const safeW = Math.max(16, Math.round(parsedW / 16) * 16);
            const safeH = Math.max(16, Math.round(parsedH / 16) * 16);
            return { str: `${safeW}x${safeH}`, w: safeW, h: safeH };
        }
    }

    if (baseResolution === '1080P') { baseW = 1920; baseH = 1080; }
    else if (baseResolution === '720P') { baseW = 1280; baseH = 720; }
    else if (baseResolution === '2K') { baseW = 2048; baseH = 2048; }
    else if (baseResolution === '4K') { baseW = 3840; baseH = 2160; }
    else if (typeof baseResolution === 'string') {
        const kMatch = baseResolution.toUpperCase().match(/^(\d+)K$/);
        if (kMatch) {
            const size = parseInt(kMatch[1], 10) * 1024;
            baseW = size;
            baseH = size;
        }
    }

    if (ratio === 'Auto') {
        return { str: `${baseW}x${baseH}`, w: baseW, h: baseH };
    }

    const [rW, rH] = ratio.split(':').map(Number);
    if (!rW || !rH) return { str: '1024x1024', w: 1024, h: 1024 };

    let targetW;
    let targetH;

    if (Math.abs(rW - rH) < 0.1) {
        targetW = baseW; targetH = baseH;
    } else if (rW > rH) {
        targetW = (baseResolution === 'Auto' || baseResolution === '1K') ? 1280 : baseW;
        targetH = Math.round(targetW * (rH / rW));
    } else {
        targetH = (baseResolution === 'Auto' || baseResolution === '1K') ? 1280 : baseW;
        targetW = Math.round(targetH * (rW / rH));
    }

    targetW = Math.round(targetW / 16) * 16;
    targetH = Math.round(targetH / 16) * 16;

    return { str: `${targetW}x${targetH}`, w: targetW, h: targetH };
};

const getModelParams = (modelId, ratio, resolution) => {
    const { str, w, h } = calculateResolution(ratio, resolution);
    if (isExplicitImageResolution(resolution)) {
        return { sizeStr: str, w, h };
    }
    if (modelId.includes('minimax')) {
        return { sizeStr: resolution === '4K' ? '1080p' : '720p', w, h };
    }
    if (modelId.includes('jimeng') || modelId.includes('veo')) {
        return { sizeStr: ratio, w, h };
    }
    if (modelId.includes('grok')) {
        // Grok 接口需要传 aspect_ratio，size 传比例字符串即可
        return { sizeStr: ratio, w, h };
    }
    return { sizeStr: str, w, h };
};

const AUTOSAVE_LOCAL_KEY = 'tapnow_autosave';
const AUTOSAVE_META_KEY = 'tapnow_autosave_meta';
const AUTOSAVE_IDB_NAME = 'tapnow_autosave_db';
const AUTOSAVE_IDB_STORE = 'autosave';
const ASSET_BUNDLE_META_KEY = 'tapnow_asset_bundle_meta';

let assetBundleMetaCache = null;
const readAssetBundleMeta = () => {
    if (assetBundleMetaCache) return assetBundleMetaCache;
    try {
        const raw = localStorage.getItem(ASSET_BUNDLE_META_KEY);
        assetBundleMetaCache = raw ? JSON.parse(raw) : null;
        return assetBundleMetaCache;
    } catch (e) {
        assetBundleMetaCache = null;
        return null;
    }
};

const writeAssetBundleMeta = (meta) => {
    try {
        assetBundleMetaCache = meta || null;
        if (!meta) {
            localStorage.removeItem(ASSET_BUNDLE_META_KEY);
            return;
        }
        localStorage.setItem(ASSET_BUNDLE_META_KEY, JSON.stringify(meta));
    } catch (e) { /* empty */ }
};

const getAssetBundleFallbackById = (id) => {
    if (!id) return '';
    const meta = readAssetBundleMeta();
    if (!meta || !meta.idToOriginal) return '';
    return meta.idToOriginal[id] || '';
};
const AUTOSAVE_IDB_KEY = 'latest';

const openAutoSaveDb = () => {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB not available'));
    }
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(getCanvasDatabaseName(AUTOSAVE_IDB_NAME), 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(AUTOSAVE_IDB_STORE)) {
                db.createObjectStore(AUTOSAVE_IDB_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
};

const readAutoSaveFromIdb = async () => {
    try {
        const db = await openAutoSaveDb();
        return await new Promise((resolve) => {
            const tx = db.transaction(AUTOSAVE_IDB_STORE, 'readonly');
            const store = tx.objectStore(AUTOSAVE_IDB_STORE);
            const req = store.get(AUTOSAVE_IDB_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
            tx.oncomplete = () => db.close();
            tx.onerror = () => db.close();
        });
    } catch (e) {
        return null;
    }
};

const writeAutoSaveToIdb = async (payload) => {
    const db = await openAutoSaveDb();
    return await new Promise((resolve, reject) => {
        const tx = db.transaction(AUTOSAVE_IDB_STORE, 'readwrite');
        const store = tx.objectStore(AUTOSAVE_IDB_STORE);
        const req = store.put(payload, AUTOSAVE_IDB_KEY);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error('IndexedDB write failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
    });
};

const readAutoSaveMeta = () => {
    try {
        const raw = localStorage.getItem(AUTOSAVE_META_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
};

const writeAutoSaveMeta = (meta) => {
    try {
        localStorage.setItem(AUTOSAVE_META_KEY, JSON.stringify(meta));
    } catch (e) { /* empty */ }
};

// --- Helper: Get Image Dimensions ---
const getImageDimensions = (src) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = src;
    });
};

// --- Helper: Check if URL is video ---
const isVideoUrl = (url) => {
    if (!url) return false;
    if (url.startsWith('data:video')) return true;
    if (url.includes('force_video_display=true')) return true;
    const ext = url.split('.').pop().split('?')[0].toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
};

const getMimeTypeFromPath = (path) => {
    if (!path || typeof path !== 'string') return '';
    const clean = path.split('?')[0].split('#')[0];
    const ext = clean.split('.').pop().toLowerCase();
    const map = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        mp4: 'video/mp4',
        webm: 'video/webm',
        ogg: 'video/ogg',
        mov: 'video/quicktime'
    };
    return map[ext] || '';
};

// --- Helper: Load Video Metadata ---
const getVideoMetadata = (src) => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.onloadedmetadata = () => {
            resolve({
                duration: Number(video.duration) || 0,
                w: video.videoWidth || 0,
                h: video.videoHeight || 0,
            });
        };
        video.onerror = () => reject(new Error('视频加载失败'));
        video.src = src;
    });
};

// --- Helper: Extract Key Frames from video using <video> + <canvas> ---
const extractKeyFrames = (src, { fps = 2 } = {}) => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.src = src;
        const frames = [];

        const handleError = () => reject(new Error('视频抽帧失败'));
        video.onerror = handleError;

        video.onloadedmetadata = () => {
            const duration = Number(video.duration) || 0;
            if (!duration || !isFinite(duration)) {
                reject(new Error('无法读取视频时长'));
                return;
            }
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const interval = 1 / Math.max(0.1, fps);
            let current = 0;

            const captureFrame = () => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                frames.push({
                    time: Number(current.toFixed(2)),
                    url: canvas.toDataURL('image/jpeg', 0.82),
                });
                current += interval;
                if (current <= duration) {
                    video.currentTime = Math.min(current, duration);
                } else {
                    resolve(frames);
                }
            };

            video.onseeked = captureFrame;
            // 启动首次抽帧
            video.currentTime = 0;
        };
    });
};

// --- Component: ImageCompareView (Beautified & Optimized) ---
const ImageCompareView = React.memo(({ img1, img2, theme = 'dark', language }) => {
    const [pos, setPos] = useState(50);
    const containerRef = useRef(null);
    const [isHovering, setIsHovering] = useState(false);
    const requestRef = useRef();
    const isSolarized = theme === 'solarized';
    const isDark = theme === 'dark';

    const handleMove = useCallback((e) => {
        if (!containerRef.current) return;

        // 使用 requestAnimationFrame 优化性能
        if (requestRef.current) return;

        requestRef.current = requestAnimationFrame(() => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
            setPos((x / rect.width) * 100);
            requestRef.current = null;
        });
    }, []);

    useEffect(() => {
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, []);

    const normalizeCompareImage = (value) => {
        if (!value || typeof value !== 'string') return value;
        if (value.startsWith('data:')) return normalizeDataUrl(value);
        return value;
    };
    const displayImg1 = normalizeCompareImage(img1);
    const displayImg2 = normalizeCompareImage(img2 || img1);

    if (!displayImg1) return (
        <div className={`w-full h-full flex flex-col items-center justify-center rounded-lg border border-dashed pointer-events-none ${isDark
            ? 'text-zinc-500 bg-zinc-900/50 border-zinc-800'
            : isSolarized
                ? 'text-zinc-600 bg-[#eee8d5] border-[#d7cfb2]'
                : 'text-zinc-500 bg-zinc-100 border-zinc-200'
            }`}>
            <Split size={24} className="mb-2 opacity-50" />
            <span className="text-xs font-medium">连接图片以对比</span>
        </div>
    );

    return (
        <div
            ref={containerRef}
            className={`relative w-full h-full cursor-col-resize overflow-hidden group rounded-lg select-none shadow-2xl border ${isDark
                ? 'border-zinc-800 bg-[#09090b]'
                : isSolarized
                    ? 'border-[#eee8d5] bg-[#eee8d5]'
                    : 'border-zinc-200 bg-zinc-100'
                }`}
            onMouseMove={handleMove}
            onTouchMove={handleMove}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {/* Checkered Background */}
            <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: `conic-gradient(${isDark ? '#333' : isSolarized ? '#c9c2a8' : '#bbb'} 90deg, transparent 90deg), conic-gradient(transparent 90deg, ${isDark ? '#333' : isSolarized ? '#c9c2a8' : '#bbb'} 90deg)`,
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 10px 10px'
                }}
            />
            <LazyBase64Image src={displayImg1} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" draggable={false} />
            <div
                className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none"
                style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
            >
                <LazyBase64Image src={displayImg2} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
            </div>
            <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none"
                style={{ left: `${pos}%` }}
            >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center text-black">
                    <Split size={12} className="rotate-90" />
                </div>
            </div>
            <div className={`absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-medium px-2 py-0.5 rounded border border-white/10 transition-opacity duration-200 pointer-events-none ${isHovering ? 'opacity-100' : 'opacity-60'}`}>
                {t('原始')}
            </div>
            <div className={`absolute bottom-2 right-2 bg-blue-600/80 text-white text-[10px] font-medium px-2 py-0.5 rounded border border-white/10 transition-opacity duration-200 pointer-events-none ${isHovering ? 'opacity-100' : 'opacity-60'}`}>
                {t('生成')}
            </div>
        </div>
    );
});
ImageCompareView.displayName = 'ImageCompareView';

// --- 辅助组件 ---
const Button = React.memo(({ children, onClick, className = '', variant = 'primary', icon: Icon, disabled = false, title = '' }) => {
    const baseStyle = 'flex items-center justify-center px-3 py-1.5 rounded-lg transition-all duration-200 font-medium text-xs select-none disabled:opacity-50 disabled:cursor-not-allowed';
    const variants = {
        primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-95',
        secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 active:scale-95',
        ghost: 'bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white',
        danger: 'bg-red-900/30 hover:bg-red-800 text-red-200 border border-red-800 active:scale-95',
    };
    return (
        <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`} title={title}>
            {Icon && <Icon size={14} className={children ? 'mr-1.5' : ''} />}
            {children}
        </button>
    );
});
Button.displayName = 'Button';

// --- 性能优化工具函数 ---
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

const Modal = ({ isOpen, onClose, title, children, theme = 'dark' }) => {
    if (!isOpen) return null;
    const isDark = theme === 'dark';
    const isSolarized = theme === 'solarized';
    return (
        // V3.4.8: 改用 onMouseDown 关闭，避免拖拽到外部时误触 (onClick 会在 mouseUp 时触发)
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
            <div
                className={`rounded-xl shadow-2xl w-[680px] max-w-[90vw] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] border ${isDark
                    ? 'bg-[#09090b] border-zinc-800'
                    : isSolarized
                        ? 'bg-[#eee8d5] border-[#d7cfb2]'
                        : 'bg-white border-zinc-200'
                    }`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className={`flex items-center justify-between p-5 border-b shrink-0 ${isDark
                        ? 'border-zinc-800/50'
                        : isSolarized
                            ? 'border-[#d7cfb2]'
                            : 'border-zinc-200'
                        }`}
                >
                    <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-zinc-900'}`}>{title}</h3>
                    <button
                        onClick={onClose}
                        className={isDark
                            ? 'text-zinc-500 hover:text-white'
                            : isSolarized
                                ? 'text-zinc-600 hover:text-zinc-900'
                                : 'text-zinc-500 hover:text-zinc-900'}
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className={`p-0 overflow-y-auto custom-scrollbar flex-1 ${isDark
                    ? 'bg-[#09090b]'
                    : isSolarized
                        ? 'bg-[#eee8d5]'
                        : 'bg-white'
                    }`}>
                    {children}
                </div>
            </div>
        </div>
    );
};

const getLightboxNavImages = (item) => {
    if (!item) return null;
    if (Array.isArray(item.mjImages) && item.mjImages.length > 1) return item.mjImages;
    if (Array.isArray(item.output_images) && item.output_images.length > 1) return item.output_images;
    return null;
};

const Lightbox = ({ item, onClose, onNavigate, onShotNavigate, onHistoryNavigate }) => {
    // 使用ref存储最新的item值，避免闭包问题
    const itemRef = useRef(item);
    const overlayRef = useRef(null);
    const navGuardRef = useRef({ lastAt: 0, lastHistoryAt: 0, lastShotAt: 0, activeKey: null, cooldownUntil: 0 });
    const onNavigateRef = useRef(onNavigate);
    const onShotNavigateRef = useRef(onShotNavigate);
    const onHistoryNavigateRef = useRef(onHistoryNavigate);
    itemRef.current = item;
    onNavigateRef.current = onNavigate;
    onShotNavigateRef.current = onShotNavigate;
    onHistoryNavigateRef.current = onHistoryNavigate;
    useEffect(() => {
        if (item) {
            requestAnimationFrame(() => {
                if (overlayRef.current && typeof overlayRef.current.focus === 'function') {
                    overlayRef.current.focus();
                }
            });
        } else {
            navGuardRef.current.activeKey = null;
        }
    }, [item]);
    const normalizeNavKey = (key) => {
        if (!key) return '';
        const map = {
            Left: 'ArrowLeft',
            Right: 'ArrowRight',
            Up: 'ArrowUp',
            Down: 'ArrowDown'
        };
        return map[key] || key;
    };
    const logLightbox = (action, detail = {}) => {
        const current = itemRef.current || item;
        const navImages = getLightboxNavImages(current);
        console.log('[Lightbox]', action, {
            id: current?.id,
            type: current?.type,
            url: current?.url,
            mjCount: Array.isArray(navImages) ? navImages.length : 0,
            ...detail
        });
    };
    useEffect(() => {
        if (!item) return;
        logLightbox('open');
    }, [item]);

    const isVideoItem = item?.type === 'video' || (item?.url && isVideoUrl(item.url));
    const sourceList = useMemo(() => {
        if (!item) return [];
        const list = [];
        const pushUnique = (val) => {
            if (val && !list.includes(val)) list.push(val);
        };
        pushUnique(item.url);
        if (!isVideoItem) pushUnique(item.thumbnailUrl);
        pushUnique(item.originalUrl);
        pushUnique(item.mjOriginalUrl);
        return list;
    }, [item, isVideoItem]);
    const [activeSrcIndex, setActiveSrcIndex] = useState(0);
    useEffect(() => {
        setActiveSrcIndex(0);
    }, [item, sourceList.length]);
    const displayUrl = sourceList[activeSrcIndex] || item?.url || '';
    const [mediaReady, setMediaReady] = useState(false);
    const [mediaFailed, setMediaFailed] = useState(false);
    useEffect(() => {
        setMediaReady(false);
        setMediaFailed(false);
    }, [displayUrl, item?.id, item?.selectedMjImageIndex, item?.type]);
    const navImages = useMemo(() => getLightboxNavImages(item), [item]);
    const handleMediaError = () => {
        logLightbox('media_error', { index: activeSrcIndex, total: sourceList.length });
        setMediaReady(false);
        if (activeSrcIndex < sourceList.length - 1) {
            setMediaFailed(false);
            setActiveSrcIndex((prev) => (prev < sourceList.length - 1 ? prev + 1 : prev));
            return;
        }
        setMediaFailed(true);
    };
    const handleClose = (reason = 'manual') => {
        logLightbox('close', { reason });
        if (onClose) onClose();
    };

    // 键盘事件处理：左右方向键切换图片，上下方向键切换镜头
    useEffect(() => {
        if (!item) return;

        const handleKeyDown = (e) => {
            // 使用ref获取最新的item值
            const currentItem = itemRef.current;
            if (!currentItem) return;

            // 防止在输入框中触发
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            // Lightbox 打开时允许全局键盘导航（仅屏蔽输入框/可编辑区域）
            if (e.repeat) return;
            const guard = navGuardRef.current;
            const now = Date.now();
            if (guard.activeKey && now - guard.lastAt > 800) {
                guard.activeKey = null;
            }
            const normalizedKey = normalizeNavKey(e.key);
            const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
            const usesActiveKeyGuard = normalizedKey === 'ArrowLeft' || normalizedKey === 'ArrowRight';
            if (navKeys.includes(normalizedKey) && usesActiveKeyGuard) {
                if (guard.activeKey && guard.activeKey === normalizedKey) return;
                if (guard.activeKey && guard.activeKey !== normalizedKey) return;
                guard.activeKey = normalizedKey;
                guard.lastAt = now;
            }

            if (normalizedKey === 'ArrowLeft') {
                // 只在有多张图片时响应
                const currentImages = getLightboxNavImages(currentItem);
                if (!currentImages || currentImages.length <= 1) return;
                e.preventDefault();
                e.stopPropagation();
                const currentIndex = currentItem.selectedMjImageIndex !== undefined ? currentItem.selectedMjImageIndex : 0;
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : currentImages.length - 1;
                const handleNavigate = onNavigateRef.current;
                if (prevIndex >= 0 && prevIndex < currentImages.length && handleNavigate) {
                    logLightbox('navigate_left', { from: currentIndex, to: prevIndex, total: currentImages.length });
                    // V3.7.22: 立即更新 ref，避免快速按键时状态过时
                    itemRef.current = {
                        ...currentItem,
                        mjImages: currentImages,
                        selectedMjImageIndex: prevIndex,
                        url: currentImages[prevIndex]
                    };
                    handleNavigate(prevIndex);
                }
            } else if (normalizedKey === 'ArrowRight') {
                // 只在有多张图片时响应
                const currentImages = getLightboxNavImages(currentItem);
                if (!currentImages || currentImages.length <= 1) return;
                e.preventDefault();
                e.stopPropagation();
                const currentIndex = currentItem.selectedMjImageIndex !== undefined ? currentItem.selectedMjImageIndex : 0;
                const nextIndex = currentIndex < currentImages.length - 1 ? currentIndex + 1 : 0;
                const handleNavigate = onNavigateRef.current;
                if (nextIndex >= 0 && nextIndex < currentImages.length && handleNavigate) {
                    logLightbox('navigate_right', { from: currentIndex, to: nextIndex, total: currentImages.length });
                    // V3.7.22: 立即更新 ref，避免快速按键时状态过时
                    itemRef.current = {
                        ...currentItem,
                        mjImages: currentImages,
                        selectedMjImageIndex: nextIndex,
                        url: currentImages[nextIndex]
                    };
                    handleNavigate(nextIndex);
                }
            } else if (normalizedKey === 'ArrowUp') {
                // V3.7.21: 上键切换到上一个镜头
                e.preventDefault();
                e.stopPropagation();
                const guard = navGuardRef.current;
                const handleShotNavigate = onShotNavigateRef.current;
                if (currentItem.storyboardContext && handleShotNavigate) {
                    if (now < guard.cooldownUntil) return;
                    if (now - guard.lastShotAt < 320) return;
                    guard.lastShotAt = now;
                    guard.cooldownUntil = now + 300;
                    const { shotIndex, allShots } = currentItem.storyboardContext;
                    if (shotIndex > 0) {
                        logLightbox('shot_up', { from: shotIndex, to: shotIndex - 1, total: allShots.length });
                        handleShotNavigate(shotIndex - 1, allShots);
                    }
                } else if (onHistoryNavigateRef.current) {
                    // V3.7.29: 历史项导航（向上 = 更早的项目）
                    if (now < guard.cooldownUntil) return;
                    if (now - guard.lastHistoryAt < 320) return;
                    guard.lastHistoryAt = now;
                    guard.cooldownUntil = now + 300;
                    logLightbox('history_up_key');
                    logLightbox('history_up');
                    onHistoryNavigateRef.current(-1);
                }
            } else if (normalizedKey === 'ArrowDown') {
                // V3.7.21: 下键切换到下一个镜头
                e.preventDefault();
                e.stopPropagation();
                const guard = navGuardRef.current;
                const handleShotNavigate = onShotNavigateRef.current;
                if (currentItem.storyboardContext && handleShotNavigate) {
                    if (now < guard.cooldownUntil) return;
                    if (now - guard.lastShotAt < 320) return;
                    guard.lastShotAt = now;
                    guard.cooldownUntil = now + 300;
                    const { shotIndex, allShots } = currentItem.storyboardContext;
                    if (shotIndex < allShots.length - 1) {
                        logLightbox('shot_down', { from: shotIndex, to: shotIndex + 1, total: allShots.length });
                        handleShotNavigate(shotIndex + 1, allShots);
                    }
                } else if (onHistoryNavigateRef.current) {
                    // V3.7.29: 历史项导航（向下 = 更新的项目）
                    if (now < guard.cooldownUntil) return;
                    if (now - guard.lastHistoryAt < 320) return;
                    guard.lastHistoryAt = now;
                    guard.cooldownUntil = now + 300;
                    logLightbox('history_down_key');
                    logLightbox('history_down');
                    onHistoryNavigateRef.current(1);
                }
            } else if (e.key === 'Escape' || e.key === 'Esc') {
                // V3.7.28: ESC 关闭预览
                e.preventDefault();
                e.stopPropagation();
                handleClose('esc');
            }
        };
        const handleKeyUp = (e) => {
            const normalizedKey = normalizeNavKey(e.key);
            const guard = navGuardRef.current;
            if (guard.activeKey === normalizedKey) {
                guard.activeKey = null;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [item]);

    if (!item) return null;

    return (
        <div
            ref={overlayRef}
            tabIndex={-1}
            className="fixed inset-0 z-[200] lightbox-overlay flex flex-col items-center justify-center animate-in fade-in duration-200 focus:outline-none"
            onClick={() => handleClose('overlay')}
            onMouseDown={() => {
                if (overlayRef.current && typeof overlayRef.current.focus === 'function') {
                    overlayRef.current.focus();
                }
            }}
        >
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 bg-black/50 rounded-full transition-colors" onClick={() => handleClose('button')}><X size={24} /></button>
            <div className="max-w-[90vw] max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
                {item.type === 'image' ? (
                    <LazyBase64Image
                        key={displayUrl}
                        src={displayUrl}
                        alt={item.prompt}
                        className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
                        onError={handleMediaError}
                        onLoad={() => {
                            setMediaReady(true);
                            setMediaFailed(false);
                        }}
                    />
                ) : (
                    <ResolvedVideo
                        key={displayUrl}
                        src={displayUrl}
                        controls
                        autoPlay
                        className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
                        poster={item.thumbnailUrl || undefined}
                        onError={handleMediaError}
                        onLoadedMetadata={() => {
                            setMediaReady(true);
                            setMediaFailed(false);
                        }}
                        onCanPlay={() => {
                            setMediaReady(true);
                            setMediaFailed(false);
                        }}
                    />
                )}
                {!mediaReady && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/35 text-white/80 text-xs pointer-events-none">
                        {mediaFailed ? t('媒体加载失败，请切换历史项或检查缓存') : t('加载中...')}
                    </div>
                )}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full text-white text-sm font-medium border border-white/10 text-center shadow-2xl">
                    <div className="line-clamp-1 max-w-xl">{item.prompt}</div>
                    <div className="text-[10px] text-zinc-400 mt-1">
                        {item.width}x{item.height} • {item.id}
                        {navImages && navImages.length > 1 && (
                            <span className="ml-2">({(item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0) + 1}/{navImages.length})</span>
                        )}
                        {/* V3.7.21: 镜头位置指示器 */}
                        {item.storyboardContext && (
                            <span className="ml-2 text-blue-400">Shot {item.storyboardContext.shotIndex + 1}/{item.storyboardContext.allShots?.length || 1}</span>
                        )}
                    </div>
                </div>
                {/* 左右切换提示 */}
                {navImages && navImages.length > 1 && (
                    <>
                        <button
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 bg-black/50 rounded-full transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                const currentIndex = item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0;
                                const prevIndex = currentIndex > 0 ? currentIndex - 1 : navImages.length - 1;
                                if (onNavigate) onNavigate(prevIndex);
                            }}
                            title={t('上一张 (←)')}
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 bg-black/50 rounded-full transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                const currentIndex = item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0;
                                const nextIndex = currentIndex < navImages.length - 1 ? currentIndex + 1 : 0;
                                if (onNavigate) onNavigate(nextIndex);
                            }}
                            title={t('下一张 (→)')}
                        >
                            <ChevronRight size={24} />
                        </button>
                    </>
                )}
                {(item.storyboardContext || onHistoryNavigate) && (
                    <>
                        <button
                            className="absolute right-4 top-[34%] -translate-y-1/2 text-white/70 hover:text-white p-2 bg-black/50 rounded-full transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (item.storyboardContext && onShotNavigate) {
                                    const { shotIndex, allShots } = item.storyboardContext;
                                    if (shotIndex > 0) {
                                        logLightbox('shot_up_click', { from: shotIndex, to: shotIndex - 1 });
                                        onShotNavigate(shotIndex - 1, allShots);
                                    }
                                    return;
                                }
                                if (onHistoryNavigate) {
                                    logLightbox('history_up_click');
                                    onHistoryNavigate(-1);
                                }
                            }}
                            title={item.storyboardContext ? t('上一镜头 (↑)') : t('上一组 (↑)')}
                        >
                            <ChevronUp size={18} />
                        </button>
                        <button
                            className="absolute right-4 top-[66%] -translate-y-1/2 text-white/70 hover:text-white p-2 bg-black/50 rounded-full transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (item.storyboardContext && onShotNavigate) {
                                    const { shotIndex, allShots } = item.storyboardContext;
                                    if (shotIndex < allShots.length - 1) {
                                        logLightbox('shot_down_click', { from: shotIndex, to: shotIndex + 1 });
                                        onShotNavigate(shotIndex + 1, allShots);
                                    }
                                    return;
                                }
                                if (onHistoryNavigate) {
                                    logLightbox('history_down_click');
                                    onHistoryNavigate(1);
                                }
                            }}
                            title={item.storyboardContext ? t('下一镜头 (↓)') : t('下一组 (↓)')}
                        >
                            <ChevronDown size={18} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export {
    localStorage,
    DEFAULT_VIEW,
    t,
    MaskVisualFeedback,
    LocalImageManager,
    normalizeDataUrl,
    normalizeBase64Payload,
    dataUrlToBlob,
    truncateByBytes,
    LazyBase64Image,
    ResolvedVideo,
    HistoryMjImageCell,
    TagListEditor,
    ArtisticProgress,
    HistoryItem,
    MaskEditor,
    styles,
    VIRTUAL_CANVAS_WIDTH,
    VIRTUAL_CANVAS_HEIGHT,
    IMAGE_TASK_TIMEOUT_MS,
    VIDEO_TASK_TIMEOUT_MS,
    DEFAULT_BASE_URL,
    JIMENG_API_BASE_URL,
    JIMENG_SESSION_ID,
    DEFAULT_PROVIDERS,
    DEFAULT_API_CONFIGS,
    RATIOS,
    GROK_VIDEO_RATIOS,
    VIDEO_RES_OPTIONS,
    PROMPT_LIBRARY_KEY,
    GRID_PROMPT_TEXT,
    UPSCALE_PROMPT_TEXT,
    STORYBOARD_PROMPT_TEXT,
    CHARACTER_SHEET_PROMPT_TEXT,
    MOOD_BOARD_PROMPT_TEXT,
    DELETED_MODEL_IDS,
    ASYNC_CONFIG_TEMPLATE,
    normalizeShotIdValue,
    SIMPLE_NUMERIC_SHOT_ID_RE,
    isSameShotId,
    MAX_STORYBOARD_OUTPUT_HISTORY,
    makeStoryboardShotFocusKey,
    normalizeStoryboardOutputSnapshot,
    isSameStoryboardOutputSnapshot,
    materializeStoryboardOutputFromSnapshot,
    isStoryboardDebugEnabled,
    findStoryboardNodeById,
    resolveStoryboardShotCandidate,
    parseStoryboardSourceNodeId,
    ASYNC_CONFIG_TEMPLATE_TEXT,
    REQUEST_CHAIN_TEMPLATE,
    REQUEST_CHAIN_TEMPLATE_TEXT,
    buildEmptyAsyncConfig,
    IMAGE_BATCH_MODE_PARALLEL_AGGREGATE,
    IMAGE_BATCH_MODE_STANDARD_BATCH,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_AUTO,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_FORCE,
    IMAGE_NATIVE_MULTI_IMAGE_MODE_DISABLE,
    NATIVE_MULTI_IMAGE_CAPABILITY_STORAGE_KEY,
    NODE_IO_ENVELOPE_VERSION,
    TRANSPORT_HTTP_JSON,
    TRANSPORT_HTTP_SSE,
    TRANSPORT_WS_STREAM,
    DEFAULT_TRANSPORT_OPTIONS,
    DEFAULT_MODEL_LIBRARY,
    getDefaultRatiosForModel,
    RESOLUTIONS,
    normalizeResolutionOption,
    normalizeImageResolution,
    normalizeImageRouteMode,
    normalizeImageBatchMode,
    normalizeNativeMultiImageMode,
    normalizeNodeIOMediaType,
    isNodeIOMediaItemValid,
    isNodeIOEnvelopeValid,
    getAntigravityQualityByResolution,
    getAntigravityImageSizeByResolution,
    getAntigravitySizeParam,
    isExplicitImageResolution,
    normalizeVideoResolution,
    normalizeVideoResolutionLower,
    stripValueNotes,
    normalizeJimengVideoRatio,
    supportsJimengVideoResolution,
    normalizeJimengVideoResolution,
    normalizeDurationValue,
    normalizeJimengVideoDuration,
    isImageModelType,
    isChatModelType,
    MAX_CUSTOM_PARAMS,
    DEFAULT_IMAGE_DISPATCH_INTERVAL_SECONDS,
    INTERNAL_CUSTOM_PARAM_NAMES,
    DEFAULT_STORYBOARD_SCRIPT_PROMPT,
    DEFAULT_STORYBOARD_NOVEL_PROMPT,
    DEFAULT_STORYBOARD_TABLE_SUMMARY_PROMPT,
    STORYBOARD_TABLE_PROMPT_MODE,
    STORYBOARD_LLM_SPLIT_MODES,
    STORYBOARD_LLM_PROMPT_MODES,
    STORYBOARD_PROMPT_SLOT_OPTIONS,
    STORYBOARD_EDITABLE_PROMPT_SLOT_KEYS,
    STORYBOARD_DEFAULT_TABLE_HEADERS,
    STORYBOARD_DEFAULT_MODE,
    STORYBOARD_VIEW_MODES,
    STORYBOARD_DEFAULT_VIEW_MODE,
    STORYBOARD_WORKSPACE_MIN_HEIGHT,
    STORYBOARD_WORKSPACE_MAX_HEIGHT,
    STORYBOARD_WORKSPACE_DEFAULT_HEIGHT,
    normalizeStoryboardWorkspaceHeight,
    MAX_CUSTOM_PARAM_VALUES,
    COMPLETED_STATUS_SET,
    normalizeStoryboardMode,
    normalizeStoryboardViewMode,
    parseMarkdownTableRow,
    isMarkdownTableSeparator,
    parseMarkdownTable,
    parseDelimitedRow,
    detectDelimitedSeparator,
    parseDelimitedTable,
    parseStoryboardTableInput,
    stringifyMarkdownTable,
    includesStoryboardHeaderKeyword,
    getStoryboardTableShotColumnIndex,
    getStoryboardTablePromptColumnIndex,
    getStoryboardTableDescriptionColumnIndex,
    normalizeStoryboardSceneIndex,
    parseJsonArrayFromText,
    isCompletedLikeStatus,
    normalizeCustomParamNotes,
    normalizeValueNotes,
    normalizeResolutionNotes,
    normalizeCustomParams,
    getImageSourceFallbackByParam,
    getDefaultRequestTemplateForType,
    isJimengVideoModelId,
    getJimengVideoRequestTemplate,
    getDefaultRequestTemplateForEntry,
    getCustomParamSelection,
    getValueLabelWithNotes,
    getNoteLabelWithNotes,
    getCustomParamValueLabel,
    isCustomParamInputMode,
    applyCustomParamsToPayload,
    buildCustomParamPreviewPayload,
    normalizeImageConcurrency,
    applyImageBatchCountToPayload,
    normalizeImageDispatchIntervalSeconds,
    waitForMilliseconds,
    resolveImageConcurrencyFromCustomParams,
    detectThrottleSignalsFromError,
    attachHistoryThrottleStats,
    applyBatchFailureToHistoryItem,
    normalizePreviewOverridePatch,
    isPreviewValueEqual,
    buildPreviewOverridePatch,
    applyPreviewOverridePatch,
    normalizeRequestTemplate,
    normalizeTransportMode,
    normalizeTransportOptions,
    buildDefaultCapabilitySchema,
    normalizeCapabilitySchema,
    validateModelLibraryContract,
    normalizeStringArray,
    normalizeAsyncRequestTemplate,
    coerceAsyncRequestTemplate,
    normalizeAsyncConfig,
    normalizeRequestChainExtract,
    normalizeRequestChainStep,
    normalizeRequestChain,
    normalizeModelLibraryEntry,
    normalizeRequestOverridePatch,
    TEMPLATE_VAR_PATTERN,
    getTemplateVarValue,
    coerceTemplateValue,
    getValueByPath,
    getValueByPathLoose,
    getValueByPathAny,
    normalizeAsyncStatusValue,
    extractAsyncOutputUrls,
    isLikelyImagePayload,
    collectDeepImageValues,
    collectImmediateImageUrls,
    resolveTemplateString,
    resolveTemplateValue,
    appendQueryParams,
    compactTemplateObject,
    hasBinaryTemplateValue,
    buildRequestFromTemplate,
    applyRequestOverridePatch,
    coerceFormDataFromObject,
    formatRequestPreview,
    getModelLibraryPreviewEndpoint,
    buildPythonPreviewSnippet,
    getDefaultResolutionsForModel,
    MJ_VERSIONS,
    calculateResolution,
    getModelParams,
    AUTOSAVE_LOCAL_KEY,
    AUTOSAVE_META_KEY,
    AUTOSAVE_IDB_NAME,
    AUTOSAVE_IDB_STORE,
    ASSET_BUNDLE_META_KEY,
    assetBundleMetaCache,
    readAssetBundleMeta,
    writeAssetBundleMeta,
    getAssetBundleFallbackById,
    AUTOSAVE_IDB_KEY,
    openAutoSaveDb,
    readAutoSaveFromIdb,
    writeAutoSaveToIdb,
    readAutoSaveMeta,
    writeAutoSaveMeta,
    getImageDimensions,
    isVideoUrl,
    getMimeTypeFromPath,
    getVideoMetadata,
    extractKeyFrames,
    ImageCompareView,
    Button,
    debounce,
    Modal,
    getLightboxNavImages,
    Lightbox
};
