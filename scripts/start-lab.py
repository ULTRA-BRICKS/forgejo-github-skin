#!/usr/bin/env python3
"""Start an isolated, loopback-only Forgejo instance; no production access."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parent.parent
lab=root/'.lab'; lab.mkdir(exist_ok=True)
(lab/'data').mkdir(exist_ok=True)
cmd=['docker','run','--name','forgejo-github-skin-lab','-d','--cpus','2','--memory','768m','-p','127.0.0.1:3187:3000','-v',f'{lab}/data:/data']
for k,v in {'FORGEJO__security__INSTALL_LOCK':'true','FORGEJO__database__DB_TYPE':'sqlite3','FORGEJO__service__DISABLE_REGISTRATION':'true','FORGEJO__server__ROOT_URL':'http://127.0.0.1:3187/','FORGEJO__server__DOMAIN':'127.0.0.1','FORGEJO__server__DISABLE_SSH':'true','FORGEJO__actions__ENABLED':'false'}.items():
    cmd+=['-e',f'{k}={v}']
cmd+=['codeberg.org/forgejo/forgejo:16.0.3']
subprocess.run(cmd,check=True)
