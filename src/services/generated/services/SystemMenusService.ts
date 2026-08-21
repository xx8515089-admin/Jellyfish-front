/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_list_SystemMenuRead__ } from '../models/ApiResponse_list_SystemMenuRead__';
import type { ApiResponse_NoneType_ } from '../models/ApiResponse_NoneType_';
import type { ApiResponse_SystemMenuRead_ } from '../models/ApiResponse_SystemMenuRead_';
import type { SystemMenuCreate } from '../models/SystemMenuCreate';
import type { SystemMenuDelete } from '../models/SystemMenuDelete';
import type { SystemMenuUpdate } from '../models/SystemMenuUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SystemMenusService {
    /**
     * 查询所有菜单树
     * 返回系统菜单树结构。
     * @returns ApiResponse_list_SystemMenuRead__ Successful Response
     * @throws ApiError
     */
    public static findAllMenusApiV1SystemMenusFindAllGet(): CancelablePromise<ApiResponse_list_SystemMenuRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/menus/findAll',
        });
    }
    /**
     * 创建菜单
     * 创建目录、菜单或按钮节点。
     * @returns ApiResponse_SystemMenuRead_ Successful Response
     * @throws ApiError
     */
    public static createMenuApiV1SystemMenusCreatePost({
        requestBody,
    }: {
        requestBody: SystemMenuCreate,
    }): CancelablePromise<ApiResponse_SystemMenuRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/menus/create',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 编辑菜单
     * 更新菜单基础信息。
     * @returns ApiResponse_SystemMenuRead_ Successful Response
     * @throws ApiError
     */
    public static updateMenuApiV1SystemMenusUpdatePost({
        requestBody,
    }: {
        requestBody: SystemMenuUpdate,
    }): CancelablePromise<ApiResponse_SystemMenuRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/menus/update',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 删除菜单
     * 按菜单 ID 删除节点。
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteMenuApiV1SystemMenusDeletePost({
        requestBody,
    }: {
        requestBody: SystemMenuDelete,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/menus/delete',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
