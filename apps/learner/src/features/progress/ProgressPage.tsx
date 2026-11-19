import { StatusMessage } from '@alm/ui';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import type { CourseView, Evaluation, OwnProgress, QuestionView } from '../courses/learnerApi';
import { coursePath, practicePath } from '../courses/paths';
import { FAILURES, namesOf, readable } from '../course/model';
import type { Names } from '../course/model';
import { Section } from '../course/Section';
import { QuestionItem } from '../practice/QuestionItem';
import { useLearnerRecords } from './useLearnerRecords';
import { useWhen } from './when';

/** The activity a record is about, linked to its practice page; its id when the course no longer names it. */
function ActivityLink({ contextId, activityId, names }: { contextId: string; activityId: string; names: Names }) {
  return <Link to={practicePath(contextId, activityId)}>{names.activities.get(activityId) ?? activityId}</Link>;
}

function Attempts({ course, progress, names }: { course: CourseView; progress: OwnProgress; names: Names }) {
  const { t } = useTranslation();
  const when = useWhen();
  const attempts = [...progress.evidence].sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  return (
    <Section heading={t('progress.attempts.heading')}>
      {attempts.length === 0 ? <p className="alm-muted">{t('progress.attempts.none')}</p> : (
        <ol className="alm-cards">
          {attempts.map((evidence) => (
            <li key={evidence.ref.id} className="alm-card">
              <h3><ActivityLink contextId={course.context_id} activityId={evidence.activity.id} names={names} /></h3>
              <p className="alm-muted">{t('progress.attempts.submitted', { at: when(evidence.observed_at) })}</p>
              <p className="alm-text">{evidence.content_or_locator}</p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** An applied evaluation: each criterion of its rubric with the level given and the reason, and the result. */
function EvaluationItem({ course, evaluation }: { course: CourseView; evaluation: Evaluation }) {
  const { t } = useTranslation();
  const rubric = course.assessments.find((assessment) => assessment.ref.id === evaluation.assessment.id)?.rubric ?? null;
  const mode = t(evaluation.mode === 'FORMAL' ? 'progress.mode.FORMAL' : 'progress.mode.FORMATIVE');
  return (
    <article className="alm-card">
      <h3>{t('progress.evaluations.title', { assessment: rubric?.name ?? t('progress.evaluations.untitled'), mode })}</h3>
      <table className="alm-table">
        <thead>
          <tr>
            <th scope="col">{t('progress.evaluations.criterion')}</th>
            <th scope="col">{t('progress.evaluations.level')}</th>
            <th scope="col">{t('progress.evaluations.reason')}</th>
          </tr>
        </thead>
        <tbody>
          {evaluation.judgments.map((judgment) => {
            const criterion = rubric?.criteria.find((candidate) => candidate.key === judgment.criterion_key);
            const level = criterion?.levels.find((candidate) => candidate.key === judgment.level_key);
            let given = t('progress.evaluations.notDetermined');
            if (judgment.level_key !== null && judgment.level_key !== undefined) {
              given = level
                ? t('progress.evaluations.levelText', { level: readable(level.key), descriptor: level.descriptor })
                : readable(judgment.level_key);
            }
            return (
              <tr key={judgment.criterion_key}>
                <th scope="row">{criterion?.description ?? readable(judgment.criterion_key)}</th>
                <td>{given}</td>
                <td>{judgment.reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {evaluation.result ? <p>{t('progress.evaluations.result', { result: evaluation.result })}</p> : null}
    </article>
  );
}

function LearningStates({ progress, names }: { progress: OwnProgress; names: Names }) {
  const { t } = useTranslation();
  const label = (group: 'progress' | 'verification', code: string) => {
    const key = `progress.states.${group}.${code}`;
    return t(key, { defaultValue: readable(code) });
  };
  return (
    <Section heading={t('progress.states.heading')} intro={t('progress.states.intro')}>
      {progress.learning_states.length === 0 ? <p className="alm-muted">{t('progress.states.none')}</p> : (
        <ul>
          {progress.learning_states.map((state) => (
            <li key={state.ref.id}>
              <p>{names.outcomes.get(state.outcome.id) ?? state.outcome.id}</p>
              <p className="alm-muted">
                {t('progress.states.line', { progress: label('progress', state.progress),
                  verification: label('verification', state.verification) })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Questions({ course, questions, names }: { course: CourseView; questions: QuestionView[]; names: Names }) {
  const { t } = useTranslation();
  return (
    <Section heading={t('progress.questions.heading')}>
      {questions.length === 0 ? <p className="alm-muted">{t('progress.questions.none')}</p> : (
        <ol className="alm-cards">
          {questions.map((question) => {
            const activityId = question.question.problem_key ?? question.question.activities?.[0]?.id;
            const heading = activityId && names.activities.has(activityId)
              ? <h3><ActivityLink contextId={course.context_id} activityId={activityId} names={names} /></h3> : undefined;
            return <QuestionItem key={question.request_id} question={question} sources={names.materials} heading={heading} />;
          })}
        </ol>
      )}
    </Section>
  );
}

/** The learner's own progress in a course (S13 part 2): attempts, applied evaluations, learning outcomes, questions. */
export function ProgressPage() {
  const { t } = useTranslation();
  const { contextId = '' } = useParams();
  const { records } = useLearnerRecords(contextId);
  const back = <p><Link to={coursePath(contextId)}>{t('progress.back')}</Link></p>;
  if (records.status === 'loading') return <StatusMessage>{t('progress.loading')}</StatusMessage>;
  if (records.status === 'error') {
    return (
      <>
        <StatusMessage tone="error">{t(FAILURES[records.reason])}</StatusMessage>
        {back}
      </>
    );
  }
  const { course, progress, questions } = records;
  const names = namesOf(course);
  return (
    <>
      <h1>{t('progress.title')}</h1>
      <p className="alm-lead">{course.title}</p>
      {back}
      <Attempts course={course} progress={progress} names={names} />
      <Section heading={t('progress.evaluations.heading')} intro={t('progress.evaluations.intro')}>
        {progress.evaluations.length === 0 ? <p className="alm-muted">{t('progress.evaluations.none')}</p>
          : progress.evaluations.map((evaluation) => (
            <EvaluationItem key={evaluation.ref.id} course={course} evaluation={evaluation} />
          ))}
      </Section>
      <LearningStates progress={progress} names={names} />
      <Questions course={course} questions={questions} names={names} />
    </>
  );
}
