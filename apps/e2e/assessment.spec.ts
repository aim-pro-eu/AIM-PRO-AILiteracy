import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { Page } from '@playwright/test';

import { ASSESSOR_STATE, ROOT, SEED, TELEMETRY_OFF, python } from './stack/paths.mjs';
import { approveAndApply, en, expect, expectAccessible, test } from './support';

const section = (page: Page, name: string) => page.getByRole('region', { name });

// Acceptance (S11, issue #129): the administrator of the seeded delivery adds an assessor from the studio (D25) and
// activates the delivery in the browser (proposed, decided, applied): the import configured the runtime assessor, so
// D4 no longer refuses it. The seed records the learner's synthetic attempt through submit (dev only, D15). The
// assessor, signed in as themselves, sees the attempt, asks the runtime assessor (synthetic model) for a draft, reads
// it in plain words, decides and applies it; only then does a learning state follow.
test('an assessor added from the studio evaluates the seeded attempt with the runtime assessor', async ({ page, browser, seed }) => {
  const delivery = seed.delivery_context;
  // The operator installs the reviewed import preview of the seeded delivery, as in S10.
  copyFileSync(`${SEED}${seed.delivery_policy_preview}`, `${SEED}${seed.policy_dir}/${basename(seed.delivery_policy_preview)}`);

  // The administrator adds the assessor: a new policy version and a participant, proposed, approved and applied.
  await page.goto(`/studio/contexts/${delivery}/course`);
  await page.getByRole('link', { name: en.course.members }).click();
  await page.getByLabel(en.members.add.subject).selectOption('assessor');
  await page.getByLabel(en.members.add.role).selectOption('ASSESSOR');
  await page.getByRole('button', { name: en.members.add.submit }).click();
  await page.getByRole('link', { name: en.members.add.review }).click();
  await expect(page.locator('.alm-lead strong')).toHaveText(en.review.teacher.titleMembership);
  await approveAndApply(page);

  // The administrator activates the delivery: nothing refuses it any more.
  await page.goto(`/studio/contexts/${delivery}/course`);
  const activation = section(page, en.delivery.activation.heading);
  await activation.getByRole('button', { name: en.delivery.activation.submit }).click();
  await activation.getByRole('link', { name: en.delivery.activation.review }).click();
  await approveAndApply(page);
  const active = await page.request.get(`/contexts/${delivery}`);
  expect(active.status(), await active.text()).toBe(200);
  expect((await active.json() as { context: { fields: Record<string, unknown> } }).context.fields)
    .toMatchObject({ mode: 'LEARNING', status: 'ACTIVE' });

  // The learner's synthetic attempt at the assessment, recorded by the seed through submit.
  const attempt = spawnSync(python(), ['-m', 'tests.seed', '--output', SEED, '--attempt'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...TELEMETRY_OFF },
  });
  expect(attempt.status, attempt.stderr).toBe(0);

  // The assessor, in their own session, finds the attempt from the course page and asks for a formative draft.
  const session = await browser.newContext({ storageState: ASSESSOR_STATE });
  const assessor = await session.newPage();
  await assessor.goto(`/studio/contexts/${delivery}/course`);
  await assessor.getByRole('link', { name: en.course.assess }).click();
  await expect(assessor.getByRole('heading', { name: en.assess.title, level: 1 })).toBeVisible();
  const attempts = assessor.getByTestId('assessed-attempts');
  await expect(attempts.getByRole('listitem')).toHaveCount(1);
  await expect(attempts).toContainText('Synthetic attempt: write a polite reminder to fictional Alex');
  await expectAccessible(assessor);
  await attempts.getByRole('radio', { name: en.assess.mode.FORMATIVE }).check();
  await attempts.getByRole('button', { name: en.assess.submit }).click();
  await expect(attempts.getByText(en.assess.status.proposed)).toBeVisible({ timeout: 30_000 });
  await attempts.getByRole('link', { name: en.assess.review }).click();

  // The draft in plain words: the agent that drafted it, the attempt, each criterion and the result; then decided.
  await expect(assessor.locator('.alm-lead strong')).toHaveText(en.review.teacher.titleEvaluation);
  await expect(assessor.getByTestId('evaluation-intro')).toContainText('learner-response-evaluator');
  await expect(assessor.getByTestId('evaluation-intro')).toContainText(en.review.teacher.evaluation.mode.FORMATIVE);
  await expect(assessor.getByTestId('evaluation-response')).toContainText('Synthetic attempt');
  await expect(assessor.getByTestId('evaluation-judgments').getByRole('listitem')).toHaveCount(1);
  await expect(assessor.getByTestId('evaluation-result')).not.toBeEmpty();
  await expectAccessible(assessor);
  const before = await assessor.request.get(`/contexts/${delivery}`);
  expect(before.status(), await before.text()).toBe(200);
  expect((await before.json() as { context: { fields: { learningStates: unknown[] } } }).context.fields.learningStates)
    .toEqual([]);
  await approveAndApply(assessor);

  // The applied evaluation, with the human decision, is the only basis of the learner's state.
  const after = await assessor.request.get(`/contexts/${delivery}`);
  expect(after.status(), await after.text()).toBe(200);
  const summary = await after.json() as { context: { fields: { learningStates: unknown[] } };
    entities: { type: string; fields: Record<string, unknown> }[] };
  expect(summary.context.fields.learningStates).toHaveLength(1);
  const evaluations = summary.entities.filter((entity) => entity.type === 'Evaluation');
  expect(evaluations).toHaveLength(1);
  expect(evaluations[0]!.fields).toMatchObject({ mode: 'FORMATIVE', humanDecision: expect.anything() });
  await session.close();
});
