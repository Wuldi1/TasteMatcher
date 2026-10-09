import collector from "./collector.js";
import staff from "./staff.js";
import operations from "./operations.js";
import artworks from "./artworks.js";

const pages = { ...collector, ...staff, ...operations };
const state = { role: "collector" };
const esc = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
const button = (label, action, kind = "secondary", extra = "") =>
  `<button type="button" class="btn ${esc(kind)}" data-action="${esc(action)}" ${extra}>${label}</button>`;
const pill = (text, tone = "") =>
  `<span class="tag ${esc(tone)}">${esc(text)}</span>`;
const header = (eyebrow, title, description, actions = "") =>
  `<header class="page-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1 tabindex="-1">${esc(title)}</h1><p class="lead">${esc(description)}</p></div><div class="page-actions row">${actions}</div></header>`;
const field = (label, name, value = "", type = "text") =>
  `<label class="field">${esc(label)}<input class="input" name="${esc(name)}" id="${esc(name)}" type="${esc(type)}" value="${esc(value)}"></label>`;
const artCard = (art, options = {}) =>
  `<article class="art-card"><button class="art-mount" data-action="shell:art" data-id="${esc(art.id)}" aria-label="View ${esc(art.title)} by ${esc(art.artist)}"><img src="${esc(art.image)}" alt="${esc(art.title)} by ${esc(art.artist)}" loading="lazy"></button><div class="art-caption"><p class="artist">${esc(art.artist)}</p><h3>${esc(art.title)}${art.year ? `, ${esc(art.year)}` : ""}</h3><p class="meta">${esc(art.medium)}</p>${options.hidePrice ? "" : `<p class="price">${money(art.price)}</p>`}${options.actions || ""}</div></article>`;
const icons = {
  home: "⌂",
  overview: "⌂",
  taster: "◇",
  suggestions: "✧",
  proposal: "▱",
  catalog: "▦",
  customers: "◉",
  upload: "↑",
  imports: "⇣",
  management: "⊞",
  onboarding: "◌",
  login: "↗",
  privacy: "§",
  terms: "§",
  campaign: "✉",
  customer: "◉",
  composer: "▱",
};
const labels = {
  home: "Your collection",
  taster: "Discover your taste",
  suggestions: "Selected for you",
  proposal: "Private viewing",
  overview: "Gallery overview",
  catalog: "Artworks",
  customers: "Collectors",
  upload: "Add artwork",
  imports: "Auction imports",
  management: "Management",
};
let lastFocus;
let route = "";
let notificationTimer;
const dialog = document.querySelector("#dialog");
function modal(title, html) {
  lastFocus = document.activeElement;
  dialog.innerHTML = `<header class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>${button("Close ×", "shell:close", "ghost", 'aria-label="Close dialog"')}</header><div class="dialog-body">${html}</div>`;
  if (!dialog.open) dialog.showModal();
}
function closeModal() {
  dialog.close();
  lastFocus?.focus();
}
dialog.addEventListener("close", () => lastFocus?.focus());
function notify(message) {
  clearTimeout(notificationTimer);
  const box = document.querySelector("#notification");
  box.textContent = message;
  box.classList.add("visible");
  notificationTimer = setTimeout(() => box.classList.remove("visible"), 6000);
}
function navigate(key) {
  if (location.hash === `#/${key}`) render();
  else location.hash = `/${key}`;
}
const ctx = {
  state,
  artworks,
  esc,
  money,
  button,
  pill,
  header,
  field,
  artCard,
  navigate,
  render,
  notify,
  modal,
  closeModal,
};
const collectorKeys = ["home", "taster", "suggestions", "proposal"];
const staffKeys = ["overview", "catalog", "customers", "upload"];
function navLink(key) {
  return `<a href="#/${key}" class="nav-link ${route === key ? "active" : ""}" ${route === key ? 'aria-current="page"' : ""}><span aria-hidden="true">${icons[key] || "·"}</span>${labels[key] || pages[key].title}</a>`;
}
function render() {
  const previous = route;
  route = location.hash.replace(/^#\//, "").split("?")[0] || "home";
  if (!pages[route]) route = "home";
  const page = pages[route],
    isCollector = state.role === "collector";
  const publicPage = ["login", "onboarding", "privacy", "terms"].includes(
    route,
  );
  const nav = isCollector ? collectorKeys : staffKeys;
  const secondary = isCollector
    ? []
    : [
        ...(["owner", "admin"].includes(state.role) ? ["imports"] : []),
        "management",
      ];
  const options = Object.entries(pages)
    .map(
      ([key, p]) =>
        `<option value="${key}" ${route === key ? "selected" : ""}>${esc(p.title)}</option>`,
    )
    .join("");
  document.title = `${page.title} — TasteMatcher design proposal`;
  document.querySelector("#app").innerHTML =
    `<div class="review-bar"><span><b>DESIGN PREVIEW</b><span class="preview-detail"> · Sample data · Changes stay in this tab</span></span><div class="row"><label class="sr-only" for="page-picker">Review any page</label><select id="page-picker" data-action="shell:page">${options}</select><label class="sr-only" for="role-picker">Preview role</label><select id="role-picker" data-action="shell:role">${[
      ["collector", "Collector"],
      ["dealer", "Advisor"],
      ["owner", "Gallery owner"],
      ["admin", "Administrator"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${state.role === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select>${button("Design notes", "shell:notes", "review-button")}</div></div><div class="app-layout ${publicPage ? "public-layout" : ""}">${publicPage ? "" : `<aside class="sidebar"><a class="brand" href="#/${isCollector ? "home" : "overview"}"><span class="monogram" aria-hidden="true">T<span>M</span></span><span>TasteMatcher<small>PRIVATE ART ADVISORY</small></span></a><div class="nav-section-label">${isCollector ? "YOUR PRIVATE GALLERY" : "ADVISORY WORKSPACE"}</div><nav aria-label="Primary navigation">${nav.map(navLink).join("")}${secondary.length ? `<div class="nav-section-label secondary-label">GALLERY OPERATIONS</div>${secondary.map(navLink).join("")}` : ""}</nav><div class="sidebar-bottom"><div class="advisory-note"><span class="gold-rule"></span><p>Art, considered.<br>Taste, understood.</p></div>${button('<span class="avatar">EA</span><span>Eleanor Ashford<small>' + (isCollector ? "Private collector" : "Gallery advisor") + "</small></span><span>⌄</span>", "shell:account", "account")}</div></aside>`}<div class="workspace"><div class="topbar"><span>${publicPage ? '<a class="wordmark" href="#/home">TasteMatcher</a>' : `<span class="breadcrumb">${isCollector ? "Private collection" : "Gallery workspace"}</span><span class="crumb-divider">/</span><span>${esc(page.title)}</span>`}</span><div class="row"><span class="discreet">PERSONAL. CONSIDERED. YOURS.</span>${button("Aa", "shell:preferences", "ghost", 'aria-label="Display preferences"')}</div></div><main id="main" class="page page-${route}">${page.render(ctx)}</main><footer class="page-footer"><span>TASTEMATCHER · PRIVATE ART ADVISORY</span><span><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><button data-action="shell:credits">Image credits</button></span></footer></div>${publicPage ? "" : `<nav class="mobile-nav" aria-label="Mobile navigation">${nav.slice(0, 3).map(navLink).join("")}${button("More", "shell:more", "ghost")}</nav>`}</div>`;
  if (previous !== route) {
    window.scrollTo(0, 0);
    document.querySelector("h1")?.focus({ preventScroll: true });
  }
  page.mount?.(ctx);
}
function dispatch(event) {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  if (event.type === "click" && el.matches("input,select,textarea")) return;
  const name = el.dataset.action;
  if (event.type === "change" && !el.matches("input,select,textarea")) return;
  if (event.type === "submit") event.preventDefault();
  if (name === "shell:close") return closeModal();
  if (name === "shell:page") {
    if (
      [
        "overview",
        "customers",
        "customer",
        "composer",
        "upload",
        "management",
        "campaign",
      ].includes(el.value) &&
      state.role === "collector"
    )
      state.role = "dealer";
    if (el.value === "imports" && !["owner", "admin"].includes(state.role))
      state.role = "owner";
    return navigate(el.value);
  }
  if (name === "shell:role") {
    state.role = el.value;
    return navigate(state.role === "collector" ? "home" : "overview");
  }
  if (name === "shell:more")
    return modal(
      "Your workspace",
      `<nav class="stack">${(state.role === "collector" ? collectorKeys : [...staffKeys, ...(["owner", "admin"].includes(state.role) ? ["imports"] : []), "management"]).map(navLink).join("")}</nav>`,
    );
  if (name === "shell:account")
    return modal(
      "Your account",
      `<div class="stack"><div class="row"><span class="avatar large">EA</span><div><h3>Eleanor Ashford</h3><p class="muted">Sample ${esc(state.role)} account</p></div></div><a class="btn secondary" href="#/onboarding">Edit taste profile</a><a class="btn ghost" href="#/login">Preview sign-in experience</a><p class="small muted">This is a fictional account for the design proposal.</p></div>`,
    );
  if (name === "shell:preferences")
    return modal(
      "Display preferences",
      `<div class="stack"><p class="muted">Preview settings for this session.</p><label class="field">Currency<select data-action="shell:currency"><option>USD</option><option>EUR</option><option>GBP</option></select></label><label class="field">Dimensions<select data-action="shell:units"><option>Inches</option><option>Centimeters</option></select></label><p class="small">The proposal uses illustrative USD prices. Currency conversion will continue to use the app’s existing formatting in implementation.</p></div>`,
    );
  if (name === "shell:currency" || name === "shell:units")
    return notify(
      `${el.value} preference previewed. Sample values retain their labelled original units.`,
    );
  if (name === "shell:credits")
    return modal(
      "Artwork credits",
      `<p class="muted">Artwork images and original metadata are public-domain collection records from The Metropolitan Museum of Art. They are visual stand-ins for the interface design, not works available for sale. Prices, collectors, proposals, and activity are entirely illustrative.</p><div class="stack">${artworks.map((a) => `<p><a href="${esc(a.sourcePage)}" target="_blank" rel="noopener noreferrer">${esc(a.artist)} — ${esc(a.title)} ↗</a></p>`).join("")}</div>`,
    );
  if (name === "shell:notes")
    return modal(
      "A more considered TasteMatcher",
      `<div class="stack"><p class="lead">A private art advisory, built around the work and the person collecting it.</p><div class="grid two"><section><h3>For collectors</h3><p>Large, uncropped artwork; editorial typography; a clear next step; your advisor close at hand. Discover, reflect, and review at your own pace.</p></section><section><h3>For galleries</h3><p>Compact directories, focused curation, deliberate publication, and inspectable import results. The same visual care, with practical working density.</p></section></div><p><strong>Review every page</strong> using the page selector above. The role selector previews collector, advisor, owner, and administrator navigation. This isolated prototype simulates workflows without contacting the app’s services.</p><p>Full source-linked audits sit alongside this prototype in <code>docs/design/</code>. The proposal specifies additional states and production acceptance criteria beyond this interactive sample.</p></div>`,
    );
  if (name === "shell:art") {
    const a = artworks.find((a) => a.id === el.dataset.id);
    if (!a) return;
    return modal(
      a.title,
      `<div class="split art-detail"><div class="art-mount"><img src="${esc(a.image)}" alt="${esc(a.title)}"></div><section class="stack"><p class="eyebrow">THE WORK</p><h2>${esc(a.artist)}</h2><p class="serif">${esc(a.title)}, ${esc(a.year)}</p><p>${esc(a.medium)}</p><p class="muted">${esc(a.dimensions)}</p><hr><p class="small muted">ILLUSTRATIVE PRICE</p><h3>${state.role === "collector" && state.staff?.hidden?.includes(a.id) ? "Price on request" : money(a.price)}</h3><p class="small muted">Public-domain museum artwork used as a visual stand-in. Sample price is not an offer or valuation.</p></section></div>`,
    );
  }
  // Actions remain with their owning screen, including dialogs that render over it.
  if (pages[route].action?.(name, el, ctx, event)) return;
  for (const page of Object.values(pages))
    if (page !== pages[route] && page.action?.(name, el, ctx, event)) return;
}
document.addEventListener("click", dispatch);
document.addEventListener("change", dispatch);
document.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.dataset.action) dispatch(e);
});
document.addEventListener("keydown", (event) => {
  document.documentElement.dataset.keyboard = "true";
  if (pages[route]?.keydown) pages[route].keydown(event, ctx);
});
document.addEventListener(
  "pointerdown",
  () => delete document.documentElement.dataset.keyboard,
);
window.addEventListener("hashchange", () => {
  if (dialog.open) closeModal();
  render();
});
render();
