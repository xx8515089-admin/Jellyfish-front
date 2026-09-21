/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyMetric } from './EfficiencyMetric';
import type { EfficiencyTimeRange } from './EfficiencyTimeRange';
export type EfficiencyCoverageReason = {
    id: string;
    code: string;
    certainty: 'confirmed' | 'unverified';
    affectedMetrics: Array<EfficiencyMetric>;
    affectedCount: number | null;
    affectedRange: EfficiencyTimeRange;
    recoverability: 'backfillable' | 'manualReview' | 'notRecoverable' | 'unknown';
    impact: 'metric' | 'attribution';
    message: string;
};
