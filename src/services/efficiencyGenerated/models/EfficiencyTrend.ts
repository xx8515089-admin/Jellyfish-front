/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyBucket } from './EfficiencyBucket';
import type { EfficiencyMeta } from './EfficiencyMeta';
import type { EfficiencyMetric } from './EfficiencyMetric';
import type { EfficiencyUnit } from './EfficiencyUnit';
export type EfficiencyTrend = {
    metric: EfficiencyMetric;
    unit: EfficiencyUnit;
    drawScope: 'all' | 'video' | 'image' | 'asset' | null;
    granularity: 'hour' | 'day';
    totalValue: number;
    buckets: Array<EfficiencyBucket>;
    meta: EfficiencyMeta;
};
