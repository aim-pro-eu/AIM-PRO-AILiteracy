# Chat 30 handoff — D19 and D36 answered; S12 specified

Date: 17 November 2026. Base: `main` at `1e8324c` (PR #135 merged).
Step: the decisions S11b and S12 wait for, and the S12 specification (roadmap, "Planned order").
Issues: [#133](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/133) (D36 recorded),
[#136](https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy/issues/136) (S12, new).

This chat wrote the D19 and D36 options for the owner, recorded the answers, and agreed the S12 acceptance with the
owner on #136. No code changed. No model was called.

## Baseline verified before any change

| Check | Result |
| --- | --- |
| `git status` | `main`; someone else's changes as before (`README.md`, untracked `docs/architecture/system-overview.md`, `docs/plans/handoffs/chat-01.md`, `docs/plans/sequential-chat-plan.md`, `examples/lpo-ai/`), not part of this work |
| `git log --oneline -5` | `1e8324c` merge of #135, `093f8cc`, `287cfff` merge of #131, `512021b`, `32978ac` |
| `gh pr list --state open` | none |
| `unittest discover -q`, telemetry off | 1214 tests, OK, 255 skipped (376 s) |
| `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` | exit 0, exit 0, exit 0 |
| `npm run check:client`, `typecheck`, `test` (in `apps/`) | OK, OK, 180 tests OK |

No difference from the Chat 29 handoff (its final run on the S11 branch: 1214 / 255, 180 studio tests).

## What was found before writing the options

1. **Every pending proposal of a course goes stale on any change, not only memberships.** A proposal records the
   context version it starts from (`baseContextVersion`, `learning/decisions.py`, `create_proposal`), and `apply`
   marks it `STALE` and refuses it when the context's version changed (`learning/decisions.py`, line 243). Every
   apply and every learner's `submit` (`learning/assessment.py`, `record_attempt`) gives the context a new version.
   #133 (memberships) and Chat 29 finding 3 (evaluation drafts) are two cases of this one rule.
2. **The learner-only redaction of `show` does not filter by learner.** `LearningService.show` keeps, for a
   learner-only subject, the `ExecutionContext`, its own `Participant` and every `LearningState`,
   `ActivityOccurrence` and `LearningEvidence` of the context, other learners' included; only other `Participant`s are
   left out (`learning/service.py`, `show`). `GET /contexts/{id}` uses it. With two learners in one delivery (possible
   since D25), each reads the other's responses. Found by reading the code; not reproduced by a test in this chat.
   No learner app exists yet.
3. The D35 course list (`PolicyDirectory.readable`) reads the roles from the installed policy only (Chat 28
   finding 1); authority is the policy ∩ the participant record.

## D19: options written for the owner

| Option | A learner's courses | S12 | S13 | LEARNING redaction |
| --- | --- | --- | --- | --- |
| A. The installed policy (D25 membership) | The D35 list restricted to LEARNING contexts where the subject is `LEARNER` (policy ∩ participant) | No new store | Enrolling = one membership proposal per learner | All learners in one context: filter every record by learner |
| B. A separate enrolment record (outside ALM) | A host-side record of subject → courses; authority still from the policy (D9) | A new store and write path; two sources to keep consistent | Rosters and invitations possible | As A |
| C. One delivery context per learner | The learner's own delivery | Isolation by structure; no cross-learner stale proposals | N imports and activations; the teacher sees N contexts | Structural |

**Answer (owner, 17 November 2026):** no final answer yet. For now a learner sees the courses they are enrolled in;
how a learner enrols is a later decision. C is excluded. Today the only enrolment is a D25 membership as `LEARNER`, so
S12 lists those deliveries, behind one function that the later decision may change (proposed **D37** below).

## D36: options written for the owner

| Option | Core | S11b | Enrolling many learners |
| --- | --- | --- | --- |
| A. The core refuses a membership proposal while another is pending | New rule | Rule, message, studio | Strictly serial |
| B. The studio only shows and warns | Unchanged; the second applied goes stale, nothing lost | Labels and data | Serial in practice |
| A or B + batch membership | One proposal adds several members in one policy version | Core, CLI, API, studio | One propose–decide–apply cycle |

**Answer (owner, 17 November 2026): B + batch membership.** The core does not refuse; the members page lists the
pending membership proposals and warns that one is applied at a time; one membership proposal may add several
members. Batch membership goes in **S11b** (owner), which is therefore no longer labels and data only. Recorded on
#133.

## S12: decisions and acceptance

Owner answers (17 November 2026), recorded on #136:

- **D20 projection:** the learner sees, for an assessment, its activity, conditions, accepted evidence and the
  rubric's criteria and levels; and their own applied evaluations with each criterion's level and reason and the
  result. Never an answer key, never a pending draft.
- **Chat 29 finding 3** is decided in S13, after the learner app is tried; S12 records today's behaviour in a test.
- **Finding 2 above** (the `show` gap) is closed in S12 by its two-learner isolation tests, not earlier.
- **The S12 acceptance on #136 is confirmed as drafted**, probably over two chats: part 1 the process, my courses,
  course view, own progress and isolation; part 2 submission, the learner request as a job and the finding 3 test.

## Changes

| File | Content |
| --- | --- |
| `docs/plans/handoffs/chat-30.md` (new) | this handoff |

GitHub: issue #136 opened (S12 acceptance); decision comment on #133.

## Roadmap rows to change (for the owner)

- **Owner decisions in force:** add D36 = "the studio shows pending membership proposals and warns that one is
  applied at a time; one membership proposal may add several members (batch); the core does not refuse a proposal
  while another is pending (17 Nov 2026, #133)". Add D19 (partial) = "a learner's courses are those they are enrolled
  in; for now the deliveries where they are `LEARNER` by D25 membership (policy ∩ participant); one delivery context
  per learner is excluded (17 Nov 2026, #136)". Add the D20 projection to D20's row, or as a reference to #136.
  Remove D19 and D36 from the open decisions.
- **New open decision D37:** how a learner enrols (by the administrator's membership, a roster, a separate enrolment
  record, self-enrolment); blocks nothing before S13; the S12 list of a learner's courses is one function D37 may
  change.
- **Open decisions, new row (or note on S13):** the stale rule for evaluation drafts (Chat 29 finding 3, finding 1
  above), decided in S13.
- **S11b:** scope "#132 and #133, and batch membership (D36): labels and data for #132 and the pending warnings; core,
  CLI, API and studio for batch membership". Depends on: S11, D36 (decided). Proposed acceptance, to replace the
  current list:
  - [ ] Creating a delivery course with an existing id is refused in the form, in words; nothing navigates (#132).
  - [ ] The course page shows a pending activation proposal with its link instead of "Propose activation" (#133).
  - [ ] The members page lists the pending membership proposals with their links and says that one membership is
    applied at a time; once one is applied the others go stale and are proposed again (#133, D36).
  - [ ] One membership proposal adds one or more members (a mapped subject with one of `CONTENT_RESPONSIBLE`,
    `ASSESSOR`, `LEARNER`, `OBSERVER`; never `ADMINISTRATOR`; no subject twice; none already a member) in one new
    policy version, through the core, the CLI, the API and the members page; replay and conflicting request ids
    behave as for one member; application rechecks the installed policy as today.
  - [ ] Studio tests for each state; the S10 and S11 browser tests cover them (the S11 test proposes a second member
    while one is pending, and adds two members in one proposal).
- **S12:** "Depends on": S11 (done), D19 (answered for S12), D20 (decided, projection on #136). Acceptance: the list
  on #136.
- **S13:** add "the stale rule for evaluation drafts (Chat 29 finding 3) is decided here with the owner".
- **Planned order** unchanged: S11b, then S12 (part 1, part 2), S13, S13b.

## Findings (not changed)

1. The `show` gap (finding 2 above): a learner-only subject reads other learners' evidence, occurrences and states
   through `GET /contexts/{id}` today. Closed in S12 (owner).
2. The stale rule (finding 1 above) applies to every proposal kind. Batch membership reduces it for enrolment only;
   pending activations, evaluations and authoring proposals of a course still go stale on any apply or submit.
3. Still open from earlier chats: FORMAL needs authored verification rules (Chat 27, finding 1); the course list shows
   a subject's roles from the policy (Chat 28, finding 1); Chat 29 findings 4–7.

## Open decisions

Answered here: D36; D19 for S12 (enrolment itself proposed as D37). Still open: D21, D28, D29, D31–D33, D37 (new), the
stale rule for evaluation drafts (S13).

## Next step

**Chat 31: S11b** (#132, #133, batch membership), with the acceptance above once the owner records it. Then S12
(#136), S13, S13b.

### Prompt for Chat 31

```text
You are Chat 31 of the ALM prototype (repo thesis-fedfalco-2026/AIM-PRO-AILiteracy, checkout
~/development/py-prototype). Your step is **S11b**: the studio flow fixes from the SE-AI case study (#132, #133) and
batch membership (D36, owner decision of 17 November 2026).

## Where things stand

- S11 is merged (PR #131). Chat 30 recorded D36 (B + batch membership) on #133, answered D19 for S12 and specified
  S12 on #136. Read docs/plans/handoffs/chat-29.md and docs/plans/handoffs/chat-30.md.
- The S11b acceptance proposed in chat-30.md ("Roadmap rows to change") replaces the roadmap's list once the owner
  records it; if the roadmap still has the old list, ask the owner before starting.

## Protocol

1. Verify the baseline on main: git status, git log --oneline -5, gh pr list --state open, the Python suite with
   `python -m unittest discover -q` and telemetry off (LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true
   CREWAI_TRACING_ENABLED=false), python -m aimpro.generate --check, python -m services.api_common.openapi --check,
   python -m evaluation --check, and in apps/ npm run check:client, typecheck, test. Report any difference from the
   Chat 30 handoff.
2. Read AGENTS.md, the roadmap (working protocol, D25, D36, S11b), issues #132 and #133, learning/membership.py,
   the membership API and CLI, apps/studio/src/features/members/, features/delivery/ActivationSection.tsx,
   course/CoursePage.tsx and the course creation form, apps/e2e/assessment.spec.ts and delivery.spec.ts.
3. Open the S11b issue with the acceptance as a checklist. Contract tests first: the batch membership command (one
   or more members, one policy version, replay, conflicting request id, refusals), the API and its OpenAPI, then the
   studio states.
4. Implement; run the S11b checks, the full offline suite, the generated-contract and OpenAPI checks, the studio
   checks. Write docs/plans/handoffs/chat-31.md; open one focused PR; wait for CI (browser tests run there) and report.

## Constraints

- Code, tests, docs and GitHub content in English; chat with the owner in Italian. Do not spawn agents.
- No model call, no live run; synthetic seed only. Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- Layout and visual design are owned by someone else: change labels and data, not styling.
- Leave the others' uncommitted changes (README.md, docs/architecture/system-overview.md,
  docs/plans/handoffs/chat-01.md, docs/plans/sequential-chat-plan.md, examples/lpo-ai/) alone and out of PRs.
- The owner's stacks (ports 58000/58001; /tmp/alm-demo and /tmp/alm-se-ai): never stop or restart them; read their
  stores read-only.
- The core does not refuse a membership proposal while another is pending (D36). Do not start S12 (#136), #125 or
  #134. Do not decide D21, D28, D29, D31–D33, D37.
```

## PR and CI

Reported in the PR conversation.
