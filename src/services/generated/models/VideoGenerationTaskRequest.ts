/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoReferenceItem } from './VideoReferenceItem';
/**
 * 视频生成任务请求。
 */
export type VideoGenerationTaskRequest = {
    /**
     * 前端点击链路追踪 ID，仅用于调试
     */
    click_trace_id?: (string | null);
    /**
     * 镜头 ID
     */
    shot_id: string;
    /**
     * 参考模式：first | last | key | first_last | first_last_key | text_only | reference
     */
    reference_mode: 'first' | 'last' | 'key' | 'first_last' | 'first_last_key' | 'text_only' | 'reference';
    /**
     * 视频提示词（text_only 必填）
     */
    prompt?: (string | null);
    /**
     * 参考图 file_id 列表；reference 模式按顺序作为 image1/image2... 传入
     */
    images?: Array<string>;
    /**
     * 结构化视频参考图列表；优先于 images，保留 role/source/character 直到 provider 映射阶段
     */
    video_references?: Array<VideoReferenceItem>;
    /**
     * 显式允许旧版 flat images[] 视频参考路径；正常 UI 不应启用
     */
    legacy_mode?: boolean;
    /**
     * 视频画幅比例，如 16:9 / 9:16
     */
    ratio: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9';
    /**
     * 本次视频生成时长（秒），为空则使用镜头时长，最大 15 秒
     */
    seconds?: (number | null);
    /**
     * 是否请求视频模型生成音频
     */
    generate_audio?: boolean;
    /**
     * 音频/环境声提示词
     */
    audio_prompt?: (string | null);
    /**
     * 音频参考 FileItem.id
     */
    audio_file_id?: (string | null);
};

