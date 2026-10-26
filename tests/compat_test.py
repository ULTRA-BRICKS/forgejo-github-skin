import contextlib, hashlib, importlib.util, io, json, pathlib, re, sys, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
 module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
installer=load('installer','install.py')
check_compat=load('check_compat','check-compat.py')
MANIFEST=json.loads((ROOT/'skin.manifest.json').read_text())
CONTRACT_FILES={'templates/base/head.tmpl':b'head','templates/repo/home.tmpl':b'home'}

def sha(data): return hashlib.sha256(data).hexdigest()

class RepoMetadataTests(unittest.TestCase):
 def test_every_tested_version_has_a_matching_exact_source_audit(self):
  for version in MANIFEST['testedForgejo']:
   audit=json.loads((ROOT/MANIFEST['sourceAudits'][version]).read_text())
   self.assertEqual(audit['version'],version)
   self.assertRegex(audit['commit'],r'^[0-9a-f]{40}$')
   self.assertTrue(audit['sha256'])
   for name,digest in audit['sha256'].items(): self.assertRegex(digest,r'^[0-9a-f]{64}$',name)
 def test_forgejo_16_0_6_is_audited_and_accepted_by_installer_gate(self):
  self.assertEqual(MANIFEST['sourceAudits']['16.0.6'],'research/source-audit-16.0.6.json')
  self.assertEqual(installer.check_version('16.0.6',MANIFEST),'16.0.6')
 def test_installer_accepts_every_tested_version_with_build_metadata(self):
  for version in MANIFEST['testedForgejo']: self.assertEqual(installer.check_version(f'{version}+gitea-1.22.0',MANIFEST),version)
 def test_audit_tag_names_the_audited_version(self):
  for version in MANIFEST['testedForgejo']:
   audit=json.loads((ROOT/MANIFEST['sourceAudits'][version]).read_text())
   if 'tag' in audit: self.assertEqual(audit['tag'],f'v{version}')
 def test_newer_audit_never_drops_a_previously_fingerprinted_contract(self):
  order=sorted(MANIFEST['testedForgejo'],key=lambda v:tuple(map(int,v.split('.'))))
  files=[set(json.loads((ROOT/MANIFEST['sourceAudits'][v]).read_text())['sha256']) for v in order]
  for older,newer,version in zip(files,files[1:],order[1:]): self.assertLessEqual(older,newer,version)
 def test_unaudited_version_still_rejected(self):
  with self.assertRaises(ValueError): installer.check_version('99.0.0',MANIFEST)

class CheckCompatTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
  self.root=pathlib.Path(self.tmp.name)/'skin'; (self.root/'research').mkdir(parents=True)
  self.checkout=pathlib.Path(self.tmp.name)/'upstream'
  for name,data in CONTRACT_FILES.items():
   (self.checkout/name).parent.mkdir(parents=True,exist_ok=True); (self.checkout/name).write_bytes(data)
  self.write_audit({'version':'9.9.9','sha256':{name:sha(data) for name,data in CONTRACT_FILES.items()}})
  (self.root/'skin.manifest.json').write_text(json.dumps({'testedForgejo':['9.9.9'],'sourceAudits':{'9.9.9':'research/a.json'}}))
 def write_audit(self,audit): (self.root/'research/a.json').write_text(json.dumps(audit))
 def run_check(self,version='9.9.9'):
  original=check_compat.ROOT; check_compat.ROOT=self.root
  argv=sys.argv; sys.argv=['check-compat.py','--source-checkout',str(self.checkout),'--version',version]
  out,err=io.StringIO(),io.StringIO()
  try:
   with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
    try: code=check_compat.main()
    except SystemExit as exit: code=exit.code
  finally: check_compat.ROOT=original; sys.argv=argv
  return code,out.getvalue(),err.getvalue()
 def test_matching_source_passes(self):
  code,out,_=self.run_check(); self.assertEqual(code,0); self.assertIn('2 source fingerprints',out)
 def test_changed_template_rejected(self):
  (self.checkout/'templates/repo/home.tmpl').write_bytes(b'changed')
  code,_,err=self.run_check(); self.assertEqual(code,2); self.assertIn('changed: templates/repo/home.tmpl',err)
 def test_missing_template_rejected(self):
  (self.checkout/'templates/base/head.tmpl').unlink()
  code,_,err=self.run_check(); self.assertEqual(code,2); self.assertIn('missing: templates/base/head.tmpl',err)
 def test_unknown_version_rejected(self):
  code,_,err=self.run_check('9.9.8'); self.assertEqual(code,2); self.assertIn('no approved compatibility entry',err)
 def test_audit_without_fingerprints_field_rejected(self):
  self.write_audit({'version':'9.9.9'})
  code,_,_=self.run_check(); self.assertEqual(code,2)
 def test_unparseable_audit_rejected(self):
  (self.root/'research/a.json').write_text('{not json')
  code,_,_=self.run_check(); self.assertEqual(code,2)

if __name__=='__main__': unittest.main()
