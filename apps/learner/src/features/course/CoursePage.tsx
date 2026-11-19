import { StatusMessage } from '@alm/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';

import type { Activity, CourseNode, CourseView } from '../courses/learnerApi';
import { LearnerError } from '../courses/learnerApi';
import type { LearnerFailure } from '../courses/learnerApi';
import { useLearnerServices } from '../courses/LearnerServices';
import { practicePath, progressPath } from '../courses/paths';
import { FAILURES, assessmentAnchor, isIntent, isWebAddress, named, namesOf, readable } from './model';
import type { Names } from './model';
import { Section } from './Section';

function ActivityItem({ contextId, activity, names }: { contextId: string; activity: Activity; names: Names }) {
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
      <p><Link to={practicePath(contextId, activity.ref.id)}>{t('course.activity.practise')}</Link></p>
    </li>
  );
}

/** A phase or unit with its activities and the nodes inside it; headings follow the depth (h3 for phases). */
function NodeSection({ contextId, node, depth, names }: {
  contextId: string; node: CourseNode; depth: number; names: Names;
}) {
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
          {node.activities.map((activity) => (
            <ActivityItem key={activity.ref.id} contextId={contextId} activity={activity} names={names} />
          ))}
        </ul>
      ) : null}
      {node.children.length ? (
        <ol className="alm-tree">
          {node.children.map((child) => (
            <NodeSection key={child.ref.id} contextId={contextId} node={child} depth={depth + 1} names={names} />
          ))}
        </ol>
      ) : null}
    </li>
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
                {structure.activities.map((activity) => (
                  <ActivityItem key={activity.ref.id} contextId={course.context_id} activity={activity} names={names} />
                ))}
              </ul>
            ) : null}
            <ol className="alm-tree">
              {structure.children.map((node) => (
                <NodeSection key={node.ref.id} contextId={course.context_id} node={node} depth={1} names={names} />
              ))}
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
  // A link from a practice page names an assessment of the course: show it once the course is on the page.
  useEffect(() => {
    if (course && location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView?.();
  }, [course, location.hash]);

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
      <p><Link to={progressPath(course.context_id)}>{t('course.progress')}</Link></p>
      <CourseContent course={course} />
      <p><Link to="/">{t('course.back')}</Link></p>
    </>
  );
}
