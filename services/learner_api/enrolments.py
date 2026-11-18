"""Module ``enrolments``: the signed-in subject joins a course with its code alone, as in Teams (D37, S12b).

The code finds the active delivery whose current code it is; the subject
becomes a ``LEARNER`` participant there at once, under the delivery's reviewed
learner grant, idempotent by the learner's own request id: joining again
returns the same course and writes nothing. A wrong, reset or disabled code, or
a course not open or not active, gets one answer (404) and records nothing. A
member of the course's staff does not join as a learner (409).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from learning.contracts import Record, Text
from learning.enrolment import EnrolmentRefused
from learning.learner import ClientRequestId, LearnerCourse
from services.api_common.auth import Principal
from services.api_common.contexts import WRITE_ERRORS, context_writer
from services.api_common.registry import ApiModule


class JoinRequest(Record):
    """The course code, as typed or carried by a join link, under the learner's own request id."""
    request_id: ClientRequestId
    code: Text


def configure(app, settings) -> None:
    secret = settings.enrolment_secret
    app.state.enrolment_secret = None if secret is None else secret.get_secret_value().encode()


router = APIRouter(tags=['enrolments'])


@router.post('/enrolments', response_model=LearnerCourse, responses=WRITE_ERRORS,
             summary='Join the course whose code this is, as a learner; the same request returns the same course')
def join(body: JoinRequest, request: Request, principal: Principal = Depends(context_writer)):
    try:
        return request.app.state.contexts.join(principal.subject_key, body.code, body.request_id,
                                               secret=request.app.state.enrolment_secret)
    except EnrolmentRefused as refused:
        raise HTTPException(404, str(refused)) from None


MODULE = ApiModule('enrolments', router)
