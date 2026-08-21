/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_dict_ } from '../models/ApiResponse_dict_';
import type { AssetBibleImportRequest } from '../models/AssetBibleImportRequest';
import type { AssetGenerationBatchRequest } from '../models/AssetGenerationBatchRequest';
import type { ProjectAssetLinkerRequest } from '../models/ProjectAssetLinkerRequest';
import type { ProjectAssetLinkRollbackRequest } from '../models/ProjectAssetLinkRollbackRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioAssetsService {
    /**
     * List Project Asset Linker Batches Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static listProjectAssetLinkerBatchesApiApiV1StudioAssetsProjectLinkerBatchesGet(): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/assets/project-linker/batches',
        });
    }
    /**
     * Preview Project Asset Links Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static previewProjectAssetLinksApiApiV1StudioAssetsProjectLinkerPreviewPost({
        requestBody,
    }: {
        requestBody: ProjectAssetLinkerRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assets/project-linker/preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Commit Project Asset Links Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static commitProjectAssetLinksApiApiV1StudioAssetsProjectLinkerCommitPost({
        requestBody,
    }: {
        requestBody: ProjectAssetLinkerRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assets/project-linker/commit',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Rollback Project Asset Links Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static rollbackProjectAssetLinksApiApiV1StudioAssetsProjectLinkerRollbackPost({
        requestBody,
    }: {
        requestBody: ProjectAssetLinkRollbackRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assets/project-linker/rollback',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Asset Generation Specs Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static listAssetGenerationSpecsApiApiV1StudioAssetsGenerationSpecsGet({
        assetType,
        priority,
        assetVariant,
        missingOnly = false,
        status,
        keyword,
        runnerModel,
        runnerSourceSheet,
        includeLegacy = false,
    }: {
        assetType?: (string | null),
        priority?: (string | null),
        assetVariant?: (string | null),
        missingOnly?: boolean,
        status?: (string | null),
        keyword?: (string | null),
        runnerModel?: (string | null),
        runnerSourceSheet?: (string | null),
        includeLegacy?: boolean,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/assets/generation-specs',
            query: {
                'asset_type': assetType,
                'priority': priority,
                'asset_variant': assetVariant,
                'missing_only': missingOnly,
                'status': status,
                'keyword': keyword,
                'runner_model': runnerModel,
                'runner_source_sheet': runnerSourceSheet,
                'include_legacy': includeLegacy,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Preview Asset Image Generation Batch Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static previewAssetImageGenerationBatchApiApiV1StudioAssetsImageGenerationBatchPreviewPost({
        requestBody,
    }: {
        requestBody: AssetGenerationBatchRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assets/image-generation-batch/preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Commit Asset Image Generation Batch Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static commitAssetImageGenerationBatchApiApiV1StudioAssetsImageGenerationBatchCommitPost({
        requestBody,
    }: {
        requestBody: AssetGenerationBatchRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assets/image-generation-batch/commit',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Preview Asset Bible Import Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static previewAssetBibleImportApiApiV1StudioAssetsImportBiblePreviewPost({
        requestBody,
    }: {
        requestBody: AssetBibleImportRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assets/import-bible/preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Commit Asset Bible Import Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static commitAssetBibleImportApiApiV1StudioAssetsImportBibleCommitPost({
        requestBody,
    }: {
        requestBody: AssetBibleImportRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/assets/import-bible/commit',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Asset Bible Template Api
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static getAssetBibleTemplateApiApiV1StudioAssetsImportBibleTemplateGet(): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/assets/import-bible/template',
        });
    }
}
