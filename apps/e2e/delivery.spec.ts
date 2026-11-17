import { readdirSync, writeFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { SEED } from './stack/paths.mjs';
import { en, expect, expectAccessible, test } from './support';

const DELIVERY = 'studio-delivery';
const section = (page: Page, name: string) => page.getByRole('region', { name });
const releasePath = (context: string, release: { id: string; version: string }) =>
  `/studio/contexts/${context}/releases/${encodeURIComponent(release.id)}/versions/${encodeURIComponent(release.version)}`;

// Acceptance (S10 part 2, issue #123): in a delivery course created from the studio, the import of the seeded release
// proposes a resource for each requirement, the teacher changes one, and the exact selection is sent; the import is
// read in its teacher view and approved; the policy preview is shown in full and installed by the operator, never by
// the browser; activation is proposed and refused in words: the requirement left without a resource (R08). The
// assessment no longer refuses it: the import configures the runtime assessor (S11).
test('a release is imported into a new delivery course, and its activation is refused in words', async ({ page, seed }) => {
  await page.goto(releasePath(seed.authoring_context, seed.release));
  await expect(page.getByTestId('release-verdict')).toHaveText(en.release.ready);
  const delivery = section(page, en.release.delivery.heading);
  await delivery.getByLabel(en.home.courseLabel).fill(DELIVERY);
  await delivery.getByRole('button', { name: en.release.delivery.submit }).click();

  // The import form: each requirement with the resource the release pins, proposed.
  await expect(page.getByRole('heading', { name: en.delivery.import.title, level: 1 })).toBeVisible();
  const requirements = page.getByRole('combobox');
  await expect(requirements).toHaveCount(7);
  for (const select of await requirements.all()) await expect(select).toHaveValue('pinned');
  await expect(page.getByText('7 of 7 requirements get a resource.')).toBeVisible();
  await expectAccessible(page);
  // The teacher leaves the first requirement without a resource.
  await requirements.first().selectOption({ label: en.delivery.import.bindings.none });
  await expect(page.getByText('6 of 7 requirements get a resource.')).toBeVisible();
  await page.getByRole('button', { name: en.delivery.import.submit }).click();
  await expect(page.getByText(en.delivery.import.proposed_other.replace('{{count}}', '6'))).toBeVisible();
  const preview = JSON.parse(await page.getByTestId('policy-preview').textContent() ?? '') as {
    policy_ref: { id: string; version: string }; scopes: Record<string, { contexts: string[] }>;
  };
  expect(preview.policy_ref.id).toBe(`course:${DELIVERY}`);
  expect(preview.scopes[`${DELIVERY}:delivery`]!.contexts).toEqual([DELIVERY]);
  // Proposing installed nothing: the policy directory holds the new course's own policy only.
  const installed = () => readdirSync(`${SEED}${seed.policy_dir}`).filter((name) => name.startsWith(`course-${DELIVERY}`));
  expect(installed()).toEqual([`course-${DELIVERY}-1.json`]);

  // The teacher view of the import: the six resources sent, the policy preview in full; then the decision.
  await page.getByRole('link', { name: en.delivery.import.review }).click();
  await expect(page.locator('.alm-lead strong')).toHaveText(en.review.teacher.titleImport);
  await expect(section(page, en.review.teacher.delivery.heading).getByRole('listitem')
    .filter({ hasText: '→' })).toHaveCount(6);
  // The same policy: the teacher view reads the proposal's canonical copy, whose keys are sorted.
  await expect(page.getByTestId('policy-preview')).toBeVisible();
  expect(JSON.parse(await page.getByTestId('policy-preview').textContent() ?? '')).toEqual(preview);
  await expectAccessible(page);
  await page.getByRole('radio', { name: en.review.decision.approve }).check();
  await page.getByLabel(en.review.decision.reason).fill('Synthetic review of the exact payload');
  await page.getByRole('button', { name: en.review.decision.submit }).click();
  await expect(page.getByTestId('proposal-status')).toHaveText(en.review.status.approved);
  await page.getByRole('button', { name: en.review.apply.submit }).click();
  await expect(page.getByText(/^Import applied\./)).toBeVisible();
  // The applied course names the preview's policy, which is not installed: the course is unavailable.
  await expect(page.getByText(en.review.errors.unavailable)).toBeVisible();
  expect(installed()).toEqual([`course-${DELIVERY}-1.json`]);

  // The operator installs the reviewed preview as a new file (removed with the next test's seed).
  writeFileSync(`${SEED}${seed.policy_dir}/course-${DELIVERY}-${preview.policy_ref.version}.json`,
    `${JSON.stringify(preview, null, 2)}\n`);
  await page.goto(`/studio/contexts/${DELIVERY}/course`);
  await expect(page.getByText(en.course.delivery)).toBeVisible();
  const activation = section(page, en.delivery.activation.heading);
  await activation.getByRole('button', { name: en.delivery.activation.submit }).click();
  const refusals = activation.getByTestId('activation-refusals');
  await expect(refusals).toContainText('(R08)');
  await expect(refusals).not.toContainText('RELEASE_RUNTIME_ROLE');
  await expectAccessible(page);

  // Nothing was recorded: the course is still in preparation, with the six bindings sent.
  const summary = await page.request.get(`/contexts/${DELIVERY}`);
  expect(summary.status(), await summary.text()).toBe(200);
  const fields = (await summary.json() as { context: { fields: Record<string, unknown[] | string> } }).context.fields;
  expect(fields).toMatchObject({ mode: 'PREPARATION', status: 'DRAFT' });
  expect(fields.resourceBindings).toHaveLength(6);
});
