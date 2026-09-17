import test from 'node:test';import assert from 'node:assert/strict';
import {validateTokens,cssValue,resolveToken} from '../src/tokens.mjs';
test('DTCG structured dimensions and colors round-trip',()=>{const t=validateTokens({space:{$type:'dimension',s4:{$value:{value:4,unit:'px'}}},color:{$type:'color',text:{$value:{colorSpace:'srgb',components:[1,0,0],alpha:1}}}});assert.equal(cssValue(resolveToken('space.s4',t)),'4px');assert.equal(cssValue(resolveToken('color.text',t)),'rgb(255 0 0 / 1)');});
test('unstructured legacy color strings are rejected',()=>assert.throws(()=>validateTokens({red:{$type:'color',$value:'#ff0000'}})));
test('aliases detect cycles and broken targets',()=>{assert.throws(()=>validateTokens({a:{$type:'number',$value:'{b}'},b:{$type:'number',$value:'{a}'}}));assert.throws(()=>validateTokens({a:{$type:'number',$value:'{missing}'}}));});
test('alias type mismatch is rejected',()=>assert.throws(()=>validateTokens({a:{$type:'number',$value:1},b:{$type:'duration',$value:'{a}'}})));
test('CSS family serializer does not require font binaries',()=>assert.equal(cssValue({$type:'fontFamily',$value:['Mona Sans VF','sans-serif']}),'"Mona Sans VF", sans-serif'));

test('brace-wrapped literal font names are not mistaken for aliases',()=>{const t=validateTokens({font:{$type:'fontFamily',odd:{$value:'{Foo Bar}'}}});assert.equal(resolveToken('font.odd',t).$value,'{Foo Bar}');});
