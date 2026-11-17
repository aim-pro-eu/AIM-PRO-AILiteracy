import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { ReviewError } from '../review/reviewApi';
import { useCsrfToken } from '../review/ReviewServices';
import { useBuildServices } from './BuildServices';

/** The id rule of the API: lowercase letters, digits and inner hyphens, at most 64 characters. */
const COURSE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Create a course: a new context in preparation, administered by the signed-in creator. The home page and an
 * applied release (for its delivery course) name the form; `onCreated` receives the course id. The API returns a
 * course the creator already has under that id (D23): with `existing`, such a course is refused in these words
 * and the form stays open (#132); without it, the existing course is opened.
 */
export function CreateCourse({ heading, intro, submit, existing, onCreated }: {
  heading: string; intro: string; submit: string; existing?: string; onCreated(contextId: string): void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const { api } = useBuildServices();
  const csrfToken = useCsrfToken();
  const { reload: reloadSession } = useSession();
  const [courseId, setCourseId] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const value = courseId.trim();
    const problem = value === '' ? t('home.courseRequired') : COURSE_ID.test(value) ? null : t('home.createInvalid');
    setInvalid(problem);
    setFailure(null);
    if (problem) return;
    setBusy(true);
    try {
      const course = await api.createCourse(csrfToken, value);
      if (existing && !course.created) {
        setInvalid(existing);
        setBusy(false);
        return;
      }
      onCreated(course.context_id);
    } catch (error) {
      const reason = error instanceof ReviewError ? error.reason : 'failed';
      const detail = error instanceof ReviewError ? error.detail ?? '' : '';
      if (reason === 'signed-out') void reloadSession();
      else setFailure(reason === 'forbidden' ? t('home.createForbidden')
        : reason === 'conflict' ? t('home.createConflict', { detail })
          : reason === 'refused' ? t('home.createRefused', { detail }) : t('home.createFailed'));
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{heading}</h2>
      <p>{intro}</p>
      <form className="alm-form" noValidate onSubmit={(event) => void create(event)}>
        <div className="alm-field">
          <label htmlFor={`${id}-course`}>{t('home.courseLabel')}</label>
          <p id={`${id}-hint`} className="alm-muted">{t('home.courseHint')}</p>
          {invalid ? <p id={`${id}-error`} className="alm-field-error">{invalid}</p> : null}
          <input
            id={`${id}-course`}
            className="alm-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={courseId}
            aria-invalid={invalid !== null}
            aria-describedby={invalid ? `${id}-hint ${id}-error` : `${id}-hint`}
            onChange={(event) => setCourseId(event.target.value)}
          />
        </div>
        <Button type="submit" busy={busy}>{submit}</Button>
      </form>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
    </section>
  );
}
