/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ShotTableImportRowResult = {
    /**
     * 源表行号
     */
    row_number: number;
    /**
     * 镜头序号
     */
    shot_index?: (number | null);
    /**
     * 镜头标题
     */
    title?: string;
    /**
     * 动作：create/skipped
     */
    action?: string;
    /**
     * 该行是否可提交
     */
    ok?: boolean;
    /**
     * 说明
     */
    message?: string;
    /**
     * 已匹配角色
     */
    matched_characters?: Array<string>;
    /**
     * 已匹配场景
     */
    matched_scene?: (string | null);
    /**
     * 已匹配服装
     */
    matched_costumes?: Array<string>;
    /**
     * 已匹配道具
     */
    matched_props?: Array<string>;
    /**
     * 未匹配资产
     */
    unresolved?: Array<string>;
};

