export function validEnvelope(payload, config) {
  const event = payload?.event;
  if (
    payload?.type !== "event_callback" ||
    payload.team_id !== config.slack.teamId ||
    payload.api_app_id !== config.slack.appId ||
    !/^Ev[A-Za-z0-9]+$/.test(payload.event_id || "") ||
    event?.type !== "link_shared"
  )
    return false;
  if (
    !["composer", "conversations_history"].includes(event.source) ||
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
      typeof event.unfurl_id === "string" &&
      event.unfurl_id.length <= 512 &&
      /^[A-Za-z0-9._-]+$/.test(event.unfurl_id)
    );
  return (
    event.source === "conversations_history" &&
    /^[CDG][A-Z0-9]+$/.test(event.channel || "") &&
    /^\d{10,15}\.\d{1,10}$/.test(event.message_ts || "")
  );
}
export function validInteraction(payload, config) {
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
