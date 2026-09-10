export const STUDIO_SCRIPT_TEXT_MAX_LENGTH = 200_000
export const STUDIO_EPISODE_TEXT_MAX_LENGTH = 50_000
/** 新增剧集入口允许一次粘贴多集，因此沿用整批剧本上限。 */
export const STUDIO_EPISODE_IMPORT_TEXT_MAX_LENGTH = STUDIO_SCRIPT_TEXT_MAX_LENGTH

const clampText = (value: string, maxLength: number) => (
  value.length > maxLength ? value.slice(0, maxLength) : value
)

/** 整部剧本在编辑、接口提交、缓存和恢复阶段共用的长度契约。 */
export const clampStudioScriptText = (value: string) => (
  clampText(value, STUDIO_SCRIPT_TEXT_MAX_LENGTH)
)

/** 单集正文在编辑、接口提交、缓存和恢复阶段共用的长度契约。 */
export const clampStudioEpisodeText = (value: string) => (
  clampText(value, STUDIO_EPISODE_TEXT_MAX_LENGTH)
)

export const clampStudioEpisodeImportText = (value: string) => (
  clampText(value, STUDIO_EPISODE_IMPORT_TEXT_MAX_LENGTH)
)
