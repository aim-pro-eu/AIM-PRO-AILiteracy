import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useCallback, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { ENDED_STATUSES } from '../course-build/buildApi';
import type { EvaluationMode, JobView } from '../course-build/buildApi';
import { useBuildServices } from '../course-build/BuildServices';
import { useFollowedJob, useSubjectKey } from '../course-build/parts';
import { LoadFailure } from '../review/parts';
import { coursePath, proposalPath } from '../review/paths';
import { ReviewError } from '../review/reviewApi';
import type { Inbox } from '../review/reviewApi';
import { useCsrfToken } from '../review/ReviewServices';
import { useInbox } from '../review/useInbox';
import { assessedAttempts, assesses } from './assessments';
import type { Attempt } from './assessments';

const MODES: readonly EvaluationMode[] = ['FORMATIVE', 'FORMAL'];

/** What became of the request for a draft: waiting, running, a proposal to read, or the fixed reason it ended. */
function DraftJob({ contextId, job }: { contextId: string; job: JobView }) {
  const { t } = useTranslation();
  const proposal = job.proposal_refs[0];
  if (proposal) {
    return (
      <>
        <StatusMessage>{t('assess.status.proposed')}</StatusMessage>
        <p><Link to={proposalPath(contextId, proposal.id)}>{t('assess.review')}</Link></p>
      </>
    );
  }
  if (!ENDED_STATUSES.includes(job.status)) {
    return <StatusMessage>{t(job.status === 'QUEUED' ? 'assess.status.queued' : 'assess.status.running')}</StatusMessage>;
  }
  return <StatusMessage tone="error">{t('assess.status.ended', { detail: job.detail ?? t(`build.jobs.status.${job.status}`) })}</StatusMessage>;
}

/** One submitted attempt: the assessment, the student's response, and a draft evaluation to ask for in a chosen mode. */
function AttemptItem({ contextId, attempt }: { contextId: string; attempt: Attempt }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const { api, newRequestId } = useBuildServices();
  const csrfToken = useCsrfToken();
  const { reload: reloadSession } = useSession();
  const [mode, setMode] = useState<EvaluationMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // A retry of the same mode replays the same request (the same job) until that job has ended.
  const sent = useRef<{ key: string; requestId: string } | null>(null);
  const follow = useCallback((next: JobView) => setJob(next), []);
  useFollowedJob(contextId, job, follow);

  const when = new Date(attempt.observedAt);
  const submitted = Number.isNaN(when.getTime()) ? attempt.observedAt
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(when);

  const request = async () => {
    if (mode === null) return;
    const ended = job !== null && ENDED_STATUSES.includes(job.status);
    if (sent.current?.key !== mode || ended) sent.current = { key: mode, requestId: newRequestId() };
    setBusy(true);
    setFailure(null);
    try {
      follow(await api.queueEvaluation(contextId, csrfToken, sent.current.requestId, { evidence: attempt.evidence, mode }));
    } catch (error) {
      const reason = error instanceof ReviewError ? error.reason : 'failed';
      const detail = error instanceof ReviewError ? error.detail ?? '' : '';
      if (reason === 'signed-out') void reloadSession();
      else setFailure(reason === 'refused' ? t('assess.refused', { detail })
        : reason === 'forbidden' ? t('assess.forbidden')
          : reason === 'conflict' ? t('assess.conflict') : t('assess.failed'));
    }
    setBusy(false);
  };

  const running = job !== null && !ENDED_STATUSES.includes(job.status);
  return (
    <li className="alm-card">
      <h2>{t('assess.attempt.heading', { learner: attempt.learner, activity: attempt.activity })}</h2>
      <p className="alm-muted">{t('assess.attempt.submitted', { at: submitted })}</p>
      <p className="alm-text">{attempt.response}</p>
      {attempt.evaluated.map((evaluated, index) => (
        <p key={index}>{t('assess.attempt.evaluated', { mode: t(`assess.mode.${evaluated === 'FORMAL' ? 'FORMAL' : 'FORMATIVE'}`) })}</p>
      ))}
      <fieldset className="alm-fieldset">
        <legend>{t('assess.mode.legend')}</legend>
        {MODES.map((value) => (
          <label key={value} className="alm-choice">
            <input type="radio" name={`${id}-mode`} value={value} checked={mode === value} onChange={() => setMode(value)} />
            {t(`assess.mode.${value}`)}
          </label>
        ))}
      </fieldset>
      <Button busy={busy || running} disabled={mode === null} onClick={() => void request()}>{t('assess.submit')}</Button>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
      {job ? <DraftJob contextId={contextId} job={job} /> : null}
    </li>
  );
}

function Attempts({ inbox }: { inbox: Inbox }) {
  const { t } = useTranslation();
  const subjectKey = useSubjectKey() ?? '';
  if (!assesses(inbox, subjectKey)) return <StatusMessage tone="error">{t('assess.notAssessor')}</StatusMessage>;
  const attempts = assessedAttempts(inbox.entities);
  return (
    <>
      <p>{t('assess.intro')}</p>
      {attempts.length === 0 ? <p className="alm-muted">{t('assess.none')}</p> : (
        <ol className="alm-cards" data-testid="assessed-attempts">
          {attempts.map((attempt) => <AttemptItem key={attempt.evidence.id} contextId={inbox.context.id} attempt={attempt} />)}
        </ol>
      )}
    </>
  );
}

/** The attempts students submitted at the course's assessments, for its assessors to evaluate (S11). */
export function AssessmentsPage({ contextId }: { contextId: string }) {
  const { t } = useTranslation();
  const { state, reload } = useInbox(contextId);
  return (
    <>
      <h1>{t('assess.title')}</h1>
      <p><Link to={coursePath(contextId)}>{t('assess.back')}</Link></p>
      {state.status === 'loading' ? <StatusMessage>{t('assess.loading')}</StatusMessage> : null}
      {state.status === 'error' ? <LoadFailure reason={state.reason} onRetry={reload} /> : null}
      {state.status === 'ready' ? <Attempts inbox={state.inbox} /> : null}
    </>
  );
}
