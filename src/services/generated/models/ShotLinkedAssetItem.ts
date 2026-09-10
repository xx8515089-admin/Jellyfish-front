/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 按分镜聚合返回的关联资产条目（角色/道具/场景/服装）。
 */
export type ShotLinkedAssetItem = {
    /**
     * 实体类型：character/prop/scene/costume
     */
    type: 'character' | 'prop' | 'scene' | 'costume';
    /**
     * 实体 ID（如 character_id/prop_id/scene_id/costume_id）
     */
    id: string;
    /**
     * 最佳缩略图对应的 image 行 ID（如 PropImage.id）；无图则为 null
     */
    image_id?: (number | null);
    /**
     * 最佳缩略图对应的文件 ID（files.id）；用于参考图输入；无图则为 null
     */
    file_id?: (string | null);
    /**
     * 实体名称
     */
    name: string;
    /**
     * 供应商提示词使用的自然语言文本；UI 仍使用 name 展示
     */
    provider_prompt_text?: (string | null);
    /**
     * 缩略图预览地址（/api/v1/studio/files/content?id={file_id}）
     */
    thumbnail?: string;
    /**
     * 参考图业务用途：actor_identity/wardrobe_only/scene_master 等
     */
    usage_role?: string;
    /**
     * 生成时参考角色：primary_actor_identity/scene_master/wardrobe_only 等
     */
    reference_role?: string;
};

