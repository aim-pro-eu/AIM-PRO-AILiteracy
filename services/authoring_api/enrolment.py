"""Module ``enrolment``: the administrator of a delivery opens it to learners and manages its code (D37, S12b).

Opening is a reviewed policy change, made once: the API writes the course's new
trusted policy version, with the delivery's learner grant, as a new file in
``ALM_POLICY_DIR``, never changing an installed file, and answers with the
pending proposal, which a person decides and applies through the review
endpoints. Once the course is open, its administrators read, reset and disable
its code at once. The code is derived from the host secret
(``ALM_ENROLMENT_SECRET``); the store keeps its nonce and digest, never the
code. Learners join with it through the Learner API.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from learning.contracts import Text
from learning.membership import EnrolmentCommand, EnrolmentProposal, EnrolmentView
from services.api_common.auth import Principal
from services.api_common.contexts import READ_ERRORS, WRITE_ERRORS, context_reader, context_writer, open_context
from services.api_common.registry import ApiModule
from services.authoring_api.members import policy_file


class EnrolmentRequest(EnrolmentCommand):
    """``propose-enrolment``: open the course to learners from the base context, with the ALM request id."""
    request_id: Text


def configure(app, settings) -> None:
    secret = settings.enrolment_secret
    app.state.enrolment_secret = None if secret is None else secret.get_secret_value().encode()


router = APIRouter(tags=['enrolment'])


@router.get('/contexts/{context_id}/enrolment', response_model=EnrolmentView, responses=READ_ERRORS,
            summary='Whether this course is open to learners and its current code; for its administrators')
def enrolment(context_id: str, request: Request, principal: Principal = Depends(context_reader)):
    with open_context(request, context_id) as service:
        return service.enrolment(context_id, principal.subject_key, secret=request.app.state.enrolment_secret)


@router.post('/contexts/{context_id}/enrolment', response_model=EnrolmentProposal, responses=WRITE_ERRORS,
             summary='Propose opening this delivery to learners: a new trusted policy version with its learner grant')
def propose_enrolment(context_id: str, body: EnrolmentRequest, request: Request,
                      principal: Principal = Depends(context_writer)):
    contexts = request.app.state.contexts
    with open_context(request, context_id) as service:
        return service.propose_enrolment(context_id, principal.subject_key, body.model_dump(exclude={'request_id'}),
            request_id=body.request_id, install=lambda policy: contexts.policies.install(policy_file(policy), policy))


@router.post('/contexts/{context_id}/enrolment/code', response_model=EnrolmentView, responses=WRITE_ERRORS,
             summary='Create or reset the code of an open course, at once; the previous code stops working')
def reset_code(context_id: str, request: Request, principal: Principal = Depends(context_writer)):
    with open_context(request, context_id) as service:
        return service.reset_enrolment_code(context_id, principal.subject_key,
                                            secret=request.app.state.enrolment_secret)


@router.delete('/contexts/{context_id}/enrolment/code', response_model=EnrolmentView, responses=WRITE_ERRORS,
               summary='Disable the code of this course, at once; its learners stay')
def disable_code(context_id: str, request: Request, principal: Principal = Depends(context_writer)):
    with open_context(request, context_id) as service:
        return service.disable_enrolment_code(context_id, principal.subject_key,
                                              secret=request.app.state.enrolment_secret)


MODULE = ApiModule('enrolment', router)
