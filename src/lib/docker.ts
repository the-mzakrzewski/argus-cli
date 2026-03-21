import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

interface GenerateComposeOptions {
  ddlPath: string;
  auditId: string;
  apiUrl: string;
  authToken: string;
}

interface WorkerOptions {
  composePath: string;
  tmpTokenPath?: string;
}

const COMPOSE_TEMPLATE_PATH = path.join(import.meta.dirname, 'worker-compose.yml');

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

export function generateCompose({ ddlPath, auditId, apiUrl, authToken }: GenerateComposeOptions): { composePath: string; tmpTokenPath: string } {
  const runId = Date.now().toString();
  const composePath = path.join(os.tmpdir(), `argus-compose-${runId}.yml`);


  const tmpTokenPath = path.join(os.tmpdir(), `argus-token-${runId}`);
  fs.writeFileSync(tmpTokenPath, authToken, { mode: 0o600 });

  const resolvedDdlPath = path.resolve(ddlPath);
  const ddlFilename = path.basename(ddlPath);

  const template = fs.readFileSync(COMPOSE_TEMPLATE_PATH, 'utf8').replaceAll('__RUN_ID__', runId);

  const compose = yaml.load(template) as Record<string, unknown>;
  const services = compose.services as Record<string, Record<string, unknown>>;

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
  Object.assign(seeder.environment as Record<string, string>, { DDL_FILE: `/test/${ddlFilename}`, ...auditEnv });

  const worker = services.worker;

  worker.volumes = [
    `${tmpTokenPath}:${containerTokenPath}:ro`,
  ];
  Object.assign(worker.environment as Record<string, string>, auditEnv);

  fs.writeFileSync(composePath, yaml.dump(compose));
  return { composePath, tmpTokenPath };
}

function spawnAsync(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'pipe' });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed`));
      else resolve();
    });
    child.on('error', reject);
  });
}

export async function runWorker({ composePath }: WorkerOptions): Promise<void> {
  await spawnAsync('docker', ['compose', '-f', composePath, 'up', '-d']);
  await spawnAsync('docker', ['compose', '-f', composePath, 'wait', 'worker']);
}

export function cleanupWorker({ composePath, tmpTokenPath }: WorkerOptions): void {
  try {

    spawnSync('docker', ['compose', '-f', composePath, 'down', '-v'], { stdio: 'pipe' });
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
      { stdio: 'pipe', encoding: 'utf8' },
    );
    if (ps.status !== 0) return [];

    const containers: Array<{ Service: string; ExitCode: number }> = (ps.stdout as string)
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    return containers
      .filter((c) => c.ExitCode !== 0)
      .map((c) => {
        const logsResult = spawnSync(
          'docker',
          ['compose', '-f', composePath, 'logs', c.Service, '--no-color', '--tail', '50'],
          { stdio: 'pipe', encoding: 'utf8' },
        );
        if (logsResult.status !== 0) {
          return { containerName: c.Service, errorDetails: `exited with code ${c.ExitCode}` };
        }
        const raw = (logsResult.stdout as string).trim() || `exited with code ${c.ExitCode}`;
        return { containerName: c.Service, errorDetails: sanitizeLogs(raw) };
      });
  } catch {
    return [];
  }
}
