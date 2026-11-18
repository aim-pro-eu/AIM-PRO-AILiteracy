# Chat 36 handoff — S13 part 1: the learner app (join, my courses, course view)

Date: 18 November 2026. Base: `main` at `9e4320f` (the merge of #147, S12b part 2).
Step: **S13, part 1** of the [prototype roadmap](../prototype-roadmap.md) (milestone M3).
No issue: S13 is specified in the roadmap's S13 section (owner answers recorded there and in the PR).
Branch `feat/s13-learner-app`, from `9e4320f`; its PR targets `main`.

No model was called; no live run. Synthetic seed and synthetic model responses only. The owner's stacks (ports
58000/58001, `/tmp/alm-demo`, `/tmp/alm-se-ai`) were not touched and their stores were not opened.

## Baseline verified before any change

PR #147 (S12b part 2) was merged before this chat, so the baseline is `main`; #141 is closed.

| Check | Result |
| --- | --- |
| `git status` | someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `9e4320f` merge of #147, `1b98137`, `ceeffcd`, `9b9f66a` merge of #146, `73cc141` |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1398 tests, OK, 341 skipped (501 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 190 tests OK |

No difference from the Chat 35 handoff, except that #147 is merged.

## Specification with the owner

The owner chose the recommended option of each question (recorded in the roadmap's S13 section, "Specification"):

1. **Address and port.** The learner app on `http://127.0.0.1:58003`, served under `/learn/`; its server forwards
   `/auth`, `/health`, `/courses` and `/enrolments` to the Learner API on 58002. The join link is
   `http://127.0.0.1:58003/learn/join?code=…`; the realm client `alm-learner-api` registers the learner app's
   callback. Cookies are scoped by host name, not port, so the Learner API gets cookies of its own
   (`alm_learner_session`, `alm_learner_login`) and a browser can be signed in to the studio and the learner app at
   once.
2. **Part 1** is the app, its typed client, sign-in, the join page, my courses and the course view (read only), the
   bundle check and a browser test joining through the link. **Part 2** is practice (attempts, the Socratic coach and
   the Teacher as jobs), progress and the browser test from practice to a reviewed evaluation.
3. **The stale rule for evaluation drafts** stays as it is; it is decided once the owner has tried the app (part 2).

## What was built

**API.** `services/api_common/auth.py`: `CookieNames`, given to the `Authenticator` (default `alm_session`,
`alm_login`); `services/learner_api/app.py`: `COOKIES` (`alm_learner_session`, `alm_learner_login`), also in the
schema app. No route or schema changed: both OpenAPI snapshots are unchanged.

**Realm.** `infra/keycloak/alm-dev-realm.json`: `alm-learner-api` redirects to `http://127.0.0.1:58003/auth/callback`
and `http://127.0.0.1:58003/` (was 58002).

**Shared packages.** `@alm/api-client`: the generator writes and checks both clients (`CLIENTS`; the header names its
snapshot; the authoring client is byte-identical); `src/generated/learner.ts`; `createLearnerClient` in its own entry
`@alm/api-client/learner`; `SessionClient`, the session routes both snapshots share. `@alm/auth`: `createSessionApi`
takes a `SessionClient`, so either app passes its own client.

**Learner app** (`apps/learner`, `@alm/learner`): `vite.config.ts` (base `/learn/`, port 58003, the proxy, `/` and
`/join` redirects, source maps), `src/shell/LearnerShell.tsx` (sign-in, unavailable, "My courses" and the session menu
in the banner), `features/session/*` (the studio's four session parts with the learner catalogue),
`features/courses/learnerApi.ts` (`LearnerApi`, `LearnerError` by status), `LearnerServices.tsx`,
`MyCoursesPage.tsx`, `features/join/JoinPage.tsx` (one request id per code typed), `features/course/CoursePage.tsx`
(outcomes and competences, syllabus by phases and units with each activity, assessments with their rubric tables,
materials, strategies; a link only for an `http(s)` locator), `src/i18n/en.json`. `scripts/check-bundle.mjs`: the
bundle check.

**Workspace.** `apps/package.json`: the `learner` workspace, `build` builds both apps, `check:bundle`; the Vitest
project `learner`; the strings scan covers `learner/src`. CI `front-end`: `npm run check:bundle` after the build.

**Studio.** The members page note now says students open the link in the learner app; `enrolment.ts` documents the
development address.

**Browser tests.** `e2e/stack/paths.mjs` (`LEARNER_APP_URL`, `LEARNER_APP_HOME`), `api.mjs` (the Learner API's
callback is the learner app's), `playwright.config.ts` (the studio built with
`VITE_ALM_LEARNER_APP_URL=http://127.0.0.1:58003/learn`; the learner app built and previewed on 58003), `support.ts`
(`learnerEn`), `enrolment.spec.ts`: `dev-unmapped` opens the join link in the learner app, signs in, finds the code
filled in and no course yet (axe), joins with "Join the course", reads the course view (axe) and finds it in My courses
(axe); the API checks (case and spaces, idempotence, a reset code refused) go through the learner app's server.

## Changes

| File | Content |
| --- | --- |
| `services/api_common/auth.py`, `services/learner_api/app.py` | cookie names per API |
| `infra/keycloak/alm-dev-realm.json` | `alm-learner-api` on 58003 |
| `apps/packages/api-client/*` | both generated clients, `createLearnerClient`, `SessionClient` |
| `apps/packages/auth/src/session.ts` | `createSessionApi(SessionClient)` |
| `apps/learner/**` (new) | the learner app, its tests and the bundle check |
| `apps/package.json`, `package-lock.json`, `vitest.config.ts`, `scripts/user-visible-strings.mjs` | the workspace |
| `apps/studio/src/i18n/en.json`, `features/members/enrolment.ts` | the join link note |
| `apps/e2e/*` | the learner app in the browser-test stack; `enrolment.spec.ts` through the app |
| `.github/workflows/aimpro-contracts.yml` | `check:bundle` |
| `tests/services/test_api_identity.py` | `CookiesPerApiTest`: each API's cookie names; one browser holds both sessions |
| `tests/services/test_dev_identity.py` | the realm's redirect and post-logout addresses |
| `apps/packages/api-client/test/*`, `apps/packages/auth/test/session.test.tsx`, `apps/tests/user-visible-strings.test.ts` | the learner client, the shared session routes, the scan |
| `apps/learner/test/*` | shell, join page, my courses, course view, bundle check (19 tests; 6 more in the shared packages) |
| `docs/architecture/role-applications.md`, `docs/plans/prototype-roadmap.md` | "Learner app (S13)", cookies, serving, smoke test, the owner's answers |

Order of work: the contract tests were written first and failed (the Learner API's cookie names, the realm's
addresses, the missing learner client, app and bundle check); then the implementation. The bundle check was tried
on the studio's build as a negative control: it reports 80 findings there (studio modules, the Authoring API client and
its routes).

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1400 tests, OK, 341 skipped (498 s; was 1398: the 2 cookie tests) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build`, `check:bundle` (in `apps/`) | OK, OK, 215 tests OK (was 190), OK, OK |
| `git diff --check` | exit 0 |

The browser tests were not run locally: the owner's stacks hold ports 58000 and 58001, which the test stack needs.
They run in CI (reported in the PR).

## S13 acceptance: part 1

- [x] **The learner build contains no authoring code** (`check:bundle`, `bundle.test.ts`, CI).
- [x] **A learner joins with the code or the link before practising** (`join.test.tsx`, `enrolment.spec.ts`).
- [x] **My courses and the course view in the browser** (`courses.test.tsx`, `course.test.tsx`, `enrolment.spec.ts`).
- [ ] Practice, submission and a reviewed evaluation (part 2).
- [ ] The stale rule for evaluation drafts (after the owner tries the app).

## Findings (not changed)

1. **A Keycloak started before this PR still sends the learner back to 58002.** Restart it to import the realm
   again. Signing in to the Learner API directly on 58002 no longer works with the dev realm: its client accepts the
   learner app's callback only.
2. **A studio built without `VITE_ALM_LEARNER_APP_URL` shows a join link on its own origin**
   (`http://127.0.0.1:58000/join?code=…`), which nothing serves. The owner's stack, if built without it, has this
   link. To decide with D17: default to the learner app's development address, or to `<studio origin>/learn` for a
   deployment serving both apps on one origin.
3. **The session parts are duplicated.** `SessionMenu`, `SignInPage`, `UnavailablePage` and `useReturnPath` exist in
   both apps with their own catalogues; they could move to `@alm/auth` with their texts as props.
4. **Codes are shown in words, not translated.** Activity formats and rubric level keys go through `readable`
   (`CRITERIA_BASED_PRODUCT` → "Criteria based product"); only the three intents have catalogue labels. An
   estimated duration is shown as recorded (for example ISO 8601 `PT4H`).
5. **The learner bundle is one script** (390 kB, 123 kB gzipped); no code splitting yet.
6. Still open from Chat 35: typed keys checked for form only; the core and the CLI still accept a `LEARNER`
   membership proposal; no limit on join attempts; no CLI for opening or the code; the studio does not list a joined
   learner's course.

## Open decisions

The stale rule for evaluation drafts (after the owner tries part 2); finding 2 with D17. Still open: D21, D28, D29,
D31–D33.

## Next step

**Chat 37: S13 part 2** on a new branch from `main` once this PR is merged: practice in the learner app.

### Prompt for Chat 37

```text
You are Chat 37 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S13 part 2** of docs/plans/prototype-roadmap.md: practice in the learner
app (milestone M3).

## Where things stand

- S13 part 1 is done once the PR of docs/plans/handoffs/chat-36.md is merged: apps/learner (served under /learn/ on
  127.0.0.1:58003, proxying the Learner API on 58002) has sign-in, the join page, my courses and the read-only course
  view; the Learner API names its own cookies; `npm run check:bundle` proves the learner build holds no authoring code;
  enrolment.spec.ts joins through the learner app.
- Read chat-36.md, chat-35.md, the roadmap's S13 section, docs/architecture/role-applications.md ("Learner API (S12)",
  "Learner app (S13)") and apps/learner.

## Protocol

1. Verify the baseline on main: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ npm run check:client, typecheck, test, build, check:bundle. Report any
   difference from the Chat 36 handoff.
2. Ask the owner, in Italian, what part 2 needs before building: at least where practice lives (on the course view
   per activity, or a practice page per activity), how an attempt is written and submitted (text only; confirmation),
   how a question to the Socratic coach or the Teacher is shown while its job runs and once answered (polling, the
   switch out of Socratic mode), what the progress view shows (own attempts, applied evaluations, learning states),
   and whether finding 2 of chat-36.md (the studio's join link default) is decided now.
3. Contract tests first, then implement; the browser test covers practice, submission and a reviewed evaluation on
   the seed delivery (the synthetic worker answers the coach and drafts the evaluation; an assessor approves it in the
   studio). Run the full offline suite, the generated-contract and OpenAPI checks and the studio and learner app
   checks. Write docs/plans/handoffs/chat-37.md; open one focused PR; wait for CI and report. Then ask the owner to try
   the app and decide the stale rule for evaluation drafts.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed and synthetic model responses only. Never edit an AIM-PRO/jjodel export
  or the ALM metamodel.
- The learner build contains no authoring code (check:bundle). Do not start #125 or #134.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only (code since S12b migrates a store it opens to schema version 3: do not open theirs with it).
- Do not decide D21, D28, D29, D31–D33 without the owner.
```

## PR and CI

Reported in the PR conversation.
