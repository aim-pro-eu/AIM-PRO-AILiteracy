"""Module ``courses``: the courses the signed-in learner is enrolled in (D19) and the view of one (D20)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from learning.contracts import Record
from learning.learner import CourseView, LearnerCourse
from services.api_common.auth import Principal
from services.api_common.contexts import READ_ERRORS, context_reader, open_context
from services.api_common.errors import error_responses
from services.api_common.registry import ApiModule


class CourseList(Record):
    courses: tuple[LearnerCourse, ...]


router = APIRouter(tags=['courses'])


@router.get('/courses', response_model=CourseList, responses=error_responses(401, 500),
            summary='The active courses the signed-in subject is enrolled in as a learner')
def courses(request: Request, principal: Principal = Depends(context_reader)):
    return CourseList(courses=request.app.state.contexts.enrolled(principal.subject_key))


@router.get('/courses/{context_id}', response_model=CourseView, responses=READ_ERRORS,
            summary="The validated course of a delivery as its learners see it; never an answer key")
def course(context_id: str, request: Request, principal: Principal = Depends(context_reader)):
    with open_context(request, context_id) as service:
        return service.course_view(context_id, principal.subject_key)


MODULE = ApiModule('courses', router)
