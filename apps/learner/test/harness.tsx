import { createLearnerClient } from '@alm/api-client/learner';
import { createSessionApi } from '@alm/auth';
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { vi } from 'vitest';

import { LearnerApp } from '../src/App';
import { createLearnerApi } from '../src/features/courses/learnerApi';
import { createLearnerI18n } from '../src/i18n';
import { LEARNER_BASENAME, learnerRoutes } from '../src/routes';

export const SESSION = { subject_key: 'auto-0123456789abcdef0123', csrf_token: 'csrf-1', expires_at: '2026-11-18T10:00:00Z' };

/** A reply of the fake API: a status and a JSON body, or `network` for a request that gets no answer. */
export type Reply = { status: number; body?: unknown } | 'network';

/**
 * Render the learner app over a fake Learner API. Replies are queued per `METHOD /path`; a request without a queued
 * reply fails the test. Every request is recorded.
 */
export async function renderLearner(replies: Record<string, Reply[]>, path = '/learn/') {
  const requests: Request[] = [];
  const client = createLearnerClient({
    baseUrl: 'http://learn.test',
    fetch: async (request: Request) => {
      requests.push(request.clone());
      const key = `${request.method} ${decodeURIComponent(new URL(request.url).pathname)}`;
      const reply = replies[key]?.shift();
      if (!reply) throw new Error(`Unexpected request ${key}`);
      if (reply === 'network') throw new TypeError('Failed to fetch');
      return Response.json(reply.body ?? { error: 'x', detail: 'x', request_id: 'r' }, { status: reply.status });
    },
  });
  const navigate = vi.fn();
  let issued = 0;
  const newRequestId = () => `request-${(issued += 1)}`;
  const router = createMemoryRouter(learnerRoutes, { basename: LEARNER_BASENAME, initialEntries: [path] });
  render(
    <LearnerApp api={createSessionApi(client)} learner={createLearnerApi(client)} newRequestId={newRequestId}
      navigate={navigate} router={router} i18n={await createLearnerI18n()} />,
  );
  return { navigate, requests, router };
}

const ref = (type: string, id: string) => ({ type, id, version: '1' });

/** A course view as the Learner API projects it (D20): two phases, one unit each, an assessment with a rubric. */
export const COURSE = {
  context_id: 'architecture-delivery',
  title: 'Software architecture',
  outcomes: [
    { ref: ref('LearningOutcome', 'o-1'), statement: 'Explain the trade-offs of layered architectures',
      kind: null, target_level: null, competences: [ref('Topic', 't-1')] },
  ],
  competences: [{ ref: ref('Topic', 't-1'), name: 'Architectural styles', definition: 'Recurring structures.' }],
  strategies: [{ ref: ref('TeachingStrategy', 's-1'), name: 'Worked examples', family: 'DIRECT',
    rationale: 'Show a complete solution before practice.', constraints: [] }],
  structure: {
    ref: ref('ProcessNode', 'root'), kind: 'COURSE', name: 'Software architecture', composition: null,
    estimated_duration: null, outcomes: [], strategies: [], activities: [],
    children: [
      { ref: ref('ProcessNode', 'p-1'), kind: 'PHASE', name: 'Foundations', composition: null,
        estimated_duration: 'PT4H', outcomes: [], strategies: [], activities: [],
        children: [
          { ref: ref('ProcessNode', 'u-1'), kind: 'UNIT', name: 'Layers and tiers', composition: null,
            estimated_duration: null, outcomes: [ref('LearningOutcome', 'o-1')], strategies: [ref('TeachingStrategy', 's-1')],
            children: [],
            activities: [
              { ref: ref('ActivityDefinition', 'a-1'), intent: 'EXPLAIN', format: 'EXPOSITION',
                instruction: 'Read the chapter on layered architectures.', expected_evidence: [],
                outcomes: [ref('LearningOutcome', 'o-1')], strategies: [], materials: [ref('Resource', 'm-1')],
                assessment: null },
            ] },
        ] },
      { ref: ref('ProcessNode', 'p-2'), kind: 'PHASE', name: 'Practice', composition: null,
        estimated_duration: null, outcomes: [], strategies: [], activities: [],
        children: [
          { ref: ref('ProcessNode', 'u-2'), kind: 'UNIT', name: 'Design review', composition: null,
            estimated_duration: null, outcomes: [], strategies: [], children: [],
            activities: [
              { ref: ref('ActivityDefinition', 'a-2'), intent: 'ASSESS', format: 'CRITERIA_BASED_PRODUCT',
                instruction: 'Write a short design review of the case study.', expected_evidence: ['A design review'],
                outcomes: [ref('LearningOutcome', 'o-1')], strategies: [], materials: [],
                assessment: ref('AssessmentDefinition', 'as-1') },
            ] },
        ] },
    ],
  },
  materials: [
    { ref: ref('Resource', 'm-1'), title: 'Layered architectures', content_or_locator: 'https://example.org/layers',
      language: 'en', usage_conditions: 'Course use only.' },
  ],
  assessments: [
    { ref: ref('AssessmentDefinition', 'as-1'), activities: [ref('ActivityDefinition', 'a-2')],
      outcomes: [ref('LearningOutcome', 'o-1')], conditions: ['Individual work'], accepted_evidence: ['A design review'],
      rubric: { ref: ref('Rubric', 'r-1'), name: 'Design review rubric', criteria: [
        { key: 'tradeoffs', description: 'Names the trade-offs', outcomes: [ref('LearningOutcome', 'o-1')],
          levels: [{ key: 'partial', descriptor: 'Some trade-offs' }, { key: 'full', descriptor: 'All trade-offs' }] },
      ] } },
  ],
};
