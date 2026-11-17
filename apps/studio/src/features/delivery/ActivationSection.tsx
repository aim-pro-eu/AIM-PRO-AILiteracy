import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { ActivationOutcome } from '../course-build/buildApi';
import { useBuildServices } from '../course-build/BuildServices';
import { refOf } from '../review/model';
import { proposalPath } from '../review/paths';
import { ReviewError } from '../review/reviewApi';
import type { Inbox } from '../review/reviewApi';
import { useCsrfToken } from '../review/ReviewServices';
import { refusals } from './delivery';

/** Propose activating an imported delivery course: a proposal to review, or the reasons it is refused, in words. */
export function ActivationSection({ inbox }: { inbox: Inbox }) {
  const { t } = useTranslation();
  const { api, newRequestId } = useBuildServices();
  const csrfToken = useCsrfToken();
  const { reload: reloadSession } = useSession();
  const contextId = inbox.context.id;
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ActivationOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // A refusal records nothing; a retry on the same course version replays an accepted proposal.
  const sent = useRef<{ key: string; requestId: string } | null>(null);

  const propose = async () => {
    const key = `${inbox.context.id}\u0000${inbox.context.version}`;
    if (sent.current?.key !== key) sent.current = { key, requestId: newRequestId() };
    setBusy(true);
    setFailure(null);
    try {
      setOutcome(await api.proposeActivation(contextId, csrfToken,
        { requestId: sent.current.requestId, baseContext: refOf(inbox.context) }));
    } catch (error) {
      const reason = error instanceof ReviewError ? error.reason : 'failed';
      const detail = error instanceof ReviewError ? error.detail ?? '' : '';
      if (reason === 'signed-out') void reloadSession();
      else setFailure(reason === 'refused' ? t('delivery.activation.refusedDetail', { detail })
        : reason === 'forbidden' ? t('delivery.activation.forbidden')
          : reason === 'conflict' ? t('delivery.activation.conflict') : t('delivery.activation.failed'));
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="course-activation">
      <h2 id="course-activation">{t('delivery.activation.heading')}</h2>
      <p>{t('delivery.activation.intro')}</p>
      <Button busy={busy} onClick={() => void propose()}>{t('delivery.activation.submit')}</Button>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
      {outcome?.proposal ? (
        <>
          <StatusMessage>{t('delivery.activation.proposed')}</StatusMessage>
          <p><Link to={proposalPath(contextId, outcome.proposal.proposal.id)}>{t('delivery.activation.review')}</Link></p>
        </>
      ) : null}
      {outcome && !outcome.proposal ? (
        <>
          <StatusMessage tone="error">{t('delivery.activation.refused', { count: outcome.findings.length })}</StatusMessage>
          <ul data-testid="activation-refusals">
            {refusals(outcome.findings).map((refusal, index) => (
              <li key={index}>{t(refusal.message, refusal.values)}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
