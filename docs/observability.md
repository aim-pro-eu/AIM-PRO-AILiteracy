# Observability: event log and Langfuse tracing

Both are optional and off by default. This guide was moved here from the repository README.

## Structured event log

Set `ALM_EVENT_LOG=<path>.jsonl` to record a content-free event for each plan,
model call, retrieval, review and step outcome of a learning request. Run
`python -m agent_system.metrics <path>.jsonl` to derive model calls, rejection
rates, token usage and latency from that log. See [the event log](architecture/event-log.md).
`python -m evaluation --check` runs the adversarial [evaluation suite](evaluation.md) without model calls.

## Langfuse tracing

Telemetry is disabled by default. When `LANGFUSE_ENABLED` is absent or `false`, the module neither imports Langfuse/OpenInference nor sends data. Dependencies are included in `requirements.txt` so integration tests with an in-memory exporter can also run.

To start observability alone, without Qdrant, TEI or vLLM:

```bash
docker compose -f compose.local.yml --profile observability up -d
```

The main configuration includes the same profile: `docker compose --profile observability up -d` also starts Qdrant and TEI and requires their configuration. The Langfuse stack includes web, worker, Postgres, ClickHouse, Redis and MinIO, with dedicated volumes. Only web (`127.0.0.1:3000`) and MinIO (`127.0.0.1:9090`, for media) expose host ports; it does not occupy TEI/Qdrant ports. Langfuse images follow major version 4 of the upstream configuration: pin validated digests for persistent installations.

### Initial setup and complete test

1. Install dependencies with `.venv/bin/python -m pip install -r requirements.txt` and start the stack with the preceding command.
2. Open <http://127.0.0.1:3000>. There are no default credentials: choose **Sign up** and create an account, organization and project.
3. In the project, open **Settings → API Keys** and create a Public Key (`pk-lf-...`) and Secret Key (`sk-lf-...`) pair. These differ from the login password.
4. Create a key in [OpenRouter API settings](https://openrouter.ai/settings/keys).
5. Run `openssl rand -hex 32`: copy the result into `LANGFUSE_HASH_SALT`. This value is generated locally, not provided by Langfuse.
6. Create or update `.env` in the repository root with actual values replacing the placeholders:

```dotenv
OPENROUTER_API_KEY=your-openrouter-key
SEARCH_BACKEND=mock
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://127.0.0.1:3000
LANGFUSE_HASH_SALT=your-openssl-result
LANGFUSE_SYNTHETIC_DATA_ONLY=true
```

The preceding block is for testing with synthetic fixtures. Keep `.env` local: do not commit keys or passwords. For a persistent installation, also use private random values for `LF_NEXTAUTH_SECRET`, `LF_SALT`, `LF_ENCRYPTION_KEY` (64 hexadecimal digits), `LF_POSTGRES_PASSWORD`, `LF_CLICKHOUSE_PASSWORD`, `LF_REDIS_PASSWORD` and `LF_MINIO_PASSWORD` (at least 8 characters). Compose defaults are exclusively for local tests with synthetic data. Keep the salt stable to correlate the same person; changing it changes pseudonymous identifiers.

Each `Orchestrator.run` produces a `learning.request` root, grouped by ExecutionContext, with request and response. Beneath the root are Lead generations, plan authorization, steps, client-side MCP search, worker calls, semantic reviews and deterministic checks. OpenInference CrewAI and OpenAI spans nest inside current observations. The OpenAI instrumentor captures prompts, completions, model and tokens, including native streaming OpenRouter calls; structured conversion calls and additional attempts remain visible as separate calls. Span duration measures latency. Monetary costs depend on the model pricing catalog/configuration in Langfuse; the prototype does not estimate them.

Semantic outcomes are categorical scores `ACCEPT` / `REJECT` / `UNCERTAIN`; checks and steps also record `SUCCEEDED` / `FAILED` / `SKIPPED`. The trace includes request ID, metamodel version and fingerprint, per-agent profiles, roles, modes and Git commit. The `python -m learning`, `main.py` and `smoke.py` programs flush the queue before exiting, including on error.

7. Check the configuration, run tests and test the free model. Smoke uses synthetic documents through MCP and requires neither Qdrant nor TEI:

```bash
docker compose -f compose.local.yml --profile observability config --quiet
.venv/bin/python -m unittest tests.test_telemetry -v
LANGFUSE_ENABLED=false .venv/bin/python -m unittest discover -q
.venv/bin/python smoke.py --runs 1
```

8. Wait for `PASS 1/1`: the live test may take a few minutes. Return to the Langfuse project, open **Tracing** and refresh the list. Open the latest `learning.request`: it must contain `lead.call`, `authorize_plan`, a step with `document_search` and `worker.call`, `semantic_review` reviews, synthesis and `check_final_response`. OpenAI/OpenRouter calls show model, tokens and duration; outcomes are visible as scores.

### Diagnosing a failed test

- If no trace appears, check `LANGFUSE_ENABLED=true`, the local endpoint and a key pair from the same project. The process sends observations before exiting.
- `Plan rejected (ValueError)` means checks blocked the plan before task execution: open `authorize_plan` in the trace and read `status_message` and the input plan. `step.agent` is the worker name (`lesson-explainer`); `specialization` is the exact reference with `type: AgentSpecialization`, `id: teacher-demo`, `version: 1` in the smoke fixture. They are not interchangeable.
- If a worker is rejected, read the verdict and reason in `semantic_review` (stage `WORKER`) and codes in `check_worker_output`. Semantic rejection produces a failure outcome even if the model returned text.
- The `app.crewai.com` link belongs to CrewAI's native collector, separate from Langfuse. The prototype disables it; use your local instance to inspect traces.
- The test uses a free model and does not switch to a paid model on errors or unavailability. A successful test verifies integration on synthetic fixtures; it does not guarantee every future generation's outcome.

### Data and retention

Do not use Langfuse Cloud with real data. To also view LEARNING fixture content in smoke, set `LANGFUSE_SYNTHETIC_DATA_ONLY=true`: this declaration disables LEARNING content redaction while retaining pseudonymization. Endpoints under `*.langfuse.com` require explicit `LANGFUSE_SYNTHETIC_DATA_ONLY=true`, to be set only for synthetic fixtures. For real data, use the project's instance. `subject_key` becomes an HMAC SHA-256 with a private salt; masking also covers identities embedded in prompts. In LEARNING mode, all input/output content is conservatively redacted, including automatically captured messages, to prevent learner instructions and evidence from resurfacing through prompts or synthesis. Structure, outcomes, check codes and token metrics remain available. PREPARATION retains content for debugging: do not include unnecessary personal data.

The intended retention window is 30 days. Native automatic deletion requires Langfuse Self Hosted Enterprise: configure the license and `Project Settings → Data Retention = 30`. Headless provisioning supports `LANGFUSE_INIT_ORG_ID/NAME`, `LANGFUSE_INIT_PROJECT_ID/NAME`, `LANGFUSE_INIT_USER_EMAIL/PASSWORD` and project keys: `LANGFUSE_INIT_PROJECT_RETENTION` receives `LANGFUSE_RETENTION_DAYS` (default 30). It does not modify existing projects. Without a license, native retention does not activate: provide an administrative deletion procedure and verify it before collecting real data. `down` preserves data; volume deletion is irreversible and must be planned separately.

References: [CrewAI integration](https://langfuse.com/integrations/frameworks/crewai), [span masking](https://langfuse.com/docs/observability/features/masking), [Compose installation](https://langfuse.com/self-hosting/deployment/docker-compose), [retention and licensing requirements](https://langfuse.com/docs/administration/data-retention).

The prototype disables CrewAI's native cloud collector and stores negative consent in its own `.cache/crewai`, without changing the user's global preferences. Application traces remain directed only to the configured Langfuse endpoint. In the plan, `step.agent` must be the worker's `registryName` (e.g. `lesson-explainer`); `specialization` is the exact `AgentSpecialization` reference (e.g. `teacher-demo`). The prompt explicitly presents authorized pairs; validation continues to reject incorrect references.
