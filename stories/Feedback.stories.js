import octicons from '@primer/octicons';
const svg=n=>octicons[n].toSVG({width:16,height:16});
const wrap=x=>`<div class="story-pad"><div class="feedback-grid">${x}</div></div>`;
export default {title:'States/Feedback'};
export const Messages={render:()=>wrap(`<div class="ui positive message"><b>${svg('check-circle')} Changes saved</b><p>Your branch protection settings were updated.</p></div><div class="ui info message"><b>${svg('info')} Waiting for checks</b><p>3 checks are still running.</p></div><div class="ui warning message"><b>${svg('alert')} Merge conflict</b><p>Resolve conflicts before merging this pull request.</p></div><div class="ui negative message"><b>${svg('x-circle')} Comment was not posted</b><p>Your draft is still here. Check your connection and retry.</p></div>`) };
export const Loading={render:()=>wrap(`<div class="feedback-loading is-loading"><div style="display:flex;gap:8px;align-items:center"><div class="htmx-indicator" style="display:block;margin:0"></div><b>Loading files…</b></div><div class="hgh-skeleton"></div><div class="hgh-skeleton"></div><div class="hgh-skeleton"></div></div>`) };
export const Empty={render:()=>wrap(`<div class="feedback-empty">${octicons.inbox.toSVG({width:32,height:32})}<h3>No issues match your filters</h3><p class="muted">Try clearing labels, assignees, or search terms.</p><button class="btn">Clear filters</button></div>`) };
