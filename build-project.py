#!/usr/bin/env python3
"""Build the DSS-Broker static export for GitHub Pages."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR / "dss-broker"
BUILD_OUTPUT_DIR = PROJECT_DIR / "out"
DEPLOY_DIR = SCRIPT_DIR / "public"
ROOT_INDEX_FILE = SCRIPT_DIR / "index.html"
ROOT_NOJEKYLL_FILE = SCRIPT_DIR / ".nojekyll"
ROOT_CNAME_FILE = SCRIPT_DIR / "CNAME"


class BuildError(RuntimeError):
    """A build prerequisite or output validation failed."""


def repository_name() -> str:
    git = shutil.which("git")
    if git is None:
        return SCRIPT_DIR.name

    result = subprocess.run(
        [git, "-C", str(SCRIPT_DIR), "config", "--get", "remote.origin.url"],
        check=False,
        capture_output=True,
        text=True,
    )
    remote_url = result.stdout.strip().rstrip("/")
    if not remote_url:
        return SCRIPT_DIR.name

    repo_name = remote_url.replace("\\", "/").rsplit("/", maxsplit=1)[-1]
    repo_name = repo_name.rsplit(":", maxsplit=1)[-1]
    return repo_name[:-4] if repo_name.endswith(".git") else repo_name


def normalize_base_path(requested_path: str) -> str:
    if not requested_path:
        repo_name = repository_name()
        return "" if repo_name.endswith(".github.io") else f"/{repo_name}"

    if requested_path == "/":
        return ""

    normalized_path = (
        requested_path[1:] if requested_path.startswith("/") else requested_path
    )
    normalized_path = (
        normalized_path[:-1] if normalized_path.endswith("/") else normalized_path
    )
    if not normalized_path:
        raise BuildError("The GitHub Pages base path is invalid.")
    if any(character.isspace() for character in normalized_path):
        raise BuildError("The GitHub Pages base path cannot contain spaces.")
    return f"/{normalized_path}"


def require_file(path: Path) -> None:
    if not path.is_file():
        raise BuildError(f"Could not find {path}.")


def require_command(command: str) -> str:
    executable = shutil.which(command)
    if executable is None:
        raise BuildError(f"{command} is required but was not found.")
    return executable


def validate_node_version(node: str) -> None:
    result = subprocess.run(
        [node, "-p", "process.versions.node"],
        check=True,
        capture_output=True,
        text=True,
    )
    version = result.stdout.strip()
    match = re.fullmatch(r"(\d+)\.(\d+)(?:\.\d+.*)?", version)
    if match is None:
        raise BuildError(f"Could not understand the installed Node.js version: {version}.")

    major, minor = (int(part) for part in match.groups())
    if (major, minor) < (20, 9):
        raise BuildError(f"Node.js 20.9.0 or newer is required; found {version}.")


def remove_path(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def application_base_path(pages_base_path: str) -> str:
    return f"{pages_base_path}/public" if pages_base_path else "/public"


def write_root_index() -> None:
    ROOT_INDEX_FILE.write_text(
        """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=./public/">
    <title>Opening DSS-Broker…</title>
    <link rel="canonical" href="./public/">
    <link rel="icon" href="./public/favicon.ico?v=bread-1" sizes="any">
    <link rel="icon" href="./public/icon.svg?v=bread-1" type="image/svg+xml">
    <script>
      const destination = new URL("public/", window.location.href);
      destination.search = window.location.search;
      destination.hash = window.location.hash;
      window.location.replace(destination);
    </script>
  </head>
  <body>
    <p>Opening <a href="./public/">DSS-Broker</a>…</p>
  </body>
</html>
""",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build DSS-Broker as a static GitHub Pages export."
    )
    parser.add_argument(
        "base_path",
        nargs="?",
        default=os.environ.get("GITHUB_PAGES_BASE_PATH", ""),
        help="GitHub Pages base path (default: repository name; use / for root)",
    )
    return parser.parse_args()


def build(base_path: str) -> None:
    require_file(PROJECT_DIR / "package.json")
    require_file(PROJECT_DIR / "package-lock.json")
    node = require_command("node")
    npm = require_command("npm")
    validate_node_version(node)

    pages_base_path = normalize_base_path(base_path)
    app_base_path = application_base_path(pages_base_path)

    print("Preparing DSS-Broker for GitHub Pages")
    print(f"Project:   {PROJECT_DIR}")
    print(f"Pages root:      {pages_base_path or '/'}")
    print(f"Application URL: {app_base_path}/")

    if os.environ.get("SKIP_INSTALL", "0") != "1":
        print("\nInstalling locked dependencies...", flush=True)
        subprocess.run(
            [npm, "ci", "--no-audit", "--no-fund"],
            cwd=PROJECT_DIR,
            check=True,
        )
    else:
        print("\nSkipping dependency installation (SKIP_INSTALL=1).")

    print("\nBuilding static GitHub Pages export...", flush=True)
    build_environment = os.environ.copy()
    build_environment["GITHUB_PAGES_BUILD"] = "1"
    build_environment["NEXT_PUBLIC_BASE_PATH"] = app_base_path
    subprocess.run(
        [npm, "run", "build"],
        cwd=PROJECT_DIR,
        env=build_environment,
        check=True,
    )

    index_file = BUILD_OUTPUT_DIR / "index.html"
    if not index_file.is_file():
        raise BuildError(
            f"The build completed without creating {index_file}."
        )

    remove_path(DEPLOY_DIR)
    shutil.move(str(BUILD_OUTPUT_DIR), str(DEPLOY_DIR))
    (DEPLOY_DIR / ".nojekyll").touch()
    write_root_index()
    ROOT_NOJEKYLL_FILE.touch()

    custom_domain = os.environ.get("GITHUB_PAGES_CNAME", "")
    if custom_domain:
        ROOT_CNAME_FILE.write_text(f"{custom_domain}\n", encoding="utf-8")
        print(f"Custom domain: {custom_domain}")

    print("\nGitHub Pages build completed successfully.")
    print(f"Root entry page: {ROOT_INDEX_FILE}")
    print(f"Application files: {DEPLOY_DIR}")


def main() -> int:
    try:
        arguments = parse_args()
        build(arguments.base_path)
    except BuildError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        command = " ".join(str(part) for part in error.cmd)
        print(
            f"Error: Command failed with exit code {error.returncode}: {command}",
            file=sys.stderr,
        )
        return error.returncode or 1
    except OSError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
