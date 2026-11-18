import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLIENTS, OUTPUT, SNAPSHOT, check, render, write } from '../scripts/generate.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/generate.mjs', import.meta.url));

async function changedSnapshot(directory: string): Promise<string> {
  const schema = JSON.parse(await readFile(SNAPSHOT, 'utf8'));
  schema.paths['/health'].get.summary = 'Changed without regeneration';
  const path = join(directory, 'authoring.json');
  await writeFile(path, JSON.stringify(schema, null, 2) + '\n', 'utf8');
  return path;
}

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

describe('generated Authoring API client', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'alm-api-client-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('matches the checked-in OpenAPI snapshot', async () => {
    expect(await check(SNAPSHOT, OUTPUT)).toBe(true);
    expect(await readFile(OUTPUT, 'utf8')).toBe(await render(SNAPSHOT));
  });

  it('is one of the two clients, each from its own snapshot', async () => {
    expect(CLIENTS.map(({ name }) => name)).toEqual(['authoring', 'learner']);
    for (const { snapshot, output } of CLIENTS) {
      expect(await check(snapshot, output)).toBe(true);
      expect(await readFile(output, 'utf8')).toContain(`Generated from services/openapi/${basename(fileURLToPath(snapshot))}`);
    }
  });

  it('describes the session and logout views of the snapshot', async () => {
    const text = await readFile(OUTPUT, 'utf8');
    for (const name of ['"/auth/session"', '"/auth/logout"', 'SessionView', 'LogoutView', 'csrf_token']) {
      expect(text).toContain(name);
    }
  });

  it('fails when the snapshot changes without regeneration', async () => {
    const snapshot = await changedSnapshot(directory);
    expect(await check(snapshot, OUTPUT)).toBe(false);
  });

  it('passes again once the client is regenerated', async () => {
    const snapshot = await changedSnapshot(directory);
    const output = join(directory, 'authoring.ts');
    await write(snapshot, output);
    expect(await check(snapshot, output)).toBe(true);
    expect(await readFile(output, 'utf8')).toContain('Changed without regeneration');
  });

  it('fails when the generated client is missing or edited by hand', async () => {
    const output = join(directory, 'authoring.ts');
    expect(await check(SNAPSHOT, output)).toBe(false);
    await writeFile(output, (await render(SNAPSHOT)).replace('csrf_token', 'csrfToken'), 'utf8');
    expect(await check(SNAPSHOT, output)).toBe(false);
  });

  it('exits 1 from the command line on drift and 0 on the snapshot', async () => {
    const drift = runCli('--check', '--schema', await changedSnapshot(directory));
    expect(drift.status).toBe(1);
    expect(drift.stderr).toContain('npm run generate:client');
    const clean = runCli('--check');
    expect(clean.status, clean.stderr).toBe(0);
  });
});

describe('generated Learner API client (S13)', () => {
  const learner = CLIENTS.find(({ name }) => name === 'learner')!;
  const authoring = CLIENTS.find(({ name }) => name === 'authoring')!;
  const paths = async (snapshot: URL) => JSON.parse(await readFile(snapshot, 'utf8')) as {
    paths: Record<string, unknown>; components: { schemas: Record<string, unknown> };
  };

  it('describes the learner routes and none of the authoring ones', async () => {
    const text = await readFile(learner.output, 'utf8');
    for (const name of ['"/enrolments"', '"/courses/{context_id}"', 'JoinRequest', 'CourseView', 'LearnerCourse']) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain('/contexts');
  });

  it('shares the session routes and views with the Authoring API, so one session client serves both apps', async () => {
    const [a, l] = [await paths(authoring.snapshot), await paths(learner.snapshot)];
    for (const route of ['/auth/session', '/auth/logout', '/auth/login']) expect(l.paths[route]).toEqual(a.paths[route]);
    for (const schema of ['SessionView', 'LogoutView', 'ErrorBody', 'ValidationIssue']) {
      expect(l.components.schemas[schema]).toEqual(a.components.schemas[schema]);
    }
  });

  it('is checked by the command line with the authoring client', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alm-api-client-'));
    try {
      const output = join(directory, 'learner.ts');
      const drift = runCli('--check', '--schema', fileURLToPath(learner.snapshot), '--output', output);
      expect(drift.status).toBe(1);
      expect(runCli('--schema', fileURLToPath(learner.snapshot), '--output', output).status).toBe(0);
      expect(await readFile(output, 'utf8')).toBe(await readFile(learner.output, 'utf8'));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
