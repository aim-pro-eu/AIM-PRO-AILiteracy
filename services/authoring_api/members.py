"""Module ``members``: the administrator of a course adds members (D25, option A; S11; batch, D36, S11b).

A member of the teaching staff is a subject of the identity map (D9) with one
role among ``CONTENT_RESPONSIBLE``, ``ASSESSOR`` and ``OBSERVER``; one
proposal may add several. The API writes the course's new trusted policy
version as a new file in ``ALM_POLICY_DIR``, never changing an installed file,
and answers with the pending proposal: each member's ``Participant`` and the
context's new ``policies`` reference. The members can act only after a person
with administrative authority decides and applies it through the review
endpoints. A pending membership proposal does not refuse another; once one is
applied, the others go stale (D36). Removing a member is not offered.

Students are not proposed (D37, S12b): once the course is open to learners, an
administrator adds them at once, by a key of the identity map or an automatic
key (``auto-``), as ``LEARNER`` participants under the delivery's learner grant,
with no proposal and no new policy version; they are recorded exactly as those
who join with the code.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Request

from pydantic import model_validator

from learning.contracts import Record, Text
from learning.membership import MEMBER_ACTIONS, LearnersCommand, Member, MembershipCommand, MembershipProposal
from services.api_common.auth import Principal, authenticator
from services.api_common.contexts import READ_ERRORS, WRITE_ERRORS, context_reader, context_writer, open_context
from services.api_common.identity import is_auto_subject_key
from services.api_common.registry import ApiModule


# The roles a membership proposal grants: the teaching staff (D37).
STAFF_ROLES = tuple(role for role in MEMBER_ACTIONS if role != 'LEARNER')


class MemberList(Record):
    """The members of a course, the mapped subjects who may still join, and the staff roles that may be granted."""
    members: tuple[Member, ...]
    addable: tuple[Text, ...]
    roles: tuple[Text, ...]


class MembershipRequest(MembershipCommand):
    """``propose-membership``: one or more subjects with their roles and the base context, with the ALM request id."""
    request_id: Text

    @model_validator(mode='after')
    def _staff(self):
        if any(member.role == 'LEARNER' for member in self.members):
            raise ValueError('A student is added at once, not by a membership proposal')
        return self


class LearnersRequest(LearnersCommand):
    """``add-learners``: students to add at once, by keys of the identity map or automatic keys."""
    request_id: Text


def _mapped(request: Request) -> set[str]:
    return {identity.subject_key for identity in authenticator(request).identities.identities}


def _member_list(request: Request, current: tuple[Member, ...]) -> MemberList:
    joined = {member.subject for member in current}
    return MemberList(members=current, addable=tuple(sorted(_mapped(request) - joined)), roles=STAFF_ROLES)


def policy_file(policy) -> str:
    return re.sub(r'[^a-z0-9-]', '-', policy.policy_ref.id.lower()) + f'-{policy.policy_ref.version}.json'


router = APIRouter(tags=['members'])


@router.get('/contexts/{context_id}/members', response_model=MemberList, responses=READ_ERRORS,
            summary='The members of this course and the subjects who may join it; for its administrators')
def members(context_id: str, request: Request, principal: Principal = Depends(context_reader)):
    with open_context(request, context_id) as service:
        current = service.members(context_id, principal.subject_key)
    return _member_list(request, current)


@router.post('/contexts/{context_id}/members', response_model=MembershipProposal, responses=WRITE_ERRORS,
             summary='Propose new members: a new trusted policy version and a participant record for each')
def propose_membership(context_id: str, body: MembershipRequest, request: Request,
                       principal: Principal = Depends(context_writer)):
    mapped = _mapped(request)
    unmapped = [member.subject for member in body.members if member.subject not in mapped]
    if unmapped:
        raise ValueError(f'Not in the identity map: {", ".join(unmapped)}')
    contexts = request.app.state.contexts
    with open_context(request, context_id) as service:
        return service.propose_membership(context_id, principal.subject_key, body.model_dump(exclude={'request_id'}),
            request_id=body.request_id, install=lambda policy: contexts.policies.install(policy_file(policy), policy))


@router.post('/contexts/{context_id}/learners', response_model=MemberList, responses=WRITE_ERRORS,
             summary='Add students to this course at once, under its learner grant; the same subjects again change nothing')
def add_learners(context_id: str, body: LearnersRequest, request: Request,
                 principal: Principal = Depends(context_writer)):
    mapped = _mapped(request)
    unknown = [subject for subject in body.subjects if subject not in mapped and not is_auto_subject_key(subject)]
    if unknown:
        raise ValueError(f'Neither in the identity map nor an automatic key: {", ".join(unknown)}')
    with open_context(request, context_id) as service:
        current = service.add_learners(context_id, principal.subject_key, body.model_dump(exclude={'request_id'}),
                                       request_id=body.request_id)
    return _member_list(request, current)


MODULE = ApiModule('members', router)
