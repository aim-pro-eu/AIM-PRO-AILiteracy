import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { SEED } from './stack/paths.mjs';
import { approveAndApply, en, expect, expectAccessible, test } from './support';

const DELIVERY = 'synthetic-delivery';
const section = (page: Page, name: string) => page.getByRole('region', { name });

/** The release page says nothing stands in the way, names every approval and lists what the release freezes. */
async function expectReady(page: Page) {
  await expect(page.getByRole('heading', { name: en.release.title, level: 1 })).toBeVisible();
  await expect(page.getByTestId('release-verdict')).toHaveText(en.release.ready);
  const approvals = section(page, en.release.approvals.heading);
  // The release, its project and its five parts, each approved and applied.
  await expect(approvals.getByRole('listitem')).toHaveCount(7);
  await expect(approvals.getByText(/no approval/)).toHaveCount(0);
  await expect(approvals.getByRole('listitem').nth(2)).toContainText('Source: ');
  await expect(section(page, en.release.frozen.heading).locator('details').first()).toBeVisible();
  await expect(section(page, en.release.findings.heading)).toContainText(en.release.findings.none);
}

// Acceptance (S10 part 1, issue #123): a release is proposed from the studio on the course's project, read in its
// teacher view and inspected (receipts, frozen closure, findings); a delivery course is created from the studio.
test('a release is proposed, applied and inspected, and its delivery course is created', async ({ page, seed }) => {
  await page.goto(`/studio/contexts/${seed.authoring_context}/build`);
  const release = section(page, en.build.release.heading);
  await expect(release.getByTestId('sent-refs')).toContainText(`${seed.project.id}:model`);
  await release.getByRole('button', { name: en.build.release.submit }).click();
  await expect(release.getByText(en.build.release.proposed)).toBeVisible();
  await release.getByRole('link', { name: en.build.release.review }).click();

  // The teacher view of the proposed release, then the decision and the application.
  await expect(page.locator('.alm-lead strong')).toHaveText(en.review.teacher.titleRelease);
  await expect(section(page, en.review.teacher.release.heading)).toContainText(en.review.teacher.release.intro);
  await expect(page.getByTestId('course-parts')).toContainText('Assessments:');
  await expectAccessible(page);
  await approveAndApply(page);
  await page.getByRole('link', { name: en.review.teacher.release.inspect }).click();

  await expect(page).toHaveURL(new RegExp(`/studio/contexts/${seed.authoring_context}/releases/[^/]+/versions/[^/]+$`));
  await expectReady(page);
  await expectAccessible(page);

  // The delivery course: a new course in preparation, with a policy for its creator only (D23).
  const delivery = section(page, en.release.delivery.heading);
  await delivery.getByLabel(en.home.courseLabel).fill(DELIVERY);
  await delivery.getByRole('button', { name: en.release.delivery.submit }).click();
  await expect(page).toHaveURL(`/studio/contexts/${DELIVERY}/course`);
  await expect(page.getByText(en.course.notStarted)).toBeVisible();
  const policy = JSON.parse(readFileSync(`${SEED}policies/course-${DELIVERY}-1.json`, 'utf8')) as {
    subjects: Record<string, { actions: Record<string, string[]> }>;
  };
  expect(Object.keys(policy.subjects)).toEqual([seed.staff]);
  expect(Object.keys(policy.subjects[seed.staff]!.actions)).toEqual([DELIVERY]);
  const summary = await page.request.get(`/contexts/${DELIVERY}`);
  expect(summary.status(), await summary.text()).toBe(200);
  expect((await summary.json() as { context: { fields: Record<string, unknown> } }).context.fields)
    .toMatchObject({ mode: 'PREPARATION', status: 'DRAFT', models: [] });
  await expectAccessible(page);

  // The course page lists both releases, the seeded one first; each is inspected on its own page.
  await page.goto(`/studio/contexts/${seed.authoring_context}/course`);
  const releases = section(page, en.course.releases.heading);
  await expect(releases.getByRole('link')).toHaveCount(2);
  await releases.getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`/versions/${seed.release.version}$`));
  await expectReady(page);
});
