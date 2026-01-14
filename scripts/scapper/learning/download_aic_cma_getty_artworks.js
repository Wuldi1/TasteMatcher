// Requires Node 18+ and fs-extra
import fs from "fs-extra";
import path from "path";

const OUTPUT_DIR = "./TasteMatcherTestContent";
const NUM_ARTWORKS = 1000;
const XSRF_TOKEN =
  "eyJpdiI6InRYSVFCNVRzMnc5akoxdllvb2VNNFE9PSIsInZhbHVlIjoiRXVOM3BxQnF6T25EZFVoNXpST1BFY0tjRTRRdWFkbktzcDFEMVJUNlpqWEFJRENBZVVXL1hHSzBvbjlUcjJ4K1FrZEFxYzFrRlBUZ3NmRjd4c25xWVBEbFdMSG5TZVdkTDd5NkFJTkxtM2dnU0hmd3p5d1c1Z1lJV3lWT01OaEkiLCJtYWMiOiI0NDk4Yzc5OTRjMTI1OTQ4ZDQxOWUwYjU0YTllN2ViNDI3MmUyOTQ0MjU2MDZlMzM4MTlkYjExYzJjNmYyMDE1IiwidGFnIjoiIn0%3D; aic_session=eyJpdiI6IklpZExUNDNjUnE2dXpDQVhKaGFIdmc9PSIsInZhbHVlIjoiajRBUGxQbnJram5LZFBaK1RTa1RHZXQvV2FrMUlwOXp1dHIxb0lwclRubUd2MDlQWW5UYlRqb2ludHpldVBjQ1FnU2Y5d1ZVR3lEUWdMTmpHUW1IV0JNZkg4K1UwQmpPL29XMTBiUE9mcW1BZ0ZibnVqU1ZtSHJydHQ0Q3dzWG8iLCJtYWMiOiI4ZDg1MTA2N2U3NGI0Mzk4ZjA5ZDNjMjlmM2Q0YWMyMDcxMzdiNWI0MjA4MGRiNjJmMmFhMGFjMzc0MTk5NDg0IiwidGFnIjoiIn0%3D"; // <-- paste your token from browser here

// -------------------------
// Helpers
// -------------------------
const safeName = (name) => name.replace(/[\\/:"*?<>|]+/g, "").substring(0, 50);
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function fetchJSON(url) {
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`Fetch error: ${resp.status}, from ${url}`);
  return await resp.json();
}

async function downloadImageWithRetry(
  url,
  outputPath,
  retries = 3,
  referer = "",
  xsrfToken = "",
) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (!url) throw new Error("No image URL");
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          ...(referer ? { Referer: referer } : {}),
          ...(xsrfToken ? { Cookie: `XSRF-TOKEN=${xsrfToken}` } : {}),
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      await fs.writeFile(outputPath, buffer);
      return;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      console.log(`Retry ${attempt + 1} failed for ${url}, retrying...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// -------------------------
// Providers
// -------------------------

// --- AIC ---
const AIC_API = "https:/.artic.edu/v1/artworks";
const AIC_FIELDS = [
  "id",
  "title",
  "artist_display",
  "date_display",
  "medium_display",
  "dimensions",
  "department_title",
  "classification_title",
  "image_id",
  "style_title",
  "place_of_origin",
  "thumbnail.alt_text",
].join(",");

async function fetchAICPage(page = 1) {
  const url = `${AIC_API}?page=${page}&limit=100&fields=${AIC_FIELDS}&is_public_domain=true&has_image=true`;
  const data = await fetchJSON(url);
  return data.data;
}

function mapAICToStandard(art) {
  return {
    title: art.title || "",
    description:
      art.thumbnail?.alt_text ||
      `${art.artist_display || ""} ${art.medium_display || ""}`.trim(),
    artist: art.artist_display || "",
    category: art.style_title || "",
    classification: art.classification_title || "",
    department: art.department_title || "",
    country: art.place_of_origin || "",
    date: art.date_display || "",
    tags: [
      art.style_title,
      art.medium_display,
      art.classification_title,
    ].filter(Boolean),
  };
}

function getAICImageURL(imageId) {
  return imageId
    ? `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`
    : null;
}

// --- CMA ---
const CMA_API = "https://openaccess-api.clevelandart.org/artworks";
async function fetchCMAPage(page = 1) {
  const url = `${CMA_API}?page=${page}&limit=100&has_image=true&is_public_domain=true`;
  const data = await fetchJSON(url);
  return data.data;
}

function mapCMAToStandard(art) {
  return {
    title: art.title || "",
    description: art.creditLine || art.medium || "",
    artist: art.artistDisplayName || "",
    category: art.style || "",
    classification: art.classification || "",
    department: art.department || "",
    country: art.culture || "",
    date: art.objectDate || "",
    tags: [art.style, art.medium, art.technique].filter(Boolean),
  };
}

function getCMAImageURL(art) {
  return art.primaryImageUrl || null;
}

// --- Getty Open Content ---
const GETTY_API = "https://getty.edu/opencontent/json"; // placeholder: update with actual endpoint
async function fetchGetty() {
  // Example GET request to Getty Open Content JSON (adjust to real URL)
  const data = await fetchJSON(GETTY_API);
  return data.objects || []; // depends on Getty JSON structure
}

function mapGettyToStandard(art) {
  return {
    title: art.title || "",
    description: art.description || art.objectName || "",
    artist: art.artistDisplayName || "",
    category: art.objectType || "",
    classification: art.objectType || "",
    department: art.division || "",
    country: art.country || art.culture || "",
    date: art.displayDate || "",
    tags: [art.tags, art.medium].filter(Boolean),
  };
}

function getGettyImageURL(art) {
  return art.imageUrl || null;
}

// -------------------------
// Process a single artwork
// -------------------------
async function processArtwork(art, provider) {
  try {
    let metadata,
      imageUrl,
      referer = "";
    switch (provider) {
      case "AIC":
        metadata = mapAICToStandard(art);
        imageUrl = getAICImageURL(art.image_id);
        referer = "https://www.artic.edu/";
        break;
      case "CMA":
        metadata = mapCMAToStandard(art);
        imageUrl = getCMAImageURL(art);
        referer = "https://openaccess-api.clevelandart.org/";
        break;
      case "GETTY":
        metadata = mapGettyToStandard(art);
        imageUrl = getGettyImageURL(art);
        break;
    }

    if (!imageUrl) {
      console.warn(
        `Skipping artwork ${metadata.title} (${provider}) - no image`,
      );
      return;
    }

    const folder = path.join(
      OUTPUT_DIR,
      `${provider}_${safeName(metadata.title)}`,
    );
    await fs.ensureDir(folder);

    await downloadImageWithRetry(
      imageUrl,
      path.join(folder, "image.jpeg"),
      3,
      referer,
      XSRF_TOKEN,
    );
    await fs.writeJson(path.join(folder, "metadata.json"), metadata, {
      spaces: 2,
    });

    console.log(`Saved ${provider}: ${metadata.title}`);
  } catch (err) {
    console.warn(`Failed artwork (${provider}): ${err.message}`);
  }
}

// -------------------------
// Main
// -------------------------
async function main() {
  await fs.ensureDir(OUTPUT_DIR);
  const artworksPool = [];

  // --- AIC ---
  for (let page = 1; page <= 10; page++) {
    const data = await fetchAICPage(page);
    artworksPool.push(...data.map((a) => ({ provider: "AIC", data: a })));
  }

  // --- CMA ---
  for (let page = 1; page <= 10; page++) {
    const data = await fetchCMAPage(page);
    artworksPool.push(...data.map((a) => ({ provider: "CMA", data: a })));
  }

  // --- Getty ---
  //   const gettyData = await fetchGetty();
  //   artworksPool.push(...gettyData.map(a => ({ provider: 'GETTY', data: a })));

  // Random sample
  const selected = [];
  const used = new Set();
  while (selected.length < NUM_ARTWORKS && used.size < artworksPool.length) {
    const idx = randInt(0, artworksPool.length - 1);
    if (!used.has(idx)) {
      selected.push(artworksPool[idx]);
      used.add(idx);
    }
  }

  console.log(`Selected ${selected.length} artworks for download.`);

  // Sequential processing
  for (const item of selected) {
    await processArtwork(item.data, item.provider);
  }

  console.log("Batch download complete.");
}

main().catch((err) => console.error("Fatal error:", err));
