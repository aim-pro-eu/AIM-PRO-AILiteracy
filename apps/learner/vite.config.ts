import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Connect, Plugin } from 'vite';

import { LEARNER_BASENAME } from './src/base.ts';
import en from './src/i18n/en.json' with { type: 'json' };

// The dev realm registers the Learner API's OIDC callback and post-logout page on
// 127.0.0.1:58003 (docs/architecture/role-applications.md). The dev and preview
// servers take that address and forward the Learner API paths, so the browser sees
// one origin and the session cookie stays same-site (D8). The app lives under
// /learn/: the API's own /courses paths stay free for the proxy.
const API_URL = process.env.ALM_LEARNER_API_URL ?? 'http://127.0.0.1:58002';
const proxy = { '/auth': API_URL, '/health': API_URL, '/courses': API_URL, '/enrolments': API_URL };

/** The page title comes from the English catalogue, like every other visible string. */
function catalogueTitle(): Plugin {
  return {
    name: 'alm-catalogue-title',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace('__ALM_LEARNER_TITLE__', en.app.title) },
  };
}

/** `/` (the post-logout page) opens the app; `/join?code=…` without the base path still finds the join page. */
function rootToLearner(): Plugin {
  const redirect: Connect.NextHandleFunction = (request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://learner.invalid');
    if (url.pathname !== '/' && url.pathname !== '/join') return next();
    response.statusCode = 302;
    response.setHeader('Location', url.pathname === '/' ? LEARNER_BASENAME : `${LEARNER_BASENAME}join${url.search}`);
    response.end();
  };
  return {
    name: 'alm-root-to-learner',
    configureServer: (server) => void server.middlewares.use(redirect),
    configurePreviewServer: (server) => void server.middlewares.use(redirect),
  };
}

export default defineConfig({
  base: LEARNER_BASENAME,
  plugins: [react(), catalogueTitle(), rootToLearner()],
  server: { host: '127.0.0.1', port: 58003, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 58003, strictPort: true, proxy },
  // Source maps let the bundle check see every module the build holds (S13: no authoring code).
  build: { outDir: 'dist', sourcemap: true },
});
