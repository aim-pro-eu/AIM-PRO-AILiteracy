#!/usr/bin/env python3
"""aim: harness for the AIM-PRO prototype roadmap.

Sources of truth (edited only through this tool, except to add steps):
  docs/plans/steps.json       steps S01…, owner checks C1…, milestones M1…
  docs/plans/decisions.json   decisions D… (open, proposed, accepted, rejected)
Generated (never edit by hand):
  docs/plans/STATUS.md, docs/plans/DECISIONS.md and the marked blocks of
  docs/plans/prototype-roadmap.md.
Handoffs stay one file per chat: docs/plans/handoffs/chat-NN.md.

Standard library only. Run `./aim help` from the repository root (or a worktree).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shlex
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(os.environ.get("AIM_ROOT") or Path(__file__).resolve().parent.parent.parent)
PLANS = ROOT / "docs" / "plans"
STEPS = PLANS / "steps.json"
DECISIONS = PLANS / "decisions.json"
STATUS_MD = PLANS / "STATUS.md"
DECISIONS_MD = PLANS / "DECISIONS.md"
ROADMAP = PLANS / "prototype-roadmap.md"
HANDOFFS = PLANS / "handoffs"
GUIDE = PLANS / "harness-guide.md"
CONFIG = ROOT / "tools" / "harness" / "config.json"
PROMPTS = ROOT / "var" / "prompts"

STATES = ["todo", "in_progress", "blocked", "review", "done", "skipped"]
ICON = {"todo": "·", "in_progress": "▶", "blocked": "■", "review": "◆", "done": "✓", "skipped": "–"}
FINISHED = {"done", "skipped"}
DECISION_STATES = ["open", "proposed", "accepted", "rejected", "superseded"]
HANDOFF_SECTIONS = ["## Summary", "## Baseline verified", "## What was built", "## Verification",
                    "## Findings", "## Open decisions", "## Next step"]
TODO_MARK = "TODO(aim)"

# ----------------------------------------------------------------- data access


def now() -> str:
    return dt.datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")


def today_words() -> str:
    d = dt.date.today()
    return f"{d.day} {d.strftime('%B %Y')}"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def load() -> dict:
    return read_json(STEPS)


def load_decisions() -> dict:
    return read_json(DECISIONS)


def save(data: dict | None = None, decisions: dict | None = None) -> None:
    if data is not None:
        write_json(STEPS, data)
    if decisions is not None:
        write_json(DECISIONS, decisions)
    render()


def config() -> dict:
    return read_json(CONFIG)


def items(data: dict) -> list[dict]:
    """Steps and owner checks, in one id space."""
    return data["steps"] + data.get("checks", [])


def is_check(item: dict) -> bool:
    return item["id"].startswith("C")


def item_by_id(data: dict, iid: str) -> dict:
    for t in items(data):
        if t["id"].lower() == iid.lower():
            return t
    sys.exit(f"Unknown step or check {iid}. Run ./aim status to see the ids.")


def decision_by_id(dec: dict, did: str, required: bool = True) -> dict | None:
    for d in dec["decisions"]:
        if d["id"].lower() == did.lower():
            return d
    if required:
        sys.exit(f"Unknown decision {did}. Run ./aim decisions --all.")
    return None


def deps_open(data: dict, item: dict, dec: dict | None = None) -> list[str]:
    status = {t["id"]: t["status"] for t in items(data)}
    waiting = [d for d in item.get("depends_on", []) if status.get(d) not in FINISHED]
    dec = dec or load_decisions()
    for did in item.get("decisions", []):
        d = decision_by_id(dec, did, required=False)
        if d is None or d["status"] != "accepted":
            waiting.append(did)
    return waiting


def ready(data: dict, dec: dict) -> list[dict]:
    return [t for t in items(data) if t["status"] == "todo" and not deps_open(data, t, dec)]


def gh_link(kind: str, n: int) -> str:
    base = f"https://github.com/{config()['github']}"
    return f"[#{n}]({base}/{'pull' if kind == 'pr' else 'issues'}/{n})"


def handoff_files() -> list[tuple[int, Path]]:
    out = []
    for p in HANDOFFS.glob("chat-*.md"):
        m = re.fullmatch(r"chat-(\d+)\.md", p.name)
        if m:
            out.append((int(m.group(1)), p))
    return sorted(out)


def next_chat_number(data: dict) -> int:
    numbers = [n for n, _ in handoff_files()]
    for t in data["steps"]:
        numbers += t.get("chats", [])
    return max(numbers, default=0) + 1


def handoff_path(n: int) -> Path:
    return HANDOFFS / f"chat-{n:02d}.md"


def roadmap_section(step_id: str) -> str:
    """The `### <id> — …` section of the roadmap: the guidance of the step."""
    text = ROADMAP.read_text(encoding="utf-8")
    m = re.search(rf"(?ms)^### {re.escape(step_id)} — .*?(?=^### |^## |\Z)", text)
    return m.group(0).strip() if m else ""


def roadmap_part(heading: str) -> str:
    text = ROADMAP.read_text(encoding="utf-8")
    m = re.search(rf"(?ms)^## {re.escape(heading)}.*?(?=^## |\Z)", text)
    return m.group(0).strip() if m else ""


def owner_only(args, what: str) -> None:
    """Soft guard: owner actions run in the owner's terminal, never from an agent's tool call."""
    if getattr(args, "yes", False):
        return
    if not sys.stdin.isatty():
        sys.exit(f"{what} is the owner's action. Agents never run it (AGENTS.md). "
                 "Owner: run it in your own terminal, or add --yes.")
    answer = input(f"{what}? [y/N] ").strip().lower()
    if answer not in ("y", "yes", "s", "si", "sì"):
        sys.exit("Nothing changed.")

# ----------------------------------------------------------------- rendering


def step_state_text(t: dict) -> str:
    if t["status"] == "done":
        prs = t.get("prs", [])
        return "done" + (f": PR{'s' if len(prs) > 1 else ''} " + ", ".join(f"#{p}" for p in prs) if prs else "")
    if t["status"] == "review":
        return "review" + (f": PR #{t['prs'][-1]}" if t.get("prs") else "")
    if t["status"] == "blocked":
        return "blocked" + (f": {t['blocked_reason']}" if t.get("blocked_reason") else "")
    if t["status"] == "in_progress":
        return f"in progress ({t.get('owner') or '?'})"
    return t["status"]


def depends_text(t: dict) -> str:
    parts = list(t.get("depends_on", [])) + list(t.get("decisions", []))
    if t.get("depends_note"):
        parts.append(t["depends_note"])
    return ", ".join(parts) or "—"


def roadmap_steps_table(data: dict) -> str:
    lines = ["| Step | Role-plan phase | Result | Depends on | Status |", "| --- | --- | --- | --- | --- |"]
    for t in data["steps"]:
        lines.append(f"| {t['id']} | {t.get('phase') or '—'} | {t['title']} | {depends_text(t)} | {step_state_text(t)} |")
    return "\n".join(lines)


def roadmap_decisions_block(dec: dict) -> str:
    lines = ["Decisions waiting for the owner and open decisions. The full log, with every accepted decision, is",
             "[DECISIONS.md](DECISIONS.md).", "",
             "| Id | Status | Question or proposal | Blocks |", "| --- | --- | --- | --- |"]
    for d in dec["decisions"]:
        if d["status"] in ("open", "proposed"):
            text = d.get("proposal") if d["status"] == "proposed" else d.get("question")
            lines.append(f"| {d['id']} | {d['status']} | {cell(text or '')} | {cell(d.get('blocks') or '—')} |")
    return "\n".join(lines)


def replace_block(text: str, name: str, body: str) -> str:
    start, end = f"<!-- aim:{name} start: generated by ./aim, do not edit -->", f"<!-- aim:{name} end -->"
    pattern = re.compile(rf"(?s){re.escape(start)}.*?{re.escape(end)}")
    if not pattern.search(text):
        return text
    return pattern.sub(lambda _m: f"{start}\n{body}\n{end}", text)


def cell(s: str) -> str:
    return str(s).replace("|", "\\|").replace("\n", " ")


def decisions_md(dec: dict) -> str:
    lines = ["# Decisions", "",
             "Generated by `./aim` from `docs/plans/decisions.json`. Do not edit by hand: agents propose with",
             "`./aim propose`, the owner answers with `./aim accept` or `./aim reject` (see the",
             "[harness guide](harness-guide.md)).", ""]
    groups = [("Waiting for the owner", "proposed"), ("Open", "open"), ("Accepted", "accepted"),
              ("Rejected", "rejected"), ("Superseded", "superseded")]
    for title, state in groups:
        rows = [d for d in dec["decisions"] if d["status"] == state]
        if not rows:
            continue
        lines += [f"## {title}", ""]
        if state == "open":
            lines += ["| Id | Question | Blocks | Brief |", "| --- | --- | --- | --- |"]
            for d in rows:
                brief = f"[{Path(d['brief']).name}]({os.path.relpath(ROOT / d['brief'], PLANS)})" if d.get("brief") else "—"
                lines.append(f"| {d['id']} | {cell(d.get('question', ''))} | {cell(d.get('blocks') or '—')} | {brief} |")
        elif state == "proposed":
            lines += ["| Id | Question | Proposal | Why | Proposed by |", "| --- | --- | --- | --- | --- |"]
            for d in rows:
                lines.append(f"| {d['id']} | {cell(d.get('question') or '—')} | {cell(d.get('proposal', ''))} | "
                             f"{cell(d.get('why') or '—')} | {cell(d.get('proposed_by') or '—')} |")
        else:
            lines += ["| Id | Decision | Date | Note |", "| --- | --- | --- | --- |"]
            for d in rows:
                text = d.get("decision") or d.get("proposal") or d.get("question") or ""
                if d.get("topic"):
                    text = f"**{d['topic']}.** {text}"
                note = d.get("note") or d.get("why") or ""
                if d.get("history"):
                    note = (note + "; earlier: " if note else "Earlier: ") + " / ".join(d["history"])
                lines.append(f"| {d['id']} | {cell(text)} | {cell(d.get('date') or '')} | {cell(note)} |")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def latest_handoffs(n: int) -> list[tuple[int, Path, str]]:
    out = []
    for num, p in handoff_files()[-n:][::-1]:
        first = p.read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
        out.append((num, p, first))
    return out


def status_md(data: dict, dec: dict) -> str:
    lines = ["# Status", "",
             "Generated by `./aim` from `docs/plans/steps.json`, `docs/plans/decisions.json` and the handoffs.",
             "Do not edit by hand. See the [harness guide](harness-guide.md).", "",
             "Legend: · todo  ▶ in progress  ■ blocked  ◆ review (PR open)  ✓ done  – skipped", "",
             "## Milestones", "", "| Milestone | Progress | Open | Goal |", "| --- | --- | --- | --- |"]
    status = {t["id"]: t["status"] for t in items(data)}
    for mid, m in data["milestones"].items():
        done = sum(1 for x in m["steps"] if status.get(x) in FINISHED)
        open_ = [x for x in m["steps"] if status.get(x) not in FINISHED]
        lines.append(f"| {mid} | {done}/{len(m['steps'])} | {', '.join(open_) or '—'} | {m['title']} |")
    active = [t for t in items(data) if t["status"] in ("in_progress", "review", "blocked")]
    lines += ["", "## Active", ""]
    lines += [f"- {ICON[t['status']]} **{t['id']}** {step_state_text(t)}" for t in active] or ["- nothing in progress"]
    lines += ["", "## Ready to start", ""]
    r = ready(data, dec)
    lines += [f"- **{t['id']}** {'(owner check) ' if is_check(t) else ''}{plain(t['title'])}" for t in r] \
        or ["- nothing: every open step waits on a step, a check or a decision"]
    waiting = [d for d in dec["decisions"] if d["status"] == "proposed"]
    lines += ["", "## Decisions waiting for the owner", ""]
    lines += [f"- **{d['id']}** {plain(d.get('proposal', ''))}" for d in waiting] or ["- none"]
    lines += ["", "## Steps", "", "| | Step | Title | Depends on | Chats | Status |", "| --- | --- | --- | --- | --- | --- |"]
    for t in data["steps"]:
        chats = ", ".join(str(c) for c in t.get("chats", [])) or "—"
        lines.append(f"| {ICON[t['status']]} | {t['id']} | {t['title']} | {depends_text(t)} | {chats} | {step_state_text(t)} |")
    lines += ["", "## Owner checks", "", "| | Check | Title | Depends on | Status |", "| --- | --- | --- | --- | --- |"]
    for t in data.get("checks", []):
        lines.append(f"| {ICON[t['status']]} | {t['id']} | {t['title']} | {depends_text(t)} | {t['status']} |")
    lines += ["", "## Latest handoffs", ""]
    for num, p, first in latest_handoffs(5):
        lines.append(f"- [chat-{num:02d}](handoffs/{p.name}): {first}")
    return "\n".join(lines) + "\n"


def plain(s: str) -> str:
    return re.sub(r"\*\*(.*?)\*\*", r"\1", s)


def rendered(data: dict | None = None, dec: dict | None = None) -> dict[Path, str]:
    data = data or load()
    dec = dec or load_decisions()
    roadmap = ROADMAP.read_text(encoding="utf-8")
    roadmap = replace_block(roadmap, "steps", roadmap_steps_table(data))
    roadmap = replace_block(roadmap, "decisions", roadmap_decisions_block(dec))
    return {STATUS_MD: status_md(data, dec), DECISIONS_MD: decisions_md(dec), ROADMAP: roadmap}


def render(data: dict | None = None, dec: dict | None = None) -> None:
    for path, text in rendered(data, dec).items():
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")

# ----------------------------------------------------------------- board commands


def line_for(data: dict, t: dict, dec: dict) -> str:
    waits = deps_open(data, t, dec)
    tail = f"  ← {', '.join(waits)}" if waits and t["status"] == "todo" else ""
    who = f" [{t['owner']}]" if t.get("owner") and t["status"] in ("in_progress", "review") else ""
    return f"  {ICON[t['status']]} {t['id']:<6} {plain(t['title'])[:90]}{who}{tail}"


def cmd_status(args) -> None:
    data, dec = load(), load_decisions()
    render(data, dec)
    status = {t["id"]: t["status"] for t in items(data)}
    print("Milestones")
    for mid, m in data["milestones"].items():
        done = sum(1 for x in m["steps"] if status.get(x) in FINISHED)
        print(f"  {mid}  {done}/{len(m['steps'])}  {m['title']}")
    shown = [t for t in data["steps"] if args.all or t["status"] not in FINISHED]
    print("\nSteps" + ("" if args.all else " (open; --all for every step)"))
    for t in shown:
        print(line_for(data, t, dec))
    print("\nOwner checks")
    for t in data.get("checks", []):
        if args.all or t["status"] not in FINISHED:
            print(line_for(data, t, dec))
    waiting = [d["id"] for d in dec["decisions"] if d["status"] == "proposed"]
    opened = [d["id"] for d in dec["decisions"] if d["status"] == "open"]
    print(f"\nDecisions: {len(waiting)} waiting for the owner" + (f" ({', '.join(waiting)})" if waiting else "")
          + f", {len(opened)} open: {', '.join(opened)}")
    print("Generated: docs/plans/STATUS.md, docs/plans/DECISIONS.md, roadmap tables")


def cmd_next(args) -> None:
    data, dec = load(), load_decisions()
    r = ready(data, dec)
    if not r:
        print("Nothing can start: every open step waits on a step, a check or a decision.")
    for t in r:
        who = "  ← OWNER (manual check)" if is_check(t) else ""
        print(f"{t['id']:<6} {plain(t['title'])[:100]}{who}")
    steps = [t for t in r if not is_check(t)]
    if steps:
        print(f"\nStart with: ./aim prompt {steps[0]['id']}   (then the agent runs ./aim claim {steps[0]['id']} --agent <name> --worktree)")
    active = [t for t in items(data) if t["status"] in ("in_progress", "review")]
    if active:
        print("\nActive:")
        for t in active:
            print(f"  {ICON[t['status']]} {t['id']:<6} {step_state_text(t)}")
    waiting = [d for d in dec["decisions"] if d["status"] == "proposed"]
    if waiting:
        print("\nDecisions waiting for YOU:")
        for d in waiting:
            print(f"  {d['id']:<5} {plain(d.get('proposal', ''))[:100]}")
            print(f"        ./aim accept {d['id']}   |   ./aim reject {d['id']} --why \"…\"")
    blocked = [t for t in items(data) if t["status"] == "todo" and t not in r]
    if blocked:
        print("\nWaiting:")
        for t in blocked:
            print(f"  {t['id']:<6} ← {', '.join(deps_open(data, t, dec))}")


def cmd_show(args) -> None:
    data, dec = load(), load_decisions()
    t = item_by_id(data, args.id)
    print(f"{t['id']} — {plain(t['title'])}")
    print(f"  status: {step_state_text(t)}" + (f", since {t['since']}" if t.get("since") else ""))
    if t.get("milestone"):
        print(f"  milestone: {t['milestone']}")
    print(f"  depends on: {depends_text(t)}")
    waits = deps_open(data, t, dec)
    if waits and t["status"] == "todo":
        print(f"  waiting for: {', '.join(waits)}")
    for key, label in (("issues", "issues"), ("prs", "PRs")):
        if t.get(key):
            print(f"  {label}: " + ", ".join(f"#{n}" for n in t[key]))
    if t.get("chats"):
        print("  chats: " + ", ".join(f"chat-{n:02d}" for n in t["chats"]))
    if t.get("branch"):
        print(f"  branch: {t['branch']}" + (f" (worktree {t['worktree']})" if t.get("worktree") else ""))
    if t.get("verify"):
        print("  verify: " + " && ".join(t["verify"]))
    for did in t.get("decisions", []):
        d = decision_by_id(dec, did, required=False)
        print(f"  decision {did}: {d['status'] if d else 'MISSING'}")
    if is_check(t):
        print("\nWhat to do (owner):")
        for i, s in enumerate(t.get("steps_to_do", []), 1):
            print(f"  {i}. {s}")
        return
    section = roadmap_section(t["id"])
    print("\n" + (section if section else f"(no '### {t['id']} — …' section in the roadmap yet)"))

# ----------------------------------------------------------------- state changes


def set_status(data: dict, t: dict, status: str, agent: str | None = None) -> None:
    t["status"] = status
    if status in ("in_progress",):
        t["since"] = now()
    if agent:
        t["owner"] = agent
    if status in FINISHED:
        t["finished"] = now()
    if status == "todo":
        for k in ("owner", "since", "finished", "blocked_reason"):
            t.pop(k, None)
    if status != "blocked":
        t.pop("blocked_reason", None)


def git(*a: str, cwd: Path | None = None, check: bool = True) -> str:
    r = subprocess.run(["git", *a], cwd=cwd or ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"git {' '.join(a)} failed:\n{r.stderr.strip()}")
    return r.stdout.strip()


def slug(text: str, words: int = 4) -> str:
    w = re.findall(r"[a-z0-9]+", plain(text).lower())
    return "-".join(w[:words]) or "work"


def cmd_claim(args) -> None:
    global ROOT
    data = load()
    t = item_by_id(data, args.id)
    if is_check(t):
        sys.exit(f"{t['id']} is an owner check: agents never claim it. The owner closes it with ./aim done {t['id']}.")
    if t["status"] in ("in_progress", "review") and t.get("owner") not in (None, args.agent) and not args.force:
        sys.exit(f"{t['id']} is {t['status']} by {t['owner']}. Use --force only after reading its handoff (./aim log).")
    if t["status"] in FINISHED and not args.force:
        sys.exit(f"{t['id']} is already {t['status']}.")
    waits = deps_open(data, t)
    if waits and not args.force:
        sys.exit(f"{t['id']} waits for {', '.join(waits)}. Stop and tell the owner (working protocol, rule 4).")
    target = ROOT
    if args.worktree:
        branch = t.get("branch") or f"feat/{t['id'].lower()}-{args.slug or slug(t['title'])}"
        cfg = config()
        main_root = main_checkout()  # worktrees are always created under the main checkout, never nested
        target = main_root / cfg["worktrees"] / t["id"].lower()
        if not target.exists():
            git("fetch", "-q", "origin", cfg["base_branch"], cwd=main_root)
            exists = subprocess.run(["git", "rev-parse", "--verify", "-q", f"refs/heads/{branch}"], cwd=main_root,
                                    capture_output=True).returncode == 0
            if exists:
                git("worktree", "add", str(target), branch, cwd=main_root)
            else:
                git("worktree", "add", "-b", branch, str(target), f"origin/{cfg['base_branch']}", cwd=main_root)
        t["branch"] = branch
        print(f"Worktree {target.relative_to(main_root)} on branch {branch}. Work there: cd {target}")
        # The claim is recorded in the worktree's copy of the plan, so it travels with the step's PR.
        ROOT = target
        _rebind_paths()
        data = load()
        t = item_by_id(data, args.id)
        t["branch"] = branch
        t["worktree"] = str(Path(cfg["worktrees"]) / t["id"].lower())
    if not t.get("current_chat") or t["status"] not in ("in_progress",):
        n = next_chat_number(data)
        t.setdefault("chats", []).append(n)
        t["current_chat"] = n
    set_status(data, t, "in_progress", args.agent)
    save(data)
    print(f"{t['id']} in progress by {args.agent}; this chat is chat-{t['current_chat']:02d} "
          f"(handoff: docs/plans/handoffs/chat-{t['current_chat']:02d}.md).")
    print(f"Next: ./aim prompt {t['id']} for the full brief; before stopping: ./aim handoff {t['id']} --agent {args.agent} …")


def _rebind_paths() -> None:
    global PLANS, STEPS, DECISIONS, STATUS_MD, DECISIONS_MD, ROADMAP, HANDOFFS, GUIDE, CONFIG, PROMPTS
    PLANS = ROOT / "docs" / "plans"
    STEPS, DECISIONS = PLANS / "steps.json", PLANS / "decisions.json"
    STATUS_MD, DECISIONS_MD = PLANS / "STATUS.md", PLANS / "DECISIONS.md"
    ROADMAP, HANDOFFS, GUIDE = PLANS / "prototype-roadmap.md", PLANS / "handoffs", PLANS / "harness-guide.md"
    CONFIG, PROMPTS = ROOT / "tools" / "harness" / "config.json", ROOT / "var" / "prompts"


def handoff_problems(path: Path) -> list[str]:
    if not path.exists():
        return [f"{path.relative_to(ROOT)} does not exist (./aim handoff writes it)"]
    text = path.read_text(encoding="utf-8")
    problems = [f"missing section '{s}'" for s in HANDOFF_SECTIONS if not re.search(rf"(?m)^{re.escape(s)}", text)]
    if TODO_MARK in text:
        problems.append(f"{text.count(TODO_MARK)} '{TODO_MARK}' placeholder(s) left")
    return problems


def handoff_template(t: dict, n: int, agent: str, done: str, next_: str, problems: str, verify: str) -> str:
    base = git("rev-parse", "--short", "origin/main", check=False) or "?"
    branch = git("branch", "--show-current", check=False) or "?"
    issues = ", ".join(f"#{i}" for i in t.get("issues", [])) or "none"
    todo = f"{TODO_MARK}: fill with evidence (commands and their results)."
    return textwrap.dedent(f"""\
        # Chat {n:02d} handoff — {t['id']} {plain(t['title']).split(' — ')[0][:80]}

        Date: {today_words()}. Base: `main` at `{base}`. Agent: {agent}.
        Step: **{t['id']}** of the [prototype roadmap](../prototype-roadmap.md). Issues: {issues}.
        Branch `{branch}`.

        ## Summary

        {done or todo}

        ## Baseline verified before any change

        {todo}

        ## What was built

        {todo}

        ## Verification

        {verify or todo}

        ## Findings

        {problems or 'None.'}

        ## Open decisions

        {TODO_MARK}: decisions proposed with ./aim propose, or "None".

        ## Next step

        {next_ or todo}
        """)


def cmd_handoff(args) -> None:
    data = load()
    t = item_by_id(data, args.id)
    if is_check(t):
        sys.exit("Owner checks have no handoff.")
    n = t.get("current_chat")
    if not n:
        sys.exit(f"{t['id']} has no current chat. Run ./aim claim {t['id']} --agent {args.agent} first.")
    path = handoff_path(n)
    if not path.exists():
        HANDOFFS.mkdir(parents=True, exist_ok=True)
        path.write_text(handoff_template(t, n, args.agent, args.done, args.next, args.problems or "", args.verify or ""),
                        encoding="utf-8")
        print(f"Wrote {path.relative_to(ROOT)}. Replace every {TODO_MARK} with evidence before ./aim review.")
    else:
        note = [f"\n## Update {now()} ({args.agent})", "", f"- Done: {args.done}", f"- Next: {args.next}"]
        if args.verify:
            note.append(f"- Verified: {args.verify}")
        if args.problems:
            note.append(f"- Problems: {args.problems}")
        with path.open("a", encoding="utf-8") as f:
            f.write("\n".join(note) + "\n")
        print(f"Appended an update to {path.relative_to(ROOT)}.")
    if args.status:
        set_status(data, t, args.status, args.agent)
    save(data)
    problems = handoff_problems(path)
    if problems:
        print("Still to complete: " + "; ".join(problems))


def cmd_review(args) -> None:
    data = load()
    t = item_by_id(data, args.id)
    if args.pr:
        if args.pr not in t.setdefault("prs", []):
            t["prs"].append(args.pr)
    if not t.get("prs"):
        sys.exit("A step goes to review with its PR: ./aim review <step> --pr <number>.")
    if t.get("current_chat") and not args.force:
        problems = handoff_problems(handoff_path(t["current_chat"]))
        if problems:
            sys.exit("The handoff is not complete: " + "; ".join(problems))
    set_status(data, t, "review", args.agent)
    save(data)
    print(f"{t['id']} in review: PR #{t['prs'][-1]}. Commit docs/plans and the handoff with the PR.")


def cmd_done(args) -> None:
    data = load()
    t = item_by_id(data, args.id)
    if is_check(t):
        owner_only(args, f"Close owner check {t['id']}")
    elif t.get("current_chat") and not args.force:
        problems = handoff_problems(handoff_path(t["current_chat"]))
        if problems:
            sys.exit("The handoff is not complete: " + "; ".join(problems) + " (--force to override).")
    set_status(data, t, "done", args.agent)
    t.pop("current_chat", None)
    save(data)
    print(f"{t['id']} done.")
    newly = [x["id"] for x in ready(data, load_decisions())]
    if newly:
        print("Ready now: " + ", ".join(newly))


def cmd_simple(args) -> None:
    data = load()
    t = item_by_id(data, args.id)
    target = {"skip": "skipped", "reset": "todo"}[args.cmd]
    if args.cmd == "skip":
        owner_only(args, f"Skip {t['id']}")
    set_status(data, t, target, args.agent)
    if target == "todo":
        t.pop("current_chat", None)
    save(data)
    print(f"{t['id']} → {target}")


def cmd_block(args) -> None:
    data = load()
    t = item_by_id(data, args.id)
    set_status(data, t, "blocked", args.agent)
    t["blocked_reason"] = args.reason
    save(data)
    print(f"{t['id']} blocked: {args.reason}. Tell the owner in chat; record a decision with ./aim propose if one is needed.")

# ----------------------------------------------------------------- decisions


def next_decision_id(dec: dict) -> str:
    nums = [int(m.group(1)) for d in dec["decisions"] if (m := re.fullmatch(r"D(\d+)", d["id"]))]
    return f"D{max(nums, default=0) + 1}"


def cmd_decisions(args) -> None:
    dec = load_decisions()
    shown = [d for d in dec["decisions"] if args.all or d["status"] in ("open", "proposed")]
    for state in DECISION_STATES:
        rows = [d for d in shown if d["status"] == state]
        if not rows:
            continue
        print(f"\n{state.upper()}")
        for d in rows:
            text = d.get("proposal") if state == "proposed" else d.get("decision") or d.get("question") or ""
            blocks = f"  [blocks: {d['blocks']}]" if d.get("blocks") and state in ("open", "proposed") else ""
            print(f"  {d['id']:<8} {plain(text)[:110]}{blocks}")
    if not args.all:
        print("\n(--all for accepted and rejected decisions)")


def cmd_propose(args) -> None:
    dec = load_decisions()
    if args.id:
        d = decision_by_id(dec, args.id)
        if d["status"] == "accepted" and not args.revise:
            sys.exit(f"{d['id']} is accepted. To propose a change, add --revise.")
    else:
        d = {"id": next_decision_id(dec), "question": args.question or ""}
        dec["decisions"].append(d)
    if args.question:
        d["question"] = args.question
    d["status"] = "proposed"
    d["proposal"] = args.text
    d["why"] = args.why
    d["proposed_by"] = args.agent or "?"
    d["proposed_on"] = now()
    if args.blocks:
        d["blocks"] = args.blocks
    save(decisions=dec)
    print(f"{d['id']} proposed. The owner answers with ./aim accept {d['id']} or ./aim reject {d['id']} --why \"…\".")
    print("Do not implement it before it is accepted (working protocol, rule 4).")


def cmd_accept(args) -> None:
    dec = load_decisions()
    d = decision_by_id(dec, args.id)
    owner_only(args, f"Accept {d['id']}")
    if d.get("decision") and d["status"] == "accepted":
        d.setdefault("history", []).append(f"{d.get('date', '?')}: {d['decision']}")
    d["decision"] = args.text or d.get("proposal") or d.get("question")
    d["status"] = "accepted"
    d["date"] = today_words()
    d.pop("proposal", None)
    save(decisions=dec)
    print(f"{d['id']} accepted: {d['decision']}")
    data = load()
    unblocked = [t["id"] for t in ready(data, dec) if d["id"] in t.get("decisions", [])]
    if unblocked:
        print("Ready now: " + ", ".join(unblocked))


def cmd_reject(args) -> None:
    dec = load_decisions()
    d = decision_by_id(dec, args.id)
    owner_only(args, f"Reject the proposal for {d['id']}")
    d.setdefault("history", []).append(f"{today_words()}: rejected proposal: {d.get('proposal', '')} ({args.why})")
    d.pop("proposal", None)
    d["status"] = "open" if d.get("question") else "rejected"
    d["why"] = args.why
    save(decisions=dec)
    print(f"{d['id']} → {d['status']} ({args.why})")

# ----------------------------------------------------------------- prompt


def main_checkout() -> Path:
    """The main checkout of the repository, also when the harness runs in a worktree."""
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir", check=False)
    return Path(common).parent if common else ROOT


def file_block(rel: str) -> str:
    p = ROOT / rel
    if not p.exists():
        return f"(missing: {rel})"
    return f"<file path=\"{rel}\">\n{p.read_text(encoding='utf-8').rstrip()}\n</file>"


def cmd_prompt(args) -> None:
    data, dec = load(), load_decisions()
    t = item_by_id(data, args.id)
    if is_check(t):
        sys.exit(f"{t['id']} is an owner check: there is no agent prompt. ./aim show {t['id']} lists what to do.")
    cfg = config()
    agent = args.agent or {"claude": "claude", "codex": "codex", "chatgpt": "chatgpt"}.get(args.tool, "agent")
    resuming = t["status"] == "in_progress" and t.get("current_chat")
    main_root = main_checkout()
    workdir = main_root / t["worktree"] if t.get("worktree") else main_root
    previous = [p for n, p in handoff_files() if n in t.get("chats", [])] or [p for _, p in handoff_files()[-1:]]
    reading = ["AGENTS.md", "docs/plans/prototype-roadmap.md (sections \"Working protocol\" and " + t["id"] + ")",
               "docs/plans/harness-guide.md (section \"For agents\")"]
    reading += [str(p.relative_to(ROOT)) for p in previous[-2:]]
    decisions = [decision_by_id(dec, did, required=False) for did in t.get("decisions", [])]
    lines = [f"# AIM-PRO step {t['id']}: {plain(t['title'])}", ""]
    lines += [f"Work in {workdir} (GitHub: {cfg['github']}). Chat in Italian with the owner; write code, docs and "
              "GitHub content in English." + (" Do not spawn agents." if args.tool in ("claude", "codex") else ""), ""]
    lines += ["## Start", "",
              "```bash",
              "./aim status && ./aim log -n 3",
              f"./aim show {t['id']}",
              f"./aim claim {t['id']} --agent {agent}" + ("" if t.get("worktree") else " --worktree"),
              f"cd {main_root / config()['worktrees'] / t['id'].lower()}   # then work only there",
              "./aim check baseline     # the baseline of the working protocol, before any change",
              "```", ""]
    if resuming:
        lines += [f"This step is already in progress (owner {t.get('owner')}, since {t.get('since')}). Continue it: "
                  f"read docs/plans/handoffs/chat-{t['current_chat']:02d}.md if it exists and the branch "
                  f"`{t.get('branch', '?')}`; do not redo finished work.", ""]
    lines += ["## Read first", ""] + [f"- {r}" for r in reading] + [""]
    lines += ["## The step (from the roadmap)", "", roadmap_section(t["id"]) or "(no section: stop and ask the owner)", ""]
    protocol = roadmap_part("Working protocol for every chat").split("\n", 1)[-1].strip()
    lines += ["## The working protocol (from the roadmap)", "", protocol, ""]
    if decisions:
        lines += ["## Decisions this step depends on", ""]
        for did, d in zip(t.get("decisions", []), decisions):
            if d is None:
                lines.append(f"- {did}: MISSING from docs/plans/decisions.json — stop and tell the owner.")
            else:
                lines.append(f"- {did} ({d['status']}): {d.get('decision') or d.get('proposal') or d.get('question')}")
        lines.append("")
    lines += ["## Rules", "",
              "- Follow the working protocol of the roadmap exactly; the harness commands below replace its manual bookkeeping.",
              "- Never decide for the owner: an open choice is `./aim propose …` and a question in chat; then stop.",
              "- No model calls or live runs without explicit owner authorization; synthetic data only.",
              "- Never edit docs/plans/STATUS.md, DECISIONS.md or the generated roadmap blocks by hand; never run "
              "./aim accept, ./aim reject, ./aim skip or close an owner check C….",
              "- Commit small and often; never leave uncommitted work at a handoff.", ""]
    lines += ["## Finish (or stop for any reason)", "",
              "```bash",
              f"./aim handoff {t['id']} --agent {agent} --done \"…\" --next \"…\" [--verify \"…\"] [--problems \"…\"]",
              "# then replace every TODO(aim) of the handoff with evidence, publish the PR and:",
              f"./aim review {t['id']} --pr <number> --agent {agent}",
              "```", "",
              "Commit docs/plans (steps.json, the generated files, the handoff) in the step's PR.", ""]
    if args.inline or args.tool == "chatgpt":
        lines += ["## Shared files", "", file_block("AGENTS.md"), ""]
        for p in previous[-1:]:
            lines += [file_block(str(p.relative_to(ROOT))), ""]
    text = "\n".join(lines)
    PROMPTS.mkdir(parents=True, exist_ok=True)
    out = PROMPTS / f"{t['id']}-{args.tool}.md"
    out.write_text(text + "\n", encoding="utf-8")
    print(text)
    print(f"\n(saved to {out.relative_to(ROOT)})", file=sys.stderr)

# ----------------------------------------------------------------- checks


def expand(group: str, cfg: dict, seen: set | None = None) -> list[dict]:
    seen = seen or set()
    if group in seen:
        sys.exit(f"Check group {group} includes itself.")
    seen.add(group)
    out = []
    for c in cfg["checks"].get(group, []):
        out += expand(c[1:], cfg, seen) if isinstance(c, str) else [c]
    return out


def http_ok(url: str, timeout: float = 4.0) -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return 200 <= r.status < 400, str(r.status)
    except urllib.error.HTTPError as e:
        return False, str(e.code)
    except Exception as e:  # noqa: BLE001 - any failure means "not up"
        return False, type(e).__name__


def project_python() -> str:
    """AIM_PYTHON, else the project's .venv (this checkout's or the main checkout's), else this interpreter."""
    if os.environ.get("AIM_PYTHON"):
        return os.environ["AIM_PYTHON"]
    for base in (ROOT, main_checkout()):
        candidate = base / ".venv" / "bin" / "python"
        if candidate.exists():
            return str(candidate)
    return sys.executable


def run_checks(checks: list[dict], cfg: dict) -> bool:
    env = {**os.environ, **cfg.get("env", {})}
    python = project_python()
    ok_all = True
    for c in checks:
        cwd = ROOT / c.get("cwd", ".")
        if "url" in c:
            ok, info = http_ok(c["url"])
        elif (cwd / "package.json").exists() and not (cwd / "node_modules").exists():
            ok, info = False, f"not run: no node_modules in {cwd.relative_to(ROOT)}; run: cd {cwd} && npm ci --ignore-scripts"
        else:
            cmd = c["cmd"].replace("{python}", shlex.quote(python))
            start = dt.datetime.now()
            r = subprocess.run(cmd, shell=True, cwd=cwd, env=env, capture_output=True, text=True)
            secs = (dt.datetime.now() - start).total_seconds()
            ok, info = r.returncode == 0, f"exit {r.returncode}, {secs:.0f} s"
            if not ok:
                tail = (r.stdout + r.stderr).strip().splitlines()[-15:]
                info += "\n      " + "\n      ".join(tail)
        ok_all &= ok
        print(f"  {'✓' if ok else '✗'} {c['name']}  ({info})", flush=True)
    return ok_all


def cmd_check(args) -> None:
    cfg = config()
    target = args.target
    print(f"python: {project_python()}")
    if target in cfg["checks"]:
        print(f"{target}:")
        sys.exit(0 if run_checks(expand(target, cfg), cfg) else 1)
    data = load()
    if target.upper() in data["milestones"]:
        m = data["milestones"][target.upper()]
        status = {t["id"]: t["status"] for t in items(data)}
        open_ = [x for x in m["steps"] if status.get(x) not in FINISHED]
        print(f"{target.upper()} — {m['title']}")
        print(f"  steps and checks: {len(m['steps']) - len(open_)}/{len(m['steps'])} finished" +
              (f"; open: {', '.join(open_)}" if open_ else ""))
        ok = not open_
        for group in m.get("checks", []):
            print(f"{group}:")
            ok &= run_checks(expand(group, cfg), cfg)
        print("REACHED" if ok else "NOT REACHED")
        sys.exit(0 if ok else 1)
    t = item_by_id(data, target)
    checks = [{"name": v, "cmd": v} for v in t.get("verify", [])] or expand("baseline:quick", cfg)
    print(f"{t['id']} verify:")
    sys.exit(0 if run_checks(checks, cfg) else 1)

# ----------------------------------------------------------------- log, render, selfcheck


def section_text(text: str, heading: str) -> str:
    m = re.search(rf"(?ms)^## {re.escape(heading)}[^\n]*\n(.*?)(?=^## |\Z)", text)
    return m.group(1).strip() if m else ""


def cmd_log(args) -> None:
    for num, p, first in latest_handoffs(args.n):
        text = p.read_text(encoding="utf-8")
        nxt = section_text(text, "Next step") or section_text(text, "Next")
        print(f"chat-{num:02d}  {first}")
        if nxt:
            print(textwrap.indent(textwrap.shorten(nxt, 400, placeholder=" …"), "    next: "))
        print()


def cmd_render(args) -> None:
    if args.check:
        stale = [str(p.relative_to(ROOT)) for p, text in rendered().items()
                 if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            sys.exit("Out of date (run ./aim render): " + ", ".join(stale))
        print("Generated files are up to date.")
        return
    render()
    print("Rendered docs/plans/STATUS.md, docs/plans/DECISIONS.md and the roadmap blocks.")


def validate(data: dict, dec: dict) -> list[str]:
    problems = []
    ids = [t["id"] for t in items(data)]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        problems.append(f"duplicate step/check ids: {sorted(dup)}")
    dids = [d["id"] for d in dec["decisions"]]
    ddup = {i for i in dids if dids.count(i) > 1}
    if ddup:
        problems.append(f"duplicate decision ids: {sorted(ddup)}")
    for t in items(data):
        if t["status"] not in STATES:
            problems.append(f"{t['id']}: unknown status {t['status']}")
        for d in t.get("depends_on", []):
            if d not in ids:
                problems.append(f"{t['id']}: depends on unknown {d}")
        for d in t.get("decisions", []):
            if d not in dids:
                problems.append(f"{t['id']}: needs unknown decision {d}")
        if not is_check(t) and t["status"] != "todo" and not roadmap_section(t["id"]) and t["id"] not in ("S14", "S15"):
            problems.append(f"{t['id']}: no '### {t['id']} — …' section in the roadmap")
        if t.get("milestone") and t["milestone"] not in data["milestones"]:
            problems.append(f"{t['id']}: unknown milestone {t['milestone']}")
    for mid, m in data["milestones"].items():
        for x in m["steps"]:
            if x not in ids:
                problems.append(f"{mid}: unknown step {x}")
    for d in dec["decisions"]:
        if d["status"] not in DECISION_STATES:
            problems.append(f"{d['id']}: unknown status {d['status']}")
        if d["status"] == "proposed" and not d.get("proposal"):
            problems.append(f"{d['id']}: proposed without a proposal")
        if d["status"] == "open" and not d.get("question"):
            problems.append(f"{d['id']}: open without a question")
        if d["status"] == "accepted" and not d.get("decision"):
            problems.append(f"{d['id']}: accepted without the decision text")
    text = ROADMAP.read_text(encoding="utf-8")
    for block in ("steps", "decisions"):
        if f"<!-- aim:{block} start" not in text:
            problems.append(f"roadmap: missing the generated block aim:{block}")
    return problems


def cmd_selfcheck(args) -> None:
    problems = validate(load(), load_decisions())
    guide = GUIDE.read_text(encoding="utf-8") if GUIDE.exists() else ""
    for cmd in COMMANDS:
        if f"./aim {cmd}" not in guide:
            problems.append(f"harness-guide.md does not document ./aim {cmd}")
    stale = [str(p.relative_to(ROOT)) for p, t in rendered().items() if not p.exists() or p.read_text(encoding="utf-8") != t]
    if stale:
        problems.append("generated files out of date (./aim render): " + ", ".join(stale))
    if problems:
        print("\n".join(f"✗ {p}" for p in problems))
        sys.exit(1)
    print(f"selfcheck OK: {len(load()['steps'])} steps, {len(load_decisions()['decisions'])} decisions, "
          f"{len(COMMANDS)} commands documented, generated files up to date.")

# ----------------------------------------------------------------- CLI

HELP = """aim — AIM-PRO prototype roadmap harness (run from the repository root or a worktree)

  status [--all]             milestones, open steps, owner checks, decisions (regenerates the plan files)
  next                       what can start now, what is active, decisions waiting for the owner
  show S13b                  one step or owner check: state, dependencies, roadmap section
  prompt S13b [--tool claude|codex|chatgpt|generic] [--agent NAME] [--inline]
                             self-contained brief for a coding agent (saved in var/prompts/)
  claim S13b --agent NAME [--worktree] [--slug words] [--force]
                             in progress, next chat number; --worktree creates .worktrees/<step> from origin/main
  handoff S13b --agent NAME --done "…" --next "…" [--verify "…"] [--problems "…"] [--status blocked|in_progress]
                             write docs/plans/handoffs/chat-NN.md from the template, or append an update
  review S13b --pr 160 [--agent NAME]    PR published, handoff complete
  done S13b | C1             after the merge (owner checks: the owner only)
  block S13b --reason "…" | reset S13b | skip S13b (owner)
  decisions [--all]          open and proposed decisions
  propose [D16] "proposal" --why "…" [--question "…"] [--blocks S14] [--agent NAME] [--revise]
                             an agent's proposal (new id when none is given); never implement before acceptance
  accept D16 ["final text"] | reject D16 --why "…"     the owner's answer (owner only)
  check baseline|baseline:quick|baseline:apps|stack|M3|S13b
                             run the baseline, live stack health, a milestone or a step's verify commands
  log [-n 3]                 latest handoffs and their next step
  render [--check] | selfcheck
                             regenerate the plan files | validate data, guide and generated files
"""

COMMANDS = ["status", "next", "show", "prompt", "claim", "handoff", "review", "done", "block", "reset", "skip",
            "decisions", "propose", "accept", "reject", "check", "log", "render", "selfcheck"]


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="aim", add_help=False)
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("help")
    s = sub.add_parser("status"); s.add_argument("--all", action="store_true")
    sub.add_parser("next")
    s = sub.add_parser("show"); s.add_argument("id")
    s = sub.add_parser("prompt"); s.add_argument("id")
    s.add_argument("--tool", default="claude", choices=["claude", "codex", "chatgpt", "generic"])
    s.add_argument("--agent"); s.add_argument("--inline", action="store_true")
    s = sub.add_parser("claim"); s.add_argument("id"); s.add_argument("--agent", required=True)
    s.add_argument("--worktree", action="store_true"); s.add_argument("--slug"); s.add_argument("--force", action="store_true")
    s = sub.add_parser("handoff"); s.add_argument("id"); s.add_argument("--agent", required=True)
    s.add_argument("--done", required=True); s.add_argument("--next", required=True)
    s.add_argument("--verify"); s.add_argument("--problems"); s.add_argument("--status", choices=["blocked", "in_progress"])
    s = sub.add_parser("review"); s.add_argument("id"); s.add_argument("--pr", type=int); s.add_argument("--agent")
    s.add_argument("--force", action="store_true")
    s = sub.add_parser("done"); s.add_argument("id"); s.add_argument("--agent"); s.add_argument("--force", action="store_true")
    s.add_argument("--yes", action="store_true")
    for name in ("reset", "skip"):
        s = sub.add_parser(name); s.add_argument("id"); s.add_argument("--agent"); s.add_argument("--yes", action="store_true")
    s = sub.add_parser("block"); s.add_argument("id"); s.add_argument("--reason", required=True); s.add_argument("--agent")
    s = sub.add_parser("decisions"); s.add_argument("--all", action="store_true")
    s = sub.add_parser("propose"); s.add_argument("args", nargs="+"); s.add_argument("--why", required=True)
    s.add_argument("--question"); s.add_argument("--blocks"); s.add_argument("--agent"); s.add_argument("--revise", action="store_true")
    s = sub.add_parser("accept"); s.add_argument("id"); s.add_argument("text", nargs="?"); s.add_argument("--yes", action="store_true")
    s = sub.add_parser("reject"); s.add_argument("id"); s.add_argument("--why", required=True); s.add_argument("--yes", action="store_true")
    s = sub.add_parser("check"); s.add_argument("target")
    s = sub.add_parser("log"); s.add_argument("-n", type=int, default=3)
    s = sub.add_parser("render"); s.add_argument("--check", action="store_true")
    sub.add_parser("selfcheck")
    args = p.parse_args(argv)
    if args.cmd in (None, "help"):
        print(HELP)
        return
    if args.cmd == "propose":
        if len(args.args) == 2 and re.fullmatch(r"[A-Za-z][\w-]*", args.args[0]):
            args.id, args.text = args.args
        elif len(args.args) == 1:
            args.id, args.text = None, args.args[0]
        else:
            sys.exit('Usage: ./aim propose [D16] "proposal" --why "…"')
    handlers = {
        "status": cmd_status, "next": cmd_next, "show": cmd_show, "prompt": cmd_prompt, "claim": cmd_claim,
        "handoff": cmd_handoff, "review": cmd_review, "done": cmd_done, "reset": cmd_simple, "skip": cmd_simple,
        "block": cmd_block, "decisions": cmd_decisions, "propose": cmd_propose, "accept": cmd_accept,
        "reject": cmd_reject, "check": cmd_check, "log": cmd_log, "render": cmd_render, "selfcheck": cmd_selfcheck,
    }
    handlers[args.cmd](args)


if __name__ == "__main__":
    main()
