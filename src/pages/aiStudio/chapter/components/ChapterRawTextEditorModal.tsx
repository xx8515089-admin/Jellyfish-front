import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Collapse, Empty, Input, List, Modal, Space, Spin, Tag, message } from 'antd'
import {
  CloseCircleOutlined,
  DiffOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { ScriptProcessingService, StudioChaptersService } from '../../../../services/generated'
import type { ScriptConsistencyCheckResult } from '../../../../services/generated'
import {
  CONSISTENCY_CHECK_RELATION_TYPE,
  SCRIPT_OPTIMIZATION_RELATION_TYPE,
  SCRIPT_SIMPLIFICATION_RELATION_TYPE,
  useCancelableRelationTask,
} from '../../project/ProjectWorkbench/chapterDivisionTasks'
import { executeAsyncTaskCreate, executeTaskCancel, notifyExistingTask } from '../../components/taskActionHelpers'
import { handleTaskResultSafely } from '../../components/taskResultHelpers'
import { useRelationTaskNotification } from '../../components/taskNotificationHelpers'
import { useTaskPageContext } from '../../components/taskPageContext'
import { TASK_COPY } from '../../components/taskCopy'
import { useBilingualText } from '../../../../i18n/useBilingualText'

type EditorMode = 'raw' | 'condensed' | 'compare'

type HistoryItem = {
  id: string
  at: number
  rawText: string
  condensedText: string
}

export function ChapterRawTextEditorModal({
  open,
  onClose,
  chapterId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  chapterId: string | undefined
  onSaved?: (next: { rawText?: string; condensedText?: string }) => void
}) {
  const l = useBilingualText()
  const consistencyTaskCopy = TASK_COPY.consistencyCheck
  const simplifyTaskCopy = TASK_COPY.scriptSimplify
  const optimizeTaskCopy = TASK_COPY.scriptOptimize
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [checkingConsistency, setCheckingConsistency] = useState(false)
  const [optimizingScript, setOptimizingScript] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const [mode, setMode] = useState<EditorMode>('raw')
  const [rawText, setRawText] = useState('')
  const [condensedText, setCondensedText] = useState('')
  const [savedRawText, setSavedRawText] = useState('')
  const [savedCondensedText, setSavedCondensedText] = useState('')
  const [editorText, setEditorText] = useState('')
  const [compareRaw, setCompareRaw] = useState('')
  const [compareCondensed, setCompareCondensed] = useState('')
  const [consistencyResult, setConsistencyResult] = useState<ScriptConsistencyCheckResult | null>(null)

  const applyConsistencyTaskResult = useCallback(async (taskId: string) => {
    await handleTaskResultSafely(taskId, {
      readErrorMessage: l('读取一致性检查结果失败', 'Failed to read consistency check results'),
      failedFallbackMessage: l('一致性检查失败', 'Consistency check failed'),
      onSucceeded: (resultValue) => {
        setConsistencyResult(resultValue as ScriptConsistencyCheckResult)
        const result = resultValue as Record<string, any>
        if (result?.has_issues) {
          message.warning(l(`发现 ${Array.isArray(result.issues) ? result.issues.length : 0} 个角色混淆问题`, `Found ${Array.isArray(result.issues) ? result.issues.length : 0} character ambiguity issues`))
        } else {
          message.success(l('未发现角色混淆问题', 'No character ambiguity issues found'))
        }
      },
      onFailed: (errorMessage) => {
        message.error(errorMessage)
      },
      onReadError: () => {
        message.error(l('读取一致性检查结果失败', 'Failed to read consistency check results'))
      },
    })
  }, [])

  const applySimplifyResult = useCallback(async (taskId: string) => {
    await handleTaskResultSafely(taskId, {
      readErrorMessage: l('读取智能精简结果失败', 'Failed to read simplification results'),
      failedFallbackMessage: l('智能精简失败', 'Smart simplification failed'),
      onSucceeded: (resultValue) => {
        const result = resultValue as Record<string, any>
        const simplified = String(result?.simplified_script_text ?? '').trim()
        if (!simplified) {
          message.error(l('智能精简失败：未返回有效内容', 'Smart simplification failed: no valid content returned'))
          return
        }
        setCondensedText(simplified)
        if (mode === 'compare') {
          setCompareCondensed(simplified)
        } else {
          setMode('condensed')
          setEditorText(simplified)
        }
        message.success(l('智能精简完成', 'Smart simplification complete'))
      },
      onFailed: (errorMessage) => {
        message.error(errorMessage)
      },
      onReadError: () => {
        message.error(l('读取智能精简结果失败', 'Failed to read simplification results'))
      },
    })
  }, [mode])

  const applyOptimizeResult = useCallback(async (taskId: string) => {
    await handleTaskResultSafely(taskId, {
      readErrorMessage: l('读取一键优化结果失败', 'Failed to read optimization results'),
      failedFallbackMessage: l('一键优化失败', 'One-click optimization failed'),
      onSucceeded: (resultValue) => {
        const result = resultValue as Record<string, any>
        const optimized = String(result?.optimized_script_text ?? '').trim()
        if (!optimized) {
          message.error(l('一键优化失败：未返回有效内容', 'One-click optimization failed: no valid content returned'))
          return
        }
        setRawText(optimized)
        setEditorText(optimized)
        setMode('raw')
        setCompareRaw(optimized)
        message.success(l('一键优化完成', 'One-click optimization complete'))
      },
      onFailed: (errorMessage) => {
        message.error(errorMessage)
      },
      onReadError: () => {
        message.error(l('读取一键优化结果失败', 'Failed to read optimization results'))
      },
    })
  }, [])

  const { task: consistencyTask, settledTask: consistencySettledTask, trackTaskData: trackConsistencyTaskData, applyCancelData: applyConsistencyCancelData } = useCancelableRelationTask({
    enabled: open && !!chapterId,
    relationType: CONSISTENCY_CHECK_RELATION_TYPE,
    relationEntityId: chapterId,
    onTaskSettled: applyConsistencyTaskResult,
  })

  const { task: simplifyTask, settledTask: simplifySettledTask, trackTaskData: trackSimplifyTaskData, applyCancelData: applySimplifyCancelData } = useCancelableRelationTask({
    enabled: open && !!chapterId,
    relationType: SCRIPT_SIMPLIFICATION_RELATION_TYPE,
    relationEntityId: chapterId,
    onTaskSettled: applySimplifyResult,
  })

  const { task: optimizeTask, settledTask: optimizeSettledTask, trackTaskData: trackOptimizeTaskData, applyCancelData: applyOptimizeCancelData } = useCancelableRelationTask({
    enabled: open && !!chapterId,
    relationType: SCRIPT_OPTIMIZATION_RELATION_TYPE,
    relationEntityId: chapterId,
    onTaskSettled: applyOptimizeResult,
  })
  useTaskPageContext(
    open && chapterId
      ? [
          {
            relationType: CONSISTENCY_CHECK_RELATION_TYPE,
            relationEntityId: chapterId,
          },
          {
            relationType: SCRIPT_SIMPLIFICATION_RELATION_TYPE,
            relationEntityId: chapterId,
          },
          {
            relationType: SCRIPT_OPTIMIZATION_RELATION_TYPE,
            relationEntityId: chapterId,
          },
        ]
      : [],
  )

  const plainWordCount = useMemo(() => editorText.trim().length, [editorText])
  const paragraphCount = useMemo(() => editorText.split(/\n\s*\n/).filter((p) => p.trim()).length, [editorText])
  const actionsLoading =
    extracting || checkingConsistency || optimizingScript || !!simplifyTask || !!optimizeTask || !!consistencyTask
  const consistencyIssues = useMemo(() => {
    const list = (consistencyResult?.issues as any[] | undefined) ?? []
    return Array.isArray(list) ? list : []
  }, [consistencyResult])

  useEffect(() => {
    if (!open) return
    if (!chapterId) return
    setLoading(true)
    StudioChaptersService.getChapterApiV1StudioChaptersChapterIdGet({ chapterId })
      .then((res) => {
        const data = res.data
        const nextRaw = data?.raw_text ?? ''
        const nextCondensed = data?.condensed_text ?? ''
        setRawText(nextRaw)
        setCondensedText(nextCondensed)
        setSavedRawText(nextRaw)
        setSavedCondensedText(nextCondensed)
        setMode('raw')
        setEditorText(nextRaw)
        setCompareRaw(nextRaw)
        setCompareCondensed(nextCondensed)
        setConsistencyResult(null)
      })
      .catch(() => {
        message.error(l('加载章节失败', 'Failed to load chapter'))
      })
      .finally(() => setLoading(false))
  }, [open, chapterId])

  const handleSmartSimplify = async () => {
    if (!rawText.trim()) {
      message.warning(l('请先输入原文', 'Enter source text first'))
      return
    }
    if (notifyExistingTask(simplifyTask, {
      cancellingMessage: simplifyTaskCopy.cancellingMessage,
      runningMessage: simplifyTaskCopy.runningMessage,
    })) {
      return
    }
    setExtracting(true)
    try {
      await executeAsyncTaskCreate({
        request: () =>
          ScriptProcessingService.simplifyScriptAsyncApiV1ScriptProcessingSimplifyScriptAsyncPost({
            requestBody: {
              chapter_id: chapterId ?? null,
              script_text: rawText,
            },
          }),
        trackTaskData: trackSimplifyTaskData,
        startedMessage: simplifyTaskCopy.startedMessage,
        reusedMessage: simplifyTaskCopy.reusedMessage,
        fallbackErrorMessage: l('智能精简失败', 'Smart simplification failed'),
      })
    } catch {
      // executeAsyncTaskCreate 已统一处理错误提示
    } finally {
      setExtracting(false)
    }
  }

  const handleCheckConsistency = async () => {
    const scriptText = rawText.trim()
    if (!scriptText) {
      message.warning(l('请先输入原文', 'Enter source text first'))
      return
    }
    if (notifyExistingTask(consistencyTask, {
      cancellingMessage: consistencyTaskCopy.cancellingMessage,
      runningMessage: consistencyTaskCopy.runningMessage,
    })) {
      return
    }
    setCheckingConsistency(true)
    try {
      await executeAsyncTaskCreate({
        request: () =>
          ScriptProcessingService.checkConsistencyAsyncApiV1ScriptProcessingCheckConsistencyAsyncPost({
            requestBody: { script_text: scriptText, chapter_id: chapterId ?? null },
          }),
        trackTaskData: trackConsistencyTaskData,
        startedMessage: consistencyTaskCopy.startedMessage,
        reusedMessage: consistencyTaskCopy.reusedMessage,
        fallbackErrorMessage: l('一致性检查失败', 'Consistency check failed'),
      })
    } catch {
      // executeAsyncTaskCreate 已统一处理错误提示
    } finally {
      setCheckingConsistency(false)
    }
  }

  const handleCancelConsistencyTask = async () => {
    if (!consistencyTask?.taskId) return
    try {
      await executeTaskCancel({
        taskId: consistencyTask.taskId,
        reason: l('用户在原文编辑弹窗取消一致性检查任务', 'User cancelled the consistency check from the source text editor'),
        applyCancelData: applyConsistencyCancelData,
        cancelledImmediatelyMessage: consistencyTaskCopy.cancelledImmediatelyMessage,
        cancelRequestedMessage: consistencyTaskCopy.cancelRequestedMessage,
        fallbackErrorMessage: l('取消一致性检查任务失败', 'Failed to cancel consistency check'),
      })
    } catch {
      // executeTaskCancel 已统一处理错误提示
    }
  }

  const handleOneClickOptimize = async () => {
    const scriptText = rawText.trim()
    if (!scriptText) {
      message.warning(l('请先输入原文', 'Enter source text first'))
      return
    }
    if (!consistencyResult) {
      message.info(l('请先进行角色混淆检查', 'Run the character ambiguity check first'))
      return
    }
    if (notifyExistingTask(optimizeTask, {
      cancellingMessage: optimizeTaskCopy.cancellingMessage,
      runningMessage: optimizeTaskCopy.runningMessage,
    })) {
      return
    }
    setOptimizingScript(true)
    try {
      await executeAsyncTaskCreate({
        request: () =>
          ScriptProcessingService.optimizeScriptAsyncApiV1ScriptProcessingOptimizeScriptAsyncPost({
            requestBody: {
              chapter_id: chapterId ?? null,
              script_text: scriptText,
              consistency: consistencyResult as any,
            },
          }),
        trackTaskData: trackOptimizeTaskData,
        startedMessage: optimizeTaskCopy.startedMessage,
        reusedMessage: optimizeTaskCopy.reusedMessage,
        fallbackErrorMessage: l('一键优化失败', 'One-click optimization failed'),
      })
    } catch {
      // executeAsyncTaskCreate 已统一处理错误提示
    } finally {
      setOptimizingScript(false)
    }
  }

  const handleCancelSimplifyTask = async () => {
    if (!simplifyTask?.taskId) return
    try {
      await executeTaskCancel({
        taskId: simplifyTask.taskId,
        reason: l('用户在原文编辑弹窗取消智能精简任务', 'User cancelled smart simplification from the source text editor'),
        applyCancelData: applySimplifyCancelData,
        cancelledImmediatelyMessage: simplifyTaskCopy.cancelledImmediatelyMessage,
        cancelRequestedMessage: simplifyTaskCopy.cancelRequestedMessage,
        fallbackErrorMessage: l('取消智能精简任务失败', 'Failed to cancel smart simplification'),
      })
    } catch {
      // executeTaskCancel 已统一处理错误提示
    }
  }

  const handleCancelOptimizeTask = async () => {
    if (!optimizeTask?.taskId) return
    try {
      await executeTaskCancel({
        taskId: optimizeTask.taskId,
        reason: l('用户在原文编辑弹窗取消一键优化任务', 'User cancelled one-click optimization from the source text editor'),
        applyCancelData: applyOptimizeCancelData,
        cancelledImmediatelyMessage: optimizeTaskCopy.cancelledImmediatelyMessage,
        cancelRequestedMessage: optimizeTaskCopy.cancelRequestedMessage,
        fallbackErrorMessage: l('取消一键优化任务失败', 'Failed to cancel one-click optimization'),
      })
    } catch {
      // executeTaskCancel 已统一处理错误提示
    }
  }

  useRelationTaskNotification({
    task: consistencyTask,
    settledTask: consistencySettledTask,
    title: consistencyTaskCopy.title,
    sourceLabel: l('章节原文编辑', 'Chapter source text editor'),
    runningDescription: consistencyTaskCopy.runningDescription,
    cancellingDescription: consistencyTaskCopy.cancellingDescription,
    successDescription: consistencyTaskCopy.successDescription,
    cancelledDescription: consistencyTaskCopy.cancelledDescription,
    failedDescription: consistencyTaskCopy.failedDescription,
    onCancel: consistencyTask ? () => void handleCancelConsistencyTask() : null,
  })

  useRelationTaskNotification({
    task: simplifyTask,
    settledTask: simplifySettledTask,
    title: simplifyTaskCopy.title,
    sourceLabel: l('章节原文编辑', 'Chapter source text editor'),
    runningDescription: simplifyTaskCopy.runningDescription,
    cancellingDescription: simplifyTaskCopy.cancellingDescription,
    successDescription: simplifyTaskCopy.successDescription,
    cancelledDescription: simplifyTaskCopy.cancelledDescription,
    failedDescription: simplifyTaskCopy.failedDescription,
    onCancel: simplifyTask ? () => void handleCancelSimplifyTask() : null,
  })

  useRelationTaskNotification({
    task: optimizeTask,
    settledTask: optimizeSettledTask,
    title: optimizeTaskCopy.title,
    sourceLabel: l('章节原文编辑', 'Chapter source text editor'),
    runningDescription: optimizeTaskCopy.runningDescription,
    cancellingDescription: optimizeTaskCopy.cancellingDescription,
    successDescription: optimizeTaskCopy.successDescription,
    cancelledDescription: optimizeTaskCopy.cancelledDescription,
    failedDescription: optimizeTaskCopy.failedDescription,
    onCancel: optimizeTask ? () => void handleCancelOptimizeTask() : null,
  })

  const handleBackToRaw = () => {
    setMode('raw')
    setEditorText(rawText)
  }

  const handleViewCondensed = () => {
    if (!condensedText.trim()) {
      message.info(l('暂无精简内容', 'No simplified content yet'))
      return
    }
    setMode('condensed')
    setEditorText(condensedText)
  }

  const handleSave = async (): Promise<boolean> => {
    if (!chapterId) return false
    setSaving(true)
    try {
      if (mode === 'raw') {
        await StudioChaptersService.updateChapterApiV1StudioChaptersChapterIdPatch({
          chapterId,
          requestBody: { raw_text: editorText },
        })
        setRawText(editorText)
        setSavedRawText(editorText)
        onSaved?.({ rawText: editorText })
        message.success(l('原文已保存', 'Source text saved'))
        return true
      }

      if (mode === 'condensed') {
        await StudioChaptersService.updateChapterApiV1StudioChaptersChapterIdPatch({
          chapterId,
          requestBody: { condensed_text: editorText },
        })
        setCondensedText(editorText)
        setSavedCondensedText(editorText)
        onSaved?.({ condensedText: editorText })
        message.success(l('精简内容已保存', 'Simplified content saved'))
        return true
      }

      await StudioChaptersService.updateChapterApiV1StudioChaptersChapterIdPatch({
        chapterId,
        requestBody: { raw_text: compareRaw, condensed_text: compareCondensed },
      })
      setRawText(compareRaw)
      setCondensedText(compareCondensed)
      setSavedRawText(compareRaw)
      setSavedCondensedText(compareCondensed)
      onSaved?.({ rawText: compareRaw, condensedText: compareCondensed })
      message.success(l('已保存', 'Saved'))
      return true
    } catch {
      message.error(l('保存失败', 'Failed to save'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const hasUnsavedChanges = useMemo(() => {
    if (mode === 'compare') return compareRaw !== savedRawText || compareCondensed !== savedCondensedText
    if (mode === 'raw') return editorText !== savedRawText
    return editorText !== savedCondensedText
  }, [compareCondensed, compareRaw, editorText, mode, savedCondensedText, savedRawText])

  const handleRequestClose = () => {
    if (actionsLoading) return
    if (!hasUnsavedChanges) {
      onClose()
      return
    }
    Modal.confirm({
      title: l('检测到未保存变更', 'Unsaved changes detected'),
      content: l('文本输入区有未保存修改，关闭前请选择操作。', 'The text area has unsaved changes. Choose what to do before closing.'),
      okText: l('保存', 'Save'),
      cancelText: l('忽略', 'Discard'),
      onOk: async () => {
        const ok = await handleSave()
        if (ok) onClose()
      },
      onCancel: () => {
        onClose()
      },
    })
  }

  const mockHistory: HistoryItem[] = useMemo(
    () => [
      {
        id: 'h-1',
        at: Date.now() - 1000 * 60 * 60 * 2,
        rawText: '【原文】示例版本 1（预置数据）',
        condensedText: '【精简】示例版本 1（预置数据）',
      },
      {
        id: 'h-2',
        at: Date.now() - 1000 * 60 * 22,
        rawText: '【原文】示例版本 2（预置数据）',
        condensedText: '【精简】示例版本 2（预置数据）',
      },
    ],
    [],
  )

  return (
    <>
      <Modal
        title={
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FileTextOutlined />{' '}
              {mode === 'raw' ? l('原文编辑区', 'Source text editor') : mode === 'condensed' ? l('精简内容编辑区', 'Simplified text editor') : l('对比模式', 'Compare mode')}
              <Tag color="blue">{l(`${plainWordCount} 字`, `${plainWordCount} characters`)}</Tag>
              <Tag color="default">{l(`${paragraphCount} 段`, `${paragraphCount} paragraphs`)}</Tag>
            </div>
            <Space size="small">
              <Button size="small" type="primary" icon={<SaveOutlined />} loading={actionsLoading || saving} disabled={actionsLoading} onClick={() => void handleSave()}>
                {l('保存', 'Save')}
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={checkingConsistency || !!consistencyTask}
                disabled={actionsLoading || !!consistencyTask}
                onClick={() => void handleCheckConsistency()}
              >
                {consistencyTask ? l('检查中', 'Checking') : l('角色混淆检查', 'Character ambiguity check')}
              </Button>
              {consistencyTask ? (
                <Button
                  size="small"
                  danger
                  icon={<CloseCircleOutlined />}
                  disabled={consistencyTask.cancelRequested}
                  onClick={() => void handleCancelConsistencyTask()}
                >
                  {consistencyTask.cancelRequested ? l('正在取消', 'Cancelling') : l('取消检查', 'Cancel check')}
                </Button>
              ) : null}
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                loading={extracting || !!simplifyTask}
                disabled={actionsLoading || !!simplifyTask}
                onClick={() => void handleSmartSimplify()}
              >
                {simplifyTask ? l('精简中', 'Simplifying') : l('智能精简', 'Smart simplify')}
              </Button>
              {simplifyTask ? (
                <Button
                  size="small"
                  danger
                  icon={<CloseCircleOutlined />}
                  disabled={simplifyTask.cancelRequested}
                  onClick={() => void handleCancelSimplifyTask()}
                >
                  {simplifyTask.cancelRequested ? l('正在取消', 'Cancelling') : l('取消精简', 'Cancel simplification')}
                </Button>
              ) : null}
              {mode === 'condensed' ? (
                <Button size="small" icon={<ReloadOutlined />} loading={actionsLoading} disabled={actionsLoading} onClick={handleBackToRaw}>
                  {l('回到原文', 'Back to source text')}
                </Button>
              ) : (
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={actionsLoading}
                  disabled={actionsLoading || !condensedText.trim()}
                  onClick={handleViewCondensed}
                >
                  {l('查看精简', 'View simplified text')}
                </Button>
              )}
              <Button
                size="small"
                icon={<DiffOutlined />}
                loading={actionsLoading}
                disabled={actionsLoading}
                type={mode === 'compare' ? 'primary' : 'default'}
                onClick={() => {
                  if (mode === 'compare') {
                    setMode('raw')
                    setEditorText(rawText)
                    return
                  }
                  setCompareRaw(rawText)
                  setCompareCondensed(condensedText)
                  setMode('compare')
                }}
              >
                {l('对比模式', 'Compare mode')}
              </Button>
              <Button size="small" icon={<HistoryOutlined />} loading={actionsLoading} disabled={actionsLoading} onClick={() => setHistoryOpen(true)}>
                {l('版本历史', 'Version history')}
              </Button>
            </Space>
          </div>
        }
        open={open}
        onCancel={() => {
          handleRequestClose()
        }}
        width={900}
        footer={
          <Button type="primary" loading={actionsLoading} disabled={actionsLoading} onClick={handleRequestClose}>
            {l('关闭', 'Close')}
          </Button>
        }
        styles={{
          header: { paddingRight: 48 },
          body: { maxHeight: '70vh', overflow: 'auto', paddingTop: 12 },
        }}
      >
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Spin />
          </div>
        ) : mode === 'compare' ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <div className="text-xs text-gray-500 mb-2">{l('原文', 'Source text')}</div>
              <Input.TextArea
                value={compareRaw}
                onChange={(e) => setCompareRaw(e.target.value)}
                rows={14}
                disabled={actionsLoading}
                style={{ resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
              />
            </div>
            <div className="flex flex-col">
              <div className="text-xs text-gray-500 mb-2">{l('精简内容', 'Simplified content')}</div>
              <Input.TextArea
                value={compareCondensed}
                onChange={(e) => setCompareCondensed(e.target.value)}
                rows={14}
                disabled={actionsLoading}
                style={{ resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input.TextArea
              value={editorText}
              onChange={(e) => {
                const v = e.target.value
                setEditorText(v)
                if (mode === 'raw') setRawText(v)
                if (mode === 'condensed') setCondensedText(v)
              }}
            disabled={actionsLoading}
              placeholder={mode === 'raw' ? l('编辑章节原文…', 'Edit chapter source text…') : l('编辑精简内容…', 'Edit simplified content…')}
              rows={16}
              style={{ resize: 'none', background: '#fdfdfd' }}
            />
            {consistencyResult ? (
              <Card
                size="small"
                title={l('角色混淆检查结果', 'Character ambiguity check results')}
                extra={
                  <Space wrap>
                    <Tag color={consistencyResult.has_issues ? 'red' : 'green'}>
                      {consistencyResult.has_issues ? l('发现问题', 'Issues found') : l('无问题', 'No issues')}
                    </Tag>
                    <Tag>issues：{consistencyIssues.length}</Tag>
                    <Button
                      size="small"
                      type="primary"
                      icon={<ThunderboltOutlined />}
                      loading={optimizingScript || !!optimizeTask}
                      disabled={actionsLoading || !!optimizeTask}
                      onClick={() => void handleOneClickOptimize()}
                    >
                      {optimizeTask ? l('优化中', 'Optimizing') : l('一键优化', 'One-click optimize')}
                    </Button>
                    {optimizeTask ? (
                      <Button
                        size="small"
                        danger
                        icon={<CloseCircleOutlined />}
                        disabled={optimizeTask.cancelRequested}
                        onClick={() => void handleCancelOptimizeTask()}
                      >
                        {optimizeTask.cancelRequested ? l('正在取消', 'Cancelling') : l('取消优化', 'Cancel optimization')}
                      </Button>
                    ) : null}
                  </Space>
                }
              >
                {consistencyIssues.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={l('未发现角色混淆问题', 'No character ambiguity issues found')} />
                ) : (
                  <List
                    size="small"
                    dataSource={consistencyIssues}
                    renderItem={(it: any, idx) => (
                      <List.Item>
                        <div className="min-w-0">
                          <div className="font-medium">
                            {it?.issue_type ? `[${it.issue_type}] ` : ''}
                            Issue {idx + 1}
                          </div>
                          <div className="text-sm">{it?.description}</div>
                          {it?.character_candidates?.length ? (
                            <div className="text-xs text-gray-500 mt-1">{l('候选角色：', 'Candidate characters: ')}{it.character_candidates.join(l('、', ', '))}</div>
                          ) : null}
                          {it?.suggestion ? (
                            <div className="text-xs text-gray-500 mt-1">{l('建议：', 'Suggestion: ')}{it.suggestion}</div>
                          ) : null}
                          {it?.affected_lines ? (
                            <div className="text-xs text-gray-400 mt-1">
                              {l('影响范围：', 'Affected lines: ')}{it.affected_lines.start_line ?? '-'}–{it.affected_lines.end_line ?? '-'}
                            </div>
                          ) : null}
                        </div>
                      </List.Item>
                    )}
                  />
                )}
                {consistencyResult.summary ? (
                  <div className="text-xs text-gray-500 mt-2">{String(consistencyResult.summary)}</div>
                ) : null}
              </Card>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal
        title={
          <div className="flex items-center gap-2">
            <HistoryOutlined /> {l('历史版本', 'Version history')}
          </div>
        }
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        width={920}
        footer={
          <Button type="primary" onClick={() => setHistoryOpen(false)}>
            {l('关闭', 'Close')}
          </Button>
        }
        styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
      >
        {/* TODO: 历史版本接口未接入，当前为预置数据；后续接入后按时间线渲染即可 */}
        <div className="text-xs text-gray-500 mb-3">{l('内容默认折叠，仅展示时间线节点。', 'Content is collapsed by default; only timeline points are shown.')}</div>
        <div className="space-y-3">
          {mockHistory.map((h) => (
            <div key={h.id} className="border border-gray-200 rounded-lg p-3 bg-white">
              <div className="text-sm font-medium mb-2">{new Date(h.at).toLocaleString()}</div>
              <Collapse
                items={[
                  {
                    key: 'content',
                    label: l('展开查看内容', 'Expand content'),
                    children: (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-2">{l('原文内容', 'Source content')}</div>
                          <Input.TextArea
                            value={h.rawText}
                            readOnly
                            rows={8}
                            style={{ resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-2">{l('精简内容', 'Simplified content')}</div>
                          <Input.TextArea
                            value={h.condensedText}
                            readOnly
                            rows={8}
                            style={{ resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                          />
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
