import { getApiErrorMessage } from './apiErrors'

const messages: Record<string, string> = {
  VIDEO_BATCH_SCHEMA_REQUIRED: '后端尚未部署批量视频迁移（093），请联系部署人员。',
  VIDEO_BATCH_RUN_NOT_READY: '本集分镜或导演流程尚未全部完成，或当前账号无权访问，请完成流程后刷新。',
  VIDEO_BATCH_INVALID_REQUEST: '请检查生成参数、片段数量及分页信息。',
  VIDEO_BATCH_DUPLICATE_SEGMENT: '片段重复，请刷新后重新选择。',
  VIDEO_BATCH_SEGMENT_OUT_OF_SCOPE: '片段已不属于当前集，请刷新后重新选择。',
  VIDEO_BATCH_REVISION_CONFLICT: '片段已被修改，请刷新片段后重新预检。',
  VIDEO_BATCH_SEGMENT_BUSY: '片段正在排队、生成或等待核查，请刷新任务状态。',
  VIDEO_BATCH_PROMPT_REQUIRED: '请补齐该片段的完整视频提示词。',
  VIDEO_BATCH_DEPENDENCY_INVALID: '请先修复本批上一片段的预检问题。',
  VIDEO_BATCH_ITEM_INVALID: '请检查该片段的模型、参考素材、时长和提示词。',
  VIDEO_BATCH_PREFLIGHT_FAILED: '整批预检未通过，请处理各片段的问题后重新预检。',
  VIDEO_BATCH_PREVIEW_CHANGED: '内容或报价已变化，请重新预检并确认预算。',
  VIDEO_BATCH_BUDGET_EXCEEDED: '本批预算不足，请调整并确认预算，或减少片段后重新预检。',
  VIDEO_BATCH_INSUFFICIENT_CREDITS: '余额不足，请补充额度或减少片段；已停止的片段需要主动重试。',
  VIDEO_BATCH_DEPENDENCY_BLOCKED: '前段未成功，请处理前段后主动重试受影响的片段。',
  VIDEO_BATCH_RESULT_UNCERTAIN: '原视频结果或费用尚未确认，请核查或恢复原视频，不要重新生成。',
  VIDEO_BATCH_GENERATION_FAILED: '视频生成失败，请查看原视频错误，仅重试允许重试的片段。',
  VIDEO_BATCH_SOURCE_CHANGED: '分镜运行或片段关系已变化，请刷新后重新选择。',
  VIDEO_BATCH_PERMISSION_CHANGED: '提交账号的权限已变化，未开始的片段已停止，请联系管理员。',
  VIDEO_BATCH_STRUCTURE_BUSY: '本集批次仍在处理或等待核查，请处理完成后再插入、删除或合并片段。',
  VIDEO_BATCH_RETRY_INVALID: '只能选择原批次中允许重试的失败或阻塞片段。',
  VIDEO_BATCH_SUBMISSION_NOT_FOUND: '暂未找到已接收批次，可使用原提交标识和完整请求原样重发。',
  VIDEO_BATCH_ITEM_FAILED: '生成前校验未通过，请根据具体原因修复后重新预检。',
  IDEMPOTENCY_CONFLICT: '该提交标识已用于其他参数，请先查询原提交结果。',
}

export function videoBatchErrorCode(error: unknown): string | undefined {
  return (error as { body?: { data?: { errorCode?: string } } } | null)?.body?.data?.errorCode
}

export function videoBatchItemError(code?: string | null, reason?: string | null): string {
  const message = code ? messages[code] : undefined
  return [reason, message && message !== reason ? message : undefined].filter(Boolean).join(' ')
    || code || '请求失败，请稍后重试。'
}

export function videoBatchErrorMessage(error: unknown, fallback = '批量视频请求失败'): string {
  const code = videoBatchErrorCode(error)
  const detail = (error as { body?: { data?: { reason?: string; errorMessage?: string } } } | null)?.body?.data
  return code && messages[code]
    ? videoBatchItemError(code, detail?.reason || detail?.errorMessage)
    : getApiErrorMessage(error, fallback)
}
