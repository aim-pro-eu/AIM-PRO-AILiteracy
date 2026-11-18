"""Module ``attempts``: the signed-in learner submits an attempt at an activity of their course (S12).

The attempt is observed evidence of the learner's own, recorded once under the
learner's own request id (scoped by subject, so another learner's id never
conflicts): the same id and attempt again return the same evidence, another
attempt under that id is a 409. Submitting proposes, decides and evaluates
nothing; an evaluation stays a draft that the staff decide and apply.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from learning.contracts import EntityRef, Record, Text
from learning.learner import ClientRequestId, Evidence
from services.api_common.auth import Principal
from services.api_common.contexts import WRITE_ERRORS, context_writer, open_context
from services.api_common.registry import ApiModule


class AttemptSubmission(Record):
    """The learner's attempt at one activity, under the learner's own request id."""
    request_id: ClientRequestId
    activity: EntityRef
    content: Text


router = APIRouter(tags=['attempts'])


@router.post('/courses/{context_id}/attempts', response_model=Evidence, responses=WRITE_ERRORS,
             summary="Submit the learner's attempt; the same request id and attempt return the same evidence, "
                     'another attempt 409')
def submit(context_id: str, body: AttemptSubmission, request: Request, principal: Principal = Depends(context_writer)):
    with open_context(request, context_id) as service:
        return service.submit_attempt(context_id, principal.subject_key, body.activity, body.content,
                                      request_id=body.request_id)


MODULE = ApiModule('attempts', router)
