# Prototype roadmap — role applications over ALM

Prepared on 8 November 2026 at `main` `64b6a7e` (PR #72 merged). This is the
execution plan for the working prototype. It is not evidence that any step is
done. Architecture and module rules come from the
[role-applications plan](role-applications-plan.md); this file fixes the order,
the scope of each step and how each chat works. If the two disagree, this file
wins until the owner changes it.

## Direction

- **ALM is the reference model.** The prototype is built on the ALM service and
  its contracts. The AIM-PRO metamodel will be revised and SCN01 will be replaced
  by other scenarios. AIM-PRO mappings are later work and block no step. AIM-PRO
  and jjodel exports are never edited.
- **Goal:** a working prototype for each human role (reviewer, author, learner,
  then organisation), reached through small, verified steps.
- **One state authority.** `LearningService` and its store own every write.
  Applications never call agents, models, the database or MCP directly.
- **Every generated artefact is a proposal** that a human decides and applies.

## Owner vision (9 November 2026)

Stated by the owner after using the S07 review inbox (Chat 15 handoff, "Owner
validation"). It is the target of the steps below; this revision maps it onto
them and names what is new.

- **Teachers and trainers build a course progressively**: the syllabus, its
  lessons, activities, targets and competences first, refined step by step,
  then the rubrics, the assessments and the other parts of the course. Agents
  help improve the quality of the course; people decide.
- **An AIM-PRO model can be uploaded** to start the build of a course.
- **The studio shows the course in sections**: the syllabus, the assessments,
  the rubrics, the materials and the process behind them, not only a review of
  one proposal.
- **The course is validated** and then becomes usable by learners and trainers.
- **Learners** sign in, see the courses they are enrolled in, open one, see its
  material and syllabus, take part in learning activities, do exercises and
  assessments, and talk to the Socratic agent.

| Vision | Step | Status after this revision |
| --- | --- | --- |
| Course in sections | S07b | done (read only): PR #90, reaching `main` through PR #92 |
| Review in plain words | S07 | teacher view done for assessments (reaching `main` through PR #92); other proposal kinds in S09c |
| AIM-PRO upload starts a build | S09a | done: PR #98 (course created from the studio, upload, Curator job, project initialization) |
| Sources prepared, then accepted by the teacher | S09a2 | done: PR #103 (discovery and preparation jobs, the teacher's choice, job list) |
| Progressive refinement with agents | S09b | done: PR #105 (syllabus in words, Curator revisions and teacher edits, compared by learning target); the review of each Curator draft made visible, retried and calibrated in Chat 20 (PR #108) |
| Rubrics, assessments, teacher and trainer content | S09c (was S09) | needs S08 |
| Course validation | S10 | activation blocked by D4 until S11 |
| Learner: my courses, material, syllabus | S12, S13 (extended) | needs S11 and D19; D20 decided |
| Learner: activities, exercises, assessments, Socratic agent | S13 | needs S11 |
| Trainers using the validated course | open | D21 (owner direction recorded, still open) |

## Verified baseline (8 November 2026)

| Fact | Value | How verified |
| --- | --- | --- |
| `main` | `64b6a7e` | `git log --oneline -1` |
| Offline suite | 570 tests OK, 4 skipped | `unittest discover -q` with telemetry off |
| Generated contracts | OK | `python -m aimpro.generate --check` |
| CI jobs | `generated-contracts`, `authoring-architecture`, `offline-evaluation` | `.github/workflows/aimpro-contracts.yml`; CI uses Python 3.11, local `.venv` is 3.12.7 |
| Store | SQLite only, in `learning/store.py` | direct `store.db` use in 10 core modules: `learning/{service,generation,projects,releases,decisions}.py`, `aimpro/{source_service,syllabus_service,bindings,execution_setup,trace}.py`; 12 test modules also use it |
| Release/import | `learning/releases.py` (R1) | PR #72; guide `docs/architecture/releases.md` |
| Activation | refused while an ASSESS activity has no runtime role (D4) | `RELEASE_RUNTIME_ROLE` in `learning/releases.py` |
| Web stack | none yet: no `services/`, no `apps/`, no FastAPI dependency | `ls`, `requirements.txt` |
| Toolchain | Node 22.22.2, Docker 29.8.2; `psycopg[binary]==3.2.12` already pinned | local commands |
| Repository | `thesis-fedfalco-2026/AIM-PRO-AILiteracy` (renamed from `py-prototype`) | `gh repo view` |

Facts in this table are a snapshot. Every chat re-verifies the ones it uses.

## Owner decisions in force

| Id | Decision | Date |
| --- | --- | --- |
| Stack | FastAPI backend; React + TypeScript + Vite front-end, one app per audience | 8 Nov 2026 |
| Identity | Keycloak OIDC from the start | 8 Nov 2026 |
| Store | ALM store on PostgreSQL now (SQLite kept for tests and single-host use) | 8 Nov 2026 |
| UI language | English first, externalised strings | 8 Nov 2026 |
| D1–D5 | R1 scope, manifest format 1, policy preview, D4 = a, tracking in #71 | 8 Nov 2026 |
| D18 | A teacher refines a proposal both ways: a conversation with the Design Agent, and manual edits of the proposed content. The agents' output and the teacher's edits stay proposals that a human decides and applies | 9 Nov 2026 |
| D22 | Source preparation becomes an agent job, in its own step (S09a2), not in S09a. Its result is the prepared sources, not a proposal: the teacher reviews them and decides whether the Curator syllabus job uses them; nothing is used until the teacher accepts. The job contract gains an outcome for "completed, awaiting the teacher's choice" (Chat 16 owner answer 1, Chat 17) | 9 Nov 2026 |
| D23 | A teacher creates a course from the studio, and the API writes its policy. An operator installs a course template (`ALM_COURSE_TEMPLATE`, read only for the API) naming the subjects who may create courses and the source scopes of a new course. `POST /courses` writes one new policy file in `ALM_POLICY_DIR` granting the creator `ADMINISTRATOR` and `CONTENT_RESPONSIBLE` in that context only, and bootstraps the context in PREPARATION/DRAFT. The API never changes or removes an existing policy file; the same request returns the same course (Chat 17, issue #97) | 9 Nov 2026 |
| D24 | Uploaded AIM-PRO exports are stored unchanged in the worker's export directory (`ALM_AIMPRO_EXPORTS`) as `<sha256>.json`. An upload is refused when it is not JSON, is over the size limit (10 MiB, configurable), is not a jjodel megamodel 1.0 export, its metamodels cannot be read, or the chosen scenario and competency catalogue cannot be resolved. Findings against the generated contracts do not refuse it: they are diagnostics shown in plain words (Chat 16 owner answer 2, Chat 17) | 9 Nov 2026 |
| D26 | Source preparation (S09a2) is two jobs. A model-free discovery job runs the teacher's queries and records what they found (in the ALM requests store, replayed without a new search); the teacher picks excerpts with their purpose and limitations; the preparation job fetches them exactly (`SourcePlan` unchanged). The teacher's acceptance is recorded in the jobs store: a preparation job ends `AWAITING_CHOICE` and the teacher moves it to `ACCEPTED` or `DECLINED`; the API and the worker refuse a Curator job on a preparation that is not accepted, while the CLI `--prepared-sources` stays an operator path without acceptance. A minimal job list is on the build page. Coverage requirements are an optional form guided by the uploaded export (Chat 18, issue #101) | 10 Nov 2026 |
| D27 | Syllabus refinement (S09b, refines D18). Units of two syllabi are paired by learning target (`source_target_id`), in their order when several share a target. The Curator holds the conversation (no separate Design Agent): a revision request is one turn, and the revision job gives the Curator the previous syllabus and the reasons of the whole chain. A teacher's edit is complete (every field; units added, removed and reordered), passes the same checks as a generated syllabus and is a proposal by that teacher, declared not reviewed by the agent; the agent's review of an edit is optional and does not block (its form is D29). A refinement reuses the input of the proposal it refines, accepted sources included, while the course is still at that proposal's step; otherwise the sources are prepared again (Chat 19, issue #104) | 10 Nov 2026 |
| D30 | The review of a Curator syllabus (Chat 20, issue #107, refines D27). A request makes at most three drafts: a draft refused by the deterministic checks or not accepted by the review agent (`REJECT`, `UNCERTAIN`, a flag false) goes back to the Curator with its draft and the reason, as untrusted data; the review agent judges each draft on its own. When the drafts run out the request fails as before, so a generated syllabus always carries an `ACCEPT` review. Every attempt's verdict, or the fixed text of the check that refused it, is kept with the request's result in the ALM requests store, read through the API and shown in the studio; the review agent's reason is shown as model text and never becomes an error message, a log line or an event. The review of a revision receives the previous syllabus and the teacher's reasons. The review prompt was calibrated on 4 + 4 owner-authorized live jobs, in three clauses only: source diagnostics are not by themselves grounds for rejection, uncited excerpts are not grounds for rejection, and a claim is judged as worded. The configured models are unchanged | 10 Nov 2026 |
| D34 | Generation by blocks of units (S09d, issue #118, refines D30 for the generators). The Evaluator, Teacher (unstructured) and Trainer write a request in blocks of 12 target units; the generator of a block receives the whole input (the whole syllabus included), its units and the accepted drafts of the earlier blocks, as untrusted data. Each block is judged by the review agent on its own, with the full input and that block only, up to three drafts per block; the assembled draft is judged once at the end, also for one block. One proposal per job. A flow ends with something for the teacher to decide (13 November 2026, changes D30 for these generators): a block the review agent does not accept keeps its last checked draft, and a final review that is not `ACCEPT` is proposed with its verdict and a fixed notice; a block whose drafts all fail the checks is written in two halves, and only a one-unit block failing them fails the job. Accepted blocks are kept and reused, without a model call, by a new job over the same exact inputs. The structured Teacher and the Curator keep one response. A block whose response does not fit (a call past its deadline, or a response cut at its output length limit) is written in two halves, down to one unit, so the approach does not depend on the model; only a one-unit block that does not fit stops the request, with a fixed text, never the provider's message; the deadline of a model call is 1200 s (was 600); block progress is a content-free event shown in the studio job list. A draft that does not cover its units is refused in words the author can read, naming the units by their position in the syllabus; the retry receives the unit keys as data (Chat 23, 12–13 November 2026) | 13 Nov 2026 |
| D35 | Responses may reveal which contexts exist: the rule "a response never reveals which contexts exist" (D10, S05) is removed, so the API may list the contexts of the signed-in subject, for the studio home (in place of the context id field) and for the learner's courses (D19, S12). A missing context and an uninstalled policy still both answer 404 `context_unavailable` | 16 Nov 2026 |
| D20 | A learner sees everything needed to follow and learn from the course: syllabus, material, activities, exercises and the rest of the learning content. What the learner sees comes from the validated course, never from drafts or other learners' records; the exact projection (for example rubrics and assessment criteria) is defined in S12 with the owner. Projection (17 Nov 2026, #136): for an assessment, its activity, conditions, accepted evidence and the rubric's criteria and levels; the learner's own applied evaluations with each criterion's level and reason and the result; never an answer key, never a pending draft | 9 Nov 2026, 17 Nov 2026 |
| D25 | Course membership, option A: the administrator of a course adds a member (any subject of the identity map, as `CONTENT_RESPONSIBLE`, `ASSESSOR`, `LEARNER` or `OBSERVER`; never `ADMINISTRATOR`); the API writes a new trusted policy file (an installed file is never changed or removed, as D23) and records a proposal that adds the member's `Participant` and changes the context's `policies` reference; the member's authority starts when a person applies it (Chat 28, #129) | 16 Nov 2026 |
| G7 / D4 | D4 is lifted by an assessor-requested evaluation draft (option A): a person with the `ASSESSOR` role asks the runtime evaluator `learner-response-evaluator` for a draft on one observed attempt; control builds the `Evaluation`, checks it with `validate_evaluation` (at most three drafts) and records it as a proposal that a person decides and applies; FORMATIVE and FORMAL; the import configures the EVALUATOR worker (Chat 28–29, #129, PR #131) | 16 Nov 2026 |
| D19 (partial) | A learner's courses are those they are enrolled in; for now the deliveries where they are `LEARNER` by D25 membership (policy ∩ participant), behind one function that D37 may change. One delivery context per learner is excluded (#136) | 17 Nov 2026 |
| D37 | Enrolment like Microsoft Teams: students join a published course with a course code (or a link carrying it) and take part at once; the teacher's reviewed choice to open the course with a code is the human decision. Teaching staff are still added by the reviewed membership proposal (D25, D36). The course is authored independently of its students; once approved, students join or are added, and **the course version stays the same whatever students enrol**: proposals, approvals and the stale check use a course version that leaves out participants and learners' own records, and a student, whether joining with the code or added by the teacher, is recorded as a participant only under the delivery's reviewed learner grant, with no new policy version (this replaces D25/D36 membership for the `LEARNER` role). Staff are left as they are for now. Implemented in S12b (#141) | 18 Nov 2026 |
| D9 (revised) | A person who signs in through the configured identity provider and is not in the identity map gets a subject key automatically; Keycloak roles still grant nothing and course authority still comes from the trusted policy and the participant record (S12b, #141) | 18 Nov 2026 |
| D36 | Membership proposals made together (#133): the studio shows the pending membership proposals and warns that one is applied at a time; one membership proposal may add several members (batch); the core does not refuse a proposal while another is pending (options B + batch, S11b) | 17 Nov 2026 |
| Earlier | Socratic option b; live model runs only with owner authorization; never edit AIM-PRO/jjodel exports | see `docs/architecture/agentic-network-decisions.md` |

## Proposed defaults to confirm when this roadmap is reviewed

These close choices that would otherwise be made differently by different
chats. Approving the roadmap PR approves them; any row can be changed in review.

| Id | Topic | Proposed default | Needed by |
| --- | --- | --- | --- |
| D8 | Browser authentication pattern | Backend-for-frontend: the API runs the OIDC code flow with PKCE, keeps tokens server-side, sets an `HttpOnly` `SameSite=Lax` session cookie, and requires a CSRF header on writes. No token in the browser. | S03 |
| D9 | Identity → subject key | A host-side `identity-map.json` maps (issuer, `sub`) to a policy `subject_key`. Keycloak roles grant nothing; the trusted policy stays the only authority. Unmapped users get 403. | S03 |
| D10 | Policy resolution in a multi-context API | A configured directory of trusted policy files; for each request the API loads the file whose `policy_ref` equals the context's `policies` ref. No match → the context is unavailable (activation requires the installed preview, as today). | S05 |
| D11 | Python libraries | `fastapi`, `uvicorn`, `pyjwt[crypto]` (JWKS validation), `httpx` (already pinned) for the OIDC client; exact versions pinned in `requirements.txt` | S03 |
| D12 | Front-end libraries | npm workspaces; `openapi-typescript` + `openapi-fetch` for the client; `react-router`; `i18next` with JSON catalogues; Vitest for units; Playwright for browser tests | S04 |
| D13 | PostgreSQL write serialization | One transaction-scoped advisory lock (`pg_advisory_xact_lock`) per write transaction, matching SQLite `BEGIN IMMEDIATE`; reads in `REPEATABLE READ`; payloads stored as canonical JSON `TEXT` (not `jsonb`) so bytes stay identical; an insertion sequence column replaces `rowid` ordering | S02 |
| D14 | Jobs store | Separate tables in a separate PostgreSQL schema (`jobs`), never in the ALM tables; the ALM `request_id` stays the idempotency key | S08 |
| D15 | Synthetic demo data | A dev-only seed command builds a database through the production commands with synthetic model responses (the existing test fixtures), used by API tests, UI development and browser tests | S05 |

Open decisions that block later steps, not decided here:

| Id | Decision | Blocks |
| --- | --- | --- |
| D16 | Scenario input independent of the AIM-PRO export (today the Curator reads the AIM-PRO project export) | nothing before S13; needed when scenarios change |
| Stale drafts | The stale rule for evaluation drafts: every apply and every learner's `submit` gives the course a new version, so every pending proposal goes stale, evaluation drafts included (Chat 29 finding 3, Chat 30 finding 1). Decided with the owner after the learner app is tried | S13 |
| D21 | The trainer's role once a course is validated, beyond authoring trainer content. Owner direction (9 Nov 2026), to be clarified: the trainer is used to give learners practice, a kind of Socratic agent that hands out exercises with a method. Open points: whether the trainer is a person, an agent or both, and how it relates to the Socratic coach of S13 | after S13 |
| D28 | A Curator revision of the syllabus in use. Today an applied syllabus can be edited by the teacher but not revised by the Curator: a revision needs a revision request, and a decision on an applied proposal is not one. Options: a revision job that carries its own reason, or a new decision kind (Chat 19 finding 2) | when a course is refined after it is applied |
| D29 | The form of the optional agent review of a teacher's edit (D27): a job that records a new proposal with the review agent's verdict, or a review record beside the edited proposal. Needs a model call (Chat 19 finding 3) | before the review of an edit is offered |
| D31 | Whether a citation that is true but only loosely relevant to its unit may stand when the draft declares the transfer to the audience as a gap. Since D30 the review agent accepts it and the teacher judges its relevance from the gaps and the excerpts in the syllabus view; the alternative is a further calibration that asks for relevance to the unit's purpose (Chat 20 finding 5) | before the syllabus review is relied on without a teacher reading the gaps |
| D32 | Details of the review loop (D30): whether the drafts the review agent refused are kept beside their verdicts (up to three syllabi per request), and whether an administrator's abandonment stops the loop between drafts instead of at the final write (Chat 20 findings 2 and 3) | none; when the review of a draft is audited, or long jobs are abandoned |
| D33 | A measurement of the syllabus review with another `lead` model than the free `nvidia/nemotron-3.5-super-vl:free`, with the owner's authorization for the live runs; the configured models are not changed without the owner (Chat 20 finding 6) | none; before a shared deployment chooses its models |
| D17 | Deployment owner and shared environment | any shared deployment |
| D6 | Sending the convergence draft to `rik99` | nothing in this roadmap |
| Decision 6 details | Organisation documents and guidance | S15 |
| Decision 3, #28, #17, #19 | Learner data, governance, twins, dashboards | Phase 7 of the role plan; not scheduled here |

## Working protocol for every chat

Each step is one chat and normally one PR. A step may need a second chat; it
then continues the same step id.

1. **Start by verifying.** Read `AGENTS.md`, this file, the previous handoff and
   the files the step names. Run: `git status`, `git log --oneline -3`,
   `gh pr list --state open`, the step's baseline test command. Report any
   difference from what the previous handoff says before changing anything.
2. **Open the step issue.** Create a GitHub issue titled with the step id, with
   the step's acceptance list as a checklist. Work against that issue.
3. **Stay in scope.** Do only what the step lists. Anything else found goes into
   the handoff under "Findings", not into the PR.
4. **Never decide for the owner.** If an open decision blocks the step, stop and
   ask. Do not pick an option and continue.
5. **Contracts before code.** Write or extend the contract test first (schema,
   OpenAPI snapshot, store interface, parity test), then the implementation.
6. **Evidence for every claim.** The handoff quotes commands and their results,
   commits and CI run links. Anything not verified is written as "not verified".
   Never infer an earlier state from memory or from a previous chat.
7. **Verification before publishing.** Run the step's commands plus the full
   offline suite and `python -m aimpro.generate --check`. Publish a focused PR,
   wait for CI and report its result.
8. **Handoff.** Write `docs/plans/handoffs/chat-NN.md` (next free number) with:
   step id, objective, changes, PR and commits, verification, findings, open
   decisions and the exact next step id. Include it in the PR.
9. **Plan changes.** A chat never edits this roadmap on its own initiative. It
   proposes a change in the handoff; the owner applies it in a PR.

Stop and report instead of continuing when: a test that passed at the start now
fails for reasons outside the step; the step needs a model call, a live run or
real data; an AIM-PRO/jjodel export would change; or the step's acceptance
cannot be met within its scope.

Standing limits for all steps: no model calls without explicit owner
authorization; tests use synthetic data and block outbound network except the
explicitly configured local test services (PostgreSQL, Keycloak) of the step;
no learner personal data; no change to AIM-PRO/jjodel exports or to the ALM
metamodel.

## Steps

| Step | Role-plan phase | Result | Depends on |
| --- | --- | --- | --- |
| S01 | 0a | Store transaction API; no SQL outside `learning/store.py` | this roadmap |
| S02 | 0b | PostgreSQL store backend, copy tool, CI service | S01 |
| S03 | 0c | API skeleton, OpenAPI check, OIDC with Keycloak | S02, D8, D9, D11 |
| S04 | 0c | Front-end workspace and studio shell with login | S03, D12 |
| S05 | 1 | Read-only Authoring API, policy resolver, synthetic seed | S04, D10, D15 |
| S06 | 2 | Review endpoints: decide and apply with review key | S05 |
| S07 | 2 | Studio review inbox, with a teacher view — **milestone M1: first usable app** | S06 |
| S07b | 2 | Studio course overview, read only (owner, 9 Nov 2026) | S07 |
| S08 | 3 | Agent job worker and progress stream | S07b, D14 |
| S09a | 4 | Course from an uploaded AIM-PRO model: course creation, upload, Curator job, syllabus proposal, project initialization (done: PR #98) | S08 |
| S09a2 | 4 | Source preparation as a job; the teacher reviews and accepts the prepared sources for the Curator (done: PR #103) | S09a, D22 |
| S09b | 4 | Progressive refinement of the syllabus with the Curator and the teacher (done: PR #105) | S09a, D18 |
| S09c | 4 | Rubrics, assessments, teacher and trainer content from the studio; teacher view for every proposal kind | S09a (S09a2 for prepared sources) |
| S09d | 4 | Generation by blocks of units: a 48-unit course gets its assessments and content with the configured model (owner, 11 Nov 2026; before S09c2 part 2) | S09c, D34 |
| S10 | 8 | Course validation: release and delivery views — **milestone M2: authoring to delivery** | S09c |
| S11 | — | Runtime assessor role and evaluation adapter (G7); course membership (D25) (done: PR #131) | S10, D25, G7 / D4 |
| S11b | — | Studio flow fixes from the SE-AI case study: an existing course id as delivery course (#132), pending activation and membership proposals (#133); batch membership (D36) (done: PR #139) | S11, D36 (decided) |
| S12 | 5 | Learner API, including the learner's own courses (#136) (done: PRs #142, #143) | S11 (done), D19 (answered for S12), D20 (decided, projection on #136) |
| S12b | — | Teams-style enrolment: a course code or link for students, students added by the teacher in the same way, a course version that enrolments leave unchanged, automatic subject keys (D9 revised) (#141) | S12, D37 |
| S13 | 5 | Learner app: my courses, course view, practice — **milestone M3: learner practice end to end**; the stale rule for evaluation drafts is decided here with the owner | S12, S12b |
| S13b | — | Review and release readability for the teacher: release views (#125), the next action on long review pages (#134) | S13, the layout owner |
| S14 | — | Scenario input independent of the AIM-PRO export | D16 |
| S15 | 6 | Organisation context and guidance | decision 6 details |

Planned order (owner, 17 November 2026, after the SE-AI case study): Chat 30 writes
the D19 and D36 options for the owner and specifies S12 (done, PR #137); then S11b
(done, PR #139); then S12 (part 1, part 2; done, PRs #142 and #143), S12b (Teams-style enrolment, D37;
owner, 18 November 2026) and S13; then S13b. The SE-AI case study (`examples/se-ai/`) is run again, with the
owner's authorization, as a live check at M3.

S14 and S15 are listed so they are not forgotten; they are specified when their
decisions exist. Phase 7 of the role plan (competence discovery, monitoring)
stays blocked.

### S01 — Store transaction API

**Goal.** Every core use of the database goes through `LearningStore` methods,
so a second backend can be added without touching business code.

**Scope.**

- Add to `LearningStore`: a write-transaction context manager (today
  `with store.db: store.db.execute('BEGIN IMMEDIATE')`), a read-transaction
  context manager (today `BEGIN`), an `in_transaction` property, request
  reservation (today `INSERT INTO requests …` in `projects.py`, `releases.py`),
  and a query for recorded request results (today `releases._recorded`).
- Replace the direct `store.db` uses in the 10 core modules listed in the
  baseline. Keep their transaction boundaries exactly.
- Add an architecture test that fails when `learning/` or `aimpro/` (except
  `learning/store.py`) contains `.db.`, `execute(` on a store connection, or SQL
  keywords in string literals.

**Not in scope.** PostgreSQL; schema changes; changing tests that inspect SQLite
directly, unless they break (they may keep `store.db`).

**Acceptance.**

- [ ] No direct database access outside `learning/store.py` in `learning/` and `aimpro/`, enforced by a test.
- [ ] Transaction boundaries unchanged: the existing concurrency and replay tests (`test_authoring_projects`, `test_releases`, `test_learning_store`) pass unchanged.
- [ ] Full offline suite and `aimpro.generate --check` pass; CI green.

### S02 — PostgreSQL store backend

**Goal.** The ALM store runs on PostgreSQL with the same guarantees as SQLite.

**Scope.**

- A backend selected by URL: a file path or `sqlite:///…` keeps SQLite;
  `postgresql://…` uses psycopg 3. Same logical tables (entities, contexts,
  operations, requests) and schema version, following D13.
- Same guarantees: serialized writes, consistent read snapshots, immutable
  versions, exact request replay, latest-by-insertion in `owned`.
- A test helper that runs a chosen set of suites on both backends:
  `test_learning_store`, `test_learning_service`, `test_learning_decisions`,
  `test_authoring_projects`, `test_releases`, `test_authoring_cycle`. PostgreSQL
  runs only when `ALM_TEST_POSTGRES_URL` is set; the network blocker allows only
  that host.
- `python -m learning.copy_store --from <sqlite path> --to <postgresql url>`:
  one-way copy, refuses a non-empty target, verifies row counts and payload
  hashes.
- CI: a job with a `postgres:17` service container running those suites.
- `compose.alm.yml` with a local PostgreSQL for development.

**Not in scope.** Moving existing local databases; the jobs schema (S08).

**Acceptance.**

- [ ] The listed suites pass on both backends, locally and in CI.
- [ ] Concurrent identical requests on PostgreSQL produce one recorded result (port of the existing SQLite concurrency test).
- [ ] Canonical payload bytes are identical after a round trip on both backends.
- [ ] The copy tool reproduces a synthetic database; counts and hashes match.
- [ ] SQLite behaviour is unchanged; full offline suite green.

### S03 — API skeleton and identity

**Goal.** A FastAPI service skeleton that authenticates users through Keycloak
and maps them to policy subjects, with no business endpoint yet.

**Scope.**

- `docs/architecture/role-applications.md`: process boundaries, job contract,
  module rules, identity flow (from the role plan, updated with D8–D10).
- `services/api_common/`: app factory, module registry, error mapping
  (`StateConflict` → 409, authorization failure → 403, validation → 422,
  anything else → 500 without detail), request-id propagation, health endpoint.
- Authorization errors need a distinct type: add `AuthorizationError(ValueError)`
  in `learning/policies.py`, raised by `authorize`; existing callers keep working.
- OIDC per D8/D9: login, callback, logout, session store, CSRF check,
  `identity-map.json` loader. Unit tests use a locally generated key pair and an
  in-memory JWKS, with no network.
- `compose.identity.yml` with a pinned Keycloak image and a checked-in dev realm
  export (synthetic users only); a documented manual smoke test.
- OpenAPI snapshot in `services/openapi/authoring.json` and
  `python -m services.api_common.openapi --check`, run in CI.

**Acceptance.**

- [ ] `--check` fails on drift and passes on the snapshot; runs in CI.
- [ ] Unit tests cover login callback, session, CSRF refusal, unmapped user 403, expired or foreign-issuer token refusal.
- [ ] Error mapping covered for each class above.
- [ ] Manual Keycloak smoke test recorded in the handoff (commands and result).
- [ ] No core behaviour change; full offline suite green.

### S04 — Front-end workspace and studio shell

**Goal.** A buildable front-end workspace with a studio that logs in and shows
the signed-in subject.

**Scope.** `apps/` with npm workspaces (D12): `packages/api-client` generated from
the OpenAPI snapshot, `packages/ui` (tokens and base components meeting WCAG 2.1
AA), `packages/auth` (session calls to the BFF), `studio/` shell with login,
logout and an English string catalogue. CI job: install, type-check, unit tests,
build, and a check that the generated client matches the snapshot.

**Acceptance.**

- [ ] `npm run build` and `npm test` pass in CI.
- [ ] The client check fails when the snapshot changes without regeneration.
- [ ] No user-visible string is hard-coded in components (lint rule or test).
- [ ] Manual login through local Keycloak reaches the shell (recorded in handoff).

### S05 — Read-only Authoring API

**Goal.** Staff can read contexts, proposals and projects through the API.

**Scope.**

- Policy resolver (D10).
- Synthetic seed command (D15), building contexts, a project, pending and applied
  proposals and a release through the production commands.
- Endpoints: context summary (`show`), pending proposals with exact payload and
  review payload key, project inspection, approved project syllabus, release
  inspection (`show-release`). Response models built from existing records; no
  raw store rows.
- Parity tests: for each endpoint, the same references as the CLI on the same
  seeded database.

**Acceptance.**

- [ ] Each endpoint has a parity test with the CLI.
- [ ] A learner-only subject gets the same redaction as `show` today.
- [ ] A context whose policy file is not installed is reported as unavailable.
- [ ] Endpoints never write (database change counter unchanged).
- [ ] OpenAPI snapshot updated; client regenerated.

### S06 — Review endpoints

**Goal.** Decide and apply through the API with the same guarantees as the CLI.

**Scope.** `decide` requires the reviewed payload key the client saw; a mismatch
returns 409. `apply` requires an operation id; replay returns the same change.
Add a service method that takes the expected key, if needed, with tests first.

**Acceptance.**

- [ ] A stale key is refused with 409 and records nothing.
- [ ] CLI and API decisions are interchangeable on the same database (tests both ways).
- [ ] Reviewer-role checks are unchanged (administrative, content, assessment authority).
- [ ] CSRF required on both endpoints.

### S07 — Studio review inbox (M1)

**Goal.** A reviewer completes a review in the browser.

**Scope.** Pending queue; payload viewer with diagnostics; diff against the
previously applied version of the same artefact; separate approve and apply
steps; conflict handling (reload on 409). Playwright tests on the seeded
database.

**Acceptance.**

- [ ] Browser test: review and apply an Evaluator proposal on the seed database.
- [ ] Browser test: a payload changed after loading is refused and reloaded.
- [ ] Accessibility check (axe) passes on the inbox views.
- [ ] Handoff includes a short owner test script for teacher validation.

### S07b — Studio course overview

**Goal.** A teacher or trainer sees the whole course of a context in sections.

**Scope.** Done in PR #90 (issue #89): a read-only course page from the context
summary (structure, outcomes and competences, strategies, assessments,
materials, history), linked with the review inbox. No API change.

### S08 — Agent job worker

**Goal.** Generation runs in a worker, outside HTTP requests, with progress.

**Scope.** `services/jobs`: job store (D14), job-kind registry with one entry per
existing generator and Curator command, worker loop, in-memory event sink fed by
`agent_system/events.py`, server-sent-events endpoint, abandon mapping. Model
credentials load only in the worker. Tests use the synthetic generator models.

**Acceptance.**

- [ ] A queued Evaluator job ends as a pending proposal visible in the inbox.
- [ ] A replayed `request_id` returns the same job and constructs no model.
- [ ] An interrupted job can be abandoned by an administrator.
- [ ] The event stream carries no content (strict event log in tests).
- [ ] The API process imports no model client (test).

### S09a — Course from an uploaded AIM-PRO model

**Goal.** A teacher starts the build of a course by uploading an AIM-PRO model.

**Scope.** Upload of an AIM-PRO project export in the studio (size and format
checks; the file is stored as received and never edited), the Curator job that
reads it (S08), its diagnostics shown in plain words, and the resulting
syllabus proposal reviewed in the inbox and visible in the course overview.
Project initialization from the approved syllabus.

**Done** in PR #98 (issue #97, handoff `docs/plans/handoffs/chat-17.md`), with
D22–D24 taken when the step started. Course creation from the studio (D23) was
added to the scope by the owner.

**Acceptance.**

- [x] Browser test: upload the synthetic AIM-PRO export, run the Curator job with the synthetic model, review and apply the syllabus, initialize the project.
- [x] An invalid file is refused with its reason; nothing is recorded.
- [x] The uploaded bytes are kept unchanged (digest test).
- [x] A course created from the studio gets its own new policy file and a PREPARATION/DRAFT context; only listed creators may create one; existing policy files are never changed.

### S09a2 — Source preparation as a job

**Goal.** A teacher has the sources of a course prepared, reviews them and
decides whether the Curator uses them (D22).

**Scope.** The job kind `prepare-aimpro-syllabus-sources` (today CLI only)
queued from the build page, with its source plan (queries, documents, coverage
requirements) entered in the studio; a job outcome for "completed, awaiting the
teacher's choice" in the job contract and the guide; a view of the prepared
sources in plain words (documents, excerpts, licence verdicts as usage
conditions); the teacher's acceptance, after which the Curator job runs on the
accepted preparation (`prepared_sources`) instead of a single query. Moved here
from S09c: source preparation with licence verdicts.

**Done** in PR #103 (issue #101, handoff `docs/plans/handoffs/chat-18.md`), with
D26 taken when the step started.

**Acceptance** (confirmed by the owner):

- [x] Browser test: prepare sources with the synthetic retrieval, review them, accept them, run the Curator on them, review and apply the syllabus.
- [x] Sources not accepted are never used by a Curator job (test).
- [x] A replayed request id returns the same preparation and runs no retrieval again.

### S09b — Progressive refinement with the agents

**Goal.** A teacher refines the syllabus and the design step by step with the
agents: lessons, activities, targets, competences.

**Scope.** Defined with the owner from D18: a conversation with the Design
Agent and manual edits of the proposed content, both producing proposals. At
least: a revision request whose reason the next generation receives, a
teacher's edit of a proposal recorded as a new proposal by that person, the
regenerated or edited proposal compared with the previous one in the teacher
view, and the course overview after each applied step.

**Done** in PR #105 (issue #104, handoff `docs/plans/handoffs/chat-19.md`), with
D27 taken when the step started: the Curator holds the conversation for the
syllabus. Refinement of the design beyond the syllabus (activities and content)
comes with the proposal kinds of S09c; D28 and D29 stay open.

**Follow-up (Chat 20).** Real Curator drafts were mostly refused by the review
agent and the teacher could not see why. PR #108 (issue #107, handoff
`docs/plans/handoffs/chat-20.md`) took D30: the review of every draft is kept
and shown, a refused draft is retried within the job, the review of a revision
receives what the teacher asked, and three review clauses were calibrated on
live verdicts (before: 3 of 4 jobs proposed, 2 over-strict refusals; after: 4
of 4 at the first review). D31–D33 stay open.

**Acceptance** (confirmed by the owner):

- [x] Every syllabus proposal has a teacher view in words: units with title, purpose and intents; competencies and practices by their text, not their ids; the cited excerpts with their purpose and limitations (unit test, and a browser test on the synthetic seed).
- [x] A syllabus proposal is compared with the course's current syllabus: units paired by learning target, shown as added, removed, changed or unchanged, with the changed fields (unit tests, including several units on one target and a course without a syllabus).
- [x] A revision request carries its reason to the next Curator generation, and the new proposal is compared with the previous proposal (test with the synthetic models: the reason reaches the prompt).
- [x] A teacher's manual edit of a syllabus proposal is recorded as a new proposal by that teacher and compared with the one it edits.
- [x] After each applied step, the course overview shows the applied syllabus.

### S09c — Rubrics, assessments and content from the studio

**Goal.** An author runs the rest of the authoring cycle from the studio.

**Scope.** The former S09: job forms for Evaluator, Teacher and Trainer showing
the exact inputs; binding proposals (source preparation moved to S09a2). A teacher view for every proposal kind
(teacher and trainer content, completion rules, release, import), as S07 did
for assessments.

**Acceptance.**

- [ ] Browser test: the synthetic authoring cycle reaches the same project state as `tests/test_authoring_cycle.py`.
- [ ] Each form shows the exact refs it sends; a stale base is refused and reloaded.
- [ ] Every proposal kind of the seed has a teacher view (browser test).

### S09d — Generation by blocks of units

**Goal.** A 48-unit course gets its assessments, teacher and trainer content
with the configured model. In the owner's trial of 11 November 2026 one
Evaluator response for 48 units reached the wall-clock deadline of a model call
(Chat 22 handoff). Decisions: D34.

**Acceptance** (issue #118).

- [ ] The Evaluator, Teacher (unstructured) and Trainer write a request in blocks of 12 target units; each block is reviewed on its own (D30, up to three drafts), the assembled draft once; one proposal per job.
- [ ] Accepted blocks are reused by a new job over the same exact inputs without a model call.
- [ ] Every attempt names its block (or the final review) and is shown in the studio; the job list shows the block progress.
- [ ] A block whose response does not fit, or whose drafts all fail the checks, is written in two halves down to one unit; a block not accepted by the review agent, and a final review not `ACCEPT`, are proposed with a fixed notice; the structured Teacher and the Curator are unchanged.
- [ ] One owner-authorized live Evaluator job on `antonio-lpo`, recorded in the handoff.

### S10 — Course validation: release and delivery views (M2)

**Goal.** Release, import and activation from the studio: the owner's "course
validation". Activation stays refused while D4 holds (S11).

**Scope.** Views over `propose-release`, `show-release`, `propose-delivery-import`
(binding selection, policy preview download) and `propose-activation` (findings
shown, including the D4 refusal). Installing a policy preview stays a host
operator action, documented, not a browser action.

**Acceptance.**

- [ ] Browser test: release and import of the seeded project; activation shows `RELEASE_RUNTIME_ROLE`.
- [ ] The policy preview is shown in full and never replaces an installed policy.

### S11 — Runtime assessor role (G7)

**Goal.** ASSESS activities get a reviewed runtime role, so that activation can
be considered.

**Scope.** Specified in its own chat from G7 in
`docs/plans/handoffs/chat-07.md` and the evaluation flow in
`docs/architecture/authoring-lifecycle.md`. It needs an explicit owner decision
on how D4 is lifted before implementation.

**Done** in PR #131 (issue #129, handoffs `docs/plans/handoffs/chat-28.md` and
`chat-29.md`), merged as `287cfff`. The owner ran the whole flow live on
17 November 2026 (SE-AI case study, `examples/se-ai/README.md`).

### S11b — Studio flow fixes from the SE-AI case study

**Goal.** The delivery flow does not lead a teacher into refused or stale
proposals, and a class is enrolled in one propose–decide–apply cycle.

**Scope.** #132 and #133, and batch membership (D36): labels and data for #132
and the pending warnings; core, CLI, API and studio for batch membership.
The core does not refuse a membership proposal while another is pending (D36).
Issue #138; acceptance proposed in `docs/plans/handoffs/chat-30.md`, started by
the owner on 17 November 2026.

**Acceptance.**

- [ ] Creating a delivery course with an existing id is refused in the form, in words; nothing navigates (#132).
- [ ] The course page shows a pending activation proposal with its link instead of "Propose activation" (#133).
- [ ] The members page lists the pending membership proposals with their links and says that one membership is applied at a time; once one is applied the others go stale and are proposed again (#133, D36).
- [ ] One membership proposal adds one or more members (a mapped subject with one of `CONTENT_RESPONSIBLE`, `ASSESSOR`, `LEARNER`, `OBSERVER`; never `ADMINISTRATOR`; no subject twice; none already a member) in one new policy version, through the core, the CLI, the API and the members page; replay and conflicting request ids behave as for one member; application rechecks the installed policy as today.
- [ ] Studio tests for each state; the S10 and S11 browser tests cover them (the S11 test proposes a second member while one is pending, and adds two members in one proposal).

**Done** in PR #139 (issue #138, handoff `docs/plans/handoffs/chat-31.md`), merged as `5f8db44`.

### S12 — Learner API

**Goal.** A separate learner process with LEARNING redaction.

**Scope.** Learner request as a job, attempt submission, own progress
(occurrences and approved states only); the learner's own courses (D19, for
now) and the learner's view of the validated course (D20 and its projection),
which changes LEARNING redaction. No authoring code importable. Specified on
#136 (Chat 30); probably two chats: part 1 the process, my courses, course view,
own progress and isolation; part 2 submission, the learner request as a job and
the finding 3 test.

**Acceptance** (confirmed by the owner on #136, 17 November 2026).

- [x] **Separate process.** `services/learner_api`, its own FastAPI app, OpenAPI file and `--check`, sharing `services/api_common`; an architecture test shows that no authoring module is importable from it.
- [x] **My courses (D19).** The LEARNING contexts with status ACTIVE where the signed-in subject holds `LEARNER` in the installed policy and in its participant record; a member whose membership proposal is still pending is not listed; the source of the list is one function (D37 may change it).
- [x] **Course view (D20).** From the validated course of the delivery, never from drafts or proposals: the syllabus structure, outcomes and competences, teaching strategies, materials, and for each assessment its activity, conditions, accepted evidence and rubric criteria and levels. No answer key (a test), no proposal, decision or other participant.
- [x] **Own progress.** The learner's own occurrences and evidence, own applied evaluations (each criterion's level and reason, the result) and own approved learning states; never a pending evaluation draft.
- [x] **Attempt submission** (`submit`), idempotent by request id; a learner still cannot propose, decide or apply, and a learner request still cannot persist an `Evaluation`: evaluations stay proposed and approved separately.
- [x] **Learner request as a job** (teacher and Socratic intents, Socratic option b), run by the job worker; tests use synthetic model responses only.
- [x] **Isolation.** Tests across two learners of one delivery, on every Learner API endpoint and on the Authoring API context summary: each learner reaches only their own data (closes the `show` gap of Chat 30). Every read leaves the table digests unchanged.
- [x] **Finding 3** recorded in a test: a learner's submit makes a pending evaluation draft stale (today's rule; decided in S13).
- [x] The seed (D15) gives a delivery with two synthetic learners. `python -m evaluation --check`, the full offline suite and `python -m aimpro.generate --check` pass.

**Done** in two parts: part 1 in PR #142 (handoff `docs/plans/handoffs/chat-32.md`),
merged as `66680de`; part 2 in PR #143 (handoff `docs/plans/handoffs/chat-33.md`),
merged as `f0e7510`. Issue #136 closed. Part 2 also makes `LearningService.request`
write only the run's own records, and records a learner's attempts and questions
under the learner's own request id (`learner:{subject}:{id}`, Chat 32 finding 1).

### S12b — Teams-style enrolment (D37)

**Goal.** A student joins a published course alone, with its code, or is added
by the teacher, and takes part at once; the course version stays the same
whatever students enrol, so the teacher's review queue is not disturbed.

**Scope** (issue #141; owner decisions of 18 November 2026: D37, D9 revised).
A delivery course opened to enrolment with a code in its reviewed policy (only
a digest of the code stored); a signed-in subject who gives the right code to
an ACTIVE delivery becomes a `LEARNER` participant, idempotent by request id; a
student added by the teacher is recorded the same way, as a participant only,
with no new policy version (this replaces D25/D36 membership for `LEARNER`);
proposals, approvals and the stale check use a course version that leaves out
participants and learners' own records, so enrolments never make a pending
proposal stale (S13 still decides whether a learner's new attempt makes that
learner's own pending evaluation draft stale; the ALM metamodel is unchanged,
so the technical record version still changes);
teaching staff are left as they are for now; automatic subject keys for
people of the configured issuer outside the identity map; "join with a code"
in the Learner API; the course code with "reset" and "disable" on the studio's
members page. Not in S12b: removing a member, promoting a member, a catalogue
of open courses (later, not yet planned); the learner app screens (S13).

**Specification** (owner answers of 18 November 2026, Chat 34, recorded on
#141). Opening a delivery to learners is one reviewed policy change, made once:
a new policy version with the delivery's *learner grant* (the learners' actions
and the delivery's scopes), proposed, decided and applied as D25. The code is
not in the policy: an administrator creates, resets and disables it at once;
it is derived from a host secret (`ALM_ENROLMENT_SECRET`) and a nonce of the
course, the store keeps the nonce and the code's digest, and administrators
see the code whenever they open the members page. The code alone finds the
course (a link `/join?code=…`); a wrong, reset or disabled code gets one answer
and records nothing. Course version: a proposal stays applicable when every
change since its base is a learner's event (a join or an attempt, never an
applied proposal) and the context record is unchanged outside `participants`,
`activityOccurrences` and `learningStates`; for an evaluation draft only joins
and `participants` count, so a learner's attempt still makes it stale (finding
3, decided in S13). Automatic
subject keys: `auto-` and 20 hex digits of SHA-256 over (issuer, `sub`), with
no write; the identity map may not use the prefix; valid in both APIs. Students
added by the teacher join at once, without a proposal, under the learner grant.
Two parts: part 1 the core and the APIs; part 2 the studio members page,
students added by the teacher, the seed and the browser test.

**Part 2 specification** (owner answers of 18 November 2026, Chat 35, recorded
on #141). Students added by the teacher are chosen among the people of the
identity map who are not members, or typed as keys (of the map or `auto-`); a
person reads their own key in the studio. The join link is
`<learner app>/join?code=…`, the learner app's address set when the studio is
built (otherwise the studio's origin), shown as text: no page serves it before
S13, and the page says so. The browser test runs the Learner API in the test
stack (port 58002, its own client in the dev realm): a person outside the map
signs in there and joins with the code. The studio's "unmapped" page goes; a
person with no course sees their key on the home page. The Authoring API no
longer offers or accepts `LEARNER` in a membership proposal (the core still
applies one recorded before).

**Acceptance** (confirmed on #141, 18 November 2026).

Part 1:

- [ ] **Learner grant.** A participant with only `LEARNER` in a delivery whose installed policy has the grant reads, interacts and submits there exactly as a learner named in the policy (D25 learners keep working) and reads the grant's scopes; learners never gain `propose`, `decide` or `apply`.
- [ ] **Opening is reviewed.** A new policy file (never changing an installed one) and a proposal that changes only the policy reference; nothing is open until a person applies it; application rechecks that exactly that policy is installed.
- [ ] **The code.** Created, read, reset and disabled by an administrator of an open delivery; only the nonce and the digest stored; a reset or disabled code is refused; learners and other staff cannot read or change it.
- [ ] **Joining with the code.** A `LEARNER` participant of that ACTIVE delivery at once, idempotent by the learner's request id; joining again returns the same course; a wrong, reset or disabled code, or a course not ACTIVE, records nothing and answers the same way; the course is in "my courses".
- [ ] **Course version.** Joining leaves every pending proposal applicable, a pending evaluation draft included; applying a proposal never drops a participant or a learner's record recorded after it was made; a learner's attempt still makes a pending evaluation draft stale; a proposal recorded before S12b still applies when nothing changed since.
- [ ] **Automatic keys.** Stable `auto-` keys for people of the configured issuer outside the identity map; a map entry using the prefix is refused; a mapped person keeps their key.
- [ ] **APIs.** Learner API "join with a code"; Authoring API: propose opening, read, reset and disable the code; OpenAPI snapshots regenerated.
- [ ] **Isolation.** Two learners join with the code and stay isolated; staff membership (D25, D36) unchanged.
- [ ] Full offline suite, `python -m aimpro.generate --check`, `python -m services.api_common.openapi --check`, `python -m evaluation --check` and the studio checks pass.

Part 2:

- [ ] **Studio members page.** Propose opening, see the code and the join link, reset and disable it.
- [ ] **Students added by the teacher**, at once, under the learner grant, with no new policy version (replaces D25/D36 for `LEARNER`).
- [ ] The seed (D15) opens its delivery; a browser test joins with the code.

### S13 — Learner app (M3)

**Goal.** A learner practises in the browser on an activated synthetic delivery.

**Scope.** My courses; a course view with its syllabus, material, activities
and exercises (D20);
practice screen with the Socratic coach (Socratic option b), exercises and
assessments; progress view. Choosing between alternative next exercises waits
for decision 1.

**Acceptance.**

- [ ] Browser test: practice, submission and a reviewed evaluation on the seed delivery.
- [ ] The learner build contains no authoring code (bundle check).
- [ ] A learner joins the course with its code or link (S12b) before practising.
- [ ] The stale rule for evaluation drafts (Chat 29 finding 3) is decided with the owner once the learner app is tried.

### S13b — Review and release readability

**Goal.** A teacher finds what to check and what to do next on the review and
release pages.

**Scope.** #125 (release views) and #134 (the next action on long review pages).
Labels and data first; any change to the structure of a page (where the decision
form sits, collapsing the policy preview) is agreed with the layout owner. S10's
rule that the policy preview is shown in full stays unless the owner changes it.

**Acceptance.** Defined with the owner and the layout owner when the step starts.

## Chat prompts

Copy the prompt for the next step. Replace `NN` with the next free handoff number.

### Prompt for S01

```text
Work in /Users/juridirocco/development/py-prototype (GitHub:
thesis-fedfalco-2026/AIM-PRO-AILiteracy). Read AGENTS.md,
docs/plans/prototype-roadmap.md (sections "Working protocol" and "S01"), the
latest docs/plans/handoffs/chat-NN.md, learning/store.py and every core module
the S01 scope lists. Chat in Italian; write code, docs and GitHub content in
English. Do not spawn agents. Follow the working protocol exactly: verify the
baseline first, open the S01 issue, stay in scope, stop on any open decision.

Implement S01. Write the architecture test first, then move each direct database
use behind LearningStore methods without changing transaction boundaries.
No PostgreSQL work, no schema change, no model calls.

Run the S01 acceptance commands, the full offline suite and
python -m aimpro.generate --check. Publish a focused PR, check CI, and write the
handoff with evidence and the next step id.
```

### Prompt for later steps

```text
Work in /Users/juridirocco/development/py-prototype (GitHub:
thesis-fedfalco-2026/AIM-PRO-AILiteracy). Read AGENTS.md,
docs/plans/prototype-roadmap.md (sections "Working protocol", the step SNN and
any decision it depends on), the latest docs/plans/handoffs/chat-NN.md and the
files the step names. Chat in Italian; write code, docs and GitHub content in
English. Do not spawn agents. Follow the working protocol exactly: verify the
baseline first, confirm the step's dependencies are merged and its decisions are
recorded, open the step issue, stay in scope, stop on any open decision.

Implement step SNN as written. Contract tests first. No model calls or live runs
without explicit owner authorization; synthetic data only.

Run the step's acceptance checks, the full offline suite and
python -m aimpro.generate --check. Publish a focused PR, check CI, and write the
handoff with evidence and the next step id.
```
