#!/usr/bin/env python3
"""One fresh synthetic public URL for cache-independent Slack acceptance."""

import base64, json, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
users = json.loads(
    (ROOT.parent / "forgejo-github-skin-demo/.demo/users.json").read_text()
)
base = "http://127.0.0.1:3188/api/v1/repos/demo-author/keyboard-lab/issues"
auth = (
    "Basic "
    + base64.b64encode(("demo-author:" + users["demo-author"]).encode()).decode()
)
headers = {"Authorization": auth, "Content-Type": "application/json"}
with urllib.request.urlopen(
    urllib.request.Request(base, headers=headers), timeout=15
) as response:
    issues = json.load(response)
title = "Compact previews: keep text readable and open the original URL"
issue = next((i for i in issues if i["title"] == title), None)
if issue is None:
    payload = {
        "title": title,
        "body": "Synthetic visual acceptance fixture. The image carries state, replies, author and dates, without repeating this title or description. Clicking opens this original issue directly.",
    }
    request = urllib.request.Request(
        base, method="POST", headers=headers, data=json.dumps(payload).encode()
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        issue = json.load(response)
result = {
    "number": issue["number"],
    "url": issue["html_url"],
    "title": title,
    "synthetic": True,
}
(ROOT / ".sharing/visual-fixture.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result))
