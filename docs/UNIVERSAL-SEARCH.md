# Universal Forgejo search

## Product contract

There is one search entry in the global header. Repository pages do not add a second
search row. Opening search must be instant; network/index work starts only after the
dialog is already interactive.

Search carries context rather than forcing users to learn separate pages:

- **This repository** — current repository only.
- **Organization** — repositories the viewer can read in the current owner/org.
- **Everywhere** — every Forgejo repository readable by the current viewer.

The parser infers intent. A function-like or syntax-like expression selects structural
search; an identifier selects symbols plus definitions/usages; a filename/path selects
files; ordinary words use full-text ranking. Qualifiers are optional escape hatches:
`repo:`, `org:`, `symbol:`, `def:`, `refs:`, `file:`, `path:`,
`lang:`, and `mode:`.

## Query pipeline

1. **Parser (<1 ms):** infer scope and intent.
2. **Deterministic candidates:** SQLite FTS5/BM25, file/path index and extracted symbol
   definitions. Syntax-like queries are normalized to token sequences, so punctuation
   and whitespace do not have to match exactly.
3. **Fusion:** a bounded reciprocal-rank-fusion score combines symbol/file/text
   candidates. Exact symbol and exact filename matches receive deterministic boosts.
4. **Permission filter:** search-index visibility is never authorization. Candidate
   repositories are checked against Forgejo itself using the current browser's session
   on loopback; only readable repositories are returned.
5. **Optional future semantic stage:** embeddings/reranking may run only for ambiguous
   natural-language queries after deterministic retrieval has produced a small bounded
   candidate set. They are not a dependency for symbol/file/code search.

## Why SQLite first

For the current single-Forgejo corpus, Elasticsearch/Solr add JVM/cluster operational
cost without improving the common symbol/file latency target. Algolia would move
private index material outside the Forgejo trust boundary. Typesense is attractive if
the corpus outgrows one host, but today it duplicates capabilities FTS5 already provides.
Orama is useful in a client, but a browser must not receive a global private-code index.

A custom sidecar therefore starts with Python + git + SQLite FTS5 and no runtime Python
packages. This is intentionally compatible with `uv` while remaining trivial to
package in Nix. The index is disposable and rebuilt from bare repositories.

## Privacy boundary

The index contains private code, so the index file is host-local service state. The
browser cannot query it directly by repository name and receive unverified results.

For every request:
- a repository-scoped request is denied unless Forgejo renders that repository for the
  forwarded viewer session;
- organization/global requests search candidates first, then filter every candidate
  repository through the same Forgejo permission check;
- raw cookies are never logged or stored; the two-second typing-burst permission cache uses only a cookie hash and expires immediately after that burst;
- public responses do not expose global index counts.

## Latency goals

Warm targets on the Forgejo host:

- dialog visible/focused: < 50 ms, independent of backend;
- exact symbol/file search: p95 < 100 ms;
- repository text/structural search: p95 < 150 ms;
- global search: p95 < 250 ms after permission cache warmup.

Index updates are incremental by Git HEAD and happen off the request path.
