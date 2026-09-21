/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyDistributionResponse } from '../models/EfficiencyDistributionResponse';
import type { EfficiencyDrawScope } from '../models/EfficiencyDrawScope';
import type { EfficiencyMetric } from '../models/EfficiencyMetric';
import type { EfficiencyModelDistributionResponse } from '../models/EfficiencyModelDistributionResponse';
import type { EfficiencyModelGroupCode } from '../models/EfficiencyModelGroupCode';
import type { EfficiencyRange } from '../models/EfficiencyRange';
import type { EfficiencyRankingsResponse } from '../models/EfficiencyRankingsResponse';
import type { EfficiencyRecordsResponse } from '../models/EfficiencyRecordsResponse';
import type { EfficiencySnapshotRequest } from '../models/EfficiencySnapshotRequest';
import type { EfficiencySnapshotResponse } from '../models/EfficiencySnapshotResponse';
import type { EfficiencySummaryResponse } from '../models/EfficiencySummaryResponse';
import type { EfficiencyTrendResponse } from '../models/EfficiencyTrendResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EfficiencyService {
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns EfficiencySummaryResponse Success
     * @throws ApiError
     */
    public static getSummary({
        range,
        startDate,
        endDate,
        projectId,
        memberId,
        snapshotId,
    }: {
        range?: EfficiencyRange,
        startDate?: string,
        endDate?: string,
        projectId?: number,
        memberId?: number,
        snapshotId?: string,
    }): CancelablePromise<EfficiencySummaryResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/efficiency/summary',
            query: {
                'range': range,
                'startDate': startDate,
                'endDate': endDate,
                'projectId': projectId,
                'memberId': memberId,
                'snapshotId': snapshotId,
            },
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns EfficiencyTrendResponse Success
     * @throws ApiError
     */
    public static getTrend({
        metric,
        range,
        startDate,
        endDate,
        projectId,
        memberId,
        drawScope,
        granularity,
        snapshotId,
    }: {
        metric: EfficiencyMetric,
        range?: EfficiencyRange,
        startDate?: string,
        endDate?: string,
        projectId?: number,
        memberId?: number,
        drawScope?: EfficiencyDrawScope,
        granularity?: 'auto' | 'hour' | 'day',
        snapshotId?: string,
    }): CancelablePromise<EfficiencyTrendResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/efficiency/trend',
            query: {
                'range': range,
                'startDate': startDate,
                'endDate': endDate,
                'projectId': projectId,
                'memberId': memberId,
                'metric': metric,
                'drawScope': drawScope,
                'granularity': granularity,
                'snapshotId': snapshotId,
            },
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns EfficiencyRankingsResponse Success
     * @throws ApiError
     */
    public static getRankings({
        metric,
        groupBy,
        range,
        startDate,
        endDate,
        projectId,
        memberId,
        drawScope,
        limit,
        snapshotId,
    }: {
        metric: EfficiencyMetric,
        groupBy: 'project' | 'member',
        range?: EfficiencyRange,
        startDate?: string,
        endDate?: string,
        projectId?: number,
        memberId?: number,
        drawScope?: EfficiencyDrawScope,
        limit?: number,
        snapshotId?: string,
    }): CancelablePromise<EfficiencyRankingsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/efficiency/rankings',
            query: {
                'range': range,
                'startDate': startDate,
                'endDate': endDate,
                'projectId': projectId,
                'memberId': memberId,
                'metric': metric,
                'drawScope': drawScope,
                'groupBy': groupBy,
                'limit': limit,
                'snapshotId': snapshotId,
            },
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns EfficiencyDistributionResponse Success
     * @throws ApiError
     */
    public static getDistribution({
        range,
        startDate,
        endDate,
        projectId,
        memberId,
        snapshotId,
    }: {
        range?: EfficiencyRange,
        startDate?: string,
        endDate?: string,
        projectId?: number,
        memberId?: number,
        snapshotId?: string,
    }): CancelablePromise<EfficiencyDistributionResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/efficiency/distribution',
            query: {
                'range': range,
                'startDate': startDate,
                'endDate': endDate,
                'projectId': projectId,
                'memberId': memberId,
                'snapshotId': snapshotId,
            },
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns EfficiencyRecordsResponse Success
     * @throws ApiError
     */
    public static getRecords({
        metric,
        range,
        startDate,
        endDate,
        projectId,
        memberId,
        drawScope,
        groupBy,
        groupKey,
        operationCode,
        taskId,
        page,
        pageSize,
        snapshotId,
        modelGroup,
        modelKey,
    }: {
        metric: EfficiencyMetric,
        range?: EfficiencyRange,
        startDate?: string,
        endDate?: string,
        projectId?: number,
        memberId?: number,
        drawScope?: EfficiencyDrawScope,
        groupBy?: 'project' | 'member',
        groupKey?: string,
        operationCode?: string,
        taskId?: number,
        page?: number,
        pageSize?: number,
        snapshotId?: string,
        modelGroup?: EfficiencyModelGroupCode,
        modelKey?: string,
    }): CancelablePromise<EfficiencyRecordsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/efficiency/records',
            query: {
                'range': range,
                'startDate': startDate,
                'endDate': endDate,
                'projectId': projectId,
                'memberId': memberId,
                'metric': metric,
                'drawScope': drawScope,
                'groupBy': groupBy,
                'groupKey': groupKey,
                'operationCode': operationCode,
                'taskId': taskId,
                'page': page,
                'pageSize': pageSize,
                'snapshotId': snapshotId,
                'modelGroup': modelGroup,
                'modelKey': modelKey,
            },
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns binary Success
     * @throws ApiError
     */
    public static getExport({
        metric,
        range,
        startDate,
        endDate,
        projectId,
        memberId,
        drawScope,
        groupBy,
        groupKey,
        operationCode,
        taskId,
        snapshotId,
        modelGroup,
        modelKey,
    }: {
        metric: EfficiencyMetric,
        range?: EfficiencyRange,
        startDate?: string,
        endDate?: string,
        projectId?: number,
        memberId?: number,
        drawScope?: EfficiencyDrawScope,
        groupBy?: 'project' | 'member',
        groupKey?: string,
        operationCode?: string,
        taskId?: number,
        snapshotId?: string,
        modelGroup?: EfficiencyModelGroupCode,
        modelKey?: string,
    }): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/efficiency/export',
            query: {
                'range': range,
                'startDate': startDate,
                'endDate': endDate,
                'projectId': projectId,
                'memberId': memberId,
                'metric': metric,
                'drawScope': drawScope,
                'groupBy': groupBy,
                'groupKey': groupKey,
                'operationCode': operationCode,
                'taskId': taskId,
                'snapshotId': snapshotId,
                'modelGroup': modelGroup,
                'modelKey': modelKey,
            },
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns EfficiencyModelDistributionResponse Success
     * @throws ApiError
     */
    public static getModelDistribution({
        range,
        startDate,
        endDate,
        projectId,
        memberId,
        snapshotId,
    }: {
        range?: EfficiencyRange,
        startDate?: string,
        endDate?: string,
        projectId?: number,
        memberId?: number,
        snapshotId?: string,
    }): CancelablePromise<EfficiencyModelDistributionResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/efficiency/model-distribution',
            query: {
                'range': range,
                'startDate': startDate,
                'endDate': endDate,
                'projectId': projectId,
                'memberId': memberId,
                'snapshotId': snapshotId,
            },
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
    /**
     * Production statistics efficiency-v2; raw Authorization token; Asia/Shanghai; shared snapshot for all page regions.
     * @returns EfficiencySnapshotResponse Success
     * @throws ApiError
     */
    public static createSnapshot({
        requestBody,
    }: {
        requestBody: EfficiencySnapshotRequest,
    }): CancelablePromise<EfficiencySnapshotResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/efficiency/snapshots',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Statistics request failed`,
                403: `Statistics request failed`,
                409: `Statistics request failed`,
                410: `Statistics request failed`,
                422: `Statistics request failed`,
                429: `Statistics request failed`,
                500: `Statistics request failed`,
                503: `Statistics request failed`,
            },
        });
    }
}
