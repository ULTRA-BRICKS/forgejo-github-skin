#!/usr/bin/env python3
"""Optional native-URL OG overlay. Exact source gate; dry-run unless --apply."""

import argparse, hashlib, json, os, re, tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
MARKER = (
    "{{/* managed: hypergithub-native-social-v2; generated from audited upstream */}}\n"
)


def generate(source, origin, expected):
    if hashlib.sha256(source.encode()).hexdigest() != expected:
        raise ValueError(
            "Upstream Open Graph partial changed; review before installing"
        )
    url = urlsplit(origin)
    if (
        url.scheme != "https"
        or not re.fullmatch(r"[a-z0-9.-]+", url.netloc)
        or url.path not in ("", "/")
        or url.query
        or url.fragment
    ):
        raise ValueError("Use an exact HTTPS preview origin")
    start = source.index("{{if .OpenGraphImageURL}}")
    stop = source.index('<meta property="og:site_name"', start)
    original = source[start:stop]
    prefix = """{{if and .Repository (not .Repository.IsPrivate)}}
{{$previewURL := .OpenGraphURL}}
{{if not $previewURL}}{{$previewURL = printf "%s%s" AppUrl .Link}}{{end}}
<meta property="og:image" content="PREVIEW_ORIGIN/image?v=2&amp;url={{urlquery $previewURL}}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1440">
<meta property="og:image:height" content="672">
<meta property="og:image:alt" content="Repository activity and object facts; title and description are provided as text">
{{else}}
""".replace("PREVIEW_ORIGIN", origin.rstrip("/"))
    return MARKER + source[:start] + prefix + original + "{{end}}\n" + source[stop:]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-checkout", type=Path, required=True)
    parser.add_argument("--custom-path", type=Path, required=True)
    parser.add_argument("--preview-origin", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args()
    audit = json.loads((ROOT / "research/native-social-audit.json").read_text())
    source = (args.source_checkout / audit["path"]).read_text()
    content = generate(source, args.preview_origin, audit["sha256"])
    target = args.custom_path / "templates/base/head_opengraph.tmpl"
    if target.is_symlink():
        raise ValueError("Template symlink rejected")
    exists = target.exists()
    if exists and target.read_text() != content:
        raise ValueError("Existing template differs; preserve administrator changes")
    plan = {
        "testedForgejo": audit["version"],
        "target": str(target),
        "sha256": hashlib.sha256(content.encode()).hexdigest(),
        "action": "remove" if args.remove else "unchanged" if exists else "create",
        "applied": args.apply,
    }
    if args.apply and args.remove and exists:
        target.unlink()
    elif args.apply and not args.remove and not exists:
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".og-", dir=target.parent)
        try:
            with os.fdopen(fd, "w") as handle:
                os.fchmod(handle.fileno(), 0o644)
                handle.write(content)
            os.replace(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)
    print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    main()
