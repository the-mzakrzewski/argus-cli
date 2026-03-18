import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

interface GenerateComposeOptions {
  ddlPath: string;
  auditId: string;
  apiUrl: string;
  authToken: string;
}

interface WorkerOptions {
  composePath: string;
}

const COMPOSE_TEMPLATE_PATH = path.join(import.meta.dirname, 'worker-compose.yml');

function toContainerUrl(apiUrl: string): string {
  return apiUrl.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)/, '$1host.docker.internal$3');
}

export function generateCompose({ ddlPath, auditId, apiUrl, authToken }: GenerateComposeOptions): string {
  const runId = Date.now().toString();
  const composePath = path.join(os.tmpdir(), `argus-compose-${runId}.yml`);

  const hostDir = path.resolve(path.dirname(ddlPath));
  const ddlFilename = path.basename(ddlPath);

  let template = fs.readFileSync(COMPOSE_TEMPLATE_PATH, 'utf8').replaceAll('__RUN_ID__', runId);

  const compose = yaml.load(template) as Record<string, unknown>;
  const services = compose.services as Record<string, Record<string, unknown>>;

  const auditEnv = {
    ARGUS_API_URL: toContainerUrl(apiUrl),
    ARGUS_AUDIT_ID: auditId,
    ARGUS_AUTH_TOKEN: authToken,
  };

  const seeder = services.seeder;
  seeder.volumes = [`${hostDir}:/test:ro`];
  Object.assign(seeder.environment as Record<string, string>, { DDL_FILE: `/test/${ddlFilename}`, ...auditEnv });

  const worker = services.worker;
  Object.assign(worker.environment as Record<string, string>, auditEnv);

  fs.writeFileSync(composePath, yaml.dump(compose));
  return composePath;
}

export function runWorker({ composePath }: WorkerOptions): void {
  execSync(`docker compose -f ${composePath} up -d`, { stdio: 'pipe' });
  execSync(`docker compose -f ${composePath} wait worker`, { stdio: 'pipe' });
}

export function cleanupWorker({ composePath }: WorkerOptions): void {
  try {
    execSync(`docker compose -f ${composePath} down -v`, { stdio: 'pipe' });
    fs.unlinkSync(composePath);
  } catch {
    // best-effort cleanup
  }
}

export interface ContainerError {
  containerName: string;
  errorDetails: string;
}

export function getContainerErrors(composePath: string): ContainerError[] {
  try {
    const psOutput = execSync(
      `docker compose -f ${composePath} ps --format json`,
      { stdio: 'pipe', encoding: 'utf8' },
    );
    const containers: Array<{ Service: string; ExitCode: number }> = psOutput
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    return containers
      .filter((c) => c.ExitCode !== 0)
      .map((c) => {
        try {
          const logs = execSync(
            `docker compose -f ${composePath} logs ${c.Service} --no-color --tail 100`,
            { stdio: 'pipe', encoding: 'utf8' },
          );
          return { containerName: c.Service, errorDetails: logs.trim() || `exited with code ${c.ExitCode}` };
        } catch {
          return { containerName: c.Service, errorDetails: `exited with code ${c.ExitCode}` };
        }
      });
  } catch {
    return [];
  }
}
