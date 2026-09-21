/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EfficiencyReadiness = {
    status: 'ready' | 'pending' | 'running' | 'failed' | 'missingMigration';
    retryable: boolean;
    lastSuccessAt?: string | null;
    lastTaskId?: number | null;
    failureCode?: string | null;
};
