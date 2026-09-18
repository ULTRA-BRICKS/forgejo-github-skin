import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  renderGraphic,
  closeRenderer,
} from "../../integrations/link-preview/raster.mjs";
import { previewFixtures } from "../../stories/preview-fixtures.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.join(root, "research/screenshots/preview-v2");
const logo =
  "data:image/png;base64," +
  (
    await fs.readFile(path.join(root, "assets/instances/hyperide-mark.png"))
  ).toString("base64");
await fs.mkdir(out, { recursive: true });
const pairs = [];
try {
  for (const [kind, story] of [
    ["repository", "repository"],
    ["issue", "issue"],
    ["pull", "pull-request"],
    ["commit", "commit"],
    ["file", "file"],
  ]) {
    const meta = structuredClone(previewFixtures[kind]);
    meta.brand = { ...meta.brand, logoData: logo };
    const candidate = path.join(out, "runtime-" + story + ".png");
    await fs.writeFile(candidate, await renderGraphic(meta));
    pairs.push({
      kind,
      storybook: path.join(out, story + "-480.png"),
      runtime: candidate,
    });
  }
} finally {
  await closeRenderer();
}
const program = `import sys,json\nfrom PIL import Image,ImageChops,ImageStat\nresults=[]\nfor pair in json.load(sys.stdin):\n a=Image.open(pair['storybook']).convert('RGB');b=Image.open(pair['runtime']).convert('RGB')\n assert a.size==b.size\n diff=ImageChops.difference(a,b);mean=sum(ImageStat.Stat(diff).mean)/3\n results.append({'kind':pair['kind'],'dimensions':list(a.size),'mae':mean,'pixelIdentical':diff.getbbox() is None})\nprint(json.dumps(results))\n`;
const results = JSON.parse(
  execFileSync("python3", ["-c", program], {
    input: JSON.stringify(pairs),
    encoding: "utf8",
  }),
);
await fs.writeFile(
  path.join(root, "research/preview-renderer-parity.json"),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        "Literal pixel comparison: Storybook SVG screenshot versus server PNG renderer with identical synthetic facts, fonts, DPR and viewport. Not a GitHub similarity percentage.",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => !r.pixelIdentical)) process.exitCode = 1;
