"""Select the checks, images and Compose services affected by a complete push."""

import argparse
import json
import os
from pathlib import Path
import subprocess


def target(name, context, service=None):
    return {
        "name": name,
        "context": context,
        "dockerfile": "Dockerfile" if context == "." else f"{context}/Dockerfile",
        "service": service or name,
    }


TARGETS = (
    target("breizhdev", ".", "app"),
    target("prout", "apps/prout"),
    target("krampouezh", "apps/krampouezh"),
    target("awen", "apps/awen"),
    target("riboul", "apps/riboul"),
    target("idle-consulting", "apps/idle-consulting"),
    target("bingo-frontend", "apps/bingo/frontend"),
    target("bingo-backend", "apps/bingo/backend"),
)
BINGO = {"bingo-frontend", "bingo-backend"}
SHARED = {
    "docker-compose.prod.yml",
    ".github/workflows/deploy.yml",
    ".github/scripts/deploy_plan.py",
}
DOTNET_SHARED = {
    "global.json", "Directory.Build.props", "Directory.Build.targets",
    "Directory.Packages.props", "NuGet.Config", "NuGet.config", "nuget.config",
}


def select_targets(paths):
    if paths is None or any(path in SHARED for path in paths):
        return list(TARGETS)
    selected = set()
    for path in paths:
        if path.lower().endswith(".md") or path.startswith("docs/") or "/docs/" in path:
            continue
        if path in DOTNET_SHARED:
            selected.update({"breizhdev", "krampouezh"} | BINGO)
        if path in {"Dockerfile", ".dockerignore"} or path.startswith("src/BreizhDev/"):
            selected.add("breizhdev")
        if path.startswith("apps/bingo/") or path == ".github/workflows/bingo-check.yml":
            selected.update(BINGO)
        if path == ".github/workflows/krampouezh-check.yml":
            selected.add("krampouezh")
        for item in TARGETS:
            if item["context"] != "." and path.startswith(item["context"] + "/"):
                selected.add(item["name"])
    return [item for item in TARGETS if item["name"] in selected]


def changed_paths(base, head):
    # Resolve refs before diffing so Git options can never come from their values.
    def resolve(ref):
        result = subprocess.run(
            ["git", "rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}"],
            capture_output=True, text=True,
        )
        return result.stdout.strip() if result.returncode == 0 else None

    head_commit = resolve(head)
    if head_commit is None:
        raise ValueError(f"Cannot resolve head commit: {head}")
    base_commit = resolve(base) if base and set(base) != {"0"} else None
    if base_commit is None:
        return None  # Initial/force pushes may not have an available before commit.
    result = subprocess.check_output([
        "git", "diff", "--name-only", "--no-renames", "-z", base_commit, head_commit, "--",
    ])
    return [os.fsdecode(path) for path in result.split(b"\0") if path]


def plan(paths):
    selected = select_targets(paths)
    names = {item["name"] for item in selected}
    return {
        "matrix": {"include": [{key: value for key, value in item.items() if key != "service"} for item in selected]},
        "services": " ".join(item["service"] for item in selected),
        "has_changes": str(bool(selected)).lower(),
        "bingo": str(bool(names & BINGO)).lower(),
        "krampouezh": str("krampouezh" in names).lower(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="HEAD")
    args = parser.parse_args()
    result = plan(changed_paths(args.base, args.head))
    print(json.dumps(result))
    if os.environ.get("GITHUB_OUTPUT"):
        with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
            for key, value in result.items():
                output.write(f"{key}={json.dumps(value, separators=(',', ':')) if isinstance(value, dict) else value}\n")


if __name__ == "__main__":
    main()
