"""A release proposed through the API (S10, part 1), as the CLI ``propose-release`` does.

The author sends the exact current project, its domain and the course's base
context, read from the project inspection and the course; the result is a
pending proposal that a person decides and applies through the review
endpoints, and the applied release is inspected as ``show-release`` prints it.
"""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from learning.contracts import Entity, EntityRef
from learning.releases import ReleaseInspection, ReleaseProposal
from learning.store import LearningStore
from tests.authoring_cycle_fixtures import AUTH
from tests.seed import build_seed
from tests.services.oidc_fixtures import NO_NETWORK
from tests.services.test_authoring_review_api import ReviewApiCase
from tests.services.test_authoring_read_api import resource_path
from tests.store_backends import block_network, new_store_location, on_both_backends


@on_both_backends
class ReleaseApiTest(ReviewApiCase):
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

    def command(self, request_id='release-2'):
        """What the studio sends: the inspected project, the course's model of that project, the course's version."""
        project = self.staff.get(f'/contexts/{AUTH}/projects/{self.seed.project_id}').json()['project']
        context = Entity.model_validate(self.staff.get(f'/contexts/{AUTH}').json()['context'])
        [domain] = [m for m in context.fields['models'] if m['id'] == project['id'] + ':model']
        return {'request_id': request_id, 'project': project, 'domain': domain, 'base_context': context.ref.model_dump()}

    def inspection(self, release):
        response = self.staff.get(resource_path(AUTH, release, 'release'))
        self.assertEqual(response.status_code, 200, response.text)
        return ReleaseInspection.model_validate(response.json())

    # Acceptance (S10, part 1): a release is proposed from the studio, decided, applied and inspected.
    def test_a_release_is_proposed_decided_applied_and_inspected_as_the_cli_does(self):
        command = self.command()
        response = self.post(self.staff, f'/contexts/{AUTH}/releases', command)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        proposed = ReleaseProposal.model_validate(response.json())
        # The project is the one the seed released: the new release freezes the same selection.
        self.assertEqual(proposed.manifest, self.inspection(self.seed.release).manifest)
        self.assertEqual(proposed.release.id, self.seed.release.id)
        self.assertNotEqual(proposed.release.version, self.seed.release.version)
        # The same request id replays the same proposal.
        self.assertEqual(self.post(self.staff, f'/contexts/{AUTH}/releases', command).json(), response.json())

        pending = {Entity.model_validate(item['proposal']).ref: item['review_payload_key']
                   for item in self.staff.get(f'/contexts/{AUTH}/pending-proposals').json()['proposals']}
        self.assertIn(proposed.proposal, pending)
        self.ok(self.decide(self.staff, AUTH, proposed.proposal, pending[proposed.proposal]))
        self.ok(self.apply(self.staff, AUTH, proposed.proposal, 'apply-release-2'))

        inspected = self.inspection(proposed.release)
        self.assertEqual(inspected.findings, ())
        self.assertEqual(inspected.receipt.proposal.id, proposed.proposal.id)
        status, shown = self.cli('admin', AUTH, 'show-release', proposed.release.model_dump_json())
        self.assertEqual(status, 0)
        self.assertEqual(inspected, ReleaseInspection.model_validate(shown))

    def test_a_release_needs_content_authority_a_current_base_and_the_project_domain(self):
        command = self.command()
        before = self.digests()
        self.refused(self.post(self.learner, f'/contexts/{AUTH}/releases', command), 403, 'forbidden')
        self.refused(self.post(self.staff, f'/contexts/{AUTH}/releases', command, csrf=False), 403, 'forbidden')
        stale = {**command, 'request_id': 'stale', 'base_context': {**command['base_context'], 'version': 'old'}}
        self.refused(self.post(self.staff, f'/contexts/{AUTH}/releases', stale), 409, 'conflict')
        with LearningStore(self.location) as store:
            catalogue = next(m for m in store.read_context(AUTH).fields['models'] if m['id'].endswith(':catalogue'))
        other = {**command, 'request_id': 'other-domain', 'domain': catalogue}
        self.refused(self.post(self.staff, f'/contexts/{AUTH}/releases', other), 422, 'validation')
        self.refused(self.post(self.staff, f'/contexts/{AUTH}/releases', {**command, 'project': None}), 422, 'validation')
        self.assertEqual(self.digests(), before)


if __name__ == '__main__':
    unittest.main()
