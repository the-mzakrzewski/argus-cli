#!/usr/bin/env node
import { program } from 'commander';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { auditCommand } from '../src/commands/audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// At runtime this file is at dist/bin/argus.js, so ../../package.json resolves to the project root
const { version } = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
) as { version: string };

program
  .name('argus')
  .description('ARGUS — SQL Stress-Test Auditor. Your SQL is fast — and we have proof.')
  .version(version);

program.addCommand(auditCommand());

program.parse(process.argv);
