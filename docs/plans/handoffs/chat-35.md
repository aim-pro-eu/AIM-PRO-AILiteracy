# Chat 35 handoff — S12b part 2: students added by the teacher, the members page, the seed, the browser test

Date: 18 November 2026. Base: `main` at `9b9f66a` (the merge of #146, S12b part 1).
Step: **S12b, part 2** of the [prototype roadmap](../prototype-roadmap.md).
Issue: [#141](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/141).
Branch `feat/s12b-members-page`, from `9b9f66a`; its PR targets `main`.

No model was called; no live run. Synthetic seed and synthetic model responses only. The owner's stacks (ports
58000/58001, `/tmp/alm-demo`, `/tmp/alm-se-ai`) were not touched and their stores were not opened.

## Baseline verified before any change

PR #146 (part 1) was merged before this chat, so the baseline is `main`.

| Check | Result |
| --- | --- |
| `git status` | someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `9b9f66a` merge of #146, `73cc141`, `4208c9b` merge of #145, `b40bd76` merge of #144, `bbc3cdc` |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1380 tests, OK, 332 skipped (441 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 183 tests OK |

No difference from the Chat 34 handoff, except that #146 is merged.

## Specification with the owner

The owner chose the recommended option of each question (recorded on #141 and in the roadmap's S12b section,
"Part 2 specification"):

1. **Choosing students.** The people of the identity map who are not members, as check boxes, and a field for typed
   keys (of the map or `auto-`); a person reads their own key in the studio.
2. **The join link before S13.** `<learner app>/join?code=…`, the learner app's address set when the studio is built
   (`VITE_ALM_LEARNER_APP_URL`, otherwise the studio's origin), shown as text; the page says the learner app is not
   available yet.
3. **The browser test.** The test stack also runs the Learner API (port 58002, a client of its own in the dev realm);
   `dev-unmapped` signs in there in a browser of their own and joins with the code.
4. **The "unmapped" page** goes; a person with no course sees their key on the home page.

Decided in this chat, within D37 ("replaces D25/D36 membership for `LEARNER`"): the Authoring API no longer offers or
accepts `LEARNER` in a membership proposal; the core still applies a `LEARNER` membership recorded before, and the CLI
`propose-membership` still accepts it (finding 5).

## What was found while building

1. **The CI never ran the enrolment tests.** The workflow lists test modules by name; `tests.test_enrolment` and
   `tests.services.test_enrolment_api` (Chat 34) were not in the lists, so their PostgreSQL variants never ran in CI.
   They are added here (the SQLite job, the PostgreSQL job and the services job).
2. **The studio judged staleness by the technical version.** The members page labelled a pending proposal stale when
   its `baseContextVersion` differed from the context's version, so a join (or a student added) would have made every
   pending staff membership look stale though the core still applies it. `openProposals` now follows the
   `StateChange` records back from the context's version, as the core does: a change caused by a `Participant` or a
   `LearningEvidence` (for an evaluation draft, a `Participant` only) leaves the course version. The core's second
   check (the records agree outside the learners' fields) is not repeated in the studio; by construction those causes
   change only the learners' fields.
3. **The opening had no teacher view.** Opening a delivery (a `PolicySet` and the context) read as "Proposed change";
   `teacher-views.spec.ts` forbids that title, and the seed now holds an opening. A new kind `enrolment`, titled
   "Open the course to students", names the grant's actions and scopes and says when the policy is used.
4. **Opening in the seed changes the delivery's policy file.** `delivery_policy` and `delivery_policy_preview` of
   `seed.json` now name the opened version (the import's preview with the learner grant); every test that installs
   the preview installs that one. Tests that open the delivery themselves build the seed with
   `open_delivery=False` (`LearnerSeed(..., open_delivery=False)`).
5. **Students may be added before activation.** Participants are not learner history, so activation still applies;
   they take part once the delivery is ACTIVE (`test_students_added_before_activation_take_part_once_it_is_active`).

## What was built

**Core.** `learning/enrolment.py`: `record_learner`, the one write of a `LEARNER` participant and the `StateChange` it
causes, used by joining and by adding. `learning/membership.py`: `LearnersCommand`, `add_learners` (an administrator;
the course open to learners; idempotent by subject; a member of the staff refuses the whole list; retried when the
context changes meanwhile). `learning/service.py`: `add_learners`.

**API.** Authoring API 0.18.0, module `members`: `POST /contexts/{context_id}/learners` (keys of the identity map or
automatic keys, `services.api_common.identity.is_auto_subject_key`; the answer is the member list); `MemberList.roles`
and the membership request without `LEARNER`. OpenAPI snapshot and the studio's generated client regenerated.

**Studio.** `features/members/StudentsSection.tsx` and `enrolment.ts` (join link, pending opening, typed keys): on an
imported delivery, propose opening (or the opening already proposed, with its state and review link), the code and
the join link, reset, disable, create, and "Add students" (check boxes and typed keys). The staff section is "Add
teaching staff". `buildApi.ts`: `enrolment`, `proposeEnrolment`, `resetEnrolmentCode`, `disableEnrolmentCode`,
`addLearners`. `review/model.ts`: the course version in `openProposals`. `review/teacher.ts`, `TeacherView.tsx`: the
`enrolment` kind. The "unmapped" page and session state are removed (`@alm/auth`: a 403 is a `SessionError`); the home
page shows the key of a person with no course.

**Seed.** `tests/seed.py` opens `architecture-delivery` right after its import, under the import's preview, decided
and applied by `admin`; no code (the seed does not know the host secret).

**Browser tests.** `apps/e2e/stack/api.mjs` starts the Learner API on 58002 (client `alm-learner-api`) before the
Authoring API; `infra/keycloak/alm-dev-realm.json` has that client. `apps/e2e/enrolment.spec.ts` (new): the seed's
delivery installed and activated in the studio; the code created and shown with the join link (axe); `dev-unmapped`
signs in to the Learner API with an `auto-` key and joins with the code; the administrator sees them as a student,
adds `assessor` at once, resets the code (the old one gets 404) and disables it. `assessment.spec.ts`: the S11b
two-member test proposes `learner` as Observer.

## Changes

| File | Content |
| --- | --- |
| `learning/enrolment.py`, `learning/membership.py`, `learning/service.py` | `record_learner`, `add_learners` |
| `services/api_common/identity.py`, `services/authoring_api/members.py`, `app.py` | the endpoint, staff roles only, 0.18.0 |
| `services/openapi/authoring.json`, `apps/packages/api-client/src/generated/authoring.ts` | generated |
| `tests/seed.py` | the seed opens its delivery (`open_delivery`) |
| `apps/studio/src/features/members/*`, `course-build/buildApi.ts`, `review/model.ts`, `review/teacher.ts`, `review/TeacherView.tsx`, `home/HomePage.tsx`, `shell/StudioShell.tsx`, `i18n/en.json`; `session/UnmappedPage.tsx` removed; `apps/packages/auth/src/*` | the studio |
| `apps/e2e/stack/api.mjs`, `paths.mjs`, `apps/e2e/enrolment.spec.ts` (new), `apps/e2e/assessment.spec.ts`, `teacher-views.spec.ts` | the browser tests |
| `infra/keycloak/alm-dev-realm.json` | client `alm-learner-api` |
| `.github/workflows/aimpro-contracts.yml` | the enrolment test modules in CI |
| `tests/test_enrolment.py` | students added (5 tests, with PostgreSQL variants), added before activation, not before opening; the seed built without opening |
| `tests/services/test_enrolment_api.py` | adding a mapped person and an automatic key; refusals, who, CSRF |
| `tests/services/test_authoring_members_api.py` | staff roles only; `LEARNER` refused |
| `tests/test_seed.py`, `tests/test_learner_reads.py`, `tests/services/test_learner_boundaries.py`, `test_dev_identity.py`, `test_api_openapi.py` | the opened seed, the new client, the new path |
| `apps/studio/test/members.test.tsx`, `teacher-view.test.ts`, `app.test.tsx`, `review.test.tsx`, `apps/packages/auth/test/session.test.tsx` | the studio tests |
| `docs/architecture/role-applications.md`, `docs/plans/prototype-roadmap.md` | part 2, the owner's answers |

Order of work: the contract tests were written first and failed (the missing endpoint, `open_delivery`, the missing
section and strings); then the implementation. The first full run found the boundary probe opening the delivery the
seed had already opened. The first CI run of the PR failed two browser tests this chat had not updated:
`teacher-views.spec.ts` (the seed's titles now include "Open the course to students") and the S11b test of
`assessment.spec.ts` (it still proposed `learner` as Student); both fixed in a second commit.

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1398 tests, OK, 341 skipped (467 s; was 1380 / 332: 18 new tests, 9 of them PostgreSQL variants skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build` (in `apps/`) | OK, OK, 190 tests OK (was 183), OK |
| `git diff --check` | exit 0 |

The browser tests were not run locally: the owner's stacks hold ports 58000 and 58001, which the test stack needs.
They and the PostgreSQL variants run in CI (reported in the PR).

## S12b acceptance (#141): part 2

- [x] **Studio members page.** Propose opening, the code and the join link, reset and disable (`members.test.tsx`,
  `enrolment.spec.ts`).
- [x] **Students added by the teacher**, at once, under the learner grant, with no new policy version; the studio no
  longer offers `LEARNER` in the membership proposal (`AddedLearnersTest`, `AddedLearnersApiTest`, `members.test.tsx`).
- [x] **The seed opens its delivery; a browser test joins with the code** (`test_seed.py`, `enrolment.spec.ts`, in CI).

## Findings (not changed)

1. **A Keycloak started before this PR lacks the client `alm-learner-api`.** Restart it to import the realm again
   before running the browser tests locally; the test stack also needs port 58002 free.
2. **The join link leads nowhere yet.** `/join?code=…` is served by the learner app (S13); the studio's preview
   server answers 404 there.
3. **The studio does not list a joined learner's course** (Chat 34 finding 3, unchanged): learners use the learner app.
4. **Typed keys are checked for form only.** An `auto-` key that nobody signed in with is accepted; it names no one
   until that person signs in. The teacher sees the key only.
5. **The core and the CLI still accept a `LEARNER` membership proposal.** Only the Authoring API refuses it; refusing
   it in the core would need the tests that use it rewritten. To decide when D25 learners named in the policy go.
6. Still open from Chat 34: no limit on join attempts; no CLI for opening or the code; adding someone to the identity
   map after they joined. From Chat 33: findings 1–8.

## Open decisions

None beyond the part 2 specification. Still open: D21, D28, D29, D31–D33, the stale rule for evaluation drafts (S13).

## Next step

**Chat 36: S13, the learner app** (milestone M3), on a new branch from `main` once this PR is merged: the join page
(`/join?code=…`) first, then my courses, the course view and practice.

### Prompt for Chat 36

```text
You are Chat 36 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S13** of docs/plans/prototype-roadmap.md: the learner app (milestone M3).

## Where things stand

- S12b is done once the PR of docs/plans/handoffs/chat-35.md is merged: students join a delivery with its code
  (Learner API POST /enrolments) or are added by an administrator (Authoring API POST /contexts/{id}/learners); the
  studio's members page shows the code and the join link `<learner app>/join?code=…` (VITE_ALM_LEARNER_APP_URL); the
  seed opens its delivery; the browser-test stack runs the Learner API on 58002 (realm client alm-learner-api).
- Read chat-35.md, chat-34.md, the roadmap's S12b and S13 sections, #141, docs/architecture/role-applications.md
  ("Learner API (S12)", "Teams-style enrolment (S12b)") and the studio's structure under apps/.

## Protocol

1. Verify the baseline on main: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ npm run check:client, typecheck, test. Report any difference from the
   Chat 35 handoff.
2. Ask the owner, in Italian, what S13 needs before building: at least the learner app's address and port (it decides
   the join link and the realm's redirect URI), how much of S13 goes into the first part (join page, my courses, course
   view, practice with the Socratic coach, progress), and whether the stale rule for evaluation drafts is decided now
   or once the learner app is tried.
3. Contract tests first, then implement; run the full offline suite, the generated-contract and OpenAPI checks and the
   studio and learner app checks. Write docs/plans/handoffs/chat-36.md; open one focused PR; wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed and synthetic model responses only. Never edit an AIM-PRO/jjodel export
  or the ALM metamodel.
- The learner build contains no authoring code (bundle check). Do not start #125 or #134.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only (code since S12b migrates a store it opens to schema version 3: do not open theirs with it).
- Do not decide D21, D28, D29, D31–D33 without the owner.
```

## PR and CI

Reported in the PR conversation.
