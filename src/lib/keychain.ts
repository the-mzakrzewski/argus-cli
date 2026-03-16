// Thin wrapper around @napi-rs/keyring for secure OS-level token storage.
import {Entry} from '@napi-rs/keyring'

const SERVICE = 'argus-cli'
const ACCESS_TOKEN_ACCOUNT = 'access_token'
const REFRESH_TOKEN_ACCOUNT = 'refresh_token'

export async function getAccessToken(): Promise<string | null> {
    try {
        const entry = new Entry(SERVICE, ACCESS_TOKEN_ACCOUNT)
        return entry.getPassword() ?? null
    } catch {
        return null
    }
}

export async function getRefreshToken(): Promise<string | null> {
    try {
        const entry = new Entry(SERVICE, REFRESH_TOKEN_ACCOUNT)
        return entry.getPassword() ?? null
    } catch {
        return null
    }
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
    const accessEntry = new Entry(SERVICE, ACCESS_TOKEN_ACCOUNT)
    accessEntry.setPassword(accessToken)
    const refreshEntry = new Entry(SERVICE, REFRESH_TOKEN_ACCOUNT)
    refreshEntry.setPassword(refreshToken)
}

export async function clearTokens(): Promise<void> {
    try {
        const accessEntry = new Entry(SERVICE, ACCESS_TOKEN_ACCOUNT)
        accessEntry.deletePassword()
    } catch {
        // ignore if already absent
    }
    try {
        const refreshEntry = new Entry(SERVICE, REFRESH_TOKEN_ACCOUNT)
        refreshEntry.deletePassword()
    } catch {
        // ignore if already absent
    }
}
