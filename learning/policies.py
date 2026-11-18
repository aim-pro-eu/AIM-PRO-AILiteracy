from pathlib import Path
import json
from typing import Literal

from pydantic import Field

from learning.contracts import EntityRef, Record, Text


HumanRole = Literal["LEARNER", "CONTENT_RESPONSIBLE", "ASSESSOR", "OBSERVER", "ADMINISTRATOR"]
Action = Literal["read", "interact", "submit", "propose", "decide", "apply", "bootstrap"]


class AuthorizationError(ValueError):
    """The trusted policy does not grant the action; a ``ValueError`` for existing callers."""


class SubjectGrant(Record):
    roles: list[HumanRole]
    actions: dict[Text, list[Action]]


class ScopeGrant(Record):
    contexts: list[Text]
    subjects: list[Text]
    activities: list[Text] = Field(default_factory=list)
    resources: list[Text] = Field(default_factory=list)
    sources: list[Text] = Field(default_factory=list)
    operations: list[Text] = Field(default_factory=lambda: ["read"])


class RuleBinding(Record):
    rule: EntityRef
    handler: Literal["answer_key_match", "all_true", "all_completed"]


class LearnerGrant(Record):
    """A delivery's reviewed grant to its learners (D37, S12b): what every participant who is only a learner there,
    and whom the policy does not name in it, may do, and the scopes they read."""
    actions: list[Literal["read", "interact", "submit"]]
    scopes: list[Text] = Field(default_factory=list)


class TrustedPolicy(Record):
    policy_ref: EntityRef
    subjects: dict[Text, SubjectGrant]
    scopes: dict[Text, ScopeGrant] = Field(default_factory=dict)
    rule_bindings: list[RuleBinding] = Field(default_factory=list)
    # By context id. Left out when empty, so a policy without a grant serializes as before S12b.
    learners: dict[Text, LearnerGrant] = Field(default_factory=dict, exclude_if=lambda learners: not learners)


def load_trusted_policy(path: Path, policy_ref: EntityRef) -> TrustedPolicy:
    policy = TrustedPolicy.model_validate(json.loads(path.read_text()))
    if policy.policy_ref != policy_ref or policy_ref.type != "PolicySet":
        raise ValueError("Trusted policy version mismatch")
    return policy


def with_learner(policy: TrustedPolicy, context_id: str, subject_key: str) -> TrustedPolicy:
    """``policy`` as it applies to a learner participant of ``context_id`` under the context's learner grant.

    The caller has checked that ``subject_key`` is a participant there with the ``LEARNER`` role only. Unchanged
    when the context has no grant or the policy already names the subject in it.
    """
    grant = policy.learners.get(context_id)
    named = policy.subjects.get(subject_key)
    if grant is None or named is not None and context_id in named.actions:
        return policy
    roles = named.roles if named and "LEARNER" in named.roles else [*(named.roles if named else []), "LEARNER"]
    actions = {**(named.actions if named else {}), context_id: list(grant.actions)}
    scopes = {name: scope.model_copy(update={"subjects": [*scope.subjects, subject_key]})
              if name in grant.scopes and subject_key not in scope.subjects else scope
              for name, scope in policy.scopes.items()}
    return policy.model_copy(update={"subjects": {**policy.subjects, subject_key: SubjectGrant(roles=roles, actions=actions)},
                                     "scopes": scopes})


def authorize(policy: TrustedPolicy, subject_key: str, action: str, context_ref: EntityRef) -> None:
    subject = policy.subjects.get(subject_key)
    if context_ref.type != "ExecutionContext" or subject is None or action not in subject.actions.get(context_ref.id, []):
        raise AuthorizationError("Action is not authorized in this context")


def scope_allows(policy: TrustedPolicy, name: str, context_id: str, subject: str,
                 activity_ids: tuple[str, ...] = ()) -> bool:
    scope = policy.scopes.get(name)
    return bool(scope and context_id in scope.contexts and subject in scope.subjects
                and "read" in scope.operations
                and (not scope.activities or (activity_ids and set(activity_ids) <= set(scope.activities))))
