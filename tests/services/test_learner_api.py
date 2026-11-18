"""Learner API (S12, #136): a separate process for the learner's courses, course view and own progress.

Two synthetic learners of the seed's delivery sign in through the in-memory
identity provider. Each reaches only their own records, on every Learner API
endpoint and on the Authoring API context summary, and no read changes the
store. The network is blocked except for the PostgreSQL test service.
"""

import json
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from learning.learner import LearnerCourse
from learning.store import LearningStore
from services.api_common.registry import ConfigurationError
from services.api_common.settings import ApiSettings
from services.authoring_api.app import create_app as authoring_app
from services.learner_api.app import REGISTRY, create_app
from tests.authoring_cycle_fixtures import AUTH, DELIVERY, DELIVERY_TWO
from tests.services.course_fixtures import ENROLMENT_SECRET, module_settings
from tests.services.job_fixtures import new_jobs_location
from tests.services.oidc_fixtures import (ISSUER, MAPPED_SUBJECT, NO_NETWORK, FakeProvider, auth_settings, log_in,
                                          write_identity_map)
from tests.store_backends import block_network, on_both_backends
from tests.test_learner_reads import OTHER_ATTEMPT, LearnerSeed


SUBJECTS = {'admin': MAPPED_SUBJECT, 'learner': 'kc-user-learner', 'learner-2': 'kc-user-learner-2'}
UNAVAILABLE = {'error': 'context_unavailable', 'detail': 'Context unavailable'}


@on_both_backends
class LearnerApiTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self, 'learner-api.sqlite').activate()
        self.provider = FakeProvider()
        identities = write_identity_map(self.seed.root, *({'issuer': ISSUER, 'subject': subject, 'subject_key': key}
                                                          for key, subject in SUBJECTS.items()))
        self.settings = ApiSettings(auth=auth_settings(), identity_map=identities, store=str(self.seed.location),
                                    policy_dir=self.seed.output / self.seed.manifest.policy_dir,
                                    jobs_store=str(new_jobs_location(self, str(self.seed.root))),
                                    enrolment_secret=ENROLMENT_SECRET)
        self.app = create_app(self.settings, transport=self.provider.transport)
        self.clients = {key: self.signed_in(self.app, subject) for key, subject in SUBJECTS.items()}

    def signed_in(self, app, subject):
        client = TestClient(app, base_url='https://testserver', raise_server_exceptions=False, follow_redirects=False)
        self.assertEqual(log_in(client, self.provider, subject).status_code, 303)
        return client

    def get(self, subject, path, status=200):
        response = self.clients[subject].get(path)
        self.assertEqual(response.status_code, status, response.text)
        if status == 200:
            self.assertEqual(response.headers['cache-control'], 'no-store')
        return response.json()

    def endpoints(self, context_id=DELIVERY):
        return ['/courses', f'/courses/{context_id}', f'/courses/{context_id}/progress']

    def test_every_read_route_is_covered_here(self):
        # The writes (attempts and questions) and the question reads are covered in test_learner_writes.
        routes = {(method, path) for path, methods in self.app.openapi()['paths'].items()
                  for method in methods if not path.startswith(('/auth', '/health', '/courses/{context_id}/questions'))
                  and method == 'get'}
        self.assertEqual(routes, {('get', '/courses'), ('get', '/courses/{context_id}'),
                                  ('get', '/courses/{context_id}/progress')})
        self.assertEqual(len(self.endpoints()), len(routes))

    def test_no_session_no_read(self):
        anonymous = TestClient(self.app, base_url='https://testserver', raise_server_exceptions=False)
        for path in self.endpoints():
            with self.subTest(path):
                self.assertEqual(anonymous.get(path).status_code, 401)

    def test_my_courses_come_from_the_one_enrolment_function(self):
        self.assertEqual(self.get('learner', '/courses'), {'courses': [
            {'context_id': DELIVERY, 'title': 'Synthetic business prompting syllabus'}]})
        self.assertEqual(self.get('admin', '/courses'), {'courses': []})
        listed = (LearnerCourse(context_id='elsewhere', title='Another course'),)
        with patch('services.api_common.contexts.enrolled_courses', return_value=listed) as source:
            self.assertEqual(self.get('learner', '/courses')['courses'], [listed[0].model_dump()])
        self.assertEqual(source.call_args.args[2], 'learner')

    def test_the_course_view_and_progress_match_the_service(self):
        first, _ = self.seed.attempts()
        with self.seed.contexts.open(DELIVERY) as service:
            view = service.course_view(DELIVERY, 'learner')
            progress = service.own_progress(DELIVERY, 'learner')
        self.assertEqual(self.get('learner', f'/courses/{DELIVERY}'), view.model_dump(mode='json'))
        self.assertEqual(self.get('learner', f'/courses/{DELIVERY}/progress'), progress.model_dump(mode='json'))
        self.assertEqual([e['ref']['id'] for e in progress.model_dump(mode='json')['evidence']], [first.id])

    def test_refusals(self):
        for path in self.endpoints()[1:]:
            with self.subTest(path):
                self.assertEqual(self.get('admin', path, 403)['error'], 'forbidden')
                self.assertEqual(self.get('learner', path.replace(DELIVERY, DELIVERY_TWO), 422)['detail'],
                                 'The course is not open to learners')
                self.assertEqual(self.get('learner', path.replace(DELIVERY, AUTH), 403)['error'], 'forbidden')
                missing = self.get('learner', path.replace(DELIVERY, 'no-such-course'), 404)
                self.assertEqual({k: missing[k] for k in UNAVAILABLE}, UNAVAILABLE)

    def test_two_learners_of_one_delivery_reach_only_their_own_records(self):
        seed = self.seed
        first, second = seed.attempts()
        seed.apply(seed.draft(first, 'draft-first'), 'apply-first')
        seed.draft(second, 'draft-second')
        with seed.contexts.open(DELIVERY) as service:
            mine = {key: service.own_progress(DELIVERY, key) for key in ('learner', 'learner-2')}
        self.assertEqual(len(mine['learner'].evaluations), 1)
        self.assertEqual(mine['learner-2'].evaluations, ())
        # What only the first learner has: their evidence, attempt, evaluation, learning state and participant.
        first_only = {first.id, mine['learner'].occurrences[0].ref.id, mine['learner'].evaluations[0].ref.id,
                      mine['learner'].learning_states[0].ref.id, OTHER_ATTEMPT, f'{DELIVERY}:participant:learner"'}
        second_only = {second.id, mine['learner-2'].occurrences[0].ref.id, f'{DELIVERY}:participant:learner-2"'}
        staff = authoring_app(ApiSettings(auth=auth_settings(), identity_map=self.settings.identity_map,
                                          store=self.settings.store, policy_dir=self.settings.policy_dir,
                                          jobs_store=str(seed.root / 'jobs.sqlite'), **module_settings(seed.root)),
                              transport=self.provider.transport)
        summary = {key: self.signed_in(staff, SUBJECTS[key]) for key in ('learner', 'learner-2')}
        before = seed.digests()
        for subject, others, own in (('learner', second_only, first.id), ('learner-2', first_only, second.id)):
            reads = {path: self.get(subject, path) for path in self.endpoints()}
            response = summary[subject].get(f'/contexts/{DELIVERY}')
            self.assertEqual(response.status_code, 200, response.text)
            reads['authoring summary'] = response.json()
            for path, body in reads.items():
                with self.subTest(subject=subject, path=path):
                    text = json.dumps(body)
                    self.assertEqual([value for value in others if value in text], [])
            self.assertIn(own, json.dumps(reads[f'/courses/{DELIVERY}/progress']))
            self.assertIn(own, json.dumps(reads['authoring summary']))
        self.assertEqual(seed.digests(), before)


class LearnerConfigurationTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        import tempfile
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.identities = write_identity_map(self.root)

    def test_the_learner_modules_are_registered(self):
        self.assertEqual(REGISTRY.names, ('courses', 'progress', 'attempts', 'questions', 'enrolments'))

    def test_learner_modules_need_a_store_and_a_policy_directory(self):
        settings = ApiSettings(auth=auth_settings(), identity_map=self.identities)
        with self.assertRaisesRegex(ConfigurationError, 'ALM_STORE and ALM_POLICY_DIR'):
            create_app(settings, transport=FakeProvider().transport)
        identity_only = create_app(settings.model_copy(update={'modules': ()}), transport=FakeProvider().transport)
        self.assertEqual(TestClient(identity_only).get('/courses').status_code, 404)

    def test_the_questions_module_needs_a_jobs_store(self):
        store = self.root / 'alm.sqlite'
        LearningStore(store).close()
        settings = ApiSettings(auth=auth_settings(), identity_map=self.identities, store=str(store),
                               policy_dir=self.root)
        with self.assertRaisesRegex(ConfigurationError, 'ALM_JOBS_STORE'):
            create_app(settings, transport=FakeProvider().transport)
        reads = create_app(settings.model_copy(update={'modules': ('courses', 'progress', 'attempts')}),
                           transport=FakeProvider().transport)
        self.assertEqual(TestClient(reads).get(f'/courses/{DELIVERY}/questions').status_code, 404)


if __name__ == '__main__':
    unittest.main()
