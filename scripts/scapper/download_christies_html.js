import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CWD = process.cwd();
const INVENTORY_ROOT = path.join(__dirname, "inventory");

const OUTPUT_DIR = process.env.OUTPUT_DIR
  ? path.resolve(CWD, process.env.OUTPUT_DIR)
  : path.join(INVENTORY_ROOT, "html", "christies");
const DRY_RUN = process.env.DRY_RUN === "true";
const URLS_FILE = process.env.URLS_FILE ?? "";
const CHRISTIES_COOKIE = process.env.CHRISTIES_COOKIE ?? "";

const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
};
if (CHRISTIES_COOKIE) REQUEST_HEADERS.cookie = CHRISTIES_COOKIE;

const ENTITY_MAP = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();

const sanitizeSlug = (text) =>
  normalize(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const decodeEntities = (text) =>
  (text || "").replace(
    /&amp;|&quot;|&#39;|&lt;|&gt;|&nbsp;/g,
    (m) => ENTITY_MAP[m] || m,
  );

function extractFirst(text, regex) {
  const match = (text || "").match(regex);
  return match ? decodeEntities(match[1]) : "";
}

function isHttpUrl(input) {
  return /^https?:\/\//i.test(input || "");
}

function extractSaleTitle(html) {
  const og = extractFirst(
    html,
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  );
  const titleTag = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalize(og || titleTag).replace(/\s*\|\s*Christie'?s.*$/i, "");
}

function extractSaleId(url, html) {
  const fromUrl = normalize(url).match(/-(\d{4,})(?:[/?#._-]|$)/)?.[1];
  if (fromUrl) return fromUrl;
  const fromHtml = extractFirst(
    html,
    /\bSale\s*(?:No\.?|Number)?\s*[:#]?\s*(\d{4,})\b/i,
  );
  return normalize(fromHtml);
}

function dedupe(values) {
  return [...new Set(values)];
}

function buildHtmlSlug({ url, saleTitle, saleId, index }) {
  let pathToken = "";
  try {
    const parsed = new URL(url);
    pathToken = sanitizeSlug(
      parsed.pathname
        .split("/")
        .filter(Boolean)
        .slice(-2)
        .join("_"),
    );
  } catch {
    pathToken = sanitizeSlug(url);
  }

  const titleToken = sanitizeSlug(saleTitle || "");
  const saleToken = sanitizeSlug(saleId || "");
  return (
    [titleToken, saleToken, pathToken].filter(Boolean).join("_") ||
    `christies_auction_${index + 1}`
  );
}

async function resolveUrlsFromFile() {
  if (!URLS_FILE) return [];
  const filePath = path.isAbsolute(URLS_FILE)
    ? URLS_FILE
    : path.resolve(CWD, URLS_FILE);
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split(/\r?\n/g)
    .map((line) => line.replace(/#.*/, ""))
    .map((line) => normalize(line))
    .filter(Boolean);
}

function resolveUrlsFromArgsAndEnv() {
  const cli = process.argv
    .slice(2)
    .flatMap((token) => token.split(","))
    .map((token) => normalize(token))
    .filter(Boolean);
  const env = (process.env.CHRISTIES_URLS || "")
    .split(/[\n,]/g)
    .map((token) => normalize(token))
    .filter(Boolean);
  return [...cli, ...env];
}

function printUsage() {
  console.log(`
Phase 1: Download Christie's auction links into local HTML files.

Usage:
  node scripts/scapper/download_christies_html.js <auction_url> [more_urls...]

Input options:
  1. CLI args:
     node scripts/scapper/download_christies_html.js "https://www.christies.com/en/auction/modern-visionaries-the-roger-and-josette-vanthournout-collection-evening-sale-31311/"
  2. Comma-separated env:
     CHRISTIES_URLS="https://.../31311/,https://.../31032/" node scripts/scapper/download_christies_html.js
  3. URLs file (one URL per line):
     URLS_FILE="scripts/scapper/inventory/christies_links.txt" node scripts/scapper/download_christies_html.js

Environment controls:
  OUTPUT_DIR="scripts/scapper/inventory/html/christies"
  DRY_RUN=true|false          (default: false)
  CHRISTIES_COOKIE="..."      (optional for cookie-gated pages)
`);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch "${url}" (${response.status} ${response.statusText})`,
    );
  }
  return response.text();
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const fileUrls = await resolveUrlsFromFile();
  const argAndEnvUrls = resolveUrlsFromArgsAndEnv();
  const urls = dedupe([...argAndEnvUrls, ...fileUrls]);

  if (urls.length === 0) {
    printUsage();
    throw new Error("No Christie's auction URLs were provided.");
  }

  const invalid = urls.filter((url) => !isHttpUrl(url));
  if (invalid.length > 0) {
    throw new Error(`Invalid URL input(s): ${invalid.join(", ")}`);
  }

  console.log(`Preparing to fetch ${urls.length} Christie's URL(s)...`);
  if (!DRY_RUN) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Output HTML directory: ${OUTPUT_DIR}`);
  }

  const manifest = [];
  const seenNames = new Map();

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    console.log(`\n[${i + 1}/${urls.length}] Fetching: ${url}`);

    const html = await fetchHtml(url);
    const saleTitle = extractSaleTitle(html);
    const saleId = extractSaleId(url, html);
    const baseSlug = buildHtmlSlug({ url, saleTitle, saleId, index: i });

    const duplicateCount = seenNames.get(baseSlug) || 0;
    seenNames.set(baseSlug, duplicateCount + 1);
    const suffix = duplicateCount > 0 ? `_${duplicateCount + 1}` : "";
    const filename = `christies_${baseSlug}${suffix}.html`;
    const outputPath = path.join(OUTPUT_DIR, filename);

    if (!DRY_RUN) {
      await fs.writeFile(outputPath, html, "utf8");
      console.log(`Saved: ${outputPath}`);
    } else {
      console.log(`DRY_RUN: would save ${outputPath}`);
    }

    manifest.push({
      url,
      saleId: saleId || undefined,
      saleTitle: saleTitle || undefined,
      outputPath,
      fetchedAt: new Date().toISOString(),
      htmlBytes: Buffer.byteLength(html, "utf8"),
    });
  }

  if (!DRY_RUN) {
    const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
    await fs.writeFile(`${manifestPath}`, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`\nSaved manifest: ${manifestPath}`);
  }

  console.log("\nDone.");
  console.log(`URLs processed: ${manifest.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
