import { useSession } from '@alm/auth';
import { Button, StatusMessage } from '@alm/ui';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { ImportProposal, ReleaseInspection } from '../course-build/buildApi';
import { useBuildServices } from '../course-build/BuildServices';
import { useInspection } from '../release/ReleasePage';
import { refOf } from '../review/model';
import { LoadFailure } from '../review/parts';
import { proposalPath, releasePath } from '../review/paths';
import { ReviewError } from '../review/reviewApi';
import type { EntityRef, Inbox } from '../review/reviewApi';
import { useCsrfToken } from '../review/ReviewServices';
import { useInbox } from '../review/useInbox';
import { policyPreview, proposedChoices, scopeName, selectedBindings } from './delivery';
import type { Choice } from './delivery';
import { PolicyPreviewSection } from './PolicyPreviewSection';

/** For each requirement, the resource the release pins (proposed) or none; the teacher changes any. */
function Requirements({ requirements, choices, onChoose }: {
  requirements: ReleaseInspection['requirements']; choices: Choice[]; onChoose(index: number, choice: Choice): void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{t('delivery.import.bindings.heading')}</h2>
      <p>{t('delivery.import.bindings.intro')}</p>
      {requirements.map((requirement, index) => (
        <div key={`${requirement.requirement.id}\u0000${requirement.requirement.version}`} className="alm-field">
          <label htmlFor={`${id}-${index}`}>
            {t('delivery.import.bindings.label', { number: index + 1, purpose: requirement.purpose })}
          </label>
          {requirement.resource ? null : <p className="alm-muted">{t('delivery.import.bindings.unpinned')}</p>}
          <select id={`${id}-${index}`} className="alm-input" value={choices[index]}
            onChange={(event) => onChoose(index, event.target.value as Choice)}>
            {requirement.resource
              ? <option value="pinned">{t('delivery.import.bindings.pinned', { title: requirement.title ?? requirement.resource.id })}</option>
              : null}
            <option value="none">{t('delivery.import.bindings.none')}</option>
          </select>
        </div>
      ))}
    </section>
  );
}

function ImportForm({ contextId, authoringId, inbox, inspection }: {
  contextId: string; authoringId: string; inbox: Inbox; inspection: ReleaseInspection;
}) {
  const { t } = useTranslation();
  const { api, newRequestId } = useBuildServices();
  const csrfToken = useCsrfToken();
  const { reload: reloadSession } = useSession();
  const [choices, setChoices] = useState<Choice[]>(() => proposedChoices(inspection.requirements));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ImportProposal | null>(null);
  // A retry of the same selection reuses its request id, so the API replays instead of proposing again.
  const sent = useRef<{ key: string; requestId: string } | null>(null);
  const bindings = selectedBindings(inspection.requirements, choices);

  const propose = async (event: FormEvent) => {
    event.preventDefault();
    const key = JSON.stringify(bindings);
    if (sent.current?.key !== key) sent.current = { key, requestId: newRequestId() };
    setBusy(true);
    setFailure(null);
    try {
      setProposed(await api.proposeImport(contextId, csrfToken, {
        requestId: sent.current.requestId, release: inspection.release, authoringContext: authoringId,
        baseContext: refOf(inbox.context), scopeName: scopeName(contextId), bindings,
        completionRules: inspection.completion_rules,
      }));
    } catch (error) {
      const reason = error instanceof ReviewError ? error.reason : 'failed';
      const detail = error instanceof ReviewError ? error.detail ?? '' : '';
      if (reason === 'signed-out') void reloadSession();
      else setFailure(reason === 'refused' ? t('delivery.import.refused', { detail })
        : reason === 'forbidden' ? t('delivery.import.forbidden')
          : reason === 'conflict' ? t('delivery.import.conflict')
            : reason === 'unavailable' ? t('review.errors.unavailable') : t('delivery.import.failed'));
    }
    setBusy(false);
  };

  if (proposed) {
    return (
      <>
        <StatusMessage>{t('delivery.import.proposed', { count: proposed.bindings.length })}</StatusMessage>
        <p><Link to={proposalPath(contextId, proposed.proposal.id)}>{t('delivery.import.review')}</Link></p>
        <PolicyPreviewSection preview={policyPreview(proposed.policy_preview)} />
      </>
    );
  }
  return (
    <form className="alm-form" noValidate onSubmit={(event) => void propose(event)}>
      <Requirements requirements={inspection.requirements} choices={choices}
        onChoose={(index, choice) => setChoices((current) => current.map((value, i) => (i === index ? choice : value)))} />
      <section aria-labelledby="import-completion">
        <h2 id="import-completion">{t('delivery.import.completion.heading')}</h2>
        <p>{t('delivery.import.completion.intro', { count: inspection.completion_rules.length })}</p>
      </section>
      <p>{t('delivery.import.summary', { count: bindings.length, total: inspection.requirements.length })}</p>
      <Button type="submit" busy={busy}>{t('delivery.import.submit')}</Button>
      {failure ? <StatusMessage tone="error">{failure}</StatusMessage> : null}
    </form>
  );
}

/**
 * Import an applied release of another course into this new delivery course (S10, part 2): the resources it binds,
 * then a proposal reviewed here. The import reads the release's course with that course's own policy.
 */
export function ImportPage({ contextId, authoringId, release }: { contextId: string; authoringId: string; release: EntityRef }) {
  const { t } = useTranslation();
  const { state, reload } = useInbox(contextId);
  const inspection = useInspection(authoringId, release);
  const configured = state.status === 'ready'
    && Array.isArray(state.inbox.context.fields.models) && state.inbox.context.fields.models.length > 0;
  return (
    <>
      <p><Link to={releasePath(authoringId, release)}>{t('delivery.import.back')}</Link></p>
      <h1>{t('delivery.import.title')}</h1>
      <p>{t('delivery.import.intro', { course: contextId, from: authoringId })}</p>
      {state.status === 'loading' || inspection.status === 'loading' ? <StatusMessage>{t('delivery.import.loading')}</StatusMessage> : null}
      {state.status === 'error' ? <LoadFailure reason={state.reason} onRetry={reload} /> : null}
      {inspection.status === 'error' ? (
        <StatusMessage tone="error">
          {inspection.reason === 'refused' ? t('release.refused', { detail: inspection.detail })
            : inspection.reason === 'forbidden' ? t('review.errors.forbidden')
              : inspection.reason === 'unavailable' ? t('review.errors.unavailable') : t('release.failed')}
        </StatusMessage>
      ) : null}
      {configured ? <StatusMessage tone="error">{t('delivery.import.configured')}</StatusMessage> : null}
      {inspection.status === 'ready' && inspection.inspection.findings.length > 0
        ? <StatusMessage tone="error">{t('delivery.import.notReady')}</StatusMessage> : null}
      {state.status === 'ready' && inspection.status === 'ready' && !configured && inspection.inspection.findings.length === 0 ? (
        <ImportForm contextId={contextId} authoringId={authoringId} inbox={state.inbox} inspection={inspection.inspection} />
      ) : null}
    </>
  );
}
