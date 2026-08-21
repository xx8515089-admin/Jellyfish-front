/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShotVideoPromptPackRead } from './ShotVideoPromptPackRead';
export type VideoPromptPreviewResponse = {
    /**
     * 最终用于视频生成的提示词
     */
    prompt: string;
    /**
     * 关联参考图 file_id 列表
     */
    images?: Array<string>;
    /**
     * 结构化参考图槽位预览
     */
    video_references?: Array<Record<string, any>>;
    /**
     * 提交前检查告警
     */
    warnings?: Array<string>;
    /**
     * 视频提示词预览上下文包
     */
    pack?: (ShotVideoPromptPackRead | null);
};

