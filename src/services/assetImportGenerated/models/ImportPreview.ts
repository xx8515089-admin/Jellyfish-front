/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ImportItem } from './ImportItem';
export type ImportPreview = {
    batchId: string;
    status: 'draft' | 'ready';
    revision: number;
    previewToken?: string;
    expiresAt?: string;
    totalCount: number;
    validCount: number;
    invalidCount: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    items: Array<ImportItem>;
    page: number;
    pageSize: number;
};
