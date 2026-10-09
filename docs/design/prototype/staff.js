const people = [
  {
    id: "eleanor",
    name: "Eleanor Ashford",
    email: "eleanor@example.com",
    initials: "EA",
    status: "Sent",
    works: 3,
    views: 2,
    due: "Today",
  },
  {
    id: "alexander",
    name: "Alexander Beaumont",
    email: "alexander@example.com",
    initials: "AB",
    status: "Draft",
    works: 4,
    views: 0,
    due: "8 Oct",
  },
  {
    id: "camille",
    name: "Camille Moreau",
    email: "camille@example.com",
    initials: "CM",
    status: "Accepted",
    works: 2,
    views: 5,
    due: "12 Oct",
  },
  {
    id: "daniel",
    name: "Daniel Laurent",
    email: "daniel@example.com",
    initials: "DL",
    status: "No proposal",
    works: 0,
    views: 0,
    due: "Not scheduled",
  },
];
const get = (c) =>
  (c.state.staff ||= {
    query: "",
    view: "grid",
    selected: [],
    filter: "All",
    customer: "eleanor",
    customerTab: "record",
    step: 1,
    proposalIds: [c.artworks[0].id, c.artworks[1].id],
    notes: {},
    artEdits: {},
    hidden: [],
    private: [],
    tasterExcluded: [],
    deleted: [],
    customerQuery: "",
    pricesVisible: true,
    gallery: "All galleries",
    order: "Added recently",
    followup: "2026-10-08",
  });
const link = (label, key, kind = "secondary") =>
  `<a class="btn ${kind}" href="#/${key}">${label}</a>`;
const val = (name) => document.querySelector(`[name="${name}"]`)?.value || "";
const chosen = (c) => people.find((p) => p.id === get(c).customer) || people[0];
const visibleArt = (c) =>
  c.artworks
    .filter((a) => !get(c).deleted.includes(a.id))
    .map((a) => ({ ...a, ...get(c).artEdits[a.id] }));
const tone = (s) =>
  s === "Accepted"
    ? "success"
    : s === "Sent"
      ? "moss"
      : s === "Draft"
        ? "warning"
        : "";
const table = (headers, rows) =>
  `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
function customerRows(c, list = people) {
  return list.map(
    (p) =>
      `<tr><td><div class="row"><span class="avatar">${p.initials}</span><div><strong>${p.name}</strong><span class="small muted">${p.email}</span></div></div></td><td>${c.pill(p.status, tone(p.status))}</td><td>${p.works} works</td><td>${p.views}</td><td>${p.due === "Today" ? c.pill("Today", "warning") : p.due}</td><td>${c.button("Open →", "staff:customer", "ghost", `data-id="${p.id}" aria-label="Open ${p.name}"`)}</td></tr>`,
  );
}

function overview(c) {
  const s = get(c);
  return `${c.header("THE ADVISORY DESK", "A considered overview.", "Your collectors, proposals, and next conversations.", link("Add artwork", "upload") + link("View collectors →", "customers", "primary"))}<div class="stats"><div class="stat"><p class="eyebrow">PROPOSALS</p><strong>3</strong><span class="muted">In this sample workspace</span></div><div class="stat"><p class="eyebrow">AWAITING RESPONSE</p><strong>1</strong><span class="muted">A conversation to continue</span></div><div class="stat"><p class="eyebrow">ACCEPTED</p><strong>1</strong><span class="muted">Ready for your next step</span></div></div><section><div class="section-head"><h2>Collector conversations</h2>${link("All collectors →", "customers", "ghost")}</div>${table(["Collector", "Proposal", "Selection", "Views", "Follow-up", ""], customerRows(c, people.slice(0, 3)))}</section><div class="grid two section-space"><section class="panel"><p class="eyebrow">THE GALLERY</p><h2>New perspectives.</h2><p class="muted">Six works available in the sample collection.</p><div class="mini-art-row">${c.artworks
    .slice(0, 3)
    .map((a) => `<img src="${a.image}" alt="${c.esc(a.title)}">`)
    .join(
      "",
    )}</div>${link("Explore the catalog →", "catalog", "ghost")}</section><section class="panel stack"><p class="eyebrow">NEXT CONVERSATION</p><h2>Eleanor’s private viewing</h2><p class="muted">Three works shared. Two viewing sessions. Follow-up today.</p>${c.button("Open Eleanor’s workspace →", "staff:customer", "primary", 'data-id="eleanor"')}<p class="small muted">Sample engagement records for design review.</p></section></div>${["owner", "admin"].includes(c.state.role) ? `<section class="section-space"><div class="section-head"><div><p class="eyebrow">GALLERY ACTIVITY</p><h2>The last seven days</h2></div>${c.state.role === "admin" ? `<label class="field">Activity gallery<select data-action="staff:gallery"><option ${s.gallery === "All galleries" ? "selected" : ""}>All galleries</option><option ${s.gallery === "Ashford Gallery" ? "selected" : ""}>Ashford Gallery</option><option ${s.gallery === "Laurent Collection" ? "selected" : ""}>Laurent Collection</option></select></label>` : ""}</div><p class="small muted">This selector scopes the activity table only.</p>${table(["Gallery", "Collector activity", "Artworks explored", "Proposals viewed"], [`<tr><td>${c.esc(s.gallery)}</td><td>${s.gallery === "All galleries" ? 12 : 6} sample sessions</td><td>${s.gallery === "All galleries" ? 48 : 24}</td><td>${s.gallery === "All galleries" ? 7 : 3}</td></tr>`])}</section>` : ""}`;
}

function catalog(c) {
  const s = get(c),
    isCollector = c.state.role === "collector";
  let works = visibleArt(c).filter((a) =>
    `${a.artist} ${a.title} ${a.medium}`
      .toLowerCase()
      .includes(s.query.toLowerCase()),
  );
  if (s.order === "Artist A–Z")
    works.sort((a, b) => a.artist.localeCompare(b.artist));
  if (s.order === "Title A–Z")
    works.sort((a, b) => a.title.localeCompare(b.title));
  if (s.filter === "Liked")
    works = works.filter((a) => c.state.collector?.likes.includes(a.id));
  if (s.filter === "Disliked")
    works = works.filter((a) => c.state.collector?.dislikes.includes(a.id));
  return `${c.header("THE COLLECTION", "Works with a point of view.", `${works.length} works · A gallery to explore at your own pace.`, isCollector ? "" : link("Add artwork +", "upload", "primary"))}<div class="catalog-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input class="input" name="catalog-search" aria-label="Search artworks" placeholder="Search artist, title, or medium" value="${c.esc(s.query)}" data-action="staff:search-art"></label><select aria-label="Sort artworks" data-action="staff:sort">${["Added recently", "Artist A–Z", "Title A–Z"].map((t) => `<option ${s.order === t ? "selected" : ""}>${t}</option>`).join("")}</select><div class="row">${c.button("Gallery", "staff:view", s.view === "grid" ? "active" : "ghost", 'data-value="grid" aria-label="Gallery view"')}${c.button("Inventory", "staff:view", s.view === "table" ? "active" : "ghost", 'data-value="table" aria-label="Inventory table view"')}</div></div><div class="row filter-row">${["All", "Liked", "Disliked"].map((t) => c.button(t, "staff:art-filter", s.filter === t ? "active" : "ghost", `data-value="${t}"`)).join("")}${s.query ? c.button("Clear search ×", "staff:clear-search", "ghost") : ""}<span class="small muted">Sample collection · illustrative prices</span></div>
 ${s.selected.length && !isCollector ? `<div class="selection-bar"><strong>${s.selected.length} selected</strong>${c.button("Manage selection", "staff:bulk", "primary")}${c.button("Clear", "staff:clear-selection", "ghost")}</div>` : ""}
 ${
   works.length
     ? s.view === "grid"
       ? `<div class="art-grid">${works.map((a) => `<article class="art-card">${!isCollector ? `<label class="select-art"><input type="checkbox" data-action="staff:select-art" data-id="${a.id}" ${s.selected.includes(a.id) ? "checked" : ""}>Select artwork</label>` : ""}${c.artCard(a, { hidePrice: isCollector && s.hidden.includes(a.id) })}<div class="row">${c.pill(s.private.includes(a.id) ? "Private" : "Public")}${c.pill(s.tasterExcluded.includes(a.id) ? "Not in Taster" : "In Taster")}${s.hidden.includes(a.id) ? c.pill("Price hidden") : ""}${!isCollector ? c.button("Edit", "staff:edit", "ghost", `data-id="${a.id}"`) : c.button("I like this", "staff:like", "ghost", `data-id="${a.id}"`)}</div></article>`).join("")}</div>`
       : table(
           ["", "Artwork", "Artist", "Price", "Visibility", ""],
           works.map(
             (a) =>
               `<tr><td>${isCollector ? "" : `<input aria-label="Select ${c.esc(a.title)}" type="checkbox" data-action="staff:select-art" data-id="${a.id}" ${s.selected.includes(a.id) ? "checked" : ""}>`}</td><td><div class="row"><img src="${a.image}" alt=""><span>${c.esc(a.title)}</span></div></td><td>${c.esc(a.artist)}</td><td>${isCollector && s.hidden.includes(a.id) ? "On request" : c.money(a.price)}</td><td>${s.private.includes(a.id) ? "Private" : "Public"}</td><td>${c.button(isCollector ? "Inspect" : "Edit", isCollector ? "shell:art" : "staff:edit", "ghost", `data-id="${a.id}"`)}</td></tr>`,
           ),
         )
     : `<div class="empty"><h2>No works in this view.</h2><p class="muted">Adjust your search or explore the full collection.</p>${c.button("Show all works", "staff:clear-search", "primary")}</div>`
 }`;
}

function customers(c) {
  const s = get(c),
    list = people
      .filter((p) =>
        `${p.name} ${p.email} ${p.status}`
          .toLowerCase()
          .includes(s.customerQuery.toLowerCase()),
      )
      .filter((p) =>
        s.customerFilter && s.customerFilter !== "All"
          ? p.status === s.customerFilter
          : true,
      );
  return `${c.header("COLLECTOR RELATIONSHIPS", "Every collection is personal.", "The people behind the works. Find a conversation to continue.", link("Invite a collector", "management", "primary"))}<div class="catalog-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input class="input" aria-label="Search collectors" placeholder="Search name, email, or proposal status" value="${c.esc(s.customerQuery)}" data-action="staff:search-customer"></label><p class="small muted">${list.length} collectors in this sample</p></div><div class="tabs">${["All", "Draft", "Sent", "Accepted", "No proposal"].map((t) => c.button(t, "staff:customer-filter", s.customerFilter === t || (!s.customerFilter && t === "All") ? "active" : "ghost", `data-value="${t}"`)).join("")}</div>${list.length ? table(["Collector", "Proposal", "Works", "Views", "Follow-up", ""], customerRows(c, list)) : `<div class="empty"><h2>No collectors found.</h2>${c.button("Reset filters", "staff:reset-customers", "primary")}</div>`}<p class="small muted section-space">Showing ${list.length} sample records. Production pagination remains 20 records per page.</p>`;
}

function customer(c) {
  const s = get(c),
    p = chosen(c);
  return `${c.header("COLLECTOR WORKSPACE", p.name, "A clear view of the person, the preferences, and the proposal.", link("All collectors", "customers", "ghost") + link("Curate a proposal →", "composer", "primary"))}<div class="collector-summary"><span class="avatar large">${p.initials}</span><div><h3>${p.email}</h3><p class="small muted">London · Private collector · Sample profile</p></div>${c.pill(p.status, tone(p.status))}<span class="small muted">${p.views} proposal views</span></div><div class="tabs">${["record", "proposal"].map((t) => c.button(t === "record" ? "Collector record" : "Proposal", "staff:customer-tab", s.customerTab === t ? "active" : "ghost", `data-value="${t}"`)).join("")}</div>${
    s.customerTab === "record"
      ? `<div class="split"><section class="stack"><section class="panel"><p class="eyebrow">A PERSONAL PERSPECTIVE</p><h2>Drawn to quiet intensity.</h2><p class="muted">Interested in paintings. An existing collection with a focus on light, expressive color, and intimate subjects.</p><dl class="profile-facts"><div><dt>Primary residence</dt><dd>London, United Kingdom</dd></div><div><dt>Collecting status</dt><dd>Existing collector</dd></div><div><dt>Taste activity</dt><dd>24 works explored · 16 likes · 8 dislikes</dd></div></dl></section><section><div class="section-head"><h2>Reference collection</h2>${link("Open artworks →", "catalog", "ghost")}</div><div class="mini-art-row large">${c.artworks
          .slice(0, 3)
          .map((a) => `<img src="${a.image}" alt="${c.esc(a.title)}">`)
          .join(
            "",
          )}</div></section></section><aside class="panel stack"><h2>Advisor notes</h2><p class="small muted">Private sample workspace notes</p><label class="field">Conversation notes<textarea name="advisor-notes">${c.esc(s.notes[p.id] || "Interested in the quieter works. Discuss scale and placement in our next conversation.")}</textarea></label>${c.button("Save sample note", "staff:save-note", "secondary")}<hr><label class="field">Next follow-up<input type="date" name="followup" value="${s.followup}"></label>${c.button("Update sample follow-up", "staff:followup", "ghost")}</aside></div>`
      : `<section class="stack"><div class="row between"><div><h2>A selection for ${p.name.split(" ")[0]}</h2><p class="muted">${s.proposalIds.length} selected works · Sample draft</p></div>${link("Continue curating →", "composer", "primary")}</div><div class="art-grid">${c.artworks
          .filter((a) => s.proposalIds.includes(a.id))
          .map((a) => c.artCard(a))
          .join("")}</div></section>`
  }`;
}

const composeSteps = [
  "Collector",
  "Select works",
  "Curate",
  "Presentation",
  "Review & share",
];
function composer(c) {
  const s = get(c),
    p = chosen(c),
    selected = s.proposalIds
      .map((id) => c.artworks.find((a) => a.id === id))
      .filter(Boolean);
  let body = "";
  if (s.step === 1)
    body = `<div class="split"><section class="panel stack"><p class="eyebrow">01 / THE COLLECTOR</p><h2>Begin with the person.</h2><label class="field">Prepare this proposal for<select data-action="staff:choose-customer">${people.map((p) => `<option value="${p.id}" ${s.customer === p.id ? "selected" : ""}>${p.name}</option>`).join("")}</select></label><p class="muted">Confirm the collector before you assemble the selection.</p></section><section class="panel stack"><span class="avatar large">${p.initials}</span><h2>${p.name}</h2><p>${p.email}</p><p class="small muted">Paintings · Established collection · London</p>${link("Review collector record", "customer", "ghost")}</section></div>`;
  if (s.step === 2)
    body = `<div class="row between"><div><h2>A starting point for the selection.</h2><p class="muted">${s.proposalIds.length} works selected. Recommendation signals are advisor-only.</p></div><label class="row small"><input type="checkbox" data-action="staff:rated" ${s.includeRated ? "checked" : ""}>Include rated works</label></div><div class="art-grid section-space">${c.artworks
      .slice(0, s.includeRated ? 6 : 4)
      .map(
        (a, i) =>
          `<article>${c.artCard(a)}<div class="row">${c.button(s.proposalIds.includes(a.id) ? "✓ Added to proposal" : "Add to proposal", "staff:add-proposal", s.proposalIds.includes(a.id) ? "primary" : "secondary", `data-id="${a.id}"`)}</div><details><summary>Why suggested</summary><p class="small muted">Sample match ${91 - i * 4}%. Image, intent, metadata, and behavior describe recommendation signals, not purchase probability.</p></details></article>`,
      )
      .join("")}</div>`;
  if (s.step === 3)
    body = `<div class="stack"><div><h2>Give the selection its shape.</h2><p class="muted">Review the order and asking prices. All amounts are illustrative USD values.</p></div>${
      selected.length
        ? table(
            [
              "Work",
              "Low asking price · USD",
              "High asking price · USD",
              "Order",
              "",
            ],
            selected.map(
              (a, i) =>
                `<tr><td><div class="row"><img src="${a.image}" alt=""><div>${c.esc(a.title)}<p class="small muted">${c.esc(a.artist)}</p></div></div></td><td><input aria-label="Low asking price for ${c.esc(a.title)}" class="input" type="number" min="0" value="${s.notes["low" + a.id] || a.low}" data-action="staff:price" data-id="${a.id}" data-value="low"></td><td><input aria-label="High asking price for ${c.esc(a.title)}" class="input" type="number" min="0" value="${s.notes["high" + a.id] || a.high}" data-action="staff:price" data-id="${a.id}" data-value="high"></td><td>${c.button("↑", "staff:reorder", "ghost", `data-id="${a.id}" aria-label="Move ${c.esc(a.title)} earlier" ${i === 0 ? "disabled" : ""}`)}</td><td>${c.button("Remove", "staff:add-proposal", "ghost", `data-id="${a.id}"`)}</td></tr>`,
            ),
          )
        : '<div class="empty">Select works before continuing.</div>'
    }</div>`;
  if (s.step === 4)
    body = `<div class="split"><form class="panel stack"><p class="eyebrow">THE PRIVATE VIEWING</p><h2>Make it personal.</h2>${c.field("Proposal title", "proposal-title", s.title || "Art worth living with.")}<label class="field">Personal introduction<textarea name="proposal-intro">${c.esc(s.intro || "An exploration of light, character, and the everyday, transformed.")}</textarea></label><label class="row"><input type="checkbox" data-action="staff:price-visibility" ${s.pricesVisible ? "checked" : ""}>Show prices in presentation</label><p class="small muted">This setting previews the intended design. Customer price-visibility enforcement requires production integration review.</p>${c.button("Preview presentation", "staff:presentation", "secondary")}</form><section class="presentation-preview"><p class="eyebrow">PREPARED FOR ${c.esc(p.name.toUpperCase())}</p><h2>${c.esc(s.title || "Art worth living with.")}</h2><img src="${selected[0]?.image || c.artworks[0].image}" alt="Presentation cover artwork"><p class="small muted">A personal selection · ${selected.length} works</p></section></div>`;
  if (s.step === 5)
    body = `<div class="split"><section class="panel stack"><p class="eyebrow">FINAL CONSIDERATION</p><h2>Ready for ${p.name.split(" ")[0]}.</h2><p>${c.esc(s.title || "Art worth living with.")}</p><p class="muted">${c.esc(s.intro || "An exploration of light, character, and the everyday, transformed.")}</p><div class="mini-art-row">${selected.map((a) => `<img src="${a.image}" alt="${c.esc(a.title)}">`).join("")}</div><p>${selected.length} works · ${s.pricesVisible ? "Prices visible" : "Prices hidden in intended presentation"}</p></section><aside class="panel stack"><h2>Review before sharing</h2><p class="small muted">Recipient: ${p.email}</p><p class="small muted">Verify artwork details, prices, visibility, and the personal introduction before publication.</p>${c.button("Save sample draft", "staff:save-draft", "secondary")}${c.button("Simulate publication →", "staff:publish", "primary")}<p class="small muted">This demonstration does not publish, send email, or create a link.</p>${s.published ? '<div class="banner">Sample publication complete. No live proposal was sent.</div>' : ""}</aside></div>`;
  return `${c.header("PROPOSAL STUDIO", "A selection with intention.", `Prepared for ${p.name}.`, link("Back to collector", "customer", "ghost"))}<nav class="compose-steps" aria-label="Proposal steps">${composeSteps.map((t, i) => c.button(`<span>${i + 1}</span>${t}`, "staff:compose-step", s.step === i + 1 ? "active" : "ghost", `data-step="${i + 1}" aria-current="${s.step === i + 1 ? "step" : "false"}"`)).join("")}</nav>${body}<div class="action-bar"><span class="small muted">Step ${s.step} of 5 · Sample draft</span><div class="row">${s.step > 1 ? c.button("← Back", "staff:compose-back", "ghost") : ""}${s.step < 5 ? c.button("Continue →", "staff:compose-next", "primary") : link("Return to collector", "customer", "ghost")}</div></div>`;
}

function edit(c, id) {
  const a = visibleArt(c).find((a) => a.id === id);
  if (!a) return;
  c.modal(
    "Edit artwork",
    `<form id="art-edit" class="stack"><input type="hidden" name="art-id" value="${id}"><div class="split"><div class="art-mount"><img src="${a.image}" alt="${c.esc(a.title)}"></div><div class="stack">${c.field("Artist", "art-artist", a.artist)}${c.field("Title", "art-title", a.title)}${c.field("Price · USD (illustrative)", "art-price", a.price, "number")}<p class="small muted">Original medium and dimensions remain visible in the inspection view. This is a local editing demonstration.</p>${c.button("Save sample changes", "staff:save-art", "primary")}</div></div></form>`,
  );
}
function rememberPresentation(c) {
  const s = get(c);
  if (document.querySelector('[name="proposal-title"]')) {
    s.title = val("proposal-title");
    s.intro = val("proposal-intro");
  }
}
function act(name, el, c) {
  if (!name.startsWith("staff:")) return false;
  const s = get(c),
    a = name.slice(6),
    id = el.dataset.id;
  if (a === "search-art") {
    s.query = el.value;
    c.render();
  }
  if (a === "clear-search") {
    s.query = "";
    s.filter = "All";
    c.render();
  }
  if (a === "sort") {
    s.order = el.value;
    c.render();
  }
  if (a === "view") {
    s.view = el.dataset.value;
    c.render();
  }
  if (a === "art-filter") {
    s.filter = el.dataset.value;
    c.render();
  }
  if (a === "select-art") {
    s.selected = el.checked
      ? [...new Set([...s.selected, id])]
      : s.selected.filter((x) => x !== id);
    c.render();
  }
  if (a === "clear-selection") {
    s.selected = [];
    c.render();
  }
  if (a === "like") {
    c.state.collector ||= {
      likes: [],
      dislikes: [],
      taste: 0,
      notes: {},
      decisions: {},
      messages: [],
      step: 1,
      profile: {},
      images: [],
      phase: "email",
    };
    c.state.collector.likes = [...new Set([...c.state.collector.likes, id])];
    c.notify("Artwork liked in this preview.");
  }
  if (a === "edit") edit(c, id);
  if (a === "save-art") {
    const id = val("art-id"),
      price = Number(val("art-price"));
    if (!val("art-title").trim() || !val("art-artist").trim() || price < 0)
      return (c.notify("Enter an artist, title, and nonnegative price."), true);
    s.artEdits[id] = {
      title: val("art-title"),
      artist: val("art-artist"),
      price,
    };
    c.closeModal();
    c.render();
    c.notify("Sample artwork updated locally.");
  }
  if (a === "bulk")
    c.modal(
      "Manage selected artworks",
      `<div class="stack"><p>${s.selected.length} selected. These operations only change the sample catalog.</p><div class="grid two">${[
        ["Show prices", "show"],
        ["Hide prices", "hide"],
        ["Include in Taster", "include"],
        ["Remove from Taster", "exclude"],
        ["Make private", "private"],
        ["Make public", "public"],
      ]
        .map(([t, v]) =>
          c.button(t, "staff:bulk-apply", "secondary", `data-value="${v}"`),
        )
        .join(
          "",
        )}</div><p class="small muted">Private/public is available in the live app only when you own every selected work. All sample records here represent your uploads.</p>${c.button("Remove sample records", "staff:delete-confirm", "danger")}</div>`,
    );
  if (a === "bulk-apply") {
    const v = el.dataset.value;
    for (const id of s.selected) {
      const key = ["hide", "show"].includes(v)
        ? "hidden"
        : ["private", "public"].includes(v)
          ? "private"
          : "tasterExcluded";
      s[key] = s[key].filter((x) => x !== id);
      if (["hide", "private", "exclude"].includes(v)) s[key].push(id);
    }
    c.closeModal();
    c.render();
    c.notify("Sample selection updated.");
  }
  if (a === "delete-confirm")
    c.modal(
      "Remove sample artworks?",
      `<p>This removes ${s.selected.length} records from the preview only. Reload to restore them.</p><div class="row section-space">${c.button("Cancel", "shell:close", "secondary")}${c.button("Remove from sample", "staff:delete", "danger")}</div>`,
    );
  if (a === "delete") {
    s.deleted.push(...s.selected);
    s.selected = [];
    c.closeModal();
    c.render();
  }
  if (a === "search-customer") {
    s.customerQuery = el.value;
    c.render();
  }
  if (a === "customer-filter") {
    s.customerFilter = el.dataset.value;
    c.render();
  }
  if (a === "reset-customers") {
    s.customerQuery = "";
    s.customerFilter = "All";
    c.render();
  }
  if (a === "customer") {
    s.customer = id;
    s.customerTab = "record";
    c.navigate("customer");
  }
  if (a === "customer-tab") {
    s.customerTab = el.dataset.value;
    c.render();
  }
  if (a === "save-note") {
    s.notes[chosen(c).id] = val("advisor-notes");
    c.notify("Advisor note saved in the sample session.");
  }
  if (a === "followup") {
    s.followup = val("followup");
    c.notify("Follow-up updated in the sample session.");
  }
  if (a === "gallery") {
    s.gallery = el.value;
    c.render();
  }
  if (a === "choose-customer") {
    s.customer = el.value;
    c.render();
  }
  if (a === "compose-step") {
    rememberPresentation(c);
    s.step = Number(el.dataset.step);
    c.render();
  }
  if (a === "compose-back") {
    rememberPresentation(c);
    s.step = Math.max(1, s.step - 1);
    c.render();
  }
  if (a === "compose-next") {
    rememberPresentation(c);
    if ((s.step === 2 || s.step === 3) && !s.proposalIds.length)
      return (c.notify("Select at least one artwork to continue."), true);
    s.step = Math.min(5, s.step + 1);
    c.render();
  }
  if (a === "add-proposal") {
    s.proposalIds = s.proposalIds.includes(id)
      ? s.proposalIds.filter((x) => x !== id)
      : [...s.proposalIds, id];
    c.render();
  }
  if (a === "rated") {
    s.includeRated = el.checked;
    c.render();
  }
  if (a === "price") s.notes[el.dataset.value + id] = el.value;
  if (a === "reorder") {
    const index = s.proposalIds.indexOf(id);
    if (index > 0)
      [s.proposalIds[index - 1], s.proposalIds[index]] = [
        s.proposalIds[index],
        s.proposalIds[index - 1],
      ];
    c.render();
  }
  if (a === "price-visibility") s.pricesVisible = el.checked;
  if (a === "presentation") {
    rememberPresentation(c);
    c.modal(
      "Presentation preview",
      `<div class="stack"><p class="eyebrow">PREPARED FOR ${c.esc(chosen(c).name)}</p><h2>${c.esc(s.title)}</h2><p class="serif">${c.esc(s.intro)}</p><div class="art-grid">${s.proposalIds
        .map((id) => c.artworks.find((a) => a.id === id))
        .map((a) => c.artCard(a, { hidePrice: !s.pricesVisible }))
        .join(
          "",
        )}</div><p class="small muted">Presentation demonstration only. Actual customer privacy enforcement must be integrated and tested.</p></div>`,
    );
  }
  if (a === "save-draft") c.notify("Sample draft saved in this tab.");
  if (a === "publish") {
    if (!s.proposalIds.length)
      return (c.notify("Select a work before simulating publication."), true);
    s.published = true;
    c.render();
    c.notify("Publication simulated. No message sent or live record changed.");
  }
  return true;
}
const wrap = (title, render) => ({
  title,
  group: "Gallery",
  render,
  action: act,
});
export default {
  overview: wrap("Gallery overview", overview),
  catalog: wrap("Artwork catalog", catalog),
  customers: wrap("Collector directory", customers),
  customer: wrap("Collector workspace", customer),
  composer: wrap("Proposal studio", composer),
};
