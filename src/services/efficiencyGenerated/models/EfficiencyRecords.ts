/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyMeta } from './EfficiencyMeta';
import type { EfficiencyMetric } from './EfficiencyMetric';
import type { EfficiencyRecord } from './EfficiencyRecord';
import type { EfficiencyUnit } from './EfficiencyUnit';
export type EfficiencyRecords = {
    metric: EfficiencyMetric;
    unit: EfficiencyUnit;
    drawScope: 'all' | 'video' | 'image' | 'asset' | null;
    totalValue: number;
    total: number;
    page: number;
    pageSize: number;
    items: Array<EfficiencyRecord>;
    meta: EfficiencyMeta;
};
