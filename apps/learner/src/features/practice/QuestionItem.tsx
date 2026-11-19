import { StatusMessage } from '@alm/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { QuestionView } from '../courses/learnerApi';
import { useWhen } from '../progress/when';
import { STILL_SOCRATIC, isWaiting } from './questions';

/** What became of a question: waiting, the answer with its sources, or why there is none, in words. */
function Outcome({ question, sources }: { question: QuestionView; sources: Map<string, string> }) {
  const { t } = useTranslation();
  const { response } = question;
  if (isWaiting(question)) {
    return <StatusMessage>{t(question.status === 'QUEUED' ? 'practice.questions.queued' : 'practice.questions.running')}</StatusMessage>;
  }
  if (response && response.kind !== 'FAILURE') {
    return (
      <>
        <p className="alm-text">{response.content}</p>
        {response.citations?.length ? (
          <>
            <p className="alm-muted">{t('practice.questions.sources')}</p>
            <ul>
              {response.citations.map((citation, index) => (
                <li key={index}>{sources.get(citation.source.id) ?? citation.source.id}: {citation.supportedClaim}</li>
              ))}
            </ul>
          </>
        ) : null}
      </>
    );
  }
  if (question.status === 'ABANDONED') return <StatusMessage tone="error">{t('practice.questions.abandoned')}</StatusMessage>;
  if (question.detail === STILL_SOCRATIC) return <StatusMessage>{t('practice.questions.stillSocratic')}</StatusMessage>;
  if (response || question.status === 'FAILED' || !question.detail) {
    return <StatusMessage tone="error">{t('practice.questions.failed')}</StatusMessage>;
  }
  return <StatusMessage tone="error">{t('practice.questions.noAnswer', { detail: question.detail })}</StatusMessage>;
}

/** One of the learner's questions: to whom and when, the question, and its outcome; `heading` names its activity. */
export function QuestionItem({ question, sources, heading }: {
  question: QuestionView; sources: Map<string, string>; heading?: ReactNode;
}) {
  const { t } = useTranslation();
  const when = useWhen();
  const who = t(question.question.intent === 'SOCRATIC_GUIDANCE' ? 'practice.questions.toCoach' : 'practice.questions.toTeacher');
  return (
    <li className="alm-card">
      {heading}
      <p className="alm-muted">{t('practice.questions.asked', { who, at: when(question.created) })}</p>
      <p className="alm-text">{question.question.text}</p>
      <Outcome question={question} sources={sources} />
    </li>
  );
}
