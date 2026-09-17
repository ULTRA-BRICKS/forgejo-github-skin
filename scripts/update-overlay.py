#!/usr/bin/env python3
"""Deployment hook: source preflight, then idempotent external overlay installation.
Invoke from the NORMAL deployment pipeline against a staged instance. This never
updates/downgrades Forgejo, restarts it, or claims to roll back database migrations.
"""
import argparse,subprocess,sys
from pathlib import Path
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source-checkout',required=True);p.add_argument('--version',required=True)
p.add_argument('--custom-path',required=True);p.add_argument('--app-ini',required=True)
p.add_argument('--apply',action='store_true')
a=p.parse_args()
subprocess.run([sys.executable,str(R/'scripts/check-compat.py'),'--source-checkout',a.source_checkout,'--version',a.version],check=True)
cmd=[sys.executable,str(R/'scripts/install.py'),'--forgejo-version',a.version,'--custom-path',a.custom_path,'--app-ini',a.app_ini]
if a.apply:cmd.append('--apply')
subprocess.run(cmd,check=True)
