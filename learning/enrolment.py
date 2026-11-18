"""Enrolment with a course code, as in Microsoft Teams (D37, S12b, #141): the learner's side.

A delivery is opened to learners once, by a reviewed policy change that adds
its learner grant (``learning.membership``). Its code is then derived from a
host secret and a nonce of the course: the store keeps the nonce and the code's
digest, never the code, and a reset changes the nonce. A signed-in subject who
gives the code alone joins the ACTIVE delivery whose current code it is, at
once, as a ``LEARNER`` participant under the grant: no proposal and no new
policy version. A wrong, reset or disabled code, or a course that is not open
or not active, is refused with one answer and records nothing.

This module imports no authoring module: the Learner API serves joining.
"""

from __future__ import annotations

from base64 import b32encode
from datetime import datetime, timezone
import hashlib
import hmac
import re
import secrets
from typing import Callable
from uuid import uuid4

from learning.contracts import EntityRef, entity_data, make_entity
from learning.learner import LEARNER, REQUEST_ID, LearnerCourse, learner_request_id
from learning.metamodel import validate_entity
from learning.policies import TrustedPolicy, with_learner
from learning.store import StateConflict, canonical


CODE_LENGTH = 8
CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
REFUSED = 'No open course has this code'
ATTEMPTS = 5


class EnrolmentRefused(ValueError):
    """The code opens no course: one answer for a wrong, reset or disabled code and a course not open or not active."""


def course_code(secret: bytes, context_id: str, nonce: str) -> str:
    """The code of ``context_id`` for ``nonce``: an HMAC of the host secret, cut to :data:`CODE_LENGTH` characters."""
    mac = hmac.new(secret, f'code\n{context_id}\n{nonce}'.encode(), hashlib.sha256).digest()
    return b32encode(mac).decode('ascii').lower()[:CODE_LENGTH]


def normalized(code: str) -> str:
    """A code as typed: case, spaces and hyphens do not matter."""
    return re.sub(r'[\s-]', '', code).lower()


def code_digest(secret: bytes, code: str) -> str:
    """The stored digest of a code; keyed by the host secret, so the store alone does not reveal the code."""
    return hmac.new(secret, f'digest\n{normalized(code)}'.encode(), hashlib.sha256).hexdigest()


def new_code(store, context_id: str, responsible: str, secret: bytes) -> str:
    """A new code for the context, replacing its current one; the rare digest already taken draws another nonce."""
    for _ in range(ATTEMPTS):
        nonce = secrets.token_hex(16)
        code = course_code(secret, context_id, nonce)
        try:
            store.set_enrolment_code(context_id, nonce, code_digest(secret, code), responsible)
        except StateConflict:
            continue
        return code
    raise StateConflict('No new course code could be drawn; try again')


def learner_policy(store, policy: TrustedPolicy, context_id: str, subject_key: str) -> TrustedPolicy:
    """``policy`` as it applies to ``subject_key`` in the context: with its learner grant for a participant who is
    only a learner there and whom the policy does not name in it (D37); otherwise ``policy`` itself."""
    if context_id not in policy.learners or not store.has_context(context_id):
        return policy
    root = store.read_context(context_id)
    for ref in root.fields['participants']:
        participant = store.read(EntityRef.model_validate(ref), owner=context_id)
        if participant.fields['subjectKey'] == subject_key:
            return with_learner(policy, context_id, subject_key) if participant.fields['roles'] == [LEARNER] else policy
    return policy


def _course(store, policy_of: Callable[[EntityRef], TrustedPolicy | None], context_id: str):
    """The open, active delivery ``context_id`` with its installed policy, or :class:`EnrolmentRefused`."""
    root = store.read_context(context_id)
    policy = policy_of(EntityRef.model_validate(root.fields['policies']))
    if (policy is None or context_id not in policy.learners or not root.fields.get('learningDesign')
            or (root.fields['mode'], root.fields['status']) != ('LEARNING', 'ACTIVE')):
        raise EnrolmentRefused(REFUSED)
    return root, policy


def join_course(store, policy_of: Callable[[EntityRef], TrustedPolicy | None], subject_key: str, code: str,
                request_id: str, *, secret: bytes) -> LearnerCourse:
    """``subject_key`` joins the course whose current code is ``code``, as a ``LEARNER`` participant; the course.

    Idempotent: the same request, or a learner of the course joining again, returns the course and writes nothing.
    A member of its staff, or a subject the policy names in it, does not join as a learner.
    """
    if not re.fullmatch(REQUEST_ID, request_id):
        raise ValueError("The request id is not the learner's own")
    typed = normalized(code)
    context_id = (store.enrolment_context(code_digest(secret, typed))
                  if re.fullmatch(f'[{CODE_ALPHABET}]{{{CODE_LENGTH}}}', typed) else None)
    if context_id is None:
        raise EnrolmentRefused(REFUSED)
    digest = code_digest(secret, typed)
    operation_id = f'enrol:{context_id}:{learner_request_id(subject_key, request_id)}'
    for _ in range(ATTEMPTS):
        root, policy = _course(store, policy_of, context_id)
        design = store.read(EntityRef.model_validate(root.fields['learningDesign']), owner=context_id)
        course = LearnerCourse(context_id=context_id, title=design.fields['name'])
        participants = [store.read(EntityRef.model_validate(ref), owner=context_id) for ref in root.fields['participants']]
        mine = next((p for p in participants if p.fields['subjectKey'] == subject_key), None)
        if mine is not None and mine.fields['roles'] == [LEARNER]:
            return course
        named = policy.subjects.get(subject_key)
        if mine is not None or named is not None and context_id in named.actions:
            raise StateConflict(f'{subject_key} is already a member of the course')
        if store.operation_result(operation_id, context_id) is not None:
            return course
        participant = validate_entity(entity_data(make_entity('Participant', f'{context_id}:participant:{subject_key}',
            {'subjectKey': subject_key, 'roles': [LEARNER], 'learningNeeds': []},
            version=uuid4().hex, origin='OBSERVED_EVENT', responsible=subject_key)), store.contract)
        updated = root.model_copy(update={'version': uuid4().hex, 'fields': {**root.fields,
            'participants': [*root.fields['participants'], participant.ref.model_dump()]}})
        change = make_entity('StateChange', f'change-{uuid4().hex}', {
            'context': root.ref.model_dump(), 'baseVersion': root.version, 'newVersion': updated.version,
            'cause': participant.ref.model_dump(),
            'authorizationBasis': canonical({'learnerGrant': policy.policy_ref.model_dump()}),
            'change': f'{subject_key} joined as LEARNER with the course code',
            'recordedAt': datetime.now(timezone.utc).isoformat()},
            origin='OBSERVED_EVENT', responsible=subject_key)

        def still_open():
            if store.enrolment_context(digest) != context_id:
                raise EnrolmentRefused(REFUSED)

        try:
            store.commit_change(change, (participant, updated), expected_version=root.version,
                                operation_id=operation_id, precondition=still_open)
        except StateConflict:
            # Another learner joined, or the course changed, since it was read: read it again.
            if store.read_context(context_id).version == root.version:
                raise
            continue
        return course
    raise StateConflict('The course is changing; try again')
