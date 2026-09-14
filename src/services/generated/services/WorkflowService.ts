/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WorkflowChapter } from '../models/WorkflowChapter';
import type { WorkflowImageRequest } from '../models/WorkflowImageRequest';
import type { WorkflowMedia } from '../models/WorkflowMedia';
import type { WorkflowPage } from '../models/WorkflowPage';
import type { WorkflowQuote } from '../models/WorkflowQuote';
import type { WorkflowSubmission } from '../models/WorkflowSubmission';
import type { WorkflowVideoRequest } from '../models/WorkflowVideoRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WorkflowService {
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static chapterDetail({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowChapter;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/scripts/imports/chapters/detail',
            query: {
                'id': id,
            },
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static updateChapter({
        requestBody,
    }: {
        requestBody: {
            id: number;
            title: string;
            rawText: string;
            expectedRevisionNo: number;
        },
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowChapter;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/scripts/imports/chapters/update',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static generateImage({
        requestBody,
        language,
    }: {
        requestBody: WorkflowImageRequest,
        language?: string,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowMedia;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/storyboards/images/generate',
            headers: {
                'language': language,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static estimateImage({
        requestBody,
    }: {
        requestBody: WorkflowImageRequest,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowQuote;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/storyboards/images/generate/estimate',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static imageDetail({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowMedia;
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
    public static generateVideo({
        requestBody,
        language,
    }: {
        requestBody: WorkflowVideoRequest,
        language?: string,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowMedia;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/storyboards/videos/generate',
            headers: {
                'language': language,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static estimateVideo({
        requestBody,
    }: {
        requestBody: WorkflowVideoRequest,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowQuote;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/storyboards/videos/generate/estimate',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static videoDetail({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowMedia;
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
     * @returns any Business envelope
     * @throws ApiError
     */
    public static submission({
        generationType,
        clientRequestId,
    }: {
        generationType: string,
        clientRequestId: string,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowSubmission;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/storyboards/media/submission',
            query: {
                'generationType': generationType,
                'clientRequestId': clientRequestId,
            },
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static activeTasks({
        segmentId,
    }: {
        segmentId: number,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: Array<WorkflowMedia>;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/storyboards/media/activeTasks',
            query: {
                'segmentId': segmentId,
            },
        });
    }
    /**
     * @returns any Business envelope
     * @throws ApiError
     */
    public static historyPage({
        segmentId,
        pageSize,
        cursor,
    }: {
        segmentId: number,
        pageSize?: number,
        cursor?: string,
    }): CancelablePromise<{
        code: number;
        message?: string;
        data?: WorkflowPage;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/storyboards/media/historyPage',
            query: {
                'segmentId': segmentId,
                'pageSize': pageSize,
                'cursor': cursor,
            },
        });
    }
}
