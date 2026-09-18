#!/usr/bin/env python3
"""Validate demo settings and staged file hashes without printing secrets or starting services."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

PRODUCTION_HOST = "git.hyperide.ai"
REQUIRED = {"FORGEJO_DEMO_HOST", "STORYBOOK_HOST", "ACME_EMAIL", "FORGEJO_IMAGE", "CADDY_IMAGE"}


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError("Expected simple KEY=value configuration")
        key, value = line.split("=", 1)
        if key not in REQUIRED or key in values:
            raise ValueError("Unexpected/duplicate setting")
        # No shell evaluation, quoting, interpolation, or inline comments.
        if any(c in value for c in "\"'`$\\ \t\r\n"):
            raise ValueError("Values must be unquoted and contain no interpolation")
        values[key] = value
    if set(values) != REQUIRED:
        raise ValueError("Missing demo settings")
    return values


def validate(values: dict[str, str]) -> None:
    for key in ("FORGEJO_DEMO_HOST", "STORYBOOK_HOST"):
        host = values[key]
        if not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", host):
            raise ValueError("Use a lower-case DNS host, not an IP, URL, wildcard or port")
        if host == PRODUCTION_HOST or host.endswith((".invalid", ".localhost", ".local")):
            raise ValueError("Placeholder, production or non-public host is not a demo destination")
    if values["FORGEJO_DEMO_HOST"] == values["STORYBOOK_HOST"]:
        raise ValueError("Demo and static gallery require distinct hosts")
    if not re.fullmatch(r"[A-Za-z0-9_.+-]+@[a-z0-9.-]+\.[a-z]{2,63}", values["ACME_EMAIL"]):
        raise ValueError("Invalid ACME contact")
    if values["ACME_EMAIL"].endswith(".invalid"):
        raise ValueError("Use a real administrator ACME email")
    for key, prefix in (("FORGEJO_IMAGE", "codeberg.org/forgejo/forgejo"),
                        ("CADDY_IMAGE", "docker.io/library/caddy")):
        if not re.fullmatch(re.escape(prefix) + r"@sha256:[a-f0-9]{64}", values[key]):
            raise ValueError(f"{key} must be an explicitly reviewed official digest pin")


def check_files(staging: Path) -> int:
    if staging.is_symlink() or not staging.is_dir() or (staging / "release.json").is_symlink():
        raise ValueError("Use a real staging directory and release marker, not symlinks")
    manifest = json.loads((staging / "release.json").read_text())
    expected = manifest["files"]
    if not isinstance(expected, dict) or not expected:
        raise ValueError("Empty release manifest")
    actual = set()
    for p in staging.rglob("*"):
        if p.is_symlink():
            raise ValueError("Symlink in staged deployment")
        if p.is_file() and p != staging / "release.json":
            relative = p.relative_to(staging).as_posix()
            actual.add(relative)
            if relative not in expected or hashlib.sha256(p.read_bytes()).hexdigest() != expected[relative]:
                raise ValueError("Staged file differs from the recorded release")
    if actual != set(expected):
        raise ValueError("A staged file is missing")
    return len(actual)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, default=Path(".env"))
    parser.add_argument("--staging", type=Path, default=Path("staging"))
    args = parser.parse_args()
    try:
        validate(read_env(args.env))
        count = check_files(args.staging)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Preflight refused: {exc}", file=sys.stderr)
        raise SystemExit(1)
    print(f"PASS: settings and {count} staged files checked. No containers, DNS or live services changed.")


if __name__ == "__main__":
    main()
