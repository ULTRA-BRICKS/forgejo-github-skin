import test from 'node:test';
import assert from 'node:assert/strict';
import {currentThemeStylesheet} from '../src/core.mjs';
test('the loaded release pins its theme CSS version without losing AppSubUrl',()=>{
 assert.equal(currentThemeStylesheet('https://forge.example/assets/hypergithub/0.1.6/skin.mjs','hypergithub-auto'),'https://forge.example/assets/css/theme-hypergithub-auto.css?skin=0.1.6');
 assert.equal(currentThemeStylesheet('https://forge.example/git/assets/hypergithub/1.2.3/skin.mjs?v=1','hypergithub-dark'),'https://forge.example/git/assets/css/theme-hypergithub-dark.css?skin=1.2.3');
 for(const theme of ['forgejo-auto','hypergithub-evil',null,undefined])assert.equal(currentThemeStylesheet('https://forge.example/assets/hypergithub/0.1.6/skin.mjs',theme),null);
 for(const url of ['not a URL','file:///assets/hypergithub/0.1.6/skin.mjs','https://forge.example/src/skin.mjs','https://forge.example/assets/hypergithub/evil/skin.mjs','https://u:p@forge.example/assets/hypergithub/0.1.6/skin.mjs'])assert.equal(currentThemeStylesheet(url,'hypergithub-auto'),null);
});

test('release keeps at least one previous versioned asset directory for cached theme CSS',async()=>{
 const fs=await import('node:fs/promises');
 const path=await import('node:path');
 const root=path.resolve(import.meta.dirname,'..');
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const entries=await fs.readdir(path.join(root,'dist/public/assets/hypergithub'),{withFileTypes:true});
 const previous=entries.filter(entry=>entry.isDirectory()&&entry.name!==pkg.version);
 assert.ok(previous.length>=1,'expected N-1 release assets to remain available');
});
