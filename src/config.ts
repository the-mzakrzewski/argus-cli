const DEFAULT_URL = 'http://localhost:8000/api/v1';
const DEFAULT_HUB_URL = 'http://localhost:3000';

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
