/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EfficiencyRankingRow = {
    rank: number;
    groupKey: string;
    id: number | null;
    name: string;
    value: number;
    sharePercent: number;
    entityState: 'active' | 'deleted' | 'restricted' | 'unknown';
    canNavigate: boolean;
};
