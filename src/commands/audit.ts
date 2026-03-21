import {Command} from 'commander';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import {cleanupWorker, generateCompose, runWorker, getContainerErrors} from '../lib/docker.js';
import type {ContainerError} from '../lib/docker.js';
import {get, post, postMultipart, ApiError} from '../lib/api.js';
import {requireAuth, refreshTokens} from '../lib/auth.js';
import {getRefreshToken} from '../lib/keychain.js';
import {getEngineBaseUrl, getHubBaseUrl} from '../config.js';
import type {AuditCreatedResponse, AuditCreateRequest} from '../types/audit.js';

interface AuditRecipe {
    public_id: string;
    status: string;
    query: string;
}

export async function audit({ddlPath, queryPath, keepContainers = false}: AuditCreateRequest & { keepContainers?: boolean }): Promise<void> {
    const resolvedDdl = path.resolve(ddlPath);
    const resolvedQuery = path.resolve(queryPath);
    const toFileField = (filePath: string) => ({filePath, filename: path.basename(filePath)});

    // Step 1: upload files
    let spinner = ora('Uploading schema & query, creating audit…').start();
    let result: AuditCreatedResponse;
    try {
        result = await postMultipart<AuditCreatedResponse>('/audits', {
            ddl: toFileField(resolvedDdl),
            query: toFileField(resolvedQuery),
        });
        spinner.succeed(`Audit created · ${chalk.cyan(result.public_id)}`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
            spinner.fail('No credits remaining. Visit the Argus website to top up.');
            process.exit(1);
        }
        spinner.fail((err as Error).message);
        throw err;
    }

    // Step 2: get a fresh token to pass to containers
    spinner = ora('Refreshing credentials…').start();
    let authToken: string;
    try {
        const storedRefreshToken = await getRefreshToken();
        if (storedRefreshToken) {
            authToken = await refreshTokens(storedRefreshToken);
        } else {
            // CI path: ARGUS_AUTH_TOKEN is set directly in env
            authToken = await requireAuth();
        }
        spinner.succeed('Credentials refreshed');
    } catch (err) {
        spinner.fail((err as Error).message);
        throw err;
    }

    // Step 3: prepare Docker environment
    spinner = ora('Preparing Docker environment…').start();
    let composePath: string;
    let tmpTokenPath: string;
    try {
        ({ composePath, tmpTokenPath } = generateCompose({
            ddlPath: resolvedDdl,
            auditId: result.public_id,
            apiUrl: getEngineBaseUrl(),
            authToken,
        }));
        spinner.succeed('Docker environment ready');
    } catch (err) {
        spinner.fail((err as Error).message);
        throw err;
    }

    try {
        // Step 4: run benchmark
        spinner = ora('Running benchmark…').start();
        try {
            runWorker({composePath});
            spinner.succeed('Benchmark complete');
        } catch (err) {
            spinner.fail((err as Error).message);
            // best-effort: report each container's error to the API
            const containerErrors = getContainerErrors(composePath);
            if (containerErrors.length > 0) {
                const reportSpinner = ora('Reporting errors…').start();
                try {
                    await Promise.all(
                        containerErrors.map((e: ContainerError) =>
                            post(`/audits/${result.public_id}/container-errors`, {
                                container_name: e.containerName,
                                error_details: e.errorDetails,
                            }),
                        ),
                    );
                    reportSpinner.succeed('Errors reported');
                } catch {
                    reportSpinner.warn('Could not report errors to API');
                }
            }
            throw err;
        }

        // Step 5: fetch results
        spinner = ora('Fetching results…').start();
        let recipe: AuditRecipe;
        try {
            recipe = await get<AuditRecipe>(`/audits/${result.public_id}/recipe`);
            spinner.succeed(`Report ready · ${chalk.cyan(`${getHubBaseUrl()}/audits/${recipe.public_id}`)}`);
        } catch (err) {
            spinner.fail((err as Error).message);
            throw err;
        }
    } finally {
        if (keepContainers) {
            console.log(chalk.yellow('\nContainers left running. To clean up manually:'));
            console.log(chalk.dim(`  docker compose -f ${composePath} down -v`));
        } else {
            cleanupWorker({composePath, tmpTokenPath});
        }
    }
}

export function auditCommand(): Command {
    const cmd = new Command('audit');

    cmd
        .description('Run a benchmark audit on a SQL schema')
        .requiredOption('--ddl <path>', 'Path to DDL file')
        .requiredOption('--query <path>', 'Path to query file')
        .option('--keep-containers', 'Skip docker compose down after benchmark (containers remain running)', false)
        .action(async (options: { ddl: string; query: string; keepContainers: boolean }) => {
            try {
                await audit({ddlPath: options.ddl, queryPath: options.query, keepContainers: options.keepContainers});
            } catch (err) {
                console.error(chalk.red(`Audit failed: ${(err as Error).message}`));
                process.exit(1);
            }
        });

    return cmd;
}
