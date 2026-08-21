/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SystemUserUpdate = {
    id: number;
    username: string;
    password?: (string | null);
    roleIds: Array<number>;
    apiQuota: number;
    apiQuotaResetAt?: (string | null);
    active: boolean;
};
