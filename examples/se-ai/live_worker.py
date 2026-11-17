"""The agent job worker with every agent on the configured ``anthropic`` profile, for the SE-AI case study.

    .venv/bin/python examples/se-ai/live_worker.py [--once] [--poll SECONDS]

It is ``python -m services.jobs`` (same settings: ``ALM_STORE``, ``ALM_POLICY_DIR``, ``ALM_JOBS_STORE``,
``ALM_AIMPRO_EXPORTS``) with one change, in this process only: every model profile an agent names resolves to the
``anthropic`` profile of ``model.properties``, with paid use allowed. Curator, Evaluator, Teacher, Trainer, the
review agent and the runtime assessor therefore all call Anthropic. ``model.properties`` and the agent files stay
unchanged. It needs ``ANTHROPIC_API_KEY`` (read from ``.env`` as the worker does).

It calls a paid provider: run it only with the owner's authorization (given for the SE-AI case study on
17 November 2026). Synthetic course data only.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import main  # noqa: E402
from agent_system.config import load_model_catalog  # noqa: E402


def anthropic_catalog(path):
    """The model catalogue at ``path`` with every profile replaced by its ``anthropic`` profile, paid use allowed."""
    catalog = load_model_catalog(path)
    anthropic = catalog.profiles['anthropic'].model_copy(update={'allow_paid': True})
    return catalog.model_copy(update={'profiles': {name: anthropic for name in catalog.profiles}})


if __name__ == '__main__':
    # The builders of main.py (authoring, review agent, runtime assessor) read the catalogue through this name.
    main.load_model_catalog = anthropic_catalog
    from services.jobs.__main__ import main as worker

    raise SystemExit(worker())
