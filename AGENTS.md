# Language conventions

Use English for all code, comments, prompts, messages, tests and documentation.
Use English for GitHub content, including issues, pull requests and commit messages.
Use Italian when chatting with the repository owner.

# Roadmap harness

The prototype roadmap is run with `./aim` (guide: `docs/plans/harness-guide.md`, section "For agents").

- Start of every chat: `./aim status`, `./aim log -n 3`, `./aim show <step>`; then
  `./aim claim <step> --agent <your-tool-name> --worktree` and work in the worktree it creates.
- Before you stop, always: `./aim handoff <step> --agent <name> --done "…" --next "…"`; when the PR is
  published and the handoff has no `TODO(aim)` left: `./aim review <step> --pr <number>`.
- Never decide for the owner: record a choice with `./aim propose`, ask, stop. Never run `./aim accept`,
  `./aim reject`, `./aim skip` or close an owner check (`C…`).
- Investigations (`I<n>`): fill the brief in `docs/plans/investigations/` with evidence and end with
  `./aim propose D<n>`; never implement the choice before the owner accepts it.
- Never edit `docs/plans/STATUS.md`, `docs/plans/DECISIONS.md` or the generated blocks of the roadmap by hand;
  change `docs/plans/steps.json` and `docs/plans/decisions.json` only through `./aim`.
- If you change `tools/harness/aim.py`, update `docs/plans/harness-guide.md` in the same commit and run
  `./aim selfcheck`.
