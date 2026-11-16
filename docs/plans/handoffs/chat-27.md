# Chat 27 handoff — S11 specification: the runtime assessor role (G7) and how D4 is lifted

Date: 16 November 2026. Base: `main` at `85fd774` (PR #128 merged).
Step: **S11** of the [prototype roadmap](../prototype-roadmap.md), specification only.
Issue: [#129](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/129).
Branch `docs/s11-specification`, PR: see the end of this file.

This chat stops at the decision, as the roadmap's S11 scope requires. The owner chose how D4 is lifted, but chose to
wait for **D25** (course membership) before S11 is implemented. No code, test, schema, policy, realm file, configured
model or AIM-PRO/jjodel export changed, and no model was called. This file is the only change in the PR.

## Objective

Write for the owner the options for lifting D4: what a runtime assessor role is, which agent and adapter run it, what
a person approves and what stays refused. Give their consequences for activation and S12, ask the owner, and open the
S11 issue with the acceptance agreed with the owner.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this PR |
| `git log --oneline -3` | `85fd774` merge of #128 (D35 course list), `f02852b`, `f3fa056` merge of #126 |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1134 tests, OK, 216 skipped |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 170 tests OK |

**Difference from the Chat 26 handoff:** PR #128 (D35, the studio course list) was merged after Chat 26. Chat 26 ended
with 1128 / 213 Python tests and 169 studio tests; the 6 new Python tests (3 new skips) and the 1 new studio test are
not explained by Chat 26 and are attributed to #128 without a further check.

## What was found (protocol step 2)

- **The refusal is in one place.** `RUNTIME_WORKERS` in `learning/releases.py` configures Teacher
  (`lesson-explainer`) and Trainer (`guided-practice-coach`) workers only. `activation_findings` reports
  `RELEASE_RUNTIME_ROLE` for each activity whose intent maps (`ROLE_CONTRACTS` in `learning/planning.py`) to a role
  with no `AgentSpecialization` in the delivery's runtime model; for ASSESS (role EVALUATOR) this is D4.
- **The runtime agent already exists.** `agents/learner-response-evaluator.md`: category `evaluator`, mode `LEARNING`,
  expected output `ASSESSMENT`, tools `search_documents` only, no skills. It passes the import's profile check in
  `_workers`. `tests/test_releases.py` and `tests/test_authoring_cycle.py` patch it in as `SIMULATED_ASSESSOR`, and
  activation then succeeds.
- **The assessor-facing adapter is what is missing.** A learner's ASSESS request runs the evaluator, but
  `LearningService.request` persists worker proposals under the learner's subject, who has no `propose`: the request
  fails and nothing is written (`test_learner_request_cannot_persist_an_evaluator_change_proposal`, by design). In the
  tests the `Evaluation` is built by the fixture `assessor_proposal` (`tests/authoring_cycle_fixtures.py`) and proposed
  with the generic `propose` as `admin`.
- **The rules downstream exist.** `record_attempt` records observed evidence; `validate_evaluation`
  (`learning/assessment.py`) requires observed evidence of one learner, the specification fixed for the activity, every
  outcome covered and one judgment (or explicit unknown) per rubric criterion; `_reviewer_allowed`
  (`learning/decisions.py`) requires `ASSESSOR` or `ADMINISTRATOR` to decide an `Evaluation`; `derive_learning_state`
  infers acquisition only from rules, and VERIFIED only for a FORMAL, approved evaluation with a verification rule.
- **The metamodel already carries the assistance.** `Evaluation` has `assistedBy` (`AgentSpecialization`, 0..1) and
  `mode`; `AssessmentSpecification` has no mode, so the mode is not fixed by the design.
- **Who may assess a studio course.** D23 gives the creator `ADMINISTRATOR` and `CONTENT_RESPONSIBLE`
  (`CREATOR_ROLES` in `services/authoring_api/courses.py`), not `ASSESSOR`. `ADMINISTRATOR` may already decide an
  `Evaluation`, so the creator could; a distinct assessor needs D25.
- **The seed today.** The Chat 26 browser test shows the refusal of the seeded delivery as R08 (one requirement left
  unbound on purpose) and the D4 text for its ASSESS activity.

## Options written for the owner

Common to every option: an `Evaluation` stays a proposal that a person decides and applies; a learner request still
cannot write one; no live model run in S11.

| Option | What the runtime role is | What a person approves | Activation | S12 |
| --- | --- | --- | --- | --- |
| **A. Agent draft on the assessor's request** | A job started by an assessor on one observed attempt; `learner-response-evaluator` drafts the criterion judgments; control builds, checks and proposes the `Evaluation` | The evaluation proposal | The import configures the EVALUATOR worker; `RELEASE_RUNTIME_ROLE` no longer blocks ASSESS | The learner submits; an assessor starts the draft and decides |
| B. Automatic agent draft after each submission | The same job, started by the submission under a service identity that may only propose evaluations | The evaluation proposal | As A | Drafts are ready when the assessor opens them; the policy gains a non-human subject (a new rule) |
| C. Human assessor only | No agent: the assessor writes one judgment per criterion in the studio | The evaluation proposal | A new finding replaces `RELEASE_RUNTIME_ROLE`: the installed policy must grant someone assessment authority | No model call; an agent can come later as A |

## Decisions

**Owner, 16 November 2026 (asked in this chat), recorded on #129:**

1. **Option A.** D4 is lifted by an assessor-requested evaluation draft by `learner-response-evaluator`.
2. **Who decides the evaluations of a studio delivery course waits for D25.** The owner chose neither the creator's
   existing `ADMINISTRATOR` authority nor an `ASSESSOR` grant written by the import's policy preview. S11 is not
   implemented before D25 is decided.
3. **FORMATIVE and FORMAL** evaluations, with the existing rules of `derive_learning_state`.
4. **Scope: core, CLI, API and studio** (the activation of the seed and the assessor's views in the browser).

The acceptance is on #129 as a draft, to be confirmed with the owner when D25 is decided.

## Changes

| File | Content |
| --- | --- |
| `docs/plans/handoffs/chat-27.md` (new) | this handoff |

## Verification

The baseline above is the only verification: nothing else was changed. `git diff --check` on the PR's one file: see
the PR section.

## Findings (not changed in this PR)

1. **FORMAL needs authored verification rules.** As with completion rules, the generators author no outcome
   `verificationRule` or specification `decisionRule`; without them a FORMAL evaluation leaves the learner
   IN_PROGRESS / UNVERIFIED. Whether S11 shows this in words or a later step authors such rules is open.
2. **The seed has no learner attempt.** The browser test of S11 needs one before the Learner API (S12) exists; the
   seed command could record a synthetic attempt through `submit` (a dev-only path, D15).
3. **Self-review.** The assessor who requests a draft may today also decide it (one subject). Whether an assisted
   evaluation needs a second person is not decided (listed on #129).
4. **The D4 text is in the studio** (`activation.assessor` in `apps/studio/src/i18n/en.json`) and in
   `docs/architecture/releases.md`, `authoring-lifecycle.md`, `role-applications-plan.md` (Phase 8); all change when
   S11 is implemented.
5. **Still open**: the Chat 26 findings (the preview's key order, reaching the preview after application, requirements
   numbered not grouped, the delivery course reached only from the release page, completion handlers, CLI refusal
   reasons, D25), D28, and issue #125 (release views; owner: later).

## Open decisions

Proposed for the owner to record in the roadmap:

- a D-row for G7 / D4: lifted by option A (assessor-requested draft by `learner-response-evaluator`, recorded as a
  proposal, decided and applied by a person), FORMATIVE and FORMAL, scope core to studio (16 November 2026, #129);
  remove "G7 / D4 lift" from the open decisions;
- S11 "Depends on": add **D25**; its "Acceptance" points to #129;
- move **D25** to "Needed by: S11" (the assessor of a studio delivery course), in addition to S10's learners.

The open details on #129 (who chooses the mode, retry of a failed draft, the seed's attempt, self-review) are to be
confirmed with the acceptance. Still open from the roadmap: D19, D21, D25, D28, D29, D31–D33.

## Next step

**D25 — course membership**, decided by the owner (in a chat that writes its options, or directly). Then **S11**
implementation against #129: contract tests first, as the working protocol. The owner may instead choose issue #125
(release views) first.

### Prompt for Chat 28

```text
You are Chat 28 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **D25 — course membership**, as the decision S11 waits for: write the
options for the owner and ask; do not pick one. Then, if the owner decides D25 and confirms the S11 acceptance on
#129, implement **S11** in the same chat or hand it off.

## Where things stand

- Chat 27 specified S11 (issue #129): D4 is lifted by option A, an assessor-requested evaluation draft by
  learner-response-evaluator, recorded as a proposal and decided by a person; FORMATIVE and FORMAL; scope core, CLI,
  API and studio. Who decides the evaluations of a studio delivery course waits for D25. Read
  docs/plans/handoffs/chat-27.md and issue #129.
- Issue #125 (release views not readable) is deferred by the owner; do not start it unless the owner says so.

## Protocol

1. Verify the baseline: git status, git log --oneline -3, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   and in apps/ npm run check:client, typecheck, test. Report any difference from the Chat 27 handoff.
2. Read AGENTS.md, the roadmap (working protocol, D23, D25, D19, S11, S12), issue #129, docs/plans/handoffs/chat-27.md,
   services/authoring_api/courses.py (CREATOR_ROLES, the course template), learning/policies.py (roles, scopes),
   learning/decisions.py (_reviewer_allowed) and learning/releases.py (the import's policy preview).
3. Write for the owner the options for D25 (how other teachers, trainers, assessors and learners join a course created
   from the studio: new policy versions written by the API, a change of a context's policies reference, an enrolment
   record, or another), with their consequences for S11 (who decides an evaluation), S12 and D19. Ask the owner; do
   not pick one. Record the answer on #129 and confirm its acceptance and open details with the owner.
4. Only after the owner's decisions: contract tests first, then the implementation of S11, as the working protocol.
5. Write docs/plans/handoffs/chat-28.md, open one focused PR, wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No live model run; synthetic seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- Layout and visual design are owned by someone else: change labels and data, not styling.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's demo stack (ports 58000/58001, /tmp/alm-demo): never stop or restart it; read its stores read-only.
  When it runs, the browser tests run in CI.
- Do not decide D19, D21, D25, D28, D29, D31–D33. Propose roadmap changes in the handoff.
```

## PR and CI

PR [#130](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/130), one documentation file;
`git diff --check` exit 0. The CI result is reported in the PR conversation.
