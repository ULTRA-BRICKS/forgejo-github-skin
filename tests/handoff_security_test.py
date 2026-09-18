import importlib.util
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('handoff_stage', ROOT/'ops/handoff/scripts/stage_demo.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class LogoBoundaryTests(unittest.TestCase):
 def test_rejects_stylesheet_processing_instruction(self):
  for href in ['data:text/xsl,payload','https://example.invalid/style.xsl']:
   with self.assertRaises(ValueError):
    module.check_logo(f'<?xml-stylesheet type="text/xsl" href="{href}"?><svg xmlns="http://www.w3.org/2000/svg"/>'.encode())
 def test_rejects_alternate_encoding(self):
  with self.assertRaises(ValueError):
   module.check_logo('<?xml-stylesheet href="x"?><svg/>'.encode('utf-16'))
 def test_accepts_reviewed_graphite_geometry(self):
  module.check_logo((ROOT/'assets/forgejo-graphite.svg').read_bytes())
