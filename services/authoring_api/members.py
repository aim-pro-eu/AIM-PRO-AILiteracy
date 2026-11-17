"""Module ``members``: the administrator of a course adds members (D25, option A; S11; batch, D36, S11b).

A member is a subject of the identity map (D9) with one role among
``CONTENT_RESPONSIBLE``, ``ASSESSOR``, ``LEARNER`` and ``OBSERVER``; one
proposal may add several. The API writes the course's new trusted policy
version as a new file in ``ALM_POLICY_DIR``, never changing an installed file,
and answers with the pending proposal: each member's ``Participant`` and the
context's new ``policies`` reference. The members can act only after a person
with administrative authority decides and applies it through the review
endpoints. A pending membership proposal does not refuse another; once one is
applied, the others go stale (D36). Removing a member is not offered.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Request

from learning.contracts import Record, Text
from learning.membership import MEMBER_ACTIONS, Member, MembershipCommand, MembershipProposal
from services.api_common.auth import Principal, authenticator
from services.api_common.contexts import READ_ERRORS, WRITE_ERRORS, context_reader, context_writer, open_context
from services.api_common.registry import ApiModule


class MemberList(Record):
    """The members of a course, the mapped subjects who may still join, and the roles that may be granted."""
    members: tuple[Member, ...]
    addable: tuple[Text, ...]
    roles: tuple[Text, ...]


class MembershipRequest(MembershipCommand):
    """``propose-membership``: one or more subjects with their roles and the base context, with the ALM request id."""
    request_id: Text


def _mapped(request: Request) -> set[str]:
    return {identity.subject_key for identity in authenticator(request).identities.identities}


def policy_file(policy) -> str:
    return re.sub(r'[^a-z0-9-]', '-', policy.policy_ref.id.lower()) + f'-{policy.policy_ref.version}.json'


router = APIRouter(tags=['members'])


@router.get('/contexts/{context_id}/members', response_model=MemberList, responses=READ_ERRORS,
            summary='The members of this course and the subjects who may join it; for its administrators')
def members(context_id: str, request: Request, principal: Principal = Depends(context_reader)):
    with open_context(request, context_id) as service:
        current = service.members(context_id, principal.subject_key)
    joined = {member.subject for member in current}
    return MemberList(members=current, addable=tuple(sorted(_mapped(request) - joined)), roles=tuple(MEMBER_ACTIONS))


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


MODULE = ApiModule('members', router)
