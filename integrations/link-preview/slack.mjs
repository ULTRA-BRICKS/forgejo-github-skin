import {HomeDispatcher} from './home-dispatch.mjs';
import {homeView} from './slack-home.mjs';
import {textOnlyCard} from './slack-presentation.mjs';
import {publicMetadata} from './public-metadata.mjs';
import { composeSlackCard, visualAddsInformation } from "./unfurl-layout.mjs";
import { settingsView, saveSettings } from "./slack-settings.mjs";
import { isAccessDenied } from "./forgejo.mjs";
import { randomBytes } from "node:crypto";
import {
  protectedCard,
} from "../../ops/handoff/slack/preview-core.mjs";
async function resolveBatch(values,resolve) {
  let next=0;const results=new Array(values.length);
  await Promise.all(Array.from({length:Math.min(3,values.length)},async()=>{
    while(next<values.length){const index=next++;results[index]=await resolve(values[index]);}
  }));
  return results;
}
export class SlackIntegration {
  constructor(config, store, forgejo, oauth) {
    Object.assign(this, { config, store, forgejo, oauth });
    this.homeDispatcher=new HomeDispatcher(event=>this.publishHome(event));
  }
  async call(method, payload) {
    if (
      ![
        "chat.unfurl",
        "entity.presentDetails",
        "views.open",
        "views.update",
        "views.publish",
        "conversations.info",
        "auth.test",
      ].includes(method)
    )
      throw new Error("Slack method rejected");
    const form = payload.metadata ? new URLSearchParams(Object.entries(payload).map(([key,value])=>[key,typeof value==='object'?JSON.stringify(value):String(value)])) : null;
    const r = await fetch("https://slack.com/api/" + method, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.config.slack.botToken,
        "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json; charset=utf-8",
      },
      body: form || JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const e = new Error("Slack HTTP " + r.status);
      e.status = r.status;
      e.retryAfter = Number(r.headers.get("retry-after")) || undefined;
      throw e;
    }
    const data = await r.json();
    if (!data.ok) {
      const code = String(data.error).replace(/[^a-z_]/g, "").slice(0, 60);
      const error = new Error("Slack rejected " + code);
      error.slackCode = code;
      throw error;
    }
    return data;
  }
  reference(team, url) {
    const id = randomBytes(24).toString("hex");
    this.store.put("ref:" + id, { team, url }, 86400);
    return id;
  }
  imageSnapshot(meta) {
    if (!meta?.summary || meta.private !== false) return null;
    const summary = meta.summary;
    const meaningful = (summary.metrics || []).some(metric => metric.value !== null && metric.value !== undefined && metric.value !== "") ||
      (summary.code || []).length > 0 || !!summary.activity || !!summary.number || !!summary.sha;
    if (!meaningful) return null;
    const link=this.forgejo.parse(meta.link?.originalUrl);
    if(!link)return null;
    // A durable locator, not a durable copy of repository content. Every image
    // read rechecks public visibility before the renderer/cache is consulted.
    const id = randomBytes(24).toString("hex");
    this.store.put("image:" + id, {sourceUrl:link.originalUrl,version:2}, 30*86400);
    return this.config.origin + "/image/s/" + id;
  }
  publicMetadata(url) {return publicMetadata(this,url);}
  preferences(team,user) {
    const saved=this.store.get('prefs:'+team+':'+user)||{};
    return {density:saved.density==='detailed'?'detailed':'compact',visuals:saved.visuals==='off'?'off':'auto',format:saved.format==='blocks'?'blocks':'native'};
  }
  async resolveShared(envelope,raw) {
    const event=envelope.event,link=this.forgejo.parse(raw);
    if(!link)return null;
    let meta=await this.publicMetadata(raw),token=null;
    if(!meta){token=await this.oauth.access(envelope.team_id,event.user,raw);if(token){try{meta=await this.forgejo.metadata(raw,token,{enrich:true});}catch(error){if(!isAccessDenied(error.status))throw error;}}}
    if(!meta)return {link};
    if(meta.private===false)return {link,meta,facts:{resourceVerified:true,checkIsFresh:true,visibility:'public',sourceDeclaredPublic:true,resourceUrl:link.resourceUrl},policy:{}};
    if(meta.private!==true)return {link};
    const source=event.source||'conversations_history';
    const summaryOwners=Array.isArray(this.config.slack.summaryOwners)?this.config.slack.summaryOwners:[];
    const ownerApproved=summaryOwners.some(rule=>rule.workspaceId===envelope.team_id&&rule.instanceOrigin===new URL(link.originalUrl).origin&&rule.owner===link.owner);
    const explicit=event.user===this.config.slack.disclosureUser&&event.channel===this.config.slack.demoChannel;
    if(source!=='conversations_history'||(!ownerApproved&&!explicit)||!/^[CG][A-Z0-9]+$/.test(event.channel||''))return {link};
    token ||= await this.oauth.access(envelope.team_id,event.user,raw);
    if(!token)return {link};
    try {
      const {channel}=await this.call('conversations.info',{channel:event.channel});
      if(channel?.id!==event.channel)return {link};
      const facts={resourceVerified:true,checkIsFresh:true,visibility:'private',anonymousReadable:false,postingUserCanRead:true,postingUserMayDisclose:true,source,
        workspaceId:envelope.team_id,repositoryId:meta.repositoryId,instanceOrigin:new URL(link.originalUrl).origin,owner:link.owner,resourceUrl:link.resourceUrl,
        channel:{id:channel.id,isPrivate:channel.is_private,isExternalShared:channel.is_ext_shared,isPendingExternalShared:channel.is_pending_ext_shared,isOrgShared:channel.is_org_shared,isShared:channel.is_shared,metadataFresh:true}};
      const policy=ownerApproved?{privateMode:'internal-summary',summaryOwners}:{privateMode:'explicit-channel-disclosure',destinations:this.config.privateDestinations};
      return {link,meta,facts,policy};
    }catch(error){if(!error.slackCode&&!error.message?.startsWith('Slack rejected'))throw error;return {link};}
  }
  async unfurl(envelope) {
    const event=envelope.event;
    if(envelope.team_id!==this.config.slack.teamId||envelope.api_app_id!==this.config.slack.appId||event.type!=='link_shared')return;
    const fallback={},entities=[],blocksOnly={},prefs=this.preferences(envelope.team_id,event.user);
    let retryError;
    const links=event.links.slice(0,5);
    const resolutions=await resolveBatch(links,async posted=>{
      try{return await this.resolveShared(envelope,posted.url);}
      catch(error){const link=this.forgejo.parse(posted.url);return link?{link,unavailable:true,retryError:error}:null;}
    });
    for(const [index,posted] of links.entries()) {
      const resolved=resolutions[index];retryError ||= resolved?.retryError;
      if(!resolved)continue;
      const {link,meta,facts,policy}=resolved,reference=this.reference(envelope.team_id,link.originalUrl);
      let card=protectedCard(reference,link);
      if(resolved.unavailable)card.blocks[0].text.text='Preview temporarily unavailable. You can still open the original in Forgejo. This card will retry automatically.';
      if(meta&&facts){
        try {
          // No image is published until the source and audience have passed the policy gate.
          const result=composeSlackCard(meta,facts,policy,{postedUrl:posted.url,settingsReference:reference,iconOrigin:this.config.origin,...prefs});
          const imageUrl=meta.private===false&&prefs.visuals!=='off'&&visualAddsInformation(meta)?this.imageSnapshot(meta):null;
          const ready=imageUrl?composeSlackCard(meta,facts,policy,{postedUrl:posted.url,settingsReference:reference,iconOrigin:this.config.origin,imageUrl,...prefs}):result;
          card=ready.card;
          if(this.config.slack.workObjectsEnabled===true&&prefs.format==='native')entities.push(ready.entity);else blocksOnly[posted.url]=card;
        }catch(error){if(!/Protected data|Authorization proof|freshly validated/.test(error.message))throw error;blocksOnly[posted.url]=card;}
      }else blocksOnly[posted.url]=card;
      fallback[posted.url]=card;
    }
    const target=event.unfurl_id?{unfurl_id:event.unfurl_id,source:event.source}:{channel:event.channel,ts:event.message_ts};
    if(entities.length){
      try {
        const result=await this.call('chat.unfurl',{...target,metadata:{entities}});
        const warnings=result.response_metadata?.warnings|| (result.warning?[result.warning]:[]);
        if(warnings.some(w=>!['missing_charset','superfluous_charset'].includes(w))){const error=new Error('Work Object fields rejected');error.slackCode='invalid_metadata';throw error;}
      }catch(error){
        if(!['invalid_metadata','invalid_metadata_format','invalid_arguments','feature_not_enabled','missing_scope'].includes(error.slackCode))throw error;
        console.warn('Work Object compatibility fallback: '+error.slackCode);
        for(const entity of entities)blocksOnly[entity.app_unfurl_url]=fallback[entity.app_unfurl_url];
      }
    }
    if(Object.keys(blocksOnly).length) {
      try{await this.call('chat.unfurl',{...target,unfurls:blocksOnly});}
      catch(error){
        if(!['cannot_unfurl_url','invalid_blocks'].includes(error.slackCode))throw error;
        const reduced=Object.fromEntries(Object.entries(blocksOnly).map(([url,card])=>[url,textOnlyCard(card)]));
        await this.call('chat.unfurl',{...target,unfurls:reduced});
      }
    }
    if(retryError)throw retryError;
  }
  async presentDetails(envelope) {
    const event=envelope.event;
    if(envelope.team_id!==this.config.slack.teamId||envelope.api_app_id!==this.config.slack.appId||event.type!=='entity_details_requested')return;
    const raw=event.entity_url||event.link?.url,link=this.forgejo.parse(raw);
    if(!link)return this.call('entity.presentDetails',{trigger_id:event.trigger_id,error:{status:'not_found'}});
    try {
      const resolved=await this.resolveShared({...envelope,event:{...event,source:'conversations_history'}},raw);
      if(resolved?.meta&&resolved.facts){
        const reference=this.reference(envelope.team_id,link.originalUrl);
        const result=composeSlackCard(resolved.meta,resolved.facts,resolved.policy,{settingsReference:reference,iconOrigin:this.config.origin,...this.preferences(envelope.team_id,event.user),visuals:'off'});
        if((event.external_ref?.id&&event.external_ref.id!==result.entity.external_ref.id)||(event.external_ref?.type&&event.external_ref.type!==result.entity.external_ref.type))return this.call('entity.presentDetails',{trigger_id:event.trigger_id,error:{status:'not_found'}});
        const {app_unfurl_url,...metadata}=result.entity;
        return this.call('entity.presentDetails',{trigger_id:event.trigger_id,metadata});
      }
    }catch(error){console.warn('Entity details could not be refreshed: '+(error.slackCode||error.status||'source_error'));return this.call('entity.presentDetails',{trigger_id:event.trigger_id,error:{status:'custom_partial_view',custom_title:'Source temporarily unavailable',custom_message:'Try Refresh again shortly, or open the original in Forgejo.',actions:[{text:'Open in Forgejo',action_id:'forgejo_open_original',url:link.originalUrl}]}});}
    const linked=await this.oauth.access(envelope.team_id,event.user,raw);
    if(linked)return this.call('entity.presentDetails',{trigger_id:event.trigger_id,error:{status:'restricted',actions:[{text:'Open in Forgejo',action_id:'forgejo_open_original',url:link.originalUrl}]}});
    const user_auth_url=this.oauth.ticket(envelope.team_id,event.user,raw);
    if(user_auth_url)return this.call('entity.presentDetails',{trigger_id:event.trigger_id,user_auth_required:true,user_auth_url});
    return this.call('entity.presentDetails',{trigger_id:event.trigger_id,error:{status:'restricted',actions:[{text:'Open in Forgejo',action_id:'forgejo_open_original',url:link.originalUrl}]}});
  }
  queueHome(envelope) {
    if(envelope.team_id!==this.config.slack.teamId||envelope.api_app_id!==this.config.slack.appId||envelope.event?.tab!=='home'||!/^U[A-Z0-9]+$/.test(envelope.event.user||''))return null;
    return this.homeDispatcher.enqueue(envelope);
  }
  async publishHome(envelope) {
    const event=envelope.event;
    if(envelope.team_id!==this.config.slack.teamId||envelope.api_app_id!==this.config.slack.appId||event?.tab!=='home'||!/^U[A-Z0-9]+$/.test(event.user||''))return;
    let connected=false,connectionError=false;
    try{connected=!!(await this.oauth.access(envelope.team_id,event.user,this.config.forgejo));}catch{connectionError=true;}
    const connectUrl=this.oauth.ticket(envelope.team_id,event.user,this.config.forgejo);
    return this.call('views.publish',{user_id:event.user,view:homeView(this.preferences(envelope.team_id,event.user),{origin:this.config.forgejo,connected,connectionError,connectUrl})});
  }
  async openSettings(payload,reference) {
    const ref=this.store.get('ref:'+reference);
    if(!ref||ref.team!==payload.team.id)return this.call('views.open',{trigger_id:payload.trigger_id,view:this.modal([{type:'section',text:{type:'plain_text',text:'This settings link has expired. Refresh the preview and open its settings again.'}}])});
    return this.openSourceSettings(payload,ref.url);
  }
  async openSourceSettings(payload,url) {
    const id=randomBytes(24).toString('hex');
    this.store.put('settings:'+id,{team:payload.team.id,user:payload.user.id,url,home:payload.view?.type==='home'&&payload.view?.callback_id==='forgejo_home'},600);
    const prefs=this.preferences(payload.team.id,payload.user.id),connect=this.oauth.ticket(payload.team.id,payload.user.id,url);
    return this.call('views.open',{trigger_id:payload.trigger_id,view:settingsView(id,prefs,{connect,url})});
  }
  submitSettings(payload) {
    const session=this.store.get('settings:'+payload.view?.private_metadata);
    const result=saveSettings(payload,this.config,this.store);
    if(result&&!result.response_action&&session?.home)this.queueHome({team_id:payload.team.id,api_app_id:payload.api_app_id,event:{user:payload.user.id,tab:'home'}})?.task.catch(()=>console.warn('App Home refresh failed; reopen Home to retry'));
    return result;
  }
  modal(blocks) {
    return {
      type: "modal",
      title: { type: "plain_text", text: "Forgejo preview" },
      close: { type: "plain_text", text: "Close" },
      blocks,
    };
  }
  async interact(payload) {
    if (
      payload.team?.id !== this.config.slack.teamId ||
      payload.api_app_id !== this.config.slack.appId
    )
      return;
    const action = payload.actions?.[0];
    if(payload.view?.type==='home'&&payload.view?.callback_id==='forgejo_home'&&/^U[A-Z0-9]+$/.test(payload.user?.id||'')){
      if(action?.action_id==='forgejo_home_settings')return this.openSourceSettings(payload,this.config.forgejo);
      if(action?.action_id==='forgejo_home_refresh')return this.queueHome({team_id:payload.team.id,api_app_id:payload.api_app_id,event:{user:payload.user.id,tab:'home'}})?.task;
    }
    if(action?.action_id==='forgejo_settings'&&/^[a-f0-9]{48}$/.test(action.value||''))return this.openSettings(payload,action.value);
    if(action?.action_id==='forgejo_more'&&/^settings:[a-f0-9]{48}$/.test(action.selected_option?.value||''))return this.openSettings(payload,action.selected_option.value.slice(9));
    // URL actions open their native destination; the signed HTTP request has already been acknowledged.
    if (!["forgejo_preview", "forgejo_view_private"].includes(action?.action_id)) return;
    if (
      !/^[a-f0-9]{48}$/.test(action.value || "") ||
      !/^U[A-Z0-9]+$/.test(payload.user?.id || "")
    )
      return;
    const ref = this.store.get("ref:" + action.value);
    if (!ref) {
      await this.call("views.open", {
        trigger_id: payload.trigger_id,
        view: this.modal([{ type: "section", text: { type: "plain_text",
          text: "This preview has expired. Use Open in Forgejo on the message, or share the original link again to refresh the personal preview." } }]),
      });
      return;
    }
    if (ref.team !== payload.team.id) return;
    const original = this.forgejo.parse(ref.url);
    if (!original) return;
    const openOriginal = { type: "actions", elements: [{ type: "button",
      action_id: "forgejo_open_original", text: { type: "plain_text", text: "Open in Forgejo" },
      url: original.originalUrl }] };
    const opened = await this.call("views.open", {
      trigger_id: payload.trigger_id,
      view: this.modal([
        {
          type: "section",
          text: { type: "plain_text", text: "Checking your Forgejo access…" },
        },
      ]),
    });
    const user = payload.user.id,
      team = payload.team.id,
      token = await this.oauth.access(team, user, ref.url);
    let blocks;
    if (!token) {
      const url = this.oauth.ticket(team, user, ref.url);
      if (!url) {
        await this.call("views.update", {
          view_id: opened.view.id,
          view: this.modal([
            openOriginal,
            {
              type: "section",
              text: {
                type: "plain_text",
                text: "Account linking for this Forgejo server is not configured. Open the original below and sign in with your normal account.",
              },
            },
          ]),
        });
        return;
      }
      blocks = [
        {
          type: "section",
          text: {
            type: "plain_text",
            text: "Connect your own Forgejo account. Protected details are shown only in your personal view. This Forgejo version grants broad OAuth access; the integration uses read-only requests. ",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              action_id: "forgejo_connect",
              text: { type: "plain_text", text: "Connect Forgejo" },
              url,
            },
          ],
        },
      ];
    } else {
      try {
        const meta = await this.forgejo.metadata(ref.url, token);
        if (!meta) throw new Error("Unavailable");
        blocks = [
          { type: "header", text: { type: "plain_text", text: meta.title } },
          {
            type: "section",
            text: {
              type: "plain_text",
              text: meta.description || "No description",
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "plain_text",
                text: `${meta.repository} · ${meta.status} · Access checked for your account`,
              },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                action_id: "forgejo_open_original",
                text: { type: "plain_text", text: "Open in Forgejo" },
                url: ref.url,
              },
            ],
          },
        ];
      } catch {
        blocks = [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: "This resource is unavailable to your linked account. It may have changed or your access may have been revoked.",
            },
          },
        ];
      }
    }
    if (!blocks.some(block => block.type === "actions" && block.elements?.some(element => element.action_id === "forgejo_open_original")))
      blocks.push(openOriginal);
    await this.call("views.update", {
      view_id: opened.view.id,
      view: this.modal(blocks),
    });
  }
}
