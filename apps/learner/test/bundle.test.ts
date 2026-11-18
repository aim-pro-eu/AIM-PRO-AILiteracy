// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authoringOnlyRoutes, checkBundle } from '../scripts/check-bundle.mjs';

// The learner build contains no authoring code (S13 acceptance): no module of the studio or of the Authoring API
// client is bundled, and no route only the Authoring API serves is named.
describe('learner bundle check', () => {
  let apps: string;
  let dist: string;

  beforeEach(async () => {
    apps = await mkdtemp(join(tmpdir(), 'alm-learner-bundle-'));
    dist = join(apps, 'learner', 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
  });

  afterEach(async () => {
    await rm(apps, { recursive: true, force: true });
  });

  const build = async (sources: string[], code = 'console.log("/courses/{context_id}");') => {
    await writeFile(join(dist, 'assets', 'index-1.js'), code, 'utf8');
    await writeFile(join(dist, 'assets', 'index-1.js.map'), JSON.stringify({ version: 3, sources, mappings: '' }), 'utf8');
  };

  it('names the routes only the Authoring API serves, never one the Learner API serves', async () => {
    const routes = await authoringOnlyRoutes();
    expect(routes).toContain('/contexts/{context_id}/members');
    expect(routes).not.toContain('/courses');
    expect(routes).not.toContain('/auth/session');
    expect(routes.some((route) => route.startsWith('/enrolments'))).toBe(false);
  });

  it('passes a build of the learner app and the shared packages', async () => {
    await build(['../../src/main.tsx', '../../../packages/ui/src/AppShell.tsx',
      '../../../packages/api-client/src/learner.ts', '../../../node_modules/react/index.js']);
    expect(await checkBundle({ apps, dist })).toEqual([]);
  });

  it('refuses a module of the studio or of the Authoring API client', async () => {
    await build(['../../src/main.tsx', '../../../studio/src/features/review/reviewApi.ts',
      '../../../packages/api-client/src/index.ts', '../../../packages/api-client/src/generated/authoring.ts']);
    expect(await checkBundle({ apps, dist })).toEqual([
      'index-1.js.map bundles studio/src/features/review/reviewApi.ts',
      'index-1.js.map bundles packages/api-client/src/index.ts',
      'index-1.js.map bundles packages/api-client/src/generated/authoring.ts',
    ]);
  });

  it('refuses a route only the Authoring API serves', async () => {
    await build(['../../src/main.tsx'], 'fetch("/contexts/{context_id}/members")');
    expect(await checkBundle({ apps, dist })).toEqual(['index-1.js names the Authoring API route /contexts/{context_id}/members']);
  });

  it('refuses a build without source maps, which it could not check', async () => {
    await writeFile(join(dist, 'assets', 'index-1.js'), '', 'utf8');
    expect(await checkBundle({ apps, dist })).toEqual(['no source map in the build: it cannot be checked']);
  });
});
