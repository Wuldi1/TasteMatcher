const get = (c) =>
  (c.state.ops ||= {
    tab: "Users",
    users: [
      {
        id: 1,
        name: "Eleanor Ashford",
        email: "eleanor@example.com",
        role: "Collector",
        status: "Active",
      },
      {
        id: 2,
        name: "Alexander Beaumont",
        email: "alexander@example.com",
        role: "Collector",
        status: "Invited",
      },
      {
        id: 3,
        name: "Julian Laurent",
        email: "julian@example.com",
        role: "Advisor",
        status: "Active",
      },
    ],
    domains: ["Ashford Gallery", "Laurent Collection"],
    userQuery: "",
    importStep: 0,
    importMode: "Auction URL",
    lots: [],
    selected: [],
    upload: {},
    campaignStep: 1,
    recipients: [1],
    campaignSubject: "A private selection for your consideration",
    campaignBody:
      "I would be delighted to share a considered selection of works with you.",
  });
const link = (label, key, kind = "secondary") =>
  `<a class="btn ${kind}" href="#/${key}">${label}</a>`;
const val = (n) => document.querySelector(`[name="${n}"]`)?.value || "";
const rows = (heads, data) =>
  `<div class="table-wrap"><table class="data-table"><thead><tr>${heads.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${data.join("")}</tbody></table></div>`;
const image = (c) => get(c).upload.image || c.artworks[2].image;

function upload(c) {
  const s = get(c);
  return `${c.header("ARTWORK INTAKE", "A considered addition.", "Prepare the image and the details. Review before adding it to the gallery.", link("View catalog", "catalog", "ghost") + (["owner", "admin"].includes(c.state.role) ? link("Import an auction", "imports") : ""))}<div class="upload-layout"><aside class="stack"><div class="upload-image"><img src="${image(c)}" alt="Artwork preview"></div><label class="upload-zone">Choose an artwork image<input type="file" accept="image/jpeg,image/png,image/webp" data-action="ops:upload-image"><span class="small muted">JPG, PNG, WebP · 10 MB maximum · preview stays local</span></label><p class="small muted">The full artwork is shown without cropping. The current image is a museum collection stand-in.</p></aside><form class="stack" id="upload-form"><section class="panel stack"><p class="eyebrow">01 / THE WORK</p><h2>Artwork details</h2><div class="grid two">${c.field("Artist", "upload-artist", s.upload.artist || "Paul Cézanne")}${c.field("Artwork title", "upload-title", s.upload.title || "Still Life with Apples and a Pot of Primroses")}${c.field("Year", "upload-year", s.upload.year || "ca. 1890")}${c.field("Medium", "upload-medium", s.upload.medium || "Oil on canvas")}</div><label class="field">Gallery<select name="upload-gallery"><option>Ashford Gallery</option>${c.state.role === "admin" ? "<option>Laurent Collection</option>" : ""}</select></label><div class="grid three">${c.field("Width · in", "upload-width", "28.75", "number")}${c.field("Height · in", "upload-height", "35.75", "number")}${c.field("Depth · in (optional)", "upload-depth", "", "number")}</div></section><section class="panel stack"><p class="eyebrow">02 / PRICE & SALE</p><div class="grid two"><label class="field">Sale type<select data-action="ops:sale-type" name="sale-type"><option ${!s.upload.auction ? "selected" : ""}>Fixed price</option><option ${s.upload.auction ? "selected" : ""}>Auction</option></select></label>${c.field(s.upload.auction ? "Low price · USD" : "Price · USD", "upload-price", s.upload.price || "42000", "number")}</div>${s.upload.auction ? `<div class="grid two">${c.field("High price / reserve · USD", "upload-high", "60000", "number")}${c.field("Auction end date", "upload-end", "", "date")}</div>` : ""}<label class="row"><input type="checkbox" name="upload-show-price" checked>Show price to collectors</label><p class="small muted">This prototype uses USD and inches; production display and conversion preferences remain part of the design.</p></section><section class="panel stack"><p class="eyebrow">03 / PRESENTATION & ACCESS</p><label class="field">Description<textarea name="upload-description" rows="3">${c.esc(s.upload.description || "")}</textarea></label>${c.field("Tags (comma-separated)", "upload-tags", s.upload.tags || "Still life, Modern, Color")}<div class="row"><label><input type="checkbox" name="upload-taster" checked> Include in Taster</label><label><input type="checkbox" name="upload-private"> Private artwork</label></div></section><div class="action-bar"><p class="small muted">Destination: Ashford Gallery</p>${c.button("Review artwork →", "ops:upload-review", "primary")}</div></form></div>`;
}

function imports(c) {
  const s = get(c);
  if (!["owner", "admin"].includes(c.state.role))
    return `${c.header("AUCTION INTAKE", "Review before it arrives.", "Auction imports are available to gallery owners and administrators.")}<div class="empty"><h2>Choose Gallery owner or Administrator above to review this workflow.</h2></div>`;
  return `${c.header("AUCTION INTAKE", "From auction to collection.", "Preview, refine, and approve. Every addition begins with a careful review.", s.importStep ? c.button("Start another preview", "ops:import-reset", "ghost") : "")}<div class="compose-steps"><span class="${s.importStep === 0 ? "active" : ""}">01 &nbsp; Source</span><span class="${s.importStep === 1 ? "active" : ""}">02 &nbsp; Review lots</span><span class="${s.importStep === 2 ? "active" : ""}">03 &nbsp; Results</span></div>${s.importStep === 0 ? `<div class="split"><section class="panel stack"><h2>Choose your source.</h2><div class="tabs">${["Auction URL", "Import JSON"].map((t) => c.button(t, "ops:import-mode", s.importMode === t ? "active" : "ghost", `data-value="${t}"`)).join("")}</div>${s.importMode === "Auction URL" ? `${c.field("Phillips auction URL", "import-url", "https://www.phillips.com/auctions")}<p class="small muted">Phillips is the currently supported URL provider. In this preview, the URL is not fetched.</p>` : `<label class="upload-zone">Choose an import JSON file<input type="file" accept="application/json,.json" data-action="ops:json-file"><span class="small muted">Use a generated import package; raw PDFs are not accepted here.</span></label><p class="small muted">${c.esc(s.jsonName || "No file chosen. You can also preview the sample package.")}</p>`}<label class="field">Target gallery<select name="import-gallery"><option>Ashford Gallery</option>${c.state.role === "admin" ? "<option>Laurent Collection</option>" : ""}</select></label>${c.button("Preview sample lots →", "ops:import-preview", "primary")}</section><aside class="stack intake-note"><p class="eyebrow">A REVIEW, NOT AN UPLOAD</p><h2>Keep the final<br>decision with you.</h2><p class="muted">Inspect each image, attribution, dimension, and price. Resolve issues before you approve the selected lots.</p><p class="small muted">Previewing does not add anything to a gallery. The real workflow preserves source information and reports each approval outcome.</p></aside></div>` : ""}
 ${
   s.importStep === 1
     ? `<div class="row between section-space"><div><h2>Review the proposed additions.</h2><p class="muted">${s.lots.length} lots · ${c.esc(s.importGallery)} · Prices in USD, dimensions in inches</p></div>${c.button("Select all ready", "ops:select-ready", "secondary")}</div><div class="banner warning">One sample lot needs a title. Review the marked row before approving it.</div>${rows(
         ["Select", "Lot / work", "Artist", "Low / high · USD", "Review", ""],
         s.lots.map(
           (a, i) =>
             `<tr><td><input type="checkbox" aria-label="Select lot ${i + 1}" data-action="ops:select-lot" data-id="${a.id}" ${s.selected.includes(a.id) ? "checked" : ""}></td><td><div class="row"><img src="${a.image}" alt=""><div><span class="small muted">LOT ${i + 1}</span><strong>${c.esc(a.title || "Title missing")}</strong></div></div></td><td>${c.esc(a.artist)}</td><td>${c.money(a.low)}<br>${c.money(a.high)}</td><td>${c.pill(a.title ? "Ready" : "Needs review", a.title ? "success" : "warning")}</td><td>${c.button("Inspect", "ops:lot-edit", "ghost", `data-id="${a.id}"`)}</td></tr>`,
         ),
       )}<div class="action-bar"><div><strong>${s.selected.length} lots selected</strong><p class="small muted">Gallery: ${c.esc(s.importGallery)} · Approve only after review</p></div><div class="row">${c.button("Bulk edit", "ops:bulk-lots", "secondary", !s.selected.length ? "disabled" : "")}${c.button("Review approval →", "ops:approve-review", "primary", !s.selected.length ? "disabled" : "")}</div></div>`
     : ""
 }
 ${
   s.importStep === 2
     ? `<section class="stack"><div class="banner">Sample approval completed. No artwork was uploaded.</div><div class="stats"><div class="stat"><p>Completed</p><strong>${s.results.filter((r) => r.result === "Completed").length}</strong></div><div class="stat"><p>Failed</p><strong>${s.results.filter((r) => r.result === "Failed").length}</strong></div><div class="stat"><p>Not processed</p><strong>${s.lots.length - s.results.length}</strong></div></div>${rows(
         ["Work", "Outcome", "Next action"],
         s.lots.map((a) => {
           const r = s.results.find((r) => r.id === a.id);
           return `<tr><td>${c.esc(a.title || "Untitled sample lot")}</td><td>${c.pill(r?.result || "Not processed", r?.result === "Completed" ? "success" : "warning")}</td><td>${r?.result === "Failed" ? c.button("Retry sample failure", "ops:retry-lot", "secondary", `data-id="${a.id}"`) : r ? "Added in the simulated result" : "Return to review to select this lot"}</td></tr>`;
         }),
       )}<div class="row">${c.button("Return to lot review", "ops:return-review", "secondary")}${link("View catalog", "catalog", "ghost")}</div></section>`
     : ""
 }`;
}

function management(c) {
  const s = get(c),
    admin = c.state.role === "admin",
    tabs = admin
      ? ["Users", "Domains", "Domain Requests", "Customer Requests"]
      : ["Users"];
  if (!tabs.includes(s.tab)) s.tab = "Users";
  let content = "";
  if (s.tab === "Users") {
    const users = s.users.filter((p) =>
      `${p.name} ${p.email} ${p.role} ${p.status}`
        .toLowerCase()
        .includes(s.userQuery.toLowerCase()),
    );
    content = `<div class="catalog-toolbar"><input class="input" aria-label="Search people" placeholder="Search name, email, role, or status" value="${c.esc(s.userQuery)}" data-action="ops:search-user"><span class="small muted">${users.length} people</span></div>${rows(
      ["Person", "Role", "Status", "Actions"],
      users.map(
        (p) =>
          `<tr><td><strong>${c.esc(p.name)}</strong><span class="small muted">${c.esc(p.email)}</span></td><td>${p.role}</td><td>${c.pill(p.status, p.status === "Active" ? "success" : "warning")}</td><td><div class="row">${c.button("Edit", "ops:user-edit", "ghost", `data-id="${p.id}"`)}${p.status === "Invited" ? c.button("Resend", "ops:resend", "ghost", `data-id="${p.id}"`) : ""}${c.button("Remove", "ops:user-remove", "ghost", `data-id="${p.id}"`)}</div></td></tr>`,
      ),
    )}${!users.length ? '<p class="empty">No matching people. Adjust the search.</p>' : ""}`;
  }
  if (s.tab === "Domains")
    content = `<div class="row between section-space"><h2>Your galleries</h2>${c.button("Add sample gallery", "ops:domain-add", "primary")}</div>${rows(
      ["Gallery", "Context", ""],
      s.domains.map(
        (d, i) =>
          `<tr><td><strong>${c.esc(d)}</strong></td><td>Sample organization</td><td>${c.button("Edit", "ops:domain-edit", "ghost", `data-id="${i}"`)}</td></tr>`,
      ),
    )}`;
  if (s.tab === "Domain Requests")
    content = `<div class="banner">Gallery requests are read-only in the current application.</div>${rows(["Gallery", "Contact", "Request", "Status"], ["<tr><td>Atelier North</td><td>morgan@example.com</td><td>Looking to introduce our contemporary program.</td><td>Pending review</td></tr>"])}`;
  if (s.tab === "Customer Requests")
    content = `<div class="section-head"><h2>Collector introductions</h2><span class="small muted">Administrator view</span></div>${s.requestHandled ? '<div class="banner">Sample request processed locally. No account was created.</div>' : rows(["Collector", "Introduction", ""], [`<tr><td><strong>Isabelle Martin</strong><span class="small muted">isabelle@example.com</span></td><td>Building a personal collection of paintings.</td><td>${c.button("Review request", "ops:request-review", "primary")}</td></tr>`])}`;
  return `${c.header("GALLERY ADMINISTRATION", "A well-kept gallery.", "The people, places, and permissions behind your service.", link("Customer email", "campaign") + c.button("Invite a person +", "ops:invite", "primary"))}<div class="scope-bar"><span class="eyebrow">GALLERY CONTEXT</span><strong>Ashford Gallery</strong><span class="small muted">Role preview: ${c.esc(c.state.role)}</span></div><div class="tabs">${tabs.map((t) => c.button(t, "ops:management-tab", s.tab === t ? "active" : "ghost", `data-value="${t}"`)).join("")}</div>${content}`;
}

function campaign(c) {
  const s = get(c),
    steps = ["Compose", "Recipients", "Review", "Results"];
  let body = "";
  if (s.campaignStep === 1)
    body = `<div class="split"><form class="panel stack"><p class="eyebrow">A PERSONAL MESSAGE</p><h2>Choose your words.</h2>${c.field("Subject", "campaign-subject", s.campaignSubject)}<label class="field">Message<textarea name="campaign-body" rows="9">${c.esc(s.campaignBody)}</textarea></label><p class="small muted">Plain-text sample content. Production rich-text and template capabilities remain as specified in the audit.</p></form><aside class="intake-note"><span class="gold-rule"></span><h2>Correspondence<br>with consideration.</h2><p class="muted">Keep the message personal and the recipient list deliberate. Review both before sending.</p></aside></div>`;
  if (s.campaignStep === 2)
    body = `<section class="stack"><h2>Choose the recipients.</h2><p class="muted">${s.recipients.length} selected from the sample gallery.</p>${rows(
      ["Select", "Person", "Email"],
      s.users
        .filter((p) => p.role === "Collector")
        .map(
          (p) =>
            `<tr><td><input type="checkbox" aria-label="Select ${c.esc(p.name)}" data-action="ops:recipient" data-id="${p.id}" ${s.recipients.includes(p.id) ? "checked" : ""}></td><td>${c.esc(p.name)}</td><td>${c.esc(p.email)}</td></tr>`,
        ),
    )}</section>`;
  if (s.campaignStep === 3)
    body = `<div class="split"><article class="panel stack"><p class="eyebrow">EMAIL PREVIEW</p><h2>${c.esc(s.campaignSubject)}</h2><p style="white-space:pre-wrap">${c.esc(s.campaignBody)}</p><hr><p class="small muted">The TasteMatcher advisory team</p></article><aside class="panel stack"><h2>Ready for review.</h2><p>${s.recipients.length} sample recipient${s.recipients.length === 1 ? "" : "s"}</p>${s.users
      .filter((p) => s.recipients.includes(p.id))
      .map(
        (p) =>
          `<p class="small muted">${c.esc(p.name)} · ${c.esc(p.email)}</p>`,
      )
      .join(
        "",
      )}${c.button("Simulate email results", "ops:campaign-send", "primary")}<p class="small muted">No email will be sent. This preview demonstrates aggregate reporting.</p></aside></div>`;
  if (s.campaignStep === 4)
    body = `<section class="panel stack"><p class="eyebrow">RESULTS PREVIEW</p><h2>A clear account of delivery.</h2><div class="stats"><div class="stat"><p>Requested</p><strong>${s.recipients.length}</strong></div><div class="stat"><p>Sent · simulated</p><strong>${Math.max(0, s.recipients.length - 1)}</strong></div><div class="stat"><p>Failed · simulated</p><strong>${s.recipients.length ? 1 : 0}</strong></div></div><p class="muted">The current API reports aggregate counts. This design does not promise an individual failed-recipient list or retry.</p>${link("Return to management", "management", "primary")}</section>`;
  return `${c.header("GALLERY CORRESPONDENCE", "A considered conversation.", "Compose and review a message to your collectors.", link("Back to management", "management", "ghost"))}<nav class="compose-steps" aria-label="Email steps">${steps.map((t, i) => `<span class="${s.campaignStep === i + 1 ? "active" : ""}">${i + 1} &nbsp; ${t}</span>`).join("")}</nav>${body}${s.campaignStep < 4 ? `<div class="action-bar"><span class="small muted">Step ${s.campaignStep} of 4 · Local preview</span><div class="row">${s.campaignStep > 1 ? c.button("← Back", "ops:campaign-back", "ghost") : ""}${s.campaignStep < 3 ? c.button("Continue →", "ops:campaign-next", "primary") : ""}</div></div>` : ""}`;
}

function saveUpload(c) {
  const s = get(c);
  for (const key of [
    "artist",
    "title",
    "year",
    "medium",
    "price",
    "description",
    "tags",
  ])
    if (document.querySelector(`[name="upload-${key}"]`))
      s.upload[key] = val("upload-" + key);
}
function userForm(c, id) {
  const s = get(c),
    p = s.users.find((p) => p.id === Number(id));
  c.modal(
    p ? "Edit person" : "Invite a person",
    `<form class="stack"><input type="hidden" name="user-id" value="${p?.id || ""}">${c.field("Name", "user-name", p?.name || "")}${c.field("Email", "user-email", p?.email || "", "email")}<label class="field">Role<select name="user-role">${["Collector", ...(["owner", "admin"].includes(c.state.role) ? ["Advisor"] : [])].map((t) => `<option ${p?.role === t ? "selected" : ""}>${t}</option>`).join("")}</select></label><p class="small muted">Ashford Gallery · This will only change the local sample list.</p>${c.button(p ? "Save sample changes" : "Simulate invitation", "ops:user-save", "primary")}</form>`,
  );
}
function lotForm(c, id) {
  const a = get(c).lots.find((a) => a.id === id);
  c.modal(
    "Inspect auction lot",
    `<div class="split"><div class="art-mount"><img src="${a.image}" alt="Sample lot"></div><form class="stack"><input type="hidden" name="lot-id" value="${id}">${c.field("Artist", "lot-artist", a.artist)}${c.field("Title", "lot-title", a.title)}<div class="grid two">${c.field("Low price · USD", "lot-low", a.low, "number")}${c.field("High price · USD", "lot-high", a.high, "number")}</div><p class="small muted">Original dimensions: ${c.esc(a.dimensions)}. The live editor retains explicit units and source estimates.</p>${c.button("Save reviewed lot", "ops:lot-save", "primary")}</form></div>`,
  );
}
function act(name, el, c) {
  if (!name.startsWith("ops:")) return false;
  const s = get(c),
    a = name.slice(4),
    id = el.dataset.id;
  if (a === "upload-image") {
    saveUpload(c);
    const f = el.files?.[0];
    if (!f) return true;
    if (!f.type.startsWith("image/") || f.size > 10485760)
      return (c.notify("Choose an image below 10 MB."), true);
    if (s.upload.image) URL.revokeObjectURL(s.upload.image);
    s.upload.image = URL.createObjectURL(f);
    c.render();
  }
  if (a === "sale-type") {
    saveUpload(c);
    s.upload.auction = el.value === "Auction";
    c.render();
  }
  if (a === "upload-review") {
    saveUpload(c);
    if (
      !s.upload.artist?.trim() ||
      !s.upload.title?.trim() ||
      Number(s.upload.price) < 0
    )
      return (c.notify("Add an artist, title, and a nonnegative price."), true);
    c.modal(
      "Review this addition",
      `<div class="split"><div class="art-mount"><img src="${image(c)}" alt="Artwork preview"></div><div class="stack"><p class="eyebrow">ASHFORD GALLERY</p><h2>${c.esc(s.upload.title)}</h2><p>${c.esc(s.upload.artist)} · ${c.esc(s.upload.medium)}</p><p>${c.money(Number(s.upload.price))} · ${s.upload.auction ? "Auction" : "Fixed price"}</p>${c.button("Simulate artwork upload", "ops:upload-confirm", "primary")}<p class="small muted">No file or record is sent to the app.</p></div></div>`,
    );
  }
  if (a === "upload-confirm") {
    c.closeModal();
    c.notify(
      "Artwork upload simulated. Nothing was added to the live catalog.",
    );
  }
  if (a === "import-mode") {
    s.importMode = el.dataset.value;
    c.render();
  }
  if (a === "json-file") {
    s.jsonName = el.files?.[0]?.name;
    c.notify(
      "File selected for local review. Preview uses the bundled sample package.",
    );
  }
  if (a === "import-preview") {
    s.importGallery = val("import-gallery");
    s.lots = c.artworks
      .slice(0, 4)
      .map((a, i) => ({ ...a, title: i === 2 ? "" : a.title }));
    s.selected = [];
    s.importStep = 1;
    c.render();
  }
  if (a === "import-reset") {
    s.importStep = 0;
    s.selected = [];
    c.render();
  }
  if (a === "select-lot") {
    s.selected = el.checked
      ? [...new Set([...s.selected, id])]
      : s.selected.filter((x) => x !== id);
    c.render();
  }
  if (a === "select-ready") {
    s.selected = s.lots.filter((a) => a.title).map((a) => a.id);
    c.render();
  }
  if (a === "lot-edit") lotForm(c, id);
  if (a === "lot-save") {
    if (
      !val("lot-title").trim() ||
      Number(val("lot-low")) < 0 ||
      Number(val("lot-high")) < Number(val("lot-low"))
    )
      return (c.notify("Add a title and a valid low/high range."), true);
    Object.assign(
      s.lots.find((a) => a.id === val("lot-id")),
      {
        artist: val("lot-artist"),
        title: val("lot-title"),
        low: Number(val("lot-low")),
        high: Number(val("lot-high")),
      },
    );
    c.closeModal();
    c.render();
  }
  if (a === "bulk-lots")
    c.modal(
      "Bulk edit selected lots",
      `<form class="stack"><p>Applies to ${s.selected.length} selected sample lots only.</p>${c.field("Low price · USD", "bulk-low", "20000", "number")}${c.field("High price · USD", "bulk-high", "40000", "number")}${c.button("Apply to selected lots", "ops:bulk-save", "primary")}</form>`,
    );
  if (a === "bulk-save") {
    const low = Number(val("bulk-low")),
      high = Number(val("bulk-high"));
    if (low < 0 || high < low)
      return (
        c.notify(
          "Use a nonnegative low price and high price at least as large.",
        ),
        true
      );
    s.lots
      .filter((a) => s.selected.includes(a.id))
      .forEach((a) => Object.assign(a, { low, high }));
    c.closeModal();
    c.render();
  }
  if (a === "approve-review") {
    if (s.lots.some((a) => s.selected.includes(a.id) && !a.title))
      return (c.notify("Resolve missing titles before approval."), true);
    c.modal(
      "Approve reviewed additions",
      `<div class="stack"><h2>${s.selected.length} lots for ${c.esc(s.importGallery)}</h2><p>Images, attribution, units, and prices should be checked before the real approval step.</p><p class="small muted">The sample result intentionally includes one recoverable failure. No artwork is uploaded.</p>${c.button("Simulate approval", "ops:approve", "primary")}</div>`,
    );
  }
  if (a === "approve") {
    s.results = s.selected.map((id, i) => ({
      id,
      result: i === s.selected.length - 1 ? "Failed" : "Completed",
    }));
    s.importStep = 2;
    c.closeModal();
    c.render();
  }
  if (a === "retry-lot") {
    s.results.find((r) => r.id === id).result = "Completed";
    c.render();
    c.notify("Sample retry completed.");
  }
  if (a === "return-review") {
    s.selected = [];
    s.importStep = 1;
    c.render();
  }
  if (a === "management-tab") {
    s.tab = el.dataset.value;
    c.render();
  }
  if (a === "search-user") {
    s.userQuery = el.value;
    c.render();
  }
  if (a === "invite") userForm(c);
  if (a === "user-edit") userForm(c, id);
  if (a === "user-save") {
    if (!val("user-name").trim() || !/^\S+@\S+\.\S+$/.test(val("user-email")))
      return (c.notify("Enter a name and valid email."), true);
    const id = Number(val("user-id"));
    const p = {
      name: val("user-name"),
      email: val("user-email"),
      role: val("user-role"),
    };
    if (id)
      Object.assign(
        s.users.find((p) => p.id === id),
        p,
      );
    else s.users.push({ ...p, id: Date.now(), status: "Invited" });
    c.closeModal();
    c.render();
    c.notify("Sample user updated. No invitation sent.");
  }
  if (a === "resend") c.notify("Invitation resend simulated. No email sent.");
  if (a === "user-remove")
    c.modal(
      "Remove sample person?",
      `<p>This changes the local sample only. Reload to restore it.</p>${c.button("Remove from sample", "ops:user-delete", "danger", `data-id="${id}"`)}`,
    );
  if (a === "user-delete") {
    s.users = s.users.filter((p) => p.id !== Number(id));
    c.closeModal();
    c.render();
  }
  if (a === "domain-add" || a === "domain-edit")
    c.modal(
      a === "domain-add" ? "Add sample gallery" : "Edit sample gallery",
      `<form class="stack"><input name="domain-id" type="hidden" value="${a === "domain-add" ? "" : id}">${c.field("Gallery name", "domain-name", a === "domain-add" ? "" : s.domains[Number(id)])}${c.button("Save sample gallery", "ops:domain-save", "primary")}</form>`,
    );
  if (a === "domain-save") {
    const name = val("domain-name").trim(),
      id = val("domain-id");
    if (!name) return (c.notify("Enter a gallery name."), true);
    if (id === "") s.domains.push(name);
    else s.domains[Number(id)] = name;
    c.closeModal();
    c.render();
  }
  if (a === "request-review")
    c.modal(
      "Collector access request",
      `<div class="stack"><h2>Isabelle Martin</h2><p>isabelle@example.com</p><p>Building a personal collection of paintings.</p><label class="field">Assign gallery<select><option>Ashford Gallery</option><option>Laurent Collection</option></select></label>${c.button("Simulate request approval", "ops:request-approve", "primary")}<p class="small muted">No account or access permission is created.</p></div>`,
    );
  if (a === "request-approve") {
    s.requestHandled = true;
    c.closeModal();
    c.render();
  }
  if (a === "recipient") {
    const id = Number(el.dataset.id);
    s.recipients = el.checked
      ? [...new Set([...s.recipients, id])]
      : s.recipients.filter((x) => x !== id);
    c.render();
  }
  if (a === "campaign-next") {
    if (s.campaignStep === 1) {
      s.campaignSubject = val("campaign-subject");
      s.campaignBody = val("campaign-body");
      if (!s.campaignSubject.trim() || !s.campaignBody.trim())
        return (c.notify("Add a subject and message."), true);
    }
    if (s.campaignStep === 2 && !s.recipients.length)
      return (c.notify("Choose at least one sample recipient."), true);
    s.campaignStep++;
    c.render();
  }
  if (a === "campaign-back") {
    s.campaignStep--;
    c.render();
  }
  if (a === "campaign-send") {
    s.campaignStep = 4;
    c.render();
    c.notify("Email results simulated. No message was sent.");
  }
  return true;
}
const wrap = (title, render) => ({
  title,
  group: "Operations",
  render,
  action: act,
});
export default {
  upload: wrap("Add artwork", upload),
  imports: wrap("Auction imports", imports),
  management: wrap("Gallery management", management),
  campaign: wrap("Email campaign", campaign),
};
