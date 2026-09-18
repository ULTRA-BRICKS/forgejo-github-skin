import hashlib, importlib.util, unittest
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
