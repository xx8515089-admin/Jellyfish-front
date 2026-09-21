/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EfficiencyComparison = {
    current: number;
    previous: number;
    changePercent: number | null;
    changeState: 'increase' | 'decrease' | 'unchanged' | 'new' | 'noData' | 'unavailable';
};
