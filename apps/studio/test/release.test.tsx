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
const PROJECT = ref('Resource', 'authoring-project:abc', 'p5');
const ASSESSMENT = ref('Resource', 'assessment-package', 'a1');
const DOMAIN = ref('DomainModel', 'authoring-project:abc:model', 'p5');
const DESIGN = ref('LearningDesign', 'design-1', 'd1');
const MANIFEST = { format: 'authoring-release', format_version: 1, authoring_context: 'ctx', project: PROJECT,
  domain: DOMAIN, design: DESIGN, artifacts: [ASSESSMENT] };
const CONTEXT = entity('ExecutionContext', 'ctx', '9', { status: 'DRAFT', mode: 'PREPARATION', models: [] });
const ENTITIES = [
  entity('Resource', RELEASE.id, RELEASE.version, { title: 'Authoring release: synthetic-course',
    contentOrLocator: JSON.stringify(MANIFEST) }),
  entity('Resource', PROJECT.id, PROJECT.version, { title: 'Authoring project: synthetic-course',
    contentOrLocator: JSON.stringify({ format: 'authoring-project', project_id: 'synthetic-course',
      artifacts: [{ key: 'assessment', kind: 'ASSESSMENT', resource: ASSESSMENT, depends_on: [], definitions: [] }] }) }),
  entity('Resource', ASSESSMENT.id, ASSESSMENT.version, { title: 'Proposed ASSESSMENT package', contentOrLocator: '{}' }),
  entity('LearningDesign', DESIGN.id, DESIGN.version, { name: 'Prompting syllabus' }),
];
const receipt = (proposal: string) => ({ proposal: ref('ChangeProposal', proposal, '3'),
  decision: ref('HumanDecision', `${proposal}-decision`, '1'), change: ref('StateChange', `${proposal}-change`, '1') });
const inspection = (extra: Record<string, unknown> = {}) => ({
  release: RELEASE, manifest: MANIFEST, receipt: receipt('p-release'), project_receipt: receipt('p-project'),
  artifacts: [{ resource: ASSESSMENT, receipt: receipt('p-assessment') }],
  closure: [DOMAIN, DESIGN, ASSESSMENT, PROJECT], findings: [], ...extra,
});

const signedIn: Reply = { status: 200, body: SESSION };
const INSPECTION = 'GET /contexts/ctx/resources/authoring-release:abc/versions/r2/release';
const PATH = '/studio/contexts/ctx/releases/authoring-release%3Aabc/versions/r2';
const opened = (inspected: Reply) => ({
  'GET /auth/session': [signedIn],
  'GET /contexts/ctx': [{ status: 200, body: { context: CONTEXT, entities: [CONTEXT, ...ENTITIES], findings: [] } } as Reply],
  'GET /contexts/ctx/pending-proposals': [{ status: 200, body: { proposals: [] } } as Reply],
  [INSPECTION]: [inspected],
});
const region = (name: string) => within(screen.getByRole('region', { name }));

afterEach(cleanup);

describe('an applied release (S10)', () => {
  it('says who approved each part and what it freezes, and creates its delivery course', async () => {
    const { requests, router } = await renderStudio({
      ...opened({ status: 200, body: inspection() }),
      'POST /courses': [{ status: 200, body: { context_id: 'delivery-1', policy_ref: ref('PolicySet', 'course:delivery-1', '1') } }],
    }, PATH);
    expect((await screen.findByTestId('release-verdict')).textContent).toBe(en.release.ready);
    const approvals = region(en.release.approvals.heading);
    expect(approvals.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      `The release “Authoring release: synthetic-course”: approved and applied. ${en.release.approvals.read}`,
      `The project “Authoring project: synthetic-course”: approved and applied. ${en.release.approvals.read}`,
      `Assessment: Proposed ASSESSMENT package: approved and applied. ${en.release.approvals.read}`,
    ]);
    expect(approvals.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      ['p-release', 'p-project', 'p-assessment'].map((id) => `/studio/contexts/ctx/review/${id}`));
    const frozen = region(en.release.frozen.heading);
    expect(frozen.getByText(en.release.frozen.intro_other.replace('{{count}}', '4'))).toBeTruthy();
    expect(frozen.getByText('Resource (2)')).toBeTruthy();
    expect(frozen.getByText('Prompting syllabus (version d1)')).toBeTruthy();
    expect(region(en.release.findings.heading).getByText(en.release.findings.none)).toBeTruthy();

    const delivery = region(en.release.delivery.heading);
    fireEvent.change(delivery.getByLabelText(en.home.courseLabel), { target: { value: 'delivery-1' } });
    fireEvent.click(delivery.getByRole('button', { name: en.release.delivery.submit }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio/contexts/delivery-1/course'));
    const post = requests.find((request) => request.method === 'POST')!;
    expect(post.headers.get('X-CSRF-Token')).toBe(SESSION.csrf_token);
    expect(await post.json()).toEqual({ context_id: 'delivery-1' });
  });

  it('lists what stands in the way of delivering it, and offers no delivery course', async () => {
    await renderStudio(opened({ status: 200, body: inspection({ project_receipt: null, findings: [{
      code: 'RELEASE_PROJECT_RECEIPT', target: PROJECT.id, severity: 'BLOCKING',
      reason: 'No valid approved and applied proposal in this context covers this exact version.',
      resolution: 'Correct the data or provide the required configuration.' }] }) }), PATH);
    expect((await screen.findByTestId('release-verdict')).textContent).toBe(en.release.notReady_one.replace('{{count}}', '1'));
    expect(region(en.release.approvals.heading).getByText(
      'The project “Authoring project: synthetic-course”: no approval of this exact version was found.')).toBeTruthy();
    const findings = within(screen.getByTestId('release-findings'));
    expect(findings.getByText(/No valid approved and applied proposal/).textContent)
      .toBe('No valid approved and applied proposal in this context covers this exact version. (RELEASE_PROJECT_RECEIPT)');
    expect(findings.getByText('What to do: Correct the data or provide the required configuration.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: en.release.delivery.heading })).toBeNull();
  });

  it('says why a release cannot be inspected', async () => {
    await renderStudio(opened({ status: 422, body: { error: 'validation',
      detail: 'The release is not applied in its authoring context', request_id: 'r' } }), PATH);
    expect(await screen.findByText(en.release.refused.replace('{{detail}}', 'The release is not applied in its authoring context')))
      .toBeTruthy();
    expect(screen.queryByTestId('release-verdict')).toBeNull();
  });

  it('is linked from its applied proposal', async () => {
    const proposal = entity('ChangeProposal', 'p-release', '3', { status: 'APPLIED', findings: [],
      proposedChange: 'Freeze the exact reviewed project selection as an immutable release.' });
    await renderStudio({
      'GET /auth/session': [signedIn],
      'GET /contexts/ctx': [{ status: 200, body: { context: CONTEXT, entities: [CONTEXT, ...ENTITIES, proposal], findings: [] } }],
      'GET /contexts/ctx/pending-proposals': [{ status: 200, body: { proposals: [] } }],
      'GET /contexts/ctx/proposals/p-release': [{ status: 200, body: { proposal, candidates: ENTITIES.slice(0, 1),
        review_payload_key: 'key-1' } }],
    }, '/studio/contexts/ctx/review/p-release');
    const link = await screen.findByRole('link', { name: en.review.teacher.release.inspect });
    expect(link.getAttribute('href')).toBe(PATH);
  });
});
