"""The learner request job (S12): a learner's question to the Teacher or the Socratic coach.

The Learner API queues it under the learner's scoped request id
(``learning.learner.learner_request_id``); the worker runs
``LearningService.ask`` with the learning agents of :class:`Resources`. It
imports no generator, so the Learner API can name it without loading any
authoring module.

Its outcome: ``COMPLETED`` once the agents answered or asked for a
clarification, ``FAILED`` when the run did not complete, ``ABANDONED`` when an
administrator abandoned the request. The response itself stays in the ALM
store, which only its learner reads; ``detail`` holds a fixed text of the core
only when the run ended before anything was recorded (a clarification, such as
a problem that stays with the Socratic coach, or a failure).
"""

from __future__ import annotations

from typing import Literal, NamedTuple

from learning.contracts import Record
from learning.learner import Question
from learning.outputs import LearningResponse
from learning.service import ABANDONED_CONTENT


LEARNER_REQUEST = 'learner-request'


class LearnerRequestJob(Record):
    """A learner's question: ``LearningService.ask``, run with the learning agents."""
    kind: Literal['learner-request']
    question: Question


class Asked(NamedTuple):
    """The response to a learner's question and whether the core recorded it."""
    response: LearningResponse
    recorded: bool


def authorize(service, context_id: str, subject_key: str) -> None:
    service.authorize_learner_requests(context_id, subject_key)


def run(service, context_id, subject_key, request_id, job, resources) -> Asked:
    if resources.orchestrator is None:
        raise ValueError('The learning agents are not available to the worker')
    response = service.ask(context_id, subject_key, job.question, request_id=request_id,
                           orchestrator_factory=resources.orchestrator)
    return Asked(response, service.learner_answer(context_id, subject_key, request_id) is not None)


def outcome(asked: Asked) -> tuple[str, tuple, str | None]:
    """The job status and detail of a learner's question; it never proposes."""
    response = asked.response
    detail = None if asked.recorded else response.content
    if response.kind in ('ANSWER', 'PARTIAL_RESULT', 'CLARIFICATION'):
        return 'COMPLETED', (), detail
    if response.kind == 'FAILURE':
        if response.content == ABANDONED_CONTENT:
            return 'ABANDONED', (), None
        return 'FAILED', (), detail
    return 'FAILED', (), 'Unexpected response'
