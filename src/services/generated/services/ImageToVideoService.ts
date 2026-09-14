/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ImageToVideoDetail } from '../models/ImageToVideoDetail';
import type { ImageToVideoEstimate } from '../models/ImageToVideoEstimate';
import type { ImageToVideoGenerate } from '../models/ImageToVideoGenerate';
import type { ImageToVideoModel } from '../models/ImageToVideoModel';
import type { PanelVideoPrompt } from '../models/PanelVideoPrompt';
import type { PanelVideoPromptRequest } from '../models/PanelVideoPromptRequest';
import type { StoryboardPanelImage } from '../models/StoryboardPanelImage';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ImageToVideoService {
    /**
     * @returns any Business envelope; code must equal 200
     * @throws ApiError
     */
    public static getModels(): CancelablePromise<{
        code: number;
        message?: string;
        data?: Array<ImageToVideoModel>;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/storyboards/imagetovideo/models',
        });
    }
    /**
     * @returns any Business envelope; code must equal 200
     * @throws ApiError
     */
    public static getEstimate({
        modelId,
        resolution,
        durationSeconds,
    }: {
        modelId?: number,
        resolution?: string,
        durationSeconds?: number,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: ImageToVideoEstimate;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/storyboards/imagetovideo/estimate',
            query: {
                'modelId': modelId,
                'resolution': resolution,
                'durationSeconds': durationSeconds,
            },
        });
    }
    /**
     * @returns any Business envelope; code must equal 200
     * @throws ApiError
     */
    public static generate({
        requestBody,
    }: {
        requestBody: ImageToVideoGenerate,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: ImageToVideoDetail;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/storyboards/imagetovideo/generate',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any Business envelope; code must equal 200
     * @throws ApiError
     */
    public static getDetail({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: ImageToVideoDetail;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/storyboards/videos/detail',
            query: {
                'id': id,
            },
        });
    }
    /**
     * @returns any Business envelope; code must equal 200
     * @throws ApiError
     */
    public static sync({
        requestBody,
    }: {
        requestBody: {
            id: number;
        },
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: ImageToVideoDetail;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/storyboards/videos/sync',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static getPanelImage({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: StoryboardPanelImage;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/storyboards/images/detail',
            query: {
                'id': id,
            },
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static generatePanelPrompt({
        requestBody,
    }: {
        requestBody: PanelVideoPromptRequest,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: PanelVideoPrompt;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/storyboards/imagetovideo/prompts/generate',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
