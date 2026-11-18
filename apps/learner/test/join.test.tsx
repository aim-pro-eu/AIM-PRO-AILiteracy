import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import { COURSE, SESSION, renderLearner } from './harness';

afterEach(cleanup);

const JOINED = { context_id: COURSE.context_id, title: COURSE.title };
// A new queue per render: replies are consumed.
const signedIn = () => ({ 'GET /auth/session': [{ status: 200, body: SESSION }] });
const codeField = () => screen.getByLabelText(en.join.code) as HTMLInputElement;
const submit = () => fireEvent.click(screen.getByRole('button', { name: en.join.submit }));

describe('join page (S13, D37)', () => {
  it('takes the code from the join link and joins only when the learner confirms', async () => {
    const { requests, router } = await renderLearner({
      ...signedIn(),
      'POST /enrolments': [{ status: 200, body: JOINED }],
      [`GET /courses/${COURSE.context_id}`]: [{ status: 200, body: COURSE }],
    }, '/learn/join?code=abcd2345');
    expect(await screen.findByRole('heading', { level: 1, name: en.join.title })).toBeTruthy();
    expect(codeField().value).toBe('abcd2345');
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
    submit();
    expect(await screen.findByRole('heading', { level: 1, name: COURSE.title })).toBeTruthy();
    expect(screen.getByText(en.course.joined)).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/learn/courses/${COURSE.context_id}`);
    const post = requests.find((r) => r.method === 'POST')!;
    expect(post.headers.get('X-CSRF-Token')).toBe('csrf-1');
    expect(await post.json()).toEqual({ request_id: 'request-1', code: 'abcd2345' });
  });

  it('accepts a typed code and asks for one when the field is empty', async () => {
    const { requests } = await renderLearner({ ...signedIn(), 'POST /enrolments': [{ status: 404, body: {
      error: 'not_found', detail: 'No open course has this code', request_id: 'r' } }] }, '/learn/join');
    await screen.findByRole('heading', { level: 1, name: en.join.title });
    submit();
    expect(await screen.findByText(en.join.empty)).toBeTruthy();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
    fireEvent.change(codeField(), { target: { value: 'WXYZ-2345' } });
    submit();
    expect(await screen.findByText(en.join.notFound)).toBeTruthy();
    expect(await requests.find((r) => r.method === 'POST')!.json()).toEqual({ request_id: 'request-1', code: 'WXYZ-2345' });
  });

  it('sends the same request id when the same code is tried again, a new one for another code', async () => {
    const { requests } = await renderLearner({ ...signedIn(), 'POST /enrolments': ['network', 'network', 'network'] },
      '/learn/join?code=abcd2345');
    await screen.findByRole('heading', { level: 1, name: en.join.title });
    submit();
    expect(await screen.findByText(en.join.failed)).toBeTruthy();
    submit();
    await waitFor(() => expect(requests.filter((r) => r.method === 'POST')).toHaveLength(2));
    fireEvent.change(codeField(), { target: { value: 'efgh6723' } });
    submit();
    await waitFor(() => expect(requests.filter((r) => r.method === 'POST')).toHaveLength(3));
    const ids = await Promise.all(requests.filter((r) => r.method === 'POST').map(async (r) => (await r.json()).request_id));
    expect(ids).toEqual(['request-1', 'request-1', 'request-2']);
  });

  it('tells a member of the staff that they cannot join as a student', async () => {
    await renderLearner({ ...signedIn(), 'POST /enrolments': [{ status: 409, body: {
      error: 'conflict', detail: 'A member of the staff', request_id: 'r' } }] }, '/learn/join?code=abcd2345');
    await screen.findByRole('heading', { level: 1, name: en.join.title });
    submit();
    expect(await screen.findByText(en.join.staff)).toBeTruthy();
  });
});
