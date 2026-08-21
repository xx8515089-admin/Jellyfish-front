import { ApiError } from '../../services/generated'

/** 判断 Java 后端统一响应是否成功，失败时抛出可展示错误。 */
export function assertApiSuccess(response: { code?: number; message?: string }, fallback: string): void {
  if (response.code !== undefined && response.code !== 0 && response.code !== 200) {
    throw new Error(response.message || fallback)
  }
}

/** 从接口异常中提取页面可展示的错误文案。 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.body?.message ?? error.message ?? fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

/** 将空字符串转换为空值，避免提交空白文本干扰后端字段语义。 */
export function normalizeNullableText(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
