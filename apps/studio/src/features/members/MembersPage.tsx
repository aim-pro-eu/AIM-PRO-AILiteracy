import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { MemberList, MemberRole } from '../course-build/buildApi';
import { useBuildServices } from '../course-build/BuildServices';
import { isImportedDelivery } from '../delivery/delivery';
import { refOf } from '../review/model';
import { LoadFailure } from '../review/parts';
import { coursePath, proposalPath } from '../review/paths';
import { ReviewError } from '../review/reviewApi';
import type { Inbox } from '../review/reviewApi';
import { useCsrfToken } from '../review/ReviewServices';
import { useInbox } from '../review/useInbox';
import { pendingMemberships, roleKey } from './roles';
import { StudentsSection } from './StudentsSection';

/** One membership proposal in words: who joins with which role, as far as the studio reads it. */
type Proposed = { proposal: string; members: string; state: 'awaiting' | 'approved' | 'stale' };

/**
 * The members of a course and new members of its teaching staff (D25): people of the sign-in map, each with one role,
 * proposed together in one proposal (D36). The course changes only when the proposal is decided and applied in the
 * review inbox. The membership proposals not applied yet are listed: once one is applied, the others go stale (#133).
 * Students of a delivery course join with its code or are added at once, with no proposal (D37, S12b).
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
  const [chosen, setChosen] = useState<Record<string, MemberRole | ''>>({});
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState<Proposed[]>([]);
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

  const roles = (codes: readonly string[]) => codes.map((code) => t(roleKey(code), { role: code })).join(', ');
  const named = (members: { subject: string; roles: readonly string[] }[]) => members
    .map(({ subject, roles: codes }) => t('members.add.member', { subject, role: roles(codes) })).join('; ');
  const members = (list?.addable ?? []).flatMap((subject) => {
    const role = chosen[subject];
    return role ? [{ subject, role }] : [];
  });

  const propose = async () => {
    if (members.length === 0) return;
    const key = [inbox.context.version, ...members.flatMap(({ subject, role }) => [subject, role])].join('\u0000');
    if (sent.current?.key !== key) sent.current = { key, requestId: newRequestId() };
    const { requestId } = sent.current;
    setBusy(true);
    setFailure(null);
    try {
      const result = await api.proposeMembership(contextId, csrfToken,
        { requestId, baseContext: refOf(inbox.context), members });
      const entry: Proposed = { proposal: result.proposal.id, state: 'awaiting',
        members: named(members.map(({ subject, role }) => ({ subject, roles: [role] }))) };
      setProposed((earlier) => [entry, ...earlier.filter(({ proposal }) => proposal !== entry.proposal)]);
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
  const pending: Proposed[] = [...proposed, ...pendingMemberships(inbox)
    .filter(({ proposal }) => !proposed.some((entry) => entry.proposal === proposal.id))
    .map(({ proposal, members: joining, current, records }) => ({
      proposal: proposal.id, members: joining ? named(joining) : t('members.pending.unnamed'),
      state: !current ? 'stale' as const : records ? 'awaiting' as const : 'approved' as const }))];
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
      {isImportedDelivery(inbox.context) ? (
        <StudentsSection inbox={inbox} addable={list.addable} onAdded={setList} />
      ) : null}
      {pending.length > 0 ? (
        <section aria-labelledby={`${id}-pending`}>
          <h2 id={`${id}-pending`}>{t('members.pending.heading')}</h2>
          <p>{t('members.pending.intro')}</p>
          <ul data-testid="pending-memberships">
            {pending.map((entry) => (
              <li key={entry.proposal}>
                {t('members.pending.item', { members: entry.members, state: t(`members.pending.${entry.state}`) })}{' '}
                <Link to={proposalPath(contextId, entry.proposal)}>{t('members.pending.review')}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby={`${id}-add`}>
        <h2 id={`${id}-add`}>{t('members.add.heading')}</h2>
        <p>{t('members.add.intro')}</p>
        {list.addable.length === 0 ? <p className="alm-muted">{t('members.add.nobody')}</p> : (
          <>
            {list.addable.map((subject) => (
              <div key={subject} className="alm-field">
                <label htmlFor={`${id}-role-${subject}`}>{t('members.add.role', { subject })}</label>
                <select id={`${id}-role-${subject}`} className="alm-input" value={chosen[subject] ?? ''}
                  onChange={(event) => setChosen({ ...chosen, [subject]: event.target.value as MemberRole | '' })}>
                  <option value="">{t('members.add.none')}</option>
                  {list.roles.map((code) => <option key={code} value={code}>{t(roleKey(code), { role: code })}</option>)}
                </select>
              </div>
            ))}
            <Button busy={busy} disabled={members.length === 0} onClick={() => void propose()}>
              {t('members.add.submit', { count: members.length })}
            </Button>
          </>
        )}
        {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
        {proposed[0] ? (
          <>
            <StatusMessage>{t('members.add.proposed', { members: proposed[0].members })}</StatusMessage>
            <p><Link to={proposalPath(contextId, proposed[0].proposal)}>{t('members.add.review')}</Link></p>
          </>
        ) : null}
      </section>
    </>
  );
}

/** The members page of a course: who takes part, its students, the membership proposals not applied, new staff. */
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
