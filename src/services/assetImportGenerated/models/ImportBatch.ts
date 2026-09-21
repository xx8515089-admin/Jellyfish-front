/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ImportBatch = {
    batchId: string;
    source?: 'manifest' | 'images';
    status: 'draft' | 'ready' | 'queued' | 'running' | 'succeeded' | 'partial_success' | 'failed' | 'expired';
    revision: number;
    expiresAt?: string;
    totalCount?: number;
    processedCount?: number;
    succeededCount?: number;
    skippedCount?: number;
    failedCount?: number;
};
