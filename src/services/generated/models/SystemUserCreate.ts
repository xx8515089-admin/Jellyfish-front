/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SystemUserCreate = {
    username: string;
    displayName: string;
    password: string;
    apiQuota: number;
    apiQuotaResetAt?: (string | null);
    roleIds: Array<number>;
};
