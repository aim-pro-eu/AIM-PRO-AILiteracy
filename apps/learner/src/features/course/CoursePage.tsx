import { StatusMessage } from '@alm/ui';
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';

import type { Activity, CourseNode, CourseView } from '../courses/learnerApi';
import { LearnerError } from '../courses/learnerApi';
import type { LearnerFailure } from '../courses/learnerApi';
import { useLearnerServices } from '../courses/LearnerServices';

/** A code of the course (an intent, a format) in words, when the catalogue has none. */
export function readable(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').trim();
  const lower = words === words.toUpperCase() ? words.toLowerCase() : words;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const INTENTS = ['EXPLAIN', 'PRACTICE', 'ASSESS'] as const;
const isIntent = (code: string): code is (typeof INTENTS)[number] => (INTENTS as readonly string[]).includes(code);

/** Only a web address becomes a link; any other locator is shown as text. */
const isWebAddress = (value: string) => /^https?:\/\//i.test(value);

const assessmentAnchor = (id: string) => `assessment-${id}`;

/** Names of the course's records by id, for the references of activities and assessments. */
interface Names {
  outcomes: Map<string, string>;
  competences: Map<string, string>;
  strategies: Map<string, string>;
  materials: Map<string, string>;
  activities: Map<string, string>;
}

function activitiesOf(node: CourseNode): Activity[] {
  return [...node.activities, ...node.children.flatMap(activitiesOf)];
}

function namesOf(course: CourseView): Names {
  const byId = <T,>(items: readonly T[], id: (item: T) => string, name: (item: T) => string) =>
    new Map(items.map((item) => [id(item), name(item)]));
  return {
    outcomes: byId(course.outcomes, (o) => o.ref.id, (o) => o.statement),
    competences: byId(course.competences, (c) => c.ref.id, (c) => c.name),
    strategies: byId(course.strategies, (s) => s.ref.id, (s) => s.name),
    materials: byId(course.materials, (m) => m.ref.id, (m) => m.title),
    activities: byId(activitiesOf(course.structure), (a) => a.ref.id, (a) => a.instruction),
  };
}

const named = (names: Map<string, string>, refs: readonly { id: string }[]) =>
  refs.map((ref) => names.get(ref.id) ?? ref.id).join(', ');

function ActivityItem({ activity, names }: { activity: Activity; names: Names }) {
  const { t } = useTranslation();
  const intent = isIntent(activity.intent) ? t(`course.intent.${activity.intent}`) : readable(activity.intent);
  return (
    <li className="alm-card">
      <p className="alm-node__title">{intent}</p>
      <p className="alm-muted">{readable(activity.format)}</p>
      <p>{activity.instruction}</p>
      {activity.expected_evidence.length ? (
        <p>{t('course.activity.evidence', { evidence: activity.expected_evidence.join('; ') })}</p>
      ) : null}
      {activity.materials.length ? (
        <p>{t('course.activity.materials', { titles: named(names.materials, activity.materials) })}</p>
      ) : null}
      {activity.strategies.length ? (
        <p>{t('course.activity.strategies', { names: named(names.strategies, activity.strategies) })}</p>
      ) : null}
      {activity.assessment ? (
        <p><a href={`#${assessmentAnchor(activity.assessment.id)}`}>{t('course.activity.assessment')}</a></p>
      ) : null}
    </li>
  );
}

/** A phase or unit with its activities and the nodes inside it; headings follow the depth (h3 for phases). */
function NodeSection({ node, depth, names }: { node: CourseNode; depth: number; names: Names }) {
  const { t } = useTranslation();
  const Heading = `h${Math.min(depth + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
  const strategies = node.strategies.length ? named(names.strategies, node.strategies) : null;
  return (
    <li className="alm-node">
      <Heading className="alm-node__title">{node.name}</Heading>
      {node.estimated_duration ? <p className="alm-muted">{t('course.syllabus.duration', { duration: node.estimated_duration })}</p> : null}
      {strategies ? <p>{t('course.activity.strategies', { names: strategies })}</p> : null}
      {node.activities.length ? (
        <ul className="alm-cards">
          {node.activities.map((activity) => <ActivityItem key={activity.ref.id} activity={activity} names={names} />)}
        </ul>
      ) : null}
      {node.children.length ? (
        <ol className="alm-tree">
          {node.children.map((child) => <NodeSection key={child.ref.id} node={child} depth={depth + 1} names={names} />)}
        </ol>
      ) : null}
    </li>
  );
}

function Section({ heading, intro, children }: { heading: string; intro?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{heading}</h2>
      {intro ? <p>{intro}</p> : null}
      {children}
    </section>
  );
}

/** The course as its learners see it (D20): never a draft, a proposal, the staff or another learner. */
function CourseContent({ course }: { course: CourseView }) {
  const { t } = useTranslation();
  const names = namesOf(course);
  const { structure } = course;
  const empty = structure.children.length === 0 && structure.activities.length === 0;
  return (
    <>
      <Section heading={t('course.outcomes.heading')}>
        {course.outcomes.length ? (
          <ul>
            {course.outcomes.map((outcome) => (
              <li key={outcome.ref.id}>
                <p>{outcome.statement}</p>
                {outcome.competences.length ? (
                  <p className="alm-muted">{t('course.outcomes.competences', { names: named(names.competences, outcome.competences) })}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="alm-muted">{t('course.outcomes.empty')}</p>}
      </Section>

      <Section heading={t('course.syllabus.heading')} intro={t('course.syllabus.intro')}>
        {empty ? <p className="alm-muted">{t('course.syllabus.empty')}</p> : (
          <>
            {structure.activities.length ? (
              <ul className="alm-cards">
                {structure.activities.map((activity) => <ActivityItem key={activity.ref.id} activity={activity} names={names} />)}
              </ul>
            ) : null}
            <ol className="alm-tree">
              {structure.children.map((node) => <NodeSection key={node.ref.id} node={node} depth={1} names={names} />)}
            </ol>
          </>
        )}
      </Section>

      <Section heading={t('course.assessments.heading')} intro={t('course.assessments.intro')}>
        {course.assessments.length ? course.assessments.map((assessment, index) => (
          <article key={assessment.ref.id} id={assessmentAnchor(assessment.ref.id)} className="alm-card">
            <h3>{assessment.rubric?.name ?? t('course.assessments.untitled', { number: index + 1 })}</h3>
            {assessment.activities.length ? (
              <p>{t('course.assessments.activities', { activities: named(names.activities, assessment.activities) })}</p>
            ) : null}
            {assessment.outcomes.length ? (
              <p>{t('course.assessments.outcomes', { statements: named(names.outcomes, assessment.outcomes) })}</p>
            ) : null}
            {assessment.conditions.length ? (
              <>
                <h4>{t('course.assessments.conditions')}</h4>
                <ul>{assessment.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
              </>
            ) : null}
            {assessment.accepted_evidence.length ? (
              <p>{t('course.assessments.evidence', { evidence: assessment.accepted_evidence.join('; ') })}</p>
            ) : null}
            {assessment.rubric ? (
              <table className="alm-table">
                <caption>{assessment.rubric.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('course.assessments.criterion')}</th>
                    <th scope="col">{t('course.assessments.levels')}</th>
                  </tr>
                </thead>
                <tbody>
                  {assessment.rubric.criteria.map((criterion) => (
                    <tr key={criterion.key}>
                      <th scope="row">{criterion.description}</th>
                      <td>
                        <dl className="alm-levels">
                          {criterion.levels.map((level) => (
                            <div key={level.key}>
                              <dt>{readable(level.key)}</dt>
                              <dd>{level.descriptor}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="alm-muted">{t('course.assessments.noRubric')}</p>}
          </article>
        )) : <p className="alm-muted">{t('course.assessments.empty')}</p>}
      </Section>

      <Section heading={t('course.materials.heading')}>
        {course.materials.length ? (
          <ul>
            {course.materials.map((material) => (
              <li key={material.ref.id}>
                <p>
                  {isWebAddress(material.content_or_locator)
                    ? <a href={material.content_or_locator} rel="noreferrer">{material.title}</a>
                    : material.title}
                </p>
                {isWebAddress(material.content_or_locator) ? null : <p>{material.content_or_locator}</p>}
                {material.language ? <p className="alm-muted">{t('course.materials.language', { language: material.language })}</p> : null}
                <p className="alm-muted">{t('course.materials.conditions', { conditions: material.usage_conditions })}</p>
              </li>
            ))}
          </ul>
        ) : <p className="alm-muted">{t('course.materials.empty')}</p>}
      </Section>

      <Section heading={t('course.strategies.heading')}>
        {course.strategies.length ? (
          <ul>
            {course.strategies.map((strategy) => (
              <li key={strategy.ref.id}>
                <p className="alm-node__title">{strategy.name}</p>
                <p>{strategy.rationale}</p>
              </li>
            ))}
          </ul>
        ) : <p className="alm-muted">{t('course.strategies.empty')}</p>}
      </Section>
    </>
  );
}

const FAILURES: Record<LearnerFailure, 'course.unavailable' | 'course.notOpen' | 'course.notLearner' | 'course.failed'> = {
  'not-found': 'course.unavailable',
  'not-open': 'course.notOpen',
  forbidden: 'course.notLearner',
  conflict: 'course.failed',
  'signed-out': 'course.failed',
  failed: 'course.failed',
};

export function CoursePage() {
  const { t } = useTranslation();
  const { contextId = '' } = useParams();
  const location = useLocation();
  const joined = (location.state as { joined?: boolean } | null)?.joined === true;
  const { api } = useLearnerServices();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [failure, setFailure] = useState<LearnerFailure | null>(null);

  useEffect(() => {
    let current = true;
    setCourse(null);
    setFailure(null);
    api.course(contextId).then((read) => { if (current) setCourse(read); },
      (error: unknown) => { if (current) setFailure(error instanceof LearnerError ? error.reason : 'failed'); });
    return () => { current = false; };
  }, [api, contextId]);

  if (failure) {
    return (
      <>
        <StatusMessage tone="error">{t(FAILURES[failure])}</StatusMessage>
        <p><Link to="/">{t('course.back')}</Link></p>
      </>
    );
  }
  if (!course) return <StatusMessage>{t('course.loading')}</StatusMessage>;
  return (
    <>
      <h1>{course.title}</h1>
      {joined ? <StatusMessage>{t('course.joined')}</StatusMessage> : null}
      <CourseContent course={course} />
      <p><Link to="/">{t('course.back')}</Link></p>
    </>
  );
}
