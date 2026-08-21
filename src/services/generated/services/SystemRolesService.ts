/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_list_SystemRoleRead__ } from '../models/ApiResponse_list_SystemRoleRead__';
import type { ApiResponse_NoneType_ } from '../models/ApiResponse_NoneType_';
import type { ApiResponse_SystemRoleRead_ } from '../models/ApiResponse_SystemRoleRead_';
import type { SystemRoleCreate } from '../models/SystemRoleCreate';
import type { SystemRoleDelete } from '../models/SystemRoleDelete';
import type { SystemRoleUpdate } from '../models/SystemRoleUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SystemRolesService {
    /**
     * 查询所有角色
     * 返回系统角色列表。
     * @returns ApiResponse_list_SystemRoleRead__ Successful Response
     * @throws ApiError
     */
    public static findAllRolesApiV1SystemRolesFindAllGet(): CancelablePromise<ApiResponse_list_SystemRoleRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/roles/findAll',
        });
    }
    /**
     * 创建角色
     * 创建角色基础信息与权限编码。
     * @returns ApiResponse_SystemRoleRead_ Successful Response
     * @throws ApiError
     */
    public static createRoleApiV1SystemRolesCreatePost({
        requestBody,
    }: {
        requestBody: SystemRoleCreate,
    }): CancelablePromise<ApiResponse_SystemRoleRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/roles/create',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 编辑角色
     * 更新角色基础信息、权限编码与关联菜单。
     * @returns ApiResponse_SystemRoleRead_ Successful Response
     * @throws ApiError
     */
    public static updateRoleApiV1SystemRolesUpdatePost({
        requestBody,
    }: {
        requestBody: SystemRoleUpdate,
    }): CancelablePromise<ApiResponse_SystemRoleRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/roles/update',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 删除角色
     * 按角色 ID 删除角色。
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteRoleApiV1SystemRolesDeletePost({
        requestBody,
    }: {
        requestBody: SystemRoleDelete,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/roles/delete',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
