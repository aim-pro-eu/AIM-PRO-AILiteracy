import type { QuestionView } from '../courses/learnerApi';

/** The core's fixed text when a question to the Teacher meets a problem the coach still holds (Socratic option b). */
export const STILL_SOCRATIC = 'The problem remains in Socratic mode; switching requires an explicit choice.';

/** A question whose job has not ended: the page reads it again until it has. */
export const isWaiting = (question: QuestionView) => question.status === 'QUEUED' || question.status === 'RUNNING';

/** The learner app names the activity as the question's problem, so the coach keeps one problem per activity. */
export const isAbout = (question: QuestionView, activityId: string) => question.question.problem_key === activityId;

/**
 * Whether the coach holds the activity, as the core decides it: the newest question on it that the core recorded (or
 * will record: one still waiting) went to the coach, with no answered question to the Teacher after it. A question
 * the core answered with a fixed text before recording it does not count.
 */
export function coachHolds(questions: readonly QuestionView[], activityId: string): boolean {
  for (const question of questions) {
    if (!isAbout(question, activityId) || (question.response === null && !isWaiting(question))) continue;
    if (question.question.intent === 'SOCRATIC_GUIDANCE') return true;
    if (question.response && ['ANSWER', 'PARTIAL_RESULT'].includes(question.response.kind)) return false;
  }
  return false;
}
