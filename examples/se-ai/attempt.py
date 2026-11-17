"""Record a learner's attempt at an assessment of an active delivery course, through ``submit`` (dev only).

There is no learner application before S12/S13: this stands in for it in the SE-AI case study.

    .venv/bin/python examples/se-ai/attempt.py --state /tmp/alm-se-ai --context se-ai-delivery
    .venv/bin/python examples/se-ai/attempt.py --state /tmp/alm-se-ai --context se-ai-delivery --activity 2 \\
        --response-file answer.txt

Without ``--activity`` it lists the assessment activities of the course. The course's installed policy is found in
``STATE/policies`` by the context's exact policy reference, as the API finds it. Synthetic responses only.
"""

import argparse
import json
import os
from pathlib import Path
import sys
from unittest.mock import Mock
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
for name, value in {'LANGFUSE_ENABLED': 'false', 'CREWAI_DISABLE_TELEMETRY': 'true',
                    'CREWAI_TRACING_ENABLED': 'false'}.items():
    os.environ.setdefault(name, value)

from learning.contracts import EntityRef  # noqa: E402
from learning.metamodel import load_contract  # noqa: E402
from learning.service import LearningService  # noqa: E402
from learning.store import LearningStore  # noqa: E402
from services.api_common.contexts import PolicyDirectory  # noqa: E402

# A synthetic response for M1 (requirements); write your own for another assessment.
RESPONSE = """Story 1: As a group member, I want to create a task with a title, an owner and a deadline, so that everyone knows who does what.
Given a signed-in member, when they save a task without a deadline, then the task is rejected with the message 'deadline required'.
Story 2: As a task owner, I want a reminder the day before the deadline, so that I do not miss it.
Given a task due tomorrow, when the daily reminder runs, then the owner receives one reminder; given a task already done, then no reminder is sent.
Open questions: which time zone defines 'the day before' (product owner); may a task have more than one owner (product owner).
AI use: I asked the assistant for missing edge cases. I rejected its 'payment for premium boards' story because the request never mentions payments,
and I replaced its example e-mail addresses with synthetic names."""


def main(argv=None):
    parser = argparse.ArgumentParser(description="Record a learner's attempt at an assessment (dev only)")
    parser.add_argument('--state', type=Path, required=True, help='The stack directory: alm.sqlite and policies/')
    parser.add_argument('--context', required=True, help='The active delivery course')
    parser.add_argument('--subject', default='learner')
    parser.add_argument('--activity', type=int, help='Number of the assessment activity, as listed')
    parser.add_argument('--response-file', type=Path, help='The response text; a synthetic M1 answer by default')
    args = parser.parse_args(argv)
    with LearningStore(args.state / 'alm.sqlite') as store:
        root = store.read_context(args.context)
        policy = PolicyDirectory(args.state / 'policies').find(EntityRef.model_validate(root.fields['policies']))
        if policy is None:
            print('The course policy is not installed', file=sys.stderr)
            return 2
        service = LearningService(store, load_contract(), policy, Mock(side_effect=AssertionError('No agents')))
        context = service._context(args.context, args.subject)
        activities = sorted((e for e in context.snapshot.active_domain()
                             if e.type == 'ActivityDefinition' and e.fields['intent'] == 'ASSESS'),
                            key=lambda e: e.fields['instruction'])
        if args.activity is None:
            for number, activity in enumerate(activities, 1):
                print(f"{number}. {activity.fields['instruction'].splitlines()[0][:160]}")
            return 0
        activity = activities[args.activity - 1]
        response = args.response_file.read_text(encoding='utf-8') if args.response_file else RESPONSE
        evidence = service.submit(args.context, args.subject, activity.ref, response, 'attempt-' + uuid4().hex)
        print(json.dumps({'evidence': evidence.ref.model_dump(), 'activity': activity.fields['instruction'].splitlines()[0]}))
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
