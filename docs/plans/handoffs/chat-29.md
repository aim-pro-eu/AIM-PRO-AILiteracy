# Chat 29 handoff — S11 part 2: the runtime assessor (D4 lifted)

Date: 17 November 2026. Base: branch `feat/s11-membership-assessor` at `f1f022c` (Chat 28, part 1).
Step: **S11** of the [prototype roadmap](../prototype-roadmap.md), part 2 of 2.
Issue: [#129](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/129).
PR: [#131](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/131), one PR for the whole of S11 (owner
decision of 16 November 2026), marked ready by this chat.

This chat implemented the "Runtime assessor" acceptance of #129 on the same branch as the membership part: the
import configures the EVALUATOR runtime worker, an assessor asks `learner-response-evaluator` for a draft evaluation
of one observed attempt (core, CLI, API job, studio), a person decides and applies it. No model was called; every
model response in tests is synthetic. No AIM-PRO/jjodel export and no ALM metamodel file changed.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | branch `feat/s11-membership-assessor`, up to date with origin; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `f1f022c`, `fe0ec15` (part 1), `96b7a0a` merge of #130, `09352eb`, `b417739` |
| `gh pr list --state open` | #131 (draft) only |
| `unittest discover -q`, telemetry off | 1166 tests, OK, 232 skipped (500 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 174 tests OK |

No difference from the Chat 28 handoff.

## What was built

**Core (`learning/evaluation.py`, new).** `propose_evaluation(service, context, subject, {evidence, mode},
request_id, assessor_factory)`:

1. One write transaction: the subject must hold `propose` and the `ASSESSOR` role (policy ∩ participant record,
   `AuthorizationError` otherwise); an identical request returns its recorded result, another command under the same
   id is a `StateConflict`; the delivery must be LEARNING/ACTIVE, the evidence an observed `LearningEvidence` of this
   context, its activity ASSESS with an assessment specification, and the delivery must configure the EVALUATOR
   specialization; then the request is reserved. No model client exists before this point.
2. `assessor_factory()` builds the model; the prompt holds the activity's instruction, the outcomes, the assessment
   (allowed evidence, conditions, answer key), the rubric and the learner's response with its evidence ref; never the
   learner's identity. The answer, `EvaluationDraft` (`judgments`: criterion key, level key or none, reason, evidence
   refs; `result`), is untrusted data (`extra="forbid"`: no mode, context, specification or `assistedBy`).
3. Control builds the `Evaluation` (context, evidence, specification, mode, `assistedBy`, review key) and runs
   `validate_evaluation`. A failing draft, or an answer that is not a draft, goes back with the fixed reason (the R11
   reason, or `NOT_CHECKED`) and the rejected draft; at most `ATTEMPTS = 3`; then `FAILED`, fixed text. Any model
   error also ends in `FAILED`.
4. A second write transaction rechecks the reservation (an administrator may abandon it), the authority and the
   inputs, then records the proposal under the requester. The result is a `LearningResponse` (`PROPOSAL` or
   `FAILURE`), recorded for replay.

`learning/releases.py`: `RUNTIME_WORKERS` gains `EVALUATOR: learner-response-evaluator`; the `RELEASE_RUNTIME_ROLE`
reason no longer names D4 (it remains for an intent without a configured worker). `learning/service.py`:
`propose_evaluation`, `authorize_evaluation`. `main.py`: `build_runtime_assessor` (the registry's agent file, checked
against the runtime profile by `check_profile`; no tool; `response_format=EvaluationDraft`).

**CLI.** `python -m learning ... propose-evaluation --evidence REF --mode FORMATIVE|FORMAL --request-id ID`
(`_runtime_assessor`).

**Jobs and API.** Job kind `propose-evaluation` (`EvaluationJob`, `Resources.assessor`); the production worker passes
`_runtime_assessor`, the synthetic worker a synthetic assessor (highest level of each criterion). The API refuses to
queue it (403) for a subject without `ASSESSOR`. OpenAPI and the TypeScript client regenerated; API version kept at
0.15.0, the S11 version of this unmerged PR.

**Seed.** `python -m tests.seed --output DIR --attempt` records the learner's synthetic attempt at the delivery's
assessment through `submit` (see finding 1).

**Studio** (labels and data only, existing classes): `/contexts/{id}/assessments` (`features/assessments/`), linked
from the course page of an active delivery for a participant with `ASSESSOR`: the attempts at ASSESS activities, the
mode to choose (nothing preselected), "Ask the assessor agent for a draft", the job followed until it ends, a link to
the draft or the fixed reason. The review page shows an evaluation proposal in words ("Evaluate a student's
attempt": the agent and mode, the assessment, the student, the response, each criterion with level and descriptor or
"not determined", the reason, the result). The activation refusal is shown as reason, what to do and code for every
finding; the D4 sentence (`delivery.activation.assessor`) is removed.

**Browser test** `apps/e2e/assessment.spec.ts`: the operator installs the seeded delivery's preview; `dev-admin` adds
`assessor` as Assessor from the members page, approves and applies; proposes, approves and applies the activation; the
seed records the attempt; `dev-assessor`, in their own session, asks for a formative draft, reads it in words,
approves and applies it; one learning state follows. `delivery.spec.ts` (S10) now expects R08 only. The realm gains
`dev-assessor` and the dev identity map `assessor` (finding 2).

## Changes

| File | Content |
| --- | --- |
| `learning/evaluation.py` (new) | the runtime assessor command, `EvaluationDraft`, `check_profile`, `authorize_assessor` |
| `learning/releases.py`, `learning/service.py`, `learning/__main__.py`, `main.py` | EVALUATOR worker, service methods, CLI command, production builder |
| `services/jobs/kinds.py`, `services/jobs/__main__.py`, `services/authoring_api/jobs.py`, `services/authoring_api/releases.py` | job kind, worker resource, queue check, docstring without D4 |
| `services/openapi/authoring.json`, `apps/packages/api-client/src/generated/authoring.ts` | regenerated |
| `tests/test_runtime_assessor.py` (new) | contract tests: activation, drafts, retries, authority, replay, refused inputs, CLI (17 tests, each on SQLite and PostgreSQL) |
| `tests/authoring_cycle_fixtures.py` | `evaluation_draft`, `SyntheticAssessor`, `synthetic_evaluation`; `assessor_proposal` replaced by `assessor_draft`, the production path |
| `tests/test_authoring_cycle.py`, `tests/test_releases.py`, `tests/test_membership.py` | `SIMULATED_ASSESSOR` removed; activation now succeeds where D4 refused it; an import without the EVALUATOR worker still refuses |
| `tests/seed.py`, `tests/test_seed.py` | `record_attempt`, `--attempt` |
| `tests/services/job_fixtures.py`, `test_job_worker.py`, `test_authoring_jobs_api.py`, `test_authoring_delivery_api.py`, `test_api_openapi.py`, `test_dev_identity.py`, `tests/test_aimpro_runtime.py` | `activate_delivery`, `evaluation_job`; worker and API job tests; S10 API test expects a proposal; the new kind in the snapshot test; `assessor` mapped but in no policy; the builder test |
| `.github/workflows/aimpro-contracts.yml` | `tests.test_runtime_assessor` in the SQLite and PostgreSQL jobs |
| `infra/keycloak/alm-dev-realm.json`, `infra/keycloak/identity-map.dev.json` | `dev-assessor` → `assessor` |
| `apps/studio/src/features/assessments/` (new), `course/CoursePage.tsx`, `review/{teacher.ts,TeacherView.tsx,paths.ts,routes.tsx}`, `course-build/{buildApi.ts,JobsList.tsx}`, `delivery/{delivery.ts,ActivationSection.tsx}`, `i18n/en.json` | the assessor page, the evaluation view, the queue call, labels |
| `apps/studio/test/assessments.test.tsx` (new), `teacher-view.test.ts`, `review-model.test.ts`, `delivery.test.tsx` | 4 + 1 + 1 new studio tests; the refusal without D4 |
| `apps/studio/src/features/review/model.ts`, `course/course.ts` | `latestProposals` keeps the latest revision of each proposal (see "PR and CI") |
| `apps/e2e/assessment.spec.ts` (new), `delivery.spec.ts`, `sign-in.setup.ts`, `support.ts`, `stack/paths.mjs` | the S11 browser test; `dev-assessor` session; policy files cleaned before each test |
| `docs/architecture/releases.md`, `authoring-lifecycle.md`, `role-applications.md` | the runtime assessor, no D4 refusal, the studio views, the seed step, the dev users |
| `docs/plans/handoffs/chat-29.md` (new) | this handoff |

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1214 tests, OK, 255 skipped (576 s; was 1166 / 232: 48 new tests, 23 of them PostgreSQL variants skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build` (in `apps/`) | OK, OK, 180 tests OK (was 174), OK |
| `git diff --check` | exit 0 |

The browser tests were **not run locally**: they need ports 58000/58001, which the owner's demo stack holds, and a
Keycloak that has imported the new `dev-assessor`. They run in CI (see "PR and CI").

## Findings (not changed)

1. **The seed's attempt is a separate step.** Decision 8 says the seed records a synthetic attempt through `submit`,
   and the acceptance activates the seeded delivery in the browser. Both cannot hold in one seed: `submit` needs an
   ACTIVE delivery, and activation refuses a delivery with learner history (`RELEASE_LEARNER_HISTORY`). So
   `python -m tests.seed --attempt` records it after the activation, on an existing seed (dev only); the browser test
   calls it. Please confirm this reading.
2. **A new dev user.** The browser test needs a mapped subject who is not yet a member: `dev-assessor` (realm) →
   `assessor` (identity map), in no policy. A running Keycloak imported the realm before this change and has no
   `dev-assessor` until it restarts (the owner's demo stack was not touched). `test_dev_identity` now allows exactly
   this one mapped subject outside the fixture policy.
3. **An evaluation proposal goes stale when the learner submits again.** Every attempt changes the delivery's
   version, and `apply_proposal` refuses a proposal whose base version changed. With one learner this is rare; with
   many it will be frequent. This is the core's rule for every proposal; S12/S13 should decide whether evaluations
   need another base (owner decision).
4. **The generic `propose` still accepts an `Evaluation` candidate** from a subject with `propose` (the old test path).
   It is not reserved to `propose-evaluation`; reserving it would be a new rule (owner decision).
5. **No retry on a timed-out or cut model call.** The generators split or retry on `reached`/`cut` (D34); the
   assessor ends the request with the fixed failure at once. A real run may show whether this matters.
6. **Pending drafts are not on the assessor page.** It lists the evaluations already applied; a pending draft is in
   the review inbox. Asking again with another mode starts another draft.
7. **The runtime assessor has no retrieval.** The agent file lists `search_documents`; the builder gives it no tool,
   so it judges the supplied rubric and evidence only.
8. Still open: FORMAL needs authored verification rules (Chat 27, finding 1; a FORMAL evaluation leaves the state
   IN_PROGRESS/UNVERIFIED here); the course list shows a subject's roles from the policy (Chat 28, finding 1); the S10
   section of `role-applications.md` still says "D25 open" in its point 7 (history, not changed).

## Open decisions

Proposed for the owner to record in the roadmap:

- a D-row for **D25** (option A, Chat 28) and one for **G7 / D4** (lifted by option A, decisions 1–8 of #129, 16
  November 2026); remove both from the open decisions;
- **S11** done when #131 is merged: acceptance in #129;
- **S12** "Depends on": S11 (done), D19, D20 (decided); finding 3 to be considered there.

Still open: D19, D21, D28, D29, D31–D33.

## SE-AI case study (17 November 2026)

After this handoff the owner asked for a case study covering everything built so far, sized for an hour, and
authorized live model calls for it (Anthropic for every agent, 8 units, the owner driving the studio, sources from the
WP3 corpus). The package is `examples/se-ai/` (PR of this addendum): a Software Engineering course with AI literacy
support written against the unchanged 4 November 2026 metamodels (4 modules, 8 learning targets, 16 activities,
10 competencies, 4 rubric tasks; audit and strict conformance clean), its native jjodel project `SE-AI.jjodel`, a
worker with every agent on the `anthropic` profile in its own process only (`live_worker.py`), a stack script, a
dev-only stand-in for the learner's submission (`attempt.py`) and the step-by-step script.

The owner merged #131 (`287cfff`) and ran the script on `main`. Every step passed, from the upload to an applied
formative evaluation; model time about 20 minutes (Curator 3 min 09 s, Evaluator 5 min 31 s, Teacher 5 min 23 s,
Trainer 5 min 20 s, runtime assessor 15 s); no job failed or was rejected. The assessor's draft on a deliberately
middling answer gave levels 3, 2 and 0, and named the personal-data issue the answer missed. Details and the
requirements used: `examples/se-ai/README.md`, "First run".

Studio findings, filed and planned (roadmap, "Planned order"):

- #132: an existing course id as delivery course opens an import that is refused → S11b;
- #133: pending activation and membership proposals are not shown; memberships proposed together go stale (proposed
  owner decision **D36**) → S11b;
- #134: the next action is hard to find on long review pages; with #125 → S13b, with the layout owner.

Fixed in the package itself: `stack.sh` did not create the empty learning store (the API and the worker refuse to
create one); the script's labels now match the studio.

## Next step

**Chat 30: D19 and D36**, the decisions S12 and S11b wait for (options for the owner, not decided by a chat), then the
S12 specification. Then S11b, S12, S13, S13b (roadmap, "Planned order").

### Prompt for Chat 30

```text
You are Chat 30 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **D19 and D36**, the open decisions S12 (Learner API) and S11b (studio
flow fixes) wait for: write the options for the owner and ask; do not pick one. Then, if the owner decides and
confirms the S12 acceptance, specify S12 on a new issue and hand it off. No code in this chat.

## Where things stand

- S11 is merged (PR #131, 287cfff; issue #129 closed): membership (D25 = A) and the runtime assessor (D4 lifted).
  Read docs/plans/handoffs/chat-28.md and docs/plans/handoffs/chat-29.md, including "SE-AI case study".
- The owner ran the SE-AI case study live on 17 November 2026 (examples/se-ai/README.md, "First run"); its studio
  findings are #132, #133 (D36) and #134, planned in the roadmap ("Planned order"): S11b after this chat.
- Issue #125 (release views) belongs to S13b; do not start it.

## Protocol

1. Verify the baseline on main: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ npm run check:client, typecheck, test. Report any difference from the
   Chat 29 handoff.
2. Read AGENTS.md, the roadmap (working protocol, D19, D20, D36, S11b, S12, S13), learning/membership.py, the D35
   course list (services/authoring_api/context_summary.py, PolicyDirectory.readable), learning/service.py (show, the
   learner-only redaction), learning/evaluation.py, the Chat 29 findings 3 and 6, and issue #133.
3. Write for the owner the options for D19 (how a learner's courses are found: the contexts whose installed policy
   names them, as D25 = A allows; a separate enrolment record; another), with their consequences for S12, S13 and the
   redaction of LEARNING views; and for D36 (the core refuses a membership proposal while another is pending, or the
   studio only shows and warns), with their consequences for S11b and for enrolling many learners. Ask the owner;
   do not pick. Record the answers in the handoff and on #133, and the S12 acceptance agreed with the owner on a new
   S12 issue (consider Chat 29 finding 3: an evaluation goes stale when the learner submits again).
4. Write docs/plans/handoffs/chat-30.md, with the roadmap rows to change, open one focused PR, wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No live model run; synthetic seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- Layout and visual design are owned by someone else: change labels and data, not styling.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only.
- Do not decide D19, D21, D28, D29, D31–D33, D36. Propose roadmap changes in the handoff.
```

## PR and CI

PR [#131](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/131): part 1 `fe0ec15`, `f1f022c`; part 2
`32978ac` and the fix below.

The first CI run of `32978ac` failed in `browser` only ([run 44058710453](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/44058710453)):
`assessment.spec.ts` approved the evaluation, applied it, and the page then showed "Awaiting a decision" (20 other
browser tests passed). Cause: once an evaluation is applied, the context reaches, through LearningState → Evaluation
→ HumanDecision, the proposal revision that was decided; the course summary lists it before the store's latest
revision, and the studio took the first revision of each id. `latestProposals` now keeps the later revision of each
id, and the course history uses it (a contract test in `review-model.test.ts`). The result of the next run is
reported in the PR conversation.
