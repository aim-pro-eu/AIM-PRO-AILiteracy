# Chat 01 — Documentation baseline integration

Verified on 5 November 2026. Objective: review PR #47, verify its integrated
documentation/evaluation evidence, refresh the local baseline and identify the
actual issue states without live model calls or changes to existing learner state.

## Integrated result

- [PR #47](https://github.com/thesis-fedfalco-2026/py-prototype/pull/47),
  "Refresh published project status and evaluation evidence", was already
  **MERGED**, at `2026-11-05T11:08:48Z` (12:08:48 Europe/Rome).
- Actual integrated commit: **`6406613ab43206a89dcf3cdee6300dedbb9a179b`**.
  Parents: base `7987ebafa930cee4df59895cc0d002aa39fa17ee` and PR head
  `ff2cc1e07b0374467078bedc1afa7ae9ed6fb191`.
- Remote `main`, local `main`, `origin/main` and the current branch HEAD all
  resolve to that merge commit. The PR head is an ancestor of `main`, and its
  tree equals the integrated tree. No additional merge or corrective commit
  was necessary.
- Reviewed all ten changed files: eight Markdown guides plus the unchanged
  retained report and its provenance. Historical rejected/pending trials and
  subsequent approval/application records remain distinct. No material review
  finding remains; GitHub has no submitted reviews or PR conversation/inline
  comments for #47.

## Verification

- Both `generated-contracts` and `authoring-architecture` succeeded for the
  exact PR head in [run 42010751399](https://github.com/thesis-fedfalco-2026/py-prototype/actions/runs/42010751399)
  (pull request) and [run 42010717308](https://github.com/thesis-fedfalco-2026/py-prototype/actions/runs/42010717308)
  (push). Both also succeeded after integration on the exact merge
  commit in [run 42016556235](https://github.com/thesis-fedfalco-2026/py-prototype/actions/runs/42016556235).
  Remote `main` reports `protected: false`; the branch-rules API returned 403
  because that feature is unavailable for this private repository's plan.
  No independent ruleset inspection is claimed.
- Exported the exact merge commit with `git archive` into an isolated temporary
  directory. Using the repository virtualenv, with telemetry disabled, ran
  `python -m unittest tests.test_evaluation tests.test_events -q`: **22 passed**.
  These tests use doubles and disposable synthetic state, including tests of
  live-mode wiring; they make no live model calls.
- From that same export, ran `python -m evaluation --check --log <temporary-log>`:
  **14 cases matched expectations**, with seven deterministic blocks, five
  expected leaks while semantic review is bypassed, and two answered controls;
  no errors, skipped cases or mismatches. This does not establish live coverage.
- Recomputed the historical report metrics with the integrated
  `agent_system.metrics.summarize`; they equal the retained report exactly.
  All 42 unique report run IDs equal the event-log IDs, and response kinds match.
  All 42 plans were authorized single-step plans, with no Lead synthesis.
- Confirmed 27 executed attacks blocked (15 deterministic, 12 semantic), six
  benign controls answered, no errors or retries, and nine **NOT_EXECUTED**
  synthesis trials: three each for `citation-synthesis-fabricated`,
  `injection-synthesis-applied` and `socratic-synthesis-solution`. Those nine
  are excluded from the block-rate denominator; their pass-through ANSWERs
  establish neither attack leakage nor blocking.
- Confirmed 111 logical calls, including 42 injected worker calls, versus 69
  actual provider calls (42 plans, 27 worker reviews), all on the recorded model.
  Latency: p50 31.601 s, p95 64.493 s, maximum 103.851 s.
- Verified all 21 local Markdown file targets in the PR, the integrated diff's
  whitespace and the existing working-tree diff with `git diff --check`.
- Verified the historical PR #31 merge as
  `a571682800f028c531f8d45484e01d791bf111e7`; #9/#14/#26/#27 are currently CLOSED,
  consistent with the refreshed publication statements.

## Evidence and issue states

The current [evaluation guide](../../evaluation.md),
[published report](../../evidence/evaluation-2026-11-05/live-full.json) and
[provenance](../../evidence/evaluation-2026-11-05/provenance.json) agree with the
current #25 body. The published report is byte-identical to retained
`.cache/evaluation/live-full.json`, SHA-256
`52ed7998c83535c940e41b47c841be65f905ceee4d3233e1d162529b2cf45a7c`.
Retained `.cache/evaluation/live-20261105T091803Z.jsonl` has SHA-256
`c1f61cd42bfaf77a2c381936e70abe8457d9493ed95d462811c205dbeb20a666`.
The event-log time bounds match the provenance. The historical run **did not
record a source commit**; the merge SHA above identifies publication/integration,
not that live run's implementation. Raw/private archives remain local.

- [#25 — Evaluation suite](https://github.com/thesis-fedfalco-2026/py-prototype/issues/25)
  is **OPEN** (body last updated `2026-11-05T10:27:14Z`). The suite is published;
  the remaining gap is live coverage of all three synthesis attacks on the
  current runtime, with controlled multi-step plans, benign controls and
  call/latency evidence. Historical live synthesis observations remain separate.
  Integrated CI still omits `tests.test_evaluation` and `tests.test_events`.
- [#10 — Material and activity generator](https://github.com/thesis-fedfalco-2026/py-prototype/issues/10)
  is **OPEN** (last updated `2026-11-04T11:11:35Z`). Dedicated generators and
  synthetic acceptance infrastructure are published, while real dedicated
  Teacher/Trainer generation, human review and application evidence remain
  pending. The approved/applied Evaluator package and its accepted limitations
  are separate prerequisites, documented in the
  [portable Evaluator evidence](../../aimpro/evidence/scn01-evaluator/README.md).
  Earlier comments describing implementation as unpublished are historical.
  Neither issue was closed or edited during this verification.

## Local preservation and next action

Fast-forwarded local `main` from `7987eba` with `git fetch origin main:main`.
Kept the current branch `feat/controlled-synthesis-evaluation`; no checkout,
stash, reset or cleanup was needed. Verified byte-for-byte preservation of all
seven pre-existing modified/untracked files and the tracked diff:
`.github/workflows/aimpro-contracts.yml`, `agent_system/events.py`,
`evaluation/__main__.py`, `evaluation/cases.py`, `evaluation/harness.py`,
`evaluation/provenance.py` and `docs/plans/sequential-chat-plan.md`.
This handoff is the only new repository file from Chat 01; it is not committed.
Temporary verification records are under
`/private/tmp/py-prototype-chat-01-iprvmugp/`; durable evidence remains at the
repository/archive paths above. No existing learner database was opened or changed.

**No unresolved blocker for Chat 01.** For Chat 02, read the
[sequential plan](../sequential-chat-plan.md), this handoff, the evaluation guide
and fresh #25 state. First inspect the existing uncommitted synthesis-evaluation
work against `6406613` and preserve it; it has not been reviewed or validated by
the committed-source checks above. Complete the evaluation-only controlled
multi-step mode, benign multi-step controls, exact source/configuration provenance,
honest execution/error outcomes and focused offline/CI coverage. Keep natural
planning and production authorization/dispatch boundaries intact. Review and
integrate that implementation before Chat 03; do not run live models in Chat 02
or reuse historical transmission authorization.
