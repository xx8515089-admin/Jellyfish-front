import { connectCanvasNodes } from '../canvasConnections'
import { canvasRequestId } from '../../../../services/studioCanvases'
import { readNodeMedia, readShotMedia, imageGeneratorTypes, videoGeneratorTypes } from '../canvasNodeOutputs'
import React from 'react';
import {
    t,
    normalizeDataUrl,
    normalizeResolutionOption,
    normalizeNodeIOMediaType,
    normalizeVideoResolution,
    STORYBOARD_DEFAULT_MODE,
    STORYBOARD_DEFAULT_VIEW_MODE,
    STORYBOARD_WORKSPACE_DEFAULT_HEIGHT,
    normalizeStoryboardMode,
    getCustomParamSelection,
    getNoteLabelWithNotes,
    getCustomParamValueLabel,
    isCustomParamInputMode,
    normalizeImageConcurrency,
    getImageDimensions,
    isVideoUrl
} from '../freeCanvasShared';

export function getHistoryMeta({
    getApiConfigByKey,
}, item) {
        if (!item) return null;
        const modelKey = item?.apiConfig?.modelId || item?.apiConfig?.id || item?.modelName || item?.modelId;
        const config = modelKey ? getApiConfigByKey(modelKey) : null;
        const ratioValue = item.ratio || item.mjRatio || '';
        const ratioLabel = ratioValue
            ? getNoteLabelWithNotes(ratioValue, !!config?.ratioNotesEnabled, config?.ratioNotes || {})
            : '';
        const isVideo = item.type === 'video';
        const rawResolution = item.resolution || (item.width && item.height ? `${item.width}x${item.height}` : '');
        let resolutionLabel = rawResolution;
        if (rawResolution) {
            const notesEnabled = isVideo ? !!config?.videoResolutionNotesEnabled : !!config?.resolutionNotesEnabled;
            const notes = isVideo ? (config?.videoResolutionNotes || {}) : (config?.resolutionNotes || {});
            const normalized = isVideo ? normalizeVideoResolution(rawResolution) : normalizeResolutionOption(rawResolution);
            const lookupKey = normalized || rawResolution;
            resolutionLabel = getNoteLabelWithNotes(lookupKey, notesEnabled, notes);
        }
        let durationLabel = '';
        if (isVideo && item.duration) {
            const durationValue = String(item.duration).endsWith('s') ? String(item.duration) : `${item.duration}s`;
            durationLabel = getNoteLabelWithNotes(durationValue, !!config?.durationNotesEnabled, config?.durationNotes || {});
        }
        const customParamLabels = [];
        if (item.customParams && Array.isArray(config?.customParams)) {
            config.customParams.forEach((param) => {
                const selected = getCustomParamSelection(param, item.customParams);
                if (selected === '' || selected === undefined || selected === null) return;
                const rawValue = typeof selected === 'string' ? selected.trim() : String(selected);
                const valueNotes = param?.valueNotes || {};
                const note = param?.notesEnabled
                    ? (valueNotes[rawValue] || valueNotes[String(rawValue)] || null)
                    : null;
                if (note) {
                    customParamLabels.push(note);
                    return;
                }
                const label = getNoteLabelWithNotes(rawValue, !!param?.notesEnabled, valueNotes);
                const nameCandidate = param?.name || param?.label || param?.displayName || param?.paramName || param?.key || param?.id || '';
                const name = String(nameCandidate || '').trim();
                if (!name || /^param-/.test(name)) {
                    customParamLabels.push(label);
                } else {
                    customParamLabels.push(`${name}:${label}`);
                }
            });
        }
        if (customParamLabels.length === 0 && item.customParams && typeof item.customParams === 'object' && !Array.isArray(item.customParams)) {
            Object.entries(item.customParams).forEach(([key, value]) => {
                if (!key) return;
                if (value === '' || value === undefined || value === null) return;
                if (/^param-/.test(String(key))) {
                    customParamLabels.push(String(value));
                } else {
                    customParamLabels.push(`${key}:${value}`);
                }
            });
        }
        const fallbackModel = item.modelName || item.apiConfig?.modelId || item.apiConfig?.model || item.model || '未知模型';
        const configLabel = config?.displayName || config?.modelName || config?.id || '';
        let modelLabel = configLabel || fallbackModel;
        if (!modelLabel || /^uid-/.test(modelLabel)) {
            const safeItemName = item.modelName && !/^uid-/.test(item.modelName) ? item.modelName : '';
            modelLabel = config?.modelName || config?.id || safeItemName || fallbackModel || '未知模型';
        }
        if (/^uid-/.test(modelLabel)) {
            modelLabel = '未知模型';
        }
        if (item.modelName && item.provider && item.modelName.toLowerCase() === item.provider.toLowerCase()) {
            modelLabel = configLabel || config?.modelName || config?.id || fallbackModel;
        }
        return { ratioLabel, resolutionLabel, durationLabel, customParamLabels, modelLabel };
    }

export function renderCustomParamInputs({
    getApiConfigByKey,
    theme,
}, modelId, currentValues, onChange, inputScope = '') {
        const config = getApiConfigByKey(modelId);
        const customParams = Array.isArray(config?.customParams) ? config.customParams : [];
        if (!customParams.length) return null;
        const values = currentValues || {};
        const toSuggestionToken = (value, fallback = 'x') => {
            const normalized = String(value || '')
                .trim()
                .replace(/[^a-zA-Z0-9_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
            return normalized || fallback;
        };
        const suggestionScope = `${toSuggestionToken(modelId, 'model')}-${toSuggestionToken(inputScope, 'scope')}`;
        return (
            <div
                className="flex flex-col gap-2"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
            >
                <div className={`text-[10px] font-medium ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-600'}`}>{t('自定义参数')}</div>
                {customParams.map((param, index) => {
                    const paramId = param.id || param.name || `param-${index}`;
                    const selectedValueRaw = getCustomParamSelection(param, values);
                    const selectedValue = selectedValueRaw === null || selectedValueRaw === undefined
                        ? ''
                        : String(selectedValueRaw);
                    const options = Array.isArray(param.values) ? param.values : [];
                    const inputMode = isCustomParamInputMode(param);
                    const filteredOptions = options.filter((option) => !/^(input|输入)$/i.test(String(option || '').trim()));
                    const datalistId = filteredOptions.length > 0
                        ? `param-suggest-${suggestionScope}-${toSuggestionToken(paramId, `param-${index}`)}`
                        : undefined;
                    const paramLabel = param?.name || param?.label || param?.displayName || param?.paramName || param?.key || param?.id || '参数';
                    const clearParamSelection = (target) => {
                        if (!target || typeof target !== 'object') return;
                        if (param.id) delete target[param.id];
                        if (param.name) delete target[param.name];
                        if (paramId) delete target[paramId];
                    };
                    return (
                        <div key={paramId} className="flex items-center gap-2">
                            <span
                                className={`text-[10px] min-w-[70px] max-w-[140px] flex-shrink-0 truncate ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-700'}`}
                                title={paramLabel}
                            >
                                {paramLabel}
                            </span>
                            {inputMode ? (
                                <>
                                    <input
                                        type="text"
                                        value={selectedValue || ''}
                                        onChange={(e) => {
                                            const nextValue = e.target.value;
                                            const next = { ...values };
                                            clearParamSelection(next);
                                            if (nextValue) {
                                                next[paramId] = nextValue;
                                            }
                                            onChange(next);
                                        }}
                                        placeholder={t('请输入参数值')}
                                        list={datalistId}
                                        className={`flex-1 px-2 py-1 rounded text-xs border ${theme === 'dark'
                                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                            : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                            }`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                    />
                                    {datalistId && (
                                        <datalist id={datalistId}>
                                            {filteredOptions.map((option) => (
                                                <option key={option} value={option} />
                                            ))}
                                        </datalist>
                                    )}
                                </>
                            ) : options.length > 0 ? (
                                <select
                                    value={selectedValue || ''}
                                    onChange={(e) => {
                                        const nextValue = e.target.value;
                                        const next = { ...values };
                                        clearParamSelection(next);
                                        if (nextValue) {
                                            next[paramId] = nextValue;
                                        }
                                        onChange(next);
                                    }}
                                    className={`flex-1 px-2 py-1 rounded text-xs border ${theme === 'dark'
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800' : 'bg-white border-zinc-300 text-zinc-800'
                                        }`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                >
                                    <option value="">{t('不设置')}</option>
                                    {options.map(option => (
                                        <option key={option} value={option}>{getCustomParamValueLabel(param, option)}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={selectedValue || ''}
                                    onChange={(e) => {
                                        const nextValue = e.target.value;
                                        const next = { ...values };
                                        clearParamSelection(next);
                                        if (nextValue) {
                                            next[paramId] = nextValue;
                                        }
                                        onChange(next);
                                    }}
                                    placeholder={t('例如: size/quality')}
                                    className={`flex-1 px-2 py-1 rounded text-xs border ${theme === 'dark'
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder-zinc-500'
                                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                        }`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                />
                            )}
                            {param.override && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                                    覆盖
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

export function getLocalSaveMediaItems({
    connectionsByNode,
    getApiConfigByKey,
    getItemProxyPreference,
    history,
    nodesMap,
}, targetNodeId) {
        const items = [];
        const seen = new Set();
        const targetConnections = connectionsByNode.to.get(targetNodeId) || [];

        const pushItem = (url, type = 'image', meta = {}) => {
            if (!url) return;
            const key = `${type}:${url}`;
            if (seen.has(key)) return;
            seen.add(key);
            items.push({ url, type, ...meta });
        };
        const attachProxyMeta = (meta = {}, sourceItem = null, modelKey = null) => {
            if (sourceItem) {
                const provider = sourceItem.provider || sourceItem.apiConfig?.provider || meta.provider;
                const useProxy = getItemProxyPreference(sourceItem);
                return {
                    ...meta,
                    provider,
                    apiConfig: sourceItem.apiConfig || meta.apiConfig,
                    useProxy
                };
            }
            if (modelKey) {
                const config = getApiConfigByKey(modelKey);
                const provider = config?.provider || meta.provider;
                const useProxy = provider ? getItemProxyPreference({ provider }) : false;
                return {
                    ...meta,
                    provider,
                    apiConfig: config ? { modelId: config.id, provider: config.provider } : meta.apiConfig,
                    useProxy
                };
            }
            return meta;
        };

        targetConnections.forEach(conn => {
            const sourceNode = nodesMap.get(conn.from);
            if (!sourceNode) return;

            if (imageGeneratorTypes.has(sourceNode.type) || videoGeneratorTypes.has(sourceNode.type)) {
                const applied = readNodeMedia(sourceNode, { allImages: true });
                if (applied.length) {
                    applied.forEach(item => pushItem(item.url, item.type, { ...attachProxyMeta({}, history.find(h => h.sourceNodeId === sourceNode.id && [h.url, h.originalUrl, ...(h.output_images || []), ...(h.mjImages || [])].includes(item.url)), sourceNode.settings?.model), prompt: sourceNode.settings?.prompt || sourceNode.settings?.videoPrompt || '', originalUrl: item.url }));
                    return;
                }
                const latest = history.find(h => h.sourceNodeId === sourceNode.id && h.status === 'completed');
                if (!latest) return;
                const latestPrompt = latest.prompt || sourceNode.settings?.prompt || sourceNode.settings?.videoPrompt || '';
                const proxyMeta = attachProxyMeta({}, latest);
                if (latest.mjImages && latest.mjImages.length > 0) {
                    latest.mjImages.forEach(url => pushItem(url, latest.type || 'image', {
                        prompt: latestPrompt,
                        originalUrl: latest.mjOriginalUrl || latest.originalUrl || url,
                        ...proxyMeta
                    }));
                } else if (latest.output_images && latest.output_images.length > 0) {
                    latest.output_images.forEach(url => pushItem(url, latest.type || 'image', {
                        prompt: latestPrompt,
                        originalUrl: latest.originalUrl || url,
                        ...proxyMeta
                    }));
                } else {
                    const url = latest.url || latest.originalUrl || latest.mjOriginalUrl;
                    if (url) pushItem(url, latest.type || (videoGeneratorTypes.has(sourceNode.type) ? 'video' : 'image'), {
                        prompt: latestPrompt,
                        originalUrl: latest.originalUrl || url,
                        ...proxyMeta
                    });
                }
                return;
            }

            if (sourceNode.type === 'storyboard-node') {
                const shots = sourceNode.settings?.shots || [];
                const mode = normalizeStoryboardMode(sourceNode.settings?.mode);
                const projectTitle = sourceNode.settings?.projectTitle || '';
                shots.forEach(shot => {
                    if (!shot.outputEnabled) return;
                    const shotProxyMeta = attachProxyMeta({}, null, shot.model);
                    readShotMedia(shot, mode, true).forEach(item => pushItem(item.url, item.type, {
                        prompt: shot.prompt || shot.description || '', projectTitle, originalUrl: item.url, ...shotProxyMeta
                    }));
                });
                return;
            }

            readNodeMedia(sourceNode, { allImages: true, nodesMap, incoming: id => connectionsByNode.to.get(id) || [] }).forEach(item =>
                pushItem(item.url, item.type, { name: sourceNode.videoFileName || sourceNode.title || '', originalUrl: item.url }));
        });

        return items;
    }

export async function buildLocalSaveFiles({
    fetchCacheSource,
    getDataUrlExt,
    getFilenameFromUrl,
    getProxyPreferenceForUrl,
    getUrlExt,
    projectName,
    resolveSpecialUrl,
    sanitizeCacheId,
}, mediaItems = [], options = {}) {
        const useProxyResolver = options.useProxyResolver;
        const proxyBaseUrl = options.proxyBaseUrl;
        const files = [];
        const failedItems = [];
        const nameCounters = new Map();
        const seenUrls = new Set();
        for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            const url = item?.url;
            if (!url) continue;
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            try {
                const resolvedUrl = await resolveSpecialUrl(url);
                let content = resolvedUrl || url;
                const baseProxy = typeof useProxyResolver === 'function' ? !!useProxyResolver(item) : false;
                const useProxy = getProxyPreferenceForUrl(url, baseProxy);
                if (content.startsWith('data:')) {
                    content = normalizeDataUrl(content);
                } else {
                    const { blob } = await fetchCacheSource(content, { useProxy, proxyBaseUrl, preferLocal: true });
                    content = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }
                if (!content || typeof content !== 'string') throw new Error('资源内容为空');
                const isVideo = item.type === 'video' || content.startsWith('data:video') || isVideoUrl(url) || isVideoUrl(content);
                const ext = getDataUrlExt(content, getUrlExt(content, getUrlExt(url, isVideo ? '.mp4' : '.png')));
                const resolvedProjectTitle = item.projectTitle || (projectName && projectName !== '未命名项目' ? projectName : '');
                const baseLabel = [resolvedProjectTitle, item.prompt].filter(Boolean).join('-')
                    || getFilenameFromUrl(url)
                    || item.name
                    || 'tapnow';
                let baseName = sanitizeCacheId(baseLabel) || 'tapnow';
                baseName = baseName.slice(0, 80);
                const nextIndex = (nameCounters.get(baseName) || 0) + 1;
                nameCounters.set(baseName, nextIndex);
                const rawKey = item.dedupeKey || item.originalUrl || url;
                const dedupeKey = getFilenameFromUrl(rawKey) || rawKey;
                files.push({
                    filename: `${baseName}-${nextIndex}${ext}`,
                    content,
                    sourceUrl: url,
                    dedupeKey,
                    scopedKey: item.scopedKey || '',
                    type: isVideo ? 'video' : 'image'
                });
            } catch (err) {
                failedItems.push({ item, error: err });
                console.warn('[保存到本地] 读取资源失败:', err);
            }
        }
        return { files, failedItems };
    }

export async function runLocalSaveBatch({
    buildLocalSaveFiles,
    getFilenameFromUrl,
    getItemProxyPreference,
    getLocalSaveBaseUrl,
    showToast,
    updateNodeSettings,
}, node, mediaItems, options = {}) {
        const silent = options.silent === true;
        const baseUrl = getLocalSaveBaseUrl(node);
        if (!baseUrl) {
            if (!silent) showToast('本地服务地址为空', 'error');
            return;
        }

        const lastSavedKeys = node.settings?.lastSavedUrls || [];
        const subfolderScope = (node.settings?.subfolder || '').trim();
        const dedupeScope = `${baseUrl}::${subfolderScope}`;
        const itemsWithKeys = mediaItems.map((item) => {
            if (!item) return item;
            const rawKey = item.dedupeKey || item.originalUrl || item.url;
            const dedupeKey = rawKey ? (getFilenameFromUrl(rawKey) || rawKey) : '';
            const scopedKey = dedupeKey ? `${dedupeScope}::${dedupeKey}` : '';
            const legacyDuplicate = !subfolderScope && dedupeKey && lastSavedKeys.includes(dedupeKey);
            const isDuplicate = (scopedKey && lastSavedKeys.includes(scopedKey)) || legacyDuplicate;
            return { ...item, dedupeKey, scopedKey, isDuplicate };
        });
        const dedupedItems = itemsWithKeys.filter(item => item?.url && item.scopedKey && !item.isDuplicate);
        const skippedCount = itemsWithKeys.filter(item => item?.url && item.scopedKey && item.isDuplicate).length;
        if (dedupedItems.length === 0) {
            if (!silent) showToast('已保存过，未重复保存', 'success');
            return;
        }

        const { files, failedItems } = await buildLocalSaveFiles(dedupedItems, { useProxyResolver: getItemProxyPreference, proxyBaseUrl: baseUrl });
        if (files.length === 0) {
            if (failedItems.length > 0) {
                const firstError = failedItems[0]?.error;
                const message = firstError?.message || String(firstError || '资源读取失败');
                if (!silent) throw new Error(`资源读取失败: ${message}`);
            }
            if (!silent) showToast('没有可保存的文件', 'warning');
            return;
        }

        let res;
        try {
            res = await fetch(`${baseUrl}/save-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    files,
                    subfolder: node.settings?.subfolder || ''
                })
            });
        } catch (err) {
            throw new Error(silent ? (err?.message || '连接失败，请检查本地服务地址') : '连接失败，请检查本地服务地址');
        }

        const responseText = await res.text().catch(() => '');
        let result = {};
        if (responseText) {
            try {
                result = JSON.parse(responseText);
            } catch (err) {
                result = res.ok ? { success: true, message: responseText } : { message: responseText };
            }
        }

        if (!res.ok) {
            throw new Error(result?.message || result?.error || responseText || `保存失败 (${res.status})`);
        }

        const results = Array.isArray(result.results)
            ? result.results
            : files.map(file => ({
                success: result.success !== false,
                path: result.path || file.filename
            }));
        if (result.success === false) {
            throw new Error(result.message || '保存失败');
        }
        const isResultSuccess = (item) => item && item.success !== false;
        const successCount = results.filter(isResultSuccess).length;
        const failedResult = results.find((item) => item && item.success === false);
        if (successCount === 0 && failedResult) {
            throw new Error(failedResult.message || failedResult.error || result.message || '保存失败');
        }
        const savedKeys = results
            .map((item, idx) => isResultSuccess(item) ? (files[idx]?.scopedKey || dedupedItems[idx]?.scopedKey) : null)
            .filter(Boolean);
        const mergedSavedUrls = Array.from(new Set([...(node.settings?.lastSavedUrls || []), ...savedKeys]));
        updateNodeSettings(node.id, {
            lastSavedUrls: mergedSavedUrls,
            lastSaved: new Date().toLocaleString(),
            savedFiles: [...(node.settings?.savedFiles || []), ...results.map((r, idx) => isResultSuccess(r) ? (r?.path || files[idx]?.filename) : null).filter(Boolean)]
        });
        if (!silent) {
            const skipSuffix = skippedCount > 0 ? `，已跳过 ${skippedCount} 个重复` : '';
            const readFailSuffix = failedItems.length > 0 ? `，${failedItems.length} 个资源读取失败` : '';
            showToast(result.message || `已保存 ${successCount} 个文件${skipSuffix}${readFailSuffix}`, 'success');
        }
    }

export function extractNodeIOMediaPayload({
    nodesMap, connectionsByNode, resolveAssetChannelUrl,
}, sourceNode, options = {}) {
        if (!sourceNode || typeof sourceNode !== 'object') return [];
        const media = [];
        const seen = new Set();
        const addMedia = (url, type = 'image') => {
            const resolvedUrl = resolveAssetChannelUrl(url);
            const normalizedUrl = String(resolvedUrl || '').trim();
            if (!normalizedUrl) return;
            const normalizedType = normalizeNodeIOMediaType(type, normalizedUrl);
            if (!normalizedType) return;
            const key = `${normalizedType}\n${normalizedUrl}`;
            if (seen.has(key)) return;
            seen.add(key);
            media.push({ type: normalizedType, url: normalizedUrl });
        };

        readNodeMedia(sourceNode, { nodesMap, incoming: id => connectionsByNode?.to.get(id) || [], mediaCache: options.mediaCache }).forEach(item => addMedia(item.url, item.type));
        return media;
    }

export function updatePreviewFromTask({
    connections,
    connectionsRef,
    historyMap,
    nodesMap,
    setNodes,
    updateShot,
}, taskId, url, contentType = 'image', sourceNodeIdOverride = null, mjImages = null, filename = null) {
        if (!url && (!mjImages || mjImages.length === 0)) return;
        // 找到对应的源节点ID
        let sourceNodeId = sourceNodeIdOverride;
        if (!sourceNodeId) {
            const historyItem = historyMap.get(taskId);
            sourceNodeId = historyItem?.sourceNodeId;
        }
        if (!sourceNodeId) {
            console.warn('[Tapnow] updatePreviewFromTask: 未找到 sourceNodeId for taskId:', taskId);
            return;
        }

        // 检查是否是从分镜表触发的生成，如果是则回填到分镜表
        // 使用 setTimeout 确保在下一个事件循环中执行，此时 nodes 和 connections 已更新
        setTimeout(() => {
            const sourceNode = nodesMap.get(sourceNodeId);
            if (sourceNode && (sourceNode.type === 'gen-image' || sourceNode.type === 'gen-video')) {
                // 查找连接到该生成节点的分镜表节点
                const storyboardConnections = connections.filter(c => c.to === sourceNodeId);
                for (const conn of storyboardConnections) {
                    const fromNode = nodesMap.get(conn.from);
                    const storyboardNode = fromNode && fromNode.type === 'storyboard-node' ? fromNode : null;
                    if (storyboardNode && storyboardNode.settings?.shots) {
                        // 查找状态为 generating 的 shot，回填结果
                        const generatingShot = storyboardNode.settings.shots.find(s => s.status === 'generating');
                        if (generatingShot) {
                            const finalUrl = url || (mjImages && mjImages.length > 0 ? mjImages[0] : null);
                            if (finalUrl) {
                                updateShot(storyboardNode.id, generatingShot.id, {
                                    image_url: finalUrl,
                                    image_filename: filename || generatingShot.image_filename,
                                    status: 'done'
                                });
                                break; // 只回填第一个找到的
                            }
                        }
                    }
                }
            }
        }, 0);

        // 使用 ref 获取最新的 connections 状态，避免闭包问题

        // 使用函数式更新，确保获取最新的 connections 状态
        setNodes((prevNodes) => {
            // 使用 ref 中的最新 connections
            const targetIds = connectionsRef.current
                .filter((c) => c.from === sourceNodeId)
                .map((c) => c.to);

            if (!targetIds.length) return prevNodes;

            return prevNodes.map((n) =>
                targetIds.includes(n.id) && n.type === 'preview'
                    ? {
                        ...n,
                        content: url || (mjImages && mjImages.length > 0 ? mjImages[0] : url),
                        previewSourceNodeId: sourceNodeId,
                        previewType: contentType,
                        previewMjImages: mjImages,
                        previewFilename: filename || n.previewFilename || ''
                    }
                    : n
            );
        });
    }

export async function handleDrop({
    getDragUrlCandidate,
    getHistoryDragPayload,
    resolveDroppedUrlCandidate,
    resolveHistoryPayloadUrl,
    resolveUrlForMediaMeta,
    saveToUndoStack,
    setNodes,
}, nodeId, e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('drag-over');

        const payload = getHistoryDragPayload(e);
        if (payload) {
            const dragUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            if (dragUrl) {
                const isVideo = payload.type === 'video' || isVideoUrl(dragUrl);
                let dimensions = null;
                if (!isVideo) {
                    try {
                        const metaUrl = await resolveUrlForMediaMeta(dragUrl);
                        dimensions = await getImageDimensions(metaUrl);
                    } catch { }
                }
                saveToUndoStack();
                setNodes((prev) => prev.map((n) => n.id === nodeId
                    ? { ...n, content: dragUrl, dimensions: isVideo ? null : dimensions }
                    : n));
                return;
            }
        }

        const dragUrlCandidate = resolveDroppedUrlCandidate(getDragUrlCandidate(e));
        if (dragUrlCandidate) {
            const isVideo = isVideoUrl(dragUrlCandidate);
            let dimensions = null;
            if (!isVideo) {
                try {
                    const metaUrl = await resolveUrlForMediaMeta(dragUrlCandidate);
                    dimensions = await getImageDimensions(metaUrl);
                } catch { }
            }
            saveToUndoStack();
            setNodes((prev) => prev.map((n) => n.id === nodeId
                ? { ...n, content: dragUrlCandidate, dimensions: isVideo ? null : dimensions }
                : n));
            return;
        }

        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length > 0) {
            const file = imageFiles[0];
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
    }

export function handleChatDrop({
    appendChatFiles,
    getDragUrlCandidate,
    getHistoryDragPayload,
    resolveDroppedUrlCandidate,
    resolveHistoryPayloadUrl,
    setChatFiles,
    setIsChatOpen,
}, e) {
        e.preventDefault();
        e.stopPropagation();

        const payload = getHistoryDragPayload(e);
        if (payload) {
            const resolvedUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            if (resolvedUrl) {
                const isVideo = payload.type === 'video' || isVideoUrl(resolvedUrl);
                const isImage = !isVideo;
                const fileExt = isImage ? 'png' : 'mp4';
                const mimeType = isImage ? 'image/png' : 'video/mp4';
                setChatFiles(prev => [...prev, {
                    name: `Generated-${payload.itemId || Date.now()}.${fileExt}`,
                    type: mimeType,
                    content: resolvedUrl,
                    isImage,
                    isVideo,
                    isAudio: false,
                    fromHistory: true,
                    fileExt
                }]);
                setIsChatOpen(true);
            }
            return;
        }

        const candidate = getDragUrlCandidate(e);
        if (candidate) {
            const resolvedCandidate = resolveDroppedUrlCandidate(candidate);
            if (!resolvedCandidate) return;
            const isVideo = isVideoUrl(resolvedCandidate);
            const isImage = !isVideo;
            const fileExt = isImage ? 'png' : 'mp4';
            const mimeType = isImage ? 'image/png' : 'video/mp4';
            setChatFiles(prev => [...prev, {
                name: `Dropped-${Date.now()}.${fileExt}`,
                type: mimeType,
                content: resolvedCandidate,
                isImage,
                isVideo,
                isAudio: false,
                fromHistory: false,
                fileExt
            }]);
            setIsChatOpen(true);
            return;
        }

        if (e.dataTransfer?.files?.length) {
            appendChatFiles(e.dataTransfer.files);
            setIsChatOpen(true);
        }
    }

export function addNode({
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
}, type, worldX, worldY, sourceId, initialContent = undefined, initialDimensions = undefined, targetId = undefined, inputType = undefined) {
        saveToUndoStack(); // V3.4.6: 保存到撤销栈
        const defaultSize = type === 'gen-video'
            ? { w: 440, h: 540 }
            : type === 'gen-image'
                ? { w: 460, h: 500 }
                : type === 'video-input'
                    ? { w: 580, h: 460 }
                    : type === 'video-analyze'
                        ? { w: 480, h: 500 }
                        : type === 'storyboard-node'
                            ? { w: 720, h: 500 }
                            : type === 'image-compare'
                                ? { w: 400, h: 300 }
                                : type === 'preview'
                                    ? { w: 320, h: 260 }
                                    : type === 'text-node'
                                        ? { w: 320, h: 260 }
                                        : type === 'novel-input'
                                            ? { w: 400, h: 500 }
                                            : type === 'extract-characters-scenes'
                                                ? { w: 400, h: 500 }
                                                : type === 'character-description' || type === 'scene-description'
                                                    ? { w: 420, h: 520 }
                                                    : type === 'create-character' || type === 'create-scene'
                                                        ? { w: 350, h: 300 }
                                                        : type === 'generate-character-video' || type === 'generate-scene-video'
                                                            ? { w: 420, h: 520 }
                                                            : (type === 'generate-character-image' || type === 'generate-scene-image')
                                                                ? { w: 420, h: 520 }
                                                                : type === 'local-save'
                                                                    ? { w: 320, h: 380 }
                                        : type === 'input-image' ? { w: 320, h: 320 } : { w: 260, h: 260 };
        const newNode = {
            id: canvasRequestId('node'),
            type,
            x: worldX - defaultSize.w / 2,
            y: worldY - defaultSize.h / 2,
            width: defaultSize.w,
            height: defaultSize.h,
            content: initialContent,
            ...(initialDimensions ? { dimensions: initialDimensions } : {}),
            // V3.4.8: 使用上次使用的模型
            settings: type === 'gen-image'
                ? (() => {
                    const model = resolveModelKey(lastUsedImageModel);
                    const fallbackImageConcurrency = normalizeImageConcurrency(getApiConfigByKey(model)?.defaultImageConcurrency || 1);
                    return {
                        model,
                        ratio: lastUsedRatio,
                        resolution: lastUsedImageResolution,
                        prompt: '',
                        imageConcurrency: fallbackImageConcurrency,
                        concurrentImages: fallbackImageConcurrency
                    };
                })()
                : type === 'gen-video'
                    ? { model: resolveModelKey(lastUsedVideoModel), duration: '5s', ratio: lastUsedRatio, resolution: lastUsedVideoResolution, videoPrompt: '' }
                    : type === 'video-analyze'
                        ? { model: resolveModelKey(lastUsedAnalyzeModel), segmentDuration: parseInt(lastUsedSegmentDuration), analysisMode: 'manual', voiceoverResults: [], analysisResults: [] }
                    : type === 'storyboard-node'
                            ? {
                                projectTitle: t('未命名分镜'),
                                mode: STORYBOARD_DEFAULT_MODE,
                                viewMode: STORYBOARD_DEFAULT_VIEW_MODE,
                                shots: [],
                                tableMarkdown: '',
                                tableData: null,
                                tableMarkdownCollapsed: false,
                                llmWorkspaceHeight: STORYBOARD_WORKSPACE_DEFAULT_HEIGHT
                            }
                                    : type === 'text-node'
                                        ? { text: initialContent || '' }
                                        : type === 'novel-input'
                                        ? { content: '' }
                                        : type === 'extract-characters-scenes'
                                            ? {
                                                model: resolveModelKey(lastUsedExtractModel || ''),
                                                analysisResults: null,
                                                lastAnalyzed: null,
                                                isAnalyzing: false,
                                                progress: 0,
                                                errorMsg: null
                                            }
                                            : type === 'character-description' || type === 'scene-description'
                                                ? {
                                                    characterId: '',
                                                    characterName: '',
                                                    role: '',
                                                    age: '',
                                                    gender: '',
                                                    sceneId: '',
                                                    sceneName: '',
                                                    description: '',
                                                    prompt: '',
                                                    mode: 'video',
                                                    style: 'none',
                                                    imageModel: resolveModelKey(lastUsedImageModel),
                                                    imageRatio: lastUsedRatio || '16:9',
                                                    imageResolution: lastUsedImageResolution,
                                                    referenceImages: [],
                                                    chatModel: resolveModelKey(lastUsedExtractModel || ''),
                                                    isEnhancing: false
                                                }
                                                : type === 'create-character' || type === 'create-scene'
                                                    ? { name: '', startSecond: 1, endSecond: 3, isCreating: false, createProgress: 0, createError: null }
                                                    : type === 'generate-character-video' || type === 'generate-scene-video'
                                                    ? { model: resolveModelKey(lastUsedVideoModel), duration: '15s', ratio: lastUsedRatio || '16:9', resolution: lastUsedVideoResolution, videoPrompt: '', referenceImages: [], sourceType: '', sourceId: '', isGenerating: false, progress: 0, error: null }
                                                    : (type === 'generate-character-image' || type === 'generate-scene-image')
                                                            ? { model: resolveModelKey(lastUsedImageModel), ratio: lastUsedRatio || '16:9', resolution: lastUsedImageResolution, prompt: '', referenceImages: [], chatModel: resolveModelKey(lastUsedExtractModel || ''), imageUrls: [], selectedImageIndex: null, isGenerating: false, progress: 0, error: null }
                                                            : type === 'local-save'
                                                                ? { serverUrl: localServerUrl, savePath: '', subfolder: '', autoSave: false, serverStatus: localCacheServerConnected ? 'connected' : 'disconnected', lastSaved: null, savedFiles: [], lastSavedUrls: [] }
                                : {},
        };
        setNodes(prev => [...prev, newNode]);
        const graph = new Map(nodesMap || []);
        graph.set(newNode.id, newNode);
        const edge = sourceId ? { from: sourceId, to: newNode.id }
            : targetId ? { from: newNode.id, to: targetId, inputType } : null;
        if (edge) {
            edge.id = canvasRequestId('connection');
            setConnections(previous => connectCanvasNodes(previous, graph, edge).connections);
        }
        setContextMenu(prev => ({ ...prev, visible: false }));
        setContextMenuExpanded(false);
        setConnectingSource(null);
        setConnectingTarget(null);
        setConnectingInputType(null);
        return newNode;
    }
