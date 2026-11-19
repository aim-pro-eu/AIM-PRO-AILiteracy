import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import { COURSE, NO_PROGRESS, PROGRESS, SESSION, question, renderLearner } from './harness';

afterEach(cleanup);

const COURSE_PATH = `/courses/${COURSE.context_id}`;
const path = `/learn${COURSE_PATH}/progress`;
const signedIn = () => ({ 'GET /auth/session': [{ status: 200, body: SESSION }] });
const replies = (progress: unknown, questions: unknown[] = []) => ({
  ...signedIn(),
  [`GET ${COURSE_PATH}`]: [{ status: 200, body: COURSE }],
  [`GET ${COURSE_PATH}/progress`]: [{ status: 200, body: progress }],
  [`GET ${COURSE_PATH}/questions`]: [{ status: 200, body: { questions } }],
});
const section = (name: string) => screen.getByRole('region', { name });

describe('progress page (S13 part 2)', () => {
  it('shows the learner\'s attempts, applied evaluations, learning outcomes and questions', async () => {
    await renderLearner(replies(PROGRESS, [question('q-1', {}, { text: 'Where do I start?' })]), path);
    expect(await screen.findByRole('heading', { level: 1, name: en.progress.title })).toBeTruthy();
    expect(screen.getByText(COURSE.title)).toBeTruthy();

    const attempts = section(en.progress.attempts.heading);
    expect(within(attempts).getByText('My synthetic design review.')).toBeTruthy();
    expect(within(attempts).getByRole('link', { name: 'Write a short design review of the case study.' })
      .getAttribute('href')).toBe(`/learn${COURSE_PATH}/activities/a-2`);

    const evaluations = section(en.progress.evaluations.heading);
    expect(within(evaluations).getByRole('heading', {
      name: en.progress.evaluations.title.replace('{{assessment}}', 'Design review rubric')
        .replace('{{mode}}', en.progress.mode.FORMATIVE) })).toBeTruthy();
    const table = within(evaluations).getByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Names the trade-offs' })).toBeTruthy();
    expect(within(table).getByText('Full: All trade-offs')).toBeTruthy();
    expect(within(table).getByText('Synthetic reason: every trade-off named.')).toBeTruthy();
    expect(within(evaluations).getByText(en.progress.evaluations.result.replace('{{result}}', 'Synthetic result: a clear review.')))
      .toBeTruthy();

    const states = section(en.progress.states.heading);
    expect(within(states).getByText('Explain the trade-offs of layered architectures')).toBeTruthy();
    expect(within(states).getByText(en.progress.states.line.replace('{{progress}}', en.progress.states.progress.ACQUIRED)
      .replace('{{verification}}', en.progress.states.verification.UNVERIFIED))).toBeTruthy();

    const questions = section(en.progress.questions.heading);
    expect(within(questions).getByText('Where do I start?')).toBeTruthy();
    expect(within(questions).getByText('Answer to q-1.')).toBeTruthy();
    expect(within(questions).getByRole('link', { name: 'Write a short design review of the case study.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: en.progress.back }).getAttribute('href')).toBe(`/learn${COURSE_PATH}`);
  });

  it('says what is not there yet', async () => {
    await renderLearner(replies(NO_PROGRESS), path);
    await screen.findByRole('heading', { level: 1, name: en.progress.title });
    expect(within(section(en.progress.attempts.heading)).getByText(en.progress.attempts.none)).toBeTruthy();
    expect(within(section(en.progress.evaluations.heading)).getByText(en.progress.evaluations.none)).toBeTruthy();
    expect(within(section(en.progress.states.heading)).getByText(en.progress.states.none)).toBeTruthy();
    expect(within(section(en.progress.questions.heading)).getByText(en.progress.questions.none)).toBeTruthy();
  });

  it('shows a level the assessor did not determine', async () => {
    const evaluation = { ...PROGRESS.evaluations[0]!, judgments: [{ criterion_key: 'tradeoffs', level_key: null,
      reason: 'Synthetic reason: not enough evidence.' }] };
    await renderLearner(replies({ ...PROGRESS, evaluations: [evaluation] }), path);
    const table = within(await screen.findByRole('region', { name: en.progress.evaluations.heading })).getByRole('table');
    expect(within(table).getByText(en.progress.evaluations.notDetermined)).toBeTruthy();
  });

  it('explains why the progress cannot be shown', async () => {
    for (const [status, text] of [[404, en.course.unavailable], [403, en.course.notLearner], [500, en.course.failed]] as const) {
      await renderLearner({ ...signedIn(), [`GET ${COURSE_PATH}`]: [{ status }],
        [`GET ${COURSE_PATH}/progress`]: [{ status }], [`GET ${COURSE_PATH}/questions`]: [{ status }] }, path);
      expect(await screen.findByText(text)).toBeTruthy();
      cleanup();
    }
  });
});
