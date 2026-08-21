/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_list_UserRead__ } from '../models/ApiResponse_list_UserRead__';
import type { ApiResponse_UserRead_ } from '../models/ApiResponse_UserRead_';
import type { UserCreate } from '../models/UserCreate';
import type { UserUpdate } from '../models/UserUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminUsersService {
    /**
     * Get Users
     * Lists all users and quota consumption for administrators.
     * @returns ApiResponse_list_UserRead__ Successful Response
     * @throws ApiError
     */
    public static getUsersApiV1AdminUsersGet(): CancelablePromise<ApiResponse_list_UserRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/admin/users',
        });
    }
    /**
     * Post User
     * Creates a login account with an initial API allowance.
     * @returns ApiResponse_UserRead_ Successful Response
     * @throws ApiError
     */
    public static postUserApiV1AdminUsersPost({
        requestBody,
    }: {
        requestBody: UserCreate,
    }): CancelablePromise<ApiResponse_UserRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/admin/users',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Patch User
     * Changes account status, role, password, quota, or consumed quota.
     * @returns ApiResponse_UserRead_ Successful Response
     * @throws ApiError
     */
    public static patchUserApiV1AdminUsersUserIdPatch({
        userId,
        requestBody,
    }: {
        userId: string,
        requestBody: UserUpdate,
    }): CancelablePromise<ApiResponse_UserRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/admin/users/{user_id}',
            path: {
                'user_id': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
