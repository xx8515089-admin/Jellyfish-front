/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Defines editable account, role, password, and quota fields.
 */
export type UserUpdate = {
    display_name?: (string | null);
    password?: (string | null);
    is_admin?: (boolean | null);
    is_active?: (boolean | null);
    api_quota?: (number | null);
    reset_api_used?: boolean;
};

