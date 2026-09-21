import { uiText, useUiLanguage } from '../../../../i18n/uiText'
import React, { lazy, Suspense, useState } from 'react';
import {
    BookOpen,
    Download,
    Layers,
    Moon,
    Plus,
    RotateCcw,
    RotateCw,
    Settings,
    Sparkles,
    Sun,
    Zap,
} from 'lucide-react';
import { Button, t } from '../freeCanvasShared';

const CanvasUserManual = lazy(() => import('./CanvasUserManual'));

function getPanelThemeClass(theme) {
    if (theme === 'dark') return 'bg-[#09090b] border-zinc-800';
    if (theme === 'solarized') return 'bg-[#eee8d5] border-[#d7cfb2]';
    return 'bg-white border-zinc-200';
}

function getToolbarButtonClass(theme) {
    if (theme === 'dark') return 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800';
    if (theme === 'solarized') return 'bg-[#616161] border-[#525252] text-[#fdf6e3] hover:bg-[#555555]';
    return 'bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200';
}

function getDisabledToolbarButtonClass(theme) {
    if (theme === 'dark') return 'bg-zinc-900/50 border-zinc-800 text-zinc-600 cursor-not-allowed';
    if (theme === 'solarized') return 'bg-[#616161]/60 border-[#525252] text-[#fdf6e3]/60 cursor-not-allowed';
    return 'bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed';
}

function ToolbarButton({ children, className = '', ...props }) {
    return (
        <button
            {...props}
            className={`flex shrink-0 whitespace-nowrap items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${className}`}
        >
            {children}
        </button>
    );
}

export function CanvasTopBar({
    theme,
    projectName,
    setProjectName,
    isEditingProjectName,
    setIsEditingProjectName,
    projectNameInputRef,
    onProjectNameCommit,
    onNewProject,
    globalPerformanceMode,
    setGlobalPerformanceMode,
    onBatchDownload,
    onToggleTheme,
    language,
    onLanguageChange,
    onUndo,
    onRedo,
    undoDisabled,
    redoDisabled,
    onOpenSettings,
}) {
  useUiLanguage()

    const toolbarButtonClass = getToolbarButtonClass(theme);
    const [manualOpen, setManualOpen] = useState(false);

    return (
        <div
            className={`min-h-12 flex flex-wrap items-center justify-between gap-2 px-4 py-2 z-50 shrink-0 border-b transition-colors duration-300 ${getPanelThemeClass(theme)}`}
        >
            <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-md flex items-center justify-center">
                    <Layers size={16} className="text-white" />
                </div>
                <span
                    className={`font-bold text-sm tracking-wide ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}
                >
                    Reelmax Canvas
                </span>

                {isEditingProjectName ? (
                    <input
                        ref={projectNameInputRef}
                        type="text"
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        onBlur={onProjectNameCommit}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') onProjectNameCommit();
                        }}
                        className={`ml-2 px-2 py-0.5 text-xs border rounded outline-none ${theme === 'dark'
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                            : theme === 'solarized'
                                ? 'bg-[#fdf6e3] border-[#eee8d5] text-zinc-800'
                                : 'bg-white border-zinc-300 text-zinc-800'
                            }`}
                        style={{ minWidth: '100px', maxWidth: '200px' }}
                    />
                ) : (
                    <span
                        onClick={() => {
                            setIsEditingProjectName(true);
                            setTimeout(() => projectNameInputRef.current?.focus(), 0);
                        }}
                        className={`ml-2 text-xs cursor-pointer hover:underline ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}
                        title={t('点击编辑项目名称')}
                    >
                        {projectName}
                    </span>
                )}

                <button
                    onClick={onNewProject}
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${theme === 'dark'
                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        : theme === 'solarized'
                            ? 'border-[#d7cfb2] text-[#586e75] hover:bg-[#fdf6e3]'
                            : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100'
                        }`}
                    title={t('新建空项目（清空当前内容）')}
                >
                    <Plus size={12} />
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <ToolbarButton
                    onClick={() => {
                        const modes = ['off', 'normal', 'ultra'];
                        const currentIndex = modes.indexOf(globalPerformanceMode);
                        setGlobalPerformanceMode(modes[(currentIndex + 1) % modes.length]);
                    }}
                    className={globalPerformanceMode !== 'off'
                        ? theme === 'dark'
                            ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
                            : theme === 'solarized'
                                ? 'bg-blue-600 border-blue-500 text-[#fdf6e3] hover:bg-blue-500'
                                : 'bg-blue-500 border-blue-400 text-white hover:bg-blue-600'
                        : toolbarButtonClass
                    }
                    title={
                        globalPerformanceMode === 'ultra'
                            ? uiText("极致性能模式（点击关闭）")
                            : globalPerformanceMode === 'normal'
                                ? uiText("普通性能模式（点击切换极致）")
                                : uiText("性能模式已关闭（点击开启）")
                    }
                >
                    <Zap size={14} className={globalPerformanceMode !== 'off' ? 'fill-current' : ''} />
                    <span>{globalPerformanceMode === 'ultra' ? t('极致模式') : t('性能模式')}</span>
                </ToolbarButton>

                <ToolbarButton
                    onClick={onBatchDownload}
                    className={toolbarButtonClass}
                    title={t('批量下载选中的图片/视频节点')}
                >
                    <Download size={14} />
                    <span>{t('下载')}</span>
                </ToolbarButton>

                <ToolbarButton
                    onClick={onToggleTheme}
                    className={toolbarButtonClass}
                    title={t('切换主题')}
                >
                    {theme === 'light' ? (
                        <>
                            <Sun size={14} className="text-amber-400" />
                            <span>{t('亮光')}</span>
                        </>
                    ) : theme === 'solarized' ? (
                        <>
                            <Sun size={14} className="text-yellow-600" />
                            <span>{t('日光')}</span>
                        </>
                    ) : (
                        <>
                            <Moon size={14} className="text-blue-500" />
                            <span>{t('暗光')}</span>
                        </>
                    )}
                </ToolbarButton>

                <ToolbarButton
                    onClick={() => onLanguageChange(language === 'zh' ? 'en' : 'zh')}
                    className={toolbarButtonClass}
                    title={t('切换语言')}
                >
                    <span>{language === 'zh' ? t('中文') : t('英文')}</span>
                </ToolbarButton>

                <ToolbarButton
                    onClick={onUndo}
                    disabled={undoDisabled}
                    className={`px-2 ${undoDisabled ? getDisabledToolbarButtonClass(theme) : toolbarButtonClass}`}
                    title={t('撤销 (Ctrl+Z)')}
                >
                    <RotateCcw size={14} />
                </ToolbarButton>

                <ToolbarButton
                    onClick={onRedo}
                    disabled={redoDisabled}
                    className={`px-2 ${redoDisabled ? getDisabledToolbarButtonClass(theme) : toolbarButtonClass}`}
                    title={t('重做 (Ctrl+Shift+Z)')}
                >
                    <RotateCw size={14} />
                </ToolbarButton>

                <Button
                    variant="ghost"
                    onClick={onNewProject}
                    className={theme === 'solarized' ? '!bg-[#616161] !border !border-[#525252] !text-[#fdf6e3] hover:!bg-[#555555]' : ''}
                >
                    {t('清空')}
                </Button>
                <Button
                    variant="secondary"
                    icon={BookOpen}
                    onClick={() => setManualOpen(true)}
                    title={language === 'en' ? 'Preview user manual' : uiText("预览用户手册")}
                    className="shrink-0 whitespace-nowrap"
                >
                    {language === 'en' ? 'User manual' : uiText("用户手册")}
                </Button>
                <Button
                    variant="secondary"
                    icon={Settings}
                    onClick={onOpenSettings}
                    className={theme === 'solarized' ? '!bg-[#616161] !border-[#525252] !text-[#fdf6e3] hover:!bg-[#555555]' : ''}
                >
                    {t('API 设置')}
                </Button>
            </div>
            {manualOpen && <Suspense fallback={null}>
                <CanvasUserManual theme={theme} language={language} onClose={() => setManualOpen(false)} />
            </Suspense>}
        </div>
    );
}

export function CanvasEmptyHint({ theme }) {
    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className={`flex items-center gap-2.5 rounded-xl border px-5 py-3 shadow-2xl backdrop-blur-md ${theme === 'dark'
                ? 'bg-zinc-950/70 border-white/10 text-zinc-100 shadow-black/40'
                : theme === 'solarized'
                    ? 'bg-[#fdf6e3]/80 border-[#d7cfb2] text-[#586e75] shadow-black/10'
                    : 'bg-white/85 border-zinc-200 text-zinc-900 shadow-zinc-300/30'
                }`}
            >
                <Sparkles size={18} className={theme === 'dark' ? 'text-cyan-300' : 'text-blue-500'} />
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{t('双击画布')}</span>
                    <span className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{t('自由生成节点')}</span>
                </div>
            </div>
        </div>
    );
}
