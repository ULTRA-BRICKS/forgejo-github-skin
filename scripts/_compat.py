"""Shared Forgejo compatibility helpers used by audit and installer gates."""
from __future__ import annotations


def normalize_forgejo_version(version: str) -> str:
    clean = version.split('+', 1)[0].removeprefix('v')
    if not clean:
        raise ValueError('Forgejo version is empty')
    return clean


def require_tested_version(version: str, manifest: dict) -> str:
    clean = normalize_forgejo_version(version)
    tested = manifest.get('testedForgejo')
    if not isinstance(tested, list) or clean not in tested:
        raise ValueError(
            f'Forgejo {clean} has no approved compatibility entry. '
            'Run source audit and browser QA first.'
        )
    return clean


def audit_fingerprints(audit: object, version: str) -> dict:
    """Return the audit's sha256 map, failing closed on a malformed audit or one for another version."""
    if not isinstance(audit, dict):
        raise ValueError('audit is not a JSON object')
    if audit.get('version') != version:
        raise ValueError(f'audit is for version {audit.get("version")}, not {version}')
    fingerprints = audit.get('sha256')
    if not isinstance(fingerprints, dict) or not fingerprints:
        raise ValueError('audit has no source fingerprints')
    return fingerprints
