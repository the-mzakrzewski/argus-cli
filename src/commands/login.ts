// `argus login` command — opens a browser for OAuth-style CLI login via loopback callback.
import {Command} from 'commander'
import http from 'node:http'
import net from 'node:net'
import {URL} from 'node:url'
import open from 'open'
import chalk from 'chalk'
import {getAccessToken, setTokens} from '../lib/keychain.js'
import {getHubBaseUrl} from '../config.js'

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

async function login(): Promise<void> {
    const existing = await getAccessToken()
    if (existing) {
        console.log(chalk.yellow('Already logged in. Run `argus logout` to switch accounts.'))
        return
    }

    const port = await findFreePort(9000, 9100)
    const redirectUri = `http://127.0.0.1:${port}`

    const tokenReceived = new Promise<{ token: string; refreshToken: string }>((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
                const token = reqUrl.searchParams.get('token')
                const refreshToken = reqUrl.searchParams.get('refresh_token')

                if (!token || !refreshToken) {
                    res.writeHead(400, {'Content-Type': 'text/plain'})
                    res.end('Missing token parameters.')
                    return
                }

                res.writeHead(200, {'Content-Type': 'text/html'})
                res.end('<!DOCTYPE html><html><body><h2>Login successful. You can close this tab.</h2></body></html>')

                server.close()
                resolve({token, refreshToken})
            } catch (err) {
                reject(err)
            }
        })

        server.listen(port, '127.0.0.1')
    })

    const loginUrl = `${getHubBaseUrl()}/auth/cli-login?redirect_uri=${encodeURIComponent(redirectUri)}`
    await open(loginUrl)
    console.log(chalk.dim('Opening browser for login... (waiting for callback)'))

    const {token, refreshToken} = await tokenReceived
    await setTokens(token, refreshToken)
    console.log(chalk.green('✔ Logged in. Session stored securely.'))
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
