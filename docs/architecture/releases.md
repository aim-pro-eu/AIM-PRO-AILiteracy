# Production releases, delivery imports and activation

`learning/releases.py` turns the release and delivery design of the
[authoring lifecycle](authoring-lifecycle.md#release-delivery-and-history) into
four production ALM commands (R1, issue #71). It works over the existing Resource,
DomainModel, ResourceBinding, PolicySet and proposal/decision/application
records. It changes no metamodel, schema, AIM-PRO type or source export.

The commands only propose or inspect. Every decision and every application uses
the existing `decide` and `apply`. No command calls a model, a retrieval service
or the network.

| Command | Context | Result |
| --- | --- | --- |
| `propose-release` | authoring, PREPARATION/DRAFT | pending proposal: release Resource, release catalogue, updated authoring context |
| `show-release` | authoring | receipts, exact frozen closure and findings; no writes |
| `propose-delivery-import` | a separate, empty destination in PREPARATION/DRAFT | pending proposal: frozen definitions, runtime model, bindings, policy revision; plus a trusted-policy preview |
| `propose-activation` | the destination after an applied import | pending proposal that changes only mode/status to LEARNING/ACTIVE |
| `propose-evaluation` | an active delivery, by an assessor | pending proposal of one `Evaluation` of an observed attempt, drafted by the runtime assessor (S11) |

## Owner decisions applied

The owner decided D1–D5 on 8 November 2026 (#71).

- **D2.** The release manifest stays `authoring-release` format 1.
  `show-release` lists the exact domain closure.
- **D3.** Destination permissions use the policy-preview pattern. The import
  proposes a new trusted policy and never replaces the current one. The operator
  installs the exact approved file before activation.
- **D4 = option a.** An import keeps the ASSESS activities of the frozen design.
  `propose-activation` is refused with the finding `RELEASE_RUNTIME_ROLE` while
  any activity has no configured runtime role. The owner lifted the ASSESS case
  on 16 November 2026 (S11, #129, option A): an import configures the EVALUATOR
  runtime worker `learner-response-evaluator`, which drafts the evaluations an
  assessor requests (see "Runtime assessor" below).

## Identities

| Record | Identity | Version |
| --- | --- | --- |
| Release Resource | `authoring-release:` + SHA-256 of (authoring context, project id) | new per release |
| Release catalogue | release identity + `:catalogue`; it lists every release of the project | same as the release |
| Delivery runtime model | `authoring-delivery:` + SHA-256 of (destination, release id, release version) | new |
| Runtime workers and bindings | prefixed by the runtime model identity | new |

The release content is the canonical JSON of the `ReleaseManifest`. Its
`derivedFrom` is the exact project Resource. A later release of the same project
gets a new version and a new catalogue revision; earlier releases stay listed and
unchanged.

## Authority

Each command requires `read` and `propose`, plus ADMINISTRATOR or
CONTENT_RESPONSIBLE in both the trusted policy and the recorded participant.
An import requires that authority in both the authoring and the destination
context, loaded under the same installed policy. The import also proposes a
PolicySet revision, so its decision needs an ADMINISTRATOR reviewer. `--subject`
is a trusted local operator selection, not remote authentication.

## CLI workflow

Placeholders stand for complete EntityRef JSON values (`type`, `id`, `version`);
`latest` is always refused.

```bash
# 1. Propose a release of the current, fully approved project selection.
.venv/bin/python -m learning --db state.sqlite --policy policy.json --subject author \
  --context authoring propose-release --project '<project Resource ref>' \
  --domain '<project DomainModel ref>' --base-context '<authoring context ref>' \
  --request-id release-01
# 2. Review and apply it with the existing commands (decide asks for CONFIRM).
.venv/bin/python -m learning ... --context authoring decide '<proposal ref>' APPROVE --reason '...'
.venv/bin/python -m learning ... --context authoring apply '<proposal ref>' --operation-id release-01
# 3. Inspect the applied release.
.venv/bin/python -m learning ... --context authoring show-release '<release Resource ref>'
# 4. Propose the import into a separate delivery context.
.venv/bin/python -m learning ... --context delivery-01 propose-delivery-import import.json \
  --request-id import-01 --policy-preview delivery-01-policy.json
# 5. Review and apply the import in the destination, then install the preview file.
# 6. With the installed preview, propose activation; then decide and apply it.
.venv/bin/python -m learning --db state.sqlite --policy delivery-01-policy.json ... \
  --context delivery-01 propose-activation --base-context '<delivery context ref>' --request-id activate-01
```

The import bundle is a `DeliveryImport` record:

```json
{
  "release": {"type": "Resource", "id": "authoring-release:…", "version": "…"},
  "authoring_context": "authoring",
  "base_context": {"type": "ExecutionContext", "id": "delivery-01", "version": "…"},
  "scope_name": "delivery-01-learning",
  "bindings": [{
    "requirement": {"type": "ResourceRequirement", "id": "…", "version": "…"},
    "resource": {"type": "Resource", "id": "…", "version": "…"},
    "usage_scope": "delivery-01-learning"}],
  "completion_handlers": [{"rule": {"type": "RuleDefinition", "id": "…", "version": "…"},
                           "handler": "all_completed"}]
}
```

`--policy-preview` must name a new file in an existing directory. The CLI never
writes the current policy file. A refused activation exits with status 2 and
prints its findings as JSON on standard error.

Each context keeps its own trusted policy (owner decision of 16 November 2026,
issue #123). When the authoring context has another policy than the delivery
context, step 4 and the application of the import (step 5) also need it:
`--other-policy authoring-policy.json` (repeatable). Without it, only the
`--policy` file is known, which works when one policy covers both contexts.

## What each command checks

### `propose-release`

One `BEGIN IMMEDIATE` transaction holds authorization, the base check, request
reservation, `prepare_release` and the atomic proposal. The project must be the
current catalogue selection. `prepare_release` refuses:

- a missing required kind, a missing or stale dependency;
- an invalid project or artifact receipt;
- a domain outside this context's snapshot, a domain without the selected
  definitions, or one not reviewed with this project revision.

An identical request replays its recorded result, also after application. A
different command under the same request id is refused (`StateConflict`). The
command never approves, applies or activates anything.

### `show-release`

One read transaction, no writes. It reports:

- the receipts (proposal, decision, StateChange) of the release, the project and
  every artifact, checked against current reviewer authority;
- the sorted exact closure of the release domain;
- findings: `RELEASE_UNAPPROVED`, `RELEASE_PROJECT_RECEIPT`,
  `RELEASE_ARTIFACT_RECEIPT`, `RELEASE_DOMAIN_UNREVIEWED`, `RELEASE_PIN_MISMATCH`,
  `RELEASE_EXECUTION_STATE`, `RELEASE_CLOSURE` and stale-dependency findings.
- when there is no finding, what an import binds: each requirement of the
  frozen design with the exact resource the release pins for it (or none) and
  its title, and the completion rules of the design's parts.

A Lead ACCEPT is never a receipt: only an applied human decision is. Later
authoring revisions leave the output unchanged. A release that was never applied
is not stored and is reported as not applied.

### `propose-delivery-import`

It refuses a destination that already holds learner history (occurrences,
evidence, states or evaluations) or any configuration ("requires a reviewed
migration"). It reads the authoring context with that context's own installed
trusted policy: the subject must be authorized by the destination's policy and
by the authoring context's, and an authoring policy that is not installed
refuses the import. It then reads the release through `released_entities`,
which rechecks every receipt and that the manifest pins match the reviewed
project. Application rechecks the same, with both policies as installed then.

The proposal holds:

- the frozen closure, unchanged (the store also refuses a different payload for
  an existing id and version);
- the release Resource and a runtime DomainModel that pins it;
- Teacher, Trainer and Evaluator worker specializations (`lesson-explainer`,
  `guided-practice-coach`, `learner-response-evaluator`) for the EXPLAIN,
  PRACTICE and ASSESS activities of the design, limited to the new scope; each
  agent file must still match the runtime profile (category, `search_documents`
  only, no skill);
- one ResourceBinding per selection, with a pending review key;
- a PolicySet revision that embeds the full policy preview;
- the destination context, pinned to the frozen domain and design and still
  PREPARATION/DRAFT.

Each binding selection must name a requirement of the frozen design, the exact
resource version that the released generated packages pin for it, and the new
scope. A binding to a resource that is not a generated material must be a WP3
catalogue resource: its `resource_key(id, version)` must appear in its
provenance. The policy preview adds the new scope (destination participants,
design activities, exact bound resource keys, no sources) and the explicit
completion handlers. A handler must bind a completion rule of the frozen design
that the current policy does not already bind.

The import explanation cites the receipts of the release, the project and every
artifact. Authoring approval grants no destination use. The bindings become
approved only through the destination's own decision on the import.

### `propose-activation`

The command first refuses with `RELEASE_POLICY_NOT_INSTALLED` when the installed
policy version differs from the context policy. It then collects every blocking
finding and refuses (`ActivationRefused`) unless none remains:

| Finding | Condition |
| --- | --- |
| `RELEASE_IMPORT_UNAPPLIED` | no valid applied import receipt in the destination |
| `RELEASE_PIN_MISMATCH` | the context no longer pins the frozen domain and design |
| `RELEASE_LEARNER_HISTORY` | the destination holds learner history |
| `RELEASE_POLICY_NOT_INSTALLED` | the installed policy differs from the reviewed preview |
| readiness `R05`–`R08` | `advance` readiness fails, e.g. a missing or unapproved binding or a missing completion rule |
| `RELEASE_COMPLETION_HANDLER` | a completion rule has no handler in the installed policy |
| `RELEASE_RUNTIME_ROLE` | an activity intent has no runtime role in the delivery (an import configures Teacher, Trainer and Evaluator) |

A refused request reserves nothing. A successful one proposes only
LEARNING/ACTIVE; the human decision and the application stay separate.

## Reserved rules

Generic `propose` refuses, and `apply` refuses again under its final write lock:

- creating or changing a release Resource, recognized by identity or by
  `authoring-release` content, and changing a release catalogue entry;
- adding another context's project domain to a context's models, which would
  import release definitions outside `propose-delivery-import`;
- changing models, design, policy, bindings, mode or status of an imported
  delivery, including a generic activation.

At application, a reserved change must come from a proposal recorded by the
matching command. The release, import or activation conditions are then
rechecked: release receipts and the current project selection; import receipts,
the unchanged frozen definitions and the empty learner history; or the full set of
activation findings. The context compare-and-swap still refuses any changed base.

## Runtime assessor (S11)

Owner decisions of 16 November 2026 (#129). A subject who may `propose` and
holds `ASSESSOR` (in the policy and in its participant record) starts a draft on
one observed attempt (`LearningEvidence`) of an ASSESS activity of an ACTIVE
delivery, choosing FORMATIVE or FORMAL:

```bash
python -m learning --db alm.sqlite --policy delivery-policy.json --subject assessor --context delivery \
  propose-evaluation --evidence '<LearningEvidence EntityRef JSON>' --mode FORMATIVE --request-id draft-1
```

The API runs the same command as the agent job `propose-evaluation` (module
`jobs`); a subject without `ASSESSOR` is refused when the job is queued.

1. One write transaction holds authorization, the input checks and the request
   reservation, before any model client is built. An identical request replays
   its recorded result without a model call; another command under the same
   request id is a `StateConflict`.
2. `learner-response-evaluator` (`learning/evaluation.py`, built by
   `main.build_runtime_assessor` with no tool) receives the activity, the
   outcomes, the assessment and its rubric, and the learner's response; never
   the learner's identity. Its answer, `EvaluationDraft`, is untrusted data: one
   judgment per rubric criterion (a level key, or none for an explicit unknown,
   a reason and evidence refs) and the result text, nothing else.
3. Control builds the `Evaluation`: context, evidence, specification, mode,
   `assistedBy` (the delivery's EVALUATOR specialization) and review key come
   from the request. `validate_evaluation` checks it. A draft that fails, or a
   response that is not a draft, goes back to the agent with the fixed reason, at
   most three drafts; then the request fails in fixed words, never with model
   text.
4. A second write transaction rechecks the reservation, the authority and the
   inputs, and records the evaluation as a proposal under the requester's
   subject.

A person with assessment authority (`ASSESSOR` or `ADMINISTRATOR`) decides and
applies it, the requester included. A learning state follows only from the
applied evaluation, as `derive_learning_state` defines: FORMAL reaches VERIFIED
only with the outcome's verification rule. A learner cannot start a draft, and a
learner request still cannot persist an `Evaluation`.

## Completion rules and SCN01

The dedicated generators never infer completion rules. A frozen release can only
carry them through an explicit, reviewed project revision of the composite
design. The acceptance tests author such rules this way before releasing.

A read-only check on a copy of the applied SCN01 database (8 November) found the
approved design with 5 process nodes, none with a completion rule, and 4 ASSESS
activities. An SCN01 delivery would then have been refused for two reasons: the
missing completion rules and D4. S11 lifted D4; the missing completion rules
remain. Nothing in R1 changes that design.

## Verification

```bash
.venv/bin/python -m unittest tests.test_releases tests.test_authoring_cycle tests.test_authoring_projects -v
LANGFUSE_ENABLED=false CREWAI_DISABLE_TELEMETRY=true CREWAI_TRACING_ENABLED=false .venv/bin/python -m unittest discover -q
.venv/bin/python -m aimpro.generate --check
```

`tests/test_releases.py` uses temporary SQLite. It blocks sockets, DNS, `crewai.LLM`
and `LLMFactory` calls, and makes agent construction fail. Its synthetic project
comes from the production generators with synthetic model responses. The
acceptance cycle in `tests/test_authoring_cycle.py` runs release, import,
activation and the assessor's evaluation draft through these commands; only the
model responses are synthetic. `tests/test_runtime_assessor.py` covers the
runtime assessor.

## Not covered

R1 does no AIM-PRO or jjodel export, learner enrolment, migration of an active
delivery or web review surface (the runtime assessor came with S11, course
membership with D25, the studio views with S10 and S11). No real SCN01 release,
import, binding or activation is part of it; each needs its own owner decision
(D7).
