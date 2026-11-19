# AIM-PRO AI Literacy — ALM prototype

A working prototype for designing learning paths with AI agents and delivering
them under human control. It is built on ALM, the Agnostic Learning Metamodel:
agents (Curator, Evaluator, Teacher, Trainer, Socratic coach) propose syllabi,
assessments, materials and feedback; people review, approve and apply every
change; the ALM service records each version, decision and learner interaction.

**Browse the documentation:** <https://thesis-fedfalco-2026.github.io/AIM-PRO-AILiteracy/>

## Contents

- [Overview](#overview)
- [Status](#status)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)
- [Installation and build](#installation-and-build)
- [Configuration](#configuration)
- [How to run](#how-to-run)
- [Testing](#testing)
- [Data and storage](#data-and-storage)
- [How to contribute](#how-to-contribute)
- [Security and data protection](#security-and-data-protection)
- [Documentation](#documentation)
- [License](#license)

## Overview

The system has two modes:

- **PREPARATION**: a teacher builds a course from an uploaded AIM-PRO model:
  sources prepared and accepted, a Curator syllabus refined step by step, then
  Evaluator assessments and rubrics, Teacher and Trainer content and completion
  rules. The course is then released, imported into a delivery and activated.
- **LEARNING**: enrolled learners open the course, practise, submit attempts and
  talk to the Socratic coach; an assessor asks the runtime evaluator for a draft
  evaluation that a person reviews.

One rule holds everywhere: **agents propose, people decide, ALM records.**
`LearningService` and its store own every write; a model verdict is never a
human approval, and no agent can change permissions, approve, apply or mark a
competency as acquired.

## Status

Research prototype, under active development. Synthetic data only; it is not
deployed and has not been piloted with learners. Done so far (steps of the
[prototype roadmap](docs/plans/prototype-roadmap.md)):

| Area | Delivered |
| --- | --- |
| Platform | ALM store on SQLite or PostgreSQL, Authoring API and Learner API (FastAPI), Keycloak sign-in, agent job worker |
| Authoring studio | Course from an AIM-PRO model, source preparation, syllabus refinement, Evaluator/Teacher/Trainer forms with generation by blocks of units, every proposal read in plain words |
| Delivery | Release, delivery import, activation, course members, the runtime assessor, Teams-style enrolment with a course code |
| Learner app | Join with a code, my courses, course view, practice with the Socratic coach, progress |

Open decisions and the next steps are listed in the roadmap and in the latest
handoff under [docs/plans/handoffs/](docs/plans/handoffs/).

## Architecture

```text
Browser apps (studio, learner app)
  -> Authoring API / Learner API (FastAPI, OIDC sessions through Keycloak)
       -> LearningService -> ALM store (SQLite or PostgreSQL) + jobs store
       -> agent job (queued)
            -> job worker -> Lead + specialist agents (CrewAI) -> model providers
                          -> scoped retrieval through MCP -> WP3 source corpus
```

- Applications reach agents only through jobs; only the worker loads model
  credentials.
- Every generated artifact is a typed proposal, checked by code and by a
  review agent before a person sees it.
- The AIM-PRO/jjodel export is read, never edited; the ALM metamodel is the
  reference model.

Start with [role applications](docs/architecture/role-applications.md)
(processes, APIs, identity, studio and learner app) and the
[agentic-network decision register](docs/architecture/agentic-network-decisions.md).
The [Documentation](#documentation) section lists the other guides.

## Repository layout

| Path | Content |
| --- | --- |
| `learning/` | ALM core: `LearningService`, store, policies, projects, releases, CLI (`python -m learning`) |
| `aimpro/` | AIM-PRO adapter, generated contracts, Curator and generators (Evaluator, Teacher, Trainer) |
| `agent_system/` | Agent registry, dispatchers, CrewAI Flow orchestrator, model clients, events, telemetry |
| `control/`, `categories/`, `agents/`, `skills/` | Agent definitions: the Lead, role categories, worker and authoring agents, skills |
| `document_search/` | MCP retrieval server and backends (mock, WP3 PostgreSQL, Qdrant) |
| `services/` | `authoring_api`, `learner_api`, `jobs` (store and worker), `api_common`, OpenAPI snapshots |
| `apps/` | npm workspace: `studio`, `learner`, shared `packages/`, Playwright tests in `e2e/` |
| `evaluation/` | Offline adversarial evaluation suite |
| `tests/` | Python test suite, synthetic seed and synthetic worker |
| `infra/` | Keycloak dev realm and identity map, WP3 database image |
| `examples/` | Case studies (SE-AI) and scenario data (SCN01) |
| `tools/docsite/` | The documentation site published on GitHub Pages |
| `docs/` | Architecture guides, plans and chat handoffs, AIM-PRO material, evaluation |

## Requirements

| Tool | Version | Needed for |
| --- | --- | --- |
| Python | 3.11 or later (CI uses 3.11) | everything |
| Node.js | 26.13 or later | the studio and the learner app |
| Docker Compose | 2.20.3 or later | Keycloak, PostgreSQL, the WP3 corpus, optional Qdrant/TEI and Langfuse |
| `openssl` | any | generating local secrets |

A model provider key (OpenRouter, Anthropic or OpenAI) is needed only to run
real agents; tests and the synthetic demo need none.

## Installation and build

```bash
git clone https://github.com/thesis-fedfalco-2026/AIM-PRO-AILiteracy.git
cd AIM-PRO-AILiteracy

# Python
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

# Front-end (studio and learner app)
cd apps
npm ci --ignore-scripts
npm run build            # studio/dist and learner/dist
cd ..
```

Generated artifacts are checked in and verified in CI. Regenerate them only
after changing their source:

| Change | Regenerate | Check |
| --- | --- | --- |
| AIM-PRO metamodel contracts | `python -m aimpro.generate` | `python -m aimpro.generate --check` |
| An API route or model | `python -m services.api_common.openapi` | `python -m services.api_common.openapi --check` |
| An OpenAPI snapshot | `npm run generate:client` (in `apps/`) | `npm run check:client` |

## Configuration

Create `.env` in the repository root; it is ignored by git. Never commit keys.

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Model provider keys, as named by the profiles in `model.properties` |
| `SEARCH_BACKEND` | `mock` (synthetic documents), `postgres` (WP3 corpus) or `qdrant` |
| `LANGFUSE_ENABLED` | `false` by default; see [observability](docs/observability.md) |

- **Models.** `model.properties` defines the profiles (provider, model, key
  variable); each agent picks one in its file (`control/lead.md`,
  `agents/*.md`). `runtime.properties` sets the Lead, generation parameters,
  the model-call deadline and orchestration limits. The default OpenRouter
  model is free and never switches to a paid one; a paid profile needs
  `allow_paid = true`.
- **Sources.** For the real WP3 corpus, follow the
  [WP3 setup](docs/wp3/integration.md) (`SEARCH_BACKEND=postgres`,
  `docker compose up -d --wait wp3-postgres`). For Qdrant and TEI, set
  `QDRANT_URL`, `QDRANT_COLLECTION`, `EMBEDDING_URL`, `EMBEDDING_MODEL`,
  `EMBEDDING_MODEL_ID`, `EMBEDDING_DIMENSIONS` and `EMBEDDING_API_KEY` and run
  `docker compose --profile vector up -d tei-embedding qdrant`; this project
  does not create or populate the Qdrant collection.
- **APIs and worker.** The `ALM_*` variables (store, policy directory, jobs
  store, OIDC client, identity map, course template, exports directory,
  enrolment secret) are described in
  [role applications, Configuration](docs/architecture/role-applications.md#configuration).

## How to run

### Local demo with synthetic data

The whole prototype on one machine, with synthetic model responses: no model
key and no network beyond the local containers. The secrets are drawn once into
an environment file that every terminal sources.

```bash
# 1. Once: settings and local secrets, then Keycloak and a seeded state
cat > /tmp/alm-dev.env <<EOF
export ALM_KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -hex 16)
export ALM_KEYCLOAK_DEV_PASSWORD=$(openssl rand -hex 16)
export ALM_OIDC_CLIENT_SECRET=$(openssl rand -hex 24)
export ALM_ENROLMENT_SECRET=$(openssl rand -hex 24)
export ALM_OIDC_ISSUER=http://127.0.0.1:58080/realms/alm-dev
export ALM_IDENTITY_MAP=infra/keycloak/identity-map.dev.json ALM_API_COOKIE_SECURE=false
export ALM_STORE=/tmp/alm-seed/alm.sqlite ALM_POLICY_DIR=/tmp/alm-seed/policies
export ALM_JOBS_STORE=/tmp/alm-seed/jobs.sqlite ALM_AIMPRO_EXPORTS=/tmp/alm-seed/exports
export ALM_COURSE_TEMPLATE=/tmp/alm-seed/course-template.json
EOF
source /tmp/alm-dev.env
docker compose -f compose.identity.yml up -d --wait   # users dev-admin, dev-learner, dev-assessor, dev-unmapped
python -m tests.seed --output /tmp/alm-seed            # contexts, a project, proposals, a release, two deliveries
mkdir -p /tmp/alm-seed/exports
echo '{"format": 1, "creators": ["admin"], "source_scopes": {"wp3": ["wp3"]}}' > /tmp/alm-seed/course-template.json

# Each block below in its own terminal, from the repository root:
#   source .venv/bin/activate && source /tmp/alm-dev.env

# 2. Authoring API, and the synthetic job worker in another terminal
ALM_OIDC_CLIENT_ID=alm-authoring-api ALM_OIDC_REDIRECT_URI=http://127.0.0.1:58000/auth/callback \
  ALM_OIDC_POST_LOGOUT_REDIRECT_URI=http://127.0.0.1:58000/ \
  python -m services.authoring_api --port 58001
python -m tests.synthetic_worker --poll 1

# 3. Studio: http://127.0.0.1:58000/studio/
cd apps && npm run dev --workspace @alm/studio

# 4. Learner API, and the learner app in another terminal: http://127.0.0.1:58003/learn/
ALM_OIDC_CLIENT_ID=alm-learner-api ALM_OIDC_REDIRECT_URI=http://127.0.0.1:58003/auth/callback \
  ALM_OIDC_POST_LOGOUT_REDIRECT_URI=http://127.0.0.1:58003/ \
  python -m services.learner_api --port 58002
cd apps && npm run dev --workspace @alm/learner
```

Sign in to the studio as `dev-admin` with the password in
`ALM_KEYCLOAK_DEV_PASSWORD`. Both APIs read the same `ALM_ENROLMENT_SECRET`, so
course codes match. The step
by step checks are in
[role applications, Local identity smoke test](docs/architecture/role-applications.md#local-identity-smoke-test).
Stop Keycloak with `docker compose -f compose.identity.yml down`.

| Port | Service |
| --- | --- |
| 58000 | Studio (forwards API paths to 58001) |
| 58001 | Authoring API |
| 58002 | Learner API |
| 58003 | Learner app (forwards API paths to 58002) |
| 58080 | Keycloak |
| 55433 | ALM PostgreSQL (`compose.alm.yml`, optional) |
| 3000 | Langfuse (optional) |

### With real agents

Replace the synthetic worker with the production worker, the only process that
loads model credentials:

```bash
python -m services.jobs --poll 1
```

It reads the keys from `.env` and the profiles from `model.properties`. Live
runs call a model provider and may cost money; in this project they need the
owner's explicit authorization. Prefer `LANGFUSE_ENABLED=false` unless tracing
is wanted. The [SE-AI case study](examples/se-ai/README.md) (`examples/se-ai/stack.sh`)
runs the whole flow on a new empty state.

### Command line

The `learning` CLI runs every lifecycle operation for a trusted local operator
(it does not authenticate anyone):

```bash
python -m learning --db <store> --policy <policy.json> --subject <subject> --context <context> <command>
python -m learning --help
```

| Commands | Purpose | Guide |
| --- | --- | --- |
| `bootstrap`, `show`, `propose`, `decide`, `apply`, `abandon` | Contexts, proposals and human decisions | [authoring lifecycle](docs/architecture/authoring-lifecycle.md) |
| `discover-` / `prepare-aimpro-syllabus-sources`, `generate-`, `revise-`, `edit-`, `show-aimpro-syllabus` | Sources and the Curator syllabus | [Curator workflow](docs/aimpro/curator-syllabus.md), [selected sources](docs/aimpro/selected-sources.md) |
| `init-`, `revise-`, `show-authoring-project`, `show-project-syllabus`, `propose-completion-rules` | Authoring projects | [projects](docs/architecture/authoring-projects.md) |
| `generate-project-assessments`, `-teacher`, `-trainer` | Evaluator, Teacher and Trainer drafts | [generators](docs/architecture/authoring-generators.md) |
| `propose-release`, `show-release`, `propose-delivery-import`, `propose-activation` | Release and delivery | [releases](docs/architecture/releases.md) |
| `propose-membership`, `propose-evaluation`, `ask`, `submit` | Members, evaluations and learner requests | [role applications](docs/architecture/role-applications.md) |
| `export-aimpro-trace` | Read-only AIM-PRO execution trace | [execution trace](docs/aimpro/execution-trace.md) |

AIM-PRO inspection tools need no store: `python -m aimpro.audit`,
`python -m aimpro.adapter`, `python -m aimpro.validation` and
`python -m aimpro.change_requests` (see the
[SCN01 integration review](docs/aimpro/scn01-conceptual-review.md)).

## Testing

All automated tests use synthetic data and make no model call.

```bash
# Python suite (telemetry off)
LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true CREWAI_TRACING_ENABLED=false \
  python -m unittest discover -q

# Contract and evaluation checks
python -m aimpro.generate --check
python -m services.api_common.openapi --check
python -m evaluation --check

# Front-end (in apps/)
npm run check:client && npm run typecheck && npm test && npm run build && npm run check:bundle
```

- **PostgreSQL variants** run when `ALM_TEST_POSTGRES_URL` points to the
  database of `compose.alm.yml`; otherwise they are skipped.
- **Browser tests** (`npm run test:browser` in `apps/`) need Keycloak and free
  ports 58000–58003; see
  [role applications, Browser tests](docs/architecture/role-applications.md#browser-tests).
- **Live smoke test**: `python smoke.py --runs 1` calls the free OpenRouter
  model through MCP with mock search; it is a live run.

CI (`.github/workflows/aimpro-contracts.yml`) runs these checks on every push
and pull request: generated contracts, authoring architecture, store backends
on PostgreSQL 17, API, front-end, browser tests and the offline evaluation.

## Data and storage

- The ALM store is the SQLite file or PostgreSQL URL given with `--db` or
  `ALM_STORE`; there is no default. The APIs never create a SQLite store; the
  CLI `bootstrap` and the seed do.
- Opening an older store migrates it in place: version 1 is first copied to a
  private `.v1.bak` file; version 2 becomes version 3 (enrolment codes) with
  every row kept. Older code then refuses the store. Stop other writers first.
- `python -m learning.copy_store --from <sqlite> --to <postgresql-url>` copies
  a store to PostgreSQL and verifies counts and hashes.
- `docker compose down` keeps volumes; **`docker compose down -v` deletes**
  them: the WP3 database, Qdrant data and the model cache.
- Legacy specialization names are not migrated automatically: `teacher` →
  `lesson-explainer`, `trainer` → `guided-practice-coach`, `socratic` →
  `reasoning-questioner`; `curator` → `lesson-support-summarizer` (LEARNING) or
  `resource-candidate-researcher` (PREPARATION); `evaluator` →
  `learner-response-evaluator` (LEARNING) or `assessment-designer`
  (PREPARATION). Change them through a reviewed proposal.

## How to contribute

1. **Read [AGENTS.md](AGENTS.md).** Code, comments, prompts, tests, docs,
   issues, pull requests and commit messages are in English.
2. **Work from an issue.** Roadmap work follows the
   [working protocol](docs/plans/prototype-roadmap.md#working-protocol-for-every-chat):
   one step per issue, acceptance agreed first, open decisions left to the
   repository owner.
3. **Branch from `main`** and open one focused pull request; do not push to
   `main`.
4. **Contracts and tests first**, then the implementation. Regenerate
   generated artifacts (see [Installation and build](#installation-and-build))
   and commit them with the change.
5. **Run the checks** of [Testing](#testing) before opening the PR; CI must be
   green before merge.
6. **Record the work.** Each step ends with a handoff in
   `docs/plans/handoffs/` (commands, results, findings, next step).
   Architecture changes update the guides in `docs/architecture/`.

Rules that always apply:

- Never edit an AIM-PRO/jjodel export or the ALM metamodel.
- No live model call in tests; live runs only with the owner's authorization.
- Model output and retrieved documents are untrusted data, never instructions;
  only fixed application text may reach an error message or a log.
- Every visible UI string goes in the JSON catalogues
  (`apps/*/src/i18n/en.json`); layout and visual design changes are agreed with
  the layout owner (see the
  [front-office guide](docs/guides/front-office-guide.it.md), in Italian).

## Security and data protection

- Synthetic data only: no learner personal data in the repository, the tests or
  the demo.
- Keys and passwords stay in `.env` or the environment, never in the
  repository.
- The CLI `--subject` selects a person without authenticating them: protect
  the policy files and the store at the host level.
- Authority comes from the trusted policy and participant records, never from
  an identity-provider role.
- Tracing redacts LEARNING content and pseudonymizes subjects; do not use
  Langfuse Cloud with real data (see [observability](docs/observability.md)).

## Documentation

| Topic | Document |
| --- | --- |
| Processes, APIs, identity, studio, learner app | [docs/architecture/role-applications.md](docs/architecture/role-applications.md) |
| Agentic-network decisions | [docs/architecture/agentic-network-decisions.md](docs/architecture/agentic-network-decisions.md) |
| ALM conceptual model and metamodel | [docs/architecture/alm-model.md](docs/architecture/alm-model.md), [metamodel 1.0.0](docs/resources/metamodello-agnostico-apprendimento.json) |
| Authoring lifecycle, projects, generators | [lifecycle](docs/architecture/authoring-lifecycle.md), [projects](docs/architecture/authoring-projects.md), [generators](docs/architecture/authoring-generators.md) |
| Release, import and activation | [docs/architecture/releases.md](docs/architecture/releases.md) |
| Event log, Langfuse | [docs/architecture/event-log.md](docs/architecture/event-log.md), [docs/observability.md](docs/observability.md) |
| Evaluation suite | [docs/evaluation.md](docs/evaluation.md) |
| WP3 source corpus | [docs/wp3/integration.md](docs/wp3/integration.md) |
| AIM-PRO integration | [SCN01 review](docs/aimpro/scn01-conceptual-review.md), [change requests](docs/aimpro/metamodel-change-requests.md), [convergence proposal](docs/aimpro/alm-convergence-proposal.md) |
| Roadmap and plans | [roadmap](docs/plans/prototype-roadmap.md), [role-applications plan](docs/plans/role-applications-plan.md), [handoffs](docs/plans/handoffs/) |
| Changing the look of the web apps (Italian) | [docs/guides/front-office-guide.it.md](docs/guides/front-office-guide.it.md) |
| Demo and case studies | [SCN01 runbook](docs/demo/scn01-colleague-runbook.md), [SE-AI case study](examples/se-ai/README.md) |
| Domain specification | [docs/resources/2026-10-27-specifica.md](docs/resources/2026-10-27-specifica.md) |

## License

The repository has no license file yet, so no license is granted. Ask the
repository owner before reusing the code or the documents.
