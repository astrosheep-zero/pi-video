#!/usr/bin/env node
/** Explicit local release helper. No tokens are requested, read, or stored by this script. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'astrosheep-zero';
const REPO = `${OWNER}/pi-read-video`;
const FILES = ['index.ts', 'src', 'test', 'examples', 'docs', 'scripts', '.github',
  'README.md', 'LICENSE', 'package.json', 'tsconfig.json', 'tsconfig.core.json', '.gitignore', '.editorconfig'];

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT, encoding: 'utf8', stdio: options.inherit ? 'inherit' : 'pipe', shell: false,
  });
  if (result.error) throw new Error(`Cannot run ${program}: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${program} ${args.join(' ')} failed${result.stderr ? `:\n${result.stderr.trim()}` : ''}`);
  }
  return { code: result.status ?? 1, stdout: result.stdout?.trim() ?? '' };
}

/** Exported only for offline release-safety tests. */
export function publish({ run = command, root = ROOT, publicRepository = false } = {}) {
  run('gh', ['auth', 'status', '--hostname', 'github.com']);
  const actor = run('gh', ['api', 'user', '--jq', '.login']).stdout;
  if (actor !== OWNER) throw new Error(`Expected GitHub account ${OWNER}; gh is logged in as ${actor}. Switch accounts before publishing.`);
  const exists = run('gh', ['repo', 'view', REPO, '--json', 'nameWithOwner'], { allowFailure: true });
  if (exists.code === 0) throw new Error(`${REPO} already exists. Inspect it before pushing; this helper will not overwrite an existing repository.`);

  const top = run('git', ['rev-parse', '--show-toplevel'], { allowFailure: true });
  if (top.code === 0 && resolve(top.stdout) !== resolve(root)) {
    throw new Error('This directory is inside another Git repository. Extract the project into its own directory first.');
  }
  if (top.code !== 0) run('git', ['init', '--initial-branch=main']);
  const branch = run('git', ['symbolic-ref', '--short', 'HEAD']).stdout;
  if (branch !== 'main') throw new Error('Use a dedicated main branch for this initial release. No branch was renamed.');
  const origin = run('git', ['remote', 'get-url', 'origin'], { allowFailure: true });
  if (origin.code === 0) throw new Error('An origin remote already exists. Inspect it manually; this helper will not replace it.');
  for (const key of ['user.name', 'user.email']) {
    if (run('git', ['config', '--get', key], { allowFailure: true }).code !== 0) {
      throw new Error(`Configure git ${key} locally before publishing. No GitHub repository has been created.`);
    }
  }
  run(process.execPath, ['--experimental-strip-types', '--test'], { inherit: true });
  run('git', ['add', '--', ...FILES]);
  if (run('git', ['diff', '--cached', '--quiet'], { allowFailure: true }).code !== 0) {
    run('git', ['commit', '-m', 'Initial release: model-driven inline video for Pi']);
  }
  run('gh', ['repo', 'create', REPO, publicRepository ? '--public' : '--private',
    '--description', 'Inline read_video tool for Pi: Kimi Coding and Gemini',
    '--source', root, '--remote', 'origin', '--push'], { inherit: true });
  return REPO;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--public')) {
    console.error('Usage: node scripts/publish.mjs [--public]. Default visibility: private.');
    process.exitCode = 1;
  } else {
    try { console.log(`Published: ${publish({ publicRepository: args.includes('--public') })}`); }
    catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
