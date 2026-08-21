/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssetGenerationSpecKey } from './AssetGenerationSpecKey';
export type AssetGenerationBatchRequest = {
    asset_type?: (string | null);
    priority?: (string | null);
    asset_variant?: (string | null);
    missing_only?: boolean;
    status?: (string | null);
    keyword?: (string | null);
    runner_model?: (string | null);
    runner_source_sheet?: (string | null);
    skip_existing?: boolean;
    include_legacy?: boolean;
    selected_specs?: (Array<AssetGenerationSpecKey> | null);
};

