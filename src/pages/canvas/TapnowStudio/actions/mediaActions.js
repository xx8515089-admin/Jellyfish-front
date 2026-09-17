import { canvasAlert } from '../canvasDialogs';
import { arrangeCanvasNodes } from '../canvasAutoArrange'
import {
    t,
    LocalImageManager,
    DEFAULT_BASE_URL,
    normalizeImageResolution,
    normalizeVideoResolutionLower,
    isImageModelType,
    isChatModelType,
    isVideoUrl,
    getVideoMetadata
} from '../freeCanvasShared';

export async function prepareImageForMidjourneyUpload({}, imageUrl, maxSize = 2048, maxFileSizeMB = 8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const originalWidth = img.width;
                const originalHeight = img.height;

                // 计算缩放后的尺寸，保持宽高比
                let newWidth = originalWidth;
                let newHeight = originalHeight;

                if (originalWidth > maxSize || originalHeight > maxSize) {
                    const scale = maxSize / Math.max(originalWidth, originalHeight);
                    newWidth = Math.floor(originalWidth * scale);
                    newHeight = Math.floor(originalHeight * scale);
                }

                // 创建canvas并绘制
                const canvas = document.createElement('canvas');
                canvas.width = newWidth;
                canvas.height = newHeight;
                const ctx = canvas.getContext('2d');

                // 使用高质量绘制
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                // 转换为base64，使用JPEG格式压缩
                // 从高质量开始，如果文件太大则降低质量
                let quality = 0.92;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);

                // 检查文件大小（base64编码后的大小约为原始大小的133%）
                const base64Length = dataUrl.split(',')[1]?.length || 0;
                const fileSizeMB = (base64Length * 3 / 4) / (1024 * 1024);

                // 如果文件太大，降低质量
                if (fileSizeMB > maxFileSizeMB) {
                    quality = 0.75;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                    const newBase64Length = dataUrl.split(',')[1]?.length || 0;
                    const newFileSizeMB = (newBase64Length * 3 / 4) / (1024 * 1024);
                }

                resolve(dataUrl);
            };

            img.onerror = (error) => {
                console.error('Midjourney: 图片加载失败', error);
                // 如果加载失败，返回原图
                resolve(imageUrl);
            };

            img.src = imageUrl;
        });
    }

export async function uploadMidjourneyImages({
    blobToDataURL,
    getBlobFromUrl,
    getProxyPreferenceForUrl,
    prepareImageForMidjourneyUpload,
}, base64Array, baseUrl, apiKey) {
        try {
            // 先处理所有图片：压缩/缩放
            const processedImages = await Promise.all(
                base64Array.map(async (imageUrl, index) => {
                    // 如果是data URL，先压缩/缩放
                    if (imageUrl.startsWith('data:')) {
                        try {
                            const processed = await prepareImageForMidjourneyUpload(imageUrl, 2048, 8);
                            return processed;
                        } catch (error) {
                            console.error(`Midjourney: 图片[${index}]处理失败，使用原图`, error);
                            return imageUrl;
                        }
                    } else {
                        // 如果是HTTP URL，需要先转换为data URL再处理
                        try {
                            const useProxy = getProxyPreferenceForUrl(imageUrl, false);
                            const blob = await getBlobFromUrl(imageUrl, { useProxy });
                            const dataUrl = await blobToDataURL(blob);
                            const processed = await prepareImageForMidjourneyUpload(dataUrl, 2048, 8);
                            return processed;
                        } catch (error) {
                            console.error(`Midjourney: 图片[${index}]从URL处理失败`, error);
                            throw error;
                        }
                    }
                })
            );

            // 清理base64数组，确保每个元素都是纯base64字符串
            const cleanedBase64Array = processedImages.map((base64, index) => {
                // 如果是data URL，提取base64部分
                let cleaned = base64;
                if (typeof cleaned !== 'string') {
                    throw new Error(`base64[${index}]不是字符串类型`);
                }

                // 如果是data URL，提取base64部分
                if (cleaned.includes(',')) {
                    // 直接提取逗号后的部分（base64数据）
                    cleaned = cleaned.split(',')[1];
                } else if (cleaned.startsWith('data:')) {
                    // 如果没有逗号但有data:前缀，使用正则提取
                    cleaned = cleaned.replace(/^data:[^;]*;base64,?/i, '');
                }

                // 严格清理：移除所有非base64字符（包括空白字符和不可见字符）
                // 只保留有效的base64字符：A-Z, a-z, 0-9, +, /, =
                const beforeClean = cleaned.length;
                cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, '');
                const afterClean = cleaned.length;
                if (beforeClean !== afterClean) {
                }

                if (!cleaned || cleaned.length < 100) {
                    throw new Error(`base64[${index}]无效或太短，长度: ${cleaned?.length || 0}`);
                }

                // 验证base64格式：只包含 base64 字符（A-Z, a-z, 0-9, +, /, =）
                // 注意：base64字符串可能以0-2个=结尾作为填充
                const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
                if (!base64Regex.test(cleaned)) {
                    console.error(`Midjourney: base64[${index}]格式验证失败，长度: ${cleaned.length}, 前50字符: ${cleaned.substring(0, 50)}`);
                    throw new Error(`invalid_base64_format: base64[${index}]格式无效`);
                }

                // 验证base64长度是否为4的倍数（base64编码要求）
                // 如果不是4的倍数，添加填充
                const padding = cleaned.length % 4;
                if (padding !== 0) {
                    // 移除现有的填充字符，然后重新添加正确的填充
                    cleaned = cleaned.replace(/=+$/, '');
                    cleaned += '='.repeat(4 - padding);

                    // 填充后再次验证
                    if (!base64Regex.test(cleaned)) {
                        console.error(`Midjourney: base64[${index}]填充后验证失败，长度: ${cleaned.length}`);
                        throw new Error(`invalid_base64_format: base64[${index}]填充后格式无效`);
                    }
                }

                // 测试base64是否能正确解码（确保base64有效）
                try {
                    const testDecode = atob(cleaned);
                    if (!testDecode || testDecode.length === 0) {
                        throw new Error('base64解码结果为空');
                    }
                } catch (decodeError) {
                    console.error(`Midjourney: base64[${index}]解码测试失败:`, decodeError);
                    throw new Error(`invalid_base64_format: base64[${index}]无法解码`);
                }

                // 根据API文档，base64Array需要完整的data URL格式：data:image/png;base64,xxx
                // 而不是纯base64字符串
                const dataUrl = `data:image/jpeg;base64,${cleaned}`;
                return dataUrl;
            });

            // 使用Midjourney的上传接口：/mj/submit/upload-discord-images
            const uploadEndpoint = `${baseUrl}/mj/submit/upload-discord-images`;


            // 最终验证所有data URL字符串（现在返回的是完整的data URL格式）
            cleanedBase64Array.forEach((dataUrl, idx) => {
                if (!dataUrl || typeof dataUrl !== 'string') {
                    throw new Error(`base64[${idx}]无效或不是字符串`);
                }
                // 验证是否是data URL格式：data:image/xxx;base64,xxx
                if (!dataUrl.startsWith('data:image/')) {
                    throw new Error(`base64[${idx}]不是有效的data URL格式`);
                }
                // 提取base64部分进行验证
                let base64Part = '';
                if (dataUrl.includes(',')) {
                    base64Part = dataUrl.split(',')[1];
                } else {
                    throw new Error(`base64[${idx}]data URL格式不正确，缺少逗号`);
                }

                if (!base64Part || base64Part.length < 100) {
                    throw new Error(`base64[${idx}]无效或太短`);
                }
                // 验证base64格式
                const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
                if (!base64Regex.test(base64Part)) {
                    console.error(`Midjourney: base64[${idx}]最终验证失败，包含非法字符`);
                    throw new Error(`base64[${idx}]格式无效`);
                }
                // 验证长度是4的倍数
                if (base64Part.length % 4 !== 0) {
                    throw new Error(`base64[${idx}]长度不是4的倍数: ${base64Part.length}`);
                }
                // 再次测试解码
                try {
                    atob(base64Part);
                } catch (e) {
                    throw new Error(`base64[${idx}]无法解码: ${e.message}`);
                }
            });

            // 构建请求体
            const requestBody = {
                base64Array: cleanedBase64Array
            };

            // 验证JSON序列化后的数据
            const jsonString = JSON.stringify(requestBody);

            const uploadResp = await fetch(uploadEndpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: jsonString
            });

            if (!uploadResp.ok) {
                let errorText = '';
                try {
                    errorText = await uploadResp.text();
                    // 尝试解析为JSON
                    try {
                        const errorJson = JSON.parse(errorText);
                        throw new Error(`上传失败: ${uploadResp.status} - ${errorJson.description || errorJson.message || errorText}`);
                    } catch {
                        throw new Error(`上传失败: ${uploadResp.status} - ${errorText}`);
                    }
                } catch (error) {
                    throw new Error(`上传失败: ${uploadResp.status} - ${error.message || errorText}`);
                }
            }

            const uploadData = await uploadResp.json();

            // 检查响应格式
            if (uploadData.code === 1 && uploadData.result && Array.isArray(uploadData.result)) {
                return uploadData.result; // 返回URL数组
            } else {
                const errorMsg = uploadData.description || uploadData.message || '上传失败：响应格式错误';
                console.error('Midjourney: 上传失败，响应:', uploadData);
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Midjourney: 图片上传失败:', error);
            throw error;
        }
    }

export async function uploadImageToGetHttpUrl({
    getBase64FromUrl,
    resolveSpecialUrl,
}, imageUrl, baseUrl, apiKey) {
        try {
            const resolvedInput = await resolveSpecialUrl(imageUrl);
            if (resolvedInput) imageUrl = resolvedInput;
            // 如果是HTTP/HTTPS URL，直接返回
            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                return imageUrl;
            }

            // 如果是 Blob URL，需要转换为 Base64 再上传
            if (imageUrl.startsWith('blob:')) {
                const base64Data = await getBase64FromUrl(imageUrl);
                // 继续使用 data URL 的处理逻辑
                imageUrl = `data:image/png;base64,${base64Data}`;
            }

            // 如果是data URL，需要上传
            if (imageUrl.startsWith('data:')) {
                // 提取base64数据（去掉 data:image/png;base64, 前缀）
                // 确保正确提取纯base64字符串
                let base64Data = imageUrl;
                if (base64Data.includes(',')) {
                    base64Data = base64Data.split(',')[1];
                } else {
                    // 如果没有逗号，尝试去掉 data: 前缀
                    base64Data = base64Data.replace(/^data:[^;]*;base64,?/i, '');
                }
                // 先清理所有非base64字符（包括所有空白字符和不可见字符）
                // 这是最严格的方式：只保留有效的base64字符
                base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');

                if (!base64Data || base64Data.length < 100) {
                    console.error('拓展图片: base64数据无效或太短，长度:', base64Data?.length);
                    return null;
                }

                // 验证base64格式：只包含 base64 字符（A-Z, a-z, 0-9, +, /, =）
                const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
                if (!base64Regex.test(base64Data)) {
                    console.error('拓展图片: base64数据格式验证失败，包含非法字符');
                    // 再次清理（理论上不应该到这里）
                    base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
                    if (!base64Regex.test(base64Data)) {
                        console.error('拓展图片: 清理后仍无效，放弃上传');
                        return null;
                    }
                }

                // 验证base64长度是否为4的倍数（base64编码要求）
                const padding = base64Data.length % 4;
                if (padding !== 0) {
                    console.warn('拓展图片: base64长度不是4的倍数，添加填充:', padding);
                    base64Data += '='.repeat(4 - padding);
                }

                // 最终验证
                if (!base64Regex.test(base64Data)) {
                    console.error('拓展图片: 最终验证失败');
                    return null;
                }


                // 优先使用 Midjourney 官方上传接口
                try {
                    // 确保 baseUrl 格式正确（移除末尾斜杠）
                    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
                    const uploadEndpoint = `${cleanBaseUrl}/mj/submit/upload-discord-images`;
                    const uploadPayload = {
                        base64Array: [base64Data]
                    };


                    const uploadResp = await fetch(uploadEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(uploadPayload)
                    });

                    const responseText = await uploadResp.text();

                    if (uploadResp.ok) {
                        let uploadData;
                        try {
                            uploadData = JSON.parse(responseText);
                        } catch (parseError) {
                            console.error('拓展图片: Midjourney 上传响应解析失败', parseError, '响应内容:', responseText.substring(0, 200));
                            throw new Error('响应不是有效的JSON格式');
                        }

                        console.log('拓展图片: 响应详细信息:', {
                            code: uploadData.code,
                            description: uploadData.description,
                            result: uploadData.result,
                            resultType: typeof uploadData.result,
                            isArray: Array.isArray(uploadData.result),
                            hasData: !!uploadData.data,
                            hasUrl: !!uploadData.url
                        });

                        // 检查响应格式
                        if (uploadData.code === 1) {
                            // 尝试多种可能的响应格式
                            let httpUrl = null;

                            // 格式1: result 是数组
                            if (uploadData.result && Array.isArray(uploadData.result) && uploadData.result.length > 0) {
                                httpUrl = uploadData.result[0];
                            }
                            // 格式2: result 是字符串
                            else if (uploadData.result && typeof uploadData.result === 'string') {
                                httpUrl = uploadData.result;
                            }
                            // 格式3: data 字段
                            else if (uploadData.data && Array.isArray(uploadData.data) && uploadData.data.length > 0) {
                                httpUrl = uploadData.data[0];
                            }
                            // 格式4: url 字段
                            else if (uploadData.url) {
                                httpUrl = uploadData.url;
                            }

                            if (httpUrl && (httpUrl.startsWith('http://') || httpUrl.startsWith('https://'))) {
                                return httpUrl;
                            } else {
                                console.warn('拓展图片: Midjourney 返回的URL格式不正确或为空', {
                                    httpUrl,
                                    code: uploadData.code,
                                    description: uploadData.description,
                                    result: uploadData.result,
                                    data: uploadData.data,
                                    url: uploadData.url
                                });
                            }
                        } else {
                            console.warn('拓展图片: Midjourney 上传失败', {
                                code: uploadData.code,
                                description: uploadData.description,
                                fullResponse: uploadData
                            });
                        }
                    } else {
                        console.warn('拓展图片: Midjourney 上传失败', uploadResp.status, '响应内容:', responseText.substring(0, 200));
                    }
                } catch (e) {
                    console.error('拓展图片: Midjourney 上传接口调用失败', e);
                }

                // 如果 Midjourney 上传失败，尝试使用图床服务作为备选
                const mimeMatch = imageUrl.match(/data:([^;]+);base64/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

                // 将base64转换为Blob
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: mimeType });

                const imageBedServices = [
                    // sm.ms图床
                    {
                        name: 'sm.ms',
                        url: 'https://sm.ms/api/v2/upload',
                        fieldName: 'smfile',
                        parseResponse: (data) => data.success && data.data?.url ? data.data.url : null
                    }
                ];

                for (const service of imageBedServices) {
                    if (service.skip) continue;

                    try {
                        const formData = new FormData();
                        formData.append(service.fieldName, blob, 'image.png');

                        const resp = await fetch(service.url, {
                            method: 'POST',
                            body: formData
                        });

                        if (resp.ok) {
                            const data = await resp.json();
                            const httpUrl = service.parseResponse(data);
                            if (httpUrl && (httpUrl.startsWith('http://') || httpUrl.startsWith('https://'))) {
                                return httpUrl;
                            }
                        }
                    } catch (e) {
                        console.warn(`拓展图片: ${service.name}图床上传失败:`, e);
                        continue;
                    }
                }

                // 如果所有上传方式都失败，返回null
                console.warn('拓展图片: 所有上传方式都失败，无法获取HTTP URL');
                return null;
            }

            // 其他格式，直接返回
            return imageUrl;
        } catch (error) {
            console.error('拓展图片: 上传图片失败:', error);
            return null;
        }
    }

export async function resizeImageForVeo({
    getBase64FromUrl,
    getBlobFromUrl,
    getProxyPreferenceForUrl,
}, imageUrl, maxWidth = 1920, maxHeight = 1920) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const originalWidth = img.width;
                const originalHeight = img.height;

                // 如果图片尺寸已经小于等于目标尺寸，直接返回原图
                if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
                    if (imageUrl.startsWith('data:')) {
                        resolve(imageUrl);
                    } else {
                        // 如果是URL，转换为data URL
                        getBase64FromUrl(imageUrl).then(base64 => {
                            resolve(`data:image/png;base64,${base64}`);
                        }).catch(reject);
                    }
                    return;
                }

                // 计算缩放后的尺寸，保持宽高比
                let newWidth = originalWidth;
                let newHeight = originalHeight;

                if (originalWidth > maxWidth || originalHeight > maxHeight) {
                    const scale = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
                    newWidth = Math.round(originalWidth * scale);
                    newHeight = Math.round(originalHeight * scale);

                    // 确保尺寸是偶数（某些编码器要求）
                    newWidth = newWidth % 2 === 0 ? newWidth : newWidth - 1;
                    newHeight = newHeight % 2 === 0 ? newHeight : newHeight - 1;
                }


                // 使用canvas缩放图片
                const canvas = document.createElement('canvas');
                canvas.width = newWidth;
                canvas.height = newHeight;
                const ctx = canvas.getContext('2d');

                // 使用高质量缩放
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                // 转换为data URL
                const dataUrl = canvas.toDataURL('image/png', 0.95);
                resolve(dataUrl);
            };

            img.onerror = (e) => {
                console.error('Veo: 图片加载失败', e);
                reject(new Error('图片加载失败'));
            };

            // 设置图片源
            if (imageUrl.startsWith('data:')) {
                img.src = imageUrl;
            } else if (imageUrl.startsWith('blob:')) {
                img.src = imageUrl;
            } else {
                // 对于其他URL，先转换为blob再加载（避免CORS问题）
                const useProxy = getProxyPreferenceForUrl(imageUrl, false);
                getBlobFromUrl(imageUrl, { useProxy }).then(blob => {
                    const blobUrl = URL.createObjectURL(blob);
                    img.src = blobUrl;
                }).catch(reject);
            }
        });
    }

export async function createCharacter({
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
}, videoUrl, startSecond, endSecond, fromTaskId = null, customEndpoint = null) {
        if (cloudDocument) return canvasCloud.unsupported('供应商角色身份创建');
        try {
            // 1. 获取配置
            const soraConfig = apiConfigs.find(c => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro'));
            if (!soraConfig) {
                canvasAlert(t('未找到 Sora 2 模型配置，请先在设置中配置 Sora 2 或 Sora 2 Pro'));
                setCreateCharacterSubmitting(false);
                return;
            }

            // V3.4.19: 使用 getApiCredentials 获取凭据
            const credentials = getApiCredentials(soraConfig.id);
            const apiKey = credentials.key;

            if (!apiKey) {
                canvasAlert(t('请先配置 API Key'));
                setCreateCharacterSubmitting(false);
                return;
            }

            // 验证时间范围
            if (endSecond - startSecond < 1 || endSecond - startSecond > 3) {
                canvasAlert(t('时间范围必须在 1-3 秒之间'));
                setCreateCharacterSubmitting(false);
                return;
            }

            // 2. 使用用户提供的 endpoint 或自动构造
            const timestamps = `${startSecond},${endSecond} `;
            let endpoint;
            if (customEndpoint && customEndpoint.trim()) {
                endpoint = customEndpoint.trim();
            } else {
                // 如果没有提供，使用默认路径
                const baseUrl = (soraConfig.url || DEFAULT_BASE_URL).replace(/\/+$/, '');
                endpoint = `${baseUrl}/sora/v1/characters`;
            }

            // 3. 构造 Body
            const payload = fromTaskId
                ? { from_task: fromTaskId, timestamps }
                : { url: videoUrl, timestamps };

            // 4. 详细调试日志
            console.log('[Create Character] Request Details:', {
                endpoint,
                apiKey: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)} ` : 'EMPTY',
                payload,
                fromTaskId,
                videoUrl: fromTaskId ? 'N/A (using from_task)' : videoUrl,
                customEndpoint: customEndpoint || 'N/A (using default)'
            });

            // 5. 发送请求
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            // 6. 错误处理
            if (!resp.ok) {
                const errText = await resp.text();
                console.error('[Create Character] API Error:', {
                    status: resp.status,
                    statusText: resp.statusText,
                    errorText: errText,
                    endpoint
                });

                // 尝试解析错误响应
                let errorData = null;
                try {
                    errorData = JSON.parse(errText);
                } catch (e) {
                    // 如果不是 JSON，使用原始文本
                }

                // 特殊处理 500 错误和 get_origin_task_failed
                if (resp.status === 500 || (errorData && (errorData.code === 'get_origin_task_failed' || errorData.message?.includes('get_origin_task_failed')))) {
                    throw new Error('TASK_NOT_FOUND');
                }

                throw new Error(`API错误(${resp.status}): ${errText || resp.statusText} `);
            }

            const data = await resp.json();

            // 7. 保存到角色库
            if (data.id && data.username) {
                const newCharacter = {
                    id: data.id,
                    username: data.username,
                    profile_picture_url: data.profile_picture_url || '',
                    permalink: data.permalink || ''
                };

                const updated = [...characterLibrary, newCharacter];
                setCharacterLibrary(updated);
                canvasAlert(`角色 "${data.username}" 创建成功！`);
                setCreateCharacterOpen(false);
                // 重置表单
                setCreateCharacterVideoSourceType('url');
                setCreateCharacterVideoUrl('');
                setCreateCharacterSelectedTaskId('');
                setCreateCharacterStartSecond(1);
                setCreateCharacterEndSecond(3);
                setCreateCharacterEndpoint('');
            } else {
                throw new Error('返回数据缺少 id 或 username');
            }
        } catch (err) {
            console.error('[Create Character] Failed:', err);
            let msg = err.message;

            // 特殊处理：原任务已过期或无法访问
            if (msg === 'TASK_NOT_FOUND') {
                canvasAlert('创建失败：原任务已过期或无法访问。\n\n请尝试获取该视频的下载链接，使用"输入视频 URL"方式重新创建。');
                return;
            }

            // 处理网络错误
            if (msg.includes('Failed to fetch') || err.name === 'TypeError' || err.message.includes('NetworkError')) {
                msg = '连接失败。可能原因：\n\n1. API 地址填写错误\n   - 请检查 API 接口地址是否多余了 "/sora" 前缀\n   - 有些服务商的路径可能不同，请询问服务商 Sora 角色创建接口的准确路径\n\n2. 跨域限制 (CORS)\n   - 请尝试安装 Allow CORS 浏览器插件\n\n3. 网络问题\n   - 请检查网络连接';
            }

            canvasAlert(`创建角色失败: ${msg} `);
        } finally {
            setCreateCharacterSubmitting(false);
        }
    }

export function generateSingleShot({
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
}, nodeId, shot) {
        if (cloudDocument) return canvasCloud.generate(nodeId, { shotId: shot.id, operation: 'videoGenerate' });
        // 1. 构建更加丰富的 Prompt
        // 优先级：提示词 > 画面描述 > 风格标签 > 运镜
        let finalPrompt = shot.prompt || "";

        // 如果提示词为空，尝试使用描述自动构建
        if (!finalPrompt && shot.description) {
            finalPrompt = shot.description;
        }

        // 拼接风格标签 (Style Tags)
        if (shot.tags && shot.tags.length > 0) {
            const styleText = shot.tags.join(", ");
            finalPrompt += `, ${styleText} `;
        }

        // 拼接运镜 (Camera)
        if (shot.camera) {
            finalPrompt += `, ${shot.camera} camera movement`;
        }

        if (!finalPrompt) {
            canvasAlert(t('请至少填写画面描述或提示词'));
            return;
        }

        // 2. 获取选中的视频模型（必须选择视频模型）
        const selectedModel = resolveModelKey(shot.model || (apiConfigs.find(c => c.type === 'Video' && c.id === 'sora-2')?.id || apiConfigs.find(c => c.type === 'Video')?.id || ''));
        const modelConfig = getApiConfigByKey(selectedModel);

        if (!modelConfig || modelConfig.type !== 'Video') {
            canvasAlert(t('请先选择一个视频模型'));
            return;
        }

        // 3. 准备参考图 (Image Input)
        // 如果分镜格子里已经有图（比如用户拖入的参考图），则将其作为 img2img/img2vid 的输入
        const sourceImages = [];
        if (shot.image_url) {
            sourceImages.push(shot.image_url);
        }
        // V3.7.5：支持 lastFrame（视频尾帧）
        if (shot.useFirstLastFrame && shot.lastFrame) {
            sourceImages.push(shot.lastFrame);
        }

        // 4. 更新 shot 状态为生成中
        const startAt = Date.now();
        updateShot(nodeId, shot.id, { status: 'generating', generationStartTime: startAt });
        scheduleStoryboardTimeout(nodeId, shot.id, startAt, 'video');

        // 5. 构建覆盖选项 - 确保 duration 格式正确
        let durationValue = shot.duration || getDefaultDurationForModel(selectedModel);
        // V3.5.5: 验证 duration 是否在模型支持的范围内
        const validDurations = getDefaultDurationsForModel(selectedModel);
        if (!validDurations.includes(durationValue)) {
            console.warn(`[V3.5.5] Duration "${durationValue}" not valid for model "${selectedModel}", using "${validDurations[0]}"`);
            durationValue = validDurations[0]; // 使用第一个有效值作为默认
        }
        // 确保 duration 是字符串且带 's' 后缀
        const normalizedDuration = String(durationValue).endsWith('s') ? durationValue : `${durationValue}s`;

        const overrideOptions = {
            model: selectedModel,
            ratio: shot.ratio || '16:9',
            duration: normalizedDuration,
            resolution: normalizeVideoResolutionLower(shot.resolution || '720p'),
            isHD: !!shot.isHD,
            customParams: shot.customParams || null
        };


        // 6. 创建一个特殊的节点ID用于标识这是分镜表的任务
        // V3.5.8: 修复格式，移除多余空格
        // 格式：storyboard-${nodeId}-shot-${shotId}
        const virtualNodeId = `storyboard-${nodeId}-shot-${shot.id}`;

        // 7. 预先记录任务映射（在 startGeneration 创建 taskId 之前）
        // 由于 startGeneration 内部会使用 Date.now().toString() 作为 taskId
        // 我们需要在 startGeneration 内部检查 sourceNodeId 模式并自动记录
        // 这里我们先调用 startGeneration，任务映射会在 startGeneration 内部完成

        // 调用核心生成函数
        startGeneration(finalPrompt, 'video', sourceImages, virtualNodeId, overrideOptions).catch((err) => {
            const msg = err?.message || '视频生成失败';
            updateShot(nodeId, shot.id, { status: 'failed', errorMsg: msg }, { onlyIfStatus: 'generating' });
        });
    }

export function generateSingleImage({
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
}, nodeId, shot) {
        if (cloudDocument) return canvasCloud.generate(nodeId, { shotId: shot.id, operation: 'imageGenerate' });
        // 1. 构建 Prompt
        let finalPrompt = shot.prompt || "";

        // 如果提示词为空，尝试使用描述自动构建
        if (!finalPrompt && shot.description) {
            finalPrompt = shot.description;
        }

        // 拼接风格标签 (Style Tags)
        if (shot.tags && shot.tags.length > 0) {
            const styleText = shot.tags.join(", ");
            finalPrompt += `, ${styleText} `;
        }

        if (!finalPrompt) {
            canvasAlert(t('请至少填写画面描述或提示词'));
            return;
        }

        // 2. 获取选中的图片模型
        const selectedModel = resolveModelKey(shot.model || localStorage.getItem('tapnow_last_image_model') || (apiConfigs.find(c => isImageModelType(c.type))?.id || ''));
        const modelConfig = getApiConfigByKey(selectedModel);

        if (!modelConfig || !isImageModelType(modelConfig.type)) {
            canvasAlert(t('请先选择一个图片模型'));
            return;
        }

        // V3.7.27: 提前验证 API 凭据，避免设置 generating 后卡住
        const credentials = getApiCredentials(selectedModel);
        if (!credentials.key) {
            canvasAlert(`模型 "${selectedModel}" 的 API Key 未配置，请先在设置中配置`);
            updateShot(nodeId, shot.id, { status: 'failed', errorMsg: 'API Key 未配置' });
            setSettingsOpen(true);
            return;
        }

        // 3. 准备参考图 (Image Input)
        const sourceImages = [];
        if (shot.image_url) {
            sourceImages.push(shot.image_url);
        }
        // V3.6.1: 多图片参考支持
        if (shot.referenceImages && shot.referenceImages.length > 0) {
            sourceImages.push(...shot.referenceImages);
        }

        // 4. 更新 shot 状态为生成中（已验证 API 配置有效）
        const startAt = Date.now();
        updateShot(nodeId, shot.id, { status: 'generating', generationStartTime: startAt });
        scheduleStoryboardTimeout(nodeId, shot.id, startAt, 'image');

        // 5. 构建覆盖选项
        const overrideOptions = {
            model: selectedModel,
            ratio: shot.ratio || '1:1',
            resolution: normalizeImageResolution(shot.resolution || '2K'),
            customParams: shot.customParams || null
        };


        // 6. 创建一个特殊的节点ID用于标识这是分镜表的图片任务
        const virtualNodeId = `storyboard-img-${nodeId}-shot-${shot.id}`;

        // 7. 调用核心生成函数
        startGeneration(finalPrompt, 'image', sourceImages, virtualNodeId, overrideOptions).catch((err) => {
            const msg = err?.message || '图片生成失败';
            updateShot(nodeId, shot.id, { status: 'failed', errorMsg: msg }, { onlyIfStatus: 'generating' });
        });
    }

export async function handleExpandImageZoom({
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
}, nodeId, zoomLevel) {
        if (cloudDocument) return canvasCloud.unsupported('供应商图像变体/放大');
        const node = nodesMap.get(nodeId);
        if (!node || !node.content) {
            console.warn('拓展图片: 节点不存在或没有图片内容');
            return;
        }

        // 查找 Midjourney 配置（优先使用节点设置中选择的模型）
        const selectedMjModelId = node.settings?.mjModel || 'mj-v7';
        let mjConfig = apiConfigs.find(c => c.id === selectedMjModelId);

        // 如果找不到，尝试查找任何 Midjourney 配置
        if (!mjConfig) {
            mjConfig = apiConfigs.find(c => c.id.includes('mj') || c.provider.toLowerCase().includes('midjourney'));
        }

        if (!mjConfig) {
            canvasAlert(t('请先配置 Midjourney API'));
            setSettingsOpen(true);
            return;
        }

        // V3.4.19: 使用 getApiCredentials 获取凭据
        const credentials = getApiCredentials(mjConfig.id);
        const apiKey = credentials.key;
        const baseUrl = credentials.url;
        if (!apiKey) {
            canvasAlert(t('请先配置 Midjourney API Key'));
            setSettingsOpen(true);
            return;
        }

        try {
            // 1. 上传图片获取 HTTP URL（如果是 data URL）
            let imageUrl = node.content;
            if (imageUrl.startsWith('data:')) {
                const httpUrl = await uploadImageToGetHttpUrl(imageUrl, baseUrl, apiKey);
                if (!httpUrl) {
                    console.error('拓展图片: 图片上传失败，所有方法都失败');
                    canvasAlert(t('图片上传失败，无法进行拓展。请检查网络连接和API配置。'));
                    return;
                }
                imageUrl = httpUrl;
            } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            } else {
                console.warn('拓展图片: 图片URL格式未知:', imageUrl.substring(0, 50));
            }

            // 2. 先提交图片到 Midjourney 获取原始任务ID
            const taskId = Date.now().toString();
            const now = Date.now();

            setHistory((prev) => [{
                id: taskId,
                type: 'image',
                url: '',
                prompt: `Zoom Out ${zoomLevel} x`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'generating',
                progress: 5,
                modelName: 'Midjourney Zoom',
                width: 0,
                height: 0,
                remoteTaskId: null,
                apiConfig: { modelId: 'mj-zoom', baseUrl, apiKey, provider: mjConfig?.provider, useProxy: !!credentials.useProxy },
                provider: mjConfig?.provider,
                useProxy: !!credentials.useProxy,
                sourceNodeId: nodeId,
                startTime: now,
                durationMs: null
            }, ...prev]);
            setHistoryOpen(true);

            // 3. 提交图片到 Midjourney（使用 imagine 接口，不包含 zoom 参数）
            const mjMode = 'fast';
            const imagineEndpoint = `${baseUrl}/${mjMode}/mj/submit/imagine`;
            const imaginePayload = {
                prompt: imageUrl,
                notifyHook: '',
                state: ''
            };

            const imagineResp = await fetch(imagineEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(imaginePayload)
            });

            const imagineText = await imagineResp.text();
            if (!imagineResp.ok) {
                throw new Error(imagineText || `Imagine API error: ${imagineResp.status} `);
            }

            const imagineData = JSON.parse(imagineText);
            if (imagineData.code !== 1 && imagineData.code !== 22) {
                throw new Error(imagineData.description || `Midjourney提交失败: code ${imagineData.code} `);
            }

            const originalTaskId = imagineData.result;
            if (!originalTaskId) throw new Error('未获取到任务ID');


            // 4. 等待原始任务完成（ZOOM操作需要原始任务完成）
            let originalTaskCompleted = false;
            let pollCount = 0;
            const maxPolls = 120; // 最多轮询120次（约10分钟）

            while (!originalTaskCompleted && pollCount < maxPolls) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 每5秒检查一次
                pollCount++;

                try {
                    const statusResp = await fetch(`${baseUrl}/${mjMode}/mj/task/${originalTaskId}/fetch`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const statusText = await statusResp.text();
                    const statusData = JSON.parse(statusText);
                    const status = statusData?.status || '';


                    if (status === 'SUCCESS' || status === 'FINISHED') {
                        originalTaskCompleted = true;
                    } else if (status === 'FAILURE' || status === 'ERROR' || status === 'CANCELLED') {
                        throw new Error(`原始任务失败: ${status}`);
                    }
                } catch (error) {
                    if (pollCount >= maxPolls) {
                        throw new Error('原始任务状态检查超时');
                    }
                    console.warn('拓展图片: 状态检查出错，继续重试', error);
                }
            }

            if (!originalTaskCompleted) {
                throw new Error('原始任务超时，无法执行ZOOM操作');
            }

            // 5. 使用 modal 接口提交 ZOOM 操作
            const modalEndpoint = `${baseUrl}/mj/submit/modal`;
            // ZOOM操作的prompt格式：根据Midjourney文档，使用 --zoomout 参数
            const zoomPrompt = `--zoomout ${zoomLevel}`;
            const modalPayload = {
                taskId: originalTaskId,
                prompt: zoomPrompt
                // maskBase64 可选，ZOOM 不需要蒙版
            };


            const modalResp = await fetch(modalEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(modalPayload)
            });

            const modalText = await modalResp.text();
            if (!modalResp.ok) {
                throw new Error(modalText || `Modal API error: ${modalResp.status}`);
            }

            const modalData = JSON.parse(modalText);
            if (modalData.code !== 1 && modalData.code !== 22) {
                throw new Error(modalData.description || `ZOOM提交失败: code ${modalData.code}`);
            }

            const zoomTaskId = modalData.result;
            if (!zoomTaskId) throw new Error('未获取到ZOOM任务ID');


            // 6. 更新历史记录，保存ZOOM任务ID
            setHistory((prev) => prev.map((hItem) =>
                hItem.id === taskId
                    ? { ...hItem, remoteTaskId: zoomTaskId, status: 'generating', progress: 20 }
                    : hItem
            ));

            // 7. 开始轮询ZOOM任务状态
            pollMidjourneyJob(zoomTaskId, taskId, baseUrl, apiKey, mjMode, 0, 0);
        } catch (error) {
            console.error('拓展图片: 处理失败', error);
            const taskId = Date.now().toString();
            setHistory((prev) => {
                const existing = prev.find(h => h.sourceNodeId === nodeId && h.prompt === `Zoom Out ${zoomLevel}x`);
                if (existing) {
                    return prev.map((hItem) =>
                        hItem.id === existing.id
                            ? { ...hItem, status: 'failed', errorMsg: error.message || '拓展失败' }
                            : hItem
                    );
                }
                return prev;
            });
        }
    }

export async function handleExtractAnalysis({
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
}, nodeId, options = {}) {
        if (cloudDocument) return canvasCloud.textExecute(nodeId, 'extractCharactersScenes', options.inputText ? { scriptText: options.inputText } : {});
        const node = nodesMap.get(nodeId);
        const inputOverride = options.inputText || '';
        const modelOverride = options.modelId || '';

        // 1. 获取输入文本
        let inputText = inputOverride || node?.settings?.content || ''; // 优先使用自身内容（如果有）

        // 如果自身为空，查找连接的输入
        if (!inputText) {
            const incomingConn = connections.find(c => c.to === nodeId);
            if (incomingConn) {
                const sourceNode = nodesMap.get(incomingConn.from);
                if (sourceNode && (sourceNode.type === 'novel-input' || sourceNode.type === 'text-node')) {
                    inputText = sourceNode.settings?.content || sourceNode.content || '';
                }
            }
        }

        if (!inputText || inputText.trim().length === 0) {
            showToast('请先输入小说内容或连接小说输入节点', 'error');
            return;
        }

        // 2. 获取模型配置
        const modelId = resolveModelKey(modelOverride || node?.settings?.model || '');
        if (!modelId) {
            showToast('请先选择分析模型', 'error');
            return;
        }

        const config = getApiConfigByKey(modelId);
        if (!config) {
            showToast('模型配置无效', 'error');
            return;
        }

        // V3.4.19: 使用 getApiCredentials 获取凭据
        const credentials = getApiCredentials(modelId);
        const apiKey = credentials.key;
        if (!apiKey) {
            showToast('请先在设置中配置 API Key', 'error');
            setSettingsOpen(true);
            return;
        }

        if (node?.settings?.model !== modelId) {
            updateNodeSettings(nodeId, { model: modelId });
        }
        setLastUsedExtractModel(modelId);
        try { localStorage.setItem('tapnow_last_extract_model', modelId); } catch { }

        // 3. 更新状态
        updateNodeSettings(nodeId, { isAnalyzing: true, progress: 5, errorMsg: null, analysisResults: null });
        let progressTimer = setInterval(() => {
            setNodes(prev => prev.map(n => {
                if (n.id !== nodeId) return n;
                const current = n.settings?.progress || 0;
                const next = Math.min(current + 7, 92);
                return { ...n, settings: { ...n.settings, progress: next } };
            }));
        }, 500);

        // 4. 构建提示词
        const prompt = `请分析以下小说内容，提取出所有主要角色和关键场景。

小说内容：
${inputText.substring(0, 15000)} ... (截断)

请按以下 JSON 格式返回：
{
    "characters": [
        { "name": "角色名", "role": "身份/职业/设定", "age": "年龄段或岁数", "gender": "性别", "description": "角色外貌和性格描述", "appearance": "外貌特征关键词" }
    ],
    "scenes": [
        { "location": "场景名", "description": "环境描述", "mood": "氛围关键词", "style": "风格关键词" }
    ]
}
只返回 JSON，不要包含 markdown 代码块标记。`;

        try {
            const baseUrl = (credentials.url || DEFAULT_BASE_URL).replace(/\/+$/, '');

            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.modelName || config.id || 'gemini-1.5-pro-latest',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant that analyzes novels.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                let detail = '';
                try {
                    const err = await response.json();
                    detail = err?.error?.message || err?.message || '';
                } catch { }
                if (response.status === 401) {
                    showToast('API Key 无效或未授权（401），请检查配置', 'error', 5000);
                    setSettingsOpen(true);
                }
                throw new Error(`API Error: ${response.status}${detail ? ` - ${detail}` : ''}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || data.content || '';

            // 5. 解析结果并写入节点
            let result = null;
            try {
                const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
                result = JSON.parse(cleanJson);
            } catch (e) {
                console.warn('JSON Parse Error', e);
            }

            const characters = Array.isArray(result?.characters) ? result.characters : [];
            const scenes = Array.isArray(result?.scenes) ? result.scenes : [];

            if (result && (characters.length > 0 || scenes.length > 0)) {
                updateNodeSettings(nodeId, {
                    analysisResults: { characters, scenes },
                    lastAnalyzed: Date.now(),
                    errorMsg: null
                });
                setTimeout(() => {
                    generateFullWorkflow(nodeId, { characters, scenes });
                }, 200);
            } else {
                updateNodeSettings(nodeId, { analysisResults: null, lastAnalyzed: Date.now(), errorMsg: '解析失败或无有效结果' });
                showToast('解析失败：未获得可用的角色/场景数据', 'warning');
            }

        } catch (error) {
            console.error('Extraction Failed', error);
            let msg = error?.message || '提取失败';
            if (error?.name === 'TypeError' || /Failed to fetch|NetworkError/i.test(msg)) {
                msg = '网络或跨域请求失败（CORS）。请检查 API 地址、协议（http/https）或开启浏览器 CORS 插件。';
            }
            updateNodeSettings(nodeId, { errorMsg: msg });
            showToast(`提取失败: ${msg}`, 'error', 5000);
        } finally {
            if (progressTimer) clearInterval(progressTimer);
            setNodes(prev => prev.map(n => n.id === nodeId ? {
                ...n,
                settings: { ...n.settings, isAnalyzing: false, progress: 100 }
            } : n));
            setTimeout(() => updateNodeSettings(nodeId, { progress: 0 }), 800);
        }
    }

export async function handleGeneratePrompts({
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
}, nodeId) {
        if (cloudDocument) return canvasCloud.unsupported('视频识别提示词');
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'video-analyze') return;

        const videoInputNode = getConnectedVideoInputNode(nodeId);
        if (!videoInputNode) {
            canvasAlert(t('请先连接一个视频输入节点'));
            return;
        }

        const selectedKeyframes = videoInputNode.selectedKeyframes || [];
        if (selectedKeyframes.length === 0) {
            canvasAlert(t('请先在视频输入节点中选择关键帧'));
            return;
        }

        const modelId = resolveModelKey(node.settings?.model || 'gemini-3-pro');
        // V3.4.8: 使用 getApiCredentials 获取 Provider 配置
        const { key: apiKey, url: baseUrl } = getApiCredentials(modelId);
        // V3.4.13: 获取完整config用于历史记录显示
        const config = getApiConfigByKey(modelId);

        if (!apiKey) {
            canvasAlert(t('请先在 API 设置中配置 Key'));
            setSettingsOpen(true);
            return;
        }

        const segmentDuration = node.settings?.segmentDuration || 3;
        const groups = groupKeyframesByTime(selectedKeyframes, segmentDuration);

        if (groups.length === 0) {
            canvasAlert(t('无法分组关键帧'));
            return;
        }

        setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, isGenerating: true, analysisResults: [] } : n));

        const allResults = [];
        const videoFileName = videoInputNode.videoFileName || 'video.mp4';
        const videoDuration = videoInputNode.videoMeta?.duration || 0;
        // 保存分析模式，用于判断是否添加到历史记录
        const analysisMode = node.settings?.analysisMode || 'manual';

        try {
            for (let sceneIndex = 0; sceneIndex < groups.length; sceneIndex++) {
                const group = groups[sceneIndex];
                const timeRange = `${group[0].time.toFixed(1)}s-${group[group.length - 1].time.toFixed(1)}s`;

                // 构建多模态消息
                const systemPrompt = `你是一个专业的视频拆解和提示词生成助手。请分析提供的视频关键帧，动态拆解视频内容，并根据用户选中的关键帧生成高质量的AI绘图提示词。

请返回严格的 JSON 格式，结构如下：
{
  "video_id": "${videoFileName}",
  "scene_index": ${sceneIndex + 1},
  "time_range": "${timeRange}",
  "keyframes": [
    {
      "type": "prev",
      "time": 5.2,
      "description": "上一画面内容简介",
      "mj_prompt": "Midjourney 英文提示词",
      "jimeng_prompt": "即梦中文提示词"
    },
    {
      "type": "current",
      "time": 6.8,
      "description": "当前画面内容简介",
      "mj_prompt": "Midjourney 英文提示词",
      "jimeng_prompt": "即梦中文提示词"
    },
    {
      "type": "next",
      "time": 8.7,
      "description": "下一画面内容简介",
      "mj_prompt": "Midjourney 英文提示词",
      "jimeng_prompt": "即梦中文提示词"
    }
  ],
  "global_tags": {
    "style": ["赛博朋克", "末日科幻"],
    "camera": ["低机位", "广角"],
    "color": ["冷暖对比"]
  }
}

要求：
1. 为每个关键帧生成 prev/current/next 三种类型的描述和提示词
2. mj_prompt 使用英文，适合 Midjourney
3. jimeng_prompt 使用中文，适合即梦AI
4. global_tags 提取整个场景的风格、镜头、色彩特征`;

                const userContent = [
                    { type: "text", text: `请分析以下视频关键帧（场景 ${sceneIndex + 1}，时间段：${timeRange}），生成详细的提示词：` }
                ];

                // 添加关键帧图片（限制最多15张，因为API限制是16张，需要留一些余量）
                const maxFrames = 15;
                const framesToSend = group.length > maxFrames ? group.slice(0, maxFrames) : group;
                framesToSend.forEach((frame, idx) => {
                    userContent.push({
                        type: "image_url",
                        image_url: { url: frame.url }
                    });
                    if (idx < framesToSend.length - 1) {
                        userContent.push({ type: "text", text: `关键帧 ${idx + 1}（时间：${frame.time.toFixed(2)}s）` });
                    }
                });
                if (group.length > maxFrames) {
                    userContent.push({ type: "text", text: `注意：该场景共有 ${group.length} 个关键帧，但为了符合API限制，仅发送了前 ${maxFrames} 个关键帧进行分析。` });
                }

                const apiMessages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ];

                // 添加超时控制（60秒）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                let response;
                try {
                    response = await fetch(`${baseUrl}/v1/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: config?.id || 'gemini-3-pro', // V3.7.24: 使用 config.id
                            messages: apiMessages,
                            stream: false
                        }),
                        signal: controller.signal
                    });
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    // 处理网络错误
                    if (fetchError.name === 'AbortError') {
                        throw new Error('请求超时，请检查网络连接或稍后重试');
                    } else if (fetchError.message && fetchError.message.includes('Failed to fetch')) {
                        throw new Error(`无法连接到 API 服务器 (${baseUrl})。请检查：\n1. API 地址是否正确\n2. 网络连接是否正常\n3. API 服务是否可用`);
                    } else {
                        throw new Error(`网络请求失败: ${fetchError.message}`);
                    }
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) {
                    let errText = '';
                    try {
                        errText = await response.text();
                    } catch (e) {
                        errText = `HTTP ${response.status}: ${response.statusText}`;
                    }
                    throw new Error(errText || `API Error: ${response.status}`);
                }

                const data = await response.json();
                console.log('[视频拆解] API 响应数据:', {
                    hasData: !!data,
                    hasChoices: !!data.choices,
                    choicesLength: data.choices?.length,
                    dataKeys: Object.keys(data || {}),
                    model: config?.modelName || config?.id
                });

                // 支持多种响应格式
                let aiContent = null;
                if (data.choices && data.choices.length > 0) {
                    // OpenAI 格式: data.choices[0].message.content
                    aiContent = data.choices[0]?.message?.content;
                } else if (data.data?.choices && data.data.choices.length > 0) {
                    // 嵌套 data.choices 格式
                    aiContent = data.data.choices[0]?.message?.content;
                } else if (data.content) {
                    // 直接 content 字段
                    aiContent = data.content;
                } else if (data.data?.content) {
                    // 嵌套 data.content 格式
                    aiContent = data.data.content;
                } else if (data.text) {
                    // text 字段
                    aiContent = data.text;
                } else if (data.data?.text) {
                    // 嵌套 data.text 格式
                    aiContent = data.data.text;
                } else if (data.message) {
                    // message 字段
                    aiContent = typeof data.message === 'string' ? data.message : data.message.content;
                } else if (data.data?.message) {
                    // 嵌套 data.message 格式
                    aiContent = typeof data.data.message === 'string' ? data.data.message : data.data.message.content;
                } else if (data.result) {
                    // result 字段
                    aiContent = typeof data.result === 'string' ? data.result : data.result.content;
                } else if (data.data?.result) {
                    // 嵌套 data.result 格式
                    aiContent = typeof data.data.result === 'string' ? data.data.result : data.data.result.content;
                }

                if (!aiContent || aiContent.trim() === '' || aiContent === '{}') {
                    console.error('[视频拆解] API 响应内容为空:', data);
                    throw new Error(`API 返回内容为空。响应数据: ${JSON.stringify(data).substring(0, 200)}`);
                }


                // 尝试解析 JSON（可能包含 markdown 代码块）
                let jsonStr = aiContent.trim();
                if (jsonStr.startsWith('```')) {
                    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                }

                let result;
                try {
                    result = JSON.parse(jsonStr);
                } catch (e) {
                    console.error('[视频拆解] 解析 JSON 失败:', e, '内容前500字符:', jsonStr.substring(0, 500));
                    // 尝试修复常见的JSON格式问题
                    try {
                        // 移除可能的注释
                        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
                        // 尝试修复尾随逗号
                        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
                        result = JSON.parse(jsonStr);
                    } catch (e2) {
                        console.error('[视频拆解] JSON修复后仍解析失败:', e2, '原始内容:', jsonStr);
                        // 如果还是失败，创建一个默认结构
                        result = {
                            video_id: videoFileName,
                            scene_index: sceneIndex + 1,
                            time_range: timeRange,
                            keyframes: group.map((frame, fIdx) => ({
                                type: fIdx === 0 ? 'prev' : fIdx === 1 ? 'current' : 'next',
                                time: frame.time,
                                description: `视频帧 ${frame.time.toFixed(1)}s`,
                                mj_prompt: 'A detailed scene from the video',
                                jimeng_prompt: '视频场景描述'
                            })),
                            global_tags: { style: [], camera: [], color: [] }
                        };
                        console.warn('[视频拆解] 使用默认结构，原始内容:', jsonStr.substring(0, 200));
                    }
                }

                allResults.push(result);

                // 更新节点状态
                setNodes((prev) => prev.map((n) => {
                    if (n.id === nodeId) {
                        const currentResults = n.analysisResults || [];
                        const updatedResults = [...currentResults, result];
                        return { ...n, analysisResults: updatedResults };
                    }
                    return n;
                }));

                // 只有自动模式（AI 导演拆解）才添加到历史记录，手动选帧拆解不添加到历史记录
                const isManualMode = analysisMode === 'manual';
                if (!isManualMode) {
                    // 添加到历史记录
                    const taskId = `analyze-${nodeId}-${sceneIndex}-${Date.now()}`;
                    const historyItem = {
                        id: taskId,
                        type: 'analyze',
                        prompt: `视频拆解 - 场景 ${sceneIndex + 1}`,
                        url: group[0]?.url || '',
                        status: 'completed',
                        progress: 100,
                        modelName: config?.provider || 'Gemini 3 Pro',
                        time: new Date().toLocaleString('zh-CN'),
                        sourceNodeId: nodeId,
                        analysisResult: result,
                        videoFileName,
                        sceneIndex: sceneIndex + 1,
                        timeRange
                    };

                    setHistory((prev) => [historyItem, ...prev]);
                }
            }

            // 确保所有结果都已更新到节点
            setNodes((prev) => prev.map((n) => {
                if (n.id === nodeId) {
                    // 确保使用最新的 allResults
                    const finalResults = allResults.length > 0 ? allResults : (n.analysisResults || []);
                    return { ...n, isGenerating: false, analysisResults: finalResults };
                }
                return n;
            }));

        } catch (error) {
            console.error('生成提示词失败:', error);
            const errorMsg = error.message || '未知错误';
            setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, isGenerating: false, errorMsg: errorMsg } : n));
            // 不显示 alert，错误信息已经在节点上显示
            // canvasAlert(`生成提示词失败: ${errorMsg}`);
        }
    }

export async function handleAutoVideoAnalysis({
    cloudDocument,
    canvasCloud,
    apiConfigs,
    createStoryboardFromAnalysisResult,
    getApiCredentials,
    getConnectedVideoInputNode,
    nodesMap,
    setNodes,
    setSettingsOpen,
}, nodeId) {
        if (cloudDocument) return canvasCloud.unsupported('视频分析');
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'video-analyze') return;

        const videoInputNode = getConnectedVideoInputNode(nodeId);
        if (!videoInputNode || !videoInputNode.content) {
            canvasAlert(t('请先连接一个包含视频的视频输入节点'));
            return;
        }

        // 预处理视频内容：如果是 blob: URL，需要转换为 base64 以便远程可访问
        let videoDataUrl = videoInputNode.content;
        if (videoDataUrl.startsWith('blob:')) {
            try {
                const blob = await fetch(videoDataUrl).then(r => r.blob());
                videoDataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = () => reject(new Error('FileReader failed'));
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.error('Blob conversion failed', e);
                canvasAlert(t('视频转换失败，无法发送给 AI'));
                return;
            }
        }

        // 强制使用 gemini-3-pro 模型（支持视频输入）
        let config = apiConfigs.find((c) => c.id === 'gemini-3-pro' && isChatModelType(c.type));

        // 如果没有找到 gemini-3-pro，尝试其他 gemini 模型
        if (!config) {
            config = apiConfigs.find((c) => {
                const modelId = c.id?.toLowerCase() || '';
                return modelId.includes('gemini') && isChatModelType(c.type);
            });
        }

        // 如果还是没有，使用默认配置
        if (!config) {
            config = apiConfigs.find((c) => isChatModelType(c.type));
        }

        // V3.4.8: 使用 getApiCredentials 获取 Provider 配置
        const { key: apiKey, url: baseUrl } = getApiCredentials(config?.id || 'gemini-3-pro');

        if (!apiKey) {
            canvasAlert(t('请先在 API 设置中配置 Key'));
            setSettingsOpen(true);
            return;
        }

        setNodes((prev) => prev.map((n) =>
            n.id === nodeId
                ? { ...n, isGenerating: true, settings: { ...n.settings, voiceoverResults: [], analysisResults: [] } }
                : n
        ));

        try {
            const systemPrompt = `你是一位世界级的**游戏买量视频拆解专家**和**AI视觉导演**。你需要同时完成两项任务：

1. **视觉拆解**：分析视频的每一个分镜，推测其运镜手法（推拉摇移）、画面动态、人物关系。

2. **听觉提取**：提取视频中的口播文案（Voiceover）。

请按时间顺序，将视频拆解为多个关键场景，并返回如下 **JSON 格式**（不要包含Markdown代码块标记）：

{
  "voiceover_script": [
    { "time_range": "0s-3s", "text": "提取的口播文案..." }
  ],
  "scenes": [
    {
      "scene_id": 1,
      "time_range": "0s-2.5s",
      "visual_analysis": {
        "camera_movement": "详细描述运镜，例如：镜头瞬间快速拉远(Dolly Zoom Out)，或 环绕拍摄(Orbit)",
        "subject_dynamics": "描述主体动作，例如：角色从王座上猛然站起，披风飞扬",
        "atmosphere": "赛博朋克，冷峻，高科技感"
      },
      "prompts": {
        "jimeng_prompt": "即梦提示词：一定要包含运镜描述。格式：(运镜描述)+画面主体+环境+风格。例如：(镜头急速拉远)，一名黑发年轻男子坐在虚拟王座上，身穿黑色长风衣...",
        "mj_prompt": "Midjourney Prompt: English description, include camera directives like 'dynamic angle', 'fast zoom out', 'cinematic lighting'..."
      }
    }
  ]
}

**重要要求：**
- **运镜分析**要非常精准。
- **即梦提示词**必须将"运镜描述"放在最前面，用括号括起来。
- **口播提取**要依靠视频中的音频内容，如果视频没有声音则留空。`;

            // 直接使用视频 URL（gemini-3-pro 支持视频输入）
            const userContent = [
                { type: "text", text: t('请分析这段视频。请严格按JSON格式输出拆解报告。') },
                { type: "image_url", image_url: { url: videoDataUrl } }
            ];

            const apiMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ];

            // 添加超时控制（120秒，因为视频分析需要更长时间）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);

            let response;
            try {
                response = await fetch(`${baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: config?.id || 'gemini-3-pro', // V3.7.24: 使用 config.id 而非 modelName
                        messages: apiMessages,
                        stream: false
                    }),
                    signal: controller.signal
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                // 处理网络错误
                if (fetchError.name === 'AbortError') {
                    throw new Error('请求超时（120秒），视频分析可能需要更长时间，请稍后重试');
                } else if (fetchError.message && fetchError.message.includes('Failed to fetch')) {
                    throw new Error(`无法连接到 API 服务器 (${baseUrl})。请检查：\n1. API 地址是否正确\n2. 网络连接是否正常\n3. API 服务是否可用\n4. 是否配置了正确的 API Key`);
                } else {
                    throw new Error(`网络请求失败: ${fetchError.message}`);
                }
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                let errText = '';
                try {
                    errText = await response.text();
                } catch (e) {
                    errText = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(errText || `API Error: ${response.status}`);
            }

            const data = await response.json();
            console.log('[AI导演拆解] API 响应数据:', {
                hasData: !!data,
                hasChoices: !!data.choices,
                choicesLength: data.choices?.length,
                dataKeys: Object.keys(data || {}),
                model: config?.modelName || config?.id
            });

            // 支持多种响应格式
            let aiContent = null;
            if (data.choices && data.choices.length > 0) {
                // OpenAI 格式: data.choices[0].message.content
                aiContent = data.choices[0]?.message?.content;
            } else if (data.data?.choices && data.data.choices.length > 0) {
                // 嵌套 data.choices 格式
                aiContent = data.data.choices[0]?.message?.content;
            } else if (data.content) {
                // 直接 content 字段
                aiContent = data.content;
            } else if (data.data?.content) {
                // 嵌套 data.content 格式
                aiContent = data.data.content;
            } else if (data.text) {
                // text 字段
                aiContent = data.text;
            } else if (data.data?.text) {
                // 嵌套 data.text 格式
                aiContent = data.data.text;
            } else if (data.message) {
                // message 字段
                aiContent = typeof data.message === 'string' ? data.message : data.message.content;
            } else if (data.data?.message) {
                // 嵌套 data.message 格式
                aiContent = typeof data.data.message === 'string' ? data.data.message : data.data.message.content;
            } else if (data.result) {
                // result 字段
                aiContent = typeof data.result === 'string' ? data.result : data.result.content;
            } else if (data.data?.result) {
                // 嵌套 data.result 格式
                aiContent = typeof data.data.result === 'string' ? data.data.result : data.data.result.content;
            }

            if (!aiContent || aiContent.trim() === '' || aiContent === '{}') {
                console.error('[AI导演拆解] API 响应内容为空:', data);
                throw new Error(`API 返回内容为空。响应数据: ${JSON.stringify(data).substring(0, 200)}`);
            }


            // 解析 JSON
            let jsonStr = aiContent.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            let result;
            try {
                result = JSON.parse(jsonStr);
            } catch (e) {
                console.error('[AI导演拆解] 解析 JSON 失败:', e, '内容前500字符:', jsonStr.substring(0, 500));
                // 尝试修复
                try {
                    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
                    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
                    result = JSON.parse(jsonStr);
                } catch (e2) {
                    console.error('[AI导演拆解] JSON修复后仍解析失败:', e2, '原始内容:', jsonStr.substring(0, 500));
                    throw new Error(`模型返回的不是有效的 JSON 格式。原始内容: ${jsonStr.substring(0, 200)}`);
                }
            }

            // 处理 voiceover_script，转换为 voiceoverResults 格式
            const voiceoverResults = (result.voiceover_script || []).map((v, idx) => ({
                time: idx,
                text: v.text || ''
            }));

            // 处理 scenes，转换为 analysisResults 格式
            const analysisResults = (result.scenes || []).map((scene, idx) => ({
                scene_index: scene.scene_id || idx + 1,
                time_range: scene.time_range || '',
                keyframes: [{
                    type: 'current',
                    time: 0,
                    description: `${scene.visual_analysis?.camera_movement || ''} ${scene.visual_analysis?.subject_dynamics || ''}`.trim(),
                    mj_prompt: scene.prompts?.mj_prompt || '',
                    jimeng_prompt: scene.prompts?.jimeng_prompt || ''
                }],
                global_tags: {
                    style: scene.visual_analysis?.atmosphere ? [scene.visual_analysis.atmosphere] : [],
                    camera: scene.visual_analysis?.camera_movement ? [scene.visual_analysis.camera_movement] : [],
                    color: []
                }
            }));

            // 更新节点状态
            setNodes((prev) => prev.map((n) => {
                if (n.id === nodeId) {
                    return {
                        ...n,
                        isGenerating: false,
                        settings: {
                            ...n.settings,
                            voiceoverResults,
                            analysisResults
                        }
                    };
                }
                return n;
            }));

            // 自动创建分镜表节点
            if (analysisResults.length > 0) {
                setTimeout(() => {
                    createStoryboardFromAnalysisResult(nodeId, analysisResults);
                }, 100); // 延迟100ms确保节点状态已更新
            }

        } catch (error) {
            console.error('AI视频分析失败:', error);
            const errorMsg = error.message || 'AI视频分析失败';
            setNodes((prev) => prev.map((n) =>
                n.id === nodeId
                    ? { ...n, isGenerating: false, errorMsg: errorMsg }
                    : n
            ));
            // 不显示 alert，错误信息已经在节点上显示
            // canvasAlert(`AI视频分析失败: ${errorMsg}`);
        }
    }

export async function splitGridImage({}, imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const timeout = setTimeout(() => {
                reject(new Error('图片加载超时'));
            }, 30000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // 九宫格是3x3网格，每张图是原图的1/3
                    const singleWidth = Math.floor(img.width / 3);
                    const singleHeight = Math.floor(img.height / 3);

                    const images = [];

                    // 切割9张图：按从上到下、从左到右的顺序（1-9）
                    const cropPromises = [];

                    for (let row = 0; row < 3; row++) {
                        for (let col = 0; col < 3; col++) {
                            const cropX = Math.max(0, Math.min(col * singleWidth, img.width - singleWidth));
                            const cropY = Math.max(0, Math.min(row * singleHeight, img.height - singleHeight));
                            const cropW = Math.min(singleWidth, img.width - cropX);
                            const cropH = Math.min(singleHeight, img.height - cropY);

                            const cropCanvas = document.createElement('canvas');
                            cropCanvas.width = cropW;
                            cropCanvas.height = cropH;
                            const cropCtx = cropCanvas.getContext('2d');

                            cropCtx.fillStyle = '#ffffff';
                            cropCtx.fillRect(0, 0, cropW, cropH);

                            cropCtx.drawImage(
                                img,
                                cropX, cropY, cropW, cropH,
                                0, 0, cropW, cropH
                            );

                            // 使用 toDataURL 替代 toBlob，避免 Blob URL 持久化问题
                            try {
                                const dataUrl = cropCanvas.toDataURL('image/png');
                                cropPromises.push(Promise.resolve({
                                    url: dataUrl,
                                    width: cropW,
                                    height: cropH
                                }));
                            } catch (e) {
                                console.error('Canvas toDataURL 失败:', e);
                            }
                        }
                    }

                    // 等待所有切割完成
                    Promise.all(cropPromises).then((results) => {
                        resolve(results);
                    }).catch((error) => {
                        reject(error);
                    });
                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('图片加载失败'));
            };

            img.src = imageUrl;
        });
    }

export async function handleSplitGridImage({
    nodesRef,
    selectedNodeIdRef,
    setNodes,
    splitGridImage,
}) {
        const currentSelectedId = selectedNodeIdRef.current;
        if (!currentSelectedId) {
            canvasAlert(t('请先选中一个图片节点'));
            return;
        }

        const targetNode = nodesRef.current.find(n => n.id === currentSelectedId);
        if (!targetNode) {
            canvasAlert(t('未找到选中的节点'));
            return;
        }

        const imageUrl = targetNode.content;
        if (!imageUrl) {
            canvasAlert(t('选中的节点没有图片内容'));
            return;
        }

        try {
            // 切割图片
            const croppedImages = await splitGridImage(imageUrl);

            if (croppedImages.length !== 9) {
                canvasAlert(t('切割失败：未能生成9张图片'));
                return;
            }

            // 获取原节点的位置和尺寸
            const sourceX = targetNode.x;
            const sourceY = targetNode.y;
            const sourceWidth = targetNode.width || 260;
            const nodeWidth = 260;
            const nodeHeight = 260;
            const spacing = 20;

            const cols = 3;
            const rows = 3;

            // 计算起始位置：位于原图的右侧开始排列
            const startX = sourceX + sourceWidth + spacing;
            const startY = sourceY;

            // 创建9个新节点
            const newNodes = [];
            for (let i = 0; i < croppedImages.length; i++) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = startX + col * (nodeWidth + spacing);
                const y = startY + row * (nodeHeight + spacing);

                const newNode = {
                    id: `node-${Date.now()}-${i}`,
                    type: 'input-image',
                    x: x,
                    y: y,
                    width: nodeWidth,
                    height: nodeHeight,
                    content: croppedImages[i].url,
                    dimensions: { w: croppedImages[i].width, h: croppedImages[i].height }
                };
                newNodes.push(newNode);
            }

            setNodes(prev => [...prev, ...newNodes]);
            // 静默创建，不显示成功提示
        } catch (error) {
            canvasAlert('切割失败: ' + error.message);
        }
    }

export async function handleSplitGridFromUrl({
    screenToWorld,
    selectedNodeIdsRef,
    setNodes,
    splitGridImage,
}, imageUrl, options = {}) {
        if (!imageUrl) return;
        const {
            originX,
            originY,
            cols = 3,
            spacing = 20,
            nodeWidth = 260,
            nodeHeight = 260,
            replaceSelected = false, // 是否替换已选中的节点
        } = options;

        try {
            const croppedImages = await splitGridImage(imageUrl);
            if (croppedImages.length !== 9) {
                canvasAlert(t('切割失败：未能生成9张图片'));
                return;
            }

            // 检查是否有框选的节点需要替换
            const currentSelectedIds = selectedNodeIdsRef.current;
            if (replaceSelected && currentSelectedIds && currentSelectedIds.size === 9) {
                // 替换模式：更新已选中的9个节点
                const selectedIdsArray = Array.from(currentSelectedIds);
                setNodes(prev => prev.map(node => {
                    const index = selectedIdsArray.indexOf(node.id);
                    if (index !== -1 && index < croppedImages.length) {
                        // 替换节点内容，保持位置和大小
                        return {
                            ...node,
                            content: croppedImages[index].url,
                            dimensions: {
                                w: croppedImages[index].width,
                                h: croppedImages[index].height
                            }
                        };
                    }
                    return node;
                }));
                // 静默替换，不显示提示
                return;
            }

            // 创建新节点模式（原有逻辑）
            const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
            const startX = originX !== undefined ? originX : world.x;
            const startY = originY !== undefined ? originY : world.y;
            const newNodes = [];
            for (let i = 0; i < croppedImages.length; i++) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = startX + col * (nodeWidth + spacing);
                const y = startY + row * (nodeHeight + spacing);
                newNodes.push({
                    id: `node-${Date.now()}-${i}`,
                    type: 'input-image',
                    x,
                    y,
                    width: nodeWidth,
                    height: nodeHeight,
                    content: croppedImages[i].url,
                    dimensions: { w: croppedImages[i].width, h: croppedImages[i].height }
                });
            }
            setNodes(prev => [...prev, ...newNodes]);
            // 静默创建，不显示成功提示
        } catch (e) {
            canvasAlert('切割失败: ' + e.message);
        }
    }

export function autoArrangeNodes({
    connectionsRef, nodesRef, selectedNodeIdRef, selectedNodeIdsRef,
    setNodes, saveToUndoStack, notify,
}) {
    const result = arrangeCanvasNodes(nodesRef.current, connectionsRef.current, selectedNodeIdsRef.current, selectedNodeIdRef.current);
    if (result.count < 2) {
        notify('info', t(result.count === 0 ? '画布暂无可整理的节点' : '请至少选择两个节点，或取消选择后整理全部节点'));
        return;
    }
    if (!result.changed) {
        notify('info', t('节点已排列整齐，无需重复整理'));
        return;
    }
    saveToUndoStack();
    const positions = new Map(result.nodes.filter((node, index) => node !== nodesRef.current[index]).map(node => [node.id, { x: node.x, y: node.y }]));
    setNodes(previous => previous.map(node => {
        const position = positions.get(node.id);
        return !position || (node.x === position.x && node.y === position.y) ? node : { ...node, ...position };
    }));
    notify('success', t('已整理 {{count}} 个节点，可撤销', { count: result.count }));
}

export async function handleVideoDrop({
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
}, nodeId, e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('drag-over');

        const payload = getHistoryDragPayload(e);
        if (payload) {
            const dragUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            if (dragUrl) {
                const isVideo = payload.type === 'video' || isVideoUrl(dragUrl);
                if (isVideo) {
                    let videoMeta = { duration: 0, w: 0, h: 0 };
                    try {
                        const metaUrl = await resolveUrlForMediaMeta(dragUrl);
                        videoMeta = await getVideoMetadata(metaUrl);
                    } catch { }
                    saveToUndoStack();
                    setNodes(prev => prev.map(n =>
                        n.id === nodeId
                            ? { ...n, content: dragUrl, videoMeta, frames: [], selectedKeyframes: [], extractingFrames: false, videoFileName: '' }
                            : n
                    ));
                } else {
                    insertKeyframesFromUrls(nodeId, [dragUrl]);
                }
                return;
            }
        }

        const dragUrlCandidate = resolveDroppedUrlCandidate(getDragUrlCandidate(e));
        if (dragUrlCandidate) {
            if (isVideoUrl(dragUrlCandidate)) {
                let videoMeta = { duration: 0, w: 0, h: 0 };
                try {
                    const metaUrl = await resolveUrlForMediaMeta(dragUrlCandidate);
                    videoMeta = await getVideoMetadata(metaUrl);
                } catch { }
                saveToUndoStack();
                setNodes(prev => prev.map(n =>
                    n.id === nodeId
                        ? { ...n, content: dragUrlCandidate, videoMeta, frames: [], selectedKeyframes: [], extractingFrames: false, videoFileName: '' }
                        : n
                ));
            } else {
                insertKeyframesFromUrls(nodeId, [dragUrlCandidate]);
            }
            return;
        }

        const files = Array.from(e.dataTransfer.files);

        // V3.5.17：处理视频文件
        const videoFile = files.find(file => file.type.startsWith('video/'));
        if (videoFile) {
            handleVideoFileUpload(nodeId, videoFile);
            return;
        }

        // V3.5.17：处理图像文件，将其作为关键帧加入关键帧整理器
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        // V3.5.19：按文件名自然排序（1、2、10）
        imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (imageFiles.length > 0) {
            // 从节点中取得现有数据
            const existingNode = nodesMap.get(nodeId);
            const existingFrames = existingNode?.frames || [];
            const existingKeyframes = existingNode?.selectedKeyframes || [];

            // 读取全部图像并保存到 IndexedDB，避免超出 localStorage 配额
            let loadedCount = 0;
            const newKeyframes = [];

            imageFiles.forEach((file, idx) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64Data = ev.target.result;

                    // 保存到 IndexedDB 并取得 img_id
                    const imgId = await LocalImageManager.saveImage(base64Data);

                    newKeyframes[idx] = {
                        time: existingFrames.length + idx,  // 使用帧数量作为时间值
                        url: imgId,  // 存储 img_id 而不是 base64
                        filename: file.name
                    };
                    loadedCount++;

                    // 所有图像加载完成后一次性更新节点
                    if (loadedCount === imageFiles.length) {
                        const validKeyframes = newKeyframes.filter(Boolean);
                        setNodes(prev => prev.map(n =>
                            n.id === nodeId
                                ? {
                                    ...n,
                                    frames: [...existingFrames, ...validKeyframes],  // 添加到帧列表用于展示
                                    selectedKeyframes: [...existingKeyframes, ...validKeyframes]  // 同时设为预选状态
                                }
                                : n
                        ));
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    }

export function handleKeyframeListDrop({
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
}, nodeId, e) {
        e.preventDefault();
        e.stopPropagation();

        // 计算插入索引
        let insertIdx = (dragInsertNodeId === nodeId && dragInsertIndex !== null)
            ? dragInsertIndex
            : (nodesMap.get(nodeId)?.frames || []).length;

        // 重置拖拽状态
        setDragInsertNodeId(null);
        setDragInsertIndex(null);

        const payload = getHistoryDragPayload(e);
        if (payload) {
            const dragUrl = resolveDroppedUrlCandidate(resolveHistoryPayloadUrl(payload), payload.type);
            if (dragUrl && !(payload.type === 'video' || isVideoUrl(dragUrl))) {
                insertKeyframesFromUrls(nodeId, [dragUrl], insertIdx);
            }
            return;
        }

        const dragUrlCandidate = resolveDroppedUrlCandidate(getDragUrlCandidate(e));
        if (dragUrlCandidate && !isVideoUrl(dragUrlCandidate)) {
            insertKeyframesFromUrls(nodeId, [dragUrlCandidate], insertIdx);
            return;
        }

        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;

        // 按文件名排序
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        const existingNode = nodesMap.get(nodeId);
        const existingFrames = existingNode?.frames || [];
        const existingKeyframes = existingNode?.selectedKeyframes || [];

        let loadedCount = 0;
        const newKeyframes = [];

        files.forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64Data = ev.target.result;
                const imgId = await LocalImageManager.saveImage(base64Data);

                // V3.7.6：立即创建 Blob URL 以便显示
                let displayUrl = base64Data; // 回退为 base64
                try {
                    const blob = await LocalImageManager.getImage(imgId);
                    if (blob) displayUrl = URL.createObjectURL(blob);
                } catch (e) {
                    console.warn('[KeyframeOrganizer] Failed to create blob URL, using base64:', e);
                }

                newKeyframes[idx] = {
                    time: Date.now() + idx,
                    url: displayUrl,
                    imgId: imgId, // 保留 ID 用于持久化
                    filename: file.name
                };
                loadedCount++;

                if (loadedCount === files.length) {
                    const validNewFrames = newKeyframes.filter(Boolean);

                    // 插入帧数组
                    const updatedFrames = [
                        ...existingFrames.slice(0, insertIdx),
                        ...validNewFrames,
                        ...existingFrames.slice(insertIdx)
                    ];

                    // 识别哪些关键帧应该被选中（现有选中的 + 新添加的）
                    const framesToSelect = new Set([...existingKeyframes, ...validNewFrames]);

                    // 根据索引重新计算时间（标准化） - 这一步会创建带有新时间的新对象
                    const normalizedFrames = updatedFrames.map((f, i) => ({ ...f, time: i }));

                    // 从 normalizedFrames 重新构建 selectedKeyframes，确保它们匹配新的对象/时间
                    // 我们利用 updatedFrames（源引用）和 normalizedFrames 之间的索引对齐
                    // 逻辑：如果 updatedFrames[i]（原始对象）在 framesToSelect 集合中，则选中对应的 normalizedFrames[i]（新对象）
                    const newSelectedKeyframes = normalizedFrames.filter((_, i) => framesToSelect.has(updatedFrames[i]));

                    setNodes(prev => prev.map(n =>
                        n.id === nodeId
                            ? {
                                ...n,
                                frames: normalizedFrames,
                                selectedKeyframes: newSelectedKeyframes
                            }
                            : n
                    ));
                }
            };
            reader.readAsDataURL(file);
        });
    }

export async function detectScenesAndCapture({}, videoUrl, threshold = 30) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.crossOrigin = "anonymous";
            video.src = videoUrl;
            video.muted = true;

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            const keyframes = [];
            let prevData = null;

            video.onloadeddata = async () => {
                canvas.width = 320;
                canvas.height = Math.floor(320 * (video.videoHeight / video.videoWidth));

                const duration = video.duration;
                const sampleRate = 2;

                video.currentTime = 0;

                const scan = async () => {
                    // 检查是否已经扫描完成
                    const currentTime = video.currentTime;
                    if (currentTime >= duration || Math.abs(currentTime - duration) < 0.01) {
                        // 确保最后一帧也被包含
                        if (keyframes.length === 0 || parseFloat(keyframes[keyframes.length - 1].time) < duration - 0.5) {
                            const hdCanvas = document.createElement('canvas');
                            hdCanvas.width = video.videoWidth;
                            hdCanvas.height = video.videoHeight;
                            const hdCtx = hdCanvas.getContext('2d');
                            video.currentTime = Math.max(0, duration - 0.1);
                            await new Promise(r => {
                                const timeout = setTimeout(() => r(), 200);
                                video.onseeked = () => {
                                    clearTimeout(timeout);
                                    hdCtx.drawImage(video, 0, 0);
                                    const lastTime = Math.max(0, duration - 0.1);
                                    keyframes.push({
                                        time: lastTime.toFixed(2),
                                        image: hdCanvas.toDataURL('image/jpeg', 0.8)
                                    });
                                    r();
                                };
                            });
                        }
                        resolve(keyframes.map(kf => ({ time: parseFloat(kf.time), url: kf.image })));
                        return;
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                    if (prevData) {
                        let diff = 0;
                        for (let i = 0; i < frameData.length; i += 4) {
                            diff += Math.abs(frameData[i] - prevData[i]) +
                                Math.abs(frameData[i + 1] - prevData[i + 1]) +
                                Math.abs(frameData[i + 2] - prevData[i + 2]);
                        }
                        const avgDiff = diff / (frameData.length / 4 * 3);

                        if (avgDiff > threshold) {
                            const hdCanvas = document.createElement('canvas');
                            hdCanvas.width = video.videoWidth;
                            hdCanvas.height = video.videoHeight;
                            hdCanvas.getContext('2d').drawImage(video, 0, 0);
                            const dataUrl = hdCanvas.toDataURL('image/jpeg', 0.8);

                            // 确保使用实际的currentTime，而不是字符串
                            const captureTime = video.currentTime;
                            keyframes.push({
                                time: captureTime.toFixed(2),
                                image: dataUrl
                            });
                            prevData = null;
                        } else {
                            prevData = frameData;
                        }
                    } else {
                        // 第一帧，记录当前时间（确保使用实际的currentTime）
                        prevData = frameData;
                        const currentTime = video.currentTime;
                        const hdCanvas = document.createElement('canvas');
                        hdCanvas.width = video.videoWidth;
                        hdCanvas.height = video.videoHeight;
                        hdCanvas.getContext('2d').drawImage(video, 0, 0);
                        keyframes.push({
                            time: currentTime.toFixed(2),
                            image: hdCanvas.toDataURL('image/jpeg', 0.8)
                        });
                    }

                    // 更新到下一个采样点
                    const nextTime = video.currentTime + (1 / sampleRate);
                    if (nextTime >= duration) {
                        // 确保最后一帧也被包含
                        if (keyframes.length === 0 || parseFloat(keyframes[keyframes.length - 1].time) < duration - 0.5) {
                            const hdCanvas = document.createElement('canvas');
                            hdCanvas.width = video.videoWidth;
                            hdCanvas.height = video.videoHeight;
                            const hdCtx = hdCanvas.getContext('2d');
                            video.currentTime = Math.max(0, duration - 0.1);
                            await new Promise(r => {
                                const timeout = setTimeout(() => r(), 200);
                                video.onseeked = () => {
                                    clearTimeout(timeout);
                                    hdCtx.drawImage(video, 0, 0);
                                    const lastTime = Math.max(0, duration - 0.1);
                                    keyframes.push({
                                        time: lastTime.toFixed(2),
                                        image: hdCanvas.toDataURL('image/jpeg', 0.8)
                                    });
                                    r();
                                };
                            });
                        }
                        resolve(keyframes.map(kf => ({ time: parseFloat(kf.time), url: kf.image })));
                        return;
                    }
                    video.currentTime = nextTime;
                    await new Promise(r => {
                        const timeout = setTimeout(() => r(), 200); // 超时保护
                        video.onseeked = () => {
                            clearTimeout(timeout);
                            r();
                        };
                    });
                    scan();
                };

                scan();
            };

            video.onerror = (e) => reject(new Error("视频加载失败，请检查格式或跨域设置"));
        });
    }

export async function handleExtractVoiceover({
    cloudDocument,
    canvasCloud,
    getApiCredentials,
    getConnectedVideoInputNode,
    nodesMap,
    setNodes,
    setSettingsOpen,
}, nodeId) {
        if (cloudDocument) return canvasCloud.unsupported('音频转写');
        const node = nodesMap.get(nodeId);
        if (!node || node.type !== 'video-analyze') return;

        const videoInputNode = getConnectedVideoInputNode(nodeId);
        if (!videoInputNode || !videoInputNode.content) {
            canvasAlert(t('请先连接一个包含视频的视频输入节点'));
            return;
        }

        const modelId = node.settings?.model || 'gemini-3-pro';
        // V3.4.8: 使用 getApiCredentials 获取 Provider 配置
        const { key: apiKey, url: baseUrl } = getApiCredentials(modelId);

        if (!apiKey) {
            canvasAlert(t('请先在 API 设置中配置 Key'));
            setSettingsOpen(true);
            return;
        }

        setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, isExtractingVoiceover: true, voiceoverResults: [] } : n));

        const videoFileName = videoInputNode.videoFileName || 'video.mp4';
        const videoDuration = videoInputNode.videoMeta?.duration || 0;

        try {
            // 构建多模态消息，请求提取口播文案
            const systemPrompt = `你是一个专业的视频口播文案提取助手。请分析提供的视频，提取每一秒的口播内容。

请返回严格的 JSON 格式，结构如下：
{
  "video_id": "${videoFileName}",
  "duration": ${videoDuration},
  "voiceover": [
    {
      "time": 0,
      "text": "第一秒的口播内容"
    },
    {
      "time": 1,
      "text": "第二秒的口播内容"
    },
    {
      "time": 2,
      "text": "第三秒的口播内容"
    }
  ]
}

要求：
1. 按秒为单位提取口播内容
2. 如果某一秒没有口播，text 字段为空字符串
3. 准确记录每一秒的说话内容
4. 只提取口播文案，不要添加其他描述`;

            // 从视频中提取关键帧用于分析（每5秒一帧，避免太多）
            const sampleFrames = [];
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.src = videoInputNode.content;
            video.muted = true;

            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');

                    let currentTime = 0;
                    const extractFrame = async () => {
                        if (currentTime >= videoDuration) {
                            resolve();
                            return;
                        }

                        video.currentTime = currentTime;
                        await new Promise((r) => {
                            video.onseeked = () => {
                                ctx.drawImage(video, 0, 0);
                                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                                sampleFrames.push({
                                    time: currentTime,
                                    url: dataUrl
                                });
                                currentTime += 5; // 每5秒一帧
                                setTimeout(r, 50);
                            };
                        });
                        extractFrame();
                    };
                    extractFrame();
                };
            });

            // 构建用户消息，包含视频帧
            const userContent = [
                { type: "text", text: `请分析以下视频，提取每一秒的口播文案。视频总时长：${videoDuration.toFixed(1)}秒。` }
            ];

            // 添加关键帧（每5秒一帧，避免太多）
            sampleFrames.forEach((frame) => {
                userContent.push({
                    type: "image_url",
                    image_url: { url: frame.url }
                });
                userContent.push({
                    type: "text",
                    text: `时间点：${frame.time.toFixed(1)}秒`
                });
            });

            const apiMessages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ];

            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config?.id || 'gemini-3-pro', // V3.7.24: 使用 config.id
                    messages: apiMessages,
                    stream: false
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `API Error: ${response.status}`);
            }

            const data = await response.json();
            const aiContent = data.choices?.[0]?.message?.content || "{}";

            // 解析 JSON
            let jsonStr = aiContent.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            let result;
            try {
                result = JSON.parse(jsonStr);
            } catch (e) {
                console.error('解析 JSON 失败:', e, jsonStr);
                // 尝试修复
                try {
                    jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
                    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
                    result = JSON.parse(jsonStr);
                } catch (e2) {
                    throw new Error('模型返回的不是有效的 JSON 格式');
                }
            }

            // 更新节点状态
            setNodes((prev) => prev.map((n) =>
                n.id === nodeId
                    ? { ...n, isExtractingVoiceover: false, voiceoverResults: result.voiceover || [] }
                    : n
            ));

        } catch (error) {
            console.error('提取口播文案失败', error);
            setNodes((prev) => prev.map((n) =>
                n.id === nodeId
                    ? { ...n, isExtractingVoiceover: false, errorMsg: error.message || '提取口播文案失败' }
                    : n
            ));
        }
    }
