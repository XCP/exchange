import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentScope, dispatchScope } from './deploy-scope.mjs';

const none = { api: false, web: false, gateway: false };

test('API-only fixes and API manifests cannot redeploy the web or gateway', () => {
  assert.deepEqual(deploymentScope(['apps/api/src/index.ts', 'apps/api/package.json']), { ...none, api: true });
});
test('web edits and the old path of a moved web file redeploy the web', () => {
  assert.deepEqual(deploymentScope(['apps/web/src/app/page.tsx']), { ...none, web: true });
  assert.deepEqual(deploymentScope(['apps/web/old name.ts', 'docs/new name.ts']), { ...none, web: true });
});
test('gateway edits redeploy only the Pages gateway', () => {
  assert.deepEqual(deploymentScope(['apps/counterwallet-gateway/src/index.ts']), { ...none, gateway: true });
  assert.deepEqual(deploymentScope(['apps/counterwallet-gateway/wrangler.toml']), { ...none, gateway: true });
});
test('shared code, dependency locks, and root build configuration deploy everything', () => {
  for (const path of ['package.json', 'package-lock.json', '.npmrc', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'packages/ui/index.ts', 'shared/types.ts', 'libs/math.ts', 'apps/shared/index.ts']) {
    assert.deepEqual(deploymentScope([path]), { api: true, web: true, gateway: true }, path);
  }
});
test('documentation, unrelated apps and workflow edits do not implicitly deploy', () => {
  assert.deepEqual(deploymentScope(['README.md', 'docs/deploy.md', 'docs/counterwallet-dns-cutover.md', '.github/workflows/deploy.yml', 'apps/other/index.ts']), none);
});
test('manual dispatch targets one application or all of them', () => {
  assert.deepEqual(dispatchScope('api'), { ...none, api: true });
  assert.deepEqual(dispatchScope('web'), { ...none, web: true });
  assert.deepEqual(dispatchScope('gateway'), { ...none, gateway: true });
  assert.deepEqual(dispatchScope('all'), { api: true, web: true, gateway: true });
  assert.throws(() => dispatchScope(''), /explicit deployment target/);
  assert.throws(() => dispatchScope('everything'), /explicit deployment target/);
});
