# Chat 28 handoff — D25 decided; S11 part 1: course membership

Date: 16 November 2026. Base: `main` at `96b7a0a` (PR #130 merged).
Step: **S11** of the [prototype roadmap](../prototype-roadmap.md), part 1 of at least 2.
Issue: [#129](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/129).
Branch `feat/s11-membership-assessor`, draft PR [#131](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/131).

This chat wrote the D25 options for the owner, recorded the owner's decisions and the confirmed S11 acceptance on
#129, and implemented the membership part of S11 (D25). The runtime assessor part (lifting D4) is not started. The
owner asked for **one PR for the whole of S11**, over more than one chat: the PR stays a draft until Chat 29 finishes
the assessor part on the same branch.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -3` | `96b7a0a` merge of #130, `09352eb`, `b417739` |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1134 tests, OK, 216 skipped |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 170 tests OK |

No difference from the Chat 27 handoff.

## D25: options written for the owner

What was found: membership has two layers. The trusted policy file grants a subject roles, actions per context and
scopes; the context's `Participant` records carry roles too, and authority is the intersection of both
(`load_context`, `_reviewer_allowed`). A studio course names only its creator (D23). An import copies the policy's
subjects and gives its delivery scope to the participants of that moment; after an import `policies` is reserved
(`DELIVERY_FIELDS`) and activation needs the exact reviewed preview (`RELEASE_POLICY_NOT_INSTALLED`).

| Option | Membership | S11 (who decides) | S12 / D19 |
| --- | --- | --- | --- |
| **A. New policy version written by the API** (chosen) | The administrator adds a member; the API writes a new policy file and proposes the `Participant` and the new `policies` reference | The creator adds an `ASSESSOR` | A learner's courses: the contexts whose installed policy names them (D35 list) |
| B. Membership preview installed by an operator | As the import today, one host action per change | The assessor exists after the operator installs the file | As A |
| C. Enrolment as an approved `Participant` within a role ceiling in the policy | No new policy file; changes `authorize`, `load_context`, `scope_allows` | As A | Read from enrolment records (the D19 "enrolment record" option) |

Keycloak groups or roles were not offered: they contradict D9.

## Decisions

**Owner, 16 November 2026 (asked in this chat), recorded on #129 (comment and issue body, decisions 5–8):**

1. **D25 = A.** Any subject of the identity map may be added, with `CONTENT_RESPONSIBLE`, `ASSESSOR`, `LEARNER` or
   `OBSERVER`; `ADMINISTRATOR` cannot be granted.
2. **Membership and the runtime assessor are both in S11**, over more than one chat, in one PR.
3. **The requester of an assisted evaluation may also decide it** (no second person required).
4. **A draft that fails `validate_evaluation` is retried, at most three drafts** (as D30/D34).
5. Confirmed with the acceptance: the assessor chooses FORMATIVE or FORMAL when starting a draft; starting needs the
   `ASSESSOR` role (deciding keeps `ASSESSOR` or `ADMINISTRATOR`); the seed records a synthetic attempt through
   `submit`; removing a member is out of scope.

D19 is not decided: option A only means that a learner's courses can be read from the installed policies.

## Changes (S11 part 1: membership)

| File | Content |
| --- | --- |
| `learning/membership.py` (new) | `propose_membership` (an administrator; a new policy version installed through the host's `install` before the proposal; `Participant`, new `PolicySet` version, context with only `participants` and `policies` changed), `course_members`, `validate_membership_application` (the exact policy must be installed at application) |
| `learning/releases.py` | `PROPOSE_MEMBERSHIP` is a recorded command; a generic proposal cannot record a membership policy; activation accepts a membership version (`MEMBERSHIP_POLICY` + the installed policy) besides the import preview |
| `learning/service.py` | `propose_membership`, `members` |
| `services/authoring_api/members.py` (new), `app.py` | `GET`/`POST /contexts/{context_id}/members`; the subject must be in the identity map; API version 0.15.0 |
| `services/openapi/authoring.json`, `apps/packages/api-client` | regenerated |
| `apps/studio/src/features/members/` (new), `review/teacher.ts`, `review/TeacherView.tsx`, `review/routes.tsx`, `review/paths.ts`, `course/CoursePage.tsx`, `course-build/buildApi.ts`, `i18n/en.json` | the members page (labels and data only, existing classes), a link from the course page for administrators, a `membership` proposal kind in the review page |
| `tests/test_membership.py` (new), `tests/services/test_authoring_members_api.py` (new), `apps/studio/test/members.test.tsx` (new), `apps/studio/test/teacher-view.test.ts` | contract tests, written before the implementation |
| `.github/workflows/aimpro-contracts.yml` | the two new Python test modules in the SQLite, PostgreSQL and API jobs |
| `docs/architecture/role-applications.md` | "Course members: module `members`", and the policy files the API writes |

## Verification

Final run on the branch, telemetry off:

| Check | Result |
| --- | --- |
| `python -m unittest discover -q` | 1166 tests, OK, 232 skipped (was 1134 / 216: 32 new tests, 16 of them PostgreSQL variants skipped locally) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test`, `build` (in `apps/`) | OK, OK, 174 tests OK (was 170), OK |
| `git diff --check` | exit 0 |

The first full run found 2 failures and 2 errors, both fixed before the commit: the registry and OpenAPI path tests
did not list the new `members` module, and a first version of the reserved rule (every generic `PolicySet` or
`policies` change) refused the legacy AIM-PRO execution setup (`tests/test_aimpro_execution_setup.py`), which moves
`policies` through a generic proposal. The rule now reserves only a `PolicySet` that records a new membership entry.
No browser test was run locally (the owner's demo stack was not touched).

## Findings (not changed)

1. **The course list shows a subject's roles from the policy, not from the course.** `GET /contexts` returns
   `policy.subjects[subject].roles`; in a policy shared by several contexts, a subject added with another role
   elsewhere shows both. Course policies are per course, so the studio is not affected; S12 should read the roles of
   the `Participant`.
2. **No browser test for membership yet.** The Playwright test should come with the assessor part (the assessor is
   added from the studio, then decides an evaluation), on the seed.
3. **The membership page has no list of pending membership proposals**; they are in the review inbox.
4. **A rejected membership leaves its policy file** (unused, never referenced). Cleaning such files stays an operator
   action.
5. Still open from Chat 27: FORMAL needs authored verification rules; the D4 texts in the studio and docs.

## Open decisions

Proposed for the owner to record in the roadmap:

- a D-row for **D25**: option A, as decision 1 above (16 November 2026, #129); remove D25 from the open decisions;
- a D-row for G7 / D4 (as proposed in the Chat 27 handoff), with decisions 3–5 above;
- S11 "Depends on": S10, D25 (decided); its acceptance points to #129.

Still open: D19, D21, D28, D29, D31–D33.

## Next step

**S11 part 2 (Chat 29): the runtime assessor**, on branch `feat/s11-membership-assessor` and the same draft PR,
against the "Runtime assessor" acceptance of #129: contract tests first; the EVALUATOR runtime worker in the import;
`propose-evaluation` (service, CLI, API job) with up to three drafts; the seed's synthetic attempt; the studio
assessor views and the browser test (membership included); docs without the D4 refusal.

### Prompt for Chat 29

```text
You are Chat 29 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S11 part 2 — the runtime assessor (lifting D4)**, continuing branch
feat/s11-membership-assessor and its draft PR (one PR for the whole of S11, owner decision).

## Where things stand

- Chat 28 recorded D25 = A and the confirmed S11 acceptance on issue #129 (decisions 1–8), and implemented the
  membership part (learning/membership.py, the members API module, the studio members page). Read
  docs/plans/handoffs/chat-27.md, docs/plans/handoffs/chat-28.md and issue #129.
- Issue #125 (release views) is deferred by the owner; do not start it unless the owner says so.

## Protocol

1. Check out the branch; verify: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ npm run check:client, typecheck, test. Report any difference from the
   Chat 28 handoff.
2. Read AGENTS.md, the roadmap (working protocol, S11, S12), learning/releases.py (RUNTIME_WORKERS, _workers,
   activation_findings), learning/assessment.py (validate_evaluation, derive_learning_state), learning/decisions.py,
   agents/learner-response-evaluator.md, the D30/D34 retry code of the generators, tests/test_releases.py and
   tests/test_authoring_cycle.py (SIMULATED_ASSESSOR, assessor_proposal), tests/seed.py, apps/e2e.
3. Implement the "Runtime assessor" acceptance of #129, contract tests first, then the browser test that adds an
   assessor from the studio, activates the seeded delivery and decides an assisted evaluation.
4. Update docs/architecture/releases.md and authoring-lifecycle.md (no D4 refusal), write
   docs/plans/handoffs/chat-29.md, mark the PR ready, wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No live model run; synthetic model responses and seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- Layout and visual design are owned by someone else: change labels and data, not styling.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's demo stack (ports 58000/58001, /tmp/alm-demo): never stop or restart it; read its stores read-only.
- Do not decide D19, D21, D28, D29, D31–D33. Propose roadmap changes in the handoff.
```

## PR and CI

Draft PR [#131](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/131), commit `fe0ec15` (part 1). The CI result is reported in the PR conversation.
