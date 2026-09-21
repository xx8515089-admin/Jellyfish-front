/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ImportError } from './ImportError';
export type ImportItem = {
    itemId: string;
    clientItemId?: string;
    rowNumber?: number | null;
    assetType?: 1 | 2 | 3 | null;
    name: string;
    status: 'valid' | 'invalid' | 'pending' | 'running' | 'succeeded' | 'skipped' | 'failed';
    action: 'create' | 'update' | 'skip' | 'none' | 'created' | 'updated' | 'skipped';
    stage?: string;
    attempt?: number;
    retryable?: boolean;
    libraryItemId?: number | null;
    assetId?: number | null;
    defaultLookId?: number | null;
    imageVersionId?: number | null;
    fileId?: number | null;
    coverUrl?: string | null;
    errors: Array<ImportError>;
};
