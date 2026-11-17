import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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

const proposal = (id: string, status: string, base: string, candidates: { id: string }[]) => entity('ChangeProposal', id, '1',
  { status, baseContextVersion: base, proposedChange: 'Add members.', findings: [],
    candidateDefinitions: [...candidates.map(({ id: participant }) => ref('Participant', participant, 'p')),
      ref('PolicySet', 'course:course-1', 'p'), ref('ExecutionContext', 'course-1', 'n')] });
const joining = (subject: string, role: string) =>
  entity('Participant', `course-1:participant:${subject}`, 'p', { subjectKey: subject, roles: [role], learningNeeds: [] });

describe('the members of a course (D25, D36)', () => {
  it('proposes several people of the sign-in map in one proposal, retrying with the same request id', async () => {
    const { requests } = await renderStudio({
      ...opened(),
      'GET /contexts/course-1/members': [{ status: 200, body: { ...MEMBERS, addable: ['assessor', 'learner', 'observer'] } }],
      'POST /contexts/course-1/members': [
        { status: 422, body: { error: 'validation', detail: 'Not in the identity map: learner', request_id: 'r' } },
        { status: 200, body: { proposal: ref('ChangeProposal', 'member-proposal', '1'),
          participants: [ref('Participant', 'course-1:participant:assessor', 'p2'),
            ref('Participant', 'course-1:participant:learner', 'p2')], policy: POLICY } }],
    }, '/studio/contexts/course-1/members');
    expect((await screen.findByTestId('course-members')).textContent)
      .toBe('admin: Administrator, Teacher (content responsible)');
    // Nothing is pending: no warning yet.
    expect(screen.queryByRole('region', { name: en.members.pending.heading })).toBeNull();
    const submit = screen.getByRole('button', { name: en.members.add.submit_other });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    const role = (subject: string) => screen.getByLabelText(en.members.add.role.replace('{{subject}}', subject));
    fireEvent.change(role('assessor'), { target: { value: 'ASSESSOR' } });
    expect(screen.getByRole('button', { name: en.members.add.submit_one })).toBeTruthy();
    fireEvent.change(role('learner'), { target: { value: 'LEARNER' } });
    fireEvent.click(submit);
    expect(await screen.findByText(en.members.add.refused.replace('{{detail}}', 'Not in the identity map: learner')))
      .toBeTruthy();
    fireEvent.click(submit);
    expect(await screen.findByText('Proposed: assessor as Assessor; learner as Student. Nothing has changed yet: '
      + 'the proposal awaits review in this course.')).toBeTruthy();
    expect(screen.getByRole('link', { name: en.members.add.review }).getAttribute('href'))
      .toBe('/studio/contexts/course-1/review/member-proposal');
    // The new proposal is listed as not applied yet, with the warning.
    const pending = within(screen.getByRole('region', { name: en.members.pending.heading }));
    expect(pending.getByText(en.members.pending.intro)).toBeTruthy();
    expect(pending.getByTestId('pending-memberships').textContent)
      .toBe(`assessor as Assessor; learner as Student: awaits review. ${en.members.pending.review}`);
    const posts = requests.filter((request) => request.method === 'POST');
    expect(posts[0]!.headers.get('X-CSRF-Token')).toBe(SESSION.csrf_token);
    const bodies = await Promise.all(posts.map((request) => request.json()));
    expect(bodies).toEqual([1, 2].map(() => ({ request_id: 'request-1',
      members: [{ subject: 'assessor', role: 'ASSESSOR' }, { subject: 'learner', role: 'LEARNER' }],
      base_context: ref('ExecutionContext', 'course-1', 'c3') })));
  });

  it('lists the membership proposals not applied yet and says that one is applied at a time (#133)', async () => {
    const awaiting = proposal('p-awaiting', 'AWAITING_DECISION', 'c3', [joining('assessor', 'ASSESSOR')]);
    const approved = proposal('p-approved', 'APPROVED', 'c3', [{ id: 'course-1:participant:observer' }]);
    const stale = proposal('p-stale', 'AWAITING_DECISION', 'c2', [joining('learner', 'LEARNER')]);
    const applied = proposal('p-applied', 'APPLIED', 'c2', [{ id: 'course-1:participant:old' }]);
    await renderStudio({
      ...opened(),
      'GET /contexts/course-1': [{ status: 200, body: { context: context(ADMIN),
        entities: [context(ADMIN), ADMIN, awaiting, approved, stale, applied], findings: [] } }],
      'GET /contexts/course-1/pending-proposals': [{ status: 200, body: { proposals: [
        { proposal: awaiting, candidates: [joining('assessor', 'ASSESSOR')], review_payload_key: 'k1' },
        { proposal: stale, candidates: [joining('learner', 'LEARNER')], review_payload_key: 'k2' }] } }],
      'GET /contexts/course-1/members': [{ status: 200, body: MEMBERS }],
    }, '/studio/contexts/course-1/members');
    const pending = within(await screen.findByRole('region', { name: en.members.pending.heading }));
    expect(pending.getByText(en.members.pending.intro)).toBeTruthy();
    expect(pending.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      `assessor as Assessor: ${en.members.pending.awaiting}. ${en.members.pending.review}`,
      `learner as Student: ${en.members.pending.stale}. ${en.members.pending.review}`,
      `${en.members.pending.unnamed}: ${en.members.pending.approved}. ${en.members.pending.review}`,
    ]);
    expect(pending.getAllByRole('link').map((link) => link.getAttribute('href')))
      .toEqual(['p-awaiting', 'p-stale', 'p-approved'].map((id) => `/studio/contexts/course-1/review/${id}`));
    // A pending proposal does not stop another (D36): the form stays.
    expect(screen.getByRole('button', { name: en.members.add.submit_other })).toBeTruthy();
  });

  it('tells a subject who does not administer the course that only an administrator manages members', async () => {
    await renderStudio({
      ...opened(TEACHER),
      'GET /contexts/course-1/members': [{ status: 403, body: { error: 'forbidden', detail: 'Action is not authorized', request_id: 'r' } }],
    }, '/studio/contexts/course-1/members');
    expect(await screen.findByText(en.members.forbidden)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.members.add.submit_other })).toBeNull();
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
