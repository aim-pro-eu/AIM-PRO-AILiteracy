import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import type { Reply } from './harness';
import { renderStudio, SESSION } from './harness';

const provenance = { origin: 'INITIAL_CONTEXT', responsible: 'admin', sources: [] };
const entity = (type: string, id: string, version: string, fields: Record<string, unknown>) =>
  ({ type, id, version, fields, provenance });
const ref = (type: string, id: string, version: string) => ({ type, id, version });

const ADMIN = entity('Participant', 'course-1:participant:admin', '1',
  { subjectKey: 'admin', roles: ['ADMINISTRATOR', 'CONTENT_RESPONSIBLE'] });
const TEACHER = entity('Participant', 'course-1:participant:admin', '1', { subjectKey: 'admin', roles: ['CONTENT_RESPONSIBLE'] });
const context = (participant: typeof ADMIN) => entity('ExecutionContext', 'course-1', 'c3',
  { status: 'DRAFT', mode: 'PREPARATION', models: [], participants: [ref('Participant', participant.id, '1')] });
const MEMBERS = { members: [{ subject: 'admin', roles: ['ADMINISTRATOR', 'CONTENT_RESPONSIBLE'] }],
  addable: ['assessor', 'learner'], roles: ['CONTENT_RESPONSIBLE', 'ASSESSOR', 'LEARNER', 'OBSERVER'] };
const POLICY = { policy_ref: ref('PolicySet', 'course:course-1', 'p2'), subjects: {}, scopes: {}, rule_bindings: [] };

const opened = (participant = ADMIN): Record<string, Reply[]> => ({
  'GET /auth/session': [{ status: 200, body: SESSION }],
  'GET /contexts/course-1': [{ status: 200, body: { context: context(participant),
    entities: [context(participant), participant], findings: [] } }],
  'GET /contexts/course-1/pending-proposals': [{ status: 200, body: { proposals: [] } }],
});

afterEach(cleanup);

describe('the members of a course (D25)', () => {
  it('lists the members and proposes a person of the sign-in map with a role, retrying with the same request id', async () => {
    const { requests } = await renderStudio({
      ...opened(),
      'GET /contexts/course-1/members': [{ status: 200, body: MEMBERS }],
      'POST /contexts/course-1/members': [
        { status: 422, body: { error: 'validation', detail: 'This subject is already a member of the course', request_id: 'r' } },
        { status: 200, body: { proposal: ref('ChangeProposal', 'member-proposal', '1'),
          participant: ref('Participant', 'course-1:participant:assessor', 'p2'), policy: POLICY } }],
    }, '/studio/contexts/course-1/members');
    expect((await screen.findByTestId('course-members')).textContent)
      .toBe('admin: Administrator, Teacher (content responsible)');
    const submit = screen.getByRole('button', { name: en.members.add.submit });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(en.members.add.subject), { target: { value: 'assessor' } });
    fireEvent.change(screen.getByLabelText(en.members.add.role), { target: { value: 'ASSESSOR' } });
    fireEvent.click(submit);
    expect(await screen.findByText(en.members.add.refused.replace('{{detail}}',
      'This subject is already a member of the course'))).toBeTruthy();
    fireEvent.click(submit);
    expect(await screen.findByText('assessor is proposed as Assessor. Nothing has changed yet: the proposal awaits review in this course.'))
      .toBeTruthy();
    expect(screen.getByRole('link', { name: en.members.add.review }).getAttribute('href'))
      .toBe('/studio/contexts/course-1/review/member-proposal');
    const posts = requests.filter((request) => request.method === 'POST');
    expect(posts[0]!.headers.get('X-CSRF-Token')).toBe(SESSION.csrf_token);
    const bodies = await Promise.all(posts.map((request) => request.json()));
    expect(bodies).toEqual([1, 2].map(() => ({ request_id: 'request-1', subject: 'assessor', role: 'ASSESSOR',
      base_context: ref('ExecutionContext', 'course-1', 'c3') })));
  });

  it('tells a subject who does not administer the course that only an administrator manages members', async () => {
    await renderStudio({
      ...opened(TEACHER),
      'GET /contexts/course-1/members': [{ status: 403, body: { error: 'forbidden', detail: 'Action is not authorized', request_id: 'r' } }],
    }, '/studio/contexts/course-1/members');
    expect(await screen.findByText(en.members.forbidden)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.members.add.submit })).toBeNull();
  });

  it('links the members page from the course page of an administrator only', async () => {
    await renderStudio(opened(), '/studio/contexts/course-1/course');
    expect((await screen.findByRole('link', { name: en.course.members })).getAttribute('href'))
      .toBe('/studio/contexts/course-1/members');
    cleanup();
    await renderStudio(opened(TEACHER), '/studio/contexts/course-1/course');
    await screen.findByText(en.course.notStarted);
    expect(screen.queryByRole('link', { name: en.course.members })).toBeNull();
  });
});
