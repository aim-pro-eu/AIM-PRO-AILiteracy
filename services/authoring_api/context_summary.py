"""Module ``contexts``: the contexts the subject may read, and the context summary the CLI ``show`` prints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from learning.contracts import Entity, Finding, Record, Text
from services.api_common.auth import Principal
from services.api_common.contexts import READ_ERRORS, context_reader, open_context
from services.api_common.errors import error_responses
from services.api_common.registry import ApiModule


class ContextEntry(Record):
    """A context the subject may read: its lifecycle and the subject's roles in its policy."""
    context_id: Text
    mode: Text
    status: Text
    roles: tuple[Text, ...]


class ContextList(Record):
    contexts: tuple[ContextEntry, ...]


class ContextSummary(Record):
    """The context, the entities the subject may see and the snapshot findings.

    A learner-only subject sees only the context, its own participant record and
    its own learning records, never proposals, decisions or other participants.
    """
    context: Entity
    entities: tuple[Entity, ...]
    findings: tuple[Finding, ...]


router = APIRouter(tags=['contexts'])


@router.get('/contexts', response_model=ContextList, responses=error_responses(401, 500),
            summary='The contexts the signed-in subject may read, by id')
def context_list(request: Request, principal: Principal = Depends(context_reader)):
    return ContextList(contexts=tuple(
        ContextEntry(context_id=context.id, mode=context.fields['mode'], status=context.fields['status'],
                     roles=tuple(policy.subjects[principal.subject_key].roles))
        for context, policy in request.app.state.contexts.readable(principal.subject_key)))


@router.get('/contexts/{context_id}', response_model=ContextSummary, responses=READ_ERRORS,
            summary='Context summary with the same redaction as the CLI show')
def context_summary(context_id: str, request: Request, principal: Principal = Depends(context_reader)):
    with open_context(request, context_id) as service:
        return ContextSummary.model_validate(service.show(context_id, principal.subject_key))


MODULE = ApiModule('contexts', router)
