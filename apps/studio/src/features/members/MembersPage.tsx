import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { MemberList, MemberRole } from '../course-build/buildApi';
import { useBuildServices } from '../course-build/BuildServices';
import { refOf } from '../review/model';
import { LoadFailure } from '../review/parts';
import { coursePath, proposalPath } from '../review/paths';
import { ReviewError } from '../review/reviewApi';
import type { Inbox } from '../review/reviewApi';
import { useCsrfToken } from '../review/ReviewServices';
import { useInbox } from '../review/useInbox';
import { roleKey } from './roles';

/**
 * The members of a course and a new member (D25): a person of the sign-in map with one role. The studio
 * proposes it; the course changes only when the proposal is decided and applied in the review inbox.
 */
function Members({ inbox }: { inbox: Inbox }) {
  const { t } = useTranslation();
  const id = useId();
  const { api, newRequestId } = useBuildServices();
  const csrfToken = useCsrfToken();
  const { reload: reloadSession } = useSession();
  const contextId = inbox.context.id;
  const [list, setList] = useState<MemberList | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [role, setRole] = useState<MemberRole | ''>('');
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState<{ subject: string; role: string; proposal: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // A retry of the same choice on the same course version replays the same request.
  const sent = useRef<{ key: string; requestId: string } | null>(null);

  useEffect(() => {
    let current = true;
    api.members(contextId).then(
      (members) => current && setList(members),
      (error: unknown) => {
        if (!current) return;
        const reason = error instanceof ReviewError ? error.reason : 'failed';
        if (reason === 'signed-out') void reloadSession();
        else setLoadFailure(reason === 'forbidden' ? t('members.forbidden') : t('members.loadFailed'));
      },
    );
    return () => {
      current = false;
    };
  }, [api, contextId, reloadSession, t]);

  const propose = async () => {
    if (!subject || !role) return;
    const key = `${inbox.context.version}\u0000${subject}\u0000${role}`;
    if (sent.current?.key !== key) sent.current = { key, requestId: newRequestId() };
    setBusy(true);
    setFailure(null);
    try {
      const result = await api.proposeMembership(contextId, csrfToken,
        { requestId: sent.current.requestId, baseContext: refOf(inbox.context), subject, role });
      setProposed({ subject, role, proposal: result.proposal.id });
    } catch (error) {
      const reason = error instanceof ReviewError ? error.reason : 'failed';
      const detail = error instanceof ReviewError ? error.detail ?? '' : '';
      if (reason === 'signed-out') void reloadSession();
      else setFailure(reason === 'refused' ? t('members.add.refused', { detail })
        : reason === 'forbidden' ? t('members.forbidden')
          : reason === 'conflict' ? t('members.add.conflict') : t('members.add.failed'));
    }
    setBusy(false);
  };

  if (loadFailure) return <StatusMessage tone="error">{loadFailure}</StatusMessage>;
  if (!list) return <StatusMessage>{t('members.loading')}</StatusMessage>;
  const roles = (codes: readonly string[]) => codes.map((code) => t(roleKey(code), { role: code })).join(', ');
  return (
    <>
      <section aria-labelledby={`${id}-members`}>
        <h2 id={`${id}-members`}>{t('members.list.heading')}</h2>
        <ul data-testid="course-members">
          {list.members.map((member) => (
            <li key={member.subject}>{t('members.list.item', { subject: member.subject, roles: roles(member.roles) })}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby={`${id}-add`}>
        <h2 id={`${id}-add`}>{t('members.add.heading')}</h2>
        <p>{t('members.add.intro')}</p>
        {list.addable.length === 0 ? <p className="alm-muted">{t('members.add.nobody')}</p> : (
          <>
            <div className="alm-field">
              <label htmlFor={`${id}-subject`}>{t('members.add.subject')}</label>
              <select id={`${id}-subject`} className="alm-input" value={subject}
                onChange={(event) => setSubject(event.target.value)}>
                <option value="">{t('members.add.choose')}</option>
                {list.addable.map((key) => <option key={key} value={key}>{key}</option>)}
              </select>
            </div>
            <div className="alm-field">
              <label htmlFor={`${id}-role`}>{t('members.add.role')}</label>
              <select id={`${id}-role`} className="alm-input" value={role}
                onChange={(event) => setRole(event.target.value as MemberRole | '')}>
                <option value="">{t('members.add.choose')}</option>
                {list.roles.map((code) => <option key={code} value={code}>{t(roleKey(code), { role: code })}</option>)}
              </select>
            </div>
            <Button busy={busy} disabled={!subject || !role} onClick={() => void propose()}>{t('members.add.submit')}</Button>
          </>
        )}
        {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
        {proposed ? (
          <>
            <StatusMessage>{t('members.add.proposed', { subject: proposed.subject, role: roles([proposed.role]) })}</StatusMessage>
            <p><Link to={proposalPath(contextId, proposed.proposal)}>{t('members.add.review')}</Link></p>
          </>
        ) : null}
      </section>
    </>
  );
}

/** The members page of a course: who takes part, with which role, and a new member to propose. */
export function MembersPage({ contextId }: { contextId: string }) {
  const { t } = useTranslation();
  const { state, reload } = useInbox(contextId);
  return (
    <>
      <h1>{t('members.title')}</h1>
      <p><Link to={coursePath(contextId)}>{t('members.back')}</Link></p>
      {state.status === 'loading' ? <StatusMessage>{t('members.loading')}</StatusMessage> : null}
      {state.status === 'error' ? <LoadFailure reason={state.reason} onRetry={reload} /> : null}
      {state.status === 'ready' ? <Members inbox={state.inbox} /> : null}
    </>
  );
}
