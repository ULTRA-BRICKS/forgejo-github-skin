import contextlib, hashlib, importlib.util, io, json, pathlib, re, sys, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
 module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
installer=load('installer','install.py')
check_compat=load('check_compat','check-compat.py')
compat=load('compat','_compat.py')
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
  for version in ('99.0.0','16.0.6.1'):
   with self.subTest(version=version), self.assertRaises(ValueError): installer.check_version(version,MANIFEST)
 def test_gate_accepts_every_tested_version_against_its_own_audit(self):
  for version in MANIFEST['testedForgejo']:
   for requested in (version,f'v{version}+gitea-1.22.0'):
    with self.subTest(requested=requested):
     tested=compat.require_tested_version(requested,MANIFEST)
     audit=json.loads((ROOT/MANIFEST['sourceAudits'][tested]).read_text())
     self.assertEqual(compat.audit_fingerprints(audit,tested),audit['sha256'])
 def test_gate_rejects_an_audit_borrowed_from_another_tested_version(self):
  for version in MANIFEST['testedForgejo']:
   for other in MANIFEST['testedForgejo']:
    if other==version: continue
    audit=json.loads((ROOT/MANIFEST['sourceAudits'][other]).read_text())
    with self.subTest(version=version,audit_of=other), self.assertRaisesRegex(ValueError,re.escape(f'audit is for version {other}, not {version}')):
     compat.audit_fingerprints(audit,version)

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
 def test_audit_with_path_escaping_fingerprint_key_rejected(self):
  outside=pathlib.Path(self.tmp.name)/'outside.tmpl'; outside.write_bytes(b'outside')
  for key in ('',str(outside),'/etc/hostname','../outside.tmpl','templates/../../outside.tmpl','templates/..','..','..\\outside.tmpl','templates\\..\\..\\outside.tmpl','C:\\Windows\\win.ini','C:outside.tmpl','\\outside.tmpl'):
   with self.subTest(key=key):
    self.write_audit({'version':'9.9.9','sha256':{**{name:sha(data) for name,data in CONTRACT_FILES.items()},key:sha(b'outside')}})
    code,out,err=self.run_check(); self.assertEqual(code,2); self.assertNotIn('PASS',out); self.assertIn('outside the source checkout',err)
 def test_audit_keys_that_merely_contain_dots_are_accepted(self):
  for key in ('templates/a..b.tmpl','templates/.hidden.tmpl','templates/.../x.tmpl'):
   with self.subTest(key=key): self.assertEqual(compat.audit_fingerprints({'version':'9.9.9','sha256':{key:sha(b'x')}},'9.9.9'),{key:sha(b'x')})
 def test_real_cli_exits_2_without_pass_on_escaping_key(self):
  import subprocess
  outside=pathlib.Path(self.tmp.name)/'outside.tmpl'; outside.write_bytes(b'outside')
  (self.root/'scripts').mkdir(); (self.root/'scripts/check-compat.py').write_bytes((ROOT/'scripts/check-compat.py').read_bytes()); (self.root/'scripts/_compat.py').write_bytes((ROOT/'scripts/_compat.py').read_bytes())
  for key in ('',str(outside),'../outside.tmpl'):
   with self.subTest(key=key):
    self.write_audit({'version':'9.9.9','sha256':{**{name:sha(data) for name,data in CONTRACT_FILES.items()},key:sha(b'outside')}})
    run=subprocess.run([sys.executable,str(self.root/'scripts/check-compat.py'),'--source-checkout',str(self.checkout),'--version','9.9.9'],capture_output=True,text=True,stdin=subprocess.DEVNULL)
    self.assertEqual(run.returncode,2); self.assertNotIn('PASS',run.stdout); self.assertIn('outside the source checkout',run.stderr)
 def test_unparseable_audit_rejected(self):
  (self.root/'research/a.json').write_text('{not json')
  code,_,_=self.run_check(); self.assertEqual(code,2)
 def test_audit_that_is_not_an_object_rejected(self):
  for bad in ([],'abc',None):
   with self.subTest(audit=bad):
    self.write_audit(bad); code,out,err=self.run_check(); self.assertEqual(code,2); self.assertNotIn('PASS',out); self.assertIn('audit is not a JSON object',err)
 def test_audit_with_empty_fingerprint_map_rejected(self):
  self.write_audit({'version':'9.9.9','sha256':{}})
  code,out,err=self.run_check(); self.assertEqual(code,2); self.assertNotIn('PASS',out); self.assertIn('no source fingerprints',err)
 def test_audit_with_non_map_fingerprints_rejected(self):
  for bad in (None,[],['templates/base/head.tmpl'],'abc',7):
   with self.subTest(sha256=bad):
    self.write_audit({'version':'9.9.9','sha256':bad})
    code,out,err=self.run_check(); self.assertEqual(code,2); self.assertNotIn('PASS',out); self.assertIn('no source fingerprints',err)
 def test_audit_for_another_version_rejected(self):
  self.write_audit({'version':'9.9.8','sha256':{name:sha(data) for name,data in CONTRACT_FILES.items()}})
  code,out,err=self.run_check(); self.assertEqual(code,2); self.assertNotIn('PASS',out); self.assertIn('audit is for version 9.9.8, not 9.9.9',err)
 def test_audit_without_version_rejected(self):
  self.write_audit({'sha256':{name:sha(data) for name,data in CONTRACT_FILES.items()}})
  code,out,err=self.run_check(); self.assertEqual(code,2); self.assertNotIn('PASS',out); self.assertIn('audit is for version',err)
 def test_build_metadata_and_v_prefix_select_the_same_audit(self):
  for version in ('9.9.9+gitea-1.22.0','v9.9.9'):
   with self.subTest(version=version):
    code,out,_=self.run_check(version); self.assertEqual(code,0); self.assertIn('2 source fingerprints',out)

if __name__=='__main__': unittest.main()
