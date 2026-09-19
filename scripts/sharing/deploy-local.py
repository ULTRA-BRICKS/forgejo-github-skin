#!/usr/bin/env python3
"""Deploy a committed preview release through launchd after isolated health checks."""
import argparse, json, os, plistlib, shutil, socket, subprocess, tarfile, tempfile, time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LABEL = 'ai.hyperide.forgejo-link-preview'

def health(port, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as response:
                result = json.load(response)
            if result.get('service') == 'forgejo-link-preview' and not result.get('configurationReloadRejected'):
                return result
        except (OSError, ValueError):
            pass
        time.sleep(0.15)
    raise RuntimeError('Release health check failed')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    config = args.config.resolve()
    if args.config.is_symlink() or not config.is_file() or config.stat().st_mode & 0o077:
        raise RuntimeError('A private regular config is required')
    dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True)
    if dirty.strip():
        raise RuntimeError('Commit and review the release before deployment')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    base = Path.home() / '.local/share/forgejo-link-preview'
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    release = base / 'releases' / revision
    if not release.exists():
        release.mkdir(parents=True, mode=0o700)
        archive = subprocess.Popen(['git', 'archive', revision], cwd=ROOT, stdout=subprocess.PIPE)
        with tarfile.open(fileobj=archive.stdout, mode='r|') as contents:
            contents.extractall(release, filter='data')
        if archive.wait() != 0:
            raise RuntimeError('Unable to stage committed release')
    node = shutil.which('node')
    module = Path(os.environ.get('PLAYWRIGHT_MODULE', ROOT / 'node_modules/@playwright/test/index.mjs')).resolve()
    if not node or not module.is_file():
        raise RuntimeError('Node and the tested Playwright installation are required')
    env = {**os.environ, 'FORGEJO_PREVIEW_CONFIG': str(config),
           'PLAYWRIGHT_MODULE': str(module), 'FORGEJO_PREVIEW_BUILD': revision}
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='forgejo-preflight-') as state:
        # Exercise actual SVG/PNG geometry before replacing the working service.
        rendered = subprocess.run([node, str(release / 'scripts/sharing/check-preview-layout.mjs')],
            cwd=release, env={**env, 'PREVIEW_PROOF_DIR': str(Path(state) / 'rendering')},
            capture_output=True, text=True, timeout=60)
        if rendered.returncode:
            raise RuntimeError('Release rendering preflight failed: ' + rendered.stderr[-3000:])
        render_proof = json.loads(rendered.stdout)
        if render_proof.get('passed') != 7:
            raise RuntimeError('Rendering preflight did not verify every preview type')
        candidate = subprocess.Popen([node, str(release / 'integrations/link-preview/server.mjs')],
            env={**env, 'FORGEJO_PREVIEW_PORT': str(port), 'FORGEJO_PREVIEW_STATE_DIR': state},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            proof = health(port)
            if proof.get('build') != revision or not proof.get('slackConfigured'):
                raise RuntimeError('Candidate release or Slack configuration is not ready')
        finally:
            candidate.terminate()
            try:
                candidate.wait(timeout=5)
            except subprocess.TimeoutExpired:
                candidate.kill()
                candidate.wait()
    if args.apply:
        target = Path.home() / 'Library/LaunchAgents' / f'{LABEL}.plist'
        original = target.read_bytes()
        data = plistlib.loads(original)
        if data.get('Label') != LABEL:
            raise RuntimeError('Unexpected supervisor identity')
        (base / f'previous-supervisor-{revision}.plist').write_bytes(original)
        (base / f'previous-supervisor-{revision}.plist').chmod(0o600)
        data['ProgramArguments'] = [node, str(release / 'integrations/link-preview/server.mjs')]
        data['WorkingDirectory'] = str(release)
        data['EnvironmentVariables'] = {**data.get('EnvironmentVariables', {}),
            'FORGEJO_PREVIEW_CONFIG': str(config), 'PLAYWRIGHT_MODULE': str(module),
            'FORGEJO_PREVIEW_BUILD': revision}
        data['EnvironmentVariables'].pop('FORGEJO_PREVIEW_PORT', None)
        data['EnvironmentVariables'].pop('FORGEJO_PREVIEW_STATE_DIR', None)
        domain = f'gui/{os.getuid()}'
        subprocess.run(['launchctl', 'bootout', f'{domain}/{LABEL}'], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target.write_bytes(plistlib.dumps(data))
        target.chmod(0o600)
        # launchd may return EIO for a short interval after bootout even though the
        # label is gone. Retry with a bounded settle delay instead of immediately
        # repeating the same race.
        errors = []
        for attempt in range(5):
            if attempt:
                time.sleep(0.75 * attempt)
            bootstrap = subprocess.run(['launchctl', 'bootstrap', domain, str(target)], capture_output=True, text=True, check=False)
            if bootstrap.returncode == 0:
                break
            errors.append((bootstrap.stderr or bootstrap.stdout).strip())
        else:
            raise RuntimeError('Unable to activate launchd release after bounded settle retries: ' + errors[-1])
        proof = health(3190)
        if proof.get('build') != revision:
            raise RuntimeError('Supervisor did not activate the staged revision')
    print(json.dumps({'applied': args.apply, 'revision': revision, 'health': proof, 'renderedPreviews': render_proof['passed']}, indent=2))

if __name__ == '__main__':
    main()
