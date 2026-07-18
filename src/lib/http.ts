import {Agent, fetch, FormData} from 'undici';

// Keep idle sockets for 10s (reuse within a command), prune before they go stale.
export const agent = new Agent({keepAliveTimeout: 10_000, keepAliveMaxTimeout: 30_000});

// `agent` must only be used with undici's own `fetch`, never Node's global one:
// Node's built-in fetch is backed by its bundled undici, and a dispatcher from a
// different undici major is rejected at dispatch time (surfaced as "fetch failed").
// Response/FormData are re-exported alongside so callers stay on the same copy.
export {fetch, FormData};
export type {Response} from 'undici';

/**
 * Format an error for display, surfacing `cause` — undici wraps network
 * failures in a generic "fetch failed" TypeError with the real error inside.
 */
export function describeError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    if (err.cause instanceof Error && err.cause.message) {
        return `${err.message}: ${err.cause.message}`;
    }
    return err.message;
}
