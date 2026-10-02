import os, subprocess, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from index import SearchIndex
from query import SearchQuery, classify, validate

class SearchIndexTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();root=Path(self.tmp.name);source=root/'source';source.mkdir()
        subprocess.run(['git','init','-q',str(source)],check=True);subprocess.run(['git','-C',str(source),'config','user.email','qa@example.test'],check=True);subprocess.run(['git','-C',str(source),'config','user.name','QA'],check=True)
        (source/'src').mkdir();(source/'src'/'focus.js').write_text('export function restoreFocus(trigger) {\n  if (!trigger?.isConnected) return;\n  trigger.focus({ preventScroll: true });\n}\n')
        (source/'src'/'math.ts').write_text('export const add = (left: number, right: number) => left + right;\n')
        (source/'README.md').write_text('# Demo repository\n');(source/'dist').mkdir();(source/'dist'/'focus.js').write_text('export function restoreFocus(trigger) { return false; }\n')
        subprocess.run(['git','-C',str(source),'add','.'],check=True);subprocess.run(['git','-C',str(source),'commit','-qm','fixture'],check=True)
        repos=root/'repos'/'owner';repos.mkdir(parents=True);subprocess.run(['git','clone','-q','--bare',str(source),str(repos/'demo.git')],check=True)
        self.index=SearchIndex(str(root/'index.sqlite3'),str(root/'repos'));self.index.refresh()
    def tearDown(self):self.tmp.cleanup()
    def q(self,text,mode='smart'):
        return SearchQuery(text=text,mode=mode,scope='repo',repo='owner/demo',limit=20)
    def test_symbol_and_file_modes(self):
        symbols=self.index.search(self.q('restoreFocus','symbol'));self.assertTrue(any(x['kind']=='symbol' and x['title']=='restoreFocus' for x in symbols))
        files=self.index.search(self.q('math.ts','file'));self.assertEqual(files[0]['path'],'src/math.ts')
    def test_structural_query_ignores_punctuation_spacing(self):
        results=self.index.search(self.q('function restoreFocus ( trigger ) {','ast'))
        self.assertTrue(any(x['path']=='src/focus.js' for x in results),results)
    def test_definition_and_reference_intents_split_symbol_definition_from_usages(self):
        definition=SearchQuery(text='restoreFocus',mode='symbol',scope='repo',repo='owner/demo',intent='definition',limit=20)
        refs=SearchQuery(text='restoreFocus',mode='symbol',scope='repo',repo='owner/demo',intent='references',limit=20)
        self.assertTrue(any(x['kind']=='symbol' and x['line']==1 for x in self.index.search(definition)))
        self.assertFalse(any(x['kind']=='symbol' for x in self.index.search(refs)))
        self.assertFalse(any(x.get('line')==1 and x['path']=='src/focus.js' for x in self.index.search(refs)))

    def test_scope_and_stats(self):
        stats=self.index.stats();self.assertEqual(stats['repos'],1);self.assertEqual(stats['files'],3)
        self.assertEqual(validate({'q':'add','scope':'repo','repo':'owner/demo'}).mode,'symbol')
        self.assertEqual(classify('if(foo){return bar;}'),'ast')

if __name__=='__main__':unittest.main()
