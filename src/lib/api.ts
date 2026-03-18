import fs from 'node:fs/promises';
import {getEngineBaseUrl} from '../config.js';
import {requireAuth, refreshTokens} from './auth.js';
import {getRefreshToken} from './keychain.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileField {
    filePath: string;
    filename: string;
}

export type MultipartField = string | FileField;

type HttpResult =
    | { kind: 'network_error'; error: string }
    | { kind: 'response'; ok: boolean; status: number; response: Response };

// ─── Token refresh queue ──────────────────────────────────────────────────────
//
// Multiple concurrent requests may receive a 401 simultaneously. Instead of
// each firing its own refresh call, they all share a single in-flight promise.
// Once the refresh settles (success or failure) the promise is cleared so the
// next token expiry starts fresh.

let refreshPromise: Promise<string | null> | null = null;

function getRefreshedToken(): Promise<string | null> {
    if (!refreshPromise) {
        refreshPromise = (async () => {
            const refreshToken = await getRefreshToken();
            if (!refreshToken) return null;
            try {
                return await refreshTokens(refreshToken);
            } catch {
                return null;
            }
        })().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
}

// ─── Request helpers ──────────────────────────────────────────────────────────

function isFileField(value: MultipartField): value is FileField {
    return typeof value === 'object' && 'filePath' in value;
}

async function buildForm(fields: Record<string, MultipartField>): Promise<FormData> {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
        if (isFileField(value)) {
            const buffer = await fs.readFile(value.filePath);
            form.append(name, new Blob([buffer]), value.filename);
        } else {
            form.append(name, value);
        }
    }
    return form;
}

async function performMultipartFetch(url: string, form: FormData, jwt: string): Promise<HttpResult> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: form,
            headers: {Authorization: `Bearer ${jwt}`},
        });
        return {kind: 'response', ok: response.ok, status: response.status, response};
    } catch (error) {
        return {kind: 'network_error', error: error instanceof Error ? error.message : 'A network error occurred'};
    }
}

async function handleResult<T>(result: HttpResult): Promise<T> {
    if (result.kind === 'network_error') throw new Error(result.error);
    if (result.ok) return result.response.json() as Promise<T>;
    const body = await result.response.text();
    throw new Error(`API request failed [${result.status}]: ${body}`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function get<T>(path: string): Promise<T> {
    const jwt = await requireAuth();
    const url = `${getEngineBaseUrl()}${path}`;

    const response = await fetch(url, {
        headers: {Authorization: `Bearer ${jwt}`},
    });

    if (response.status === 401) {
        const newJwt = await getRefreshedToken();
        if (!newJwt) throw new Error('Session expired. Run: argus login');
        const retried = await fetch(url, {headers: {Authorization: `Bearer ${newJwt}`}});
        if (!retried.ok) {
            const body = await retried.text();
            throw new Error(`API request failed [${retried.status}]: ${body}`);
        }
        return retried.json() as Promise<T>;
    }

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`API request failed [${response.status}]: ${body}`);
    }

    return response.json() as Promise<T>;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
    const jwt = await requireAuth();
    const url = `${getEngineBaseUrl()}${path}`;

    const performFetch = (token: string) => fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });

    let response = await performFetch(jwt);

    if (response.status === 401) {
        const newJwt = await getRefreshedToken();
        if (!newJwt) throw new Error('Session expired. Run: argus login');
        response = await performFetch(newJwt);
    }

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`API request failed [${response.status}]: ${bodyText}`);
    }

    return response.json() as Promise<T>;
}

export async function postMultipart<T>(
    path: string,
    fields: Record<string, MultipartField>,
): Promise<T> {
    const [form, jwt] = await Promise.all([buildForm(fields), requireAuth()]);
    const url = `${getEngineBaseUrl()}${path}`;

    const result = await performMultipartFetch(url, form, jwt);

    if (result.kind === 'response' && result.status === 401) {
        const newJwt = await getRefreshedToken();
        if (!newJwt) throw new Error('Session expired. Run: argus login');
        return handleResult<T>(await performMultipartFetch(url, form, newJwt));
    }

    return handleResult<T>(result);
}
