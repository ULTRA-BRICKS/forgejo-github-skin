import {buildPresentation,workObject} from '../integrations/link-preview/slack-presentation.mjs';
import {previewFixtures} from './preview-fixtures.mjs';
const origin='https://forge.example',repositoryUrl=origin+'/ultrabricks/keyboard-lab',sha='8ae41f7b'+'a'.repeat(32);
const icons={repository:new URL('../assets/slack-icons/repository.png',import.meta.url).href,pull:new URL('../assets/slack-icons/pull.png',import.meta.url).href,issue:new URL('../assets/slack-icons/issue.png',import.meta.url).href,commit:new URL('../assets/slack-icons/commit.png',import.meta.url).href,file:new URL('../assets/slack-icons/file.png',import.meta.url).href};
export const slackCases={
 Repository:{kind:'repository'},PullRequest:{kind:'pull'},Issue:{kind:'issue'},Commit:{kind:'commit'},File:{kind:'file'},
 MergedPullRequest:{kind:'pull',status:'Merged'},DraftPullRequest:{kind:'pull',status:'Draft'},ClosedIssue:{kind:'issue',status:'Closed'},
 FailingChecks:{kind:'pull',checks:{state:'failure',total:7,passed:5}},PassingChecks:{kind:'pull',checks:{state:'success',total:7,passed:7}},NoChecks:{kind:'pull',checks:{state:'unknown',total:0,passed:0}},
 PrivateRepository:{kind:'repository',private:true},PrivatePullRequest:{kind:'pull',private:true},PrivateFile:{kind:'file',private:true},
 DetailedPullRequest:{kind:'pull',density:'detailed'},LongTitle:{kind:'pull',longTitle:true},RepositoryWithoutActivity:{kind:'repository',activity:false},
 DarkPullRequest:{kind:'pull',surface:'dark'},DarkFile:{kind:'file',surface:'dark'},MobilePullRequest:{kind:'pull',width:360},
 ConnectAccount:{kind:'pull',state:'connect'},AccessDenied:{kind:'issue',state:'denied'},Loading:{kind:'repository',state:'loading'},Expired:{kind:'file',state:'expired'},
 FileTextSyntax:{kind:'file',textCode:true},FileImageDark:{kind:'file',surface:'dark'},ConnectedAccount:{kind:'pull',private:true,account:true,connected:true},ConnectMyAccount:{kind:'pull',private:true,account:true},PersonalPrivateFile:{kind:'file',private:true,personal:true},Settings:{kind:'pull',settings:true},ActionsMenu:{kind:'pull',actionsOpen:true},DarkActions:{kind:'pull',actionsOpen:true,surface:'dark'},
};
export function slackFixture(options={}){
 const kind=options.kind||'pull',base=structuredClone(previewFixtures[kind]);
 const path=kind==='pull'?'/pulls/23':kind==='issue'?'/issues/42':kind==='commit'?'/commit/'+sha:kind==='file'?'/src/commit/'+sha+'/src/focus.js':'';
 const resourceUrl=repositoryUrl+path,originalUrl=resourceUrl+(kind==='file'?'#L12-L16':'');
 const link={kind,owner:'ultrabricks',repo:'keyboard-lab',repositoryUrl,resourceUrl,originalUrl,...(['issue','pull'].includes(kind)?{number:kind==='pull'?23:42}:{}),...(['file','commit'].includes(kind)?{sha}:{}),...(kind==='file'?{path:'src/focus.js',lines:{start:12,end:16}}:{})};
 base.link=link;base.repository='ultrabricks/keyboard-lab';base.private=!!options.private;base.updatedAt='2026-09-19T10:00:00Z';
 if(kind==='pull')base.title='PR #23: Keep focus stable when menus close';
 if(kind==='issue')base.title='Issue #42: Restore keyboard navigation after filtering';
 if(['pull','issue'].includes(kind)){base.status=options.status||'Open';const state=base.summary.metrics.find(m=>m.label==='State');if(state)state.value=base.status;}
 if(kind==='pull')base.description='Keep focus on the invoking control when menus close, including Escape and nested menus.';
 if(kind==='issue')base.description='Keyboard navigation stops responding after a filter is applied. Preserve focus while updating the list.';
 if(kind==='commit'){base.title='Commit '+sha.slice(0,8);base.description='Restore focus after closing the branch selector';}
 if(kind==='repository')base.description='Accessible repository controls and compact collaboration previews.';
 if(options.checks)base.summary.checks=options.checks;
 if(options.activity===false)base.summary.activity=null;
 if(options.longTitle)base.title='A deliberately long pull request title with keyboard-navigation-and-context-preservation details that must wrap cleanly on a narrow phone without clipping the status or actions';
 const activityImage=kind==='file'?new URL('../assets/slack-examples/code.png',import.meta.url).href:new URL('../assets/slack-examples/activity.png',import.meta.url).href;
 const model=buildPresentation(base,{density:options.density,settingsReference:'b'.repeat(48),imageUrl:options.textCode?null:activityImage,audience:options.personal?'viewer':'conversation'});model.icon=icons[kind];
 const stateIcons={Merged:new URL('../assets/slack-icons/pull-merged.png',import.meta.url).href,Draft:new URL('../assets/slack-icons/pull-draft.png',import.meta.url).href,Closed:new URL('../assets/slack-icons/pull-closed.png',import.meta.url).href};
 if(kind==='pull'&&stateIcons[base.status])model.icon=stateIcons[base.status];
 if(kind==='issue'&&base.status==='Closed')model.icon=new URL('../assets/slack-icons/issue-closed.png',import.meta.url).href;
 return {model,metadata:base,entity:workObject(model,{postedUrl:originalUrl,externalId:'synthetic-'+kind})};
}
