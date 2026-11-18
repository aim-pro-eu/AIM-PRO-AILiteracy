import '@alm/ui/styles.css';

import { createLearnerClient } from '@alm/api-client/learner';
import { createSessionApi } from '@alm/auth';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';

import { LearnerApp } from './App';
import { createLearnerApi } from './features/courses/learnerApi';
import { createLearnerI18n } from './i18n';
import { LEARNER_BASENAME, learnerRoutes } from './routes';

const root = document.getElementById('root');
if (!root) throw new Error('The learner page has no #root element');

void createLearnerI18n().then((i18n) => {
  document.documentElement.lang = i18n.language;
  const client = createLearnerClient({ baseUrl: window.location.origin });
  const router = createBrowserRouter(learnerRoutes, { basename: LEARNER_BASENAME });
  createRoot(root).render(
    <StrictMode>
      <LearnerApp api={createSessionApi(client)} learner={createLearnerApi(client)} router={router} i18n={i18n} />
    </StrictMode>,
  );
});
