"""What a learner reads (S12, #136): their courses (D19), the course view (D20) and their own progress.

The seed's delivery has two synthetic learners. Each test activates it as the
operator and the staff would, records the learners' attempts through ``submit``
and has the staff decide evaluation drafts from synthetic assessor responses.
Temporary SQLite file or PostgreSQL test schema only; no model, provider or
network is used.
"""

from dataclasses import replace
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from learning.contracts import EntityRef
from learning.evaluation import EvaluationCommand
from learning.learner import course_view, enrolled_courses
from learning.membership import MembershipCommand
from learning.policies import AuthorizationError
from learning.store import LearningStore
from services.api_common.contexts import ContextServices, PolicyDirectory
from tests.authoring_cycle_fixtures import AUTH, DELIVERY, DELIVERY_TWO, SyntheticAssessor, evaluation_draft
from tests.seed import SYNTHETIC_ATTEMPT, build_seed, record_attempt
from tests.services.job_fixtures import activate_delivery
from tests.store_backends import block_network, new_store_location, on_both_backends


NO_NETWORK = "A learner's reads use no model, provider or network"
OTHER_ATTEMPT = 'Synthetic attempt of the first learner: a reminder to fictional Sam about EXAMPLE-02.'
# The types a course view may name: the validated course, never a proposal, decision, participant or record.
COURSE_TYPES = {'LearningOutcome', 'Topic', 'Strategy', 'ProcessNode', 'ActivityDefinition', 'Resource',
                'AssessmentSpecification', 'Rubric'}


def ref_types(value):
    """The type of every entity reference in a JSON value."""
    if isinstance(value, dict):
        if value.keys() == {'type', 'id', 'version'}:
            yield value['type']
        else:
            for item in value.values():
                yield from ref_types(item)
    elif isinstance(value, list):
        for item in value:
            yield from ref_types(item)


class LearnerSeed:
    """The seed with its delivery active; the learners' attempts and the staff's evaluations on request."""

    def __init__(self, case, name='learner.sqlite', open_delivery=True):
        temp = TemporaryDirectory()
        case.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.location = new_store_location(case, temp.name, name)
        self.output = self.root / 'seed'
        self.manifest = build_seed(self.output, self.location, open_delivery=open_delivery)
        self.policies = PolicyDirectory(self.output / self.manifest.policy_dir)
        self.contexts = ContextServices(str(self.location), self.policies)

    def activate(self):
        activate_delivery(self.output, self.location, self.manifest)
        return self

    def attempts(self):
        """The first learner's attempt, with its own text, and the second learner's seed attempt: their evidence."""
        with self.contexts.open(DELIVERY) as service:
            context = service._context(DELIVERY, self.manifest.learner)
            activity = next(e for e in context.snapshot.active_domain()
                            if e.type == 'ActivityDefinition' and e.fields['intent'] == 'ASSESS')
            first = service.submit(DELIVERY, self.manifest.learner, activity.ref, OTHER_ATTEMPT, 'attempt-learner').ref
        return first, record_attempt(self.output, self.location, self.manifest.second_learner)

    def draft(self, evidence, request_id):
        """The staff's evaluation draft on one attempt, from a synthetic assessor: its proposal."""
        with self.contexts.open(DELIVERY) as service:
            result = service.propose_evaluation(DELIVERY, self.manifest.staff,
                EvaluationCommand(evidence=evidence, mode='FORMATIVE'), request_id=request_id,
                assessor_factory=SyntheticAssessor(evaluation_draft(evidence)).factory)
        return result.proposal_refs[0]

    def apply(self, proposal, operation):
        with self.contexts.open(DELIVERY) as service:
            service.decide(DELIVERY, self.manifest.staff, proposal, 'APPROVE', 'Synthetic review')
            service.apply(DELIVERY, self.manifest.staff, proposal, operation)

    def propose_member(self, subject, request_id):
        """A pending D25 membership of ``subject`` as a learner, its policy installed as the API would."""
        with self.contexts.open(DELIVERY) as service:
            return service.propose_membership(DELIVERY, self.manifest.staff, MembershipCommand(
                base_context=service.store.read_context(DELIVERY).ref,
                members=[{'subject': subject, 'role': 'LEARNER'}]), request_id=request_id,
                install=lambda policy: self.policies.install(f'{request_id}.json', policy))

    def digests(self):
        with LearningStore(self.location) as store:
            return store.table_digests()


@on_both_backends
class LearnerCoursesTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self)

    def test_my_courses_are_active_deliveries_where_the_subject_is_learner_in_policy_and_participant(self):
        seed, manifest = self.seed, self.seed.manifest
        # Before activation the delivery is a draft, and its policy is not even installed.
        self.assertEqual(seed.contexts.enrolled(manifest.learner), ())
        seed.activate()
        for subject in (manifest.learner, manifest.second_learner):
            with self.subTest(subject):
                courses = seed.contexts.enrolled(subject)
                self.assertEqual([c.context_id for c in courses], [DELIVERY])
                self.assertEqual(courses[0].title, 'Synthetic business prompting syllabus')
        # The staff are not learners; the second delivery is still a draft; the authoring course has no learners.
        self.assertEqual(seed.contexts.enrolled(manifest.staff), ())
        self.assertEqual(seed.contexts.enrolled('nobody'), ())

    def test_a_member_whose_membership_is_pending_is_not_listed_until_it_is_applied(self):
        seed = self.seed.activate()
        before = seed.digests()
        result = seed.propose_member('learner-3', 'member-learner-3')
        # The new policy version is installed and grants the member, but the course still uses the previous one.
        self.assertIn('learner-3', seed.policies.find(result.policy.policy_ref).subjects)
        self.assertEqual(seed.contexts.enrolled('learner-3'), ())
        self.assertNotEqual(seed.digests(), before)
        seed.apply(result.proposal, 'member-learner-3')
        self.assertEqual([c.context_id for c in seed.contexts.enrolled('learner-3')], [DELIVERY])

    def test_a_learner_grant_without_a_participant_record_is_not_a_course(self):
        seed = self.seed.activate()
        with LearningStore(seed.location) as store:
            policy = seed.policies.find(EntityRef.model_validate(store.read_context(DELIVERY).fields['policies']))
            granted = policy.model_copy(update={'subjects': {**policy.subjects,
                                                             'learner-3': policy.subjects['learner']}})
            self.assertEqual(enrolled_courses(store, lambda ref: granted, 'learner-3'), ())
            self.assertEqual([c.context_id for c in enrolled_courses(store, lambda ref: granted, 'learner')],
                             [DELIVERY])
            # No installed policy for a context: nothing is listed from it.
            self.assertEqual(enrolled_courses(store, lambda ref: None, 'learner'), ())

    def test_listing_the_courses_writes_nothing(self):
        seed = self.seed.activate()
        before = seed.digests()
        seed.contexts.enrolled(seed.manifest.learner)
        self.assertEqual(seed.digests(), before)


@on_both_backends
class CourseViewTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self).activate()

    def view(self, subject, context_id=DELIVERY):
        with self.seed.contexts.open(context_id) as service:
            return service.course_view(context_id, subject)

    def test_the_view_is_the_validated_course_of_the_delivery(self):
        before = self.seed.digests()
        view = self.view(self.seed.manifest.learner)
        self.assertEqual(self.seed.digests(), before)
        self.assertEqual((view.context_id, view.title), (DELIVERY, 'Synthetic business prompting syllabus'))
        with LearningStore(self.seed.location) as store:
            root = store.read_context(DELIVERY)
            design = store.read(EntityRef.model_validate(root.fields['learningDesign']), owner=DELIVERY)
            bound = {store.read(EntityRef.model_validate(b), owner=DELIVERY).fields['resource']['id']
                     for b in root.fields['resourceBindings']}
        self.assertEqual(view.structure.ref, EntityRef.model_validate(design.fields['root']))
        self.assertEqual([o.ref for o in view.outcomes], [EntityRef.model_validate(o) for o in design.fields['outcomes']])
        self.assertEqual(view.structure.kind, 'PHASE')
        unit, = view.structure.children
        self.assertEqual((unit.kind, unit.name), ('UNIT', 'Prepare a fictional business prompt'))
        self.assertEqual(sorted(a.intent for a in unit.activities), ['ASSESS', 'EXPLAIN', 'PRACTICE'])
        assess = next(a for a in unit.activities if a.intent == 'ASSESS')
        self.assertEqual((assess.format, assess.expected_evidence), ('CRITERIA_BASED_PRODUCT', ('CRITERIA_BASED_PRODUCT',)))
        self.assertIn('Submit a fictional business reminder prompt', assess.instruction)
        self.assertEqual([c.name for c in view.competences], ['AI Interaction & Prompting'])
        self.assertEqual([s.name for s in view.strategies], ['ModellingAIPractices'])
        # Materials are the resources the delivery binds by reviewed bindings, never the authoring packages.
        self.assertTrue(view.materials)
        self.assertLessEqual({m.ref.id for m in view.materials}, bound)
        self.assertNotIn('package', ' '.join(m.title for m in view.materials))
        self.assertLessEqual({r for a in unit.activities for r in a.materials}, {m.ref for m in view.materials})
        assessment, = view.assessments
        self.assertEqual(assess.assessment, assessment.ref)
        self.assertEqual(assessment.activities, (assess.ref,))
        self.assertEqual(assessment.accepted_evidence, ('CRITERIA_BASED_PRODUCT',))
        self.assertIn('use fictional customer details only.', assessment.conditions)
        criterion, = assessment.rubric.criteria
        self.assertEqual((criterion.key, [level.key for level in criterion.levels]), ('clarity', ['unclear', 'clear']))

    def test_the_view_names_no_proposal_decision_participant_or_learner_record(self):
        self.seed.attempts()
        view = self.view(self.seed.manifest.learner).model_dump(mode='json')
        self.assertLessEqual(set(ref_types(view)), COURSE_TYPES)
        text = json.dumps(view)
        for absent in ('participant:', 'proposal-', 'decision-', 'evidence-', 'occurrence-', OTHER_ATTEMPT,
                       SYNTHETIC_ATTEMPT):
            self.assertNotIn(absent, text)

    def test_the_view_never_shows_an_answer_key(self):
        with self.seed.contexts.open(DELIVERY) as service:
            context = service._context(DELIVERY, self.seed.manifest.learner)
        snapshot = context.snapshot
        keyed = {ref: entity.model_copy(update={'fields': {**entity.fields, 'answerKey': 'SECRET-ANSWER-KEY'}})
                 if entity.type == 'AssessmentSpecification' else entity for ref, entity in snapshot.entities.items()}
        self.assertTrue(any('answerKey' in e.fields for e in keyed.values()))
        view = course_view(replace(context, snapshot=replace(snapshot, entities=keyed)))
        self.assertTrue(view.assessments)
        self.assertNotIn('SECRET-ANSWER-KEY', view.model_dump_json())
        self.assertNotIn('answer', view.model_dump_json().lower())

    def test_only_a_learner_of_an_active_delivery_reads_it(self):
        with self.assertRaises(AuthorizationError):
            self.view(self.seed.manifest.staff)
        with self.assertRaisesRegex(ValueError, 'not open to learners'):
            self.view(self.seed.manifest.learner, DELIVERY_TWO)
        with self.assertRaises(AuthorizationError):
            self.view(self.seed.manifest.learner, AUTH)


@on_both_backends
class OwnProgressTest(unittest.TestCase):
    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self).activate()

    def progress(self, subject):
        with self.seed.contexts.open(DELIVERY) as service:
            return service.own_progress(DELIVERY, subject)

    def test_a_learner_reads_only_their_own_records_and_only_applied_evaluations(self):
        seed, manifest = self.seed, self.seed.manifest
        first, second = seed.attempts()
        draft = seed.draft(first, 'draft-first')
        before = seed.digests()
        mine = self.progress(manifest.learner)
        self.assertEqual(seed.digests(), before)
        self.assertEqual([e.ref for e in mine.evidence], [first])
        self.assertEqual([e.content_or_locator for e in mine.evidence], [OTHER_ATTEMPT])
        self.assertEqual([o.evidence for o in mine.occurrences], [(first,)])
        # A pending evaluation draft is never shown.
        self.assertEqual((mine.evaluations, mine.learning_states), ((), ()))
        other = self.progress(manifest.second_learner)
        self.assertEqual([e.ref for e in other.evidence], [second])
        self.assertNotIn(OTHER_ATTEMPT, other.model_dump_json())

        seed.apply(draft, 'apply-first')
        mine = self.progress(manifest.learner)
        evaluation, = mine.evaluations
        self.assertEqual((evaluation.mode, evaluation.evidence), ('FORMATIVE', (first,)))
        judgment, = evaluation.judgments
        self.assertEqual((judgment.criterion_key, judgment.level_key, judgment.reason),
                         ('clarity', 'clear', 'The task, audience and tone are named.'))
        self.assertEqual(evaluation.result, 'Synthetic draft: the response meets the clarity criterion.')
        state, = mine.learning_states
        self.assertEqual(state.basis, (evaluation.ref,))
        other = self.progress(manifest.second_learner)
        self.assertEqual((other.evaluations, other.learning_states), ((), ()))
        self.assertNotIn(evaluation.ref.id, other.model_dump_json())

    def test_the_staff_have_no_progress_here(self):
        with self.assertRaises(AuthorizationError):
            self.progress(self.seed.manifest.staff)


@on_both_backends
class LearnerShowTest(unittest.TestCase):
    """The ``show`` gap of Chat 30: a learner-only subject's summary never names another learner (S12)."""

    def setUp(self):
        block_network(self, NO_NETWORK)
        self.seed = LearnerSeed(self).activate()

    def test_the_summary_of_a_learner_lists_only_their_own_participant_and_records(self):
        seed, manifest = self.seed, self.seed.manifest
        first, second = seed.attempts()
        seed.apply(seed.draft(first, 'draft-first'), 'apply-first')
        with seed.contexts.open(DELIVERY) as service:
            shown = service.show(DELIVERY, manifest.second_learner)
            staff = service.show(DELIVERY, manifest.staff)
        fields = shown['context']['fields']
        self.assertEqual([p['id'] for p in fields['participants']], [f'{DELIVERY}:participant:{manifest.second_learner}'])
        self.assertEqual(len(fields['activityOccurrences']), 1)
        self.assertEqual(fields['learningStates'], [])
        roots = [e for e in shown['entities'] if e['type'] == 'ExecutionContext' and e['id'] == DELIVERY]
        self.assertEqual(roots, [shown['context']])
        text = json.dumps(shown)
        self.assertNotIn(first.id, text)
        self.assertNotIn(f'participant:{manifest.learner}"', text)
        self.assertIn(second.id, text)
        # The staff still see every participant and record of the course.
        self.assertEqual(len(staff['context']['fields']['participants']), 3)
        self.assertEqual(len(staff['context']['fields']['activityOccurrences']), 2)
        self.assertEqual(len(staff['context']['fields']['learningStates']), 1)


if __name__ == '__main__':
    unittest.main()
