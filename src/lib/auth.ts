// Core authentication logic: token retrieval and silent refresh on 401.
import {clearTokens, getAccessToken, setTokens} from './keychain.js'
import {getEngineBaseUrl} from '../config.js'

export async function refreshTokens(refreshToken: string): Promise<string> {
    const url = `${getEngineBaseUrl()}/auth/refresh`
    const response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({refresh_token: refreshToken}),
    })

    if (!response.ok) {
        await clearTokens()
        throw new Error('Session expired. Run: argus login')
    }

    const data = await response.json() as { access_token: string; refresh_token: string }
    await setTokens(data.access_token, data.refresh_token)
    return data.access_token
}

export async function requireAuth(): Promise<string> {
    // CI path: honour explicit token override
    const envToken = process.env['ARGUS_AUTH_TOKEN']
    if (envToken) {
        return envToken
    }

    const accessToken = await getAccessToken()
    if (!accessToken) {
        throw new Error('Not authenticated. Run: argus login')
    }

    return accessToken
}
