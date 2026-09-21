/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyModelGroupCode } from './EfficiencyModelGroupCode';
import type { EfficiencyModelSlice } from './EfficiencyModelSlice';
export type EfficiencyModelGroup = {
    code: EfficiencyModelGroupCode;
    name: string;
    credits: number;
    shareOfTotalPercent: number;
    models: Array<EfficiencyModelSlice>;
};
