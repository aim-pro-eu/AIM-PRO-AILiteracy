"""The dev-only synthetic seed (D15) builds its state through the production commands."""

from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from learning.contracts import EntityRef
from learning.decisions import proposal_candidates
from learning.metamodel import load_contract
from learning.policies import TrustedPolicy
from learning.service import LearningService
from learning.store import LearningStore
from tests.authoring_cycle_fixtures import AUTH, DELIVERY, DELIVERY_TWO, trusted_policy
from tests.seed import SYNTHETIC_ATTEMPT, SeedManifest, build_seed, main, record_attempt, seed_policy
from tests.services.job_fixtures import activate_delivery
from tests.store_backends import block_network, new_store_location, on_both_backends, sqlite_only


NO_NETWORK = 'The synthetic seed uses no model, provider or network'


@on_both_backends
class SeedTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.location = new_store_location(self, temp.name, 'seed.sqlite')
        self.output = self.root / 'seed'

    def test_seed_builds_contexts_project_proposals_and_release(self):
        manifest = build_seed(self.output, self.location)
        self.assertEqual(SeedManifest.model_validate_json((self.output / 'seed.json').read_bytes()), manifest)
        self.assertEqual((manifest.authoring_context, manifest.delivery_context, manifest.pending_delivery_context),
                         (AUTH, DELIVERY, DELIVERY_TWO))
        self.assertEqual((manifest.staff, manifest.learner, manifest.second_learner, manifest.project_id),
                         ('admin', 'learner', 'learner-2', 'synthetic-course'))
        installed = sorted((self.output / manifest.policy_dir).iterdir())
        self.assertEqual([p.name for p in installed], ['architecture-policy-1.json'])
        self.assertEqual(TrustedPolicy.model_validate_json(installed[0].read_bytes()), seed_policy())
        # The seed's policy is the test policy with a second learner granted as the first one (S12).
        self.assertEqual(seed_policy().subjects['learner-2'], trusted_policy().subjects['learner'])
        self.assertEqual({k: v for k, v in seed_policy().subjects.items() if k != 'learner-2'}, trusted_policy().subjects)
        self.assertEqual(seed_policy().policy_ref, trusted_policy().policy_ref)
        preview = TrustedPolicy.model_validate_json((self.output / manifest.delivery_policy_preview).read_bytes())
        self.assertEqual(preview.policy_ref, manifest.delivery_policy)
        self.assertNotEqual(preview.policy_ref, trusted_policy().policy_ref)
        self.assertFalse((self.output / manifest.delivery_policy_preview).is_relative_to(self.output / manifest.policy_dir))

        with LearningStore(self.location) as store:
            service = LearningService(store, load_contract(), trusted_policy(), Mock())
            for context_id in (AUTH, DELIVERY_TWO):
                root = store.read_context(context_id)
                self.assertEqual((root.fields['mode'], root.fields['status']), ('PREPARATION', 'DRAFT'))
                self.assertEqual(root.fields['policies'], trusted_policy().policy_ref.model_dump())
            self.assertEqual(store.read_context(DELIVERY).fields['policies'], manifest.delivery_policy.model_dump())

            applied = [p for p in store.owned(AUTH, 'ChangeProposal') if p.fields['status'] == 'APPLIED']
            self.assertGreaterEqual(len(applied), 7)
            self.assertEqual([p.fields['status'] for p in store.owned(DELIVERY, 'ChangeProposal')], ['APPLIED'])
            inspection = service.inspect_authoring_project(AUTH, 'admin', manifest.project_id)
            self.assertEqual(inspection.project, manifest.project)
            self.assertIsNotNone(inspection.receipt)
            release = service.inspect_release(AUTH, 'admin', manifest.release)
            self.assertIsNotNone(release.receipt)
            self.assertEqual(release.findings, ())

            self.assertEqual(set(manifest.pending_proposals), {AUTH, DELIVERY_TWO})
            for context_id, refs in manifest.pending_proposals.items():
                self.assertEqual(len(refs), 1)
                proposal = store.read(refs[0], owner=context_id)
                self.assertEqual(proposal.fields['status'], 'AWAITING_DECISION')
            evaluator = proposal_candidates(store, store.read(manifest.pending_proposals[AUTH][0], owner=AUTH))
            self.assertIn('ASSESS', {c.fields.get('intent') for c in evaluator if c.type == 'ActivityDefinition'})
            imported = proposal_candidates(store, store.read(manifest.pending_proposals[DELIVERY_TWO][0], owner=DELIVERY_TWO))
            self.assertIn(DELIVERY_TWO, {c.id for c in imported if c.type == 'ExecutionContext'})

    def test_both_deliveries_have_two_synthetic_learners(self):
        manifest = build_seed(self.output, self.location)
        with LearningStore(self.location) as store:
            for context_id in (DELIVERY, DELIVERY_TWO):
                root = store.read_context(context_id)
                participants = {store.read(EntityRef.model_validate(r), owner=context_id).fields['subjectKey']: r
                                for r in root.fields['participants']}
                with self.subTest(context_id):
                    self.assertEqual(set(participants), {manifest.staff, manifest.learner, manifest.second_learner})
                    for learner in (manifest.learner, manifest.second_learner):
                        roles = store.read(EntityRef.model_validate(participants[learner]), owner=context_id).fields['roles']
                        self.assertEqual(roles, ['LEARNER'])

    def test_the_seed_records_a_synthetic_attempt_through_submit_once_the_delivery_is_active(self):
        manifest = build_seed(self.output, self.location)
        # An attempt is learner history, which activation refuses: it is recorded after the activation (S11).
        with self.assertRaisesRegex(ValueError, 'not installed'):
            record_attempt(self.output, self.location)
        delivery = activate_delivery(self.output, self.location, manifest)
        evidence = record_attempt(self.output, self.location)
        self.assertEqual(record_attempt(self.output, self.location), evidence)
        with LearningStore(self.location) as store:
            context = LearningService(store, load_contract(), delivery, Mock())._context(DELIVERY, 'admin')
            observed = context.snapshot.get(evidence)
            activity = context.snapshot.get(observed.fields['activity'])
            learner = context.snapshot.get(observed.fields['learner'])
        self.assertEqual((observed.type, observed.provenance.origin), ('LearningEvidence', 'OBSERVED_EVENT'))
        self.assertEqual((observed.provenance.responsible, learner.fields['subjectKey']), ('learner', 'learner'))
        self.assertEqual(activity.fields['intent'], 'ASSESS')
        self.assertEqual(observed.fields['contentOrLocator'], SYNTHETIC_ATTEMPT)
        # The second learner's attempt is their own, under its own request id.
        second = record_attempt(self.output, self.location, manifest.second_learner)
        self.assertNotEqual(second, evidence)
        self.assertEqual(record_attempt(self.output, self.location, manifest.second_learner), second)
        with LearningStore(self.location) as store:
            learner = store.read(EntityRef.model_validate(store.read(second, owner=DELIVERY).fields['learner']),
                                 owner=DELIVERY)
        self.assertEqual(learner.fields['subjectKey'], 'learner-2')

    @sqlite_only
    def test_command_line_records_the_attempt_in_an_existing_seed(self):
        output, errors = StringIO(), StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            self.assertEqual(main(['--output', str(self.output)]), 0)
            self.assertEqual(main(['--output', str(self.output), '--attempt']), 2)
        self.assertIn('Attempt not recorded', errors.getvalue())
        manifest = SeedManifest.model_validate_json((self.output / 'seed.json').read_bytes())
        activate_delivery(self.output, self.output / 'alm.sqlite', manifest)
        output = StringIO()
        with redirect_stdout(output):
            self.assertEqual(main(['--output', str(self.output), '--attempt']), 0)
        self.assertEqual(json.loads(output.getvalue())['evidence']['type'], 'LearningEvidence')

    def test_output_must_be_new_or_empty(self):
        self.output.mkdir()
        (self.output / 'notes.txt').write_text('keep', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'new or empty'):
            build_seed(self.output, self.location)
        self.assertEqual([p.name for p in self.output.iterdir()], ['notes.txt'])

    @sqlite_only
    def test_command_line_writes_a_new_sqlite_database_and_refuses_to_overwrite(self):
        output, errors = StringIO(), StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            self.assertEqual(main(['--output', str(self.output)]), 0)
            self.assertEqual(main(['--output', str(self.output)]), 2)
        manifest = SeedManifest.model_validate_json((self.output / 'seed.json').read_bytes())
        self.assertEqual(manifest.store, 'alm.sqlite')
        self.assertTrue((self.output / 'alm.sqlite').is_file())
        self.assertEqual(json.loads(output.getvalue())['manifest'], str(self.output / 'seed.json'))
        self.assertIn('Seed not written', errors.getvalue())

    def test_manifest_never_holds_a_database_url(self):
        manifest = build_seed(self.output, self.location)
        self.assertIsNone(manifest.store)
        self.assertNotIn('postgresql', (self.output / 'seed.json').read_text(encoding='utf-8'))
        self.assertIsInstance(manifest.release, EntityRef)


if __name__ == '__main__':
    unittest.main()
