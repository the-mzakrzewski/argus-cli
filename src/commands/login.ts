// `argus login` command — opens a browser for OAuth-style CLI login via loopback callback.
import {Command} from 'commander'
import http from 'node:http'
import net from 'node:net'
import crypto from 'node:crypto'
import {URL} from 'node:url'
import open from 'open'
import chalk from 'chalk'
import {getAccessToken, setTokens} from '../lib/keychain.js'
import {getEngineBaseUrl, getHubBaseUrl} from '../config.js'

async function findFreePort(start: number, end: number): Promise<number> {
    for (let port = start; port <= end; port++) {
        const available = await new Promise<boolean>((resolve) => {
            const server = net.createServer()
            server.once('error', () => resolve(false))
            server.once('listening', () => {
                server.close(() => resolve(true))
            })
            server.listen(port, '127.0.0.1')
        })
        if (available) return port
    }
    throw new Error(`No free port found in range ${start}-${end}`)
}

function generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
}

async function login(): Promise<void> {
    const existing = await getAccessToken()
    if (existing) {
        console.log(chalk.yellow('Already logged in. Run `argus logout` to switch accounts.'))
        return
    }

    const port = await findFreePort(9000, 9100)
    const redirectUri = `http://127.0.0.1:${port}`

    const state = crypto.randomBytes(16).toString('hex')
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    const codeReceived = new Promise<{ code: string }>((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
                const code = reqUrl.searchParams.get('code')
                const returnedState = reqUrl.searchParams.get('state')

                if (returnedState !== state) {
                    res.writeHead(400, {'Content-Type': 'text/plain'})
                    res.end('Invalid state parameter. Request rejected.')
                    return
                }

                if (!code) {
                    res.writeHead(400, {'Content-Type': 'text/plain'})
                    res.end('Missing code parameter.')
                    return
                }

                res.writeHead(200, {'Content-Type': 'text/html'})
                res.end('<!DOCTYPE html><html><body><h2>Login successful. You can close this tab.</h2></body></html>')

                server.close()
                resolve({code})
            } catch (err) {
                reject(err)
            }
        })

        server.listen(port, '127.0.0.1')
    })

    const loginUrl = `${getHubBaseUrl()}/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${encodeURIComponent(codeChallenge)}`
    await open(loginUrl)
    console.log(chalk.dim('Opening browser for login... (waiting for callback)'))

    const {code} = await codeReceived

    const exchangeRes = await fetch(`${getEngineBaseUrl()}/auth/cli-token`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code, code_verifier: codeVerifier}),
    })
    if (!exchangeRes.ok) {
        throw new Error('Failed to exchange login code for tokens.')
    }
    const tokens = await exchangeRes.json() as {access_token: string; refresh_token: string}
    await setTokens(tokens.access_token, tokens.refresh_token)

    console.log(chalk.green('Logged in successfully.'))
}

export function loginCommand(): Command {
    const cmd = new Command('login')

    cmd
        .description('Authenticate with ARGUS via browser login')
        .action(async () => {
            try {
                await login()
            } catch (err) {
                console.error(chalk.red(`Login failed: ${(err as Error).message}`))
                process.exit(1)
            }
        })

    return cmd
}
