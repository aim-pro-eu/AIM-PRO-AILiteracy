import { useSession } from '@alm/auth';
import { StatusMessage } from '@alm/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import type { ReleaseInspection } from '../course-build/buildApi';
import { useBuildServices } from '../course-build/BuildServices';
import { CreateCourse } from '../course-build/CreateCourse';
import { readable } from '../review/model';
import { LoadFailure } from '../review/parts';
import { coursePath, importPath, proposalPath } from '../review/paths';
import { ReviewError } from '../review/reviewApi';
import type { EntityRef, Inbox, ReviewFailure } from '../review/reviewApi';
import { useInbox } from '../review/useInbox';
import { releaseReport } from './release';
import type { ReleaseReport } from './release';

type InspectionState =
  | { status: 'loading' }
  | { status: 'ready'; inspection: ReleaseInspection }
  | { status: 'error'; reason: ReviewFailure; detail: string };

/** The inspection of an applied release, read again when the release changes. */
export function useInspection(contextId: string, release: EntityRef) {
  const { api } = useBuildServices();
  const { reload: reloadSession } = useSession();
  const [state, setState] = useState<InspectionState>({ status: 'loading' });
  const { type, id, version } = release;
  useEffect(() => {
    let current = true;
    api.inspectRelease(contextId, { type, id, version }).then(
      (inspection) => current && setState({ status: 'ready', inspection }),
      (error: unknown) => {
        if (!current) return;
        const reason = error instanceof ReviewError ? error.reason : 'failed';
        if (reason === 'signed-out') void reloadSession();
        else setState({ status: 'error', reason, detail: error instanceof ReviewError ? error.detail ?? '' : '' });
      },
    );
    return () => {
      current = false;
    };
  }, [api, contextId, type, id, version, reloadSession]);
  return state;
}

function Approvals({ contextId, approvals }: { contextId: string; approvals: ReleaseReport['approvals'] }) {
  const { t } = useTranslation();
  const name = (approval: ReleaseReport['approvals'][number]) => (approval.part === 'artifact'
    ? t('release.approvals.part', { kind: approval.kind ? readable(approval.kind) : t('release.approvals.unknownKind'),
      title: approval.title })
    : t(`release.approvals.${approval.part}`, { title: approval.title }));
  return (
    <section aria-labelledby="release-approvals">
      <h2 id="release-approvals">{t('release.approvals.heading')}</h2>
      <p>{t('release.approvals.intro')}</p>
      <ul>
        {approvals.map((approval, index) => (
          <li key={index}>
            {approval.proposal
              ? <>{t('release.approvals.approved', { part: name(approval) })}{' '}
                <Link to={proposalPath(contextId, approval.proposal)}>{t('release.approvals.read')}</Link></>
              : t('release.approvals.missing', { part: name(approval) })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Frozen({ frozen }: { frozen: ReleaseReport['frozen'] }) {
  const { t } = useTranslation();
  const count = frozen.reduce((total, group) => total + group.records.length, 0);
  return (
    <section aria-labelledby="release-frozen">
      <h2 id="release-frozen">{t('release.frozen.heading')}</h2>
      <p>{t('release.frozen.intro', { count })}</p>
      {frozen.map((group) => (
        <details key={group.type} className="alm-disclosure">
          <summary>
            <span className="alm-disclosure__title">
              {t('release.frozen.type', { type: readable(group.type), count: group.records.length })}
            </span>
          </summary>
          <ul>
            {group.records.map((record) => (
              <li key={`${record.id}\u0000${record.version}`}>
                {t('release.frozen.record', { title: record.title, version: record.version })}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

function Findings({ findings }: { findings: ReleaseReport['findings'] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="release-findings">
      <h2 id="release-findings">{t('release.findings.heading')}</h2>
      {findings.length === 0 ? <p>{t('release.findings.none')}</p> : (
        <ul data-testid="release-findings">
          {findings.map((finding, index) => (
            <li key={index}>
              <p>{finding.reason} <span className="alm-muted">({finding.code})</span></p>
              {finding.resolution ? <p>{t('release.findings.resolution', { resolution: finding.resolution })}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReleaseContent({ contextId, inbox, inspection }: { contextId: string; inbox: Inbox; inspection: ReleaseInspection }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const report = releaseReport(inspection, [inbox.context, ...inbox.entities]);
  const ready = report.findings.length === 0;
  return (
    <>
      <p className="alm-lead" data-testid="release-verdict">
        {ready ? t('release.ready') : t('release.notReady', { count: report.findings.length })}
      </p>
      <Approvals contextId={contextId} approvals={report.approvals} />
      <Frozen frozen={report.frozen} />
      <Findings findings={report.findings} />
      {ready ? (
        <CreateCourse heading={t('release.delivery.heading')} intro={t('release.delivery.intro')}
          submit={t('release.delivery.submit')} existing={t('release.delivery.exists')}
          onCreated={(created) => void navigate(importPath(created, contextId, inspection.release))} />
      ) : null}
    </>
  );
}

/** An applied release of the course: its approvals, what it freezes, its findings, and its delivery course. */
export function ReleasePage({ contextId, release }: { contextId: string; release: EntityRef }) {
  const { t } = useTranslation();
  const { state, reload } = useInbox(contextId);
  const inspection = useInspection(contextId, release);
  return (
    <>
      <p><Link to={coursePath(contextId)}>{t('release.back')}</Link></p>
      <h1>{t('release.title')}</h1>
      <p>{t('release.intro')}</p>
      {state.status === 'loading' || inspection.status === 'loading' ? <StatusMessage>{t('release.loading')}</StatusMessage> : null}
      {state.status === 'error' ? <LoadFailure reason={state.reason} onRetry={reload} /> : null}
      {inspection.status === 'error' ? (
        <StatusMessage tone="error">
          {inspection.reason === 'refused' ? t('release.refused', { detail: inspection.detail })
            : inspection.reason === 'forbidden' ? t('review.errors.forbidden')
              : inspection.reason === 'unavailable' ? t('review.errors.unavailable') : t('release.failed')}
        </StatusMessage>
      ) : null}
      {state.status === 'ready' && inspection.status === 'ready'
        ? <ReleaseContent contextId={contextId} inbox={state.inbox} inspection={inspection.inspection} /> : null}
    </>
  );
}
