/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_LoginResponse_ } from '../models/ApiResponse_LoginResponse_';
import type { ApiResponse_NoneType_ } from '../models/ApiResponse_NoneType_';
import type { ApiResponse_UserRead_ } from '../models/ApiResponse_UserRead_';
import type { LoginRequest } from '../models/LoginRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Login
     * Authenticates credentials and returns a revocable bearer token.
     * @returns ApiResponse_LoginResponse_ Successful Response
     * @throws ApiError
     */
    public static loginApiV1AuthLoginPost({
        requestBody,
    }: {
        requestBody: LoginRequest,
    }): CancelablePromise<ApiResponse_LoginResponse_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Me
     * Returns the account currently represented by the bearer token.
     * @returns ApiResponse_UserRead_ Successful Response
     * @throws ApiError
     */
    public static meApiV1AuthMeGet(): CancelablePromise<ApiResponse_UserRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auth/me',
        });
    }
    /**
     * Logout
     * Revokes the caller's current session.
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static logoutApiV1AuthLogoutPost(): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/logout',
        });
    }
}
