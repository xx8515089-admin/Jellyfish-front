import { canvasAlert } from '../canvasDialogs';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { t, normalizeStoryboardMode, getImageDimensions, isVideoUrl, getVideoMetadata } from '../freeCanvasShared';

export async function applyHistoryToNode({
    createLinkedInputNode,
    getHistoryMultiImages,
    insertKeyframesFromUrls,
    normalizeHistoryVideoUrl,
    resolveHistoryUrl,
    resolveUrlForMediaMeta,
    setNodes,
    showToast,
}, targetNode, item) {
        if (!targetNode) return false;
        const resolvedUrl = normalizeHistoryVideoUrl(resolveHistoryUrl(item), item.type);
        if (!resolvedUrl) return false;

        if (targetNode.type === 'preview') {
            const previewImages = getHistoryMultiImages(item);
            const selectedIndex = item.selectedMjImageIndex ?? 0;
            const previewUrl = previewImages ? (previewImages[selectedIndex] || previewImages[0]) : resolvedUrl;
            setNodes(prev => prev.map(n =>
                n.id === targetNode.id
                    ? { ...n, content: previewUrl, previewSourceNodeId: null, previewType: item.type === 'video' || isVideoUrl(previewUrl) ? 'video' : 'image', previewMjImages: previewImages }
                    : n
            ));
            return true;
        }

        if (targetNode.type === 'input-image') {
            let dimensions = null;
            if (!isVideoUrl(resolvedUrl)) {
                try {
                    const metaUrl = await resolveUrlForMediaMeta(resolvedUrl);
                    dimensions = await getImageDimensions(metaUrl);
                } catch { }
            }
            setNodes(prev => prev.map(n =>
                n.id === targetNode.id
                    ? { ...n, content: resolvedUrl, dimensions: isVideoUrl(resolvedUrl) ? null : dimensions }
                    : n
            ));
            return true;
        }

        if (targetNode.type === 'video-input') {
            if (item.type === 'video' || isVideoUrl(resolvedUrl)) {
                let videoMeta = { duration: 0, w: 0, h: 0 };
                try {
                    const metaUrl = await resolveUrlForMediaMeta(resolvedUrl);
                    videoMeta = await getVideoMetadata(metaUrl);
                } catch { }
                setNodes(prev => prev.map(n =>
                    n.id === targetNode.id
                        ? { ...n, content: resolvedUrl, videoMeta, frames: [], selectedKeyframes: [], extractingFrames: false, videoFileName: '' }
                        : n
                ));
                return true;
            }
            insertKeyframesFromUrls(targetNode.id, [resolvedUrl]);
            return true;
        }

        if (targetNode.type === 'video-analyze') {
            const isVideo = item.type === 'video' || isVideoUrl(resolvedUrl);
            return await createLinkedInputNode(targetNode, resolvedUrl, isVideo);
        }

        if (targetNode.type === 'gen-image' || targetNode.type === 'gen-video' || targetNode.type === 'image-compare') {
            const isVideo = item.type === 'video' || isVideoUrl(resolvedUrl);
            if (isVideo && targetNode.type === 'gen-image') {
                showToast('AI 绘图仅支持图片输入', 'warning');
                return false;
            }
            if (isVideo && targetNode.type === 'image-compare') {
                showToast('图像对比仅支持图片输入', 'warning');
                return false;
            }
            return await createLinkedInputNode(targetNode, resolvedUrl, isVideo);
        }

        return false;
    }

export async function handleGenNodeDrop({
    createLinkedInputNode,
    getDragUrlCandidate,
    getHistoryDragPayload,
    nodesMap,
    resolveDroppedUrlCandidate,
    resolveHistoryPayloadUrl,
    showToast,
}, nodeId, e) {
        e.preventDefault();
        e.stopPropagation();
        const targetNode = nodesMap.get(nodeId);
        if (!targetNode) return;

        const payload = getHistoryDragPayload(e);
        if (payload) {
            const dragUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            if (dragUrl) {
                const isVideo = payload.type === 'video' || isVideoUrl(dragUrl);
                if (isVideo && (targetNode.type === 'gen-image' || targetNode.type === 'image-compare' || targetNode.type === 'gen-video')) {
                    showToast('当前节点仅支持图片参考', 'warning');
                    return;
                }
                await createLinkedInputNode(targetNode, dragUrl, false);
            }
            return;
        }

        const candidate = resolveDroppedUrlCandidate(getDragUrlCandidate(e));
        if (candidate) {
            const isVideo = isVideoUrl(candidate);
            if (isVideo && (targetNode.type === 'gen-image' || targetNode.type === 'image-compare' || targetNode.type === 'gen-video')) {
                showToast('当前节点仅支持图片参考', 'warning');
                return;
            }
            await createLinkedInputNode(targetNode, candidate, false);
            return;
        }

        const files = Array.from(e.dataTransfer.files || []);
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
            return;
        }

        const videoFile = files.find(file => file.type.startsWith('video/'));
        if (videoFile) {
            showToast('当前节点仅支持图片参考', 'warning');
        }
    }

export async function sendHistoryToCanvas({
    addNode,
    historyContextMenu,
    nodes,
    resolveHistoryUrl,
    screenToWorld,
    setHistoryContextMenu,
    setHistorySendMenuOpen,
}) {
        const item = historyContextMenu.item;
        const resolvedUrl = resolveHistoryUrl(item, item?.url || item?.originalUrl || item?.mjOriginalUrl || null);
        if (!resolvedUrl) return;

        // 修复：标记视频内容，使 input-image 节点能够正确显示
        let content = resolvedUrl;
        if (item.type === 'video' && !isVideoUrl(content)) {
            // 追加辅助参数，使 isVideoUrl 返回 true
            content += (content.includes('?') ? '&' : '?') + 'force_video_display=true';
        }

        let dims;
        if (item.type === 'image') {
            try {
                const real = await getImageDimensions(content);
                if (real?.w && real?.h) {
                    dims = { w: real.w, h: real.h };
                }
            } catch (e) {
                console.error('SendHistoryToCanvas getImageDimensions error', e);
            }
        }

        // V3.4.12: 修复层叠逻辑 - 找最后一个 input-image 节点位置作为基准
        const inputImageNodes = nodes.filter(n => n.type === 'input-image');
        let baseX, baseY;

        if (inputImageNodes.length > 0) {
            const lastNode = inputImageNodes[inputImageNodes.length - 1];
            baseX = lastNode.x - 40;
            baseY = lastNode.y + 35;
        } else {
            const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
            baseX = world.x + 50;
            baseY = world.y + 50;
        }

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

        addNode('input-image', targetX, targetY, null, content, dims);
        setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null });
        setHistorySendMenuOpen(false);
    }

export function applyHistoryPromptToNode({
    nodesMap,
    updateNodeSettings,
}, targetNodeId, promptText) {
        if (!targetNodeId || !promptText) return { applied: false };
        const targetNode = nodesMap.get(targetNodeId);
        if (!targetNode) return { applied: false };

        const normalizedPrompt = String(promptText || '').trim();
        if (!normalizedPrompt) return { applied: false };
        const settings = targetNode.settings || {};

        if (targetNode.type === 'storyboard-node') {
            updateNodeSettings(targetNode.id, { scriptText: normalizedPrompt, scriptExpanded: true });
            return { applied: true, target: 'script' };
        }
        if (targetNode.type === 'gen-video' || targetNode.type === 'generate-character-video' || targetNode.type === 'generate-scene-video') {
            updateNodeSettings(targetNode.id, { videoPrompt: normalizedPrompt });
            return { applied: true, target: 'node' };
        }
        if (targetNode.type === 'text-node') {
            updateNodeSettings(targetNode.id, { text: normalizedPrompt });
            return { applied: true, target: 'node' };
        }
        if (targetNode.type === 'novel-input') {
            updateNodeSettings(targetNode.id, { content: normalizedPrompt });
            return { applied: true, target: 'node' };
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'prompt')) {
            updateNodeSettings(targetNode.id, { prompt: normalizedPrompt });
            return { applied: true, target: 'node' };
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'videoPrompt')) {
            updateNodeSettings(targetNode.id, { videoPrompt: normalizedPrompt });
            return { applied: true, target: 'node' };
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'text')) {
            updateNodeSettings(targetNode.id, { text: normalizedPrompt });
            return { applied: true, target: 'node' };
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'content')) {
            updateNodeSettings(targetNode.id, { content: normalizedPrompt });
            return { applied: true, target: 'node' };
        }

        return { applied: false };
    }

export function buildStoryboardDownloadItems({
    getDataUrlExt,
    getUrlExt,
    sanitizeCacheId,
}, node, scope = 'all') {
        const mode = normalizeStoryboardMode(node.settings?.mode);
        const shots = node.settings?.shots || [];
        const projectTitle = node.settings?.projectTitle || '未命名分镜';
        const projectSlug = sanitizeCacheId(projectTitle) || '未命名分镜';
        const items = [];

        const getShotLabel = (shot) => {
            const raw = (shot.description || shot.prompt || '').trim();
            return sanitizeCacheId(raw) || '未命名镜头';
        };

        const pushImageItem = (shot, shotIndex, imageUrl, imageIndex) => {
            if (!imageUrl) return;
            const ext = imageUrl.startsWith('data:') ? (getDataUrlExt(imageUrl, '.png') || '.png') : (getUrlExt(imageUrl, '.png') || '.png');
            const shotLabel = getShotLabel(shot);
            const filename = `${projectSlug}-${shotLabel}-${shotIndex}-${imageIndex}${ext}`;
            items.push({ url: imageUrl, filename });
        };

        const pushVideoItem = (shot, shotIndex, videoUrl) => {
            if (!videoUrl) return;
            const ext = videoUrl.startsWith('data:') ? (getDataUrlExt(videoUrl, '.mp4') || '.mp4') : (getUrlExt(videoUrl, '.mp4') || '.mp4');
            const shotLabel = getShotLabel(shot);
            const filename = `${projectSlug}-${shotLabel}-${shotIndex}${ext}`;
            items.push({ url: videoUrl, filename });
        };

        const hasLockedShot = scope !== 'all' && shots.some(s => s.outputEnabled);

        shots.forEach((shot, idx) => {
            const shotIndex = shot.scene_index || idx + 1;

            if (mode === 'image') {
                const outputImages = shot.output_images?.length ? shot.output_images : (shot.output_url ? [shot.output_url] : []);
                if (outputImages.length === 0) return;

                if (scope === 'all') {
                    outputImages.forEach((url, imageIdx) => pushImageItem(shot, shotIndex, url, imageIdx + 1));
                    return;
                }

                const selectedIndex = Number.isInteger(shot.selectedImageIndex) ? shot.selectedImageIndex : -1;
                const isLocked = !!shot.outputEnabled;

                if (hasLockedShot) {
                    if (!isLocked) return;
                    if (selectedIndex >= 0 && outputImages[selectedIndex]) {
                        pushImageItem(shot, shotIndex, outputImages[selectedIndex], selectedIndex + 1);
                        return;
                    }
                    outputImages.forEach((url, imageIdx) => pushImageItem(shot, shotIndex, url, imageIdx + 1));
                    return;
                }

                if (selectedIndex >= 0 && outputImages[selectedIndex]) {
                    pushImageItem(shot, shotIndex, outputImages[selectedIndex], selectedIndex + 1);
                }
            } else {
                const videoUrl = shot.video_url || shot.output_url;
                if (!videoUrl) return;

                if (scope === 'all') {
                    pushVideoItem(shot, shotIndex, videoUrl);
                    return;
                }

                if (shot.outputEnabled) {
                    pushVideoItem(shot, shotIndex, videoUrl);
                }
            }
        });

        return items;
    }

export async function handleStoryboardBatchDownload({
    buildStoryboardDownloadItems,
    sanitizeCacheId,
    setDownloadProgress,
}, node, scope = 'all') {
        const items = buildStoryboardDownloadItems(node, scope);
        if (!items.length) {
            canvasAlert(t('没有可下载的资源'));
            return;
        }

        const now = new Date();
        const timestamp = `${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const projectTitle = node.settings?.projectTitle || '未命名分镜';
        const zipName = `${sanitizeCacheId(projectTitle) || '未命名分镜'}-batch-${timestamp}.zip`;

        const toBlob = async (url) => {
            if (url.startsWith('data:')) {
                const parts = url.split(',');
                const mime = parts[0].match(/:(.*?);/i)?.[1] || 'application/octet-stream';
                const bstr = atob(parts[1] || '');
                const u8arr = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
                return new Blob([u8arr], { type: mime });
            }
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.blob();
        };

        if (items.length === 1) {
            try {
                setDownloadProgress({ active: true, current: 0, total: 1 });
                const blob = await toBlob(items[0].url);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = items[0].filename;
                a.click();
                URL.revokeObjectURL(a.href);
                setDownloadProgress({ active: false, current: 1, total: 1 });
            } catch (e) {
                setDownloadProgress({ active: false, current: 0, total: 0 });
                canvasAlert('下载失败: ' + e.message);
            }
            return;
        }

        const zip = new JSZip();
        const totalSteps = items.length;
        setDownloadProgress({ active: true, current: 0, total: totalSteps });
        let added = 0;

        for (const item of items) {
            try {
                const blob = await toBlob(item.url);
                zip.file(item.filename, blob);
                added += 1;
            } catch (e) {
                console.error('下载资源失败:', item.filename, e);
            }
            setDownloadProgress(prev => ({ ...prev, current: Math.min(totalSteps, prev.current + 1) }));
        }

        if (added === 0) {
            setDownloadProgress({ active: false, current: 0, total: 0 });
            canvasAlert(t('没有可下载的有效资源'));
            return;
        }

        const content = await zip.generateAsync({ type: 'blob' });
        setDownloadProgress(prev => ({ ...prev, current: totalSteps }));
        saveAs(content, zipName);
        setDownloadProgress({ active: false, current: totalSteps, total: totalSteps });
    }
