import { useCallback, useEffect, useState } from 'react';

import type { CourseView, LearnerFailure, OwnProgress, QuestionView } from '../courses/learnerApi';
import { LearnerError } from '../courses/learnerApi';
import { useLearnerServices } from '../courses/LearnerServices';
import { isWaiting } from '../practice/questions';

export type LearnerRecords =
  | { status: 'loading' }
  | { status: 'error'; reason: LearnerFailure }
  | { status: 'ready'; course: CourseView; progress: OwnProgress; questions: QuestionView[] };

/**
 * The course, the learner's own records and questions in it. While a question's job has not ended, the questions are
 * read again every `pollMs`; a read that fails is tried again at the next tick.
 */
export function useLearnerRecords(contextId: string) {
  const { api, pollMs } = useLearnerServices();
  const [records, setRecords] = useState<LearnerRecords>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    setRecords({ status: 'loading' });
    Promise.all([api.course(contextId), api.progress(contextId), api.questions(contextId)]).then(
      ([course, progress, questions]) => { if (current) setRecords({ status: 'ready', course, progress, questions }); },
      (error: unknown) => {
        if (current) setRecords({ status: 'error', reason: error instanceof LearnerError ? error.reason : 'failed' });
      });
    return () => { current = false; };
  }, [api, contextId]);

  const questions = records.status === 'ready' ? records.questions : null;
  useEffect(() => {
    if (questions === null || !questions.some(isWaiting)) return;
    let current = true;
    const timer = setTimeout(() => {
      api.questions(contextId).then((read) => read, () => [...questions]).then((read) => {
        if (current) setRecords((before) => (before.status === 'ready' ? { ...before, questions: read } : before));
      });
    }, pollMs);
    return () => { current = false; clearTimeout(timer); };
  }, [api, contextId, pollMs, questions]);

  /** A question just asked, listed first until the next read. */
  const asked = useCallback((question: QuestionView) => {
    setRecords((before) => (before.status === 'ready' ? { ...before, questions: [
      question, ...before.questions.filter((listed) => listed.request_id !== question.request_id)] } : before));
  }, []);

  /** Read the learner's records again, after an attempt; a failed read keeps those shown. */
  const reloadProgress = useCallback(() => {
    api.progress(contextId).then((progress) => {
      setRecords((before) => (before.status === 'ready' ? { ...before, progress } : before));
    }, () => undefined);
  }, [api, contextId]);

  return { records, asked, reloadProgress };
}
