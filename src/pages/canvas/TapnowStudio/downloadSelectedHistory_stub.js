import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import i18n from './i18n';

const t = i18n.t.bind(i18n);

const MIME_EXT_MAP = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov'
};

const sanitizeFilenamePart = (value, fallback = 'untitled', maxLength = 50) => {
    const raw = String(value || fallback)
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return (raw || fallback).slice(0, maxLength);
};

const getTimestamp = () => {
    const now = new Date();
    return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
};

const dataUrlToBlob = (dataUrl) => {
    const parts = String(dataUrl).split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
    const binary = atob(parts[1] || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
};

const getDataUrlExtension = (url, fallback = 'png') => {
    const mime = String(url).match(/^data:([^;,]+)/i)?.[1];
    return MIME_EXT_MAP[mime] || fallback;
};

const getUrlExtension = (url) => {
    if (!url || String(url).startsWith('data:')) return '';
    const path = String(url).split('?')[0].split('#')[0];
    const lastSegment = path.split('/').pop() || '';
    if (!lastSegment.includes('.')) return '';
    const ext = lastSegment.split('.').pop();
    return ext && ext.length <= 5 && /^[a-z0-9]+$/i.test(ext) ? ext : '';
};

const getBlobExtension = (blob) => {
    if (!blob?.type) return '';
    return MIME_EXT_MAP[blob.type] || blob.type.split('/')[1] || '';
};

const inferExtension = ({ item, url, blob }) => {
    const fallback = item?.type === 'video' ? 'mp4' : 'png';
    if (String(url).startsWith('data:')) return getDataUrlExtension(url, fallback);
    return getUrlExtension(url) || getBlobExtension(blob) || fallback;
};

const resolveDefaultHistoryUrl = (item, specificUrl = null) => {
    if (specificUrl) return specificUrl;
    return item?.localCacheUrl || item?.url || item?.originalUrl || item?.mjOriginalUrl || item?.output_url || item?.video_url || '';
};

const getHistoryResources = (item, resolveHistoryUrl) => {
    if (!item) return [];
    const resources = [];
    const pushResource = (url, suffix = '') => {
        const resolvedUrl = resolveHistoryUrl(item, url) || url;
        if (resolvedUrl) {
            resources.push({ url: resolvedUrl, suffix });
        }
    };

    if (Array.isArray(item.mjImages) && item.mjImages.length > 0) {
        item.mjImages.forEach((url, idx) => pushResource(url, `_${idx + 1}`));
        return resources;
    }

    if (Array.isArray(item.output_images) && item.output_images.length > 0) {
        item.output_images.forEach((url, idx) => pushResource(url, `_${idx + 1}`));
        return resources;
    }

    const resolvedUrl = resolveHistoryUrl(item);
    if (resolvedUrl) resources.push({ url: resolvedUrl, suffix: '' });
    return resources;
};

const loadResourceBlob = async (url, item, fetchBlob) => {
    if (String(url).startsWith('data:')) return dataUrlToBlob(url);
    if (fetchBlob) {
        const result = await fetchBlob(url, item);
        return result?.blob || result;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
};

const makeUniqueFilename = (filename, usedFilenames) => {
    if (!usedFilenames.has(filename)) {
        usedFilenames.add(filename);
        return filename;
    }
    const dotIndex = filename.lastIndexOf('.');
    const base = dotIndex > -1 ? filename.slice(0, dotIndex) : filename;
    const ext = dotIndex > -1 ? filename.slice(dotIndex) : '';
    let index = 2;
    let nextFilename = `${base}_${index}${ext}`;
    while (usedFilenames.has(nextFilename)) {
        index += 1;
        nextFilename = `${base}_${index}${ext}`;
    }
    usedFilenames.add(nextFilename);
    return nextFilename;
};

const reportError = (alertMessage, message) => {
    if (alertMessage) {
        alertMessage(message);
        return;
    }
    if (typeof window !== 'undefined' && window.alert) {
        window.alert(message);
    }
};

export const downloadSelectedHistory = async (input, options = {}) => {
    const params = Array.isArray(input) ? { ...options, items: input } : (input || {});
    const {
        items = [],
        fetchBlob,
        resolveHistoryUrl = resolveDefaultHistoryUrl,
        setDownloadProgress,
        alertMessage,
        zipFilenamePrefix = 'tapnow-assets'
    } = params;

    if (!items || items.length === 0) {
        console.warn('[downloadSelectedHistory] No items to download');
        return;
    }

    if (items.length === 1) {
        const firstItem = items[0];
        const resources = getHistoryResources(firstItem, resolveHistoryUrl);
        if (resources.length === 1) {
            setDownloadProgress?.({ active: true, current: 0, total: 1 });
            try {
                const resource = resources[0];
                const blob = await loadResourceBlob(resource.url, firstItem, fetchBlob);
                const ext = inferExtension({ item: firstItem, url: resource.url, blob });
                const filename = `${sanitizeFilenamePart(firstItem.prompt, 'download')}.${ext}`;
                saveAs(blob, filename);
                setDownloadProgress?.({ active: false, current: 1, total: 1 });
            } catch (error) {
                console.error('单文件下载失败:', error);
                setDownloadProgress?.({ active: false, current: 0, total: 0 });
                reportError(alertMessage, `${t('下载失败')}: ${error.message}`);
            }
            return;
        }
    }

    const zip = new JSZip();
    const usedFilenames = new Set();
    const totalSteps = items.length;
    let count = 0;

    setDownloadProgress?.({ active: true, current: 0, total: totalSteps });

    try {
        for (const item of items) {
            if (!item) continue;

            const resources = getHistoryResources(item, resolveHistoryUrl);
            for (const resource of resources) {
                try {
                    const blob = await loadResourceBlob(resource.url, item, fetchBlob);
                    const ext = inferExtension({ item, url: resource.url, blob });
                    const promptSlug = sanitizeFilenamePart(item.prompt, 'untitled', 40);
                    const itemIdSuffix = item.id ? `_${String(item.id).slice(-4)}` : '';
                    const filename = makeUniqueFilename(`${promptSlug}${itemIdSuffix}${resource.suffix}.${ext}`, usedFilenames);

                    zip.file(filename, blob);
                    count += 1;
                } catch (error) {
                    console.error(`打包资源失败 [${item?.id || 'unknown'}]:`, error);
                }
            }

            setDownloadProgress?.((prev) => ({ ...prev, current: Math.min(totalSteps, (prev.current || 0) + 1) }));
        }

        if (count === 0) {
            setDownloadProgress?.({ active: false, current: 0, total: 0 });
            reportError(alertMessage, t('没有可下载的有效资源'));
            return;
        }

        const content = await zip.generateAsync({ type: 'blob' });
        setDownloadProgress?.((prev) => ({ ...prev, current: totalSteps }));
        saveAs(content, `${zipFilenamePrefix}-${getTimestamp()}.zip`);
        setDownloadProgress?.({ active: false, current: totalSteps, total: totalSteps });
    } catch (error) {
        console.error('打包过程出错:', error);
        setDownloadProgress?.({ active: false, current: 0, total: 0 });
        reportError(alertMessage, `${t('打包失败，请查看控制台')}: ${error.message}`);
    }
};

export default downloadSelectedHistory;
