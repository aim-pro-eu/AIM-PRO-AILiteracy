import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { useBuildServices } from '../course-build/BuildServices';
import type { CourseEntry } from '../course-build/buildApi';
import { CreateCourse } from '../course-build/CreateCourse';
import { readable } from '../review/model';
import { buildPath, coursePath, inboxPath } from '../review/paths';

const MODES = ['PREPARATION', 'LEARNING'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED'] as const;
const ROLES = ['ADMINISTRATOR', 'CONTENT_RESPONSIBLE', 'ASSESSOR', 'OBSERVER', 'LEARNER'] as const;

/** Whether a code of the API is one the catalogue names; any other is shown with `readable`. */
const known = <T extends string>(codes: readonly T[], code: string): code is T => (codes as readonly string[]).includes(code);

function CourseItem({ course }: { course: CourseEntry }) {
  const { t } = useTranslation();
  const { mode, status } = course;
  return (
    <li>
      <p><Link to={coursePath(course.context_id)}>{course.context_id}</Link></p>
      <p className="alm-muted">
        {t('home.courseMeta', {
          mode: known(MODES, mode) ? t(`home.mode.${mode}`) : readable(mode),
          status: known(STATUSES, status) ? t(`home.status.${status}`) : readable(status),
          roles: course.roles.map((role) => (known(ROLES, role) ? t(`home.role.${role}`) : readable(role))).join(', '),
        })}
      </p>
      <p><Link to={inboxPath(course.context_id)}>{t('home.openReview')}</Link></p>
    </li>
  );
}

/** The courses the signed-in person may read, each opened from its link; no context id to type. */
function CourseList() {
  const { t } = useTranslation();
  const id = useId();
  const { api } = useBuildServices();
  const { state } = useSession();
  const [courses, setCourses] = useState<CourseEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let current = true;
    setFailed(false);
    setCourses(null);
    api.listCourses().then((listed) => { if (current) setCourses(listed); },
      () => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [api]);
  useEffect(load, [load]);

  let body;
  if (failed) {
    body = (
      <>
        <StatusMessage tone="error">{t('home.coursesFailed')}</StatusMessage>
        <Button variant="secondary" onClick={() => void load()}>{t('home.coursesRetry')}</Button>
      </>
    );
  } else if (courses === null) body = <StatusMessage>{t('home.coursesLoading')}</StatusMessage>;
  else if (courses.length === 0) {
    // A person outside the identity map has an automatic key (S12b): a teacher adds them with it.
    body = (
      <>
        <p className="alm-muted">{t('home.coursesEmpty')}</p>
        {state.status === 'signed-in' ? <p>{t('home.yourKey', { subject: state.session.subjectKey })}</p> : null}
      </>
    );
  }
  else {
    body = (
      <ul data-testid="course-list">
        {courses.map((course) => <CourseItem key={course.context_id} course={course} />)}
      </ul>
    );
  }
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{t('home.coursesHeading')}</h2>
      {body}
    </section>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      <h1>{t('home.title')}</h1>
      <p>{t('home.intro')}</p>
      <CourseList />
      <CreateCourse heading={t('home.createHeading')} intro={t('home.createIntro')} submit={t('home.create')}
        onCreated={(created) => void navigate(buildPath(created))} />
    </>
  );
}
