"""Teams-style enrolment (D37, S12b part 1, #141): the learner grant, the course code and the course version.

An administrator opens a delivery to learners once, through a reviewed policy
change: a new trusted policy version with the delivery's learner grant. The
course code is then created, reset and disabled at once; the store keeps only
its nonce and digest. A signed-in subject who gives the right code to an ACTIVE
delivery becomes a ``LEARNER`` participant under that grant, with no new policy
version. Joining leaves every pending proposal applicable, and applying a
proposal keeps the participants and learners' records recorded after it. An
administrator also adds students at once, recorded as those who join (part 2).
The seed's delivery is used, built without opening it; temporary SQLite file or
PostgreSQL test schema only; no model, provider or network.
"""

import string
import unittest

from learning.contracts import EntityRef
from learning.decisions import proposal_candidates
from learning.enrolment import CODE_LENGTH, EnrolmentRefused, code_digest, course_code, join_course
from learning.learner import enrolled_courses, learner_request_id
from learning.membership import ENROLMENT_POLICY, EnrolmentCommand, Member
from learning.policies import AuthorizationError, TrustedPolicy, with_learner
from learning.store import LearningStore, StateConflict, canonical
from tests.authoring_cycle_fixtures import DELIVERY, DELIVERY_TWO
from tests.seed import SYNTHETIC_ATTEMPT
from tests.services.job_fixtures import activate_delivery
from tests.store_backends import block_network, on_both_backends
from tests.test_learner_reads import LearnerSeed


SECRET = b'synthetic-enrolment-secret-for-tests-only'
NO_NETWORK = 'Enrolment uses no model, provider or network'
STUDENT, OTHER_STUDENT = 'auto-0123456789abcdef0123', 'auto-fedcba9876543210fedc'


class EnrolmentCase(unittest.TestCase):
    activated = True

    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self, 'enrolment.sqlite', open_delivery=False)
        if self.activated:
            self.seed.activate()
        self.staff = self.seed.manifest.staff

    def propose_opening(self, request_id='open-1', context_id=DELIVERY, subject=None):
        with self.seed.contexts.open(context_id) as service:
            return service.propose_enrolment(context_id, subject or self.staff,
                EnrolmentCommand(base_context=service.store.read_context(context_id).ref), request_id=request_id,
                install=lambda policy: self.seed.policies.install(f'{request_id}.json', policy))

    def open_course(self, request_id='open-1'):
        result = self.propose_opening(request_id)
        self.seed.apply(result.proposal, request_id)
        return result

    def reset(self, subject=None):
        with self.seed.contexts.open(DELIVERY) as service:
            return service.reset_enrolment_code(DELIVERY, subject or self.staff, secret=SECRET)

    def add(self, subjects, request_id='add-1', subject=None):
        with self.seed.contexts.open(DELIVERY) as service:
            return service.add_learners(DELIVERY, subject or self.staff, {'subjects': subjects}, request_id=request_id)

    def read_code(self, subject=None):
        with self.seed.contexts.open(DELIVERY) as service:
            return service.enrolment(DELIVERY, subject or self.staff, secret=SECRET)

    def disable(self, subject=None):
        with self.seed.contexts.open(DELIVERY) as service:
            return service.disable_enrolment_code(DELIVERY, subject or self.staff, secret=SECRET)

    def join(self, subject, code, request_id='join-1'):
        with LearningStore(self.seed.location) as store:
            installed = self.seed.policies.installed()
            return join_course(store, lambda ref: self.seed.policies.find(ref, installed), subject, code,
                               request_id, secret=SECRET)

    def participants(self, context_id=DELIVERY):
        with LearningStore(self.seed.location) as store:
            root = store.read_context(context_id)
            return {p.fields['subjectKey']: p.fields['roles']
                    for p in (store.read(EntityRef.model_validate(ref), owner=context_id)
                              for ref in root.fields['participants'])}

    def courses(self, subject):
        with LearningStore(self.seed.location) as store:
            installed = self.seed.policies.installed()
            return enrolled_courses(store, lambda ref: self.seed.policies.find(ref, installed), subject)


class LearnerGrantTest(unittest.TestCase):
    def policy(self, **learners):
        return TrustedPolicy.model_validate({
            'policy_ref': {'type': 'PolicySet', 'id': 'grant-policy', 'version': '1'},
            'subjects': {'admin': {'roles': ['ADMINISTRATOR'], 'actions': {'course': ['read', 'propose']}}},
            'scopes': {'course': {'contexts': ['course'], 'subjects': ['admin']},
                       'other': {'contexts': ['other'], 'subjects': ['admin']}},
            'learners': learners})

    def test_the_grant_gives_a_participant_the_learners_actions_and_scopes_in_that_context_only(self):
        policy = self.policy(course={'actions': ['read', 'interact', 'submit'], 'scopes': ['course']})
        granted = with_learner(policy, 'course', STUDENT)
        self.assertEqual(granted.subjects[STUDENT].roles, ['LEARNER'])
        self.assertEqual(granted.subjects[STUDENT].actions, {'course': ['read', 'interact', 'submit']})
        self.assertEqual(granted.scopes['course'].subjects, ['admin', STUDENT])
        self.assertEqual(granted.scopes['other'].subjects, ['admin'])
        self.assertIs(with_learner(policy, 'other', STUDENT), policy)
        # A subject the policy already names in the context keeps exactly what it names.
        self.assertIs(with_learner(policy, 'course', 'admin'), policy)

    def test_the_grant_never_holds_staff_actions(self):
        for action in ('propose', 'decide', 'apply', 'bootstrap'):
            with self.subTest(action), self.assertRaises(ValueError):
                self.policy(course={'actions': ['read', action]})

    def test_a_policy_without_a_grant_serializes_as_before(self):
        policy = self.policy()
        self.assertNotIn('learners', policy.model_dump(mode='json'))
        self.assertNotIn('learners', policy.model_dump_json())


@on_both_backends
class OpeningTest(EnrolmentCase):
    def test_opening_is_a_reviewed_policy_change_that_adds_the_learner_grant(self):
        with LearningStore(self.seed.location) as store:
            before = store.read_context(DELIVERY)
        result = self.propose_opening()
        policy = result.policy
        self.assertEqual(self.seed.policies.find(policy.policy_ref), policy)
        grant = policy.learners[DELIVERY]
        self.assertEqual(grant.actions, ['read', 'interact', 'submit'])
        self.assertEqual(grant.scopes, [name for name, scope in policy.scopes.items() if scope.contexts == [DELIVERY]])
        installed = self.seed.policies.find(EntityRef.model_validate(before.fields['policies']))
        self.assertEqual(policy.subjects, installed.subjects)
        self.assertEqual(policy.scopes, installed.scopes)
        with LearningStore(self.seed.location) as store:
            # Pending: the delivery keeps its policy and has no code.
            self.assertEqual(store.read_context(DELIVERY).ref, before.ref)
            proposal = store.read(result.proposal, owner=DELIVERY)
            candidates = {c.type: c for c in proposal_candidates(store, proposal)}
        self.assertEqual(set(candidates), {'PolicySet', 'ExecutionContext'})
        self.assertEqual(candidates['PolicySet'].fields['permissions'][-1],
                         ENROLMENT_POLICY + canonical(policy.model_dump(mode='json')))
        changed = {k for k in before.fields if before.fields[k] != candidates['ExecutionContext'].fields[k]}
        self.assertEqual(changed, {'policies'})
        with self.assertRaisesRegex(ValueError, 'not open to learners'):
            self.reset()
        self.assertFalse(self.read_code().open)
        self.seed.apply(result.proposal, 'open-1')
        with LearningStore(self.seed.location) as store:
            self.assertEqual(store.read_context(DELIVERY).fields['policies'], policy.policy_ref.model_dump())
        view = self.read_code()
        self.assertTrue(view.open)
        self.assertIsNone(view.code)

    def test_only_an_administrator_opens_a_course_and_manages_its_code(self):
        with self.assertRaises(AuthorizationError):
            self.propose_opening('open-by-learner', subject='learner')
        self.open_course()
        for name, call in (('read', self.read_code), ('reset', self.reset), ('disable', self.disable)):
            with self.subTest(name), self.assertRaises(AuthorizationError):
                call('learner')

    def test_a_course_already_open_is_not_opened_again(self):
        self.open_course()
        with self.assertRaisesRegex(ValueError, 'already open'):
            self.propose_opening('open-2')

    def test_students_are_added_only_once_the_course_is_open(self):
        before = self.seed.digests()
        with self.assertRaisesRegex(ValueError, 'not open to learners'):
            self.add([STUDENT])
        self.assertEqual(self.seed.digests(), before)

    def test_only_a_delivery_is_opened(self):
        with self.assertRaisesRegex(ValueError, 'Only a delivery'):
            self.propose_opening('open-draft', context_id=DELIVERY_TWO)


@on_both_backends
class CodeTest(EnrolmentCase):
    def setUp(self):
        super().setUp()
        self.open_course()

    def test_the_code_is_derived_from_the_host_secret_and_only_its_nonce_and_digest_are_stored(self):
        view = self.reset()
        code = view.code
        self.assertEqual(len(code), CODE_LENGTH)
        self.assertTrue(set(code) <= set(string.ascii_lowercase + '234567'))
        self.assertEqual(self.read_code().code, code)
        with LearningStore(self.seed.location) as store:
            record = store.enrolment_code(DELIVERY)
            self.assertEqual(course_code(SECRET, DELIVERY, record.nonce), code)
            self.assertEqual(record.digest, code_digest(SECRET, code))
            self.assertEqual(store.enrolment_context(record.digest), DELIVERY)
            self.assertEqual(record.responsible, self.staff)
            rows = store.db.execute('SELECT * FROM enrolment_codes').fetchall()
        self.assertEqual(len(rows), 1)
        self.assertNotIn(code, canonical([list(row) for row in rows]))
        self.assertNotEqual(course_code(b'another-host-secret-of-enough-length!', DELIVERY, record.nonce), code)

    def test_a_reset_gives_a_new_code_and_a_disabled_course_has_none(self):
        first = self.reset().code
        second = self.reset().code
        self.assertNotEqual(first, second)
        self.assertEqual(self.read_code().code, second)
        view = self.disable()
        self.assertTrue(view.open)
        self.assertIsNone(view.code)
        with LearningStore(self.seed.location) as store:
            self.assertIsNone(store.enrolment_code(DELIVERY))
        self.assertIsNone(self.read_code().code)

    def test_managing_the_code_leaves_the_alm_records_unchanged(self):
        def records():
            digests = self.seed.digests()
            digests.pop('enrolment_codes')
            return digests
        before = records()
        self.reset()
        self.reset()
        self.disable()
        self.assertEqual(records(), before)


@on_both_backends
class JoinTest(EnrolmentCase):
    def setUp(self):
        super().setUp()
        self.open_course()
        self.code = self.reset().code

    def test_a_subject_joins_with_the_code_and_is_a_learner_at_once(self):
        self.assertEqual(self.courses(STUDENT), ())
        course = self.join(STUDENT, self.code)
        self.assertEqual(course.context_id, DELIVERY)
        self.assertEqual(self.participants()[STUDENT], ['LEARNER'])
        self.assertEqual(self.courses(STUDENT), (course,))
        with self.seed.contexts.open(DELIVERY) as service:
            # No new policy version: the delivery's learner grant applies to the new participant.
            self.assertNotIn(STUDENT, service.policy.subjects)
            self.assertEqual(service.policy_for(DELIVERY, STUDENT).subjects[STUDENT].actions,
                             {DELIVERY: ['read', 'interact', 'submit']})
            view = service.course_view(DELIVERY, STUDENT)
            self.assertEqual(view.context_id, DELIVERY)
            self.assertTrue(view.materials)
            activity = next(e.ref for e in service._context(DELIVERY, STUDENT).snapshot.active_domain()
                            if e.type == 'ActivityDefinition' and e.fields['intent'] == 'ASSESS')
            evidence = service.submit_attempt(DELIVERY, STUDENT, activity, SYNTHETIC_ATTEMPT, request_id='attempt-1')
            self.assertEqual(service.own_progress(DELIVERY, STUDENT).evidence, (evidence,))
            root = service.store.read_context(DELIVERY)
            with self.assertRaises(AuthorizationError):
                service.propose(DELIVERY, STUDENT, (root.ref,), (), 'Synthetic')

    def test_joining_is_idempotent_by_request_id_and_by_subject(self):
        course = self.join(STUDENT, self.code)
        before = self.seed.digests()
        self.assertEqual(self.join(STUDENT, self.code), course)
        self.assertEqual(self.join(STUDENT, self.code, 'join-again'), course)
        self.assertEqual(self.seed.digests(), before)
        self.assertEqual(list(self.participants()).count(STUDENT), 1)

    def test_a_wrong_reset_or_disabled_code_is_refused_the_same_way_and_records_nothing(self):
        before = self.seed.digests()
        refusals = []
        for name, code in (('wrong', 'aaaaaaaa'), ('malformed', 'not a code!'), ('empty', '')):
            with self.subTest(name), self.assertRaises(EnrolmentRefused) as refused:
                self.join(STUDENT, code)
            refusals.append(str(refused.exception))
        old = self.code
        self.code = self.reset().code
        with self.assertRaises(EnrolmentRefused) as refused:
            self.join(STUDENT, old)
        refusals.append(str(refused.exception))
        self.disable()
        with self.assertRaises(EnrolmentRefused) as refused:
            self.join(STUDENT, self.code)
        refusals.append(str(refused.exception))
        self.assertEqual(len(set(refusals)), 1)
        self.assertEqual({k: v for k, v in self.seed.digests().items() if k != 'enrolment_codes'},
                         {k: v for k, v in before.items() if k != 'enrolment_codes'})
        self.assertNotIn(STUDENT, self.participants())

    def test_the_code_is_read_without_case_spaces_or_hyphens(self):
        spaced = '-'.join((self.code[:4].upper(), self.code[4:])) + ' '
        self.assertEqual(self.join(STUDENT, spaced).context_id, DELIVERY)

    def test_a_member_of_the_staff_does_not_join_as_a_learner(self):
        with self.assertRaisesRegex(StateConflict, 'already a member'):
            self.join(self.staff, self.code)

    def test_two_learners_who_joined_reach_only_their_own_records(self):
        self.join(STUDENT, self.code)
        self.join(OTHER_STUDENT, self.code, 'join-1')
        with self.seed.contexts.open(DELIVERY) as service:
            activity = next(e.ref for e in service._context(DELIVERY, STUDENT).snapshot.active_domain()
                            if e.type == 'ActivityDefinition' and e.fields['intent'] == 'ASSESS')
            mine = service.submit_attempt(DELIVERY, STUDENT, activity, SYNTHETIC_ATTEMPT, request_id='attempt-1')
            theirs = service.submit_attempt(DELIVERY, OTHER_STUDENT, activity, SYNTHETIC_ATTEMPT + ' (other)',
                                            request_id='attempt-1')
            self.assertEqual(service.own_progress(DELIVERY, STUDENT).evidence, (mine,))
            self.assertEqual(service.own_progress(DELIVERY, OTHER_STUDENT).evidence, (theirs,))
            snapshot = service._context(DELIVERY, STUDENT).snapshot
            self.assertNotIn(theirs.ref, snapshot.entities)
        self.assertNotEqual(learner_request_id(STUDENT, 'attempt-1'), learner_request_id(OTHER_STUDENT, 'attempt-1'))


@on_both_backends
class AddedLearnersTest(EnrolmentCase):
    """Students added by an administrator (part 2): at once, under the learner grant, with no new policy version."""

    def setUp(self):
        super().setUp()
        self.open_course()

    def changes(self, subject):
        with LearningStore(self.seed.location) as store:
            return [c for c in store.owned(DELIVERY, 'StateChange')
                    if c.fields['cause'] == {'type': 'Participant', 'id': f'{DELIVERY}:participant:{subject}',
                                             'version': c.fields['cause']['version']}]

    def test_an_administrator_adds_students_at_once_under_the_learner_grant(self):
        files = sorted(path.name for path in self.seed.policies.path.iterdir())
        with LearningStore(self.seed.location) as store:
            policies = store.read_context(DELIVERY).fields['policies']
        members = self.add([STUDENT, 'learner-3'])
        self.assertIn(Member(subject=STUDENT, roles=('LEARNER',)), members)
        self.assertIn(Member(subject='learner-3', roles=('LEARNER',)), members)
        self.assertEqual({k: v for k, v in self.participants().items() if k in (STUDENT, 'learner-3')},
                         {STUDENT: ['LEARNER'], 'learner-3': ['LEARNER']})
        # No proposal and no new policy version: the context keeps its policy, the directory its files.
        with LearningStore(self.seed.location) as store:
            self.assertEqual(store.read_context(DELIVERY).fields['policies'], policies)
            self.assertEqual([p.fields['status'] for p in store.owned(DELIVERY, 'ChangeProposal')
                              if p.fields['status'] != 'APPLIED'], [])
        self.assertEqual(sorted(path.name for path in self.seed.policies.path.iterdir()), files)
        [change] = self.changes(STUDENT)
        self.assertEqual(change.provenance.responsible, self.staff)
        self.assertIn(f'{STUDENT} added as LEARNER by {self.staff}', change.fields['change'])
        self.assertEqual([c.context_id for c in self.courses(STUDENT)], [DELIVERY])
        with self.seed.contexts.open(DELIVERY) as service:
            self.assertNotIn(STUDENT, service.policy.subjects)
            self.assertEqual(service.policy_for(DELIVERY, STUDENT).subjects[STUDENT].actions,
                             {DELIVERY: ['read', 'interact', 'submit']})
            self.assertEqual(service.course_view(DELIVERY, STUDENT).context_id, DELIVERY)

    def test_adding_is_idempotent_and_a_student_added_then_joining_records_nothing(self):
        self.add([STUDENT])
        before = self.seed.digests()
        self.add([STUDENT])
        self.add([STUDENT], 'add-again')
        self.assertEqual(self.join(STUDENT, self.reset().code).context_id, DELIVERY)
        after = self.seed.digests()
        after.pop('enrolment_codes'), before.pop('enrolment_codes')
        self.assertEqual(after, before)
        self.assertEqual(len(self.changes(STUDENT)), 1)
        # A learner who joined with the code and is added later is a learner already.
        self.join(OTHER_STUDENT, self.read_code().code)
        before = self.seed.digests()
        self.add([OTHER_STUDENT, 'learner'], 'add-joined')
        self.assertEqual(self.seed.digests(), before)

    def test_only_an_administrator_adds_students_and_never_a_member_of_the_staff(self):
        before = self.seed.digests()
        with self.assertRaises(AuthorizationError):
            self.add([STUDENT], subject='learner')
        # One member of the staff in the list refuses all of it: nobody is added.
        with self.assertRaisesRegex(ValueError, 'admin is already a member'):
            self.add([STUDENT, self.staff])
        for subjects in ([], [STUDENT, STUDENT]):
            with self.subTest(subjects), self.assertRaises(ValueError):
                self.add(subjects)
        self.assertEqual(self.seed.digests(), before)

    def test_adding_students_leaves_a_pending_proposal_applicable(self):
        member = self.seed.propose_member('learner-3', 'member-1')
        self.add([STUDENT])
        self.seed.apply(member.proposal, 'member-1')
        self.assertEqual(self.participants()[STUDENT], ['LEARNER'])
        self.assertEqual(self.participants()['learner-3'], ['LEARNER'])
        self.assertEqual([c.context_id for c in self.courses(STUDENT)], [DELIVERY])


@on_both_backends
class InactiveDeliveryTest(EnrolmentCase):
    activated = False

    def test_a_delivery_opened_before_activation_takes_learners_only_once_active(self):
        manifest = self.seed.manifest
        preview = TrustedPolicy.model_validate_json((self.seed.output / manifest.delivery_policy_preview).read_bytes())
        self.seed.policies.install('preview.json', preview)
        self.open_course()
        code = self.reset().code
        before = self.seed.digests()
        with self.assertRaises(EnrolmentRefused):
            self.join(STUDENT, code)
        self.assertEqual(self.seed.digests(), before)
        with self.seed.contexts.open(DELIVERY) as service:
            result = service.propose_activation(DELIVERY, self.staff,
                {'base_context': service.store.read_context(DELIVERY).ref}, request_id='activation')
        self.seed.apply(result.proposal, 'activation')
        self.assertEqual(self.join(STUDENT, code).context_id, DELIVERY)

    def test_students_added_before_activation_take_part_once_it_is_active(self):
        manifest = self.seed.manifest
        preview = TrustedPolicy.model_validate_json((self.seed.output / manifest.delivery_policy_preview).read_bytes())
        self.seed.policies.install('preview.json', preview)
        self.open_course()
        self.add([STUDENT])
        self.assertEqual(self.courses(STUDENT), ())
        with self.seed.contexts.open(DELIVERY) as service:
            result = service.propose_activation(DELIVERY, self.staff,
                {'base_context': service.store.read_context(DELIVERY).ref}, request_id='activation')
        self.seed.apply(result.proposal, 'activation')
        self.assertEqual([c.context_id for c in self.courses(STUDENT)], [DELIVERY])


@on_both_backends
class CourseVersionTest(EnrolmentCase):
    def setUp(self):
        super().setUp()
        self.open_course()
        self.code = self.reset().code

    def test_joining_leaves_a_pending_evaluation_draft_applicable(self):
        first, _ = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        self.join(STUDENT, self.code)
        self.seed.apply(proposal, 'apply-draft')
        self.assertEqual(self.participants()[STUDENT], ['LEARNER'])
        with self.seed.contexts.open(DELIVERY) as service:
            self.assertEqual(len(service.own_progress(DELIVERY, 'learner').evaluations), 1)

    def activity(self, intent, subject):
        with self.seed.contexts.open(DELIVERY) as service:
            return next(e.ref for e in service._context(DELIVERY, subject).snapshot.active_domain()
                        if e.type == 'ActivityDefinition' and e.fields['intent'] == intent)

    def submit(self, subject, intent, request_id):
        with self.seed.contexts.open(DELIVERY) as service:
            return service.submit_attempt(DELIVERY, subject, self.activity(intent, subject), SYNTHETIC_ATTEMPT,
                                          request_id=request_id).ref

    def occurrences(self):
        with LearningStore(self.seed.location) as store:
            return [store.read(EntityRef.model_validate(ref), owner=DELIVERY)
                    for ref in store.read_context(DELIVERY).fields['activityOccurrences']]

    def proposal_status(self, proposal):
        with LearningStore(self.seed.location) as store:
            return next(e for e in store.owned(DELIVERY, 'ChangeProposal') if e.id == proposal.id).fields['status']

    # D38 (option B, 19 November 2026): another learner's attempt leaves the draft applicable.
    def test_another_learners_attempt_leaves_a_pending_evaluation_draft_applicable(self):
        first, _ = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        self.join(STUDENT, self.code)
        evidence = self.submit(STUDENT, 'ASSESS', 'attempt-1')
        self.seed.apply(proposal, 'apply-draft')
        self.assertEqual(self.proposal_status(proposal), 'APPLIED')
        with self.seed.contexts.open(DELIVERY) as service:
            self.assertEqual(len(service.own_progress(DELIVERY, 'learner').evaluations), 1)
            self.assertEqual(service.own_progress(DELIVERY, STUDENT).evaluations, ())
        # The other learner's attempt, recorded after the draft, is kept by the application.
        self.assertIn(evidence.model_dump(), [ref for o in self.occurrences() for ref in o.fields['evidence']])
        self.assertEqual(self.participants()[STUDENT], ['LEARNER'])

    def test_the_evaluated_learners_new_attempt_at_the_assessment_makes_the_draft_stale(self):
        first, _ = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        self.submit('learner', 'ASSESS', 'attempt-again')
        with self.seed.contexts.open(DELIVERY) as service:
            service.decide(DELIVERY, self.staff, proposal, 'APPROVE', 'Synthetic review')
            with self.assertRaisesRegex(StateConflict, 'Proposal base is stale: the learner submitted a new attempt'):
                service.apply(DELIVERY, self.staff, proposal, 'apply-draft')
            self.assertEqual(service.own_progress(DELIVERY, 'learner').evaluations, ())
        self.assertEqual(self.proposal_status(proposal), 'STALE')

    def test_the_evaluated_learners_attempt_at_another_activity_leaves_the_draft_applicable(self):
        first, _ = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        self.submit('learner', 'PRACTICE', 'practice-1')
        self.seed.apply(proposal, 'apply-draft')
        self.assertEqual(self.proposal_status(proposal), 'APPLIED')

    def test_an_applied_evaluation_of_another_learner_still_makes_the_draft_stale(self):
        # D38: any change of the course other than another learner's attempt or a join still makes it stale.
        first, second = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        other = self.seed.draft(second, 'draft-second')
        self.seed.apply(other, 'apply-second')
        with self.seed.contexts.open(DELIVERY) as service:
            service.decide(DELIVERY, self.staff, proposal, 'APPROVE', 'Synthetic review')
            with self.assertRaisesRegex(StateConflict, r'^Proposal base is stale$'):
                service.apply(DELIVERY, self.staff, proposal, 'apply-first')
        self.assertEqual(self.proposal_status(proposal), 'STALE')

    def test_a_draft_after_another_learners_attempt_and_a_join_applies_once(self):
        first, _ = self.seed.attempts()
        proposal = self.seed.draft(first, 'draft-first')
        self.join(STUDENT, self.code)
        self.submit(STUDENT, 'ASSESS', 'attempt-1')
        self.join(OTHER_STUDENT, self.code, request_id='join-2')
        self.seed.apply(proposal, 'apply-draft')
        with self.seed.contexts.open(DELIVERY) as service:
            # The same operation again replays the recorded change; nothing more is applied.
            service.apply(DELIVERY, self.staff, proposal, 'apply-draft')
            self.assertEqual(len(service.own_progress(DELIVERY, 'learner').evaluations), 1)
        self.assertEqual(self.participants()[OTHER_STUDENT], ['LEARNER'])

    def test_a_staff_membership_applied_after_joins_and_attempts_keeps_them(self):
        member = self.seed.propose_member('learner-3', 'member-1')
        self.join(STUDENT, self.code)
        evidence = self.seed.attempts()
        with self.seed.contexts.open(DELIVERY) as service:
            service.decide(DELIVERY, self.staff, member.proposal, 'APPROVE', 'Synthetic membership review')
            service.apply(DELIVERY, self.staff, member.proposal, 'member-1')
            root = service.store.read_context(DELIVERY)
            self.assertEqual(root.fields['policies'], member.policy.policy_ref.model_dump())
            occurrences = [service.store.read(EntityRef.model_validate(ref), owner=DELIVERY)
                           for ref in root.fields['activityOccurrences']]
        self.assertEqual(self.participants()[STUDENT], ['LEARNER'])
        self.assertEqual(self.participants()['learner-3'], ['LEARNER'])
        recorded = {ref for occurrence in occurrences for ref in map(EntityRef.model_validate,
                                                                      occurrence.fields['evidence'])}
        self.assertTrue(set(evidence) <= recorded)
        # The joined learner keeps the grant of the new policy version, which carries it over.
        self.assertEqual([c.context_id for c in self.courses(STUDENT)], [DELIVERY])

    def test_a_staff_membership_naming_a_subject_who_joined_meanwhile_is_refused_at_application(self):
        member = self.seed.propose_member(STUDENT, 'member-1')
        self.join(STUDENT, self.code)
        with self.seed.contexts.open(DELIVERY) as service:
            service.decide(DELIVERY, self.staff, member.proposal, 'APPROVE', 'Synthetic membership review')
            with self.assertRaisesRegex(ValueError, 'already a member'):
                service.apply(DELIVERY, self.staff, member.proposal, 'member-1')
        self.assertEqual(self.participants()[STUDENT], ['LEARNER'])

    def test_a_pending_proposal_still_goes_stale_when_the_course_itself_changes(self):
        first = self.seed.propose_member('learner-3', 'member-1')
        second = self.seed.propose_member('learner-4', 'member-2')
        self.seed.apply(first.proposal, 'member-1')
        with self.seed.contexts.open(DELIVERY) as service:
            service.decide(DELIVERY, self.staff, second.proposal, 'APPROVE', 'Synthetic membership review')
            with self.assertRaisesRegex(StateConflict, 'Proposal base is stale'):
                service.apply(DELIVERY, self.staff, second.proposal, 'member-2')


if __name__ == '__main__':
    unittest.main()
