#!/usr/bin/env python3
"""Synthetic fixtures through loopback API; no production URL or credentials."""
import json,secrets,subprocess,urllib.request,urllib.error,base64,time
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'.demo';creds=D/'users.json';base='http://127.0.0.1:3188/api/v1'
if creds.exists(): users=json.loads(creds.read_text())
else:
 users={name:secrets.token_urlsafe(24) for name in ['demo-author','demo-reviewer']}
 for name,password in users.items():
  result=subprocess.run(['docker','exec','forgejo-ui-demo-1605','su-exec','git','forgejo','--config','/data/gitea/conf/app.ini','admin','user','create','--username',name,'--email',name+'@example.invalid','--password',password,'--must-change-password=false'],capture_output=True,text=True)
  if result.returncode: raise SystemExit('Demo user creation failed; inspect private container logs')
 creds.write_text(json.dumps(users));creds.chmod(0o600)
def api(method,path,data=None,user='demo-author'):
 auth=base64.b64encode(f'{user}:{users[user]}'.encode()).decode()
 request=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'},method=method)
 try:
  with urllib.request.urlopen(request,timeout=20) as r: return json.loads(r.read() or 'null')
 except urllib.error.HTTPError as e:
  raise RuntimeError(f'{method} {path}: HTTP {e.code}') from None
repo='/repos/demo-author/keyboard-lab'
try: info=api('GET',repo)
except RuntimeError:
 info=api('POST','/user/repos',{'name':'keyboard-lab','description':'Synthetic Forgejo UI demo. Explore files, branches, issues, pull requests and keyboard navigation. No production data.','private':False,'auto_init':True,'default_branch':'main'})
api('PUT',repo+'/collaborators/demo-reviewer',{'permission':'write'})
manifest={'repository':'/demo-author/keyboard-lab','objects':[]}
files={'src/navigation.ts':'export type Tab = "code" | "issues" | "pulls";\n\nexport function route(tab: Tab): string {\n  return tab === "code" ? "/" : `/${tab}`;\n}\n\n'+''.join(f'export const item{i} = {{id: {i}, label: "Navigation item {i}"}};\n' for i in range(1,56)), 'CONTRIBUTING.md':'# Contributing\n\nKeep focus predictable. Preserve drafts on errors. Test permissions.\n','package.json':json.dumps({'name':'keyboard-lab','private':True,'version':'1.0.0'},indent=2)+'\n'}
for name,content in files.items():
 try: api('GET',repo+'/contents/'+name)
 except RuntimeError: api('POST',repo+'/contents/'+name,{'content':base64.b64encode(content.encode()).decode(),'message':'Add '+name,'branch':'main'})
branches=api('GET',repo+'/branches')
if not any(b['name']=='fix/keyboard-focus' for b in branches):
 api('POST',repo+'/branches',{'new_branch_name':'fix/keyboard-focus','old_branch_name':'main'})
 f=api('GET',repo+'/contents/src/navigation.ts?ref=fix%2Fkeyboard-focus')
 changed=files['src/navigation.ts'].replace('  return tab','  // Preserve repository context and native browser history.\n  return tab')
 api('PUT',repo+'/contents/src/navigation.ts',{'sha':f['sha'],'content':base64.b64encode(changed.encode()).decode(),'message':'Restore focus after changing repository context','branch':'fix/keyboard-focus'})
issues=api('GET',repo+'/issues?type=issues&state=all')
for title,body in [('Return focus after closing the branch selector','Acceptance: open with W, use arrow keys, close with Escape, focus returns to the trigger.'),('Keep comment drafts when the network fails','A failed request must preserve the draft and must not display a false success state.')]:
 existing=next((i for i in issues if i['title']==title),None)
 issue=existing or api('POST',repo+'/issues',{'title':title,'body':body})
 manifest['objects'].append({'kind':'issue','number':issue['number']})
prs=api('GET',repo+'/pulls?state=all')
pr=next((p for p in prs if p['head']['ref']=='fix/keyboard-focus'),None) or api('POST',repo+'/pulls',{'title':'Preserve keyboard focus and repository context','head':'fix/keyboard-focus','base':'main','body':'Synthetic pull request for evaluating conversation, commits, diff and review interactions.'})
manifest['objects'].append({'kind':'pull','number':pr['number']})
(D/'fixtures.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest,indent=2))
