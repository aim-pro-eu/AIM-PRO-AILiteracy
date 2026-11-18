import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import { COURSE, SESSION, renderLearner } from './harness';

afterEach(cleanup);

// A new queue per render: replies are consumed.
const signedIn = () => ({ 'GET /auth/session': [{ status: 200, body: SESSION }] });

describe('my courses (S13, D19)', () => {
  it('lists the courses the learner joined, each opened from its link', async () => {
    await renderLearner({ ...signedIn(), 'GET /courses': [{ status: 200, body: { courses: [
      { context_id: COURSE.context_id, title: COURSE.title }, { context_id: 'other', title: 'Testing' },
    ] } }] });
    expect(await screen.findByRole('heading', { level: 1, name: en.courses.title })).toBeTruthy();
    const list = await screen.findByTestId('course-list');
    expect(within(list).getByRole('link', { name: COURSE.title }).getAttribute('href'))
      .toBe(`/learn/courses/${COURSE.context_id}`);
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: en.courses.join }).getAttribute('href')).toBe('/learn/join');
  });

  it('shows a learner with no course how to join one, and their key for a teacher who adds them', async () => {
    await renderLearner({ ...signedIn(), 'GET /courses': [{ status: 200, body: { courses: [] } }] });
    expect(await screen.findByText(en.courses.empty)).toBeTruthy();
    expect(screen.getByText(en.courses.yourKey.replace('{{subject}}', SESSION.subject_key))).toBeTruthy();
    expect(screen.getByRole('link', { name: en.courses.join }).getAttribute('href')).toBe('/learn/join');
  });

  it('offers to try again when the list cannot be read', async () => {
    await renderLearner({ ...signedIn(), 'GET /courses': ['network', { status: 200, body: { courses: [] } }] });
    fireEvent.click(await screen.findByRole('button', { name: en.courses.retry }));
    expect(await screen.findByText(en.courses.empty)).toBeTruthy();
  });
});
