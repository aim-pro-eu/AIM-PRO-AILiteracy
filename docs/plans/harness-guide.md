# Harness guide: running the roadmap with `./aim`

`./aim` keeps the [prototype roadmap](prototype-roadmap.md) moving across chats and coding agents (Claude Code,
Codex, ChatGPT, others). It does the bookkeeping of the roadmap's working protocol: which step can start, who is
on it, which chat number it gets, the handoff, the PR, the decisions waiting for the owner. It is one Python file
with the standard library only (`tools/harness/aim.py`); `./aim help` lists every command.

Run it from the repository root or from a step's worktree:

```bash
cd /Users/juridirocco/development/py-prototype
./aim status
```

## Files

| File | What it is | Who changes it |
| --- | --- | --- |
| [steps.json](steps.json) | Steps S01…, owner checks C1…, milestones M1… (status, dependencies, decisions, issues, PRs, chats) | `./aim` commands; the owner adds new steps by hand in a PR |
| [decisions.json](decisions.json) | Every decision: open, proposed, accepted, rejected, superseded | `./aim propose` (agents), `./aim accept` / `reject` (owner) |
| [STATUS.md](STATUS.md) | Board: milestones, active steps, ready steps, steps, owner checks, latest handoffs | generated |
| [DECISIONS.md](DECISIONS.md) | Decision log grouped by status | generated |
| [prototype-roadmap.md](prototype-roadmap.md) | The plan; its step table and its decision table are generated blocks; the `### Sxx` sections stay hand-written guidance | the owner, in a PR |
| [handoffs/chat-NN.md](handoffs/) | One handoff per chat, written from the template by `./aim handoff` | the agent of that chat |
| `tools/harness/config.json` | GitHub repository, worktree folder, check commands, stack URLs | the owner |
| `var/prompts/` | Generated prompts (ignored by git) | `./aim prompt` |

Symbols: `·` todo, `▶` in progress, `■` blocked, `◆` review (PR open), `✓` done, `–` skipped. `← S13, C3` means
the item waits for S13 and the owner check C3; a decision id there means the decision is not accepted yet.

## For the owner: the work cycle

```
./aim watch                                   live view; leave it open in a terminal tab
./aim next                                    what can start, what is active, decisions waiting for you
./aim run S13b --tool codex --agent codex-1   claim + worktree + prompt + start the agent
      (or ./aim prompt S13b and paste the brief into any agent)
      … the agent works in .worktrees/s13b, writes the handoff, opens the PR,
        runs ./aim review S13b --pr <n> …
review and merge the PR
./aim issues --sync                           closes the steps whose PR is merged (in the next PR)
```

Your part: choose the next step, answer decisions, do the owner checks (C1…), review and merge the PRs.

### See where things stand

| Command | What it does |
| --- | --- |
| `./aim status` | Milestones, open steps with what they wait for, owner checks, decisions. Also regenerates the plan files. `--all` shows finished steps too |
| `./aim next` | Steps and checks that can start now (checks marked `← OWNER`), active steps, decisions waiting for you with the command to answer each, and what the others wait for |
| `./aim show S13` | One step: state, milestone, dependencies, issues, PRs, chats, branch, the decisions it needs and its roadmap section. `./aim show C1` lists what you have to do for a check |
| `./aim log -n 3` | The latest handoffs with their "Next step" section |

Example of `./aim next` on 24 November 2026:

```
C1     Confirm the three Chat 38 choices of PR #156 (D38): same activity only; …  ← OWNER (manual check)

Active:
  ◆ S13    review: PR #156

Waiting:
  S13b   ← S13, C3
  S14    ← D16
  S15    ← AN6
  C2     ← S13
  C3     ← S13
```

### Start an agent on a step

```bash
./aim prompt S13b                    # Claude Code (default)
./aim prompt S13b --tool codex       # Codex
./aim prompt S13b --tool chatgpt     # inlines AGENTS.md and the last handoff, for tools without the repository
./aim prompt S13b --inline           # same inlining for any tool
```

The prompt carries the step section, the working protocol, the decisions the step depends on, the reading list and
the harness commands the agent must run. It is saved in `var/prompts/S13b-<tool>.md`. When the step is already in
progress the prompt tells the agent to continue from the handoff of the current chat instead of starting again:
use it to switch agents when one runs out of tokens.

### Start an agent from the terminal

```bash
./aim run S13b --tool claude --agent claude-1                 # interactive: the agent asks you
./aim run S13b --tool codex --agent codex-1 --mode auto       # unattended: no questions, log in var/logs/
```

`run` claims the step with a worktree (`.worktrees/s13b`), writes the prompt and starts the agent CLI (`claude` or
`codex`, which must be on `PATH`) inside the worktree. Running it again for the same agent resumes the step in the
same chat. In `--mode auto` the agent cannot ask you anything: the prompt tells it to record any choice with
`./aim propose`, block the step and stop; Claude Code runs with `acceptEdits` and a list of allowed tools (git, gh,
`./aim`, Python, npm, file tools), Codex with its workspace sandbox and automatic approval review. Neither mode
skips permissions. The output goes to `var/logs/<step>-<agent>-<time>.log`; at the end `run` warns if the step is
still in progress. Use `auto` for well-specified steps only; steps that need the owner (S13b, with the layout
owner) are better interactive.

### Follow the work live

```bash
./aim watch                  # refresh every 30 s; Ctrl-C to stop
./aim watch --interval 60
./aim watch --once           # one snapshot
```

It shows the milestones, the active steps **of every worktree** with the time of the last file change there (⚠
after 20 quiet minutes), the open PRs with their CI state, what waits for you (owner checks, proposals, also those
still on a branch), the steps ready for an agent, the agent processes on this machine and the tail of the latest
unattended log. On macOS it notifies you when a step goes to review or is blocked, a decision waits for you, an owner
check becomes ready or CI fails on a PR.

### Ask a question without changing anything

```bash
./aim ask "Which PR is waiting for me and why?"
./aim ask C1 "What exactly do I have to confirm?"
./aim ask S13b "Which files show the release views?" --tool codex
```

A read-only agent answers in Italian from the repository, the plan, the handoffs, GitHub and the running stack
(`curl` on 127.0.0.1 only). It cannot edit files, change git state, claim steps or call a model API. The answer is
saved in `var/logs/ask-…md`.

### Investigate a decision

```bash
./aim investigate "Where does the scenario input come from once it is independent of the AIM-PRO export?" \
  --blocks S14 --options "A: a scenario file in the course; B: a scenario API" --criteria "works with SE-AI"
```

It opens the next `D<n>` with the question, writes a brief in `docs/plans/investigations/D<n>.md` (question,
context, options, criteria, empty Findings and Recommendation) and adds an investigation `I<n>` that an agent can
run (`./aim run I1 …`). The blocked steps wait until you accept `D<n>`. The agent fills the brief with evidence,
runs `./aim propose D<n> "…" --why "…"` and publishes a PR; it never implements the choice.

### Worktrees and GitHub

```bash
./aim worktrees              # every worktree: branch, ahead/behind main, uncommitted changes, last change, claims
./aim worktrees --fetch      # fetch origin/main first
./aim issues                 # issues and PRs of the open steps, CI of open PRs, open PRs linked to no step
./aim issues --all           # also the finished steps
./aim issues --sync          # steps in review whose last PR is merged → done
```

`./aim status` and `./aim next` also list the claims and proposals that live only in other worktrees ("In other
worktrees (not on this branch yet)").

### Decisions

```bash
./aim decisions                      # open and proposed
./aim decisions --all                # also accepted, rejected and superseded
./aim accept D39                     # accept the proposal as written
./aim accept D39 "final wording"     # accept with your own text
./aim reject D39 --why "reason"      # back to open (or rejected when it had no question)
```

`accept`, `reject`, `skip` and closing an owner check (`./aim done C1`) are yours. They ask for a confirmation in
your terminal and refuse to run without one, so an agent's tool call cannot run them by mistake; `--yes` skips the
question when you run them from a script or from the `!` prefix of a chat. An accepted decision that a step lists in
its `decisions` makes the step ready (`./aim accept` prints which).

### Owner checks

Checks C1… are steps for you: a confirmation, a live run you authorize, an agreement with the layout owner. They
have dependencies like steps and can block steps (S13b waits for C3). `./aim show C2` lists what to do;
`./aim done C2` closes it.

### Checks and milestones

```bash
./aim check baseline:quick   # selfcheck, aimpro.generate --check, OpenAPI --check, evaluation --check (seconds)
./aim check baseline         # + the full offline suite (about 8 minutes) + the front-end checks in apps/
./aim check baseline:apps    # front-end checks only
./aim check stack            # Keycloak 58080, studio 58000, Learner API 58002, learner app 58003 answer
./aim check M3               # milestone: steps and checks finished, then its check groups
./aim check S13b             # the step's verify commands (baseline:quick when it has none)
```

Python commands use the project's `.venv` (of the worktree, else of the main checkout), or `AIM_PYTHON` when set;
the first line of the output names it. A front-end check in a folder without `node_modules` (a fresh worktree) is not run: it
fails with the command to install them (`npm ci --ignore-scripts` in `apps/`). Commands run with telemetry off (`LANGFUSE_ENABLED=false` and the CrewAI variables of `config.json`) and never call a
model. `./aim check stack` only reads health URLs: it never starts or stops your stacks.

### Housekeeping

| Command | When |
| --- | --- |
| `./aim render` | After resolving a merge conflict in `STATUS.md`, `DECISIONS.md` or the roadmap blocks: regenerate them from the JSON files |
| `./aim render --check` | Fails when a generated file is out of date |
| `./aim selfcheck` | Validates `steps.json` and `decisions.json` (unknown ids, missing sections, inconsistent states), checks that this guide documents every command and that the generated files are up to date. CI runs it |
| `./aim reset S13b` | Back to todo (a claim made by mistake) |
| `./aim skip S14` | Drop a step (owner) |

### Adding a step

Add an object to `steps` in `steps.json` (`id`, `title`, `phase`, `milestone` or `null`, `depends_on`, `decisions`,
`status: "todo"`, empty `issues`, `prs`, `chats`), write its `### Sxx — …` section in the roadmap, then run
`./aim render` and `./aim selfcheck`. Optional `verify` is a list of shell commands that `./aim check Sxx` runs. A new
owner check goes into `checks` with `steps_to_do`.

## For agents

The rules are the roadmap's working protocol; these are the commands that carry them out.

1. **Start.** `./aim status`, `./aim log -n 3`, `./aim show <step>`. A step in review whose PR is merged is closed
   with `./aim done <step>` in your own PR. If your step waits for something, stop and tell the owner.
2. **Claim.** `./aim claim S13b --agent codex --worktree`. It creates `.worktrees/s13b` on a new branch
   `feat/s13b-…` from `origin/main`, marks the step in progress and gives this chat its number (the next free
   `chat-NN`, counting the handoff files and the chats already recorded in `steps.json`, so open PRs do not
   collide). `cd` into the worktree and run every later command there: the claim is recorded in the worktree's
   `steps.json` and reaches `main` with the step's PR.
3. **Baseline.** `./aim check baseline` before any change; report differences from the previous handoff.
4. **Decisions.** Never decide for the owner. A new open choice:
   `./aim propose "Option B: …" --question "Which …?" --why "…" --blocks S13b --agent codex` (it takes the next free
   `D` id), then ask in chat and stop. A proposal for an existing open decision: `./aim propose D21 "…" --why "…"`.
   A blocked step: `./aim block S13b --reason "waits for D21"`.
5. **Stop at any time** (token limit, tool switch):
   `./aim handoff S13b --agent codex --done "what is finished" --next "the exact next action" --problems "…"`.
   The first call writes `docs/plans/handoffs/chat-NN.md` from the template; later calls append an update, so the
   next agent continues from the file. Commit before stopping.
6. **Finish.** Replace every `TODO(aim)` of the handoff with evidence (commands and results, commits, CI links),
   publish the PR, then `./aim review S13b --pr 160 --agent codex`. It refuses while the handoff misses a section
   or still has a placeholder. Commit `docs/plans` (the JSON files, the generated files, the handoff) in the PR.
7. **Investigations** (`I<n>`): the guidance is the brief in `docs/plans/investigations/`. Fill its Findings and
   Recommendation with evidence, `./aim propose D<n> "…" --why "…"`, then hand off and publish as for a step. Do not
   implement the choice.
8. **Never** edit `STATUS.md`, `DECISIONS.md` or the generated roadmap blocks by hand, and never run
   `./aim accept`, `./aim reject`, `./aim skip` or `./aim done C…`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `./aim: no such file or directory` | You are not at the repository root or in a worktree. `cd /Users/juridirocco/development/py-prototype` |
| `./aim status` on `main` does not mark a step that an agent claimed | The claim lives on the step's branch until its PR is merged; `./aim status` lists it under "In other worktrees", and `./aim watch` shows it |
| `./aim run` says the tool is not on `PATH` | Install the CLI (`claude` or `codex`) or use `./aim prompt` and paste the brief |
| `./aim issues` fails | `gh` is missing or not signed in: `gh auth status` |
| Merge conflict in `STATUS.md`, `DECISIONS.md` or the roadmap | Resolve `steps.json` and `decisions.json` (the sources), then `./aim render` |
| `./aim review` refuses | The handoff misses a section or has `TODO(aim)` left: the message lists them |
| `… is the owner's action` | `accept`, `reject`, `skip`, `done C…` need the owner's terminal (or `--yes`) |
| `./aim selfcheck` fails in CI | Run it locally; it names each problem |
