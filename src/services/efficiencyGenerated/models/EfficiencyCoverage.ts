/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyCoverageByMetric } from './EfficiencyCoverageByMetric';
import type { EfficiencyCoverageReason } from './EfficiencyCoverageReason';
import type { EfficiencyMetric } from './EfficiencyMetric';
import type { EfficiencyPeriodCoverage } from './EfficiencyPeriodCoverage';
export type EfficiencyCoverage = {
    status: 'complete' | 'partial';
    verifiedFrom: string | null;
    warnings: Array<string>;
    requiredMetrics: Array<EfficiencyMetric>;
    diagnosticScope: 'commonFilters';
    current: EfficiencyPeriodCoverage;
    previous: EfficiencyPeriodCoverage;
    byMetric: EfficiencyCoverageByMetric;
    reasons: Array<EfficiencyCoverageReason>;
};
