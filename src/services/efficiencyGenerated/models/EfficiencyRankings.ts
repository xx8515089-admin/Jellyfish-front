/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyMeta } from './EfficiencyMeta';
import type { EfficiencyMetric } from './EfficiencyMetric';
import type { EfficiencyRankingRow } from './EfficiencyRankingRow';
import type { EfficiencyUnit } from './EfficiencyUnit';
export type EfficiencyRankings = {
    metric: EfficiencyMetric;
    unit: EfficiencyUnit;
    drawScope: 'all' | 'video' | 'image' | 'asset' | null;
    groupBy: 'project' | 'member';
    totalValue: number;
    otherValue: number;
    rows: Array<EfficiencyRankingRow>;
    meta: EfficiencyMeta;
};
