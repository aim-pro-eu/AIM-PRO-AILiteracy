"""Dev-only synthetic seed (D15): an ALM database built through the production commands.

Only model and retrieval responses are synthetic, the fixtures of
``tests/authoring_cycle_fixtures.py``; every record is written by
``LearningService`` exactly as the CLI would write it. No model, provider or
network is used. The result serves API tests, UI development and browser tests;
it holds no real learner or organisation data.

    python -m tests.seed --output DIR [--db LOCATION]

``DIR`` must be new or empty. It receives:

- ``alm.sqlite`` unless ``--db`` names another store (a PostgreSQL URL is never
  written to disk);
- ``policies/``: the installed trusted policy, for ``ALM_POLICY_DIR`` (D10);
- ``policy-previews/``: the delivery import's policy preview, not installed, so
  the imported delivery context is unavailable until an operator copies it into
  ``policies/``;
- ``seed.json``: the contexts, subjects and exact references below.

    python -m tests.seed --output DIR --attempt [--db LOCATION]

records the learner's synthetic attempt at the assessment of the seed's
delivery, through ``submit`` (S11). An attempt is learner history, which
activation refuses: it is a separate step, once an operator has installed the
delivery's policy and the delivery is active. The same attempt is recorded once.

State: the authoring context holds an approved and applied syllabus, project,
assessment, teacher and trainer content, completion rules and release, plus a
pending Evaluator revision. The delivery context holds the applied import of
that release. The second delivery context holds a pending import and has the
learner as a participant.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Literal

from learning.contracts import EntityRef, Record, Text


SEED_FORMAT = 1
STAFF, LEARNER = 'admin', 'learner'
POLICY_DIR, PREVIEW_DIR, MANIFEST, DATABASE = 'policies', 'policy-previews', 'seed.json', 'alm.sqlite'
ATTEMPT_REQUEST = 'seed-attempt-1'
SYNTHETIC_ATTEMPT = ('Synthetic attempt: write a polite reminder to fictional Alex about EXAMPLE-01. '
                     'The fictional audience supplies context; the polite tone constrains the response.')
# The seed runs no model, but the generators import agent code: vendor telemetry stays off.
TELEMETRY_OFF = {'LANGFUSE_ENABLED': 'false', 'CREWAI_DISABLE_TELEMETRY': 'true', 'CREWAI_TRACING_ENABLED': 'false'}


class SeedManifest(Record):
    format: Literal[1]
    store: Text | None
    policy_dir: Text
    delivery_policy_preview: Text
    authoring_context: Text
    delivery_context: Text
    pending_delivery_context: Text
    staff: Text
    learner: Text
    project_id: Text
    project: EntityRef
    release: EntityRef
    delivery_policy: EntityRef
    pending_proposals: dict[Text, tuple[EntityRef, ...]]


def _write_json(path: Path, text: str) -> None:
    with path.open('x', encoding='utf-8') as file:
        file.write(text + '\n')


def build_seed(output: Path, store_location: Path | str | None = None) -> SeedManifest:
    """Build the synthetic state; ``store_location`` defaults to a new ``alm.sqlite`` in ``output``."""
    for name, value in TELEMETRY_OFF.items():
        os.environ.setdefault(name, value)
    from unittest.mock import Mock
    from learning.metamodel import load_contract
    from learning.service import LearningService
    from learning.store import LearningStore
    from tests.authoring_cycle_fixtures import AUTH, DELIVERY, DELIVERY_TWO, ProductionAuthoring, trusted_policy

    output = Path(output)
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError('Choose a new or empty output directory')
    output.mkdir(parents=True, exist_ok=True)
    database = output / DATABASE if store_location is None else store_location
    policy = trusted_policy()
    agents = Mock(side_effect=AssertionError('The seed never builds agents'))
    with LearningStore(database) as store:
        service = LearningService(store, load_contract(), policy, agents)
        for context_id in (AUTH, DELIVERY, DELIVERY_TWO):
            service.bootstrap(context_id, STAFF)
        author = ProductionAuthoring(service)
        author.curator()
        for kind in ('ASSESSMENT', 'TEACHER_CONTENT', 'TRAINER_CONTENT'):
            author.review_and_apply(AUTH, author.generate(kind), 'approve-' + kind)
        author.configure_completion()
        _, release = author.release(approve=True)
        imported = author.delivery_import(release, DELIVERY, 'import-1')
        author.review_and_apply(DELIVERY, store.read(imported.proposal, owner=DELIVERY), 'import-1')
        pending_import = author.delivery_import(release, DELIVERY_TWO, 'import-2')
        pending_evaluator = author.generate('ASSESSMENT', '2')
        project = service.inspect_authoring_project(AUTH, STAFF, 'synthetic-course').project

    (output / POLICY_DIR).mkdir()
    (output / PREVIEW_DIR).mkdir()
    preview = imported.policy_preview
    preview_path = f'{PREVIEW_DIR}/{preview.policy_ref.id}-{preview.policy_ref.version}.json'
    _write_json(output / POLICY_DIR / f'{policy.policy_ref.id}-{policy.policy_ref.version}.json',
                policy.model_dump_json(indent=2))
    _write_json(output / preview_path, preview.model_dump_json(indent=2))
    manifest = SeedManifest(format=SEED_FORMAT, store=DATABASE if store_location is None else None,
        policy_dir=POLICY_DIR, delivery_policy_preview=preview_path, authoring_context=AUTH,
        delivery_context=DELIVERY, pending_delivery_context=DELIVERY_TWO, staff=STAFF, learner=LEARNER,
        project_id='synthetic-course', project=project, release=release.ref, delivery_policy=preview.policy_ref,
        pending_proposals={AUTH: (pending_evaluator.ref,), DELIVERY_TWO: (pending_import.proposal,)})
    _write_json(output / MANIFEST, manifest.model_dump_json(indent=2))
    return manifest


def record_attempt(output: Path, store_location: Path | str | None = None) -> EntityRef:
    """The learner's synthetic attempt at the delivery's assessment, recorded through ``submit``; its evidence."""
    for name, value in TELEMETRY_OFF.items():
        os.environ.setdefault(name, value)
    from unittest.mock import Mock
    from learning.metamodel import load_contract
    from learning.service import LearningService
    from learning.store import LearningStore
    from services.api_common.contexts import PolicyDirectory

    output = Path(output)
    manifest = SeedManifest.model_validate_json((output / MANIFEST).read_bytes())
    if store_location is None and manifest.store is None:
        raise ValueError('Name the store of this seed')
    database = output / manifest.store if store_location is None else store_location
    agents = Mock(side_effect=AssertionError('The seed never builds agents'))
    with LearningStore(database) as store:
        root = store.read_context(manifest.delivery_context)
        policy = PolicyDirectory(output / manifest.policy_dir).find(EntityRef.model_validate(root.fields['policies']))
        if policy is None:
            raise ValueError('The delivery policy is not installed')
        service = LearningService(store, load_contract(), policy, agents)
        context = service._context(manifest.delivery_context, manifest.learner)
        activity = next(e for e in context.snapshot.active_domain()
                        if e.type == 'ActivityDefinition' and e.fields['intent'] == 'ASSESS')
        return service.submit(manifest.delivery_context, manifest.learner, activity.ref, SYNTHETIC_ATTEMPT,
                              ATTEMPT_REQUEST).ref


def main(argv=None):
    parser = argparse.ArgumentParser(description='Build the dev-only synthetic ALM seed (D15)')
    parser.add_argument('--output', type=Path, required=True, help='New or empty directory')
    parser.add_argument('--db', help='Store location instead of OUTPUT/alm.sqlite: a new SQLite file or a postgresql:// URL')
    parser.add_argument('--attempt', action='store_true',
                        help="Record the learner's synthetic attempt in OUTPUT, an existing seed whose delivery is active")
    args = parser.parse_args(argv)
    if args.attempt:
        try:
            evidence = record_attempt(args.output, args.db)
        except (ValueError, OSError) as error:
            print('Attempt not recorded: ' + str(error), file=sys.stderr)
            return 2
        print(json.dumps({'evidence': evidence.model_dump()}))
        return 0
    try:
        build_seed(args.output, args.db)
    except (ValueError, OSError) as error:
        print('Seed not written: ' + str(error), file=sys.stderr)
        return 2
    print(json.dumps({'manifest': str(args.output / MANIFEST)}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
