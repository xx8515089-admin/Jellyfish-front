import { canvasAlert } from '../canvasDialogs';
import {
    t,
    dataUrlToBlob,
    TRANSPORT_HTTP_JSON,
    TRANSPORT_HTTP_SSE,
    TRANSPORT_WS_STREAM,
    DEFAULT_TRANSPORT_OPTIONS,
    getDefaultRequestTemplateForType,
    normalizeRequestTemplate,
    normalizeTransportMode,
    normalizeTransportOptions,
    validateModelLibraryContract,
    normalizeRequestChainStep,
    normalizeRequestChain,
    normalizeRequestOverridePatch,
    getValueByPathLoose,
    resolveTemplateValue,
    buildRequestFromTemplate,
    applyRequestOverridePatch,
    coerceFormDataFromObject
} from '../freeCanvasShared';

export function appendChatFiles({
    setChatFiles,
}, files) {
        const fileList = Array.from(files || []);
        fileList.forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const content = ev.target.result;
                const fileExt = file.name.split('.').pop()?.toLowerCase() || '';

                // 判断文件类型
                const isImage = file.type.startsWith('image/');
                const isVideo = file.type.startsWith('video/');
                const isAudio = file.type.startsWith('audio/');
                const isPDF = file.type === 'application/pdf' || fileExt === 'pdf';
                const isDoc = ['doc', 'docx'].includes(fileExt) || file.type.includes('word');
                const isExcel = ['xls', 'xlsx'].includes(fileExt) || file.type.includes('excel') || file.type.includes('spreadsheet');
                const isCode = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'md', 'txt', 'sh', 'bash'].includes(fileExt);

                setChatFiles(prev => [...prev, {
                    name: file.name,
                    type: file.type,
                    content: content,
                    isImage,
                    isVideo,
                    isAudio,
                    isPDF,
                    isDoc,
                    isExcel,
                    isCode,
                    fileExt
                }]);
            };

            // 根据文件类型选择读取方式
            if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
                reader.readAsDataURL(file);
            } else if (file.type === 'application/pdf') {
                // PDF 也转换为 data URL
                reader.readAsDataURL(file);
            } else if (file.name.match(/\.(txt|md|js|jsx|ts|tsx|py|html|css|json|csv|xml|yaml|yml|sh|bash|java|cpp|c)$/i)) {
                // 代码和文本文件读取为文本
                reader.readAsText(file);
            } else {
                // 其他文件（如 Word、Excel）也尝试读取为 data URL
                reader.readAsDataURL(file);
            }
        });
    }

export function extractChatImageUrls({
    detectBase64ImageMime,
    extractImageUrlsFromText,
}, data, textContent) {
        const urls = new Set();
        const pushUrl = (value, mimeHint = 'image/png') => {
            if (!value) return;
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) return;
                if (trimmed.startsWith('data:image/')) {
                    urls.add(trimmed);
                    return;
                }
                if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                    urls.add(trimmed);
                    return;
                }
                const base64Like = /^[A-Za-z0-9+/=]+$/.test(trimmed);
                if (base64Like && trimmed.length > 64) {
                    const mimeType = detectBase64ImageMime(trimmed, mimeHint);
                    urls.add(`data:${mimeType};base64,${trimmed}`);
                }
                return;
            }
            if (typeof value === 'object') {
                const url = value.url || value.image_url || value.imageUrl || value.file_uri || value.fileUri || value.uri;
                if (url) {
                    urls.add(url);
                    return;
                }
                const raw = value.data || value.base64 || value.b64;
                if (raw) {
                    const mimeType = detectBase64ImageMime(raw, value.mime_type || value.mimeType || mimeHint);
                    urls.add(`data:${mimeType};base64,${raw}`);
                }
            }
        };

        const messageCandidates = [
            data?.choices?.[0]?.message,
            data?.data?.choices?.[0]?.message
        ];
        messageCandidates.forEach((message) => {
            if (!message) return;
            const content = message.content;
            if (Array.isArray(content)) {
                content.forEach((part) => {
                    if (!part) return;
                    if (part.type === 'image_url') pushUrl(part.image_url?.url || part.image_url || part.imageUrl);
                    if (part.type === 'image') pushUrl(part.image || part.image_url || part.imageUrl);
                    if (part.inline_data || part.inlineData) {
                        const inline = part.inline_data || part.inlineData;
                        if (inline?.data) pushUrl(inline.data, inline.mime_type || inline.mimeType || 'image/png');
                    }
                });
            }
        });

        const arrayCandidates = [
            data?.images,
            data?.output_images,
            data?.data?.output_images,
            data?.data?.images
        ];
        arrayCandidates.forEach((arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach((item) => pushUrl(item?.url || item?.image_url || item?.imageUrl || item));
        });

        extractImageUrlsFromText(textContent).forEach((url) => urls.add(url));
        return Array.from(urls);
    }

export async function executeTransportRequest({
    buildProxyUrl,
    extractTransportTextContent,
}, {
        request,
        baseUrl,
        providerKey,
        transport = TRANSPORT_HTTP_JSON,
        transportOptions = DEFAULT_TRANSPORT_OPTIONS
    }) {
        if (!request || !request.url) {
            return { ok: false, status: 0, data: null, text: '', aggregateText: '', events: [], errorMessage: 'request.url 为空' };
        }

        const mode = normalizeTransportMode(transport);
        const options = normalizeTransportOptions(transportOptions);
        const requestMethod = (request?.method || 'POST').toString().toUpperCase();
        let requestBodyType = (request?.bodyType || 'json').toString().toLowerCase();
        const requestHeaders = request?.headers && typeof request.headers === 'object'
            ? { ...request.headers }
            : {};
        let requestBody = request?.body;
        if (requestBody instanceof FormData) {
            requestBodyType = 'multipart';
        }
        if (requestBodyType === 'json' && !requestHeaders['Content-Type'] && !requestHeaders['content-type']) {
            requestHeaders['Content-Type'] = 'application/json';
        }
        if (mode === TRANSPORT_HTTP_SSE && !requestHeaders.Accept && !requestHeaders.accept) {
            requestHeaders.Accept = 'text/event-stream';
        }
        if (requestBodyType === 'multipart') {
            requestBody = coerceFormDataFromObject(requestBody);
            delete requestHeaders['Content-Type'];
            delete requestHeaders['content-type'];
        } else if (requestBodyType === 'raw') {
            if (typeof requestBody !== 'string') {
                requestBody = JSON.stringify(requestBody ?? {});
            }
        } else if (requestBodyType === 'json') {
            if (!(requestBody instanceof FormData) && typeof requestBody !== 'string') {
                requestBody = JSON.stringify(requestBody ?? {});
            }
        }

        const requestUrl = String(request.url || '').trim();
        const cleanBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
        const absoluteUrl = requestUrl.startsWith('http')
            ? requestUrl
            : `${cleanBaseUrl}${requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`}`;
        const timeoutMs = Number.isFinite(request?.timeoutMs) && request.timeoutMs > 0
            ? Number(request.timeoutMs)
            : null;

        if (mode === TRANSPORT_WS_STREAM) {
            if (typeof WebSocket === 'undefined') {
                return { ok: false, status: 0, data: null, text: '', aggregateText: '', events: [], errorMessage: '当前环境不支持 WebSocket' };
            }
            let wsUrl = absoluteUrl;
            if (wsUrl.startsWith('http://')) wsUrl = `ws://${wsUrl.slice('http://'.length)}`;
            if (wsUrl.startsWith('https://')) wsUrl = `wss://${wsUrl.slice('https://'.length)}`;
            if (!/^wss?:\/\//i.test(wsUrl)) {
                return { ok: false, status: 0, data: null, text: '', aggregateText: '', events: [], errorMessage: 'ws-stream 需要 ws:// 或 wss:// endpoint' };
            }

            return await new Promise((resolve) => {
                let socketClosed = false;
                let timer = null;
                let rawText = '';
                let aggregateText = '';
                let lastPayload = null;
                const events = [];

                const finalize = (result) => {
                    if (socketClosed) return;
                    socketClosed = true;
                    if (timer) clearTimeout(timer);
                    try { ws.close(); } catch { }
                    resolve(result);
                };

                const ws = new WebSocket(wsUrl);
                if (timeoutMs) {
                    timer = setTimeout(() => {
                        finalize({
                            ok: false,
                            status: 0,
                            data: lastPayload,
                            text: rawText,
                            aggregateText,
                            events,
                            errorMessage: `ws-stream timeout(${timeoutMs}ms)`
                        });
                    }, timeoutMs);
                }

                ws.onopen = () => {
                    if (requestMethod !== 'GET' && requestBody !== undefined && requestBody !== null) {
                        if (requestBody instanceof FormData) {
                            finalize({
                                ok: false,
                                status: 0,
                                data: null,
                                text: '',
                                aggregateText: '',
                                events,
                                errorMessage: 'ws-stream 暂不支持 multipart 请求体'
                            });
                            return;
                        }
                        const payloadToSend = typeof requestBody === 'string'
                            ? requestBody
                            : JSON.stringify(requestBody);
                        ws.send(payloadToSend);
                    }
                };

                ws.onerror = () => {
                    finalize({
                        ok: false,
                        status: 0,
                        data: lastPayload,
                        text: rawText,
                        aggregateText,
                        events,
                        errorMessage: 'ws-stream 连接失败'
                    });
                };

                ws.onmessage = (event) => {
                    const messageText = typeof event.data === 'string' ? event.data : '';
                    rawText += messageText;
                    let payload = null;
                    if (messageText) {
                        try {
                            payload = JSON.parse(messageText);
                            lastPayload = payload;
                        } catch {
                            payload = messageText;
                        }
                    }
                    events.push(payload);
                    const doneToken = options.wsDoneToken || '[DONE]';
                    if (typeof payload === 'string' && payload.trim() === doneToken) {
                        finalize({
                            ok: true,
                            status: 200,
                            data: lastPayload,
                            text: rawText,
                            aggregateText,
                            events
                        });
                        return;
                    }
                    const delta = typeof payload === 'object'
                        ? extractTransportTextContent(payload, options.wsMessagePath)
                        : (typeof payload === 'string' ? payload : '');
                    if (delta) aggregateText += delta;
                };

                ws.onclose = () => {
                    finalize({
                        ok: true,
                        status: 200,
                        data: lastPayload,
                        text: rawText,
                        aggregateText,
                        events
                    });
                };
            });
        }

        const finalUrl = buildProxyUrl(absoluteUrl, providerKey);
        const controller = timeoutMs && typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;
        let timeoutHandle = null;
        if (controller && timeoutMs) {
            timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        }

        let response;
        try {
            response = await fetch(finalUrl, {
                method: requestMethod,
                headers: requestHeaders,
                body: requestBody,
                signal: controller?.signal
            });
        } catch (error) {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            return {
                ok: false,
                status: 0,
                data: null,
                text: '',
                aggregateText: '',
                events: [],
                errorMessage: error?.message || String(error)
            };
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }

        if (mode !== TRANSPORT_HTTP_SSE || !response.body) {
            const text = await response.text();
            let data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    data = null;
                }
            }
            return {
                ok: response.ok,
                status: response.status,
                data,
                text,
                aggregateText: data ? extractTransportTextContent(data, options.sseDeltaPath) : '',
                events: []
            };
        }

        const decoder = new TextDecoder('utf-8');
        const reader = response.body.getReader();
        const delimiter = options.sseDelimiter || '\n\n';
        const dataPrefix = options.sseDataPrefix || 'data:';
        const doneToken = options.sseDoneToken || '[DONE]';
        const events = [];
        let aggregateText = '';
        let rawText = '';
        let buffer = '';
        let lastPayload = null;
        let done = false;

        const consumeSseBlock = (block) => {
            if (!block) return;
            const lines = block.split(/\r?\n/);
            const payloadLines = [];
            lines.forEach((line) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                if (dataPrefix) {
                    if (trimmed.startsWith(dataPrefix)) {
                        payloadLines.push(trimmed.slice(dataPrefix.length).trim());
                    }
                    return;
                }
                payloadLines.push(trimmed);
            });
            if (payloadLines.length === 0) return;
            const payloadText = payloadLines.join('\n').trim();
            if (!payloadText) return;
            if (payloadText === doneToken) {
                done = true;
                return;
            }
            let payload = null;
            try {
                payload = JSON.parse(payloadText);
                lastPayload = payload;
            } catch {
                payload = payloadText;
            }
            events.push(payload);
            const delta = typeof payload === 'object'
                ? extractTransportTextContent(payload, options.sseDeltaPath)
                : (typeof payload === 'string' ? payload : '');
            if (delta) aggregateText += delta;
        };

        while (true) {
            const { done: streamDone, value } = await reader.read();
            if (streamDone) break;
            const chunk = decoder.decode(value, { stream: true });
            rawText += chunk;
            buffer += chunk;
            let index = buffer.indexOf(delimiter);
            while (index >= 0) {
                const block = buffer.slice(0, index);
                buffer = buffer.slice(index + delimiter.length);
                consumeSseBlock(block);
                index = buffer.indexOf(delimiter);
            }
            if (done) break;
        }

        if (!done && buffer.trim()) {
            consumeSseBlock(buffer);
        }

        return {
            ok: response.ok,
            status: response.status,
            data: lastPayload || null,
            text: rawText,
            aggregateText,
            events
        };
    }

export async function runRequestChain({
    executeTransportRequest,
}, requestChain, baseVars, providerKey, defaultTransport = TRANSPORT_HTTP_JSON, defaultTransportOptions = DEFAULT_TRANSPORT_OPTIONS) {
        if (!requestChain?.enabled || !Array.isArray(requestChain.steps) || requestChain.steps.length === 0) {
            return baseVars;
        }
        const vars = {
            ...(baseVars || {}),
            chain: (baseVars && typeof baseVars.chain === 'object' && !Array.isArray(baseVars.chain))
                ? { ...baseVars.chain }
                : {}
        };

        for (const rawStep of requestChain.steps) {
            const step = normalizeRequestChainStep(rawStep);
            if (!step) continue;
            const stepId = step.id || `step-${Date.now()}`;
            try {
                if (step.type === 'transform') {
                    const assignResult = resolveTemplateValue(step.assign || {}, vars, { bodyType: 'json' });
                    if (assignResult && typeof assignResult === 'object' && !Array.isArray(assignResult)) {
                        Object.assign(vars, assignResult);
                    }
                    const extractSource = assignResult && typeof assignResult === 'object'
                        ? assignResult
                        : vars;
                    Object.entries(step.extract || {}).forEach(([targetKey, sourcePath]) => {
                        const value = getValueByPathLoose(extractSource, sourcePath);
                        if (value !== undefined) vars[targetKey] = value;
                    });
                    vars.chain[stepId] = {
                        type: 'transform',
                        status: 'ok'
                    };
                    continue;
                }

                const stepTemplate = normalizeRequestTemplate(step.request || {});
                if (!stepTemplate?.endpoint) {
                    throw new Error('request.endpoint 为空');
                }
                let request = buildRequestFromTemplate(stepTemplate, vars, { bodyType: stepTemplate.bodyType });
                if (!request || !request.url) {
                    throw new Error('请求模板构建失败');
                }
                const providerKeyValue = vars?.provider?.key || baseVars?.provider?.key;
                if (providerKeyValue) {
                    const requestHeaders = request?.headers && typeof request.headers === 'object'
                        ? { ...request.headers }
                        : {};
                    if (!requestHeaders.Authorization && !requestHeaders.authorization) {
                        requestHeaders.Authorization = `Bearer ${providerKeyValue}`;
                        request = { ...request, headers: requestHeaders };
                    }
                }
                const baseUrl = String(vars?.provider?.baseUrl || baseVars?.provider?.baseUrl || '').trim().replace(/\/+$/, '');
                const stepTransportMode = normalizeTransportMode(step.transport || defaultTransport);
                const stepTransportOptions = normalizeTransportOptions(step.transportOptions || defaultTransportOptions);
                const response = await executeTransportRequest({
                    request,
                    baseUrl,
                    providerKey,
                    transport: stepTransportMode,
                    transportOptions: stepTransportOptions
                });
                if (!response.ok) {
                    const errorText = response?.data?.message || response?.data?.error?.message || response?.errorMessage || response?.text;
                    throw new Error(errorText || `HTTP ${response.status || 0}`);
                }
                const extractSource = response.data ?? { text: response.text || '' };
                Object.entries(step.extract || {}).forEach(([targetKey, sourcePath]) => {
                    const value = getValueByPathLoose(extractSource, sourcePath);
                    if (value !== undefined) vars[targetKey] = value;
                });
                vars.chain[stepId] = {
                    type: 'http',
                    status: response.status || 200,
                    data: extractSource
                };
            } catch (error) {
                const strategy = step.onError || 'stop';
                const fallbackVars = resolveTemplateValue(step.fallbackVars || {}, vars, { bodyType: 'json' });
                if (strategy === 'fallback') {
                    if (fallbackVars && typeof fallbackVars === 'object' && !Array.isArray(fallbackVars)) {
                        Object.assign(vars, fallbackVars);
                    }
                    vars.chain[stepId] = {
                        status: 'fallback',
                        error: error?.message || String(error)
                    };
                    continue;
                }
                if (strategy === 'continue') {
                    vars.chain[stepId] = {
                        status: 'continue',
                        error: error?.message || String(error)
                    };
                    continue;
                }
                throw new Error(`[RequestChain:${stepId}] ${error?.message || String(error)}`);
            }
        }

        return vars;
    }

export async function sendChatMessage({
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
}) {
        if (cloudDocument) return canvasCloud.unsupported('通用聊天');
        if ((!chatInput.trim() && chatFiles.length === 0) || isChatSending) return;

        // V3.4.8: 使用 getApiCredentials 获取 Provider 配置
        const config = getApiConfigByKey(chatModel);
        const { key: apiKey, url: baseUrl, modelName } = getApiCredentials(chatModel);

        if (!apiKey) {
            canvasAlert(t('请先在 API 设置中配置 Key'));
            setSettingsOpen(true);
            return;
        }

        // 确保使用当前激活的会话（避免新建对话后第一条消息被写入旧会话）
        const chatIdToUse = currentChatId || chatSessions[0]?.id;
        const sessionToUse = chatSessions.find(s => s.id === chatIdToUse) || chatSessions[0];
        const currentSessionMessages = sessionToUse?.messages || [];
        if (sessionToUse && sessionToUse.id !== currentChatId) setCurrentChatId(sessionToUse.id);

        setIsChatSending(true);

        const newUserMsg = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'user',
            content: chatInput,
            files: [...chatFiles],
            timestamp: Date.now(),
            modelId: chatModel // 保存发送消息时使用的模型ID
        };

        setChatSessions(prev => prev.map(s => {
            if (s.id === chatIdToUse) {
                return { ...s, messages: [...s.messages, newUserMsg], title: s.messages.length === 0 ? chatInput.slice(0, 20) : s.title };
            }
            return s;
        }));
        setChatInput('');
        setChatFiles([]);

        // 构建带上下文的对话历史，帮助模型回顾上下文
        // 使用当前会话的消息加上新消息
        const allMessages = [...currentSessionMessages, newUserMsg];
        const MAX_HISTORY_MESSAGES = 20;
        const recentMessages = allMessages.length > MAX_HISTORY_MESSAGES
            ? allMessages.slice(-MAX_HISTORY_MESSAGES)
            : allMessages;

        let apiMessages = [
            {
                role: 'system',
                content: t('你是一名多模态AI助手，需要结合整个对话的上下文进行连续回答。')
            },
            ...recentMessages.map(m => ({
                role: m.role,
                content: m.content
            }))
        ];

        const currentContent = [];
        if (newUserMsg.content) currentContent.push({ type: "text", text: newUserMsg.content });

        newUserMsg.files.forEach(f => {
            const isGeminiLike = (config?.modelName ?? '').toLowerCase().includes('gemini');

            if (f.isImage) {
                currentContent.push({
                    type: "image_url",
                    image_url: { url: f.content }
                });
            } else if (f.isVideo) {
                if (isGeminiLike) {
                    // Gemini 视频分析：按官方规范也走 image_url，url 直接指向 mp4
                    currentContent.push({
                        type: "image_url",
                        image_url: { url: f.content }
                    });
                } else {
                    currentContent.push({
                        type: "text",
                        text: `\n[User attached video: ${f.name}]\n`
                    });
                }
            } else if (f.isAudio) {
                currentContent.push({
                    type: "text",
                    text: `\n[User attached audio: ${f.name}]\n`
                });
            } else if (f.isPDF || f.isDoc || f.isExcel) {
                // PDF、Word、Excel 等文档文件，发送文件名和类型信息
                currentContent.push({
                    type: "text",
                    text: `\n[User attached document: ${f.name} (${f.isPDF ? 'PDF' : f.isDoc ? 'Word' : 'Excel'})]\n`
                });
            } else if (f.isCode || (f.content && typeof f.content === 'string' && f.content.length < 50000)) {
                // 代码文件或文本文件，直接发送内容
                currentContent.push({
                    type: "text",
                    text: `\n[File: ${f.name}]\n\`\`\`${f.fileExt || 'text'}\n${f.content}\n\`\`\`\n`
                });
            } else {
                // 其他文件或二进制文件
                currentContent.push({
                    type: "text",
                    text: `\n[User attached file: ${f.name}]\n`
                });
            }
        });

        apiMessages.push({ role: 'user', content: currentContent });

        try {
            const contractIssues = validateModelLibraryContract(config || {});
            const blockingIssue = contractIssues.find((issue) => issue.level === 'error');
            if (blockingIssue) {
                throw new Error(`[配置校验阻断] ${blockingIssue.message}`);
            }
            const parseChatContent = (payload) => {
                if (!payload || typeof payload !== 'object') return null;
                const primaryMessage = payload?.choices?.[0]?.message || payload?.data?.choices?.[0]?.message;
                if (primaryMessage?.content !== undefined) {
                    if (Array.isArray(primaryMessage.content)) {
                        return primaryMessage.content
                            .map(part => (typeof part?.text === 'string' ? part.text : ''))
                            .filter(Boolean)
                            .join('\n');
                    }
                    return primaryMessage.content;
                }
                if (payload.content !== undefined) return payload.content;
                if (payload.text !== undefined) return payload.text;
                if (payload.message !== undefined) {
                    return typeof payload.message === 'string' ? payload.message : payload.message?.content;
                }
                if (payload.result !== undefined) {
                    return typeof payload.result === 'string' ? payload.result : payload.result?.content;
                }
                if (payload.data?.content !== undefined) return payload.data.content;
                if (payload.data?.text !== undefined) return payload.data.text;
                if (payload.data?.message !== undefined) {
                    return typeof payload.data.message === 'string' ? payload.data.message : payload.data.message?.content;
                }
                if (payload.data?.result !== undefined) {
                    return typeof payload.data.result === 'string' ? payload.data.result : payload.data.result?.content;
                }
                return null;
            };

            const fallbackTemplate = getDefaultRequestTemplateForType(config?.type || 'Chat');
            const requestTemplate = normalizeRequestTemplate(config?.requestTemplate || fallbackTemplate)
                || normalizeRequestTemplate(fallbackTemplate);
            if (!requestTemplate?.endpoint) {
                throw new Error('聊天请求模板未配置 endpoint');
            }
            const requestChain = normalizeRequestChain(config?.requestChain);
            const transportMode = normalizeTransportMode(config?.transport);
            const transportOptions = normalizeTransportOptions(config?.transportOptions);
            const requestOverrideEnabled = !!config?.requestOverrideEnabled;
            const requestOverridePatch = normalizeRequestOverridePatch(config?.requestOverridePatch);

            const templateText = JSON.stringify(requestTemplate || {});
            const needsBlob = (requestTemplate?.bodyType || '').toLowerCase() === 'multipart'
                || /:blob\s*}}/.test(templateText);
            const needsDataUrl = /:blob\s*}}/.test(templateText);

            const attachmentMetas = (newUserMsg.files || []).map((file, idx) => {
                const rawContent = typeof file?.content === 'string' ? file.content : '';
                const isDataUrl = rawContent.startsWith('data:');
                const isHttpUrl = rawContent.startsWith('http://') || rawContent.startsWith('https://');
                return {
                    index: idx + 1,
                    name: file?.name || `file-${idx + 1}`,
                    type: file?.type || 'application/octet-stream',
                    fileExt: file?.fileExt || '',
                    isImage: !!file?.isImage,
                    isVideo: !!file?.isVideo,
                    isAudio: !!file?.isAudio,
                    isPDF: !!file?.isPDF,
                    isDoc: !!file?.isDoc,
                    isExcel: !!file?.isExcel,
                    isCode: !!file?.isCode,
                    rawContent,
                    url: isDataUrl || isHttpUrl ? rawContent : '',
                    dataUrl: isDataUrl ? rawContent : ''
                };
            });

            const buildAttachmentBlob = async (attachment) => {
                if (!attachment) return null;
                if (attachment.dataUrl) {
                    try {
                        return dataUrlToBlob(attachment.dataUrl);
                    } catch {
                        return null;
                    }
                }
                if (attachment.url) {
                    try {
                        const useProxy = getProxyPreferenceForUrl(attachment.url, false);
                        return await getBlobFromUrl(attachment.url, { useProxy });
                    } catch {
                        return null;
                    }
                }
                if (attachment.rawContent) {
                    return new Blob([attachment.rawContent], { type: attachment.type || 'text/plain' });
                }
                return null;
            };

            const templateVars = {
                modelName: modelName || chatModel,
                prompt: newUserMsg.content || '',
                input: newUserMsg.content || '',
                stream: false,
                messages: apiMessages,
                chatMessages: apiMessages,
                provider: {
                    key: apiKey,
                    baseUrl,
                    id: config?.provider,
                    useProxy: !!(config?.provider && providers?.[config.provider]?.useProxy)
                },
                files: attachmentMetas,
                attachments: attachmentMetas,
                fileCount: attachmentMetas.length
            };

            if (attachmentMetas.length > 0) {
                const firstAttachment = attachmentMetas[0];
                templateVars.fileName = firstAttachment.name;
                templateVars.fileUrl = firstAttachment.url;
                templateVars.fileDataUrl = firstAttachment.dataUrl;
                templateVars.fileDataURL = firstAttachment.dataUrl;
                templateVars.fileUrls = attachmentMetas.map(item => item.url).filter(Boolean);
                templateVars.fileNames = attachmentMetas.map(item => item.name);

                attachmentMetas.forEach((attachment) => {
                    const index = attachment.index;
                    templateVars[`fileName${index}`] = attachment.name;
                    templateVars[`file${index}Name`] = attachment.name;
                    templateVars[`fileUrl${index}`] = attachment.url;
                    templateVars[`file${index}Url`] = attachment.url;
                    templateVars[`fileDataUrl${index}`] = attachment.dataUrl;
                    templateVars[`fileDataURL${index}`] = attachment.dataUrl;
                    templateVars[`file${index}DataUrl`] = attachment.dataUrl;
                    templateVars[`file${index}DataURL`] = attachment.dataUrl;
                });
            }

            const imageAttachments = attachmentMetas.filter((attachment) => attachment.isImage || attachment.isVideo);
            const imageSources = imageAttachments
                .map((attachment) => attachment.url || attachment.dataUrl)
                .filter(Boolean);
            if (imageSources.length > 0) {
                templateVars.imageUrl = imageSources[0];
                templateVars.imageUrls = imageSources;
                templateVars.imagesUrl = imageSources;
                templateVars.imagesUrls = imageSources;
                imageSources.forEach((url, idx) => {
                    const index = idx + 1;
                    templateVars[`imageUrl${index}`] = url;
                    templateVars[`image${index}Url`] = url;
                });
            }

            if (needsDataUrl && attachmentMetas.length > 0) {
                const dataUrls = await Promise.all(attachmentMetas.map(async (attachment) => {
                    if (attachment.dataUrl) return attachment.dataUrl;
                    if (attachment.url) {
                        try {
                            const useProxy = getProxyPreferenceForUrl(attachment.url, false);
                            const base64 = await getBase64FromUrl(attachment.url, { useProxy });
                            const mimeType = attachment.type || 'application/octet-stream';
                            return `data:${mimeType};base64,${base64}`;
                        } catch {
                            return '';
                        }
                    }
                    if (attachment.rawContent) {
                        const blob = new Blob([attachment.rawContent], { type: attachment.type || 'text/plain' });
                        try {
                            return await blobToDataURL(blob);
                        } catch {
                            return '';
                        }
                    }
                    return '';
                }));
                if (dataUrls.length > 0) {
                    templateVars.fileDataUrls = dataUrls.filter(Boolean);
                    dataUrls.forEach((dataUrl, idx) => {
                        const index = idx + 1;
                        templateVars[`fileDataUrl${index}`] = dataUrl;
                        templateVars[`fileDataURL${index}`] = dataUrl;
                        templateVars[`file${index}DataUrl`] = dataUrl;
                        templateVars[`file${index}DataURL`] = dataUrl;
                    });
                    if (dataUrls[0]) {
                        templateVars.fileDataUrl = dataUrls[0];
                        templateVars.fileDataURL = dataUrls[0];
                    }
                    const imageDataUrls = dataUrls.filter(Boolean);
                    if (imageDataUrls.length > 0) {
                        templateVars.imageDataUrl = imageDataUrls[0];
                        templateVars.imageDataURL = imageDataUrls[0];
                        templateVars.imageDataUrls = imageDataUrls;
                        templateVars.imagesDataUrl = imageDataUrls;
                        templateVars.imagesDataURL = imageDataUrls;
                        imageDataUrls.forEach((dataUrl, idx) => {
                            const index = idx + 1;
                            templateVars[`imageDataUrl${index}`] = dataUrl;
                            templateVars[`imageDataURL${index}`] = dataUrl;
                            templateVars[`image${index}DataUrl`] = dataUrl;
                            templateVars[`image${index}DataURL`] = dataUrl;
                        });
                    }
                }
            }

            if (needsBlob && attachmentMetas.length > 0) {
                const attachmentBlobs = await Promise.all(attachmentMetas.map((attachment) => buildAttachmentBlob(attachment)));
                templateVars.fileBlob = attachmentBlobs[0] || null;
                templateVars.fileBlobs = attachmentBlobs.filter(Boolean);
                attachmentBlobs.forEach((blob, idx) => {
                    const index = idx + 1;
                    templateVars[`fileBlob${index}`] = blob;
                    templateVars[`file${index}Blob`] = blob;
                });

                const imageBlobs = [];
                for (const attachment of imageAttachments) {
                    const blob = await buildAttachmentBlob(attachment);
                    if (blob) imageBlobs.push(blob);
                }
                if (imageBlobs.length > 0) {
                    templateVars.imageBlob = imageBlobs[0];
                    templateVars.imageBlobs = imageBlobs;
                    templateVars.imagesBlob = imageBlobs;
                    imageBlobs.forEach((blob, idx) => {
                        const index = idx + 1;
                        templateVars[`imageBlob${index}`] = blob;
                        templateVars[`image${index}Blob`] = blob;
                    });
                }
            }

            const requestVars = await runRequestChain(
                requestChain,
                templateVars,
                config?.provider,
                transportMode,
                transportOptions
            );
            let request = buildRequestFromTemplate(requestTemplate, requestVars, { bodyType: requestTemplate.bodyType });
            if (!request || !request.url) {
                throw new Error('聊天请求模板构建失败');
            }
            request = requestOverrideEnabled && requestOverridePatch
                ? applyRequestOverridePatch({ ...request }, requestOverridePatch)
                : request;

            const requestHeaders = request?.headers && typeof request.headers === 'object'
                ? { ...request.headers }
                : {};
            if (apiKey && !requestHeaders.Authorization && !requestHeaders.authorization) {
                requestHeaders.Authorization = `Bearer ${apiKey}`;
                request = { ...request, headers: requestHeaders };
            }

            const transportResult = await executeTransportRequest({
                request,
                baseUrl,
                providerKey: config?.provider,
                transport: transportMode,
                transportOptions
            });

            if (!transportResult.ok) {
                const errorText = transportResult?.data?.message
                    || transportResult?.data?.error?.message
                    || transportResult?.errorMessage
                    || transportResult?.text;
                throw new Error(errorText || `API Error: ${transportResult.status || 0}`);
            }

            const data = transportResult.data;

            let aiContent = parseChatContent(data);
            if ((!aiContent || String(aiContent).trim() === '') && transportResult.aggregateText) {
                aiContent = transportResult.aggregateText;
            }
            if ((!aiContent || String(aiContent).trim() === '') && data === null && transportResult.text) {
                aiContent = transportResult.text;
            }

            if (aiContent && typeof aiContent !== 'string') {
                aiContent = JSON.stringify(aiContent);
            }
            if (!aiContent || aiContent.trim() === '') {
                console.error('[聊天] API 响应内容为空:', data);
                aiContent = "No response";
            }

            const newAssistantMsg = {
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant',
                content: aiContent,
                timestamp: Date.now(),
                modelId: chatModel // 保存回复消息时使用的模型ID
            };

            setChatSessions(prev => prev.map(s => {
                if (s.id === chatIdToUse) {
                    return { ...s, messages: [...s.messages, newAssistantMsg] };
                }
                return s;
            }));

            const chatImageUrls = extractChatImageUrls(data || {}, aiContent);
            if (chatImageUrls.length > 0) {
                const now = Date.now();
                const primaryUrl = chatImageUrls[0];
                const displayName = config?.displayName || modelName || chatModel;
                const useProxy = typeof config?.useProxy === 'boolean'
                    ? config.useProxy
                    : !!(config?.provider && providers?.[config.provider]?.useProxy);
                setHistory((prev) => [{
                    id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
                    type: 'image',
                    url: primaryUrl,
                    prompt: newUserMsg.content || 'Chat Image',
                    time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    status: 'completed',
                    progress: 100,
                    modelName: displayName,
                    apiConfig: { modelId: chatModel, baseUrl, apiKey, provider: config?.provider, useProxy },
                    provider: config?.provider,
                    useProxy,
                    startTime: now,
                    durationMs: 0,
                    output_images: chatImageUrls,
                    mjImages: chatImageUrls.length > 1 ? chatImageUrls : null,
                    selectedMjImageIndex: 0
                }, ...prev]);
            }

        } catch (error) {
            console.error("Chat Error", error);
            const errorMsg = {
                id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant',
                content: `Error: ${error.message}`,
                isError: true,
                timestamp: Date.now()
            };

            setChatSessions(prev => prev.map(s => {
                if (s.id === chatIdToUse) {
                    return { ...s, messages: [...s.messages, errorMsg] };
                }
                return s;
            }));
        } finally {
            setIsChatSending(false);
        }
    }
