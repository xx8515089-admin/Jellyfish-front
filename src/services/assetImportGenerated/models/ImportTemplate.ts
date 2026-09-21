/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ImportTemplate = {
    filename: string;
    content: string;
    fields: Array<string>;
    supportedAssetTypes: Array<number>;
    limits: {
        maxTextBytes: number;
        maxRows: number;
        maxFileBytes: number;
        maxFiles: number;
        maxBatchBytes: number;
    };
};
