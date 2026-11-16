# Chat 26 handoff — S10 part 2: the delivery import and its activation from the studio

Date: 16 November 2026. Base: `main` at `0150666` (PR #124 merged).
Step: **S10** of the [prototype roadmap](../prototype-roadmap.md), second of two PRs (owner decision 4 of issue #123).
Issue: [#123](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/123).
Branch `feat/s10-delivery-import`, PR: see the end of this file.

No ALM metamodel, ALM store schema, jobs store schema, realm file, identity map, configured model or AIM-PRO/jjodel
export changed. No model was called. The core module `learning/` changed as the owner decided on 16 November 2026
(below). The owner's demo stack (58000/58001) was running; it was not touched, so the browser tests were not run
locally (they run in CI).

## Objective

In a delivery course created from the studio, the import of an applied release is proposed with a resource proposed
for each requirement, which the teacher can change, and the exact selection is sent; the import is read in its teacher
view and approved; the policy preview is shown in full; activation is proposed and refused in words
(`RELEASE_RUNTIME_ROLE`, D4).

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this PR |
| `git log --oneline -3` | `0150666` merge of #124, `98c7e60`, `e618254`: as the Chat 25 handoff, plus its merge |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1110 tests, OK, 204 skipped (as Chat 25) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 162 tests OK (as Chat 25) |

**What was found** (protocol step 2, read before any change):

- `_other_context` loaded the authoring context with the delivery context's policy; `load_context` requires the policy
  to be the context's own `policies` reference, so a course created with `POST /courses` could not receive an import
  (as Chat 25 found).
- The core accepts, for each requirement, **only** the exact resource the release pins (`_pins`), or no binding. On the
  seed the frozen design has 7 requirements (3 EXPLAIN material/source, 2 PRACTICE, 1 ASSESS source, plus the cited
  source of each), all pinned: 4 generated materials and the WP3 source `wp3:test` three times.
- After the import is applied, the delivery context names the preview's policy, which is not installed: the API
  answers 404 for that course until an operator installs the preview (D10, as designed).

## Decisions

**Owner, 16 November 2026 (asked in this chat):** for each requirement the list holds **the resource the release pins
(proposed) or "No resource"**; the core is unchanged. Other frozen resources are not offered. A requirement left
without a resource keeps activation refused (`R08`). This details decision 2 of #123.

The decision of 16 November 2026 recorded on #123 (each context keeps its own policy) is implemented as decided.

Defaults taken without a question, stated in the guide:

- **Core**: `LearningService(..., policies=None)` takes a resolver of installed policies by exact reference, and
  `RunContext.policies` carries it. `_other_context` uses the caller's policy when the reference is the same, the
  resolver otherwise, and refuses ("The trusted policy of the authoring context is not installed") when it finds none.
  The API passes `PolicyDirectory.find`; the CLI takes `--other-policy FILE` (repeatable).
- **`show-release`** also returns `requirements` (each requirement of the frozen design with its pinned resource and
  title) and `completion_rules`, only when the release has no finding.
- **`POST /contexts/{id}/activations` answers 200 with `ActivationOutcome`**: the proposal, or the findings and no
  proposal; nothing is recorded on refusal. A refusal is the answer, not an error. `POST /contexts/{id}/delivery-imports`
  returns `ImportProposal` as the CLI. API version 0.14.0.
- The studio's scope name is `{delivery}:delivery`; each completion rule is bound to `all_completed` (the condition of
  the fixed completion rule of S09c2); requirements are listed as "Requirement n: purpose".
- The delivery course created from the release page opens on `/contexts/{delivery}/import?from=…&release=…&version=…`.
- The policy preview is shown in full on the import page (after the proposal) and in the import's teacher view, with a
  file name for the operator (`{id with - for :}-{version}.json`) and a download link of that exact file (roadmap S10
  scope: "policy preview download").
- The course page of an imported delivery course in PREPARATION says it is a delivery course, offers no build link, and
  has a section "Activation".

## Changes

| File | Content |
| --- | --- |
| `learning/context.py`, `learning/service.py` | `RunContext.policies`, `LearningService(policies=...)` |
| `learning/releases.py` | `_other_context` with the authoring context's own policy; `ReleasedRequirement`, `_bindable`, `ReleaseInspection.requirements` / `completion_rules`; `ActivationOutcome` |
| `learning/__main__.py` | `--other-policy` |
| `tests/test_releases.py` | `SeparatePolicyImportTest` (5 tests on both backends); inspection assertions |
| `services/api_common/contexts.py` | the resolver passed to `LearningService` |
| `services/authoring_api/releases.py`, `app.py` | `POST …/delivery-imports`, `POST …/activations`; version 0.14.0 |
| `services/openapi/authoring.json`, `apps/packages/api-client/src/generated/authoring.ts` | regenerated |
| `tests/services/test_authoring_delivery_api.py` (new), `test_api_openapi.py` | API tests (4 on both backends); route list |
| `apps/studio/src/features/delivery/` (new: `delivery.ts`, `ImportPage.tsx`, `ActivationSection.tsx`, `PolicyPreviewSection.tsx`) | the import page, the policy preview, the activation section |
| `apps/studio/src/features/course-build/buildApi.ts` | `proposeImport`, `proposeActivation` |
| `apps/studio/src/features/review/` (`routes.tsx`, `paths.ts`, `teacher.ts`, `TeacherView.tsx`, `ProposalPage.tsx`), `release/ReleasePage.tsx`, `course/CoursePage.tsx` | the import route; the preview in the import's teacher view; the notice after applying an import; the delivery course opens on its import; the activation section |
| `apps/studio/src/i18n/en.json` | the labels above |
| `apps/studio/test/delivery.test.tsx` (new), `release.test.tsx`, `teacher-view.test.ts` | studio unit tests |
| `apps/e2e/delivery.spec.ts` (new), `release.spec.ts` | the browser test of the acceptance; the delivery course now opens on its import |
| `docs/architecture/role-applications.md`, `docs/architecture/releases.md` | "Delivery import and activation from the studio (S10, part 2)", policy resolution, `--other-policy`, the browser test row |

## Verification

**Contract tests first.** `SeparatePolicyImportTest` failed (`LearningService` had no `policies`) until the core
change; the new inspection assertions failed until `_bindable`. The API tests of `test_authoring_delivery_api.py` were
written before the routes but **first run after them** (all passed then); the OpenAPI route list was extended before
the snapshot was regenerated. One expectation of the API test was corrected before it ran (a learner on the new course
gets 403, not 404). The CLI test first asserted the refusal text, which the CLI does not print (it prints its generic
message); it now asserts the exit code and that nothing was proposed. The studio unit tests were written after the
components; `release.test.tsx` and `teacher-view.test.ts` failed until updated for the import navigation and the
`policy` field.

| Check | Result |
| --- | --- |
| `unittest discover -q`, telemetry off, before the download link | 1128 tests, OK, 213 skipped (1110 / 204 before: 18 new tests, their 9 PostgreSQL variants are the new skips) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`), final tree | OK, OK, 169 tests OK (162 before) |
| `npx playwright test -c e2e/playwright.config.ts --list` | 19 tests in 11 files; compiles (typecheck includes `e2e/`) |
| `git diff --check` | exit 0 |

The last commit (the download link) changed only studio files and the guide; the Python suite was not run again after
it.

**Not verified locally.** The browser tests: the owner's demo stack held their ports; the CI job `browser` runs them.

## Findings (not changed in this PR)

1. **The two copies of the preview differ in key order**: the import page shows the API's order, the teacher view and its
   download the canonical copy of the proposal (sorted keys). Same policy; an operator comparing files as text sees a
   difference.
2. **After the import is applied, the preview is hard to reach.** The course is unavailable (404) until the preview is
   installed, so its teacher view is too; the CLI `show` needs the course's policy, which is the preview. The preview
   can be downloaded from the import page or the teacher view **before** the application, or read from the store's
   `PolicySet`. An operator path (for example a CLI command that prints the preview of an applied import with the
   previous policy) is not decided.
3. **Requirements are numbered, not grouped by activity or unit**: the seed shows "Use the exact cited source evidence
   for this authored item." three times. Extends the Chat 24 finding (import activities not grouped by unit).
4. **A delivery course reaches its import only from the release page.** Creating it opens the import, but returning to
   it later means opening the release again: the empty course page offers the build link only, and nothing records
   which release the course is for until the import is proposed (Chat 25 findings 1 and 2, narrowed).
5. **Completion handlers**: the studio always sends `all_completed`; `answer_key_match` and `all_true` are not offered.
6. **The CLI hides the import's refusal reasons** behind its generic message ("Operation not performed: …"); only the
   API shows them.
7. **Who may use the delivery**: the import's scope grants the delivery course's participants, its creator only (D25).
8. **Still open**: Chat 25 findings 3 and 4 (releases listed by number; titles of the latest revision), the Chat 24 and
   Chat 23 findings, D28, and issue #125 (release views not readable; owner: later).

## Open decisions

Proposed for the owner to record in the roadmap:

- a D-row refining D23: each context keeps its own trusted policy; a delivery import reads the authoring course with
  its own installed policy and is authorized by both (16 November 2026, #123);
- a D-row for the bindings: for each requirement, the resource the release pins or none (16 November 2026, this chat);
- S10's two acceptance boxes, once CI passes.

Still open from the roadmap: D19, D21, D25, D28, D29, D31–D33, G7 / D4.

## Next step

**S11 — Runtime assessor role (G7)**, which the roadmap says is specified in its own chat and needs an explicit owner
decision on how D4 is lifted before implementation. The owner may instead choose issue #125 (release views) first.

### Prompt for Chat 27

```text
You are Chat 27 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S11 — Runtime assessor role (G7)**, specification first: no implementation
until the owner has decided how D4 is lifted and the acceptance is written with the owner.

## Where things stand

- S10 is complete once the PR of Chat 26 is merged: release, delivery import (bindings, policy preview) and activation
  from the studio; activation of an assessed course is refused with RELEASE_RUNTIME_ROLE (D4). Read
  docs/plans/handoffs/chat-26.md.
- Issue #125 (release views not readable) is deferred by the owner; do not start it unless the owner says so.

## Protocol

1. Verify the baseline: git status, git log --oneline -3, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   and in apps/ npm run check:client, typecheck, test. Report any difference from the Chat 26 handoff.
2. Read AGENTS.md, the roadmap (working protocol, S11, D4, G7, D19, D25), docs/plans/handoffs/chat-07.md (G7),
   docs/architecture/authoring-lifecycle.md (evaluation flow), docs/architecture/releases.md (activation),
   learning/releases.py (RUNTIME_WORKERS, activation_findings) and the evaluation path (learning/assessment.py and the
   assessor-facing code the tests name, e.g. SIMULATED_ASSESSOR in tests/test_releases.py).
3. Write, for the owner, the options for lifting D4 (what a runtime assessor role is, which agent and adapter, what a
   human approves, what stays refused), with their consequences for activation and for S12. Ask the owner; do not
   pick one. Open the S11 issue with the acceptance agreed with the owner.
4. Only after the owner's decision: contract tests first, then the implementation, as the roadmap's working protocol.
5. Write docs/plans/handoffs/chat-27.md, open one focused PR (or only the issue and the handoff, if the step stops at
   the decision), wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No live model run; synthetic seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- Layout and visual design are owned by someone else: change labels and data, not styling.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's demo stack (ports 58000/58001, /tmp/alm-demo): never stop or restart it; read its stores read-only.
  When it runs, the browser tests run in CI.
- Do not decide D4/G7, D19, D21, D25, D28, D29, D31–D33. Propose roadmap changes in the handoff.
```

## PR and CI

PR [#126](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/126). First CI on `46c94ec`, push run
[43896391529](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43896391529) and pull_request run
[43896443684](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43896443684): six jobs passed,
`browser` failed in both: 18 tests passed, `delivery.spec.ts` failed at the teacher view's preview, which held the same
policy with its keys sorted (the proposal's canonical copy) while the test compared it as text with the import page's
copy (the API's key order). The test now compares the parsed policies. CI of the fix, on `a3797ac`: push run
[43899209426](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43899209426) and pull_request
run [43899221292](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43899221292): all 7 jobs of
each passed, `browser` included (19 tests; `delivery.spec.ts`: the import with one requirement unbound, its teacher
view and preview, the application, the operator's installation, activation refused in words; axe).
