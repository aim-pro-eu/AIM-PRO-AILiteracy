// Generate, or check, the typed API clients from the OpenAPI snapshots: the Authoring API (the studio) and the
// Learner API (the learner app, S13).
//
//   node scripts/generate.mjs            rewrite src/generated/authoring.ts and learner.ts for review
//   node scripts/generate.mjs --check    exit 1 when a client differs from its snapshot
//
// --schema and --output select one other pair of files (used by the tests).

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import openapiTS, { astToString } from 'openapi-typescript';

/** @param {string} name */
const client = (name) => ({
  name,
  snapshot: new URL(`../../../../services/openapi/${name}.json`, import.meta.url),
  output: new URL(`../src/generated/${name}.ts`, import.meta.url),
});
const AUTHORING = client('authoring');
/** Each client and the snapshot it is generated from. */
export const CLIENTS = [AUTHORING, client('learner')];
export const SNAPSHOT = AUTHORING.snapshot;
export const OUTPUT = AUTHORING.output;

/** @typedef {string | URL} Location */

/** @param {Location} snapshot */
const header = (snapshot) => `// Generated from services/openapi/${basename(snapshot instanceof URL ? fileURLToPath(snapshot) : snapshot)} by
// apps/packages/api-client/scripts/generate.mjs. Do not edit; run
// \`npm run generate:client\` in apps/ after the snapshot changes.

`;

/**
 * The client source for a snapshot: the same snapshot always gives the same text.
 * @param {Location} [snapshot]
 */
export async function render(snapshot = SNAPSHOT) {
  const schema = JSON.parse(await readFile(snapshot, 'utf8'));
  return header(snapshot) + astToString(await openapiTS(schema, { alphabetize: true }));
}

/**
 * True when the client at `output` is exactly the one `snapshot` generates.
 * @param {Location} [snapshot]
 * @param {Location} [output]
 */
export async function check(snapshot = SNAPSHOT, output = OUTPUT) {
  let current;
  try {
    current = await readFile(output, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return false;
    throw error;
  }
  return current === await render(snapshot);
}

/**
 * @param {Location} [snapshot]
 * @param {Location} [output]
 */
export async function write(snapshot = SNAPSHOT, output = OUTPUT) {
  await writeFile(output, await render(snapshot), 'utf8');
}

async function main() {
  const { values } = parseArgs({
    options: { check: { type: 'boolean' }, schema: { type: 'string' }, output: { type: 'string' } },
  });
  const pairs = values.schema || values.output
    ? [{ snapshot: values.schema ?? SNAPSHOT, output: values.output ?? OUTPUT }]
    : CLIENTS;
  for (const { snapshot, output } of pairs) {
    if (!values.check) {
      await write(snapshot, output);
    } else if (!await check(snapshot, output)) {
      process.stderr.write(`The generated API client ${basename(String(output))} differs from its OpenAPI snapshot; `
        + 'run `npm run generate:client` in apps/ and review the result.\n');
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
