import createClient from 'openapi-fetch';

import type { paths } from './generated/learner';

export type { components as learnerComponents, paths as learnerPaths } from './generated/learner';

export type LearnerClient = ReturnType<typeof createClient<paths>>;

export interface LearnerClientOptions {
  /** Origin of the API; the learner app uses its own origin (D8: same-site cookie). */
  baseUrl: string;
  fetch?: (request: Request) => Promise<Response>;
}

/**
 * The only way the learner app reaches the Learner API (S13). A module of its own, so the learner build never
 * includes the Authoring API client.
 */
export function createLearnerClient({ baseUrl, fetch }: LearnerClientOptions): LearnerClient {
  return createClient<paths>({
    baseUrl,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(fetch ? { fetch } : {}),
  });
}
