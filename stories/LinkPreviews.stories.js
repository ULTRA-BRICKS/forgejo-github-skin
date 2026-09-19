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
function render(kind, { width = 480, mode = "adaptive", surface = "light" } = {}) {
  const wrapper = document.createElement("div");
  if (kind === "missing" || kind === "protectedUnavailable") {
    wrapper.style.cssText = "width:" + width + "px;max-width:100%;padding:16px;border:1px dashed #d1d9e0;border-radius:8px;color:#59636e;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;";
    wrapper.textContent = "No image emitted — Slack keeps the text link/card without a meaningless placeholder graphic.";
    return wrapper;
  }
  wrapper.style.cssText = `width:${width}px;max-width:100%;padding:10px;margin:0;border-radius:8px;background:${surface === "dark" ? "#0d1117" : surface === "checker" ? "repeating-conic-gradient(#f6f8fa 0 25%,#fff 0 50%) 0/24px 24px" : "#fff"};`;
  const fixture = structuredClone(previewFixtures[kind]);
  fixture.brand = { ...fixture.brand, logoData: instanceMark };
  wrapper.innerHTML = graphic(fixture, baseTokens, previewTokens, {
    mode,
  });
  return wrapper;
}
export const Repository = { render: () => render("repository") };
export const Issue = { render: () => render("issue") };
export const PullRequest = { render: () => render("pull") };
export const Commit = { render: () => render("commit") };
export const File = { render: () => render("file") };
export const PrivateRepository = { render: () => render("privateRepository") };
export const PrivatePullRequest = { render: () => render("privatePull") };
export const ProtectedUnavailable = { render: () => render("protectedUnavailable") };
export const MissingData = { render: () => render("missing") };
export const RepositoryMobile = {
  render: () => render("repository", { width: 360 }),
};
export const IssueMobile = { render: () => render("issue", { width: 360 }) };
export const PullRequestMobile = {
  render: () => render("pull", { width: 360 }),
};
export const FileMobile = { render: () => render("file", { width: 360 }) };
export const AdaptiveOnLight = { render: () => render("repository", { surface: "light" }) };
export const AdaptiveOnDark = { render: () => render("repository", { surface: "dark" }) };
export const AdaptiveTransparency = { render: () => render("repository", { surface: "checker" }) };
export const DarkRepository = { render: () => render("repository", { mode: "dark", surface: "dark" }) };
export const Gallery = {
  render: () => {
    const wrap = document.createElement("main");
    wrap.style.cssText = "padding:24px;max-width:1080px;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
    const title = document.createElement("h1"); title.textContent = "Forgejo snippet states"; wrap.append(title);
    const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px";
    for (const [label, kind] of [["Repository","repository"],["Issue","issue"],["Pull request","pull"],["Commit","commit"],["File","file"],["Private repository","privateRepository"],["Private pull request","privatePull"],["Unavailable protected resource","protectedUnavailable"],["Missing data","missing"]]) {
      const section=document.createElement("section"), h=document.createElement("h2"); h.textContent=label; section.append(h,render(kind)); grid.append(section);
    }
    wrap.append(grid); return wrap;
  },
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
