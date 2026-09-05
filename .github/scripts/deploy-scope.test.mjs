import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentScope } from './deploy-scope.mjs';

test('API-only fixes and API manifests cannot redeploy the web', () => {
  assert.deepEqual(deploymentScope(['apps/api/src/index.ts', 'apps/api/package.json']), { api: true, web: false });
});
test('web edits and the old path of a moved web file redeploy the web', () => {
  assert.deepEqual(deploymentScope(['apps/web/src/app/page.tsx']), { api: false, web: true });
  assert.deepEqual(deploymentScope(['apps/web/old name.ts', 'docs/new name.ts']), { api: false, web: true });
});
test('shared code, dependency locks, and root build configuration deploy both', () => {
  for (const path of ['package.json', 'package-lock.json', '.npmrc', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'packages/ui/index.ts', 'shared/types.ts', 'libs/math.ts', 'apps/shared/index.ts']) {
    assert.deepEqual(deploymentScope([path]), { api: true, web: true }, path);
  }
});
test('documentation, unrelated apps and workflow edits do not implicitly deploy', () => {
  assert.deepEqual(deploymentScope(['README.md', 'docs/deploy.md', '.github/workflows/deploy.yml', 'apps/counterwallet-gateway/src/index.ts']), { api: false, web: false });
});
