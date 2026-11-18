import { copyFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { APIRequestContext, Page } from '@playwright/test';

import { LEARNER_APP_HOME, LEARNER_APP_URL, SEED } from './stack/paths.mjs';
import { approveAndApply, en, expect, expectAccessible, learnerEn, test } from './support';

const section = (page: Page, name: string) => page.getByRole('region', { name });

/** Join with a code through the Learner API, behind the learner app's server: the status and the answer. */
async function join(request: APIRequestContext, csrfToken: string, code: string, requestId: string) {
  const response = await request.post(`${LEARNER_APP_URL}/enrolments`, {
    headers: { 'X-CSRF-Token': csrfToken }, data: { request_id: requestId, code },
  });
  return { status: response.status(), body: await response.json() as Record<string, unknown> };
}

// Acceptance (S12b part 2, issue #141, D37): the seed opened its delivery to students (a reviewed policy change). Once
// the operator installs that policy and the administrator activates the delivery, the members page creates the
// course code and shows it with the join link. A person outside the identity map opens the link in the learner app
// (S13), signs in with an automatic key, joins with the code alone and reads the course; the administrator sees them
// as a student, adds a person of the sign-in map at once (no proposal), resets the code (the old one stops working)
// and disables it.
test('a person outside the identity map joins the seeded delivery with its code', async ({ page, browser, seed }) => {
  const delivery = seed.delivery_context;
  copyFileSync(`${SEED}${seed.delivery_policy_preview}`, `${SEED}${seed.policy_dir}/${basename(seed.delivery_policy_preview)}`);
  await page.goto(`/studio/contexts/${delivery}/course`);
  const activation = section(page, en.delivery.activation.heading);
  await activation.getByRole('button', { name: en.delivery.activation.submit }).click();
  await activation.getByRole('link', { name: en.delivery.activation.review }).click();
  await approveAndApply(page);

  // The course is open: the administrator creates its code.
  await page.goto(`/studio/contexts/${delivery}/members`);
  const students = section(page, en.members.students.heading);
  await expect(students.getByText(en.members.students.open)).toBeVisible();
  await expect(students.getByText(en.members.students.noCode)).toBeVisible();
  await students.getByRole('button', { name: en.members.students.create }).click();
  const shown = page.getByTestId('enrolment-code');
  await expect(shown).toHaveText(/^[a-z2-7]{8}$/);
  const code = (await shown.textContent())!;
  const link = `${LEARNER_APP_HOME}/join?code=${code}`;
  await expect(page.getByTestId('join-link')).toHaveText(link);
  await expectAccessible(page);

  // Someone outside the identity map opens the link in a browser of their own and signs in: an automatic key.
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const learner = await other.newPage();
  await learner.goto(link);
  await learner.getByRole('button', { name: learnerEn.session.signIn }).click();
  await learner.locator('#username').fill('dev-unmapped');
  await learner.locator('#password').fill(process.env.ALM_KEYCLOAK_DEV_PASSWORD ?? '');
  await learner.locator('#kc-login').click();
  // Back on the join page with the code of the link: nothing is joined before the learner confirms.
  await expect(learner.getByRole('heading', { level: 1, name: learnerEn.join.title })).toBeVisible();
  await expect(learner.getByLabel(learnerEn.join.code)).toHaveValue(code);
  const session = await (await other.request.get(`${LEARNER_APP_URL}/auth/session`)).json() as {
    subject_key: string; csrf_token: string;
  };
  expect(session.subject_key).toMatch(/^auto-[0-9a-f]{20}$/);
  expect(await (await other.request.get(`${LEARNER_APP_URL}/courses`)).json()).toEqual({ courses: [] });
  await expectAccessible(learner);

  // Joining opens the course: its syllabus, assessments and materials as the learner sees them (D20).
  await learner.getByRole('button', { name: learnerEn.join.submit }).click();
  await expect(learner.getByText(learnerEn.course.joined)).toBeVisible();
  await expect(learner).toHaveURL(new RegExp(`/learn/courses/${delivery}$`));
  await expect(learner.getByRole('region', { name: learnerEn.course.syllabus.heading })).toBeVisible();
  await expect(learner.getByRole('region', { name: learnerEn.course.assessments.heading })).toBeVisible();
  await expectAccessible(learner);
  const title = (await learner.getByRole('heading', { level: 1 }).textContent())!;

  // The course is in My courses.
  await learner.getByRole('link', { name: learnerEn.course.back }).click();
  await expect(learner.getByTestId('course-list').getByRole('link', { name: title })).toBeVisible();
  await expectAccessible(learner);

  // The code alone finds the course, whatever its case and spaces; joining again changes nothing.
  const joined = await join(other.request, session.csrf_token, ` ${code.toUpperCase()} `, 'join-1');
  expect(joined.status, JSON.stringify(joined.body)).toBe(200);
  expect(joined.body).toEqual({ context_id: delivery, title });
  expect(await (await other.request.get(`${LEARNER_APP_URL}/courses`)).json()).toEqual({ courses: [joined.body] });

  // The administrator sees the student and adds a person of the sign-in map at once: no proposal follows.
  await page.reload();
  const members = page.getByTestId('course-members');
  await expect(members).toContainText(`${session.subject_key}: ${en.members.role.LEARNER}`);
  await students.getByLabel(en.members.students.add.person.replace('{{subject}}', 'assessor')).check();
  await students.getByRole('button', { name: en.members.students.add.submit_one }).click();
  await expect(students.getByText(en.members.students.add.added.replace('{{subjects}}', 'assessor'))).toBeVisible();
  await expect(members).toContainText(`assessor: ${en.members.role.LEARNER}`);
  await expect(section(page, en.members.pending.heading)).toHaveCount(0);

  // A reset gives a new code at once: the old one is refused. Disabled, the course has no code.
  await students.getByRole('button', { name: en.members.students.reset }).click();
  await expect(shown).not.toHaveText(code);
  const refused = await join(other.request, session.csrf_token, code, 'join-3');
  expect(refused.status).toBe(404);
  await students.getByRole('button', { name: en.members.students.disable }).click();
  await expect(students.getByText(en.members.students.noCode)).toBeVisible();
  await other.close();
});
