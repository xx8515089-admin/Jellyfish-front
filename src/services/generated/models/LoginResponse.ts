/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UserRead } from './UserRead';
/**
 * Returns an opaque bearer token and its authenticated user.
 */
export type LoginResponse = {
    access_token: string;
    token_type?: string;
    expires_at: string;
    user: UserRead;
};

