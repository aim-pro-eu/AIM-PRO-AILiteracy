import type { LearnerClient, learnerComponents } from '@alm/api-client/learner';

type Schemas = learnerComponents['schemas'];

export type LearnerCourse = Schemas['LearnerCourse'];
export type CourseView = Schemas['CourseView'];
export type CourseNode = Schemas['Node'];
export type Activity = Schemas['Activity'];
export type Assessment = Schemas['Assessment'];
export type EntityRef = Schemas['EntityRef'];
export type Evidence = Schemas['Evidence'];
export type OwnProgress = Schemas['OwnProgress'];
export type Evaluation = Schemas['Evaluation'];
export type Question = Schemas['Question'];
export type QuestionView = Schemas['QuestionView'];

/**
 * Why a Learner API request did not succeed, from its status: `not-found` (404: no such course, or no open course
 * has this code), `not-open` (422: the course is not open to learners), `forbidden` (403), `conflict` (409: a member
 * of the staff joining, or a request id used for another request), `signed-out` (401) and `failed` (anything else,
 * or no answer). A 422 to a write is the core refusing it: its `detail` says why.
 */
export type LearnerFailure = 'not-found' | 'not-open' | 'forbidden' | 'conflict' | 'signed-out' | 'failed';

export class LearnerError extends Error {
  constructor(readonly reason: LearnerFailure, readonly status: number | null, readonly detail: string | null = null) {
    super(`Learner request failed: ${reason}${status === null ? '' : ` (${status})`}`);
    this.name = 'LearnerError';
  }
}

const REASONS: Record<number, LearnerFailure> = {
  401: 'signed-out', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 422: 'not-open',
};

export interface LearnerApi {
  /** The active courses the learner is enrolled in (D19). */
  listCourses(): Promise<LearnerCourse[]>;
  /** The validated course of a delivery as its learners see it (D20). */
  course(contextId: string): Promise<CourseView>;
  /** Join the course whose code this is (D37); the same request id returns the same course. */
  join(csrfToken: string, code: string, requestId: string): Promise<LearnerCourse>;
  /** The learner's own attempts, applied evaluations and learning states in the course. */
  progress(contextId: string): Promise<OwnProgress>;
  /** Submit an attempt at an activity; the same request id and attempt return the same evidence. */
  submitAttempt(csrfToken: string, contextId: string, activity: EntityRef, content: string, requestId: string): Promise<Evidence>;
  /** Ask the Teacher or the Socratic coach: a job; the same request id and question return the same job. */
  ask(csrfToken: string, contextId: string, question: Question, requestId: string): Promise<QuestionView>;
  /** The learner's own questions in the course, newest first, each with its status and, once answered, the answer. */
  questions(contextId: string): Promise<QuestionView[]>;
}

/** The data of an answer, or a `LearnerError`; a request that gets no answer fails as `failed`. */
async function answer<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result;
  try {
    result = await request;
  } catch {
    throw new LearnerError('failed', null);
  }
  if (result.data !== undefined) return result.data;
  const detail = (result.error as { detail?: unknown } | undefined)?.detail;
  throw new LearnerError(REASONS[result.response.status] ?? 'failed', result.response.status,
    typeof detail === 'string' ? detail : null);
}

export function createLearnerApi(client: LearnerClient): LearnerApi {
  return {
    async listCourses() {
      return [...(await answer(client.GET('/courses'))).courses];
    },
    course(contextId) {
      return answer(client.GET('/courses/{context_id}', { params: { path: { context_id: contextId } } }));
    },
    join(csrfToken, code, requestId) {
      return answer(client.POST('/enrolments', {
        headers: { 'X-CSRF-Token': csrfToken }, body: { request_id: requestId, code },
      }));
    },
    progress(contextId) {
      return answer(client.GET('/courses/{context_id}/progress', { params: { path: { context_id: contextId } } }));
    },
    submitAttempt(csrfToken, contextId, activity, content, requestId) {
      return answer(client.POST('/courses/{context_id}/attempts', {
        params: { path: { context_id: contextId } }, headers: { 'X-CSRF-Token': csrfToken },
        body: { request_id: requestId, activity, content },
      }));
    },
    ask(csrfToken, contextId, question, requestId) {
      return answer(client.POST('/courses/{context_id}/questions', {
        params: { path: { context_id: contextId } }, headers: { 'X-CSRF-Token': csrfToken },
        body: { request_id: requestId, question },
      }));
    },
    async questions(contextId) {
      return [...(await answer(client.GET('/courses/{context_id}/questions', {
        params: { path: { context_id: contextId } },
      }))).questions];
    },
  };
}
