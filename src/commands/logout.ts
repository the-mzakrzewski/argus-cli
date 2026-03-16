// `argus logout` command — clears stored tokens from the OS keychain.
import {Command} from 'commander'
import chalk from 'chalk'
import {clearTokens, getAccessToken} from '../lib/keychain.js'

export function logoutCommand(): Command {
    const cmd = new Command('logout')

    cmd
        .description('Log out and remove stored credentials')
        .action(async () => {
            const token = await getAccessToken()
            if (!token) {
                console.log(chalk.yellow('Not logged in.'))
                return
            }
            await clearTokens()
            console.log(chalk.green('Logged out.'))
        })

    return cmd
}
