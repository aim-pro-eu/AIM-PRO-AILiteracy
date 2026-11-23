# Sequential chat plan

Prepared on 5 November 2026 after the project-status review and PR #47.
This is an execution plan, not evidence that any step below has been completed.

Run one chat at a time, in order. Copy the complete prompt for that chat.
Each prompt starts from the repository and current GitHub state, so it does not
depend on access to earlier conversations. Historical commit ids and issue
statuses must be verified before use.

Complete or explicitly resolve a chat's blockers before starting the next chat.
For code changes, finish review, required checks and integration before the next
chat consumes the implementation. Do not use another chat as an automatic retry
of a failed model run.

Every chat must leave a short English handoff in
`docs/plans/handoffs/chat-NN.md`, containing the objective, changes, PR/commit,
verification, evidence paths, unresolved findings and exact next action. Publish
only appropriate evidence: keep credentials, private databases, source excerpts
and raw provider traffic in the established local archive. An earlier model
transmission authorization does not authorize a new packet, model or run.

## Chat 01 — Integrate the documentation baseline

Completion: PR #47 is integrated, or a concrete blocker is documented; the
handoff identifies the actual integrated commit and current issue states.

```text
Work in /Users/juridirocco/development/py-prototype. Read AGENTS.md and
docs/plans/sequential-chat-plan.md. Chat with the owner in Italian; use English
for repository files, prompts and GitHub content. Work sequentially without
spawning agents. Preserve unrelated local changes.

Review PR #47, "Refresh published project status and evaluation evidence".
Verify its actual state, diff, checks and relationship to current main. Check
the updated #25 body against docs/evaluation.md and the retained report. Preserve
historical trial records and the distinction between NOT_EXECUTED and BLOCKED.

If the PR is already merged, verify the integrated result. Otherwise resolve
any material review findings, run the appropriate checks and merge it when all
required checks pass. Update the local baseline without discarding work.
Do not run live models or change learner state.

Write docs/plans/handoffs/chat-01.md with the integrated commit, verification,
actual #25/#10 status and the next action for Chat 02. Report any unresolved
blocker instead of claiming completion.
```

## Chat 02 — Make synthesis evaluation reproducible

Completion: controlled multi-step evaluation and its meaningful offline tests
are implemented and integrated; no new live model run is required here.

```text
Work in /Users/juridirocco/development/py-prototype. Read AGENTS.md,
docs/plans/sequential-chat-plan.md, docs/plans/handoffs/chat-01.md,
docs/evaluation.md and the current issue #25. Chat in Italian; write code,
documentation, prompts and GitHub content in English. Do not spawn agents.

Complete the evaluation harness needed to exercise all three synthesis attacks
on the current runtime: citation-synthesis-fabricated,
injection-synthesis-applied and socratic-synthesis-solution. Provide an explicit
evaluation-only controlled multi-step plan while retaining the real final
reviewer in live mode. Keep the existing natural-planning mode and production
authorization, deterministic checks and dispatch boundaries intact.

Include benign multi-step controls. Distinguish attack injection, synthesis
execution, actual blocking, NOT_EXECUTED and infrastructure errors. Record the
source commit, planning mode and relevant configuration so future reports can
be tied to an exact implementation. Do not expose secrets or learner content.

Add focused tests that establish the attack reaches synthesis/final review and
that benign controls can succeed. Run scripted evaluation and the relevant
evaluation/event tests. Add those offline checks to CI if they are still absent.
Do not make external model calls.

Publish a focused PR, inspect the checks and integrate it when verified. Update
#25 with implementation evidence without claiming live coverage. Write
docs/plans/handoffs/chat-02.md with the integrated commit, commands, remaining
live cases and the next action for Chat 03.
```

## Chat 03 — Observe live synthesis defences

Completion: the authorized evaluation has a reviewed report with actual coverage,
calls, latency and failures; #25 has an evidence-based disposition.

```text
Work in /Users/juridirocco/development/py-prototype. Read AGENTS.md,
docs/plans/sequential-chat-plan.md, docs/plans/handoffs/chat-02.md,
docs/evaluation.md and current #25. Chat in Italian; write artifacts, prompts
and GitHub content in English. Do not spawn agents.

Verify that the controlled multi-step evaluation is integrated and its offline
checks pass. Prepare a concrete transmission packet for the three synthesis
attacks and benign multi-step controls. Show the owner the exact provider/model,
synthetic inputs, repetitions, limits, expected calls, budget and retained evidence.
Pin the integrated source commit and configuration. Follow the repository's
actual live-run authorization requirements; do not infer authorization from
this planning prompt or an earlier run. Pause at the transmission boundary until
the owner authorizes that concrete packet.

After authorization, execute only the approved scope. Preserve original outputs,
failures, usage, timings and any NOT_EXECUTED results. Do not retry or repair a
failed run outside its authorization. Verify which attacks reached final review
and what reached the learner. Report benign false rejections separately.

Publish suitable evidence and update docs/evaluation.md and #25. Close #25 only
if its scope is actually satisfied; otherwise state the remaining gap precisely.
Keep private/raw evidence in the established archive. Integrate the reviewed
report changes and write docs/plans/handoffs/chat-03.md with the results and any
follow-up required before proceeding.
```

## Chat 04 — Consume the newer jjodel export

Completion: the consumer handles the actual custom data types, or an exact
missing-input blocker is recorded; external model ownership is preserved.

```text
Work in /Users/juridirocco/development/py-prototype. Read AGENTS.md,
docs/plans/sequential-chat-plan.md, docs/plans/handoffs/chat-03.md,
docs/aimpro/metamodel-change-requests.md and the latest #1–#4 discussions.
Chat in Italian; write code, documentation and GitHub content in English.
Do not spawn agents.

Locate the actual newer jjodel export mentioned in #3 and verify its hash and
declarations. If the export is unavailable, request that specific input; do not
invent an equivalent export or replace the checked-in source silently.

Implement consumer-side support for the custom dataTypes actually declared by
that export, including correct primitive resolution, references and generated
contracts. Reject unsupported or ambiguous declarations explicitly. Preserve
source identities and values, existing-export compatibility and reproducible
generation. Do not edit externally owned metamodels, normalize instance values
or migrate learner databases.

Run focused tests for the old and new inputs, generated-artifact drift checks,
the full-project audit and change-request checker. Keep source conformance,
consumer compatibility and upstream export/import acceptance separate. Document
which #1–#4 criteria are still unresolved; a successful consumer test does not
prove a jjodel round trip or stakeholder approval.

Publish and integrate the verified consumer change. Update #3 and any directly
affected issue with exact evidence. Write docs/plans/handoffs/chat-04.md with
the integrated commit, source hashes, results and the source version selected
for subsequent work. Do not automatically replace the approved authoring
project's pinned source or trigger fresh generation.
```

## Chat 05 — Generate and review Teacher content

Completion: the dedicated Teacher package is human-reviewed and applied, or its
actual rejection/failure is recorded. It must be an explicit #10 observation.

```text
Work in /Users/juridirocco/development/py-prototype. Read AGENTS.md,
docs/plans/sequential-chat-plan.md, docs/plans/handoffs/chat-04.md,
docs/architecture/authoring-generators.md, the portable SCN01 Evaluator evidence
and current #10. Chat in Italian; write prompts, artifacts and GitHub content
in English. Do not spawn agents.

Continue #10's dedicated author-side Teacher workflow. Resolve the actual exact
approved/applied syllabus, assessment package, project revision and current
permissions through production services. Check receipts and freshness. Preserve
the accepted Evaluator limitations. Use a fresh isolated authoring copy; preserve
the original archive and approved source lineage. Do not silently substitute a
new export merely because the consumer now supports it.

Prepare the exact Teacher command and transmission packet using the production
generator. Show the provider/model, source excerpts, requested complete assets,
constraints, limits and budget. Obtain the specific live transmission
authorization required by the project before running it.

After authorization, execute the approved scope, preserve original output and
separate Lead review, and inspect complete explanations, examples, transcripts,
citations, unit intent and assessment compatibility. Present findings and the
exact proposal for the owner's human decision. Record and apply only the actual
authorized decision; do not infer approval from Lead ACCEPT. Demonstrate exact
replay without model calls. Do not activate learning or create a release.

Publish suitable evidence and update #10. Write
docs/plans/handoffs/chat-05.md with exact project/package refs, decisions,
application receipts, limitations and the Trainer inputs. Do not start Chat 06
with unresolved prerequisite findings that require a new Teacher revision.
```

## Chat 06 — Generate and review Trainer content

Completion: #10's real Teacher/Trainer acceptance is satisfied or its remaining
gap is explicit; approval is not confused with delivery readiness.

```text
Work in /Users/juridirocco/development/py-prototype. Read AGENTS.md,
docs/plans/sequential-chat-plan.md, docs/plans/handoffs/chat-05.md,
docs/architecture/authoring-generators.md and current #10. Chat in Italian;
write prompts, artifacts and GitHub content in English. Do not spawn agents.

Resolve fresh exact approved/applied syllabus, assessments and project refs for
the dedicated Trainer generator. Include approved Teacher shared_content only
when it is an actual generation dependency. Prepare a separate concrete
transmission packet with the provider/model, sources, worksheet/material briefs,
constraints, limits and budget. Obtain its specific required authorization;
the Teacher authorization does not cover this run.

Execute only the authorized scope in the isolated authoring environment. Preserve
the original draft and separate Lead verdict. Review complete practice
instructions, worksheets, shared references, citations and fictional-data
constraints. Obtain and record the actual human decision; apply only when
authorized. Verify receipts, freshness and exact replay without models.

Exercise focused dependency revision/regeneration offline in a disposable copy
using the existing acceptance infrastructure; do not invalidate the approved
project or spend additional model calls without authorization.

Publish the real Teacher/Trainer evidence and update #10 against its acceptance
scope. Close it only when that scope is satisfied. Integrate the report changes.
Write docs/plans/handoffs/chat-06.md with selected artifacts, decisions, remaining
limitations and the release/import gaps. Do not activate delivery or claim
learner achievement, rubric validity or pilot readiness.
```

## Chat 07 — Prepare the convergence and delivery decision

Completion: the owner has a concrete decision packet for the remaining external
model and production delivery work, without implied stakeholder agreement.

```text
Work in /Users/juridirocco/development/py-prototype. Read AGENTS.md,
docs/plans/sequential-chat-plan.md, docs/plans/handoffs/chat-06.md,
docs/architecture/agentic-network-decisions.md,
docs/architecture/authoring-lifecycle.md and current #1–#4/#29.
Chat in Italian; write documentation and GitHub content in English.
Do not spawn agents.

Prepare the next implementation/decision packet from the now-verified state.
Describe the exact approved authoring artifact graph and what production
release/import still lacks. Separate consumer implementation from externally
owned AIM-PRO changes and from stakeholder decisions.

Give concrete options for linking SCN01 to evidence/rubrics and converging the
ALM authoring/release/delivery model into AIM-PRO. Identify the decisions and
acceptance evidence needed from the model owners/WP2 through the documented
coordination contact. Prepare proposed questions and mapping tables locally;
do not send messages to others or imply their acceptance.

Define a bounded subsequent release/import implementation with frozen exact
versions, stale-dependency refusal, approval receipts, destination resource
permissions, separate activation and historical learner-state preservation.
Do not implement against an unresolved external mapping or modify the external
metamodel without an explicit decision.

Update the architecture decision register and write
docs/plans/handoffs/chat-07.md with proposed choices, responsible decision makers,
open questions and a reviewable implementation scope. Keep #15, tutor/twin work,
local inference and governance visible as subsequent work; do not silently fold
them into this increment.
```
