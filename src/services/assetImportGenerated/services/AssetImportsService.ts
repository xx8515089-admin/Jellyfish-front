/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CommitRequest } from '../models/CommitRequest';
import type { CreateImportBatch } from '../models/CreateImportBatch';
import type { ImportBatchResponse } from '../models/ImportBatchResponse';
import type { ImportItemPageResponse } from '../models/ImportItemPageResponse';
import type { ImportPreviewResponse } from '../models/ImportPreviewResponse';
import type { ImportTemplateResponse } from '../models/ImportTemplateResponse';
import type { PreviewRequest } from '../models/PreviewRequest';
import type { RetryRequest } from '../models/RetryRequest';
import type { UploadedImportFileResponse } from '../models/UploadedImportFileResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AssetImportsService {
    /**
     * getImportTemplate
     * @returns ImportTemplateResponse Success
     * @throws ApiError
     */
    public static getImportTemplate({
        format = 'csv',
    }: {
        format?: 'csv' | 'tsv',
    }): CancelablePromise<ImportTemplateResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/assetLibrary/importTemplate',
            query: {
                'format': format,
            },
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
    /**
     * createImportBatch
     * @returns ImportBatchResponse Success
     * @throws ApiError
     */
    public static createImportBatch({
        idempotencyKey,
        requestBody,
    }: {
        idempotencyKey: string,
        requestBody: CreateImportBatch,
    }): CancelablePromise<ImportBatchResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assetLibrary/importBatches',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
    /**
     * uploadImportFile
     * @returns UploadedImportFileResponse Success
     * @throws ApiError
     */
    public static uploadImportFile({
        idempotencyKey,
        formData,
    }: {
        idempotencyKey: string,
        formData: {
            file: Blob;
            clientItemId: string;
            batchId: string;
        },
    }): CancelablePromise<UploadedImportFileResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assetLibrary/importBatches/files',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
    /**
     * previewImportBatch
     * @returns ImportPreviewResponse Success
     * @throws ApiError
     */
    public static previewImportBatch({
        requestBody,
    }: {
        requestBody: PreviewRequest,
    }): CancelablePromise<ImportPreviewResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assetLibrary/importBatches/preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
    /**
     * commitImportBatch
     * @returns ImportBatchResponse Success
     * @throws ApiError
     */
    public static commitImportBatch({
        idempotencyKey,
        requestBody,
    }: {
        idempotencyKey: string,
        requestBody: CommitRequest,
    }): CancelablePromise<ImportBatchResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assetLibrary/importBatches/commit',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
    /**
     * getImportBatch
     * @returns ImportBatchResponse Success
     * @throws ApiError
     */
    public static getImportBatch({
        batchId,
    }: {
        batchId: string,
    }): CancelablePromise<ImportBatchResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/assetLibrary/importBatches/detail',
            query: {
                'batchId': batchId,
            },
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
    /**
     * listImportItems
     * @returns ImportItemPageResponse Success
     * @throws ApiError
     */
    public static listImportItems({
        batchId,
        page = 1,
        pageSize = 50,
    }: {
        batchId: string,
        page?: number,
        pageSize?: number,
    }): CancelablePromise<ImportItemPageResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/assetLibrary/importBatches/items',
            query: {
                'page': page,
                'pageSize': pageSize,
                'batchId': batchId,
            },
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
    /**
     * retryImportBatch
     * @returns ImportBatchResponse Success
     * @throws ApiError
     */
    public static retryImportBatch({
        idempotencyKey,
        requestBody,
    }: {
        idempotencyKey: string,
        requestBody: RetryRequest,
    }): CancelablePromise<ImportBatchResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assetLibrary/importBatches/retry',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Import request rejected`,
                401: `Import request rejected`,
                403: `Import request rejected`,
                404: `Import request rejected`,
                409: `Import request rejected`,
                410: `Import request rejected`,
                413: `Import request rejected`,
                415: `Import request rejected`,
                422: `Import request rejected`,
                429: `Import request rejected`,
                503: `Import request rejected`,
            },
        });
    }
}
