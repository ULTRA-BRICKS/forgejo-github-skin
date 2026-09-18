import { Sources } from "../../integrations/link-preview/sources.mjs";
import fs from "node:fs";
import path from "node:path";
import { slackReadiness } from "../../integrations/link-preview/readiness.mjs";
const root = path.resolve(import.meta.dirname, "../..");
try {
  const file = path.resolve(
    process.env.FORGEJO_PREVIEW_CONFIG ||
      path.join(root, ".sharing/config.json"),
  );
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("Private regular config required");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const readiness = slackReadiness(config);
  // Reject duplicate origins and stale namespace assumptions before reporting readiness.
  new Sources(config, {});
  const sources = [
    { id: config.primaryId || "demo", base: config.forgejo, oauth: config.oauth },
    ...(config.instances || []),
  ].map((source) => ({
    id: source.id,
    origin: new URL(source.base).origin,
    oauthConfigured: !!source.oauth?.clientId && !!source.oauth?.clientSecret,
  }));
  const report = {
    checkedAt: new Date().toISOString(),
    configuration: readiness,
    sources,
    scope:
      "Local configuration presence only. This is not signed Slack event delivery or authorized private-view acceptance.",
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--write"))
    fs.writeFileSync(
      path.join(path.dirname(file), "last-diagnostics.json"),
      JSON.stringify(report, null, 2) + "\n",
      { mode: 0o600 },
    );
  if (!readiness.configured) process.exitCode = 2;
} catch {
  console.error(
    "Cannot inspect the trusted local preview configuration. No configuration values were printed.",
  );
  process.exitCode = 1;
}
