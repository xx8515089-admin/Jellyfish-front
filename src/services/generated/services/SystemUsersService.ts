/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_SystemUserPageRead_ } from '../models/ApiResponse_SystemUserPageRead_';
import type { ApiResponse_SystemUserRead_ } from '../models/ApiResponse_SystemUserRead_';
import type { SystemUserCreate } from '../models/SystemUserCreate';
import type { SystemUserUpdate } from '../models/SystemUserUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SystemUsersService {
    /**
     * 分页查询用户
     * 按用户 ID、名称与分页参数查询用户列表。
     * @returns ApiResponse_SystemUserPageRead_ Successful Response
     * @throws ApiError
     */
    public static findPageUsersApiV1SystemUsersFindPageGet({
        id,
        name,
        page = 1,
        pageSize = 20,
    }: {
        id?: number,
        name?: string,
        page?: number,
        pageSize?: number,
    }): CancelablePromise<ApiResponse_SystemUserPageRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/users/findPage',
            query: {
                'id': id,
                'name': name,
                'page': page,
                'pageSize': pageSize,
            },
        });
    }
    /**
     * 创建用户
     * 按 Java 后端契约通过注册接口创建后台用户。
     * @returns ApiResponse_SystemUserRead_ Successful Response
     * @throws ApiError
     */
    public static registerUserApiV1AuthRegisterPost({
        requestBody,
    }: {
        requestBody: SystemUserCreate,
    }): CancelablePromise<ApiResponse_SystemUserRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/register',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 编辑用户
     * 更新用户账号、角色、API 额度和启用状态。
     * @returns ApiResponse_SystemUserRead_ Successful Response
     * @throws ApiError
     */
    public static updateUserApiV1SystemUsersUpdatePost({
        requestBody,
    }: {
        requestBody: SystemUserUpdate,
    }): CancelablePromise<ApiResponse_SystemUserRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/users/update',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
