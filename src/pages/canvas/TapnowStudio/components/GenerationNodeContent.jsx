import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import CanvasModelMenu from './CanvasModelMenu';
import {
    ChevronRight,
    Eraser,
    ImagePlus,
    Link as LinkIcon,
    Play,
    Users,
    Video,
    Wand2
} from 'lucide-react';
import {
    LazyBase64Image,
    MJ_VERSIONS,
    getValueLabelWithNotes,
    isImageModelType,
    normalizeImageConcurrency,
    normalizeImageResolution,
    normalizeVideoResolution,
    t
} from '../freeCanvasShared';

function GenerationNodeContent({ node, context }) {
  useUiLanguage()

    const {
        history,
        nodeTimers,
        theme,
        connectedImages,
        connections,
        nodesMap,
        updateNodeSettings,
        characterLibrary,
        setCharactersOpen,
        characterReferenceBarExpanded,
        setCharacterReferenceBarExpanded,
        getApiConfigByKey,
        getConnectedImageForInput,
        connectingTarget,
        connectingInputType,
        screenToWorld,
        setMousePos,
        setConnectingTarget,
        setConnectingInputType,
        handleNodeMouseUp,
        isNanoBanana2,
        promptLibraryCollapsed,
        setPromptLibraryCollapsed,
        promptLibrary,
        promptLibraryEditorOpen,
        setPromptLibraryEditorOpen,
        promptLibraryForm,
        setPromptLibraryForm,
        applyLibraryPrompt,
        removePromptLibraryItem,
        addPromptLibraryItem,
        renderCustomParamInputs,
        getModelLabelWithProvider,
        activeDropdown,
        setActiveDropdown,
        getStatusColor,
        resolveModelKey,
        groupedApiConfigs,
        setHoveredProvider,
        applyNodeModelSelection,
        setLastUsedImageModel,
        setLastUsedVideoModel,
        localStorage,
        getRatiosForModel,
        setLastUsedRatio,
        lastUsedVideoResolution,
        getVideoResolutionsForModel,
        setLastUsedVideoResolution,
        getResolutionsForModel,
        setLastUsedImageResolution,
        getDefaultDurationsForModel,
        getConnectedTextNodes,
        startGeneration
    } = context;

    // Linked text is derived during rendering, never copied back into node settings.
    // The visible inputs and the generation action use the same current values.
    const connectedTexts = getConnectedTextNodes(node.id);
    const basePrompt = node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || '';
    const finalPrompt = connectedTexts.length > 0 ? connectedTexts.join(' ') + (basePrompt ? ' ' + basePrompt : '') : basePrompt;

    // 查找当前节点对应的正在生成的历史记录
    const activeTask = history.find(h =>
        h.sourceNodeId === node.id &&
        (h.status === 'generating' || h.status === 'completed')
    );
    const isGenerating = activeTask && activeTask.status === 'generating';
    const finalDuration = activeTask?.durationMs
        ? (activeTask.durationMs / 1000).toFixed(1)
        : null;
    const elapsedSeconds = nodeTimers[node.id] || 0;

    return (
        <div className="canvas-generation p-3 flex flex-col h-full pointer-events-auto">
            {/* 计时器显示 */}
            {(isGenerating || finalDuration) && (
                <div
                    className={`mb-2 px-2 py-1 rounded text-[10px] font-mono text-center ${theme === 'dark'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-blue-50 text-blue-600 border border-blue-200'
                        }`}
                >
                    {isGenerating ? (
                        <span>⏱ {elapsedSeconds.toFixed(1)}s</span>
                    ) : (
                        <span>✓ {t('完成')} {finalDuration}s</span>
                    )}
                </div>
            )}
            <div
                className={`canvas-node__heading flex items-center gap-1.5 mb-2 text-xs font-semibold shrink-0 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                    }`}
            >
                {node.type === 'gen-image' ? <Wand2 size={12} className="text-blue-400" /> : <Video size={12} className="text-purple-400" />}
                <span>{node.type === 'gen-image' ? t('AI 绘图') : t('AI 视频')}</span>
            </div>
            {connectedImages.length > 0 && (
                <div
                    className={`mb-2 rounded-lg border p-2 relative group/ref ${theme === 'dark'
                        ? 'bg-zinc-900/50 border-purple-500/20'
                        : 'bg-violet-50 border-violet-200'
                        }`}
                >
                    <div className="flex justify-between items-center mb-1.5">
                        <span
                            className={`text-[10px] font-medium flex items-center gap-1 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'
                                }`}
                        >
                            <ImagePlus size={10} />
                            {uiText("引用成功")}</span>
                        <span
                            className={`text-[9px] font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'
                                }`}
                        >
                            {connectedImages.length}/10
                        </span>
                    </div>
                    <div className="flex -space-x-2 overflow-visible pb-1 items-center custom-scrollbar pl-1">
                        {connectedImages.map((imgSrc, idx) => (
                            <div
                                key={idx}
                                className={`relative shrink-0 flex flex-col items-center gap-0 ${theme === 'dark' ? '' : ''
                                    }`}
                            >
                                <div className="relative">
                                    <span
                                        className="absolute -top-1 -left-1 w-4 h-4 text-[9px] font-semibold rounded-full bg-zinc-700 text-white select-none flex items-center justify-center border border-white/70 shadow-sm leading-none pointer-events-none"
                                        style={{ zIndex: 30 }}
                                    >
                                        {idx + 1}
                                    </span>
                                    <div
                                        className={`relative w-8 h-8 rounded-full border-2 thumb-stack-item cursor-pointer overflow-hidden ${theme === 'dark'
                                            ? 'border-[#18181b] bg-zinc-800'
                                            : 'border-white bg-zinc-200'
                                            }`}
                                        style={{ zIndex: 10 - idx }}
                                    >
                                        <LazyBase64Image src={imgSrc} className="w-full h-full object-cover" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div
                className={`canvas-generation__prompt rounded-lg p-3 mb-2 border focus-within:border-blue-500/30 transition-colors flex-1 flex flex-col ${theme === 'dark'
                    ? 'bg-zinc-950/50 border-zinc-800'
                    : theme === 'solarized'
                        ? 'bg-[#fdf6e3] border-[#eee8d5]'
                        : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5]' : 'bg-zinc-50 border-zinc-200'
                    }`}
            >
                {/* 蒙版已连接状态提示（仅 gen-image 节点） */}
                {node.type === 'gen-image' && (() => {
                    // 检查当前节点或上游节点是否有蒙版
                    const hasMaskInCurrent = node?.maskContent;

                    // 查找连接到当前节点的源节点，优先查找默认输入，否则查找所有输入
                    let incomingConn = connections.find(c => c.to === node.id && (!c.inputType || c.inputType === 'default'));
                    if (!incomingConn) {
                        // 若没有默认连接，则查找任意指向该节点的连接
                        incomingConn = connections.find(c => c.to === node.id);
                    }

                    // 使用 nodesMap 进行 O(1) 查找
                    const sourceNode = incomingConn ? nodesMap.get(incomingConn.from) : null;
                    const hasMaskFromSource = sourceNode && sourceNode.maskContent;
                    const hasMask = hasMaskInCurrent || hasMaskFromSource;

                    if (hasMask) {
                        return (
                            <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded text-[10px] font-medium ${theme === 'dark'
                                ? 'bg-purple-900/30 text-purple-300 border border-purple-800'
                                : 'bg-purple-50 text-purple-600 border border-purple-200'
                                }`}>
                                <Eraser size={12} />
                                <span>{hasMaskFromSource ? t('已链接蒙版区域') : t('已设置蒙版区域')}</span>
                            </div>
                        );
                    }
                    return null;
                })()}
                {connectedTexts.length > 0 && (
                    <div className="canvas-generation__linked-text" role="group" aria-label={t('已连接文字')}>
                        <div className="canvas-generation__linked-text-heading">
                            <LinkIcon size={11} />
                            <span>{t('已连接文字')} · {connectedTexts.length}</span>
                            <span className="canvas-generation__linked-text-hint">{t('随来源更新')}</span>
                        </div>
                        <div className="canvas-generation__linked-text-body custom-scrollbar" tabIndex={0} onMouseDown={e => e.stopPropagation()}>
                            {connectedTexts.map((text, index) => <p key={index}>{text}</p>)}
                        </div>
                    </div>
                )}
                {connectedTexts.length > 0 && <div className="canvas-generation__prompt-label">{t('补充提示词')}</div>}
                <div className="flex items-start gap-2 mb-1 flex-1 h-full min-h-0">
                    <textarea
                        className={`flex-1 h-full bg-transparent text-xs outline-none resize-none custom-scrollbar ${theme === 'dark'
                            ? 'text-zinc-300 placeholder-zinc-600'
                            : 'text-zinc-800 placeholder-zinc-400'
                            }`}
                        aria-label={connectedTexts.length > 0 ? t('补充提示词') : t('提示词')}
                        placeholder={connectedTexts.length > 0 ? t('可补充要求，将与已连接文字一起使用') : t('输入提示词...')}
                        value={basePrompt}
                        onChange={(e) => updateNodeSettings(node.id, node.type === 'gen-image' ? { prompt: e.target.value } : { videoPrompt: e.target.value })}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                    {(node.type === 'gen-video' && (node.settings?.model === 'sora-2' || node.settings?.model === 'sora-2-pro')) && characterLibrary.length > 0 && (
                        <div className="relative shrink-0">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCharactersOpen(true);
                                }}
                                className={`p-1.5 rounded transition-colors ${theme === 'dark'
                                    ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200'
                                    }`}
                                title={t('插入角色')}
                            >
                                <Users size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 角色引用栏 (仅 Sora 模型) */}
            {node.type === 'gen-video' && (() => {
                const currentModel = node.settings?.model || '';
                const modelConfig = getApiConfigByKey(currentModel);
                const modelName = modelConfig?.modelName || modelConfig?.id || currentModel;
                const isSora = modelName && (modelName.includes('sora') || currentModel.includes('sora'));

                if (!isSora || characterLibrary.length === 0) return null;

                const currentPrompt = node.settings?.videoPrompt || '';
                const isExpanded = characterReferenceBarExpanded[node.id] || false;
                const maxVisible = 5; // 最多显示5个角色，超过则显示展开按钮
                const shouldShowExpand = characterLibrary.length > maxVisible;

                return (
                    <div className="border-t border-dashed mt-1" style={{
                        borderColor: theme === 'dark' ? 'rgba(63, 63, 70, 0.5)' : 'rgba(161, 161, 170, 0.5)'
                    }}>
                        <div className="flex items-center justify-between py-1 px-1">
                            <div className="flex gap-2 overflow-x-auto py-2 flex-1 custom-scrollbar">
                                {(isExpanded ? characterLibrary : characterLibrary.slice(0, maxVisible)).map(char => {
                                    const tag = `@${char.username}`;
                                    const isActive = currentPrompt.includes(tag);

                                    return (
                                        <button
                                            key={char.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                let newPrompt = currentPrompt || '';
                                                if (isActive) {
                                                    // 移除标签，并清理多余空格
                                                    newPrompt = newPrompt.replace(tag, '').replace(/\s{2,}/g, ' ').trim();
                                                } else {
                                                    // 添加标签到末尾（前后加空格）
                                                    newPrompt = newPrompt.trim();
                                                    newPrompt = newPrompt ? `${newPrompt} ${tag} ` : `${tag} `;
                                                }
                                                updateNodeSettings(node.id, { videoPrompt: newPrompt });
                                            }}
                                            className={`relative shrink-0 transition-all ${isActive ? 'scale-110' : 'opacity-70 hover:opacity-100'}`}
                                            title={char.username}
                                        >
                                            <LazyBase64Image
                                                src={char.localCacheUrl || char.profile_picture_url || ''}
                                                alt={char.username}
                                                className={`w-8 h-8 rounded-full object-cover border-2 ${isActive
                                                    ? 'border-blue-500 ring-2 ring-blue-500'
                                                    : 'border-transparent'
                                                    }`}
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                            {/* 右下角显示小的链接图标表示可用 */}
                                            <div className="absolute -bottom-0.5 -right-0.5 bg-black/50 rounded-full p-0.5">
                                                <LinkIcon size={8} className="text-green-400" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {shouldShowExpand && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isExpanded) {
                                            // 收起：关闭展开状态
                                            setCharacterReferenceBarExpanded(prev => {
                                                const updated = { ...prev };
                                                delete updated[node.id];
                                                return updated;
                                            });
                                        } else {
                                            // 展开：打开角色库侧边栏
                                            setCharactersOpen(true);
                                            setCharacterReferenceBarExpanded(prev => ({ ...prev, [node.id]: true }));
                                        }
                                    }}
                                    className={`shrink-0 px-2 py-1 text-[10px] rounded transition-colors ml-2 ${theme === 'dark'
                                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                        }`}
                                    title={isExpanded ? uiText("收起") : uiText("打开角色库")}
                                >
                                    {isExpanded ? uiText("收起") : `+${characterLibrary.length - maxVisible}`}
                                </button>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* 首尾帧 UI（仅支持首尾帧且开启时显示） */}
            {node.type === 'gen-video' && (() => {
                const currentModel = getApiConfigByKey(node.settings?.model);
                const supportsFirstLastFrame = !!currentModel?.supportsFirstLastFrame;
                const useFirstLastFrame = !!(node.settings?.useFirstLastFrame || node.settings?.veoFramesMode);
                if (!supportsFirstLastFrame || !useFirstLastFrame) return null;

                const startFrame = getConnectedImageForInput(node.id, 'veo_start');
                const endFrame = getConnectedImageForInput(node.id, 'veo_end');

                return (
                    <div
                        className={`mb-2 rounded-lg border p-3 space-y-2 ${theme === 'dark'
                            ? 'bg-zinc-900/40 border-emerald-500/20'
                            : 'bg-emerald-50 border-emerald-200'
                            }`}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                            {t('首尾帧')}
                        </div>
                        <div className={`text-[10px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                            {t('第一张为首帧，第二张为尾帧（最多 2 张）')}
                        </div>

                        {/* 首帧 */}
                        <div className="relative flex items-center gap-2">
                            <div
                                className={`input-point ${startFrame ? 'connected' : ''} ${connectingTarget === node.id && connectingInputType === 'veo_start' ? 'active' : ''}`}
                                title={t('首帧输入')}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setMousePos(world);
                                    setConnectingTarget(node.id);
                                    setConnectingInputType('veo_start');
                                }}
                                onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'veo_start')}
                                data-input-type="veo_start"
                                style={{ position: 'absolute', top: '50%', left: '0', transform: 'translateY(-50%)', width: '0.5rem', height: '0.5rem', zIndex: 20, cursor: 'crosshair' }}
                            />
                            <div className="flex items-center justify-between flex-1 ml-2">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{t('首帧')}</span>
                                    {startFrame && <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>}
                                </div>
                                {startFrame ? (
                                    <div className="w-8 h-8 rounded overflow-hidden border border-zinc-700/40">
                                        <LazyBase64Image src={startFrame} className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>{t('未连接')}</span>
                                )}
                            </div>
                        </div>

                        {/* 尾帧 */}
                        <div className="relative flex items-center gap-2">
                            <div
                                className={`input-point ${endFrame ? 'connected' : ''} ${connectingTarget === node.id && connectingInputType === 'veo_end' ? 'active' : ''}`}
                                title={t('尾帧输入')}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setMousePos(world);
                                    setConnectingTarget(node.id);
                                    setConnectingInputType('veo_end');
                                }}
                                onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'veo_end')}
                                data-input-type="veo_end"
                                style={{ position: 'absolute', top: '50%', left: '0', transform: 'translateY(-50%)', width: '0.5rem', height: '0.5rem', zIndex: 20, cursor: 'crosshair' }}
                            />
                            <div className="flex items-center justify-between flex-1 ml-2">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{t('尾帧')}</span>
                                    {endFrame && <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>}
                                </div>
                                {endFrame ? (
                                    <div className="w-8 h-8 rounded overflow-hidden border border-zinc-700/40">
                                        <LazyBase64Image src={endFrame} className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <span className={`text-[10px] ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>{t('未连接')}</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Midjourney 指令界面：oref、ow、sref */}
            {node.type === 'gen-image' && (() => {
                const currentModel = getApiConfigByKey(node.settings?.model);
                const isMidjourney = currentModel && (currentModel.id.includes('mj') || currentModel.provider.toLowerCase().includes('midjourney'));
                return isMidjourney;
            })() && (() => {
                const orefConnected = getConnectedImageForInput(node.id, 'oref');
                const srefConnected = getConnectedImageForInput(node.id, 'sref');
                return (
                    <div className="flex flex-col gap-1.5 mb-2 relative" data-mj-instructions="true">
                        {/* oref 指令 */}
                        <div className="relative flex items-center gap-1.5" data-mj-oref="true">
                            <div className={`input-point ${orefConnected ? 'connected' : ''} ${connectingTarget === node.id && connectingInputType === 'oref' ? 'active' : ''}`}
                                title={t('oref输入')}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    // 立即计算并更新当前鼠标的世界坐标，防止线条乱飞
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setMousePos(world);
                                    setConnectingTarget(node.id);
                                    setConnectingInputType('oref');
                                }}
                                onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'oref')}
                                data-input-type="oref"
                                style={{ position: 'absolute', top: '50%', left: '-0.25rem', transform: 'translateY(-50%)', width: '0.5rem', height: '0.5rem', marginRight: '0.25rem', zIndex: 20, cursor: 'crosshair' }}
                            />
                            <div className="flex items-center gap-1.5 flex-1 ml-2">
                                <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>oref</span>
                                {orefConnected && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                )}
                            </div>
                        </div>

                        {/* ow指令 */}
                        <div className="relative flex items-center gap-1.5">
                            <div className="w-0.5rem h-0.5rem mr-0.25rem ml-2"></div>
                            <div className="flex items-center gap-1.5 flex-1">
                                <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>ow</span>
                                {node.settings?.mjOw && node.settings.mjOw > 0 && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                )}
                            </div>
                            <input
                                type="number"
                                min="1"
                                max="1000"
                                placeholder="1-1000"
                                value={node.settings?.mjOw || ''}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (isNaN(val) || val < 1) {
                                        updateNodeSettings(node.id, { mjOw: '' });
                                    } else if (val > 1000) {
                                        updateNodeSettings(node.id, { mjOw: 1000 });
                                    } else {
                                        updateNodeSettings(node.id, { mjOw: val });
                                    }
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`flex-1 px-2 py-1 rounded text-[10px] border outline-none focus:border-blue-500/50 ${theme === 'dark'
                                    ? 'bg-zinc-900/50 border-zinc-700 text-zinc-300 placeholder-zinc-600'
                                    : theme === 'solarized' ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800 placeholder-zinc-400' : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                                    }`}
                            />
                        </div>

                        {/* sref 指令 */}
                        <div className="relative flex items-center gap-1.5" data-mj-sref="true">
                            <div className={`input-point ${srefConnected ? 'connected' : ''} ${connectingTarget === node.id && connectingInputType === 'sref' ? 'active' : ''}`}
                                title={t('sref输入')}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    // 立即计算并更新当前鼠标的世界坐标，防止线条乱飞
                                    const world = screenToWorld(e.clientX, e.clientY);
                                    setMousePos(world);
                                    setConnectingTarget(node.id);
                                    setConnectingInputType('sref');
                                }}
                                onMouseUp={(e) => handleNodeMouseUp(node.id, e, 'sref')}
                                data-input-type="sref"
                                style={{ position: 'absolute', top: '50%', left: '-0.25rem', transform: 'translateY(-50%)', width: '0.5rem', height: '0.5rem', marginRight: '0.25rem', zIndex: 20, cursor: 'crosshair' }}
                            />
                            <div className="flex items-center gap-1.5 flex-1 ml-2">
                                <span className={`text-[10px] font-medium ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>sref</span>
                                {srefConnected && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
            {node.type === 'gen-image' && isNanoBanana2 && (
                <div
                    className={`canvas-generation__library mb-2 rounded-lg border p-3 space-y-2 ${theme === 'dark'
                        ? 'bg-zinc-900/50 border-zinc-800'
                        : 'bg-white border-zinc-200'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <button
                            className="flex items-center gap-1 text-[11px] font-semibold"
                            onClick={() => setPromptLibraryCollapsed((v) => !v)}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <span className={theme === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}>{uiText("常用提示词库")}</span>
                            <ChevronRight
                                size={12}
                                className={`transition-transform ${promptLibraryCollapsed ? '' : 'rotate-90'} ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}
                            />
                        </button>
                        <div className="flex items-center gap-2 text-[10px]">
                            <span className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-500'}>{promptLibrary.length} {uiText("项")}</span>
                            <button
                                className={`px-2 py-0.5 rounded text-[10px] border ${theme === 'dark' ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100'}`}
                                onClick={() => setPromptLibraryEditorOpen((v) => !v)}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                {promptLibraryEditorOpen ? uiText("收起") : uiText("管理")}
                            </button>
                        </div>
                    </div>
                    {!promptLibraryCollapsed && (
                        <div className="space-y-2">
                            <div className="max-h-36 overflow-y-auto custom-scrollbar flex flex-wrap gap-2">
                                {promptLibrary.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`border rounded-lg px-2 py-1.5 flex items-center gap-2 text-[11px] ${theme === 'dark' ? 'border-zinc-700 bg-zinc-950/50 text-zinc-200' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}
                                    >
                                        <span className="font-medium whitespace-nowrap">{item.name}</span>
                                        <button
                                            onClick={() => applyLibraryPrompt(node.id, item.prompt)}
                                            className="px-2 py-0.5 rounded text-[10px] bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            {uiText("应用")}</button>
                                        {promptLibraryEditorOpen && (
                                            <button
                                                onClick={() => removePromptLibraryItem(item.id)}
                                                className={`px-2 py-0.5 rounded text-[10px] border ${theme === 'dark' ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border-red-200 text-red-600 hover:bg-red-50'}`}
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                {t('删除')}
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {promptLibrary.length === 0 && (
                                    <div className={`text-[11px] ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{uiText("暂无常用提示词")}</div>
                                )}
                            </div>
                            {promptLibraryEditorOpen && (
                                <div className="grid grid-cols-1 gap-1.5">
                                    <input
                                        type="text"
                                        value={promptLibraryForm.name}
                                        onChange={(e) => setPromptLibraryForm((prev) => ({ ...prev, name: e.target.value }))}
                                        placeholder={t('自定义名称（例如：柔光人像）')}
                                        className={`w-full px-2 py-1 text-[11px] rounded border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600' : 'bg-white border-zinc-300 text-zinc-800 placeholder:text-zinc-400'}`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    />
                                    <textarea
                                        value={promptLibraryForm.prompt}
                                        onChange={(e) => setPromptLibraryForm((prev) => ({ ...prev, prompt: e.target.value }))}
                                        placeholder={t('输入提示词内容...')}
                                        className={`w-full min-h-[70px] px-2 py-1 text-[11px] rounded border resize-none custom-scrollbar ${theme === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600' : 'bg-white border-zinc-300 text-zinc-800 placeholder:text-zinc-400'}`}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    />
                                    <button
                                        onClick={addPromptLibraryItem}
                                        className="w-full py-1.5 rounded text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        {uiText("添加到常用提示词库")}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {(() => {
                const customParamsView = renderCustomParamInputs(
                    node.settings?.model,
                    node.settings?.customParams,
                    (nextParams) => updateNodeSettings(node.id, { customParams: nextParams }),
                    node.id
                );
                if (!customParamsView) return null;
                return (
                    <div className="mb-2">
                        {customParamsView}
                    </div>
                );
            })()}
            <div
                className={`canvas-generation__toolbar mt-auto pt-2 flex items-center justify-between shrink-0 relative gap-2 border-t ${theme === 'dark' ? 'border-zinc-800/50' : 'border-zinc-200'
                    }`}
            >
                <div className="relative flex-1 min-w-0">
                    <button
                        title={getModelLabelWithProvider(node.settings?.model)}
                        onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown?.nodeId === node.id && activeDropdown?.type === 'model' ? null : { nodeId: node.id, type: 'model' }); }}
                        className={`flex items-center gap-2 pl-1 pr-2 py-1 rounded text-[10px] transition-colors border w-full ${theme === 'dark'
                            ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 border-zinc-700/50'
                            : theme === 'solarized'
                                ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
                            }`}
                    >
                        <span className={`w-2 h-2 rounded-full ${getStatusColor(resolveModelKey(node.settings?.model))}`}></span>
                        <span className="truncate">{getModelLabelWithProvider(node.settings?.model)}</span>
                    </button>
                    {activeDropdown?.nodeId === node.id && activeDropdown.type === 'model' && (
                        <CanvasModelMenu
                            groups={Object.entries(groupedApiConfigs)
                                .map(([key, group]) => [key, { ...group, models: group.models.filter(m => node.type === 'gen-image' ? isImageModelType(m.type) : m.type === 'Video') }])
                                .filter(([, group]) => group.models.length > 0)}
                            currentModelKey={resolveModelKey(node.settings?.model)}
                            getStatusColor={getStatusColor}
                            onClose={() => setActiveDropdown(null)}
                            onSelect={m => {
                                const modelKey = m._uid || m.id;
                                applyNodeModelSelection(node.id, node.type, modelKey);
                                if (m.id === 'grok-3' && node.type === 'gen-video') {
                                    updateNodeSettings(node.id, { duration: '8s' });
                                }
                                if (node.type === 'gen-image') {
                                    setLastUsedImageModel(modelKey);
                                    try { localStorage.setItem('tapnow_last_image_model', modelKey); } catch { }
                                } else if (node.type === 'gen-video') {
                                    setLastUsedVideoModel(modelKey);
                                    try { localStorage.setItem('tapnow_last_video_model', modelKey); } catch { }
                                }
                                setActiveDropdown(null);
                                setHoveredProvider(null);
                            }}
                        />
                    )}
                </div>

                {/* Midjourney 版本选择器 */}
                {node.type === 'gen-image' && (() => {
                    const currentModel = getApiConfigByKey(node.settings?.model);
                    return currentModel && (currentModel.id.includes('mj') || currentModel.provider.toLowerCase().includes('midjourney'));
                })() && (
                        <div className="relative flex-1 min-w-0">
                            <button
                                title={MJ_VERSIONS.find(v => v.value === node.settings?.mjVersion)?.label || 'MJ V7'}
                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown?.type === 'mjVersion' && activeDropdown.nodeId === node.id ? null : { nodeId: node.id, type: 'mjVersion' }); }}
                                className={`flex items-center gap-2 pl-1 pr-2 py-1 rounded text-[10px] transition-colors border w-full ${theme === 'dark'
                                    ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 border-zinc-700/50'
                                    : theme === 'solarized'
                                        ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
                                    }`}
                            >
                                <span className="truncate">{MJ_VERSIONS.find(v => v.value === node.settings?.mjVersion)?.label || 'MJ V7'}</span>
                            </button>
                            {activeDropdown?.nodeId === node.id && activeDropdown.type === 'mjVersion' && (
                                <div
                                    className={`absolute bottom-full left-0 mb-1 w-32 rounded-lg shadow-xl p-1 z-[60] border max-h-64 overflow-y-auto custom-scrollbar ${theme === 'dark'
                                        ? 'bg-[#18181b] border-zinc-700'
                                        : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                        }`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {MJ_VERSIONS.map((v) => (
                                        <button
                                            key={v.value}
                                            onClick={() => {
                                                updateNodeSettings(node.id, { mjVersion: v.value });
                                                setActiveDropdown(null);
                                            }}
                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${theme === 'dark'
                                                ? 'hover:bg-zinc-800 text-zinc-300'
                                                : theme === 'solarized' ? 'hover:bg-[#fdf6e3] text-zinc-700' : 'hover:bg-zinc-100 text-zinc-700'
                                                } ${node.settings?.mjVersion === v.value ? (theme === 'dark' ? 'bg-zinc-800' : theme === 'solarized' ? 'bg-[#fdf6e3]' : 'bg-zinc-100') : ''}`}
                                        >
                                            <span className="text-xs font-medium">{v.label}</span>
                                            {node.settings?.mjVersion === v.value && (
                                                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                <div className="flex gap-1 shrink-0">
                    <div className="relative">
                        <button
                            onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown?.type === 'ratio' && activeDropdown.nodeId === node.id ? null : { nodeId: node.id, type: 'ratio' }); }}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${theme === 'dark'
                                ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                : theme === 'solarized'
                                    ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-600 border-[#d7cfb2]'
                                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                }`}
                        >
                            {(() => {
                                const ratioValue = node.settings?.ratio || 'Auto';
                                const ratioConfig = getApiConfigByKey(node.settings?.model);
                                return ratioValue === 'Auto'
                                    ? 'Auto'
                                    : getValueLabelWithNotes(ratioValue, !!ratioConfig?.ratioNotesEnabled, ratioConfig?.ratioNotes || {});
                            })()}
                        </button>
                        {activeDropdown?.nodeId === node.id && activeDropdown.type === 'ratio' && (
                            <div
                                className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-20 rounded-lg shadow-xl p-1 z-[60] border ${theme === 'dark'
                                    ? 'bg-[#18181b] border-zinc-700'
                                    : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                    }`}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                {getRatiosForModel(node.settings?.model).map(r => {
                                    const ratioConfig = getApiConfigByKey(node.settings?.model);
                                    const label = r === 'Auto'
                                        ? 'Auto'
                                        : getValueLabelWithNotes(r, !!ratioConfig?.ratioNotesEnabled, ratioConfig?.ratioNotes || {});
                                    return (
                                        <button
                                            key={r}
                                            onClick={() => {
                                                updateNodeSettings(node.id, { ratio: r });
                                                setLastUsedRatio(r);
                                                try { localStorage.setItem('tapnow_last_ratio', r); } catch { /* 无需处理 */ }
                                                setActiveDropdown(null);
                                            }}
                                            className={`w-full text-center py-1 text-[10px] rounded ${theme === 'dark'
                                                ? 'text-zinc-300 hover:bg-zinc-800'
                                                : theme === 'solarized' ? 'text-zinc-700 hover:bg-[#fdf6e3]' : 'text-zinc-700 hover:bg-zinc-100'
                                                }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {node.type === 'gen-video' && (() => {
                        const currentModel = getApiConfigByKey(node.settings?.model);
                        const modelId = currentModel?.id || currentModel?.modelName || '';
                        const resolutionOptions = getVideoResolutionsForModel(modelId);
                        if (!resolutionOptions.length) return null;
                        const currentResolution = normalizeVideoResolution(node.settings?.resolution || lastUsedVideoResolution || '720P');
                        const fallbackResolution = resolutionOptions.find((res) => res !== 'Auto') || '720P';
                        const resolvedResolution = resolutionOptions.includes(currentResolution) ? currentResolution : fallbackResolution;
                        if (resolvedResolution !== currentResolution) {
                            setTimeout(() => {
                                updateNodeSettings(node.id, { resolution: resolvedResolution });
                            }, 0);
                        }
                        return (
                            <div className="relative">
                                <button
                                    onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown?.type === 'vres' && activeDropdown.nodeId === node.id ? null : { nodeId: node.id, type: 'vres' }); }}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${theme === 'dark'
                                        ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                        : theme === 'solarized'
                                            ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-600 border-[#d7cfb2]'
                                            : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                        }`}
                                >
                                    {resolvedResolution === 'Auto'
                                        ? uiText("不选")
                                        : getValueLabelWithNotes(
                                            resolvedResolution,
                                            !!currentModel?.videoResolutionNotesEnabled,
                                            currentModel?.videoResolutionNotes || {}
                                        )}
                                </button>
                                {activeDropdown?.nodeId === node.id && activeDropdown.type === 'vres' && (
                                    <div
                                        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-24 rounded-lg shadow-xl p-1 z-[60] border ${theme === 'dark'
                                            ? 'bg-[#18181b] border-zinc-700'
                                            : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                            }`}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        {resolutionOptions.map(r => (
                                            <button
                                                key={r}
                                                onClick={() => {
                                                    updateNodeSettings(node.id, { resolution: r });
                                                    if (r !== 'Auto') {
                                                        setLastUsedVideoResolution(r);
                                                        try { localStorage.setItem('tapnow_last_video_res', r); } catch { /* 无需处理 */ }
                                                    }
                                                    setActiveDropdown(null);
                                                }}
                                        className={`w-full text-center py-1 text-[10px] rounded ${theme === 'dark'
                                            ? 'text-zinc-300 hover:bg-zinc-800'
                                            : theme === 'solarized' ? 'text-zinc-700 hover:bg-[#fdf6e3]' : 'text-zinc-700 hover:bg-zinc-100'
                                            }`}
                                            >
                                                {r === 'Auto'
                                                    ? uiText("不选")
                                                    : getValueLabelWithNotes(
                                                        r,
                                                        !!currentModel?.videoResolutionNotesEnabled,
                                                        currentModel?.videoResolutionNotes || {}
                                                    )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {node.type === 'gen-image' && (() => {
                        const currentModel = getApiConfigByKey(node.settings?.model);
                        const isMidjourney = currentModel && (currentModel.id.includes('mj') || currentModel.provider.toLowerCase().includes('midjourney'));
                        return !isMidjourney;
                    })() ? (
                        <div className="relative">
                            <button
                                onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown?.type === 'res' && activeDropdown.nodeId === node.id ? null : { nodeId: node.id, type: 'res' }); }}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${theme === 'dark'
                                    ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                    : theme === 'solarized'
                                        ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-600 border-[#d7cfb2]'
                                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                    }`}
                            >
                                {(() => {
                                    const currentModel = getApiConfigByKey(node.settings?.model);
                                    const modelId = currentModel?.id || currentModel?.modelName || '';
                                    const availableResolutions = getResolutionsForModel(modelId);
                                    const currentResolution = node.settings?.resolution || '2K';
                                    const normalizedResolution = normalizeImageResolution(currentResolution);
                                    // 如果当前分辨率不在可用选项中，使用第一个可用选项作为显示值
                                    const displayResolution = availableResolutions.includes(normalizedResolution)
                                        ? normalizedResolution
                                        : (availableResolutions[0] || '2K');
                                    const displayLabel = getValueLabelWithNotes(
                                        displayResolution,
                                        !!currentModel?.resolutionNotesEnabled,
                                        currentModel?.resolutionNotes || {}
                                    );
                                    // 如果当前分辨率不在可用选项中，自动更新
                                    if (currentResolution !== normalizedResolution && availableResolutions.includes(normalizedResolution)) {
                                        setTimeout(() => {
                                            updateNodeSettings(node.id, { resolution: normalizedResolution });
                                        }, 0);
                                    } else if (!availableResolutions.includes(normalizedResolution) && availableResolutions.length > 0) {
                                        setTimeout(() => {
                                            updateNodeSettings(node.id, { resolution: availableResolutions[0] });
                                        }, 0);
                                    }
                                    return displayLabel;
                                })()}
                            </button>
                            {activeDropdown?.nodeId === node.id && activeDropdown.type === 'res' && (() => {
                                const currentModel = getApiConfigByKey(node.settings?.model);
                                const modelId = currentModel?.id || currentModel?.modelName || '';
                                const availableResolutions = getResolutionsForModel(modelId);
                                return (
                                    <div
                                        className={`absolute bottom-full right-0 mb-1 w-24 rounded-lg shadow-xl p-1 z-[60] border ${theme === 'dark'
                                            ? 'bg-[#18181b] border-zinc-700'
                                            : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                            }`}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        {availableResolutions.map(r => (
                                            <button
                                                key={r}
                                                onClick={() => {
                                                    updateNodeSettings(node.id, { resolution: r });
                                                    setLastUsedImageResolution(r);
                                                    try { localStorage.setItem('tapnow_last_image_res', r); } catch { /* 无需处理 */ }
                                                    setActiveDropdown(null);
                                                }}
                                                className={`w-full text-center py-1 text-[10px] rounded ${theme === 'dark'
                                                    ? 'text-zinc-300 hover:bg-zinc-800'
                                                    : theme === 'solarized' ? 'text-zinc-700 hover:bg-[#fdf6e3]' : 'text-zinc-700 hover:bg-zinc-100'
                                                    }`}
                                            >
                                                {getValueLabelWithNotes(r, !!currentModel?.resolutionNotesEnabled, currentModel?.resolutionNotes || {})}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    ) : (
                        (() => {
                            const currentModel = getApiConfigByKey(node.settings?.model);
                            const isMidjourney = currentModel && (currentModel.id.includes('mj') || currentModel.provider.toLowerCase().includes('midjourney'));
                            const durationOptions = getDefaultDurationsForModel(node.settings?.model);
                            const storedDuration = node.settings?.duration;
                            const currentDuration = durationOptions.includes(storedDuration)
                                ? storedDuration
                                : (durationOptions[0] || '5s');
                            if (!storedDuration || !durationOptions.includes(storedDuration)) {
                                setTimeout(() => {
                                    updateNodeSettings(node.id, { duration: durationOptions[0] || '5s' });
                                }, 0);
                            }
                            return !isMidjourney ? (
                                <>
                                    <div className="relative">
                                        <button
                                            onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown?.type === 'duration' && activeDropdown.nodeId === node.id ? null : { nodeId: node.id, type: 'duration' }); }}
                                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border ${theme === 'dark'
                                                ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                                : theme === 'solarized'
                                                    ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                                }`}
                                        >
                                            {getValueLabelWithNotes(currentDuration, !!currentModel?.durationNotesEnabled, currentModel?.durationNotes || {})}
                                        </button>
                                        {activeDropdown?.nodeId === node.id && activeDropdown.type === 'duration' && (
                                            <div
                                                className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-20 rounded-lg shadow-xl p-1 z-[60] border ${theme === 'dark'
                                                    ? 'bg-[#18181b] border-zinc-700'
                                                    : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                                    }`}
                                                onMouseDown={e => e.stopPropagation()}
                                            >
                                                {(durationOptions.length > 0 ? durationOptions : ['5s', '10s']).map(d => (
                                                    <button
                                                        key={d}
                                                        onClick={() => {
                                                            updateNodeSettings(node.id, { duration: d });
                                                            setActiveDropdown(null);
                                                        }}
                                                        className={`w-full text-center py-1 text-[10px] rounded ${theme === 'dark'
                                                            ? 'text-zinc-300 hover:bg-zinc-800'
                                                            : theme === 'solarized' ? 'text-zinc-700 hover:bg-[#fdf6e3]' : 'text-zinc-700 hover:bg-zinc-100'
                                                            }`}
                                                    >
                                                        {getValueLabelWithNotes(d, !!currentModel?.durationNotesEnabled, currentModel?.durationNotes || {})}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {node.type === 'gen-video' && currentModel?.supportsHD && (
                                        <label className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border cursor-pointer transition-colors ${theme === 'dark'
                                            ? node.settings?.isHD ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                            : theme === 'solarized'
                                                ? node.settings?.isHD ? 'bg-[#eee8d5] border-[#d7cfb2] text-zinc-800' : 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                                : node.settings?.isHD ? 'bg-blue-500/30 border-blue-400 text-blue-700' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                            }`} onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={node.settings?.isHD || false}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    updateNodeSettings(node.id, { isHD: e.target.checked });
                                                }}
                                                className="w-3 h-3 cursor-pointer"
                                                onMouseDown={e => e.stopPropagation()}
                                        />
                                        <span>HD</span>
                                    </label>
                                    )}
                                    {node.type === 'gen-video' && (() => {
                                        const supportsFirstLastFrame = !!currentModel?.supportsFirstLastFrame;
                                        const useFirstLastFrame = !!(node.settings?.useFirstLastFrame || node.settings?.veoFramesMode);
                                        if (!supportsFirstLastFrame) return null;
                                        return (
                                            <label className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border cursor-pointer transition-colors ${theme === 'dark'
                                                ? useFirstLastFrame ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200' : 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 border-zinc-700/50'
                                                : theme === 'solarized'
                                                    ? useFirstLastFrame ? 'bg-[#eee8d5] border-[#d7cfb2] text-zinc-800' : 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                                    : useFirstLastFrame ? 'bg-emerald-500/20 border-emerald-300 text-emerald-700' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-300'
                                                }`} onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={useFirstLastFrame}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        updateNodeSettings(node.id, { useFirstLastFrame: e.target.checked, veoFramesMode: e.target.checked });
                                                    }}
                                                    className="w-3 h-3 cursor-pointer"
                                                    onMouseDown={e => e.stopPropagation()}
                                                />
                                                <span>{t('首尾帧')}</span>
                                            </label>
                                        );
                                    })()}
                                </>
                            ) : null;
                        })()
                    )}

                    {node.type === 'gen-image' && (
                        <div className="relative">
                            <button
                                onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown?.type === 'imgConcurrency' && activeDropdown.nodeId === node.id ? null : { nodeId: node.id, type: 'imgConcurrency' }); }}
                                className={`flex items-center justify-center min-w-[34px] px-2 py-1 rounded text-[10px] border ${theme === 'dark'
                                    ? 'bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 border-zinc-700/50'
                                    : theme === 'solarized'
                                        ? 'bg-[#fdf6e3] hover:bg-[#eee8d5] text-zinc-700 border-[#d7cfb2]'
                                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
                                    }`}
                                title={t('图片张数(1/2/4/9)')}
                            >
                                {uiText("{0}张", normalizeImageConcurrency(
                                    node.settings?.imageConcurrency
                                    || node.settings?.concurrentImages
                                    || getApiConfigByKey(node.settings?.model)?.defaultImageConcurrency
                                    || 1
                                ))}
                            </button>
                            {activeDropdown?.nodeId === node.id && activeDropdown.type === 'imgConcurrency' && (
                                <div
                                    className={`absolute bottom-full right-0 mb-1 w-16 rounded-lg shadow-xl p-1 z-[60] border ${theme === 'dark'
                                        ? 'bg-[#18181b] border-zinc-700'
                                        : theme === 'solarized' ? 'bg-[#eee8d5] border-[#d7cfb2]' : 'bg-white border-zinc-200'
                                        }`}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    {[1, 2, 4, 9].map((count) => (
                                        <button
                                            key={count}
                                            onClick={() => {
                                                updateNodeSettings(node.id, { imageConcurrency: count, concurrentImages: count });
                                                setActiveDropdown(null);
                                            }}
                                            className={`w-full text-center py-1 text-[10px] rounded ${theme === 'dark'
                                                ? 'text-zinc-300 hover:bg-zinc-800'
                                                : theme === 'solarized' ? 'text-zinc-700 hover:bg-[#fdf6e3]' : 'text-zinc-700 hover:bg-zinc-100'
                                                }`}
                                        >
                                            {uiText("{0}张", count)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <button onClick={() => {
                    startGeneration(finalPrompt, node.type === 'gen-image' ? 'image' : 'video', connectedImages, node.id, {
                        customParams: node.settings?.customParams,
                        imageConcurrency: normalizeImageConcurrency(
                            node.settings?.imageConcurrency
                            || node.settings?.concurrentImages
                            || getApiConfigByKey(node.settings?.model)?.defaultImageConcurrency
                            || 1
                        )
                    });
                }} className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded-md shadow-lg active:scale-95 transition-transform shrink-0" title={t('生成')}>
                    <Play size={12} fill="currentColor" />
                </button>
            </div>
        </div>
    );
}

export default GenerationNodeContent;
