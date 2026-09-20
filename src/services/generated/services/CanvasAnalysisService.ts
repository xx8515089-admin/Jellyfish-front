/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CanvasAnalysisCreateBody } from '../models/CanvasAnalysisCreateBody';
import type { CanvasAnalysisEnvelope } from '../models/CanvasAnalysisEnvelope';
import type { CanvasAnalysisEstimateBody } from '../models/CanvasAnalysisEstimateBody';
import type { CanvasAnalysisRetryBody } from '../models/CanvasAnalysisRetryBody';
import type { CanvasAnalysisTaskBody } from '../models/CanvasAnalysisTaskBody';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CanvasAnalysisService {
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisCapabilities(): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/canvases/analysis/capabilities',
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisModels({
        operation,
    }: {
        operation?: string,
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/canvases/analysis/models',
            query: {
                'operation': operation,
            },
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisCostEstimate({
        requestBody,
        language,
    }: {
        requestBody: CanvasAnalysisEstimateBody,
        language?: 'zh' | 'en',
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/canvases/analysis/costEstimate',
            headers: {
                'language': language,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisCreate({
        requestBody,
    }: {
        requestBody: CanvasAnalysisCreateBody,
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/canvases/analysis/create',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisDetail({
        canvasId,
        taskId,
    }: {
        canvasId: (number | string),
        taskId: (number | string),
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/canvases/analysis/detail',
            query: {
                'canvasId': canvasId,
                'taskId': taskId,
            },
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisSubmission({
        canvasId,
        clientRequestId,
    }: {
        canvasId: (number | string),
        clientRequestId: string,
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/canvases/analysis/submission',
            query: {
                'canvasId': canvasId,
                'clientRequestId': clientRequestId,
            },
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisList({
        canvasId,
        nodeId,
        operation,
        status,
        page,
        pageSize,
    }: {
        canvasId: (number | string),
        nodeId?: string,
        operation?: string,
        status?: number,
        page?: number,
        pageSize?: number,
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/canvases/analysis/list',
            query: {
                'canvasId': canvasId,
                'nodeId': nodeId,
                'operation': operation,
                'status': status,
                'page': page,
                'pageSize': pageSize,
            },
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisCancel({
        requestBody,
    }: {
        requestBody: CanvasAnalysisTaskBody,
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/canvases/analysis/cancel',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisRetry({
        requestBody,
    }: {
        requestBody: CanvasAnalysisRetryBody,
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/canvases/analysis/retry',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns CanvasAnalysisEnvelope 标准画布响应；具体 data 结构见变更说明。
     * @throws ApiError
     */
    public static analysisRetrySettlement({
        requestBody,
    }: {
        requestBody: CanvasAnalysisTaskBody,
    }): CancelablePromise<CanvasAnalysisEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/canvases/analysis/retrySettlement',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
