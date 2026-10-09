import legal from "./legal.js";

const get = (c) =>
  (c.state.collector ||= {
    taste: 0,
    likes: [],
    dislikes: [],
    notes: {},
    decisions: {},
    messages: [],
    step: 1,
    profile: {
      name: "Eleanor Ashford",
      email: "eleanor@example.com",
      residence: "London, United Kingdom",
    },
    images: [],
    phase: "email",
    email: "eleanor@example.com",
  });
const link = (label, key, kind = "secondary") =>
  `<a class="btn ${kind}" href="#/${key}">${label}</a>`;
const value = (name) => document.querySelector(`[name="${name}"]`)?.value || "";
const filePreview = (el, c) => {
  const file = el.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)
    return c.notify("Choose an image smaller than 10 MB.");
  get(c).images.push(URL.createObjectURL(file));
  c.render();
  c.notify("Image preview added locally. Nothing was uploaded.");
};

function home(c) {
  const s = get(c),
    a = c.artworks[0];
  return `${c.header("YOUR PRIVATE GALLERY", "A collection, distinctly yours.", "A considered selection. A personal conversation. A new perspective.", link("Your taste profile", "onboarding", "ghost"))}
 <div class="collector-home-grid"><section class="collector-feature"><div class="feature-art"><img src="${a.image}" alt="${c.esc(a.title)} by ${c.esc(a.artist)}"></div><div class="feature-copy"><div><p class="eyebrow">AN INVITATION TO LOOK CLOSER</p><h2>The beginning of<br>your next discovery.</h2><p class="muted">Explore a selection shaped by what moves you.</p></div>${link("Explore your selection &nbsp; ↗", "suggestions", "primary")}</div><p class="art-credit">${c.esc(a.artist)} · ${c.esc(a.title)} · ${c.esc(a.year)}</p></section>
 <aside class="stack"><section class="viewing-card"><p class="eyebrow">YOUR PRIVATE VIEWING</p><h2>Three works.<br>A new conversation.</h2><p>Your advisor’s proposal is ready for your consideration.</p><div class="mini-art-row">${c.artworks
   .slice(0, 3)
   .map((a) => `<img src="${a.image}" alt="${c.esc(a.title)}">`)
   .join(
     "",
   )}</div>${link("Enter private viewing &nbsp; →", "proposal", "primary")}</section><section class="panel advisor-card"><div class="row"><span class="avatar">JL</span><div><h3>Julian Laurent</h3><p class="small muted">Your art advisor · Sample conversation</p></div></div><p class="advisor-quote">“I’d love to hear which of these works stays with you.”</p><div class="conversation">${s.messages.map((m) => `<div class="message mine">${c.esc(m)}</div>`).join("")}</div><form data-action="collector:message" class="message-composer"><label class="sr-only" for="message">Message your advisor</label><input id="message" name="message" placeholder="Share a thought…" class="input">${c.button("↗", "collector:message", "ghost", 'aria-label="Add sample message"')}</form><p class="small muted">Messages in this preview stay in this tab.</p></section></aside></div>
 <section class="taste-strip"><div><p class="eyebrow">YOUR TASTE, IN PROGRESS</p><h2>A little curiosity goes a long way.</h2></div><div class="row"><div class="taste-count"><strong>${18 + s.taste}</strong><span>works explored</span></div>${link("Continue discovering →", "taster", "ghost")}${link("View saved works", "catalog", "ghost")}</div></section>`;
}

function taster(c) {
  const s = get(c),
    a = c.artworks[s.taste % c.artworks.length];
  return `${c.header("DISCOVER YOUR TASTE", "Follow your instinct.", "Take a moment with each work. There is no right answer.", link("Your selection →", "suggestions", "ghost"))}<section class="tasting-room"><div class="tasting-top"><span>${18 + s.taste} works explored</span><span>${s.taste < 2 ? `${2 - s.taste} more to reach 20` : "Taste profile ready"}</span></div><div class="progress"><span style="width:${Math.min(100, (18 + s.taste) * 5)}%"></span></div><div class="tasting-art" id="taste-art"><img src="${a.image}" alt="${c.esc(a.title)} by ${c.esc(a.artist)}" draggable="false"></div><div class="tasting-caption"><p class="eyebrow">${c.esc(a.artist)}</p><h2>${c.esc(a.title)}</h2><p class="muted small">${c.esc(a.year)} · ${c.esc(a.medium)}</p></div><div class="tasting-controls">${c.button("← &nbsp; Not for me", "collector:dislike", "secondary")}${c.button("I like this &nbsp; →", "collector:like", "primary")}</div><p class="small muted center">Use the arrow keys, the buttons, or swipe the artwork.</p><p class="small muted center">Local sample session. Choices are not sent to your profile.</p></section>`;
}

function suggestions(c) {
  const s = get(c);
  return `${c.header("SELECTED FOR YOU", "A dialogue with your taste.", "Works to return to, think about, and discuss with your advisor.", link("Refine your taste", "taster", "ghost"))}<div class="curatorial-intro"><span class="gold-rule"></span><p>“The most interesting collections begin with a personal connection.”</p><span class="small muted">A sample selection for your design review</span></div><div class="art-grid">${c.artworks.map((a) => `<article class="art-card">${c.artCard(a, { hidePrice: true })}<div class="row">${c.button(s.likes.includes(a.id) ? "✓ Liked" : "♡ Like", "collector:vote", "ghost", `data-id="${a.id}" data-vote="like" aria-pressed="${s.likes.includes(a.id)}"`)}${c.button(s.dislikes.includes(a.id) ? "Not for me ✓" : "Not for me", "collector:vote", "ghost", `data-id="${a.id}" data-vote="dislike" aria-pressed="${s.dislikes.includes(a.id)}"`)}</div><details><summary>${s.notes[a.id] ? "Edit your note" : "Add a note for your advisor"}</summary><label class="field">Your impression<textarea data-action="collector:note" data-id="${a.id}">${c.esc(s.notes[a.id] || "")}</textarea></label><p class="small muted">Saved in this preview when you leave the field.</p></details>${c.state.role === "collector" ? "" : `<details><summary>Recommendation signals · advisor view</summary><p class="small">Sample match 86%. Image 82 · Intent 91 · Metadata 76 · Behavior +2. These are recommendation signals, not purchase probabilities or additive percentages.</p>${link("Curate a proposal", "composer", "primary")}</details>`}</article>`).join("")}</div>`;
}

function proposal(c) {
  const s = get(c);
  return `${c.header("A PRIVATE VIEWING · PREPARED FOR ELEANOR", "Art worth living with.", "Three works, chosen as the beginning of a conversation.")}
 <div class="viewing-intro"><p class="serif">An exploration of light, character,<br>and the everyday, transformed.</p><div><p class="small muted">PREPARED BY</p><p>Julian Laurent</p><p class="small muted">Your personal art advisor</p></div></div><div class="stack">${c.artworks
   .slice(0, 3)
   .map(
     (a, i) =>
       `<article class="viewing-work"><button class="art-mount" data-action="shell:art" data-id="${a.id}" aria-label="View ${c.esc(a.title)}"><img src="${a.image}" alt="${c.esc(a.title)}"></button><div class="stack"><p class="eyebrow">0${i + 1} / THE SELECTION</p><div><h2>${c.esc(a.artist)}</h2><p class="serif work-title">${c.esc(a.title)}</p><p class="muted small">${c.esc(a.year)} · ${c.esc(a.medium)}</p></div><p class="muted small">${c.esc(a.dimensions)}</p><div class="grid two"><div><p class="eyebrow">BIDDING START</p><p>${c.money(a.low)}</p></div><div><p class="eyebrow">BIDDING ADVICE</p><p>${c.money(a.high)}</p></div></div><p class="small muted">Illustrative pricing · museum imagery used as a design stand-in</p><div class="row">${c.button(s.decisions[a.id] === "accepted" ? "✓ Accepted" : "Accept artwork", "collector:decision", s.decisions[a.id] === "accepted" ? "primary" : "secondary", `data-id="${a.id}" data-value="accepted"`)}${c.button(s.decisions[a.id] === "rejected" ? "✓ Rejected" : "Reject artwork", "collector:decision", "ghost", `data-id="${a.id}" data-value="rejected"`)}</div><label class="field">A note for your advisor<textarea data-action="collector:proposal-note" data-id="${a.id}" rows="2" placeholder="Tell us what you think…">${c.esc(s.notes["proposal" + a.id] || "")}</textarea></label></div></article>`,
   )
   .join(
     "",
   )}</div><div class="action-bar"><div><strong>${Object.keys(s.decisions).length} of 3 works considered</strong><p class="small muted">${s.updated ? "Responses updated in this sample session." : "Your decisions are staged until you update the proposal."}</p></div>${c.button("Update sample proposal", "collector:update-proposal", "primary")}</div>`;
}

const steps = ["About you", "Art interests", "Your collection", "Inspiration"];
function onboarding(c) {
  const s = get(c),
    step = s.step;
  let body = "";
  if (step === 1)
    body = `<h2>A personal introduction.</h2><p class="muted">A few details help your advisor get to know you.</p>${c.field("Full name", "profile-name", s.profile.name)}${c.field("Email address", "profile-email", s.profile.email, "email")}${c.field("Primary residence", "profile-residence", s.profile.residence)}`;
  if (step === 2)
    body = `<h2>What draws your attention?</h2><p class="muted">Choose the kind of work you are most interested in buying.</p><div class="grid two">${["Paintings", "Prints", "Sculptures", "Photographs"].map((t) => `<label class="choice"><input type="radio" name="interest" value="${t}" ${s.profile.interest === t ? "checked" : ""} data-action="collector:interest"><span>${t}</span></label>`).join("")}</div>`;
  if (step === 3)
    body = `<h2>Your relationship with art.</h2><p class="muted">Do you currently collect art?</p><div class="row">${["Yes, I collect", "Not yet"].map((t) => c.button(t, "collector:collect", s.profile.collect === t ? "primary" : "secondary", `data-value="${t}" aria-pressed="${s.profile.collect === t}"`)).join("")}</div><label class="upload-zone">Share a work from your collection <span class="small muted">Optional · JPG, PNG or WebP · Up to 10 MB · local preview only</span><input type="file" accept="image/jpeg,image/png,image/webp" data-action="collector:image"></label>${imageStrip(c)}`;
  if (step === 4)
    body = `<h2>What inspires you?</h2><p class="muted">Artists, places, colors, a feeling. Give your advisor a sense of your world.</p><label class="field">Your inspiration<textarea name="profile-inspiration" rows="5">${c.esc(s.profile.inspiration || "")}</textarea></label><label class="upload-zone">Add an inspiration image<span class="small muted">Optional · image under 10 MB · local preview only</span><input type="file" accept="image/*" data-action="collector:image"></label>${imageStrip(c)}`;
  return `${c.header("A PERSONAL INTRODUCTION", "Your eye. Your story.", "A considered collection begins with understanding you.", link("Return to your gallery", "home", "ghost"))}<div class="onboarding-layout"><aside><ol class="step-list">${steps.map((t, i) => `<li class="${step === i + 1 ? "current" : ""}">${c.button(`<span class="step-number">${i + 1}</span>${t}`, "collector:step", "ghost", `data-step="${i + 1}"`)}</li>`).join("")}</ol><p class="serif onboarding-note">“The work you love<br>is the best place<br>to begin.”</p><p class="small muted">You can return to these preferences at any time.</p></aside><form class="panel stack" data-action="collector:next">${body}<div class="divider"></div><div class="row between">${c.button(step === 1 ? "Skip for now" : "← Back", step === 1 ? "collector:skip" : "collector:back", "ghost")}${c.button(step === 4 ? "Start discovering →" : "Save and continue →", "collector:next", "primary")}</div><p class="small muted">Step ${step} of 4 · Answers remain in this preview only.</p></form></div>`;
}
function imageStrip(c) {
  return `<div class="mini-art-row">${get(c)
    .images.map((src, i) => `<img src="${src}" alt="Local reference ${i + 1}">`)
    .join("")}</div>`;
}

function login(c) {
  const s = get(c),
    p = s.phase;
  let form = "",
    title = "A world of art.\nA point of view.";
  if (p === "email")
    form = `<p class="eyebrow">WELCOME TO TASTEMATCHER</p><h1>Welcome back.</h1><p class="muted">Your private gallery awaits.</p>${c.field("Email address", "auth-email", s.email, "email")}${c.button("Continue &nbsp; →", "collector:auth-email", "primary")}${c.button("Request an invitation", "collector:auth-request", "ghost")}<p class="small muted">Preview uses sample credentials and sends no email.</p>`;
  if (p === "code-entry")
    form = `<p class="eyebrow">YOUR PRIVATE ACCESS</p><h1>Check your inbox.</h1><p class="muted">In the app, a code is sent to ${c.esc(s.email)}. In this preview, use <strong>000000</strong>.</p><label class="field">Verification code<input class="input code-input" name="auth-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></label>${c.button("Enter your gallery →", "collector:auth-code", "primary")}<div class="row">${c.button("Resend code", "collector:resend", "ghost")}${c.button("Change email", "collector:auth-back", "ghost")}</div>`;
  if (p === "user-not-found")
    form = `<p class="eyebrow">A PERSONAL INVITATION</p><h1>Your next chapter.</h1><p class="muted">Choose the access that best describes you.</p>${c.button("I am a collector →", "collector:buyer", "secondary")}${c.button("I represent a gallery →", "collector:seller", "secondary")}${c.button("Back to sign in", "collector:auth-back", "ghost")}`;
  if (p === "buyer-form" || p === "seller-form")
    form = `<p class="eyebrow">${p === "buyer-form" ? "COLLECTOR ACCESS" : "GALLERY ACCESS"}</p><h1>Make an introduction.</h1>${c.field("Your name", "request-name")}${c.field("Email address", "auth-email", s.email, "email")}${p === "seller-form" ? c.field("Gallery name", "request-gallery") : ""}<label class="field">A short introduction<textarea name="request-message" rows="3"></textarea></label>${c.button("Preview access request →", "collector:request-submit", "primary")}${c.button("Back", "collector:auth-request", "ghost")}`;
  if (p === "buyer-success" || p === "seller-success")
    form = `<p class="eyebrow">REQUEST PREVIEW</p><h1>A thoughtful beginning.</h1><p class="muted">This is the ${p === "buyer-success" ? "collector" : "gallery"} request confirmation design. Your actual request has not been sent.</p><p>The live experience will explain what happens next and confirm the email used for your request.</p>${c.button("Return to sign in", "collector:auth-back", "primary")}`;
  return `<div class="auth-layout"><section class="auth-art"><p class="eyebrow">A PERSONAL PERSPECTIVE ON ART</p><h2>${title.replace("\n", "<br>")}</h2><img src="${c.artworks[0].image}" alt="${c.esc(c.artworks[0].title)}"><p class="small">${c.esc(c.artworks[0].artist)} · ${c.esc(c.artworks[0].title)}</p></section><section class="auth-form"><form class="stack" data-action="${p === "email" ? "collector:auth-email" : p === "code-entry" ? "collector:auth-code" : "collector:request-submit"}">${form}${s.error ? `<p class="banner warning" role="alert">${c.esc(s.error)}</p>` : ""}</form><p class="small muted auth-legal">By continuing in the live app, you agree to the <a href="#/terms">Terms of Service</a> and acknowledge the <a href="#/privacy">Privacy Policy</a>.</p><details><summary>Version details</summary><p class="small muted">Isolated design proposal · Production deployment versions remain available here in the integrated design.</p></details></section></div>`;
}

function legalPage(c, kind) {
  const d = legal[kind];
  return `${c.header("TASTEMATCHER", d.title, d.subtitle, link("Back to sign in", "login", "ghost"))}<p class="small muted">Effective date: ${d.effectiveDate}</p><div class="legal-layout"><aside><nav aria-label="Document sections">${d.sections.map((s, i) => `<a href="#legal-${i}" data-action="collector:legal-section" data-target="legal-${i}">${c.esc(s.title)}</a>`).join("")}</nav></aside><article>${d.sections.map((s, i) => `<section id="legal-${i}"><h2>${c.esc(s.title)}</h2>${s.body.map((p) => `<p>${c.esc(p)}</p>`).join("")}</section>`).join("")}</article></div>`;
}

function saveProfile(c) {
  const s = get(c);
  if (s.step === 1) {
    s.profile.name = value("profile-name");
    s.profile.email = value("profile-email");
    s.profile.residence = value("profile-residence");
  }
  if (s.step === 4) s.profile.inspiration = value("profile-inspiration");
}
function act(name, el, c, event) {
  if (!name.startsWith("collector:")) return false;
  const s = get(c);
  const action = name.slice(10);
  s.error = "";
  if (action === "message") {
    const text = value("message").trim();
    if (text) {
      s.messages.push(text);
      c.render();
      c.notify("Sample message added locally. Nothing was sent.");
    }
  }
  if (action === "like" || action === "dislike") {
    const id = c.artworks[s.taste % c.artworks.length].id;
    s[action === "like" ? "likes" : "dislikes"].push(id);
    s.taste++;
    c.render();
  }
  if (action === "vote") {
    const id = el.dataset.id;
    const key = el.dataset.vote === "like" ? "likes" : "dislikes",
      other = key === "likes" ? "dislikes" : "likes";
    s[other] = s[other].filter((x) => x !== id);
    s[key] = s[key].includes(id)
      ? s[key].filter((x) => x !== id)
      : [...s[key], id];
    c.render();
  }
  if (action === "note") {
    s.notes[el.dataset.id] = el.value;
    c.notify("Note saved in this preview.");
  }
  if (action === "decision") {
    s.decisions[el.dataset.id] = el.dataset.value;
    s.updated = false;
    c.render();
  }
  if (action === "proposal-note") {
    s.notes["proposal" + el.dataset.id] = el.value;
    s.updated = false;
  }
  if (action === "update-proposal") {
    s.updated = true;
    c.render();
    c.notify("Sample responses updated. No proposal was changed in the app.");
  }
  if (action === "step") {
    saveProfile(c);
    s.step = Number(el.dataset.step);
    c.render();
  }
  if (action === "next") {
    saveProfile(c);
    if (s.step < 4) {
      s.step++;
      c.render();
    } else {
      c.navigate("taster");
      c.notify("Sample taste profile saved for this preview.");
    }
  }
  if (action === "back") {
    saveProfile(c);
    s.step = Math.max(1, s.step - 1);
    c.render();
  }
  if (action === "skip") c.navigate("home");
  if (action === "interest") s.profile.interest = el.value;
  if (action === "collect") {
    s.profile.collect = el.dataset.value;
    c.render();
  }
  if (action === "image") filePreview(el, c);
  if (action === "auth-email") {
    const email = value("auth-email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      s.error = "Enter a valid email address.";
    else {
      s.email = email;
      s.phase = "code-entry";
    }
    c.render();
  }
  if (action === "auth-code") {
    if (value("auth-code") === "000000") c.navigate("home");
    else {
      s.error = "Use 000000 for this local demonstration.";
      c.render();
    }
  }
  if (action === "auth-back") {
    s.phase = "email";
    c.render();
  }
  if (action === "auth-request") {
    s.phase = "user-not-found";
    c.render();
  }
  if (action === "buyer" || action === "seller") {
    s.phase = action === "buyer" ? "buyer-form" : "seller-form";
    c.render();
  }
  if (action === "request-submit") {
    if (
      !value("request-name").trim() ||
      !value("auth-email").includes("@") ||
      (s.phase === "seller-form" && !value("request-gallery").trim())
    )
      s.error =
        "Add your name, a valid email, and gallery name where applicable.";
    else
      s.phase = s.phase === "buyer-form" ? "buyer-success" : "seller-success";
    c.render();
  }
  if (action === "resend")
    c.notify("Code resend preview. No email sent; use 000000.");
  if (action === "legal-section") {
    event?.preventDefault();
    document
      .getElementById(el.dataset.target)
      ?.scrollIntoView({ behavior: "instant" });
  }
  return true;
}
function mountTaster(c) {
  const stage = document.querySelector("#taste-art");
  if (!stage) return;
  let start = null;
  stage.onpointerdown = (e) => {
    if (start || e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
  };
  stage.onpointerup = (e) => {
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
      act(dx > 0 ? "collector:like" : "collector:dislike", stage, c);
  };
  stage.onpointercancel = () => {
    start = null;
  };
}
const wrap = (title, render, extra = {}) => ({
  title,
  group: "Collector",
  render,
  action: act,
  ...extra,
});
export default {
  home: wrap("Collector home", home),
  taster: wrap("Discover your taste", taster, {
    mount: mountTaster,
    keydown: (e, c) => {
      if (
        e.target.closest("input,textarea,select,dialog") ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        act(
          e.key === "ArrowRight" ? "collector:like" : "collector:dislike",
          e.target,
          c,
        );
      }
    },
  }),
  suggestions: wrap("Selected for you", suggestions),
  proposal: wrap("Private viewing", proposal),
  onboarding: wrap("Your taste profile", onboarding),
  login: wrap("Sign in & access requests", login),
  privacy: wrap("Privacy policy", (c) => legalPage(c, "privacy")),
  terms: wrap("Terms of service", (c) => legalPage(c, "terms")),
};
