const DEFAULT_URL = 'http://localhost:8000/api/v1';

export function getEngineBaseUrl(): string {
    return process.env['ARGUS_API_URL'] || DEFAULT_URL;
}
