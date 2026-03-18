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
  refreshToken: string;
}

interface WorkerOptions {
  composePath: string;
}

const COMPOSE_TEMPLATE_PATH = path.join(import.meta.dirname, 'worker-compose.yml');

function toContainerUrl(apiUrl: string): string {
  return apiUrl.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)/, '$1host.docker.internal$3');
}

export function generateCompose({ ddlPath, auditId, apiUrl, authToken, refreshToken }: GenerateComposeOptions): string {
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
    ARGUS_REFRESH_TOKEN: refreshToken,
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
  execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
  execSync(`docker compose -f ${composePath} wait worker`, { stdio: 'inherit' });
}

export function cleanupWorker({ composePath }: WorkerOptions): void {
  try {
    // execSync(`docker compose -f ${composePath} down -v`, { stdio: 'inherit' });
    // fs.unlinkSync(composePath);
  } catch {
    // best-effort cleanup
  }
}
