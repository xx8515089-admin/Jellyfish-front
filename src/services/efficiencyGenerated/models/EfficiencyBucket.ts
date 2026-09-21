/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyCoverageStatus } from './EfficiencyCoverageStatus';
export type EfficiencyBucket = {
    startAt: string;
    endAt: string;
    label: string;
    value: number;
    partial: boolean;
    plotValue: number | null;
    coverageStatus: EfficiencyCoverageStatus;
};
