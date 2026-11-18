"""What a learner reads (S12, #136): their courses (D19), the course view (D20) and their own progress.

A learner's courses are, for now, the active deliveries where they hold
``LEARNER`` both in the installed trusted policy and in their participant
record: a D25 membership that is applied, never one still pending.
:func:`enrolled_courses` is the only source of that list, so D37 (enrolment by
course code, S12b) changes it there.

The course view and the progress are projections: named fields copied from
the active model of an ACTIVE delivery and from the learner's own records,
never whole entities. The course comes from the validated release the delivery
imported, never from a draft or a proposal; an assessment shows its activity,
conditions, accepted evidence and rubric, never its answer key. Progress holds
the learner's own occurrences, evidence, applied evaluations and learning
states, never another learner's record or a pending evaluation draft. Reading
writes nothing.

A learner writes two things (S12 part 2): an attempt at an activity
(:func:`submit_attempt`) and a question to the Teacher or the Socratic coach
(:func:`question_request`, run by the job worker). Both are recorded under the
learner's own request id, scoped by subject (:func:`learner_request_id`), so
two learners never share one. Neither proposes, decides, applies or records an
evaluation.
"""

from __future__ import annotations

import json
import re
from typing import Annotated, Callable, Iterable, Literal

from pydantic import Field

from learning.assessment import record_attempt
from learning.context import LearningRequest
from learning.contracts import Entity, EntityRef, Finding, Record, Text
from learning.decisions import approval_valid
from learning.outputs import Citation
from learning.policies import AuthorizationError, TrustedPolicy, authorize, scope_allows


LEARNER = 'LEARNER'
REQUEST_ID = r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}'
ClientRequestId = Annotated[str, Field(pattern=f'^{REQUEST_ID}$', description="The learner's own request id")]


def learner_request_id(subject_key: str, request_id: str) -> str:
    """The ALM request id of a learner's own request id: scoped by subject, so two learners never share one.

    A learner's own id has no colon, so the subject and the id are read back unambiguously (Chat 32 finding 1).
    """
    return f'learner:{subject_key}:{request_id}'


class Answer(Record):
    """The response to a learner's question as the learner reads it: never a proposal, a decision or a state."""
    kind: Literal['ANSWER', 'CLARIFICATION', 'PARTIAL_RESULT', 'FAILURE']
    content: Text
    citations: tuple[Citation, ...] = ()
    coverage: tuple[EntityRef, ...] = ()
    findings: tuple[Finding, ...] = ()


class Question(Record):
    """A learner's question: to the Teacher (``EXPLAIN``) or to the Socratic coach (``SOCRATIC_GUIDANCE``).

    The coach follows Socratic option b: its worker may read sources that hold the solution, and only what it
    returns is judged. A problem stays with the coach until the learner switches from it explicitly.
    """
    text: Text
    intent: Literal['EXPLAIN', 'SOCRATIC_GUIDANCE'] = 'EXPLAIN'
    problem_key: Text | None = None
    switch_from_socratic: bool = False
    activities: tuple[EntityRef, ...] = ()


class LearnerCourse(Record):
    """A course the learner is enrolled in: its delivery context and the name of its learning design."""
    context_id: Text
    title: Text


class Competence(Record):
    """An ALM ``Topic`` that a learning outcome addresses; the studio shows it as a competence."""
    ref: EntityRef
    name: Text
    definition: Text


class Outcome(Record):
    ref: EntityRef
    statement: Text
    kind: Text | None = None
    target_level: Text | None = None
    competences: tuple[EntityRef, ...]


class Strategy(Record):
    """A teaching strategy of the course."""
    ref: EntityRef
    name: Text
    family: Text
    rationale: Text
    constraints: tuple[Text, ...]


class Material(Record):
    """A resource bound to this delivery by a reviewed binding the learner may read."""
    ref: EntityRef
    title: Text
    content_or_locator: Text
    language: Text | None = None
    usage_conditions: Text


class Activity(Record):
    ref: EntityRef
    intent: Text
    format: Text
    instruction: Text
    expected_evidence: tuple[Text, ...]
    outcomes: tuple[EntityRef, ...]
    strategies: tuple[EntityRef, ...]
    materials: tuple[EntityRef, ...]
    assessment: EntityRef | None = None


class Node(Record):
    """A phase or unit of the syllabus, with its activities and the parts directly inside it, in order."""
    ref: EntityRef
    kind: Text
    name: Text
    composition: Text | None = None
    estimated_duration: Text | None = None
    outcomes: tuple[EntityRef, ...]
    strategies: tuple[EntityRef, ...]
    activities: tuple[Activity, ...]
    children: tuple[Node, ...]


class RubricLevel(Record):
    key: Text
    descriptor: Text


class RubricCriterion(Record):
    key: Text
    description: Text
    outcomes: tuple[EntityRef, ...]
    levels: tuple[RubricLevel, ...]


class Rubric(Record):
    ref: EntityRef
    name: Text
    criteria: tuple[RubricCriterion, ...]


class Assessment(Record):
    """An assessment as the learner sees it (D20): never its answer key."""
    ref: EntityRef
    activities: tuple[EntityRef, ...]
    outcomes: tuple[EntityRef, ...]
    conditions: tuple[Text, ...]
    accepted_evidence: tuple[Text, ...]
    rubric: Rubric | None = None


class CourseView(Record):
    """The validated course of a delivery as its learners see it (D20)."""
    context_id: Text
    title: Text
    outcomes: tuple[Outcome, ...]
    competences: tuple[Competence, ...]
    strategies: tuple[Strategy, ...]
    structure: Node
    materials: tuple[Material, ...]
    assessments: tuple[Assessment, ...]


class Occurrence(Record):
    """One of the learner's attempts at an activity."""
    ref: EntityRef
    activity: EntityRef
    process_node: EntityRef | None = None
    status: Text
    evidence: tuple[EntityRef, ...]


class Evidence(Record):
    """What the learner handed in, as it was observed."""
    ref: EntityRef
    activity: EntityRef
    occurrence: EntityRef
    outcomes: tuple[EntityRef, ...]
    kind: Text
    content_or_locator: Text
    observed_at: Text


class Judgment(Record):
    """One rubric criterion of an applied evaluation: its level (none when undetermined) and the reason."""
    criterion_key: Text
    level_key: Text | None = None
    reason: Text


class Evaluation(Record):
    """An evaluation of the learner's evidence that a person approved and applied."""
    ref: EntityRef
    assessment: EntityRef
    mode: Text
    evidence: tuple[EntityRef, ...]
    judgments: tuple[Judgment, ...]
    result: Text | None = None


class LearningState(Record):
    """The learner's state for one outcome, derived only from applied evaluations."""
    ref: EntityRef
    outcome: EntityRef
    progress: Text
    verification: Text
    basis: tuple[EntityRef, ...]


class OwnProgress(Record):
    context_id: Text
    occurrences: tuple[Occurrence, ...]
    evidence: tuple[Evidence, ...]
    evaluations: tuple[Evaluation, ...]
    learning_states: tuple[LearningState, ...]


def _refs(values: Iterable) -> tuple[EntityRef, ...]:
    return tuple(EntityRef.model_validate(value) for value in values)


def _learner_grant(policy: TrustedPolicy | None, subject_key: str, context_id: str) -> bool:
    grant = policy.subjects.get(subject_key) if policy else None
    return bool(grant and LEARNER in grant.roles and 'read' in grant.actions.get(context_id, []))


def enrolled_courses(store, policy_of: Callable[[EntityRef], TrustedPolicy | None],
                     subject_key: str) -> tuple[LearnerCourse, ...]:
    """The courses of a learner (D19, for now), by context id; the one source of the list (D37 may change it).

    A LEARNING context with status ACTIVE whose installed policy (``policy_of`` its ``policies`` reference) grants
    the subject ``LEARNER`` and ``read`` there, and whose participants include the subject as ``LEARNER``. A
    membership not applied yet changes neither, so its member is not listed.
    """
    found = []
    with store.read_transaction():
        for context_id in store.context_ids():
            root = store.read_context(context_id)
            if (root.fields['mode'], root.fields['status']) != ('LEARNING', 'ACTIVE'):
                continue
            if not _learner_grant(policy_of(EntityRef.model_validate(root.fields['policies'])), subject_key, context_id):
                continue
            participants = [store.read(ref, owner=context_id) for ref in _refs(root.fields['participants'])]
            if not any(p.fields['subjectKey'] == subject_key and LEARNER in p.fields['roles'] for p in participants):
                continue
            design = store.read(EntityRef.model_validate(root.fields['learningDesign']), owner=context_id)
            found.append(LearnerCourse(context_id=context_id, title=design.fields['name']))
    return tuple(found)


def learner_context(context):
    """Check that the subject is a learner of this course and that the course is open to learners."""
    subject = context.request.subject_key
    authorize(context.policy, subject, 'read', context.snapshot.context.ref)
    if LEARNER not in set(context.participant.fields['roles']) & set(context.policy.subjects[subject].roles):
        raise AuthorizationError('Only a learner of this course reads it here')
    root = context.snapshot.context
    if (root.fields['mode'], root.fields['status']) != ('LEARNING', 'ACTIVE') or not root.fields.get('learningDesign'):
        raise ValueError('The course is not open to learners')
    return context


def _materials(context, activity: Entity) -> tuple[Entity, ...]:
    """The resources bound to the activity's requirements by a valid, approved binding in a scope the learner may read."""
    snapshot, subject = context.snapshot, context.request.subject_key
    bindings = [snapshot.get(ref) for ref in snapshot.context.fields['resourceBindings']]
    found = {}
    for requirement in activity.fields['resourceRequirements']:
        for binding in bindings:
            if (binding.fields.get('requirement') == requirement and binding.fields['valid']
                    and approval_valid(binding, snapshot, context.policy)
                    and scope_allows(context.policy, binding.fields['usageScope'], snapshot.context.id, subject,
                                     (activity.id,))):
                resource = snapshot.get(binding.fields['resource'])
                found.setdefault(resource.ref, resource)
    return tuple(found.values())


def course_view(context) -> CourseView:
    """The validated course of the delivery in ``context`` as its learner sees it (D20)."""
    learner_context(context)
    snapshot = context.snapshot
    design = snapshot.get(snapshot.context.fields['learningDesign'])
    materials, assessments, strategies = {}, {}, {}

    def strategy(refs):
        for ref in _refs(refs):
            strategies.setdefault(ref, snapshot.get(ref))
        return _refs(refs)

    def activity(entity):
        bound = _materials(context, entity)
        materials.update((resource.ref, resource) for resource in bound)
        spec = entity.fields.get('assessmentSpec')
        if spec:
            assessments.setdefault(EntityRef.model_validate(spec), snapshot.get(spec))
        fields = entity.fields
        return Activity(ref=entity.ref, intent=fields['intent'], format=fields['format'],
                        instruction=fields['instruction'], expected_evidence=tuple(fields['expectedEvidence']),
                        outcomes=_refs(fields['outcomes']), strategies=strategy(fields.get('strategies', [])),
                        materials=tuple(resource.ref for resource in bound),
                        assessment=EntityRef.model_validate(spec) if spec else None)

    def node(entity):
        fields = entity.fields
        return Node(ref=entity.ref, kind=fields['kind'], name=fields['name'], composition=fields.get('composition'),
                    estimated_duration=fields.get('estimatedDuration'), outcomes=_refs(fields['outcomes']),
                    strategies=strategy(fields.get('strategies', [])),
                    activities=tuple(activity(snapshot.get(ref)) for ref in fields['activities']),
                    children=tuple(node(snapshot.get(ref)) for ref in fields['children']))

    structure = node(snapshot.get(design.fields['root']))
    strategy(design.fields.get('strategies', []))
    for ref in _refs(design.fields.get('assessmentSpecs', [])):
        assessments.setdefault(ref, snapshot.get(ref))
    outcomes = [snapshot.get(ref) for ref in design.fields['outcomes']]
    competences = {}
    for outcome in outcomes:
        for ref in _refs(outcome.fields['topics']):
            competences.setdefault(ref, snapshot.get(ref))

    def rubric(ref):
        if not ref:
            return None
        entity = snapshot.get(ref)
        return Rubric(ref=entity.ref, name=entity.fields['name'], criteria=tuple(RubricCriterion(
            key=c['key'], description=c['description'], outcomes=_refs(c['outcomes']),
            levels=tuple(RubricLevel(key=level['key'], descriptor=level['descriptor']) for level in c['levels']))
            for c in entity.fields['criteria']))

    return CourseView(
        context_id=snapshot.context.id, title=design.fields['name'],
        outcomes=tuple(Outcome(ref=o.ref, statement=o.fields['statement'], kind=o.fields.get('kind'),
                               target_level=o.fields.get('targetLevel'), competences=_refs(o.fields['topics']))
                       for o in outcomes),
        competences=tuple(Competence(ref=t.ref, name=t.fields['name'], definition=t.fields['definition'])
                          for t in competences.values()),
        strategies=tuple(Strategy(ref=s.ref, name=s.fields['name'], family=s.fields['family'],
                                  rationale=s.fields['rationale'], constraints=tuple(s.fields.get('constraints', [])))
                         for s in strategies.values()),
        structure=structure,
        materials=tuple(Material(ref=r.ref, title=r.fields['title'], content_or_locator=r.fields['contentOrLocator'],
                                 language=r.fields.get('language'), usage_conditions=r.fields['usageConditions'])
                        for r in materials.values()),
        assessments=tuple(Assessment(ref=a.ref, activities=_refs(a.fields['activities']),
                                     outcomes=_refs(a.fields['outcomes']),
                                     conditions=tuple(a.fields.get('administrationConstraints', [])),
                                     accepted_evidence=tuple(a.fields['allowedEvidence']),
                                     rubric=rubric(a.fields.get('rubric')))
                          for a in assessments.values()))


def _evidence(entity: Entity) -> Evidence:
    return Evidence(ref=entity.ref, activity=EntityRef.model_validate(entity.fields['activity']),
                    occurrence=EntityRef.model_validate(entity.fields['occurrence']),
                    outcomes=_refs(entity.fields['outcomes']), kind=entity.fields['kind'],
                    content_or_locator=entity.fields['contentOrLocator'], observed_at=entity.fields['observedAt'])


def own_progress(store, context) -> OwnProgress:
    """The learner's own occurrences, evidence, applied evaluations and learning states in ``context``."""
    learner_context(context)
    snapshot, own = context.snapshot, context.participant.ref.model_dump()
    root = snapshot.context

    def mine(refs):
        # Records of the context, kept only when they are the learner's own, whatever the subject's other roles.
        entities = [snapshot.entities.get(ref) for ref in _refs(refs)]
        return [entity for entity in entities if entity is not None and entity.fields['learner'] == own]

    occurrences = mine(root.fields['activityOccurrences'])
    evidence = mine(ref for occurrence in occurrences for ref in occurrence.fields['evidence'])
    states = mine(root.fields['learningStates'])
    handed_in = {e.ref for e in evidence}
    # An applied evaluation is in the context's own records; a pending draft is only a candidate of its proposal.
    evaluations = [e for e in store.owned(root.id, 'Evaluation')
                   if e.fields.get('humanDecision') and e.fields['evidence']
                   and set(_refs(e.fields['evidence'])) <= handed_in]
    return OwnProgress(
        context_id=root.id,
        occurrences=tuple(Occurrence(ref=o.ref, activity=EntityRef.model_validate(o.fields['activity']),
                                     process_node=EntityRef.model_validate(o.fields['processNode'])
                                     if o.fields.get('processNode') else None,
                                     status=o.fields['status'], evidence=_refs(o.fields['evidence']))
                          for o in occurrences),
        evidence=tuple(_evidence(e) for e in evidence),
        evaluations=tuple(Evaluation(ref=e.ref, assessment=EntityRef.model_validate(e.fields['specification']),
                                     mode=e.fields['mode'], evidence=_refs(e.fields['evidence']),
                                     judgments=tuple(Judgment(criterion_key=j['criterionKey'], level_key=j.get('levelKey'),
                                                              reason=j['reason'])
                                                     for j in e.fields.get('criterionJudgments', [])),
                                     result=e.fields.get('result'))
                          for e in evaluations),
        learning_states=tuple(LearningState(ref=s.ref, outcome=EntityRef.model_validate(s.fields['outcome']),
                                            progress=s.fields['progress'], verification=s.fields['verification'],
                                            basis=_refs(s.fields['basis']))
                              for s in states))


def submit_attempt(store, context, activity, content: str, request_id: str) -> Evidence:
    """The learner's attempt at an activity of the course, recorded once under their own ``request_id``.

    The same id and attempt again return the same evidence; another attempt under that id is a conflict.
    """
    learner_context(context)
    subject = context.request.subject_key
    return _evidence(record_attempt(store, context, activity, content,
                                    request_id=learner_request_id(subject, request_id)))


def _own_request_id(subject_key: str, request_id: str) -> bool:
    prefix = learner_request_id(subject_key, '')
    return request_id.startswith(prefix) and re.fullmatch(REQUEST_ID, request_id[len(prefix):]) is not None


def question_request(context, question: Question, request_id: str) -> LearningRequest:
    """The ALM request of a learner's question; ``request_id`` is already the learner's scoped id."""
    learner_context(context)
    subject, root = context.request.subject_key, context.snapshot.context
    authorize(context.policy, subject, 'interact', root.ref)
    if not _own_request_id(subject, request_id):
        raise ValueError("The request id is not the learner's own")
    return LearningRequest(request_id=request_id, context_ref=root.ref, subject_key=subject, text=question.text,
                           activity_refs=question.activities, intent=question.intent, problem_key=question.problem_key,
                           switch_from_socratic=question.switch_from_socratic)


def own_answer(store, context, request_id: str) -> Answer | None:
    """The recorded response to the learner's own request under the scoped ``request_id``, or ``None``.

    A learner never proposes, so a recorded response is never a proposal; its kind is checked all the same.
    """
    learner_context(context)
    subject = context.request.subject_key
    record = store.request_record(request_id, context.snapshot.context.id)
    if (not _own_request_id(subject, request_id) or record is None or record.result is None
            or json.loads(record.payload).get('subject_key') != subject):
        return None
    response = json.loads(record.result)
    return Answer.model_validate({key: response[key] for key in Answer.model_fields if key in response})
