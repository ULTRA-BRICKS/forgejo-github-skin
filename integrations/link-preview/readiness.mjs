const REQUIRED_SLACK_FIELDS = ["teamId", "appId", "signingSecret", "botToken"];
/** Configuration presence only. A live signed event and authorized view are separate acceptance gates. */
export function slackReadiness(config) {
  const missing = REQUIRED_SLACK_FIELDS.filter((key) => {
    const value = config?.slack?.[key];
    return typeof value !== "string" || !value.trim();
  });
  return { configured: missing.length === 0, missing };
}
