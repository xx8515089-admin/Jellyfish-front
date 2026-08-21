/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Defines administrator-controlled user creation fields.
 */
export type UserCreate = {
    username: string;
    display_name: string;
    password: string;
    is_admin?: boolean;
    is_active?: boolean;
    api_quota?: number;
};

