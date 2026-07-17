const DEFAULT_URL = 'https://api.argusaudit.dev/api/v1';
const DEFAULT_HUB_URL = 'https://www.argusaudit.dev';

// Pinned, not `latest`: a benchmarking tool must run a reproducible worker.
// Bump in lockstep with argus-worker releases.
const DEFAULT_WORKER_IMAGE = 'argusaudit/worker:0.1.0';

function warnIfInsecure(url: string): void {
    if (!url.startsWith('http://')) return;
    try {
        const {hostname} = new URL(url);
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            process.stderr.write(
                '⚠ WARNING: ARGUS_API_URL uses insecure HTTP for a non-local address. Use HTTPS in production.\n',
            );
        }
    } catch {
        // unparseable URL — let the request fail naturally
    }
}

export function getEngineBaseUrl(): string {
    const url = process.env['ARGUS_API_URL'] || DEFAULT_URL;
    warnIfInsecure(url);
    return url;
}

export function getHubBaseUrl(): string {
    return process.env['ARGUS_HUB_URL'] || DEFAULT_HUB_URL;
}

export function getWorkerImage(): string {
    return process.env['ARGUS_WORKER_IMAGE'] || DEFAULT_WORKER_IMAGE;
}
