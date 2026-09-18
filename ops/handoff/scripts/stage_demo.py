#!/usr/bin/env python3
"""Stage a reviewed skin + static Storybook into a NEW demo directory.

Never edits the supplied repository, app.ini, Docker daemon, DNS, or production.
Run from a trusted checkout. Untrusted build scripts must not be executed as root.
The operator must separately run the repository's version/source compatibility gate.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

PACK = Path(__file__).resolve().parents[1]
ASSET_PREFIX = "assets/forgejo-ui-handoff/v1"
THEMES = ("hypergithub-light", "hypergithub-dark", "hypergithub-auto")
ALLOWED_EXTENSIONS = {
    ".css", ".mjs", ".js", ".json", ".html", ".txt", ".svg", ".png", ".webp",
    ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".map", ".wasm",
}
FONT_EXTENSIONS = {".woff", ".woff2", ".ttf", ".otf", ".eot", ".ttc", ".otc"}

def omit_font_binaries(directory, names):
    """Keep generated-font dependencies in the source build, not in the handoff."""
    return [name for name in names if Path(name).suffix.lower() in FONT_EXTENSIONS]

FORBIDDEN_NAMES = {"node_modules", "credentials", "secrets", "app.ini"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def check_tree(path: Path, *, templates: bool = False) -> None:
    if path.is_symlink() or not path.is_dir():
        raise ValueError(f"Missing real directory: {path.name}")
    for p in path.rglob("*"):
        if p.is_symlink():
            raise ValueError(f"Symlink in publish tree: {p.relative_to(path)}")
        if any(x.startswith(".") or x in FORBIDDEN_NAMES for x in p.relative_to(path).parts):
            raise ValueError(f"Forbidden publish path: {p.relative_to(path)}")
        if p.is_file():
            if templates:
                if p.relative_to(path).as_posix() != "custom/footer.tmpl":
                    raise ValueError("Unexpected template override: review before staging")
            elif p.suffix.lower() not in ALLOWED_EXTENSIONS:
                raise ValueError(f"Unexpected public asset type: {p.relative_to(path)}")


def check_logo(data: bytes) -> None:
    if len(data) > 512_000:
        raise ValueError("Logo exceeds size bound")
    if re.search(rb"<!\s*(?:DOCTYPE|ENTITY)", data, re.I):
        raise ValueError("DTD/entities are not allowed in a logo")
    data.decode("utf-8-sig")  # Reject alternate encodings before raw safety checks.
    if b"\x00" in data or b"<?" in data:
        raise ValueError("Use a UTF-8 SVG without processing instructions or XML declarations")
    root = ET.fromstring(data)
    if root.tag.split("}")[-1] != "svg":
        raise ValueError("Expected an SVG root")
    for element in root.iter():
        tag = element.tag.split("}")[-1].lower()
        if tag in {"script", "foreignobject", "iframe", "object", "style", "animate", "set", "animatetransform", "animatemotion"}:
            raise ValueError("Logo must be a static, self-contained vector")
        for key, value in element.attrib.items():
            key = key.split("}")[-1].lower()
            if key.startswith("on") or (key == "href" and not value.startswith("#")):
                raise ValueError("External or executable SVG content is not allowed")
            if re.search(r"url\(\s*['\"]?(?!#)", value, re.I):
                raise ValueError("Only local fragment references are allowed")


def read_commit(repo: Path) -> str:
    return subprocess.check_output(
        ["git", "-C", str(repo), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
    ).strip()


def stage(repo: Path, output: Path, logo: Path, expected_sha: str,
          reviewed_version: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", expected_sha):
        raise ValueError("Use the full reviewed Git commit hash")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[+-][A-Za-z0-9.-]+)?", reviewed_version):
        raise ValueError("Supply the exact independently reviewed Forgejo version")
    repo = repo.resolve(strict=True)
    # Refuse existing symlinks and paths before resolution: never overwrite anything.
    if output.exists() or output.is_symlink():
        raise ValueError("Output already exists; choose a NEW staging directory")
    output = output.resolve()
    if output.is_relative_to(repo):
        raise ValueError("Stage outside the repository")
    if read_commit(repo) != expected_sha:
        raise ValueError("Repository HEAD differs from the reviewed hash")
    dirty = subprocess.check_output(
        ["git", "-C", str(repo), "status", "--porcelain", "--untracked-files=no"], text=True
    )
    if dirty.strip():
        raise ValueError("Tracked repository files are modified; review/commit first")
    public, templates, storybook = repo / "dist/public", repo / "dist/templates", repo / "storybook-static"
    check_tree(public)
    check_tree(templates, templates=True)
    check_tree(storybook)
    package = json.loads((repo / "package.json").read_text())
    version = package["version"]
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:[+-][A-Za-z0-9.-]+)?", version):
        raise ValueError("Unexpected skin version")
    for theme in THEMES:
        if not (public / "assets/css" / f"theme-{theme}.css").is_file():
            raise ValueError(f"Missing generated theme {theme}")
    for name in ("skin.mjs", "core.mjs"):
        if not (public / "assets/hypergithub" / version / name).is_file():
            raise ValueError(f"Missing generated {name}")
    footer = (templates / "custom/footer.tmpl").read_text()
    if f"hypergithub/{version}/skin.mjs" not in footer:
        raise ValueError("Footer does not load the expected versioned skin module")
    for entry in ("index.html", "iframe.html", "index.json"):
        if not (storybook / entry).is_file():
            raise ValueError(f"Missing Storybook build file {entry}")
    logo_bytes = logo.read_bytes()
    check_logo(logo_bytes)
    iframe = (storybook / "iframe.html").read_text()
    if "</head>" not in iframe or "</body>" not in iframe:
        raise ValueError("Unexpected Storybook iframe structure")
    # Build privately, then reserve a NEW destination. A release marker is published last.
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=".forgejo-stage-", dir=output.parent))
    try:
        shutil.copytree(public, tmp / "custom/public", ignore=omit_font_binaries)
        shutil.copytree(templates, tmp / "custom/templates")
        shutil.copytree(storybook, tmp / "storybook", ignore=omit_font_binaries)
        native_assets = tmp / "custom/public" / ASSET_PREFIX
        preview_assets = tmp / "storybook" / ASSET_PREFIX
        if native_assets.exists() or preview_assets.exists():
            raise ValueError("Handoff asset namespace already exists; review before replacing")
        native_assets.mkdir(parents=True)
        preview_assets.mkdir(parents=True)
        for target in (native_assets, preview_assets):
            shutil.copyfile(PACK / "assets/brand.css", target / "brand.css")
        shutil.copyfile(PACK / "assets/brand.mjs", native_assets / "brand.mjs")
        shutil.copyfile(PACK / "assets/storybook-brand.mjs", preview_assets / "storybook-brand.mjs")
        (preview_assets / "forgejo-logo.svg").write_bytes(logo_bytes)
        header = f'<!-- forgejo-ui-handoff: palette only -->\n<link rel="stylesheet" href="{{{{AppSubUrl}}}}/{ASSET_PREFIX}/brand.css">\n'
        (tmp / "custom/templates/custom/header.tmpl").write_text(header)
        (tmp / "custom/templates/custom/footer.tmpl").write_text(
            footer + f'\n<script type="module" src="{{{{AppSubUrl}}}}/{ASSET_PREFIX}/brand.mjs"></script>\n'
        )
        # Gallery-only adaptation; original reference screenshots are never edited.
        iframe = iframe.replace("</head>", f'<link rel="stylesheet" href="/{ASSET_PREFIX}/brand.css">\n</head>', 1)
        iframe = iframe.replace("</body>", f'<script type="module" src="/{ASSET_PREFIX}/storybook-brand.mjs"></script>\n</body>', 1)
        (tmp / "storybook/iframe.html").write_text(iframe)
        # Make both public and custom files readable by the unprivileged service.
        for p in tmp.rglob("*"):
            os.chmod(p, 0o755 if p.is_dir() else 0o644)
        os.chmod(tmp, 0o755)
        files = {p.relative_to(tmp).as_posix(): sha256(p.read_bytes())
                 for p in sorted(tmp.rglob("*")) if p.is_file()}
        manifest = {
            "kind": "staged-demo-not-deployment-proof", "sourceCommit": expected_sha,
            "skinVersion": version, "operatorReviewedForgejoVersion": reviewed_version,
            "logoSourceSha256": sha256(logo_bytes), "files": files,
            "compatibilityGate": "must-be-verified-separately-against-selected-binary",
            "privateSlackIntegration": "not-installed",
        }
        (tmp / "release.json").write_text(json.dumps(manifest, indent=2) + "\n")
        os.chmod(tmp / "release.json", 0o644)
        # mkdir is exclusive: even a concurrently created empty directory must
        # not be replaced. A partial publication never has release.json.
        output.mkdir(mode=0o755)
        for child in list(tmp.iterdir()):
            if child.name != "release.json":
                os.rename(child, output / child.name)
        os.rename(tmp / "release.json", output / "release.json")
        return manifest
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--logo-svg", type=Path, required=True,
                        help="The genuine Forgejo SVG exported from the reviewed distribution")
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--reviewed-forgejo-version", required=True)
    args = parser.parse_args()
    try:
        result = stage(args.repo, args.output, args.logo_svg, args.expected_sha,
                       args.reviewed_forgejo_version)
    except (OSError, ValueError, KeyError, ET.ParseError, subprocess.SubprocessError) as exc:
        print(f"Staging refused: {exc}", file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps({"staged": str(args.output), "sourceCommit": result["sourceCommit"],
                      "fileCount": len(result["files"]), "deployed": False}, indent=2))


if __name__ == "__main__":
    main()
