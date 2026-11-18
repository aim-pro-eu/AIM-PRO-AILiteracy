# Chat 32 handoff — S12 part 1: the Learner API process, my courses, course view, own progress

Date: 18 November 2026. Base: `main` at `50cc6c9` (PR #140 merged).
Step: **S12, part 1** of the [prototype roadmap](../prototype-roadmap.md).
Issue: [#136](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/136) (stays open for part 2).
Branch `feat/s12-learner-api`.

No model was called; no live run. Synthetic seed only.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `50cc6c9` merge of #140, `2807091`, `55df885`, `ef943e7`, `2264566` |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1234 tests, OK, 265 skipped (363 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 183 tests OK |

No difference from the Chat 31 handoff.

## What was found before building

The `show` gap of Chat 30 (finding 2) was checked with two learners of one delivery before changing anything.
`load_context` already leaves out, for a learner-only subject, every record whose `learner` is another participant,
so another learner's evidence, occurrences and states were not in the entity list. What did reach the learner was
the context itself: the current `ExecutionContext` lists every participant (their subject keys are in the ids) and the
references of every learner's occurrences and states, and earlier revisions of the context, reachable from the
learner's own records, list them too (the test first failed on an earlier revision naming the other learner's
occurrence). That is what S12 closes.

## What was built

**Core (`learning/learner.py`, new).** Records and three reads, reached through `LearningService.course_view`,
`LearningService.own_progress` and `ContextServices.enrolled`:

- `enrolled_courses` — the one source of "my courses" (D19 for now; D37 changes it in S12b): LEARNING contexts with
  status ACTIVE whose installed policy grants the subject `LEARNER` and `read`, and whose participants include the
  subject as `LEARNER`. A pending membership changes neither, so its member is not listed.
- `course_view` — a projection of named fields from the delivery's active model (the imported release): the syllabus
  structure (phases, units, activities with instruction, intent, format, expected evidence, outcomes, strategies,
  materials, assessment), outcomes with their competences (the ALM topics, as the studio shows them), teaching
  strategies, materials (resources bound by a valid, approved binding in a scope the learner may read, the readiness
  check) and assessments (activities, outcomes, conditions, accepted evidence, rubric criteria and levels). No answer
  key; no proposal, decision, participant or learner record.
- `own_progress` — the learner's own occurrences, evidence, applied evaluations (assessment, mode, each criterion's
  level and reason, result) and learning states, matched to the learner's own participant whatever their other roles.
  A pending evaluation draft is only a candidate of its proposal and is never listed.
- Both views require `LEARNER` in the policy and the participant record (403 otherwise) and a LEARNING/ACTIVE delivery
  (422 "The course is not open to learners").

**`show` redaction (`learning/service.py`).** For a learner-only subject the context lists only its own participant,
occurrences and learning states, and earlier revisions of the context and other contexts' roots are left out. The CLI
`show` and `GET /contexts/{id}` share it. Staff see everything as before.

**Learner API (`services/learner_api`, new process).** `create_app` on the shared skeleton, modules `courses`
(`GET /courses`, `GET /courses/{context_id}`) and `progress` (`GET /courses/{context_id}/progress`), all reads with
`Cache-Control: no-store`; `python -m services.learner_api` (default port 58002); version 0.1.0; OpenAPI snapshot
`services/openapi/learner.json`, checked by `python -m services.api_common.openapi --check`. The Authoring API is
unchanged (still 0.16.0; its snapshot and the TypeScript client did not change).

**Seed.** The seed's policy is the test policy with a second learner, `learner-2`, granted as `learner`; both are
participants of both deliveries. `seed.json` gains `second_learner`; `python -m tests.seed --output DIR --attempt
--learner learner-2` records the second learner's attempt under its own request id.

## Changes

| File | Content |
| --- | --- |
| `learning/learner.py` (new) | `enrolled_courses`, `course_view`, `own_progress` and their records |
| `learning/service.py` | `course_view`, `own_progress`; the learner-only `show` redaction of the context |
| `services/api_common/contexts.py` | `ContextServices.enrolled` |
| `services/api_common/openapi.py` | the learner snapshot |
| `services/learner_api/` (new) | `__init__`, `__main__`, `app`, `courses`, `progress` |
| `services/openapi/learner.json` (new) | generated |
| `tests/seed.py` | `seed_policy`, `learner-2`, `second_learner`, `record_attempt(..., learner)`, `--learner` |
| `tests/test_learner_reads.py` (new) | my courses (policy ∩ participant, ACTIVE LEARNING only, pending member, grant without participant), course view (structure, materials, assessment, no answer key with an injected key, only course types), own progress (own records, pending draft hidden, applied evaluation and state), the `show` redaction; each read leaves the digests unchanged (11 tests, each on SQLite and PostgreSQL) |
| `tests/services/test_learner_api.py` (new) | every route is a read and is covered, 401, my courses from the one function, parity with the service, refusals, two-learner isolation on every endpoint and on the Authoring API summary with digests unchanged, configuration (6 tests on both backends, 2 more) |
| `tests/services/test_learner_boundaries.py` (new) | a separate interpreter serves every endpoint and loads no authoring module or model client; the probe detects one; the files import none (3 tests) |
| `tests/services/test_api_openapi.py` | two snapshots; the learner paths; no answer key, proposal, decision or participant property in the learner schemas; error bodies for both |
| `tests/test_seed.py`, `tests/services/test_api_contexts.py` | the seed policy, two learners in both deliveries, the second learner's attempt |
| `.github/workflows/aimpro-contracts.yml` | the new test modules in the architecture, PostgreSQL and API jobs |
| `docs/architecture/role-applications.md` | the Learner API section, processes table, seed, redaction, configuration |

Order of work: the core projections were tried on a scratch seed before their tests were written; the tests were then
written against the acceptance and the `show` test failed before its fix. Recorded here because the protocol asks for
contracts first.

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1277 tests, OK, 283 skipped (390 s; was 1234 / 265: 43 new tests, 18 of them PostgreSQL variants skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build` (in `apps/`) | OK, OK, 183 tests OK (unchanged), OK |
| `git diff --check` | exit 0 |

The PostgreSQL variants and the browser tests run in CI (reported in the PR).

## S12 acceptance (#136): part 1

- [x] Separate process, its own app, OpenAPI file and `--check`, sharing `services/api_common`; the architecture test.
- [x] My courses (D19), one function.
- [x] Course view (D20), no answer key (a test), no proposal, decision or other participant.
- [x] Own progress, never a pending evaluation draft.
- [x] Isolation across two learners on every Learner API endpoint and on the Authoring API context summary; every read
  leaves the table digests unchanged.
- [x] The seed gives a delivery with two synthetic learners; `evaluation --check`, the offline suite and
  `aimpro.generate --check` pass.
- Part 2: attempt submission, the learner request as a job, the finding 3 test.

## Findings (not changed)

1. A request id names one attempt of the context, whoever submits it: a learner who reuses another learner's request
   id gets 409 (`learning/assessment.py`, `record_attempt`). Nothing of the other attempt is returned, but the
   conflict tells that the id is taken. The submission endpoint of part 2 should give each submission an id that
   cannot collide (for example one made by the server or scoped by subject).
2. Both APIs name their session cookie `alm_session` and keep sessions in memory: on one host name, signing in to one
   replaces the other's session. The learner app (S13) needs its own host name or a proxy that keeps them apart.
3. `learner-2` is in no identity map yet: `infra/keycloak/identity-map.dev.json` and the dev realm have one learner.
   A browser test with two learners (S13) needs a second dev user.
4. The course view shows as materials every resource bound by the delivery in the learner's scope: today the teacher
   content (explanation, example, transcript) and the trainer worksheet as well as the source excerpt. Whether some
   bound resources are for teachers or trainers only is not recorded in ALM; to decide with the learner app (S13).
5. No typed client of the Learner API exists yet: the generator in `apps/packages/api-client` covers
   `authoring.json` only. The learner app (S13) adds one.
6. Still open from earlier chats: FORMAL needs authored verification rules (Chat 27, finding 1), the course list shows
   a subject's roles from the policy (Chat 28, finding 1), Chat 29 findings 4–7, Chat 31 findings 1–4.

## Open decisions

None answered in this chat. Still open: D21, D28, D29, D31–D33, the stale rule for evaluation drafts (S13).

## Roadmap rows to change (for the owner)

- **S12** row: "part 1 done (PR of chat-32.md): the Learner API process, my courses, course view, own progress,
  isolation; part 2 next".
- **S12 acceptance:** tick the part 1 items listed above.

## Next step

**Chat 33: S12 part 2** (#136): attempt submission (`submit`, idempotent by request id), the learner request as a job
(teacher and Socratic intents, Socratic option b, synthetic model responses only) and the finding 3 test. Then S12b
(#141), S13, S13b.

### Prompt for Chat 33

```text
You are Chat 33 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S12 part 2** (#136): attempt submission through the Learner API, the
learner request as a job run by the job worker, and the finding 3 test.

## Where things stand

- S12 part 1 is in the PR of docs/plans/handoffs/chat-32.md: services/learner_api (modules courses and progress),
  learning/learner.py (enrolled_courses, course_view, own_progress), the learner-only show redaction, a seed delivery
  with two learners. Read docs/plans/handoffs/chat-30.md, chat-31.md and chat-32.md.
- The S12 acceptance is on #136 and in the roadmap; part 2 is: "Attempt submission (submit), idempotent by request
  id; a learner still cannot propose, decide or apply, and a learner request still cannot persist an Evaluation";
  "Learner request as a job (request: teacher and Socratic intents, Socratic option b), run by the job worker; tests
  use synthetic model responses only"; "Finding 3 recorded in a test: a learner's submit makes a pending evaluation
  draft stale (today's rule; decided in S13)"; and the isolation rule for every new endpoint.

## Protocol

1. Verify the baseline on main (or on the part 1 branch if it is not merged; say which): git status, git log
   --oneline -5, gh pr list --state open, the Python suite with `python -m unittest discover -q` and telemetry off
   (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true CREWAI_TRACING_ENABLED=false), python -m aimpro.generate
   --check, python -m services.api_common.openapi --check, python -m evaluation --check, and in apps/ npm run
   check:client, typecheck, test. Report any difference from the Chat 32 handoff.
2. Read AGENTS.md, the roadmap (working protocol, D19, D20, S12, S12b, S13), issue #136, services/learner_api,
   learning/learner.py, learning/service.py (submit, request), learning/assessment.py (record_attempt),
   services/jobs (kinds, store, worker), services/authoring_api/jobs.py, the Socratic option b in
   docs/architecture/agentic-network-decisions.md, tests/services/test_learner_api.py and test_learner_boundaries.py.
3. Contract tests first: the submission endpoint (CSRF, idempotent by request id, a conflicting id refused, only the
   learner of an ACTIVE delivery, no Evaluation persisted, isolation across the two seed learners); the request job
   (kinds, who may queue and follow it, the worker runs LearningService.request with synthetic responses, the
   learner reads only their own jobs); the finding 3 test (a learner's submit makes a pending evaluation draft stale,
   today's rule); the Learner API still imports no authoring module. Chat 32 finding 1 (attempt request ids are per
   context) is input to the submission design: ask the owner before choosing if it changes the core.
4. Implement; run the S12 checks, the full offline suite, the generated-contract and OpenAPI checks, the studio
   checks. Write docs/plans/handoffs/chat-33.md; open one focused PR; wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed and synthetic model responses only. Never edit an AIM-PRO/jjodel export
  or the ALM metamodel.
- No learner app (S13). Do not start S12b (#141), #125 or #134.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only.
- Do not decide D21, D28, D29, D31–D33 or the stale rule for evaluation drafts.
```

## PR and CI

Reported in the PR conversation.
