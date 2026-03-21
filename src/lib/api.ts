import fs from 'node:fs/promises';
import {agent} from './http.js';
import {getEngineBaseUrl} from '../config.js';
import {refreshTokens, requireAuth} from './auth.js';
import {getRefreshToken} from './keychain.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export interface FileField {
    filePath: string;
    filename: string;
}

export type MultipartField = string | FileField;

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
        })().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}

// ─── Core request ─────────────────────────────────────────────────────────────

async function request<T>(perform: (jwt: string) => Promise<Response>): Promise<T> {
    const jwt = await requireAuth();
    let response = await perform(jwt);

    if (response.status === 401) {
        const newJwt = await getRefreshedToken();
        if (!newJwt) throw new Error('Session expired. Run: argus login');
        response = await perform(newJwt);
    }

    if (!response.ok) {
        const body = await response.text();
        throw new ApiError(response.status, `API request failed [${response.status}]: ${body}`);
    }

    return response.json() as Promise<T>;
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

// ─── Public API ───────────────────────────────────────────────────────────────

export function get<T>(path: string): Promise<T> {
    const url = `${getEngineBaseUrl()}${path}`;
    return request<T>(jwt => fetch(url, {
        headers: {Authorization: `Bearer ${jwt}`},
        dispatcher: agent,
    } as RequestInit));
}

export function post<T>(path: string, body: unknown): Promise<T> {
    const url = `${getEngineBaseUrl()}${path}`;
    return request<T>(jwt => fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json'},
        dispatcher: agent,
    } as RequestInit));
}

export async function postMultipart<T>(
    path: string,
    fields: Record<string, MultipartField>,
): Promise<T> {
    const form = await buildForm(fields);
    const url = `${getEngineBaseUrl()}${path}`;
    return request<T>(jwt => fetch(url, {
        method: 'POST',
        body: form,
        headers: {Authorization: `Bearer ${jwt}`},
        dispatcher: agent,
    } as RequestInit));
}
