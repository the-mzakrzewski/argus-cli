import {Agent} from 'undici';

// Keep idle sockets for 10s (reuse within a command), prune before they go stale.
export const agent = new Agent({keepAliveTimeout: 10_000, keepAliveMaxTimeout: 30_000});
