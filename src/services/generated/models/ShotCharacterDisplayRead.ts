/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ShotCharacterDisplayRead = {
    /**
     * 角色 ID（characters.id）
     */
    character_id: string;
    /**
     * 角色展示标签
     */
    character_label: string;
    /**
     * 演员 ID
     */
    actor_id?: (string | null);
    /**
     * 演员名称
     */
    actor_name?: (string | null);
    /**
     * 服装 ID
     */
    costume_id?: (string | null);
    /**
     * 服装名称
     */
    costume_name?: (string | null);
    /**
     * 文本服装覆盖说明
     */
    wardrobe_text_override?: (string | null);
    /**
     * 镜头内角色备注/角色作用
     */
    role_in_shot?: (string | null);
};

