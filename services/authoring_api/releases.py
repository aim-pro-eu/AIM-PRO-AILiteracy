"""Module ``releases``: release, delivery import and activation, as the CLI release commands do (S10).

A release freezes the exact current project selection; the result is a pending
proposal that a person decides and applies through the review endpoints.
Approval publishes no delivery, binding, policy or activation.

A delivery import is proposed in the delivery course and reads the authoring
course with that course's own installed policy (D10): the subject must be
authorized by both. Its result carries the trusted-policy preview, which the
API never installs: an operator copies the reviewed preview into the policy
directory, and until then the delivery course is unavailable. Activation
answers with a proposal or with the findings that refuse it, recording
nothing when refused.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from learning.contracts import EntityRef, Text
from learning.releases import (ActivationCommand, ActivationOutcome, ActivationRefused, DeliveryImport, ImportProposal,
                               ReleaseCommand, ReleaseInspection, ReleaseProposal)
from services.api_common.auth import Principal
from services.api_common.contexts import READ_ERRORS, WRITE_ERRORS, context_reader, context_writer, open_context
from services.api_common.registry import ApiModule


class ReleaseRequest(ReleaseCommand):
    """``propose-release``: the exact selected project, its domain and the base context, with the ALM request id."""
    request_id: Text


class DeliveryImportRequest(DeliveryImport):
    """``propose-delivery-import``: the release, its authoring course, the bindings and handlers, with the ALM request id."""
    request_id: Text


class ActivationRequest(ActivationCommand):
    """``propose-activation``: the base context, with the ALM request id."""
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


@router.post('/contexts/{context_id}/delivery-imports', response_model=ImportProposal, responses=WRITE_ERRORS,
             summary='Propose importing an applied release into this new delivery course (CLI propose-delivery-import)')
def propose_delivery_import(context_id: str, body: DeliveryImportRequest, request: Request,
                            principal: Principal = Depends(context_writer)):
    with open_context(request, context_id) as service:
        return service.propose_delivery_import(context_id, principal.subject_key,
            body.model_dump(exclude={'request_id'}), request_id=body.request_id)


@router.post('/contexts/{context_id}/activations', response_model=ActivationOutcome, responses=WRITE_ERRORS,
             summary='Propose LEARNING/ACTIVE for an applied delivery import, or the findings that refuse it '
                     '(CLI propose-activation)')
def propose_activation(context_id: str, body: ActivationRequest, request: Request,
                       principal: Principal = Depends(context_writer)):
    with open_context(request, context_id) as service:
        try:
            return ActivationOutcome(proposal=service.propose_activation(context_id, principal.subject_key,
                body.model_dump(exclude={'request_id'}), request_id=body.request_id))
        except ActivationRefused as refused:
            return ActivationOutcome(findings=refused.findings)


MODULE = ApiModule('releases', router)
