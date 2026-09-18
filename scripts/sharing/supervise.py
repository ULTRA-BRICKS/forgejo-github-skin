#!/usr/bin/env python3
"""Supervise the isolated link-preview service and its own tunnel; no production edits."""

import os, plistlib, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / ".sharing"
tunnel = "c77919c1-2a09-408e-aa6d-69ec15600251"
p = DIR / "tunnel.yml"
p.write_text(
    f"tunnel: {tunnel}\ncredentials-file: {Path.home()}/.cloudflared/{tunnel}.json\ningress:\n  - hostname: forgejo-links.hyperide.ai\n    service: http://127.0.0.1:3190\n  - service: http_status:404\n"
)
p.chmod(0o600)
services = [
    (
        "ai.hyperide.forgejo-link-preview",
        ["/opt/homebrew/bin/node", str(ROOT / "integrations/link-preview/server.mjs")],
    ),
    (
        "ai.hyperide.forgejo-link-preview-tunnel",
        ["/opt/homebrew/bin/cloudflared", "tunnel", "--config", str(p), "run", tunnel],
    ),
]
for label, command in services:
    target = Path.home() / "Library/LaunchAgents" / f"{label}.plist"
    if target.exists():
        print("Already installed:", label)
        continue
    data = {
        "Label": label,
        "ProgramArguments": command,
        "WorkingDirectory": str(ROOT),
        "EnvironmentVariables": {
            "PATH": "/opt/homebrew/bin:/usr/bin:/bin",
            "FORGEJO_PREVIEW_CONFIG": str(DIR / "config.json"),
        },
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 15,
        "StandardOutPath": str(DIR / (label + ".log")),
        "StandardErrorPath": str(DIR / (label + ".log")),
    }
    target.write_bytes(plistlib.dumps(data))
    target.chmod(0o600)
    subprocess.run(
        ["launchctl", "bootstrap", f"gui/{os.getuid()}", str(target)], check=True
    )
    print("Installed supervisor:", label)
