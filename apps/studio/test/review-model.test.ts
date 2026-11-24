import { describe, expect, it } from 'vitest';

import type { Entity, Inbox } from '../src/features/review/reviewApi';
import {
  compareCandidates, diffValues, evaluationDraftState, latestProposals, openProposals, parseExplanation,
} from '../src/features/review/model';

const entity = (type: string, id: string, version: string, fields: Entity['fields']): Entity => ({
  type, id, version, fields, provenance: { origin: 'GENERATED_PROPOSAL', responsible: 'admin', sources: [] },
});

describe('review explanation', () => {
  it('splits the summary sentence from the diagnostics object that follows it', () => {
    const text = 'Review the exact ASSESSMENT output. {"generator_gaps":["Synthetic output"],"input_digest":"00db"}';
    expect(parseExplanation(text)).toEqual({
      summary: 'Review the exact ASSESSMENT output.',
      details: { generator_gaps: ['Synthetic output'], input_digest: '00db' },
    });
  });

  it('keeps a text without a trailing object as the summary', () => {
    expect(parseExplanation('Initialize a project from the exact approved syllabus'))
      .toEqual({ summary: 'Initialize a project from the exact approved syllabus', details: null });
  });

  it('keeps the whole text when what follows the brace is not one JSON object', () => {
    for (const text of ['Use {braces} in prose', 'List [1] {"a": 1} trailing', 'Array {"a":1} {"b":2}', 'Only ["x"]']) {
      expect(parseExplanation(text)).toEqual({ summary: text, details: null });
    }
  });
});

describe('value diff', () => {
  it('lists added, removed and changed leaves with their paths', () => {
    const before = { name: 'Rubric', criteria: [{ label: 'A', weight: 1 }], extra: true };
    const after = { name: 'Rubric 2', criteria: [{ label: 'A', weight: 2 }, { label: 'B', weight: 1 }] };
    expect(diffValues(before, after)).toEqual([
      { path: 'criteria[0].weight', kind: 'changed', before: 1, after: 2 },
      { path: 'criteria[1]', kind: 'added', after: { label: 'B', weight: 1 } },
      { path: 'extra', kind: 'removed', before: true },
      { path: 'name', kind: 'changed', before: 'Rubric', after: 'Rubric 2' },
    ]);
  });

  it('is empty for equal values and reports a change of type at its path', () => {
    expect(diffValues({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toEqual([]);
    expect(diffValues({ a: [1] }, { a: { 0: 1 } })).toEqual([{ path: 'a', kind: 'changed', before: [1], after: { 0: 1 } }]);
    expect(diffValues('x', 'y')).toEqual([{ path: '', kind: 'changed', before: 'x', after: 'y' }]);
  });
});

describe('candidate comparison', () => {
  const applied = [
    entity('Rubric', 'rubric-1', 'v1', { name: 'Old', criteria: [] }),
    entity('Resource', 'resource-1', 'v1', { title: 'Same' }),
    entity('Rubric', 'resource-1', 'v1', { name: 'Other type, same id' }),
  ];

  it('compares each candidate with the applied record of the same type and id', () => {
    const candidates = [
      entity('Rubric', 'rubric-1', 'v2', { name: 'New', criteria: [] }),
      entity('Resource', 'resource-1', 'v2', { title: 'Same' }),
      entity('Topic', 'topic-1', 'v1', { name: 'Fresh' }),
    ];
    const [rubric, resource, topic] = compareCandidates(candidates, applied);
    expect(rubric).toMatchObject({ status: 'changed', applied: applied[0],
      changes: [{ path: 'name', kind: 'changed', before: 'Old', after: 'New' }] });
    expect(resource).toMatchObject({ status: 'unchanged', applied: applied[1], changes: [] });
    expect(topic).toMatchObject({ status: 'new', applied: null, changes: [{ path: 'name', kind: 'added', after: 'Fresh' }] });
  });

  it('treats the same revision as unchanged and keeps the candidate order', () => {
    const candidates = [entity('Resource', 'resource-1', 'v1', { title: 'Same' }), applied[0]!];
    expect(compareCandidates(candidates, applied).map((c) => [c.candidate.id, c.status]))
      .toEqual([['resource-1', 'unchanged'], ['rubric-1', 'unchanged']]);
  });
});

describe('proposals of a context summary', () => {
  it('lists each ChangeProposal of the summary with its status', () => {
    const entities = [
      entity('ChangeProposal', 'p-1', 'r2', { status: 'APPROVED', proposedChange: 'One' }),
      entity('ChangeProposal', 'p-2', 'r1', { status: 'APPLIED', proposedChange: 'Two' }),
      entity('Rubric', 'p-3', 'r1', { status: 'APPROVED' }),
    ];
    expect(latestProposals(entities).map((p) => [p.id, p.fields.status])).toEqual([['p-1', 'APPROVED'], ['p-2', 'APPLIED']]);
  });

  it('keeps the latest revision when the summary also reaches a decided one (an applied evaluation, S11)', () => {
    // The context reaches the revision its decision targeted; the store's latest revision comes after it.
    const entities = [
      entity('ChangeProposal', 'p-1', 'r1', { status: 'AWAITING_DECISION', proposedChange: 'One' }),
      entity('ChangeProposal', 'p-2', 'r1', { status: 'APPLIED', proposedChange: 'Two' }),
      entity('ChangeProposal', 'p-1', 'r3', { status: 'APPLIED', proposedChange: 'One' }),
    ];
    expect(latestProposals(entities).map((p) => [p.id, p.version, p.fields.status]))
      .toEqual([['p-1', 'r3', 'APPLIED'], ['p-2', 'r1', 'APPLIED']]);
  });
});

describe('the stale rule for evaluation drafts (D38)', () => {
  const ref = (type: string, id: string, version = '1') => ({ type, id, version });
  const evidence = (id: string, learner: string, activity: string) => entity('LearningEvidence', id, '1', {
    learner: ref('Participant', learner), activity: ref('ActivityDefinition', activity) });
  const change = (base: string, next: string, cause: { type: string; id: string; version: string }) =>
    entity('StateChange', `change-${next}`, '1', { baseVersion: base, newVersion: next, cause });
  const judged = evidence('evidence-judged', 'participant-learner', 'activity-assess');
  const evaluation = entity('Evaluation', 'evaluation-1', '1', { evidence: [ref('LearningEvidence', 'evidence-judged')] });
  const proposal = entity('ChangeProposal', 'proposal-1', 'p1', {
    status: 'AWAITING_DECISION', baseContextVersion: 'v1', candidateDefinitions: [ref('Evaluation', 'evaluation-1')] });
  const inbox = (version: string, ...records: Entity[]): Inbox => ({
    context: entity('ExecutionContext', 'delivery', version, {}),
    entities: [judged, proposal, ...records], findings: [],
    pending: [{ proposal, candidates: [evaluation], reviewPayloadKey: 'key' }],
  });

  it('is current when nothing changed since the draft or only a student joined', () => {
    expect(evaluationDraftState(inbox('v1'), proposal, [evaluation])).toBe('current');
    const joined = inbox('v2', change('v1', 'v2', ref('Participant', 'participant-new')));
    expect(evaluationDraftState(joined, proposal, [evaluation])).toBe('current');
  });

  it('stays current after another student’s attempt or the student’s attempt at another activity', () => {
    const records = inbox('v3',
      evidence('evidence-other', 'participant-other', 'activity-assess'),
      evidence('evidence-practice', 'participant-learner', 'activity-practice'),
      change('v1', 'v2', ref('LearningEvidence', 'evidence-other')),
      change('v2', 'v3', ref('LearningEvidence', 'evidence-practice')));
    expect(evaluationDraftState(records, proposal, [evaluation])).toBe('current');
    expect(openProposals(records)[0]?.current).toBe(true);
  });

  it('says the student attempted the assessment again', () => {
    const records = inbox('v3',
      evidence('evidence-other', 'participant-other', 'activity-assess'),
      evidence('evidence-again', 'participant-learner', 'activity-assess'),
      change('v1', 'v2', ref('LearningEvidence', 'evidence-again')),
      change('v2', 'v3', ref('LearningEvidence', 'evidence-other')));
    expect(evaluationDraftState(records, proposal, [evaluation])).toBe('attemptedAgain');
    expect(openProposals(records)[0]?.current).toBe(false);
  });

  it('says the course changed when a proposal was applied since, another student’s evaluation included', () => {
    const records = inbox('v3',
      evidence('evidence-again', 'participant-learner', 'activity-assess'),
      change('v1', 'v2', ref('LearningEvidence', 'evidence-again')),
      change('v2', 'v3', ref('ChangeProposal', 'proposal-other')));
    expect(evaluationDraftState(records, proposal, [evaluation])).toBe('courseChanged');
    expect(evaluationDraftState(inbox('v9'), proposal, [evaluation])).toBe('courseChanged');
  });
});
