import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../scripts/publish.mjs';

function mock(overrides = {}) {
  const calls = [];
  function run(program, args, options = {}) {
    calls.push({ program, args, options });
    const key = [program, ...args].join(' ');
    if (Object.hasOwn(overrides, key)) return overrides[key];
    if (key === 'gh api user --jq .login') return { code: 0, stdout: 'astrosheep-zero' };
    if (key === 'git symbolic-ref --short HEAD') return { code: 0, stdout: 'main' };
    if (key.startsWith('gh repo view') || key.startsWith('git rev-parse') || key.startsWith('git remote') || key.startsWith('git diff')) return { code: 1, stdout: '' };
    return { code: 0, stdout: '' };
  }
  return { calls, run };
}
test('release defaults to private and targets only the requested repo', () => {
  const m = mock(); assert.equal(publish({ run: m.run, root: '/project' }), 'astrosheep-zero/pi-read-video');
  const create = m.calls.find((c) => c.args[0] === 'repo' && c.args[1] === 'create');
  assert.ok(create.args.includes('--private')); assert.ok(!create.args.includes('--public'));
  assert.ok(m.calls.findIndex((c) => c.args.includes('--test')) < m.calls.indexOf(create));
});
test('release requires explicit opt-in for public visibility', () => {
  const m = mock(); publish({ run: m.run, root: '/project', publicRepository: true });
  assert.ok(m.calls.find((c) => c.args[1] === 'create').args.includes('--public'));
});
test('release refuses another logged-in account before any git changes', () => {
  const m = mock({ 'gh api user --jq .login': { code: 0, stdout: 'somebody-else' } });
  assert.throws(() => publish({ run: m.run }), /Expected GitHub account/);
  assert.ok(!m.calls.some((c) => c.program === 'git'));
});
test('release refuses an existing repo without overwrite', () => {
  const m = mock({ 'gh repo view astrosheep-zero/pi-read-video --json nameWithOwner': { code: 0, stdout: '{}' } });
  assert.throws(() => publish({ run: m.run }), /already exists/);
  assert.ok(!m.calls.some((c) => c.args[1] === 'create'));
});
test('release cannot add files to an ancestor repository', () => {
  const m = mock({ 'git rev-parse --show-toplevel': { code: 0, stdout: '/another' } });
  assert.throws(() => publish({ run: m.run, root: '/project' }), /another Git repository/);
  assert.ok(!m.calls.some((c) => c.args[0] === 'add'));
});
