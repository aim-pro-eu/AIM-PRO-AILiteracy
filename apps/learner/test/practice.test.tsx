import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import { COURSE, EVIDENCE, NO_PROGRESS, PROGRESS, SESSION, question, renderLearner } from './harness';

afterEach(cleanup);

const COURSE_PATH = `/courses/${COURSE.context_id}`;
const A2 = { type: 'ActivityDefinition', id: 'a-2', version: '1' };
const STILL_SOCRATIC = 'The problem remains in Socratic mode; switching requires an explicit choice.';

// A new queue per render: replies are consumed.
const signedIn = () => ({ 'GET /auth/session': [{ status: 200, body: SESSION }] });
/** The replies the practice page reads first: the course, the learner's records and questions. */
const opened = (progress: unknown = NO_PROGRESS, questions: unknown[] = []) => ({
  ...signedIn(),
  [`GET ${COURSE_PATH}`]: [{ status: 200, body: COURSE }],
  [`GET ${COURSE_PATH}/progress`]: [{ status: 200, body: progress }],
  [`GET ${COURSE_PATH}/questions`]: [{ status: 200, body: { questions } }],
});
const practise = (activity = 'a-2') => `/learn${COURSE_PATH}/activities/${activity}`;
const section = (name: string) => screen.getByRole('region', { name });
const loaded = () => screen.findByRole('heading', { level: 1, name: 'Assessment: Design review' });
const posts = (requests: Request[], path: string) => requests.filter((r) => r.method === 'POST' && r.url.endsWith(path));

describe('course view links (S13 part 2)', () => {
  it('links every activity to its practice page and the course to the learner\'s progress', async () => {
    await renderLearner({ ...signedIn(), [`GET ${COURSE_PATH}`]: [{ status: 200, body: COURSE }] }, `/learn${COURSE_PATH}`);
    await screen.findByRole('heading', { level: 1, name: COURSE.title });
    const links = screen.getAllByRole('link', { name: en.course.activity.practise });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([practise('a-1'), practise('a-2')]);
    expect(screen.getByRole('link', { name: en.course.progress }).getAttribute('href')).toBe(`/learn${COURSE_PATH}/progress`);
  });
});

describe('practice page (S13 part 2)', () => {
  it('shows the activity and, for an assessed activity, the attempt form', async () => {
    await renderLearner(opened(), practise());
    expect(await screen.findByRole('heading', { level: 1, name: 'Assessment: Design review' })).toBeTruthy();
    const task = section(en.practice.task.heading);
    expect(within(task).getByText('Write a short design review of the case study.')).toBeTruthy();
    expect(within(task).getByText(en.course.activity.evidence.replace('{{evidence}}', 'A design review'))).toBeTruthy();
    expect(within(task).getByRole('link', { name: en.course.activity.assessment }).getAttribute('href'))
      .toBe(`/learn${COURSE_PATH}#assessment-as-1`);
    expect(screen.getByLabelText(en.practice.attempt.label)).toBeTruthy();
    expect(within(section(en.practice.attempts.heading)).getByText(en.practice.attempts.none)).toBeTruthy();
    expect(within(section(en.practice.questions.heading)).getByText(en.practice.questions.none)).toBeTruthy();
    expect(screen.getByRole('link', { name: en.practice.back }).getAttribute('href')).toBe(`/learn${COURSE_PATH}`);
  });

  it('offers no attempt form for an explanation, only questions', async () => {
    await renderLearner(opened(), practise('a-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Explanation: Layers and tiers' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Layered architectures' }).getAttribute('href')).toBe('https://example.org/layers');
    expect(screen.queryByLabelText(en.practice.attempt.label)).toBeNull();
    expect(screen.getByLabelText(en.practice.ask.label)).toBeTruthy();
  });

  it('says when the course has no such activity', async () => {
    await renderLearner(opened(), practise('no-such-activity'));
    expect(await screen.findByText(en.practice.missing)).toBeTruthy();
  });

  it('submits an attempt only once the learner confirms, then lists it', async () => {
    const { requests } = await renderLearner({
      ...opened(),
      [`POST ${COURSE_PATH}/attempts`]: [{ status: 200, body: EVIDENCE }],
      [`GET ${COURSE_PATH}/progress`]: [{ status: 200, body: NO_PROGRESS }, { status: 200, body: PROGRESS }],
    }, practise());
    const field = await screen.findByLabelText(en.practice.attempt.label);
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.submit }));
    expect(await screen.findByText(en.practice.attempt.empty)).toBeTruthy();

    fireEvent.change(field, { target: { value: 'My synthetic design review.' } });
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.submit }));
    expect(screen.getByText(en.practice.attempt.confirm)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.keepEditing }));
    expect(screen.queryByText(en.practice.attempt.confirm)).toBeNull();
    expect(posts(requests, '/attempts')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.submit }));
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.confirmSubmit }));
    expect(await screen.findByText(en.practice.attempt.submitted)).toBeTruthy();
    const post = posts(requests, '/attempts')[0]!;
    expect(post.headers.get('X-CSRF-Token')).toBe('csrf-1');
    expect(await post.json()).toEqual({ request_id: 'request-1', activity: A2, content: 'My synthetic design review.' });
    expect((screen.getByLabelText(en.practice.attempt.label) as HTMLTextAreaElement).value).toBe('');
    const attempts = section(en.practice.attempts.heading);
    expect(await within(attempts).findByText('My synthetic design review.')).toBeTruthy();
    expect(within(attempts).getByText(en.practice.attempts.evaluated.replace('{{mode}}', en.progress.mode.FORMATIVE)))
      .toBeTruthy();
  });

  it('sends the same request id when the same attempt is retried, a new one for another text', async () => {
    const { requests } = await renderLearner({
      ...opened(), [`POST ${COURSE_PATH}/attempts`]: ['network', 'network', 'network'],
    }, practise());
    const field = await screen.findByLabelText(en.practice.attempt.label);
    const send = () => {
      fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.submit }));
      fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.confirmSubmit }));
    };
    fireEvent.change(field, { target: { value: 'First text' } });
    send();
    expect(await screen.findByText(en.practice.attempt.failed)).toBeTruthy();
    send();
    await waitFor(() => expect(posts(requests, '/attempts')).toHaveLength(2));
    await screen.findByText(en.practice.attempt.failed);
    fireEvent.change(field, { target: { value: 'Second text' } });
    send();
    await waitFor(() => expect(posts(requests, '/attempts')).toHaveLength(3));
    const ids = await Promise.all(posts(requests, '/attempts').map(async (r) => (await r.json()).request_id));
    expect(ids).toEqual(['request-1', 'request-1', 'request-2']);
  });

  it('sends a new request id for the same text once the first attempt was recorded', async () => {
    const { requests } = await renderLearner({
      ...opened(),
      [`POST ${COURSE_PATH}/attempts`]: [{ status: 200, body: EVIDENCE }, { status: 200, body: EVIDENCE }],
      [`GET ${COURSE_PATH}/progress`]: [{ status: 200, body: NO_PROGRESS }, { status: 200, body: PROGRESS },
        { status: 200, body: PROGRESS }],
    }, practise());
    for (let round = 0; round < 2; round += 1) {
      fireEvent.change(await screen.findByLabelText(en.practice.attempt.label), { target: { value: 'Same text' } });
      fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.submit }));
      fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.confirmSubmit }));
      await waitFor(() => expect((screen.getByLabelText(en.practice.attempt.label) as HTMLTextAreaElement).value).toBe(''));
    }
    const ids = await Promise.all(posts(requests, '/attempts').map(async (r) => (await r.json()).request_id));
    expect(ids).toEqual(['request-1', 'request-2']);
  });

  it('says in words why an attempt was refused', async () => {
    await renderLearner({
      ...opened(),
      [`POST ${COURSE_PATH}/attempts`]: [
        { status: 422, body: { error: 'validation', detail: 'Activity is not ready', request_id: 'r' } },
        { status: 409, body: { error: 'conflict', detail: 'x', request_id: 'r' } },
      ],
    }, practise());
    fireEvent.change(await screen.findByLabelText(en.practice.attempt.label), { target: { value: 'Text' } });
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.submit }));
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.confirmSubmit }));
    expect(await screen.findByText(en.practice.attempt.refused.replace('{{detail}}', 'Activity is not ready'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.submit }));
    fireEvent.click(screen.getByRole('button', { name: en.practice.attempt.confirmSubmit }));
    expect(await screen.findByText(en.practice.attempt.conflict)).toBeTruthy();
  });

  it('asks the coach about the activity and follows the question until it is answered', async () => {
    const queued = question('request-1', { status: 'QUEUED', response: null }, { text: 'Where do I start?' });
    const running = { ...queued, status: 'RUNNING' };
    const answered = question('request-1', {}, { text: 'Where do I start?' });
    const { requests } = await renderLearner({
      ...opened(),
      [`POST ${COURSE_PATH}/questions`]: [{ status: 200, body: queued }],
      [`GET ${COURSE_PATH}/questions`]: [{ status: 200, body: { questions: [] } },
        { status: 200, body: { questions: [running] } }, { status: 200, body: { questions: [answered] } }],
    }, practise());
    const field = await screen.findByLabelText(en.practice.ask.label);
    fireEvent.click(screen.getByRole('button', { name: en.practice.ask.coach }));
    expect(await screen.findByText(en.practice.ask.empty)).toBeTruthy();
    fireEvent.change(field, { target: { value: 'Where do I start?' } });
    fireEvent.click(screen.getByRole('button', { name: en.practice.ask.coach }));
    const listed = section(en.practice.questions.heading);
    expect(await within(listed).findByText('Answer to request-1.')).toBeTruthy();
    expect(within(listed).getByText('Where do I start?')).toBeTruthy();
    expect(within(listed).getByText(en.practice.questions.toCoach, { exact: false })).toBeTruthy();
    const post = posts(requests, '/questions')[0]!;
    expect(post.headers.get('X-CSRF-Token')).toBe('csrf-1');
    expect(await post.json()).toEqual({ request_id: 'request-1', question: {
      text: 'Where do I start?', intent: 'SOCRATIC_GUIDANCE', problem_key: 'a-2', activities: [A2],
      switch_from_socratic: false } });
    expect((screen.getByLabelText(en.practice.ask.label) as HTMLTextAreaElement).value).toBe('');
  });

  it('shows a question still waiting, and follows it until its run ends', async () => {
    const waiting = question('q-1', { status: 'QUEUED', response: null });
    await renderLearner({
      ...opened(NO_PROGRESS, [waiting]),
      [`GET ${COURSE_PATH}/questions`]: [{ status: 200, body: { questions: [waiting] } },
        { status: 200, body: { questions: [{ ...waiting, status: 'FAILED' }] } }],
    }, practise());
    await loaded();
    const listed = section(en.practice.questions.heading);
    expect(await within(listed).findByText(en.practice.questions.queued)).toBeTruthy();
    expect(await within(listed).findByText(en.practice.questions.failed)).toBeTruthy();
  });

  it('asks the Teacher directly when the coach is not guiding the activity', async () => {
    const asked = question('request-1', { status: 'QUEUED', response: null },
      { text: 'Explain layers', intent: 'EXPLAIN' });
    const { requests } = await renderLearner({
      ...opened(),
      [`POST ${COURSE_PATH}/questions`]: [{ status: 200, body: asked }],
      [`GET ${COURSE_PATH}/questions`]: [{ status: 200, body: { questions: [] } },
        { status: 200, body: { questions: [{ ...asked, status: 'COMPLETED', response: question('x').response }] } }],
    }, practise());
    fireEvent.change(await screen.findByLabelText(en.practice.ask.label), { target: { value: 'Explain layers' } });
    fireEvent.click(screen.getByRole('button', { name: en.practice.ask.teacher }));
    expect(screen.queryByText(en.practice.ask.confirm)).toBeNull();
    await waitFor(() => expect(posts(requests, '/questions')).toHaveLength(1));
    expect((await posts(requests, '/questions')[0]!.json()).question).toMatchObject(
      { intent: 'EXPLAIN', switch_from_socratic: false, problem_key: 'a-2' });
    expect(await within(section(en.practice.questions.heading)).findByText(en.practice.questions.toTeacher, { exact: false }))
      .toBeTruthy();
  });

  it('asks the learner to confirm leaving the coach, then switches explicitly', async () => {
    const coached = question('q-1');
    const asked = question('request-1', { status: 'QUEUED', response: null },
      { text: 'Just tell me', intent: 'EXPLAIN', switch_from_socratic: true });
    const { requests } = await renderLearner({
      ...opened(NO_PROGRESS, [coached]),
      [`POST ${COURSE_PATH}/questions`]: [{ status: 200, body: asked }],
      [`GET ${COURSE_PATH}/questions`]: [{ status: 200, body: { questions: [coached] } },
        { status: 200, body: { questions: [{ ...asked, status: 'COMPLETED', response: question('x').response }, coached] } }],
    }, practise());
    fireEvent.change(await screen.findByLabelText(en.practice.ask.label), { target: { value: 'Just tell me' } });
    fireEvent.click(screen.getByRole('button', { name: en.practice.ask.teacher }));
    expect(screen.getByText(en.practice.ask.confirm)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.practice.ask.stay }));
    expect(screen.queryByText(en.practice.ask.confirm)).toBeNull();
    expect(posts(requests, '/questions')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: en.practice.ask.teacher }));
    fireEvent.click(screen.getByRole('button', { name: en.practice.ask.confirmTeacher }));
    await waitFor(() => expect(posts(requests, '/questions')).toHaveLength(1));
    expect((await posts(requests, '/questions')[0]!.json()).question).toMatchObject(
      { intent: 'EXPLAIN', switch_from_socratic: true, problem_key: 'a-2' });
  });

  it('explains a question the core held in Socratic mode, and a refusal in words', async () => {
    const held = question('q-2', { response: null, detail: STILL_SOCRATIC }, { intent: 'EXPLAIN' });
    const refused = question('q-3', { status: 'REJECTED', response: null, detail: 'Action is not authorized' });
    await renderLearner(opened(NO_PROGRESS, [refused, held, question('q-1')]), practise());
    await loaded();
    const listed = section(en.practice.questions.heading);
    expect(await within(listed).findByText(en.practice.questions.stillSocratic)).toBeTruthy();
    expect(within(listed).getByText(en.practice.questions.noAnswer.replace('{{detail}}', 'Action is not authorized')))
      .toBeTruthy();
    expect(within(listed).getAllByRole('listitem')).toHaveLength(3);
  });

  it('lists only the questions about this activity', async () => {
    const elsewhere = question('q-9', {}, { problem_key: 'a-1', activities: [{ ...A2, id: 'a-1' }], text: 'Elsewhere?' });
    await renderLearner(opened(NO_PROGRESS, [elsewhere, question('q-1')]), practise());
    await loaded();
    const listed = section(en.practice.questions.heading);
    expect(await within(listed).findByText('Question q-1?')).toBeTruthy();
    expect(within(listed).queryByText('Elsewhere?')).toBeNull();
  });
});
