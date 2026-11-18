import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { LearnerCourse } from './learnerApi';
import { useLearnerServices } from './LearnerServices';
import { JOIN_PATH, coursePath } from './paths';

/** The courses the learner joined or was added to (D19, D37), each opened from its link. */
export function MyCoursesPage() {
  const { t } = useTranslation();
  const { api } = useLearnerServices();
  const { state } = useSession();
  const [courses, setCourses] = useState<LearnerCourse[] | null>(null);
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
        <StatusMessage tone="error">{t('courses.failed')}</StatusMessage>
        <Button variant="secondary" onClick={() => void load()}>{t('courses.retry')}</Button>
      </>
    );
  } else if (courses === null) body = <StatusMessage>{t('courses.loading')}</StatusMessage>;
  else if (courses.length === 0) {
    // A teacher may add a person by their key (S12b): an automatic key for someone outside the identity map.
    body = (
      <>
        <p>{t('courses.empty')}</p>
        {state.status === 'signed-in' ? <p className="alm-muted">{t('courses.yourKey', { subject: state.session.subjectKey })}</p> : null}
      </>
    );
  } else {
    body = (
      <ul data-testid="course-list">
        {courses.map((course) => (
          <li key={course.context_id}><Link to={coursePath(course.context_id)}>{course.title}</Link></li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <h1>{t('courses.title')}</h1>
      {body}
      <p><Link to={JOIN_PATH}>{t('courses.join')}</Link></p>
    </>
  );
}
