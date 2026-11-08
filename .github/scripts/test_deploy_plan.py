import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from deploy_plan import BINGO, DOTNET_SHARED, SHARED, TARGETS, plan


SCRIPT = Path(__file__).with_name("deploy_plan.py").resolve()
ALL_NAMES = {item["name"] for item in TARGETS}


def names(result):
    return {item["name"] for item in result["matrix"]["include"]}


class SelectionTests(unittest.TestCase):
    def test_apps_are_isolated_and_service_names_match_compose(self):
        for paths, expected in [
            (["apps/krampouezh/index.html"], {"krampouezh"}),
            (["apps/bingo/backend/Program.cs"], BINGO),
            (["src/BreizhDev/Program.cs"], {"breizhdev"}),
            (["Dockerfile", ".dockerignore"], {"breizhdev"}),
            (["apps/awen/src/main.tsx", "apps/riboul/index.html"], {"awen", "riboul"}),
            (["apps/prout/index.html", "apps/idle-consulting/src/main.tsx"], {"prout", "idle-consulting"}),
            (["apps/krampouezh/index.html", "apps/bingo/frontend/src/App.vue"], {"krampouezh"} | BINGO),
        ]:
            with self.subTest(paths=paths):
                result = plan(paths)
                self.assertEqual(names(result), expected)
                self.assertEqual(result["bingo"], str(bool(expected & BINGO)).lower())
                self.assertEqual(result["krampouezh"], str("krampouezh" in expected).lower())
        self.assertEqual(plan(["Dockerfile"])["services"], "app")

    def test_shared_changes_and_unavailable_base_are_conservative(self):
        for paths in [None, *[[path] for path in SHARED]]:
            self.assertEqual(names(plan(paths)), ALL_NAMES)
        for path in DOTNET_SHARED:
            self.assertEqual(names(plan([path])), {"breizhdev", "krampouezh"} | BINGO)

    def test_app_workflows_select_only_their_app(self):
        self.assertEqual(names(plan([".github/workflows/bingo-check.yml"])), BINGO)
        self.assertEqual(names(plan([".github/workflows/krampouezh-check.yml"])), {"krampouezh"})

    def test_docs_and_unrelated_changes_do_not_deploy(self):
        result = plan(["README.md", "apps/bingo/README.md", "apps/krampouezh/README.md", "docs/example.json", "apps/awen/docs/example.txt", "LICENSE", ".gitignore"])
        self.assertEqual(result, {"matrix": {"include": []}, "services": "", "has_changes": "false", "bingo": "false", "krampouezh": "false"})


class GitRangeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repo = Path(self.directory.name)
        self.git("init", "-q")
        self.git("config", "user.name", "CI test")
        self.git("config", "user.email", "ci-test@example.invalid")
        self.base = self.commit({"README.md": "Initial commit\n"})

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True).strip()

    def commit(self, files):
        for path, text in files.items():
            target = self.repo / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
        self.git("add", "-A")
        self.git("commit", "-qm", "Test changes")
        return self.git("rev-parse", "HEAD")

    def run_plan(self, base, output=None):
        env = os.environ.copy()
        env.pop("GITHUB_OUTPUT", None)
        if output:
            env["GITHUB_OUTPUT"] = str(output)
        result = subprocess.check_output([sys.executable, str(SCRIPT), "--base", base, "--head", self.git("rev-parse", "HEAD")], cwd=self.repo, env=env, text=True)
        return json.loads(result)

    def test_entire_multi_commit_push_and_github_outputs(self):
        self.commit({"apps/krampouezh/index.html": "Krampouezh"})
        self.commit({"apps/bingo/backend/Program.cs": "Bingo"})
        output = self.repo / "github-output"
        result = self.run_plan(self.base, output)
        self.assertEqual(names(result), {"krampouezh"} | BINGO)
        exported = dict(line.split("=", 1) for line in output.read_text().splitlines())
        self.assertEqual(json.loads(exported.pop("matrix")), result["matrix"])
        self.assertEqual(exported, {key: value for key, value in result.items() if key != "matrix"})

    def test_rename_selects_both_old_and_new_apps(self):
        before = self.commit({"apps/krampouezh/example.txt": "Renamed file"})
        (self.repo / "apps/bingo").mkdir()
        self.git("mv", "apps/krampouezh/example.txt", "apps/bingo/example.txt")
        self.commit({})
        self.assertEqual(names(self.run_plan(before)), {"krampouezh"} | BINGO)

    def test_deleted_file_still_selects_its_app(self):
        before = self.commit({"apps/krampouezh/old.js": "obsolete"})
        (self.repo / "apps/krampouezh/old.js").unlink()
        self.commit({})
        self.assertEqual(names(self.run_plan(before)), {"krampouezh"})

    def test_missing_zero_and_unavailable_before_select_everything(self):
        for base in ("", "0" * 40, "f" * 40):
            with self.subTest(base=base):
                self.assertEqual(names(self.run_plan(base)), ALL_NAMES)

    def test_identical_revisions_select_nothing(self):
        self.assertEqual(self.run_plan(self.base)["has_changes"], "false")


if __name__ == "__main__":
    unittest.main()
