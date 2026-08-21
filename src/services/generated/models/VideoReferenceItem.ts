/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type VideoReferenceItem = {
    /**
     * 参考文件 FileItem.id
     */
    file_id: string;
    /**
     * 视频参考用途
     */
    reference_role?: 'first_frame' | 'last_frame' | 'main_visual_reference' | 'previous_last_frame' | 'continuity_start_frame' | 'key_frame' | 'current_shot_anchor' | 'selected_visual_anchor' | 'actor_identity' | 'character_reference' | 'scene_master' | 'scene_reference' | 'prop_reference' | 'wardrobe_reference' | 'costume_reference' | 'cinematic_reference' | 'look_reference' | 'successful_frame_reference' | 'atmosphere_reference' | 'color_reference' | 'filter_reference' | 'style_reference' | 'loose_reference';
    /**
     * 前端预览 URL；后端不信任，仅用于 debug
     */
    file_url?: (string | null);
    /**
     * actor_identity 绑定角色名
     */
    character_name?: (string | null);
    /**
     * 来源资产 ID
     */
    asset_id?: (string | null);
    /**
     * 资产/文件显示名
     */
    asset_name?: (string | null);
    /**
     * 前端预览槽位，从 1 开始
     */
    slot_index?: (number | null);
    /**
     * 前端预览 provider slot，如 image1
     */
    provider_slot?: (string | null);
    /**
     * 用户手动排序，从 1 开始；有值时后端尊重该顺序
     */
    user_order?: (number | null);
    /**
     * 用户是否锁定该参考图槽位
     */
    slot_locked?: boolean;
    /**
     * 参考来源
     */
    source?: 'manual_upload' | 'shot_frame' | 'asset_library';
    /**
     * 是否为本次生成必需参考
     */
    required?: boolean;
    /**
     * 是否由用户在 modal 中显式选择
     */
    user_selected?: boolean;
};

