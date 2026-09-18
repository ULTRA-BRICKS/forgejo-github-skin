import octicons from '@primer/octicons';

const icon = (name) => octicons[name]?.toSVG({width:16,height:16}) ?? '';
const key = (value) => `<kbd>${value}</kbd>`;
const row = (keys, label, status='ready') => `<div class="hotkey-row"><div>${keys.map(key).join('<span class="hotkey-plus">then</span>')}</div><span>${label}</span><b class="hotkey-status ${status}">${status === 'ready' ? icon('check') + ' Works' : status === 'native' ? icon('check-circle') + ' Native' : icon('dash') + ' No equivalent'}</b></div>`;

export default {title:'States/GitHub hotkeys'};

export const Repository = {render:()=>`<main class="hotkey-sheet"><header><div><h2>GitHub keyboard shortcuts</h2><p>Page-aware mappings use existing Forgejo links and permission-rendered controls.</p></div><span class="hotkey-chip">Repository</span></header><section><h3>Navigation</h3>${row(['?'],'Shortcut help')}${row(['S'],'Focus search')}${row(['G','N'],'Notifications')}${row(['G','C'],'Code')}${row(['G','I'],'Issues')}${row(['G','P'],'Pull requests')}${row(['G','A'],'Actions')}</section><section><h3>Code browsing</h3>${row(['T'],'Go to file')}${row(['L'],'Go to line')}${row(['W'],'Switch branch / tag')}${row(['Y'],'Permanent URL')}${row(['B'],'Blame')}${row(['E'],'Edit when permitted')}${row(['⌘','B'],'Bold in Markdown editor','native')}${row(['⌘','I'],'Italic in Markdown editor','native')}${row(['⌘','K'],'Insert link','native')}</section></main>`};

export const Gaps = {render:()=>`<main class="hotkey-sheet"><header><div><h2>Intentional gaps</h2><p>We do not fake GitHub commands when Forgejo 16.0.3 has no equivalent feature.</p></div><span class="hotkey-chip">Parity rules</span></header><section>${row(['G','G'],'Discussions','gap')}${row(['G','S'],'Security and quality','gap')}${row(['G','W'],'Wiki — excluded by product scope','gap')}${row(['.'],'github.dev — no Forgejo web IDE','gap')}${row(['E'],'Notification “Done” state','gap')}${row(['⇧','M'],'Notification unsubscribe','gap')}</section></main>`};
