import { graphic } from "../integrations/link-preview/graphic.mjs";
import { previewFixtures } from "./preview-fixtures.mjs";
import baseTokens from "../tokens.json";
import previewTokens from "../tokens/preview.tokens.json";
import instanceMark from "../assets/instances/hyperide-mark.png?inline";
export default {
  title: "Sharing/Compact previews",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Synthetic visual fixtures. The exact production SVG renderer and DTCG tokens are reused. These images supplement the native text, never duplicate it. Missing counts are not zero.",
      },
    },
  },
};
function render(kind, { width = 480, dark = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `width:${width}px;max-width:100%;padding:0;margin:0;`;
  const fixture = structuredClone(previewFixtures[kind]);
  fixture.brand = { ...fixture.brand, logoData: instanceMark };
  wrapper.innerHTML = graphic(fixture, baseTokens, previewTokens, {
    mode: dark ? "dark" : "light",
  });
  return wrapper;
}
export const Repository = { render: () => render("repository") };
export const Issue = { render: () => render("issue") };
export const PullRequest = { render: () => render("pull") };
export const Commit = { render: () => render("commit") };
export const File = { render: () => render("file") };
export const MissingData = { render: () => render("missing") };
export const RepositoryMobile = {
  render: () => render("repository", { width: 360 }),
};
export const IssueMobile = { render: () => render("issue", { width: 360 }) };
export const PullRequestMobile = {
  render: () => render("pull", { width: 360 }),
};
export const FileMobile = { render: () => render("file", { width: 360 }) };
export const DarkRepository = {
  render: () => render("repository", { dark: true }),
};
export const MessageContext = {
  render: () => {
    const outer = document.createElement("div");
    outer.style.cssText =
      "max-width:480px;padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1f2328;background:white";
    const title = document.createElement("a");
    title.href = "https://git.hyperide.ai/ultrabricks/qa-cli";
    title.textContent = "qa-cli — Headless Telegram Web testing";
    title.style.cssText =
      "font-size:16px;font-weight:600;color:#0969da;text-decoration:none";
    const description = document.createElement("p");
    description.textContent =
      "Keyboard-first browser test tooling. Illustrated metrics below are synthetic, not live qa-cli data.";
    outer.append(title, description, render("repository"));
    return outer;
  },
};
