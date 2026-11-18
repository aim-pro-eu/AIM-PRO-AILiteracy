# Chat 31 handoff — S11b: studio flow fixes and batch membership

Date: 17 November 2026. Base: `main` at `6e66690` (PR #137 merged).
Step: **S11b** of the [prototype roadmap](../prototype-roadmap.md).
Issue: [#138](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/138) (with #132 and #133).
Branch `feat/s11b-batch-membership`.

The owner started the step ("Chat 31 can start S11"); the roadmap still had the old S11b list, so this chat took that
as the go-ahead for the acceptance proposed in `chat-30.md` and recorded it in the roadmap and on #138. No model was
called; no live run.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `6e66690` merge of #137, `bda844f`, `1e8324c` merge of #135, `093f8cc`, `287cfff` merge of #131 |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1214 tests, OK, 255 skipped (369 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 180 tests OK |

No difference from the Chat 30 handoff.

## What was built

**Batch membership (D36, core).** `MembershipCommand` takes `members`, one or more `{subject, role}`; a subject named
twice is refused by the command itself. The command checks every member before anything is written (one already in
the course refuses the whole proposal, naming them), builds one new policy version with every grant, and proposes a
`Participant` per member, the new `PolicySet` version and the context with only `participants` and `policies`
changed. `MembershipProposal` returns `participants` (was `participant`). A command or a result recorded before S11b
(one `subject` and `role`; one `participant`) still validates as one member, so a membership pending in an existing
store is still applied. The core does not refuse a proposal while another is pending (D36): the second applied is
refused as stale by the existing rule, and nothing is lost.

**CLI.** There was no membership command; `propose-membership --base-context REF --member SUBJECT:ROLE ...
--request-id ID --policy-file NEW` proposes and writes the new policy to a new file (an existing file is refused before
anything is recorded). Applying it needs that file as `--other-policy`.

**API.** `POST /contexts/{context_id}/members` takes `members`; every subject must be in the identity map (the 422
names the others). `POST /courses` answers `created: true|false` (#132), keeping D23's replay. API version 0.16.0;
OpenAPI and the TypeScript client regenerated.

**Studio (labels and data, existing classes only).**

- Release page (#132): `CreateCourse` takes `existing`, the words for a course that is not new; the release page
  passes "You already have a course with this id. A delivery course needs a new id." It is shown as the field's error
  and nothing navigates. The home page still opens an existing course.
- Course page (#133): the activation section shows an activation proposal not applied yet and made on the course as
  it is now, with its link ("Activation is already proposed and awaits review in this course." or "... is approved and
  waits to be applied ..."), instead of "Propose activation". One made on an earlier version can no longer be
  applied, so the button comes back.
- Members page (#133, D36): a role to choose ("Not added" by default) for each person who may join, all sent in one
  proposal; "Membership proposals not applied yet" lists each with its members, its state (awaits review; approved,
  waits to be applied; made on an earlier version, propose again) and its link, under the warning that one is applied
  at a time. Proposals made on the page are listed at once.
- Review page: a membership proposal names every new member ("New members").
- "Not applied yet" is read from the course summary: the `ChangeProposal` records with status `AWAITING_DECISION` or
  `APPROVED` (`candidateDefinitions`, `baseContextVersion`), with the candidates of those awaiting a decision from the
  pending proposals (`openProposals` in `features/review/model.ts`).

## Changes

| File | Content |
| --- | --- |
| `learning/membership.py` | `NewMember`, `MembershipCommand.members`, `MembershipProposal.participants`, readers of the S11 forms, batch build |
| `learning/__main__.py` | `propose-membership` |
| `services/authoring_api/members.py`, `courses.py`, `app.py` | batch request, unmapped subjects named; `CourseView.created`; API version 0.16.0 |
| `services/openapi/authoring.json`, `apps/packages/api-client/src/generated/authoring.ts` | regenerated |
| `apps/studio/src/features/review/model.ts` | `openProposals` |
| `apps/studio/src/features/delivery/delivery.ts`, `ActivationSection.tsx` | `pendingActivation`, the pending activation instead of the button |
| `apps/studio/src/features/members/roles.ts`, `MembersPage.tsx` | `pendingMemberships`, the pending list and warning, one role per person |
| `apps/studio/src/features/review/teacher.ts`, `TeacherView.tsx` | `membership` is a list |
| `apps/studio/src/features/course-build/CreateCourse.tsx`, `buildApi.ts`, `release/ReleasePage.tsx` | `existing`; the batch client call |
| `apps/studio/src/i18n/en.json` | labels |
| `tests/test_membership.py` | batch, refusals, replay, D36 (no refusal, then stale), the S11 forms, CLI (7 new tests, each on SQLite and PostgreSQL) |
| `tests/test_runtime_assessor.py` | the batch form |
| `tests/services/test_authoring_members_api.py`, `test_authoring_courses_api.py` | batch over the API, refusals, a pending proposal does not refuse another; `created` (3 new tests, each on both backends) |
| `apps/studio/test/members.test.tsx`, `delivery.test.tsx`, `release.test.tsx`, `teacher-view.test.ts` | each studio state |
| `apps/e2e/assessment.spec.ts`, `delivery.spec.ts` | S11: a second member while one is pending, the stale one listed, the pending activation after a reload; new test: two members in one proposal; S10: an existing course refused as the delivery course |
| `docs/architecture/role-applications.md` | courses `created`, the members module (batch, D36, CLI), the studio, the browser tests |
| `docs/plans/prototype-roadmap.md` | D36 in force; the S11b row and acceptance |

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1234 tests, OK, 265 skipped (was 1214 / 255: 20 new tests, 10 of them PostgreSQL variants skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build` (in `apps/`) | OK, OK, 183 tests OK (was 180), OK |
| `git diff --check` | exit 0 |

The browser tests need the local Keycloak; they run in CI (reported in the PR).

## Findings (not changed)

1. `created: false` also answers a retry of a creation whose first answer was lost: on the release page the teacher is
   then told the id is taken, though they created it a moment before. The course exists and opens from the home page.
2. `GET /contexts/{id}/pending-proposals` lists proposals awaiting a decision only. An approved proposal not yet applied
   is found in the course summary, without its candidates: the members page cannot name the members of an approved
   membership proposal ("the members named in the proposal"), and an approved activation is recognised by its single
   `ExecutionContext` candidate.
3. "Made on an earlier version" is the studio's comparison of `baseContextVersion` with the course version; the core
   marks a proposal `STALE` only when someone tries to apply it, so the inbox still lists it as awaiting a decision.
   This is the stale rule of Chat 30 (finding 1), decided in S13 for evaluation drafts.
4. A request id recorded before S11b and retried after the upgrade is not replayed: its recorded command has the S11
   form, so the new payload differs and the API answers 409. Only an in-flight retry across the upgrade is affected.
5. Still open from earlier chats: the `show` gap (closed in S12), FORMAL needs authored verification rules (Chat 27,
   finding 1), the course list shows a subject's roles from the policy (Chat 28, finding 1), Chat 29 findings 4–7.

## Open decisions

None answered here. Still open: D21, D28, D29, D31–D33, D37, the stale rule for evaluation drafts (S13). The other
roadmap rows proposed in `chat-30.md` (D19 partial, D20 projection, D37, S12 and S13 notes) are still for the owner.

## Next step

**Chat 32: S12 part 1** (#136): the separate Learner API process, my courses (D19 for now), the course view (D20),
own progress and two-learner isolation. Then S12 part 2, S13, S13b.

### Prompt for Chat 32

```text
You are Chat 32 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S12 part 1** (#136): the separate Learner API process, the learner's own
courses (D19 for now), the course view (D20), own progress and isolation across two learners.

## Where things stand

- S11b is merged (PR of chat-31.md; issue #138): batch membership (D36), the pending proposals in the studio, the
  delivery course id check. Read docs/plans/handoffs/chat-30.md and docs/plans/handoffs/chat-31.md.
- S12 is specified on #136 with the owner's decisions (D19 for now, D20 projection, finding 3 in S13, the `show` gap
  closed in S12) and the confirmed acceptance; part 1 is the process, my courses, course view, own progress and
  isolation; part 2 (a later chat) is submission, the learner request as a job and the finding 3 test.

## Protocol

1. Verify the baseline on main: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ npm run check:client, typecheck, test. Report any difference from the
   Chat 31 handoff.
2. Read AGENTS.md, the roadmap (working protocol, D19, D20, D25, S12, S13), issue #136, services/api_common,
   services/authoring_api/app.py and context_summary.py, PolicyDirectory.readable, learning/service.py (show, the
   learner-only redaction, submit), learning/assessment.py, learning/membership.py, tests/seed.py and the
   architecture tests that keep modules apart.
3. Ask the owner whether the roadmap rows proposed in chat-30.md (D19 partial, D20 projection, D37) are to be
   recorded; do not decide D37. Write the contract tests first: the learner app imports no authoring module; my
   courses (policy ∩ participant, ACTIVE LEARNING only, a pending member not listed); the course view from the
   validated course only, with no answer key, proposal, decision or other participant; own progress; two learners of
   one delivery isolated on every Learner API endpoint and on the Authoring API context summary; reads leave the
   table digests unchanged. The seed gets a delivery with two synthetic learners.
4. Implement; run the S12 checks, the full offline suite, the generated-contract and OpenAPI checks (the new Learner
   API file included), the studio checks. Write docs/plans/handoffs/chat-32.md; open one focused PR; wait for CI and
   report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- No learner app (S13). Do not start S12 part 2 unless the owner asks, #125 or #134.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only.
- Do not decide D21, D28, D29, D31–D33, D37 or the stale rule for evaluation drafts.
```

## PR and CI

Reported in the PR conversation.
