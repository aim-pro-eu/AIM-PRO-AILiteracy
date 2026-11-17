"""Course membership (D25, option A; S11, #129).

An administrator of a course adds a member: the command writes a new version of
the trusted policy through the host's installer and proposes the member's
``Participant`` with the context's new ``policies`` reference. A person decides
and applies it; the member has no authority before. Temporary SQLite file or
PostgreSQL test schema only; no network and no model.
"""

from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from pydantic import ValidationError

from learning.decisions import create_proposal, proposal_candidates, save_proposal
from learning.membership import MEMBER_ACTIONS, MEMBERSHIP_POLICY, MembershipCommand
from learning.metamodel import load_contract
from learning.policies import AuthorizationError
from learning.releases import ActivationRefused, activation_findings
from learning.service import LearningService
from learning.store import LearningStore, StateConflict, canonical
from tests.authoring_cycle_fixtures import AUTH, DELIVERY, ProductionAuthoring, entity, trusted_policy
from tests.store_backends import block_network, new_store_location, on_both_backends
from tests.test_releases import SIMULATED_ASSESSOR


class MembershipTest(unittest.TestCase):
    def setUp(self):
        block_network(self, 'Membership tests must not use the network or models',
                      'crewai.LLM', 'agent_system.runtime.LLMFactory.__call__')
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = LearningStore(new_store_location(self, self.temp.name, 'membership.sqlite'))
        self.addCleanup(self.store.close)
        self.installed = {}
        policy = trusted_policy()
        self.installed[policy.policy_ref] = policy
        self.service = self.serve(policy)
        for context_id in (AUTH, DELIVERY):
            self.service.bootstrap(context_id, 'admin')

    def serve(self, policy):
        return LearningService(self.store, load_contract(), policy,
                               Mock(side_effect=AssertionError('Membership must not construct agents')),
                               policies=self.installed.get)

    def install(self, policy):
        self.installed[policy.policy_ref] = policy

    def command(self, context_id, subject, role):
        return MembershipCommand(base_context=self.store.read_context(context_id).ref, subject=subject, role=role)

    def propose(self, service, context_id, subject, role, request_id='member-1', install=None):
        return service.propose_membership(context_id, 'admin', self.command(context_id, subject, role),
                                          request_id=request_id, install=install or self.install)

    def admit(self, service, context_id, subject, role, request_id='member-1'):
        result = self.propose(service, context_id, subject, role, request_id)
        service.decide(context_id, 'admin', result.proposal, 'APPROVE', 'Synthetic membership review')
        service.apply(context_id, 'admin', result.proposal, request_id)
        return result, self.serve(result.policy)


@on_both_backends
class MembershipCommandTest(MembershipTest):
    def test_an_administrator_adds_a_member_who_has_authority_only_after_application(self):
        result = self.propose(self.service, AUTH, 'teacher-2', 'CONTENT_RESPONSIBLE')
        policy = result.policy
        self.assertIn(policy.policy_ref, self.installed)
        self.assertEqual(policy.policy_ref.id, trusted_policy().policy_ref.id)
        self.assertNotEqual(policy.policy_ref.version, trusted_policy().policy_ref.version)
        self.assertEqual(policy.subjects['teacher-2'].roles, ['CONTENT_RESPONSIBLE'])
        self.assertEqual(policy.subjects['teacher-2'].actions, {AUTH: MEMBER_ACTIONS['CONTENT_RESPONSIBLE']})
        self.assertIn('teacher-2', policy.scopes['wp3'].subjects)
        self.assertEqual({k: v for k, v in policy.subjects.items() if k != 'teacher-2'}, trusted_policy().subjects)
        # Pending: the context keeps its policy and the new member cannot act.
        root = self.store.read_context(AUTH)
        self.assertEqual(root.fields['policies'], trusted_policy().policy_ref.model_dump())
        with self.assertRaises(ValueError):
            self.serve(policy)._context(AUTH, 'teacher-2')
        proposal = self.store.read(result.proposal, owner=AUTH)
        candidates = {c.type: c for c in proposal_candidates(self.store, proposal)}
        self.assertEqual(set(candidates), {'Participant', 'PolicySet', 'ExecutionContext'})
        self.assertEqual(candidates['Participant'].ref, result.participant)
        self.assertEqual(candidates['Participant'].fields['roles'], ['CONTENT_RESPONSIBLE'])
        self.assertEqual(candidates['PolicySet'].fields['permissions'][-1],
                         MEMBERSHIP_POLICY + canonical(policy.model_dump(mode='json')))
        changed = {k for k in root.fields if root.fields[k] != candidates['ExecutionContext'].fields[k]}
        self.assertEqual(changed, {'participants', 'policies'})
        self.service.decide(AUTH, 'admin', result.proposal, 'APPROVE', 'Synthetic membership review')
        self.service.apply(AUTH, 'admin', result.proposal, 'member-1')
        member = self.serve(policy)
        self.assertEqual(self.store.read_context(AUTH).fields['policies'], policy.policy_ref.model_dump())
        context = member._context(AUTH, 'teacher-2')
        self.assertEqual(context.participant.fields['roles'], ['CONTENT_RESPONSIBLE'])
        # The old policy no longer opens the context.
        with self.assertRaises(ValueError):
            self.service._context(AUTH, 'admin')
        member._context(AUTH, 'admin')

    def test_only_an_administrator_may_propose_a_membership(self):
        result, service = self.admit(self.service, AUTH, 'teacher-2', 'CONTENT_RESPONSIBLE')
        command = self.command(AUTH, 'observer-1', 'OBSERVER')
        with self.assertRaisesRegex(ValueError, 'administrative authority'):
            service.propose_membership(AUTH, 'teacher-2', command, request_id='by-teacher', install=self.install)
        with self.assertRaises(ValueError):
            service.propose_membership(AUTH, 'learner', command, request_id='by-learner', install=self.install)
        self.assertEqual(len(self.installed), 2)

    def test_an_administrator_reads_the_members_with_their_roles_in_the_course(self):
        _, service = self.admit(self.service, AUTH, 'teacher-2', 'CONTENT_RESPONSIBLE')
        self.assertEqual([m.model_dump(mode='json') for m in service.members(AUTH, 'admin')], [
            {'subject': 'admin', 'roles': ['ADMINISTRATOR', 'CONTENT_RESPONSIBLE', 'ASSESSOR']},
            {'subject': 'teacher-2', 'roles': ['CONTENT_RESPONSIBLE']}])
        with self.assertRaisesRegex(AuthorizationError, 'administrative authority'):
            service.members(AUTH, 'teacher-2')
        with self.assertRaises(ValueError):
            self.service.members(DELIVERY, 'learner')

    def test_administrator_cannot_be_granted_and_existing_members_are_refused(self):
        for role in ('ADMINISTRATOR', 'TEACHER', ''):
            with self.assertRaises(ValidationError):
                self.command(AUTH, 'someone', role)
        with self.assertRaisesRegex(ValueError, 'already a member'):
            self.propose(self.service, AUTH, 'admin', 'ASSESSOR')
        with self.assertRaisesRegex(ValueError, 'already a member'):
            self.propose(self.service, DELIVERY, 'learner', 'ASSESSOR')
        self.assertEqual(len(self.installed), 1)

    def test_a_subject_of_another_context_keeps_its_grants_there(self):
        result, _ = self.admit(self.service, AUTH, 'learner', 'OBSERVER')
        grant = result.policy.subjects['learner']
        self.assertEqual(grant.roles, ['LEARNER', 'OBSERVER'])
        self.assertEqual(grant.actions[AUTH], ['read'])
        self.assertEqual(grant.actions[DELIVERY], trusted_policy().subjects['learner'].actions[DELIVERY])

    def test_the_same_request_replays_and_a_conflicting_reuse_is_refused(self):
        install = Mock(side_effect=self.install)
        first = self.propose(self.service, AUTH, 'assessor-1', 'ASSESSOR', install=install)
        again = self.propose(self.service, AUTH, 'assessor-1', 'ASSESSOR', install=install)
        self.assertEqual(again, first)
        install.assert_called_once_with(first.policy)
        with self.assertRaises(StateConflict):
            self.propose(self.service, AUTH, 'assessor-2', 'ASSESSOR', install=install)

    def test_a_failed_installation_records_nothing(self):
        before = self.store.owned(AUTH, 'ChangeProposal')
        with self.assertRaisesRegex(OSError, 'disk full'):
            self.propose(self.service, AUTH, 'assessor-1', 'ASSESSOR', install=Mock(side_effect=OSError('disk full')))
        self.assertEqual(self.store.owned(AUTH, 'ChangeProposal'), before)
        self.propose(self.service, AUTH, 'assessor-1', 'ASSESSOR', request_id='member-1')

    def test_application_needs_the_exact_membership_policy_installed(self):
        result = self.propose(self.service, AUTH, 'assessor-1', 'ASSESSOR')
        self.service.decide(AUTH, 'admin', result.proposal, 'APPROVE', 'Synthetic membership review')
        del self.installed[result.policy.policy_ref]
        with self.assertRaisesRegex(ValueError, 'membership policy is not installed'):
            self.service.apply(AUTH, 'admin', result.proposal, 'member-1')
        self.installed[result.policy.policy_ref] = result.policy.model_copy(update={'rule_bindings': []})
        with self.assertRaisesRegex(ValueError, 'membership policy is not installed'):
            self.service.apply(AUTH, 'admin', result.proposal, 'member-1')
        self.installed[result.policy.policy_ref] = result.policy
        self.service.apply(AUTH, 'admin', result.proposal, 'member-1')

    def test_a_generic_proposal_cannot_add_a_member_policy(self):
        result = self.propose(self.service, AUTH, 'assessor-1', 'ASSESSOR')
        candidates = proposal_candidates(self.store, self.store.read(result.proposal, owner=AUTH))
        root = self.store.read_context(AUTH)
        with self.assertRaisesRegex(ValueError, 'dedicated commands'):
            self.service.propose(AUTH, 'admin', (root.ref,), candidates, 'Generic membership attempt')
        context = self.service._context(AUTH, 'admin')
        bypass = create_proposal(context, (root.ref,), candidates, 'Direct membership bypass')
        save_proposal(self.store, context, bypass, candidates)
        self.service.decide(AUTH, 'admin', bypass.ref, 'APPROVE', 'Synthetic review of a bypass')
        with self.assertRaisesRegex(ValueError, 'dedicated commands'):
            self.service.apply(AUTH, 'admin', bypass.ref, 'bypass')


@on_both_backends
class DeliveryMembershipTest(MembershipTest):
    def delivery(self):
        author = ProductionAuthoring(self.service)
        author.curator()
        for kind in ('ASSESSMENT', 'TEACHER_CONTENT', 'TRAINER_CONTENT'):
            author.review_and_apply(AUTH, author.generate(kind), 'approve-' + kind)
        author.configure_completion()
        _, release = author.release(approve=True)
        with patch.dict('learning.releases.RUNTIME_WORKERS', SIMULATED_ASSESSOR):
            result = author.delivery_import(release)
            author.review_and_apply(DELIVERY, self.store.read(result.proposal, owner=DELIVERY), 'import-1')
        self.install(result.policy_preview)
        return result, self.serve(result.policy_preview)

    def test_a_learner_joins_the_delivery_scope_and_activation_accepts_the_membership_policy(self):
        imported, delivery = self.delivery()
        result, delivery = self.admit(delivery, DELIVERY, 'learner-2', 'LEARNER')
        scope = result.policy.scopes[imported.preview.scope]
        self.assertEqual(scope.subjects, [*imported.policy_preview.scopes[imported.preview.scope].subjects, 'learner-2'])
        self.assertEqual(result.policy.subjects['learner-2'].actions, {DELIVERY: MEMBER_ACTIONS['LEARNER']})
        self.assertEqual(result.policy.rule_bindings, imported.policy_preview.rule_bindings)
        _, findings = activation_findings(self.store, delivery._context(DELIVERY, 'admin'))
        self.assertNotIn('RELEASE_POLICY_NOT_INSTALLED', {f.code for f in findings})
        activation = delivery.propose_activation(DELIVERY, 'admin',
            {'base_context': self.store.read_context(DELIVERY).ref}, request_id='activate')
        proposal = self.store.read(activation.proposal, owner=DELIVERY)
        delivery.decide(DELIVERY, 'admin', proposal.ref, 'APPROVE', 'Synthetic activation review')
        delivery.apply(DELIVERY, 'admin', proposal.ref, 'activate')
        # An ACTIVE delivery admits a member too.
        result, delivery = self.admit(delivery, DELIVERY, 'learner-3', 'LEARNER', request_id='member-2')
        root = self.store.read_context(DELIVERY)
        self.assertEqual((root.fields['mode'], root.fields['status']), ('LEARNING', 'ACTIVE'))
        self.assertIn('learner-3', result.policy.scopes[imported.preview.scope].subjects)
        delivery._context(DELIVERY, 'learner-3')

    def test_an_unreviewed_policy_still_blocks_activation(self):
        imported, delivery = self.delivery()
        changed = imported.policy_preview.model_copy(update={'rule_bindings': []})
        self.installed[changed.policy_ref] = changed
        with self.assertRaises(ActivationRefused) as refused:
            self.serve(changed).propose_activation(DELIVERY, 'admin',
                {'base_context': self.store.read_context(DELIVERY).ref}, request_id='activate')
        self.assertIn('RELEASE_POLICY_NOT_INSTALLED', {f.code for f in refused.exception.findings})

    def test_generic_proposals_still_cannot_change_the_delivery_policy(self):
        imported, delivery = self.delivery()
        root = self.store.read_context(DELIVERY)
        moved = entity('ExecutionContext', DELIVERY, {**root.fields, 'policies': trusted_policy().policy_ref.model_dump()},
                       'generic')
        with self.assertRaisesRegex(ValueError, 'dedicated commands'):
            delivery.propose(DELIVERY, 'admin', (root.ref,), (moved,), 'Generic policy change')


if __name__ == '__main__':
    unittest.main()
