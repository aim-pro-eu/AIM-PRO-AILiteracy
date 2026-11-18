"""Course membership from the studio (D25, option A; S11, #129; batch, D36, S11b, #138).

The administrator of a course adds one or more subjects of the identity map,
each with one role of the teaching staff; students are added at once instead
(D37, S12b), so the API no longer offers or accepts ``LEARNER`` here. The API
writes the new trusted policy version as a new file, never changing an
installed one, and answers with the pending proposal; the members can act only
after the proposal is decided and applied through the review endpoints.
"""

import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory

from learning.contracts import EntityRef
from learning.policies import TrustedPolicy
from services.api_common.settings import ApiSettings
from services.authoring_api.app import create_app
from tests.seed import build_seed
from tests.services.course_fixtures import ENROLMENT_SECRET, new_export_directory, write_course_template
from tests.services.oidc_fixtures import ISSUER, MAPPED_SUBJECT, NO_NETWORK, FakeProvider, auth_settings, write_identity_map
from tests.services.test_authoring_review_api import LEARNER_SUBJECT, ReviewApiCase
from tests.store_backends import block_network, new_store_location, on_both_backends


COURSE = 'prompting-course'
ASSESSOR_SUBJECT = 'kc-user-assessor'


@on_both_backends
class MembersApiTest(ReviewApiCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.location = new_store_location(self, temp.name, 'seed.sqlite')
        self.seed = build_seed(self.root / 'seed', self.location)
        self.policies = self.root / 'seed' / self.seed.policy_dir
        self.provider = FakeProvider()
        identities = write_identity_map(self.root,
            {'issuer': ISSUER, 'subject': MAPPED_SUBJECT, 'subject_key': 'admin'},
            {'issuer': ISSUER, 'subject': LEARNER_SUBJECT, 'subject_key': 'learner'},
            {'issuer': ISSUER, 'subject': ASSESSOR_SUBJECT, 'subject_key': 'assessor'})
        settings = ApiSettings(auth=auth_settings(), identity_map=identities, store=str(self.location),
                               policy_dir=self.policies, jobs_store=str(self.root / 'jobs.sqlite'),
                               aimpro_exports=new_export_directory(self.root),
                               course_template=write_course_template(self.root), enrolment_secret=ENROLMENT_SECRET)
        self.app = create_app(settings, transport=self.provider.transport)
        self.staff = self.signed_in(MAPPED_SUBJECT)
        self.learner = self.signed_in(LEARNER_SUBJECT)
        self.assessor = self.signed_in(ASSESSOR_SUBJECT)
        self.assertEqual(self.post(self.staff, '/courses', {'context_id': COURSE}).status_code, 200)

    def base(self):
        return self.staff.get(f'/contexts/{COURSE}').json()['context']

    def add(self, subject='assessor', role='ASSESSOR', request_id='member-1', client=None, csrf=True, members=None):
        context = self.base()
        return self.post(client or self.staff, f'/contexts/{COURSE}/members', {
            'request_id': request_id, 'members': members or [{'subject': subject, 'role': role}],
            'base_context': {'type': 'ExecutionContext', 'id': COURSE, 'version': context['version']}}, csrf=csrf)

    def files(self):
        return {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(self.policies.iterdir())}

    def review(self, body, operation='member-1'):
        proposal = EntityRef.model_validate(body['proposal'])
        pending = self.staff.get(f'/contexts/{COURSE}/proposals/{proposal.id}').json()
        self.ok(self.decide(self.staff, COURSE, proposal, pending['review_payload_key']))
        self.ok(self.apply(self.staff, COURSE, proposal, operation))

    def test_an_administrator_adds_a_member_who_sees_the_course_after_application(self):
        before = self.files()
        response = self.add()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        body = response.json()
        policy = TrustedPolicy.model_validate(body['policy'])
        self.assertEqual(policy.policy_ref.id, 'course:' + COURSE)
        # One new file holds the new version; every installed file keeps its exact bytes.
        written = self.policies / f'course-{COURSE}-{policy.policy_ref.version}.json'
        self.assertEqual(self.files(), {**before, written.name: self.files()[written.name]})
        self.assertEqual(TrustedPolicy.model_validate_json(written.read_bytes()), policy)
        self.assertEqual(policy.subjects['assessor'].roles, ['ASSESSOR'])
        self.assertEqual(policy.subjects['assessor'].actions, {COURSE: ['read', 'propose', 'decide', 'apply', 'interact']})
        # Pending: the member does not see the course yet.
        self.assertNotIn(COURSE, [c['context_id'] for c in self.assessor.get('/contexts').json()['contexts']])
        self.assertEqual(self.add().json(), body)
        self.review(body)
        listed = {c['context_id']: c for c in self.assessor.get('/contexts').json()['contexts']}
        self.assertEqual(listed[COURSE]['roles'], ['ASSESSOR'])
        self.assertEqual(self.assessor.get(f'/contexts/{COURSE}').status_code, 200)
        self.assertEqual(self.files()[written.name], hashlib.sha256(written.read_bytes()).hexdigest())

    def test_the_members_and_the_subjects_that_may_join_are_read_by_an_administrator(self):
        response = self.staff.get(f'/contexts/{COURSE}/members')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(response.json(), {
            'members': [{'subject': 'admin', 'roles': ['ADMINISTRATOR', 'CONTENT_RESPONSIBLE']}],
            'addable': ['assessor', 'learner'],
            'roles': ['CONTENT_RESPONSIBLE', 'ASSESSOR', 'OBSERVER']})
        self.review(self.add(subject='learner', role='OBSERVER').json())
        body = self.staff.get(f'/contexts/{COURSE}/members').json()
        self.assertEqual(body['members'][1], {'subject': 'learner', 'roles': ['OBSERVER']})
        self.assertEqual(body['addable'], ['assessor'])
        self.refused(self.learner.get(f'/contexts/{COURSE}/members'), 403, 'forbidden')

    def test_only_a_mapped_subject_with_a_grantable_role_may_join(self):
        before = self.files()
        detail = self.refused(self.add(subject='stranger'), 422, 'validation')
        self.assertIn('identity map', detail)
        self.refused(self.add(role='ADMINISTRATOR'), 422, 'validation')
        self.refused(self.add(subject='admin'), 422, 'validation')
        # Students are added at once under the learner grant, not by a membership proposal (D37).
        detail = self.refused(self.add(subject='learner', role='LEARNER'), 422, 'validation')
        self.assertIn('added at once', str(detail))
        self.assertEqual(self.files(), before)

    def test_one_proposal_adds_several_members_in_one_new_file(self):
        before = self.files()
        members = [{'subject': 'assessor', 'role': 'ASSESSOR'}, {'subject': 'learner', 'role': 'OBSERVER'}]
        response = self.add(members=members)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(len(body['participants']), 2)
        policy = TrustedPolicy.model_validate(body['policy'])
        self.assertEqual(len(self.files()), len(before) + 1)
        self.assertEqual({k: policy.subjects[k].roles for k in ('assessor', 'learner')},
                         {'assessor': ['ASSESSOR'], 'learner': ['OBSERVER']})
        self.assertEqual(self.add(members=members).json(), body)
        self.refused(self.add(members=members[:1]), 409, 'conflict')
        self.review(body)
        listed = self.staff.get(f'/contexts/{COURSE}/members').json()
        self.assertEqual([m['subject'] for m in listed['members']], ['admin', 'assessor', 'learner'])
        self.assertEqual(listed['addable'], [])

    def test_every_member_of_a_batch_must_be_mapped_new_and_named_once(self):
        before = self.files()
        detail = self.refused(self.add(members=[{'subject': 'assessor', 'role': 'ASSESSOR'},
                                                {'subject': 'stranger', 'role': 'OBSERVER'}]), 422, 'validation')
        self.assertIn('stranger', detail)
        self.assertIn('identity map', detail)
        self.refused(self.add(members=[{'subject': 'learner', 'role': 'ASSESSOR'},
                                       {'subject': 'learner', 'role': 'OBSERVER'}]), 422, 'validation')
        detail = self.refused(self.add(members=[{'subject': 'learner', 'role': 'ASSESSOR'},
                                                {'subject': 'admin', 'role': 'OBSERVER'}]), 422, 'validation')
        self.assertIn('admin is already a member', detail)
        self.refused(self.post(self.staff, f'/contexts/{COURSE}/members', {
            'request_id': 'empty', 'members': [], 'base_context': {
                'type': 'ExecutionContext', 'id': COURSE, 'version': self.base()['version']}}), 422, 'validation')
        self.assertEqual(self.files(), before)

    def test_a_pending_membership_does_not_refuse_another(self):
        first = self.add(subject='assessor', role='ASSESSOR', request_id='member-1')
        second = self.add(subject='learner', role='OBSERVER', request_id='member-2')
        self.assertEqual((first.status_code, second.status_code), (200, 200), second.text)
        pending = self.staff.get(f'/contexts/{COURSE}/pending-proposals').json()['proposals']
        self.assertEqual({p['proposal']['id'] for p in pending},
                         {first.json()['proposal']['id'], second.json()['proposal']['id']})

    def test_only_an_administrator_of_the_course_adds_members_with_the_csrf_token(self):
        before = self.files()
        self.refused(self.add(csrf=False), 403, 'forbidden')
        self.refused(self.add(client=self.assessor), 403, 'forbidden')
        self.assertEqual(self.files(), before)
        self.review(self.add(subject='learner', role='CONTENT_RESPONSIBLE').json())
        self.refused(self.add(client=self.learner, request_id='by-teacher'), 403, 'forbidden')
        self.assertEqual(len(self.files()), len(before) + 1)
