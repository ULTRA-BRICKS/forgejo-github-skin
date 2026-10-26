#!/usr/bin/env python3
"""Fail closed when an upstream version or a consumed template contract changes."""
import argparse, hashlib, json
from pathlib import Path
from _compat import audit_fingerprints, require_tested_version

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
            file = args.source_checkout / name
            if not file.is_file(): errors.append(f'missing: {name}')
            elif hashlib.sha256(file.read_bytes()).hexdigest() != expected: errors.append(f'changed: {name}')
        if errors: raise ValueError('source contracts changed\n' + '\n'.join(errors))
        print(f'PASS: {len(fingerprints)} source fingerprints match reviewed {version}; runtime smoke QA remains required.')
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        parser.exit(2, f'BLOCKED: {error}\n')


if __name__ == '__main__': raise SystemExit(main())
