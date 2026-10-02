import http.server,sys,threading,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from access import AccessChecker

class ForgejoFixture(http.server.BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def do_GET(self):
  cookie=self.headers.get('Cookie','')
  if cookie=='session=alice' and self.path in {'/owner/allowed','/owner/second'}:self.send_response(200)
  else:self.send_response(302);self.send_header('Location','/user/login')
  self.end_headers();self.wfile.write(b'<main class="repository page-content">repo</main>' if self.path in {'/owner/allowed','/owner/second'} and self.headers.get('Cookie')=='session=alice' else b'<main>Sign in</main>')

class AccessTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),ForgejoFixture);cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.thread.join();cls.server.server_close()
 def checker(self):return AccessChecker('127.0.0.1',self.server.server_port,'git.example.test',ttl=30)
 def test_permissions_are_viewer_bound(self):
  c=self.checker();self.assertTrue(c.can_read('session=alice','owner/allowed'));self.assertFalse(c.can_read('session=bob','owner/allowed'));self.assertFalse(c.can_read('','owner/allowed'));self.assertFalse(c.can_read('session=alice','../../etc/passwd'))
  self.assertNotIn('session=alice',' '.join(c.cache.keys()))
 def test_global_results_are_filtered_by_current_viewer(self):
  c=self.checker();items=[{'repo':'owner/allowed','title':'A'},{'repo':'owner/denied','title':'D'},{'repo':'owner/second','title':'S'}]
  self.assertEqual([x['title'] for x in c.filter('session=alice',items,10)],['A','S']);self.assertEqual(c.filter('session=bob',items,10),[])

if __name__=='__main__':unittest.main()
