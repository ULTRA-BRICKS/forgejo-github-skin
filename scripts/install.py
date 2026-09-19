#!/usr/bin/env python3
"""Install ONLY external assets and one custom hook. Dry-run unless --apply.
No service restarts, administrative API calls, database writes or binary patches.
No persistent app.ini backup is created; operators should use their normal configuration backup/rollback.
"""
from __future__ import annotations
import argparse, base64, datetime, hashlib, json, os, re, stat, tempfile
from pathlib import Path
from _compat import require_tested_version

ROOT = Path(__file__).resolve().parents[1]
THEMES = ['hypergithub-light', 'hypergithub-dark', 'hypergithub-auto']
BASE_THEMES = ['forgejo-auto','forgejo-light','forgejo-dark','gitea-auto','gitea-light','gitea-dark',
    'forgejo-auto-deuteranopia-protanopia','forgejo-light-deuteranopia-protanopia','forgejo-dark-deuteranopia-protanopia',
    'forgejo-auto-tritanopia','forgejo-light-tritanopia','forgejo-dark-tritanopia']
START, END = '<!-- hypergithub:start -->', '<!-- hypergithub:end -->'

def check_version(version: str, manifest: dict) -> str:
    return require_tested_version(version, manifest)

def configure_ini(text: str, make_default: bool) -> str:
    newline = '\r\n' if '\r\n' in text else '\n'
    lines = text.splitlines(keepends=True)
    sections = [(i, m.group(1).strip().lower()) for i, line in enumerate(lines)
                if (m := re.match(r'^\s*\[([^]]+)\]\s*(?:[;#].*)?$', line.strip()))]
    matches = [i for i, name in sections if name == 'ui']
    if len(matches) > 1:
        raise ValueError('Duplicate [ui] sections: reconcile the configuration explicitly')
    if not matches:
        if lines and not lines[-1].endswith('\n'): lines[-1] += newline
        lines += [newline + '[ui]' + newline]; start = len(lines) - 1; end = len(lines)
    else:
        start = matches[0]; end = next((i for i, _ in sections if i > start), len(lines))
    block = lines[start+1:end]
    def change(key: str, transform):
        found = [i for i, line in enumerate(block) if re.match(rf'^\s*{key}\s*=', line, re.I)]
        if len(found) > 1: raise ValueError(f'Duplicate UI key {key}')
        if found:
            i = found[0]; value = block[i].split('=', 1)[1].strip()
            # Preserve an INI inline comment, rather than interpreting it as a theme name.
            match=re.match(r'^(.*?)(\s+([;#]).*)?$', value)
            raw_value=(match.group(1) or '').strip(); comment=match.group(2) or ''
            block[i] = f'{key} = {transform(raw_value)}{comment}{newline}'
        else:
            if block and not block[-1].endswith('\n'): block[-1] += newline
            block.append(f'{key} = {transform(None)}{newline}')
    def append_themes(value):
        names = BASE_THEMES.copy() if value is None or not value.strip() else [x.strip() for x in value.split(',') if x.strip()]
        return ','.join(dict.fromkeys(names + THEMES))
    change('THEMES', append_themes)
    if make_default: change('DEFAULT_THEME', lambda _: 'hypergithub-auto')
    return ''.join(lines[:start+1] + block + lines[end:])

def merge_hook(old: str, fragment: str) -> str:
    n, m = old.count(START), old.count(END)
    if (n, m) not in [(0, 0), (1, 1)] or n and old.index(START) > old.index(END):
        raise ValueError('Invalid/duplicate managed hook markers; refusing to overwrite custom code')
    managed = START + '\n' + fragment.rstrip() + '\n' + END
    if n:
        return old[:old.index(START)] + managed + old[old.index(END)+len(END):]
    return old + ('' if not old or old.endswith('\n') else '\n') + managed + '\n'

def atomic_write(path: Path, content: bytes, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as handle:
            if path.exists():
                previous = path.stat()
                os.fchown(handle.fileno(), previous.st_uid, previous.st_gid)
            os.fchmod(handle.fileno(), mode); handle.write(content); handle.flush(); os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def ensure_no_symlinks(path: Path) -> None:
    for p in [path, *path.parents]:
        if p.is_symlink(): raise ValueError(f'Symlinked destination is not accepted: {p}')

def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()

def plan(custom: Path, ini: Path, make_default: bool) -> list[tuple[Path, bytes, int]]:
    ensure_no_symlinks(custom); ensure_no_symlinks(ini)
    if not ini.is_file(): raise ValueError('app.ini must exist; this installer does not initialize a Forgejo instance')
    targets = []
    asset_root = ROOT/'dist/public/assets'
    version = json.loads((ROOT/'package.json').read_text())['version']
    expected = {Path(f'css/theme-hypergithub-{mode}.css') for mode in ('auto','light','dark')}
    expected |= {Path(f'hypergithub/{version}/{name}') for name in ('core.mjs','skin.css','skin.mjs','list-options.mjs','mobile-chrome.mjs','repository-ui.css')}
    actual = set()
    for source in sorted(asset_root.rglob('*')):
        rel = source.relative_to(asset_root)
        cursor = source
        while cursor != asset_root:
            if cursor.is_symlink(): raise ValueError(f'Symlinked build asset is not accepted: {rel}')
            cursor = cursor.parent
        if source.is_file():
            actual.add(rel)
            target = custom/'public/assets'/rel
            ensure_no_symlinks(target)
            targets.append((target, source.read_bytes(), 0o644))
    if actual != expected:
        raise ValueError(f'Unexpected build asset set; missing={sorted(expected-actual)!r}, extra={sorted(actual-expected)!r}')
    hook = custom/'templates/custom/footer.tmpl'; ensure_no_symlinks(hook)
    old = hook.read_text() if hook.exists() else ''
    fragment = (ROOT/'dist/templates/custom/footer.tmpl').read_text()
    targets.append((hook, merge_hook(old, fragment).encode(), stat.S_IMODE(hook.stat().st_mode) if hook.exists() else 0o644))
    targets.append((ini, configure_ini(ini.read_text(), make_default).encode(), stat.S_IMODE(ini.stat().st_mode)))
    return [(p, data, mode) for p, data, mode in targets if not p.exists() or p.read_bytes() != data]

def apply_plan(targets: list[tuple[Path, bytes, int]]) -> None:
    """Apply atomically per file; keep preimages only in memory for immediate failure recovery.
    Persistent rollback journals are intentionally not written because app.ini can contain secrets.
    """
    originals=[]
    try:
        for p,data,mode in targets:
            # Check before reading the preimage, then again immediately before replace: an external process can swap a parent between them.
            ensure_no_symlinks(p)
            originals.append((p,p.read_bytes() if p.exists() else None,stat.S_IMODE(p.stat().st_mode) if p.exists() else None))
            ensure_no_symlinks(p)
            atomic_write(p,data,mode)
    except Exception:
        for p,before,before_mode in reversed(originals):
            ensure_no_symlinks(p)
            if before is None: p.unlink(missing_ok=True)
            else: atomic_write(p,before,before_mode)
        raise

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--custom-path',type=Path); parser.add_argument('--app-ini',type=Path)
    parser.add_argument('--forgejo-version'); parser.add_argument('--make-default',action='store_true')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    try:
        if not all([args.custom_path,args.app_ini,args.forgejo_version]): parser.error('--custom-path, --app-ini and --forgejo-version are required')
        manifest=json.loads((ROOT/'skin.manifest.json').read_text())
        check_version(args.forgejo_version,manifest)
        targets=plan(args.custom_path.absolute(),args.app_ini.absolute(),args.make_default)
        print(f'{"APPLY" if args.apply else "DRY RUN"}: {len(targets)} changed files; default theme {"explicitly changed" if args.make_default else "preserved"}')
        for target,content,_ in targets: print(f'  {target} ({len(content)} bytes)')
        if args.apply:
            apply_plan(targets)
            print('Assets installed. Operator must restart Forgejo for template changes and run smoke checks before serving traffic.')
        return 0
    except (ValueError,OSError,KeyError) as error:
        parser.exit(2,f'ERROR: {error}\n')
if __name__=='__main__': raise SystemExit(main())
