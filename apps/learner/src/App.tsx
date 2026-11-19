import { SessionProvider } from '@alm/auth';
import type { SessionApi } from '@alm/auth';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { RouterProvider } from 'react-router';
import type { createBrowserRouter } from 'react-router';

import type { LearnerApi } from './features/courses/learnerApi';
import { LearnerServicesProvider } from './features/courses/LearnerServices';

export interface LearnerAppProps {
  api: SessionApi;
  learner: LearnerApi;
  /** New request ids of the learner's own requests; replaceable in tests. */
  newRequestId?: () => string;
  /** Milliseconds between two reads of a running question; shorter in tests. */
  pollMs?: number;
  router: ReturnType<typeof createBrowserRouter>;
  i18n: i18n;
  /** Full-page navigation to the BFF login and the provider logout; replaceable in tests. */
  navigate?: (url: string) => void;
}

export function LearnerApp({ api, learner, newRequestId, pollMs, router, i18n, navigate }: LearnerAppProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <SessionProvider api={api} {...(navigate ? { navigate } : {})}>
        <LearnerServicesProvider api={learner} {...(newRequestId ? { newRequestId } : {})}
          {...(pollMs === undefined ? {} : { pollMs })}>
          <RouterProvider router={router} />
        </LearnerServicesProvider>
      </SessionProvider>
    </I18nextProvider>
  );
}
