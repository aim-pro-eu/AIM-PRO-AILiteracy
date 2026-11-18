"""Module ``questions``: the learner request as a job (S12), a question to the Teacher or the Socratic coach.

The API checks that the signed-in subject is a learner of the active course
who may interact there, records the question in the jobs store (D14) under the
learner's own request id (scoped by subject) and returns; no agent is built in
an HTTP request. The job worker runs it (``services.jobs.learner``). The same
question under the same id returns the same job, another question 409.

A learner reads only their own questions: the jobs of another subject, or of
another kind, are not found. Once the run has ended, ``response`` is the
response the core recorded for that learner; ``detail`` is a fixed text of the
core when the run ended without one (a clarification, a refusal, a failure).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from starlette.exceptions import HTTPException

from learning.contracts import Record, Text
from learning.learner import Answer, ClientRequestId, Question, learner_request_id
from services.api_common.auth import Principal
from services.api_common.contexts import READ_ERRORS, WRITE_ERRORS, context_reader, context_writer, open_context
from services.api_common.registry import ApiModule
from services.jobs.learner import LEARNER_REQUEST, LearnerRequestJob
from services.jobs.store import ENDED, JobRecord, JobStatus, JobStore


class QuestionRequest(Record):
    """A question under the learner's own request id."""
    request_id: ClientRequestId
    question: Question


class QuestionView(Record):
    """A learner's question: its status and, once its run has ended, the response or the reason it has none."""
    request_id: Text
    question: Question
    status: JobStatus
    response: Answer | None = None
    detail: Text | None = None
    created: Text
    updated: Text


class QuestionList(Record):
    """The learner's own questions in a course, newest first."""
    questions: tuple[QuestionView, ...]


def configure(app, settings) -> None:
    app.state.jobs_store = None if settings.jobs_store is None else settings.jobs_store.get_secret_value()


def _jobs(request: Request) -> JobStore:
    return JobStore(request.app.state.jobs_store)


def _view(service, job: JobRecord, request_id: str) -> QuestionView:
    response = None
    if job.status in ENDED:
        response = service.learner_answer(job.context_id, job.subject_key, job.request_id)
    return QuestionView(request_id=request_id, question=LearnerRequestJob.model_validate(job.command).question,
                        status=job.status, response=response, detail=job.detail, created=job.created,
                        updated=job.updated)


def _client_id(job: JobRecord) -> str:
    return job.request_id[len(learner_request_id(job.subject_key, '')):]


router = APIRouter(tags=['questions'])


@router.post('/courses/{context_id}/questions', response_model=QuestionView, responses=WRITE_ERRORS,
             summary='Ask the Teacher or the Socratic coach; the same request id and question return the same job, '
                     'another question 409')
def ask(context_id: str, body: QuestionRequest, request: Request, principal: Principal = Depends(context_writer)):
    subject = principal.subject_key
    with open_context(request, context_id) as service:
        service.authorize_learner_requests(context_id, subject)
        with _jobs(request) as jobs:
            job, _ = jobs.submit(context_id, learner_request_id(subject, body.request_id), subject, LEARNER_REQUEST,
                                 LearnerRequestJob(kind=LEARNER_REQUEST, question=body.question).model_dump(mode='json'))
            return _view(service, job, body.request_id)


@router.get('/courses/{context_id}/questions', response_model=QuestionList, responses=READ_ERRORS,
            summary="The learner's own questions in the course, newest first, with their status")
def listing(context_id: str, request: Request, limit: int = Query(50, ge=1, le=200),
            principal: Principal = Depends(context_reader)):
    subject = principal.subject_key
    with open_context(request, context_id) as service:
        service.authorize_learner_requests(context_id, subject)
        with _jobs(request) as jobs:
            found = jobs.list(context_id, limit, subject_key=subject, kinds=(LEARNER_REQUEST,))
            return QuestionList(questions=tuple(_view(service, job, _client_id(job)) for job in found))


@router.get('/courses/{context_id}/questions/{request_id}', response_model=QuestionView, responses=READ_ERRORS,
            summary="One of the learner's own questions with its status and, once answered, the response")
def read(context_id: str, request_id: str, request: Request, principal: Principal = Depends(context_reader)):
    subject = principal.subject_key
    with open_context(request, context_id) as service:
        service.authorize_learner_requests(context_id, subject)
        with _jobs(request) as jobs:
            job = jobs.get(context_id, learner_request_id(subject, request_id))
            if job is None or job.kind != LEARNER_REQUEST or job.subject_key != subject:
                raise HTTPException(404, 'Question not found')
            return _view(service, job, request_id)


MODULE = ApiModule('questions', router)
