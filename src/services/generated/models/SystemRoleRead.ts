/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SystemRoleRead = {
    createdAt?: string;
    updatedAt?: string;
    id: number;
    code: string;
    name: string;
    description?: (string | null);
    permissions: Array<string>;
    menuIds?: Array<number>;
    system: boolean;
    active: boolean;
};
