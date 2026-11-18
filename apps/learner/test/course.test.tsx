import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import { COURSE, SESSION, renderLearner } from './harness';

afterEach(cleanup);

// A new queue per render: replies are consumed.
const signedIn = () => ({ 'GET /auth/session': [{ status: 200, body: SESSION }] });
const path = `/learn/courses/${COURSE.context_id}`;
const section = (name: string) => screen.getByRole('region', { name });

describe('course view (S13, D20)', () => {
  it('shows the outcomes, the syllabus with its activities, the assessments and the materials', async () => {
    await renderLearner({ ...signedIn(), [`GET /courses/${COURSE.context_id}`]: [{ status: 200, body: COURSE }] }, path);
    expect(await screen.findByRole('heading', { level: 1, name: COURSE.title })).toBeTruthy();
    expect(screen.queryByText(en.course.joined)).toBeNull();

    const outcomes = section(en.course.outcomes.heading);
    expect(within(outcomes).getByText('Explain the trade-offs of layered architectures')).toBeTruthy();
    expect(within(outcomes).getByText(en.course.outcomes.competences.replace('{{names}}', 'Architectural styles'))).toBeTruthy();

    const syllabus = section(en.course.syllabus.heading);
    expect(within(syllabus).getByRole('heading', { level: 3, name: 'Foundations' })).toBeTruthy();
    expect(within(syllabus).getByRole('heading', { level: 4, name: 'Layers and tiers' })).toBeTruthy();
    expect(within(syllabus).getByRole('heading', { level: 3, name: 'Practice' })).toBeTruthy();
    expect(within(syllabus).getByText('Read the chapter on layered architectures.')).toBeTruthy();
    expect(within(syllabus).getByText(en.course.intent.EXPLAIN)).toBeTruthy();
    expect(within(syllabus).getByText(en.course.activity.materials.replace('{{titles}}', 'Layered architectures'))).toBeTruthy();
    expect(within(syllabus).getByText(en.course.activity.evidence.replace('{{evidence}}', 'A design review'))).toBeTruthy();
    expect(within(syllabus).getByText(en.course.activity.strategies.replace('{{names}}', 'Worked examples'))).toBeTruthy();
    const assessed = within(syllabus).getByRole('link', { name: en.course.activity.assessment });
    expect(assessed.getAttribute('href')).toBe('#assessment-as-1');

    const assessments = section(en.course.assessments.heading);
    expect(assessments.querySelector('#assessment-as-1')).not.toBeNull();
    expect(within(assessments).getByText('Individual work')).toBeTruthy();
    expect(within(assessments).getByText(en.course.assessments.evidence.replace('{{evidence}}', 'A design review'))).toBeTruthy();
    const rubric = within(assessments).getByRole('table', { name: 'Design review rubric' });
    expect(within(rubric).getByRole('rowheader', { name: 'Names the trade-offs' })).toBeTruthy();
    expect(within(rubric).getByText('All trade-offs')).toBeTruthy();

    const materials = section(en.course.materials.heading);
    expect(within(materials).getByRole('link', { name: 'Layered architectures' }).getAttribute('href'))
      .toBe('https://example.org/layers');
    expect(within(materials).getByText(en.course.materials.conditions.replace('{{conditions}}', 'Course use only.'))).toBeTruthy();

    expect(within(section(en.course.strategies.heading)).getByText('Show a complete solution before practice.')).toBeTruthy();
  });

  it('shows a material that is not a web address as text, never as a link', async () => {
    const course = { ...COURSE, materials: [{ ...COURSE.materials[0]!, content_or_locator: 'javascript:alert(1)' }] };
    await renderLearner({ ...signedIn(), [`GET /courses/${COURSE.context_id}`]: [{ status: 200, body: course }] }, path);
    const materials = await screen.findByRole('region', { name: en.course.materials.heading });
    expect(within(materials).queryByRole('link')).toBeNull();
    expect(within(materials).getByText('javascript:alert(1)')).toBeTruthy();
  });

  it('explains why a course cannot be shown', async () => {
    for (const [status, text] of [[404, en.course.unavailable], [422, en.course.notOpen], [403, en.course.notLearner],
      [500, en.course.failed]] as const) {
      await renderLearner({ ...signedIn(), [`GET /courses/${COURSE.context_id}`]: [{ status }] }, path);
      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.getByRole('link', { name: en.course.back }).getAttribute('href')).toBe('/learn/');
      cleanup();
    }
  });
});
