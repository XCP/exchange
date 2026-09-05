import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function deploymentScope(paths) {
  const shared = paths.some((path) =>
    /^(packages|shared|libs|apps\/shared)\//.test(path) ||
    /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|tsconfig[^/]*\.json|turbo\.json)$/.test(path));
  return {
    api: shared || paths.some((path) => path.startsWith('apps/api/')),
    web: shared || paths.some((path) => path.startsWith('apps/web/')),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let scope;
  if (process.env.DEPLOY_EVENT === 'workflow_dispatch') {
    const target = process.env.DEPLOY_TARGET;
    if (!['api', 'web', 'all'].includes(target)) throw new Error('Choose an explicit deployment target');
    scope = { api: target !== 'web', web: target !== 'api' };
  } else {
    const before = process.env.DEPLOY_BEFORE;
    const head = process.env.DEPLOY_HEAD;
    if (!/^[0-9a-f]{40}$/.test(before || '') || !/^[0-9a-f]{40}$/.test(head || '')) throw new Error('Missing push revisions');
    // --no-renames reports BOTH old and new names, so moving a file out of
    // apps/web still redeploys the web deletion. NUL separation preserves spaces.
    const args = /^0+$/.test(before)
      ? ['ls-tree', '-r', '--name-only', '-z', head]
      : ['diff', '--name-only', '--no-renames', '-z', before, head];
    const paths = execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);
    scope = deploymentScope(paths);
  }
  if (!process.env.GITHUB_OUTPUT) throw new Error('Missing workflow output file');
  appendFileSync(process.env.GITHUB_OUTPUT, `api=${scope.api}\nweb=${scope.web}\n`);
  console.log(JSON.stringify(scope));
}
