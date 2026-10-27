#!/usr/bin/env python3
"""Fail closed when an upstream version or a consumed template contract changes."""
import argparse, json
from pathlib import Path
from _compat import UnsafeSourcePath, audit_fingerprints, require_tested_version, sha256_in_checkout

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-checkout', required=True, type=Path)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    try:
        manifest = json.loads((ROOT / 'skin.manifest.json').read_text())
        version = require_tested_version(args.version, manifest)
        audit = json.loads((ROOT / manifest.get('sourceAudits', {}).get(version, 'research/source-audit.json')).read_text())
        fingerprints = audit_fingerprints(audit, version)
        errors = []
        for name, expected in fingerprints.items():
            try:
                if sha256_in_checkout(args.source_checkout, name) != expected: errors.append(f'changed: {name}')
            except FileNotFoundError: errors.append(f'missing: {name}')
            except UnsafeSourcePath: errors.append(f'unsafe: {name} (a symlink or non-regular file; keys must be regular files inside the source checkout)')
        if errors: raise ValueError('source contracts changed\n' + '\n'.join(errors))
        print(f'PASS: {len(fingerprints)} source fingerprints match reviewed {version}; runtime smoke QA remains required.')
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        parser.exit(2, f'BLOCKED: {error}\n')


if __name__ == '__main__': raise SystemExit(main())
