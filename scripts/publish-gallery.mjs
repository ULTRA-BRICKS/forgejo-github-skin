import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, ".."),
  output = path.join(root, ".vercel/output");
const project = JSON.parse(
  await fs.readFile(path.join(root, ".vercel/project.json"), "utf8"),
);
if (project.projectName !== "forgejo-ui")
  throw new Error("Only the existing Forgejo UI gallery may be updated");
if (
  execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: root,
    encoding: "utf8",
  }).trim()
)
  throw new Error("Publish committed sources and evidence only");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, "static"), { recursive: true });
const allowed = (source) =>
  !source.endsWith(".map") && !/\.(woff2?|ttf|otf|eot|ttc|otc)$/i.test(source);
await fs.cp(path.join(root, "storybook-static"), path.join(output, "static"), {
  recursive: true,
  filter: allowed,
});
await fs.writeFile(
  path.join(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/(.*)",
          headers: {
            "X-Robots-Tag": "noindex, nofollow",
            "X-Content-Type-Options": "nosniff",
          },
        },
        { handle: "filesystem" },
      ],
    },
    null,
    2,
  ),
);
for (const [source, destination] of [
  ["storybook", "evidence"],
  ["demo", "demo-evidence"],
  ["sharing", "sharing-evidence"],
  ["preview-v2", "preview-v2"],
  ["mobile-parity", "mobile-parity"],
  ["layout-fixes", "layout-fixes"],
  ["slack-native", "slack-native"],
]) {
  const directory = path.join(root, "research/screenshots", source);
  if (!(await fs.stat(directory).catch(() => null))?.isDirectory()) continue;
  const target = path.join(output, "static", destination);
  await fs.mkdir(target, { recursive: true });
  for (const name of await fs.readdir(directory)) {
    if (!/^[a-z0-9-]+\.png$/.test(name)) continue;
    const file = path.join(directory, name),
      stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 3 * 1024 * 1024)
      throw new Error("Unexpected evidence file");
    execFileSync(
      "git",
      ["ls-files", "--error-unmatch", "--", path.relative(root, file)],
      { cwd: root, stdio: "pipe" },
    );
    await fs.copyFile(file, path.join(target, name));
  }
}
await fs.copyFile(
  path.join(root, "assets/forgejo-graphite.svg"),
  path.join(output, "static/forgejo-graphite.svg"),
);
for (const name of ["DANNY-INSTALL.md", "PREVIEW-V2-ACCEPTANCE.md"])
  await fs.copyFile(
    path.join(root, "docs", name),
    path.join(output, "static", name),
  );
await fs.copyFile(
  path.join(root, "research/preview-renderer-parity.json"),
  path.join(output, "static/preview-v2/pixel-proof.json"),
);
console.log(
  "Staged reviewed Storybook and tracked PNG evidence; no credentials, source tree, maps or font binaries.",
);
if (process.argv.includes("--deploy"))
  execFileSync(
    "vercel",
    [
      "deploy",
      "--prebuilt",
      "--prod",
      "--yes",
      "--scope",
      "inventorems-projects",
    ],
    { cwd: root, stdio: "inherit" },
  );
