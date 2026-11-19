import { copyFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { Page } from '@playwright/test';

import { ASSESSOR_STATE, LEARNER_APP_HOME, SEED } from './stack/paths.mjs';
import { approveAndApply, en, expect, expectAccessible, learnerEn, test } from './support';

const ATTEMPT = 'Synthetic attempt from the learner app: a polite reminder to fictional Alex, with two prompting choices.';
const region = (page: Page, name: string) => page.getByRole('region', { name });

// Acceptance (S13 part 2): on the seeded delivery, once the administrator has added an assessor and activated it, the
// seed's learner signs in to the learner app, opens the assessed activity and asks the Socratic coach, then the
// Teacher (an explicit switch, confirmed); the dev worker answers both with synthetic responses. The learner submits
// an attempt, confirmed. The assessor asks the runtime assessor (synthetic) for a draft in the studio, approves and
// applies it; the learner then reads the evaluation, the learning state that followed and their questions in My
// progress.
test('a learner practises, submits an attempt and reads its reviewed evaluation', async ({ page, browser, seed }) => {
  const delivery = seed.delivery_context;
  copyFileSync(`${SEED}${seed.delivery_policy_preview}`, `${SEED}${seed.policy_dir}/${basename(seed.delivery_policy_preview)}`);

  // The administrator adds the assessor (reviewed) and activates the delivery.
  await page.goto(`/studio/contexts/${delivery}/members`);
  await page.getByLabel(en.members.add.role.replace('{{subject}}', 'assessor')).selectOption('ASSESSOR');
  await page.getByRole('button', { name: en.members.add.submit_one }).click();
  await page.getByRole('link', { name: en.members.add.review }).click();
  await approveAndApply(page);
  await page.goto(`/studio/contexts/${delivery}/course`);
  const activation = region(page, en.delivery.activation.heading);
  await activation.getByRole('button', { name: en.delivery.activation.submit }).click();
  await activation.getByRole('link', { name: en.delivery.activation.review }).click();
  await approveAndApply(page);

  // The seed's learner signs in to the learner app in a browser of their own and opens the assessed activity.
  const own = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const learner = await own.newPage();
  await learner.goto(`${LEARNER_APP_HOME}/`);
  await learner.getByRole('button', { name: learnerEn.session.signIn }).click();
  await learner.locator('#username').fill('dev-learner');
  await learner.locator('#password').fill(process.env.ALM_KEYCLOAK_DEV_PASSWORD ?? '');
  await learner.locator('#kc-login').click();
  await learner.getByTestId('course-list').getByRole('link').first().click();
  await expect(learner).toHaveURL(new RegExp(`/learn/courses/${delivery}$`));
  await learner.locator('li.alm-card', { hasText: 'Submit a fictional business reminder prompt' })
    .getByRole('link', { name: learnerEn.course.activity.practise }).click();
  await expect(learner.getByRole('heading', { level: 1 })).toContainText(learnerEn.course.intent.ASSESS);
  await expect(region(learner, learnerEn.practice.questions.heading).getByText(learnerEn.practice.questions.none)).toBeVisible();
  await expectAccessible(learner);

  // The coach answers first; the Teacher only once the learner confirms leaving the coach.
  const questions = region(learner, learnerEn.practice.questions.heading);
  await learner.getByLabel(learnerEn.practice.ask.label).fill('Where do I start?');
  await learner.getByRole('button', { name: learnerEn.practice.ask.coach }).click();
  await expect(questions.getByText(/^Synthetic coach:/)).toBeVisible({ timeout: 30_000 });
  await learner.getByLabel(learnerEn.practice.ask.label).fill('Please explain the two prompting choices.');
  await learner.getByRole('button', { name: learnerEn.practice.ask.teacher }).click();
  await expect(learner.getByText(learnerEn.practice.ask.confirm)).toBeVisible();
  await expectAccessible(learner);
  await learner.getByRole('button', { name: learnerEn.practice.ask.confirmTeacher }).click();
  await expect(questions.getByText(/^Synthetic Teacher:/)).toBeVisible({ timeout: 30_000 });
  await expect(questions.getByRole('listitem')).toHaveCount(2);

  // The attempt is submitted once confirmed, and listed.
  await learner.getByLabel(learnerEn.practice.attempt.label).fill(ATTEMPT);
  await learner.getByRole('button', { name: learnerEn.practice.attempt.submit }).click();
  await learner.getByRole('button', { name: learnerEn.practice.attempt.confirmSubmit }).click();
  await expect(learner.getByText(learnerEn.practice.attempt.submitted)).toBeVisible();
  await expect(region(learner, learnerEn.practice.attempts.heading).getByText(ATTEMPT)).toBeVisible();
  await expectAccessible(learner);

  // The assessor finds the attempt in the studio, asks for a formative draft, approves and applies it.
  const staff = await browser.newContext({ storageState: ASSESSOR_STATE });
  const assessor = await staff.newPage();
  await assessor.goto(`/studio/contexts/${delivery}/course`);
  await assessor.getByRole('link', { name: en.course.assess }).click();
  const attempts = assessor.getByTestId('assessed-attempts');
  await expect(attempts.getByRole('listitem')).toHaveCount(1);
  await expect(attempts).toContainText(ATTEMPT);
  await attempts.getByRole('radio', { name: en.assess.mode.FORMATIVE }).check();
  await attempts.getByRole('button', { name: en.assess.submit }).click();
  await expect(attempts.getByText(en.assess.status.proposed)).toBeVisible({ timeout: 30_000 });
  await attempts.getByRole('link', { name: en.assess.review }).click();
  await approveAndApply(assessor);
  await staff.close();

  // The learner reads the applied evaluation, the learning state it gave and their questions in My progress.
  await learner.getByRole('link', { name: learnerEn.practice.progress }).click();
  await expect(learner.getByRole('heading', { level: 1, name: learnerEn.progress.title })).toBeVisible();
  await expect(region(learner, learnerEn.progress.attempts.heading).getByText(ATTEMPT)).toBeVisible();
  const evaluations = region(learner, learnerEn.progress.evaluations.heading);
  await expect(evaluations.getByRole('heading', { level: 3 })).toContainText(learnerEn.progress.mode.FORMATIVE);
  await expect(evaluations.getByText('Synthetic judgment: the response meets this level descriptor.').first()).toBeVisible();
  await expect(evaluations.getByText(learnerEn.progress.evaluations.result
    .replace('{{result}}', 'Synthetic draft evaluation for the assessor to decide.'))).toBeVisible();
  await expect(region(learner, learnerEn.progress.states.heading).getByRole('listitem')).toHaveCount(1);
  await expect(region(learner, learnerEn.progress.questions.heading).getByRole('listitem')).toHaveCount(2);
  await expectAccessible(learner);
  await own.close();
});
