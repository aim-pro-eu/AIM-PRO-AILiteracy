# Chat 33 handoff — S12 part 2: attempt submission, the learner request as a job, finding 3

Date: 18 November 2026. Base: `feat/s12-learner-api` at `3a350ed` (S12 part 1, PR #142), merged into `main` as
`66680de` during this chat.
Step: **S12, part 2** of the [prototype roadmap](../prototype-roadmap.md).
Issue: [#136](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/136).
Branch `feat/s12-learner-writes`, from `3a350ed`; its PR targets `main`.

No model was called; no live run. Synthetic seed and synthetic model responses only.

## Baseline verified before any change

PR #142 was open at the start, so the baseline is its branch, `feat/s12-learner-api`.

| Check | Result |
| --- | --- |
| `git status` | someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `3a350ed` (S12 part 1), `50cc6c9` merge of #140, `2807091`, `55df885`, `ef943e7` |
| `gh pr list --state open` | #142 (S12 part 1) |
| `unittest discover -q`, telemetry off | 1277 tests, OK, 283 skipped (403 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 183 tests OK |

No difference from the Chat 32 handoff.

## What was found before building

1. **Chat 32 finding 1** (an attempt's request id is per context) is solved in the Learner API, without changing
   the core: every attempt and question is recorded under `learner:{subject}:{id}`
   (`learning.learner.learner_request_id`), where `id` is the learner's own (`ClientRequestId`, no colon). Two
   learners may use the same id; neither learns which ids the other used. `record_attempt`, the ALM requests table
   and the jobs store keep their per-context keys, so no owner question was needed.
2. **The worker authorized every job with `propose`**, which a learner never holds. A job kind now names its own
   check (`JobKind.authorize`) and its own outcome mapping (`JobKind.outcome`); the generators keep the default.
3. **`LearningService.request` wrote whatever records the agents handed back.** A synthetic run returning an
   `Evaluation` among its records persisted it (tried on the seed before any change). The real orchestrator
   returns only `TaskPlan`, `WorkerTask` and `TaskResult`, so this never happened in a real run, but the
   acceptance ("a learner request still cannot persist an `Evaluation`") was not enforced. `request` now writes
   only those three types besides its proposals; any other record fails the run (for every subject).
4. **The Learner API could not import `services.jobs`**: the boundary test listed the whole package as authoring,
   and `services.jobs.kinds` imports the generators. The learner job lives in `services.jobs.learner`, which
   imports no generator; the boundary now forbids `services.jobs.kinds`, `services.jobs.worker` and
   `services.jobs.__main__` and checks that the Learner API files, `services/jobs/learner.py` and
   `services/jobs/store.py` import no authoring module.
5. **Early clarifications are not recorded by the core.** `request` returns a clarification without recording it
   when, for example, the problem stays with the Socratic coach or no problem key is given. The job then holds the
   core's fixed text in `detail`; `response` is only ever what the core recorded for that learner.

## What was built

**Core (`learning/learner.py`, `learning/service.py`, `learning/store.py`).**

- `learner_request_id`, `ClientRequestId`; `Question` (text, intent `EXPLAIN` or `SOCRATIC_GUIDANCE`, problem key,
  explicit switch from the coach, activities); `Answer` (kind, content, citations, coverage, findings: never a
  proposal, decision or state).
- `submit_attempt`: the learner check of the reads, then `record_attempt` under the scoped id; returns the
  learner's `Evidence` projection. `LearningService.submit_attempt`.
- `question_request`: the learner check, `interact`, the scoped id checked, then the `LearningRequest`.
  `LearningService.ask` runs it through `request` with the given agents; `authorize_learner_requests` checks
  without recording; `learner_answer` / `own_answer` read the recorded response of the learner's own request.
- `request(..., orchestrator_factory=None)`; `RUN_RECORDS` guard.
- `LearningStore.request_record`: a request's payload and result by id, read only.

**Jobs (`services/jobs`).** `learner.py` (new): the kind `learner-request`, its run (needs
`Resources.orchestrator`, else rejected), its authorization and its outcome (`COMPLETED` for an answer or a
clarification, `FAILED`, `ABANDONED`; `detail` only when nothing was recorded). `kinds.py`: `Resources.orchestrator`,
`JobKind.authorize` and `JobKind.outcome`, the learner kind registered. `worker.py`: the kind's authorization and
outcome. `store.py`: `list(..., subject_key=, kinds=, excluded_kinds=)`. `__main__.py`: the CLI's `_orchestrator` as
the learning agents.

**Authoring API (`services/authoring_api/jobs.py`).** Lists and reads no `learner-request` job (404). Version and
snapshot unchanged (0.16.0).

**Learner API (`services/learner_api`, 0.2.0).** Modules `attempts` (`POST /courses/{context_id}/attempts`) and
`questions` (`POST` and `GET /courses/{context_id}/questions`, `GET /courses/{context_id}/questions/{request_id}`);
both writes need the CSRF header; `questions` needs `ALM_JOBS_STORE`. Snapshot `services/openapi/learner.json`
regenerated.

## Changes

| File | Content |
| --- | --- |
| `learning/learner.py` | scoped request ids, `Question`, `Answer`, `submit_attempt`, `question_request`, `own_answer` |
| `learning/service.py` | `submit_attempt`, `authorize_learner_requests`, `ask`, `learner_answer`; `request` with a given agent factory and the `RUN_RECORDS` guard |
| `learning/store.py` | `request_record` |
| `services/jobs/learner.py` (new), `kinds.py`, `worker.py`, `store.py`, `__main__.py`, `__init__.py` | the learner request job; per-kind authorization and outcome; list filters |
| `services/authoring_api/jobs.py` | learner questions neither listed nor read |
| `services/learner_api/attempts.py`, `questions.py` (new), `app.py` | the two modules, version 0.2.0 |
| `services/openapi/learner.json` | generated |
| `tests/services/test_learner_writes.py` (new) | submission (idempotent, conflicts, CSRF, who, no evaluation, two learners with the same id), a learner still cannot propose, decide or apply, finding 3, the question job (queue, worker, answer, idempotence, the Socratic coach and the switch, never a proposal or an evaluation, who, the worker's own checks, two learners, hidden from the Authoring API); 16 tests on SQLite and PostgreSQL |
| `tests/test_learning_service.py` | a run writes only its own records; the agent factory given per request |
| `tests/services/test_job_store.py` | the list filters |
| `tests/services/test_job_worker.py` | the learner kind among the kinds |
| `tests/services/test_learner_api.py` | read routes, the jobs store in the settings, the registered modules, `questions` needs `ALM_JOBS_STORE` |
| `tests/services/test_learner_boundaries.py` | the probe also posts an attempt and a question and reads the questions; the narrower authoring list |
| `tests/services/test_api_openapi.py` | the learner paths and the question intents |
| `.github/workflows/aimpro-contracts.yml` | `tests.services.test_learner_writes` in the PostgreSQL and API jobs |
| `docs/architecture/role-applications.md` | the Learner API section (part 2), agent jobs, configuration |

Order of work: the contract tests were written first and failed (import errors, the factory argument, the list
filters, and the run-records test returning `ANSWER`); then the implementation. Two test expectations changed while
implementing: early clarifications are read in `detail` (finding 5 above), and the counts of proposals are compared
with the seed's (the activated delivery already holds two).

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1316 tests, OK, 302 skipped (413 s; was 1277 / 283: 39 new tests, 19 of them PostgreSQL variants skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 (the learner snapshot regenerated; the authoring snapshot unchanged) |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 183 tests OK (unchanged; one test timed out once while the Python suite ran beside it, and passed on every run alone) |
| `git diff --check` | exit 0 |

The PostgreSQL variants and the browser tests run in CI (reported in the PR).

## S12 acceptance (#136): part 2

- [x] Attempt submission (`submit`), idempotent by request id; a learner still cannot propose, decide or apply, and
  a learner request still cannot persist an `Evaluation` (now enforced by `request`).
- [x] Learner request as a job (teacher and Socratic intents, Socratic option b), run by the job worker; tests use
  synthetic model responses only.
- [x] Isolation on every new endpoint, with the same request ids for two learners; every read leaves the table
  digests unchanged.
- [x] Finding 3 recorded in a test: a learner's submit makes a pending evaluation draft stale (today's rule).
- With part 1 (merged), every S12 acceptance item is met; #136 can be closed once this PR is merged.

## Findings (not changed)

1. **No abandonment of a learner's question.** The Authoring API does not read `learner-request` jobs, so an
   administrator cannot abandon one; a question whose worker was interrupted stays `RUNNING`, and the learner asks
   again under a new id. To decide with S13.
2. **One key space per context in the jobs store.** A staff job id that starts with `learner:{subject}:` would
   collide with that learner's question (409). Staff choose their ids freely; reserving the prefix in the
   Authoring API would close it.
3. **No progress stream for a question.** The learner polls `GET .../questions/{id}`; the learner app (S13) may
   want the content-free events as a stream.
4. **The synthetic worker has no learning agents.** `tests/synthetic_worker` (dev only) rejects questions ("The
   learning agents are not available to the worker"); the S13 browser tests need a synthetic orchestrator there.
5. **The seed's course has no Socratic specialization.** Its active model holds Teacher, Trainer and Evaluator
   specializations only, so a real run of `SOCRATIC_GUIDANCE` on the seed would find no Socratic coach. The tests
   use synthetic agents behind `request`; the Socratic continuity rules of `request` are exercised, the coach's
   prompt is not. A Socratic coach in a course is an authoring question (S13 or later).
6. **A clarification before recording carries no findings to the learner.** When readiness blocks a question, the
   learner reads the fixed text only (`detail`), not the blocking findings.
7. **The jobs store keeps a learner's question text** (the job's command), as it keeps the staff's commands. How
   long jobs are kept is not decided.
8. Still open from Chat 32: findings 2 (one session cookie name for both APIs), 3 (`learner-2` in no identity map),
   4 (which bound resources a learner sees), 5 (no typed client of the Learner API); and earlier ones as listed
   there.

## Open decisions

None answered in this chat. Still open: D21, D28, D29, D31–D33, the stale rule for evaluation drafts (S13).

## Roadmap rows to change (for the owner)

- **S12** row: "done: part 1 (PR #142, merged as `66680de`, chat-32.md) and part 2 (PR of chat-33.md): the Learner API process, my
  courses, course view, own progress, attempt submission, the learner request as a job, finding 3, isolation".
- **S12 acceptance:** tick every item.

## Next step

**Chat 34: S12b** (#141): specify it with the owner (confirm the acceptance proposed on #141), then build its first
part. Then S13 and S13b.

### Prompt for Chat 34

```text
You are Chat 34 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S12b** (#141): Teams-style enrolment with a course code (D37, D9
revised). Specify it with the owner first, then build the first part.

## Where things stand

- S12 is done in two PRs: part 1 (#142, merged; docs/plans/handoffs/chat-32.md) and part 2 (the PR of
  docs/plans/handoffs/chat-33.md). Read chat-32.md and chat-33.md, and the owner decisions on #141.
- "My courses" come from one function, learning.learner.enrolled_courses (D19 for now); S12b changes how learners
  arrive, not how the list is read. A learner's attempts and questions are recorded under learner:{subject}:{id}.
- The S12b scope on #141 is proposed; its acceptance is confirmed with the owner when the step is specified.

## Protocol

1. Verify the baseline on main (or on the S12 part 2 branch if it is not merged; say which): git status, git log
   --oneline -5, gh pr list --state open, the Python suite with `python -m unittest discover -q` and telemetry off
   (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true CREWAI_TRACING_ENABLED=false), python -m aimpro.generate
   --check, python -m services.api_common.openapi --check, python -m evaluation --check, and in apps/ npm run
   check:client, typecheck, test. Report any difference from the Chat 33 handoff.
2. Read AGENTS.md, the roadmap (working protocol, D9, D25, D36, D37, S12b, S13), issue #141, learning/learner.py,
   learning/membership.py, services/api_common (identity, contexts), services/learner_api, the studio members page,
   and the D25/D36 tests.
3. Ask the owner, in Italian, the questions the acceptance needs before writing it on #141: at least how the code is
   opened, reset and disabled through a reviewed policy (D10: the API writes only new policy files), how the course
   version used by proposals and approvals leaves out participants and learners' own records while the ALM
   metamodel stays unchanged, and how automatic subject keys are made and kept stable. Record the answers on #141
   and in the roadmap.
4. Contract tests first, then implement the agreed first part; run the full offline suite, the generated-contract
   and OpenAPI checks and the studio checks. Write docs/plans/handoffs/chat-34.md; open one focused PR; wait for CI
   and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed and synthetic model responses only. Never edit an AIM-PRO/jjodel export
  or the ALM metamodel.
- No learner app (S13). Do not start #125 or #134.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only.
- Do not decide D21, D28, D29, D31–D33 or the stale rule for evaluation drafts.
```

## PR and CI

Reported in the PR conversation.
