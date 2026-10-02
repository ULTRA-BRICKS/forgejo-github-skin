# HyperSearch

Low-latency, permission-aware search for Hyperide Forgejo.

The hot path is intentionally small: bare Git repositories are indexed incrementally
from immutable HEADs into SQLite FTS5, with a separate symbol/file index and a small
RRF-style fusion layer. The browser sends one query to `/__hypersearch/query`.

Search intent is inferred automatically:

- syntax-like text → structural token search;
- identifiers → symbols plus definitions/usages;
- file-looking text → file/path search;
- ordinary words → FTS5/BM25;
- explicit qualifiers such as `repo:`, `org:`, `def:`, `refs:`, `file:`,
  `path:`, `lang:`, and `mode:` override inference.

The service never trusts search-index visibility. Before returning results it forwards
the current browser's Forgejo session cookie to Forgejo itself on loopback and retains
only repositories Forgejo renders as readable for that viewer. Raw cookies are neither
logged nor stored; permission-cache keys contain only a hash.

## Why this design

Elasticsearch/Solr are capable but operationally heavy for this installation.
Algolia is external and would complicate private-repository guarantees. Typesense is a
reasonable future option but still duplicates a service we can cover with SQLite for
the current corpus. Orama is useful client-side but private global indexing belongs on
the server.

Embeddings and a BGE-style reranker are deliberately **not** in the first-request path.
They can be added as a second stage for ambiguous natural-language queries after the
lexical/symbol/structural layer has produced bounded candidates. This keeps common
symbol/file/code queries deterministic and fast.

## Run locally

```bash
HYPERSEARCH_REPO_ROOT=/path/to/bare/repos \
HYPERSEARCH_STATE=/tmp/hypersearch/index.sqlite3 \
python3 search/service.py
```

`GET /health` is intended for loopback readiness. The externally proxied
`/__hypersearch/health` requires a Forgejo session.
