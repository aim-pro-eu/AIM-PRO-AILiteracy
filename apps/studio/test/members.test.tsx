import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  addable: ['assessor', 'learner'], roles: ['CONTENT_RESPONSIBLE', 'ASSESSOR', 'OBSERVER'] };
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
    // Students are not proposed (D37): the roles the API offers are the teaching staff's.
    expect(within(role('learner')).queryByRole('option', { name: en.members.role.LEARNER })).toBeNull();
    fireEvent.change(role('learner'), { target: { value: 'OBSERVER' } });
    fireEvent.click(submit);
    expect(await screen.findByText(en.members.add.refused.replace('{{detail}}', 'Not in the identity map: learner')))
      .toBeTruthy();
    fireEvent.click(submit);
    expect(await screen.findByText('Proposed: assessor as Assessor; learner as Observer (read only). Nothing has changed yet: '
      + 'the proposal awaits review in this course.')).toBeTruthy();
    expect(screen.getByRole('link', { name: en.members.add.review }).getAttribute('href'))
      .toBe('/studio/contexts/course-1/review/member-proposal');
    // The new proposal is listed as not applied yet, with the warning.
    const pending = within(screen.getByRole('region', { name: en.members.pending.heading }));
    expect(pending.getByText(en.members.pending.intro)).toBeTruthy();
    expect(pending.getByTestId('pending-memberships').textContent)
      .toBe(`assessor as Assessor; learner as Observer (read only): awaits review. ${en.members.pending.review}`);
    const posts = requests.filter((request) => request.method === 'POST');
    expect(posts[0]!.headers.get('X-CSRF-Token')).toBe(SESSION.csrf_token);
    const bodies = await Promise.all(posts.map((request) => request.json()));
    expect(bodies).toEqual([1, 2].map(() => ({ request_id: 'request-1',
      members: [{ subject: 'assessor', role: 'ASSESSOR' }, { subject: 'learner', role: 'OBSERVER' }],
      base_context: ref('ExecutionContext', 'course-1', 'c3') })));
  });

  it('lists the membership proposals not applied yet and says that one is applied at a time (#133)', async () => {
    const awaiting = proposal('p-awaiting', 'AWAITING_DECISION', 'c3', [joining('assessor', 'ASSESSOR')]);
    const approved = proposal('p-approved', 'APPROVED', 'c3', [{ id: 'course-1:participant:observer' }]);
    const stale = proposal('p-stale', 'AWAITING_DECISION', 'c2', [joining('learner', 'OBSERVER')]);
    const applied = proposal('p-applied', 'APPLIED', 'c2', [{ id: 'course-1:participant:old' }]);
    await renderStudio({
      ...opened(),
      'GET /contexts/course-1': [{ status: 200, body: { context: context(ADMIN),
        entities: [context(ADMIN), ADMIN, awaiting, approved, stale, applied], findings: [] } }],
      'GET /contexts/course-1/pending-proposals': [{ status: 200, body: { proposals: [
        { proposal: awaiting, candidates: [joining('assessor', 'ASSESSOR')], review_payload_key: 'k1' },
        { proposal: stale, candidates: [joining('learner', 'OBSERVER')], review_payload_key: 'k2' }] } }],
      'GET /contexts/course-1/members': [{ status: 200, body: MEMBERS }],
    }, '/studio/contexts/course-1/members');
    const pending = within(await screen.findByRole('region', { name: en.members.pending.heading }));
    expect(pending.getByText(en.members.pending.intro)).toBeTruthy();
    expect(pending.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      `assessor as Assessor: ${en.members.pending.awaiting}. ${en.members.pending.review}`,
      `learner as Observer (read only): ${en.members.pending.stale}. ${en.members.pending.review}`,
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

// A delivery course (S12b, D37): students join with its code or are added at once, under its reviewed learner grant.
const DELIVERY_MODEL = ref('DomainModel', 'authoring-delivery:release-1', '1');
const delivery = (version = 'd3') => entity('ExecutionContext', 'course-1', version,
  { status: 'ACTIVE', mode: 'LEARNING', models: [DELIVERY_MODEL], participants: [ref('Participant', ADMIN.id, '1')] });
const opening = (status: string, base: string) => entity('ChangeProposal', 'p-open', '1',
  { status, baseContextVersion: base, proposedChange: 'Open this course to learners.', findings: [],
    candidateDefinitions: [ref('PolicySet', 'course:course-1', 'p'), ref('ExecutionContext', 'course-1', 'n')] });
const deliveryOpened = (entities: unknown[] = [], pending: unknown[] = []): Record<string, Reply[]> => ({
  'GET /auth/session': [{ status: 200, body: SESSION }],
  'GET /contexts/course-1': [{ status: 200, body: { context: delivery(), entities: [delivery(), ADMIN, ...entities],
    findings: [] } }],
  'GET /contexts/course-1/pending-proposals': [{ status: 200, body: { proposals: pending } }],
  'GET /contexts/course-1/members': [{ status: 200, body: MEMBERS }],
});
const students = () => within(screen.getByRole('region', { name: en.members.students.heading }));

describe('the students of a delivery course (D37, S12b)', () => {
  it('proposes opening the course to students once, then shows the opening awaiting review', async () => {
    const { requests } = await renderStudio({
      ...deliveryOpened(),
      'GET /contexts/course-1/enrolment': [{ status: 200, body: { context_id: 'course-1', open: false, code: null } }],
      'POST /contexts/course-1/enrolment': [{ status: 200, body: {
        proposal: ref('ChangeProposal', 'p-open', '1'), policy: POLICY } }],
    }, '/studio/contexts/course-1/members');
    expect(await screen.findByText(en.members.students.notOpen)).toBeTruthy();
    expect(students().queryByRole('button', { name: en.members.students.create })).toBeNull();
    expect(students().queryByRole('heading', { name: en.members.students.add.heading })).toBeNull();
    fireEvent.click(students().getByRole('button', { name: en.members.students.propose }));
    expect(await screen.findByText(en.members.students.proposed)).toBeTruthy();
    expect(students().getByRole('link', { name: en.members.students.review }).getAttribute('href'))
      .toBe('/studio/contexts/course-1/review/p-open');
    expect(students().queryByRole('button', { name: en.members.students.propose })).toBeNull();
    const post = requests.find((request) => request.method === 'POST')!;
    expect(post.headers.get('X-CSRF-Token')).toBe(SESSION.csrf_token);
    expect(await post.json()).toEqual({ request_id: 'request-1', base_context: ref('ExecutionContext', 'course-1', 'd3') });
  });

  it('lists an opening already proposed instead of proposing another', async () => {
    const awaiting = opening('AWAITING_DECISION', 'd3');
    await renderStudio({
      ...deliveryOpened([awaiting], [{ proposal: awaiting, candidates: [], review_payload_key: 'k' }]),
      'GET /contexts/course-1/enrolment': [{ status: 200, body: { context_id: 'course-1', open: false, code: null } }],
    }, '/studio/contexts/course-1/members');
    expect(await screen.findByText(en.members.students.pending.replace('{{state}}', en.members.pending.awaiting)))
      .toBeTruthy();
    expect(students().getByRole('link', { name: en.members.students.review }).getAttribute('href'))
      .toBe('/studio/contexts/course-1/review/p-open');
    expect(students().queryByRole('button', { name: en.members.students.propose })).toBeNull();
  });

  it('shows the code and the join link of an open course, resets it and disables it', async () => {
    const { requests } = await renderStudio({
      ...deliveryOpened(),
      'GET /contexts/course-1/enrolment': [{ status: 200, body: { context_id: 'course-1', open: true, code: 'abcd2345' } }],
      'POST /contexts/course-1/enrolment/code': [
        { status: 200, body: { context_id: 'course-1', open: true, code: 'efgh6789' } },
        { status: 200, body: { context_id: 'course-1', open: true, code: 'ijkl2345' } }],
      'DELETE /contexts/course-1/enrolment/code': [{ status: 200, body: { context_id: 'course-1', open: true, code: null } }],
    }, '/studio/contexts/course-1/members');
    expect((await screen.findByTestId('enrolment-code')).textContent).toBe('abcd2345');
    expect(screen.getByTestId('join-link').textContent).toBe(`${window.location.origin}/join?code=abcd2345`);
    expect(students().getByText(en.members.students.linkNote)).toBeTruthy();
    fireEvent.click(students().getByRole('button', { name: en.members.students.reset }));
    await waitFor(() => expect(screen.getByTestId('enrolment-code').textContent).toBe('efgh6789'));
    expect(screen.getByTestId('join-link').textContent).toBe(`${window.location.origin}/join?code=efgh6789`);
    fireEvent.click(students().getByRole('button', { name: en.members.students.disable }));
    expect(await screen.findByText(en.members.students.noCode)).toBeTruthy();
    expect(screen.queryByTestId('enrolment-code')).toBeNull();
    expect(screen.queryByTestId('join-link')).toBeNull();
    fireEvent.click(students().getByRole('button', { name: en.members.students.create }));
    await waitFor(() => expect(screen.getByTestId('enrolment-code').textContent).toBe('ijkl2345'));
    const writes = requests.filter((request) => request.method !== 'GET');
    expect(writes.map((request) => request.method)).toEqual(['POST', 'DELETE', 'POST']);
    expect(writes.every((request) => request.headers.get('X-CSRF-Token') === SESSION.csrf_token)).toBe(true);
  });

  it('adds people of the sign-in map and typed keys as students at once, retrying with the same request id', async () => {
    const added = { ...MEMBERS, addable: ['assessor'], members: [...MEMBERS.members,
      { subject: 'learner', roles: ['LEARNER'] }, { subject: 'auto-0123456789abcdef0123', roles: ['LEARNER'] }] };
    const { requests } = await renderStudio({
      ...deliveryOpened(),
      'GET /contexts/course-1/enrolment': [{ status: 200, body: { context_id: 'course-1', open: true, code: null } }],
      'POST /contexts/course-1/learners': [
        { status: 422, body: { error: 'validation', detail: 'Neither in the identity map nor an automatic key: x',
          request_id: 'r' } },
        { status: 200, body: added }],
    }, '/studio/contexts/course-1/members');
    const add = await screen.findByRole('button', { name: en.members.students.add.submit_other });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(students().getByLabelText(en.members.students.add.person.replace('{{subject}}', 'learner')));
    fireEvent.change(students().getByLabelText(en.members.students.add.keys),
      { target: { value: ' auto-0123456789abcdef0123,\nlearner ' } });
    fireEvent.click(students().getByRole('button', { name: en.members.students.add.submit_other }));
    expect(await screen.findByText(en.members.students.add.refused
      .replace('{{detail}}', 'Neither in the identity map nor an automatic key: x'))).toBeTruthy();
    fireEvent.click(students().getByRole('button', { name: en.members.students.add.submit_other }));
    expect(await screen.findByText(en.members.students.add.added
      .replace('{{subjects}}', 'learner, auto-0123456789abcdef0123'))).toBeTruthy();
    expect(screen.getByTestId('course-members').textContent).toBe('admin: Administrator, Teacher (content responsible)'
      + 'learner: Studentauto-0123456789abcdef0123: Student');
    // Nobody was proposed: no membership proposal is listed.
    expect(screen.queryByRole('region', { name: en.members.pending.heading })).toBeNull();
    const bodies = await Promise.all(requests.filter((request) => request.method === 'POST')
      .map((request) => request.json()));
    expect(bodies).toEqual([1, 2].map(() => ({ request_id: 'request-1',
      subjects: ['learner', 'auto-0123456789abcdef0123'] })));
  });

  it('keeps a membership proposed before a student joined awaiting review: joining leaves the course version', async () => {
    const before = delivery('d2');
    const awaiting = proposal('p-awaiting', 'AWAITING_DECISION', 'd2', [joining('assessor', 'ASSESSOR')]);
    const joined = entity('StateChange', 'change-1', '1', { baseVersion: 'd2', newVersion: 'd3',
      cause: ref('Participant', 'course-1:participant:auto-0123456789abcdef0123', 'j') });
    await renderStudio({
      ...deliveryOpened([before, awaiting, joined],
        [{ proposal: awaiting, candidates: [joining('assessor', 'ASSESSOR')], review_payload_key: 'k1' }]),
      'GET /contexts/course-1/enrolment': [{ status: 200, body: { context_id: 'course-1', open: true, code: null } }],
    }, '/studio/contexts/course-1/members');
    const pending = within(await screen.findByRole('region', { name: en.members.pending.heading }));
    expect(pending.getAllByRole('listitem').map((item) => item.textContent))
      .toEqual([`assessor as Assessor: ${en.members.pending.awaiting}. ${en.members.pending.review}`]);
  });

  it('shows no students section on a course that is not a delivery', async () => {
    await renderStudio({ ...opened(), 'GET /contexts/course-1/members': [{ status: 200, body: MEMBERS }] },
      '/studio/contexts/course-1/members');
    await screen.findByTestId('course-members');
    expect(screen.queryByRole('region', { name: en.members.students.heading })).toBeNull();
  });
});
