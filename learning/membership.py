"""Course membership: an administrator adds members (D25, option A; S11, #129; batch, D36, S11b).

The command writes a new version of the context's trusted policy through the
host's installer, which never changes an installed file, and proposes each
member's ``Participant`` with the context's new ``policies`` reference. One
proposal may add several members in that one policy version, so a class is
enrolled in one propose–decide–apply cycle. No member gains authority before a
person with administrative authority decides and applies the proposal;
application rechecks that exactly that policy is installed. ``ADMINISTRATOR``
cannot be granted this way, and removing a member is not offered.

Every membership proposal starts from the installed policy: once one is
applied, the others pending in the course go stale and are proposed again. The
core does not refuse a proposal while another is pending (D36); the studio
shows them and warns.

A member joins every source or delivery scope of this context alone, so a
learner added to an imported delivery reads its bound resources. The policy
entity records the new policy, so activation accepts a membership version
derived from the reviewed import preview.
"""

from typing import Literal
from uuid import uuid4

from pydantic import Field, model_validator

from learning.contracts import EntityRef, Record, Text, entity_data, make_entity
from learning.decisions import create_proposal, save_proposal
from learning.metamodel import validate_entity
from learning.policies import AuthorizationError, SubjectGrant, TrustedPolicy
from learning.store import canonical


MEMBERSHIP_POLICY = 'Reviewed course membership policy: '
MEMBER_ACTIONS = {
    'CONTENT_RESPONSIBLE': ['read', 'propose', 'decide', 'apply', 'interact'],
    'ASSESSOR': ['read', 'propose', 'decide', 'apply', 'interact'],
    'LEARNER': ['read', 'interact', 'submit'],
    'OBSERVER': ['read'],
}


class NewMember(Record):
    subject: Text
    role: Literal['CONTENT_RESPONSIBLE', 'ASSESSOR', 'LEARNER', 'OBSERVER']


class MembershipCommand(Record):
    base_context: EntityRef
    members: tuple[NewMember, ...] = Field(min_length=1)

    @model_validator(mode='before')
    @classmethod
    def _one_member(cls, data):
        # A command recorded before batches (S11) names one subject and its role.
        if isinstance(data, dict) and 'members' not in data and {'subject', 'role'} <= data.keys():
            data = {**{k: v for k, v in data.items() if k not in ('subject', 'role')},
                    'members': [{'subject': data['subject'], 'role': data['role']}]}
        return data

    @model_validator(mode='after')
    def _distinct(self):
        if len({member.subject for member in self.members}) != len(self.members):
            raise ValueError('A subject is named more than once')
        return self


class Member(Record):
    subject: Text
    roles: tuple[Text, ...]


class MembershipProposal(Record):
    proposal: EntityRef
    participants: tuple[EntityRef, ...]
    policy: TrustedPolicy

    @model_validator(mode='before')
    @classmethod
    def _one_participant(cls, data):
        # A result recorded before batches (S11) names one participant.
        if isinstance(data, dict) and 'participant' in data and 'participants' not in data:
            data = {**{k: v for k, v in data.items() if k != 'participant'}, 'participants': [data['participant']]}
        return data


def member_policy(policy, context_id, subject, role, version):
    """``policy`` as a new version that adds ``subject`` with ``role`` to ``context_id`` and its own scopes."""
    grant = policy.subjects.get(subject)
    roles = grant.roles if grant and role in grant.roles else [*(grant.roles if grant else []), role]
    actions = {**(grant.actions if grant else {}), context_id: MEMBER_ACTIONS[role]}
    scopes = {name: scope.model_copy(update={'subjects': [*scope.subjects, subject]})
              if scope.contexts == [context_id] and subject not in scope.subjects else scope
              for name, scope in policy.scopes.items()}
    return policy.model_copy(update={'policy_ref': policy.policy_ref.model_copy(update={'version': version}),
        'subjects': {**policy.subjects, subject: SubjectGrant(roles=roles, actions=actions)}, 'scopes': scopes})


def _administrator(context):
    roles = set(context.participant.fields['roles']) & set(context.policy.subjects[context.request.subject_key].roles)
    if 'ADMINISTRATOR' not in roles:
        raise AuthorizationError('Membership requires administrative authority')


def course_members(service, context_id, subject_key):
    """The members of a course with their roles in it; for an administrator of the course only."""
    context = service._context(context_id, subject_key)
    _administrator(context)
    return tuple(Member(subject=p.fields['subjectKey'], roles=tuple(p.fields['roles']))
                 for p in map(context.snapshot.get, context.snapshot.context.fields['participants']))


def _build(install):
    def build(store, context, command):
        root, subject = context.snapshot.context, context.request.subject_key
        _administrator(context)
        joined = {context.snapshot.get(r).fields['subjectKey'] for r in root.fields['participants']}
        for new in command.members:
            granted = context.policy.subjects.get(new.subject)
            if new.subject in joined or granted and root.id in granted.actions:
                raise ValueError(f'{new.subject} is already a member of the course')
        version, policy = uuid4().hex, context.policy
        for new in command.members:
            policy = member_policy(policy, root.id, new.subject, new.role, version)
        current = context.snapshot.get(context.policy.policy_ref)
        policy_entity = validate_entity(entity_data(current.model_copy(update={
            'version': version,
            'fields': {**current.fields, 'permissions': [*current.fields['permissions'],
                                                         MEMBERSHIP_POLICY + canonical(policy.model_dump(mode='json'))]},
            'provenance': current.provenance.model_copy(update={'origin': 'GENERATED_PROPOSAL', 'responsible': subject})})),
            context.contract)
        participants = tuple(validate_entity(entity_data(make_entity('Participant', f'{root.id}:participant:{new.subject}',
            {'subjectKey': new.subject, 'roles': [new.role], 'learningNeeds': []},
            version=version, origin='GENERATED_PROPOSAL', responsible=subject)), context.contract)
            for new in command.members)
        updated = root.model_copy(update={'version': uuid4().hex, 'fields': {**root.fields,
            'participants': [*root.fields['participants'], *(p.ref.model_dump() for p in participants)],
            'policies': policy_entity.ref.model_dump()}})
        candidates = (*participants, policy_entity, updated)
        added = ', '.join(f'{new.subject} as {new.role}' for new in command.members)
        proposal = create_proposal(context, (root.ref,), candidates,
            f'Add {added} to this course. The new trusted policy version is installed '
            'but used only after this proposal is decided and applied. ' + canonical({
                'members': [{'subject': new.subject, 'role': new.role, 'actions': MEMBER_ACTIONS[new.role]}
                            for new in command.members],
                'policy': policy.policy_ref.model_dump()}))
        # The policy file exists before the proposal that references it: a failure leaves only an unused file.
        if install is not None:
            install(policy)
        save_proposal(store, context, proposal, candidates)
        return MembershipProposal(proposal=proposal.ref, participants=tuple(p.ref for p in participants), policy=policy)
    return build


def propose_membership(service, context_id, subject_key, command, request_id, install=None):
    from learning.releases import _command
    return _command(service, context_id, subject_key, 'PROPOSE_MEMBERSHIP', MembershipCommand.model_validate(command),
                    request_id, _build(install), MembershipProposal)


def validate_membership_application(context, command, result, candidates):
    """Recheck a recorded membership under the application lock: exactly its policy, installed."""
    command, result = MembershipCommand.model_validate(command), MembershipProposal.model_validate(result)
    root = context.snapshot.context
    updated = next((c for c in candidates if c.type == 'ExecutionContext'), root)
    installed = context.policies(result.policy.policy_ref) if context.policies else None
    if installed != result.policy:
        raise ValueError('The membership policy is not installed')
    changed = {k for k in root.fields.keys() | updated.fields.keys() if root.fields.get(k) != updated.fields.get(k)}
    if (changed != {'participants', 'policies'} or updated.fields['policies'] != result.policy.policy_ref.model_dump()
            or {c.type for c in candidates} != {'Participant', 'PolicySet', 'ExecutionContext'}):
        raise ValueError('A membership changes only the participants and the policy reference')
