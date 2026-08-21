/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SystemRoleUpdate = {
    id: number;
    code: string;
    name: string;
    description?: (string | null);
    permissions: Array<string>;
    menuIds: Array<number>;
    active: boolean;
};
