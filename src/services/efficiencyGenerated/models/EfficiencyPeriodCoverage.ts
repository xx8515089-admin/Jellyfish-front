/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyCoverageByMetric } from './EfficiencyCoverageByMetric';
import type { EfficiencyCoverageReason } from './EfficiencyCoverageReason';
import type { EfficiencyTimeRange } from './EfficiencyTimeRange';
export type EfficiencyPeriodCoverage = {
    range: EfficiencyTimeRange;
    byMetric: EfficiencyCoverageByMetric;
    reasons: Array<EfficiencyCoverageReason>;
    reconciledAt: string | null;
};
