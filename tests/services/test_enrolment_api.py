"""Teams-style enrolment through the APIs (D37, D9 revised; S12b part 1, #141).

The administrator of the seed's active delivery opens it to learners through
the Authoring API (a reviewed policy change, applied as the review endpoints
would) and creates, resets and disables its code. People outside the identity
map sign in with an automatic subject key and join with the code alone through
the Learner API; each reaches only their own records. The administrator also
adds students at once, by a key of the identity map or an automatic key (part
2). The identity provider is in memory and the network is blocked except for the PostgreSQL test service.
"""

import hashlib
import unittest

from fastapi.testclient import TestClient

from learning.contracts import EntityRef
from learning.policies import TrustedPolicy
from services.api_common.auth import CSRF_HEADER
from services.api_common.identity import auto_subject_key
from services.api_common.registry import ConfigurationError
from services.api_common.settings import ApiSettings
from services.authoring_api.app import create_app as authoring_app
from services.learner_api.app import create_app as learner_app
from tests.authoring_cycle_fixtures import DELIVERY
from tests.seed import SYNTHETIC_ATTEMPT
from tests.services.course_fixtures import ENROLMENT_SECRET, module_settings
from tests.services.job_fixtures import new_jobs_location
from tests.services.oidc_fixtures import ISSUER, MAPPED_SUBJECT, NO_NETWORK, FakeProvider, auth_settings, log_in, \
    write_identity_map
from tests.store_backends import block_network, on_both_backends
from tests.test_learner_reads import LearnerSeed


MAPPED = {'admin': MAPPED_SUBJECT, 'learner': 'kc-user-learner', 'pupil': 'kc-user-pupil'}
STUDENTS = ('kc-user-student-1', 'kc-user-student-2')


class EnrolmentApiCase(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self, 'enrolment-api.sqlite', open_delivery=False).activate()
        self.provider = FakeProvider()
        identities = write_identity_map(self.seed.root, *({'issuer': ISSUER, 'subject': subject, 'subject_key': key}
                                                          for key, subject in MAPPED.items()))
        self.settings = ApiSettings(auth=auth_settings(), identity_map=identities, store=str(self.seed.location),
                                    policy_dir=self.seed.output / self.seed.manifest.policy_dir,
                                    jobs_store=str(new_jobs_location(self, str(self.seed.root))),
                                    **module_settings(self.seed.root))
        self.studio = authoring_app(self.settings, transport=self.provider.transport)
        self.learning = learner_app(self.settings, transport=self.provider.transport)
        self.staff = self.signed_in(self.studio, MAPPED['admin'])

    def signed_in(self, app, subject):
        client = TestClient(app, base_url='https://testserver', raise_server_exceptions=False, follow_redirects=False)
        self.assertEqual(log_in(client, self.provider, subject).status_code, 303)
        return client

    def send(self, client, method, path, body=None, status=200, csrf=True):
        headers = {CSRF_HEADER: client.get('/auth/session').json()['csrf_token']} if csrf else {}
        response = client.request(method, path, json=body, headers=headers)
        self.assertEqual(response.status_code, status, response.text)
        if status == 200:
            self.assertEqual(response.headers['cache-control'], 'no-store')
        return response.json()

    def get(self, client, path, status=200):
        response = client.get(path)
        self.assertEqual(response.status_code, status, response.text)
        if status == 200:
            self.assertEqual(response.headers['cache-control'], 'no-store')
        return response.json()

    def files(self):
        directory = self.seed.output / self.seed.manifest.policy_dir
        return {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(directory.iterdir())}

    def open_course(self):
        version = self.get(self.staff, f'/contexts/{DELIVERY}')['context']['version']
        body = self.send(self.staff, 'POST', f'/contexts/{DELIVERY}/enrolment', {
            'request_id': 'open-1', 'base_context': {'type': 'ExecutionContext', 'id': DELIVERY, 'version': version}})
        self.seed.apply(EntityRef.model_validate(body['proposal']), 'open-1')
        return body

    def code(self):
        return self.send(self.staff, 'POST', f'/contexts/{DELIVERY}/enrolment/code')['code']

    def add(self, subjects, request_id='add-1', status=200, client=None, csrf=True):
        return self.send(client or self.staff, 'POST', f'/contexts/{DELIVERY}/learners',
                         {'request_id': request_id, 'subjects': subjects}, status, csrf)

    def join(self, client, code, request_id='join-1', status=200, csrf=True):
        return self.send(client, 'POST', '/enrolments', {'request_id': request_id, 'code': code}, status, csrf)


@on_both_backends
class AuthoringEnrolmentTest(EnrolmentApiCase):
    def test_an_administrator_opens_the_course_once_and_manages_its_code(self):
        self.assertEqual(self.get(self.staff, f'/contexts/{DELIVERY}/enrolment'),
                         {'context_id': DELIVERY, 'open': False, 'code': None})
        before = self.files()
        body = self.open_course()
        policy = TrustedPolicy.model_validate(body['policy'])
        self.assertEqual(policy.learners[DELIVERY].actions, ['read', 'interact', 'submit'])
        after = self.files()
        # One new file holds the new version; every installed file keeps its exact bytes.
        self.assertEqual(len(after), len(before) + 1)
        self.assertEqual({name: after[name] for name in before}, before)
        self.assertEqual(self.get(self.staff, f'/contexts/{DELIVERY}/enrolment'),
                         {'context_id': DELIVERY, 'open': True, 'code': None})
        first = self.code()
        self.assertEqual(len(first), 8)
        self.assertEqual(self.get(self.staff, f'/contexts/{DELIVERY}/enrolment')['code'], first)
        second = self.code()
        self.assertNotEqual(first, second)
        self.assertEqual(self.send(self.staff, 'DELETE', f'/contexts/{DELIVERY}/enrolment/code'),
                         {'context_id': DELIVERY, 'open': True, 'code': None})

    def test_a_code_is_refused_before_the_course_is_open(self):
        response = self.staff.post(f'/contexts/{DELIVERY}/enrolment/code',
                                   headers={CSRF_HEADER: self.staff.get('/auth/session').json()['csrf_token']})
        self.assertEqual(response.status_code, 422, response.text)

    def test_only_the_administrators_read_or_change_the_code_and_writes_need_the_csrf_header(self):
        self.open_course()
        self.code()
        learner = self.signed_in(self.studio, MAPPED['learner'])
        self.get(learner, f'/contexts/{DELIVERY}/enrolment', 403)
        self.send(learner, 'POST', f'/contexts/{DELIVERY}/enrolment/code', status=403)
        self.send(learner, 'DELETE', f'/contexts/{DELIVERY}/enrolment/code', status=403)
        self.send(self.staff, 'POST', f'/contexts/{DELIVERY}/enrolment/code', status=403, csrf=False)
        self.send(self.staff, 'DELETE', f'/contexts/{DELIVERY}/enrolment/code', status=403, csrf=False)

    def test_the_enrolment_modules_need_the_host_secret(self):
        for create, module in ((authoring_app, 'enrolment'), (learner_app, 'enrolments')):
            settings = self.settings.model_copy(update={'enrolment_secret': None, 'modules': (module,)})
            with self.subTest(module), self.assertRaisesRegex(ConfigurationError, 'ALM_ENROLMENT_SECRET'):
                create(settings, transport=self.provider.transport)


@on_both_backends
class LearnerEnrolmentTest(EnrolmentApiCase):
    def setUp(self):
        super().setUp()
        self.open_course()
        self.course_code = self.code()
        self.students = [self.signed_in(self.learning, subject) for subject in STUDENTS]

    def activity(self):
        with self.seed.contexts.open(DELIVERY) as service:
            context = service._context(DELIVERY, 'learner')
            return next(e.ref for e in context.snapshot.active_domain()
                        if e.type == 'ActivityDefinition' and e.fields['intent'] == 'ASSESS')

    def test_a_person_outside_the_identity_map_joins_with_the_code_alone(self):
        student = self.students[0]
        self.assertEqual(self.get(student, '/auth/session')['subject_key'], auto_subject_key(ISSUER, STUDENTS[0]))
        self.assertEqual(self.get(student, '/courses'), {'courses': []})
        self.get(student, f'/courses/{DELIVERY}', 403)
        course = self.join(student, self.course_code)
        self.assertEqual(course['context_id'], DELIVERY)
        self.assertEqual(self.get(student, '/courses'), {'courses': [course]})
        self.assertEqual(self.get(student, f'/courses/{DELIVERY}')['context_id'], DELIVERY)
        evidence = self.send(student, 'POST', f'/courses/{DELIVERY}/attempts', {
            'request_id': 'attempt-1', 'activity': self.activity().model_dump(), 'content': SYNTHETIC_ATTEMPT})
        self.assertEqual(self.get(student, f'/courses/{DELIVERY}/progress')['evidence'], [evidence])
        before = self.seed.digests()
        self.assertEqual(self.join(student, self.course_code), course)
        self.assertEqual(self.seed.digests(), before)

    def test_a_wrong_reset_or_disabled_code_gets_the_same_answer_and_records_nothing(self):
        student = self.students[0]
        before = self.seed.digests()
        answers = [self.join(student, 'aaaaaaaa', status=404)]
        old, self.course_code = self.course_code, self.code()
        answers.append(self.join(student, old, status=404))
        self.send(self.staff, 'DELETE', f'/contexts/{DELIVERY}/enrolment/code')
        answers.append(self.join(student, self.course_code, status=404))
        self.assertEqual(len({(a['error'], a['detail']) for a in answers}), 1)
        changed = {name for name, digest in self.seed.digests().items() if before[name] != digest}
        self.assertEqual(changed, {'enrolment_codes'})
        self.assertEqual(self.get(student, '/courses'), {'courses': []})

    def test_joining_needs_the_csrf_header_and_a_well_formed_request(self):
        student = self.students[0]
        self.join(student, self.course_code, status=403, csrf=False)
        self.join(student, self.course_code, request_id='has:colon', status=422)
        self.assertEqual(self.get(student, '/courses'), {'courses': []})

    def test_two_learners_who_joined_reach_only_their_own_records(self):
        for student in self.students:
            self.join(student, self.course_code)
        submitted = []
        for index, student in enumerate(self.students):
            submitted.append(self.send(student, 'POST', f'/courses/{DELIVERY}/attempts', {
                'request_id': 'attempt-1', 'activity': self.activity().model_dump(),
                'content': f'{SYNTHETIC_ATTEMPT} ({index})'}))
        for student, evidence in zip(self.students, submitted):
            progress = self.get(student, f'/courses/{DELIVERY}/progress')
            self.assertEqual(progress['evidence'], [evidence])
            self.assertEqual(len(progress['occurrences']), 1)
        self.assertNotEqual(submitted[0]['ref'], submitted[1]['ref'])


@on_both_backends
class AddedLearnersApiTest(EnrolmentApiCase):
    def test_an_administrator_adds_a_mapped_person_and_an_automatic_key_at_once(self):
        self.open_course()
        before = self.files()
        student = auto_subject_key(ISSUER, STUDENTS[0])
        body = self.add(['pupil', student])
        self.assertEqual(body['roles'], ['CONTENT_RESPONSIBLE', 'ASSESSOR', 'OBSERVER'])
        members = {member['subject']: member['roles'] for member in body['members']}
        self.assertEqual((members['pupil'], members[student]), (['LEARNER'], ['LEARNER']))
        self.assertNotIn('pupil', body['addable'])
        self.assertEqual(self.get(self.staff, f'/contexts/{DELIVERY}/members'), body)
        # No proposal and no new policy version.
        self.assertEqual(self.files(), before)
        self.assertEqual(self.get(self.staff, f'/contexts/{DELIVERY}/pending-proposals'), {'proposals': []})
        for subject in (MAPPED['pupil'], STUDENTS[0]):
            client = self.signed_in(self.learning, subject)
            self.assertEqual([c['context_id'] for c in self.get(client, '/courses')['courses']], [DELIVERY])
        digests = self.seed.digests()
        self.assertEqual(self.add(['pupil', student]), body)
        self.assertEqual(self.seed.digests(), digests)

    def test_only_keys_of_the_map_or_automatic_keys_of_people_not_on_the_staff_are_added(self):
        before = self.seed.digests()
        detail = self.add(['pupil'], status=422)['detail']
        self.assertIn('not open to learners', detail)
        self.open_course()
        before = self.seed.digests()
        for subjects, words in ((['pupil', 'stranger'], 'stranger'), (['auto-123'], 'auto-123'),
                                (['pupil', 'admin'], 'admin is already a member')):
            with self.subTest(subjects):
                self.assertIn(words, self.add(subjects, status=422)['detail'])
        self.add([], status=422)
        self.add(['pupil', 'pupil'], status=422)
        learner = self.signed_in(self.studio, MAPPED['learner'])
        self.add(['pupil'], client=learner, status=403)
        self.add(['pupil'], csrf=False, status=403)
        self.assertEqual(self.seed.digests(), before)


if __name__ == '__main__':
    unittest.main()
