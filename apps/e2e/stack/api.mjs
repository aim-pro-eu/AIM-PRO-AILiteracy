// Start the Authoring API and the Learner API for the browser tests on a new synthetic seed (D15).
//
//   ALM_OIDC_CLIENT_SECRET=... node e2e/stack/api.mjs
//
// Removes e2e/.state, builds the seed with `python -m tests.seed`, keeps a copy
// of its database for the tests to restore, and runs the API on 127.0.0.1:58001
// against the local Keycloak realm alm-dev (compose.identity.yml), as the
// "With the studio" smoke test in docs/architecture/role-applications.md does.
// Next to it runs the dev-only agent worker with synthetic models
// (`python -m tests.synthetic_worker`): no model, provider or network. The
// Learner API runs on 127.0.0.1:58002 with the realm's client alm-learner-api,
// whose callback is the learner app's (127.0.0.1:58003, S13); it is ready before
// the Authoring API starts, whose health the tests wait for.

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

import {
  API_PORT, COURSE_TEMPLATE, DATABASE, EXPORTS, ISSUER, JOBS, LEARNER_API_PORT, LEARNER_API_URL, LEARNER_APP_URL, PRISTINE,
  ROOT, SEED, STATE, STUDIO_URL, TELEMETRY_OFF, python,
} from './paths.mjs';

if (!process.env.ALM_OIDC_CLIENT_SECRET) {
  process.stderr.write('Set ALM_OIDC_CLIENT_SECRET to the secret the local Keycloak realm was started with.\n');
  process.exit(2);
}

rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });
const seed = spawnSync(python(), ['-m', 'tests.seed', '--output', SEED], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...TELEMETRY_OFF },
});
if (seed.status !== 0) process.exit(seed.status ?? 1);
copyFileSync(DATABASE, PRISTINE);
mkdirSync(EXPORTS);
// The seed's staff subject may create courses; a new course may search the synthetic corpus scope.
writeFileSync(COURSE_TEMPLATE, JSON.stringify({ format: 1, creators: ['admin'], source_scopes: { wp3: ['wp3'] } }));

const shared = {
  ALM_STORE: DATABASE,
  ALM_POLICY_DIR: `${SEED}policies`,
  ALM_JOBS_STORE: JOBS,
  ALM_AIMPRO_EXPORTS: EXPORTS,
};
// Both APIs sign people in through the local realm, with the same identity map and course-code secret.
const identity = {
  ALM_OIDC_ISSUER: ISSUER,
  ALM_IDENTITY_MAP: `${ROOT}infra/keycloak/identity-map.dev.json`,
  ALM_API_COOKIE_SECURE: 'false',
  // Course codes (S12b) are derived from it; a fixed value for the throwaway browser-test state only.
  ALM_ENROLMENT_SECRET: 'browser-tests-only-synthetic-enrolment-secret',
};
/** @type {import('node:child_process').ChildProcess[]} */
const processes = [];
/**
 * Start one process of the stack from the repository root; any of them ending ends the stack.
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
function start(args, env) {
  const child = spawn(python(), args, {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...TELEMETRY_OFF, ...shared, ...env },
  });
  processes.push(child);
  child.on('exit', (code, signal) => {
    for (const other of processes) if (other !== child) other.kill('SIGTERM');
    process.exit(code ?? (signal ? 1 : 0));
  });
}
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => {
    for (const child of processes) child.kill(signal);
  });
}

start(['-m', 'tests.synthetic_worker', '--poll', '0.2'], {});
start(['-m', 'services.learner_api', '--port', String(LEARNER_API_PORT)], {
  ...identity,
  ALM_OIDC_CLIENT_ID: 'alm-learner-api',
  ALM_OIDC_REDIRECT_URI: `${LEARNER_APP_URL}/auth/callback`,
  ALM_OIDC_POST_LOGOUT_REDIRECT_URI: `${LEARNER_APP_URL}/`,
});
// The tests wait for the Authoring API alone: it starts once the Learner API answers.
for (let tries = 0; ; tries += 1) {
  try {
    if ((await fetch(`${LEARNER_API_URL}/health`)).ok) break;
  } catch {
    // Not listening yet.
  }
  if (tries > 600) {
    process.stderr.write('The Learner API did not start.\n');
    for (const child of processes) child.kill('SIGTERM');
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
start(['-m', 'services.authoring_api', '--port', String(API_PORT)], {
  ...identity,
  ALM_COURSE_TEMPLATE: COURSE_TEMPLATE,
  ALM_OIDC_CLIENT_ID: 'alm-authoring-api',
  ALM_OIDC_REDIRECT_URI: `${STUDIO_URL}/auth/callback`,
  ALM_OIDC_POST_LOGOUT_REDIRECT_URI: `${STUDIO_URL}/`,
});
