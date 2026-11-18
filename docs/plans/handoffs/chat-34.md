# Chat 34 handoff — S12b part 1: learner grant, course code, course version, automatic keys

Date: 18 November 2026. Base: `main` at `4208c9b`.
Step: **S12b, part 1** of the [prototype roadmap](../prototype-roadmap.md).
Issue: [#141](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/141).
Branch `feat/s12b-enrolment`, from `4208c9b`; its PR targets `main`.

No model was called; no live run. Synthetic seed and synthetic model responses only.

## Baseline verified before any change

The S12 part 2 PR (#143) was merged before this chat, so the baseline is `main`.

| Check | Result |
| --- | --- |
| `git status` | someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `4208c9b` merge of #145, `b40bd76` merge of #144, `bbc3cdc`, `4086e18`, `f0e7510` (merge of #143) |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1316 tests, OK, 302 skipped (433 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 183 tests OK |

Difference from the Chat 33 handoff: `main` also holds #144 (the S12 roadmap rows) and #145 (the studio sign-out
test finds its request by route). The local checkout was on `fix/studio-signout-test-race`; work started from
`main` after a fast-forward.

## Specification with the owner

The owner answered seven questions (all the recommended options); recorded on #141
([comment](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/141#issuecomment-6977465375)) and in the
roadmap's S12b section (specification and acceptance):

1. Opening a delivery to learners is a reviewed policy change, made once; the code is created, reset and disabled
   at once, outside the policy.
2. The code is derived from a host secret and a nonce; the store keeps the nonce and the code's digest.
3. Course version: changes of `participants`, `activityOccurrences` and `learningStates` do not make a proposal
   stale; an evaluation draft leaves out only `participants` (finding 3 unchanged until S13).
4. Automatic subject keys `auto-` + 20 hex digits of SHA-256 over (issuer, `sub`), no write, valid in both APIs.
5. The code alone finds the course.
6. Students added by the teacher join at once, without a proposal (part 2).
7. Part 1 is the core and the APIs; part 2 the studio, students added by the teacher, the seed and the browser test.

## What was found while building

1. **The Learner API may not import `learning.membership` or `learning.releases`.** Joining lives in a new
   `learning/enrolment.py` that imports neither; opening and the code's administration are in
   `learning/membership.py`, on the authoring side.
2. **Comparing the context records alone is not enough.** A proposal that adds a record without changing the
   context's fields (a `Topic`, say) leaves the record unchanged, so a second proposal would no longer go stale and
   could overwrite the first (`test_stale_proposal_does_not_apply`, `test_case10` caught it). The rule is therefore:
   every change since the base must be a learner's event (a `StateChange` caused by a `Participant`, a join, or by
   `LearningEvidence`, an attempt), and the records must agree outside the learners' fields. `baseContextVersion`
   keeps the technical version, so every other use of it (syllabus refinement, bindings, authoring receipts) is
   unchanged. The #141 comment was corrected to say so.
3. **Proposals carry a whole copy of the context record.** Applied as it is, a staff membership would drop the
   learners who joined, and any proposal the attempts recorded since. At application the record is rebased: the
   learners' fields keep what was recorded since the base, merged with what the proposal adds, under a new version.
4. **A candidate names its context at a version.** An evaluation draft's `context` reference is the record at the
   draft; after a join that version is not in the snapshot. A candidate may now name an earlier record of its own
   context (`_validate_candidates`).
5. **A staff membership could name a subject who joined meanwhile.** It is refused at application ("already a
   member").
6. **Adding a field to `TrustedPolicy` would change every recorded policy text** (activation compares canonical
   policy texts). `learners` is left out of the serialization when empty.

## What was built

**Core.**

- `learning/policies.py`: `LearnerGrant` (actions `read`, `interact`, `submit` only; scopes), `TrustedPolicy.learners`
  by context id, `with_learner`.
- `learning/enrolment.py` (new): `course_code`, `code_digest` (HMACs of the host secret), `normalized`, `new_code`,
  `learner_policy`, `join_course`, `EnrolmentRefused`.
- `learning/membership.py`: `EnrolmentCommand`, `EnrolmentProposal`, `EnrolmentView`, `propose_enrolment`
  (`PROPOSE_ENROLMENT`), `validate_enrolment_application`, `enrolment_view`, `reset_enrolment_code`,
  `disable_enrolment_code`; the membership check of members who joined meanwhile.
- `learning/releases.py`: the new command among the reserved ones; activation accepts the enrolment policy version.
- `learning/decisions.py`: `course_version`, `left_out`, the learners' causes, the rebase of the context record.
- `learning/service.py`: `policy_for` used wherever the subject matters; the four enrolment methods.
- `learning/learner.py`: `enrolled_courses` reads the learner grant.
- `learning/store.py`: schema version 3, table `enrolment_codes` (context id, nonce, digest, who, when), migration
  from version 2 on both backends, copy and digests; `enrolment_code`, `enrolment_context`, `set_enrolment_code`,
  `remove_enrolment_code`.

**APIs.** `services/api_common`: automatic keys (`identity.auto_subject_key`, the `auto-` prefix refused in the map,
`Authenticator.subject_key`), `ALM_ENROLMENT_SECRET` (at least 32 characters), `ContextServices.join`. Authoring API
0.17.0, module `enrolment`: `GET`/`POST /contexts/{id}/enrolment`, `POST`/`DELETE /contexts/{id}/enrolment/code`.
Learner API 0.3.0, module `enrolments`: `POST /enrolments`. Snapshots and the studio's generated client regenerated.

**Stacks.** `apps/e2e/stack/api.mjs` sets a fixed test-only secret; `examples/se-ai/stack.sh` draws one per state
into `$STATE/enrolment-secret`.

## Changes

| File | Content |
| --- | --- |
| `learning/policies.py`, `learning/enrolment.py` (new), `learning/membership.py`, `learning/releases.py`, `learning/decisions.py`, `learning/service.py`, `learning/learner.py`, `learning/store.py` | the core above |
| `services/api_common/identity.py`, `auth.py`, `settings.py`, `contexts.py` | automatic keys, the secret, joining |
| `services/authoring_api/enrolment.py` (new), `app.py` | module `enrolment`, version 0.17.0 |
| `services/learner_api/enrolments.py` (new), `app.py` | module `enrolments`, version 0.3.0 |
| `services/openapi/authoring.json`, `learner.json`, `apps/packages/api-client/src/generated/authoring.ts` | generated |
| `apps/e2e/stack/api.mjs`, `examples/se-ai/stack.sh` | the host secret |
| `tests/test_enrolment.py` (new) | the grant, opening, the code, joining, a delivery opened before activation, the course version (22 tests, 19 with a PostgreSQL variant) |
| `tests/services/test_enrolment_api.py` (new) | both APIs: opening, the code, who, CSRF, the secret required, joining by people outside the map, one answer for refused codes, two learners isolated |
| `tests/services/test_api_identity.py`, `test_api_common.py` | automatic keys, the map prefix, the secret setting |
| `tests/test_learning_store.py`, `tests/test_store_backends.py` | schema version 3, the v2 migration, the code table |
| `tests/services/test_learner_boundaries.py` | the probe also joins with the code; `learning/enrolment.py` and `learner.py` import no authoring module |
| `tests/services/course_fixtures.py` and the API tests that build all modules | the test secret |
| `tests/services/test_learner_writes.py`, `test_learner_api.py`, `test_api_contexts.py`, `test_api_openapi.py` | the new module and paths |
| `docs/architecture/role-applications.md` | identity map, configuration, Learner API, the new section "Teams-style enrolment (S12b)" |
| `docs/plans/prototype-roadmap.md` | S12b specification and acceptance, as the Chat 34 prompt asked |

Order of work: the contract tests were written first and failed (missing modules, the missing table, schema
version 2); then the implementation. The first full run found finding 2 above.

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1380 tests, OK, 332 skipped (437 s; was 1316 / 302: 64 new tests, 30 of them PostgreSQL variants skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 183 tests OK |
| `git diff --check` | exit 0 |

The PostgreSQL variants and the browser tests run in CI (reported in the PR).

## S12b acceptance (#141): part 1

- [x] Learner grant; opening reviewed; the code; joining with the code; course version; automatic keys; the two
  APIs; isolation; the checks (see Verification).
- Part 2 is open: the studio members page, students added by the teacher, the seed and the browser test.

## Findings (not changed)

1. **Owner's stacks and schema version 3.** Code from this branch migrates an ALM store from version 2 to 3 when it
   opens it (it adds one table and keeps every row); older code then refuses that store. The stacks on 58000/58001
   (`/tmp/alm-demo`, `/tmp/alm-se-ai`) were not touched; restarting them with this code migrates their stores.
   `examples/se-ai/stack.sh` now also needs `openssl` to draw the secret.
2. **The studio's "unmapped" page is no longer reached.** A person outside the map now signs in with an automatic
   key and sees an empty home. To revisit with part 2.
3. **The studio does not list a joined learner's course.** `ContextServices.readable` lists the contexts a subject is
   named in by the policy; learners use the learner app (S13).
4. **No limit on join attempts.** A code has 40 bits; a rate limit is "later" on #141.
5. **The CLI has no command for opening or the code** (`python -m learning`). Not needed by part 1.
6. **Adding someone to the identity map after they joined** gives them the mapped key and none of their automatic
   key's records.
7. Still open from Chat 33: findings 1–8 (abandoning a learner's question, staff job ids with the learner prefix, no
   progress stream, no synthetic orchestrator in the synthetic worker, no Socratic specialization in the seed, a
   clarification without findings, how long jobs are kept, and Chat 32's open findings).

## Open decisions

None answered beyond the S12b specification. Still open: D21, D28, D29, D31–D33, the stale rule for evaluation
drafts (S13).

## Next step

**Chat 35: S12b part 2** (#141), on a new branch from `main` once this PR is merged.

### Prompt for Chat 35

```text
You are Chat 35 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S12b part 2** (#141): the studio members page with the course code,
students added by the teacher, the seed and a browser test.

## Where things stand

- S12b part 1 is in the PR of docs/plans/handoffs/chat-34.md: the learner grant, opening as a reviewed policy
  change, the code (derived from ALM_ENROLMENT_SECRET; the store keeps nonce and digest), joining with the code
  alone (Learner API POST /enrolments), the course version, automatic subject keys. Read chat-34.md, the
  specification and acceptance on #141 and the roadmap's S12b section.
- Part 2 acceptance: the studio members page proposes opening, shows the code and the join link, resets and
  disables it; an administrator adds students at once, under the learner grant, with no new policy version (this
  replaces D25/D36 membership for LEARNER: the studio stops offering LEARNER in the membership proposal); the seed
  (D15) opens its delivery; a browser test joins with the code.

## Protocol

1. Verify the baseline on main (or on the part 1 branch if it is not merged; say which): git status, git log
   --oneline -5, gh pr list --state open, the Python suite with `python -m unittest discover -q` and telemetry off
   (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true CREWAI_TRACING_ENABLED=false), python -m aimpro.generate
   --check, python -m services.api_common.openapi --check, python -m evaluation --check, and in apps/ npm run
   check:client, typecheck, test. Report any difference from the Chat 34 handoff.
2. Read AGENTS.md, the roadmap (S12b, S13), #141, learning/enrolment.py, learning/membership.py,
   services/authoring_api/enrolment.py and members.py, the studio members page and its tests, tests/seed.py and the
   browser tests.
3. Ask the owner, in Italian, what part 2 needs before building: at least how students are chosen when added (keys
   of the identity map, automatic keys already seen, or typed keys), what the join link looks like before the
   learner app exists (S13), and whether the studio's "unmapped" page goes (Chat 34 finding 2).
4. Contract tests first, then implement; run the full offline suite, the generated-contract and OpenAPI checks and
   the studio checks. Write docs/plans/handoffs/chat-35.md; open one focused PR; wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed and synthetic model responses only. Never edit an AIM-PRO/jjodel export
  or the ALM metamodel.
- No learner app (S13). Do not start #125 or #134.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only (this branch's code migrates a store it opens to schema version 3: do not open theirs with it).
- Do not decide D21, D28, D29, D31–D33 or the stale rule for evaluation drafts.
```

## PR and CI

Reported in the PR conversation.
