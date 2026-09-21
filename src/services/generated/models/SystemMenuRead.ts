/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SystemMenuRead = {
    createdAt?: string;
    updatedAt?: string;
    id: number;
    parentId?: (number | null);
    code: string;
    name: string;
    /** Original Chinese name, independent of request language. */
    nameZh?: string;
    nameEn?: (string | null);
    path?: (string | null);
    icon?: (string | null);
    menuType: string;
    sortOrder: number;
    active: boolean;
    children?: Array<SystemMenuRead>;
};
