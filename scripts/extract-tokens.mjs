/** Convert a curated subset of measured browser tokens to DTCG 2025.10. */
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'research/observations', name), 'utf8'));
const light = read('github-desktop-repository.json').tokens;
const dark = read('github-desktop-dark.json').tokens;
if (light['--bgColor-default'] === dark['--bgColor-default']) throw Error('Dark capture did not switch appearance; do not invent a measured palette');
export function hexColor(hex) {
  if (!/^#[0-9a-f]{3,8}$/i.test(hex)) throw Error(`Expected measured hex color, received ${hex}`);
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  if (![6,8].includes(h.length)) throw Error(`Invalid hex length ${hex}`);
  return {colorSpace:'srgb', components:[0,2,4].map(i => parseInt(h.slice(i,i+2),16) / 255), alpha:h.length === 8 ? parseInt(h.slice(6,8),16)/255 : 1};
}
const token = (type, value, description, source) => ({$type:type, $value:value, $description:description, $extensions:{'ai.hyperide.provenance':source}});
const source = (mode, variable) => ({kind:'measured-css', file:`research/observations/github-desktop-${mode === 'light' ? 'repository' : 'dark'}.json`, variable});
const colorMap = {canvas:'--bgColor-default',subtle:'--bgColor-muted',text:'--fgColor-default',muted:'--fgColor-muted',link:'--fgColor-accent',border:'--borderColor-default',success:'--bgColor-success-emphasis',successSubtle:'--bgColor-success-muted',danger:'--fgColor-danger',dangerSubtle:'--bgColor-danger-muted',attention:'--fgColor-attention',attentionSubtle:'--bgColor-attention-muted',primary:'--button-primary-bgColor-rest',primaryHover:'--button-primary-bgColor-hover',primaryActive:'--button-primary-bgColor-active',onPrimary:'--button-primary-fgColor-rest',counter:'--counter-bgColor-muted',focus:'--focus-outlineColor',added:'--diffBlob-additionLine-bgColor',removed:'--diffBlob-deletionLine-bgColor',addedWord:'--diffBlob-additionWord-bgColor',removedWord:'--diffBlob-deletionWord-bgColor',hunk:'--diffBlob-hunkLine-bgColor'};
const out = {$description:'GitHub public product UI reference and explicitly marked Hyperide design decisions. No font binaries or GitHub branding are distributed.', $extensions:{'ai.hyperide.reference':{format:'DTCG 2025.10',specification:'https://www.designtokens.org/tr/2025.10/format/',capture:'research/capture-manifest.json',implementation:'0.1.0',notice:'DTCG Community Group specification, not a W3C Recommendation. Light and dark are ordinary token groups; no non-standard $themes field.'}},color:{},space:{},radius:{},font:{},control:{},layout:{},motion:{}};
for (const [mode, values] of [['light',light],['dark',dark]]) {
  out.color[mode] = {};
  for (const [name, variable] of Object.entries(colorMap)) {
    if (!values[variable]) throw Error(`Missing observation ${mode} ${variable}`);
    out.color[mode][name] = token('color',hexColor(values[variable]),`${mode} ${name}`,source(mode,variable));
  }
  out.color[mode].tabIndicator = token('color',hexColor(mode === 'light' ? '#fd8c73' : '#f78166'),'Prototype active-tab accent; separately tuned, not claimed as a measured token',{kind:'design-decision'});
}
const dimension = (n, description, provenance={kind:'design-decision'}) => token('dimension',{value:n,unit:'px'},description,provenance);
const measuredPx = variable => {
  const v=light[variable]; if (!v) throw Error(`Missing dimension ${variable}`);
  if (/^-?[\d.]+rem$/.test(v)) return parseFloat(v)*16;
  if (/^-?[\d.]+px$/.test(v)) return parseFloat(v);
  throw Error(`Unrecognized unit ${v}`);
};
for (const size of [2,4,6,8,12,16,20,24,28,32,36,40,44,48,64,80,96,128]) out.space[`s${size}`]=dimension(measuredPx(`--base-size-${size}`),`Spacing ${size}`,source('light',`--base-size-${size}`));
for (const name of ['small','medium','large','full']) out.radius[name]=dimension(measuredPx(`--borderRadius-${name}`),`Corner radius ${name}`,source('light',`--borderRadius-${name}`));
out.control.medium=dimension(measuredPx('--control-medium-size'),'Default desktop control height',source('light','--control-medium-size'));
out.control.touch=dimension(44,'Hyperide proposed minimum touch target; not a GitHub measurement');
out.control.paddingInline=dimension(measuredPx('--control-medium-paddingInline-normal'),'Control horizontal padding',source('light','--control-medium-paddingInline-normal'));
out.control.focusWidth=dimension(measuredPx('--focus-outline-width'),'Visible focus outline',source('light','--focus-outline-width'));
out.font.sans=token('fontFamily', ['Mona Sans VF','-apple-system','BlinkMacSystemFont','Segoe UI','Noto Sans','Helvetica','Arial','sans-serif'],'Measured family order simplified for portability; fonts are NOT bundled',source('light','--fontStack-sansSerif'));
out.font.mono=token('fontFamily',['ui-monospace','SFMono-Regular','SF Mono','Menlo','Consolas','Liberation Mono','monospace'],'Code font stack',source('light','--fontStack-monospace'));
out.font.bodySize=dimension(14,'Computed body size',{kind:'measured-computed-style',file:'research/observations/github-desktop-repository.json',element:'BODY',property:'fontSize'});
out.font.bodyLine=dimension(21,'Computed body line height',{kind:'measured-computed-style',file:'research/observations/github-desktop-repository.json',element:'BODY',property:'lineHeight'});
out.font.codeSize=dimension(12,'Initial code typography; validate per file and diff screen');
out.font.smallSize=dimension(12,'Secondary metadata size');
out.font.weightNormal=token('fontWeight',400,'Normal weight',{kind:'measured-computed-style',element:'BODY'});
out.font.weightStrong=token('fontWeight',600,'Semibold controls and headings',{kind:'design-decision'});
for (const [key,value,description] of [['contentMax',1216,'Repository reference content span at 1440px; not a universal GitHub page width'],['aside',272,'Repository reference about column; initial target'],['columnGap',40,'Repository reference column gap; initial target'],['mobileBreakpoint',768,'Prototype responsive boundary; only 390 and 1440 were captured'],['pageGutter',32,'Initial desktop gutter'],['mobileGutter',16,'Initial mobile gutter']]) out.layout[key]=dimension(value,description,{kind:key.includes('Breakpoint')?'design-decision':'reference-layout-target'});
for (const [key,variable] of [['fast','--duration-fast'],['micro','--motion-duration-micro'],['short','--motion-duration-short'],['medium','--motion-duration-medium'],['long','--motion-duration-long']]) {
 const v=light[variable];out.motion[key]=token('duration',{value:parseFloat(v)*(v.endsWith('ms')?1:1000),unit:'ms'},'CSS token, not an observed end-to-end animation duration',source('light',variable));
}
for (const name of ['enter','exit','hover','move','linear']) out.motion[name]=token('cubicBezier',light[`--motion-easing-${name}`].match(/-?\d*\.?\d+/g).map(Number),'Measured CSS easing',source('light',`--motion-easing-${name}`));
fs.writeFileSync(path.join(root,'tokens.json'),JSON.stringify(out,null,2)+'\n');
console.log('Wrote tokens.json from recorded GitHub light/dark CSS; proposed values explicitly marked');
