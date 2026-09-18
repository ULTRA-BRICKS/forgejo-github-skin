import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('candidate stories use genuine Forgejo geometry rather than GitHub identity',()=>{
 for(const name of ['Repository.stories.js','WorkflowScreens.stories.js']){
  const source=read('stories/'+name);assert.ok(source.includes('forgejoMark'));assert.ok(!source.includes("I('mark-github'"));
 }
 const original=read('assets/forgejo-original.svg'),graphite=read('assets/forgejo-graphite.svg');
 for(const [,geometry] of original.matchAll(/\bd="([^"]+)"/g))assert.ok(graphite.includes(`d="${geometry}"`));
 assert.ok(graphite.includes('#24292f')&&graphite.includes('#8c959f'));
 assert.ok(!graphite.includes('<style>'),'No global SVG selectors can leak into other icons');
});
test('Storybook publication does not import or export font binaries',()=>{
 assert.ok(!read('.storybook/preview.js').includes("import '@fontsource"));
 assert.ok(read('scripts/publish-gallery.mjs').includes('woff2?'));
});
