import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import type { Reply } from './harness';
import { renderStudio, SESSION } from './harness';

const provenance = { origin: 'OBSERVED_EVENT', responsible: 'learner', sources: [] };
const entity = (type: string, id: string, version: string, fields: Record<string, unknown>) =>
  ({ type, id, version, fields, provenance });
const ref = (type: string, id: string, version: string) => ({ type, id, version });

const ASSESSOR = entity('Participant', 'delivery-1:participant:admin', '1', { subjectKey: SESSION.subject_key, roles: ['ASSESSOR'] });
const TEACHER = entity('Participant', 'delivery-1:participant:admin', '1',
  { subjectKey: SESSION.subject_key, roles: ['CONTENT_RESPONSIBLE'] });
const LEARNER = entity('Participant', 'delivery-1:participant:learner', '1', { subjectKey: 'learner', roles: ['LEARNER'] });
const ASSESS = entity('ActivityDefinition', 'activity-assess', 'a1', { instruction: 'Write and justify a prompt.\nUse the rubric.',
  intent: 'ASSESS', format: 'CRITERIA_BASED_PRODUCT', expectedEvidence: ['CRITERIA_BASED_PRODUCT'] });
const PRACTICE = entity('ActivityDefinition', 'activity-practice', 'a1', { instruction: 'Practise a prompt.',
  intent: 'PRACTICE', format: 'GUIDED_PRACTICE', expectedEvidence: ['CRITERIA_BASED_PRODUCT'] });
const attempt = (id: string, activity: typeof ASSESS, content: string) => entity('LearningEvidence', id, '1', {
  activity: ref('ActivityDefinition', activity.id, activity.version), learner: ref('Participant', LEARNER.id, '1'),
  kind: 'CRITERIA_BASED_PRODUCT', contentOrLocator: content, observedAt: '2026-11-17T09:00:00Z' });
const ATTEMPT = attempt('evidence-assess', ASSESS, 'Dear Alex, please send EXAMPLE-01 by Friday.');
const PRACTISED = attempt('evidence-practice', PRACTICE, 'A practice answer.');
const DESIGN = [entity('LearningDesign', 'design-1', 'd1', { name: 'Prompting syllabus', root: ref('ProcessNode', 'unit-1', '1'),
  outcomes: [], strategies: [], assessmentSpecs: [] }),
entity('ProcessNode', 'unit-1', '1', { name: 'Prepare a prompt', kind: 'UNIT', children: [], strategies: [],
  activities: [ref('ActivityDefinition', 'activity-practice', 'a1'), ref('ActivityDefinition', 'activity-assess', 'a1')] })];
const context = (participant: typeof ASSESSOR) => entity('ExecutionContext', 'delivery-1', 'c9', { status: 'ACTIVE',
  mode: 'LEARNING', models: [ref('DomainModel', 'authoring-delivery:x', '1')], learningDesign: ref('LearningDesign', 'design-1', 'd1'),
  participants: [ref('Participant', participant.id, '1'), ref('Participant', LEARNER.id, '1')] });

const opened = (participant = ASSESSOR): Record<string, Reply[]> => ({
  'GET /auth/session': [{ status: 200, body: SESSION }],
  'GET /contexts/delivery-1': [{ status: 200, body: { context: context(participant),
    entities: [context(participant), participant, LEARNER, ASSESS, PRACTICE, ATTEMPT, PRACTISED, ...DESIGN], findings: [] } }],
  'GET /contexts/delivery-1/pending-proposals': [{ status: 200, body: { proposals: [] } }],
});
const COMMAND = { kind: 'propose-evaluation', command: { evidence: ref('LearningEvidence', 'evidence-assess', '1'), mode: 'FORMAL' } };
const job = (status: string, extra: Record<string, unknown> = {}) => ({ status: 200, body: {
  context_id: 'delivery-1', request_id: 'request-1', subject_key: SESSION.subject_key, job: COMMAND, status,
  proposal_refs: [], detail: null, created: '2026-11-17T09:01:00Z', updated: '2026-11-17T09:01:00Z', ...extra } });

afterEach(cleanup);

describe('the evaluation of submitted attempts (S11)', () => {
  it('lists the attempts at assessments, asks the assessor agent for a draft in the chosen mode and links to it', async () => {
    const { requests } = await renderStudio({
      ...opened(),
      'POST /contexts/delivery-1/jobs': [job('QUEUED')],
      'GET /contexts/delivery-1/jobs/request-1': [job('RUNNING'),
        job('PROPOSED', { proposal_refs: [ref('ChangeProposal', 'evaluation-proposal', '1')] })],
    }, '/studio/contexts/delivery-1/assessments');
    const attempts = await screen.findByTestId('assessed-attempts');
    const items = within(attempts).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    const item = within(items[0]!);
    expect(item.getByRole('heading', { level: 2 }).textContent).toBe('learner: Write and justify a prompt.');
    expect(item.getByText('Dear Alex, please send EXAMPLE-01 by Friday.')).toBeTruthy();
    const submit = item.getByRole('button', { name: en.assess.submit });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(item.getByRole('radio', { name: en.assess.mode.FORMAL }));
    fireEvent.click(submit);
    expect(await item.findByText(en.assess.status.proposed)).toBeTruthy();
    expect(item.getByRole('link', { name: en.assess.review }).getAttribute('href'))
      .toBe('/studio/contexts/delivery-1/review/evaluation-proposal');
    const post = requests.find((request) => request.method === 'POST')!;
    expect(post.headers.get('X-CSRF-Token')).toBe(SESSION.csrf_token);
    expect(await post.json()).toEqual({ request_id: 'request-1', job: COMMAND });
  });

  it('says why no draft was proposed, in the fixed words of the job', async () => {
    await renderStudio({
      ...opened(),
      'POST /contexts/delivery-1/jobs': [job('FAILED',
        { detail: 'The evaluation draft did not complete; no evaluation was proposed.' })],
    }, '/studio/contexts/delivery-1/assessments');
    const item = within((await screen.findAllByRole('listitem'))[0]!);
    fireEvent.click(item.getByRole('radio', { name: en.assess.mode.FORMATIVE }));
    fireEvent.click(item.getByRole('button', { name: en.assess.submit }));
    expect(await item.findByText(en.assess.status.ended.replace('{{detail}}',
      'The evaluation draft did not complete; no evaluation was proposed.'))).toBeTruthy();
    expect(item.queryByRole('link', { name: en.assess.review })).toBeNull();
  });

  it('links the page from the course page of an assessor of an active delivery only', async () => {
    await renderStudio(opened(), '/studio/contexts/delivery-1/course');
    expect((await screen.findByRole('link', { name: en.course.assess })).getAttribute('href'))
      .toBe('/studio/contexts/delivery-1/assessments');
    cleanup();
    await renderStudio(opened(TEACHER), '/studio/contexts/delivery-1/course');
    await screen.findByText(en.course.delivery);
    expect(screen.queryByRole('link', { name: en.course.assess })).toBeNull();
  });

  it('tells a subject without the assessor role that only an assessor evaluates attempts', async () => {
    await renderStudio(opened(TEACHER), '/studio/contexts/delivery-1/assessments');
    expect(await screen.findByText(en.assess.notAssessor)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.assess.submit })).toBeNull();
  });
});
