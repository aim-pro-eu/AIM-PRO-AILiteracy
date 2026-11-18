"""Learner API writes (S12 part 2, #136): attempt submission and the learner request as a job.

Two synthetic learners of the seed's active delivery sign in through the
in-memory identity provider. A learner submits an attempt, idempotent by their
own request id, and asks the Teacher or the Socratic coach a question, which
the job worker runs with synthetic learning agents. Each learner reaches only
their own attempts and questions; a learner still cannot propose, decide or
apply, and a learner request never persists an ``Evaluation``. Chat 29 finding
3 is recorded as today's rule: a learner's submit makes a pending evaluation
draft stale (decided in S13). The network is blocked except for the PostgreSQL
test service; no model or provider is used.
"""

import json
import unittest

from fastapi.testclient import TestClient

from learning.contracts import EntityRef, make_entity
from learning.learner import learner_request_id
from learning.outputs import LearningResponse, ProposedChange
from learning.policies import AuthorizationError
from learning.store import LearningStore, StateConflict
from services.api_common.auth import CSRF_HEADER
from services.api_common.settings import ApiSettings
from services.authoring_api.app import create_app as authoring_app
from services.jobs.kinds import Resources
from services.jobs.store import JobStore, StatusEvent
from services.jobs.worker import Worker
from services.learner_api.app import create_app
from tests.authoring_cycle_fixtures import AUTH, DELIVERY, DELIVERY_TWO
from tests.services.course_fixtures import module_settings
from tests.services.job_fixtures import new_jobs_location
from tests.services.oidc_fixtures import (ISSUER, MAPPED_SUBJECT, NO_NETWORK, FakeProvider, auth_settings, log_in,
                                          write_identity_map)
from tests.store_backends import block_network, on_both_backends
from tests.test_learner_reads import LearnerSeed


SUBJECTS = {'admin': MAPPED_SUBJECT, 'learner': 'kc-user-learner', 'learner-2': 'kc-user-learner-2'}
ANSWER = 'Synthetic explanation: name the task, the audience and the fictional details.'
QUESTION = 'Synthetic question: what belongs in a business prompt?'
FIRST_ATTEMPT = 'Synthetic attempt submitted through the Learner API by the first learner.'
SECOND_ATTEMPT = 'Synthetic attempt submitted through the Learner API by the second learner.'


class SyntheticAgents:
    """The learning agents of the worker with synthetic responses: each run answers from the script.

    ``records`` and ``proposals`` build, from the request's context, what a run hands back besides its response.
    """

    def __init__(self, *responses, records=None, proposals=None):
        self.script = list(responses)
        self.records, self.proposals = records, proposals
        self.requests, self.built = [], 0

    def factory(self):
        self.built += 1
        return self

    def run(self, request, context):
        self.requests.append(request)
        self.last_records = self.records(context) if self.records else ()
        self.last_proposals = self.proposals(context) if self.proposals else []
        return self.script.pop(0) if self.script else LearningResponse(kind='ANSWER', content=ANSWER)


class LearnerWritesCase(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self, 'learner-writes.sqlite').activate()
        self.jobs_location = new_jobs_location(self, str(self.seed.root))
        self.jobs = JobStore(self.jobs_location)
        self.addCleanup(self.jobs.close)
        self.provider = FakeProvider()
        identities = write_identity_map(self.seed.root, *({'issuer': ISSUER, 'subject': subject, 'subject_key': key}
                                                          for key, subject in SUBJECTS.items()))
        self.settings = ApiSettings(auth=auth_settings(), identity_map=identities, store=str(self.seed.location),
                                    policy_dir=self.seed.output / self.seed.manifest.policy_dir,
                                    jobs_store=str(self.jobs_location))
        self.app = create_app(self.settings, transport=self.provider.transport)
        self.clients = {key: self.signed_in(self.app, subject) for key, subject in SUBJECTS.items()}
        self.agents = SyntheticAgents()
        self.counts = self.store_counts()

    def signed_in(self, app, subject):
        client = TestClient(app, base_url='https://testserver', raise_server_exceptions=False, follow_redirects=False)
        self.assertEqual(log_in(client, self.provider, subject).status_code, 303)
        return client

    def post(self, subject, path, body, status=200, csrf=True, client=None):
        client = client or self.clients[subject]
        headers = {CSRF_HEADER: client.get('/auth/session').json()['csrf_token']} if csrf else {}
        response = client.post(path, json=body, headers=headers)
        self.assertEqual(response.status_code, status, response.text)
        if status == 200:
            self.assertEqual(response.headers['cache-control'], 'no-store')
        return response.json()

    def get(self, subject, path, status=200):
        response = self.clients[subject].get(path)
        self.assertEqual(response.status_code, status, response.text)
        if status == 200:
            self.assertEqual(response.headers['cache-control'], 'no-store')
        return response.json()

    def activity(self, intent='ASSESS'):
        with self.seed.contexts.open(DELIVERY) as service:
            context = service._context(DELIVERY, 'learner')
            return next(e.ref for e in context.snapshot.active_domain()
                        if e.type == 'ActivityDefinition' and e.fields['intent'] == intent)

    def submit(self, subject, request_id, content, status=200, context_id=DELIVERY, **changes):
        body = {'request_id': request_id, 'activity': self.activity().model_dump(), 'content': content, **changes}
        return self.post(subject, f'/courses/{context_id}/attempts', body, status)

    def ask(self, subject, request_id, status=200, context_id=DELIVERY, **question):
        question = {'text': QUESTION, **question}
        return self.post(subject, f'/courses/{context_id}/questions', {'request_id': request_id, 'question': question},
                         status)

    def run_worker(self, resources=None):
        worker = Worker(self.jobs, self.seed.contexts, resources or Resources(
            authoring=None, search=None, exports=None, orchestrator=self.agents.factory), strict_events=True)
        return worker.run_once()

    def store_counts(self):
        with LearningStore(self.seed.location) as store:
            return {kind: len(store.owned(DELIVERY, kind)) for kind in ('Evaluation', 'ChangeProposal')}


@on_both_backends
class AttemptSubmissionTest(LearnerWritesCase):
    def test_a_learner_submits_an_attempt_idempotent_by_their_own_request_id(self):
        before = self.seed.digests()
        evidence = self.submit('learner', 'attempt-1', FIRST_ATTEMPT)
        self.assertEqual((evidence['content_or_locator'], evidence['activity']),
                         (FIRST_ATTEMPT, self.activity().model_dump()))
        self.assertNotEqual(self.seed.digests(), before)
        progress = self.get('learner', f'/courses/{DELIVERY}/progress')
        self.assertEqual([e['ref'] for e in progress['evidence']], [evidence['ref']])
        # The same request id and attempt again: the same evidence, nothing written.
        recorded = self.seed.digests()
        self.assertEqual(self.submit('learner', 'attempt-1', FIRST_ATTEMPT), evidence)
        self.assertEqual(self.seed.digests(), recorded)
        # The same request id with another attempt or activity: refused, nothing written.
        self.assertEqual(self.submit('learner', 'attempt-1', 'Another text', 409)['error'], 'conflict')
        other = {'activity': self.activity('PRACTICE').model_dump()}
        self.assertEqual(self.submit('learner', 'attempt-1', FIRST_ATTEMPT, 409, **other)['error'], 'conflict')
        self.assertEqual(self.seed.digests(), recorded)

    def test_the_attempt_is_recorded_under_the_learners_scoped_request_id(self):
        self.submit('learner', 'attempt-1', FIRST_ATTEMPT)
        with LearningStore(self.seed.location) as store:
            occurrences = [store.read(EntityRef.model_validate(ref), owner=DELIVERY)
                           for ref in store.read_context(DELIVERY).fields['activityOccurrences']]
        self.assertEqual([o.fields['attemptKey'] for o in occurrences], [learner_request_id('learner', 'attempt-1')])

    def test_two_learners_may_use_the_same_request_id_and_reach_only_their_own_attempts(self):
        # Chat 32 finding 1: the request id is the learner's own, so another learner's id never conflicts.
        first = self.submit('learner', 'attempt-1', FIRST_ATTEMPT)
        second = self.submit('learner-2', 'attempt-1', SECOND_ATTEMPT)
        self.assertNotEqual(first['ref'], second['ref'])
        for subject, own, other in (('learner', first, second), ('learner-2', second, first)):
            with self.subTest(subject):
                text = json.dumps([self.get(subject, path) for path in
                                   ('/courses', f'/courses/{DELIVERY}', f'/courses/{DELIVERY}/progress')])
                self.assertIn(own['ref']['id'], text)
                self.assertNotIn(other['ref']['id'], text)
                self.assertNotIn(other['content_or_locator'], text)
                # Replaying one's own id returns one's own attempt, never the other learner's.
                self.assertEqual(self.submit(subject, 'attempt-1', own['content_or_locator']), own)

    def test_a_submission_needs_csrf_and_writes_nothing_without_it(self):
        before = self.seed.digests()
        body = {'request_id': 'attempt-1', 'activity': self.activity().model_dump(), 'content': FIRST_ATTEMPT}
        self.assertEqual(self.post('learner', f'/courses/{DELIVERY}/attempts', body, 403, csrf=False)['error'],
                         'forbidden')
        anonymous = TestClient(self.app, base_url='https://testserver', raise_server_exceptions=False)
        self.assertEqual(anonymous.post(f'/courses/{DELIVERY}/attempts', json=body).status_code, 401)
        self.assertEqual(self.seed.digests(), before)

    def test_only_a_learner_of_an_active_delivery_submits(self):
        before = self.seed.digests()
        self.assertEqual(self.submit('admin', 'attempt-1', FIRST_ATTEMPT, 403)['error'], 'forbidden')
        self.assertEqual(self.submit('learner', 'attempt-1', FIRST_ATTEMPT, 422, DELIVERY_TWO)['detail'],
                         'The course is not open to learners')
        self.assertEqual(self.submit('learner', 'attempt-1', FIRST_ATTEMPT, 403, AUTH)['error'], 'forbidden')
        self.assertEqual(self.submit('learner', 'attempt-1', FIRST_ATTEMPT, 404, 'no-such-course')['error'],
                         'context_unavailable')
        missing = {'activity': {'type': 'ActivityDefinition', 'id': 'no-such-activity', 'version': '1'}}
        self.assertEqual(self.submit('learner', 'attempt-1', FIRST_ATTEMPT, 422, **missing)['error'], 'validation')
        for invalid in ({'content': ' '}, {'request_id': 'a:b'}, {'request_id': ''}):
            with self.subTest(invalid):
                body = {'request_id': 'attempt-1', 'activity': self.activity().model_dump(), 'content': FIRST_ATTEMPT,
                        **invalid}
                self.post('learner', f'/courses/{DELIVERY}/attempts', body, 422)
        self.assertEqual(self.seed.digests(), before)

    def test_a_submission_persists_no_evaluation(self):
        self.submit('learner', 'attempt-1', FIRST_ATTEMPT)
        self.assertEqual(self.store_counts(), self.counts)
        self.assertEqual(self.get('learner', f'/courses/{DELIVERY}/progress')['evaluations'], [])

    def test_a_learner_still_cannot_propose_decide_or_apply(self):
        writes = {(method, path) for path, methods in self.app.openapi()['paths'].items()
                  for method in methods if method != 'get' and not path.startswith('/auth')}
        self.assertEqual(writes, {('post', '/courses/{context_id}/attempts'),
                                  ('post', '/courses/{context_id}/questions')})
        first, _ = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        with self.seed.contexts.open(DELIVERY) as service:
            root = service.store.read_context(DELIVERY)
            for name, call in (
                    ('propose', lambda: service.propose(DELIVERY, 'learner', (root.ref,), (), 'Synthetic')),
                    ('decide', lambda: service.decide(DELIVERY, 'learner', proposal, 'APPROVE', 'Synthetic')),
                    ('apply', lambda: service.apply(DELIVERY, 'learner', proposal, 'learner-apply'))):
                with self.subTest(name), self.assertRaises(AuthorizationError):
                    call()

    # Chat 29 finding 3, today's rule (decided in S13 once the learner app is tried).
    def test_finding_3_a_learners_submit_makes_a_pending_evaluation_draft_stale(self):
        first, _ = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        self.submit('learner', 'attempt-1', FIRST_ATTEMPT)
        with self.seed.contexts.open(DELIVERY) as service:
            service.decide(DELIVERY, self.seed.manifest.staff, proposal, 'APPROVE', 'Synthetic review')
            with self.assertRaisesRegex(StateConflict, 'Proposal base is stale'):
                service.apply(DELIVERY, self.seed.manifest.staff, proposal, 'apply-first')
            self.assertEqual(next(e for e in service.store.owned(DELIVERY, 'ChangeProposal')
                                  if e.id == proposal.id).fields['status'], 'STALE')
        self.assertEqual(self.get('learner', f'/courses/{DELIVERY}/progress')['evaluations'], [])


@on_both_backends
class LearnerRequestJobTest(LearnerWritesCase):
    def job(self, subject, request_id):
        return self.jobs.get(DELIVERY, learner_request_id(subject, request_id))

    def statuses(self, subject, request_id):
        return [StatusEvent.model_validate_json(e.data).status
                for e in self.jobs.events(DELIVERY, learner_request_id(subject, request_id)) if e.name == 'status']

    def test_a_teacher_question_is_queued_run_by_the_worker_and_read_by_its_learner(self):
        before = self.seed.digests()
        queued = self.ask('learner', 'question-1')
        self.assertEqual({k: queued[k] for k in ('request_id', 'status', 'response', 'detail')},
                         {'request_id': 'question-1', 'status': 'QUEUED', 'response': None, 'detail': None})
        self.assertEqual(queued['question'], {'text': QUESTION, 'intent': 'EXPLAIN', 'problem_key': None,
                                              'switch_from_socratic': False, 'activities': []})
        # Queuing writes nothing in the ALM store and builds no agent.
        self.assertEqual((self.seed.digests(), self.agents.built), (before, 0))
        self.assertEqual(self.job('learner', 'question-1').kind, 'learner-request')

        self.assertEqual(self.run_worker().status, 'COMPLETED')
        done = self.get('learner', f'/courses/{DELIVERY}/questions/question-1')
        self.assertEqual((done['status'], done['response']['kind'], done['response']['content']),
                         ('COMPLETED', 'ANSWER', ANSWER))
        self.assertEqual(self.get('learner', f'/courses/{DELIVERY}/questions'), {'questions': [done]})
        request, = self.agents.requests
        self.assertEqual((request.request_id, request.subject_key, request.intent, request.text),
                         (learner_request_id('learner', 'question-1'), 'learner', 'EXPLAIN', QUESTION))
        self.assertEqual(self.statuses('learner', 'question-1'), ['QUEUED', 'RUNNING', 'COMPLETED'])
        # The job's events carry no question and no answer.
        events = json.dumps([e.data for e in self.jobs.events(DELIVERY, learner_request_id('learner', 'question-1'))])
        self.assertNotIn(QUESTION, events)
        self.assertNotIn(ANSWER, events)
        self.assertEqual(self.store_counts(), self.counts)

    def test_a_question_is_idempotent_by_request_id(self):
        first = self.ask('learner', 'question-1')
        self.assertEqual(self.ask('learner', 'question-1'), first)
        self.assertEqual(self.ask('learner', 'question-1', 409, text='Another question')['error'], 'conflict')
        self.run_worker()
        done = self.get('learner', f'/courses/{DELIVERY}/questions/question-1')
        self.assertEqual(self.ask('learner', 'question-1'), done)
        self.assertIsNone(self.run_worker())
        self.assertEqual(self.agents.built, 1)

    def test_the_socratic_coach_keeps_its_problem_until_the_learner_switches(self):
        socratic = {'intent': 'SOCRATIC_GUIDANCE', 'problem_key': 'problem-1'}
        self.ask('learner', 'guide-0', intent='SOCRATIC_GUIDANCE')
        self.ask('learner', 'guide-1', **socratic)
        self.ask('learner', 'explain-1', problem_key='problem-1')
        self.ask('learner-2', 'explain-1', problem_key='problem-1')
        self.ask('learner', 'switch-1', problem_key='problem-1', switch_from_socratic=True)
        while self.run_worker() is not None:
            pass
        responses = {(subject, request_id): self.get(subject, f'/courses/{DELIVERY}/questions/{request_id}')
                     for subject, request_id in (('learner', 'guide-0'), ('learner', 'guide-1'), ('learner', 'explain-1'),
                                                 ('learner-2', 'explain-1'), ('learner', 'switch-1'))}
        # A clarification given before anything was recorded is the core's fixed text, in ``detail``.
        kind = lambda value: value['response']['kind'] if value['response'] else None
        self.assertEqual({key: (value['status'], kind(value), value['detail']) for key, value in responses.items()}, {
            ('learner', 'guide-0'): ('COMPLETED', None, 'Identify the problem to maintain Socratic continuity.'),
            ('learner', 'guide-1'): ('COMPLETED', 'ANSWER', None),
            ('learner', 'explain-1'): ('COMPLETED', None,
                                       'The problem remains in Socratic mode; switching requires an explicit choice.'),
            ('learner-2', 'explain-1'): ('COMPLETED', 'ANSWER', None),
            ('learner', 'switch-1'): ('COMPLETED', 'ANSWER', None)})
        # The coach (Socratic option b) receives the request as the learner made it.
        self.assertEqual([(r.subject_key, r.intent, r.problem_key, r.switch_from_socratic) for r in self.agents.requests],
                         [('learner', 'SOCRATIC_GUIDANCE', 'problem-1', False), ('learner-2', 'EXPLAIN', 'problem-1', False),
                          ('learner', 'EXPLAIN', 'problem-1', True)])

    def test_a_learner_request_never_proposes_or_persists_an_evaluation(self):
        def topic(context):
            candidate = make_entity('Topic', 'learner-topic', {'name': 'Synthetic', 'definition': 'Synthetic'},
                                    origin='GENERATED_PROPOSAL', responsible='worker')
            task = EntityRef(type='WorkerTask', id='synthetic-task', version='1')
            return [(task, ProposedChange(targets=(context.snapshot.context.ref,), candidates=(candidate,),
                                          explanation='Synthetic'))]

        def evaluation(context):
            evidence = next(e for e in context.snapshot.entities.values() if e.type == 'LearningEvidence')
            spec = next(e for e in context.snapshot.active_domain() if e.type == 'AssessmentSpecification')
            return (make_entity('Evaluation', 'learner-evaluation', {
                'context': context.snapshot.context.ref.model_dump(), 'evidence': [evidence.ref.model_dump()],
                'specification': spec.ref.model_dump(), 'mode': 'FORMATIVE', 'result': 'Correct',
                'reviewPayloadKey': 'pending'}, origin='GENERATED_PROPOSAL', responsible='worker'),)

        self.submit('learner', 'attempt-1', FIRST_ATTEMPT)
        for request_id, agents in (('proposes', SyntheticAgents(proposals=topic)),
                                   ('evaluates', SyntheticAgents(records=evaluation))):
            with self.subTest(request_id):
                self.agents = agents
                self.ask('learner', request_id)
                self.assertEqual(self.run_worker().status, 'FAILED')
                done = self.get('learner', f'/courses/{DELIVERY}/questions/{request_id}')
                self.assertEqual((done['status'], done['response']['kind']), ('FAILED', 'FAILURE'))
                self.assertNotIn('proposal_refs', done['response'])
                self.assertEqual(self.store_counts(), self.counts)

    def test_only_a_learner_of_an_active_delivery_queues_a_question(self):
        before = (self.seed.digests(), self.jobs.list(DELIVERY))
        self.assertEqual(self.ask('admin', 'question-1', 403)['error'], 'forbidden')
        self.assertEqual(self.ask('learner', 'question-1', 422, DELIVERY_TWO)['detail'],
                         'The course is not open to learners')
        self.assertEqual(self.ask('learner', 'question-1', 403, AUTH)['error'], 'forbidden')
        self.assertEqual(self.ask('learner', 'question-1', 404, 'no-such-course')['error'], 'context_unavailable')
        for invalid in ({'intent': 'ASSESS'}, {'intent': 'PRACTICE'}, {'text': ' '}):
            with self.subTest(invalid):
                self.ask('learner', 'question-1', 422, **invalid)
        body = {'request_id': 'question-1', 'question': {'text': QUESTION}}
        self.assertEqual(self.post('learner', f'/courses/{DELIVERY}/questions', body, 403, csrf=False)['error'],
                         'forbidden')
        self.assertEqual((self.seed.digests(), self.jobs.list(DELIVERY)), before)

    def test_the_worker_checks_the_learner_again_and_needs_the_learning_agents(self):
        # A job written to the jobs store by anything but the Learner API: another subject, another id.
        command = {'kind': 'learner-request', 'question': {'text': QUESTION}}
        self.jobs.submit(DELIVERY, learner_request_id('admin', 'q'), 'admin', 'learner-request', command)
        self.jobs.submit(DELIVERY, 'unscoped', 'learner', 'learner-request', command)
        self.assertEqual((self.run_worker().status, self.run_worker().status), ('REJECTED', 'REJECTED'))
        self.assertEqual(self.jobs.get(DELIVERY, learner_request_id('admin', 'q')).detail, 'Action is not authorized')
        self.assertEqual(self.jobs.get(DELIVERY, 'unscoped').detail, "The request id is not the learner's own")
        self.ask('learner', 'question-1')
        done = self.run_worker(Resources(authoring=None, search=None, exports=None))
        self.assertEqual((done.status, done.detail), ('REJECTED', 'The learning agents are not available to the worker'))
        self.assertEqual(self.agents.built, 0)

    def test_two_learners_reach_only_their_own_questions(self):
        self.ask('learner', 'question-1')
        self.ask('learner-2', 'question-1', text='Synthetic question of the second learner.')
        self.ask('learner-2', 'question-2')
        while self.run_worker() is not None:
            pass
        mine = self.get('learner', f'/courses/{DELIVERY}/questions')['questions']
        theirs = self.get('learner-2', f'/courses/{DELIVERY}/questions')['questions']
        self.assertEqual([q['request_id'] for q in mine], ['question-1'])
        self.assertEqual([q['request_id'] for q in theirs], ['question-2', 'question-1'])
        self.assertEqual(mine[0]['question']['text'], QUESTION)
        self.assertNotIn('second learner', json.dumps(mine))
        self.assertEqual(self.get('learner', f'/courses/{DELIVERY}/questions/question-2', 404)['error'], 'not_found')
        before = self.seed.digests()
        for subject in ('learner', 'learner-2'):
            self.get(subject, f'/courses/{DELIVERY}/questions')
            self.get(subject, f'/courses/{DELIVERY}/questions/question-1')
        self.assertEqual(self.seed.digests(), before)
        self.assertEqual(self.get('admin', f'/courses/{DELIVERY}/questions', 403)['error'], 'forbidden')

    def test_the_authoring_api_neither_lists_nor_reads_learner_questions(self):
        self.ask('learner', 'question-1')
        staff_app = authoring_app(ApiSettings(auth=auth_settings(), identity_map=self.settings.identity_map,
                                              store=self.settings.store, policy_dir=self.settings.policy_dir,
                                              jobs_store=str(self.jobs_location), **module_settings(self.seed.root)),
                                  transport=self.provider.transport)
        staff = self.signed_in(staff_app, SUBJECTS['admin'])
        listed = staff.get(f'/contexts/{DELIVERY}/jobs')
        self.assertEqual((listed.status_code, listed.json()), (200, {'jobs': []}))
        scoped = learner_request_id('learner', 'question-1')
        self.assertEqual(staff.get(f'/contexts/{DELIVERY}/jobs/{scoped}').status_code, 404)
        self.assertEqual(staff.get(f'/contexts/{DELIVERY}/jobs/{scoped}/events').status_code, 404)


if __name__ == '__main__':
    unittest.main()
