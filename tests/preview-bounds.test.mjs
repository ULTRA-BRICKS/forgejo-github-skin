import test from 'node:test';
import assert from 'node:assert/strict';
import {parseForgejoLink,richCard} from '../ops/handoff/slack/preview-core.mjs';

test('preview text bounds large metadata before code-point expansion',()=>{
 const link=parseForgejoLink('https://forge.example/team/repo/issues/1','https://forge.example');
 const facts={resourceVerified:true,checkIsFresh:true,visibility:'public',anonymousReadable:true,resourceUrl:link.resourceUrl};
 const card=richCard({facts,link,title:'A'.repeat(2_000_000),description:'🧪'.repeat(1_000_000),status:'\u0000Open'});
 assert.equal(card.blocks[0].text.text.length,150);
 const description=card.blocks.find(b=>b.type==='section').text.text;
 assert.equal([...description].length,400);
 assert.ok([...description].every(c=>c==='🧪'));
 assert.ok(!JSON.stringify(card).includes('\\u0000'));
});

test('bounded preview text never emits a clipped trailing high surrogate',()=>{
 const link=parseForgejoLink('https://forge.example/team/repo','https://forge.example');
 const facts={resourceVerified:true,checkIsFresh:true,visibility:'public',anonymousReadable:true,resourceUrl:link.resourceUrl};
 const card=richCard({facts,link,title:'Test',description:'x'.repeat(399)+'\ud83e'+'x',status:'Open'});
 assert.equal(card.blocks.find(b=>b.type==='section').text.text,'x'.repeat(399));
});
