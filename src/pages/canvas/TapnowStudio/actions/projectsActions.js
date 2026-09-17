import { canvasAlert, canvasConfirm } from '../canvasDialogs';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { t, LocalImageManager, normalizeDataUrl, isVideoUrl, getMimeTypeFromPath } from '../freeCanvasShared';

export async function handleBatchDownload({
    getBlobFromUrl,
    getProxyPreferenceForUrl,
    nodesRef,
    selectedNodeIdRef,
    selectedNodeIdsRef,
}) {
        // 使用ref获取最新的状态，避免闭包问题
        const currentNodes = nodesRef.current;
        const currentSelectedId = selectedNodeIdRef.current;
        const currentSelectedIds = selectedNodeIdsRef.current;

        const selectedNodes = currentNodes.filter(node =>
            (currentSelectedId === node.id || (currentSelectedIds && currentSelectedIds.has(node.id))) &&
            (node.type === 'input-image' || node.type === 'video-input' || node.type === 'preview') &&
            node.content
        );

        if (selectedNodes.length === 0) {
            canvasAlert(t('请先选择要下载的图片或视频节点'));
            return;
        }

        for (const node of selectedNodes) {
            try {
                const url = node.content;
                // 检查URL是否有效
                if (!url || (typeof url !== 'string' && !url.startsWith('data:'))) {
                    console.warn(`节点 ${node.id} 的内容URL无效: `, url);
                    continue;
                }
                const useProxy = getProxyPreferenceForUrl(url, false);
                const blob = await getBlobFromUrl(url, { useProxy });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;

                // 判断文件扩展名：对于预览窗口，根据previewType判断；对于其他节点，根据URL或节点类型判断
                let extension = '.png';
                if (node.type === 'preview') {
                    // 预览窗口：根据previewType判断
                    if (node.previewType === 'video') {
                        extension = '.mp4';
                    } else {
                        extension = isVideoUrl(url) ? '.mp4' : '.png';
                    }
                } else if (node.type === 'video-input') {
                    extension = '.mp4';
                } else {
                    extension = isVideoUrl(url) ? '.mp4' : '.png';
                }

                const filename = `${node.id}${extension} `;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
                // 添加小延迟避免浏览器阻止多个下载
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`下载节点 ${node.id} 失败: `, error);
                // 不中断其他节点的下载，继续处理下一个
            }
        }
    }

export async function handleSaveProject({
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
}) {
        // 方案B：统一使用资产包（Zip）保存，避免 base64 膨胀与失败
        const shouldSaveHistoryAssets = saveHistoryAssets;
        const historySnapshot = history.slice(0, normalizeHistorySaveLimit(historySaveLimit));
        const saveProjectJsonWithoutAssets = async (options = {}) => {
            const preferLegacyDownload = !!options.preferLegacyDownload;
            const payload = {
                version: '2.5.7',
                projectName,
                theme,
                nodes,
                connections,
                view,
                history: historySnapshot.map((item) => compactHistoryItemForStorage(item)),
                chatSessions,
                characterLibrary,
                modelLibrary,
                timestamp: getCSTTimestamp(),
                assetBundle: false
            };
            const jsonText = JSON.stringify(payload, (key, value) => (value === undefined ? null : value), 2);
            const timestamp = getCSTFilenameTimestamp();
            const filename = `${projectName || '未命名项目'}_${timestamp}.json`;
            const blob = new Blob([jsonText], { type: 'application/json' });
            if (preferLegacyDownload) {
                saveAs(blob, filename);
                return;
            }
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(jsonText);
                    await writable.close();
                    return;
                } catch (pickerError) {
                    const pickerMsg = pickerError?.message || String(pickerError || '');
                    const pickerName = pickerError?.name || '';
                    const requiresGesture = /user gesture/i.test(pickerMsg) || pickerName === 'NotAllowedError';
                    if (!requiresGesture) throw pickerError;
                }
            }
            saveAs(blob, filename);
        };
        if (shouldSaveHistoryAssets) {
            const runBundleSave = async (projectData, bundleName, handle) => {
                setDownloadProgress({ active: true, current: 0, total: 1, filename: bundleName });
                try {
                    await saveProjectAsBundle(projectData, {
                        handle,
                        filename: bundleName,
                        historyItems: historySnapshot,
                        onProgress: ({ current, total, filename }) => {
                            setDownloadProgress({
                                active: true,
                                current,
                                total: Math.max(total || 0, 1),
                                filename: filename || bundleName
                            });
                        }
                    });
                } finally {
                    setDownloadProgress(prev => ({ ...prev, active: false }));
                }
            };
            try {
                if (window.showSaveFilePicker) {
                    const timestamp = getCSTFilenameTimestamp();
                    const bundleName = `${projectName || '未命名项目'}_${timestamp}.zip`;
                    let handle;
                    try { handle = await window.showSaveFilePicker({
                        suggestedName: bundleName,
                        types: [{ description: 'Tapnow Bundle', accept: { 'application/zip': ['.zip'] } }],
                    }); } catch (pickerError) {
                        if (pickerError?.name === 'AbortError') return;
                        if (!['NotAllowedError', 'SecurityError'].includes(pickerError?.name)) throw pickerError;
                    }
                    const projectData = {
                        version: '2.5.7',
                        projectName,
                        theme,
                        nodes,
                        connections,
                        view,
                        history: historySnapshot,
                        chatSessions,
                        characterLibrary,
                        modelLibrary,
                        timestamp: getCSTTimestamp()
                    };
                    await runBundleSave(projectData, bundleName, handle);
                    canvasAlert(t('项目已打包保存！'));
                    return;
                }
                const timestamp = getCSTFilenameTimestamp();
                const bundleName = `${projectName || '未命名项目'}_${timestamp}.zip`;
                const projectData = {
                    version: '2.5.7',
                    projectName,
                    theme,
                    nodes,
                    connections,
                    view,
                    history: historySnapshot,
                    chatSessions,
                    characterLibrary,
                    modelLibrary,
                    timestamp: getCSTTimestamp()
                };
                await runBundleSave(projectData, bundleName);
                canvasAlert(t('项目已打包保存！'));
                return;
            } catch (e) {
                console.error('项目打包保存失败:', e);
                const msg = e?.message || String(e || '');
                if (String(msg).toLowerCase().includes('quota')) {
                    const shouldFallback = await canvasConfirm(`项目打包保存失败: ${msg}\n\n是否自动降级为“仅保存项目JSON（不打包资产）”？\n\n降级后可保证保存成功率，但不会打包图片/视频二进制资产。`);
                    if (shouldFallback) {
                        try {
                            // 降级路径通常已经离开用户手势上下文，避免再次调用 showSaveFilePicker
                            await saveProjectJsonWithoutAssets({ preferLegacyDownload: true });
                            canvasAlert('已降级为 JSON 保存（不含资产），保存完成。');
                            return;
                        } catch (fallbackError) {
                            const fallbackMsg = fallbackError?.message || String(fallbackError || '');
                            canvasAlert(`降级保存失败: ${fallbackMsg}\n\n建议操作：\n1) 进一步降低“历史保存上限”\n2) 清理历史后再保存`);
                            return;
                        }
                    }
                    canvasAlert(`项目打包保存失败: ${msg}\n\n建议操作：\n1) 适当降低“历史保存上限”\n2) 或关闭“保存资产包（Zip）”后再保存`);
                } else {
                    canvasAlert(`项目打包保存失败: ${msg}`);
                }
                return;
            }
        }
        const convertHistoryAssetUrl = async (url, item, force = false) => {
            if (!url || typeof url !== 'string') return url;
            if (url.startsWith('data:')) return normalizeDataUrl(url);
            const sourceRef = resolveSourceReferenceUrl(url);
            if (!force && !shouldSaveHistoryAssets) return sourceRef;
            try {
                const baseProxy = getItemProxyPreference(item);
                const useProxy = getProxyPreferenceForUrl(sourceRef, baseProxy);
                const { blob } = await fetchCacheSource(sourceRef, { useProxy, preferLocal: true });
                if (!blob) return sourceRef;
                const dataUrl = await blobToDataURL(blob);
                return normalizeDataUrl(dataUrl);
            } catch (e) {
                console.error('转换历史资源失败:', e);
                return sourceRef;
            }
        };
        const convertHistoryItemBlobUrls = async (item) => {
            const itemCopy = { ...item };
            if (itemCopy.url && typeof itemCopy.url === 'string') {
                const force = itemCopy.url.startsWith('blob:');
                itemCopy.url = await convertHistoryAssetUrl(itemCopy.url, itemCopy, force);
            }
            if (itemCopy.mjOriginalUrl && typeof itemCopy.mjOriginalUrl === 'string') {
                const force = itemCopy.mjOriginalUrl.startsWith('blob:');
                itemCopy.mjOriginalUrl = await convertHistoryAssetUrl(itemCopy.mjOriginalUrl, itemCopy, force);
            }
            if (itemCopy.originalUrl && typeof itemCopy.originalUrl === 'string') {
                const force = itemCopy.originalUrl.startsWith('blob:');
                itemCopy.originalUrl = await convertHistoryAssetUrl(itemCopy.originalUrl, itemCopy, force);
            }
            if (itemCopy.thumbnailUrl && typeof itemCopy.thumbnailUrl === 'string') {
                const force = itemCopy.thumbnailUrl.startsWith('blob:');
                itemCopy.thumbnailUrl = await convertHistoryAssetUrl(itemCopy.thumbnailUrl, itemCopy, force);
            }
            if (Array.isArray(itemCopy.mjImages)) {
                for (let i = 0; i < itemCopy.mjImages.length; i++) {
                    const imgUrl = itemCopy.mjImages[i];
                    if (imgUrl && typeof imgUrl === 'string') {
                        const force = imgUrl.startsWith('blob:');
                        itemCopy.mjImages[i] = await convertHistoryAssetUrl(imgUrl, itemCopy, force);
                    }
                }
            }
            if (Array.isArray(itemCopy.output_images)) {
                for (let i = 0; i < itemCopy.output_images.length; i++) {
                    const imgUrl = itemCopy.output_images[i];
                    if (imgUrl && typeof imgUrl === 'string') {
                        const force = imgUrl.startsWith('blob:');
                        itemCopy.output_images[i] = await convertHistoryAssetUrl(imgUrl, itemCopy, force);
                    }
                }
            }
            return itemCopy;
        };
        try {
            // 兼容性检查：优先使用 File System Access API
            if (!window.showSaveFilePicker) {
                // 降级到旧的 Blob 下载方式（仅适用于小文件）
                const shouldProceed = await canvasConfirm('您的浏览器不支持流式保存大文件。\n\n如果项目包含大量图片/视频（>500MB），建议使用 Chrome 或 Edge 浏览器导出。\n\n是否继续使用传统方式保存？（可能导致内存溢出）');
                if (!shouldProceed) return;

                // 执行旧的保存逻辑（仅作为降级方案）
                const replacer = (key, value) => {
                    if (value === undefined) return null;
                    return value;
                };
                const nodesToSave = JSON.parse(JSON.stringify(nodes, replacer));
                const convertBlobUrlsToDataUrls = async (obj) => {
                    if (obj === null || obj === undefined) return obj;
                    if (typeof obj === 'string') {
                        if (obj.startsWith('blob:')) {
                            try {
                                const blob = await getBlobFromUrl(obj);
                                const dataUrl = await blobToDataURL(blob);
                                return dataUrl;
                            } catch (error) {
                                console.error('转换 Blob URL 失败:', error);
                                return resolveSourceReferenceUrl(obj);
                            }
                        }
                        return resolveSourceReferenceUrl(obj);
                    }
                    if (Array.isArray(obj)) {
                        return await Promise.all(obj.map(item => convertBlobUrlsToDataUrls(item)));
                    }
                    if (typeof obj === 'object') {
                        const converted = {};
                        for (const key in obj) {
                            if (obj.hasOwnProperty(key)) {
                                converted[key] = await convertBlobUrlsToDataUrls(obj[key]);
                            }
                        }
                        return converted;
                    }
                    return obj;
                };
                const nodesWithDataUrls = await convertBlobUrlsToDataUrls(nodesToSave);
                const characterLibraryToSave = JSON.parse(JSON.stringify(characterLibrary, replacer));
                const characterLibraryWithDataUrls = await convertBlobUrlsToDataUrls(characterLibraryToSave);
                const historyToSave = await Promise.all(historySnapshot.map(item => convertHistoryItemBlobUrls(item)));
                const projectData = {
                    version: '2.5.7',
                    projectName,
                    theme,
                    nodes: nodesWithDataUrls,
                    connections,
                    view,
                    history: historyToSave,
                    chatSessions,
                    characterLibrary: characterLibraryWithDataUrls,
                    modelLibrary,
                    timestamp: getCSTTimestamp()
                };
                const jsonStr = JSON.stringify(projectData, replacer, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const timestamp = getCSTFilenameTimestamp();
                const filename = `${projectName || '未命名项目'}_${timestamp}.json`;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                canvasAlert(t('项目保存成功！'));
                return;
            }

            // 使用 File System Access API 流式写入
            const timestamp = getCSTFilenameTimestamp();
            const handle = await window.showSaveFilePicker({
                suggestedName: `${projectName || '未命名项目'}_${timestamp}.json`,
                types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();

            // replacer 函数：将 undefined 转换为 null
            const replacer = (key, value) => {
                if (value === undefined) return null;
                return value;
            };
            // 辅助函数：转换单个节点的 Blob URL 字段
            const convertNodeBlobUrls = async (node) => {
                const nodeCopy = { ...node };

                // 转换 content
                if (nodeCopy.content && typeof nodeCopy.content === 'string') {
                    if (nodeCopy.content.startsWith('blob:')) {
                        try {
                            const b64 = await getBase64FromUrl(nodeCopy.content);
                            const mime = isVideoUrl(nodeCopy.content) ? 'video/mp4' : 'image/png';
                            nodeCopy.content = `data:${mime};base64,${b64}`;
                        } catch (e) {
                            console.error('转换节点 content 失败:', e);
                        }
                    } else {
                        nodeCopy.content = resolveSourceReferenceUrl(nodeCopy.content);
                    }
                }

                // 转换 maskContent
                if (nodeCopy.maskContent && typeof nodeCopy.maskContent === 'string') {
                    if (nodeCopy.maskContent.startsWith('blob:')) {
                        try {
                            const b64 = await getBase64FromUrl(nodeCopy.maskContent);
                            nodeCopy.maskContent = `data:image/png;base64,${b64}`;
                        } catch (e) {
                            console.error('转换节点 maskContent 失败:', e);
                        }
                    } else {
                        nodeCopy.maskContent = resolveSourceReferenceUrl(nodeCopy.maskContent);
                    }
                }

                // 转换 selectedKeyframes
                if (Array.isArray(nodeCopy.selectedKeyframes)) {
                    for (let i = 0; i < nodeCopy.selectedKeyframes.length; i++) {
                        const frame = nodeCopy.selectedKeyframes[i];
                        if (frame && frame.url && typeof frame.url === 'string' && frame.url.startsWith('blob:')) {
                            try {
                                const b64 = await getBase64FromUrl(frame.url);
                                frame.url = `data:image/png;base64,${b64}`;
                            } catch (e) {
                                console.error('转换关键帧失败:', e);
                            }
                        } else if (frame && frame.url && typeof frame.url === 'string') {
                            frame.url = resolveSourceReferenceUrl(frame.url);
                        }
                    }
                }

                // 转换 frames
                if (Array.isArray(nodeCopy.frames)) {
                    for (let i = 0; i < nodeCopy.frames.length; i++) {
                        const frame = nodeCopy.frames[i];
                        if (frame && frame.url && typeof frame.url === 'string' && frame.url.startsWith('blob:')) {
                            try {
                                const b64 = await getBase64FromUrl(frame.url);
                                frame.url = `data:image/png;base64,${b64}`;
                            } catch (e) {
                                console.error('转换帧失败:', e);
                            }
                        } else if (frame && frame.url && typeof frame.url === 'string') {
                            frame.url = resolveSourceReferenceUrl(frame.url);
                        }
                    }
                }

                // 转换 previewMjImages（预览图片数组）
                if (Array.isArray(nodeCopy.previewMjImages)) {
                    for (let i = 0; i < nodeCopy.previewMjImages.length; i++) {
                        const url = nodeCopy.previewMjImages[i];
                        if (url && typeof url === 'string' && url.startsWith('blob:')) {
                            try {
                                const b64 = await getBase64FromUrl(url);
                                nodeCopy.previewMjImages[i] = `data:image/png;base64,${b64}`;
                            } catch (e) {
                                console.error('转换 previewMjImages 失败:', e);
                            }
                        } else if (url && typeof url === 'string') {
                            nodeCopy.previewMjImages[i] = resolveSourceReferenceUrl(url);
                        }
                    }
                }

                return nodeCopy;
            };

            // 辅助函数：转换角色库项的 Blob URL
            const convertCharacterBlobUrls = async (character) => {
                const charCopy = { ...character };

                // 转换 avatar
                if (charCopy.avatar && typeof charCopy.avatar === 'string' && charCopy.avatar.startsWith('blob:')) {
                    try {
                        const b64 = await getBase64FromUrl(charCopy.avatar);
                        charCopy.avatar = `data:image/png;base64,${b64}`;
                    } catch (e) {
                        console.error('转换角色 avatar 失败:', e);
                    }
                } else if (charCopy.avatar && typeof charCopy.avatar === 'string') {
                    charCopy.avatar = resolveSourceReferenceUrl(charCopy.avatar);
                }

                // 转换 profile_picture_url
                if (charCopy.profile_picture_url && typeof charCopy.profile_picture_url === 'string' && charCopy.profile_picture_url.startsWith('blob:')) {
                    try {
                        const b64 = await getBase64FromUrl(charCopy.profile_picture_url);
                        charCopy.profile_picture_url = `data:image/png;base64,${b64}`;
                    } catch (e) {
                        console.error('转换角色 profile_picture_url 失败:', e);
                    }
                } else if (charCopy.profile_picture_url && typeof charCopy.profile_picture_url === 'string') {
                    charCopy.profile_picture_url = resolveSourceReferenceUrl(charCopy.profile_picture_url);
                }

                return charCopy;
            };

            // 1. 写入 JSON 头部
            await writable.write(`{
    \n  "version": "2.5.7", \n  "projectName": ${JSON.stringify(projectName || '')}, \n  "theme": ${JSON.stringify(theme || 'dark')}, \n  "nodes": [\n`);

            // 2. 流式写入节点（逐个处理，释放内存）
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const nodeToSave = await convertNodeBlobUrls(node);

                // 使用 replacer 处理 undefined 值
                const nodeJson = JSON.stringify(nodeToSave, replacer, 2);
                // 为每个节点添加缩进（除了第一个）
                const indentedNodeJson = i === 0
                    ? nodeJson.split('\n').join('\n    ')
                    : '    ' + nodeJson.split('\n').join('\n    ');

                await writable.write(indentedNodeJson);
                if (i < nodes.length - 1) {
                    await writable.write(',\n');
                } else {
                    await writable.write('\n');
                }

                // 注意：每次循环迭代都会创建新的作用域，变量会自动被 GC 回收
            }

            // 3. 写入连接和视图
            await writable.write(`  ], \n  "connections": ${JSON.stringify(connections, replacer, 2)}, \n  "view": ${JSON.stringify(view, replacer, 2)}, \n  "history": [\n`);

            // 4. 流式写入历史记录（通常是最大的部分）
            for (let i = 0; i < historySnapshot.length; i++) {
                const item = historySnapshot[i];
                const itemToSave = await convertHistoryItemBlobUrls(item);

                const itemJson = JSON.stringify(itemToSave, replacer, 2);
                const indentedItemJson = i === 0
                    ? itemJson.split('\n').join('\n    ')
                    : '    ' + itemJson.split('\n').join('\n    ');

                await writable.write(indentedItemJson);
                if (i < historySnapshot.length - 1) {
                    await writable.write(',\n');
                } else {
                    await writable.write('\n');
                }

                // 注意：每次循环迭代都会创建新的作用域，变量会自动被 GC 回收
            }

            // 5. 写入角色库（流式处理）
            await writable.write(`  ], \n  "chatSessions": ${JSON.stringify(chatSessions, replacer, 2)}, \n  "characterLibrary": [\n`);

            for (let i = 0; i < characterLibrary.length; i++) {
                const character = characterLibrary[i];
                const charToSave = await convertCharacterBlobUrls(character);

                const charJson = JSON.stringify(charToSave, replacer, 2);
                const indentedCharJson = i === 0
                    ? charJson.split('\n').join('\n    ')
                    : '    ' + charJson.split('\n').join('\n    ');

                await writable.write(indentedCharJson);
                if (i < characterLibrary.length - 1) {
                    await writable.write(',\n');
                } else {
                    await writable.write('\n');
                }

                // 注意：每次循环迭代都会创建新的作用域，变量会自动被 GC 回收
            }

            // 6. 写入模型库
            await writable.write(`  ], \n  "modelLibrary": [\n`);
            for (let i = 0; i < modelLibrary.length; i++) {
                const entry = modelLibrary[i];
                const entryJson = JSON.stringify(entry, replacer, 2);
                const indentedEntryJson = i === 0
                    ? entryJson.split('\n').join('\n    ')
                    : '    ' + entryJson.split('\n').join('\n    ');
                await writable.write(indentedEntryJson);
                if (i < modelLibrary.length - 1) {
                    await writable.write(',\n');
                } else {
                    await writable.write('\n');
                }
            }

            // 7. 写入尾部
            await writable.write(`  ], \n  "timestamp": ${JSON.stringify(getCSTTimestamp())} \n
} `);

            // 关闭流
            await writable.close();
            canvasAlert(t('项目保存成功！'));
        } catch (error) {
            console.error('保存项目失败:', error);
            if (error.name === 'AbortError') {
                // 用户取消了保存
                return;
            }
            canvasAlert('保存失败: ' + (error.message || '未知错误'));
        }
    }

export async function handleSaveSelectedWorkflow({
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
}) {
        try {
            setSelectionContextMenu({ visible: false, x: 0, y: 0 });

            const selectedIds = selectedNodeIds.size > 0 ? selectedNodeIds : (selectedNodeId ? new Set([selectedNodeId]) : new Set());
            if (selectedIds.size === 0) {
                canvasAlert(t('请先选择要保存的节点'));
                return;
            }

            const selectedNodes = nodes.filter(n => selectedIds.has(n.id));
            const selectedConnections = connections.filter(conn => selectedIds.has(conn.from) && selectedIds.has(conn.to));

            if (!window.showSaveFilePicker) {
                const shouldProceed = await canvasConfirm('您的浏览器不支持流式保存大文件。\n\n是否继续使用传统方式保存？');
                if (!shouldProceed) return;

                const replacer = (key, value) => value === undefined ? null : value;
                const nodesToSave = JSON.parse(JSON.stringify(selectedNodes, replacer));
                const convertBlobUrlsToDataUrls = async (obj) => {
                    if (obj === null || obj === undefined) return obj;
                    if (typeof obj === 'string') {
                        if (obj.startsWith('blob:')) {
                            try {
                                const blob = await getBlobFromUrl(obj);
                                const dataUrl = await blobToDataURL(blob);
                                return dataUrl;
                            } catch (error) {
                                console.error('转换 Blob URL 失败:', error);
                                return resolveSourceReferenceUrl(obj);
                            }
                        }
                        return resolveSourceReferenceUrl(obj);
                    }
                    if (Array.isArray(obj)) {
                        return await Promise.all(obj.map(item => convertBlobUrlsToDataUrls(item)));
                    }
                    if (typeof obj === 'object') {
                        const converted = {};
                        for (const key in obj) {
                            if (obj.hasOwnProperty(key)) {
                                converted[key] = await convertBlobUrlsToDataUrls(obj[key]);
                            }
                        }
                        return converted;
                    }
                    return obj;
                };

                const nodesWithDataUrls = await convertBlobUrlsToDataUrls(nodesToSave);
                const workflowData = {
                    version: '3.7.36c',
                    type: 'workflow',
                    nodes: nodesWithDataUrls,
                    connections: selectedConnections,
                    timestamp: getCSTTimestamp()
                };

                const jsonStr = JSON.stringify(workflowData, replacer, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const timestamp = getCSTFilenameTimestamp();
                a.download = `工作流_${timestamp}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                canvasAlert(t('工作流保存成功！'));
                return;
            }

            const timestamp = getCSTFilenameTimestamp();
            const handle = await window.showSaveFilePicker({
                suggestedName: `工作流_${timestamp}.json`,
                types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();

            const replacer = (key, value) => value === undefined ? null : value;

            const convertNodeBlobUrls = async (node) => {
                const nodeCopy = { ...node };

                if (nodeCopy.content && typeof nodeCopy.content === 'string') {
                    if (nodeCopy.content.startsWith('blob:')) {
                        try {
                            const b64 = await getBase64FromUrl(nodeCopy.content);
                            const mime = isVideoUrl(nodeCopy.content) ? 'video/mp4' : 'image/png';
                            nodeCopy.content = `data:${mime};base64,${b64}`;
                        } catch (e) {
                            console.error('转换节点 content 失败:', e);
                        }
                    } else {
                        nodeCopy.content = resolveSourceReferenceUrl(nodeCopy.content);
                    }
                }

                if (nodeCopy.maskContent && typeof nodeCopy.maskContent === 'string') {
                    if (nodeCopy.maskContent.startsWith('blob:')) {
                        try {
                            const b64 = await getBase64FromUrl(nodeCopy.maskContent);
                            nodeCopy.maskContent = `data:image/png;base64,${b64}`;
                        } catch (e) {
                            console.error('转换节点 maskContent 失败:', e);
                        }
                    } else {
                        nodeCopy.maskContent = resolveSourceReferenceUrl(nodeCopy.maskContent);
                    }
                }

                if (Array.isArray(nodeCopy.selectedKeyframes)) {
                    for (let i = 0; i < nodeCopy.selectedKeyframes.length; i++) {
                        const frame = nodeCopy.selectedKeyframes[i];
                        if (frame && frame.url && typeof frame.url === 'string' && frame.url.startsWith('blob:')) {
                            try {
                                const b64 = await getBase64FromUrl(frame.url);
                                frame.url = `data:image/png;base64,${b64}`;
                            } catch (e) {
                                console.error('转换关键帧失败:', e);
                            }
                        } else if (frame && frame.url && typeof frame.url === 'string') {
                            frame.url = resolveSourceReferenceUrl(frame.url);
                        }
                    }
                }

                if (Array.isArray(nodeCopy.frames)) {
                    for (let i = 0; i < nodeCopy.frames.length; i++) {
                        const frame = nodeCopy.frames[i];
                        if (frame && frame.url && typeof frame.url === 'string' && frame.url.startsWith('blob:')) {
                            try {
                                const b64 = await getBase64FromUrl(frame.url);
                                frame.url = `data:image/png;base64,${b64}`;
                            } catch (e) {
                                console.error('转换帧失败:', e);
                            }
                        } else if (frame && frame.url && typeof frame.url === 'string') {
                            frame.url = resolveSourceReferenceUrl(frame.url);
                        }
                    }
                }

                if (Array.isArray(nodeCopy.previewMjImages)) {
                    for (let i = 0; i < nodeCopy.previewMjImages.length; i++) {
                        const imgUrl = nodeCopy.previewMjImages[i];
                        if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('blob:')) {
                            try {
                                const b64 = await getBase64FromUrl(imgUrl);
                                nodeCopy.previewMjImages[i] = `data:image/png;base64,${b64}`;
                            } catch (e) {
                                console.error('转换预览图片失败:', e);
                            }
                        } else if (imgUrl && typeof imgUrl === 'string') {
                            nodeCopy.previewMjImages[i] = resolveSourceReferenceUrl(imgUrl);
                        }
                    }
                }

                return nodeCopy;
            };

            await writable.write(`{\n  "version": "3.7.36c",\n  "type": "workflow",\n  "nodes": [\n`);

            for (let i = 0; i < selectedNodes.length; i++) {
                const convertedNode = await convertNodeBlobUrls(selectedNodes[i]);
                const nodeJson = JSON.stringify(convertedNode, replacer, 4);
                const indentedJson = nodeJson.split('\n').map(line => '    ' + line).join('\n');
                await writable.write(indentedJson);
                if (i < selectedNodes.length - 1) {
                    await writable.write(',\n');
                } else {
                    await writable.write('\n');
                }
            }

            await writable.write(`  ],\n  "connections": ${JSON.stringify(selectedConnections, replacer, 2)},\n  "timestamp": ${JSON.stringify(getCSTTimestamp())}\n}`);
            await writable.close();
            canvasAlert(t('工作流保存成功！'));
        } catch (error) {
            console.error('保存工作流失败:', error);
            if (error.name === 'AbortError') return;
            canvasAlert('保存失败: ' + (error.message || '未知错误'));
        }
    }

export async function handleImportWorkflow({
    canvasRef,
    localServerUrl,
    screenToWorld,
    setConnections,
    setNodes,
    setSelectedNodeIds,
}) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (data.type !== 'workflow') {
                    canvasAlert('这不是一个有效的工作流文件。\n\n请使用"保存当前选取工作流"功能导出的文件。');
                    return;
                }
                if (!data.nodes || data.nodes.length === 0) {
                    canvasAlert(t('工作流文件中没有节点数据'));
                    return;
                }

                let localFiles = [];
                const baseUrl = (localServerUrl || 'http://127.0.0.1:9527').replace(/\/+$/, '');
                try {
                    if (baseUrl) {
                        const localFilesRes = await fetch(`${baseUrl}/list-files`);
                        if (localFilesRes.ok) {
                            const localFilesData = await localFilesRes.json();
                            if (localFilesData.success && localFilesData.files) {
                                localFiles = localFilesData.files;
                                console.log(`[导入工作流] 本地库已连接，找到 ${localFiles.length} 个文件`);
                            }
                        }
                    }
                } catch (err) {
                    console.log('[导入工作流] 本地服务器未连接');
                }

                const findLocalFileBySize = (dataUrl) => {
                    if (!localFiles.length || !dataUrl) return null;
                    try {
                        const base64 = dataUrl.split(',')[1];
                        if (!base64) return null;
                        const estimatedSize = Math.floor(base64.length * 0.75);
                        const tolerance = estimatedSize * 0.05;
                        const match = localFiles.find(f => Math.abs(f.size - estimatedSize) < tolerance);
                        if (match) {
                            return `${baseUrl}/file/${encodeURIComponent(match.rel_path)}`;
                        }
                    } catch (err) { }
                    return null;
                };

                const convertNodeUrls = async (node) => {
                    const stack = [node];
                    while (stack.length > 0) {
                        const current = stack.pop();
                        if (!current || typeof current !== 'object') continue;

                        for (const key in current) {
                            const val = current[key];
                            if (typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('data:video/'))) {
                                try {
                                    const localUrl = findLocalFileBySize(val);
                                    if (localUrl) {
                                        const testRes = await fetch(localUrl, { method: 'HEAD' });
                                        if (testRes.ok) {
                                            current[key] = localUrl;
                                            continue;
                                        }
                                    }
                                    const res = await fetch(val);
                                    const blob = await res.blob();
                                    current[key] = URL.createObjectURL(blob);
                                } catch (err) { }
                            } else if (typeof val === 'object' && val !== null) {
                                stack.push(val);
                            }
                        }
                    }
                    return node;
                };

                const idMap = new Map();
                data.nodes.forEach(node => {
                    idMap.set(node.id, `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
                });

                const canvasElement = canvasRef.current;
                let importX = 100, importY = 100;
                if (canvasElement) {
                    const rect = canvasElement.getBoundingClientRect();
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const worldPos = screenToWorld(centerX + rect.left, centerY + rect.top);
                    importX = worldPos.x;
                    importY = worldPos.y;
                }

                let minX = Infinity, minY = Infinity;
                data.nodes.forEach(node => {
                    if (node.x < minX) minX = node.x;
                    if (node.y < minY) minY = node.y;
                });

                const newNodes = [];
                for (const node of data.nodes) {
                    const convertedNode = await convertNodeUrls({ ...node });
                    convertedNode.id = idMap.get(node.id);
                    convertedNode.x = node.x - minX + importX;
                    convertedNode.y = node.y - minY + importY;
                    newNodes.push(convertedNode);
                }

                const newConnections = (data.connections || []).map(conn => ({
                    ...conn,
                    from: idMap.get(conn.from),
                    to: idMap.get(conn.to)
                })).filter(conn => conn.from && conn.to);

                setNodes(prev => [...prev, ...newNodes]);
                setConnections(prev => [...prev, ...newConnections]);
                setSelectedNodeIds(new Set(newNodes.map(n => n.id)));

                canvasAlert(`工作流导入成功！\n\n导入了 ${newNodes.length} 个节点和 ${newConnections.length} 个连接。`);
            } catch (error) {
                console.error('导入工作流失败:', error);
                canvasAlert('导入失败: ' + (error.message || '无效的JSON文件'));
            }
        };
        input.click();
    }

export async function importProjectBundle({
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
}, file) {
        setProgressState({ visible: true, progress: 0, status: 'READING BUNDLE...', type: 'import' });
        try {
            resetAssetBundleState({ keepStorage: true, keepActive: true });
            const zip = await JSZip.loadAsync(file);
            const projectFile = zip.file(/project\.json$/i)?.[0];
            if (!projectFile) throw new Error('未找到 project.json');
            const projectText = await projectFile.async('string');
            const projectData = JSON.parse(projectText || '{}');
            const assetFiles = zip.file(/^assets\//);
            const assetManifest = projectData.assetManifest || {};
            const pathToOriginal = new Map();
            Object.entries(assetManifest).forEach(([original, path]) => {
                if (path) pathToOriginal.set(path, original);
            });
            assetBundlePathToOriginalRef.current.clear();
            pathToOriginal.forEach((value, key) => assetBundlePathToOriginalRef.current.set(key, value));
            const assetUrlMap = new Map();
            for (const asset of assetFiles) {
                const blob = await asset.async('blob');
                const assetPath = asset.name;
                const originalUrl = pathToOriginal.get(assetPath) || '';
                const mimeFromPath = getMimeTypeFromPath(assetPath);
                const isImageAsset = (blob?.type && blob.type.startsWith('image/')) || mimeFromPath.startsWith('image/');
                const isVideoAsset = (blob?.type && blob.type.startsWith('video/')) || mimeFromPath.startsWith('video/');
                const typedBlob = blob && (!blob.type && mimeFromPath)
                    ? new Blob([blob], { type: mimeFromPath })
                    : blob;

                if (isImageAsset || isVideoAsset) {
                    try {
                        const assetId = await LocalImageManager.saveImage(typedBlob);
                        if (assetId) {
                            assetUrlMap.set(assetPath, assetId);
                            assetBundlePathToIdRef.current.set(assetPath, assetId);
                            if (originalUrl) assetBundleIdToOriginalRef.current.set(assetId, originalUrl);
                            continue;
                        }
                    } catch (e) { }
                }
                const url = URL.createObjectURL(typedBlob);
                assetUrlMap.set(assetPath, url);
                assetBundleBlobUrlsRef.current.add(url);
                if (originalUrl) assetBundleBlobToOriginalRef.current.set(url, originalUrl);
            }
            setAssetBundleActive(true);
            persistAssetBundleMeta();
            const applyAssetBundle = (obj) => {
                if (!obj) return obj;
                if (typeof obj === 'string') {
                    if (obj.startsWith('asset://')) {
                        const path = obj.replace('asset://', '');
                        const mapped = assetUrlMap.get(path);
                        if (mapped) return mapped;
                        const fallback = assetBundlePathToOriginalRef.current.get(path);
                        return fallback || obj;
                    }
                    const mappedPath = assetManifest[obj];
                    if (mappedPath) {
                        const mapped = assetUrlMap.get(mappedPath);
                        if (mapped) return mapped;
                        const fallback = assetBundlePathToOriginalRef.current.get(mappedPath);
                        if (fallback) return fallback;
                    }
                    return obj;
                }
                if (Array.isArray(obj)) return obj.map(applyAssetBundle);
                if (typeof obj === 'object') {
                    const next = {};
                    Object.entries(obj).forEach(([key, val]) => {
                        next[key] = applyAssetBundle(val);
                    });
                    return next;
                }
                return obj;
            };
            const hydratedProject = applyAssetBundle(projectData);
            setTimeout(() => {
                applyLoadedProjectState(hydratedProject);
                setProgressState(prev => ({ ...prev, visible: false }));
                canvasAlert(`加载成功！\n${hydratedProject.nodes?.length || 0} 个节点`);
                persistAutoSaveSnapshot({
                    nodes: hydratedProject.nodes || [],
                    connections: hydratedProject.connections || []
                }).catch((err) => {
                    console.warn('[AutoSave] 导入后立即保存失败:', err);
                });
                if (Array.isArray(hydratedProject.history)) {
                    persistHistorySnapshot(hydratedProject.history);
                }
            }, 100);
        } catch (error) {
            console.error('加载资产包失败:', error);
            setProgressState(prev => ({ ...prev, visible: false }));
            canvasAlert(`加载失败: ${error.message || error} `);
        }
    }

export function handleLoadProject({
    applyLoadedProjectState,
    importProjectBundle,
    localServerUrl,
    persistAutoSaveSnapshot,
    persistHistorySnapshot,
    setProgressState,
}) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.zip';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // 初始化进度
            setProgressState({ visible: true, progress: 0, status: 'INITIALIZING...', type: 'import' });

            if (file.name && file.name.toLowerCase().endsWith('.zip')) {
                await importProjectBundle(file);
                return;
            }

            // --- 尝试获取本地库文件列表（用于优先使用本地文件）---
            let localFiles = [];
            const localBaseUrl = (localServerUrl || 'http://127.0.0.1:9527').replace(/\/+$/, '');
            try {
                if (localBaseUrl) {
                    const localFilesRes = await fetch(`${localBaseUrl}/list-files`);
                    if (localFilesRes.ok) {
                        const localFilesData = await localFilesRes.json();
                        if (localFilesData.success && localFilesData.files) {
                            localFiles = localFilesData.files;
                            console.log(`[导入] 本地库已连接，找到 ${localFiles.length} 个文件`);
                        }
                    }
                }
            } catch (e) {
                console.log('[导入] 本地服务器未连接，将使用原始数据');
            }

            const findLocalFileBySize = (dataUrl) => {
                if (!localFiles.length || !dataUrl) return null;
                try {
                    const base64 = dataUrl.split(',')[1];
                    if (!base64) return null;
                    const estimatedSize = Math.floor(base64.length * 0.75);
                    const tolerance = estimatedSize * 0.05;
                    const match = localFiles.find(f => Math.abs(f.size - estimatedSize) < tolerance);
                    if (match) {
                        return `${localBaseUrl}/file/${encodeURIComponent(match.rel_path)}`;
                    }
                } catch (e) { }
                return null;
            };

            const tempState = {
                nodes: [], history: [], connections: [],
                chatSessions: [], characterLibrary: [],
                projectName: '', view: null, theme: '', modelLibrary: [],
                modelLibraryLoaded: false
            };

            let currentSection = null;
            let buffer = '';
            let objectBuffer = '';
            let braceCount = 0;
            let inObject = false;
            let inString = false;
            let escapeNext = false;
            let bytesRead = 0;
            const totalBytes = file.size;

            // --- 关键辅助函数：原地转换对象中的 Base64 为 Blob URL ---
            // 这一步必须非常快且不占用额外内存
            const convertItemImmediately = async (item) => {
                // 递归遍历对象，找到所有 data:image/data:video 开头的字符串并转换
                const stack = [item];
                while (stack.length > 0) {
                    const current = stack.pop();
                    if (!current || typeof current !== 'object') continue;

                    for (const key in current) {
                        const val = current[key];
                        if (typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('data:video/'))) {
                            try {
                                const localUrl = findLocalFileBySize(val);
                                if (localUrl) {
                                    const testRes = await fetch(localUrl, { method: 'HEAD' });
                                    if (testRes.ok) {
                                        current[key] = localUrl;
                                        continue;
                                    }
                                }
                                // 立即转换为 Blob URL，释放原字符串内存
                                const res = await fetch(val);
                                const blob = await res.blob();
                                current[key] = URL.createObjectURL(blob);
                            } catch (err) {
                                // 转换失败则保持原样，防止丢失数据
                            }
                        } else if (typeof val === 'object' && val !== null) {
                            stack.push(val);
                        }
                    }
                }
                return item;
            };

            try {
                const stream = file.stream().pipeThrough(new TextDecoderStream());
                const reader = stream.getReader();

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    // 更新进度条 (每读取 5MB 更新一次 UI，避免频繁渲染卡顿)
                    bytesRead += value.length;
                    if (Math.random() > 0.95) {
                        const percent = Math.min(99, (bytesRead / totalBytes) * 100);
                        setProgressState(prev => ({
                            ...prev,
                            progress: percent,
                            status: `PROCESSING ${(bytesRead / 1024 / 1024).toFixed(0)} MB`
                        }));
                    }

                    buffer += value;

                    // 逐行解析
                    while (true) {
                        const newlineIndex = buffer.indexOf('\n');
                        if (newlineIndex === -1) break;

                        const line = buffer.substring(0, newlineIndex);
                        buffer = buffer.substring(newlineIndex + 1);
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;

                        // 状态机检测
                        if (trimmedLine.includes('"nodes": [')) { currentSection = 'nodes'; continue; }
                        if (trimmedLine.includes('"history": [')) { currentSection = 'history'; continue; }
                        if (trimmedLine.includes('"connections": [')) { currentSection = 'connections'; continue; }
                        if (trimmedLine.includes('"chatSessions": [')) { currentSection = 'chatSessions'; continue; }
                        if (trimmedLine.includes('"characterLibrary": [')) { currentSection = 'characterLibrary'; continue; }
                        if (trimmedLine.includes('"modelLibrary": [')) { currentSection = 'modelLibrary'; tempState.modelLibraryLoaded = true; continue; }

                        // 结束符检测
                        if ((trimmedLine === '],' || trimmedLine === ']') && braceCount === 0) {
                            currentSection = null;
                            objectBuffer = '';
                            inObject = false;
                            inString = false;
                            escapeNext = false;
                            continue;
                        }

                        // 简单字段解析
                        if (!currentSection) {
                            if (trimmedLine.startsWith('"projectName":')) {
                                try { const m = trimmedLine.match(/"projectName":\s*(.+)/); if (m) tempState.projectName = JSON.parse(m[1].replace(/,$/, '')); } catch (e) { }
                            }
                            if (trimmedLine.startsWith('"theme":')) {
                                try { const m = trimmedLine.match(/"theme":\s*(.+)/); if (m) tempState.theme = JSON.parse(m[1].replace(/,$/, '')); } catch (e) { }
                            }
                            if (trimmedLine.startsWith('"view":')) {
                                // view 通常很短，这里做个简单处理，实际可能需要多行逻辑，但为了性能暂略
                                try { const m = trimmedLine.match(/"view":\s*(.+)/); if (m && m[1].endsWith('}')) tempState.view = JSON.parse(m[1].replace(/,$/, '')); } catch (e) { }
                            }
                            continue;
                        }

                        // 对象累积
                        if (currentSection) {
                            for (let char of line) {
                                if (inString) {
                                    if (escapeNext) {
                                        escapeNext = false;
                                        continue;
                                    }
                                    if (char === '\\') {
                                        escapeNext = true;
                                        continue;
                                    }
                                    if (char === '"') {
                                        inString = false;
                                    }
                                    continue;
                                }
                                if (char === '"') {
                                    inString = true;
                                    continue;
                                }
                                if (char === '{') { braceCount++; inObject = true; }
                                if (char === '}') { braceCount = Math.max(0, braceCount - 1); }
                            }
                            objectBuffer += line + '\n';

                            if (inObject && braceCount === 0 && !inString) {
                                let jsonStr = objectBuffer.trim();
                                if (jsonStr.endsWith(',')) jsonStr = jsonStr.slice(0, -1);

                                try {
                                    const item = JSON.parse(jsonStr);

                                    // === 核心优化点 ===
                                    // 立即转换，防止 Base64 堆积在内存中
                                    if (currentSection === 'nodes' || currentSection === 'history' || currentSection === 'characterLibrary') {
                                        await convertItemImmediately(item);
                                    }

                                    // 转换后再存入数组
                                    if (currentSection === 'nodes' && item.id) {
                                        if (!item.settings) item.settings = {};
                                        tempState.nodes.push(item);
                                    } else if (currentSection === 'history') {
                                        tempState.history.push(item);
                                    } else if (currentSection === 'connections') {
                                        tempState.connections.push(item);
                                    } else if (currentSection === 'chatSessions') {
                                        tempState.chatSessions.push(item);
                                    } else if (currentSection === 'characterLibrary') {
                                        tempState.characterLibrary.push(item);
                                    } else if (currentSection === 'modelLibrary') {
                                        tempState.modelLibrary.push(item);
                                    }
                                } catch (parseErr) {
                                    // 忽略解析错误，继续处理下一个
                                }
                                objectBuffer = '';
                                inObject = false;
                                inString = false;
                                escapeNext = false;
                            }
                        }
                    }
                }

                // 完成
                setProgressState(prev => ({ ...prev, progress: 100, status: 'FINALIZING...' }));

                // 批量更新状态
                setTimeout(() => {
                    applyLoadedProjectState(tempState);
                    setProgressState(prev => ({ ...prev, visible: false }));
                    canvasAlert(`加载成功！\n${tempState.nodes.length} 个节点`);
                    persistAutoSaveSnapshot({
                        nodes: tempState.nodes,
                        connections: tempState.connections
                    }).catch((err) => {
                        console.warn('[AutoSave] 导入后立即保存失败:', err);
                    });
                    if (Array.isArray(tempState.history)) {
                        persistHistorySnapshot(tempState.history);
                    }
                }, 200);

            } catch (error) {
                console.error('加载失败:', error);
                setProgressState(prev => ({ ...prev, visible: false }));
                canvasAlert(`加载失败: ${error.message} `);
            }
        };
        input.click();
    }
