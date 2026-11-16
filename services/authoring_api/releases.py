"""Module ``releases``: release proposal and inspection, as the CLI ``propose-release`` and ``show-release`` do.

A release freezes the exact current project selection (S10); the result is a
pending proposal that a person decides and applies through the review
endpoints. Approval publishes no delivery, binding, policy or activation.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from learning.contracts import EntityRef, Text
from learning.releases import ReleaseCommand, ReleaseInspection, ReleaseProposal
from services.api_common.auth import Principal
from services.api_common.contexts import READ_ERRORS, WRITE_ERRORS, context_reader, context_writer, open_context
from services.api_common.registry import ApiModule


class ReleaseRequest(ReleaseCommand):
    """``propose-release``: the exact selected project, its domain and the base context, with the ALM request id."""
    request_id: Text


router = APIRouter(tags=['releases'])


@router.post('/contexts/{context_id}/releases', response_model=ReleaseProposal, responses=WRITE_ERRORS,
             summary='Propose a frozen release of the exact current project selection (CLI propose-release)')
def propose_release(context_id: str, body: ReleaseRequest, request: Request,
                    principal: Principal = Depends(context_writer)):
    with open_context(request, context_id) as service:
        return service.propose_release(context_id, principal.subject_key,
            body.model_dump(exclude={'request_id'}), request_id=body.request_id)


@router.get('/contexts/{context_id}/resources/{resource_id}/versions/{version}/release',
            response_model=ReleaseInspection, responses=READ_ERRORS,
            summary='Receipts, the exact frozen closure and findings of this release (CLI show-release)')
def release_inspection(context_id: str, resource_id: str, version: str, request: Request,
                       principal: Principal = Depends(context_reader)):
    release = EntityRef(type='Resource', id=resource_id, version=version)
    with open_context(request, context_id) as service:
        return service.inspect_release(context_id, principal.subject_key, release)


MODULE = ApiModule('releases', router)
