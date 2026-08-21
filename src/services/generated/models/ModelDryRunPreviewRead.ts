/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ModelCategoryKey } from './ModelCategoryKey';
/**
 * 模型配置预览，不触发真实供应商调用。
 */
export type ModelDryRunPreviewRead = {
    /**
     * 供应商 ID
     */
    provider_id: string;
    /**
     * 供应商展示名
     */
    provider_name: string;
    /**
     * 供应商稳定键
     */
    provider_key: string;
    /**
     * 模型 ID
     */
    model_id: string;
    /**
     * 模型展示名
     */
    model_name: string;
    /**
     * 模型类别
     */
    category: ModelCategoryKey;
    /**
     * 模型业务类型，如 image_generation/image_to_video
     */
    model_type?: (string | null);
    /**
     * 端点类型，如 generateImage/generateVideo
     */
    endpoint_type?: (string | null);
    /**
     * 供应商侧模型名
     */
    provider_model_name?: (string | null);
    /**
     * 提交端点
     */
    submit_endpoint?: (string | null);
    /**
     * 轮询端点
     */
    poll_endpoint?: (string | null);
    /**
     * API Key 配置状态
     */
    api_key_status: 'present' | 'missing' | 'invalid';
    /**
     * 普通 UI 展示的配置状态
     */
    message: string;
    /**
     * 高级调试信息
     */
    advanced_debug?: Record<string, any>;
};

