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
