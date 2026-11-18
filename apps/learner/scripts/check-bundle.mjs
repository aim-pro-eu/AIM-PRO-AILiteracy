// Check that the learner build contains no authoring code (S13 acceptance).
//
//   node scripts/check-bundle.mjs     after `vite build`; exit 1 with the findings
//
// Two checks over learner/dist/assets: the source maps list no module of the
// studio or of the Authoring API client (the shared packages and the Learner
// API client are allowed), and the scripts name no route that only the Authoring
// API serves (from the two OpenAPI snapshots).

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APPS = fileURLToPath(new URL('../../', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const SNAPSHOTS = fileURLToPath(new URL('../../../services/openapi/', import.meta.url));

/** Modules, relative to apps/, that only the studio needs. */
const AUTHORING_MODULES = [/^studio\//, /^packages\/api-client\/src\/index\.ts$/, /^packages\/api-client\/src\/generated\/authoring\.ts$/];

/** The route templates of the Authoring API that the Learner API does not serve. */
export async function authoringOnlyRoutes(snapshots = SNAPSHOTS) {
  const routes = async (/** @type {string} */ name) =>
    Object.keys(JSON.parse(await readFile(join(snapshots, `${name}.json`), 'utf8')).paths);
  const learner = new Set(await routes('learner'));
  return (await routes('authoring')).filter((route) => !learner.has(route));
}

/**
 * The findings of a build: an empty list when it holds no authoring code.
 * @param {{ apps?: string, dist?: string, snapshots?: string }} [options]
 */
export async function checkBundle({ apps = APPS, dist = DIST, snapshots = SNAPSHOTS } = {}) {
  const assets = join(dist, 'assets');
  const files = (await readdir(assets)).sort();
  const maps = files.filter((file) => file.endsWith('.js.map'));
  if (maps.length === 0) return ['no source map in the build: it cannot be checked'];
  /** @type {string[]} */
  const findings = [];
  for (const map of maps) {
    const { sources = [], sourceRoot = '' } = JSON.parse(await readFile(join(assets, map), 'utf8'));
    for (const source of /** @type {string[]} */ (sources)) {
      const module = relative(apps, resolve(assets, sourceRoot, source)).split('\\').join('/');
      if (AUTHORING_MODULES.some((pattern) => pattern.test(module))) findings.push(`${map} bundles ${module}`);
    }
  }
  const routes = await authoringOnlyRoutes(snapshots);
  for (const script of files.filter((file) => file.endsWith('.js'))) {
    const code = await readFile(join(assets, script), 'utf8');
    const named = routes.filter((route) => code.includes(route));
    // `/contexts/{context_id}/members` names `/contexts/{context_id}` too: only the longer one is reported.
    for (const route of named.filter((route) => !named.some((other) => other !== route && other.startsWith(route)))) {
      findings.push(`${script} names the Authoring API route ${route}`);
    }
  }
  return findings;
}

async function main() {
  const findings = await checkBundle();
  for (const finding of findings) process.stderr.write(`${finding}\n`);
  if (findings.length) {
    process.stderr.write(`The learner build in ${relative(process.cwd(), DIST) || '.'} contains authoring code.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('The learner build contains no authoring code.\n');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
