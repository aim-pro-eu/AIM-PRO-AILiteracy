"""The runtime assessor (G7; S11, #129): how D4 is lifted.

An import configures the EVALUATOR runtime worker, so activation of a delivery
with ASSESS activities is no longer refused for want of a runtime role. A subject
with ``propose`` and the ``ASSESSOR`` role starts an evaluation draft on one
observed attempt: ``learner-response-evaluator`` judges each rubric criterion,
deterministic code builds and checks the ``Evaluation``, and a person decides and
applies it. Temporary SQLite file or PostgreSQL test schema only; the model
responses are synthetic and no model client is built.
"""

from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from pydantic import ValidationError

from learning.assessment import validate_evaluation
from learning.contracts import EntityRef
from learning.decisions import proposal_candidates
from learning.evaluation import (ATTEMPTS, EVALUATOR, FAILED, NOT_CHECKED, EvaluationCommand, EvaluationDraft,
                                 check_profile)
from learning.membership import MembershipCommand
from learning.metamodel import load_contract
from learning.policies import AuthorizationError
from learning.releases import RUNTIME_WORKERS, activation_findings
from learning.service import LearningService
from learning.store import LearningStore, StateConflict
from tests.authoring_cycle_fixtures import (AUTH, DELIVERY, ProductionAuthoring, SyntheticAssessor, evaluation_draft,
                                            trusted_policy)
from tests.store_backends import block_network, new_store_location, on_both_backends


ATTEMPT = ('Synthetic attempt: write a polite reminder to fictional Alex about EXAMPLE-01. '
           'The fictional audience supplies context; the polite tone constrains the response.')


class RuntimeAssessorTest(unittest.TestCase):
    def setUp(self):
        block_network(self, 'Runtime assessor tests must not use the network or models',
                      'crewai.LLM', 'agent_system.runtime.LLMFactory.__call__')
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = new_store_location(self, self.temp.name, 'assessor.sqlite')
        self.store = LearningStore(self.path)
        self.addCleanup(self.store.close)
        self.installed = {}
        policy = trusted_policy()
        self.installed[policy.policy_ref] = policy
        self.service = self.serve(policy)
        for context_id in (AUTH, DELIVERY):
            self.service.bootstrap(context_id, 'admin')
        self.author = ProductionAuthoring(self.service)

    def serve(self, policy):
        return LearningService(self.store, load_contract(), policy,
                               Mock(side_effect=AssertionError('The assessor never runs the Orchestrator')),
                               policies=self.installed.get)

    def imported(self):
        """The production release and import, with the preview installed by the operator."""
        author = self.author
        author.curator()
        for kind in ('ASSESSMENT', 'TEACHER_CONTENT', 'TRAINER_CONTENT'):
            author.review_and_apply(AUTH, author.generate(kind), 'approve-' + kind)
        author.configure_completion()
        _, release = author.release(approve=True)
        result = author.delivery_import(release)
        author.review_and_apply(DELIVERY, self.store.read(result.proposal, owner=DELIVERY), 'import-1')
        self.installed[result.policy_preview.policy_ref] = result.policy_preview
        return result, self.serve(result.policy_preview)

    def activate(self, delivery):
        activation = delivery.propose_activation(DELIVERY, 'admin',
            {'base_context': self.store.read_context(DELIVERY).ref}, request_id='activate')
        self.author.review_and_apply(DELIVERY, self.store.read(activation.proposal, owner=DELIVERY), 'activate',
                                     service=delivery)

    def activated(self):
        result, delivery = self.imported()
        self.activate(delivery)
        return result, delivery

    def activity(self, delivery, intent):
        context = delivery._context(DELIVERY, 'learner')
        return next(e for e in context.snapshot.active_domain()
                    if e.type == 'ActivityDefinition' and e.fields['intent'] == intent)

    def attempt(self, delivery, intent='ASSESS', request_id='attempt-1'):
        return delivery.submit(DELIVERY, 'learner', self.activity(delivery, intent).ref, ATTEMPT, request_id)

    def admit(self, delivery, subject, role, request_id):
        """An administrator adds a member (D25); the API would install the new policy version."""
        result = delivery.propose_membership(DELIVERY, 'admin', MembershipCommand(
            base_context=self.store.read_context(DELIVERY).ref, subject=subject, role=role),
            request_id=request_id, install=lambda policy: self.installed.__setitem__(policy.policy_ref, policy))
        delivery.decide(DELIVERY, 'admin', result.proposal, 'APPROVE', 'Synthetic membership review')
        delivery.apply(DELIVERY, 'admin', result.proposal, request_id)
        return self.serve(result.policy)

    def draft(self, service, subject, evidence, mode='FORMATIVE', request_id='draft-1', assessor=None):
        assessor = assessor or SyntheticAssessor(evaluation_draft(evidence.ref))
        result = service.propose_evaluation(DELIVERY, subject, EvaluationCommand(evidence=evidence.ref, mode=mode),
                                            request_id=request_id, assessor_factory=assessor.factory)
        return result, assessor

    def evaluation(self, result):
        return self.candidate(result.proposal_refs[0])

    def candidate(self, ref):
        proposal = self.store.read(ref, owner=DELIVERY)
        (candidate,) = proposal_candidates(self.store, proposal)
        return proposal, candidate


@on_both_backends
class ActivationTest(RuntimeAssessorTest):
    def test_an_import_configures_the_evaluator_and_the_delivery_activates(self):
        self.assertEqual(RUNTIME_WORKERS['EVALUATOR'], EVALUATOR)
        result, delivery = self.imported()
        self.assertEqual(set(result.preview.workers), {'lesson-explainer', 'guided-practice-coach', EVALUATOR})
        context = delivery._context(DELIVERY, 'admin')
        _, findings = activation_findings(self.store, context)
        self.assertEqual([f.code for f in findings if f.severity == 'BLOCKING'], [])
        evaluator = next(e for e in context.snapshot.active_domain()
                         if e.type == 'AgentSpecialization' and e.fields['registryName'] == EVALUATOR)
        self.assertEqual((evaluator.fields['role'], evaluator.fields['category']), ('EVALUATOR', 'EVALUATOR'))
        self.assertEqual([c['capability'] for c in evaluator.fields['capabilities']], ['search_documents'])
        self.activate(delivery)
        root = self.store.read_context(DELIVERY)
        self.assertEqual((root.fields['mode'], root.fields['status']), ('LEARNING', 'ACTIVE'))

    def test_an_intent_without_a_runtime_role_keeps_its_finding_without_d4(self):
        with patch.dict('learning.releases.RUNTIME_WORKERS', {'TEACHER': 'lesson-explainer',
                                                              'TRAINER': 'guided-practice-coach'}, clear=True):
            _, delivery = self.imported()
        _, findings = activation_findings(self.store, delivery._context(DELIVERY, 'admin'))
        refused = [f for f in findings if f.code == 'RELEASE_RUNTIME_ROLE']
        self.assertEqual({f.target for f in refused}, {self.activity(delivery, 'ASSESS').id})
        self.assertFalse(any('D4' in f.reason for f in refused))

    def test_the_evaluator_profile_is_checked(self):
        from agent_system.config import parse_agent_file
        config = parse_agent_file(Path(__file__).resolve().parents[1] / 'agents' / (EVALUATOR + '.md'))
        check_profile(config)
        for change in ({'mode': 'PREPARATION'}, {'expected_output': 'CHANGE_PROPOSAL'}, {'skills': ['socratic']},
                       {'category': 'teacher'}):
            with self.assertRaisesRegex(ValueError, 'runtime assessor profile'):
                check_profile(config.model_copy(update=change))


@on_both_backends
class EvaluationDraftTest(RuntimeAssessorTest):
    def test_an_assessor_draft_stays_a_proposal_until_a_person_decides_and_applies_it(self):
        _, delivery = self.activated()
        practice = self.attempt(delivery, 'PRACTICE', 'practice-1')
        evidence = self.attempt(delivery)
        result, assessor = self.draft(delivery, 'admin', evidence)
        self.assertEqual((result.kind, result.application_status), ('PROPOSAL', 'pending'))
        self.assertEqual(len(assessor.prompts), 1)
        prompt = assessor.prompts[0]
        # The model reads the rubric and the learner's response, never the learner's identity or the practice attempt.
        self.assertIn(ATTEMPT, prompt)
        self.assertIn('clarity', prompt)
        self.assertNotIn('"learner"', prompt)
        self.assertNotIn(practice.id, prompt)
        proposal, candidate = self.evaluation(result)
        self.assertEqual(proposal.fields['status'], 'AWAITING_DECISION')
        self.assertEqual(proposal.provenance.responsible, 'admin')
        context = delivery._context(DELIVERY, 'admin')
        activity = context.snapshot.get(evidence.fields['activity'])
        evaluator = next(e for e in context.snapshot.active_domain()
                         if e.type == 'AgentSpecialization' and e.fields['registryName'] == EVALUATOR)
        fields = candidate.fields
        self.assertEqual(candidate.type, 'Evaluation')
        self.assertEqual(fields['context']['id'], DELIVERY)
        self.assertEqual(fields['evidence'], [evidence.ref.model_dump()])
        self.assertEqual(fields['specification'], activity.fields['assessmentSpec'])
        self.assertEqual(fields['mode'], 'FORMATIVE')
        self.assertEqual(fields['assistedBy'], evaluator.ref.model_dump())
        self.assertEqual(fields['criterionJudgments'], [{'criterionKey': 'clarity', 'levelKey': 'clear',
            'evidenceRefs': [evidence.ref.model_dump()], 'reason': 'The task, audience and tone are named.'}])
        self.assertEqual(fields['result'], 'Synthetic draft: the response meets the clarity criterion.')
        self.assertNotIn('humanDecision', fields)
        self.assertFalse(validate_evaluation(candidate, context.snapshot))
        self.assertFalse(self.store.read_context(DELIVERY).fields['learningStates'])
        with self.assertRaises(ValueError):
            delivery.apply(DELIVERY, 'admin', proposal.ref, 'undecided')
        # The requester decides and applies it (owner decision 8).
        self.author.review_and_apply(DELIVERY, proposal, 'evaluation-1', service=delivery)
        context = delivery._context(DELIVERY, 'admin')
        (state,) = [context.snapshot.get(r) for r in context.snapshot.context.fields['learningStates']]
        self.assertEqual((state.fields['progress'], state.fields['verification']), ('IN_PROGRESS', 'UNVERIFIED'))
        self.assertEqual(state.fields['learner'], evidence.fields['learner'])

    def test_a_formal_evaluation_is_recorded_with_its_mode(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        result, _ = self.draft(delivery, 'admin', evidence, mode='FORMAL')
        proposal, candidate = self.evaluation(result)
        self.assertEqual(candidate.fields['mode'], 'FORMAL')
        self.author.review_and_apply(DELIVERY, proposal, 'evaluation-1', service=delivery)
        context = delivery._context(DELIVERY, 'admin')
        (state,) = [context.snapshot.get(r) for r in context.snapshot.context.fields['learningStates']]
        # No verification rule is authored: a FORMAL evaluation verifies nothing on its own.
        self.assertEqual((state.fields['progress'], state.fields['verification']), ('IN_PROGRESS', 'UNVERIFIED'))

    def test_an_explicit_unknown_level_is_admissible(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        assessor = SyntheticAssessor(evaluation_draft(evidence.ref, level=None))
        result, _ = self.draft(delivery, 'admin', evidence, assessor=assessor)
        _, candidate = self.evaluation(result)
        self.assertNotIn('levelKey', candidate.fields['criterionJudgments'][0])

    def test_the_model_supplies_only_judgments_and_the_result(self):
        valid = evaluation_draft(EntityRef(type='LearningEvidence', id='evidence-x', version='1')).model_dump(mode='json')
        for extra in ({'mode': 'FORMAL'}, {'assistedBy': {'type': 'AgentSpecialization', 'id': 'x', 'version': '1'}},
                      {'context': {'type': 'ExecutionContext', 'id': DELIVERY, 'version': '1'}},
                      {'specification': {'type': 'AssessmentSpecification', 'id': 'x', 'version': '1'}}):
            with self.assertRaises(ValidationError):
                EvaluationDraft.model_validate({**valid, **extra})


@on_both_backends
class RetryTest(RuntimeAssessorTest):
    def test_a_draft_that_fails_the_checks_goes_back_with_the_fixed_reason(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        assessor = SyntheticAssessor(evaluation_draft(evidence.ref, level='excellent'), evaluation_draft(evidence.ref))
        result, _ = self.draft(delivery, 'admin', evidence, assessor=assessor)
        self.assertEqual(result.kind, 'PROPOSAL')
        self.assertEqual(len(assessor.prompts), 2)
        retry = assessor.prompts[1]
        self.assertIn('The evaluation lacks consistent and admissible evidence or criteria.', retry)
        self.assertIn('excellent', retry)
        _, candidate = self.evaluation(result)
        self.assertEqual(candidate.fields['criterionJudgments'][0]['levelKey'], 'clear')

    def test_three_failing_drafts_end_the_request_in_fixed_words(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        bad = evaluation_draft(evidence.ref, criterion='invented', result='MODEL TEXT that must not leak')
        assessor = SyntheticAssessor(*(bad,) * ATTEMPTS)
        before = self.store.owned(DELIVERY, 'ChangeProposal')
        result, _ = self.draft(delivery, 'admin', evidence, assessor=assessor)
        self.assertEqual((result.kind, result.content), ('FAILURE', FAILED))
        self.assertEqual(len(assessor.prompts), ATTEMPTS)
        self.assertEqual(self.store.owned(DELIVERY, 'ChangeProposal'), before)
        self.assertFalse(self.store.owned(DELIVERY, 'Evaluation'))
        # The ended request replays its failure without a model.
        again, _ = self.draft(delivery, 'admin', evidence, assessor=SyntheticAssessor())
        self.assertEqual(again, result)

    def test_an_unstructured_response_counts_as_a_failed_draft(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        assessor = SyntheticAssessor(ValueError('not a draft'), evaluation_draft(evidence.ref))
        result, _ = self.draft(delivery, 'admin', evidence, assessor=assessor)
        self.assertEqual(result.kind, 'PROPOSAL')
        self.assertIn(NOT_CHECKED, assessor.prompts[1])

    def test_a_model_error_fails_the_request_without_model_text(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        assessor = SyntheticAssessor(RuntimeError('provider said something'))
        result, _ = self.draft(delivery, 'admin', evidence, assessor=assessor)
        self.assertEqual((result.kind, result.content), ('FAILURE', FAILED))


@on_both_backends
class AuthorityTest(RuntimeAssessorTest):
    def test_a_learner_cannot_start_a_draft_and_no_model_is_built(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        factory = Mock(side_effect=AssertionError('Authorization comes before any model'))
        with self.assertRaises(AuthorizationError):
            delivery.propose_evaluation(DELIVERY, 'learner', EvaluationCommand(evidence=evidence.ref, mode='FORMATIVE'),
                                        request_id='by-learner', assessor_factory=factory)
        factory.assert_not_called()
        self.assertIsNone(self.store.request_record('by-learner', DELIVERY))

    def test_starting_a_draft_needs_the_assessor_role(self):
        _, delivery = self.activated()
        delivery = self.admit(delivery, 'teacher-2', 'CONTENT_RESPONSIBLE', 'member-teacher')
        evidence = self.attempt(delivery)
        factory = Mock(side_effect=AssertionError('Authorization comes before any model'))
        with self.assertRaisesRegex(AuthorizationError, 'assessment authority'):
            delivery.propose_evaluation(DELIVERY, 'teacher-2', EvaluationCommand(evidence=evidence.ref, mode='FORMAL'),
                                        request_id='by-teacher', assessor_factory=factory)
        factory.assert_not_called()

    def test_an_added_assessor_drafts_decides_and_applies(self):
        _, delivery = self.activated()
        delivery = self.admit(delivery, 'assessor-1', 'ASSESSOR', 'member-assessor')
        evidence = self.attempt(delivery)
        result, _ = self.draft(delivery, 'assessor-1', evidence)
        proposal, _ = self.evaluation(result)
        self.assertEqual(proposal.provenance.responsible, 'assessor-1')
        delivery.decide(DELIVERY, 'assessor-1', proposal.ref, 'APPROVE', 'Synthetic assessor review')
        delivery.apply(DELIVERY, 'assessor-1', proposal.ref, 'evaluation-1')
        self.assertEqual(len(self.store.read_context(DELIVERY).fields['learningStates']), 1)

    def test_an_identical_request_replays_and_a_conflicting_reuse_is_refused(self):
        _, delivery = self.activated()
        evidence = self.attempt(delivery)
        first, _ = self.draft(delivery, 'admin', evidence)
        factory = Mock(side_effect=AssertionError('A replay builds no model'))
        command = EvaluationCommand(evidence=evidence.ref, mode='FORMATIVE')
        self.assertEqual(delivery.propose_evaluation(DELIVERY, 'admin', command, request_id='draft-1',
                                                     assessor_factory=factory), first)
        with self.assertRaises(StateConflict):
            delivery.propose_evaluation(DELIVERY, 'admin', command.model_copy(update={'mode': 'FORMAL'}),
                                        request_id='draft-1', assessor_factory=factory)
        factory.assert_not_called()

    def test_inputs_are_refused_before_any_model(self):
        result, delivery = self.imported()
        factory = Mock(side_effect=AssertionError('Refused inputs build no model'))
        def refused(evidence, pattern, service=delivery):
            with self.assertRaisesRegex(ValueError, pattern):
                service.propose_evaluation(DELIVERY, 'admin', {'evidence': evidence, 'mode': 'FORMATIVE'},
                                           request_id='refused', assessor_factory=factory)
        missing = {'type': 'LearningEvidence', 'id': 'evidence-missing', 'version': '1'}
        refused(missing, 'active delivery')
        self.activate(delivery)
        refused(missing, 'observed attempt')
        refused(self.attempt(delivery, 'PRACTICE', 'practice-1').ref.model_dump(), 'assessment activity')
        refused(self.activity(delivery, 'ASSESS').ref.model_dump(), 'observed attempt')
        factory.assert_not_called()
        with self.assertRaises(ValidationError):
            EvaluationCommand.model_validate({'evidence': missing, 'mode': 'SUMMATIVE'})


@on_both_backends
class CommandLineTest(RuntimeAssessorTest):
    def test_the_cli_proposes_an_evaluation_with_the_runtime_assessor(self):
        result, delivery = self.activated()
        evidence = self.attempt(delivery)
        policy = Path(self.temp.name) / 'delivery-policy.json'
        policy.write_text(result.policy_preview.model_dump_json())
        assessor = SyntheticAssessor(evaluation_draft(evidence.ref))
        output, errors = StringIO(), StringIO()
        from learning.__main__ import main
        with patch('learning.__main__._runtime_assessor', assessor.factory), redirect_stdout(output), \
                redirect_stderr(errors):
            code = main(['--db', str(self.path), '--policy', str(policy), '--subject', 'admin', '--context', DELIVERY,
                         'propose-evaluation', '--evidence', evidence.ref.model_dump_json(), '--mode', 'FORMATIVE',
                         '--request-id', 'cli-draft'])
        self.assertEqual(code, 0, errors.getvalue())
        answer = json.loads(output.getvalue())
        self.assertEqual(answer['kind'], 'PROPOSAL')
        _, candidate = self.candidate(EntityRef.model_validate(answer['proposal_refs'][0]))
        self.assertEqual(candidate.fields['evidence'], [evidence.ref.model_dump()])


if __name__ == '__main__':
    unittest.main()
