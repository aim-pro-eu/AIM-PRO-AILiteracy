import { describe, expect, it } from 'vitest';

import { createAuthoringClient } from '../src/index';
import { createLearnerClient } from '../src/learner';

describe('createAuthoringClient', () => {
  it('sends same-origin credentials and never caches API responses', async () => {
    const seen: Request[] = [];
    const client = createAuthoringClient({
      baseUrl: 'http://studio.test',
      fetch: async (request: Request) => {
        seen.push(request);
        return Response.json({ status: 'ok' });
      },
    });
    const { data } = await client.GET('/health');
    expect(data).toEqual({ status: 'ok' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('http://studio.test/health');
    expect(seen[0]?.credentials).toBe('same-origin');
    expect(seen[0]?.cache).toBe('no-store');
  });
});

describe('createLearnerClient (S13)', () => {
  it('sends same-origin credentials and never caches API responses', async () => {
    const seen: Request[] = [];
    const client = createLearnerClient({
      baseUrl: 'http://learn.test',
      fetch: async (request: Request) => {
        seen.push(request);
        return Response.json({ context_id: 'delivery', title: 'Architecture' });
      },
    });
    const { data } = await client.POST('/enrolments', { body: { request_id: 'join-1', code: 'abcd2345' } });
    expect(data).toEqual({ context_id: 'delivery', title: 'Architecture' });
    expect(seen[0]?.url).toBe('http://learn.test/enrolments');
    expect(seen[0]?.credentials).toBe('same-origin');
    expect(seen[0]?.cache).toBe('no-store');
  });
});
