import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import en from '../src/i18n/en.json';
import { SESSION, renderLearner } from './harness';

afterEach(cleanup);

describe('learner app shell', () => {
  it('asks a signed-out person to sign in and returns them to the same address, the code included', async () => {
    const { navigate } = await renderLearner({ 'GET /auth/session': [{ status: 401 }] }, '/learn/join?code=abcd2345');
    expect(await screen.findByRole('heading', { name: en.signIn.title })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.session.signIn }));
    expect(navigate).toHaveBeenCalledWith('/auth/login?return_to=%2Flearn%2Fjoin%3Fcode%3Dabcd2345');
  });

  it('shows the signed-in key and signs out through the API', async () => {
    const { requests } = await renderLearner({
      'GET /auth/session': [{ status: 200, body: SESSION }],
      'GET /courses': [{ status: 200, body: { courses: [] } }],
      'POST /auth/logout': [{ status: 200, body: { end_session_url: null } }],
    });
    expect(await screen.findByText(en.session.signedInAs.replace('{{subject}}', SESSION.subject_key))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.session.signOut }));
    expect(await screen.findByRole('heading', { name: en.signIn.title })).toBeTruthy();
    expect(requests.find((r) => r.method === 'POST')?.headers.get('X-CSRF-Token')).toBe('csrf-1');
  });

  it('says when the learner service cannot be reached', async () => {
    await renderLearner({ 'GET /auth/session': [{ status: 502 }] });
    expect(await screen.findByText(en.session.unavailable)).toBeTruthy();
  });

  it('has a page for an unknown address', async () => {
    await renderLearner({ 'GET /auth/session': [{ status: 200, body: SESSION }] }, '/learn/nowhere');
    expect(await screen.findByRole('heading', { name: en.notFound.title })).toBeTruthy();
    expect(screen.getByRole('link', { name: en.notFound.home }).getAttribute('href')).toBe('/learn/');
  });
});
