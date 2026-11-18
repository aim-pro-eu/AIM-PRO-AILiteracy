import createClient from 'openapi-fetch';

import type { components, paths } from './generated/authoring';

export type { components, paths } from './generated/authoring';

export type SessionView = components['schemas']['SessionView'];
export type LogoutView = components['schemas']['LogoutView'];
/** The body of every error response; `error` is a stable code, `request_id` correlates logs. */
export type ErrorBody = components['schemas']['ErrorBody'];

export type AuthoringClient = ReturnType<typeof createClient<paths>>;

/**
 * The session routes, the same in both APIs (their snapshots are compared in the tests): the studio and the learner
 * app each pass their own client.
 */
export type SessionClient = ReturnType<typeof createClient<Pick<paths, '/auth/session' | '/auth/logout'>>>;

export interface AuthoringClientOptions {
  /** Origin of the API; the browser apps use their own origin (D8: same-site cookie). */
  baseUrl: string;
  fetch?: (request: Request) => Promise<Response>;
}

/** The only way front-end modules reach the Authoring API. */
export function createAuthoringClient({ baseUrl, fetch }: AuthoringClientOptions): AuthoringClient {
  return createClient<paths>({
    baseUrl,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(fetch ? { fetch } : {}),
  });
}
