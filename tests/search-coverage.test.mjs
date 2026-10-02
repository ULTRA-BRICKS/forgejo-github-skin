/** Backend-safe captured payloads drive the UI coverage presenter, without a browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describeSearchCoverage,searchTiming} from '../src/universal-search.mjs';

const fixtures=JSON.parse(fs.readFileSync(new URL('../stories/search-coverage-fixtures.json',import.meta.url),'utf8'));
const describe=(payload,overrides={})=>describeSearchCoverage(payload.coverage,{query:payload.query,mode:payload.inferred,hasResults:payload.results.length>0,...overrides});

for(const [name,payload] of Object.entries(fixtures))test(`captured ${name} explains only authorized bounded stages`,()=>{
  const view=describe(payload);
  assert.match(view.scope,/authorized, indexed default branches/);
  assert.match(view.scope,/not exhaustive/);
  assert.equal(view.partial,['enabled','truncated'].includes(name));
  assert.deepEqual(view.stages.map(stage=>[stage.key,stage.limit,stage.state]),Object.entries(payload.coverage.limits).filter(([,stage])=>stage.state!=='not_applicable').map(([key,stage])=>[key,stage.limit,stage.state]));
});

for(const status of ['not_requested','no_candidates','ran','unavailable','timeout','failed'])test(`AST ${status} remains distinguishable even with exact stage bounds`,()=>{
  const payload=structuredClone(fixtures.unavailable);payload.coverage.ast.status=status;
  const withMatches=describe(payload);
  assert.equal(withMatches.partial,false);
  const expected={not_requested:/was not requested/,no_candidates:/No eligible candidates.*availability was not checked/,ran:/refinement ran/,unavailable:/is unavailable/,timeout:/timed out/,failed:/refinement failed/};
  assert.match(withMatches.engine,expected[status]);
  if(['unavailable','timeout','failed'].includes(status)){
    assert.match(withMatches.engine,/fallback matches/);
    const empty=describe(payload,{hasResults:false});
    assert.match(empty.engine,/No fallback matches/);
    assert.match(empty.engine,/not an exhaustive no-match result/);
  }
});

for(const state of ['not_applicable','complete','truncated','unknown'])test(`each ${state} stage is represented without inferring result completeness`,()=>{
  for(const key of Object.keys(fixtures.denied.coverage.limits)){
    const payload=structuredClone(fixtures.denied);payload.coverage.limits[key].state=state;
    const view=describe(payload),stage=view.stages.find(stage=>stage.key===key);
    assert.equal(view.partial,['truncated','unknown'].includes(state));
    assert.equal(!!stage,state!=='not_applicable');
    if(stage)assert.match(stage.description,{complete:/Within limit/,truncated:/Limit reached/,unknown:/Coverage unknown/}[state]);
  }
});

test('malformed, unsupported and extra coverage fields fail closed without changing old results',()=>{
  const invalid=[undefined,null,[],{},true,'coverage',1];
  const changes=[
    c=>c.version=2,c=>c.version='1',c=>c.scope='private/path',c=>c.completeness='exhaustive',
    c=>c.semantics.references='semantic',c=>delete c.semantics.definitions,c=>c.ast.status='available',
    c=>c.ast.status='<img src=x onerror=alert(1)>',c=>c.ast.error='/private/bin/engine failed',
    c=>c.denied_count=123,c=>c.limits.results.limit='30',c=>c.limits.results.limit=0,
    c=>c.limits.results.limit=-1,c=>c.limits.results.limit=1.1,c=>c.limits.results.limit=101,
    c=>c.limits.results.limit=Infinity,c=>c.limits.results.limit=NaN,c=>c.limits.results.state='exact',
    c=>c.limits.results.count=500,c=>c.limits.repository_hits.limit=13,c=>c.limits.lexical_candidates.limit=39,
    c=>c.limits.ast_files.limit=21,c=>delete c.limits.file_hits,c=>c.limits.extra={limit:1,state:'complete'},
    c=>c.ast=[],c=>c.semantics=null,c=>c.limits=null,c=>c.limits.results=[],
  ];
  for(const change of changes){const coverage=structuredClone(fixtures.enabled.coverage);change(coverage);invalid.push(coverage);}
  for(const coverage of invalid)assert.equal(describeSearchCoverage(coverage,{query:'needle'}),null);
});

test('empty query has useful help rather than coverage for inactive limits',()=>{
  for(const query of ['', '  ', '\n'])assert.equal(describe(fixtures.enabled,{query}),null);
});

test('definitions and references are qualified only when relevant',()=>{
  assert.equal(describe(fixtures.enabled).semantics,null);
  for(const query of ['def:needle','ref:needle'])assert.match(describe(fixtures.enabled,{query}).semantics,/Definitions are pattern-based.*References are lexical.*not semantic/);
  for(const mode of ['symbol','reference'])assert.match(describe(fixtures.enabled,{mode}).semantics,/not semantic/);
  const payload=structuredClone(fixtures.enabled);payload.coverage.limits.symbol_hits.state='complete';
  assert.match(describe(payload).semantics,/pattern-based/);
});

test('presenter never mutates backend data and returns only safe display text',()=>{
  const payload=structuredClone(fixtures.truncated),before=structuredClone(payload);
  const view=describe(payload);
  assert.deepEqual(payload,before);
  assert.equal(JSON.stringify(view).includes('bc979f'),false);
  assert.equal(JSON.stringify(view).includes('src/needle'),false);
});

test('Russian details carry the same bounds and distinct engine outcome',()=>{
  const view=describe(fixtures.unavailable,{lang:'ru-RU'});
  assert.match(view.title,/Подробности/);
  assert.match(view.scope,/индексированным/);
  assert.match(view.engine,/недоступен/);
  assert.equal(view.partial,false);
});

test('only finite nonnegative total request time is displayed',()=>{
  for(const value of [undefined,null,'3',-1,NaN,Infinity,{},[]])assert.equal(searchTiming(value),'');
  assert.equal(searchTiming(0),'0 ms total');
  assert.equal(searchTiming(fixtures.enabled.total_ms),'56.72 ms total');
  assert.equal(searchTiming(56.72,'ru'),'56.72 мс всего');
});
