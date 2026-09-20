/** Bounded language names accepted by Slack; filenames never become renderer instructions. */
const languages={js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',py:'python',json:'json',jsonc:'json',go:'go',rs:'rust',css:'css',html:'html',xml:'xml',sh:'bash',bash:'bash',zsh:'bash',yml:'yaml',yaml:'yaml',toml:'toml',sql:'sql',java:'java',c:'c',h:'c',cpp:'cpp',hpp:'cpp',rb:'ruby',swift:'swift',kt:'kotlin',md:'markdown',nix:'nix'};
export function codeLanguage(path='') {
 const name=String(path).split('/').at(-1).toLowerCase();
 if(name==='dockerfile')return 'dockerfile';
 const extension=name.split('.').at(-1);
 return Object.hasOwn(languages,extension)?languages[extension]:'text';
}
export function sanitizeCodeLines(lines) {
 return (lines||[]).slice(0,5).map(line=>String(line).slice(0,300).toWellFormed());
}
export function fencedCode(lines,language) {
 const source=sanitizeCodeLines(lines).join('\n');
 // The fence must be longer than every source backtick run to prevent breakout.
 const longest=Math.max(2,...[...source.matchAll(/`+/g)].map(m=>m[0].length));
 const fence='`'.repeat(longest+1);
 const safe=language==='dockerfile'||Object.values(languages).includes(language)?language:'text';
 return fence+safe+'\n'+source+'\n'+fence;
}
