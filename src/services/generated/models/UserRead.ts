/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Exposes safe user and quota fields without returning password material.
 */
export type UserRead = {
    id: string;
    username: string;
    display_name: string;
    is_admin: boolean;
    is_active: boolean;
    api_quota: number;
    api_used: number;
    api_remaining: number;
    created_at: string;
    updated_at: string;
};

