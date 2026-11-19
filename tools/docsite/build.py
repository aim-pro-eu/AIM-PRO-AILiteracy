"""Build the static documentation browser published on GitHub Pages.

Usage: python3 tools/docsite/build.py OUTPUT_DIR

Copies the page, writes docs.json (the documents it lists) and copies each
document under OUTPUT_DIR/raw/ at its repository path. To browse it locally:
python3 -m http.server -d OUTPUT_DIR 8765
"""

import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

INCLUDE = ["README.md", "AGENTS.md", "docs", "control", "categories", "agents", "skills", "examples"]
SKIP_PARTS = {"node_modules", ".git", ".venv", "__pycache__", "evidence"}
SKIP_PREFIXES = ("docs/aimpro/generated",)
EXTENSIONS = {".md", ".svg", ".png"}


def documents():
    found = []
    for entry in INCLUDE:
        base = ROOT / entry
        paths = [base] if base.is_file() else sorted(base.rglob("*")) if base.is_dir() else []
        for path in paths:
            rel = path.relative_to(ROOT).as_posix()
            if (
                path.is_file()
                and path.suffix in EXTENSIONS
                and not SKIP_PARTS.intersection(path.relative_to(ROOT).parts)
                and not rel.startswith(SKIP_PREFIXES)
            ):
                found.append(rel)
    return found


def build(output):
    if output.exists():
        shutil.rmtree(output)
    (output / "raw").mkdir(parents=True)
    shutil.copy(HERE / "index.html", output / "index.html")
    (output / ".nojekyll").touch()
    files = documents()
    (output / "docs.json").write_text(json.dumps(files))
    for rel in files:
        target = output / "raw" / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / rel, target)
    return files


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 tools/docsite/build.py OUTPUT_DIR")
    print(f"{len(build(Path(sys.argv[1]).resolve()))} documents")
