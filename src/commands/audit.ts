import {Command} from 'commander';
import path from 'node:path';
import chalk from 'chalk';
import {cleanupWorker, generateCompose, runWorker} from '../lib/docker.js';
import {get, postMultipart} from '../lib/api.js';
import {requireAuth} from '../lib/auth.js';
import {getRefreshToken} from '../lib/keychain.js';
import {getEngineBaseUrl, getHubBaseUrl} from '../config.js';
import type {AuditCreatedResponse, AuditCreateRequest} from '../types/audit.js';

interface AuditRecipe {
    public_id: string;
    status: string;
    query: string;
}

export async function audit({ddlPath, queryPath}: AuditCreateRequest): Promise<void> {
    const resolvedDdl = path.resolve(ddlPath);
    const resolvedQuery = path.resolve(queryPath);
    const toFileField = (filePath: string) => ({filePath, filename: path.basename(filePath)});

    const result = await postMultipart<AuditCreatedResponse>('/audits', {
        ddl: toFileField(resolvedDdl),
        query: toFileField(resolvedQuery),
    });

    console.log(chalk.bold('Audit created:'));
    console.log(`  ${chalk.cyan('ID')}     ${result.public_id}`);
    console.log(`  ${chalk.cyan('Status')} ${result.status}`);

    const authToken = await requireAuth();
    const refreshToken = await getRefreshToken() ?? '';
    const composePath = generateCompose({
        ddlPath: resolvedDdl,
        auditId: result.public_id,
        apiUrl: getEngineBaseUrl(),
        authToken,
        refreshToken,
    });

    try {
        runWorker({composePath});

        const recipe = await get<AuditRecipe>(`/audits/${result.public_id}/recipe`);
        console.log(chalk.green(`✓ Benchmark complete. View report: ${getHubBaseUrl()}/audits/${recipe.public_id}`));
    } finally {
        cleanupWorker({composePath});
    }
}

export function auditCommand(): Command {
    const cmd = new Command('audit');

    cmd
        .description('Run a benchmark audit on a SQL schema')
        .requiredOption('--ddl <path>', 'Path to DDL file')
        .requiredOption('--query <path>', 'Path to query file')
        .action(async (options: { ddl: string; query: string }) => {
            try {
                await audit({ddlPath: options.ddl, queryPath: options.query});
            } catch (err) {
                console.error(chalk.red(`Audit failed: ${(err as Error).message}`));
                process.exit(1);
            }
        });

    return cmd;
}
