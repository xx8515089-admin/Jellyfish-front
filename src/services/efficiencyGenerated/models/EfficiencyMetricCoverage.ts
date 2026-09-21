/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyCoverageStatus } from './EfficiencyCoverageStatus';
import type { EfficiencyTimeRange } from './EfficiencyTimeRange';
export type EfficiencyMetricCoverage = {
    status: EfficiencyCoverageStatus;
    sourceDiscrepancyCount: number;
    verifiedRanges: Array<EfficiencyTimeRange>;
};
