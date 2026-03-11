import { Command } from 'commander';
import path from 'node:path';
import chalk from 'chalk';
import { generateCompose, runWorker } from '../lib/docker.js';

export async function audit(ddlPath: string): Promise<void> {
  const composePath = generateCompose({ ddlPath: path.resolve(ddlPath) });

  runWorker({ composePath });

  console.log(chalk.green('Audit complete.'));
}

export function auditCommand(): Command {
  const cmd = new Command('audit');

  cmd
    .description('Run a benchmark audit on a SQL schema')
    .requiredOption('--ddl <path>', 'Path to DDL file')
    .action(async (options: { ddl: string }) => {
      try {
        await audit(options.ddl);
      } catch (err) {
        console.error(chalk.red(`Audit failed: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  return cmd;
}
