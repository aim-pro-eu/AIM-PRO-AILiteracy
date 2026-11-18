import { useSession } from '@alm/auth';
import { AppShell, StatusMessage } from '@alm/ui';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';

import { SessionMenu } from '../features/session/SessionMenu';
import { SignInPage } from '../features/session/SignInPage';
import { UnavailablePage } from '../features/session/UnavailablePage';

/** Frame of every learner page; a page is shown only to a signed-in subject. */
export function LearnerShell() {
  const { t } = useTranslation();
  const { state } = useSession();

  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

  let content;
  switch (state.status) {
    case 'loading':
      content = <StatusMessage>{t('session.loading')}</StatusMessage>;
      break;
    case 'signed-out':
      content = <SignInPage />;
      break;
    case 'error':
      content = <UnavailablePage />;
      break;
    case 'signed-in':
      content = (
        <>
          {state.signOutFailed ? <StatusMessage tone="error">{t('session.signOutFailed')}</StatusMessage> : null}
          <Outlet />
        </>
      );
  }

  return (
    <AppShell
      title={t('app.name')}
      skipLinkLabel={t('shell.skipToContent')}
      headerActions={state.status === 'signed-in' ? (
        <>
          <Link to="/">{t('shell.myCourses')}</Link>
          <SessionMenu subjectKey={state.session.subjectKey} />
        </>
      ) : null}
    >
      {content}
    </AppShell>
  );
}
