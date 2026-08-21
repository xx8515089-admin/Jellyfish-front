/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TaskFailureSummaryRead = {
    /**
     * Provider 名称，如 Atlas
     */
    provider: string;
    /**
     * Provider 侧任务 ID
     */
    provider_task_id?: string;
    /**
     * 归类后的失败类型
     */
    failure_category: string;
    /**
     * Atlas 原始错误码
     */
    atlas_error_code?: string;
    /**
     * Atlas 原始错误信息
     */
    atlas_raw_error_message?: string;
    /**
     * 给用户展示的失败原因
     */
    user_visible_failure_reason: string;
    /**
     * 简短解释
     */
    short_explanation: string;
    /**
     * 建议处理方式
     */
    suggested_fix: string;
};

