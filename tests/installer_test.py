import importlib.util, pathlib, sys, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('installer',ROOT/'scripts/install.py')
installer=importlib.util.module_from_spec(spec); spec.loader.exec_module(installer)
class InstallerTests(unittest.TestCase):
 def test_preserve_ini(self):
  old='; custom config\n[ui]\nTHEMES = forgejo-light,my-theme\nDEFAULT_THEME = my-theme\n[server]\nROOT_URL = https://example.test/git/\n'
  new=installer.configure_ini(old,False)
  self.assertIn('forgejo-light,my-theme,hypergithub-light',new)
  self.assertIn('DEFAULT_THEME = my-theme',new)
  self.assertEqual(installer.configure_ini(new,False),new)
 def test_empty_themes_preserve_native_choices(self):
  new=installer.configure_ini('[ui]\nTHEMES = \n',False)
  self.assertIn('forgejo-auto',new); self.assertIn('hypergithub-auto',new)
 def test_inline_comment_delimiter_preserved(self):
  new=installer.configure_ini('[ui]\nTHEMES = forgejo-light  # keep this\n',False)
  self.assertIn('# keep this',new); self.assertNotIn('; keep this',new)
 def test_crlf_preserved(self):
  old='[ui]\r\nTHEMES = forgejo-light\r\n[server]\r\nROOT_URL = https://example.test/\r\n'
  new=installer.configure_ini(old,False)
  self.assertNotIn('\n',new.replace('\r\n',''))
  self.assertIn('THEMES = forgejo-light,hypergithub-light',new)
 def test_default_is_opt_in(self):
  self.assertIn('DEFAULT_THEME = hypergithub-auto',installer.configure_ini('[ui]\nDEFAULT_THEME = forgejo-auto\n',True))
 def test_duplicate_ui_rejected(self):
  with self.assertRaises(ValueError): installer.configure_ini('[ui]\nTHEMES=a\n[ui]\nTHEMES=b\n',False)
 def test_markers_preserve_other_customizations(self):
  old='<script src="existing.js"></script>\n'
  new=installer.merge_hook(old,'<script src="skin.js"></script>')
  self.assertTrue(new.startswith(old));self.assertEqual(new,installer.merge_hook(new,'<script src="skin.js"></script>'))
 def test_broken_marker_rejected(self):
  with self.assertRaises(ValueError): installer.merge_hook('<!-- hypergithub:start -->','hello')
 def test_unknown_version_rejected(self):
  with self.assertRaises(ValueError): installer.check_version('99.0.0',{'testedForgejo':['16.0.3']})
 def test_version_build_metadata(self):
  installer.check_version('16.0.3+gitea-1.22.0',{'testedForgejo':['16.0.3']})
 def test_atomic_write(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'settings';installer.atomic_write(p,b'hello',0o600)
   self.assertEqual(p.read_bytes(),b'hello');self.assertEqual(p.stat().st_mode&0o777,0o600)
 def test_apply_rechecks_symlink_parent(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d); real=root/'real'; real.mkdir(); link=root/'link'; link.symlink_to(real,target_is_directory=True)
   with self.assertRaises(ValueError): installer.apply_plan([(link/'asset.css',b'x',0o644)])
   self.assertFalse((real/'asset.css').exists())
 def test_compat_helper_is_shared(self):
  self.assertEqual(installer.check_version('v16.0.3+build',{'testedForgejo':['16.0.3']}),'16.0.3')
 def test_asset_set_accepts_current_and_previous_known_release(self):
  version='0.2.0'
  themes={pathlib.Path(f'css/theme-hypergithub-{mode}.css') for mode in ('auto','light','dark')}
  current={pathlib.Path(f'hypergithub/{version}/{name}') for name in installer.ASSET_NAMES}
  previous={pathlib.Path('hypergithub/0.1.9/skin.css'),pathlib.Path('hypergithub/0.1.9/skin.mjs')}
  installer.validate_asset_set(themes|current|previous,version)
 def test_asset_set_rejects_unknown_versioned_file(self):
  version='0.2.0'
  themes={pathlib.Path(f'css/theme-hypergithub-{mode}.css') for mode in ('auto','light','dark')}
  current={pathlib.Path(f'hypergithub/{version}/{name}') for name in installer.ASSET_NAMES}
  with self.assertRaises(ValueError):
   installer.validate_asset_set(themes|current|{pathlib.Path('hypergithub/0.1.9/evil.js')},version)
 def test_current_dist_plan_accepts_n_minus_one_and_universal_search(self):
  with tempfile.TemporaryDirectory(dir=ROOT) as d:
   root=pathlib.Path(d); custom=root/'custom'; custom.mkdir(); ini=root/'app.ini'; ini.write_text('[ui]\nTHEMES = forgejo-auto\n')
   planned=installer.plan(custom,ini,False)
   names={str(path.relative_to(custom)) for path,_,_ in planned if path.is_relative_to(custom)}
   self.assertIn('public/assets/hypergithub/0.2.0/universal-search.mjs',names)
   self.assertIn('public/assets/hypergithub/0.1.9/skin.css',names)
if __name__=='__main__':unittest.main()
