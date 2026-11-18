"""Module ``progress``: the signed-in learner's own records in a course, never another learner's."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from learning.learner import OwnProgress
from services.api_common.auth import Principal
from services.api_common.contexts import READ_ERRORS, context_reader, open_context
from services.api_common.registry import ApiModule


router = APIRouter(tags=['progress'])


@router.get('/courses/{context_id}/progress', response_model=OwnProgress, responses=READ_ERRORS,
            summary="The learner's own attempts, evidence, applied evaluations and learning states")
def progress(context_id: str, request: Request, principal: Principal = Depends(context_reader)):
    with open_context(request, context_id) as service:
        return service.own_progress(context_id, principal.subject_key)


MODULE = ApiModule('progress', router)
