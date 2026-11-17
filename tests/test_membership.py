"""Course membership (D25, option A; S11, #129; batch, D36, S11b, #138).

An administrator of a course adds one or more members: the command writes a new
version of the trusted policy through the host's installer and proposes each
member's ``Participant`` with the context's new ``policies`` reference. A person
decides and applies it; no member has authority before. Temporary SQLite file or
PostgreSQL test schema only; no network and no model.
"""

from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from pydantic import ValidationError

from learning.decisions import create_proposal, proposal_candidates, save_proposal
from learning.membership import MEMBER_ACTIONS, MEMBERSHIP_POLICY, MembershipCommand, MembershipProposal
from learning.metamodel import load_contract
from learning.policies import AuthorizationError, TrustedPolicy
from learning.releases import ActivationRefused, activation_findings
from learning.service import LearningService
from learning.store import LearningStore, StateConflict, canonical
from tests.authoring_cycle_fixtures import AUTH, DELIVERY, ProductionAuthoring, entity, trusted_policy
from tests.store_backends import block_network, new_store_location, on_both_backends


class MembershipTest(unittest.TestCase):
    def setUp(self):
        block_network(self, 'Membership tests must not use the network or models',
                      'crewai.LLM', 'agent_system.runtime.LLMFactory.__call__')
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.location = new_store_location(self, self.temp.name, 'membership.sqlite')
        self.store = LearningStore(self.location)
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

    def command(self, context_id, *members):
        """``members`` as (subject, role) pairs."""
        return MembershipCommand(base_context=self.store.read_context(context_id).ref,
                                 members=[{'subject': subject, 'role': role} for subject, role in members])

    def propose(self, service, context_id, subject, role, request_id='member-1', install=None):
        return self.propose_all(service, context_id, (subject, role), request_id=request_id, install=install)

    def propose_all(self, service, context_id, *members, request_id='member-1', install=None):
        return service.propose_membership(context_id, 'admin', self.command(context_id, *members),
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
        self.assertEqual((candidates['Participant'].ref,), result.participants)
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
        command = self.command(AUTH, ('observer-1', 'OBSERVER'))
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
                self.command(AUTH, ('someone', role))
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
class BatchMembershipTest(MembershipTest):
    """One proposal adds several members in one policy version (D36, S11b)."""

    MEMBERS = (('teacher-2', 'CONTENT_RESPONSIBLE'), ('assessor-1', 'ASSESSOR'), ('learner', 'OBSERVER'))

    def test_one_proposal_adds_several_members_in_one_policy_version(self):
        install = Mock(side_effect=self.install)
        result = self.propose_all(self.service, AUTH, *self.MEMBERS, install=install)
        install.assert_called_once_with(result.policy)
        policy = result.policy
        for subject, role in self.MEMBERS:
            self.assertIn(role, policy.subjects[subject].roles)
            self.assertEqual(policy.subjects[subject].actions[AUTH], MEMBER_ACTIONS[role])
            self.assertIn(subject, policy.scopes['wp3'].subjects)
        self.assertEqual(policy.subjects['learner'].actions[DELIVERY], trusted_policy().subjects['learner'].actions[DELIVERY])
        proposal = self.store.read(result.proposal, owner=AUTH)
        candidates = proposal_candidates(self.store, proposal)
        participants = [c for c in candidates if c.type == 'Participant']
        self.assertEqual({p.ref for p in participants}, set(result.participants))
        self.assertEqual([r.id for r in result.participants], [f'{AUTH}:participant:{s}' for s, _ in self.MEMBERS])
        self.assertEqual({p.fields['subjectKey']: p.fields['roles'] for p in participants},
                         {subject: [role] for subject, role in self.MEMBERS})
        self.assertEqual(sorted(c.type for c in candidates),
                         ['ExecutionContext', 'Participant', 'Participant', 'Participant', 'PolicySet'])
        for subject, _ in self.MEMBERS:
            self.assertIn(subject, proposal.fields['proposedChange'])
        self.service.decide(AUTH, 'admin', result.proposal, 'APPROVE', 'Synthetic membership review')
        self.service.apply(AUTH, 'admin', result.proposal, 'member-1')
        members = self.serve(policy)
        self.assertEqual([m.subject for m in members.members(AUTH, 'admin')], ['admin', *(s for s, _ in self.MEMBERS)])
        for subject, role in self.MEMBERS:
            self.assertEqual(members._context(AUTH, subject).participant.fields['roles'], [role])

    def test_a_subject_twice_an_existing_member_or_no_member_refuses_the_whole_proposal(self):
        with self.assertRaisesRegex(ValidationError, 'more than once'):
            self.command(AUTH, ('teacher-2', 'ASSESSOR'), ('teacher-2', 'OBSERVER'))
        with self.assertRaises(ValidationError):
            self.command(AUTH)
        with self.assertRaises(ValidationError):
            self.command(AUTH, ('teacher-2', 'ASSESSOR'), ('assessor-1', 'ADMINISTRATOR'))
        with self.assertRaisesRegex(ValueError, 'admin is already a member'):
            self.propose_all(self.service, AUTH, ('teacher-2', 'ASSESSOR'), ('admin', 'OBSERVER'))
        self.assertEqual(len(self.installed), 1)
        self.assertEqual(self.store.owned(AUTH, 'ChangeProposal'), ())

    def test_the_same_batch_replays_and_another_batch_with_its_request_id_is_refused(self):
        install = Mock(side_effect=self.install)
        first = self.propose_all(self.service, AUTH, *self.MEMBERS, install=install)
        self.assertEqual(self.propose_all(self.service, AUTH, *self.MEMBERS, install=install), first)
        install.assert_called_once_with(first.policy)
        with self.assertRaises(StateConflict):
            self.propose_all(self.service, AUTH, *self.MEMBERS[:2], install=install)
        with self.assertRaises(StateConflict):
            self.propose_all(self.service, AUTH, *reversed(self.MEMBERS), install=install)

    def test_a_pending_membership_does_not_refuse_another_which_goes_stale_once_the_first_is_applied(self):
        first = self.propose(self.service, AUTH, 'assessor-1', 'ASSESSOR', request_id='member-1')
        second = self.propose(self.service, AUTH, 'teacher-2', 'CONTENT_RESPONSIBLE', request_id='member-2')
        for result in (first, second):
            self.service.decide(AUTH, 'admin', result.proposal, 'APPROVE', 'Synthetic membership review')
        self.service.apply(AUTH, 'admin', first.proposal, 'member-1')
        with self.assertRaisesRegex(StateConflict, 'stale'):
            self.serve(first.policy).apply(AUTH, 'admin', second.proposal, 'member-2')
        # Proposed again on the course as it is now, the second member keeps the first.
        again = self.propose(self.serve(first.policy), AUTH, 'teacher-2', 'CONTENT_RESPONSIBLE', request_id='member-3')
        self.assertEqual(set(again.policy.subjects), {'admin', 'learner', 'assessor-1', 'teacher-2'})

    def test_a_membership_recorded_before_batches_reads_as_one_member(self):
        base = self.store.read_context(AUTH).ref
        legacy = MembershipCommand.model_validate(
            {'base_context': base.model_dump(), 'subject': 'teacher-2', 'role': 'ASSESSOR'})
        self.assertEqual(legacy, self.command(AUTH, ('teacher-2', 'ASSESSOR')))
        result = self.propose(self.service, AUTH, 'teacher-2', 'ASSESSOR')
        recorded = {**result.model_dump(mode='json', exclude={'participants'}),
                    'participant': result.participants[0].model_dump()}
        self.assertEqual(MembershipProposal.model_validate(recorded), result)
        with self.assertRaises(ValidationError):
            MembershipCommand.model_validate({'base_context': base.model_dump(), 'subject': 'teacher-2',
                                              'role': 'ASSESSOR', 'members': []})


@on_both_backends
class MembershipCommandLineTest(MembershipTest):
    def run_cli(self, *arguments, policy=None):
        path = Path(self.temp.name) / 'policy.json'
        path.write_text((policy or trusted_policy()).model_dump_json())
        output, errors = StringIO(), StringIO()
        from learning.__main__ import main
        with redirect_stdout(output), redirect_stderr(errors):
            code = main(['--db', str(self.location), '--policy', str(path), '--subject', 'admin', '--context', AUTH,
                         *arguments])
        return code, output.getvalue(), errors.getvalue()

    def test_the_cli_proposes_several_members_and_writes_the_new_policy_to_a_new_file(self):
        target = Path(self.temp.name) / 'course-policy-2.json'
        base = self.store.read_context(AUTH).ref.model_dump_json()
        arguments = ('propose-membership', '--base-context', base, '--member', 'teacher-2:CONTENT_RESPONSIBLE',
                     '--member', 'learner:OBSERVER', '--request-id', 'cli-member', '--policy-file', str(target))
        code, output, errors = self.run_cli(*arguments)
        self.assertEqual(code, 0, errors)
        result = MembershipProposal.model_validate(json.loads(output))
        self.assertEqual(TrustedPolicy.model_validate_json(target.read_bytes()), result.policy)
        self.assertEqual(len(result.participants), 2)
        self.assertEqual(self.store.read(result.proposal, owner=AUTH).fields['status'], 'AWAITING_DECISION')
        # An existing file is never replaced; nothing new is recorded.
        before = target.read_bytes()
        code, _, errors = self.run_cli(*arguments[:-1], str(target))
        self.assertEqual(code, 2)
        self.assertIn('Operation not performed', errors)
        self.assertEqual(target.read_bytes(), before)
        self.assertEqual(len(self.store.owned(AUTH, 'ChangeProposal')), 1)

    def test_the_cli_refuses_a_member_without_a_role(self):
        target = Path(self.temp.name) / 'course-policy-2.json'
        base = self.store.read_context(AUTH).ref.model_dump_json()
        code, _, _ = self.run_cli('propose-membership', '--base-context', base, '--member', 'teacher-2',
                                  '--request-id', 'cli-member', '--policy-file', str(target))
        self.assertEqual(code, 2)
        self.assertFalse(target.exists())
        self.assertEqual(self.store.owned(AUTH, 'ChangeProposal'), ())


@on_both_backends
class DeliveryMembershipTest(MembershipTest):
    def delivery(self):
        author = ProductionAuthoring(self.service)
        author.curator()
        for kind in ('ASSESSMENT', 'TEACHER_CONTENT', 'TRAINER_CONTENT'):
            author.review_and_apply(AUTH, author.generate(kind), 'approve-' + kind)
        author.configure_completion()
        _, release = author.release(approve=True)
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
