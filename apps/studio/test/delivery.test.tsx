import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import type { Reply } from './harness';
import { renderStudio, SESSION } from './harness';

const provenance = { origin: 'GENERATED_PROPOSAL', responsible: 'admin', sources: [] };
const entity = (type: string, id: string, version: string, fields: Record<string, unknown>) =>
  ({ type, id, version, fields, provenance });
const ref = (type: string, id: string, version: string) => ({ type, id, version });

const RELEASE = ref('Resource', 'authoring-release:abc', 'r2');
const MATERIAL = ref('Resource', 'authoring-output:teacher:explanation', 'm1');
const SOURCE = ref('Resource', 'wp3:test', 's1');
const NEEDS = [ref('ResourceRequirement', 'req-material', 'q1'), ref('ResourceRequirement', 'req-source', 'q1')];
const RULE = ref('RuleDefinition', 'completion-rule:unit-1', 'c1');
const MANIFEST = { format: 'authoring-release', format_version: 1, authoring_context: 'ctx',
  project: ref('Resource', 'authoring-project:abc', 'p5'), domain: ref('DomainModel', 'authoring-project:abc:model', 'p5'),
  design: ref('LearningDesign', 'design-1', 'd1'), artifacts: [ref('Resource', 'teacher-package', 't1')] };
const INSPECTION = {
  release: RELEASE, manifest: MANIFEST, receipt: null, project_receipt: null, artifacts: [], closure: [], findings: [],
  requirements: [
    { requirement: NEEDS[0], purpose: 'Use the complete assigned material: Synthetic EXPLANATION', resource: MATERIAL,
      title: 'Synthetic EXPLANATION' },
    { requirement: NEEDS[1], purpose: 'Use the exact cited source evidence for this authored item.', resource: SOURCE,
      title: 'Synthetic prompting guide' },
  ],
  completion_rules: [RULE],
};
const PARTICIPANT = entity('Participant', 'delivery-1:participant:admin', '1', { subjectKey: 'admin', roles: ['ADMINISTRATOR'] });
const EMPTY = entity('ExecutionContext', 'delivery-1', '1', { status: 'DRAFT', mode: 'PREPARATION', models: [],
  participants: [ref('Participant', PARTICIPANT.id, '1')] });
const PREVIEW = { policy_ref: ref('PolicySet', 'course:delivery-1', 'v2'),
  subjects: { admin: { roles: ['ADMINISTRATOR'], actions: { 'delivery-1': ['read'] } } },
  scopes: { 'delivery-1:delivery': { contexts: ['delivery-1'], subjects: ['admin'], resources: ['["wp3:test","s1"]'] } },
  rule_bindings: [{ rule: RULE, handler: 'all_completed' }] };

const signedIn: Reply = { status: 200, body: SESSION };
const summary = (context: unknown, entities: unknown[]): Reply[] =>
  [{ status: 200, body: { context, entities: [context, ...entities], findings: [] } }];
const nothingPending = (): Reply[] => [{ status: 200, body: { proposals: [] } }];
const IMPORT = '/studio/contexts/delivery-1/import?from=ctx&release=authoring-release%3Aabc&version=r2';
const opened = (context = EMPTY) => ({
  'GET /auth/session': [signedIn],
  'GET /contexts/delivery-1': summary(context, [PARTICIPANT]),
  'GET /contexts/delivery-1/pending-proposals': nothingPending(),
  'GET /contexts/ctx/resources/authoring-release:abc/versions/r2/release': [{ status: 200, body: INSPECTION } as Reply],
});

afterEach(cleanup);

describe('the import of a release into a delivery course (S10, part 2)', () => {
  it('proposes the resource the release pins for each requirement, sends the exact selection and shows the policy preview', async () => {
    const { requests } = await renderStudio({
      ...opened(),
      'POST /contexts/delivery-1/delivery-imports': [{ status: 200, body: {
        proposal: ref('ChangeProposal', 'import-proposal', '1'), release: RELEASE, domain: MANIFEST.domain,
        design: MANIFEST.design, runtime_model: ref('DomainModel', 'authoring-delivery:x', '1'),
        bindings: [ref('ResourceBinding', 'binding-1', '1')], policy_preview: PREVIEW,
        preview: { mode: 'PREPARATION', status: 'DRAFT', scope: 'delivery-1:delivery', resource_keys: [], activities: [],
          workers: [], readiness_findings: [] } } }],
    }, IMPORT);
    const first = await screen.findByLabelText('Requirement 1: Use the complete assigned material: Synthetic EXPLANATION');
    const second = screen.getByLabelText('Requirement 2: Use the exact cited source evidence for this authored item.');
    expect((first as HTMLSelectElement).value).toBe('pinned');
    expect(within(second).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Synthetic prompting guide (proposed, the version the release fixes)', en.delivery.import.bindings.none]);
    expect(screen.getByText('2 of 2 requirements get a resource.')).toBeTruthy();
    expect(screen.getByText(en.delivery.import.completion.intro_one.replace('{{count}}', '1'))).toBeTruthy();

    // The teacher leaves the first requirement without a resource: only the second is sent.
    fireEvent.change(first, { target: { value: 'none' } });
    expect(screen.getByText('1 of 2 requirements gets a resource.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.delivery.import.submit }));
    expect(await screen.findByText(en.delivery.import.proposed_one.replace('{{count}}', '1'))).toBeTruthy();
    const post = requests.find((request) => request.method === 'POST')!;
    expect(post.headers.get('X-CSRF-Token')).toBe(SESSION.csrf_token);
    expect(await post.json()).toEqual({
      request_id: 'request-1', release: RELEASE, authoring_context: 'ctx', base_context: ref('ExecutionContext', 'delivery-1', '1'),
      scope_name: 'delivery-1:delivery',
      bindings: [{ requirement: NEEDS[1], resource: SOURCE, usage_scope: 'delivery-1:delivery' }],
      completion_handlers: [{ rule: RULE, handler: 'all_completed' }],
    });
    expect(screen.getByRole('link', { name: en.delivery.import.review }).getAttribute('href'))
      .toBe('/studio/contexts/delivery-1/review/import-proposal');
    const policy = within(screen.getByRole('region', { name: en.delivery.policy.heading }));
    expect(JSON.parse(policy.getByTestId('policy-preview').textContent ?? '')).toEqual(PREVIEW);
    const download = policy.getByRole('link', { name: 'Download the preview as course-delivery-1-v2.json' });
    expect(download.getAttribute('download')).toBe('course-delivery-1-v2.json');
    expect(JSON.parse(decodeURIComponent(download.getAttribute('href')!.replace('data:application/json;charset=utf-8,', ''))))
      .toEqual(PREVIEW);
  });

  it('says why the import cannot be proposed, and retries with the same request id', async () => {
    const { requests } = await renderStudio({
      ...opened(),
      'POST /contexts/delivery-1/delivery-imports': [
        { status: 403, body: { error: 'forbidden', detail: 'Action is not authorized', request_id: 'r' } },
        { status: 422, body: { error: 'validation', detail: 'A binding must use the exact resource version pinned by the release',
          request_id: 'r' } }],
    }, IMPORT);
    fireEvent.click(await screen.findByRole('button', { name: en.delivery.import.submit }));
    expect(await screen.findByText(en.delivery.import.forbidden)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.delivery.import.submit }));
    expect(await screen.findByText(en.delivery.import.refused.replace('{{detail}}',
      'A binding must use the exact resource version pinned by the release'))).toBeTruthy();
    const posts = await Promise.all(requests.filter((request) => request.method === 'POST').map((request) => request.json()));
    expect(posts.map((body: { request_id: string }) => body.request_id)).toEqual(['request-1', 'request-1']);
  });

  it('offers no import into a course that already holds a configuration', async () => {
    await renderStudio(opened({ ...EMPTY, fields: { ...EMPTY.fields, models: [MANIFEST.domain] } }), IMPORT);
    expect(await screen.findByText(en.delivery.import.configured)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.delivery.import.submit })).toBeNull();
  });
});

describe('the activation of an imported delivery course (S10, part 2)', () => {
  const ASSESS = entity('ActivityDefinition', 'activity-assess', 'a1', { instruction: 'Write and justify a prompt.\nUse the rubric.',
    intent: 'ASSESS', format: 'CRITERIA_BASED_PRODUCT', expectedEvidence: [] });
  const IMPORTED = entity('ExecutionContext', 'delivery-1', '2', { status: 'DRAFT', mode: 'PREPARATION',
    models: [MANIFEST.domain, ref('DomainModel', 'authoring-delivery:x', '1')], learningDesign: MANIFEST.design,
    participants: [ref('Participant', PARTICIPANT.id, '1')] });
  const RECORDS = [PARTICIPANT, ASSESS,
    entity('LearningDesign', 'design-1', 'd1', { name: 'Prompting syllabus', root: ref('ProcessNode', 'unit-1', '1'),
      outcomes: [], strategies: [], assessmentSpecs: [] }),
    entity('ProcessNode', 'unit-1', '1', { name: 'Prepare a prompt', kind: 'UNIT', children: [], strategies: [],
      activities: [ref('ActivityDefinition', 'activity-assess', 'a1')] })];
  const course = (activation: Reply) => ({
    'GET /auth/session': [signedIn],
    'GET /contexts/delivery-1': summary(IMPORTED, RECORDS),
    'GET /contexts/delivery-1/pending-proposals': nothingPending(),
    'POST /contexts/delivery-1/activations': [activation],
  });

  it('shows why activation is refused, in words, and builds nothing further', async () => {
    const { requests } = await renderStudio(course({ status: 200, body: { proposal: null, findings: [
      { code: 'RELEASE_RUNTIME_ROLE', target: 'activity-assess', severity: 'BLOCKING',
        reason: 'This ASSESS activity has no configured runtime assessor role; activation stays refused until a later explicit decision (D4).',
        resolution: 'Keep the delivery in PREPARATION.' },
      { code: 'R08', target: 'req-material', severity: 'BLOCKING', reason: 'A mandatory resource requirement has no valid binding.',
        resolution: 'Bind an approved resource.' }] } }), '/studio/contexts/delivery-1/course');
    const section = within(await screen.findByRole('region', { name: en.delivery.activation.heading }));
    expect(screen.getByText(en.course.delivery)).toBeTruthy();
    expect(screen.queryByRole('link', { name: en.course.continueBuild })).toBeNull();
    fireEvent.click(section.getByRole('button', { name: en.delivery.activation.submit }));
    expect(await section.findByText(en.delivery.activation.refused_other.replace('{{count}}', '2'))).toBeTruthy();
    expect(within(section.getByTestId('activation-refusals')).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '“Write and justify a prompt.” is an assessment, and no assessor is configured for students yet (decision D4): the course stays in preparation.',
      'A mandatory resource requirement has no valid binding. What to do: Bind an approved resource. (R08)',
    ]);
    const post = requests.find((request) => request.method === 'POST')!;
    expect(await post.json()).toEqual({ request_id: 'request-1', base_context: ref('ExecutionContext', 'delivery-1', '2') });
  });

  it('links to the activation proposal when it is proposed', async () => {
    await renderStudio(course({ status: 200, body: { findings: [], proposal: {
      proposal: ref('ChangeProposal', 'activation-1', '1'), release: RELEASE, policy: PREVIEW.policy_ref } } }),
    '/studio/contexts/delivery-1/course');
    fireEvent.click(await screen.findByRole('button', { name: en.delivery.activation.submit }));
    await waitFor(() => expect(screen.getByRole('link', { name: en.delivery.activation.review }).getAttribute('href'))
      .toBe('/studio/contexts/delivery-1/review/activation-1'));
  });
});

describe('the review of an import (S10, part 2)', () => {
  it('shows the policy preview in full and, once applied, says the course waits for the operator', async () => {
    const policy = entity('PolicySet', 'course:delivery-1', 'v2', { sourceScopes: ['wp3', 'delivery-1:delivery'],
      approvalConditions: [], permissions: [`Proposed trusted local policy configuration: ${JSON.stringify(PREVIEW)}`] });
    const proposal = entity('ChangeProposal', 'import-proposal', '2', { status: 'APPROVED', findings: [],
      proposedChange: 'Import the frozen release unchanged into this delivery.' });
    const { requests } = await renderStudio({
      'GET /auth/session': [signedIn],
      'GET /contexts/delivery-1': [...summary(EMPTY, [PARTICIPANT, proposal]),
        { status: 404, body: { error: 'context_unavailable', detail: 'Context unavailable', request_id: 'r' } }],
      'GET /contexts/delivery-1/pending-proposals': [...nothingPending(), ...nothingPending()],
      'GET /contexts/delivery-1/proposals/import-proposal': [{ status: 200, body: { proposal, candidates: [policy],
        review_payload_key: 'key-1' } }],
      'POST /contexts/delivery-1/applications': [{ status: 200, body: entity('StateChange', 'change-1', '1',
        { newVersion: 'v3' }) }],
    }, '/studio/contexts/delivery-1/review/import-proposal');
    const preview = within(await screen.findByRole('region', { name: en.delivery.policy.heading }));
    expect(JSON.parse(preview.getByTestId('policy-preview').textContent ?? '')).toEqual(PREVIEW);
    fireEvent.click(screen.getByRole('button', { name: en.review.apply.submit }));
    expect(await screen.findByText(en.review.apply.appliedImport.replace('{{version}}', 'v3'))).toBeTruthy();
    expect(await screen.findByText(en.review.errors.unavailable)).toBeTruthy();
    expect(screen.queryByRole('link', { name: en.review.apply.seeCourse })).toBeNull();
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });
});
