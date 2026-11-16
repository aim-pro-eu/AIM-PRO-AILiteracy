"""A delivery import and its activation through the API (S10, part 2), as the CLI commands do.

The delivery course is created from the studio (``POST /courses``), so it has a
trusted policy of its own (D23). The import reads the authoring course with the
authoring course's installed policy, and the subject must be authorized by both
(owner decision of 16 November 2026, #123). The studio sends, for each
requirement, the resource the release pins or none. The applied import makes the
course unavailable until an operator installs the reviewed policy preview; the
API never writes it. Activation is then refused with findings, recording nothing.
"""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from learning.contracts import Entity
from learning.releases import ActivationOutcome, ImportProposal, ReleaseInspection
from tests.authoring_cycle_fixtures import AUTH
from tests.seed import build_seed
from tests.services.oidc_fixtures import NO_NETWORK
from tests.services.test_authoring_read_api import resource_path
from tests.services.test_authoring_review_api import ReviewApiCase
from tests.store_backends import block_network, new_store_location, on_both_backends


COURSE = 'studio-delivery'


@on_both_backends
class DeliveryApiTest(ReviewApiCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.location = new_store_location(self, temp.name, 'seed.sqlite')
        self.output = self.root / 'seed'
        self.seed = build_seed(self.output, self.location)
        self.policies = self.output / self.seed.policy_dir
        self.policy_file = self.policies / 'architecture-policy-1.json'
        self.start_api()
        response = self.post(self.staff, '/courses', {'context_id': COURSE})
        self.assertEqual(response.status_code, 200, response.text)

    def inspection(self):
        response = self.staff.get(resource_path(AUTH, self.seed.release, 'release'))
        self.assertEqual(response.status_code, 200, response.text)
        return ReleaseInspection.model_validate(response.json())

    def command(self, request_id='import-1', omit=0):
        """What the studio sends: each requirement with the resource the release pins, the first ``omit`` left out."""
        view = self.inspection()
        context = Entity.model_validate(self.staff.get(f'/contexts/{COURSE}').json()['context'])
        scope = COURSE + ':delivery'
        return {'request_id': request_id, 'release': self.seed.release.model_dump(), 'authoring_context': AUTH,
                'base_context': context.ref.model_dump(), 'scope_name': scope,
                'bindings': [{'requirement': r.requirement.model_dump(), 'resource': r.resource.model_dump(),
                              'usage_scope': scope} for r in view.requirements[omit:]],
                'completion_handlers': [{'rule': r.model_dump(), 'handler': 'all_completed'}
                                        for r in view.completion_rules]}

    def imported(self, command):
        response = self.post(self.staff, f'/contexts/{COURSE}/delivery-imports', command)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        return ImportProposal.model_validate(response.json())

    def activation(self, request_id='activate'):
        context = Entity.model_validate(self.staff.get(f'/contexts/{COURSE}').json()['context'])
        return self.post(self.staff, f'/contexts/{COURSE}/activations',
                         {'request_id': request_id, 'base_context': context.ref.model_dump()})

    # Acceptance (S10, part 2): the import of the selection sent, approved and applied; activation refused in words.
    def test_an_import_is_proposed_applied_installed_and_its_activation_refused(self):
        view = self.inspection()
        self.assertEqual(len(view.requirements), 7)
        self.assertTrue(all(r.resource and r.title for r in view.requirements))
        command = self.command()
        result = self.imported(command)
        self.assertEqual(self.post(self.staff, f'/contexts/{COURSE}/delivery-imports', command).json(),
                         result.model_dump(mode='json'))
        self.assertEqual(result.policy_preview.policy_ref.id, 'course:' + COURSE)
        self.assertEqual(result.policy_preview.scopes[command['scope_name']].contexts, [COURSE])
        self.assertEqual(len(result.bindings), 7)
        # The preview is not installed: the API wrote no policy file.
        before = sorted(p.name for p in self.policies.iterdir())
        pending = {Entity.model_validate(item['proposal']).ref: item['review_payload_key']
                   for item in self.staff.get(f'/contexts/{COURSE}/pending-proposals').json()['proposals']}
        self.ok(self.decide(self.staff, COURSE, result.proposal, pending[result.proposal]))
        self.ok(self.apply(self.staff, COURSE, result.proposal, 'apply-import-1'))
        self.assertEqual(sorted(p.name for p in self.policies.iterdir()), before)
        self.refused(self.staff.get(f'/contexts/{COURSE}'), 404, 'context_unavailable')

        # The operator installs the reviewed preview as a new file; the course is available again.
        (self.policies / 'course-studio-delivery-preview.json').write_text(
            result.policy_preview.model_dump_json(indent=2), encoding='utf-8')
        fields = self.staff.get(f'/contexts/{COURSE}').json()['context']['fields']
        self.assertEqual((fields['mode'], fields['status']), ('PREPARATION', 'DRAFT'))
        self.assertEqual(fields['learningDesign'], result.design.model_dump())
        digests = self.digests()
        response = self.activation()
        self.assertEqual(response.status_code, 200, response.text)
        outcome = ActivationOutcome.model_validate(response.json())
        self.assertIsNone(outcome.proposal)
        self.assertEqual({f.code for f in outcome.findings}, {'RELEASE_RUNTIME_ROLE'})
        self.assertTrue(all('D4' in f.reason for f in outcome.findings))
        self.assertEqual(self.digests(), digests)

    def test_a_requirement_left_unbound_keeps_activation_refused(self):
        result = self.imported(self.command(omit=1))
        self.assertEqual(len(result.bindings), 6)
        self.assertIn('R08', {f.code for f in result.preview.readiness_findings})

    def test_the_import_needs_both_policies_the_pinned_resources_and_the_csrf_token(self):
        command = self.command()
        before = self.digests()
        self.refused(self.post(self.learner, f'/contexts/{COURSE}/delivery-imports', command), 403, 'forbidden')
        self.refused(self.post(self.staff, f'/contexts/{COURSE}/delivery-imports', command, csrf=False), 403, 'forbidden')
        other = json.loads(json.dumps(command))
        other['bindings'][0]['resource']['version'] = 'other'
        self.refused(self.post(self.staff, f'/contexts/{COURSE}/delivery-imports', other), 422, 'validation')
        # The authoring course's own policy no longer lets the subject propose there.
        self.install_policy('admin', without_action='propose')
        self.refused(self.post(self.staff, f'/contexts/{COURSE}/delivery-imports', command), 403, 'forbidden')
        self.assertEqual(self.digests(), before)

    def test_activation_without_an_applied_import_is_refused(self):
        self.refused(self.activation(), 422, 'validation')


if __name__ == '__main__':
    unittest.main()
