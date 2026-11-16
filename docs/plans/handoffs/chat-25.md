# Chat 25 handoff — S10 part 1: a release and its delivery course from the studio

Date: 16 November 2026. Base: `main` at `4867477` (PR #122 merged that morning).
Step: **S10** of the [prototype roadmap](../prototype-roadmap.md), first of two PRs (owner decision 4 of issue #123).
Issue: [#123](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/123).
Branch `feat/s10-release-views`, PR: see the end of this file.

No ALM metamodel, ALM store schema, jobs store schema, core module (`learning/`), realm file, identity map,
configured model or AIM-PRO/jjodel export changed. No model was called. The owner's demo stack (58000/58001) was
running; it was not touched, so the browser tests were not run locally (they run in CI).

## Objective

A release is proposed from the studio on the course's project, read in its teacher view and inspected (receipts,
frozen closure, findings); a delivery course is created from the studio.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this PR |
| `git log --oneline -3` | `4867477` merge of #122, `f8d71a4`, `2ee4084`: as the Chat 24 handoff, plus its merge |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1106 tests, OK, 202 skipped (as Chat 24) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 154 tests OK (as Chat 24) |

**What was found** (protocol step 3, read before any change):

- The delivery import loads the authoring context with the **delivery** context's policy
  (`learning/releases.py` `_other_context`). `load_context` requires that policy to authorize `read` on the
  authoring context and to be the authoring context's own `policies` reference (`learning/context.py:81-87`).
- The seed works because one policy (`architecture-policy`) covers all three contexts
  (`tests/authoring_cycle_fixtures.py` `trusted_policy`).
- `POST /courses` (D23) writes a new `course:<id>` policy for that course only. A delivery course created from the
  studio could therefore not receive an import, from the seed's course or from a course created in the studio:
  owner decision 1 of #123 could not be met with the import as it is.
- Subjects: the import's delivery scope grants the delivery course's participants, so only its creator; learners
  are D25 (open), which does not block S10 because activation stays refused (D4). Source scopes: a delivery course
  receives the template's source scopes like any course; nothing in the import needs or refuses them.

## Decisions

**Owner, 16 November 2026 (asked in this chat, recorded on
[#123](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/123#issuecomment-6909365112)):
each context keeps its own trusted policy.** The import will read the authoring context with the authoring
context's installed policy (resolved as D10 resolves it for API requests), and the subject must be authorized by
both. This is a core change to `_other_context` and to the recheck at application, with contract tests first; it
belongs to **part 2**. `POST /courses` and part 1's acceptance are unchanged.

Defaults taken without a question, stated in the guide:

- `POST /contexts/{context_id}/releases` takes `ReleaseCommand` plus `request_id` and returns `ReleaseProposal`, as the
  CLI `propose-release`; API version 0.13.0.
- The studio finds the release domain as the context's `DomainModel` `<project id>:model` (the project's model,
  `learning/projects.py` `_persist`).
- The release form says first which required parts are missing, then whether content is out of date, then whether the
  course has no model of the project; the API's refusal is shown otherwise.
- The delivery course is created from the page of an applied release with no finding, and opens on its course page.
- The release page reads titles and part kinds from the course's records (the latest revision of each id); the
  versions it lists are the release's own.

## Changes

| File | Content |
| --- | --- |
| `services/authoring_api/releases.py`, `app.py` | `POST /contexts/{context_id}/releases`; version 0.13.0 |
| `services/openapi/authoring.json`, `apps/packages/api-client/src/generated/authoring.ts` | regenerated |
| `tests/services/test_authoring_release_api.py` (new), `test_api_openapi.py` | contract tests (below) |
| `apps/studio/src/features/course-build/GeneratorsStep.tsx`, `buildApi.ts` | step "9. Release" (the project model among the refs it sends); `proposeRelease`, `inspectRelease` |
| `apps/studio/src/features/course-build/CreateCourse.tsx` (new), `home/HomePage.tsx` | the course creation form, shared by the home page and the release page |
| `apps/studio/src/features/release/release.ts`, `ReleasePage.tsx` (new) | the release report (approvals, frozen records by type, findings) and its page with the delivery course form |
| `apps/studio/src/features/review/routes.tsx`, `paths.ts`, `ProposalPage.tsx`, `teacher.ts` | the release route; "Inspect this release" on an applied release proposal (the release's ref in its teacher view) |
| `apps/studio/src/features/course/CoursePage.tsx`, `course.ts` | section "Releases": the releases of the release catalogue, first to last (labels and data only) |
| `apps/studio/src/i18n/en.json` | the labels above |
| `apps/studio/test/release.test.tsx` (new), `build.test.tsx`, `course-model.test.ts`, `course.test.tsx`, `teacher-view.test.ts` | studio unit tests |
| `apps/e2e/release.spec.ts` (new), `support.ts` | the browser test; `SeedManifest.release` |
| `docs/architecture/role-applications.md` | "Release and delivery course from the studio (S10, part 1)", the browser test row |

## Verification

**Contract tests first.** `test_authoring_release_api.py` failed (404) until the route; the route list of
`test_api_openapi.py` and the snapshot test until the snapshot was regenerated. One assertion of the new test was
wrong (the receipt names the proposal's latest revision, not the proposed one) and was corrected to the proposal id.
The studio unit tests were written after the components; `course.test.tsx` failed on the new section until updated.

| Check | Result |
| --- | --- |
| `unittest discover -q`, telemetry off, final tree | 1110 tests, OK, 204 skipped (1106 / 202 before: two route tests on both store backends; their PostgreSQL variants are the new skips) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check` | exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 162 tests OK (154 before) |
| `npx playwright test -c e2e/playwright.config.ts --list` | 18 tests in 10 files; compiles (typecheck includes `e2e/`) |
| `git diff --check` | exit 0 |

The API test runs on the seed: a second release of the seeded project has the same manifest as the seeded release,
is decided and applied through the API, and its inspection has no finding and equals the CLI `show-release`.

**Not verified locally.** The browser tests: the owner's demo stack held their ports; the CI job `browser` runs them.

## Findings (not changed in this PR)

1. **A delivery course created in part 1 shows the authoring build link** ("Build the course from an AIM-PRO
   model") on its course page, as any new course; part 2 should offer the import there instead.
2. **Nothing records which release a delivery course was created for** until its import is proposed; part 2 needs
   the authoring course and the release (for example from the release page, or chosen in the delivery course).
3. **Releases are listed by number**, first to last: a release `Resource` has no date of its own (its proposal's
   history has one).
4. **The release page's titles come from the latest revision of each id**; the versions are exact, but a title may
   be that of a later revision of the same record.
5. **Still open**: the Chat 24 findings (the delivery import's activities not grouped by unit; no "what changed then"
   for a decided proposal) and the Chat 23 findings (a network error stops a job at once with the generic text; every
   generator call reads the whole input; the free model cannot write more than one or two units per response; D33),
   and D28.

## Open decisions

Proposed for the owner to record in the roadmap: the decision of 16 November 2026 above, as a D-row refining D23
(each context keeps its own policy; the delivery import is authorized by both).

Still open from the roadmap: D19, D21, D25, D28, D29, D31–D33, G7 / D4.

## Next step

**S10 part 2** (issue #123): the import with proposed and changeable bindings, the policy preview, the activation
refused in words, and the core change decided above. Start it in a new chat once this PR is merged; the prompt below.

### Prompt for Chat 26

```text
You are Chat 26 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S10 part 2** (issue #123): in a delivery course created from the studio,
the import of an applied release is proposed with a resource proposed for each requirement, which the teacher can
change, and the exact selection is sent; the import is read in its teacher view and approved; the policy preview is
shown in full; activation is proposed and refused in words (RELEASE_RUNTIME_ROLE, D4).

## Where things stand

- S10 part 1 (PR of Chat 25) is merged: POST /contexts/{id}/releases, the release page (approvals, frozen records,
  findings) and the delivery course created from it. Read docs/plans/handoffs/chat-25.md.
- Owner decisions of issue #123 and its comment of 16 November 2026 are final; do not reopen them: each context
  keeps its own trusted policy, the import reads the authoring context with the authoring context's installed
  policy (D10), and the subject must be authorized by both.

## Protocol

1. Verify the baseline: git status, git log --oneline -3, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   and in apps/ npm run check:client, typecheck, test. Report any difference from the Chat 25 handoff.
2. Read AGENTS.md, the roadmap (working protocol, S10, D10, D23, D25), docs/architecture/role-applications.md
   (S10 part 1, policy resolution), learning/releases.py (_other_context, _build_import, _pins,
   validate_release_application, activation_findings), learning/context.py load_context, services/api_common/
   contexts.py, and the CLI commands propose-delivery-import and propose-activation.
3. Contract tests first for the core change (an import between two contexts with different installed policies is
   accepted when both authorize the subject, refused when either does not; the application recheck does the same;
   the seed's shared policy keeps working), then the API routes (import, activation) and their tests, then the
   studio (unit tests and a browser test for what it shows; axe).
4. The bindings: for each requirement the studio proposes the resource the release pins (`_pins`) or the cited
   source; the teacher can change any from a list; the exact selection is sent. Write the acceptance details with
   the owner if anything is not covered by #123.
5. Write docs/plans/handoffs/chat-26.md, open one focused PR, wait for CI and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No live model run; synthetic seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- Layout and visual design are owned by someone else: change labels and data, not styling.
- Installing a policy preview stays a host operator action, never a browser action; the preview never replaces an
  installed policy.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's demo stack (ports 58000/58001, /tmp/alm-demo): never stop or restart it; read its stores read-only.
  When it runs, the browser tests run in CI.
- Do not decide D19, D21, D25, D28, D29, D31–D33 or G7/D4. Propose roadmap changes in the handoff.
```

## PR and CI

PR [#124](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/pull/124). CI on `e618254`, push run
[43820329913](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43820329913) and pull_request
run [43820338268](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/actions/runs/43820338268): all 7 jobs
of each passed on the first run, `browser` included (`release.spec.ts`: the release proposed, applied and inspected,
the delivery course created; axe).
