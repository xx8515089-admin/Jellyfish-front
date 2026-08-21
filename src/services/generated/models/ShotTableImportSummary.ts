/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShotTableImportError } from './ShotTableImportError';
import type { ShotTableImportRowResult } from './ShotTableImportRowResult';
export type ShotTableImportSummary = {
    /**
     * 有效数据行数
     */
    total_rows?: number;
    /**
     * 将创建分镜数
     */
    will_create_shots?: number;
    /**
     * 已创建分镜数
     */
    created_shots?: number;
    /**
     * 已绑定角色数
     */
    linked_characters?: number;
    /**
     * 已绑定场景数
     */
    linked_scenes?: number;
    /**
     * 已绑定服装数
     */
    linked_costumes?: number;
    /**
     * 已绑定道具数
     */
    linked_props?: number;
    /**
     * 未匹配资产项数
     */
    unresolved_count?: number;
    /**
     * 行级错误
     */
    errors?: Array<ShotTableImportError>;
    /**
     * 逐行预览/提交结果
     */
    rows?: Array<ShotTableImportRowResult>;
    /**
     * 模板字段
     */
    template_fields?: Array<string>;
};

