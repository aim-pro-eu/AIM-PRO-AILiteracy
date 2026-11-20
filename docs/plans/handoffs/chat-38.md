# Chat 38 handoff — S13: the stale rule for evaluation drafts (D38)

Date: 20 November 2026. Base: `origin/main` at `3eb9027` (the merge of #155).
Step: closes **S13** of the [prototype roadmap](../prototype-roadmap.md) (milestone M3), implementing D38.
No issue: D38 is recorded in the roadmap's decision table and S13 section.
Branch `feat/s13-stale-rule`, from `3eb9027`, in the worktree `.worktrees/s13-stale`; its PR targets `main`.

No model was called; no live run. Synthetic seed and synthetic model responses only. The owner's stacks (ports
58000/58001, `/tmp/alm-demo`, `/tmp/alm-se-ai`, `/tmp/alm-s13`) were not touched and their stores were not opened.

## Baseline verified before any change

The local `main` was 9 commits behind `origin/main` (#150, #152–#155 merged) and holds someone else's
uncommitted changes (`README.md`, and in `docs/plans/prototype-roadmap.md` the S12b row and acceptance marked done).
To leave them alone, the work ran in a worktree from `origin/main`; the baseline was verified there.

| Check | Result |
| --- | --- |
| `git status` (main checkout) | the others' changes as before, plus the uncommitted roadmap edit (S12b done); not part of this work |
| `git log --oneline -5` (`origin/main`) | `3eb9027` merge of #155, `26971d9`, `3dae272` merge of #154, `e67b8e9`, `b041eae` merge of #153 |
| `gh pr list --state open` (`aim-pro-eu/AIM-PRO-AILiteracy`) | none |
| `unittest discover -q`, telemetry off | 1402 tests, OK, 342 skipped (464 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build`, `check:bundle` (in `apps/`, Node 26.13.1) | OK, OK, 233 tests OK, OK, OK |

No difference from the Chat 37 handoff's final run. The front end now needs Node 26 (#154).

## Specification

D38 (owner, 19 November 2026, option B): another learner's attempt no longer makes a pending evaluation draft
stale; a new attempt by the evaluated learner still does; any other change of the course still does.

Three points D38 leaves open were put to the owner. The question was not answered and the owner asked to go on,
so Chat 38 implemented these choices. **The owner has not confirmed them yet**:

1. **Which attempts of the evaluated learner count.** Only a new attempt at the same activity as the judged attempt
   (the assessment); an attempt at another activity (a practice exercise) leaves the draft applicable. Learners and
   activities are compared by id. The alternative was any attempt of that learner in the course.
2. **Another learner's applied evaluation.** It still makes the draft stale, as D38 says ("any other change of the
   course"). **Open:** an assessor who drafts evaluations for a whole class and applies them one at a time sees every
   other draft expire after the first application, which is what D38 meant to avoid. Letting an applied evaluation
   of another learner leave the draft applicable would need the owner's decision (recorded below as a proposal).
3. **What the studio says.** The proposal page says why an evaluation draft can no longer be applied, before the
   decision (awaiting a decision or approved) and again once the application was refused (STALE): the student's new
   attempt, with a link to "Attempts to evaluate", or a change of the course. The decision form stays, so the
   assessor may still reject the draft.

## What was built

**Core** (`learning/decisions.py`):

- `left_out`: for an evaluation draft, `participants` and `activityOccurrences` are left out of the course version
  (`learningStates` still count; they change only by an applied proposal).
- `_learner_events`: the causes of the changes since the proposal's base, when each is a learner's event (a join, an
  attempt), never an applied proposal; otherwise `None`.
- `_attempted_again`: whether a learner whose attempt an evaluation draft judges attempted the same activity since.
- `_recorded_base` (formerly the comparison part of `_same_course`): the context record at the base when it agrees
  with the current one outside the excluded fields.
- `apply_proposal`: a draft whose learner attempted again is recorded STALE and refused with `NEW_ATTEMPT`,
  "Proposal base is stale: the learner submitted a new attempt at this assessment" (409 through the API, shown in the
  studio's refusal message); any other stale base keeps "Proposal base is stale". Another learner's attempt recorded
  since the draft is kept by the application (the context's current record gets the new version).

**Studio** (`apps/studio`):

- `features/review/model.ts`: `learnerEvents` (the core's walk over `StateChange` records), `evaluationDraftState`
  (`current`, `attemptedAgain`, `courseChanged`), `openProposals` uses them (an approved evaluation draft comes
  without its records: only a change of the course is seen for it there).
- `features/review/ProposalPage.tsx`: `DraftStale` for an evaluation draft awaiting a decision, approved or stale.
- `src/i18n/en.json`: `review.teacher.evaluation.attemptedAgain`, `courseChanged`, `latest`.

No route or schema changed: both OpenAPI snapshots and the generated clients are unchanged. The browser tests are
unchanged: `practice.spec.ts` applies a draft with no other attempt in between, and no browser test relied on the old
rule.

## Changes

| File | Content |
| --- | --- |
| `learning/decisions.py` | D38 at application |
| `tests/test_enrolment.py` | `CourseVersionTest`: another learner's attempt, the learner's new attempt, an attempt at another activity, another learner's applied evaluation, a draft after attempts and joins applied once (replaces "a learner's attempt still makes a pending evaluation draft stale") |
| `tests/services/test_learner_writes.py` | the evaluated learner's new submit (the former finding 3 test, with the new reason) and another learner's submit through the Learner API |
| `apps/studio/src/features/review/model.ts`, `ProposalPage.tsx`, `src/i18n/en.json` | the rule and the stale reason in the studio |
| `apps/studio/test/review-model.test.ts`, `review.test.tsx` | 4 model tests, 4 page tests |
| `docs/architecture/role-applications.md`, `docs/plans/prototype-roadmap.md` | the course version, attempt submission, "Learner app (S13)"; D38's row; S13 specification and acceptance |

Order of work: the contract tests were written first and failed for the expected reason (core and API: "Proposal
base is stale" in all five cases; studio: no `evaluationDraftState` and no warning); then the implementation.

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1412 tests, OK, 347 skipped (465 s; was 1402: four more course-version tests and one more Learner API test, on both backends, PostgreSQL skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build`, `check:bundle` (in `apps/`) | OK, OK, 241 tests OK (was 233), OK, OK ("The learner build contains no authoring code.") |
| `git diff --check` | exit 0 |

The browser tests were not run locally (the local Keycloak's secrets are not available to this chat); they run in CI.

## S13 acceptance

- [x] **The learner build contains no authoring code** (part 1).
- [x] **A learner joins with the code or the link before practising** (part 1).
- [x] **My courses and the course view in the browser** (part 1).
- [x] **Practice, submission and a reviewed evaluation** (part 2).
- [x] **The stale rule for evaluation drafts**: D38, this chat (three choices awaiting the owner's confirmation).

Milestone M3 (learner practice end to end) is reached once this PR is merged. The S13 row of the roadmap's table is
not marked done here: the line next to it (S12b) carries the owner's uncommitted edit in the main checkout, and
changing it would make that edit conflict. It can be marked with that edit.

## Findings (not changed)

1. **Another learner's applied evaluation still expires a draft** (choice 2 above). A proposal for the owner: an
   applied proposal whose only candidates are evaluations of other learners leaves the draft applicable; any
   evaluation of the same learner, and every other proposal, still makes it stale. The core would accept, among the
   learner's events, an applied proposal whose candidates are all `Evaluation` records of other learners, with
   `learningStates` merged as `activityOccurrences` are.
2. **An approved draft's stale state on the members and delivery pages.** `openProposals` sees only a change of the
   course for an approved evaluation draft (its records come only with the proposal read). No page lists evaluation
   drafts through it today; the proposal page reads the records and is exact.
3. **The core reads each attempt's evidence at application.** `_attempted_again` reads one `LearningEvidence` per
   attempt recorded since the draft; a long-pending draft in a large class reads many records once, at application.
4. Still open from Chat 37: the coach's hold read from the learner's questions, polling the whole question list,
   citations by id, occurrence status not shown; from Chat 36 and 35 as listed in `chat-37.md`.

## Open decisions

- **D38's three choices** (above): to be confirmed by the owner; finding 1 is the proposal for choice 2.
- Chat 36 finding 2 waits for D17. Still open: D21, D28, D29, D31–D33.

## Next step

The owner confirms D38's choices (or changes them: each is a small change in `learning/decisions.py` and
`features/review/model.ts`). Then **S13b** (#125 release views, #134 the next action on long review pages) with the
layout owner, and the SE-AI case study run again as the live check at M3, with the owner's authorization.

### Prompt for Chat 39

```text
You are Chat 39 of the ALM prototype (repo aim-pro-eu/AIM-PRO-AILiteracy, checkout
~/development/py-prototype; gh needs --repo aim-pro-eu/AIM-PRO-AILiteracy). S13 is done (milestone M3) once the PR of
docs/plans/handoffs/chat-38.md is merged. Your step: settle D38's open choices with the owner, then start S13b
only if the owner and the layout owner are ready.

## Where things stand

- D38 is implemented with three choices the owner has not confirmed (chat-38.md, "Specification"): only the
  evaluated learner's new attempt at the same activity makes an evaluation draft stale; another learner's applied
  evaluation still does (finding 1 proposes otherwise); the studio's proposal page says why before the decision.
- Read chat-38.md, the roadmap's decision table (D38) and S13/S13b sections, and docs/architecture/role-applications.md
  ("The course version", "Learner app (S13)").

## Protocol

1. Verify the baseline on main: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ (Node 26.13.1) npm run check:client, typecheck, test, build,
   check:bundle. Report any difference from the Chat 38 handoff.
2. Ask the owner, in Italian, to confirm or change D38's three choices (in chat text if the question dialog is
   declined). Record the answers in the roadmap. If choice 2 changes (finding 1), write the contract tests first
   (core, API, studio model), then implement.
3. S13b (#125, #134) only with the layout owner: labels and data first; any change of page structure is agreed with
   them. Write docs/plans/handoffs/chat-39.md; open one focused PR; wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run without the owner's authorization; synthetic seed and synthetic model responses only.
  Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- The learner build contains no authoring code (check:bundle).
- Leave the others' uncommitted changes (README.md, docs/plans/prototype-roadmap.md in the main checkout,
  docs/architecture/system-overview.md, docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md,
  examples/lpo-ai/) alone and out of PRs; work in a worktree if main is behind.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo, /tmp/alm-se-ai, /tmp/alm-s13): never stop or restart them;
  read their stores read-only (code since S12b migrates a store it opens to schema version 3: do not open theirs).
- Do not decide D21, D28, D29, D31–D33 without the owner.
```

## PR and CI

Reported in the PR conversation.
