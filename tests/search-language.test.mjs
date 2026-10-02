import test from 'node:test';import assert from 'node:assert/strict';
import {classifySearchText,currentSearchContext,describeSearch,parseSearchQuery} from '../src/search-language.mjs';
test('search language infers code, symbol and file intent',()=>{
 assert.equal(classifySearchText('function restoreFocus(trigger) {').mode,'ast');
 assert.equal(classifySearchText('restoreFocus').mode,'symbol');
 assert.equal(classifySearchText('src/focus.js').mode,'file');
 assert.equal(classifySearchText('calendar invite bug').mode,'text');
});
test('qualifiers override scope and mode without leaking into search text',()=>{
 const parsed=parseSearchQuery('repo:ultrabricks/forgejo-github-skin def:restoreFocus lang:javascript',{scope:'global'});
 assert.deepEqual({text:parsed.text,mode:parsed.mode,scope:parsed.scope,repo:parsed.repo,language:parsed.language,intent:parsed.symbolIntent},{text:'restoreFocus',mode:'symbol',scope:'repo',repo:'ultrabricks/forgejo-github-skin',language:'javascript',intent:'definition'});
 assert.match(describeSearch(parsed).label,/Repository/);
});
test('repository context is inferred from ordinary Forgejo paths',()=>{
 assert.deepEqual(currentSearchContext({pathname:'/ultrabricks/forgejo-github-skin/pulls/31'}),{scope:'repo',repo:'ultrabricks/forgejo-github-skin',org:'ultrabricks'});
 assert.equal(currentSearchContext({pathname:'/issues'}).scope,'global');
});
