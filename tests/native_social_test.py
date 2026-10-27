import builtins, contextlib, hashlib, importlib.util, io, json, os, shutil, stat, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "native_social", ROOT / "scripts/sharing/native-social.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SOURCE = '{{if .Title}}<meta property="og:title" content="{{.Title}}">{{end}}\n{{if .OpenGraphImageURL}}<meta property="og:image" content="{{.OpenGraphImageURL}}">{{else}}<meta property="og:image" content="native-logo">{{end}}\n<meta property="og:site_name" content="{{AppDisplayName}}">'


class NativeSocialTests(unittest.TestCase):
    def test_native_metadata_is_preserved_and_private_falls_back(self):
        result = module.generate(
            SOURCE, "https://links.example", hashlib.sha256(SOURCE.encode()).hexdigest()
        )
        self.assertEqual(result.count('property="og:title"'), 1)
        self.assertIn("and .Repository (not .Repository.IsPrivate)", result)
        self.assertIn("{{urlquery $previewURL}}", result)
        self.assertIn('content="native-logo"', result)
        self.assertIn('content="1440"', result)

    def test_rejects_changed_upstream_and_unsafe_origins(self):
        with self.assertRaises(ValueError):
            module.generate(SOURCE, "https://links.example", "0" * 64)
        for origin in [
            "http://localhost",
            "https://x/a",
            "https://x/?key=x",
            "https://x#frag",
            "https://u:p@x",
            "https://{{unsafe}}",
        ]:
            with self.assertRaises(ValueError):
                module.generate(
                    SOURCE, origin, hashlib.sha256(SOURCE.encode()).hexdigest()
                )


ORIGIN = "https://links.example"
AUDITED_PATH = "templates/base/head_opengraph.tmpl"
UNSAFE = "regular file inside --source-checkout"
MALFORMED = "audit is malformed"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class Probe:
    """Watches os.open, io.open and builtins.open.

    Records every open that lands on the identity (device, inode) of a file outside the checkout, and can run a hook
    just before or just after the first open whose path names a given component, to model a swap between validation
    and open. The component matches both a descriptor-relative open of that name and a full path containing it.
    """

    def __init__(self, outside=(), component=None, before=None, after=None):
        self.identities = {(s.st_dev, s.st_ino) for s in (Path(p).stat() for p in outside)}
        self.opened = []
        self.component, self.before, self.after = component, before, after
        self.fired = False

    def names_component(self, path):
        if self.component is None or self.fired or not isinstance(path, (str, bytes, os.PathLike)):
            return False
        return self.component in Path(os.fsdecode(path)).parts

    def note(self, handle):
        try:
            identity = os.fstat(handle if isinstance(handle, int) else handle.fileno())
        except (OSError, ValueError, io.UnsupportedOperation):
            return
        if (identity.st_dev, identity.st_ino) in self.identities:
            self.opened.append(identity.st_ino)

    def __enter__(self):
        # The fixed code opens through os.open(dir_fd=...), the old code through io.open; watching all three openers
        # catches a regression back to either route.
        probe = self

        def watching(real):
            def opener(path, *args, **kwargs):
                named = probe.names_component(path)
                if named:
                    probe.fired = True
                    if probe.before:
                        probe.before()
                handle = real(path, *args, **kwargs)
                if named and probe.after:
                    probe.after()
                probe.note(handle)
                return handle

            return opener

        self.restore = (os.open, io.open, builtins.open, os.supports_dir_fd)
        os.open, io.open, builtins.open = (watching(real) for real in self.restore[:3])
        os.supports_dir_fd = os.supports_dir_fd | {os.open}  # the wrapper stands in for os.open
        return self

    def __exit__(self, *exc):
        os.open, io.open, builtins.open, os.supports_dir_fd = self.restore


class NativeSocialCase(unittest.TestCase):
    """A private skin root, upstream checkout, outside file and custom path inside one temporary directory."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.root = base / "skin"
        (self.root / "scripts/sharing").mkdir(parents=True)
        (self.root / "research").mkdir()
        for name in ("scripts/sharing/native-social.py", "scripts/_compat.py"):
            shutil.copyfile(ROOT / name, self.root / name)
        self.checkout = base / "upstream"
        (self.checkout / "templates/base").mkdir(parents=True)
        self.source = self.checkout / AUDITED_PATH
        self.source.write_bytes(SOURCE.encode())
        self.outside_dir = base / "outside"
        self.outside_dir.mkdir()
        self.outside = self.outside_dir / "head_opengraph.tmpl"
        self.outside.write_bytes(SOURCE.encode())  # same bytes: only a followed link can get past the hash gate
        self.custom = base / "custom"
        self.custom.mkdir()
        self.target = self.custom / "templates/base/head_opengraph.tmpl"
        self.good_audit = {
            "version": "9.9.9",
            "commit": "0" * 40,
            "path": AUDITED_PATH,
            "sha256": sha256(SOURCE.encode()),
            "source": "test",
        }
        self.write_audit(self.good_audit)

    def write_audit(self, audit):
        (self.root / "research/native-social-audit.json").write_text(json.dumps(audit))

    def make_outside_tree(self):
        """An outside copy of templates/base/head_opengraph.tmpl; returns its root."""
        tree = Path(self.tmp.name) / "outside-tree"
        (tree / "templates/base").mkdir(parents=True)
        (tree / AUDITED_PATH).write_bytes(SOURCE.encode())
        return tree

    def argv(self, *extra, checkout=None):
        return [
            "--source-checkout",
            str(checkout or self.checkout),
            "--custom-path",
            str(self.custom),
            "--preview-origin",
            ORIGIN,
            *extra,
        ]

    def cli(self, *extra, checkout=None, env=None):
        try:
            return subprocess.run(
                [sys.executable, str(self.root / "scripts/sharing/native-social.py"), *self.argv(*extra, checkout=checkout)],
                capture_output=True,
                text=True,
                stdin=subprocess.DEVNULL,
                timeout=15,
                cwd=self.tmp.name,
                env=env,
            )
        except subprocess.TimeoutExpired:
            self.fail("native-social.py blocked instead of refusing the audited source")

    def in_process(self, *extra):
        original_root, original_argv = module.ROOT, sys.argv
        module.ROOT = self.root
        sys.argv = ["native-social.py", *self.argv(*extra)]
        out, error = io.StringIO(), None
        try:
            with contextlib.redirect_stdout(out):
                try:
                    module.main()
                except (OSError, ValueError, KeyError, TypeError) as caught:
                    error = caught
        finally:
            module.ROOT, sys.argv = original_root, original_argv
        return error, out.getvalue()

    def expected(self):
        return module.generate(SOURCE, ORIGIN, sha256(SOURCE.encode()))

    def assert_cli_refused(self, message, modes=((), ("--apply",))):
        for extra in modes:
            with self.subTest(extra=extra):
                run = self.cli(*extra)
                self.assertNotEqual(run.returncode, 0, run.stdout)
                self.assertEqual(run.stdout, "")
                self.assertIn(message, run.stderr)
                self.assertEqual(os.listdir(self.custom), [])

    def assert_refused(self, message, outside=()):
        """Dry run and --apply through the real CLI, then in-process with every open of an outside file recorded."""
        self.assert_cli_refused(message)
        with Probe(outside) as seen:
            error, out = self.in_process("--apply")
        self.assertIsInstance(error, ValueError)
        self.assertIn(message, str(error))
        self.assertEqual((out, seen.opened, os.listdir(self.custom)), ("", [], []))


class SourceLinkRefusalTests(NativeSocialCase):
    """The audited path must be a regular file reached without any link below --source-checkout."""

    def test_file_symlink_to_an_outside_file_is_refused_unread(self):
        self.source.unlink()
        self.source.symlink_to(self.outside)
        self.assert_refused(UNSAFE, [self.outside])

    def test_file_symlink_inside_the_checkout_is_refused_too(self):
        self.source.rename(self.source.with_name("real.tmpl"))
        self.source.symlink_to("real.tmpl")
        self.assert_refused(UNSAFE)

    def test_relative_symlink_climbing_out_of_the_checkout_is_refused_unread(self):
        self.source.unlink()
        self.source.symlink_to("../../../outside/head_opengraph.tmpl")
        self.assertEqual(self.source.resolve(), self.outside.resolve())
        self.assert_refused(UNSAFE, [self.outside])

    def test_parent_directory_symlink_is_refused_unread(self):
        tree = self.make_outside_tree()
        shutil.rmtree(self.checkout / "templates")
        (self.checkout / "templates").symlink_to(tree / "templates", target_is_directory=True)
        self.assert_refused(UNSAFE, [tree / AUDITED_PATH])

    def test_nested_parent_directory_symlink_is_refused_unread(self):
        tree = self.make_outside_tree()
        shutil.rmtree(self.checkout / "templates/base")
        (self.checkout / "templates/base").symlink_to(tree / "templates/base", target_is_directory=True)
        self.assert_refused(UNSAFE, [tree / AUDITED_PATH])

    def test_file_symlink_loop_is_refused(self):
        self.source.unlink()
        self.source.symlink_to("head_opengraph.tmpl")
        self.assert_refused(UNSAFE)

    def test_directory_symlink_loop_is_refused(self):
        shutil.rmtree(self.checkout / "templates/base")
        (self.checkout / "templates/base").symlink_to("base", target_is_directory=True)
        self.assert_refused(UNSAFE)

    def test_dangling_symlink_is_refused(self):
        self.source.unlink()
        self.source.symlink_to(Path(self.tmp.name) / "does-not-exist")
        self.assert_refused(UNSAFE)

    def test_directory_is_not_a_regular_file(self):
        self.write_audit({**self.good_audit, "path": "templates/base"})
        self.assert_refused(UNSAFE)

    def test_fifo_is_refused_without_blocking(self):
        self.source.unlink()
        os.mkfifo(self.source)
        self.assert_cli_refused(UNSAFE, modes=(("--apply",),))

    def test_symlink_to_an_outside_fifo_is_refused_without_blocking(self):
        pipe = Path(self.tmp.name) / "outside.pipe"
        os.mkfifo(pipe)
        self.source.unlink()
        self.source.symlink_to(pipe)
        self.assert_cli_refused(UNSAFE, modes=(("--apply",),))

    def test_audited_path_must_be_relative_and_stay_inside_the_checkout(self):
        for key in (
            str(self.outside),
            "../outside/head_opengraph.tmpl",
            "templates/../../outside/head_opengraph.tmpl",
            "/",
            ".",
            "",
        ):
            with self.subTest(key=key):
                self.write_audit({**self.good_audit, "path": key})
                self.assert_refused(UNSAFE, [self.outside])


class MalformedAuditTests(NativeSocialCase):
    def test_malformed_audit_is_refused_before_any_file_is_read(self):
        audits = [[], "abc", None, 7, {}]
        audits += [{k: v for k, v in self.good_audit.items() if k != name} for name in ("version", "path", "sha256")]
        audits += [
            {**self.good_audit, name: value}
            for name in ("version", "path", "sha256")
            for value in (None, 7, ["x"], {"a": 1})
        ]
        for audit in audits:
            with self.subTest(audit=audit):
                self.write_audit(audit)
                self.assert_refused(MALFORMED, [self.outside])

    def test_unparseable_audit_is_refused(self):
        (self.root / "research/native-social-audit.json").write_text("{not json")
        self.assert_cli_refused("JSONDecodeError")


class ReplacementBetweenValidationAndOpenTests(NativeSocialCase):
    """The file or a parent is swapped after the walk looked at it and before the walk opens it."""

    def assert_swap_refused(self, outside, **hook):
        with Probe(outside, **hook) as seen:
            error, out = self.in_process("--apply")
        self.assertTrue(seen.fired, "the replacement never ran")
        self.assertIsInstance(error, ValueError)
        self.assertIn(UNSAFE, str(error))
        self.assertEqual((out, seen.opened, os.listdir(self.custom)), ("", [], []))

    def test_file_replaced_by_a_symlink_is_refused_unread(self):
        def swap():
            self.source.unlink()
            self.source.symlink_to(self.outside)

        self.assert_swap_refused([self.outside], component="head_opengraph.tmpl", before=swap)

    def test_file_replaced_by_another_regular_file_is_refused(self):
        other = self.source.with_name("other.tmpl")
        other.write_bytes(SOURCE.encode())

        def swap():
            os.replace(other, self.source)

        self.assert_swap_refused([], component="head_opengraph.tmpl", before=swap)

    def test_parent_directory_replaced_by_a_symlink_is_refused_unread(self):
        tree = self.make_outside_tree()

        def swap():
            shutil.rmtree(self.checkout / "templates/base")
            (self.checkout / "templates/base").symlink_to(tree / "templates/base", target_is_directory=True)

        self.assert_swap_refused([tree / AUDITED_PATH], component="base", before=swap)

    def test_bytes_come_from_the_file_that_was_opened_and_validated(self):
        def replace_after_open():
            self.source.unlink()
            self.source.write_bytes(b"replaced after the audited file was opened")

        with Probe(component="head_opengraph.tmpl", after=replace_after_open) as seen:
            error, out = self.in_process("--apply")
        self.assertTrue(seen.fired, "the replacement never ran")
        self.assertIsNone(error)
        self.assertEqual(json.loads(out)["sha256"], sha256(self.expected().encode()))
        self.assertEqual(self.target.read_bytes(), self.expected().encode())


class GenerationTests(NativeSocialCase):
    """What a healthy checkout does must not change: plan, dry run, apply, removal, preserved administrator files."""

    def test_dry_run_plans_the_template_and_writes_nothing(self):
        run = self.cli()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(
            json.loads(run.stdout),
            {
                "testedForgejo": "9.9.9",
                "target": str(self.target),
                "sha256": sha256(self.expected().encode()),
                "action": "create",
                "applied": False,
            },
        )
        self.assertEqual(os.listdir(self.custom), [])

    def test_apply_writes_the_exact_template_then_reports_it_unchanged(self):
        run = self.cli("--apply")
        self.assertEqual(run.returncode, 0, run.stderr)
        plan = json.loads(run.stdout)
        self.assertEqual((plan["action"], plan["applied"]), ("create", True))
        self.assertEqual(self.target.read_bytes(), self.expected().encode())
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o644)
        self.assertEqual(os.listdir(self.target.parent), ["head_opengraph.tmpl"])
        again = self.cli("--apply")
        self.assertEqual(again.returncode, 0, again.stderr)
        self.assertEqual(json.loads(again.stdout)["action"], "unchanged")

    def test_remove_deletes_only_with_apply(self):
        self.cli("--apply")
        dry = json.loads(self.cli("--remove").stdout)
        self.assertEqual((dry["action"], dry["applied"], self.target.exists()), ("remove", False, True))
        done = json.loads(self.cli("--remove", "--apply").stdout)
        self.assertEqual((done["action"], done["applied"], self.target.exists()), ("remove", True, False))

    def test_a_different_administrator_template_is_preserved(self):
        self.target.parent.mkdir(parents=True)
        self.target.write_text("{{/* administrator */}}\n")
        for extra in ([], ["--apply"], ["--remove", "--apply"]):
            with self.subTest(extra=extra):
                run = self.cli(*extra)
                self.assertNotEqual(run.returncode, 0)
                self.assertEqual(run.stdout, "")
                self.assertIn("preserve administrator changes", run.stderr)
                self.assertEqual(self.target.read_text(), "{{/* administrator */}}\n")

    def test_a_symlinked_target_template_is_rejected_unwritten(self):
        kept = self.outside_dir / "kept.tmpl"
        kept.write_text("kept")
        self.target.parent.mkdir(parents=True)
        self.target.symlink_to(kept)
        run = self.cli("--apply")
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("Template symlink rejected", run.stderr)
        self.assertEqual(kept.read_text(), "kept")

    def test_source_checkout_path_itself_may_be_a_symlink(self):
        link = Path(self.tmp.name) / "upstream-link"
        link.symlink_to(self.checkout, target_is_directory=True)
        run = self.cli("--apply", checkout=link)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(self.target.read_bytes(), self.expected().encode())

    def test_non_ascii_source_is_read_and_written_as_utf_8_whatever_the_locale(self):
        text = SOURCE + "\n<!-- ünï -->"
        written = module.generate(text, ORIGIN, sha256(text.encode("utf-8"))).encode("utf-8")
        self.source.write_bytes(text.encode("utf-8"))
        self.write_audit({**self.good_audit, "sha256": sha256(text.encode("utf-8"))})
        ascii_locale = {**os.environ, "LC_ALL": "C", "PYTHONCOERCECLOCALE": "0", "PYTHONUTF8": "0"}
        for env in (None, ascii_locale):  # the second makes every default text encoding ASCII
            with self.subTest(ascii_locale=env is not None):
                run = self.cli("--apply", env=env)
                self.assertEqual(run.returncode, 0, run.stderr)
                self.assertEqual(self.target.read_bytes(), written)
                self.assertEqual(json.loads(run.stdout)["sha256"], sha256(written))
                again = self.cli("--apply", env=env)
                self.assertEqual(again.returncode, 0, again.stderr)
                self.assertEqual(json.loads(again.stdout)["action"], "unchanged")
                self.target.unlink()

    def test_source_is_hashed_as_bytes_not_as_newline_translated_text(self):
        self.source.write_bytes(SOURCE.replace("\n", "\r\n").encode())
        self.assert_cli_refused("Upstream Open Graph partial changed")

    def test_source_that_is_not_utf_8_is_refused(self):
        broken = SOURCE.encode() + b"\xff"
        self.source.write_bytes(broken)
        self.write_audit({**self.good_audit, "sha256": sha256(broken)})
        self.assert_cli_refused("is not valid UTF-8")

    def test_a_missing_source_is_refused_naming_the_checkout(self):
        self.source.unlink()
        self.assert_cli_refused("is missing from --source-checkout")
        self.assertIn(str(self.checkout), self.cli().stderr)

    def test_a_missing_checkout_directory_is_refused_naming_it(self):
        missing = Path(self.tmp.name) / "no-such-checkout"
        for extra in ([], ["--apply"]):
            with self.subTest(extra=extra):
                run = self.cli(*extra, checkout=missing)
                self.assertNotEqual(run.returncode, 0)
                self.assertEqual(run.stdout, "")
                self.assertIn("is missing from --source-checkout", run.stderr)
                self.assertIn(str(missing), run.stderr)
                self.assertEqual(os.listdir(self.custom), [])


if __name__ == "__main__":
    unittest.main()
