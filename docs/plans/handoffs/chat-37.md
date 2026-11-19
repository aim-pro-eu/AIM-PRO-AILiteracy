# Chat 37 handoff — S13 part 2: practice in the learner app

Date: 19 November 2026. Base: `main` at `20ea686` (the merge of #148, S13 part 1).
Step: **S13, part 2** of the [prototype roadmap](../prototype-roadmap.md) (milestone M3).
No issue: S13 is specified in the roadmap's S13 section (the owner's answers are recorded there and in the PR).
Branch `feat/s13-practice`, from `20ea686`; its PR targets `main`.

No model was called; no live run. Synthetic seed and synthetic model responses only. The owner's stacks (ports
58000/58001, `/tmp/alm-demo`, `/tmp/alm-se-ai`) were not touched and their stores were not opened.

## Baseline verified before any change

PR #148 (S13 part 1) was merged before this chat, so the baseline is `main`.

| Check | Result |
| --- | --- |
| `git status` | someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `20ea686` merge of #148, `7d69c92`, `9e4320f` merge of #147, `1b98137`, `ceeffcd` |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1400 tests, OK, 341 skipped (466 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build`, `check:bundle` (in `apps/`) | OK, OK, 215 tests OK, OK, OK |

No difference from the Chat 36 handoff, except that #148 is merged.

## Specification with the owner

The owner chose the recommended option of each question (recorded in the roadmap's S13 section):

1. **Where practice lives.** A page per activity, `/learn/courses/{context_id}/activities/{activity_id}`, linked from
   each activity of the course view ("Work on this activity"); the course view stays read only.
2. **The attempt.** Text only; "Submit the attempt" asks for a confirmation; one request id per text, so a retry after
   a lost answer is recorded once.
3. **Questions.** The activity is the problem (`problem_key` = the activity's id). The Socratic coach is the default;
   on a problem the coach holds, the Teacher is asked only after the learner confirms leaving the coach
   (`switch_from_socratic`). A running question is read again every second until its job ends.
4. **Progress.** A page per course, `/learn/courses/{context_id}/progress`: own attempts, applied evaluations,
   learning states and the learner's questions.
5. **Chat 36 finding 2** (the studio's join link default) waits for D17.

## What was built

**Learner app** (`apps/learner`):

- `features/courses/learnerApi.ts`: `progress`, `submitAttempt`, `ask`, `questions`; `LearnerError` carries the API's
  `detail` (a 422 to a write is the core's refusal, said in words).
- `LearnerServices.tsx`, `App.tsx`: `pollMs` (1000 ms; 5 ms in the tests).
- `features/course/model.ts` (the course helpers, moved out of `CoursePage.tsx`, with `findActivity` and `FAILURES`),
  `features/course/Section.tsx`; `CoursePage.tsx` links each activity to its practice page, the course to My progress,
  and scrolls to an assessment named in the address.
- `features/practice/PracticePage.tsx`: what to do (format, instruction, what to hand in, strategies, materials, the
  assessment link); for PRACTICE and ASSESS activities the attempt form with its confirmation and the attempts at the
  activity with the evaluations applied to them; the question form ("Ask the coach", "Ask the Teacher instead", the
  confirmation while the coach holds the activity) and the questions on the activity. One request id per text; once
  a request is recorded, the same text again is a new request.
- `features/practice/questions.ts` (`coachHolds`: the core's rule, read from the learner's questions),
  `QuestionItem.tsx` (waiting, the answer with its sources, or why there is none).
- `features/progress/ProgressPage.tsx`, `useLearnerRecords.ts` (the course, progress and questions; questions read
  again while a job runs), `when.ts`.
- `src/i18n/en.json`: `course.progress`, `course.activity.practise`, `practice.*`, `progress.*`.

**Dev worker.** `tests/services/job_fixtures.py`: `SyntheticAgents.orchestrator`, synthetic learning agents (the
coach asks back, the Teacher explains), in `resources()`, so `tests.synthetic_worker` answers learners.

**Browser test.** `e2e/practice.spec.ts`: the administrator adds the assessor and activates the seeded delivery;
`dev-learner` signs in to the learner app, opens the assessed activity, asks the coach, then the Teacher after
confirming the switch (both answered by the dev worker), submits an attempt after confirming (axe on each step); the
assessor asks for a formative draft in the studio, approves and applies it; the learner reads the attempt, the
evaluation (mode, criterion reason, result), one learning state and both questions in My progress (axe).

No route, schema or core module changed: both OpenAPI snapshots and the generated clients are unchanged.

## Changes

| File | Content |
| --- | --- |
| `apps/learner/src/**` | practice and progress pages, the client's new calls, the course helpers moved to `model.ts` |
| `apps/learner/test/harness.tsx`, `practice.test.tsx`, `progress.test.tsx` | fixtures for progress and questions; 18 tests |
| `apps/e2e/practice.spec.ts` | the browser test from practice to a reviewed evaluation |
| `tests/services/job_fixtures.py`, `tests/synthetic_worker.py` | synthetic learning agents for the dev worker |
| `tests/services/test_learner_writes.py` | `DevWorkerTest`: the dev worker answers the coach and the Teacher as the app asks |
| `docs/architecture/role-applications.md`, `docs/plans/prototype-roadmap.md` | "Learner app (S13)" part 2; the owner's answers; acceptance |

Order of work: the contract tests were written first and failed (`DevWorkerTest`: the dev worker rejected a learner's
question, having no learning agents; the 17 learner app tests: no practice or progress page); then the
implementation. One more test followed a change made during the work (a new request id once a request is recorded).

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1402 tests, OK, 342 skipped (465 s; was 1400: `DevWorkerTest` on both backends, PostgreSQL skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build`, `check:bundle` (in `apps/`) | OK, OK, 233 tests OK (was 215), OK, OK |
| `git diff --check` | exit 0 |

The browser tests were not run locally: the local Keycloak's dev password and client secret are not available to
this chat. They run in CI (reported in the PR).

## S13 acceptance

- [x] **The learner build contains no authoring code** (part 1; `check:bundle` still passes, 410 kB script).
- [x] **A learner joins with the code or the link before practising** (part 1).
- [x] **My courses and the course view in the browser** (part 1).
- [x] **Practice, submission and a reviewed evaluation** (`practice.test.tsx`, `progress.test.tsx`,
  `practice.spec.ts`).
- [ ] **The stale rule for evaluation drafts**: decided as D38 (below); implemented in Chat 38.

## Findings (not changed)

1. **The coach's hold is read from the learner's questions.** `coachHolds` mirrors the core's rule (the newest
   recorded question on the problem). Should the core change the rule, the app asks the Teacher without a
   confirmation and the core answers with its fixed text, which the page explains and which offers the switch.
2. **Polling reads the whole list.** While a question runs, the page reads `GET .../questions`, every question of the
   learner in the course; a long history makes each read larger. The per-question read (`GET .../questions/{id}`)
   could replace it.
3. **A material's citation shows its title or id.** A citation of a source outside the course's materials is shown
   by its id.
4. **Occurrence status is not shown.** Every attempt's occurrence is `IN_PROGRESS` today; the progress page shows the
   attempt and its evaluations instead.
5. Still open from Chat 36: the duplicated session parts, codes shown in words, one script bundle; from Chat 35:
   typed keys checked for form only, no limit on join attempts, no CLI for opening or the code, the studio does not
   list a joined learner's course.

## Open decisions

**D38, decided by the owner on 19 November 2026** (the stale rule for evaluation drafts, Chat 29 finding 3): the
owner avoids today's behaviour, under which any learner's new attempt makes every pending evaluation draft of the
course stale, because in a real class drafts would almost always expire. Option B: another learner's attempt no
longer makes a draft stale; a new attempt by the learner whose attempt is evaluated still does, so the assessor starts
again from the latest attempt; any other change of the course still does. Recorded in the roadmap; implemented in
Chat 38. Chat 36 finding 2 waits for D17. Still open: D21, D28, D29, D31–D33.

## Next step

The owner tries the learner app on a synthetic stack. **Chat 38** implements D38 on a new branch from `main` once this PR is merged, closing milestone M3; S13b follows with the layout owner.

### Prompt for Chat 38

```text
You are Chat 38 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step closes **S13** of docs/plans/prototype-roadmap.md (milestone M3): the stale
rule for evaluation drafts as the owner decided it (D38, option B).

## Where things stand

- S13 parts 1 and 2 are done once the PR of docs/plans/handoffs/chat-37.md is merged: the learner app has the join
  page, my courses, the course view, a practice page per activity (attempts with a confirmation, questions to the
  Socratic coach or the Teacher as jobs) and My progress; e2e/practice.spec.ts goes from practice to a reviewed
  evaluation.
- Today a learner's new attempt makes a pending evaluation draft of the course stale at application
  (learning.decisions.course_version; Chat 29 finding 3; docs/architecture/role-applications.md, "The course
  version").
- Read chat-37.md, chat-36.md, the roadmap's S13 section and docs/architecture/role-applications.md ("Teams-style
  enrolment (S12b)", "Learner app (S13)").

## Protocol

1. Verify the baseline on main: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ npm run check:client, typecheck, test, build, check:bundle. Report any
   difference from the Chat 37 handoff.
2. D38 (roadmap): another learner's attempt no longer makes a pending evaluation draft stale; a new attempt by the
   evaluated learner still does; any other change of the course still does. Ask the owner, in Italian, only what D38
   leaves open (for example what the studio says about a draft made stale by the learner's new attempt), and record
   the answer in the roadmap.
3. Contract tests first (the core rule, the API, the studio's stale label), then implement; update the browser test
   if the rule changes what the assessor sees. Run the full offline suite and the checks. Write
   docs/plans/handoffs/chat-38.md; open one focused PR; wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed and synthetic model responses only. Never edit an AIM-PRO/jjodel export
  or the ALM metamodel.
- The learner build contains no authoring code (check:bundle). Do not start #125 or #134 (S13b, with the layout
  owner).
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only (code since S12b migrates a store it opens to schema version 3: do not open theirs with it).
- Do not decide D21, D28, D29, D31–D33 without the owner.
```

## PR and CI

Reported in the PR conversation.
