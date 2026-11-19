import { Button, StatusMessage } from '@alm/ui';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import type { Activity, CourseView, OwnProgress, Question, QuestionView } from '../courses/learnerApi';
import { LearnerError } from '../courses/learnerApi';
import { useCsrfToken, useLearnerServices } from '../courses/LearnerServices';
import { coursePath, progressPath } from '../courses/paths';
import { FAILURES, assessmentAnchor, findActivity, isIntent, isWebAddress, named, namesOf, readable } from '../course/model';
import { Section } from '../course/Section';
import { useLearnerRecords } from '../progress/useLearnerRecords';
import { useWhen } from '../progress/when';
import { QuestionItem } from './QuestionItem';
import { coachHolds, isAbout } from './questions';

/** Activities whose learners hand something in; an explanation is read, and asked about. */
const SUBMITTED = ['PRACTICE', 'ASSESS'];

/**
 * A request id per request the learner sends, so a retry after a lost answer is recorded once (S12); once a request
 * is answered, the same text again is a new request.
 */
function useRequestIds() {
  const { newRequestId } = useLearnerServices();
  const ids = useRef(new Map<string, string>());
  return {
    id(key: string) {
      let id = ids.current.get(key);
      if (id === undefined) {
        id = newRequestId();
        ids.current.set(key, id);
      }
      return id;
    },
    answered() {
      ids.current.clear();
    },
  };
}

/** Why a write failed: a conflict, the core's reason for a refusal, or anything else (a retry is recorded once). */
function writeFailure(error: unknown): { reason: 'conflict' | 'refused' | 'failed'; detail: string } {
  if (error instanceof LearnerError && error.reason === 'conflict') return { reason: 'conflict', detail: '' };
  if (error instanceof LearnerError && error.reason === 'not-open' && error.detail) return { reason: 'refused', detail: error.detail };
  return { reason: 'failed', detail: '' };
}

/** Two buttons to confirm or step back; the confirmation is focused when it appears. */
function Confirmation({ text, confirm, cancel, busy, onConfirm, onCancel }: {
  text: string; confirm: string; cancel: string; busy: boolean; onConfirm(): void; onCancel(): void;
}) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => group.current?.querySelector('button')?.focus(), []);
  return (
    <div ref={group} role="group" aria-labelledby={`${id}-text`}>
      <p id={`${id}-text`}>{text}</p>
      <div className="alm-actions">
        <Button busy={busy} onClick={onConfirm}>{confirm}</Button>
        <Button variant="secondary" onClick={onCancel}>{cancel}</Button>
      </div>
    </div>
  );
}

function Task({ course, activity }: { course: CourseView; activity: Activity }) {
  const { t } = useTranslation();
  const names = namesOf(course);
  const materials = course.materials.filter((material) => activity.materials.some((ref) => ref.id === material.ref.id));
  return (
    <Section heading={t('practice.task.heading')}>
      <p className="alm-muted">{readable(activity.format)}</p>
      <p className="alm-text">{activity.instruction}</p>
      {activity.expected_evidence.length ? (
        <p>{t('course.activity.evidence', { evidence: activity.expected_evidence.join('; ') })}</p>
      ) : null}
      {activity.strategies.length ? (
        <p>{t('course.activity.strategies', { names: named(names.strategies, activity.strategies) })}</p>
      ) : null}
      {materials.length ? (
        <>
          <h3>{t('practice.task.materials')}</h3>
          <ul>
            {materials.map((material) => (
              <li key={material.ref.id}>
                {isWebAddress(material.content_or_locator)
                  ? <a href={material.content_or_locator} rel="noreferrer">{material.title}</a>
                  : <>{material.title}: {material.content_or_locator}</>}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {activity.assessment ? (
        <p>
          <Link to={{ pathname: coursePath(course.context_id), hash: assessmentAnchor(activity.assessment.id) }}>
            {t('course.activity.assessment')}
          </Link>
        </p>
      ) : null}
    </Section>
  );
}

/** Write an attempt and submit it once the learner confirms; one request id per text (S12). */
function AttemptForm({ contextId, activity, onSubmitted }: { contextId: string; activity: Activity; onSubmitted(): void }) {
  const { t } = useTranslation();
  const id = useId();
  const { api } = useLearnerServices();
  const csrfToken = useCsrfToken();
  const requestIds = useRequestIds();
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const review = (event: FormEvent) => {
    event.preventDefault();
    setOutcome(null);
    setEmpty(text.trim() === '');
    if (text.trim() !== '') setConfirming(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.submitAttempt(csrfToken, contextId, activity.ref, text, requestIds.id(text));
      requestIds.answered();
      setText('');
      setOutcome({ tone: 'info', text: t('practice.attempt.submitted') });
      onSubmitted();
    } catch (error) {
      const { reason, detail } = writeFailure(error);
      setOutcome({ tone: 'error', text: t(`practice.attempt.${reason}`, { detail }) });
    }
    setBusy(false);
    setConfirming(false);
  };

  return (
    <Section heading={t('practice.attempt.heading')} intro={t('practice.attempt.intro')}>
      <form className="alm-form" noValidate onSubmit={review}>
        <div className="alm-field">
          <label htmlFor={`${id}-text`}>{t('practice.attempt.label')}</label>
          {empty ? <p id={`${id}-error`} className="alm-field-error">{t('practice.attempt.empty')}</p> : null}
          <textarea id={`${id}-text`} className="alm-input" rows={8} value={text} aria-invalid={empty}
            readOnly={confirming} {...(empty ? { 'aria-describedby': `${id}-error` } : {})}
            onChange={(event) => setText(event.target.value)} />
        </div>
        {confirming ? (
          <Confirmation text={t('practice.attempt.confirm')} confirm={t('practice.attempt.confirmSubmit')}
            cancel={t('practice.attempt.keepEditing')} busy={busy} onConfirm={() => void submit()}
            onCancel={() => setConfirming(false)} />
        ) : <Button type="submit">{t('practice.attempt.submit')}</Button>}
      </form>
      {outcome ? <StatusMessage tone={outcome.tone}>{outcome.text}</StatusMessage> : null}
    </Section>
  );
}

/**
 * Ask the Socratic coach (the default) or the Teacher about this activity, its id naming the problem. While the coach
 * holds the activity, the Teacher is asked only once the learner confirms leaving the coach: an explicit switch.
 */
function AskForm({ contextId, activity, coaching, onAsked }: {
  contextId: string; activity: Activity; coaching: boolean; onAsked(question: QuestionView): void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const { api } = useLearnerServices();
  const csrfToken = useCsrfToken();
  const requestIds = useRequestIds();
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ask = async (intent: Question['intent'], switchFromSocratic: boolean) => {
    setConfirming(false);
    setBusy(true);
    const question: Question = { text, intent, problem_key: activity.ref.id, activities: [activity.ref],
      switch_from_socratic: switchFromSocratic };
    try {
      onAsked(await api.ask(csrfToken, contextId, question, requestIds.id(JSON.stringify(question))));
      requestIds.answered();
      setText('');
    } catch (error) {
      const { reason, detail } = writeFailure(error);
      setFailure(t(`practice.ask.${reason}`, { detail }));
    }
    setBusy(false);
  };

  const choose = (event: FormEvent | null, teacher: boolean) => {
    event?.preventDefault();
    setFailure(null);
    setEmpty(text.trim() === '');
    if (text.trim() === '') return;
    if (!teacher) void ask('SOCRATIC_GUIDANCE', false);
    else if (coaching) setConfirming(true);
    else void ask('EXPLAIN', false);
  };

  return (
    <Section heading={t('practice.ask.heading')} intro={t('practice.ask.intro')}>
      <form className="alm-form" noValidate onSubmit={(event) => choose(event, false)}>
        <div className="alm-field">
          <label htmlFor={`${id}-text`}>{t('practice.ask.label')}</label>
          {empty ? <p id={`${id}-error`} className="alm-field-error">{t('practice.ask.empty')}</p> : null}
          <textarea id={`${id}-text`} className="alm-input" rows={3} value={text} aria-invalid={empty}
            readOnly={confirming} {...(empty ? { 'aria-describedby': `${id}-error` } : {})}
            onChange={(event) => setText(event.target.value)} />
        </div>
        {confirming ? (
          <Confirmation text={t('practice.ask.confirm')} confirm={t('practice.ask.confirmTeacher')}
            cancel={t('practice.ask.stay')} busy={busy} onConfirm={() => void ask('EXPLAIN', true)}
            onCancel={() => setConfirming(false)} />
        ) : (
          <div className="alm-actions">
            <Button type="submit" busy={busy}>{t('practice.ask.coach')}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => choose(null, true)}>{t('practice.ask.teacher')}</Button>
          </div>
        )}
      </form>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
    </Section>
  );
}

function Attempts({ progress, activityId }: { progress: OwnProgress; activityId: string }) {
  const { t } = useTranslation();
  const when = useWhen();
  const attempts = progress.evidence.filter((evidence) => evidence.activity.id === activityId)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  return (
    <Section heading={t('practice.attempts.heading')}>
      {attempts.length === 0 ? <p className="alm-muted">{t('practice.attempts.none')}</p> : (
        <ol className="alm-cards">
          {attempts.map((evidence) => (
            <li key={evidence.ref.id} className="alm-card">
              <p className="alm-muted">{t('practice.attempts.submitted', { at: when(evidence.observed_at) })}</p>
              <p className="alm-text">{evidence.content_or_locator}</p>
              {progress.evaluations.filter((evaluation) => evaluation.evidence.some((ref) => ref.id === evidence.ref.id))
                .map((evaluation) => (
                  <p key={evaluation.ref.id}>
                    {t('practice.attempts.evaluated', { mode: t(evaluation.mode === 'FORMAL' ? 'progress.mode.FORMAL' : 'progress.mode.FORMATIVE') })}
                  </p>
                ))}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Questions({ questions, sources }: { questions: QuestionView[]; sources: Map<string, string> }) {
  const { t } = useTranslation();
  return (
    <Section heading={t('practice.questions.heading')}>
      {questions.length === 0 ? <p className="alm-muted">{t('practice.questions.none')}</p> : (
        <ol className="alm-cards">
          {questions.map((question) => <QuestionItem key={question.request_id} question={question} sources={sources} />)}
        </ol>
      )}
    </Section>
  );
}

/** Practice one activity of the course (S13 part 2): what to do, an attempt, questions to the coach or the Teacher. */
export function PracticePage() {
  const { t } = useTranslation();
  const { contextId = '', activityId = '' } = useParams();
  const { records, asked, reloadProgress } = useLearnerRecords(contextId);
  const back = <p><Link to={coursePath(contextId)}>{t('practice.back')}</Link></p>;

  let body: ReactNode;
  if (records.status === 'loading') body = <StatusMessage>{t('practice.loading')}</StatusMessage>;
  else if (records.status === 'error') body = <StatusMessage tone="error">{t(FAILURES[records.reason])}</StatusMessage>;
  else {
    const found = findActivity(records.course, activityId);
    if (!found) body = <StatusMessage tone="error">{t('practice.missing')}</StatusMessage>;
    else {
      const { activity, node } = found;
      const intent = isIntent(activity.intent) ? t(`course.intent.${activity.intent}`) : readable(activity.intent);
      const place = node === records.course.structure ? records.course.title : node.name;
      const questions = records.questions.filter((question) => isAbout(question, activity.ref.id));
      const sources = namesOf(records.course).materials;
      return (
        <>
          <h1>{t('practice.title', { intent, place })}</h1>
          <p className="alm-lead">{records.course.title}</p>
          {back}
          <Task course={records.course} activity={activity} />
          {SUBMITTED.includes(activity.intent) ? (
            <>
              <AttemptForm contextId={contextId} activity={activity} onSubmitted={reloadProgress} />
              <Attempts progress={records.progress} activityId={activity.ref.id} />
            </>
          ) : null}
          <AskForm contextId={contextId} activity={activity} coaching={coachHolds(records.questions, activity.ref.id)}
            onAsked={asked} />
          <Questions questions={questions} sources={sources} />
          <p><Link to={progressPath(contextId)}>{t('practice.progress')}</Link></p>
        </>
      );
    }
  }
  return (
    <>
      {body}
      {back}
    </>
  );
}
