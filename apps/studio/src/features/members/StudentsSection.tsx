import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { EnrolmentView, MemberList } from '../course-build/buildApi';
import { useBuildServices } from '../course-build/BuildServices';
import { refOf } from '../review/model';
import { proposalPath } from '../review/paths';
import { ReviewError } from '../review/reviewApi';
import type { Inbox } from '../review/reviewApi';
import { useCsrfToken } from '../review/ReviewServices';
import { joinLink, pendingOpening, typedKeys } from './enrolment';

/**
 * The students of a delivery course, as in Teams (D37, S12b): opening the course to students is one reviewed policy
 * change; once it is applied, the administrator creates, resets and disables its code at once, and adds students at
 * once, by people of the sign-in map or typed keys. Students take part with no proposal and no new policy version.
 */
export function StudentsSection({ inbox, addable, onAdded }: {
  inbox: Inbox; addable: readonly string[]; onAdded: (list: MemberList) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const { api, newRequestId } = useBuildServices();
  const csrfToken = useCsrfToken();
  const { reload: reloadSession } = useSession();
  const contextId = inbox.context.id;
  const [view, setView] = useState<EnrolmentView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [proposed, setProposed] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [keys, setKeys] = useState('');
  const [added, setAdded] = useState<string[] | null>(null);
  // A retry of the same request replays it: the opening on the same course version, the same students.
  const sent = useRef<{ key: string; requestId: string } | null>(null);
  const requestFor = (key: string) => {
    if (sent.current?.key !== key) sent.current = { key, requestId: newRequestId() };
    return sent.current.requestId;
  };

  useEffect(() => {
    let current = true;
    api.enrolment(contextId).then(
      (read) => current && setView(read),
      (error: unknown) => {
        if (!current) return;
        if (error instanceof ReviewError && error.reason === 'signed-out') void reloadSession();
        else setLoadFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [api, contextId, reloadSession]);

  /** Run one write; a failure is said in words: `refused` with the API's reason, otherwise `failed`. */
  const write = async (action: () => Promise<void>, refused: (detail: string) => string, failed: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      const reason = error instanceof ReviewError ? error.reason : 'failed';
      const detail = error instanceof ReviewError ? error.detail ?? '' : '';
      if (reason === 'signed-out') void reloadSession();
      else setFailure(reason === 'refused' ? refused(detail) : reason === 'forbidden' ? t('members.forbidden') : failed);
    }
    setBusy(false);
  };

  const proposeOpening = () => write(async () => {
    const requestId = requestFor(`open\u0000${inbox.context.version}`);
    const result = await api.proposeEnrolment(contextId, csrfToken, { requestId, baseContext: refOf(inbox.context) });
    setProposed(result.proposal.id);
  }, (detail) => t('members.students.refused', { detail }), t('members.students.failed'));
  const changeCode = (change: typeof api.resetEnrolmentCode) => write(async () => {
    setView(await change(contextId, csrfToken));
  }, () => t('members.students.codeFailed'), t('members.students.codeFailed'));

  const subjects = [...new Set([...addable.filter((subject) => checked[subject]), ...typedKeys(keys)])];
  const addStudents = () => write(async () => {
    const requestId = requestFor(['add', ...subjects].join('\u0000'));
    onAdded(await api.addLearners(contextId, csrfToken, { requestId, subjects }));
    setAdded(subjects);
    setChecked({});
    setKeys('');
  }, (detail) => t('members.students.add.refused', { detail }), t('members.students.add.failed'));

  let body;
  if (loadFailed) body = <StatusMessage tone="error">{t('members.students.loadFailed')}</StatusMessage>;
  else if (!view) body = <StatusMessage>{t('members.loading')}</StatusMessage>;
  else if (!view.open) {
    const opening = pendingOpening(inbox);
    const awaiting = proposed ?? (opening?.current ? opening.proposal.id : null);
    body = (
      <>
        <p>{t('members.students.notOpen')}</p>
        {proposed ? <StatusMessage>{t('members.students.proposed')}</StatusMessage> : null}
        {!proposed && opening ? (
          <p>{t('members.students.pending', { state: !opening.current ? t('members.students.stale')
            : t(opening.records ? 'members.pending.awaiting' : 'members.pending.approved') })}</p>
        ) : null}
        {awaiting ? (
          <p><Link to={proposalPath(contextId, awaiting)}>{t('members.students.review')}</Link></p>
        ) : (
          <Button busy={busy} onClick={() => void proposeOpening()}>{t('members.students.propose')}</Button>
        )}
      </>
    );
  } else {
    body = (
      <>
        <p>{t('members.students.open')}</p>
        {view.code ? (
          <dl>
            <dt>{t('members.students.code')}</dt>
            <dd><strong data-testid="enrolment-code">{view.code}</strong></dd>
            <dt>{t('members.students.link')}</dt>
            <dd><code data-testid="join-link">{joinLink(view.code)}</code></dd>
          </dl>
        ) : <p className="alm-muted">{t('members.students.noCode')}</p>}
        {view.code ? <p className="alm-muted">{t('members.students.linkNote')}</p> : null}
        <p className="alm-muted">{t('members.students.codeNote')}</p>
        {view.code ? (
          <>
            <Button busy={busy} onClick={() => void changeCode(api.resetEnrolmentCode)}>
              {t('members.students.reset')}
            </Button>{' '}
            <Button variant="secondary" busy={busy} onClick={() => void changeCode(api.disableEnrolmentCode)}>
              {t('members.students.disable')}
            </Button>
          </>
        ) : (
          <Button busy={busy} onClick={() => void changeCode(api.resetEnrolmentCode)}>{t('members.students.create')}</Button>
        )}
        <h3 id={`${id}-add`}>{t('members.students.add.heading')}</h3>
        <p>{t('members.students.add.intro')}</p>
        {addable.length > 0 ? (
          <fieldset aria-labelledby={`${id}-add`} className="alm-field">
            {addable.map((subject) => (
              <div key={subject}>
                <input id={`${id}-person-${subject}`} type="checkbox" checked={checked[subject] ?? false}
                  onChange={(event) => setChecked({ ...checked, [subject]: event.target.checked })} />{' '}
                <label htmlFor={`${id}-person-${subject}`}>{t('members.students.add.person', { subject })}</label>
              </div>
            ))}
          </fieldset>
        ) : null}
        <div className="alm-field">
          <label htmlFor={`${id}-keys`}>{t('members.students.add.keys')}</label>
          <p id={`${id}-keys-hint`} className="alm-muted">{t('members.students.add.keysHint')}</p>
          <textarea id={`${id}-keys`} className="alm-input" rows={3} value={keys} aria-describedby={`${id}-keys-hint`}
            onChange={(event) => setKeys(event.target.value)} />
        </div>
        <Button busy={busy} disabled={subjects.length === 0} onClick={() => void addStudents()}>
          {t('members.students.add.submit', { count: subjects.length })}
        </Button>
        {added ? <StatusMessage>{t('members.students.add.added', { subjects: added.join(', ') })}</StatusMessage> : null}
      </>
    );
  }
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{t('members.students.heading')}</h2>
      {body}
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
    </section>
  );
}
