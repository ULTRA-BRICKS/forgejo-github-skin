#!/usr/bin/env python3
"""Provision only synthetic demo fixtures and a demo OAuth client, never production."""

import base64, json, secrets, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / ".sharing"
DIR.mkdir(mode=0o700, exist_ok=True)
users = json.loads(
    (ROOT.parent / "forgejo-github-skin-demo/.demo/users.json").read_text()
)
auth = (
    "Basic "
    + base64.b64encode(("demo-author:" + users["demo-author"]).encode()).decode()
)


def api(method, route, data=None):
    request = urllib.request.Request(
        "http://127.0.0.1:3188/api/v1" + route,
        method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Authorization": auth, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read() or "null")


try:
    repo = api("GET", "/repos/demo-author/link-preview-private")
except urllib.error.HTTPError as e:
    if e.code != 404:
        raise
    repo = api(
        "POST",
        "/user/repos",
        {
            "name": "link-preview-private",
            "description": "Synthetic private repository for authenticated Slack preview tests. No production data.",
            "private": True,
            "auto_init": True,
            "default_branch": "main",
        },
    )
assert repo["private"] is True
api(
    "PUT",
    "/repos/demo-author/link-preview-private/collaborators/demo-reviewer",
    {"permission": "read"},
)
issues = api("GET", "/repos/demo-author/link-preview-private/issues")
issue = (
    issues[0]
    if issues
    else api(
        "POST",
        "/repos/demo-author/link-preview-private/issues",
        {
            "title": "Synthetic private preview: keep focus after opening a diff",
            "body": "This is deliberately synthetic test content behind Forgejo login. Acceptance: an authorized Slack viewer sees this summary; anonymous crawlers and unapproved channels must not. Verification marker: FJ-DEMO-PRIVATE-PREVIEW-2026.",
        },
    )
)
client_path = DIR / "forgejo-oauth.json"
if not client_path.exists():
    client = api(
        "POST",
        "/user/applications/oauth2",
        {
            "name": "Forgejo Slack preview demo",
            "confidential_client": True,
            "redirect_uris": ["https://forgejo-links.hyperide.ai/oauth/callback"],
        },
    )
    client_path.write_text(json.dumps(client))
    client_path.chmod(0o600)
config_path = DIR / "config.json"
if not config_path.exists():
    client = json.loads(client_path.read_text())
    config = {
        "origin": "https://forgejo-links.hyperide.ai",
        "forgejo": "https://forgejo-ui-demo.hyperide.ai",
        "port": 3190,
        "encryptionKey": secrets.token_hex(32),
        "oauth": {
            "clientId": client["client_id"],
            "clientSecret": client["client_secret"],
        },
        "slack": {
            "teamId": "T09LDGG3DJB",
            "demoChannel": "C0C2X21ECTB",
            "appId": "",
            "signingSecret": "",
            "botToken": "",
        },
        "privateDestinations": [
            {
                "workspaceId": "T09LDGG3DJB",
                "channelId": "C0C2X21ECTB",
                "repositoryId": str(repo["id"]),
                "instanceOrigin": "https://forgejo-ui-demo.hyperide.ai",
                "approvedToCopy": True,
            }
        ],
        "demoPrivateUrl": issue["html_url"],
        "demoPublicUrl": "https://forgejo-ui-demo.hyperide.ai/demo-author/keyboard-lab/issues/1",
    }
    config_path.write_text(json.dumps(config, indent=2))
    config_path.chmod(0o600)
print(
    json.dumps(
        {
            "privateRepositoryId": repo["id"],
            "privateIssueUrl": issue["html_url"],
            "oauthConfigured": True,
            "slackInstalled": False,
        }
    )
)
