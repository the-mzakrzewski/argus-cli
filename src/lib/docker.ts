import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

interface GenerateComposeOptions {
  ddlPath: string;
}

interface WorkerOptions {
  composePath: string;
}

const COMPOSE_TEMPLATE_PATH = path.join(import.meta.dirname, 'worker-compose.yml');

export function generateCompose({ ddlPath }: GenerateComposeOptions): string {
  const runId = Date.now().toString();
  const composePath = path.join(os.tmpdir(), `argus-compose-${runId}.yml`);

  const hostDir = path.resolve(path.dirname(ddlPath));
  const ddlFilename = path.basename(ddlPath);

  let template = fs.readFileSync(COMPOSE_TEMPLATE_PATH, 'utf8').replaceAll('__RUN_ID__', runId);

  const compose = yaml.load(template) as Record<string, unknown>;
  const worker = (compose.services as Record<string, unknown>).worker as Record<string, unknown>;
  (worker.environment as Record<string, string>).DDL_FILE = `/test/${ddlFilename}`;
  (worker.volumes as string[])[0] = `${hostDir}:/test:ro`;

  fs.writeFileSync(composePath, yaml.dump(compose));
  return composePath;
}

export function runWorker({ composePath }: WorkerOptions): void {
  execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
  execSync(`docker compose -f ${composePath} wait worker`, { stdio: 'inherit' });
}

export function cleanupWorker({ composePath }: WorkerOptions): void {
  try {
    execSync(`docker compose -f ${composePath} down -v`, { stdio: 'inherit' });
    fs.unlinkSync(composePath);
  } catch {
    // best-effort cleanup
  }
}
