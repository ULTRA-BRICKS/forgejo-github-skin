import { unfurlLayout } from "./unfurl-layout.mjs";
import { isAccessDenied } from "./forgejo.mjs";
import { randomBytes } from "node:crypto";
import {
  richCard,
  protectedCard,
} from "../../ops/handoff/slack/preview-core.mjs";
export class SlackIntegration {
  constructor(config, store, forgejo, oauth) {
    Object.assign(this, { config, store, forgejo, oauth });
  }
  async call(method, payload) {
    if (
      ![
        "chat.unfurl",
        "views.open",
        "views.update",
        "conversations.info",
        "auth.test",
      ].includes(method)
    )
      throw new Error("Slack method rejected");
    const r = await fetch("https://slack.com/api/" + method, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.config.slack.botToken,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const e = new Error("Slack HTTP " + r.status);
      e.retryAfter = Number(r.headers.get("retry-after")) || 10;
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
  async publicMetadata(url) {
    try {
      return await this.forgejo.metadata(url);
    } catch (e) {
      if (isAccessDenied(e.status)) return null;
      throw e;
    }
  }
  async unfurl(envelope) {
    const event = envelope.event;
    if (
      envelope.team_id !== this.config.slack.teamId ||
      envelope.api_app_id !== this.config.slack.appId ||
      event.type !== "link_shared"
    )
      return;
    const unfurls = {};
    for (const raw of event.links.slice(0, 5)) {
      const parsed = this.forgejo.parse(raw.url);
      if (!parsed) continue;
      let meta = await this.publicMetadata(raw.url),
        facts;
      if (!meta) {
        const viewerToken = await this.oauth.access(envelope.team_id, event.user, raw.url);
        if (viewerToken) {
          try {
            meta = await this.forgejo.metadata(raw.url, viewerToken);
          } catch (error) {
            if (!isAccessDenied(error.status)) throw error;
          }
        }
      }
      if (meta && !meta.private)
        facts = {
          resourceVerified: true,
          checkIsFresh: true,
          visibility: "public",
          anonymousReadable: true,
          resourceUrl: meta.link.resourceUrl,
        };
      else if (
        event.source === "conversations_history" &&
        event.user === this.config.slack.disclosureUser &&
        event.channel === this.config.slack.demoChannel
      ) {
        const token = await this.oauth.access(
          envelope.team_id,
          event.user,
          raw.url,
        );
        if (token) {
          try {
            meta = await this.forgejo.metadata(raw.url, token);
            const { channel } = await this.call("conversations.info", {
              channel: event.channel,
            });
            facts = {
              resourceVerified: !!meta,
              checkIsFresh: true,
              visibility: meta?.private ? "private" : "public",
              anonymousReadable: false,
              postingUserCanRead: !!meta,
              postingUserMayDisclose: true,
              source: event.source,
              workspaceId: envelope.team_id,
              repositoryId: meta?.repositoryId,
              instanceOrigin: new URL(parsed.originalUrl).origin,
              resourceUrl: meta?.link.resourceUrl,
              channel: {
                id: channel.id,
                isPrivate: channel.is_private,
                isExternalShared: channel.is_ext_shared,
                isPendingExternalShared: channel.is_pending_ext_shared,
                isOrgShared: channel.is_org_shared,
                isShared: channel.is_shared,
                metadataFresh: true,
              },
            };
          } catch (e) {
            if (
              !isAccessDenied(e.status) &&
              !e.message.startsWith("Slack rejected")
            )
              throw e;
            meta = null;
          }
        }
      }
      let card = protectedCard(this.reference(envelope.team_id, parsed.originalUrl), parsed);
      if (meta?.private && !facts) {
        card.blocks.splice(1, 0, {
          type: "section",
          text: { type: "plain_text", text: meta.repository + " · Private repository", emoji: false },
        });
      }
      if (meta && facts) {
        try {
          card = unfurlLayout(
            meta,
            facts,
            {
              privateMode: "explicit-channel-disclosure",
              destinations: this.config.privateDestinations,
            },
            this.config.origin,
          );
        } catch {
          /* Fail closed to a neutral, personal-view card. */
        }
      }
      unfurls[raw.url] = card;
    }
    if (!Object.keys(unfurls).length) return;
    const target = event.unfurl_id
      ? { unfurl_id: event.unfurl_id, source: event.source }
      : { channel: event.channel, ts: event.message_ts };
    try {
      await this.call("chat.unfurl", { ...target, unfurls });
    } catch (error) {
      // A rich image must never make the entire snippet disappear. Slack can
      // reject an otherwise valid unfurl when it cannot fetch the image.
      if (!["cannot_unfurl_url", "invalid_blocks"].includes(error.slackCode)) throw error;
      const fallback = Object.fromEntries(Object.entries(unfurls).map(([url, card]) => [url, {
        blocks: card.blocks.filter(block => block.type !== "image"),
      }]));
      await this.call("chat.unfurl", { ...target, unfurls: fallback });
    }
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
            text: "Connect your own Forgejo account. Protected details are shown only in your personal view. This Forgejo version grants broad OAuth access; the integration uses read-only requests. The integration uses your own Forgejo account and read-only requests.",
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
