export function validEnvelope(payload, config) {
  const event = payload?.event;
  if (
    payload?.type !== "event_callback" ||
    payload.team_id !== config.slack.teamId ||
    payload.api_app_id !== config.slack.appId ||
    !/^Ev[A-Za-z0-9]+$/.test(payload.event_id || "") ||
    !["link_shared","entity_details_requested","app_home_opened"].includes(event?.type)
  )
    return false;
  if(event.type==='app_home_opened')return /^U[A-Z0-9]+$/.test(event.user||'') && ['home','messages','about'].includes(event.tab) && (!event.channel || /^D[A-Z0-9]+$/.test(event.channel));
  if(event.type==='entity_details_requested')return /^U[A-Z0-9]+$/.test(event.user||'') &&
    typeof event.trigger_id==='string' && event.trigger_id.length>0 && event.trigger_id.length<=512 &&
    typeof event.entity_url==='string' && event.entity_url.length<=4096 &&
    (!event.channel || /^[CG][A-Z0-9]+$/.test(event.channel));
  if (
    ![undefined,"composer", "conversations_history"].includes(event.source) ||
    !/^U[A-Z0-9]+$/.test(event.user || "")
  )
    return false;
  if (
    !Array.isArray(event.links) ||
    event.links.length < 1 ||
    event.links.length > 20 ||
    !event.links.every(
      (x) => typeof x?.url === "string" && x.url.length <= 4096,
    )
  )
    return false;
  if (event.unfurl_id)
    return (
      ["composer","conversations_history"].includes(event.source) &&
      typeof event.unfurl_id === "string" &&
      event.unfurl_id.length <= 512 &&
      /^[A-Za-z0-9._-]+$/.test(event.unfurl_id)
    );
  return (
    [undefined,"conversations_history"].includes(event.source) &&
    /^[CDG][A-Z0-9]+$/.test(event.channel || "") &&
    /^\d{10,15}\.\d{1,10}$/.test(event.message_ts || "")
  );
}
export function validInteraction(payload, config) {
  if(payload?.type==='view_submission')return payload.team?.id===config.slack.teamId && payload.api_app_id===config.slack.appId &&
    /^U[A-Z0-9]+$/.test(payload.user?.id||'') && payload.view?.callback_id==='forgejo_preview_preferences';
  return (
    payload?.type === "block_actions" &&
    payload.team?.id === config.slack.teamId &&
    payload.api_app_id === config.slack.appId &&
    /^U[A-Z0-9]+$/.test(payload.user?.id || "") &&
    typeof payload.trigger_id === "string" &&
    payload.trigger_id.length <= 512 &&
    Array.isArray(payload.actions) &&
    payload.actions.length === 1
  );
}
export class Budget {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.start = Date.now();
    this.count = 0;
  }
  allow() {
    if (Date.now() - this.start >= this.windowMs) {
      this.start = Date.now();
      this.count = 0;
    }
    return ++this.count <= this.limit;
  }
}
