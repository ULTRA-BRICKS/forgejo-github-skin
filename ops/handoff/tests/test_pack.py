from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
stage = load("stage_demo")
check = load("check_demo")
LOGO = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#f08020" d="M0 0h10v10z"/></svg>'

class StageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        def put(name, content):
            p = self.repo / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
        put("package.json", '{"version":"0.1.0"}')
        for theme in stage.THEMES:
            put(f"dist/public/assets/css/theme-{theme}.css", ":root{}")
        for name in ("skin.mjs", "core.mjs"):
            put(f"dist/public/assets/hypergithub/0.1.0/{name}", "export {};")
        put("dist/templates/custom/footer.tmpl", '<script type="module" src="{{AppSubUrl}}/assets/hypergithub/0.1.0/skin.mjs"></script>')
        put("storybook-static/index.html", "<!doctype html><title>Test fixture</title>")
        put("storybook-static/iframe.html", "<html><head></head><body></body></html>")
        put("storybook-static/index.json", "{}")
        self.git("init", "-q")
        self.git("config", "user.name", "Pack test")
        self.git("config", "user.email", "pack-test@example.invalid")
        self.git("add", ".")
        self.git("commit", "-qm", "Synthetic staging fixture; not product evidence")
        self.sha = self.git("rev-parse", "HEAD").strip()
        self.logo = self.root / "fixture.svg"
        self.logo.write_bytes(LOGO)
        self.out = self.root / "staged"

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], text=True, stderr=subprocess.DEVNULL)

    def run_stage(self, **kw):
        return stage.stage(kw.get("repo", self.repo), kw.get("output", self.out),
            kw.get("logo", self.logo), kw.get("sha", self.sha), kw.get("version", "16.0.3"))

    def test_complete_stage_has_verifiable_manifest(self):
        manifest = self.run_stage()
        self.assertEqual(check.check_files(self.out), len(manifest["files"]))
        self.assertEqual(manifest["privateSlackIntegration"], "not-installed")

    def test_repository_is_untouched(self):
        before = self.git("status", "--porcelain")
        self.run_stage()
        self.assertEqual(self.git("status", "--porcelain"), before)

    def test_genuine_input_geometry_not_changed(self):
        self.run_stage()
        self.assertEqual((self.out / "storybook" / stage.ASSET_PREFIX / "forgejo-logo.svg").read_bytes(), LOGO)

    def test_existing_output_is_never_replaced(self):
        self.out.mkdir()
        sentinel = self.out / "keep"
        sentinel.write_text("private operator file")
        with self.assertRaises(ValueError): self.run_stage()
        self.assertEqual(sentinel.read_text(), "private operator file")

    def test_output_symlink_is_rejected(self):
        self.out.symlink_to(self.root / "nonexistent")
        with self.assertRaises(ValueError): self.run_stage()

    def test_wrong_source_hash_is_rejected(self):
        with self.assertRaises(ValueError): self.run_stage(sha="0" * 40)

    def test_abbreviated_source_hash_is_rejected(self):
        with self.assertRaises(ValueError): self.run_stage(sha=self.sha[:7])

    def test_dirty_source_is_rejected(self):
        (self.repo / "package.json").write_text('{"version":"1.0.0"}')
        with self.assertRaises(ValueError): self.run_stage()

    def test_output_inside_repo_is_rejected(self):
        with self.assertRaises(ValueError): self.run_stage(output=self.repo / "stage")

    def test_public_symlink_is_rejected(self):
        (self.repo / "storybook-static" / "leak.txt").symlink_to(self.logo)
        with self.assertRaises(ValueError): self.run_stage()

    def test_hidden_credentials_are_rejected(self):
        (self.repo / "storybook-static" / ".env").write_text("DO_NOT_PUBLISH=1")
        with self.assertRaises(ValueError): self.run_stage()

    def test_unreviewed_template_override_is_rejected(self):
        (self.repo / "dist/templates" / "evil.tmpl").write_text("test")
        with self.assertRaises(ValueError): self.run_stage()

    def test_missing_build_is_rejected(self):
        (self.repo / "storybook-static/index.json").unlink()
        # Deletion of a tracked fixture file also violates the clean checkout gate.
        with self.assertRaises(ValueError): self.run_stage()

    def test_tampered_staging_fails_preflight(self):
        self.run_stage()
        (self.out / "storybook/index.html").write_text("modified")
        with self.assertRaises(ValueError): check.check_files(self.out)

    def test_extra_file_fails_preflight(self):
        self.run_stage()
        (self.out / "storybook/leak.txt").write_text("extra")
        with self.assertRaises(ValueError): check.check_files(self.out)

    def test_staging_root_symlink_fails_preflight(self):
        self.run_stage()
        alias = self.root / "staging-alias"
        alias.symlink_to(self.out, target_is_directory=True)
        with self.assertRaises(ValueError): check.check_files(alias)

    def test_release_marker_symlink_fails_preflight(self):
        self.run_stage()
        marker = self.out / "release.json"
        saved = self.root / "saved-release.json"
        marker.rename(saved)
        marker.symlink_to(saved)
        with self.assertRaises(ValueError): check.check_files(self.out)

    def test_missing_file_fails_preflight(self):
        self.run_stage()
        (self.out / "storybook/index.html").unlink()
        with self.assertRaises(ValueError): check.check_files(self.out)

class LogoTests(unittest.TestCase):
    def test_static_svg_passes(self): stage.check_logo(LOGO)
    def test_script_rejected(self):
        with self.assertRaises(ValueError): stage.check_logo(b'<svg><script/></svg>')
    def test_external_href_rejected(self):
        with self.assertRaises(ValueError): stage.check_logo(b'<svg><image href="https://x.invalid/x"/></svg>')
    def test_doctype_rejected(self):
        with self.assertRaises(ValueError): stage.check_logo(b'<!DOCTYPE svg [<!ENTITY x "test">]><svg/>')
    def test_event_handler_rejected(self):
        with self.assertRaises(ValueError): stage.check_logo(b'<svg onload="alert(1)"/>')
    def test_external_css_url_rejected(self):
        with self.assertRaises(ValueError): stage.check_logo(b'<svg><path fill="url(https://example.invalid/x)"/></svg>')
    def test_css_fragment_reference_allowed(self): stage.check_logo(b'<svg><path fill="url(#local)"/></svg>')

class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.good = {"FORGEJO_DEMO_HOST":"forgejo-demo.demo.example.com", "STORYBOOK_HOST":"forgejo-ui.demo.example.com",
            "ACME_EMAIL":"admin@example.com", "FORGEJO_IMAGE":"codeberg.org/forgejo/forgejo@sha256:" + "a"*64,
            "CADDY_IMAGE":"docker.io/library/caddy@sha256:" + "b"*64}
    def test_digest_configuration_passes(self): check.validate(self.good)
    def test_production_host_refused(self):
        self.good["FORGEJO_DEMO_HOST"] = "git.hyperide.ai"
        with self.assertRaises(ValueError): check.validate(self.good)
    def test_placeholder_refused(self):
        self.good["STORYBOOK_HOST"] = "ui.example.invalid"
        with self.assertRaises(ValueError): check.validate(self.good)
    def test_floating_image_refused(self):
        self.good["FORGEJO_IMAGE"] = "codeberg.org/forgejo/forgejo:latest"
        with self.assertRaises(ValueError): check.validate(self.good)
    def test_caddy_directive_injection_refused(self):
        self.good["FORGEJO_DEMO_HOST"] = "example.com {\n file_server\n}"
        with self.assertRaises(ValueError): check.validate(self.good)
    def test_duplicate_host_refused(self):
        self.good["STORYBOOK_HOST"] = self.good["FORGEJO_DEMO_HOST"]
        with self.assertRaises(ValueError): check.validate(self.good)
    def test_ip_host_refused(self):
        self.good["STORYBOOK_HOST"] = "127.0.0.1"
        with self.assertRaises(ValueError): check.validate(self.good)

if __name__ == "__main__": unittest.main()
