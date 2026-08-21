/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 关键帧提示词渲染后的图片映射关系。
 */
export type ShotFramePromptMappingRead = {
    /**
     * 提示词中的图片占位 token，如 image1 / image2
     */
    token: string;
    /**
     * 实体类型：character/prop/scene/costume
     */
    type: 'character' | 'prop' | 'scene' | 'costume';
    /**
     * 实体 ID（如 character_id/prop_id/scene_id/costume_id）
     */
    id: string;
    /**
     * 实体名称
     */
    name: string;
    /**
     * 供应商提示词使用的自然语言文本；避免直接使用 UI 展示标签
     */
    provider_prompt_text?: (string | null);
    /**
     * 本次渲染与生成使用的文件 ID
     */
    file_id: string;
    /**
     * 参考图业务用途
     */
    usage_role?: string;
    /**
     * 生成时参考角色
     */
    reference_role?: string;
};

