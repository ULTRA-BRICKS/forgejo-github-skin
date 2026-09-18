#!/usr/bin/env python3
"""Start a separate synthetic Forgejo demo, never the production instance."""
import json,subprocess,sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]; D=R/'.demo';D.mkdir(exist_ok=True)
IMAGE='codeberg.org/forgejo/forgejo@sha256:cf5f5ae6acf2ababca0ee3d255705b83a47f35b25e07fc931d694d60664053fe'
NAME='forgejo-ui-demo-1605'
(D/'data').mkdir(exist_ok=True)
if subprocess.run(['docker','inspect',NAME],capture_output=True).returncode==0:
 subprocess.run(['docker','start',NAME],check=True);raise SystemExit(0)
values={'FORGEJO__security__INSTALL_LOCK':'true','FORGEJO__database__DB_TYPE':'sqlite3','FORGEJO__service__DISABLE_REGISTRATION':'true','FORGEJO__service__REQUIRE_SIGNIN_VIEW':'false','FORGEJO__server__ROOT_URL':'https://forgejo-ui-demo.hyperide.ai/','FORGEJO__server__DOMAIN':'forgejo-ui-demo.hyperide.ai','FORGEJO__server__DISABLE_SSH':'true','FORGEJO__actions__ENABLED':'false','FORGEJO__mailer__ENABLED':'false','FORGEJO__repository__DEFAULT_PRIVATE':'public','FORGEJO__ui__THEMES':'forgejo-auto,forgejo-light,forgejo-dark,hypergithub-auto,hypergithub-light,hypergithub-dark','FORGEJO__ui__DEFAULT_THEME':'hypergithub-auto','FORGEJO_CUSTOM':'/data/gitea'}
cmd=['docker','run','--name',NAME,'-d','--cpus','2','--memory','768m','-p','127.0.0.1:3188:3000','-v',f'{D}/data:/data']
for k,v in values.items():cmd+=['-e',f'{k}={v}']
subprocess.run(cmd+[IMAGE],check=True)
print('Started dedicated synthetic demo; no production mounts or accounts.')
