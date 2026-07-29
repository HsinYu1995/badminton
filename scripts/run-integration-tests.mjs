#!/usr/bin/env node
// Runs every tests/*.test.mjs file in sequence with --env-file=.env.local, stopping
// at the first failure. A plain shell `for` loop in the npm script would only work
// under bash - npm runs scripts via cmd.exe on Windows - so this is the
// cross-platform equivalent used by both local dev and CI.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync('tests')
  .filter((name) => name.endsWith('.test.mjs'))
  .sort();

for (const file of files) {
  const path = `tests/${file}`;
  console.log(`\n> node --env-file=.env.local ${path}`);
  const result = spawnSync(process.execPath, ['--env-file=.env.local', path], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
