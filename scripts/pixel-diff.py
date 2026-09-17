#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance
import json, numpy as np
R = Path(__file__).resolve().parents[1]
base = R / 'research/screenshots'
pairs = [
 ('repository-desktop', base/'github/desktop/repository.png', base/'storybook/repository-desktop.png'),
 ('repository-mobile', base/'github/mobile/repository.png', base/'storybook/repository-mobile.png'),
 ('file-desktop', base/'github/desktop/file.png', base/'storybook/file.png'),
 ('blame-desktop', base/'github/desktop/blame.png', base/'storybook/blame.png'),
 ('issues-desktop', base/'github/desktop/issues.png', base/'storybook/issues.png'),
 ('pulls-desktop', base/'github/desktop/pulls.png', base/'storybook/pull-requests.png'),
 ('commits-desktop', base/'github/desktop/commits.png', base/'storybook/commits.png'),
]
out=[]; dest=R/'research/pixel-diff'; dest.mkdir(parents=True,exist_ok=True)
for name,a,b in pairs:
 A=Image.open(a).convert('RGB'); B=Image.open(b).convert('RGB')
 if A.size != B.size: raise SystemExit(f'{name}: size mismatch {A.size} != {B.size}')
 x=np.asarray(A,dtype=np.int16); y=np.asarray(B,dtype=np.int16); delta=np.abs(x-y); per=delta.mean(2)
 item={'name':name,'size':A.size,'mae255':round(float(delta.mean()),3),'pixelsDeltaGt8':round(float((per>8).mean()*100),3),'pixelsDeltaGt24':round(float((per>24).mean()*100),3),'exactMatch':round(float((per==0).mean()*100),3)}
 diff=ImageChops.difference(A,B); ImageEnhance.Contrast(diff).enhance(3).save(dest/f'{name}-diff.png')
 Image.blend(A,B,.5).save(dest/f'{name}-overlay.png'); out.append(item)
(dest/'report.json').write_text(json.dumps(out,indent=2)+'\n'); print(json.dumps(out,indent=2))
