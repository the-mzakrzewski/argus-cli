import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import * as yaml from 'js-yaml';

interface GenerateComposeOptions {
    ddlPath: string;
    auditId: string;
    apiUrl: string;
    authToken: string;
    workerImage: string;
    postgresImage?: string;
}

interface WorkerOptions {
    composePath: string;
    tmpTokenPath?: string;
}

const COMPOSE_TEMPLATE_PATH = path.join(import.meta.dirname, 'worker-compose.yml');

// `docker compose ... wait` requires Compose v2.20.0+, so audits cannot run below it.
export const MIN_COMPOSE_VERSION = '2.20.0';
const MIN_COMPOSE_PARTS = MIN_COMPOSE_VERSION.split('.').map(Number) as [number, number, number];

/**
 * Verify the installed Docker Compose is >= MIN_COMPOSE_VERSION.
 *
 * Runs `docker compose version --short`, parses the `major.minor.patch` it prints,
 * and throws a clear, actionable Error when Docker/Compose is missing, the version
 * cannot be parsed, or it is older than the minimum. Returns nothing on success.
 */
export function assertComposeVersion(): void {
    const result = spawnSync('docker', ['compose', 'version', '--short'], {stdio: 'pipe', encoding: 'utf8'});

    if (result.error || result.status !== 0) {
        throw new Error(
            `Docker Compose not found. Install Docker Compose >= ${MIN_COMPOSE_VERSION} to run audits.`,
        );
    }

    const match = (result.stdout as string).match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        throw new Error(
            `Could not determine the Docker Compose version. Ensure Docker Compose >= ${MIN_COMPOSE_VERSION} is installed.`,
        );
    }

    const found = [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number];
    for (let i = 0; i < MIN_COMPOSE_PARTS.length; i++) {
        if (found[i] > MIN_COMPOSE_PARTS[i]) break;
        if (found[i] < MIN_COMPOSE_PARTS[i]) {
            throw new Error(
                `Docker Compose ${found.join('.')} is too old. Argus requires Docker Compose >= ${MIN_COMPOSE_VERSION}. Please upgrade Docker Compose.`,
            );
        }
    }
}

/**
 * Verify the Docker daemon is reachable. `docker compose version` is
 * client-only, so a stopped Docker Desktop passes the version check and only
 * fails later at `up` — after an audit has already been created.
 */
export function assertDockerRunning(): void {
    const result = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {stdio: 'pipe', encoding: 'utf8'});

    if (result.error || result.status !== 0) {
        throw new Error(
            'Docker daemon is not reachable. Start Docker Desktop (with Linux containers) and try again.',
        );
    }
}

function toContainerUrl(apiUrl: string): string {
    return apiUrl.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)/, '$1host.docker.internal$3');
}


function sanitizeLogs(raw: string): string {
    return raw
        .split('\n')
        .slice(0, 50)
        .join('\n')
        .replace(/(password|secret|token|key)=[^\s&]*/gi, '$1=[REDACTED]')
        .replace(/:\/\/[^:]+:[^@]+@/g, '://[REDACTED]:[REDACTED]@');
}

export function generateCompose({ddlPath, auditId, apiUrl, authToken, workerImage, postgresImage}: GenerateComposeOptions): {
    composePath: string;
    tmpTokenPath: string
} {
    const runId = Date.now().toString();
    const composePath = path.join(os.tmpdir(), `argus-compose-${runId}.yml`);


    const tmpTokenPath = path.join(os.tmpdir(), `argus-token-${runId}`);
    fs.writeFileSync(tmpTokenPath, authToken, {mode: 0o600});

    const resolvedDdlPath = path.resolve(ddlPath);
    const ddlFilename = path.basename(ddlPath);

    const template = fs.readFileSync(COMPOSE_TEMPLATE_PATH, 'utf8').replaceAll('__RUN_ID__', runId);

    const compose = yaml.load(template) as Record<string, unknown>;
    const services = compose.services as Record<string, Record<string, unknown>>;

    if (postgresImage) {
        services.postgres.image = postgresImage;
    }

    services.seeder.image = workerImage;
    services.worker.image = workerImage;

    const containerTokenPath = '/run/secrets/auth_token';
    const auditEnv = {
        ARGUS_API_URL: toContainerUrl(apiUrl),
        ARGUS_AUDIT_ID: auditId,
        ARGUS_AUTH_TOKEN_FILE: containerTokenPath,
    };

    const seeder = services.seeder;

    seeder.volumes = [
        `${resolvedDdlPath}:/test/${ddlFilename}:ro`,
        `${tmpTokenPath}:${containerTokenPath}:ro`,
    ];
    Object.assign(seeder.environment as Record<string, string>, {DDL_FILE: `/test/${ddlFilename}`, ...auditEnv});

    const worker = services.worker;

    worker.volumes = [
        `${tmpTokenPath}:${containerTokenPath}:ro`,
    ];
    Object.assign(worker.environment as Record<string, string>, auditEnv);

    fs.writeFileSync(composePath, yaml.dump(compose));
    return {composePath, tmpTokenPath};
}

function spawnAsync(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {stdio: ['ignore', 'ignore', 'pipe']});
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('close', (code) => {
            if (code !== 0) {
                const detail = sanitizeLogs(stderr.trim());
                reject(new Error(
                    `${cmd} ${args.join(' ')} failed (exit code ${code})${detail ? `:\n${detail}` : ''}`,
                ));
            } else resolve();
        });
        child.on('error', reject);
    });
}

export async function runWorker({composePath}: WorkerOptions): Promise<void> {
    await spawnAsync('docker', ['compose', '-f', composePath, 'up', '-d']);
    await spawnAsync('docker', ['compose', '-f', composePath, 'wait', 'worker']);
}

export function cleanupWorker({composePath, tmpTokenPath}: WorkerOptions): void {
    try {

        spawnSync('docker', ['compose', '-f', composePath, 'down', '-v'], {stdio: 'pipe'});
        fs.unlinkSync(composePath);
    } catch {
        // best-effort cleanup
    }
    if (tmpTokenPath) {
        try {
            fs.unlinkSync(tmpTokenPath);
        } catch {
            // best-effort cleanup
        }
    }
}

export interface ContainerError {
    containerName: string;
    errorDetails: string;
}

export function getContainerErrors(composePath: string): ContainerError[] {
    try {
        const ps = spawnSync(
            'docker',
            ['compose', '-f', composePath, 'ps', '--format', 'json'],
            {stdio: 'pipe', encoding: 'utf8'},
        );
        if (ps.status !== 0) return [];

        // Compose 2.20.x prints a JSON array; 2.21+ prints one JSON object per line.
        const psOutput = (ps.stdout as string).trim();
        const containers: Array<{ Service: string; ExitCode: number }> = psOutput.startsWith('[')
            ? JSON.parse(psOutput)
            : psOutput
                .split('\n')
                .filter(Boolean)
                .map((line) => JSON.parse(line));

        return containers
            .filter((c) => c.ExitCode !== 0)
            .map((c) => {
                const logsResult = spawnSync(
                    'docker',
                    ['compose', '-f', composePath, 'logs', c.Service, '--no-color', '--tail', '50'],
                    {stdio: 'pipe', encoding: 'utf8'},
                );
                if (logsResult.status !== 0) {
                    return {containerName: c.Service, errorDetails: `exited with code ${c.ExitCode}`};
                }
                const raw = (logsResult.stdout as string).trim() || `exited with code ${c.ExitCode}`;
                return {containerName: c.Service, errorDetails: sanitizeLogs(raw)};
            });
    } catch {
        return [];
    }
}
