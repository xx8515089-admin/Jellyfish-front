/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyReadiness } from './EfficiencyReadiness';
export type EfficiencyError = {
    code: number;
    message: string;
    data: {
        errorCode?: string;
        readiness?: EfficiencyReadiness;
    } | null;
};
