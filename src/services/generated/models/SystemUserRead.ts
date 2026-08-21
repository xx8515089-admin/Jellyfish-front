/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SystemRoleRead } from './SystemRoleRead';
export type SystemUserRead = {
    createdAt?: string;
    updatedAt?: string;
    id: number;
    username: string;
    displayName: string;
    passwordHash?: (string | null);
    roles: Array<SystemRoleRead>;
    active: boolean;
    apiQuota: number;
    apiUsed: number;
    apiQuotaResetAt?: (string | null);
    roleIds: Array<number>;
};
