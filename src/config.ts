const DEFAULT_URL = 'http://localhost:8000/api/v1';
const DEFAULT_HUB_URL = 'http://localhost:3000';

export function getEngineBaseUrl(): string {
    return process.env['ARGUS_API_URL'] || DEFAULT_URL;
}

export function getHubBaseUrl(): string {
    return process.env['ARGUS_HUB_URL'] || DEFAULT_HUB_URL;
}
