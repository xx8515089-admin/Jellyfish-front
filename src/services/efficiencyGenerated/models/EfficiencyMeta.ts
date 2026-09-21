/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyConsistency } from './EfficiencyConsistency';
import type { EfficiencyCoverage } from './EfficiencyCoverage';
import type { EfficiencyReadiness } from './EfficiencyReadiness';
import type { EfficiencyTimeRange } from './EfficiencyTimeRange';
export type EfficiencyMeta = {
    scope: 'production';
    timezone: string;
    generatedAt: string;
    currentRange: EfficiencyTimeRange;
    previousRange: EfficiencyTimeRange;
    coverage: EfficiencyCoverage;
    readiness: EfficiencyReadiness;
    consistency: EfficiencyConsistency;
};
