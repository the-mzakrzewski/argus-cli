#!/usr/bin/env node
import {program} from 'commander';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {auditCommand} from '../src/commands/audit.js';
import {loginCommand} from '../src/commands/login.js';
import {logoutCommand} from '../src/commands/logout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// At runtime this file is at dist/bin/argus.js, so ../../package.json resolves to the project root
const {version} = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
) as { version: string };

program
    .name('argus')
    .description('ARGUS — SQL Stress-Test Auditor. Your SQL is fast — and we have proof.')
    .version(version);

program.addCommand(auditCommand());
program.addCommand(loginCommand());
program.addCommand(logoutCommand());

program.parse(process.argv);
