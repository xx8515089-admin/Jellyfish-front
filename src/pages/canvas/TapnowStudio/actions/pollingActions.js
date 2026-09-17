import {
    LocalImageManager,
    parseStoryboardSourceNodeId,
    applyBatchFailureToHistoryItem,
    getValueByPath,
    getValueByPathAny,
    normalizeAsyncStatusValue,
    extractAsyncOutputUrls,
    collectDeepImageValues,
    buildRequestFromTemplate,
    coerceFormDataFromObject,
    getVideoMetadata
} from '../freeCanvasShared';

export async function pollVeoJob({
    historyMap,
    pollVeoJob,
    setHistory,
    storyboardTaskMapRef,
    updatePreviewFromTask,
    updateShot,
}, jobId, taskId, baseUrl, apiKey, w, h, attempt = 0) {
        const maxAttempts = 90; // 增加到90次，支持最长360秒（6分钟）的生成时间
        const delayMs = 4000;

        if (attempt > maxAttempts) {
            setHistory((prev) => prev.map((hItem) => hItem.id === taskId ? { ...hItem, status: 'failed', errorMsg: 'Veo 轮询超时' } : hItem));

            // 检查是否是分镜表的任务，如果是则更新状态为 draft
            const storyboardTask = storyboardTaskMapRef.current.get(taskId);
            if (storyboardTask) {
                updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                    status: 'draft'
                });
                // 清理任务映射
                storyboardTaskMapRef.current.delete(taskId);
            }
            return;
        }

        fetch(`${baseUrl}/v2/videos/generations/${jobId}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
        })
            .then(async (resp) => {
                const text = await resp.text();
                let data;
                try { data = JSON.parse(text); } catch (err) { setTimeout(() => pollVeoJob(jobId, taskId, baseUrl, apiKey, w, h, attempt + 1), delayMs); return; }

                const status = data?.data?.status || data?.status || data?.data?.task_status;
                const progress = data?.data?.progress || data?.progress || '0%';
                const failReason = data?.data?.fail_reason || data?.fail_reason || '';

                // 处理成功状态
                if (status === 'SUCCESS' || status === 'succeeded' || status === 'FINISHED' || status === 'completed') {
                    const videoUrl = data?.data?.output || data?.output || data?.data?.video_url || data?.video_url || data?.data?.data?.output;
                    if (!videoUrl) {
                        console.warn('[Tapnow] Veo: 任务成功但未找到视频URL', data);
                        setHistory((prev) => prev.map((hItem) => hItem.id === taskId ? { ...hItem, status: 'failed', errorMsg: '未找到视频URL' } : hItem));
                        return;
                    }
                    const endTime = Date.now();
                    // 在更新 history 之前，先获取 sourceNodeId 和 ratio
                    // 使用函数式更新来确保获取最新的 historyItem
                    setHistory((prev) => {
                        const historyItem = prev.find(h => h.id === taskId);
                        const sourceNodeId = historyItem?.sourceNodeId;
                        const originalRatio = historyItem?.ratio;
                        const durationMs = endTime - (historyItem?.startTime || endTime);


                        // 对于 veo3.1，尝试从实际视频获取真实尺寸
                        let finalW = w, finalH = h;

                        // 异步获取视频尺寸并更新（使用 Promise）
                        (async () => {
                            try {
                                const videoMeta = await getVideoMetadata(videoUrl);
                                if (videoMeta && videoMeta.w > 0 && videoMeta.h > 0) {
                                    const actualW = videoMeta.w;
                                    const actualH = videoMeta.h;

                                    // 验证实际尺寸是否匹配请求的 aspect_ratio
                                    if (originalRatio === '16:9') {
                                        const actualRatio = actualW / actualH;
                                        const expectedRatio = 16 / 9;
                                        if (Math.abs(actualRatio - expectedRatio) > 0.1) {
                                            console.warn(`[Tapnow] Veo: 视频实际比例 ${actualRatio.toFixed(2)} 不匹配请求的 16:9 (${expectedRatio.toFixed(2)})，后端返回了错误的比例！`);
                                            console.warn(`[Tapnow] Veo: 实际尺寸: ${actualW}x${actualH}, 请求比例: 16:9`);
                                            console.warn(`[Tapnow] Veo: 强制使用请求的 16:9 比例，调整尺寸为: ${w}x${Math.round(w / (16 / 9))}`);
                                            // 如果后端返回了错误的比例，强制使用请求的比例
                                            finalW = w;
                                            finalH = Math.round(w / (16 / 9));
                                        } else {
                                            finalW = actualW;
                                            finalH = actualH;
                                        }
                                    } else if (originalRatio === '9:16') {
                                        const actualRatio = actualW / actualH;
                                        const expectedRatio = 9 / 16;
                                        if (Math.abs(actualRatio - expectedRatio) > 0.1) {
                                            console.warn(`[Tapnow] Veo: 视频实际比例 ${actualRatio.toFixed(2)} 不匹配请求的 9:16 (${expectedRatio.toFixed(2)})，后端返回了错误的比例！`);
                                            console.warn(`[Tapnow] Veo: 实际尺寸: ${actualW}x${actualH}, 请求比例: 9:16`);
                                            console.warn(`[Tapnow] Veo: 强制使用请求的 9:16 比例，调整尺寸为: ${Math.round(h * (9 / 16))}x${h}`);
                                            // 如果后端返回了错误的比例，强制使用请求的比例
                                            finalW = Math.round(h * (9 / 16));
                                            finalH = h;
                                        } else {
                                            finalW = actualW;
                                            finalH = actualH;
                                        }
                                    } else {
                                        // 如果没有指定比例，使用实际尺寸
                                        finalW = actualW;
                                        finalH = actualH;
                                    }

                                    // 更新历史记录
                                    setHistory((prevHistory) => {
                                        return prevHistory.map((hItem) =>
                                            hItem.id === taskId
                                                ? { ...hItem, status: 'completed', progress: 100, url: videoUrl, width: finalW, height: finalH, durationMs, ratio: originalRatio || hItem.ratio }
                                                : hItem
                                        );
                                    });

                                    // 检查是否是分镜表的任务，如果是则回填到分镜表
                                    const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                                    if (storyboardTask) {
                                        updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                            video_url: videoUrl,
                                            status: 'done',
                                            durationCost: durationMs / 1000 // 以秒为单位保存耗时
                                        });
                                        // 清理任务映射
                                        storyboardTaskMapRef.current.delete(taskId);
                                    } else {
                                        // 更新预览窗口（非分镜表任务）
                                        if (sourceNodeId) {
                                            setTimeout(() => {
                                                updatePreviewFromTask(taskId, videoUrl, 'video', sourceNodeId);
                                            }, 0);
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('[Tapnow] Veo: 无法获取视频实际尺寸，使用请求尺寸', e);
                                // 如果无法获取实际尺寸，使用请求的尺寸并根据 aspect_ratio 调整
                                let fallbackW = w, fallbackH = h;
                                if (originalRatio === '16:9') {
                                    const aspectRatioValue = fallbackW / fallbackH;
                                    if (Math.abs(aspectRatioValue - 16 / 9) > 0.1) {
                                        fallbackH = Math.round(fallbackW / (16 / 9));
                                    }
                                } else if (originalRatio === '9:16') {
                                    const aspectRatioValue = fallbackW / fallbackH;
                                    if (Math.abs(aspectRatioValue - 9 / 16) > 0.1) {
                                        fallbackW = Math.round(fallbackH * (9 / 16));
                                    }
                                }

                                // 更新历史记录
                                setHistory((prevHistory) => {
                                    return prevHistory.map((hItem) =>
                                        hItem.id === taskId
                                            ? { ...hItem, status: 'completed', progress: 100, url: videoUrl, width: fallbackW, height: fallbackH, durationMs, ratio: originalRatio || hItem.ratio }
                                            : hItem
                                    );
                                });

                                // 检查是否是分镜表的任务，如果是则回填到分镜表
                                const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                                if (storyboardTask) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        video_url: videoUrl,
                                        status: 'done',
                                        durationCost: durationMs / 1000 // 以秒为单位保存耗时
                                    });
                                    // 清理任务映射
                                    storyboardTaskMapRef.current.delete(taskId);
                                } else {
                                    // 更新预览窗口（非分镜表任务）
                                    if (sourceNodeId) {
                                        setTimeout(() => {
                                            updatePreviewFromTask(taskId, videoUrl, 'video', sourceNodeId);
                                        }, 0);
                                    }
                                }
                            }
                        })();

                        // 先返回原始状态，等待异步操作完成后再更新
                        return prev;
                    });
                    return;
                }

                // 处理失败状态
                if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
                    let errorMsg = `任务失败: ${status}`;
                    if (failReason) {
                        try {
                            const reasonObj = typeof failReason === 'string' ? JSON.parse(failReason) : failReason;
                            errorMsg = reasonObj?.message || reasonObj?.code || failReason;
                        } catch (e) {
                            errorMsg = failReason || errorMsg;
                        }
                    }
                    console.error('[Tapnow] Veo: 任务失败', { status, failReason, errorMsg });
                    setHistory((prev) => prev.map((hItem) => hItem.id === taskId ? { ...hItem, status: 'failed', errorMsg } : hItem));

                    // V3.7.33：分镜任务失败时也保存执行时长
                    const endTime = Date.now();
                    // 需要从历史记录中查找 startTime
                    // 此处若不搜索 prev 就难以直接取得指定历史项，因此优先使用 storyboardTaskMapRef，否则用当前时间估算
                    // 若在状态更新器中查询历史记录过于复杂，可以在外部计算近似时长
                    // 注意：pollVeoJob 不像上方的 pollSoraJob 那样便于访问 historyMap
                    // 可以假定调用方传入了 startTime，也可以直接检查历史项
                    // 使用历史记录的函数式更新查找任务，但需要留意其中的副作用
                    // 当前简化处理：不读取历史记录时，无法精确计算 Veo 失败任务的时长
                    // 暂不在循环内部加入复杂查询
                    // 可先通过引用映射判断它是否为分镜任务
                    const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                    if (storyboardTask) {
                        // 对于 Veo/即梦，pollVeoJob 作用域中的本地 historyMap 缓存通常不会同步更新
                        // pollSoraJob 通过 `historyMap.get(taskId)` 使用了该映射，需要确认这里拿到的是引用还是状态
                        // historyMap 位于 App 组件作用域，通常是派生值或引用，而不是独立状态
                        // pollSoraJob 已使用 historyMap，因此这里按可访问处理
                        // 若无法访问，就不容易取得 startTime
                        // 回退方案无法得到精确时长，但界面仍需要持久化时长
                        // 若确实无法计算，只能先标记为失败且不展示时长
                        // 尝试读取 historyMap
                        const historyItem = historyMap.get(taskId);
                        const durationMs = historyItem ? (Date.now() - historyItem.startTime) : 0;

                        updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                            status: 'failed',
                            errorMsg,
                            durationCost: durationMs / 1000
                        });
                        storyboardTaskMapRef.current.delete(taskId);
                    }
                    return;
                }

                // 处理 NOT_START 状态：可能是任务还在队列中，继续等待
                if (status === 'NOT_START' || status === 'PENDING' || status === 'QUEUED') {
                    // 对于 NOT_START 状态，进度更新更慢一些，避免频繁更新
                    const currentProgress = parseInt(progress) || 0;
                    setHistory((prev) => prev.map((hItem) => hItem.id === taskId ? {
                        ...hItem,
                        status: 'generating',
                        progress: Math.max(5, currentProgress),
                        errorMsg: status === 'NOT_START' ? '任务已创建，等待处理中...' : undefined
                    } : hItem));
                    setTimeout(() => pollVeoJob(jobId, taskId, baseUrl, apiKey, w, h, attempt + 1), delayMs);
                    return;
                }

                // 其他状态（如 PROCESSING、GENERATING 等）：继续轮询
                const currentProgress = parseInt(progress) || Math.min(95, (attempt * 2) + 10);
                setHistory((prev) => prev.map((hItem) => hItem.id === taskId ? { ...hItem, status: 'generating', progress: currentProgress } : hItem));
                setTimeout(() => pollVeoJob(jobId, taskId, baseUrl, apiKey, w, h, attempt + 1), delayMs);
            })
            .catch((err) => setTimeout(() => pollVeoJob(jobId, taskId, baseUrl, apiKey, w, h, attempt + 1), delayMs));
    }

export function pollSoraJob({
    historyMap,
    pollSoraJob,
    setHistory,
    storyboardTaskMapRef,
    updatePreviewFromTask,
    updateShot,
}, jobId, taskId, baseUrl, apiKey, w, h, modelId = '', attempt = 0) {
        // V3.5.15 调试修复：jobId 为 null 或 undefined 时禁止轮询
        if (!jobId || jobId === 'null' || jobId === 'undefined') {
            console.error(`[Poll Error] Invalid JobId: ${jobId} for task ${taskId}`);
            setHistory(prev => prev.map(hItem => hItem.id === taskId ? {
                ...hItem,
                status: 'failed',
                errorMsg: 'Task failed: No Job ID returned',
                durationMs: Date.now() - (hItem.startTime || Date.now()) // 停止计时
            } : hItem));
            return;
        }

        // Sora 2 Pro 需要更长的等待时间（30分钟），其他模型保持原有设置（约6.5分钟）
        const maxAttempts = modelId === 'sora-2-pro' ? 360 : 80;
        const delayMs = 5000;

        if (attempt > maxAttempts) {
            setHistory(prev => prev.map(hItem => hItem.id === taskId ? { ...hItem, status: 'failed', errorMsg: 'Sora 轮询超时' } : hItem));

            // 检查是否是分镜表的任务，如果是则更新状态为 draft
            const storyboardTask = storyboardTaskMapRef.current.get(taskId);
            if (storyboardTask) {
                updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                    status: 'draft'
                });
                // 清理任务映射
                storyboardTaskMapRef.current.delete(taskId);
            }
            return;
        }

        const pollEndpoint = modelId?.includes('grok')
            ? `${baseUrl}/v2/videos/generations/${encodeURIComponent(jobId)}`
            : `${baseUrl}/v1/videos/${encodeURIComponent(jobId)}`;

        fetch(pollEndpoint, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
        })
            .then(resp => {
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
                }
                return resp.text();
            })
            .then((text) => {
                let data;
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    console.error('[Tapnow] Sora/Grok Poll JSON 解析失败:', err, text);
                    setTimeout(() => pollSoraJob(jobId, taskId, baseUrl, apiKey, w, h, modelId, attempt + 1), delayMs);
                    return;
                }

                const status = data?.data?.status || data?.status || data?.data?.task_status || data?.task_status;

                if (status === 'SUCCESS' || status === 'succeeded' || status === 'FINISHED' || status === 'completed') {
                    const videoUrl = data?.data?.output || data?.output || data?.data?.video_url || data?.data?.url || data?.video_url || data?.url;
                    if (!videoUrl) {
                        setHistory(prev => prev.map(hItem => hItem.id === taskId ? { ...hItem, status: 'failed', errorMsg: '未找到视频URL' } : hItem));
                        return;
                    }
                    const endTime = Date.now();
                    // 在更新 history 之前，先获取 sourceNodeId
                    const historyItem = historyMap.get(taskId);
                    const sourceNodeId = historyItem?.sourceNodeId;
                    const durationMs = endTime - (historyItem?.startTime || endTime);
                    // 使用 setHistory 的回调来确保获取最新的 historyItem
                    setHistory((prev) => {
                        const updated = prev.map((hItem) => hItem.id === taskId ? { ...hItem, status: 'completed', progress: 100, url: videoUrl, width: w, height: h, durationMs } : hItem);
                        // 检查是否是分镜表的任务，如果是则回填到分镜表
                        const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                        if (storyboardTask) {
                            updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                video_url: videoUrl,
                                status: 'done',
                                durationCost: durationMs / 1000 // 以秒为单位保存耗时
                            });
                            // 清理任务映射
                            storyboardTaskMapRef.current.delete(taskId);
                        } else {
                            // 更新预览窗口（非分镜表任务）
                            const updatedItem = updated.find(h => h.id === taskId);
                            if (updatedItem?.sourceNodeId) {
                                setTimeout(() => {
                                    updatePreviewFromTask(taskId, videoUrl, 'video', updatedItem.sourceNodeId);
                                }, 0);
                            } else {
                                console.warn('[Tapnow] Sora: 未找到 sourceNodeId', { taskId, updatedItem });
                            }
                        }
                        return updated;
                    });
                    return;
                }

                if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
                    setHistory(prev => prev.map(hItem => hItem.id === taskId ? { ...hItem, status: 'failed', errorMsg: `任务失败: ${status}` } : hItem));

                    // V3.7.33：分镜任务失败时也保存执行时长
                    const endTime = Date.now();
                    const historyItem = historyMap.get(taskId);
                    const durationMs = endTime - (historyItem?.startTime || endTime);

                    const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                    if (storyboardTask) {
                        updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                            status: 'failed',
                            errorMsg: `任务失败: ${status}`,
                            durationCost: durationMs / 1000
                        });
                        storyboardTaskMapRef.current.delete(taskId);
                    }
                    return;
                }

                setHistory(prev => prev.map(hItem => hItem.id === taskId ? { ...hItem, status: 'generating', progress: Math.min(95, (hItem.progress || 10) + 2) } : hItem));
                setTimeout(() => pollSoraJob(jobId, taskId, baseUrl, apiKey, w, h, modelId, attempt + 1), delayMs);
            })
            .catch(err => {
                console.error('[Tapnow] Sora/Grok Poll 请求失败:', err);
                // 如果是网络错误，继续重试；如果是其他错误，标记为失败
                if (attempt < maxAttempts - 5) {
                    // 前75次尝试继续重试
                    setTimeout(() => pollSoraJob(jobId, taskId, baseUrl, apiKey, w, h, modelId, attempt + 1), delayMs);
                } else {
                    // 最后5次尝试失败后，标记为失败
                    setHistory(prev => prev.map(hItem => hItem.id === taskId ? { ...hItem, status: 'failed', errorMsg: `轮询失败: ${err.message || '网络错误'}` } : hItem));
                }
            });
    }

export async function splitMidjourneyImage({}, imageUrl, ratio = '1:1') {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            // 设置超时，防止图片加载卡死
            const timeout = setTimeout(() => {
                reject(new Error('图片加载超时'));
            }, 30000); // 30秒超时

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Midjourney返回的是2x2网格，每张图是原图的1/4
                    // 计算每张图的尺寸（使用Math.floor确保整数像素）
                    const singleWidth = Math.floor(img.width / 2);
                    const singleHeight = Math.floor(img.height / 2);

                    // 计算实际每张图的比例
                    const actualRatio = singleWidth / singleHeight;

                    const images = [];

                    // 切割4张图：左上、右上、左下、右下
                    for (let row = 0; row < 2; row++) {
                        for (let col = 0; col < 2; col++) {
                            // 计算裁剪区域（确保不超出边界）
                            const cropX = Math.max(0, Math.min(col * singleWidth, img.width - singleWidth));
                            const cropY = Math.max(0, Math.min(row * singleHeight, img.height - singleHeight));
                            const cropW = Math.min(singleWidth, img.width - cropX);
                            const cropH = Math.min(singleHeight, img.height - cropY);

                            // 设置canvas尺寸
                            canvas.width = cropW;
                            canvas.height = cropH;

                            // 清空canvas并设置白色背景（防止透明区域）
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, cropW, cropH);

                            // 提取图片区域
                            ctx.drawImage(
                                img,
                                cropX, cropY, cropW, cropH,
                                0, 0, cropW, cropH
                            );

                            // 使用PNG格式，保持图片质量
                            const dataUrl = canvas.toDataURL('image/png');
                            images.push({
                                url: dataUrl,
                                width: cropW,
                                height: cropH,
                                ratio: actualRatio
                            });
                        }
                    }

                    resolve(images);
                } catch (error) {
                    console.error('Midjourney: 切割图片时出错:', error);
                    reject(error);
                }
            };

            img.onerror = (e) => {
                clearTimeout(timeout);
                console.error('Midjourney: Failed to load image for splitting:', e);
                reject(new Error('图片加载失败'));
            };

            img.src = imageUrl;
        });
    }

export function pollImageTask({
    consumeImageBatchFailure,
    consumeImageBatchSuccess,
    normalizeImageUrls,
    pollImageTask,
    setHistory,
    storyboardTaskMapRef,
    updatePreviewFromTask,
    updateShot,
}, taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, attempt = 0, isBananaModel = false) {
        // banana模型使用800秒超时（160次 * 5秒），其他模型使用25分钟（300次 * 5秒）
        const maxAttempts = isBananaModel ? 160 : 300;
        const baseDelayMs = 5000; // 基础轮询间隔5秒
        const delayMs = baseDelayMs;
        const isLikelyImageValue = (value) => {
            if (!value || typeof value !== 'string') return false;
            const trimmed = value.trim();
            if (!trimmed) return false;
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) return true;
            if (LocalImageManager?.isImageId && LocalImageManager.isImageId(trimmed)) return true;
            const base64Like = /^[A-Za-z0-9+/=_-]+$/.test(trimmed);
            return base64Like && trimmed.length > 64;
        };

        if (attempt > maxAttempts) {
            const timeoutSeconds = isBananaModel ? 800 : 1500;
            const timeoutMsg = `图像生成轮询超时（已等待${timeoutSeconds}秒）`;
            setHistory((prev) => prev.map((hItem) => {
                if (hItem.id !== taskId) return hItem;
                const durationMs = Date.now() - (hItem.startTime || Date.now());
                const batchUpdated = applyBatchFailureToHistoryItem(
                    hItem,
                    taskId,
                    timeoutMsg,
                    durationMs,
                    consumeImageBatchFailure
                );
                return batchUpdated || { ...hItem, status: 'failed', errorMsg: timeoutMsg, durationMs };
            }));
            return;
        }

        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        const pollUrl = `${cleanBaseUrl}/v1/images/tasks/${taskIdForPoll}`;

        fetch(pollUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
        })
            .then(async (resp) => {
                if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
                    const reason = resp.status === 402 ? '积分耗尽 (402)' : (resp.status === 401 ? '认证失效 (401)' : '访问被拒绝 (403)');
                    setHistory((prev) => prev.map((hItem) => {
                        if (hItem.id !== taskId) return hItem;
                        const durationMs = Date.now() - (hItem.startTime || Date.now());
                        const errorMsg = `图像轮询失败: ${reason}`;
                        const batchUpdated = applyBatchFailureToHistoryItem(
                            hItem,
                            taskId,
                            errorMsg,
                            durationMs,
                            consumeImageBatchFailure
                        );
                        if (batchUpdated) {
                            if (batchUpdated.status === 'failed') {
                                const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                                if (storyboardTask?.isImageMode) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        status: 'failed',
                                        errorMsg,
                                        durationCost: durationMs / 1000
                                    });
                                    storyboardTaskMapRef.current.delete(taskId);
                                }
                            }
                            return batchUpdated;
                        }
                        const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                        if (storyboardTask?.isImageMode) {
                            updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                status: 'failed',
                                errorMsg,
                                durationCost: durationMs / 1000
                            });
                            storyboardTaskMapRef.current.delete(taskId);
                        }
                        return { ...hItem, status: 'failed', errorMsg };
                    }));
                    return;
                }
                const text = await resp.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    console.error('[Async Image] Failed to parse response:', err);
                    setTimeout(() => pollImageTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, attempt + 1, isBananaModel), delayMs);
                    return;
                }


                // 根据API规范，响应格式可能有多种：
                // 1. { code, message, data: { status, images: [...] } }
                // 2. { status: "SUCCESS", data: { data: [{ url: "..." }] } }
                // 3. { task_id: "...", status: "SUCCESS", data: { data: [{ url: "..." }] } }
                const status = (data?.data?.status || data?.status || '').toUpperCase();
                console.log('[Async Image] 提取的状态:', status, '原始数据:', {
                    hasData: !!data?.data,
                    hasDataData: !!data?.data?.data,
                    hasDataStatus: !!data?.data?.status,
                    hasStatus: !!data?.status,
                    dataKeys: data ? Object.keys(data) : []
                });

                let images = [];

                // 尝试多种方式提取图片数据（按优先级顺序）
                // 方式1：data.data.data（嵌套格式，最常见）
                if (data?.data?.data && Array.isArray(data.data.data) && data.data.data.length > 0) {
                    images = data.data.data;
                }
                // 方式2：data.data.images
                else if (data?.data?.images && Array.isArray(data.data.images) && data.data.images.length > 0) {
                    images = data.data.images;
                }
                // 方式3：data.images
                else if (data?.images && Array.isArray(data.images) && data.images.length > 0) {
                    images = data.images;
                }
                // 方式4：data.data（标准OpenAI格式）
                else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
                    images = data.data;
                }

                // 如果还是没有找到图片，尝试从revised_prompt中提取URL（备用方案）
                if (images.length === 0) {
                    // 尝试从data.data.data[0].revised_prompt中提取
                    if (data?.data?.data && Array.isArray(data.data.data) && data.data.data.length > 0) {
                        const firstItem = data.data.data[0];
                        if (firstItem?.revised_prompt) {
                            const urlMatch = firstItem.revised_prompt.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
                            if (urlMatch && urlMatch[1]) {
                                images = [{ url: urlMatch[1] }];
                            }
                        }
                    }
                    // 尝试从data.data.revised_prompt中提取
                    if (images.length === 0 && data?.data?.revised_prompt) {
                        const urlMatch = data.data.revised_prompt.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
                        if (urlMatch && urlMatch[1]) {
                            images = [{ url: urlMatch[1] }];
                        }
                    }
                    // 最后尝试：如果data.data.data存在但images为空，可能是数据结构问题，直接使用data.data.data
                    if (images.length === 0 && data?.data?.data && Array.isArray(data.data.data) && data.data.data.length > 0) {
                        // 检查每个元素是否有url字段
                        const itemsWithUrl = data.data.data.filter(item => item?.url || item?.image_url || item?.imageUrl);
                        if (itemsWithUrl.length > 0) {
                            images = itemsWithUrl;
                        }
                    }

                    // 如果任务状态是SUCCESS但还没找到图片，立即执行深度搜索（不等待后续处理）
                    if (images.length === 0 && (status === 'COMPLETED' || status === 'SUCCESS' || status === 'FINISHED' || status === 'DONE')) {
                        // 优化后的深度搜索函数：优先检查常见路径，减少递归深度
                        const deepSearchForUrl = (obj, depth = 0, visited = new WeakSet()) => {
                            if (depth > 5) return null; // 防止无限递归
                            if (!obj || typeof obj !== 'object') return null;

                            // 防止循环引用
                            if (visited.has(obj)) return null;
                            visited.add(obj);

                            // 优先检查当前对象的常见字段（避免不必要的递归）
                            const urlFields = ['url', 'image_url', 'imageUrl', 'image', 'src', 'link', 'href'];
                            for (const field of urlFields) {
                                if (isLikelyImageValue(obj[field])) {
                                    return obj[field];
                                }
                            }

                            // 如果是数组，优先检查第一个元素
                            if (Array.isArray(obj) && obj.length > 0) {
                                const result = deepSearchForUrl(obj[0], depth + 1, visited);
                                if (result) return result;
                            }

                            // 递归搜索所有属性（但跳过已检查的常见字段）
                            for (const key in obj) {
                                if (obj.hasOwnProperty(key) && !urlFields.includes(key)) {
                                    const result = deepSearchForUrl(obj[key], depth + 1, visited);
                                    if (result) return result;
                                }
                            }

                            return null;
                        };

                        const foundUrl = deepSearchForUrl(data);
                        if (foundUrl) {
                            images = [{ url: foundUrl }];
                        } else {
                            console.warn('[Async Image] 深度搜索未找到图片URL，响应数据结构:', JSON.stringify(data, null, 2).substring(0, 500));
                        }
                    }
                }

                const errorMsg = data?.message || data?.error || data?.fail_reason || '';
                const completedStatuses = new Set(['COMPLETED', 'SUCCESS', 'FINISHED', 'DONE']);
                const failedStatuses = new Set(['FAILED', 'ERROR', 'CANCELLED', 'FAILURE']);
                const isCompletedStatus = completedStatuses.has(status);
                const isFailedStatus = failedStatuses.has(status);
                let rawImageUrls = [];
                let resolvedImageUrls = [];
                if (isCompletedStatus && images && images.length > 0) {
                    rawImageUrls = images.flatMap((img) => {
                        if (!img) return [];
                        if (typeof img === 'string') return [img];
                        const candidates = [
                            img.url,
                            img.image_url,
                            img.imageUrl,
                            img.object_url,
                            img.objectUrl,
                            img.path,
                            img.uri,
                            img.file_uri,
                            img.fileUri,
                            img.b64_json,
                            img.base64,
                            img.data
                        ];
                        return candidates.filter(Boolean);
                    });
                    if (rawImageUrls.length > 0) {
                        try {
                            resolvedImageUrls = await normalizeImageUrls(rawImageUrls);
                        } catch (e) {
                            resolvedImageUrls = [];
                        }
                        if (resolvedImageUrls.length === 0) resolvedImageUrls = rawImageUrls;
                    }
                }

                // 更新历史记录
                setHistory((prev) => {
                    const updated = prev.map((hItem) => {
                        if (hItem.id !== taskId) return hItem;

                        // 保存sourceNodeId，用于后续更新预览窗口
                        const savedSourceNodeId = hItem.sourceNodeId || sourceNodeId;

                        // 支持多种成功状态值
                        if (isCompletedStatus) {
                            if (resolvedImageUrls.length > 0) {
                                // 优先使用后端返回的实际花费时间（如果存在）
                                // 后端可能返回的字段：duration, cost_time, elapsed_time, time_cost, spent_time 等（单位可能是秒或毫秒）
                                let durationMs = null;
                                const backendDuration = data?.data?.duration || data?.data?.cost_time || data?.data?.elapsed_time ||
                                    data?.data?.time_cost || data?.data?.spent_time || data?.duration ||
                                    data?.cost_time || data?.elapsed_time || data?.time_cost || data?.spent_time;

                                if (backendDuration !== null && backendDuration !== undefined) {
                                    // 如果后端返回的是秒（数字<10000），转换为毫秒；否则认为是毫秒
                                    if (typeof backendDuration === 'number') {
                                        durationMs = backendDuration < 10000 ? backendDuration * 1000 : backendDuration;
                                    } else if (typeof backendDuration === 'string') {
                                        // 尝试解析字符串格式的时间（如 "49.0s", "107.0s"）
                                        const match = backendDuration.match(/(\d+\.?\d*)\s*(s|ms|秒|毫秒)/i);
                                        if (match) {
                                            const value = parseFloat(match[1]);
                                            const unit = match[2].toLowerCase();
                                            durationMs = (unit === 's' || unit === '秒') ? value * 1000 : value;
                                        } else {
                                            const parsed = parseFloat(backendDuration);
                                            if (!isNaN(parsed)) {
                                                durationMs = parsed < 10000 ? parsed * 1000 : parsed;
                                            }
                                        }
                                    }
                                }

                                // 如果后端没有返回时间，使用前端计算的时间
                                if (durationMs === null) {
                                    const endTime = Date.now();
                                    durationMs = endTime - (hItem.startTime || endTime);
                                }

                                const batchState = consumeImageBatchSuccess(taskId, hItem, resolvedImageUrls);
                                const mergedImageUrls = batchState.urls.length > 0 ? batchState.urls : resolvedImageUrls;
                                const primaryUrl = mergedImageUrls[0];

                                console.log('[Async Image] 任务完成，准备更新UI:', {
                                    taskId,
                                    url: primaryUrl,
                                    sourceNodeId: savedSourceNodeId,
                                    imageCount: mergedImageUrls.length,
                                    durationMs,
                                    backendDuration,
                                    frontendCalculated: durationMs === null ? null : (Date.now() - (hItem.startTime || Date.now()))
                                });

                                // V3.6.1: 检查是否是分镜表的图片任务
                                const hasStoryboardTask = storyboardTaskMapRef.current.has(taskId);
                                if (hasStoryboardTask) {
                                    const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                                    if (storyboardTask && storyboardTask.isImageMode) {
                                        // V3.7.29: 传递所有图片，与同步生成保持一致
                                        updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                            output_images: mergedImageUrls, // V3.7.29: 所有图片
                                            output_url: primaryUrl,   // 兼容旧逻辑
                                            selectedImageIndex: 0,    // 默认选中第一张
                                            outputEnabled: false,     // 用户手动选择满意的
                                            status: 'done',
                                            durationCost: durationMs / 1000
                                        });
                                        // 清理任务映射
                                        storyboardTaskMapRef.current.delete(taskId);
                                    } else {
                                        console.warn('[V3.7.30 Async Debug] 分镜表任务未找到或不是图片模式，无法回填');
                                    }
                                }

                                const fallbackStoryboard = !hasStoryboardTask
                                    ? parseStoryboardSourceNodeId(savedSourceNodeId || hItem.sourceNodeId)
                                    : null;
                                if (fallbackStoryboard?.isImageMode) {
                                    updateShot(fallbackStoryboard.nodeId, fallbackStoryboard.shotId, {
                                        output_images: mergedImageUrls,
                                        output_url: primaryUrl,
                                        selectedImageIndex: 0,
                                        outputEnabled: false,
                                        status: 'done',
                                        durationCost: durationMs / 1000
                                    });
                                }

                                // 更新预览窗口（立即执行，不等待）
                                // 即使savedSourceNodeId为空，也尝试调用updatePreviewFromTask，它会从history中查找
                                const nodeIdToUse = savedSourceNodeId || hItem.sourceNodeId;
                                console.log('[Async Image] 准备更新预览窗口', {
                                    taskId,
                                    url: primaryUrl,
                                    sourceNodeId: nodeIdToUse,
                                    savedSourceNodeId,
                                    hItemSourceNodeId: hItem.sourceNodeId,
                                    imageCount: mergedImageUrls.length
                                });
                                // 使用requestAnimationFrame确保在下一个渲染周期更新，但比setTimeout更快
                                requestAnimationFrame(() => {
                                    updatePreviewFromTask(taskId, primaryUrl, 'image', nodeIdToUse, mergedImageUrls.length > 1 ? mergedImageUrls : null);
                                });

                                return {
                                    ...hItem,
                                    status: batchState.status,
                                    progress: batchState.progress,
                                    url: primaryUrl,
                                    width: w,
                                    height: h,
                                    durationMs,
                                    errorMsg: null,
                                    sourceNodeId: savedSourceNodeId || hItem.sourceNodeId, // 确保sourceNodeId被保留
                                    output_images: mergedImageUrls,
                                    ...(mergedImageUrls.length > 1 ? { mjImages: mergedImageUrls, selectedMjImageIndex: 0 } : {})
                                };
                            }

                            // 如果所有方法都失败，标记为失败
                            const completedWithoutImageMsg = errorMsg || '任务完成但未返回图片，请检查控制台日志查看详细响应数据';
                            const durationMs = Date.now() - (hItem.startTime || Date.now());
                            const batchUpdated = applyBatchFailureToHistoryItem(
                                hItem,
                                taskId,
                                completedWithoutImageMsg,
                                durationMs,
                                consumeImageBatchFailure
                            );
                            return batchUpdated || {
                                ...hItem,
                                status: 'failed',
                                errorMsg: completedWithoutImageMsg,
                                durationMs
                            };
                        }

                        if (isFailedStatus) {
                            // 任务失败
                            // V3.7.33：处理分镜任务失败时的执行时长
                            const endTime = Date.now();
                            const durationMs = endTime - (hItem.startTime || endTime);
                            const failedStatusMsg = errorMsg || `任务失败: ${status}`;
                            const batchUpdated = applyBatchFailureToHistoryItem(
                                hItem,
                                taskId,
                                failedStatusMsg,
                                durationMs,
                                consumeImageBatchFailure
                            );
                            if (batchUpdated) {
                                if (batchUpdated.status === 'failed') {
                                    const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                                    if (storyboardTask) {
                                        updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                            status: 'failed',
                                            errorMsg: failedStatusMsg,
                                            durationCost: durationMs / 1000
                                        });
                                        storyboardTaskMapRef.current.delete(taskId);
                                    }
                                }
                                return batchUpdated;
                            }
                            if (storyboardTaskMapRef.current.has(taskId)) {
                                const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                                updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                    status: 'failed',
                                    errorMsg: failedStatusMsg,
                                    durationCost: durationMs / 1000
                                });
                                storyboardTaskMapRef.current.delete(taskId);
                            }

                            return {
                                ...hItem,
                                status: 'failed',
                                errorMsg: failedStatusMsg,
                                durationMs
                            };
                        }

                        if (status === 'PENDING' || status === 'PROCESSING' || status === 'GENERATING' || status === 'IN_PROGRESS' || status === 'RUNNING') {
                            // 任务进行中，根据轮询次数和进度信息计算进度
                            let progress = 10 + (attempt * 2); // 基础进度

                            // 如果有进度百分比，使用实际进度
                            if (data?.data?.progress) {
                                const progressStr = String(data.data.progress);
                                if (progressStr.includes('%')) {
                                    progress = parseInt(progressStr.replace('%', ''), 10) || progress;
                                } else if (typeof data.data.progress === 'number') {
                                    progress = data.data.progress;
                                }
                            } else if (data?.progress) {
                                const progressStr = String(data.progress);
                                if (progressStr.includes('%')) {
                                    progress = parseInt(progressStr.replace('%', ''), 10) || progress;
                                } else if (typeof data.progress === 'number') {
                                    progress = data.progress;
                                }
                            }

                            progress = Math.min(95, Math.max(10, progress)); // 限制在10-95%之间

                            return {
                                ...hItem,
                                status: 'generating',
                                progress,
                                errorMsg: null
                            };
                        }

                        // 未知状态，继续轮询，但进度缓慢增加
                        const progress = Math.min(90, 10 + (attempt * 1.5));
                        return {
                            ...hItem,
                            status: 'generating',
                            progress,
                            errorMsg: null
                        };
                    });

                    // 获取更新后的进度，用于动态调整轮询间隔
                    const updatedItem = updated.find(h => h.id === taskId);
                    const currentProgress = updatedItem?.progress || 10;

                    return updated;
                });

                // 如果任务未完成，继续轮询
                // 动态调整轮询间隔：任务接近完成时缩短间隔，确保能快速检测到完成状态
                const currentStatus = (data?.data?.status || data?.status || '').toUpperCase();
                const isCompleted = currentStatus === 'COMPLETED' || currentStatus === 'SUCCESS' || currentStatus === 'FINISHED' || currentStatus === 'DONE';
                const isFailed = currentStatus === 'FAILED' || currentStatus === 'ERROR' || currentStatus === 'CANCELLED' || currentStatus === 'FAILURE';

                if (!isCompleted && !isFailed) {
                    // 动态轮询间隔策略：
                    // 1. 任务进度>90%：1秒间隔（快速检测完成）
                    // 2. 任务进度>70%：2秒间隔（加快检测）
                    // 3. 任务进度>50%：3秒间隔（中等速度）
                    // 4. 任务进行中（<50%）：5秒间隔（基础间隔）
                    // 5. 长时间运行（>50次轮询且非banana模型）：10秒间隔（节省资源）

                    // 从更新后的history中获取最新进度来计算延迟
                    setHistory((prev) => {
                        const latestItem = prev.find(h => h.id === taskId);
                        const progress = latestItem?.progress || 10;

                        let adjustedDelay = baseDelayMs;
                        if (progress >= 90) {
                            adjustedDelay = 1000; // 1秒：任务接近完成，快速检测
                        } else if (progress >= 70) {
                            adjustedDelay = 2000; // 2秒：任务进行中后期，加快检测
                        } else if (progress >= 50) {
                            adjustedDelay = 3000; // 3秒：任务进行中，中等速度
                        } else if (attempt > 50 && !isBananaModel) {
                            adjustedDelay = 10000; // 10秒：长时间运行，节省资源
                        }

                        // 在回调外执行setTimeout，避免闭包问题
                        setTimeout(() => {
                            pollImageTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, attempt + 1, isBananaModel);
                        }, adjustedDelay);

                        return prev; // 不修改，只是读取
                    });
                }
            })
            .catch((err) => {
                console.error('[Async Image] Poll error:', err);
                setTimeout(() => pollImageTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, attempt + 1, isBananaModel), baseDelayMs);
            });
    }

export function buildAsyncRequest({
    buildProxyUrl,
}, asyncRequest, vars, providerKey) {
        if (!asyncRequest || !asyncRequest.endpoint) return null;
        const templateRequest = buildRequestFromTemplate(asyncRequest, vars, { bodyType: asyncRequest.bodyType });
        if (!templateRequest || !templateRequest.url) return null;
        const providerBaseUrl = (vars?.provider?.baseUrl || '').replace(/\/+$/, '');
        let fullUrl = templateRequest.url;
        if (!/^https?:/i.test(fullUrl)) {
            fullUrl = `${providerBaseUrl}${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
        }
        fullUrl = buildProxyUrl(fullUrl, providerKey);
        const headers = templateRequest.headers && typeof templateRequest.headers === 'object'
            ? { ...templateRequest.headers }
            : {};
        if (vars?.provider?.key && !headers.Authorization && !headers.authorization) {
            headers.Authorization = `Bearer ${vars.provider.key}`;
        }
        const method = (templateRequest.method || asyncRequest.method || 'GET').toString().toUpperCase();
        let body = templateRequest.body;
        let bodyType = (templateRequest.bodyType || asyncRequest.bodyType || 'json').toString().toLowerCase();
        if (bodyType === 'multipart') {
            body = coerceFormDataFromObject(body);
            delete headers['Content-Type'];
            delete headers['content-type'];
        } else if (bodyType === 'raw') {
            if (typeof body !== 'string') {
                body = JSON.stringify(body ?? {});
            }
        } else if (bodyType === 'json') {
            if (!(body instanceof FormData) && typeof body !== 'string') {
                body = JSON.stringify(body ?? {});
            }
            if (!headers['Content-Type'] && !headers['content-type']) {
                headers['Content-Type'] = 'application/json';
            }
        }
        if (method === 'GET' || method === 'HEAD') {
            body = undefined;
        }
        return {
            url: fullUrl,
            method,
            headers,
            body
        };
    }

export function pollAsyncTask({
    buildAsyncRequest,
    consumeImageBatchFailure,
    consumeImageBatchSuccess,
    normalizeImageUrls,
    pollAsyncTask,
    setHistory,
    storyboardTaskMapRef,
    updatePreviewFromTask,
    updateShot,
}, taskId, requestId, asyncConfig, baseVars, w, h, sourceNodeId, providerKey, attempt = 0) {
        const maxAttempts = Number.isFinite(asyncConfig?.maxAttempts) ? asyncConfig.maxAttempts : 300;
        const delayMs = Number.isFinite(asyncConfig?.pollIntervalMs) ? asyncConfig.pollIntervalMs : 3000;
        if (attempt > maxAttempts) {
            const timeoutMsg = '异步任务轮询超时';
            setHistory((prev) => prev.map((hItem) => {
                if (hItem.id !== taskId) return hItem;
                const durationMs = Date.now() - (hItem.startTime || Date.now());
                const batchUpdated = applyBatchFailureToHistoryItem(
                    hItem,
                    taskId,
                    timeoutMsg,
                    durationMs,
                    consumeImageBatchFailure
                );
                return batchUpdated || { ...hItem, status: 'failed', errorMsg: timeoutMsg, durationMs };
            }));
            return;
        }
        if (!asyncConfig?.statusRequest?.endpoint) {
            const missingStatusEndpointMsg = '异步任务未配置状态查询接口';
            setHistory((prev) => prev.map((hItem) => {
                if (hItem.id !== taskId) return hItem;
                const durationMs = Date.now() - (hItem.startTime || Date.now());
                const batchUpdated = applyBatchFailureToHistoryItem(
                    hItem,
                    taskId,
                    missingStatusEndpointMsg,
                    durationMs,
                    consumeImageBatchFailure
                );
                return batchUpdated || { ...hItem, status: 'failed', errorMsg: missingStatusEndpointMsg, durationMs };
            }));
            return;
        }
        const vars = { ...baseVars, requestId };
        const statusReq = buildAsyncRequest(asyncConfig.statusRequest, vars, providerKey);
        if (!statusReq) {
            const statusRequestBuildFailedMsg = '异步任务状态请求构建失败';
            setHistory((prev) => prev.map((hItem) => {
                if (hItem.id !== taskId) return hItem;
                const durationMs = Date.now() - (hItem.startTime || Date.now());
                const batchUpdated = applyBatchFailureToHistoryItem(
                    hItem,
                    taskId,
                    statusRequestBuildFailedMsg,
                    durationMs,
                    consumeImageBatchFailure
                );
                return batchUpdated || { ...hItem, status: 'failed', errorMsg: statusRequestBuildFailedMsg, durationMs };
            }));
            return;
        }

        fetch(statusReq.url, { method: statusReq.method, headers: statusReq.headers, body: statusReq.body })
            .then(async (resp) => {
                if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
                    const reason = resp.status === 402 ? '积分耗尽 (402)' : (resp.status === 401 ? '认证失效 (401)' : '访问被拒绝 (403)');
                    const errorMsg = `异步任务轮询失败: ${reason}`;
                    setHistory((prev) => prev.map((hItem) => {
                        if (hItem.id !== taskId) return hItem;
                        const durationMs = Date.now() - (hItem.startTime || Date.now());
                        const batchUpdated = applyBatchFailureToHistoryItem(
                            hItem,
                            taskId,
                            errorMsg,
                            durationMs,
                            consumeImageBatchFailure
                        );
                        if (batchUpdated) {
                            if (batchUpdated.status === 'failed') {
                                const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                                if (storyboardTask?.isImageMode) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        status: 'failed',
                                        errorMsg,
                                        durationCost: durationMs / 1000
                                    });
                                    storyboardTaskMapRef.current.delete(taskId);
                                }
                            }
                            return batchUpdated;
                        }
                        const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                        if (storyboardTask?.isImageMode) {
                            updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                status: 'failed',
                                errorMsg,
                                durationCost: durationMs / 1000
                            });
                            storyboardTaskMapRef.current.delete(taskId);
                        }
                        return { ...hItem, status: 'failed', errorMsg };
                    }));
                    return;
                }
                const text = await resp.text();
                let statusData;
                try {
                    statusData = text ? JSON.parse(text) : {};
                } catch (err) {
                    console.warn('[Async Task] 状态响应解析失败', err);
                    setTimeout(() => pollAsyncTask(taskId, requestId, asyncConfig, baseVars, w, h, sourceNodeId, providerKey, attempt + 1), delayMs);
                    return;
                }

                const statusRaw = getValueByPath(statusData, asyncConfig.statusPath);
                const statusValue = normalizeAsyncStatusValue(statusRaw);
                const isCompleted = asyncConfig.successValues.includes(statusValue);
                const isFailed = asyncConfig.failureValues.includes(statusValue);
                const errorMessage = asyncConfig.errorPath ? (getValueByPath(statusData, asyncConfig.errorPath) || '') : '';

                if (isCompleted) {
                    let outputsData = statusData;
                    if (asyncConfig.outputsRequest?.endpoint) {
                        const outputsReq = buildAsyncRequest(asyncConfig.outputsRequest, vars, providerKey);
                        if (!outputsReq) {
                            throw new Error('异步任务结果请求构建失败');
                        }
                        const outputsResp = await fetch(outputsReq.url, { method: outputsReq.method, headers: outputsReq.headers, body: outputsReq.body });
                        if (outputsResp.status === 401 || outputsResp.status === 402 || outputsResp.status === 403) {
                            const reason = outputsResp.status === 402 ? '积分耗尽 (402)' : (outputsResp.status === 401 ? '认证失效 (401)' : '访问被拒绝 (403)');
                            const errorMsg = `异步任务结果查询失败: ${reason}`;
                            setHistory((prev) => prev.map((hItem) => {
                                if (hItem.id !== taskId) return hItem;
                                const durationMs = Date.now() - (hItem.startTime || Date.now());
                                const batchUpdated = applyBatchFailureToHistoryItem(
                                    hItem,
                                    taskId,
                                    errorMsg,
                                    durationMs,
                                    consumeImageBatchFailure
                                );
                                if (batchUpdated) {
                                    if (batchUpdated.status === 'failed') {
                                        const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                                        if (storyboardTask?.isImageMode) {
                                            updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                                status: 'failed',
                                                errorMsg,
                                                durationCost: durationMs / 1000
                                            });
                                            storyboardTaskMapRef.current.delete(taskId);
                                        }
                                    }
                                    return batchUpdated;
                                }
                                const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                                if (storyboardTask?.isImageMode) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        status: 'failed',
                                        errorMsg,
                                        durationCost: durationMs / 1000
                                    });
                                    storyboardTaskMapRef.current.delete(taskId);
                                }
                                return { ...hItem, status: 'failed', errorMsg };
                            }));
                            return;
                        }
                        const outputsText = await outputsResp.text();
                        outputsData = outputsText ? JSON.parse(outputsText) : {};
                    }
                    let outputsValue = asyncConfig.outputsPath ? getValueByPath(outputsData, asyncConfig.outputsPath) : outputsData;
                    let imageUrls = extractAsyncOutputUrls(outputsValue, asyncConfig.outputsUrlField);
                    if (imageUrls.length === 0) {
                        const fallbackOutputs = getValueByPathAny(outputsData, ['data.outputs', 'outputs', 'data.images', 'images']);
                        if (fallbackOutputs && fallbackOutputs !== outputsValue) {
                            outputsValue = fallbackOutputs;
                            imageUrls = extractAsyncOutputUrls(outputsValue, asyncConfig.outputsUrlField);
                        }
                    }

                    if (imageUrls.length === 0) {
                        const deepCandidates = collectDeepImageValues(outputsData);
                        if (deepCandidates.length > 0) {
                            imageUrls = deepCandidates;
                        }
                    }

                    if (imageUrls.length === 0) {
                        throw new Error('异步任务未返回结果');
                    }
                    let resolvedImageUrls = [];
                    try {
                        resolvedImageUrls = await normalizeImageUrls(imageUrls);
                    } catch (e) {
                        resolvedImageUrls = [];
                    }
                    if (resolvedImageUrls.length === 0) resolvedImageUrls = imageUrls;

                    setHistory((prev) => {
                        const updated = prev.map((hItem) => {
                            if (hItem.id !== taskId) return hItem;
                            const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                            const hasStoryboardTask = !!storyboardTask;
                            const endTime = Date.now();
                            const durationMs = endTime - (hItem.startTime || endTime);
                            const batchState = consumeImageBatchSuccess(taskId, hItem, resolvedImageUrls);
                            const mergedImageUrls = batchState.urls.length > 0 ? batchState.urls : resolvedImageUrls;
                            const primaryUrl = mergedImageUrls[0];

                            if (hasStoryboardTask) {
                                if (storyboardTask.isImageMode) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        output_images: mergedImageUrls,
                                        output_url: primaryUrl,
                                        selectedImageIndex: 0,
                                        outputEnabled: false,
                                        status: 'done',
                                        durationCost: durationMs / 1000
                                    });
                                    storyboardTaskMapRef.current.delete(taskId);
                                }
                            } else {
                                const fallbackStoryboard = parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                                if (fallbackStoryboard?.isImageMode) {
                                    updateShot(fallbackStoryboard.nodeId, fallbackStoryboard.shotId, {
                                        output_images: mergedImageUrls,
                                        output_url: primaryUrl,
                                        selectedImageIndex: 0,
                                        outputEnabled: false,
                                        status: 'done',
                                        durationCost: durationMs / 1000
                                    });
                                }
                            }

                            const updatedItem = {
                                ...hItem,
                                status: batchState.status,
                                progress: batchState.progress,
                                url: primaryUrl,
                                width: w,
                                height: h,
                                durationMs,
                                output_images: mergedImageUrls,
                                mjImages: mergedImageUrls.length > 1 ? mergedImageUrls : null,
                                selectedMjImageIndex: 0
                            };

                            if (updatedItem.sourceNodeId && !hasStoryboardTask) {
                                setTimeout(() => {
                                    updatePreviewFromTask(taskId, primaryUrl, 'image', updatedItem.sourceNodeId, updatedItem.mjImages);
                                }, 0);
                            }
                            return updatedItem;
                        });
                        return updated;
                    });
                    return;
                }

                if (isFailed) {
                    setHistory((prev) => prev.map((hItem) => {
                        if (hItem.id !== taskId) return hItem;
                        const durationMs = Date.now() - (hItem.startTime || Date.now());
                        const errorMsg = errorMessage || `任务失败: ${statusValue || 'FAILED'}`;
                        const batchUpdated = applyBatchFailureToHistoryItem(
                            hItem,
                            taskId,
                            errorMsg,
                            durationMs,
                            consumeImageBatchFailure
                        );
                        if (batchUpdated) {
                            if (batchUpdated.status === 'failed') {
                                const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                                if (storyboardTask?.isImageMode) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        status: 'failed',
                                        errorMsg,
                                        durationCost: durationMs / 1000
                                    });
                                    storyboardTaskMapRef.current.delete(taskId);
                                }
                            }
                            return batchUpdated;
                        }
                        const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                        if (storyboardTask?.isImageMode) {
                            updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                status: 'failed',
                                errorMsg,
                                durationCost: durationMs / 1000
                            });
                            storyboardTaskMapRef.current.delete(taskId);
                        }
                        return { ...hItem, status: 'failed', errorMsg };
                    }));
                    return;
                }

                setHistory((prev) => prev.map((hItem) => {
                    if (hItem.id !== taskId) return hItem;
                    const progress = Math.min(95, Math.max(10, 10 + attempt * 2));
                    return { ...hItem, status: 'generating', progress, errorMsg: null };
                }));

                setTimeout(() => pollAsyncTask(taskId, requestId, asyncConfig, baseVars, w, h, sourceNodeId, providerKey, attempt + 1), delayMs);
            })
            .catch((err) => {
                console.error('[Async Task] Poll error:', err);
                setTimeout(() => pollAsyncTask(taskId, requestId, asyncConfig, baseVars, w, h, sourceNodeId, providerKey, attempt + 1), delayMs);
            });
    }

export function pollModelScopeTask({
    buildProxyUrl,
    consumeImageBatchFailure,
    consumeImageBatchSuccess,
    normalizeImageUrls,
    pollModelScopeTask,
    setHistory,
    storyboardTaskMapRef,
    updatePreviewFromTask,
    updateShot,
}, taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, providerKey, useProxy, attempt = 0) {
        const maxAttempts = 300;
        const baseDelayMs = 5000;

        if (attempt > maxAttempts) {
            const timeoutMsg = 'ModelScope 轮询超时';
            setHistory((prev) => prev.map((hItem) => {
                if (hItem.id !== taskId) return hItem;
                const durationMs = Date.now() - (hItem.startTime || Date.now());
                const batchUpdated = applyBatchFailureToHistoryItem(
                    hItem,
                    taskId,
                    timeoutMsg,
                    durationMs,
                    consumeImageBatchFailure
                );
                return batchUpdated || { ...hItem, status: 'failed', errorMsg: timeoutMsg, durationMs };
            }));
            return;
        }

        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        const pollUrl = `${cleanBaseUrl}/v1/tasks/${taskIdForPoll}`;
        const headers = {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };
        if (useProxy) {
            headers['X-ModelScope-Task-Type'] = 'image_generation';
        }

        const finalUrl = useProxy ? buildProxyUrl(pollUrl, providerKey) : pollUrl;

        fetch(finalUrl, { method: 'GET', headers })
            .then(async (resp) => {
                if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
                    const reason = resp.status === 402 ? '积分耗尽 (402)' : (resp.status === 401 ? '认证失效 (401)' : '访问被拒绝 (403)');
                    const errorMsg = `ModelScope 轮询失败: ${reason}`;
                    setHistory((prev) => prev.map((hItem) => {
                        if (hItem.id !== taskId) return hItem;
                        const durationMs = Date.now() - (hItem.startTime || Date.now());
                        const batchUpdated = applyBatchFailureToHistoryItem(
                            hItem,
                            taskId,
                            errorMsg,
                            durationMs,
                            consumeImageBatchFailure
                        );
                        if (batchUpdated) {
                            if (batchUpdated.status === 'failed') {
                                const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                                if (storyboardTask?.isImageMode) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        status: 'failed',
                                        errorMsg,
                                        durationCost: durationMs / 1000
                                    });
                                    storyboardTaskMapRef.current.delete(taskId);
                                }
                            }
                            return batchUpdated;
                        }
                        const storyboardTask = storyboardTaskMapRef.current.get(taskId) || parseStoryboardSourceNodeId(hItem.sourceNodeId || sourceNodeId);
                        if (storyboardTask?.isImageMode) {
                            updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                status: 'failed',
                                errorMsg,
                                durationCost: durationMs / 1000
                            });
                            storyboardTaskMapRef.current.delete(taskId);
                        }
                        return { ...hItem, status: 'failed', errorMsg };
                    }));
                    return;
                }
                const text = await resp.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    console.error('[ModelScope] Failed to parse response:', err);
                    setTimeout(() => pollModelScopeTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, providerKey, useProxy, attempt + 1), baseDelayMs);
                    return;
                }

                const statusRaw = data?.task_status || data?.data?.task_status || data?.output?.task_status || data?.status || data?.data?.status || '';
                const status = String(statusRaw).toUpperCase();
                const rawImages = data?.output_images || data?.output?.output_images || data?.data?.output_images || data?.output?.images || data?.data?.output?.output_images || [];
                const imageUrls = Array.isArray(rawImages)
                    ? rawImages.map((img) => {
                        if (typeof img === 'string') return img;
                        return img?.url || img?.image_url || img?.imageUrl || img?.path || '';
                    }).filter(Boolean)
                    : [];
                const errorMsg = data?.message || data?.error || data?.data?.message || data?.output?.error || '';

                const completedStatuses = new Set(['SUCCEED', 'SUCCESS', 'COMPLETED', 'FINISHED', 'DONE']);
                const failedStatuses = new Set(['FAILED', 'ERROR', 'CANCELLED', 'FAILURE']);
                const isCompleted = completedStatuses.has(status);
                const isFailed = failedStatuses.has(status);
                let resolvedImageUrls = [];
                if (isCompleted && imageUrls.length > 0) {
                    try {
                        resolvedImageUrls = await normalizeImageUrls(imageUrls);
                    } catch (e) {
                        resolvedImageUrls = [];
                    }
                    if (resolvedImageUrls.length === 0) resolvedImageUrls = imageUrls;
                }

                setHistory((prev) => prev.map((hItem) => {
                    if (hItem.id !== taskId) return hItem;
                    const storyboardTask = storyboardTaskMapRef.current.get(taskId);
                    const hasStoryboardTask = !!storyboardTask;

                    if (isCompleted) {
                        if (resolvedImageUrls.length === 0) {
                            const emptyResultMsg = 'ModelScope 返回为空';
                            const durationMs = Date.now() - (hItem.startTime || Date.now());
                            const batchUpdated = applyBatchFailureToHistoryItem(
                                hItem,
                                taskId,
                                emptyResultMsg,
                                durationMs,
                                consumeImageBatchFailure
                            );
                            return batchUpdated || { ...hItem, status: 'failed', errorMsg: emptyResultMsg, durationMs };
                        }

                        const batchState = consumeImageBatchSuccess(taskId, hItem, resolvedImageUrls);
                        const mergedImageUrls = batchState.urls.length > 0 ? batchState.urls : resolvedImageUrls;
                        const primaryUrl = mergedImageUrls[0];
                        const endTime = Date.now();
                        const durationMs = endTime - (hItem.startTime || endTime);

                        if (hasStoryboardTask) {
                            if (storyboardTask.isImageMode) {
                                updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                    output_images: mergedImageUrls,
                                    output_url: primaryUrl,
                                    selectedImageIndex: 0,
                                    outputEnabled: false,
                                    status: 'done',
                                    durationCost: durationMs / 1000
                                });
                                storyboardTaskMapRef.current.delete(taskId);
                            } else {
                                console.warn('[ModelScope] 分镜表任务未找到或不是图片模式，无法回填');
                            }
                        }

                        const updatedItem = {
                            ...hItem,
                            status: batchState.status,
                            progress: batchState.progress,
                            url: primaryUrl,
                            width: w,
                            height: h,
                            durationMs,
                            output_images: mergedImageUrls,
                            selectedMjImageIndex: 0
                        };

                        if (updatedItem.sourceNodeId && !hasStoryboardTask) {
                            setTimeout(() => {
                                updatePreviewFromTask(taskId, primaryUrl, 'image', updatedItem.sourceNodeId, mergedImageUrls);
                            }, 0);
                        }

                        return updatedItem;
                    }

                    if (isFailed) {
                        const failedMsg = errorMsg || `任务失败: ${status || 'FAILED'}`;
                        const durationMs = Date.now() - (hItem.startTime || Date.now());
                        const batchUpdated = applyBatchFailureToHistoryItem(
                            hItem,
                            taskId,
                            failedMsg,
                            durationMs,
                            consumeImageBatchFailure
                        );
                        if (batchUpdated) {
                            if (batchUpdated.status === 'failed' && hasStoryboardTask) {
                                if (storyboardTask.isImageMode) {
                                    updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                        status: 'failed',
                                        errorMsg: failedMsg,
                                        durationCost: durationMs / 1000
                                    });
                                    storyboardTaskMapRef.current.delete(taskId);
                                }
                            }
                            return batchUpdated;
                        }
                        if (hasStoryboardTask) {
                            if (storyboardTask.isImageMode) {
                                updateShot(storyboardTask.nodeId, storyboardTask.shotId, {
                                    status: 'failed',
                                    errorMsg: failedMsg,
                                    durationCost: durationMs / 1000
                                });
                                storyboardTaskMapRef.current.delete(taskId);
                            }
                        }

                        return {
                            ...hItem,
                            status: 'failed',
                            errorMsg: failedMsg,
                            durationMs
                        };
                    }

                    const progress = Math.min(95, Math.max(10, 10 + attempt * 2));
                    return {
                        ...hItem,
                        status: 'generating',
                        progress,
                        errorMsg: null
                    };
                }));

                if (!isCompleted && !isFailed) {
                    setTimeout(() => pollModelScopeTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, providerKey, useProxy, attempt + 1), baseDelayMs);
                }
            })
            .catch((err) => {
                console.error('[ModelScope] Poll error:', err);
                setTimeout(() => pollModelScopeTask(taskId, taskIdForPoll, baseUrl, apiKey, w, h, sourceNodeId, providerKey, useProxy, attempt + 1), baseDelayMs);
            });
    }

export function pollMidjourneyJob({
    pollMidjourneyJob,
    setHistory,
    setNodes,
    splitMidjourneyImage,
    updatePreviewFromTask,
}, jobId, taskId, baseUrl, apiKey, mjMode = 'fast', w, h, attempt = 0) {
        const maxAttempts = 120; // 最多轮询120次（约10分钟，假设每次5秒）
        const delayMs = 5000; // 每5秒轮询一次

        if (attempt > maxAttempts) {
            setHistory((prev) => prev.map((hItem) =>
                hItem.id === taskId
                    ? { ...hItem, status: 'failed', errorMsg: 'Midjourney 轮询超时' }
                    : hItem
            ));
            return;
        }

        fetch(`${baseUrl}/${mjMode}/mj/task/${jobId}/fetch`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
        })
            .then((resp) => resp.text())
            .then((text) => {
                let data;
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    console.error('Midjourney: Failed to parse response:', err);
                    setTimeout(() => pollMidjourneyJob(jobId, taskId, baseUrl, apiKey, mjMode, w, h, attempt + 1), delayMs);
                    return;
                }


                const status = data?.status || '';
                const progress = data?.progress || '0%';
                const imageUrl = data?.imageUrl || '';
                const failReason = data?.failReason || '';
                const buttons = data?.buttons || [];

                // 解析进度百分比
                let progressNum = 0;
                if (typeof progress === 'string' && progress.includes('%')) {
                    progressNum = parseInt(progress.replace('%', ''), 10) || 0;
                } else if (typeof progress === 'number') {
                    progressNum = progress;
                }

                // 更新历史记录
                setHistory((prev) => prev.map((hItem) => {
                    if (hItem.id === taskId) {
                        let newStatus = hItem.status;
                        let newErrorMsg = hItem.errorMsg;
                        let newProgress = progressNum;

                        if (status === 'SUCCESS' || status === 'FINISHED') {
                            newStatus = 'completed';
                            newProgress = 100;
                            newErrorMsg = null;

                            // 如果是Midjourney任务且有图片URL，切割成4张图（拓展图片任务不需要切割）
                            if (imageUrl && hItem.apiConfig?.modelId?.includes('mj') && hItem.apiConfig?.modelId !== 'mj-zoom') {
                                // 获取比例信息（从prompt中提取或使用默认值）
                                let ratio = '1:1';
                                if (hItem.prompt && hItem.prompt.includes('--ar ')) {
                                    const arMatch = hItem.prompt.match(/--ar\s+([\d:]+)/);
                                    if (arMatch && arMatch[1]) {
                                        ratio = arMatch[1];
                                    }
                                }

                                // 异步切割图片，不阻塞状态更新
                                // 先更新状态，显示原图，避免白屏
                                setHistory((prev) => prev.map((hItem) =>
                                    hItem.id === taskId
                                        ? { ...hItem, url: imageUrl, mjRatio: ratio, mjOriginalUrl: imageUrl, mjNeedsSplit: true }
                                        : hItem
                                ));

                                // 立即将完整原图同步到预览窗口（不裁剪）
                                // 直接传入 sourceNodeId，避免依赖可能未更新的 history 状态
                                // 使用 setTimeout 确保在下一个事件循环中执行，避免状态更新冲突
                                const sourceNodeIdForPreview = hItem.sourceNodeId;
                                if (sourceNodeIdForPreview) {
                                    setTimeout(() => {
                                        updatePreviewFromTask(taskId, imageUrl, 'image', sourceNodeIdForPreview);
                                    }, 0);
                                } else {
                                    console.warn('[Tapnow] Midjourney: 未找到 sourceNodeId，无法更新预览窗口', { taskId, hItem });
                                }

                                // 延迟切割，确保UI先更新显示原图，避免白屏
                                setTimeout(() => {
                                    splitMidjourneyImage(imageUrl, ratio).then((splitImages) => {
                                        // 提取URL数组（兼容新旧格式）
                                        const imageUrls = splitImages.map(img => typeof img === 'string' ? img : img.url);
                                        const firstImage = splitImages[0];
                                        const firstUrl = typeof firstImage === 'string' ? firstImage : firstImage.url;

                                        setHistory((prev) => prev.map((hItem) =>
                                            hItem.id === taskId
                                                ? {
                                                    ...hItem,
                                                    mjImages: imageUrls,
                                                    url: firstUrl,
                                                    selectedMjImageIndex: 0,
                                                    mjRatio: ratio,
                                                    mjOriginalUrl: imageUrl, // 保存原图URL
                                                    mjNeedsSplit: false, // 标记已切割
                                                    mjImageInfo: splitImages.map(img => typeof img === 'string' ? null : { width: img.width, height: img.height, ratio: img.ratio })
                                                }
                                                : hItem
                                        ));
                                    }).catch((err) => {
                                        console.error('Midjourney: Failed to split image:', err);
                                        // 如果切割失败，保持原图显示，标记需要重新切割
                                        setHistory((prev) => prev.map((hItem) =>
                                            hItem.id === taskId
                                                ? { ...hItem, url: imageUrl, mjRatio: ratio, mjOriginalUrl: imageUrl, mjNeedsSplit: true }
                                                : hItem
                                        ));
                                    });
                                }, 300); // 延迟300ms，确保原图已完全显示

                                // 计算并保存用时
                                const endTime = Date.now();
                                const durationMs = endTime - (hItem.startTime || endTime);

                                // 先更新状态，图片切割异步进行
                                return {
                                    ...hItem,
                                    status: newStatus,
                                    progress: newProgress,
                                    errorMsg: newErrorMsg,
                                    url: imageUrl, // 临时使用原图，切割完成后会更新
                                    width: w,
                                    height: h,
                                    mjButtons: buttons,
                                    mjOriginalUrl: imageUrl, // 保存完整原图URL
                                    durationMs: durationMs
                                };
                            }
                        } else if (status === 'FAILURE' || status === 'ERROR' || status === 'CANCELLED') {
                            newStatus = 'failed';
                            newErrorMsg = failReason || `任务失败: ${status}`;
                        } else if (status === 'NOT_START' || status === 'SUBMITTED' || status === 'IN_PROGRESS' || status === 'MODAL') {
                            newStatus = 'generating';
                            newErrorMsg = null;
                            // 如果进度为0%，至少显示5%
                            if (newProgress === 0) newProgress = 5;
                        } else {
                            newStatus = 'generating';
                            newErrorMsg = null;
                            // 渐进式更新进度
                            newProgress = Math.min(95, (hItem.progress || 5) + 2);
                        }


                        const updatedItem = {
                            ...hItem,
                            status: newStatus,
                            progress: newProgress,
                            errorMsg: newErrorMsg,
                            url: imageUrl || hItem.url,
                            width: w,
                            height: h,
                            mjButtons: buttons // 保存按钮信息，用于后续操作
                        };

                        // 如果任务成功且有图片URL，将结果同步到预览节点（使用完整原图，不裁剪）
                        // 注意：Midjourney任务已经在切割逻辑中处理了预览窗口更新，这里只处理非Midjourney任务
                        // 拓展图片任务（mj-zoom）也需要同步到节点
                        if ((status === 'SUCCESS' || status === 'FINISHED') && imageUrl && (!hItem.apiConfig?.modelId?.includes('mj') || hItem.apiConfig?.modelId === 'mj-zoom')) {
                            // 直接传入 sourceNodeId，避免依赖可能未更新的 history 状态
                            if (hItem.sourceNodeId) {
                                // 如果是拓展图片任务，更新拓展图片节点；否则更新预览窗口
                                if (hItem.apiConfig?.modelId === 'mj-zoom') {
                                    setNodes((prev) => prev.map((n) =>
                                        n.id === hItem.sourceNodeId && n.type === 'expand-image'
                                            ? { ...n, content: imageUrl }
                                            : n
                                    ));
                                } else {
                                    updatePreviewFromTask(taskId, imageUrl, 'image', hItem.sourceNodeId);
                                }
                            } else {
                                console.warn('[Tapnow] 图片生成: 未找到 sourceNodeId', { taskId, hItem });
                            }

                            // 计算并保存用时
                            const endTime = Date.now();
                            const durationMs = endTime - (hItem.startTime || endTime);
                            updatedItem.durationMs = durationMs;
                        }

                        return updatedItem;
                    }
                    return hItem;
                }));

                // 如果任务完成或失败，停止轮询
                if (status === 'SUCCESS' || status === 'FINISHED') {
                    return;
                }

                if (status === 'FAILURE' || status === 'ERROR' || status === 'CANCELLED') {
                    return;
                }

                // 继续轮询
                setTimeout(() => pollMidjourneyJob(jobId, taskId, baseUrl, apiKey, mjMode, w, h, attempt + 1), delayMs);
            })
            .catch((err) => {
                console.error(`[Tapnow] Midjourney Poll Fetch Error for task ${taskId}:`, err);
                setHistory((prev) => prev.map((hItem) =>
                    hItem.id === taskId
                        ? { ...hItem, status: 'failed', errorMsg: `轮询请求失败: ${err.message}` }
                        : hItem
                ));
                // 即使出错也继续重试（最多重试3次）
                if (attempt < 3) {
                    setTimeout(() => pollMidjourneyJob(jobId, taskId, baseUrl, apiKey, mjMode, w, h, attempt + 1), delayMs);
                }
            });
    }
