import { Button, StatusMessage } from '@alm/ui';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { LearnerError } from '../courses/learnerApi';
import { useCsrfToken, useLearnerServices } from '../courses/LearnerServices';
import { coursePath } from '../courses/paths';

/**
 * Join a course with its code, as in Teams (D37): typed, or carried by the join link `/join?code=…`. Joining waits
 * for the learner's click. One request id per code typed, so a retry after a lost answer joins once.
 */
export function JoinPage() {
  const { t } = useTranslation();
  const id = useId();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { api, newRequestId } = useLearnerServices();
  const csrfToken = useCsrfToken();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const requestIds = useRef(new Map<string, string>());

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const typed = code.trim();
    setFailure(null);
    setEmpty(typed === '');
    if (typed === '') return;
    let requestId = requestIds.current.get(typed);
    if (requestId === undefined) {
      requestId = newRequestId();
      requestIds.current.set(typed, requestId);
    }
    setBusy(true);
    try {
      const joined = await api.join(csrfToken, typed, requestId);
      void navigate(coursePath(joined.context_id), { state: { joined: true } });
    } catch (error) {
      const reason = error instanceof LearnerError ? error.reason : 'failed';
      setFailure(reason === 'not-found' ? t('join.notFound') : reason === 'conflict' ? t('join.staff') : t('join.failed'));
      setBusy(false);
    }
  };

  return (
    <>
      <h1>{t('join.title')}</h1>
      <p>{t('join.intro')}</p>
      <form className="alm-form" noValidate onSubmit={(event) => void join(event)}>
        <div className="alm-field">
          <label htmlFor={`${id}-code`}>{t('join.code')}</label>
          <p id={`${id}-hint`} className="alm-muted">{t('join.hint')}</p>
          {empty ? <p id={`${id}-error`} className="alm-field-error">{t('join.empty')}</p> : null}
          <input id={`${id}-code`} className="alm-input" type="text" autoComplete="off" spellCheck={false}
            autoCapitalize="none" value={code} aria-invalid={empty}
            aria-describedby={empty ? `${id}-hint ${id}-error` : `${id}-hint`}
            onChange={(event) => setCode(event.target.value)} />
        </div>
        <Button type="submit" busy={busy}>{t('join.submit')}</Button>
      </form>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
      <p><Link to="/">{t('join.back')}</Link></p>
    </>
  );
}
