import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUPPORTED_SUITES = new Set(['unit', 'integration', 'regression']);
const suite = process.argv[2];
const namePattern = process.argv.slice(3).filter((value) => value !== '--').join(' ').trim();

if (!SUPPORTED_SUITES.has(suite)) {
  console.error('Usage: node tests/hrm/run.mjs <unit|integration|regression> [name-pattern]');
  process.exit(2);
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const suiteDirectory = join(currentDirectory, suite);

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return collectTests(entryPath);
      return entry.isFile() && entry.name.endsWith('.test.ts') ? [entryPath] : [];
    })
    .sort();
}

const testFiles = collectTests(suiteDirectory);
if (testFiles.length === 0) {
  console.error(`No HRM ${suite} tests found.`);
  process.exit(2);
}

const nodeArguments = ['--import', 'tsx'];
if (suite === 'integration') {
  nodeArguments.push(
    '--import',
    pathToFileURL(resolve(currentDirectory, 'helpers/integrationPreflight.ts')).href,
  );
}
nodeArguments.push('--test');
if (namePattern) nodeArguments.push(`--test-name-pattern=${namePattern}`);
nodeArguments.push(...testFiles);

const result = spawnSync(process.execPath, nodeArguments, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
