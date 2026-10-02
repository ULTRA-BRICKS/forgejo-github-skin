import http.client,http.server,json,os,socket,subprocess,sys,tempfile,threading,time,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ForgejoFixture(http.server.BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def do_GET(self):
  if self.headers.get('Cookie')=='session=alice' and self.path=='/owner/demo':
   self.send_response(200);self.end_headers();self.wfile.write(b'<main class="repository page-content">repo</main>')
  else:self.send_response(302);self.send_header('Location','/user/login');self.end_headers()
def free_port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
class ServiceTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();root=Path(self.tmp.name);src=root/'src';src.mkdir();subprocess.run(['git','init','-q',str(src)],check=True);subprocess.run(['git','-C',str(src),'config','user.email','qa@example.test'],check=True);subprocess.run(['git','-C',str(src),'config','user.name','QA'],check=True)
  (src/'focus.js').write_text('export function restoreFocus(trigger) { return trigger; }\n');subprocess.run(['git','-C',str(src),'add','.'],check=True);subprocess.run(['git','-C',str(src),'commit','-qm','fixture'],check=True);(root/'repos'/'owner').mkdir(parents=True);subprocess.run(['git','clone','-q','--bare',str(src),str(root/'repos'/'owner'/'demo.git')],check=True)
  self.forge=http.server.ThreadingHTTPServer(('127.0.0.1',0),ForgejoFixture);self.thread=threading.Thread(target=self.forge.serve_forever,daemon=True);self.thread.start();self.port=free_port()
  env={**os.environ,'HYPERSEARCH_PORT':str(self.port),'HYPERSEARCH_REPO_ROOT':str(root/'repos'),'HYPERSEARCH_STATE':str(root/'state'/'index.sqlite3'),'HYPERSEARCH_FORGEJO_PORT':str(self.forge.server_port),'HYPERSEARCH_ORIGIN':'https://git.example.test','PYTHONDONTWRITEBYTECODE':'1'}
  self.proc=subprocess.Popen([sys.executable,str(ROOT/'service.py')],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
  for _ in range(80):
   try:
    status,_=self.request('/health');
    if status==200:break
   except OSError:time.sleep(.05)
  else:self.fail('search service did not start')
 def tearDown(self):
  self.proc.terminate();self.proc.wait(timeout=5);self.proc.stdout.close() if self.proc.stdout else None;self.forge.shutdown();self.thread.join();self.forge.server_close();self.tmp.cleanup()
 def request(self,path,cookie=None):
  conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5);headers={'Cookie':cookie} if cookie else {};conn.request('GET',path,headers=headers);response=conn.getresponse();body=response.read();conn.close();return response.status,json.loads(body)
 def test_http_boundary_is_authenticated_and_permission_filtered(self):
  status,_=self.request('/__hypersearch/query?q=restoreFocus&scope=repo&repo=owner/demo&mode=symbol');self.assertEqual(status,401)
  status,_=self.request('/__hypersearch/query?q=restoreFocus&scope=repo&repo=owner/demo&mode=symbol','session=bob');self.assertEqual(status,403)
  status,data=self.request('/__hypersearch/query?q=restoreFocus&scope=repo&repo=owner/demo&mode=symbol','session=alice');self.assertEqual(status,200);self.assertEqual(data['results'][0]['title'],'restoreFocus');self.assertTrue(data['results'][0]['url'].startswith('https://git.example.test/owner/demo/src/commit/'))
  status,_=self.request('/__hypersearch/health');self.assertEqual(status,401)
  status,data=self.request('/__hypersearch/health','session=alice');self.assertEqual(status,200);self.assertEqual(set(data),{'service','ready'})
if __name__=='__main__':unittest.main()
