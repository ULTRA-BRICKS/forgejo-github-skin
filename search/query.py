from __future__ import annotations
from dataclasses import dataclass
import re

MODES = {"smart", "text", "ast", "symbol", "file", "repo"}
SCOPES = {"repo", "org", "global"}
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")
ORG_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
WORD_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+")
SYMBOL_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|::)[A-Za-z_$][A-Za-z0-9_$]*)?$")
FILE_RE = re.compile(r"^[-\w./]+\.[A-Za-z0-9]{1,8}(?::\d+)?$")
SYNTAX_RE = re.compile(r"[(){}\[\];]|=>|::|(?:^|\s)(?:function|class|def|fn|const|let|var|return|import|from|SELECT|MATCH)\b", re.I)

@dataclass(frozen=True)
class SearchQuery:
    text: str
    mode: str
    scope: str
    repo: str | None = None
    org: str | None = None
    path: str | None = None
    language: str | None = None
    intent: str | None = None
    limit: int = 30
def classify(text: str) -> str:
    text = text.strip()
    if not text:
        return "smart"
    if SYNTAX_RE.search(text):
        return "ast"
    if FILE_RE.match(text) or ("/" in text and not re.search(r"\s", text)):
        return "file"
    if SYMBOL_RE.match(text):
        return "symbol"
    return "text"


def tokens(text: str) -> list[str]:
    return [m.group(0) for m in WORD_RE.finditer(text)][:24]


def fts_phrase(text: str) -> str:
    terms = tokens(text)
    if not terms:
        return ""
    escaped = [t.replace('"', '""') for t in terms]
    return '"' + " ".join(escaped) + '"'


def fts_and(text: str) -> str:
    terms = tokens(text)
    return " AND ".join('"' + t.replace('"', '""') + '"' for t in terms)
def validate(params: dict[str, str]) -> SearchQuery:
    text = str(params.get("q", ""))[:1024].strip()
    mode = str(params.get("mode", "")).lower() or classify(text)
    scope = str(params.get("scope", "global")).lower()
    if mode not in MODES:
        mode = classify(text)
    if scope not in SCOPES:
        scope = "global"
    repo = str(params.get("repo", "")).strip() or None
    org = str(params.get("org", "")).strip() or None
    if repo and not REPO_RE.fullmatch(repo):
        raise ValueError("Invalid repository scope")
    if org and not ORG_RE.fullmatch(org):
        raise ValueError("Invalid organization scope")
    if scope == "repo" and not repo:
        raise ValueError("Repository scope requires repo")
    if scope == "org" and not org:
        raise ValueError("Organization scope requires org")
    path = str(params.get("path", ""))[:512].strip() or None
    language = str(params.get("lang", ""))[:64].strip().lower() or None
    intent = str(params.get("intent", ""))[:32].strip().lower() or None
    try:
        limit = min(50, max(1, int(params.get("limit", "30"))))
    except ValueError:
        limit = 30
    return SearchQuery(text=text, mode=mode, scope=scope, repo=repo, org=org, path=path, language=language, intent=intent, limit=limit)
