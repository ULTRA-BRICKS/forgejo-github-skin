import fs from 'node:fs';
import path from 'node:path';
import {validateTokens,cssValue,resolveToken} from '../src/tokens.mjs';
const root=path.resolve(import.meta.dirname,'..');
const json=JSON.parse(fs.readFileSync(path.join(root,'tokens.json'),'utf8'));
const tokens=validateTokens(json);
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const assets=path.join(root,'dist/public/assets');
const dir=path.join(assets,'hypergithub',version);
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(assets,'css'),{recursive:true});
for(const file of ['skin.css','skin.mjs','core.mjs']) fs.copyFileSync(path.join(root,'src',file),path.join(dir,file));
const map={
 'color-body':'canvas','color-box-body':'canvas','color-box-header':'subtle','color-box-body-highlight':'subtle',
 'color-text':'text','color-text-dark':'text','color-text-light':'muted','color-text-light-1':'muted','color-text-light-2':'muted','color-text-light-3':'muted',
 'color-primary':'link','color-primary-dark-1':'link','color-primary-dark-2':'link','color-primary-hover':'link','color-primary-contrast':'onPrimary',
 'color-secondary':'border','color-secondary-dark-1':'border','color-secondary-dark-2':'border','color-secondary-light-1':'subtle',
 'color-input-text':'text','color-input-background':'canvas','color-input-border':'border','color-input-border-hover':'muted',
 'color-header-wrapper':'subtle','color-nav-bg':'subtle','color-nav-hover-bg':'counter','color-secondary-nav-bg':'subtle',
 'color-menu':'canvas','color-card':'canvas','color-button':'subtle','color-code-bg':'canvas','color-footer':'canvas',
 'color-hover':'subtle','color-active':'counter','color-timeline':'border','color-shadow':'counter','color-secondary-bg':'subtle',
 'color-markup-code-block':'subtle','color-markup-code-inline':'counter','color-label-bg':'counter','color-label-text':'text',
 'color-green':'success','color-red':'danger','color-blue':'link','color-yellow':'attention','color-accent':'link',
 'color-success-bg':'successSubtle','color-success-text':'success','color-error-bg':'dangerSubtle','color-error-text':'danger',
 'color-warning-bg':'attentionSubtle','color-warning-text':'attention',
 'color-diff-added-row-bg':'added','color-diff-removed-row-bg':'removed','color-diff-added-word-bg':'addedWord','color-diff-removed-word-bg':'removedWord',
 'color-diff-added-row-border':'addedWord','color-diff-removed-row-border':'removedWord','color-diff-inactive':'subtle'
};
const common=[...tokens.keys()].filter(n=>!n.startsWith('color.')).map(n=>`  --hgh-${n.replaceAll('.','-')}: ${cssValue(resolveToken(n,tokens))};`).join('\n');
function palette(mode){return [...tokens.keys()].filter(n=>n.startsWith(`color.${mode}.`)).map(n=>`  --hgh-color-${n.split('.').at(-1)}: ${cssValue(resolveToken(n,tokens))};`).join('\n');}
const mapped=Object.entries(map).map(([name,value])=>`  --${name}: var(--hgh-color-${value});`).join('\n');
for(const mode of ['light','dark','auto']){
 let css=`/* Generated from DTCG tokens.json. Skin ${version}; Forgejo base theme keeps syntax styles. */\n@import url("./theme-forgejo-${mode}.css");\n@import url("../hypergithub/${version}/skin.css");\n:root {\n${common}\n${palette(mode==='dark'?'dark':'light')}\n${mapped}\n  color-scheme: ${mode==='auto'?'light dark':mode};\n}\n`;
 if(mode==='auto')css+=`@media (prefers-color-scheme: dark) { :root {\n${palette('dark')}\n} }\n`;
 fs.writeFileSync(path.join(assets,'css',`theme-hypergithub-${mode}.css`),css);
}
const hooks=path.join(root,'dist/templates/custom');fs.mkdirSync(hooks,{recursive:true});
fs.writeFileSync(path.join(hooks,'footer.tmpl'),`{{/* Hypergithub ${version}: external script; no inline JS, works with AppSubUrl. */}}\n<script type="module" src="{{AppSubUrl}}/assets/hypergithub/${version}/skin.mjs"></script>\n`);
fs.writeFileSync(path.join(root,'dist/build.json'),JSON.stringify({version,tokenCount:tokens.size,files:['skin.css','skin.mjs','core.mjs'],format:'DTCG 2025.10',fontFiles:0},null,2)+'\n');
console.log(`Built ${tokens.size} validated tokens, three native themes, external enhancement module; no font files`);
