#!/usr/bin/env python3
"""Install a user LaunchAgent for the dedicated demo only; Mac must stay online."""
import plistlib,subprocess,os
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'.demo';D.mkdir(exist_ok=True)
TUNNEL='7b43f9a9-6e9e-410b-a534-9e45d5973a1d'
config=D/'tunnel.yml'
config.write_text(f'tunnel: {TUNNEL}\ncredentials-file: {Path.home()}/.cloudflared/{TUNNEL}.json\ningress:\n  - hostname: forgejo-ui-demo.hyperide.ai\n    service: http://127.0.0.1:3188\n  - service: http_status:404\n')
config.chmod(0o600)
label='ai.hyperide.forgejo-ui-demo'
plist=Path.home()/'Library/LaunchAgents'/f'{label}.plist';plist.parent.mkdir(exist_ok=True)
if plist.exists(): raise SystemExit('LaunchAgent already installed; inspect rather than overwrite')
data={'Label':label,'ProgramArguments':['/opt/homebrew/bin/cloudflared','tunnel','--config',str(config),'run',TUNNEL],'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':30,'StandardOutPath':str(D/'tunnel.log'),'StandardErrorPath':str(D/'tunnel.log')}
plist.write_bytes(plistlib.dumps(data));plist.chmod(0o600)
subprocess.run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(plist)],check=True)
print('Dedicated demo tunnel supervised by LaunchAgent. This does not make the Mac an always-on server.')
