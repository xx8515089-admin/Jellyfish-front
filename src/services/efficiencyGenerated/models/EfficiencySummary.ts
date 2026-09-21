/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyComparison } from './EfficiencyComparison';
import type { EfficiencyMeta } from './EfficiencyMeta';
export type EfficiencySummary = {
    credits: EfficiencyComparison;
    duration: EfficiencyComparison;
    draws: EfficiencyComparison;
    drawBreakdown: {
        video: number;
        image: number;
        asset: number;
    };
    quality: {
        pendingBillingCount: number;
        missingDurationCount: number;
        estimatedDurationCount: number;
        unknownProjectCount: number;
        unknownMemberCount: number;
        unknownModelCount: number;
        missingBillingCount: number;
    };
    meta: EfficiencyMeta;
};
