/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EfficiencyModelGroupCode } from './EfficiencyModelGroupCode';
import type { EfficiencyUnit } from './EfficiencyUnit';
export type EfficiencyRecord = {
    recordKey: string;
    taskId: number;
    usageId: number | null;
    taskKind: string;
    operationCode: string;
    drawScope: 'video' | 'image' | 'asset' | null;
    projectId: number | null;
    projectName: string | null;
    memberId: number | null;
    memberName: string | null;
    entityState: 'active' | 'deleted' | 'restricted' | 'unknown';
    canNavigate: boolean;
    modelId: number | null;
    modelName: string | null;
    taskStatus: number;
    billingStatus: number | null;
    metricValue: number;
    unit: EfficiencyUnit;
    actualCredits: number | null;
    durationMs: number | null;
    durationQuality: 'exact' | 'estimated' | 'missing' | 'pending';
    eventAt: string;
    timeBasis: 'settledAt' | 'finishedAt' | 'createdAt';
    createdAt: string;
    firstStartedAt: string | null;
    ownPhaseFinishedAt: string | null;
    finishedAt: string | null;
    settledAt: string | null;
    modelGroup: EfficiencyModelGroupCode;
    modelKey: string;
    supplierId: number | null;
    supplierName: string | null;
};
