# Chat 24 handoff — S09c2 part 2: teacher views of every proposal kind, whatever its status

Date: 14 November 2026. Base: `main` at `efce0dc` (PRs #119 and #120 merged). This step ran in the same session as
Chat 23, after the owner merged S09d and asked to go on with the development ("merge fatto, procedi con gli step per
completare lo sviluppo", 13 November 2026).
Step: **S09c2** of the [prototype roadmap](../prototype-roadmap.md), second of two PRs (split in Chat 22).
Issue: [#121](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/121).
Branch `feat/s09c2-teacher-views`, PR: see the end of this file.

No ALM metamodel, ALM store schema, jobs store schema, realm file, identity map, configured model or AIM-PRO/jjodel
export changed. No model was called. The owner's demo stack (58000/58001) was running; it was not touched, so the
browser tests were not run locally (they run in CI).

## Objective

A teacher reads every proposal of a course in words, whatever its status.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this PR |
| `git log --oneline -3` (`origin/main`) | `efce0dc` merge of #120, `ab0fbf0` merge of #119, `6255ab9`: as the Chat 23 handoff |
| `gh pr list --state open` | none; issue #118 closed |
| `unittest discover -q`, telemetry off | 1104 tests, OK, 201 skipped (as Chat 23) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 147 tests OK (as Chat 23) |

**What was found** (read before the change):

- The teacher view was built only for pending proposals: their candidates come from `pending-proposals`. A decided
  proposal showed its summary and "other proposal".
- The seed holds eight proposal kinds: the syllabus, the project initialization, the assessments (one pending), the
  teacher and trainer content, the completion rules, the release, and the delivery import (one applied, one pending).
- A delivery import carries completion rules and the frozen syllabus of its release, so the studio would have
  titled it "Proposed completion rules", and its page showed the syllabus view ("Proposed syllabus"); the first CI run
  of the new browser test found the second.
- The course page linked only pending and approved proposals.

## Decisions

The acceptance was agreed in Chat 21 and split in Chat 22 (issue #115); added with the owner's go-ahead in Chat 23:
the "not accepted by the review agent" notice of generated content (Chat 23 finding 9) and the import title fix.
Defaults taken without a question, stated in the issue and the guide:

- `GET /contexts/{context_id}/proposals/{proposal_id}` returns `PendingProposal` (the latest revision, its candidates,
  its review payload key), authorized as `pending-proposals`; an unknown proposal is 404. API version 0.12.0.
- "What changes" compares a proposal with the course only while it can still be decided or applied (awaiting a
  decision, approved, in revision); an applied or rejected proposal shows what it carries.
- The course page links every proposal: "Review this proposal" or "Read this proposal" (labels and data only).
- The project initialization says why it is approved (Chat 22 trial finding 3).

## Changes

| File | Content |
| --- | --- |
| `learning/review.py`, `learning/service.py` | `proposal_review`; `LearningService.proposal_review` |
| `services/authoring_api/review.py`, `app.py` | `GET /contexts/{context_id}/proposals/{proposal_id}`; version 0.12.0 |
| `services/openapi/authoring.json`, `apps/packages/api-client/src/generated/authoring.ts` | regenerated |
| `apps/studio/src/features/review/teacher.ts` | kinds `initialization`, `release`, `import` (an import first, so its completion rules do not title it); `project`, `release`, `delivery`, `notAccepted`, `compared` in the view; `teacherView(candidates, applied, compare)` |
| `apps/studio/src/features/review/TeacherView.tsx`, `ProposalPage.tsx`, `reviewApi.ts` | the three new sections and the notice; a decided proposal's candidates read through the route; "What changes" only when compared |
| `apps/studio/src/features/review/syllabus.ts` | a proposal with bindings, a policy or agents is not a syllabus proposal |
| `apps/studio/src/features/course/CoursePage.tsx`, `i18n/en.json` | every proposal linked; the labels above (labels and data only, no styling) |
| `tests/services/test_authoring_review_api.py`, `test_api_openapi.py` | contract tests (below) |
| `apps/studio/test/teacher-view.test.ts`, `review.test.tsx`, `syllabus-model.test.ts` | studio unit tests; the page tests of decided proposals answer the new route |
| `apps/e2e/teacher-views.spec.ts` (new), `support.ts` | the browser test of every seeded kind (the delivery contexts' proposals read through the API; the delivery policy preview installed while the applied import is read, as `test_authoring_read_api.py` does, then removed); `SeedManifest` fields |
| `docs/architecture/role-applications.md` | "Teacher views of every proposal kind (S09c2, part 2)", the browser test row |

## Verification

**Contract tests first.** `test_every_proposal_is_read_with_its_candidates_whatever_its_status` failed (404) until
the route; the route list of `test_api_openapi.py` until the snapshot. The four new `teacher-view.test.ts` cases
failed until `teacher.ts`; the page tests were written after the components.

| Check | Result |
| --- | --- |
| `unittest discover -q`, telemetry off, final tree | 1106 tests, OK, 202 skipped (1104 / 201 before: the route test on both store backends; its PostgreSQL variant is the new skip) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 154 tests OK (147 before) |
| `npx playwright test -c e2e/playwright.config.ts --list` | 17 tests in 9 files; compiles (typecheck includes `e2e/`) |
| `git diff --check` | exit 0 |

**Not verified locally.** The browser tests: the owner's demo stack held their ports; the CI job `browser` runs them.
The release parts were checked against the seed by reading its store: the five artifacts of the release resolve to
`SOURCE`, `SYLLABUS`, `ASSESSMENT`, `TEACHER_CONTENT`, `TRAINER_CONTENT` in the latest project manifest.

## Findings (not changed in this PR)

1. **The delivery import's activities and units come from the frozen release**; the view lists the activities as for
   generated content, without grouping them by unit.
2. **A decided proposal has no "what changed then"**: the comparison with the course of its time is not kept; its
   content is shown instead.
3. **Still open**: the Chat 23 findings (a network error stops a job at once with the generic text; every generator
   call reads the whole input; the free model cannot write more than one or two units per response; D33) and D28
   (Chat 21 trial finding 1).

## Open decisions

Proposed for the owner to record in the roadmap: S09c done (S09c, S09c2 in two parts, S09d); the remaining record of
the Chat 22 handoff (the S09c / S09c2 split, the Chat 21 and Chat 22 D-rows, the direction for sources).

Still open from the roadmap: D19, D21, D25, D28, D29, D31–D33, G7 / D4.

## Next step

**S10 — Course validation from the studio (M2)**, issue
[#123](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/123). Owner decisions (15 November 2026):
the delivery course is created from the studio; bindings are proposed and can be changed; activation can be proposed
and its refusal is shown in words; two PRs (part 1: release and delivery course creation; part 2: import, policy
preview, activation). Start it in a new chat once this PR is merged; the prompt below.

### Prompt for Chat 25

```text
You are Chat 25 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S10 part 1** (issue #123): a release is proposed from the studio on the
course's project, read in its teacher view and inspected (receipts, frozen closure, findings), and a delivery course
is created from the studio. Part 2 (the import with proposed and changeable bindings, the policy preview, the
activation refused in words) follows in another PR.

## Where things stand

- S09d (generation by blocks of units, PR #119) and S09c2 part 2 (teacher views of every proposal kind, PR #122) are
  merged. Read docs/plans/handoffs/chat-23.md and chat-24.md.
- Owner decisions of issue #123 are final; do not reopen them.

## Protocol

1. Verify the baseline: git status, git log --oneline -3, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   and in apps/ npm run check:client, typecheck, test. Report any difference from the Chat 24 handoff.
2. Read AGENTS.md, the roadmap (working protocol, S10, D10, D23, D25), docs/architecture/role-applications.md
   (course creation, S09c2), learning/releases.py, services/authoring_api/releases.py and courses.py, and the CLI
   commands propose-release, show-release, propose-delivery-import, propose-activation.
3. Check, before any change, how a delivery course created through POST /courses gets the source scopes and the
   subjects that the import and its policy preview need (D23), and how this touches D25 (open). If an owner decision
   is needed, stop and ask; write part 1's acceptance with the owner if it changes.
4. Contract tests first (API and core), then the implementation; studio unit tests and a browser test for what the
   studio shows; axe.
5. Write docs/plans/handoffs/chat-25.md, open one focused PR, wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No live model run; synthetic seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- Layout and visual design are owned by someone else: change labels and data, not styling.
- Installing a policy preview stays a host operator action, never a browser action.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's demo stack (ports 58000/58001, /tmp/alm-demo): never stop or restart it; read its stores read-only.
  When it runs, the browser tests run in CI.
- Do not decide D19, D21, D25, D28, D29, D31–D33 or G7/D4. Propose roadmap changes in the handoff.
```

## PR and CI

PR [#122](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/122). The first three CI runs failed in
the `browser` job only, on the new test: the CLI helper could not open the delivery contexts (their proposals are now
read through the API), the applied import's context needs its policy preview installed (done in the test, then
removed), and the import was shown as a syllabus proposal (fixed in `syllabus.ts`, `f258a86`). CI on `f258a86`, push
run [43572871811](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43572871811) and
pull_request run [43572876947](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43572876947):
all 7 jobs of each passed, `browser` included (`teacher-views.spec.ts`: every seeded kind in words, axe on each).
